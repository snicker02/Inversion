/* Built-in starting points. Each is a patch over the defaults. */
const D2R = Math.PI / 180;

export const PRESETS = [
  { group: "Plane", name: "Apollonian gasket", state: { engine: "plane" } },
  { group: "Plane", name: "Integral gasket", state: {
    engine: "plane",
    plane: { tri: [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 2 / 3 }], cam: { x: 0, y: 0, s: 1.08 } },
    color: { pal: 3, cmode: 2, cyc: 0.6, hue: 0.12, fill: 0.85, lineW: 0.9 },
  } },
  { group: "Plane", name: "Steiner bloom", state: {
    engine: "plane",
    plane: { formula: "steiner", steiner: { n: 6, ecc: 0.42, dir: 0.6, rot: 0.2, tight: 1 }, cam: { x: 0, y: 0, s: 1.0 } },
    color: { pal: 2, cmode: 1, cyc: 0.55, hue: 0.05, fill: 0.95, lineW: 0.7, relief: 0.55 },
  } },
  { group: "Plane", name: "Pentagonal packing", state: {
    engine: "plane",
    plane: { formula: "ring", ring: { n: 5, tight: 1, rot: 0, outer: true }, cam: { x: 0, y: 0, s: 1.0 } },
    color: { pal: 1, cmode: 6, cyc: 1, hue: 0.1, fill: 0.9, lineW: 0.8 },
  } },
  { group: "Plane", name: "Superellipse lace", state: {
    engine: "plane",
    plane: { gapFill: false, shape: { kind: "superellipse", exp: 3.4, aspect: 1, sides: 6, ang: 45 * D2R }, maxIter: 200 },
    color: { pal: 4, cmode: 0, cyc: 0.8, hue: 0.0, fill: 0.9, lineW: 1.0 },
  } },
  { group: "Plane", name: "Hexagon kaleidoscope", state: {
    engine: "plane",
    plane: { gapFill: false, shape: { kind: "polygon", exp: 4, aspect: 1, sides: 6, ang: 0 }, mir: { on: true, k: 6, ang: 0, x: 0, y: 0 }, maxIter: 160 },
    color: { pal: 8, cmode: 2, cyc: 0.7, hue: 0.3, fill: 0.9, lineW: 0.8 },
  } },
  { group: "Plane", name: "Schottky pearls", state: {
    engine: "plane",
    plane: { formula: "schottky", schottky: { pairs: 2, tight: 0.985, rot: 45 * D2R, twist: 0 }, maxIter: 300, cam: { x: 0, y: 0, s: 1.05 } },
    color: { pal: 6, cmode: 2, cyc: 0.9, hue: 0.0, fill: 0.9, lineW: 0.8 },
  } },
  { group: "Plane", name: "Twisted Schottky", state: {
    engine: "plane",
    plane: { formula: "schottky", schottky: { pairs: 3, tight: 0.9, rot: 0, twist: 38 * D2R }, maxIter: 300, cam: { x: 0, y: 0, s: 1.05 } },
    color: { pal: 7, cmode: 1, cyc: 0.7, hue: 0.0, fill: 0.95, lineW: 0.6, relief: 0.5 },
  } },
  { group: "Plane", name: "Maskit tiling", state: {
    engine: "plane",
    plane: { formula: "maskit", maskit: { mu: [0.04, 1.97] }, maxIter: 400, cam: { x: 0, y: 0.98, s: 1.15 } },
    color: { pal: 8, cmode: 6, cyc: 1, hue: 0.05, fill: 0.9, lineW: 0.6 },
  } },
  { group: "Plane", name: "Looking-glass gasket", state: {
    engine: "plane",
    plane: { ginv: { on: true, x: 0.42, y: 0.18, r: 0.5 }, maxIter: 220 },
    color: { pal: 9, cmode: 3, cyc: 0.6, hue: 0.0, fill: 0.9, lineW: 0.8 },
  } },
  { group: "Limit", name: "Apollonian limit set", state: {
    engine: "limit", limit: { recipe: "grandma", ta: [2, 0], tb: [2, 0], cam: { x: 0, y: 0, s: 1.4 } },
    color: { pal: 0, cmode: 0, cyc: 0.5, hue: 0.0 },
  } },
  { group: "Limit", name: "Quasi-Fuchsian ribbon", state: {
    engine: "limit", limit: { recipe: "grandma", ta: [1.87, 0.1], tb: [1.87, -0.1], cam: { x: 0, y: 0, s: 1.6 } },
    color: { pal: 8, cmode: 2, cyc: 0.6, hue: 0.0 },
  } },
  { group: "Limit", name: "Spiral cusp", state: {
    engine: "limit", limit: { recipe: "grandma", ta: [1.91, 0.05], tb: [3, 0], cam: { x: 0, y: 0, s: 1.6 } },
    color: { pal: 9, cmode: 0, cyc: 0.35, hue: 0.0 },
  } },
  { group: "Limit", name: "Maskit cusp", state: {
    engine: "limit", limit: { recipe: "maskit", mu: [0.05, 1.98], cam: { x: 0, y: 1, s: 1.2 } },
    color: { pal: 1, cmode: 2, cyc: 0.8, hue: 0.2 },
  } },
  { group: "Space", name: "Bubble ball", state: {
    engine: "space", space: { formula: "apollo", hollow: 4, exposure: 0.8, cams: { apollo: { target: [0, 0, 0], yaw: 0.62, pitch: 0.38, dist: 7.2 } } },
    color: { pal: 0, cmode: 1, cyc: 0.6, hue: 0.0, fill: 0.9 },
  } },
  { group: "Space", name: "Pseudo-Kleinian halls", state: {
    engine: "space", space: { formula: "pk", lamp: { on: true, at: "eye", power: 0.7 }, exposure: 1.3 },
    color: { pal: 4, cmode: 1, cyc: 0.35, hue: 0.05, fill: 0.9 },
  } },
  { group: "Space", name: "Bubble lattice", state: {
    engine: "space", space: { formula: "lat" }, color: { pal: 8, cmode: 4, cyc: 0.6, hue: 0.1, fill: 0.9 },
  } },
  { group: "Space", name: "Kleinian domes", state: {
    engine: "space", space: { formula: "klein", light: { yaw: 0.2, pitch: 1.2 }, lamp: { on: true, at: "target", power: 0.8 }, backdrop: "sky" },
    color: { pal: 8, cmode: 1, cyc: 0.5, hue: 0.05, fill: 0.85 },
  } },
];
