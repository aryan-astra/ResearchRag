import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAsync } from "../hooks";
import { api } from "../api";
import { ViewToggle, useViewMode } from "../view";
import { ThemeToggle } from "../theme";
import { StatusDot, embedderStatus } from "./ui";
import { usePageMotion } from "../motion";

const NAV: Array<{ to: string; label: string; end?: boolean; hint: string; icon: ReactNode }> = [
  {
    to: "/",
    label: "Dashboard",
    end: true,
    hint: "Papers and pipeline status at a glance",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    to: "/papers",
    label: "Papers",
    hint: "Upload, parse and inspect research PDFs",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 1.5h5.5L13 5v9.5H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/chat",
    label: "Chat",
    hint: "Chat with any ingested paper",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 3.5h12v7H8l-3.5 3v-3H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M5 6.5h6M5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/jobs",
    label: "Jobs",
    hint: "Background ingest, spec, run and eval jobs",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/health",
    label: "System",
    hint: "Embedder, reranker, LLM and configuration",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 9.5 5.5 5l3 3 3-3L14 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 13.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Layout() {
  const { data: health, error } = useAsync(() => api.health(), []);
  const { isAdvanced } = useViewMode();
  const location = useLocation();
  const scope = usePageMotion(location.pathname);
  const emb = health ? embedderStatus(health.embedding_fallback, health.embedding_model) : null;
  const current = NAV.find((n) => n.end ? location.pathname === n.to : location.pathname.startsWith(n.to));
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="workspace-sidebar">
        <Link to="/" className="brand"><span className="brand-symbol" aria-hidden>r<span>↗</span></span><span>ResearchRAG<small>Your research workspace</small></span></Link>
        <Link to="/papers" className="sidebar-upload"><span aria-hidden>＋</span> Add a paper</Link>
        <div className="nav-section-label">Workspace</div>
        <nav aria-label="Primary" className="workspace-nav">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} title={n.hint}
            className={({ isActive }) => `workspace-nav-link ${isActive ? "is-active" : ""}`}>
            {n.icon}<span>{n.label === "Dashboard" ? "Overview" : n.label === "Papers" ? "Paper library" : n.label === "Chat" ? "Ask your papers" : n.label === "Jobs" ? "Activity" : "Settings & models"}</span>
          </NavLink>)}
          <NavLink to="/sample-art" className={({ isActive }) => `workspace-nav-link ${isActive ? "is-active" : ""}`}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden><ellipse cx="10" cy="10" rx="8" ry="3.5" transform="rotate(-35 10 10)" stroke="currentColor" /><ellipse cx="10" cy="10" rx="8" ry="3.5" transform="rotate(35 10 10)" stroke="currentColor" /><circle cx="10" cy="10" r="1.5" fill="currentColor" /></svg><span>Visual studies</span></NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-mode"><span>Workspace view</span><ViewToggle /></div>
          <Link to="/health" className="connection-status">
            <StatusDot tone={error ? "warn" : health ? "ok" : "warn"} />
            <span>{error ? "Connection unavailable" : health ? "Connected locally" : "Connecting…"}
              <small>{health ? health.llm === "offline" ? "Offline excerpts available" : "Model ready" : "Check workspace settings"}</small>
              {isAdvanced && emb && <small>{emb.detail} · {health?.embedding_model}</small>}
            </span>
          </Link>
          <div className="sidebar-signature"><span className="workspace-avatar">R</span><span>Personal workspace<small>Stored on this device</small></span></div>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="workspace-main">
        <header className="workspace-topbar"><span>Workspace <span aria-hidden>/</span> <strong>{location.pathname === "/sample-art" ? "Visual studies" : current?.label ?? "Paper workspace"}</strong></span><div><span className="local-label">Local workspace</span><ThemeToggle /></div></header>
        <div ref={scope} className="workspace-content"><Outlet /></div>
      </main>
    </div>
  );
}
