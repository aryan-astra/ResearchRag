import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
const SENTENCE = "A good answer begins with a passage you can return to.";

export function PaperJourney() {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const element = root.current!;
      const stage = element.querySelector<HTMLElement>(".journey-stage")!;
      const reading = element.querySelector<HTMLElement>(".journey-reading")!;
      const evidence = element.querySelector<HTMLElement>(".journey-evidence")!;
      const position = (panel: HTMLElement) => ({ x: panel.offsetLeft, y: panel.offsetTop });
      element.classList.add("has-flight");
      const context = gsap.context(() => {
        gsap.set(".journey-panel", { autoAlpha: 0 });
        const timeline = gsap.timeline({ defaults: { ease: "power2.inOut" }, scrollTrigger: {
          trigger: stage, start: "top 100px", end: () => `+=${Math.max(950, window.innerHeight * 1.35)}`,
          pin: true, scrub: .35, invalidateOnRefresh: true,
        } });
        timeline.fromTo(".flying-sheet", {
          x: () => stage.clientWidth * .7, y: -240, rotation: 38, rotationY: -65, rotationX: 35, scale: .65,
        }, {
          motionPath: () => { const p = position(reading); return `M ${stage.clientWidth * .7} -240 C -80 -80 -40 ${p.y + 80} ${p.x} ${p.y}`; },
          rotation: -2, rotationY: 0, rotationX: 0, scale: 1, duration: 1.3,
        })
          .fromTo(".sheet-left", { rotationY: -48 }, { rotationY: 0, duration: 1.3 }, 0)
          .fromTo(".sheet-right", { rotationY: 58 }, { rotationY: 0, duration: 1.3 }, 0)
          .to(".journey-reading", { autoAlpha: 1, duration: .25 }, 1.15)
          .fromTo(".journey-word", { opacity: .24 }, { opacity: 1, stagger: .07, duration: .2 }, 1.4)
          .to(".flying-sheet", { rotation: 0, duration: .6 }, 2.4)
          .to(".journey-reading", { autoAlpha: 0, duration: .2 }, 3)
          .to(".flying-sheet", {
            motionPath: () => { const a = position(reading), b = position(evidence); return `M ${a.x} ${a.y} C ${stage.clientWidth * .32} -160 ${stage.clientWidth * .72} -80 ${b.x} ${b.y}`; },
            rotation: 4, duration: 1.6,
          }, 3.15)
          .to(".flying-sheet", { rotationY: 68, rotationX: -22, scale: .78, duration: .75 }, 3.15)
          .to(".sheet-left", { rotationY: -52, duration: .65 }, 3.15)
          .to(".sheet-right", { rotationY: 62, duration: .65 }, 3.15)
          .to(".flying-sheet", { rotationY: 0, rotationX: 0, rotation: 0, scale: 1, duration: .85 }, 3.9)
          .to(".sheet-leaf", { rotationY: 0, duration: .85 }, 3.9)
          .to(".journey-evidence", { autoAlpha: 1, duration: .25 }, 4.65)
          .fromTo(".journey-node", { opacity: .25, y: 8 }, { opacity: 1, y: 0, stagger: .25, duration: .3 }, 4.8)
          .to(".journey-progress span", { scaleX: 1, duration: 6.4, ease: "none" }, 0);
      }, element);
      // The library above loads asynchronously and can change the flight's scroll position.
      const observer = new ResizeObserver(() => ScrollTrigger.refresh());
      observer.observe(element.parentElement!);
      return () => { observer.disconnect(); context.revert(); element.classList.remove("has-flight"); };
    });
    return () => media.revert();
  }, []);
  return (
    <section ref={root} className="paper-journey" aria-labelledby="journey-title">
      <div className="journey-heading"><span>Follow the evidence</span><h2 id="journey-title">Ideas travel.<br />Their sources should come along.</h2><p>Scroll to follow a page.<br />From a question to a clearer understanding.</p></div>
      <div className="journey-stage">
        <span className="journey-margin-note" aria-hidden="true">A small journey in understanding ↓</span>
        <svg className="journey-trail" viewBox="0 0 800 400" preserveAspectRatio="none" aria-hidden="true"><path d="M710 10 C200 -60 -90 120 150 250 S 650 20 680 330" /></svg>
        <div className="flying-sheet" aria-hidden="true"><span className="sheet-leaf sheet-left" /><span className="sheet-leaf sheet-center" /><span className="sheet-leaf sheet-right" /></div>
        <div className="journey-panel journey-reading">
          <span className="sheet-caption">01 / Ask with curiosity</span>
          <p className="journey-sentence">{SENTENCE.split(" ").map((word, i) => <span className="journey-word" key={i}>{word} </span>)}</p>
          <div className="sheet-rule" /><code>{String.raw`\text{question} \rightarrow \text{evidence}`}</code>
          <span className="sheet-page">A question is only the beginning.</span>
        </div>
        <div className="journey-panel journey-evidence">
          <span className="sheet-caption">02 / Keep the source close</span><h3>Understanding,<br />with a paper trail.</h3>
          <div className="journey-diagram"><span className="journey-node"><b>01</b> The paper<small>Original text & equations</small></span><span className="journey-node"><b>02</b> The passage<small>A page you can return to</small></span><span className="journey-node"><b>03</b> Your answer<small>Grounded in the source</small></span></div>
          <span className="sheet-page">Read. Question. Trace it back.</span>
        </div>
        <div className="journey-progress" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}
