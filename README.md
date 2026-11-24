# Northstar HR Secure RAG

A local-first prototype of an HR benefits assistant with document retrieval, input/output guardrails, and per-turn audit telemetry. The frontend is Vite + React; the API is FastAPI. No hosted model key is required for the default deterministic demo.

## Features

- Answers common HR handbook questions using locally indexed handbook chunks.
- Stores embeddings in ChromaDB using a lightweight deterministic hashing embedder, so the first run does not download a model.
- Blocks jailbreaks, prompt-injection attempts, administrative overrides, off-topic requests, and confidential compensation/password requests.
- Records input and output checks, the top two safe retrieved chunks, latency, and estimated token usage for every chat turn.
- Includes an optional NVIDIA NeMo Guardrails generation path backed by Ollama.

## Run locally

Requirements: Python 3.10+ and Node.js 20+.

### 1. Start the API

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API is available at `http://localhost:8000`; interactive endpoint docs are at `http://localhost:8000/docs`.

### 2. Start the dashboard

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The dashboard checks API health on load. Set `VITE_API_URL` in `frontend/.env.local` if the API runs elsewhere.

## Enable NVIDIA NeMo Guardrails

The default mode runs the same policy gates directly in Python and returns grounded handbook answers without requiring an LLM. To use NeMo for guarded response generation, install the package from `requirements.txt`, install and start Ollama, pull a supported chat model, then set the backend environment:

```powershell
$env:ENABLE_NEMO_RAILS="true"
$env:OLLAMA_MODEL="llama3.1"
uvicorn main:app --reload --port 8000
```

The default NeMo endpoint is `http://localhost:11434`. Override it with `OLLAMA_BASE_URL`. NeMo is initialized only when enabled; startup fails clearly if its configuration or Ollama dependency is unavailable. The Python policy checks remain active in either mode, and sensitive handbook chunks are excluded from retrieval context.

## API

`POST /api/chat`

```json
{
  "message": "How many PTO days are included?",
  "session_id": "demo"
}
```

The response contains the answer, input/output guardrail status and reasons, up to two retrieved chunks, latency, token estimates, and the active engine. `GET /health` reports API readiness and the configured guardrail mode.

## Prototype boundary

The local hashing embedder is intentionally lightweight and suitable for a small demo corpus, not production semantic search. Before deployment, replace it with a vetted embedding model, add authentication and authorization, persist audit events to an access-controlled store, review HR/legal policy wording, and perform security testing. This prototype does not make employment or benefits eligibility decisions.
