from __future__ import annotations

import hashlib
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
HANDBOOK_PATH = BASE_DIR / "data" / "HR_Handbook.txt"

JAILBREAK_PATTERNS = (
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
    r"disregard\s+(all\s+)?(previous|prior|above)",
    r"(?:reveal|show|print|repeat).{0,30}(?:system prompt|hidden prompt|instructions)",
    r"(?:developer|system)\s+mode",
    r"DAN\s+mode",
)
INJECTION_PATTERNS = (
    r"(?:prompt|instruction)\s+injection",
    r"untrusted\s+(?:document|context).{0,40}(?:follow|execute)",
    r"(?:follow|execute)\s+(?:the\s+)?instructions?\s+(?:inside|in)\s+(?:the\s+)?(?:document|context)",
    r"<\s*/?\s*(?:system|assistant|instruction)\b",
)
OVERRIDE_PATTERNS = (
    r"(?:act|pretend|switch)\s+as\s+(?:an?\s+)?(?:admin|administrator|hr admin)",
    r"(?:admin|administrator)\s+(?:override|privileges?|access)",
    r"bypass\s+(?:the\s+)?(?:security|guardrails?|policy)",
)
CONFIDENTIAL_PATTERNS = (
    r"\b(?:executive|ceo|cfo|employee|individual)\s+(?:salary|compensation|pay)\b",
    r"\b(?:salary|compensation)\s+(?:band|range|details?|records?)\b",
    r"\b(?:payroll\s+credentials?|passwords?|authentication secrets?)\b",
)
OFF_TOPIC_PATTERNS = (
    r"\b(?:write|make|generate|debug)\b.{0,40}\b(?:code|script|program|sql|javascript|python)\b",
    r"\b(?:sports?|football|basketball|baseball|soccer|tennis|nba|nfl)\b",
    r"\b(?:recipe|weather forecast|stock picks?|homework|movie review)\b",
)
HR_TERMS = re.compile(
    r"\b(hr|human resources|handbook|pto|paid time off|vacation|leave|sick|benefit|medical|dental|vision|meal|allowance|expense|manager|employee|payroll|salary|compensation|enrollment|policy)\b",
    re.IGNORECASE,
)


@dataclass
class GuardrailResult:
    status: str
    reason: str | None = None


@dataclass
class RetrievedChunk:
    title: str
    text: str
    score: float


class LocalHashEmbeddings:
    """Small deterministic embedding adapter; keeps the prototype fully local."""

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * 384
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        for token in tokens:
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "little") % len(vector)
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[index] += sign
        magnitude = sum(value * value for value in vector) ** 0.5 or 1.0
        return [value / magnitude for value in vector]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


class GuardedRAG:
    def __init__(self) -> None:
        self.started_at = time.perf_counter()
        self.chunks = self._load_chunks()
        self.vector_store: Any = None
        self.nemo_rails: Any = None
        self.engine = "local-rag"
        self._initialize_vector_store()
        if os.getenv("ENABLE_NEMO_RAILS", "false").lower() in {"1", "true", "yes"}:
            self._initialize_nemo()

    def _load_chunks(self) -> list[RetrievedChunk]:
        content = HANDBOOK_PATH.read_text(encoding="utf-8")
        sections = re.split(r"\n(?=[A-Z][A-Z &]+\n)", content)
        chunks: list[RetrievedChunk] = []
        for section in sections:
            lines = section.strip().splitlines()
            if not lines:
                continue
            title = lines[0].strip()
            text = " ".join(line.strip() for line in lines[1:] if line.strip())
            if not text:
                continue
            if "CONFIDENTIAL" in title.upper():
                continue
            chunks.append(RetrievedChunk(title=title.title(), text=text, score=0.0))
        return chunks

    def _initialize_vector_store(self) -> None:
        try:
            from langchain_chroma import Chroma
            from langchain_core.documents import Document
            from langchain_text_splitters import RecursiveCharacterTextSplitter

            splitter = RecursiveCharacterTextSplitter(chunk_size=420, chunk_overlap=60)
            docs = []
            for chunk in self.chunks:
                for doc in splitter.create_documents(
                    [chunk.text], metadatas=[{"title": chunk.title, "source": "HR_Handbook.txt"}]
                ):
                    docs.append(doc)
            persist_dir = Path(os.getenv("CHROMA_PATH", str(BASE_DIR / ".chroma")))
            if not persist_dir.is_absolute():
                persist_dir = BASE_DIR / persist_dir
            persist_dir.mkdir(parents=True, exist_ok=True)
            store = Chroma(
                collection_name="acme_hr_handbook",
                persist_directory=str(persist_dir),
                embedding_function=LocalHashEmbeddings(),
            )
            if store._collection.count() == 0:
                store.add_documents(docs)
            self.vector_store = store
        except ImportError:
            self.vector_store = None

    def _initialize_nemo(self) -> None:
        from nemoguardrails import LLMRails, RailsConfig

        config_path = BASE_DIR / "config"
        os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")
        os.environ.setdefault("OLLAMA_MODEL", "llama3.1")
        config = RailsConfig.from_path(str(config_path))
        self.nemo_rails = LLMRails(config)
        self.engine = "nemo-guardrails + ollama"

    @staticmethod
    def _matches(text: str, patterns: tuple[str, ...]) -> bool:
        return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)

    def check_input(self, message: str) -> GuardrailResult:
        if self._matches(message, JAILBREAK_PATTERNS):
            return GuardrailResult("BLOCKED", "Jailbreak detected")
        if self._matches(message, INJECTION_PATTERNS):
            return GuardrailResult("BLOCKED", "Prompt injection detected")
        if self._matches(message, OVERRIDE_PATTERNS):
            return GuardrailResult("BLOCKED", "Administrative override attempt")
        if self._matches(message, OFF_TOPIC_PATTERNS) and not HR_TERMS.search(message):
            return GuardrailResult("BLOCKED", "Off-topic request")
        if len(message) > 4000:
            return GuardrailResult("BLOCKED", "Message exceeds the 4,000 character limit")
        return GuardrailResult("PASSED")

    def retrieve(self, query: str) -> list[RetrievedChunk]:
        if self.vector_store is not None:
            try:
                results = self.vector_store.similarity_search_with_relevance_scores(query, k=2)
                return [
                    RetrievedChunk(
                        title=str(doc.metadata.get("title", "HR Handbook")),
                        text=doc.page_content,
                        score=max(0.0, min(1.0, float(score))),
                    )
                    for doc, score in results
                    if doc.metadata.get("title", "").upper() != "CONFIDENTIAL COMPENSATION RULES"
                ]
            except Exception:
                pass

        query_terms = set(re.findall(r"[a-z0-9]+", query.lower()))
        ranked: list[RetrievedChunk] = []
        for chunk in self.chunks:
            terms = set(re.findall(r"[a-z0-9]+", f"{chunk.title} {chunk.text}".lower()))
            overlap = len(query_terms & terms)
            score = overlap / max(1, len(query_terms))
            if score:
                ranked.append(RetrievedChunk(chunk.title, chunk.text, score))
        return sorted(ranked, key=lambda item: item.score, reverse=True)[:2]

    @staticmethod
    def _confidential_request(message: str) -> bool:
        return GuardedRAG._matches(message, CONFIDENTIAL_PATTERNS) or bool(
            re.search(r"\b(?:salary|compensation|executive pay|payroll password)\b", message, re.I)
        )

    @staticmethod
    def _answer_from_context(message: str, chunks: list[RetrievedChunk]) -> str:
        text = " ".join(chunk.text for chunk in chunks)
        normalized = message.lower()
        if re.search(r"\b(pto|paid time off|vacation)\b", normalized):
            match = re.search(r"\b15 days?\b[^.]*\.?", text, re.I)
            if match:
                return f"Northstar full-time employees receive **{match.group(0).strip()}** Submit requests through the HR portal and wait for manager approval."
        if re.search(r"\b(meal|food|dining)\b", normalized):
            match = re.search(r"up to \$75 per day[^.]*\.?", text, re.I)
            if match:
                return f"The business-travel meal allowance is **{match.group(0).strip()}** Itemized receipts and trip purpose are required; alcohol is not reimbursable."
        if re.search(r"\b(sick|illness)\b", normalized):
            match = re.search(r"\b5 days? of paid sick leave[^.]*\.?", text, re.I)
            if match:
                return f"The handbook provides **{match.group(0).strip()}** Local law may provide additional protections or leave."
        if chunks:
            excerpt = " ".join(chunk.text[:260].rstrip() for chunk in chunks[:2])
            return f"According to **{chunks[0].title}**: {excerpt} Contact HR through the secure employee portal for individual-case guidance."
        return "I couldn’t find that in the employee-facing handbook excerpts. Please contact HR through the secure employee portal for help."

    async def _generate_with_nemo(self, message: str, chunks: list[RetrievedChunk]) -> str:
        safe_context = "\n".join(f"[{chunk.title}] {chunk.text}" for chunk in chunks)
        result = await self.nemo_rails.generate(
            messages=[
                {
                    "role": "system",
                    "content": "Answer the employee only from the provided safe HR handbook context. Never reveal secrets or confidential compensation.",
                },
                {"role": "user", "content": f"Handbook context:\n{safe_context}\n\nQuestion: {message}"},
            ]
        )
        if isinstance(result, dict):
            return str(result.get("content") or result.get("response") or "")
        return str(result)

    async def answer(self, message: str, session_id: str) -> dict[str, Any]:
        del session_id
        started = time.perf_counter()
        input_check = self.check_input(message)
        if input_check.status == "BLOCKED":
            answer = "I can’t help with that request. I can answer general HR and employee-benefits questions from the handbook."
            return self._response(answer, input_check, GuardrailResult("PASSED"), [], started, message)

        if self._confidential_request(message):
            answer = "Compensation and payroll information is confidential and isn’t available through this assistant. Please contact HR through the secure employee portal for authorized assistance."
            return self._response(
                answer,
                input_check,
                GuardrailResult("BLOCKED", "Confidential information request blocked"),
                [],
                started,
                message,
            )

        chunks = self.retrieve(message)
        try:
            answer = (
                await self._generate_with_nemo(message, chunks)
                if self.nemo_rails is not None
                else self._answer_from_context(message, chunks)
            )
        except Exception:
            answer = "The guarded response service is temporarily unavailable. Please contact HR through the secure employee portal."

        if self._matches(answer, CONFIDENTIAL_PATTERNS) or re.search(r"\b\$\s?\d{4,}|\bpassword\s*[:=]", answer, re.I):
            answer = "I can’t provide confidential compensation or authentication information. Please contact HR through the secure employee portal."
            output_check = GuardrailResult("BLOCKED", "Confidential output was suppressed")
        else:
            output_check = GuardrailResult("PASSED")
        return self._response(answer, input_check, output_check, chunks, started, message)

    def _response(
        self,
        answer: str,
        input_check: GuardrailResult,
        output_check: GuardrailResult,
        chunks: list[RetrievedChunk],
        started: float,
        message: str,
    ) -> dict[str, Any]:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        return {
            "answer": answer,
            "security": {
                "input": {"status": input_check.status, "reason": input_check.reason},
                "output": {"status": output_check.status, "reason": output_check.reason},
                "retrieved_chunks": [
                    {"title": chunk.title, "text": chunk.text, "score": round(chunk.score, 3)}
                    for chunk in chunks[:2]
                ],
                "latency_ms": elapsed_ms,
                "tokens": {"input": max(1, len(message.split())), "output": max(1, len(answer.split()))},
                "engine": self.engine,
            },
        }
