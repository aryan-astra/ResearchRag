import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
const SENTENCE = "A good answer begins with a passage you can return to.";

export function PaperJourney() {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference) and (min-width: 768px)", () => {
      const context = gsap.context(() => {
        const timeline = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 80%", end: "bottom bottom", scrub: .6 } });
        timeline.fromTo(".flying-sheet", { xPercent: 125, y: -80, rotate: -24, rotateY: 38, scale: .65 }, { xPercent: 0, y: 0, rotate: -2, rotateY: 0, scale: 1, duration: 1, ease: "power2.inOut" })
          .fromTo(".journey-word", { color: "#b6ac97" }, { color: "#302c25", stagger: .07, duration: .18 }, .65)
          .to(".flying-sheet", { xPercent: 150, y: 75, rotate: 16, rotateY: -28, scale: .85, duration: 1.1, ease: "power2.inOut" }, 1.8)
          .fromTo(".journey-node", { y: 12 }, { y: 0, stagger: .15, duration: .4 }, 2.2);
      }, root);
      return () => context.revert();
    });
    return () => media.revert();
  }, []);
  return (
    <section ref={root} className="paper-journey" aria-labelledby="journey-title">
      <div className="journey-heading"><span>Follow the evidence</span><h2 id="journey-title">Ideas travel.<br />Their sources should come along.</h2><p>A short journey from a research paper to something you understand.</p></div>
      <div className="journey-stage">
        <div className="flying-sheet" aria-hidden="true"><span className="sheet-corner" /><span className="sheet-caption">A note on understanding</span><p>{SENTENCE.split(" ").map((word, i) => <span className="journey-word" key={i}>{word} </span>)}</p><div className="sheet-rule" /><code>\\text&#123;claim&#125; → \\text&#123;evidence&#125;</code><span className="sheet-page">Research notes / 01</span></div>
        <p className="sr-only">{SENTENCE}</p>
        <div className="journey-diagram" aria-label="Paper to evidence to understanding"><span className="journey-node">The paper<small>Original text & equations</small></span><span aria-hidden>↗</span><span className="journey-node">The evidence<small>A passage, a page, a source</small></span><span aria-hidden>↗</span><span className="journey-node">Your understanding<small>Answers you can inspect</small></span></div>
      </div>
    </section>
  );
}
