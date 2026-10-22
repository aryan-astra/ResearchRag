export type ArtKind = "torus" | "knot" | "sphere" | "folio" | "wave";
export const ART_OPTIONS: { id: ArtKind; name: string; description: string }[] = [
  { id: "torus", name: "Continuum", description: "A sculptural ring, with notation turning through its surface." },
  { id: "knot", name: "Connections", description: "One continuous thread, woven into a trefoil knot." },
  { id: "sphere", name: "A world of ideas", description: "A globe of characters, illuminated from one side." },
  { id: "folio", name: "The unfolding page", description: "A sheet of research, bending into a new shape." },
  { id: "wave", name: "Wave function", description: "A flowing field of symbols, following a shared rhythm." },
];
type Point = [number, number, number];
const TAU = Math.PI * 2;
function surface(kind: ArtKind, u: number, v: number, time: number): Point {
  if (kind === "torus") {
    const r = 1.5 + .66 * Math.cos(v);
    return [r * Math.cos(u), r * Math.sin(u), .66 * Math.sin(v)];
  }
  if (kind === "sphere") return [2 * Math.cos(u) * Math.sin(v), 2 * Math.sin(u) * Math.sin(v), 2 * Math.cos(v)];
  if (kind === "knot") {
    const r = 1.25 + .5 * Math.cos(3 * u), tube = .27;
    return [(r + tube * Math.cos(v)) * Math.cos(2 * u), (r + tube * Math.cos(v)) * Math.sin(2 * u), .65 * Math.sin(3 * u) + tube * Math.sin(v)];
  }
  const x = (u / Math.PI - 1) * 2.1, y = (v / Math.PI - 1) * 1.7;
  return [x, y, kind === "folio" ? .24 * x * x + .22 * Math.sin(y * 2 + time * .45) : .42 * Math.sin(x * 2 + time * .7) * Math.cos(y * 2 - time * .25)];
}
/** Surface sampling and a depth buffer keep the sculpture and its notation in one space. */
export function asciiFrame(kind: ArtKind, time: number, width = 144, height = 68, pointer = { x: 0, y: 0 }) {
  const cells = width * height;
  const depths = new Float32Array(cells).fill(-Infinity);
  const base = new Array<string>(cells).fill(" "), accent = new Array<string>(cells).fill(" ");
  const a = .45 + Math.sin(time * .25) * .4 + pointer.y * .3, b = -.25 + Math.sin(time * .18) * .4 + pointer.x * .35;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const cc = Math.cos(time * .17), sc = Math.sin(time * .17);
  const scale = Math.min(width * .215, height * .38);
  const rotate = ([x, y, z]: Point): Point => {
    const sx = x * cc - y * sc, sy = x * sc + y * cc;
    const rx = sx * cb + z * sb, rz = z * cb - sx * sb;
    return [rx, sy * ca - rz * sa, sy * sa + rz * ca];
  };
  const project = (point: Point) => {
    const [x, y, depth] = rotate(point), perspective = 7 / (7 - depth);
    return { col: Math.round(width / 2 + x * perspective * scale), row: Math.round(height / 2 + y * perspective * scale * .54), depth };
  };
  const ramp = ".,:;irsXA253hMHGS#9B&@";
  for (let u = 0; u < TAU; u += .029) for (let v = .015; v < (kind === "sphere" ? Math.PI : TAU); v += .038) {
    const p = surface(kind, u, v, time), du = surface(kind, u + .008, v, time), dv = surface(kind, u, v + .008, time);
    const ax = du[0] - p[0], ay = du[1] - p[1], az = du[2] - p[2];
    const bx = dv[0] - p[0], by = dv[1] - p[1], bz = dv[2] - p[2];
    const normal = rotate([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]);
    const length = Math.hypot(...normal) || 1;
    const light = Math.min(1, .16 + Math.max(0, (-normal[0] * .35 - normal[1] * .5 + normal[2] * .79) / length) * .84);
    const { col, row, depth } = project(p);
    if (col < 0 || col >= width || row < 0 || row >= height) continue;
    const i = row * width + col;
    if (depth < depths[i]) continue;
    depths[i] = depth;
    base[i] = ramp[Math.floor(light * (ramp.length - 1))];
  }
  // Surface coordinates move every glyph with the object, including when it turns out of view.
  ["\\sum", "\\alpha", "E=mc^2", "\\nabla", "\\int", "\\theta"].forEach((phrase, patch) => {
    const u = .35 + patch * .95, v = kind === "sphere" ? .6 + (patch % 3) * .7 : .75 + (patch % 3) * 1.9;
    for (let letter = 0; letter < phrase.length; letter++) {
      const { col, row, depth } = project(surface(kind, u + letter * .068, v, time));
      if (col < 0 || col >= width || row < 0 || row >= height) continue;
      const i = row * width + col;
      if (depth < depths[i] - .18 || depths[i] === -Infinity) continue;
      base[i] = " "; accent[i] = phrase[letter];
    }
  });
  const lines = (chars: string[]) => Array.from({ length: height }, (_, row) => chars.slice(row * width, (row + 1) * width).join("")).join("\n");
  return { base: lines(base), accent: lines(accent) };
}
