/* 3D Apollonian sphere packing: four seed spheres at a tetrahedron's
   vertices plus their enclosing sphere (a Descartes configuration, n+2
   spheres in n dimensions). The orbit reflects in the DUAL spheres -- D_i
   orthogonal to every seed but the i-th -- and measures distance to the
   seeds; that is what fills the gaps instead of nesting inside the seeds.

   Sphere vectors: f(p) = a|p|^2 + b px + c py + e pz + d stored as
   [a, b, c, e, d], normalised b^2+c^2+e^2-4ad = 1. */

export const TETRA = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => v.map((x) => x * Math.SQRT1_2));

export function solveLin(M, b) {
  const n = b.length;
  const A = M.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let pv = c;
    for (let k = c; k < n; k++) if (Math.abs(A[k][c]) > Math.abs(A[pv][c])) pv = k;
    if (Math.abs(A[pv][c]) < 1e-13) return null;
    [A[c], A[pv]] = [A[pv], A[c]];
    for (let k = 0; k < n; k++) if (k !== c) {
      const f = A[k][c] / A[c][c];
      for (let j = c; j <= n; j++) A[k][j] -= f * A[c][j];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

/* Mutual tangency is six constraints on four radii; least squares. */
export function fitRadii(V) {
  const N = V.length, ATA = [], ATb = [];
  for (let i = 0; i < N; i++) { ATA.push([0, 0, 0, 0]); ATb.push(0); }
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const d = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]);
    ATA[i][i] += 1; ATA[j][j] += 1; ATA[i][j] += 1; ATA[j][i] += 1;
    ATb[i] += d; ATb[j] += d;
  }
  const r = solveLin(ATA, ATb);
  if (!r) return null;
  for (const x of r) if (!(x > 1e-3) || !isFinite(x)) return null;
  return r;
}

/* enclosing sphere internally tangent to all four: |C - c_i| = R - r_i */
export function enclosing(V, r) {
  const rows = [], rhs = [], col = [];
  const d0 = V[0][0] ** 2 + V[0][1] ** 2 + V[0][2] ** 2;
  for (let i = 1; i < 4; i++) {
    rows.push([2 * (V[i][0] - V[0][0]), 2 * (V[i][1] - V[0][1]), 2 * (V[i][2] - V[0][2])]);
    col.push(-2 * (r[i] - r[0]));
    rhs.push(V[i][0] ** 2 + V[i][1] ** 2 + V[i][2] ** 2 - d0 - r[i] * r[i] + r[0] * r[0]);
  }
  const C0 = solveLin(rows.map((q) => q.slice()), rhs);
  const Cd = solveLin(rows.map((q) => q.slice()), col);
  if (!C0 || !Cd) return null;
  const u = [C0[0] - V[0][0], C0[1] - V[0][1], C0[2] - V[0][2]];
  const dd = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const A = dd(Cd, Cd) - 1, B = 2 * dd(u, Cd) + 2 * r[0], Cq = dd(u, u) - r[0] * r[0];
  const rmax = Math.max(...r);
  let R;
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) < 1e-12) return null;
    R = -Cq / B;
  } else {
    const disc = B * B - 4 * A * Cq;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc), R1 = (-B + sq) / (2 * A), R2 = (-B - sq) / (2 * A);
    let best = Infinity;
    if (R1 > rmax * 1.001) best = Math.min(best, R1);
    if (R2 > rmax * 1.001) best = Math.min(best, R2);
    if (!isFinite(best)) return null;
    R = best;
  }
  if (!isFinite(R) || R <= 0) return null;
  return { c: [C0[0] + R * Cd[0], C0[1] + R * Cd[1], C0[2] + R * Cd[2]], r: R };
}

export function build3Dfrom(V, srad) {
  const fit = fitRadii(V);
  if (!fit) return null;
  const r = fit.map((x) => x * srad);
  const E = enclosing(V, r);
  if (!E) return null;
  const out = [];
  for (let i = 0; i < 4; i++) out.push({ c: V[i].slice(), r: r[i], inside: true });
  out.push({ c: E.c, r: E.r, inside: false });
  return out;
}

export function vecOf(sp) {
  const r = sp.r, sg = sp.inside ? 1 : -1, C = sp.c;
  const q = C[0] * C[0] + C[1] * C[1] + C[2] * C[2];
  return [(1 / (2 * r)) * sg, (-C[0] / r) * sg, (-C[1] / r) * sg, (-C[2] / r) * sg, ((q - r * r) / (2 * r)) * sg];
}

export function dualsOf(V) {
  const n = V.length, out = [];
  for (let i = 0; i < n; i++) {
    const rows = [];
    for (let j = 0; j < n; j++) if (j !== i) rows.push(V[j]);
    /* <w, row> = 0 with <v,w> = b.b + c.c + e.e - 2(a_v d_w + a_w d_v);
       unknown order (b, c, e, a, d) */
    const A = rows.map((t) => [t[1], t[2], t[3], -2 * t[4], -2 * t[0]]);
    const piv = [];
    for (let c = 0, r = 0; c < 5 && r < A.length; c++) {
      let b = r;
      for (let k = r; k < A.length; k++) if (Math.abs(A[k][c]) > Math.abs(A[b][c])) b = k;
      if (Math.abs(A[b][c]) < 1e-12) continue;
      [A[r], A[b]] = [A[b], A[r]];
      for (let k = 0; k < A.length; k++) if (k !== r) {
        const f = A[k][c] / A[r][c];
        for (let cc = 0; cc < 5; cc++) A[k][cc] -= f * A[r][cc];
      }
      piv.push(c); r++;
    }
    let free = -1;
    for (let c = 0; c < 5; c++) if (piv.indexOf(c) < 0) { free = c; break; }
    if (free < 0) { out.push(null); continue; }
    const x = [0, 0, 0, 0, 0];
    x[free] = 1;
    for (let r = piv.length - 1; r >= 0; r--) {
      const c = piv[r];
      let sm = 0;
      for (let c2 = 0; c2 < 5; c2++) if (c2 !== c) sm += A[r][c2] * x[c2];
      x[c] = -sm / A[r][c];
    }
    let w = [x[3], x[0], x[1], x[2], x[4]];
    const q = w[1] * w[1] + w[2] * w[2] + w[3] * w[3] - 4 * w[0] * w[4];
    if (!(q > 1e-12)) { out.push(null); continue; }
    const nn = Math.sqrt(q);
    w = w.map((v) => v / nn);
    out.push(w[0] > 0 ? w : w.map((v) => -v));
  }
  return out;
}

/* Orbits must terminate: a non-discrete group runs away and never lands
   in a fundamental domain. Sampled check before accepting a drag. */
export function health3D(V, srad, rand = Math.random) {
  const g = build3Dfrom(V, srad);
  if (!g) return null;
  const D = dualsOf(g.map(vecOf));
  for (const d of D) if (!d) return null;
  const E = g[g.length - 1];
  let esc = 0, sum = 0;
  const N = 120, CAP = 140;
  for (let i = 0; i < N; i++) {
    let p = [0, 1, 2].map((k) => E.c[k] + (rand() * 2 - 1) * E.r * 0.75);
    let steps = 0, done = false;
    for (let it = 0; it < CAP; it++) {
      let moved = false;
      for (const d of D) {
        const f = d[0] * (p[0] ** 2 + p[1] ** 2 + p[2] ** 2) + d[1] * p[0] + d[2] * p[1] + d[3] * p[2] + d[4];
        if (f < 0) {
          const den = Math.max(4 * d[0] * f + 1, 1e-20);
          p = [(p[0] - 2 * f * d[1]) / den, (p[1] - 2 * f * d[2]) / den, (p[2] - 2 * f * d[3]) / den];
          steps++; moved = true;
          if (!(Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) < 1e12)) { moved = false; break; }
        }
      }
      if (!moved) { done = true; break; }
    }
    if (done) { esc++; sum += steps; }
  }
  return { esc: esc / N, mean: esc ? sum / esc : 0 };
}
export function valid3D(V, srad) {
  const h = health3D(V, srad);
  return !!h && h.esc > 0.98 && h.mean < 60;
}

export function tangencyGap(g) {
  let gap = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = g[i], b = g[j];
    gap = Math.max(gap, Math.abs(Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]) - (a.r + b.r)));
  }
  return gap;
}
