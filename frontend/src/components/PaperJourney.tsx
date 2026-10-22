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
        const timeline = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 80%", end: "clamp(bottom bottom)", scrub: .45, invalidateOnRefresh: true } });
        timeline.fromTo(".flying-sheet", { xPercent: 130, y: -70, rotate: -28, rotateY: 48, scale: .7 }, { xPercent: 0, y: 0, rotate: -2, rotateY: 0, scale: 1, duration: 1, ease: "power2.inOut" })
          .fromTo(".journey-word", { color: "#a99b80" }, { color: "#302c25", stagger: .1, duration: .2 }, .8)
          .to(".flying-sheet", { x: () => Math.max(0, (root.current?.clientWidth ?? 800) * .48 - 20), y: 170, rotate: 8, rotateY: -24, duration: 1.3, ease: "power2.inOut" }, 2.7)
          .to(".flying-sheet", { rotate: 1, rotateY: 0, duration: .6 }, 4)
          .fromTo(".journey-node", { y: 12 }, { y: 0, stagger: .15, duration: .4 }, 4);
      }, root);
      return () => context.revert();
    });
    return () => media.revert();
  }, []);
  return (
    <section ref={root} className="paper-journey" aria-labelledby="journey-title">
      <div className="journey-heading"><span>Follow the evidence</span><h2 id="journey-title">Ideas travel.<br />Their sources should come along.</h2><p>A short journey from a research paper to something you understand.</p></div>
      <div className="journey-stage">
        <div className="flying-sheet" aria-hidden="true"><span className="sheet-corner" /><span className="sheet-caption">A note on understanding</span><p>{SENTENCE.split(" ").map((word, i) => <span className="journey-word" key={i}>{word} </span>)}</p><div className="sheet-rule" /><code>\text&#123;claim&#125; → \text&#123;evidence&#125;</code><span className="sheet-page">Research notes / 01</span></div>
        <p className="sr-only">{SENTENCE}</p>
        <div className="journey-diagram" aria-label="Paper to evidence to understanding"><span className="journey-node">The paper<small>Original text & equations</small></span><span aria-hidden>↗</span><span className="journey-node">The evidence<small>A passage, a page, a source</small></span><span aria-hidden>↗</span><span className="journey-node">Your understanding<small>Answers you can inspect</small></span></div>
      </div>
    </section>
  );
}
