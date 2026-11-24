from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rag_guard import GuardedRAG

pipeline: GuardedRAG | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global pipeline
    pipeline = GuardedRAG()
    yield
    pipeline = None


app = FastAPI(
    title="Northstar HR Secure RAG API",
    description="Local handbook retrieval with input/output guardrails and audit telemetry.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str = Field(default="demo", max_length=120)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok" if pipeline is not None else "starting",
        "guardrail_mode": pipeline.engine if pipeline else "initializing",
        "document": "HR Handbook 2026",
    }


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict[str, Any]:
    if pipeline is None:
        raise HTTPException(status_code=503, detail="HR assistant is starting. Retry shortly.")
    return await pipeline.answer(request.message.strip(), request.session_id)
