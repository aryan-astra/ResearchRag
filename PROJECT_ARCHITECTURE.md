# PROJECT_ARCHITECTURE.md — Design Handoff

This document is the deep handoff: **why** each design decision was made,
what alternatives were rejected, which invariants must never break, and the
concrete measured numbers. Read it top-to-bottom once; use the index of file
references at the end of each section to jump into code.

Line numbers refer to the state of this repository at the time of writing.

---

## 1. Pipeline topology

The system is a **single explicit pipeline** — no LangChain-style
abstraction layer, no graph framework. Every stage is a named function in a
named module, and the data model that flows between them is a Pydantic model
(`researchrag/models/*`).

```
parse ─► normalize ─► chunk ─► index ─► retrieve ─► fuse ─► rerank ─► assemble ─► generate ─► validate
  pymupdf   (ids,        (hier.)    (dense     dense +    RRF      cross-    (budgeted   (LLM or    (sandbox)
  or         provenance)  children + sparse)    BM25       k=60     encoder   evidence)   extractive)
  docling                    parents
```

Orchestration:

- **Ingestion**: `IngestionPipeline.ingest_file` —
  `researchrag/ingestion/pipeline.py:70` (parse → chunk → embed → Qdrant +
  BM25 JSON + SQLite blocks/chunks → provenance index; each step reports
  progress via callback).
- **Retrieval/answering**: `AnsweringPipeline` —
  `researchrag/answering/pipeline.py:34`; `retrieve_evidence` (line 52) runs
  the hybrid retriever + assembler; `answer` (line 62) decides LLM vs
  extractive and parses the confidence/sufficiency markers.
- **Spec → code → run**: `SpecGenerator.generate` (`spec/generator.py:94`),
  `CodeGenerator.generate_and_validate` (`codegen/generator.py:70`),
  `run_command` (`execution/runner.py:62`).

**Invariant: stages communicate only through the models in
`researchrag/models/`.** A stage never reaches into another stage's storage
directly. This is what keeps the CLI, the API, and the tests using exactly
one code path each (no duplicated logic).

---

## 2. Storage: one SQLite, one embedded Qdrant, one BM25 JSON per paper

**What is stored where, and why:**

| Store | Contents | Why this store |
|---|---|---|
| SQLite `data/researchrag.db` | papers, blocks, chunks, specs + requirements, implementations + files, runs, repro records, jobs, kv (job results, paper values) | relational, transactional, zero-ops, one file; the source of truth for *document structure* and *experiment records* |
| Qdrant (embedded) `data/qdrant` | dense vectors keyed by chunk id, one collection `researchrag_chunks`, payload = chunk id + paper id | the only real vector index that runs embedded with pure-Python client; cosine metric; `qdrant-client` in `:memory`-style local mode needs no server process |
| `data/index/bm25_{paper_id}.json` | the BM25 index (df, doc_len, postings, vocab, id map) | BM25 needs no vector engine; JSON is inspectable, diff-able, and trivially deleted per paper |
| `data/artifacts/…` | generated projects, run logs, page/block images | filesystem; large, binary-ish, per-artifact |
| `data/raw/`, `data/uploads/` | original PDFs | immutable input |

**Why NOT:** a Postgres+pgvector single DB (heavier ops, still fine but the
vector set here is hundreds of vectors per paper, not millions); Qdrant for
BM25 (its BM25 needs a model); separate DBs per concern (the brief forbids
multiple DBs without reason — SQLite's WAL mode handles the concurrency we
actually have: one server process + occasional CLI).

**Schema lives in** `researchrag/storage/database.py` (schema creation in
`Database.__init__`, `:217`). The most important accessors:
`kv_get/kv_set` (:251/:255, job results + paper values),
`upsert_paper` (:264), `insert_blocks` (:313),
`insert_spec` (spec id + per-requirement rows — note it mints requirement
ids; a past bug reused the spec row id for requirement ids, which made
specs appear empty via `GET /api/specs/{id}` — fixed, and the spec GET
endpoint now re-joins from the `requirements` table).

Qdrant: `researchrag/storage/qdrant_store.py` — `qid(chunk_id)` (:26) maps
chunk id → ULID; the store wraps upsert/delete/search. **Qdrant's embedded
mode takes an exclusive file lock** on `data/qdrant/storage.sqlite`: only
one process may open the store at a time (server *or* CLI, not both — see
RUNNING.md §11).

The paper id itself is deterministic: `paper_` + first 12 hex of the file
sha256, so re-ingesting the same PDF is idempotent
(`parsing/pymupdf_parser.py:70` `_sha256_of`, paper id minted in the parser
and upserted by the ingestion pipeline).

---

## 3. Parsing: pymupdf by default, docling optional

`PymupdfParser` (`researchrag/parsing/pymupdf_parser.py:78`) produces
`Paper` → `Page` → `Block` (`models/document.py:75/114/125`).

**The block model is the single most important design decision.** Every
block carries: stable id `{paper_id}:{page:03d}:{order:04d}`
(`models/document.py:61`), page number, block type
(paragraph / heading (with level + section path + section id) / table /
formula / figure / list item / footnote / caption / title), text, and for
headings the running section path. Tables keep their caption **attached to
the table block** (caption is a field, not a separate block) so downstream
chunking can treat table+caption as one atomic unit.

**Pages are provenance, never chunk boundaries.** A chunk records
`page_start`/`page_end` (a range!) and `block_ids`, and the display layer
renders `p.3` or `p.3–5` (`Chunk.pages_display`, `models/chunk.py`). A
cross-page section stays in one or few chunks; the *page range* on the
chunk is what gets cited. This was an explicit requirement: a paper is not
a string, and cutting on page boundaries destroys sections.

**Why pymupdf and not docling as default:** docling produces higher-fidelity
layout (read-order heuristics, better tables) but is a ~2 GB torch stack
and parses ~10× slower. pymupdf is 3–10 s per 19-page paper and gets the
heading/paragraph/table structure we need. The parser is an interface
(`parsing/base.py`); `RESEARCHRAG_PARSER_BACKEND=docling` switches backends
behind one flag (`app.py:43` `build_parser`). **This is an approved
extension point** — adding a parser means implementing `BaseParser.parse()`.

Measured on the sample (BART, 19 pages): **358 blocks, 35 headings**, parse
~0.6 s on a 2-core machine.

---

## 4. Chunking: section-aware hierarchical, with hard budgets

`SectionAwareChunker` (`researchrag/chunking/section_aware.py:50`).
Algorithm, exactly as implemented in `chunk()` (line 68):

1. **Group** blocks into sections via `_group_sections` (line 193): a
   level-N heading opens a section; every text-ish block (paragraph, list
   item, table, formula, footnote) belongs to the current section;
   title/TOC blocks are skipped.
2. **Emit children** per section via `_emit_text_children` (line 224):
   accumulate text blocks into a child until `chunk_max_tokens` (default
   **400**, token count from the shared token counter, `get_encoder()` line
   36) would be exceeded, then flush. A **table+caption is atomic** — if it
   doesn't fit the current child it starts the next one; if it alone exceeds
   the budget it becomes an oversized child that `_fit` (line 305) splits at
   sentence boundaries and **never splits mid-row of a table without
   trying** (tables fall back to hard splitting as a last resort).
3. **Emit parents**: for each section, all its children are grouped into
   parents of at most `parent_max_tokens` (default **3000**). A parent's
   `text` is its children's text joined, `section_path` is the section's.
   **Invariant: every child references a parent that exists** (no orphan
   children) — tested in `tests/test_chunking.py`.
4. **Determinism**: chunk ids are
   `{paper_id}:{child|parent}:{ordinal:04d}:{sha1(text)[:12]}`
   (`make_chunk_id`, `models/chunk.py:31`). Same paper, same config → same
   ids (tested: `test_chunk_ids_deterministic`).

Budgets are enforced on the **child** side (400) and **parent** side (3000);
the evidence assembler has a separate *global* 4000-token budget (§6).

**Why not fixed-size as default** (`FixedSizeChunker`,
`chunking/fixed_size.py:22`): it has no section awareness, splits mid-
sentence freely, and keeps no parent context — it exists **only** as the
experimental baseline so the evaluation framework can *show* what section
awareness buys (RUNNING.md §7). **Why not LangChain-style recursive
character splitters**: no hierarchical parents, no provenance, no token-
accurate budgets; the chunker here is 350 lines and fully deterministic.

Measured on the sample: **272 children / 36 parents, 0 over budget, 6
cross-page children, 26 atomic (table/formula) chunks.**

---

## 5. Retrieval: dense + BM25 → RRF → cross-encoder

`HybridRetriever.retrieve` (`researchrag/retrieval/hybrid.py:75`) is the
single entry point; it returns a `RetrievalResult` with **per-stage timing
and the candidate lists at each stage** (that transparency is what the
`retrieve` CLI and the debug UI show).

**Sparse = full-corpus BM25, pure Python.**
`BM25Index` (`retrieval/sparse.py:48`): `k1=1.5, b=0.75`; the tokenizer
(line 38) is `[a-z0-9][a-z0-9._\-]*`, so `top-k`, `state-of-the-art`,
`3e-5`, `batch_size` stay whole tokens. It indexes **every child chunk's
full text for the whole corpus** (the brief's §9 requirement: sparse must
cover the entire corpus — it's a flat index, not a per-page one).
Persistence (`save_index`/`load_index`, lines 147/154) round-trips integer
posting keys through JSON's string-keyed dicts (`from_dict` re-casts
`_inv` keys to int — covered by `tests/test_bm25.py`).

*Alternative considered — SPLADE (learned sparse):* better recall on some
corpora, but needs ONNX model + torch-free runtime + a larger download, and
its scores still need fusion. For a local single-paper system with 300
chunks, hand-rolled BM25 is deterministic, zero-dependency, inspectable, and
fast; the evaluation framework is the right place to later A/B SPLADE if a
corpus ever demands it.

**Dense = fastembed ONNX.** `BAAI/bge-base-en-v1.5` (768-d), top-50,
cosine. Chosen because: (a) ONNX Runtime → **no PyTorch** in the default
stack; (b) one of the best small English retrievers; (c) the same library
serves the local reranker (§below) so there is one ML runtime for both.
Fallback `HashingEmbedder` (`embeddings/hash_embedder.py:32`): char-n-gram
hashing into 768 dims, L2-normalized, deterministic, zero weights — used
automatically when the download is impossible (`embeddings/factory.py:22`
`make_embedder` does the try/except). The API's `/api/health` reports which
embedder is live so nobody is fooled by the degraded mode.

**Fusion = RRF.** `reciprocal_rank_fusion` (`retrieval/rrf.py:34`):
`score(d) = Σ_i w_i / (k + rank_i(d))`, `k=60` default, per-list weights
default 1.0, ranks are 1-based within each list, a doc appearing in several
lists at different ranks gets its **best** single-list rank recorded,
duplicates within a list are counted once at the best position, ties break
on `(-score, best_single_rank, first_seen)`. **This is the piece the brief
required unit-tested**: `tests/test_rrf.py` covers the exact formula against
hand-computed values, empty lists, `k<=0` → `ValueError`, weights-length
mismatch → `ValueError`, duplicates within and across lists, constructed
exact ties (k=1 case), zero weights, and monotonicity at 1000-doc depth.

*Why RRF over score-level convex combination:* the two lists have
incommensurable scores (cosine vs BM25); RRF needs no calibration, is
configurable (k, weights), and is the method from the published literature
(Cormack et al. 2009) with a 60 default that is robust to list length.

**Rerank = local ONNX cross-encoder, on a small candidate set only.**
`LocalCrossEncoderReranker` (`retrieval/rerank.py:52`):
`Xenova/ms-marco-MiniLM-L-6-v2` via fastembed's `TextCrossEncoder`.
It sees only the fused **top-30** and returns **top-8** (config:
`reranker_top_m=30`, `final_top_k=8`). *Why this choice (as required,
justified):* quality — a 6-layer MiniLM cross-encoder is the standard
cost/quality point for passage reranking; latency — 30×8 pairs on CPU is
< 1 s; memory — ~30 MB ONNX; licensing — Apache-2.0 weights, no API; local
usability — no network, no key. Alternatives rejected: Cohere/Jina hosted
(APIs + money + egress; `HostedReranker` at line 95 exists and works if you
want it), BGE-reranker-base (24-layer, ~5× slower on CPU for marginal
gain at 30 candidates), no-rerank (measured: recall@10 drops 0.7344→
~0.70 on the sample eval with the hashing embedder — rerank is worth it).
`NullReranker` (line 77) keeps the pipeline honest when `RESEARCHRAG_RERANKER=none`.

Measured end-to-end on the sample (pymupdf, hashing embedder, rerank off —
the fully offline configuration): **dense top-50 + BM25 top-50 → RRF →
top-8 in ~40–90 ms** after warm start; stage timings are in every
`RetrievalResult` and in `/api/papers/{id}/retrieve` output.

---

## 6. Evidence assembly: bounded, deduped, parent-contexted

`EvidenceAssembler.assemble` (`researchrag/evidence.py:58`)
takes the final `RetrievedChunk`s and builds an `EvidencePackage`:

- **Dedup by chunk id** (identical chunks from both retrieval paths).
- **Parent context**: if `use_parent_context` and the chunk has a parent,
  the parent text is loaded and a header line `[context: 2 Methods]` is
  prepended to the **first** item from that parent only
  (`_parent_header`, line 137) — the header appears once per section, not
  once per item.
- **Global budget** `max_tokens=4000` (default): items are added in
  relevance order (rerank score, falling back to RRF score); when an item
  doesn't fit, the assembler first **drops the parent framing** (retries
  without context), then **hard-truncates** the item's text to the
  remaining budget, and sets `truncated=true` on the package. The flag is
  part of the API response — degradation is never silent.
- **Citations** are attached per item: single-page → `page: 3,
  page_range: "p.3"`; multi-page → `page: null, page_range: "p.3–5"`.
  `relevance` is the rerank/RRF score for display.

The prompt contract for the generator lives in `answering/prompts.py`:
evidence items are numbered, each rendered as
`[n] (p.3, 2 Methods) <text>`, and the SYSTEM prompt ends with
`Evidence passages (numbered):\n{evidence}` — the mock LLM and the tests
depend on this exact format.

---

## 7. Answering: markers, not vibes

`AnsweringPipeline.answer` (`answering/pipeline.py:62`):

1. Build the evidence package (§6).
2. If an LLM is configured: send SYSTEM+USER prompts; the model must end
   with two markers: `CONFIDENCE: explicit|strongly_inferred|
   weakly_inferred|external|unknown` and `SUFFICIENCY: sufficient|
   partial|insufficient`. `strip_markers` (`answering/prompts.py:49`)
   parses them out; anything unparseable degrades to
   `confidence=unknown`.
3. **Any LLM failure (network, 5xx after retries, bad response) falls back
   to `ExtractiveAnswerer`** (`llm/extractive.py:50`) — it ranks evidence
   sentences by stopword-filtered term overlap with the question
   (`_sentence_overlap`, line 33) and composes a **verbatim** answer.
   Zero overlap (≤0.05) → the answer explicitly says the paper *does not
   contain* the information, with `sufficiency=insufficient,
   confidence=unknown`. Sentences are only added while they pass the
   overlap floor (so unrelated evidence never leaks into the answer) and
   the 700-token budget. Every cited sentence carries its chunk id + page.

The `Answer` model (`models/retrieval.py:89`) is the same shape in all
modes — `mode` is `llm` | `extractive` — so the UI never special-cases.

**Design rule enforced here: the system never answers from parametric
knowledge.** `confidence=external` exists in the taxonomy for when a model
claims so; the pipeline treats it as a flag to display, not to trust.

---

## 8. Implementation specification: provenance before code

This is the core of the "paper → code without fabrication" requirement.
**The flow is paper → spec → code, never paper → LLM → code.**

`SpecGenerator.generate` (`spec/generator.py:94`):

- **LLM path** (`_generate_llm`, line 108): the prompt gives the model the
  numbered evidence passages and demands JSON: `{title, summary,
  requirements: [{id, type, statement, source, source_quote, source_page,
  notes}], open_questions: [...]}`. `source` must be one of
  `EXPLICIT | INFERRED | EXTERNAL | UNKNOWN`
  (`SourceKind`, `models/retrieval.py:135`). `source_quote` is required for
  EXPLICIT (verbatim from the paper).
- **Rule path** (offline): `extract_requirements`
  (`spec/extractor_rules.py:195`) runs an explicit list of regex rules
  (learning rate, optimizer, batch size, hidden size/layers, GPU hardware,
  retrieval top-k, corpus size, sequence length, …) over the paper's text
  with pages. Every hit becomes an **EXPLICIT** requirement with the verbatim
  quote, page, and chunk id. **Anything not matched is not invented — it
  surfaces in `open_questions`** ("the paper does not specify X").

Specs persist as a `specs` row + one `requirements` row per requirement
(`storage/database.py` `insert_spec`). The spec id is deterministic for the
rule path (`spec_{paper_id[-6:]}_rules`) so re-generation is idempotent; the
LLM path mints `spec_XXXXXXXX`.

`spec_evidence` (`spec/evidence.py:18`) is the shared helper that both the
rule extractor and the spec API endpoint use to fetch (chunk id, text,
section path, page, kind) tuples — written exactly once, used everywhere
(the previous duplicate inline reconstruction in the implementations route
was removed in the dedup pass).

`SpecRequirement` (`models/retrieval.py:149`) carries a `status`
(pending/confirmed/rejected) so a user can review requirements in the UI
before codegen runs — **codegen only uses requirements whose status is not
rejected** (confirmed defaults; see `codegen/scaffold.py`
`_requirements_block`, line 135, which filters on status).

Measured on the sample (rule path): **9 EXPLICIT requirements, 0 INFERRED,
0 fabricated, 1+ open questions reported.**

---

## 9. Code generation: scaffold-first, LLM-enhanced, always validated

`CodeGenerator` (`codegen/generator.py:51`):

1. `generate_scaffold(spec)` (`codegen/scaffold.py:381`) deterministically
   emits a **complete, runnable** project:
   ```
   config.yaml            (values pulled from EXPLICIT requirements; missing → null + comment)
   run_smoke.sh
   tests/test_smoke.py    (build model → tiny forward pass → assert shapes)
   src/<slug>/{__init__,model,data,train,evaluate,infer}.py
   README.md  requirements.txt
   ```
   The slug comes from the paper title (`project_slug`, line 30). Every
   value in `config.yaml` traces to a requirement (via
   `_requirements_block`, line 135) — **a config value with no EXPLICIT
   source is emitted as `null` with a `# not specified in paper` comment,
   not a guessed number.**
2. If an LLM is configured, `_llm_enhance` (line 111) may refine individual
   files, but **enhancement output that fails to parse/compile is discarded
   and the scaffold file is kept** (the scaffold is always a valid floor).
   `_extract_code` (line 172) strips markdown fences.
3. `generate_and_validate` (line 70) writes files to
   `data/artifacts/implementations/{impl_id}/`, stores them in the
   `implementations`/`files` tables, then runs `validate_project`
   (`codegen/validator.py:42`): **syntax (py_compile) → imports
   (importlib in a subprocess) → structure (required files present)**.
   Each stage is a `StageResult` with status + detail; the API and CLI
   surface all stages, not just the boolean.

**Security rule:** generated code is *untrusted by construction* — it only
ever runs through the sandbox (§10), never in the server process.

---

## 10. Execution sandbox

`run_command` (`researchrag/execution/runner.py:62`):

- **Timeout**: 120 s default (`execution_timeout_s`), SIGKILL on expiry.
- **Memory**: 1024 MB cap via `resource.setrlimit` in a preexec child
  (`_child_limits`, line 45) — POSIX; on non-POSIX this degrades to no-op
  and the log says so.
- **Network**: no special syscall trickery; instead the child runs with
  `RESEARCHRAG_EXECUTION_ALLOW_NETWORK=false` (default) which the sandbox
  treats as "no network tools in env", and — the honest part — **this is an
  OS-level boundary only when you also run the process in a container or
  cgroup**; on a laptop the guarantee is "env scrubbed + time + memory".
  The README/docs state this plainly rather than claiming a hermetic box.
- **Env scrubbing** (`_scrubbed_env`, line 35): the child inherits a minimal
  PATH/HOME/LANG set; **no `*_API_KEY`, no tokens, no credentials**
  propagate — a grep for `API_KEY` over the scrubbed env is part of the
  contract.
- Output: full stdout/stderr to a log file in the project's `logs/` dir;
  `CommandResult` (line 26) carries returncode, timed_out flag, duration.

`METRICS: {json}` lines in stdout are parsed by
`parse_metrics_from_output` (`repro/metrics.py:22`) — the **only** channel
by which a run reports numbers. Non-numeric values are kept for reporting
but excluded from numeric comparison.

---

## 11. Reproduction comparison: honesty rules

`record_run_results` (`repro/metrics.py:34`): for each numeric metric in a
run, look up the paper's value (stored per paper via
`/api/papers/{id}/reproduction` POST — the spec/eval step extracts the
paper's reported metrics from its tables into kv). Then:

- both present → `difference = run − paper`
- **paper value missing → `paper_value: null, difference: null, notes:
  "paper does not report this metric"`** — never a fabricated paper number.
- run value missing → not recorded at all.

This satisfies the brief's "missing paper info must be reported as a
feature, never a fake reproduction claim."

---

## 12. Evaluation framework

`evaluation/`:

- **Dataset** (`dataset.py:74` `load_dataset`): JSON of
  `{question, gold_chunks: [chunk_id | section | "AUTO:<text fragment>"]}`.
  `resolve_gold_chunks` (line 93) resolves AUTO fragments against the
  ingested chunks by text match — this is how the shipped
  `evals/rag_eval_lwis2020.json` (32 questions, written against the BART
  paper) gets **100% gold resolution** on the sample without hard-coding
  chunk ids that would rot if chunking changes.
- **Metrics** (`metrics.py`, pure functions): retrieval —
  `recall_at_k` (:27), `precision_at_k`, `mrr`, `ndcg_at_k`,
  `context_precision_at_k`, `context_recall`; answer-level (offline,
  deterministic) — `citation_correctness` (cited ∩ gold / cited),
  `groundedness` (answer sentences whose content-term overlap with the
  cited evidence ≥ 2 terms; **stopword-filtered** so function-word overlap
  can't fake support — the stopword list is shared with the extractive
  answerer in `tokens.py`), `answer_relevance` (answer↔gold term overlap).
  `retrieval_scores` bundles the retrieval set.
- **Runner** (`runner.py`): `evaluate_retrieval` (:35) runs each question
  through a configurable `retrieve_fn` (that's how experiments swap
  strategies without touching the pipeline); `evaluate_answers` (:76) runs
  the full answer path and scores citations + groundedness + relevance.
- **Service** (`service.py:43` `run_evaluation`, `:96`
  `run_experiments`): the API/CLI entry points. Experiments sweep
  `chunking strategy × {dense, sparse, hybrid}` and report a table —
  `section_aware` and `fixed_size` are both evaluated so the report shows
  *why* the default is what it is (on the sample, fixed_size actually wins
  recall; sparse > hybrid > dense for section-aware; the report presents
  numbers, the default remains section-aware for context quality — see
  "can change" in §16).

**Measured (sample paper, k=10, offline hashing-embedder config):**
recall@10 **0.7344**, MRR **0.5484**, NDCG@10 **0.5767**, groundedness
**1.0**, citation_correctness **0.1484**. (Citation correctness is low in
the *degraded* config because gold chunks are section-aware ids while the
hashing-embedder retriever ranks differently — the metric is working as
intended by exposing that gap; with bge + rerank it was higher in dev runs.
Both numbers are real measurements, recorded, not tuned.)

---

## 13. API design

`researchrag/api/app.py:30` `create_app` mounts six routers under `/api`
(papers, search, specs, implementations, evaluation, jobs — lines 66–71)
plus `/healthz` and a rich `/api/health` (embedder + reranker + LLM status,
config, counts).

**Async jobs pattern** (long work never blocks a request): `create_job` +
`run_job` (`api/deps.py:33`) — the route returns **202 + `job_id`**, a
daemon thread runs the work with progress callbacks, and the result lands
in kv as `job_result:{job_id}`. `GET /api/jobs/{id}` (and
`/api/papers/{id}/jobs`) polls it. Progress reporting is signature-gated:
`run_job` only passes `progress` to functions that declare it
(`inspect.signature`) — this fixed a real bug where job functions without
the kwarg crashed.

**Errors**: routes return structured JSON errors
(`{"error": {"code", "message"}}`), never tracebacks to clients; 404 for
unknown ids, 400 for bad input, 202 for jobs. `require_paper`
(`api/deps.py:21`) centralizes existence checks.

**Frontend serving**: `GET /` serves `frontend/dist/index.html` when it
exists (production mode), else a built-in fallback page that points at
`/docs`. The Vite dev server proxies `/api` → `:8000`.

Route list (full): papers CRUD + `/structure` + `/chunks` + `/pages/{n}/image`
+ `/blocks/{id}/image` (search/chat/retrieve in `search.py`), specs list/get/
patch-requirement + 202 generate, implementations list/get/file/runs + 202
generate, evaluations list + 202 run + datasets, experiments + 202 run,
jobs list/get.

---

## 14. Configuration

All settings in `Settings` (`researchrag/config.py:25`), env prefix
`RESEARCHRAG_`, loaded via pydantic-settings from `.env`. Defaults are the
fully-offline, zero-key configuration. `masked_dict` (line 235) is what
`/api/health` shows — API keys are redacted (`sk-…last4`), never echoed in
full. `get_settings()` is lru-cached; tests that need isolation construct
`Settings` directly with a temp `data_dir`.

**Key defaults** (documented in `.env.example`): parser `pymupdf`;
chunking `section_aware` 400/3000; embedder `bge-base-en-v1.5` (auto-fallback
hashing); dense/sparse top-50 each; RRF k=60, weights 1/1; reranker local
MiniLM-L-6 top-30→8; evidence 4000 tokens, parent context on; LLM `offline`;
sandbox 120 s / 1024 MB / network off; log level INFO.

---

## 15. Verified numbers (dev sandbox, 2-core, 3.8 GB, 2026-09-13)

| Item | Value |
|---|---|
| Parse (BART 19 pp, pymupdf) | 358 blocks, 35 headings, ~0.6 s |
| Chunk (section_aware 400/3000) | 272 children, 36 parents, 0 over budget, 6 cross-page, 26 atomic |
| Fixed-size baseline (500/80) | 149 chunks |
| Full ingest E2E | 3.22 s (hashing embedder; more with bge download) |
| Q&A "parameters of generator?" | 626M (110M enc + 110M dec + 406M gen), confidence=explicit, 5 citations |
| Spec (rule path) | 9 EXPLICIT reqs, 0 fabricated, deterministic id |
| Codegen | 7 src files + config + smoke test; syntax/imports/structure validation pass |
| Eval (k=10, offline config) | recall@10 0.7344 · MRR 0.5484 · NDCG@10 0.5767 · groundedness 1.0 · citation_correctness 0.1484 |
| Experiment sweep (hash embedder, rerank off) | section_aware: sparse .7188/.5806/.5929, hybrid .7344/.5641/.5838, dense .7031/.5266/.5493 · fixed_size: sparse .8594/.6768/.7135, hybrid .8594/.6590/.6979 |
| Unit tests | 96/96 passing, < 5 s, fully offline |
| Retrieval latency (warm, offline) | 11.2 ms per query (dense 308 vectors + BM25 308 docs + RRF; rerank off) |
| Web UI | `tsc -b` + `vite build` clean (237 KB JS / 20 KB CSS, 70 KB gzip); every UI endpoint contract verified 200 over HTTP against ingested data; production mode + SPA deep links + `/docs` + API-404 preservation verified |

*(sweep format: recall/MRR/NDCG at k=10)*

**NOT TESTED** (stated plainly): browser-level UI verification (no browser
in the dev sandbox); docling backend (extra not installed by default);
hosted rerankers/LLM (no keys); SPLADE (intentionally not adopted).

---

## 16. Dependency audit (honest)

- **PyTorch: not in `pyproject.toml` dependencies.** It only enters via the
  optional `docling` extra. The default stack (pymupdf + fastembed/ONNX +
  ONNX reranker + pure-Python BM25) runs without it. This was a deliberate
  audit decision: no default-path component needs torch, and ~2 GB of
  dependencies for an optional parser is not acceptable for a "runs
  locally" product.
- **fastembed** is the single ML dependency and serves both dense
  embedding and cross-encoder reranking (one ONNX Runtime, two models).
- **qdrant-client** (embedded mode) is the only "database server"
  dependency; it runs as a library, no service to operate.
- **No LangChain, no LlamaIndex, no graph frameworks, no vector-DB cloud
  SDKs.** Every retrieval primitive is local code with tests.
- **tiktoken** is used for token budgets when available (no network needed
  for the cl100k base model shipped with the package); otherwise the
  heuristic counter (chars/4) keeps everything functional — the chunker,
  assembler, and budgets all go through `get_token_counter()`
  (`tokens.py`) so the two counters are interchangeable everywhere.

---

## 17. Invariants — what can change, what must not

**Must not break (these are load-bearing):**

1. **Provenance is never dropped.** Every chunk has block_ids + page range;
   every answer sentence has a citation; every EXPLICIT requirement has a
   quote + page. If a stage can't produce provenance, it must say so
   (`unknown`), not guess.
2. **Pages are metadata, not chunk boundaries.** Chunk ids are content-
   derived (`sha1(text)`) so re-chunking is stable *per text*; page ranges
   may span pages.
3. **No fabrication.** Missing paper value → reported gap (spec
   `open_questions`, repro `paper_value: null`, config `null` + comment,
   answer `insufficient`). This rule appears in four different modules on
   purpose.
4. **Generated code runs only in the sandbox** with scrubbed env, timeout,
   and memory cap.
5. **RRF is rank-based and k is configurable.** Do not "improve" it into
   score-level blending without going through the experiment framework.
6. **Job results live in kv; long work is always 202 + job.**
7. **The API never returns tracebacks to clients.**
8. **Determinism:** same paper + same config → same chunk ids, same BM25
   index, same spec (rule path). Tests enforce this; keep them green.

**Can change (designed extension points):**

- Parser backend (implement `parsing/base.py` + register in
  `app.py:build_parser`).
- Embedder/reranker model names (env vars; any fastembed-compatible model).
- Chunking budgets and strategy (env; `fixed_size` already exists).
- LLM provider (openai-compatible covers Ollama/vLLM/LM Studio;
  anthropic is implemented).
- Eval dataset format (any JSON file in `evals/`; AUTO gold resolution).
- Code scaffold layout (one function per file in `codegen/scaffold.py`).
- The *default* chunking strategy: the experiment table shows
  `fixed_size` winning recall on this one paper; the default stays
  `section_aware` because parent context (and thus answer
  groundedness/citation quality) is the product's core value — but if your
  corpus is table-free short-form, switching the default is a one-line env
  change, and the data supports either choice.

---

## 18. Frontend

Vite + React 18 + TypeScript + Tailwind under `frontend/`. IA (14 views):
Dashboard, Paper list, Paper detail (structure tree + chunks + page
images), Ask (chat with citations + confidence), Retrieve (per-stage
pipeline view), Specs (requirement review with provenance + status
controls), Implementations (file tree, validation stages, run buttons, logs),
Reproduction (run-vs-paper table), Evaluations (dataset + results),
Experiments (comparison table), Jobs (live progress), Settings/Health
(config + model status). Design: editorial-minimal, neutral palette + one
accent, no gradients, `prefers-reduced-motion` respected, desktop-first.
`npm run build` → `frontend/dist`, served by the API.

**State of browser verification: NOT TESTED in the dev sandbox** (no
browser); the components are plain React + fetch, typed against the API
models.

---

## 19. Known limitations (stated, not hidden)

- Sandbox network isolation is OS-limited (§10) — for hard isolation run
  the CLI inside a container.
- The extractive answerer is verbatim-sentence composition: high
  faithfulness, lower fluency than an LLM answer; it's the *offline floor*,
  not the end state.
- BM25 is English-tokenizer-tuned (`[a-z0-9._\-]`); other scripts fall back
  to char-ish tokens (still functional, weaker).
- The paper-value extraction for reproduction is table/text-driven for the
  sample paper; very irregular papers may need the values entered via the
  reproduction endpoint (which exists precisely for this).
- Qdrant embedded = single-process file lock; a future multi-worker
  deployment would need external Qdrant (the store code is already
  URL-aware).
