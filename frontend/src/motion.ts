import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

export const motion = { duration: 0.55, distance: 14, stagger: 0.055, ease: "power3.out" };

/** Reverts owned tweens on navigation, unmount and React StrictMode cleanup. */
export function usePageMotion(key: string) {
  const scope = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        const targets = scope.current?.querySelectorAll("[data-enter]");
        if (!targets?.length) return;
        gsap.from(targets, {
          y: motion.distance, opacity: 0, duration: motion.duration,
          stagger: motion.stagger, ease: motion.ease, clearProps: "all",
        });
      }, scope);
      return () => context.revert();
    });
    return () => media.revert();
  }, [key]);
  return scope;
}
