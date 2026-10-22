"""A small, attributed reading shelf downloaded from the original publishers."""

from __future__ import annotations

import hashlib
import io

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile

from researchrag.api.deps import get_ctx
from researchrag.api.routes.papers import upload_paper

router = APIRouter(tags=["samples"])
SAMPLES = [
    {
        "id": "attention",
        "title": "Attention Is All You Need",
        "authors": "Vaswani et al.",
        "year": 2017,
        "arxiv": "1706.03762v7",
        "description": "The Transformer: a new architecture built around attention.",
        "question": "How many encoder and decoder layers does the base Transformer use?",
    },
    {
        "id": "rag",
        "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
        "authors": "Lewis et al.",
        "year": 2020,
        "arxiv": "2005.11401v4",
        "description": "The paper behind the idea of retrieving evidence before generating an answer.",
        "question": "What is the difference between RAG-Sequence and RAG-Token?",
    },
    {
        "id": "bert",
        "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
        "authors": "Devlin et al.",
        "year": 2018,
        "arxiv": "1810.04805v2",
        "description": "Learning language representations from both directions at once.",
        "question": "Which two tasks are used to pre-train BERT?",
    },
    {
        "id": "resnet",
        "title": "Deep Residual Learning for Image Recognition",
        "authors": "He et al.",
        "year": 2015,
        "arxiv": "1512.03385v1",
        "description": "A small shortcut that made much deeper neural networks practical.",
        "question": "What problem does residual learning address?",
    },
    {
        "id": "gan",
        "title": "Generative Adversarial Nets",
        "authors": "Goodfellow et al.",
        "year": 2014,
        "arxiv": "1406.2661v1",
        "description": "Two networks learning through a game: generator and discriminator.",
        "question": "What are the roles of the generator and discriminator?",
    },
]


@router.get("/samples")
def list_samples(ctx=Depends(get_ctx)):
    result = []
    for sample in SAMPLES:
        paper_id = ctx.db.kv_get("sample:" + sample["id"])
        paper = ctx.db.get_paper(paper_id) if paper_id else None
        result.append(
            {
                **sample,
                "source_url": "https://arxiv.org/abs/" + sample["arxiv"],
                "paper_id": paper_id if paper and paper["status"] == "ready" else None,
            }
        )
    return {"samples": result}


@router.post("/samples/{sample_id}/import", status_code=202)
async def import_sample(sample_id: str, ctx=Depends(get_ctx)):
    sample = next((s for s in SAMPLES if s["id"] == sample_id), None)
    if sample is None:
        raise HTTPException(404, "Sample not found")
    existing = ctx.db.kv_get("sample:" + sample_id)
    paper = ctx.db.get_paper(existing) if existing else None
    if paper and paper["status"] == "ready":
        return {"paper_id": existing, "job_id": None, "status": "ready"}
    content = bytearray()
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            async with client.stream("GET", "https://arxiv.org/pdf/" + sample["arxiv"]) as response:
                response.raise_for_status()
                async for block in response.aiter_bytes():
                    if len(content) + len(block) > 20 * 1024 * 1024:
                        raise HTTPException(502, "Sample exceeds the 20 MB download limit")
                    content.extend(block)
    except httpx.HTTPError:
        raise HTTPException(
            502,
            "The paper source is unavailable. Try again, or download the PDF from the source link and upload it.",
        ) from None
    duplicates = ctx.db.query(
        "SELECT id FROM papers WHERE file_sha256 = ? AND status = 'ready'",
        (hashlib.sha256(content).hexdigest(),),
    )
    if duplicates:
        result = {"paper_id": duplicates[0]["id"], "job_id": None, "status": "ready"}
    else:
        result = await upload_paper(
            UploadFile(filename=sample_id + ".pdf", file=io.BytesIO(content)), ctx
        )
    ctx.db.kv_set("sample:" + sample_id, result["paper_id"])
    return result
