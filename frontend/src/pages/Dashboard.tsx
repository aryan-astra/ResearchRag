import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "../api";
import { useAsync, fmtDate } from "../hooks";
import { ErrorNote, Skeleton, Badge } from "../components/ui";
import { UploadPaper } from "../components/UploadPaper";
import { AsciiArt } from "../components/AsciiArt";
import { PaperJourney } from "../components/PaperJourney";

export default function Dashboard() {
  const [playing, setPlaying] = useState(true);
  const { data: papers, loading, error, reload } = useAsync(() => api.listPapers(), []);
  const ready = (papers ?? []).filter((p) => p.status === "ready");
  const recent = ready.slice(0, 4);
  return (
    <div className="overview-page">
      <div className="overview-heading research-hero" data-enter><div className="research-hero-copy"><span className="workspace-eyebrow">For the beautifully curious.</span><h1>Every paper holds<br /><em>a new perspective.</em></h1><p>Bring a question. Find the evidence.<br className="hidden sm:block" /> Make something of what you discover.</p></div><div className="home-hero-art"><AsciiArt kind="torus" animated={playing} /></div><div className="hero-art-controls"><Link to="/sample-art">Explore the forms</Link><button type="button" aria-label={playing ? "Pause artwork" : "Play artwork"} aria-pressed={!playing} onClick={() => setPlaying(p => !p)}>{playing ? "Ⅱ" : "▷"}</button></div></div>
      <div data-enter><UploadPaper onComplete={reload} compact /></div>
      <section className="recent-section" data-enter>
        <div className="section-heading"><h2>Your library <span>{ready.length}</span></h2><Link to="/papers">View all papers <span aria-hidden>↗</span></Link></div>
        {error ? <ErrorNote message={error} /> : loading ? <div className="paper-grid"><Skeleton lines={4} /><Skeleton lines={4} /></div> : recent.length ? (
          <div className="paper-grid">{recent.map((p) => <article className="paper-tile" key={p.id}>
            <Link to={`/papers/${p.id}`} className="paper-cover" tabIndex={-1} aria-hidden="true"><span className="paper-cover-back" /><div className="paper-cover-sheet"><img src={`/api/papers/${p.id}/pages/1/image?dpi=36`} alt="" loading="lazy" /><span className="paper-format">PDF</span></div></Link>
            <div className="paper-tile-meta"><span>{p.page_count} pages</span><Badge tone="ok">Ready</Badge></div>
            <h3><Link to={`/papers/${p.id}`}>{p.title || p.filename}</Link></h3><p>Added {fmtDate(p.created_at)}</p>
            <Link to={`/papers/${p.id}/ask`} className="paper-ask">Ask this paper <span aria-hidden>↗</span></Link>
          </article>)}</div>
        ) : <div className="library-first"><span aria-hidden>↖</span><p>A clear starting point.<small>Add your first paper above. Your reading and research will live here.</small></p></div>}
      </section>
      <p className="classic-invitation">Looking for somewhere to begin? <Link to="/papers#samples">Explore the papers that changed the field ↗</Link></p>
      <PaperJourney />
      <footer className="overview-footer"><span>Your ideas stay in your workspace.</span><Link to="/health">Configure an AI model ↗</Link></footer>
    </div>
  );
}
