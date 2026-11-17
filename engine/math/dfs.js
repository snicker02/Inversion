/* Limit set of a two-generator Kleinian group by depth-first search over
   reduced words (Indra's Pearls, ch. 7). Generators are a, b, A, B with
   inverses two apart. A node is a word W ending in letter i; its part of
   the limit set runs from W(fix bABa-type word) through W(fix g_i) to
   W(fix BAba-type word). When those three images are within eps the
   piece is drawn as two short segments and the branch stops.

   Output is a Float32Array of line-segment vertices (x, y, depth, letter),
   rebased to the view centre so float32 holds pixel accuracy. */
import { mmul, minv, fixH, mapplyH, hToC, cabs } from "./complex.js";

const WORDS = [
  ["bABa", "a", "BAba"],
  ["ABab", "b", "aBAb"],
  ["BabA", "A", "baBA"],
  ["abAB", "B", "AbaB"],
];
const IDX = { a: 0, b: 1, A: 2, B: 3 };

export function limitSet(g, view, opt) {
  const gens = [g.a, g.b, minv(g.a), minv(g.b)];
  const fix = WORDS.map((row) =>
    row.map((w) => {
      let P = gens[IDX[w[0]]];
      for (let k = 1; k < w.length; k++) P = mmul(P, gens[IDX[w[k]]]);
      return fixH(P);
    })
  );
  const eps = opt.eps, eps2 = eps * eps, maxDepth = opt.maxDepth | 0, maxSegs = opt.maxSegs | 0;
  const cx = (view.x0 + view.x1) * 0.5, cy = (view.y0 + view.y1) * 0.5;
  const halfW = (view.x1 - view.x0) * 0.5, halfH = (view.y1 - view.y0) * 0.5;
  const CULL = opt.cull ?? 3;
  let cap = Math.min(maxSegs, 1 << 16) * 8;
  let buf = new Float32Array(cap), n = 0, segs = 0, nodes = 0, truncated = false;
  const maxNodes = opt.maxNodes || 6e6;

  function push(x, y, d, l) {
    if (n + 4 > cap) {
      cap *= 2;
      const nb = new Float32Array(cap);
      nb.set(buf);
      buf = nb;
    }
    buf[n++] = x - cx; buf[n++] = y - cy; buf[n++] = d; buf[n++] = l;
  }
  function seg(p, q, d, l) {
    if (segs >= maxSegs) { truncated = true; return; }
    push(p[0], p[1], d, l); push(q[0], q[1], d, l); segs++;
  }

  function explore(W, i, depth) {
    if (segs >= maxSegs || nodes >= maxNodes) { truncated = true; return; }
    nodes++;
    const F = fix[i];
    const p0 = hToC(mapplyH(W, F[0])), p1 = hToC(mapplyH(W, F[1])), p2 = hToC(mapplyH(W, F[2]));
    const fin = isFinite(p0[0]) && isFinite(p1[0]) && isFinite(p2[0]) &&
      isFinite(p0[1]) && isFinite(p1[1]) && isFinite(p2[1]);
    if (fin) {
      const d01 = (p0[0] - p1[0]) ** 2 + (p0[1] - p1[1]) ** 2;
      const d12 = (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2;
      if (d01 < eps2 && d12 < eps2) { seg(p0, p1, depth, i); seg(p1, p2, depth, i); return; }
      /* view culling: an extent-padded box around the three samples */
      const mnx = Math.min(p0[0], p1[0], p2[0]), mxx = Math.max(p0[0], p1[0], p2[0]);
      const mny = Math.min(p0[1], p1[1], p2[1]), mxy = Math.max(p0[1], p1[1], p2[1]);
      const ext = Math.max(mxx - mnx, mxy - mny) * CULL + eps;
      if (mxx + ext < cx - halfW || mnx - ext > cx + halfW || mxy + ext < cy - halfH || mny - ext > cy + halfH) return;
    }
    if (depth >= maxDepth) {
      if (fin) { seg(p0, p1, depth, i); seg(p1, p2, depth, i); }
      return;
    }
    const kids = [(i + 1) & 3, i, (i + 3) & 3];
    for (let k = 0; k < 3; k++) explore(mmul(W, gens[kids[k]]), kids[k], depth + 1);
  }
  for (let i = 0; i < 4; i++) explore(gens[i], i, 1);
  return { data: buf.subarray(0, n), segs, nodes, truncated, cx, cy };
}

/* Fit box of a coarse pass, used by "fit view". */
export function limitBounds(g) {
  const v = { x0: -1e6, x1: 1e6, y0: -1e6, y1: 1e6 };
  const r = limitSet(g, v, { eps: 0.02, maxDepth: 18, maxSegs: 40000, cull: 1e9 });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const d = r.data;
  for (let k = 0; k < d.length; k += 4) {
    const x = d[k] + r.cx, y = d[k + 1] + r.cy;
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 50 || Math.abs(y) > 50) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!isFinite(x0)) return { x: 0, y: 0, s: 1.5 };
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: Math.max(x1 - x0, y1 - y0) * 0.56 + 1e-3 };
}
export { cabs };
