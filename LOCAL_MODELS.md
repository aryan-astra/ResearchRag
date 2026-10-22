# Local models on modest hardware

The tested default is **Qwen3.5 2B Q4_K_M**, served by the pinned CPU-only llama.cpp runtime. GGUF is the file format; Q4_K_M is the four-bit quantization. No GPU or cloud key is required. Model source, checksum and license are recorded in `models/local-model.json` and `models/NOTICE.md`.

## Start on Windows x64

After installing project dependencies and building the frontend as described in README.md:

```powershell
./scripts/serve-local.ps1
```

This verifies/downloads the model, prepares semantic embeddings and reranking, and starts the interface at http://127.0.0.1:8010/. Files and logs stay under this checkout. It uses `data/local` for database and indexes, so it does not mix the new embedding model with another workspace. Import existing papers into this profile. Use `-DataDir` only for a compatible existing store; changing vector dimensions produces an error instead of deleting data.

To download or verify weights without starting the application:

```powershell
.venv/Scripts/python.exe scripts/local_model.py download
.venv/Scripts/python.exe scripts/local_model.py verify
```

The weights are attached to the [2B repository release](https://github.com/aryan-astra/ResearchRag/releases/tag/local-model-qwen3.5-2b-q4). GitHub rejects LFS uploads to this public fork, so the source repository tracks the manifest, downloader and licenses; the binary is a release asset. Ordinary source clones do not download 1.28 GB of weights.

On Linux/macOS, pass an installed compatible llama.cpp executable to `python scripts/local_model.py serve --runtime /path/to/llama-server`, using the environment profile below. The automated runtime download and launcher are tested on Windows x64 only.

## Measurements and limitations

Measured on an Intel i5-1235U laptop with 7.71 GiB usable RAM, CPU only, four model threads, 4096-token context and one request at a time. Search used BGE-small-en-v1.5 and the local MiniLM cross-encoder. These are small functional checks, not a research-quality benchmark or guarantee for arbitrary papers.

| Model | Weight size | Observed peak process RAM | Result |
|---|---:|---:|---|
| Qwen3.5 2B Q4_K_M | 1,280,835,840 bytes | about 1.8 GB | Correct core answers for Transformer layer counts, RAG-Sequence vs RAG-Token, and BERT MLM/NSP; 40–52 seconds per full retrieved answer in initial checks |
| Qwen3.5 0.8B Q4_K_M | 532,517,120 bytes | about 875 MB in a short check | 2.5 seconds for a short supplied passage, but unreliable on full research questions; experimental only |

The 2B answers can still add inaccurate detail. Self-reported confidence is not independently calibrated. Verify the original pages. The 0.8B weights remain in their [experimental release](https://github.com/aryan-astra/ResearchRag/releases/tag/local-model-qwen3.5-0.8b-q4). On weaker devices, choose Offline excerpts. Difficult reasoning benefits from a stronger hosted model or a larger local model on hardware with more memory.

The runtime uses the model publisher's non-thinking sampling defaults: presence penalty 2, top-k 20, top-p 1 and min-p 0; the application sets temperature 1. Incomplete, repetitive, invalidly cited or uncited generated answers fall back to source excerpts. Valid-looking citations do not prove a claim correct.

The operating system, browser, backend, search models and context cache need memory in addition to the weights. Longer context and concurrent requests increase memory and latency.

## Manual API profile

Use these in an ignored local `.env`, with the model server already running:

```dotenv
RESEARCHRAG_DATA_DIR=data/local
RESEARCHRAG_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
RESEARCHRAG_EMBEDDING_BATCH_SIZE=16
RESEARCHRAG_RERANKER=local
RESEARCHRAG_LLM_PROVIDER=openai_compatible
RESEARCHRAG_LLM_BASE_URL=http://127.0.0.1:11434/v1
RESEARCHRAG_LLM_MODEL=researchrag-local
RESEARCHRAG_LLM_API_KEY=
RESEARCHRAG_LLM_TEMPERATURE=1.0
RESEARCHRAG_LLM_MAX_TOKENS=240
RESEARCHRAG_EVIDENCE_MAX_TOKENS=1600
RESEARCHRAG_USE_PARENT_CONTEXT=false
RESEARCHRAG_FINAL_TOP_K=4
RESEARCHRAG_RERANKER_TOP_M=30
```

Select **Workspace model** in Answer settings. Servers run on the backend machine; its loopback address is not a remote visitor's computer. Keep them local. An existing Ollama or LM Studio server can also be connected with its own model identifier and OpenAI-compatible base URL.

Official sources: [Qwen3.5 2B](https://huggingface.co/Qwen/Qwen3.5-2B), [Unsloth quantization](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF), [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).

## API keys, including free tiers

The app offers Groq, Google Gemini and OpenAI. Paste a key into **Answer settings**, choose a model supported by that account, and ask a question. Keys stay in component state and are sent through the backend to the selected provider per request. They are not saved to browser storage, SQLite, configuration files or Git. Refreshing or leaving the page clears the key.

Free-tier eligibility, quotas, regional access and model availability vary. Get keys from [Groq Console](https://console.groq.com/keys), [Google AI Studio](https://aistudio.google.com/apikey), or [OpenAI](https://platform.openai.com/api-keys). No real key is bundled. Provider calls were tested with mocks, not paid credentials.
