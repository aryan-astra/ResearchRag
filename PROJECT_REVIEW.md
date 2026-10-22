# Project review — 22 October 2026

The latest implementation and measured limitations are recorded in [VERIFICATION.md](VERIFICATION.md) and [LOCAL_MODELS.md](LOCAL_MODELS.md). Earlier measurements below describe prior checkpoints.

## What the platform does

The React/TypeScript frontend calls the FastAPI API using relative `/api` URLs. Vite proxies those requests during development; the API serves `frontend/dist` in production. npm is the declared frontend package manager. The Python package has a CLI and an API that share an `AppContext` composition root.

The core flow is:

1. Upload a PDF and poll its background job.
2. PyMuPDF builds pages and typed blocks, using font/layout heuristics for sections, tables, formulas and captions. Docling is an optional, heavier alternative.
3. Section-aware chunking creates retrieval children and section-context parents.
4. SQLite stores document/provenance data, Qdrant stores child embeddings, and JSON files store per-paper BM25 indexes.
5. Hybrid retrieval combines dense and sparse rankings with reciprocal rank fusion, optionally reranks, and assembles evidence within a token budget.
6. An optional LLM answers from that evidence. Without a usable provider, the app selects verbatim sentences as an extractive fallback.
7. A separate workflow extracts implementation requirements, builds a scaffold, validates it, runs it, and records comparisons and evaluation results. A passing scaffold is not a reproduced research result.

## Changes in this review

- Chat and Ask now offer workspace-default, offline-excerpt and request-scoped OpenAI modes. User keys remain in React state, are sent with the request, and are not saved to app storage. Custom/local endpoints remain server configuration, avoiding arbitrary request-controlled URLs.
- Provider clients accept responses without usage counts, turn missing/empty completions into fallback-compatible errors, omit response bodies from HTTP error messages, and correctly recognize loopback URLs.
- Extractive answers have inline source numbers matching the citation list. Oversized sentences cannot produce an empty answer. Missing LLM confidence markers default to unknown.
- PyMuPDF honors the existing OCR settings for image pages with little text. Blank pages retain physical numbering, image-only documents request OCR, figure extraction resolves image xrefs, and caption links use final block IDs.
- Failed uploads become failed papers that can be inspected and deleted. Active ingestions cannot be deleted midway. Upload reads are bounded, PDF signatures are checked, render DPI is bounded, and block-image lookup is scoped to its paper.
- Job polling resets between jobs, retries initial failures, stops on terminal states, and refreshes the library. Upload progress uses the backend's 0–1 scale. Results are saved before jobs report completion.
- API execution supports Windows without Bash and supplies the active Python interpreter and source path. Validation no longer reports success when only the smoke stage fails.
- Changing embedding dimensions now preserves the existing collection and reports an actionable error instead of deleting its vectors.
- The UI now has warm neutral light/dark themes, locally bundled Manrope typography, a redesigned workspace shell, direct drag-and-drop upload, a searchable library, native deletion dialogs, GSAP route/answer transitions, explicit loading/error states, accurate model labels, and citation links to the exact original page. Parent counts and access to pages beyond 200 are corrected.

## Verification and observed limits

Installed declared Python dependencies into a project-local `.venv` using uv, and frontend dependencies using `npm ci`. No global tools, plugins or model weights were installed. Existing untracked architecture/run documents and launcher scripts were preserved.

All 140 tests pass (the original 114 plus 26 regressions). Added tests cover provider responses, loopback recognition, request-scoped credentials, blank pages, OCR wiring, figure/caption provenance, failed-ingest recovery, Windows API execution, inline citations, token-budget handling, smoke validation and index preservation. The production frontend build, focused Ruff checks and `git diff --check` pass. One upstream Starlette/httpx test-client deprecation warning remains.

A separate local smoke server on port 8010 uses `data/audit-smoke`, hashing embeddings, no reranker, and offline answering. The existing application database is untouched. The bundled PDF produced 19 pages, 321 blocks, 87 child chunks and 38 parents in the initial smoke run. Ingestion took about 51 seconds on this environment; parsing accounted for 48 seconds. Specification generation produced 15 requirements, the 12-file scaffold passed validation, the API smoke execution passed after the Windows fix, and rendered source pages loaded.

The final 32-question offline evaluation measured recall@10 0.8281, MRR 0.6307, citation correctness 0.25 and answer relevance 0.1451, unchanged from the initial smoke evaluation. These values are specific to hashing/no-reranker mode and demonstrate limited answer quality, not production readiness. Results are saved at `data/audit-smoke/final-evaluation.json`. Chrome DevTools verified chat interactions, source-page navigation, narrow layout and the absence of console errors in the checked views. A dummy key stayed masked and absent from localStorage/sessionStorage.

## Remaining work and risks

- **Equation conversion:** PyMuPDF extracts text, not faithful LaTeX. Source-page viewing preserves exact visual notation. Docling enrichment and difficult formulas need representative-paper evaluation; they were not validated here.
- **OCR:** configuration and error paths are tested, but actual Tesseract recognition/language data were not exercised. Mixed scanned/digital pages with substantial existing text may need a broader OCR policy.
- **Models:** no real paid API calls or local generative-model downloads were made. Provider behavior uses mocked responses in regression tests. Local Ollama/LM Studio can be configured with `RESEARCHRAG_LLM_PROVIDER=openai_compatible`, `RESEARCHRAG_LLM_BASE_URL=http://127.0.0.1:11434/v1`, and an installed model name. Hardware/quality benchmarks are needed before selecting a small model.
- **Dependencies:** Pinned upgrades to Vite 8.3.5, Tailwind 4.3.3, React Router 7.18.4 and related build plugins now produce zero npm audit findings. Node 22.12+ is required. A universal Python 3.11+ developer lock is included; project metadata retains its existing supported-version ranges.
- **Isolation:** generated code runs in a subprocess, not an OS security sandbox. It retains filesystem/network access despite the legacy `execution_allow_network` setting. Run untrusted code in a container; do not expose this unauthenticated local app publicly.
- **Storage:** changing models with the same embedding dimension can still mix incompatible semantic spaces. Re-ingestion is not transactional across SQLite, Qdrant and BM25 and can retain stale records. Background jobs are daemon threads and do not recover automatically after process interruption.
- **Coverage:** one bundled paper and synthetic PDF fixtures do not establish general layout, table, multilingual or formula accuracy. The heavier Docling backend, hosted rerankers, real model quality, full training and every UI page were not exercised.

## Skills and browser tools

Applied Ponytail's active instructions, `agent-skills:debugging-and-error-recovery`, and `frontend-design`. Inspected `ecc:repo-scan`; it is an external installer pointer, so no installation was needed. Used Context7 to verify PyMuPDF OCR APIs and Chrome DevTools MCP for live inspection. Unrelated installed services/skills were not invoked.

Chrome DevTools is the preferred interactive tool here for console, network and page diagnostics. Playwright is the better fit for repeatable automated browser tests. The in-app browser is useful for keeping a preview beside the chat; it is not inherently a stronger debugging tool.

## GitHub preparation and second design pass

The credential audit found zero candidates in publishable working files and 184 reachable historical Git blobs. The checker is heuristic and does not establish universal absence of secrets. A repeated check, regression tests, GitHub Actions, stronger ignore patterns, SECURITY.md, an MIT license file and LOCAL_MODELS.md are included. No real credential was found to remove, and history was not rewritten or published.

Groq and Gemini are now request-scoped fixed-endpoint provider choices alongside OpenAI. Free-tier availability is provider-controlled. Keys remain masked and unsaved. The redesign was visually checked in light and dark themes and at a 390px mobile viewport with reduced motion. Synthetic PDF upload completed and refreshed the library. The full locally inspected skill catalog is kept outside the repository; SKILLS_USED.md documents relevant guidance without machine-specific installation paths.

## Research-studio art studies

The follow-up brief targets an 8 GB CPU-only laptop and a lighter research aesthetic. The homepage is shorter, controls are rounded, and `/sample-art` provides five original deterministic ASCII studies with cropped hero compositions and orange mathematical fragments. Only the selected large preview animates at 12 FPS; static thumbnails do not run timers. Intersection, visibility, pause and reduced-motion gates stop unnecessary work. Five Node regression checks verify frame dimensions, deterministic output, motion and LaTeX accents.

The gallery includes a GSAP paper-flight section with word highlighting and a source diagram, linked to ordinary scrolling without pinning. Theme changes use an optional browser view-transition paper reveal with an immediate reduced-motion fallback. Final hero artwork is deliberately not selected until the user chooses. The gallery was checked at desktop and 390px mobile widths; reduced motion freezes the ASCII frame and the checked views have no console errors.
