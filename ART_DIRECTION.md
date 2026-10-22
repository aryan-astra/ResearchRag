# Evidence in motion

The visual language is a research studio: warm paper, graphite type, generous margins and ember-orange annotations. The interface should feel thoughtful and usable before it feels animated. The homepage is compact; a separate `/sample-art` gallery lets the user choose the hero artwork before a production choice is made.

The ASCII studies describe mathematical surfaces through a small deterministic depth buffer. Light becomes character density, and selected points carry orange symbols. LaTeX fragments are embedded in the form rather than placed over reading content. Each variation explores a different relationship: continuity, intersecting fields, the page itself, waves and a shared thread.

Composition matters as much as the generated object. The large preview is cropped into the upper-right edge rather than presented as a rectangular illustration beside a heading. Five static thumbnails support comparison while only one large preview moves. The renderer runs at twelve frames per second and stops when offscreen, hidden, paused, or under reduced motion. No WebGL context, canvas framework or per-frame React state update is needed.

The flying-paper study follows normal scrolling over a short section without pinning or hijacking the page. One warm sheet moves behind black text, reveals words, and passes towards a diagram. Theme changes use a paper-like diagonal reveal when the browser supports view transitions and switch immediately for reduced motion. Both themes preserve the same reading hierarchy and avoid blue surface tints. Final hero artwork remains a user choice.
