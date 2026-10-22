"""Search endpoints: grounded chat + raw retrieval debugging."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, SecretStr

from researchrag.api.deps import get_ctx, require_paper
from researchrag.models.retrieval import Answer, RetrievalConfig, RetrievalResult

router = APIRouter(tags=["search"])

CHAT_ENDPOINTS = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
}


class ChatModelOptions(BaseModel):
    provider: Literal["server", "offline", "openai", "groq", "gemini"] = "server"
    model: str = Field(default="gpt-4o-mini", min_length=1, max_length=200)
    api_key: SecretStr | None = None

class ChatRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    config: RetrievalConfig | None = None
    llm: ChatModelOptions | None = None


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    config: RetrievalConfig | None = None


@router.post("/papers/{paper_id}/chat", response_model=Answer)
def chat(paper_id: str, body: ChatRequest, ctx=Depends(get_ctx)):
    require_paper(ctx, paper_id)  # 404 guard
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Empty question")
    answerer = ctx.get_answerer(paper_id)
    if body.llm and body.llm.provider == "offline":
        answerer.llm = None
    elif body.llm and body.llm.provider in CHAT_ENDPOINTS:
        from researchrag.llm.openai_compatible import OpenAICompatibleLLM

        if not body.llm.api_key or not body.llm.api_key.get_secret_value().strip():
            raise HTTPException(status_code=400, detail="Enter an API key for the selected provider")
        if not body.llm.model.strip():
            raise HTTPException(status_code=400, detail="Enter a model name")
        # Request-scoped: never persist user credentials or mutate the server provider.
        answerer.llm = OpenAICompatibleLLM(
            model=body.llm.model.strip(),
            api_key=body.llm.api_key.get_secret_value().strip(),
            base_url=CHAT_ENDPOINTS[body.llm.provider],
            timeout_s=ctx.settings.llm_timeout_s,
            max_retries=ctx.settings.llm_max_retries,
        )
    try:
        return answerer.answer(body.question.strip(), paper_id, config=body.config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Answering failed: {e}")


@router.post("/papers/{paper_id}/retrieve", response_model=RetrievalResult)
def retrieve(paper_id: str, body: RetrieveRequest, ctx=Depends(get_ctx)):
    require_paper(ctx, paper_id)  # 404 guard
    retriever = ctx.get_retriever(paper_id)
    try:
        return retriever.retrieve(body.query.strip(), paper_id, config=body.config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {e}")
