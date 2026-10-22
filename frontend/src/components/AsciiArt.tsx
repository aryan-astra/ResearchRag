import { useEffect, useRef } from "react";
import { asciiFrame, type ArtKind } from "../ascii";

export function AsciiArt({ kind, animated = true }: { kind: ArtKind; animated?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLPreElement>(null);
  const accent = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    let visible = false;
    let time = 0;
    const pointer = { x: 0, y: 0 }, target = { x: 0, y: 0 };
    const paint = () => {
      pointer.x += (target.x - pointer.x) * .08;
      pointer.y += (target.y - pointer.y) * .08;
      const frame = asciiFrame(kind, time, 144, 68, pointer);
      if (base.current) base.current.textContent = frame.base;
      if (accent.current) accent.current.textContent = frame.accent;
      time += .05;
    };
    const sync = () => {
      clearInterval(timer); timer = undefined;
      if (animated && visible && !document.hidden && !reduced.matches) timer = setInterval(paint, 50);
    };
    const steer = (event: PointerEvent) => {
      target.x = event.clientX / window.innerWidth * 2 - 1;
      target.y = event.clientY / window.innerHeight * 2 - 1;
    };
    paint();
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    if (root.current) observer.observe(root.current);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    if (animated) window.addEventListener("pointermove", steer, { passive: true });
    return () => { clearInterval(timer); observer.disconnect(); reduced.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync); window.removeEventListener("pointermove", steer); };
  }, [kind, animated]);
  return <div ref={root} className="ascii-art" aria-hidden="true"><pre ref={base} /><pre ref={accent} className="ascii-accent" /></div>;
}
