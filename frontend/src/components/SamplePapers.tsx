import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAsync, useJob } from "../hooks";
import { ErrorNote } from "./ui";

export function SamplePapers({ onComplete }: { onComplete: () => void }) {
  const { data: samples, error, reload } = useAsync(api.samples, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [task, setTask] = useState<{ paper_id: string; job_id: string | null } | null>(null);
  const job = useJob(task?.job_id ?? null);
  useEffect(() => {
    if (job?.status === "done" || job?.status === "failed") { setBusy(null); reload(); onComplete(); }
  }, [job?.status, reload, onComplete]);
  async function add(id: string) {
    if (busy) return;
    setBusy(id); setFailure(null); setTask(null);
    try {
      const next = await api.importSample(id); setTask(next);
      if (!next.job_id) { setBusy(null); reload(); onComplete(); }
    } catch (error) { setFailure((error as Error).message); setBusy(null); }
  }
  return <section className="sample-shelf" aria-labelledby="sample-title">
    <div className="section-heading"><h2 id="sample-title">Ideas that changed the field</h2><span>Start with a classic</span></div>
    <p className="sample-shelf-intro">Read the papers behind the breakthroughs. Add one to your library and follow a question into the evidence.</p>
    {(error || failure || job?.status === "failed") && <ErrorNote message={error || failure || job?.error || "Import failed. Try the source link."} />}
    {busy && <p className="sample-progress" role="status">{job?.detail || "Downloading the paper from arXiv…"} {job && `${Math.round(job.progress * 100)}%`}</p>}
    <div className="sample-grid">{samples?.map(sample => <article className="sample-paper" key={sample.id}>
      <span className="sample-year">{sample.year} <span aria-hidden>↗</span></span><h3>{sample.title}</h3><p>{sample.description}</p><small>{sample.authors}</small>
      <div>{sample.paper_id ? <Link to={`/papers/${sample.paper_id}/ask`}>Ask this paper</Link> : <button type="button" disabled={!!busy} onClick={() => void add(sample.id)}>{busy === sample.id ? "Adding paper…" : "Add to library"}</button>}<a href={sample.source_url} target="_blank" rel="noreferrer" aria-label={`Original source: ${sample.title}`}>Source ↗</a></div>
    </article>)}</div>
    <p className="sample-attribution">PDFs download directly from arXiv into your local workspace. Each paper retains its authors’ copyright and source license.</p>
  </section>;
}
