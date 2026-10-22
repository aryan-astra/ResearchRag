export type ArtKind = "torus" | "orbit" | "folio" | "wave" | "helix";
export const ART_OPTIONS: { id: ArtKind; name: string; description: string }[] = [
  { id: "torus", name: "The Continuum", description: "A revolving torus. Familiar mathematics, an unexpected margin." },
  { id: "orbit", name: "Fields of Inquiry", description: "Intersecting orbital paths, like ideas finding a shared centre." },
  { id: "folio", name: "A Living Page", description: "A softly folding sheet, written in the language of research." },
  { id: "wave", name: "Latent Landscape", description: "A quiet wave field. Order emerging from small variations." },
  { id: "helix", name: "The Thread", description: "Two strands of evidence, turning into one line of thought." },
];

/** Small, deterministic text renderer: one depth buffer, no canvas or GPU context. */
export function asciiFrame(kind: ArtKind, time: number, width = 96, height = 42) {
  const cells = width * height;
  const depths = new Float32Array(cells).fill(-Infinity);
  const base = new Array<string>(cells).fill(" ");
  const accent = new Array<string>(cells).fill(" ");
  const a = time * .3 + .35, b = time * .17 - .5;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const ramp = ".,:;~=+*#%@";
  const fragments = ["\\sum", "\\alpha", "\\nabla", "E=mc^2", "\\int", "\\theta"];
  const plot = (x: number, y: number, z: number, light: number) => {
    const rx = x * cb + z * sb, rz = z * cb - x * sb;
    const ry = y * ca - rz * sa, depth = y * sa + rz * ca;
    const perspective = 7 / (7 - depth);
    const col = Math.round(width / 2 + rx * perspective * width * .135);
    const row = Math.round(height / 2 + ry * perspective * height * .235);
    if (col < 0 || col >= width || row < 0 || row >= height) return;
    const i = row * width + col;
    if (depth < depths[i]) return;
    depths[i] = depth;
    const shade = Math.max(0, Math.min(ramp.length - 1, Math.floor((light + 1) * 4.5)));
    base[i] = ramp[shade];
    accent[i] = " ";
    if ((col * 13 + row * 7 + Math.floor(time * 2)) % 59 === 0) {
      accent[i] = "αβ∑λπ"[(col + row) % 5];
      base[i] = " ";
    }
  };
  if (kind === "torus") {
    for (let u = 0; u < Math.PI * 2; u += .085) for (let v = 0; v < Math.PI * 2; v += .085) {
      const r = 1.65 + .65 * Math.cos(v);
      plot(r * Math.cos(u), r * Math.sin(u), .65 * Math.sin(v), Math.sin(v + a) * .7 + Math.cos(u - b) * .3);
    }
  } else if (kind === "orbit") {
    for (let ring = 0; ring < 4; ring++) for (let u = 0; u < Math.PI * 2; u += .018) for (let band = -.04; band <= .04; band += .04) {
      const tilt = ring * Math.PI / 4, r = 2.1 + band;
      plot(r * Math.cos(u), r * Math.sin(u) * Math.cos(tilt), r * Math.sin(u) * Math.sin(tilt), Math.sin(u + tilt));
    }
  } else if (kind === "helix") {
    for (let u = -Math.PI * 2; u < Math.PI * 2; u += .035) {
      for (let strand = 0; strand < 2; strand++) for (let band = 0; band < 6; band++) {
        const angle = u + strand * Math.PI, radius = 1.05 + band * .025;
        plot(radius * Math.cos(angle), u * .34, radius * Math.sin(angle), Math.cos(angle + a));
      }
      if (Math.floor((u + Math.PI * 2) * 10) % 10 === 0) for (let r = -1; r <= 1; r += .09) plot(r * Math.cos(u), u * .34, r * Math.sin(u), .2);
    }
  } else {
    for (let u = -1; u <= 1; u += .025) for (let v = -1; v <= 1; v += .035) {
      const z = kind === "folio" ? .6 * Math.abs(u) + .22 * Math.sin(v * 3 + time) : .48 * Math.sin(u * 4 + time) * Math.cos(v * 4 - time * .3);
      plot(u * 2.3, v * 1.8, z, Math.cos(u * 3 + v * 2 + time) * .7);
    }
  }
  // Mathematical fragments are embedded in the form, never scattered over body text.
  const phrase = fragments[Math.floor(time / 3) % fragments.length];
  const row = Math.floor(height * .57);
  const occupied = base.slice(row * width, (row + 1) * width).findIndex((c) => c !== " ");
  if (occupied >= 0) for (let i = 0; i < phrase.length; i++) {
    const index = row * width + Math.min(width - phrase.length - 1, occupied + 5) + i;
    base[index] = " "; accent[index] = phrase[i];
  }
  const lines = (chars: string[]) => Array.from({ length: height }, (_, rowIndex) => chars.slice(rowIndex * width, (rowIndex + 1) * width).join("")).join("\n");
  return { base: lines(base), accent: lines(accent) };
}
