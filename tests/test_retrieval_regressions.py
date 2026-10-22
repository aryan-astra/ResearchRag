from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from researchrag.api.routes.papers import paper_structure
from researchrag.config import Settings
from researchrag.models.chunk import Chunk
from researchrag.models.retrieval import RetrievalConfig
from researchrag.retrieval.hybrid import HybridRetriever


def retriever():
    chunks = {
        cid: Chunk(
            id=cid,
            paper_id="p",
            text=cid,
            kind="child",
            token_count=1,
            block_ids=[],
            page_start=1,
            page_end=1,
        )
        for cid in ["dense", "sparse"]
    }
    dense = Mock()
    dense.search.return_value = [{"chunk_id": "dense", "score": 0.8}]
    sparse = Mock(doc_ids=["sparse"])
    sparse.search.return_value = [SimpleNamespace(chunk_id="sparse", score=2)]
    return HybridRetriever(Settings(), dense, sparse, SimpleNamespace(name="none"), chunks.get)


def test_concatenation_keeps_sparse_only_matches():
    result = retriever().retrieve("question", config=RetrievalConfig(use_rrf=False))
    assert [item.chunk.id for item in result.evidence] == ["dense", "sparse"]


def test_zero_weight_is_an_explicit_override():
    result = retriever().retrieve("question", config=RetrievalConfig(rrf_dense_weight=0))
    scores = {item.chunk.id: item.rrf_score for item in result.evidence}
    assert scores["dense"] == 0
    assert scores["sparse"] > 0


@pytest.mark.parametrize(
    "config", [{"final_top_k": -1}, {"dense_top_n": 100000}, {"rrf_sparse_weight": float("inf")}]
)
def test_invalid_retrieval_budgets_are_rejected(config):
    with pytest.raises(ValidationError):
        RetrievalConfig(**config)


def test_structure_retains_empty_physical_pages():
    ctx = SimpleNamespace(db=Mock())
    ctx.db.get_paper.return_value = {"status": "ready", "page_count": 3}
    ctx.db.get_blocks.return_value = []
    result = paper_structure("p", ctx)
    assert result["page_count"] == 3
    assert [p["number"] for p in result["pages"]] == [1, 2, 3]
