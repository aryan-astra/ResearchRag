from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from researchrag.api.deps import get_ctx
from researchrag.api.routes import samples


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(samples.router, prefix="/api")
    db = Mock()
    db.kv_get.return_value = None
    db.query.return_value = []
    app.dependency_overrides[get_ctx] = lambda: SimpleNamespace(db=db)
    return TestClient(app)


def test_catalog_is_attributed_and_unknown_sample_is_rejected(client):
    catalog = client.get("/api/samples").json()["samples"]
    assert len(catalog) == 5
    assert all(s["source_url"].startswith("https://arxiv.org/abs/") for s in catalog)
    assert client.post("/api/samples/not-a-paper/import").status_code == 404


def test_downloaded_document_uses_the_existing_upload_validation(client, monkeypatch):
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda r: httpx.Response(200, content=b"not a pdf"))
    monkeypatch.setattr(samples.httpx, "AsyncClient", lambda **k: real_client(transport=transport))
    response = client.post("/api/samples/attention/import")
    assert response.status_code == 400
    assert response.json()["detail"] == "File is not a PDF"


def test_source_failure_has_actionable_error(client, monkeypatch):
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda r: httpx.Response(503))
    monkeypatch.setattr(samples.httpx, "AsyncClient", lambda **k: real_client(transport=transport))
    response = client.post("/api/samples/attention/import")
    assert response.status_code == 502
    assert "source is unavailable" in response.json()["detail"]
