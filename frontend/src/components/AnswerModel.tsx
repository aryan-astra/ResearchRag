import { useId } from "react";
import type { ChatModelOptions } from "../api";

const PROVIDERS = {
  server: { label: "Workspace model", model: "", url: "" },
  offline: { label: "Offline excerpts", model: "", url: "" },
  groq: { label: "Groq", model: "llama-3.3-70b-versatile", url: "https://console.groq.com/keys" },
  gemini: { label: "Google Gemini", model: "gemini-3.8-flash", url: "https://aistudio.google.com/apikey" },
  openai: { label: "OpenAI", model: "gpt-4o-mini", url: "https://platform.openai.com/api-keys" },
};

export function AnswerModel({ value, onChange, disabled }: {
  value: ChatModelOptions;
  onChange: (value: ChatModelOptions) => void;
  disabled: boolean;
}) {
  const id = useId();
  const hosted = !["server", "offline"].includes(value.provider);
  const provider = PROVIDERS[value.provider];
  return (
    <details className="model-settings">
      <summary><span className="settings-icon" aria-hidden>◇</span> Answer settings
        <span className="settings-current">{provider.label}</span><span className="settings-chevron" aria-hidden>⌄</span>
      </summary>
      <div className="model-settings-body">
        <label htmlFor={`${id}-provider`}>Answer with</label>
        <select id={`${id}-provider`} disabled={disabled} className="model-input" value={value.provider}
          onChange={(e) => {
            const next = e.target.value as ChatModelOptions["provider"];
            onChange({ provider: next, model: PROVIDERS[next].model || value.model, api_key: "" });
          }}>
          {Object.entries(PROVIDERS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
        </select>
        {hosted ? <>
          <label htmlFor={`${id}-model`}>Model name</label>
          <input id={`${id}-model`} className="model-input" disabled={disabled} required maxLength={200} value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })} />
          <label htmlFor={`${id}-key`}>Your API key <a href={provider.url} target="_blank" rel="noreferrer">Get a key ↗</a></label>
          <div className="key-input">
            <input id={`${id}-key`} className="model-input" disabled={disabled} type="password" autoComplete="off" spellCheck={false}
              value={value.api_key ?? ""} placeholder={`Paste your ${provider.label} key`}
              onChange={(e) => onChange({ ...value, api_key: e.target.value })} />
            {value.api_key && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, api_key: "" })}>Clear</button>}
          </div>
          <p className="settings-help">Kept in this page’s memory only. Your question, key and retrieved passages are sent through this server to {provider.label}. Leaving or refreshing clears the key.</p>
          <p className="settings-help">Free-tier availability and limits depend on your provider account. Edit the model name to one your key supports.</p>
        </> : <p className="settings-help">{value.provider === "offline" ? "No API key or model download. Answers are quoted passages from your paper." : "Uses the server’s configured model, including Ollama or LM Studio. Without a model, answers use offline excerpts."}</p>}
      </div>
    </details>
  );
}
