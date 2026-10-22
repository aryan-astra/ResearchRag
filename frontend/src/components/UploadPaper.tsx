import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useJob } from "../hooks";
import { Button, ErrorNote } from "./ui";

export function UploadPaper({ onComplete, compact = false }: { onComplete: () => void; compact?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<{ job_id: string; paper_id: string } | null>(null);
  const job = useJob(task?.job_id ?? null);
  const active = uploading || !!task && job?.status !== "done" && job?.status !== "failed";
  useEffect(() => {
    if (job?.status === "done" || job?.status === "failed") onComplete();
  }, [job?.status, onComplete]);
  const upload = async (file?: File) => {
    if (!file || active) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Choose a PDF file to continue."); return; }
    if (file.size > 100 * 1024 * 1024) { setError("This PDF is over 100 MB. Choose a smaller file."); return; }
    setUploading(true);
    setTask(null);
    try { setTask(await api.uploadPaper(file)); }
    catch (e) { setError((e as Error).message); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  };
  return (
    <section className={`paper-uploader ${compact ? "is-compact" : ""} ${dragging ? "is-dragging" : ""}`} aria-label="Upload a research paper"
      onDragOver={(e) => { e.preventDefault(); if (!active) setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]); }}>
      <input id={id} ref={input} type="file" accept=".pdf,application/pdf" className="sr-only" tabIndex={-1} disabled={active}
        aria-label="Choose a PDF" onChange={(e) => void upload(e.target.files?.[0])} />
      <div className="upload-symbol" aria-hidden><svg viewBox="0 0 32 32" fill="none"><path d="M9 4h10l6 6v18H9zM19 4v7h6M5 9v19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M13 19h8m-4-4v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></div>
      <div className="upload-copy"><h2>{active ? "Making your paper searchable…" : "Your next discovery starts with a paper."}</h2>
        <p>{active ? job?.detail || "Uploading your PDF…" : "Drop a PDF here, or choose one from your device."}</p>
        {!compact && !active && <span className="upload-limits">PDF up to 100 MB · Stored locally · No key required</span>}
      </div>
      <Button busy={active} onClick={() => input.current?.click()}>{active ? "Processing paper" : "Upload a paper"}<span aria-hidden>↗</span></Button>
      {active && <div className="upload-progress" role="status"><progress aria-label="Paper processing" max={1} value={job?.progress ?? 0} /><span>{Math.round((job?.progress ?? 0) * 100)}%</span></div>}
      {job?.status === "done" && task && <div className="upload-success" role="status">Your paper is ready. <Link to={`/papers/${task.paper_id}/ask`}>Start asking questions ↗</Link></div>}
      {(error || job?.status === "failed") && <div className="upload-error"><ErrorNote message={error || job?.error || "Processing failed. Try another PDF."} /></div>}
    </section>
  );
}
