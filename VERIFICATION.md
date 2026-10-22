# Verification — 22 October 2026

This records what was exercised, rather than claiming every PDF or model answer is correct.

## Automated checks

- 173 backend tests pass on Windows/Python 3.13, with one upstream Starlette/httpx deprecation warning.
- Five deterministic ASCII tests pass, including notation movement and pointer steering.
- TypeScript and the Vite production build pass. npm audit reports zero vulnerabilities.
- Ruff passes on the answering, evidence, model setup, sample-import and regression-test modules checked in this pass.
- Publishable-file and reachable-history secret scans report zero credential candidates. The scan covered 291 historical blobs before the last documentation commits. This is a heuristic, not proof that every secret format is recognized.
- GitHub Actions ran successfully on pushed commits. Commits use GitHub's verified signature API with the existing authenticated account. The locked personal GPG key and its protection were left intact; no passwords were requested or stored.

## Browser and interaction checks

- All 14 primary/list/paper routes plus specification and implementation detail views render. Normal navigation produced no JavaScript page errors.
- Home, library, chat, settings and artwork were checked at 375, 768 and 1440 pixels. Paper, retrieval, evaluation and detail views received additional narrow-screen checks. Detected breadcrumb, filename and review-panel overflow was fixed.
- Light/dark transitions, artwork pause, reduced motion, changing forms, moving LaTeX glyphs and the scroll-linked paper were exercised. The paper stays inside its section and lands separately from the diagram. No long task was observed in a short 1.2-second artwork observation; this is not a full performance benchmark.
- Homepage and chat Lighthouse snapshots reached 100 accessibility and 100 best practices after fixing muted-text contrast. This is automated coverage, not a complete manual screen-reader audit. Optional agent-discovery manifests are not supplied for the local workspace.
- Real imports completed for Attention Is All You Need, RAG, BERT, ResNet and GAN. PDFs remain in ignored app data with original source attribution.
- API-key masking and lack of browser storage were checked with dummy values in the earlier pass. External provider calls were mocked.
- Injected evaluation/experiment request failures show errors. Injected requirement-review failure visibly rolls back its optimistic status. Expected injected HTTP 503 console entries are excluded from the normal-page error check.
- A real specification job completed through the deterministic fallback. Its generated scaffold passed syntax, imports, tests and smoke validation; the file browser and a separate smoke run were exercised. Scaffold validation does not establish a paper-method reproduction.
- Local and external-origin CORS preflight checks returned 200 and 400 respectively. The app remains an unauthenticated local workspace.

Screenshots were captured and inspected locally. No committed baseline existed, so automated visual regression is **inconclusive**; the responsive and screenshot checks above are direct inspection.

## Local model results

The CPU runtime and GGUF weights were downloaded, SHA-256 verified and used for actual inference on this 8 GB laptop. Qwen3.5 2B Q4_K_M gave correct core answers on Transformer layers, RAG variants and BERT MLM/NSP. It still added incorrect detail in some continuations, and a repeated live BERT check contradicted its correct opening sentence. The 0.8B model was less reliable. These checks are not a representative accuracy benchmark.

The pipeline rejects incomplete, repetitive, unavailable-source, uncited and model-admitted weak/insufficient conclusions in favor of source excerpts. Markdown confidence metadata is normalized. This catches response-format and self-reported insufficiency failures; it cannot prove semantic truth. See LOCAL_MODELS.md for measured memory/latency and the launcher.

Weights are repository release assets because GitHub rejected LFS uploads to this public fork. The source tree contains the pinned manifest, downloader and Apache-2.0 attribution.

## Remaining limits

PDF formulas are extracted as text and inspectable in original page images. Perfect PDF-to-LaTeX conversion is not implemented. Real OCR engine execution, paid-provider credentials and exhaustive screen-reader behavior were not tested. Generated code runs in a local subprocess; it is not isolated from the host filesystem or network. Review code before executing it. Retrieval and small-model answers require checking against source pages.
