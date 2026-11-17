/* Complex numbers as [re, im] and Moebius maps as 2x2 complex matrices
   [[a, b], [c, d]] stored flat as [a, b, c, d] (each a complex pair).
   Everything here runs in JS doubles. */

export const C = (re, im = 0) => [re, im];
export const cadd = (u, v) => [u[0] + v[0], u[1] + v[1]];
export const csub = (u, v) => [u[0] - v[0], u[1] - v[1]];
export const cmul = (u, v) => [u[0] * v[0] - u[1] * v[1], u[0] * v[1] + u[1] * v[0]];
export const cscale = (u, s) => [u[0] * s, u[1] * s];
export const cabs = (u) => Math.hypot(u[0], u[1]);
export const cabs2 = (u) => u[0] * u[0] + u[1] * u[1];
export const cconj = (u) => [u[0], -u[1]];
export function cdiv(u, v) {
  const m = v[0] * v[0] + v[1] * v[1];
  return [(u[0] * v[0] + u[1] * v[1]) / m, (u[1] * v[0] - u[0] * v[1]) / m];
}
export function csqrt(u) {
  const m = Math.hypot(u[0], u[1]);
  const re = Math.sqrt(Math.max((m + u[0]) * 0.5, 0));
  let im = Math.sqrt(Math.max((m - u[0]) * 0.5, 0));
  if (u[1] < 0) im = -im;
  return [re, im];
}
export const I = [0, 1];

/* ---------- Moebius matrices ---------- */
export const M = (a, b, c, d) => [a, b, c, d];
export function mmul(P, Q) {
  return [
    cadd(cmul(P[0], Q[0]), cmul(P[1], Q[2])),
    cadd(cmul(P[0], Q[1]), cmul(P[1], Q[3])),
    cadd(cmul(P[2], Q[0]), cmul(P[3], Q[2])),
    cadd(cmul(P[2], Q[1]), cmul(P[3], Q[3])),
  ];
}
export const mdet = (P) => csub(cmul(P[0], P[3]), cmul(P[1], P[2]));
export const mtrace = (P) => cadd(P[0], P[3]);
/* inverse of a determinant-one matrix */
export const minv = (P) => [P[3], cscale(P[1], -1), cscale(P[2], -1), P[0]];
export function mnormalize(P) {
  const s = csqrt(mdet(P));
  return P.map((e) => cdiv(e, s));
}
/* apply to a homogeneous point [u, v] meaning u/v */
export const mapplyH = (P, h) => [cadd(cmul(P[0], h[0]), cmul(P[1], h[1])), cadd(cmul(P[2], h[0]), cmul(P[3], h[1]))];
export function hToC(h) {
  const m = cabs2(h[1]);
  if (m < 1e-300) return [Infinity, Infinity];
  return cdiv(h[0], h[1]);
}
/* Attracting fixed point of a Moebius map, as a homogeneous vector: the
   eigenvector of the eigenvalue of larger modulus. For a parabolic map the
   two coincide and either root is the fixed point. */
export function fixH(P) {
  const tr = mtrace(P);
  const disc = csqrt(csub(cmul(tr, tr), [4, 0]));
  const l1 = cscale(cadd(tr, disc), 0.5), l2 = cscale(csub(tr, disc), 0.5);
  const lam = cabs(l1) >= cabs(l2) ? l1 : l2;
  /* (P - lam I) x = 0 -> x = [b, lam - a] or [lam - d, c]; choose the
     better conditioned of the two */
  const v1 = [P[1], csub(lam, P[0])];
  const v2 = [csub(lam, P[3]), P[2]];
  const n1 = cabs2(v1[0]) + cabs2(v1[1]), n2 = cabs2(v2[0]) + cabs2(v2[1]);
  if (n1 < 1e-30 && n2 < 1e-30) return [[1, 0], [0, 0]]; /* identity-ish */
  return n1 >= n2 ? v1 : v2;
}
export const mapply = (P, z) => hToC(mapplyH(P, [z, [1, 0]]));
