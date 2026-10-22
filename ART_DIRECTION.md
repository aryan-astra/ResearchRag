# Evidence in motion

The visual language is a research studio: warm paper, graphite type, generous margins and ember-orange annotations. The homepage uses a turning folio; `/sample-art` compares a helix, knot, sphere, folio and wave, inspired by https://asciihero.framer.website/ with original rendering code. The donut and visible pause controls have been removed.

The ASCII studies describe mathematical surfaces through a small deterministic depth buffer. Light becomes character density. Four complete orange LaTeX expressions describe a gradient, conditional probability, weighted sum and integral. Each expression moves as a screen-facing annotation anchored to the turning form. Separate vertical bands keep labels legible without overlapping one another or compressing individual letters into a single character cell.

The large form is cropped into the upper-right edge. Five static thumbnails support comparison while one preview moves at twenty frames per second. Pointer movement gently steers its rotation. Movement stops offscreen, in hidden tabs, or under reduced motion. No WebGL context, canvas framework or per-frame React state update is needed.

The paper appears on the homepage and gallery. A short pinned scene gives its two reading stops enough scroll time. The text and diagram remain independent of the moving sheet. GSAP MotionPath guides the sheet along responsive curves; three CSS panels fold as the page turns in perspective, then flatten behind the reading content. The first stop reveals words in sequence; the second reveals the source diagram. Scroll backward to reverse the journey. Layout observation refreshes the path's scroll position after the library loads, and the scene fills the available viewport so its final frame remains reachable near the page end.

This is explanatory motion, using the existing GSAP dependency and transform/opacity animation. Reduced motion shows both readable panels without pinning or flight. Theme changes retain the diagonal reveal with an immediate reduced-motion fallback. Both themes preserve warm reading surfaces and avoid blue tints.

Curved-path implementation references: [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) and the [Codrops responsive path tutorial](https://tympanus.net/codrops/2025/12/17/building-responsive-scroll-triggered-curved-path-animations-with-gsap/). The page geometry and animation code here are original; no external animation script was embedded.
