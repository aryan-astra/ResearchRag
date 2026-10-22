"""Offline regressions for paper upload, recovery, and request-scoped models."""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pymupdf
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from researchrag.api.deps import get_ctx
from researchrag.api.routes import papers, search
from researchrag.config import Settings
from researchrag.llm.anthropic import AnthropicLLM
from researchrag.llm.base import LLMError, LLMMessage
from researchrag.llm.openai_compatible import OpenAICompatibleLLM
from researchrag.parsing.base import ParseError
from researchrag.parsing.pymupdf_parser import PymupdfParser


def test_pdf_with_blank_page_keeps_physical_pages(tmp_path):
    path = tmp_path / "paper.pdf"
    with pymupdf.open() as doc:
        doc.new_page().insert_text((60, 70), "Research findings and evidence.")
        doc.new_page()
        doc.new_page().insert_text((60, 70), "The learning rate is 0.001.")
        doc.save(path)
    paper = PymupdfParser().parse(path, "paper_test", tmp_path)
    assert paper.page_count == 3
    assert paper.pages[1].blocks == []
    assert "0.001" in paper.pages[2].text


def test_image_only_pdf_requests_ocr(tmp_path):
    path = tmp_path / "scan.pdf"
    with pymupdf.open() as doc:
        doc.new_page()
        doc.save(path)
    with pytest.raises(ParseError, match="enable OCR"):
        PymupdfParser().parse(path, "scan", tmp_path)


def test_figure_image_and_caption_keep_provenance(tmp_path):
    import io

    from PIL import Image

    data = io.BytesIO()
    Image.new("RGB", (100, 100), "blue").save(data, format="PNG")
    path = tmp_path / "figure.pdf"
    with pymupdf.open() as doc:
        page = doc.new_page()
        page.insert_image(pymupdf.Rect(50, 100, 150, 200), stream=data.getvalue())
        page.insert_text((50, 220), "Figure 1: Example architecture.")
        doc.save(path)
    paper = PymupdfParser().parse(path, "fig", tmp_path)
    figure = next(b for b in paper.all_blocks() if b.block_type.value == "figure")
    caption = next(b for b in paper.all_blocks() if b.block_type.value == "caption")
    assert figure.image_path and Path(figure.image_path).exists()
    assert caption.metadata["for_block"] == figure.id


def test_ocr_uses_textpage_and_configured_language():
    page = Mock()
    page.get_text.return_value = {"blocks": []}
    page.get_images.return_value = [object()]
    PymupdfParser(enable_ocr=True, ocr_language="eng+fra")._extract_text_items(page)
    page.get_textpage_ocr.assert_called_once_with(language="eng+fra", full=False)
    page.get_text.assert_called_with("dict", textpage=page.get_textpage_ocr.return_value)


@pytest.mark.parametrize("url,expected", [
    ("http://127.0.0.1:11434/v1", True),
    ("http://[::1]:11434/v1", True),
    ("http://localhost:11434/v1", True),
    ("http://localhost.evil.test/v1", False),
    ("https://api.openai.com/v1", False),
])
def test_local_provider_detection(url, expected):
    assert OpenAICompatibleLLM("local", base_url=url).is_online() is expected


@pytest.mark.parametrize("provider,payload", [
    (OpenAICompatibleLLM("test"), {"choices": [{"message": {"content": "A cited answer [1]."}}]}),
    (AnthropicLLM("test", "secret"), {"content": [{"type": "text", "text": "A cited answer [1]."}]}),
])
def test_provider_accepts_missing_usage(monkeypatch, provider, payload):
    client = Mock()
    client.__enter__ = Mock(return_value=client)
    client.__exit__ = Mock(return_value=False)
    client.post.return_value = httpx.Response(200, json=payload)
    monkeypatch.setattr(httpx, "Client", Mock(return_value=client))
    result = provider.chat([LLMMessage(role="user", content="Question?")])
    assert result.tokens_used == 0
    assert "cited answer" in result.text


def test_empty_completion_raises_provider_error(monkeypatch):
    client = Mock()
    client.__enter__ = Mock(return_value=client)
    client.__exit__ = Mock(return_value=False)
    client.post.return_value = httpx.Response(200, json={"choices": []})
    monkeypatch.setattr(httpx, "Client", Mock(return_value=client))
    with pytest.raises(LLMError, match="no usable text"):
        OpenAICompatibleLLM("test").chat([])


@pytest.mark.parametrize("provider,endpoint", [
    ("openai", "https://api.openai.com/v1"),
    ("groq", "https://api.groq.com/openai/v1"),
    ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai"),
])
def test_chat_key_is_request_scoped(provider, endpoint):
    answerer = Mock()
    answerer.answer.return_value = dict(question="Question?", answer="Evidence [1].",
                                      mode="generative", confidence="explicit", sufficiency="sufficient")
    ctx = SimpleNamespace(db=Mock(), settings=Settings(), get_answerer=Mock(return_value=answerer),
                          llm=object())
    ctx.db.get_paper.return_value = {"id": "p", "status": "ready"}
    app = FastAPI()
    app.include_router(search.router)
    app.dependency_overrides[get_ctx] = lambda: ctx
    client = TestClient(app)
    response = client.post("/papers/p/chat", json={"question": "Question?",
                           "llm": {"provider": provider, "api_key": "test-secret"}})
    assert response.status_code == 200
    assert answerer.llm.api_key == "test-secret"
    assert answerer.llm.base_url == endpoint
    assert not isinstance(ctx.llm, OpenAICompatibleLLM)
    assert "test-secret" not in response.text
    ctx.db.kv_set.assert_not_called()
    response = client.post("/papers/p/chat", json={"question": "Question?",
                           "llm": {"provider": "openai"}})
    assert response.status_code == 400


def test_failed_ingestion_is_visible_and_deletable(tmp_path):
    ctx = SimpleNamespace(db=Mock(), ingestion=Mock(), invalidate_retriever=Mock())
    ctx.ingestion.ingest_file.side_effect = ParseError("Bad PDF")
    with pytest.raises(ParseError):
        papers._ingest(ctx, "p", tmp_path / "bad.pdf")
    ctx.db.upsert_paper.assert_called_once_with(id="p", status="failed", error="Bad PDF")
    ctx.db.get_paper.return_value = {"id": "p", "status": "failed"}
    ctx.db.query.return_value = []
    assert papers.get_paper("p", ctx)["status"] == "failed"
    papers.delete_paper("p", ctx)
    ctx.ingestion.remove_paper.assert_called_once_with("p")


@pytest.mark.parametrize("kind", ["smoke", "tests", "train"])
def test_api_runs_without_bash(tmp_path, monkeypatch, kind):
    from researchrag.api.routes import implementations

    monkeypatch.setattr(implementations, "shell_available", lambda: False)
    files = [
        {"path": "tests/test_smoke.py", "content": "print('OK')", "kind": "python"},
        {"path": "src/demo/__init__.py", "content": "", "kind": "python"},
        {"path": "src/demo/train.py", "content": "print('training stub')", "kind": "python"},
    ]
    ctx = SimpleNamespace(db=Mock(), settings=Settings(data_dir=tmp_path))
    ctx.db.get_implementation.return_value = {"paper_id": "p", "files": files}
    result = implementations._run(ctx, "impl_demo", kind, 20)
    assert result["run"]["status"] == "ok", result
    assert result["run"]["command"][0].endswith(("python.exe", "python", "python3"))


def test_embedding_dimension_change_preserves_index():
    from researchrag.storage.qdrant_store import QdrantStore

    store = QdrantStore.__new__(QdrantStore)
    store.client = Mock()
    store.existing_dimension = lambda: 768
    with pytest.raises(ValueError, match="preserved"):
        store.ensure_collection(384)
    store.client.delete_collection.assert_not_called()
