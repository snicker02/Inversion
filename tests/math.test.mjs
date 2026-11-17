/* Numerical validation of the math core. Run: node tests/math.test.mjs */
import * as P from "../engine/math/inversive2d.js";
import * as R from "../engine/math/recipes.js";
import { limitSet } from "../engine/math/dfs.js";
import { mapply, minv, mtrace, cabs } from "../engine/math/complex.js";
import { schottkyRing, schottkyOrbit } from "../engine/math/schottky.js";
import * as S3 from "../engine/math/sphere3d.js";

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log("FAIL:", msg); } }

/* deterministic rng */
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

/* explicit packing: reflect seed circle vectors through words of the duals */
function explicitPacking(circles, duals, depth) {
  const seen = new Map(), out = [];
  const key = (v) => v.map((e) => e.toFixed(6)).join(",");
  let front = circles.map(P.circVec);
  for (const v of front) { seen.set(key(v), 1); out.push(v); }
  for (let d = 0; d < depth; d++) {
    const nf = [];
    for (const v of front) for (const D of duals) {
      const w = P.reflectCircleVec(v, D);
      const k = key(w);
      if (!seen.has(k)) { seen.set(k, 1); out.push(w); nf.push(w); }
    }
    front = nf;
    if (out.length > 6000) break;
  }
  return out.map(P.vecToGen).filter((g) => g.t === 0);
}
/* interiors pairwise disjoint (inner circles), and inside the enclosing one */
function checkPacking(gens, tol, label) {
  const inner = gens.filter((g) => g.inside && g.r > 1e-4), outer = gens.filter((g) => !g.inside);
  let bad = 0, worst = 0;
  for (let i = 0; i < inner.length; i++) for (let j = i + 1; j < inner.length; j++) {
    const a = inner[i], b = inner[j];
    if (Math.abs(a.r - b.r) < 1e-7 * a.r && Math.hypot(a.x - b.x, a.y - b.y) < 1e-7 * a.r) continue; /* duplicate */
    const ov = a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y);
    const rel = ov / Math.min(a.r, b.r);
    if (rel > tol) { bad++; worst = Math.max(worst, rel); }
  }
  for (const O of outer) for (const a of inner) {
    const ov = Math.hypot(a.x - O.x, a.y - O.y) + a.r - O.r;
    if (ov / a.r > tol) { bad++; worst = Math.max(worst, ov / a.r); }
  }
  ok(bad === 0, `${label}: ${bad} overlapping pairs (worst rel ${worst.toExponential(2)}) among ${inner.length}`);
  return inner.length;
}
function orbitTerminates(duals, box, label, cap = 400) {
  let esc = 0, N = 400;
  for (let i = 0; i < N; i++) {
    let p = [box.x + (rnd() * 2 - 1) * box.r, box.y + (rnd() * 2 - 1) * box.r];
    let done = false;
    for (let it = 0; it < cap && !done; it++) {
      let moved = false;
      for (const D of duals) if (P.fEval(D, p[0], p[1]) < 0) { p = P.reflectVec(D, p); moved = true; }
      if (!moved) done = true;
    }
    if (done) esc++;
  }
  ok(esc / N > 0.97, `${label}: orbit termination ${(esc / N * 100).toFixed(1)}%`);
}

/* ---------- 1. Apollonian integral gasket ---------- */
{
  const tri = [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 2 / 3 }];
  const A = P.apollonian(tri);
  ok(A && A.err < 1e-9, "apollonian outer circle");
  const duals = P.faceDuals(A.circles, P.APOLLO_FACES);
  ok(duals.length === 4, "apollonian has 4 duals");
  const gens = explicitPacking(A.circles, duals, 6);
  const bends = new Set(gens.map((g) => Math.round((g.inside ? 1 : -1) / g.r)));
  let integral = true;
  for (const g of gens) { const k = (g.inside ? 1 : -1) / g.r; if (Math.abs(k - Math.round(k)) > 1e-6) integral = false; }
  ok(integral, "apollonian dual orbit bends are integers");
  ok([2, 3, 6, 11, 14, 15, 18, 23].every((b) => bends.has(b)), "apollonian bends contain 2,3,6,11,14,15,18,23");
  checkPacking(gens, 1e-6, "apollonian packing");
  orbitTerminates(duals, { x: 0, y: 0, r: 0.7 }, "apollonian orbit");
}

/* integral gasket (-1, 2, 2, 3): one dual is a straight line */
{
  const A = P.apollonian([{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 2 / 3 }]);
  const duals = P.faceDuals(A.circles, P.APOLLO_FACES);
  ok(duals.some((d) => Math.abs(d[0]) < 1e-9), "integral gasket has a line dual");
  const gens = explicitPacking(A.circles, duals, 6);
  checkPacking(gens, 1e-6, "integral gasket packing");
  const bends = new Set(gens.map((g) => Math.round(1 / g.r)));
  ok([2, 3, 6, 11, 14, 15].every((b) => bends.has(b)), "integral gasket bends");
  orbitTerminates(duals, { x: 0, y: 0, r: 0.7 }, "integral gasket orbit");
}

/* ---------- 2. Ring with enclosing circle, tangent ---------- */
for (let n = 3; n <= 8; n++) {
  const cs = P.ringCircles({ n, tight: 1, rot: 0.3, outer: true });
  const duals = P.faceDuals(cs, P.ringFaces(n, true));
  ok(duals.length === n + 1, `ring n=${n}: ${duals.length} duals`);
  /* every dual must be orthogonal to all circles of its face */
  const V = cs.map(P.circVec), F = P.ringFaces(n, true);
  let worst = 0;
  F.forEach((f, k) => f.forEach((i) => { worst = Math.max(worst, Math.abs(P.ip2(duals[k], V[i]))); }));
  ok(worst < 1e-9, `ring n=${n}: dual orthogonality ${worst.toExponential(1)}`);
  checkPacking(explicitPacking(cs, duals, 5), 1e-6, `ring n=${n} packing`);
  orbitTerminates(duals, { x: 0, y: 0, r: 0.75 }, `ring n=${n} orbit`);
}
/* ---------- 3. Steiner chains ---------- */
for (let n = 3; n <= 8; n++) {
  for (const ecc of [0, 0.45, 0.8]) {
    const cs = P.steinerCircles({ n, ecc, dir: 0.7, rot: 0.2, tight: 1 });
    ok(cs.length === n + 2, `steiner n=${n}: ${cs.length} circles`);
    const O = cs[n + 1], In = cs[n];
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const a = cs[i], b = cs[(i + 1) % n];
      worst = Math.max(worst, Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r)));
      worst = Math.max(worst, Math.abs(Math.hypot(a.x - In.x, a.y - In.y) - (a.r + In.r)));
      worst = Math.max(worst, Math.abs(Math.hypot(a.x - O.x, a.y - O.y) - (O.r - a.r)));
    }
    ok(worst < 1e-9, `steiner n=${n} ecc=${ecc}: tangency ${worst.toExponential(1)}`);
    const duals = P.faceDuals(cs, P.steinerFaces(n));
    ok(duals.length === 2 * n, `steiner n=${n}: ${duals.length} duals`);
    checkPacking(explicitPacking(cs, duals, 4), 1e-6, `steiner n=${n} ecc=${ecc} packing`);
    orbitTerminates(duals, { x: 0, y: 0, r: 0.62 }, `steiner n=${n} ecc=${ecc} orbit`);
  }
}

/* ---------- 4. recipes ---------- */
{
  const near = (z, w, t = 1e-8) => Math.hypot(z[0] - w[0], z[1] - w[1]) < t;
  for (const [ta, tb] of [[[2, 0], [2, 0]], [[1.87, 0.1], [1.87, -0.1]], [[1.91, 0.05], [3, 0]], [[2, 0.2], [2.2, 0]]]) {
    const g = R.grandma(ta, tb);
    ok(near(mtrace(g.a), ta) && near(mtrace(g.b), tb), `grandma traces ${ta} ${tb}`);
    ok(near(R.commutatorTrace(g), [-2, 0], 1e-7), `grandma commutator -2 (${R.commutatorTrace(g).map((x) => x.toFixed(6))})`);
    const j = R.jorgensen(ta, tb);
    ok(near(mtrace(j.a), ta) && near(mtrace(j.b), tb), `jorgensen traces ${ta} ${tb}`);
    ok(near(R.commutatorTrace(j), [-2, 0], 1e-7), `jorgensen commutator -2 (${R.commutatorTrace(j).map((x) => x.toFixed(6))})`);
  }
  const m = R.maskit([0.1, 1.95]);
  ok(near(R.commutatorTrace(m), [-2, 0], 1e-9), "maskit commutator -2");
  ok(near(mapply(m.a, [0.3, 0.4]), [0.1 + 0.3 / 0.25, 1.95 - 0.4 / 0.25], 1e-12), "maskit a(z) = mu + 1/z");
}

/* ---------- 5. DFS limit set invariance ---------- */
function gridIndex(pts, h) {
  const m = new Map();
  for (const p of pts) {
    const k = Math.floor(p[0] / h) + "," + Math.floor(p[1] / h);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return {
    near(q) {
      let best = Infinity;
      const gx = Math.floor(q[0] / h), gy = Math.floor(q[1] / h);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const L = m.get(gx + i + "," + (gy + j));
        if (L) for (const p of L) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
      }
      return best;
    },
  };
}
function dfsPoints(g, view, eps) {
  const r = limitSet(g, view, { eps, maxDepth: 200, maxSegs: 400000 });
  const pts = [];
  for (let k = 0; k < r.data.length; k += 4) pts.push([r.data[k] + r.cx, r.data[k + 1] + r.cy]);
  return { pts, r };
}
for (const [name, g, view] of [
  ["grandma(2,2)", R.grandma([2, 0], [2, 0]), { x0: -3, x1: 3, y0: -3, y1: 3 }],
  ["grandma(1.91+.05i,3)", R.grandma([1.91, 0.05], [3, 0]), { x0: -3, x1: 3, y0: -3, y1: 3 }],
  ["maskit(2i)", R.maskit([0, 2]), { x0: -1, x1: 1, y0: -0.2, y1: 2.2 }],
  ["maskit(.1+1.95i)", R.maskit([0.1, 1.95]), { x0: -1, x1: 1, y0: -0.2, y1: 2.2 }],
  ["jorgensen(2,2.4)", R.jorgensen([2, 0], [2.4, 0]), { x0: -3, x1: 3, y0: -3, y1: 3 }],
]) {
  const eps = 0.004;
  const { pts, r } = dfsPoints(g, view, eps);
  ok(pts.length > 2000, `${name}: ${r.segs} segments, ${r.nodes} nodes`);
  const idx = gridIndex(pts, 0.02);
  const gens = [g.a, g.b, minv(g.a), minv(g.b)];
  let tested = 0, bad = 0;
  for (let k = 0; k < pts.length; k += Math.max(1, (pts.length / 500) | 0)) {
    for (const G of gens) {
      const q = mapply(G, pts[k]);
      if (!(q[0] > view.x0 + 0.05 && q[0] < view.x1 - 0.05 && q[1] > view.y0 + 0.05 && q[1] < view.y1 - 0.05)) continue;
      tested++;
      if (idx.near(q) > 6 * eps) bad++;
    }
  }
  ok(tested > 200 && bad / tested < 0.02, `${name}: invariance ${bad}/${tested} images off the set`);
  if (name.startsWith("maskit")) {
    const out = pts.filter((p) => p[1] < -1e-3 || p[1] > (name.includes("2i") ? 2 : 1.95) + 1e-3).length;
    ok(out === 0, `${name}: limit set inside strip (${out} outside)`);
  }
}

/* ---------- 6. Maskit escape-time port vs DFS ---------- */
/* Mirror of the GLSL orbit in shaders/plane.js (FORM 2). */
function maskitEscape(z, mu, maxIter) {
  let x = z[0], y = z[1], logJ = 0, px = 1e9, py = 1e9, ppx = 1e9, ppy = 1e9;
  const sh = mu[0] / mu[1];
  for (let i = 0; i < maxIter; i++) {
    let u = x - sh * y;
    u -= 2 * Math.floor((u + 1) / 2);
    x = u + sh * y;
    if (y < 0 || y > mu[1]) return { escaped: true, steps: i, de: Math.min(Math.abs(y), Math.abs(y - mu[1])) * Math.exp(logJ) };
    if (y > mu[1] * 0.5) { x = mu[0] - x; y = mu[1] - y; }
    const r2 = x * x + y * y;
    x = x / r2 + mu[0]; y = -y / r2 + mu[1];
    logJ += Math.log(r2);
    if ((x - ppx) ** 2 + (y - ppy) ** 2 < 1e-10) {
      const d0 = Math.abs(Math.hypot(x, y) - 1), d1 = Math.abs(Math.hypot(x - mu[0], y - mu[1]) - 1);
      return { escaped: true, steps: i, de: Math.min(d0, d1, y, mu[1] - y) * Math.exp(logJ) };
    }
    ppx = px; ppy = py; px = x; py = y;
  }
  return { escaped: false, steps: maxIter, de: 0 };
}
for (const mu of [[0, 2], [0.1, 1.95], [0.3, 1.9]]) {
  const view = { x0: -1, x1: 1, y0: -0.1, y1: mu[1] + 0.1 };
  const { pts } = dfsPoints(R.maskit(mu), view, 0.002);
  const idx = gridIndex(pts, 0.05);
  let far = 0, farEsc = 0, over = 0, nTest = 0;
  for (let i = 0; i < 4000; i++) {
    const q = [view.x0 + rnd() * (view.x1 - view.x0), view.y0 + rnd() * (view.y1 - view.y0)];
    const d = idx.near(q);
    const e = maskitEscape(q, mu, 300);
    if (d > 0.04) { far++; if (e.escaped) farEsc++; }
    if (e.escaped && d < 0.045) { nTest++; if (e.de > 1.5 * d + 0.004) over++; }
  }
  let near = 0, nearSmall = 0;
  for (let k = 0; k < pts.length; k += 37) {
    near++;
    const e = maskitEscape(pts[k], mu, 300);
    if (e.de < 0.01) nearSmall++;
  }
  ok(farEsc / far > 0.99, `maskit escape mu=${mu}: far points escape ${(farEsc / far * 100).toFixed(1)}%`);
  ok(nearSmall / near > 0.97, `maskit escape mu=${mu}: limit points have DE<0.01 ${(nearSmall / near * 100).toFixed(1)}%`);
  ok(over / nTest < 0.03, `maskit escape mu=${mu}: DE overestimates ${over}/${nTest}`);
}

/* ---------- 7. Schottky ---------- */
for (const tight of [0.6, 0.9, 0.99]) {
  const cfg = schottkyRing({ pairs: 2, tight, rot: 0 });
  let esc = 0;
  for (let i = 0; i < 400; i++) if (schottkyOrbit(cfg, 0.4, [rnd() * 1.6 - 0.8, rnd() * 1.6 - 0.8], 600).escaped) esc++;
  ok(esc / 400 > 0.98, `schottky tight=${tight} termination ${(esc / 4).toFixed(1)}%`);
}
/* the map really pairs the circles: boundary of A goes to boundary of B */
{
  const cfg = schottkyRing({ pairs: 3, tight: 0.8, rot: 0.1 });
  const A = cfg.circles[0], B = cfg.circles[3], tw = 0.7, u = [Math.cos(tw), Math.sin(tw)];
  let worst = 0;
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2, zx = A.x + A.r * Math.cos(t), zy = A.y + A.r * Math.sin(t);
    const dx = zx - A.x, dy = zy - A.y, m = dx * dx + dy * dy;
    const gx = B.x + A.r * B.r * (u[0] * dx + u[1] * dy) / m, gy = B.y + A.r * B.r * (u[1] * dx - u[0] * dy) / m;
    worst = Math.max(worst, Math.abs(Math.hypot(gx - B.x, gy - B.y) - B.r));
  }
  ok(worst < 1e-12, "schottky g maps circle A onto circle B");
}

/* ---------- 8. 3D packing ---------- */
{
  const g = S3.build3Dfrom(S3.TETRA, 1);
  ok(S3.tangencyGap(g) < 1e-9, "3D regular tetra mutually tangent");
  const k = g.map((s) => (s.inside ? 1 : -1) / s.r);
  const s1 = k.reduce((a, b) => a + b, 0), s2 = k.reduce((a, b) => a + b * b, 0);
  ok(Math.abs(s1 * s1 - 3 * s2) / s2 < 1e-9, "3D Descartes (sum k)^2 = 3 sum k^2");
  const h = S3.health3D(S3.TETRA, 1, rnd);
  ok(h && h.esc > 0.98, `3D orbit health esc=${h && h.esc}`);
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
