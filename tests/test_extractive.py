"""Unit tests for the offline extractive answerer (no LLM required)."""

from __future__ import annotations

from researchrag.evidence import EvidenceAssembler
from researchrag.llm.extractive import ExtractiveAnswerer
from researchrag.models.chunk import Chunk
from researchrag.models.retrieval import RetrievedChunk


def _chunk(cid: str, text: str) -> Chunk:
    return Chunk(
        id=cid, paper_id="p", kind="child", text=text,
        page_start=1, page_end=1, section_path=["S"], block_ids=[f"b{cid}"],
    )


def _package(chunks: list[Chunk]):
    assembler = EvidenceAssembler(max_tokens=8000, use_parent_context=False)
    return assembler.assemble([RetrievedChunk(chunk=c, rrf_score=0.5) for c in chunks])


def test_answers_from_relevant_evidence():
    ev = [
        _chunk("c1", "The generator is a BART-large model with 400 million parameters. "
                     "It was pre-trained with a denoising objective."),
        _chunk("c2", "Unrelated paragraph about weather and cooking recipes."),
    ]
    ans = ExtractiveAnswerer().answer(
        "How many parameters does the BART generator have?", _package(ev)
    )
    assert ans.mode == "extractive"
    assert "400" in ans.answer
    assert ans.confidence in ("explicit", "strongly_inferred")
    assert ans.citations, "answer must carry citations"


def test_unanswerable_question_is_reported_honestly():
    ev = [_chunk("c1", "The cat sat on the mat and watched the birds outside.")]
    ans = ExtractiveAnswerer().answer("What is the GDP of France?", _package(ev))
    assert ans.sufficiency == "insufficient"
    assert ans.confidence == "unknown"
    assert "do not contain" in ans.answer or "does not specify" in ans.answer


def test_empty_evidence_is_insufficient():
    ans = ExtractiveAnswerer().answer("anything at all?", _package([]))
    assert ans.sufficiency == "insufficient"
    assert ans.answer


def test_citations_only_for_sentences_used():
    ev = [
        _chunk("c1", "The learning rate was 3e-5 for all models. We used Adam."),
        _chunk("c2", "Completely different topic about biology and cells here."),
    ]
    ans = ExtractiveAnswerer().answer("What learning rate was used?", _package(ev))
    cited_ids = {c.chunk_id for c in ans.citations}
    assert "c1" in cited_ids
    assert "c2" not in cited_ids


def test_inline_citations_follow_answer_order():
    ev = [
        _chunk("c1", "The learning rate was fixed throughout training."),
        _chunk("c2", "The learning rate and optimizer were tuned together."),
    ]
    ans = ExtractiveAnswerer().answer("What learning rate and optimizer?", _package(ev))
    assert ans.answer.startswith(ev[1].text + " [1]")
    assert ans.citations[0].chunk_id == "c2"
    assert ans.citations[1].chunk_id == "c1"
    assert "[2]" in ans.answer


def test_over_budget_sentence_never_returns_empty_answer():
    ev = [_chunk("c1", "The learning rate was " + "very " * 100 + "small.")]
    ans = ExtractiveAnswerer(max_tokens=10).answer("What learning rate?", _package(ev))
    assert ans.answer
    assert ans.sufficiency == "insufficient"
