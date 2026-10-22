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
    const paint = () => {
      const frame = asciiFrame(kind, time);
      if (base.current) base.current.textContent = frame.base;
      if (accent.current) accent.current.textContent = frame.accent;
      time += .075;
    };
    const sync = () => {
      clearInterval(timer); timer = undefined;
      if (animated && visible && !document.hidden && !reduced.matches) timer = setInterval(paint, 1000 / 12);
    };
    paint();
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    if (root.current) observer.observe(root.current);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(timer); observer.disconnect(); reduced.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync); };
  }, [kind, animated]);
  return <div ref={root} className="ascii-art" aria-hidden="true"><pre ref={base} /><pre ref={accent} className="ascii-accent" /></div>;
}
