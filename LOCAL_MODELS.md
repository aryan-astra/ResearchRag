# Local models on modest hardware

Start with **Qwen3 1.7B, Q4_K_M, through Ollama** for a low-end laptop. This is a practical starting recommendation, not a benchmark result for this project. Retrieval remains responsible for finding evidence; a small model only writes the answer from that evidence.

| Device | Starting choice | Published model download | Expectation |
|---|---|---|---|
| 4 GB RAM, CPU only | Offline excerpts; optionally experiment with Qwen3 0.6B | 523 MB | Smallest generative option, limited reliability for research reasoning |
| 8 GB RAM, CPU only | Qwen3 1.7B Q4_K_M | 1.4 GB | A reasonable first trial for short evidence-grounded answers |
| 16 GB RAM | Qwen3 4B Instruct 2507 Q4_K_M | See the current model page | Prefer the larger instruct model when quality matters and memory permits |

RAM bands are estimates, not minimum requirements. The operating system, browser, vector index, embedding model and context cache all consume memory in addition to the model weights. A small download does not imply equally small RAM usage. CPU latency and answer quality must be measured on the actual device.

Official model pages: [0.6B](https://ollama.com/library/qwen3:0.6b), [1.7B](https://ollama.com/library/qwen3:1.7b), [4B Instruct](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M).

## Connect Ollama

Install Ollama using its official installer, then explicitly download a model:

```sh
ollama pull qwen3:1.7b
```

In an ignored local `.env` file, set:

```dotenv
RESEARCHRAG_LLM_PROVIDER=openai_compatible
RESEARCHRAG_LLM_BASE_URL=http://127.0.0.1:11434/v1
RESEARCHRAG_LLM_MODEL=qwen3:1.7b
RESEARCHRAG_LLM_API_KEY=
RESEARCHRAG_EVIDENCE_MAX_TOKENS=2000
RESEARCHRAG_LLM_MAX_TOKENS=700
RESEARCHRAG_RERANKER=none
```

Restart the backend, then select **Workspace model** in Answer settings. Ollama runs on the backend machine. If the app is hosted elsewhere, its loopback address is not the user's laptop. Do not expose Ollama to the internet.

For tight memory limits, start with a 4096-token model context configured in Ollama. Qwen3's reasoning mode can consume considerable generation time; use its documented non-thinking mode for quick passage summaries. If the model is slow, returns weak answers, or runs out of memory, use **Offline excerpts** or a hosted provider. Model downloads and actual local inference were not performed during this review.

See [Ollama's OpenAI compatibility documentation](https://docs.ollama.com/api/openai-compatibility) for supported API features.

## API keys, including free tiers

The app offers Groq, Google Gemini and OpenAI. Paste a key into **Answer settings**, choose a model supported by that account, and ask a question. The app does not store that key in browser storage, SQLite, configuration files or Git. It sends the key and selected evidence through the backend to the chosen provider for each request. Refreshing or leaving the page clears it.

Free-tier eligibility, quotas, regional access, model availability and provider data policies can change. The app does not promise free usage or bypass provider limits. Get keys from [Groq Console](https://console.groq.com/keys), [Google AI Studio](https://aistudio.google.com/apikey), or [OpenAI](https://platform.openai.com/api-keys).

Provider integration references: [Groq compatibility](https://console.groq.com/docs/openai), [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai). No real API key is bundled.
