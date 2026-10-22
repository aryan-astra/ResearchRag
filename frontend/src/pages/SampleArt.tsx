import { useState } from "react";
import { Link } from "react-router-dom";
import { ART_OPTIONS, type ArtKind } from "../ascii";
import { AsciiArt } from "../components/AsciiArt";
import { PaperJourney } from "../components/PaperJourney";

export default function SampleArt() {
  const [selected, setSelected] = useState<ArtKind>("torus");
  const [playing, setPlaying] = useState(true);
  const option = ART_OPTIONS.find((art) => art.id === selected)!;
  return (
    <div className="art-gallery-page">
      <div className="gallery-intro" data-enter><span className="workspace-eyebrow">ResearchRAG / visual studies</span><h1>A little science.<br /><em>A little wonder.</em></h1><p>Five original ASCII studies for the hero. Choose a preview below, then tell me which direction you want to keep.</p></div>
      <section className="art-hero-preview" aria-label={`Hero preview: ${option.name}`}>
        <div className="art-hero-copy"><span>For the beautifully curious.</span><h2>Every paper holds<br />a new perspective.</h2><p>Ask better questions.<br />Follow the evidence.</p><Link to="/papers" className="art-hero-action">Explore your research <span aria-hidden>↗</span></Link></div>
        <div className="art-corner"><AsciiArt key={selected} kind={selected} animated={playing} /></div>
        <div className="art-caption"><span>{String(ART_OPTIONS.findIndex(a => a.id === selected) + 1).padStart(2, "0")} / {option.name}</span><button type="button" aria-pressed={!playing} onClick={() => setPlaying(p => !p)}>{playing ? "Pause artwork" : "Play artwork"}</button></div>
      </section>
      <div className="art-selection-heading"><h2>Find your direction</h2><p>One animated preview at a time. No selection is saved to the homepage.</p></div>
      <div className="art-options">{ART_OPTIONS.map((art, index) => <button type="button" className={`art-option ${selected === art.id ? "is-selected" : ""}`} aria-pressed={selected === art.id} key={art.id} onClick={() => setSelected(art.id)}>
        <div className="art-thumbnail"><AsciiArt kind={art.id} animated={false} /></div><span className="art-option-number">0{index + 1}</span><h3>{art.name}</h3><p>{art.description}</p><span className="art-option-cta">{selected === art.id ? "Previewing above" : "Preview in the hero"}<span aria-hidden>↗</span></span>
      </button>)}</div>
      <div className="art-gallery-note"><p>Look a little closer: <code>\\sum</code>, <code>\\alpha</code> and other fragments of LaTeX pass through the form in ember orange.</p><p>Movement pauses offscreen, in background tabs, and when reduced motion is enabled. The paper study below follows ordinary scrolling, without a pinned page.</p></div>
      <PaperJourney />
    </div>
  );
}
