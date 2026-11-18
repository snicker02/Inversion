/* Application state: defaults, path access, serialisation, undo. */

export const PALETTES = [
  { name: "Ember", a: [.55, .30, .18], b: [.45, .30, .16], c: [1, 1, 1], d: [.00, .08, .16], bg: [.020, .018, .022], line: [.035, .028, .030], set: [.030, .025, .028] },
  { name: "Abyss", a: [.13, .32, .42], b: [.17, .28, .38], c: [1, 1, 1], d: [.55, .62, .72], bg: [.012, .020, .028], line: [.020, .032, .040], set: [.016, .026, .034] },
  { name: "Orchid", a: [.48, .24, .48], b: [.42, .24, .40], c: [1, 1, 1], d: [.28, .54, .80], bg: [.030, .014, .032], line: [.045, .022, .048], set: [.038, .018, .040] },
  { name: "Prism", a: [.50, .50, .50], b: [.48, .48, .48], c: [1, 1, 1], d: [.00, .33, .67], bg: [.020, .020, .024], line: [.030, .030, .036], set: [.026, .026, .032] },
  { name: "Copper", a: [.44, .30, .22], b: [.40, .27, .17], c: [1, 1, 1], d: [.10, .16, .24], bg: [.026, .020, .016], line: [.042, .032, .024], set: [.034, .026, .020] },
  { name: "Verdigris", a: [.30, .48, .42], b: [.25, .30, .26], c: [1, 1, 1], d: [.45, .55, .60], bg: [.014, .022, .020], line: [.022, .034, .030], set: [.018, .028, .026] },
  { name: "Nacre", a: [.72, .70, .74], b: [.22, .22, .24], c: [1, 1, 1], d: [.00, .15, .30], bg: [.030, .030, .036], line: [.050, .048, .056], set: [.040, .040, .046] },
  { name: "Solar", a: [.62, .45, .20], b: [.38, .38, .20], c: [1, 1, .5], d: [.00, .10, .20], bg: [.026, .016, .010], line: [.040, .026, .016], set: [.034, .020, .012] },
  { name: "Glacier", a: [.55, .70, .82], b: [.35, .25, .18], c: [1, 1, 1], d: [.50, .55, .60], bg: [.010, .016, .026], line: [.016, .024, .036], set: [.012, .020, .030] },
  { name: "Rose", a: [.70, .40, .48], b: [.30, .30, .26], c: [1, 1, 1], d: [.00, .25, .40], bg: [.028, .014, .018], line: [.044, .022, .028], set: [.036, .018, .022] },
  { name: "Mono", a: [.50, .50, .50], b: [.50, .50, .50], c: [1, 1, 1], d: [.00, .00, .00], bg: [.010, .010, .010], line: [.000, .000, .000], set: [.020, .020, .020] },
  { name: "Ink", a: [.87, .87, .88], b: [.10, .10, .11], c: [1, 1, 1], d: [.00, .10, .20], bg: [.965, .960, .950], line: [.055, .055, .065], set: [.080, .080, .090] },
];

export const HOME_S = 1.55;

export const DEFAULTS = {
  v: 2,
  engine: "plane", /* plane | limit | space */
  plane: {
    formula: "apollonian",
    tri: [{ x: 0, y: 0.72 }, { x: -0.6235, y: -0.36 }, { x: 0.6235, y: -0.36 }],
    ring: { n: 5, tight: 1, rot: 0, outer: true },
    steiner: { n: 6, ecc: 0.38, dir: 0.4, rot: 0, tight: 1 },
    free: [],
    freeSel: 0,
    schottky: { pairs: 2, tight: 0.96, rot: 0.3926991, twist: 0 },
    sfree: [
      { x: -0.55, y: 0, r: 0.38 }, { x: 0.55, y: 0, r: 0.38 },
      { x: 0, y: -0.55, r: 0.38 }, { x: 0, y: 0.55, r: 0.38 },
    ],
    sfreeSel: 0,
    maskit: { mu: [0, 1.96] },
    gapFill: true,
    mir: { on: false, k: 6, ang: 0, x: 0, y: 0 },
    shape: { kind: "circle", exp: 4, aspect: 1, sides: 6, ang: 0 },
    ginv: { on: false, x: 0.35, y: 0.2, r: 0.6 },
    cam: { x: 0, y: 0, s: 1.55 },
    maxIter: 140,
    precision: "auto",
  },
  limit: {
    recipe: "grandma",
    ta: [2, 0], tb: [2, 0],
    mu: [0, 2],
    c: [0, 2],
    eps: 1.0, maxDepth: 220, weight: 1.0, gain: 1.4,
    cam: { x: 0, y: 0, s: 1.4 },
  },
  space: {
    formula: "apollo",
    tet: null,
    srad: 1,
    hollow: 4, /* -1 none, 0-3 a seed (view from inside), 4 the shell (view from outside) */
    apollo: { maxIter: 90, step: 0.35 },
    pk: { size: 1.0, csize: [0.92436, 0.90756, 0.92436], c: [0, 0, 0], thick: 0.92784, maxIter: 12, step: 0.9 },
    lat: { s: 1.3, thick: 0, shape: 0, maxIter: 9, step: 0.8 },
    klein: { mu: [0, 1.96], wrapz: 0, thick: 0, floor: true, maxIter: 70, step: 0.5 },
    cams: {
      apollo: { target: [0, 0, 0], yaw: 0.62, pitch: 0.38, dist: 7.2 },
      pk: { target: [0, 0.06, 0], yaw: 0.5, pitch: 0.16, dist: 1.25 },
      lat: { target: [0, 0, 0], yaw: 0.4, pitch: 0.35, dist: 1.6 },
      klein: { target: [0, 0.35, 0.98], yaw: 0.0, pitch: 0.42, dist: 6.5 },
    },
    ginv: { on: false, x: 0, y: 0, z: 0, r: 1 },
    cut: { on: false, yaw: 1.1, pitch: 0.2, off: 0.0 },
    march: 260, detail: 1.0,
    light: { yaw: 0.9, pitch: 0.75 },
    lamp: { on: false, at: "target", power: 1.0 },
    rmode: "studio", bounces: 2, sunI: 2.0, skyI: 0.9, sunSize: 0.05, skyTint: 0.2, backdrop: "dark",
    shadows: true, shadowK: 10, ao: 0.9, aoR: 0.05, spec: 0.35, shine: 40,
    fog: 0.0, amb: 0.5, head: 0.12, rim: 0.3, exposure: 1.0, glow: 0.0,
    lens: 0, focus: 1.0,
  },
  color: { pal: 0, cmode: 0, cyc: 1, hue: 0, fill: 0.9, lineW: 1.1, glow: 0, relief: 0, reliefAng: 0.8 },
  render: { samples: 64, quality: 1, interactScale: 0.5, exportScale: 2 },
  anim: { driver: "none", speed: 1, hue: false, recSamples: 4 },
  handles: true,
};

export const clone = (o) => JSON.parse(JSON.stringify(o));

export function getPath(o, path) {
  for (const k of path.split(".")) { if (o == null) return undefined; o = o[k]; }
  return o;
}
export function setPath(o, path, v) {
  const ks = path.split(".");
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = v;
}

/* Fill any keys missing from a loaded state with defaults (forward
   compatibility for saved presets and links). */
export function merge(def, src) {
  if (Array.isArray(def)) return Array.isArray(src) ? clone(src) : clone(def);
  if (def && typeof def === "object") {
    const out = {};
    for (const k of Object.keys(def)) out[k] = src && k in src ? merge(def[k], src[k]) : clone(def[k]);
    if (src) for (const k of Object.keys(src)) if (!(k in def)) out[k] = clone(src[k]);
    return out;
  }
  return src === undefined ? def : src;
}

/* base64url JSON for the URL hash */
export function encodeState(S) {
  const bytes = new TextEncoder().encode(JSON.stringify(S));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeState(str) {
  try {
    const b = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(b, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) { return null; }
}

export class History {
  constructor(limit = 120) { this.stack = []; this.i = -1; this.limit = limit; }
  push(S) {
    const s = JSON.stringify(S);
    if (this.i >= 0 && this.stack[this.i] === s) return;
    this.stack.length = this.i + 1;
    this.stack.push(s);
    if (this.stack.length > this.limit) this.stack.shift();
    this.i = this.stack.length - 1;
  }
  undo() { if (this.i > 0) { this.i--; return JSON.parse(this.stack[this.i]); } return null; }
  redo() { if (this.i < this.stack.length - 1) { this.i++; return JSON.parse(this.stack[this.i]); } return null; }
}
