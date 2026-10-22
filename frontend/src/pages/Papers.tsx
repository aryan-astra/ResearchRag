import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAsync, fmtDate } from "../hooks";
import { Badge, Button, Empty, ErrorNote, PageHeader, Skeleton } from "../components/ui";
import { UploadPaper } from "../components/UploadPaper";
import type { Paper } from "../types";

export default function Papers() {
  const { data: papers, loading, error, reload } = useAsync(() => api.listPapers(), []);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Paper | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = useMemo(() => (papers ?? []).filter((p) => `${p.title ?? ""} ${p.filename}`.toLowerCase().includes(query.toLowerCase())), [papers, query]);
  const remove = async () => {
    if (!pending || deleting) return;
    setDeleting(true); setDeleteError(null);
    try { await api.deletePaper(pending.id); setNotice(`Deleted ${pending.title || pending.filename}`); dialog.current?.close(); setPending(null); reload(); }
    catch (e) { setDeleteError((e as Error).message); }
    finally { setDeleting(false); }
  };
  return (
    <div className="library-page">
      <PageHeader title="Your paper library" sub="A home for the research you’re building on." right={<Button kind="ghost" onClick={reload}>Refresh library</Button>} />
      <div data-enter><UploadPaper onComplete={reload} compact /></div>
      <div className="library-toolbar" data-enter><div><strong>All papers</strong><span>{(papers ?? []).length}</span></div><label className="library-search"><span className="sr-only">Search papers</span><svg aria-hidden viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" /></svg><input type="search" placeholder="Search your library…" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
      {notice && <div className="library-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss deletion notice">×</button></div>}
      {error && <ErrorNote message={error} />}
      {loading && !papers ? <Skeleton lines={4} /> : !papers?.length ? <Empty title="Make this library yours" hint="Upload your first research paper above. Once it’s ready, you can read, ask and inspect the evidence." /> : !visible.length ? <div className="library-first"><p>No papers match “{query}”.<small><button className="text-accent underline" onClick={() => setQuery("")}>Clear search</button></small></p></div> : (
        <div className="library-list" aria-label="Research papers">{visible.map((p) => <article key={p.id} className="library-row">
          <span className="library-file-icon" aria-hidden><svg viewBox="0 0 24 28" fill="none"><path d="M3 1h11l7 7v18H3zM14 1v8h7M7 15h10M7 19h7" stroke="currentColor" strokeWidth="1.3" /></svg></span>
          <div className="library-paper-title"><h2><Link to={`/papers/${p.id}`}>{p.title || p.filename}</Link></h2><p>{p.page_count || "—"} pages <span>·</span> {fmtDate(p.created_at)}{p.error && <span className="text-danger"> · {p.error}</span>}</p></div>
          <Badge tone={p.status === "ready" ? "ok" : p.status === "failed" ? "danger" : "warn"}>{p.status === "processing" ? "Processing" : p.status}</Badge>
          <div className="library-row-actions">{p.status === "ready" && <Link to={`/papers/${p.id}/ask`}>Ask paper <span aria-hidden>↗</span></Link>}<button className="delete-paper" disabled={["queued", "processing"].includes(p.status)} aria-label={`Delete ${p.title || p.filename}`} onClick={() => { setPending(p); setDeleteError(null); dialog.current?.showModal(); }}>Delete</button></div>
        </article>)}</div>
      )}
      <dialog ref={dialog} className="confirm-dialog" aria-labelledby="delete-title" onCancel={(e) => { if (deleting) e.preventDefault(); }}>
        <h2 id="delete-title">Delete this paper?</h2><p>This removes “{pending?.title || pending?.filename}” and its search indexes from your workspace. This can’t be undone.</p>
        {deleteError && <ErrorNote message={deleteError} />}
        <div><Button kind="ghost" disabled={deleting} onClick={() => dialog.current?.close()}>Keep paper</Button><Button kind="danger" busy={deleting} onClick={() => void remove()}>Delete paper</Button></div>
      </dialog>
    </div>
  );
}
