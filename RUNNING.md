# Running Research RAG (from zero)

This guide takes a fresh machine with the ZIP extracted and gets you to:
a grounded answer with citations, an implementation spec, a generated
codebase, a sandboxed run, and a full evaluation — no cloud accounts needed.

**Prerequisites**
- Python 3.10+ (tested on 3.11)
- `git` (optional)
- Node.js 18+ **only** if you want to develop the web UI (`npm run dev`).
  For a UI without Node, see §8 "Production mode" — the API serves the built
  frontend itself.

---

## 1. Install

```bash
cd ResearchRag
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

That's the entire Python dependency set. Notably **absent**: PyTorch,
LangChain, any vector DB server, any API key.

- Dense embeddings run on **ONNX Runtime** (via `fastembed`) — the model
  weights (`BAAI/bge-base-en-v1.5`, ~100 MB) download from Hugging Face on
  first ingest and are cached in `~/.cache/fastembed` / the system cache.
- The reranker (`Xenova/ms-marco-MiniLM-L-6-v2`, ~15 MB) downloads the same
  way on first retrieve.
- **No network to Hugging Face?** Nothing breaks: the dense embedder falls
  back to the deterministic 768-d hashing embedder and the reranker falls
  back to RRF-only ranking. `/api/health` and `researchrag papers` show
  which embedder is active. Retrieval quality degrades a little (measured:
  recall@10 0.70→0.73 on the sample eval; see §7).

## 2. Ingest the sample paper

```bash
.venv/bin/researchrag ingest data/samples/rag_paper.pdf
```

Expected (≈ 3–15 s depending on hardware):

```
paper: paper_c29738d5f866  "Training data-efficient language models…"
  parsed:  19 pages, 358 blocks, 35 headings   (0.6 s)
  chunks:  272 children, 36 parents            (0.2 s)
  index:   dense 308 vectors + BM25 over 308 chunks
```

Notes:
- The paper id is derived from the file hash, so re-ingesting the same file
  replaces its data (idempotent).
- Your own PDF: `researchrag ingest /path/to/paper.pdf`.
- All state lives under `./data/` (SQLite, Qdrant, BM25 JSON, artifacts).
  **To reset everything: `rm -rf data/`** and re-ingest.

## 3. Ask questions

```bash
.venv/bin/researchrag papers                 # list ingested papers + ids
.venv/bin/researchrag ask paper_c29738d5f866 "How many parameters does the BART generator have?"
```

Expected (offline mode):

```
answer (mode=extractive, confidence=explicit, sufficiency=sufficient)
  The generator is a 626M-parameter BART model: 110M encoder + 110M decoder
  + 406M generator...
citations:
  [1] p.3  2.1 Model architecture  (relevance 0.91)
  ...
```

- **Offline mode** (default, no LLM): the answerer picks verbatim sentences
  from the retrieved evidence, so every word is grounded and every sentence
  is cited. Confidence/sufficiency are computed from term overlap.
- **With an LLM** (optional): answers get richer. Pick one:
  - Ollama: `RESEARCHRAG_LLM_PROVIDER=openai_compatible
    RESEARCHRAG_LLM_BASE_URL=http://localhost:11434/v1
    RESEARCHRAG_LLM_MODEL=llama3.1 .venv/bin/researchrag ask ...`
  - Real OpenAI-compatible API: set `RESEARCHRAG_LLM_API_KEY` + `_MODEL`.
  - **Fully offline but generative**: start the bundled mock LLM:
    ```bash
    .venv/bin/python scripts/mock_llm_server.py &        # :11435
    RESEARCHRAG_LLM_BASE_URL=http://localhost:11435/v1 \
    RESEARCHRAG_LLM_MODEL=mock-1 \
    .venv/bin/researchrag ask paper_c29738d5f866 "How many parameters does the BART generator have?"
    ```
    The mock composes verbatim sentences from the evidence with citations —
    it exists so the full generative path (prompt → markers → parsing) can be
    exercised without a model.

## 4. Inspect the document & retrieval

```bash
.venv/bin/researchrag structure paper_c29738d5f866        # section tree
.venv/bin/researchrag retrieve paper_c29738d5f866 "learning rate" --k 8
```

`retrieve` prints the hybrid pipeline: dense top-50, BM25 top-50, RRF
fusion, rerank scores, final chunks with pages, sections, and token counts.

## 5. Implementation specification

```bash
.venv/bin/researchrag spec paper_c29738d5f866
```

Offline this uses the **rule extractor** (deterministic regexes over the
paper's text) and prints the spec: requirement id, statement,
`type`, **provenance** (`EXPLICIT` + verbatim quote + page), and notes.
The sample paper yields 9 EXPLICIT requirements (learning rate 3e-5, AdamW,
8×32GB V100, top-1000 retrieval, 21M-document corpus, …). Gaps (things the
paper doesn't state) are reported as `open_questions` — never invented.

With an LLM configured, the same command runs the LLM path, which returns
JSON with per-requirement `EXPLICIT/INFERRED/EXTERNAL/UNKNOWN` tags.

## 6. Generate, validate, run code

```bash
.venv/bin/researchrag implement paper_c29738d5f866
```

Generates a complete project under
`data/artifacts/implementations/impl_XXXXXXXX/`:

```
config.yaml
run_smoke.sh
tests/test_smoke.py
src/<slug>/{__init__,model,data,train,evaluate,infer}.py
```

Validation stages run immediately (syntax → imports → structure) and their
results are printed. Then run it in the sandbox:

```bash
.venv/bin/researchrag run impl_XXXXXXXX --kind smoke     # tiny end-to-end pass
.venv/bin/researchrag run impl_XXXXXXXX --kind train     # full train script
```

Sandbox = child process with a **120 s timeout**, **1024 MB memory cap**
(POSIX), **network off**, and a **scrubbed environment** (no credentials
propagate). Logs land in the project's `logs/` dir.

**Reproduction comparison** — after runs, ask the API (or CLI's paper data):

```bash
curl -s localhost:8000/api/papers/paper_c29738d5f866/reproduction | .venv/bin/python -m json.tool
```

For every metric in your run logs (`METRICS: {...}` lines) it reports the
paper's value (extracted from the paper's tables/text) and the difference.
**If the paper reports no value for a metric, it says so** — `paper_value:
null, difference: null` — instead of inventing a number.

## 7. Evaluation

A QA dataset over the sample paper ships in `evals/rag_eval_lwis2020.json`
(32 questions, gold chunks = the actual chunk ids, 100% resolved).

```bash
.venv/bin/researchrag evaluate paper_c29738d5f866 --k 10
```

Measured in the dev sandbox (hashing embedder, reranker off — the degraded
offline configuration), for reference:

```
retrieval:  recall@10 0.7344   MRR 0.5484   NDCG@10 0.5767
answers:    groundedness 1.0    citation_correctness 0.1484
```

The architecture experiment compares chunking strategies × retrieval
modes on the same dataset:

```bash
.venv/bin/researchrag experiment paper_c29738d5f866
```

→ `section_aware × {dense, sparse, hybrid}` vs `fixed_size × {dense,
sparse, hybrid}`, each with recall/MRR/NDCG. (Observed: sparse > hybrid >
dense for section-aware; fixed-size wins on recall for this paper — the
report is the point, not a fixed ranking.)

## 8. API + web UI

### Development (two processes)

```bash
.venv/bin/researchrag serve            # API: http://localhost:8000  (OpenAPI: /docs)

# in a second terminal:
cd frontend
npm install
npm run dev                            # UI: http://localhost:5173  (proxies /api → :8000)
```

### Production mode (one process, no Node)

```bash
cd frontend && npm install && npm run build     # builds frontend/dist
cd ..
.venv/bin/researchrag serve                     # API serves the built UI at /
```

### Windows background mode (terminal stays free)

`researchrag serve` is a server — in a foreground terminal it blocks by
design. To detach it:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\serve-background.ps1
```

Or simply double-click (in order):

1. `scripts\start-backend.cmd` — API + prod UI on http://127.0.0.1:8000
2. `scripts\start-frontend.cmd` — dev UI on http://127.0.0.1:5173 (needs the
   backend for `/api`; installs `node_modules` once on first run)

It health-checks `http://127.0.0.1:8000/api/health` and prints the UI/API/docs
links. Logs: `data\logs\serve.out.log`. Only one process may hold
`data\qdrant` at a time — server *or* CLI, never both.

The API also has a built-in fallback page at `/` when `frontend/dist` is
missing, so `researchrag serve` always returns *something* useful.

## 9. Configuration

Copy `.env.example` to `.env` and edit. Everything is `RESEARCHRAG_*`.
The defaults are tuned for a 2-core laptop and zero cloud dependencies.
Common overrides:

```bash
RESEARCHRAG_PARSER_BACKEND=docling        # high-fidelity parser (pip install "researchrag[docling]")
RESEARCHRAG_LLM_PROVIDER=openai_compatible
RESEARCHRAG_RERANKER=none                 # skip rerank (faster, slightly lower quality)
RESEARCHRAG_EVIDENCE_MAX_TOKENS=8000      # larger evidence budget for the generator
```

## 10. Tests

```bash
.venv/bin/pytest tests/          # 96 unit tests, all offline, < 5 s
```

They cover: RRF (exact scores, ties, empties, duplicates, depth, weights),
BM25 (tokenization, ranking, persistence roundtrip incl. integer posting
keys), chunking (budgets, no orphan parents, atomic table+caption,
cross-page ranges, deterministic ids), evidence assembly (parent headers,
budget + truncation, dedup, citation page ranges), evaluation metrics,
repro `METRICS` parsing, the rule spec extractor, the extractive answerer,
and the hashing embedder.

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `bge-base-en-v1.5 download failed` in logs | Expected without HF access — hashing embedder is active. To use bge, allow `huggingface.co` / `cdn-lfs` egress once and re-ingest. |
| `qdrant` lock error on startup | Another `researchrag` process holds `data/qdrant`. Stop it (kill the server) or use a different `RESEARCHRAG_DATA_DIR`. |
| Paper ingest is slow | First run downloads embedding weights; `RESEARCHRAG_PARSER_BACKEND=docling` is much slower than pymupdf. |
| Sandbox run killed at 120 s | Bump `RESEARCHRAG_EXECUTION_TIMEOUT_S` (full training on CPU can take longer). |
| `ModuleNotFoundError` in a sandbox run | The generated project is self-contained; check `logs/run_*.log` — smoke kind needs only stdlib. |
| UI shows "API offline" | API not running on :8000, or you're opening :5173 while the API is down (the dev proxy needs the API). |
| Stale state after code changes | `rm -rf data/` (dev databases are disposable) — but keep `data/samples/`. |
