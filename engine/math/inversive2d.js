/* Plane inversive geometry.

   A generalised circle is an inversive vector v = (a, b, c, d) with
   f(p) = a|p|^2 + b px + c py + d, normalised so b^2 + c^2 - 4ad = 1.
   f < 0 marks the side that gets reflected away. A real circle has
   radius 1/(2|a|); a = 0 is a line. The Lorentz form
     <v, w> = b b' + c c' - 2(a d' + a' d)
   is 0 exactly when two circles meet at right angles, which is what the
   dual (gap-filling) construction is built from. */

export const TAU = Math.PI * 2;

/* ---------- vectors ---------- */
export function circVec(c) {
  const a = 1 / (2 * c.r), sg = c.inside === false ? -1 : 1;
  return [a * sg, (-c.x / c.r) * sg, (-c.y / c.r) * sg, ((c.x * c.x + c.y * c.y - c.r * c.r) / (2 * c.r)) * sg];
}
export const ip2 = (v, w) => v[1] * w[1] + v[2] * w[2] - 2 * (v[0] * w[3] + w[0] * v[3]);
export const Q2 = (v) => v[1] * v[1] + v[2] * v[2] - 4 * v[0] * v[3];
export const fEval = (v, x, y) => v[0] * (x * x + y * y) + v[1] * x + v[2] * y + v[3];

/* vector -> geometry. Circles come back as {t:0,x,y,r,inside}; lines as
   {t:1, nx, ny, px, py} with f = n.(p - p0), reflect side f < 0. */
export function vecToGen(v) {
  const a = v[0];
  if (Math.abs(a) > 1e-12) {
    const x = -v[1] / (2 * a), y = -v[2] / (2 * a), r = 1 / (2 * Math.abs(a));
    return { t: 0, x, y, r, inside: a > 0 };
  }
  const n = Math.hypot(v[1], v[2]) || 1, nx = v[1] / n, ny = v[2] / n, d = v[3] / n;
  return { t: 1, nx, ny, px: -d * nx, py: -d * ny };
}

/* Nullspace of the Lorentz-orthogonality conditions: the circle meeting
   every row at right angles. Three rows give a unique answer. */
export function orthoTo(rows) {
  const A = rows.map((t) => [t[1], t[2], -2 * t[3], -2 * t[0]]); // unknowns (b,c,a,d)
  const piv = [];
  for (let c = 0; c < 4; c++) {
    const r = piv.length;
    if (r >= A.length) break;
    let b = r;
    for (let k = r; k < A.length; k++) if (Math.abs(A[k][c]) > Math.abs(A[b][c])) b = k;
    if (Math.abs(A[b][c]) < 1e-12) continue;
    [A[r], A[b]] = [A[b], A[r]];
    for (let k = 0; k < A.length; k++) if (k !== r) {
      const f = A[k][c] / A[r][c];
      for (let cc = 0; cc < 4; cc++) A[k][cc] -= f * A[r][cc];
    }
    piv.push(c);
  }
  let free = -1;
  for (let c = 0; c < 4; c++) if (piv.indexOf(c) < 0) { free = c; break; }
  if (free < 0) return null;
  const x = [0, 0, 0, 0];
  x[free] = 1;
  for (let rr = piv.length - 1; rr >= 0; rr--) {
    const c = piv[rr];
    let sm = 0;
    for (let c2 = 0; c2 < 4; c2++) if (c2 !== c) sm += A[rr][c2] * x[c2];
    x[c] = -sm / A[rr][c];
  }
  let w = [x[2], x[0], x[1], x[3]];
  const q = Q2(w);
  if (!(q > 1e-12)) return null; /* imaginary: the face's circles overlap */
  const nn = Math.sqrt(q);
  return w.map((e) => e / nn);
}

/* A point inside the interstice bounded by a face's circles: the mean of
   the closest-approach points of each adjacent pair. Used only to pick
   which side of the dual gets reflected. */
function contactPoint(A, B) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-12;
  const ux = dx / d, uy = dy / d;
  if (A.inside === false) return { x: A.x + ux * A.r, y: A.y + uy * A.r }; // A encloses B
  if (B.inside === false) return { x: B.x - ux * B.r, y: B.y - uy * B.r };
  const t = (A.r + (d - A.r - B.r) * 0.5);
  return { x: A.x + ux * t, y: A.y + uy * t };
}
export function faceDuals(circles, faces) {
  const V = circles.map(circVec);
  const out = [];
  for (const f of faces) {
    const w = orthoTo(f.slice(0, 3).map((i) => V[i]));
    if (!w) continue;
    /* Orientation: the interstice must be on the reflected side (f < 0).
       Every inner seed's centre lies outside the dual's disk -- a face
       circle because it is orthogonal to the dual, any other circle because
       the dual's disk only meets the face circles. When the dual is a line
       the face centres sit on it, and the other centres decide. */
    let score = 0, scale = 0;
    circles.forEach((c) => {
      if (c.inside === false) return;
      const v = fEval(w, c.x, c.y);
      score += v; scale += Math.abs(v);
    });
    let px = 0, py = 0;
    for (let k = 0; k < f.length; k++) {
      const p = contactPoint(circles[f[k]], circles[f[(k + 1) % f.length]]);
      px += p.x; py += p.y;
    }
    const fc = fEval(w, px / f.length, py / f.length);
    if (scale < 1e-12) score = -fc; /* no inner circles: fall back */
    out.push(score >= 0 ? w : w.map((e) => -e));
  }
  return out;
}

/* ---------- constructions ---------- */

/* Three mutually tangent circles at a triangle's vertices, plus the outer
   Soddy circle from the complex Descartes theorem. */
export function apollonian(tri) {
  const [A, B, Cc] = tri;
  const a = Math.hypot(B.x - Cc.x, B.y - Cc.y), b = Math.hypot(A.x - Cc.x, A.y - Cc.y), c = Math.hypot(A.x - B.x, A.y - B.y);
  const rA = (b + c - a) * 0.5, rB = (a + c - b) * 0.5, rC = (a + b - c) * 0.5;
  if (!(rA > 1e-5 && rB > 1e-5 && rC > 1e-5)) return null;
  const z = [A, B, Cc], r = [rA, rB, rC], k = [1 / rA, 1 / rB, 1 / rC];
  const k4 = k[0] + k[1] + k[2] - 2 * Math.sqrt(k[0] * k[1] + k[1] * k[2] + k[2] * k[0]);
  if (!(k4 < -1e-9)) return null;
  const r4 = -1 / k4;
  let sx = 0, sy = 0, rx = 0, ry = 0;
  for (let i = 0; i < 3; i++) { sx += z[i].x * k[i]; sy += z[i].y * k[i]; }
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, tx = z[i].x * z[j].x - z[i].y * z[j].y, ty = z[i].x * z[j].y + z[i].y * z[j].x;
    rx += k[i] * k[j] * tx; ry += k[i] * k[j] * ty;
  }
  const m = Math.hypot(rx, ry);
  const qx = Math.sqrt(Math.max((m + rx) * 0.5, 0));
  let qy = Math.sqrt(Math.max((m - rx) * 0.5, 0));
  if (ry < 0) qy = -qy;
  let best = null, bestErr = Infinity;
  for (const sg of [-1, 1]) {
    const cx = (sx + 2 * sg * qx) / k4, cy = (sy + 2 * sg * qy) / k4;
    let e = 0;
    for (let n = 0; n < 3; n++) e += Math.abs(Math.hypot(cx - z[n].x, cy - z[n].y) - (r4 - r[n]));
    if (e < bestErr) { bestErr = e; best = { x: cx, y: cy }; }
  }
  return {
    circles: [
      { x: A.x, y: A.y, r: rA, inside: true },
      { x: B.x, y: B.y, r: rB, inside: true },
      { x: Cc.x, y: Cc.y, r: rC, inside: true },
      { x: best.x, y: best.y, r: r4, inside: false },
    ],
    err: bestErr,
  };
}
export const APOLLO_FACES = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]];

export function ringCircles(p) {
  const n = p.n, R = 0.62, r = R * Math.sin(Math.PI / n) * p.tight, out = [];
  for (let i = 0; i < n; i++) {
    const th = p.rot + (i * TAU) / n;
    out.push({ x: R * Math.cos(th), y: R * Math.sin(th), r, inside: true });
  }
  if (p.outer) out.push({ x: 0, y: 0, r: R + r, inside: false });
  return out;
}
export function ringFaces(n, outer) {
  if (!outer) return null;
  const f = [];
  for (let i = 0; i < n; i++) f.push([n, i, (i + 1) % n]);
  const centre = [];
  for (let i = 0; i < n; i++) centre.push(i);
  f.push(centre);
  return f;
}

/* Steiner chain: build the concentric chain (n circles between the unit
   circle and an inner circle of radius rho, rho fixed by closure), then
   push it through the disk automorphism z -> (z - w)/(1 - conj(w) z),
   which keeps the unit circle and makes the pair eccentric. */
function mobDisk(z, w) {
  const nx = z.x - w.x, ny = z.y - w.y;
  const dx = 1 - (w.x * z.x + w.y * z.y), dy = -(w.x * z.y - w.y * z.x);
  const m = dx * dx + dy * dy;
  return { x: (nx * dx + ny * dy) / m, y: (ny * dx - nx * dy) / m };
}
export function circumcircle(p, q, s) {
  const ax = p.x, ay = p.y, bx = q.x, by = q.y, cx = s.x, cy = s.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-14) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
}
function mapCircle(c, w) {
  const pts = [0, 1, 2].map((k) => {
    const t = (k * TAU) / 3 + 0.3;
    return mobDisk({ x: c.x + c.r * Math.cos(t), y: c.y + c.r * Math.sin(t) }, w);
  });
  return circumcircle(pts[0], pts[1], pts[2]);
}
export function steinerCircles(p) {
  const n = p.n, s = Math.sin(Math.PI / n);
  const rho = (1 - s) / (1 + s), Rm = (1 + rho) / 2, rc = (1 - rho) / 2;
  const e = Math.min(0.92, Math.max(0, p.ecc));
  const w = { x: e * Math.cos(p.dir), y: e * Math.sin(p.dir) };
  const S = 0.9; /* overall scale */
  const out = [];
  const add = (c, inside) => {
    const m = mapCircle(c, w);
    if (m) out.push({ x: m.x * S, y: m.y * S, r: m.r * S, inside });
  };
  for (let i = 0; i < n; i++) {
    const th = p.rot + (i * TAU) / n;
    add({ x: Rm * Math.cos(th), y: Rm * Math.sin(th), r: rc * p.tight }, true);
  }
  add({ x: 0, y: 0, r: rho }, true);
  out.push({ x: 0, y: 0, r: S, inside: false }); /* unit circle maps to itself */
  return out;
}
export function steinerFaces(n) {
  const f = [], inner = n, outer = n + 1;
  for (let i = 0; i < n; i++) {
    f.push([outer, i, (i + 1) % n]);
    f.push([inner, i, (i + 1) % n]);
  }
  return f;
}

/* ---------- packing into the shader's view frame ----------
   World point X = cam + s*p. Coefficients stay O(1) at any zoom because
   the camera is folded in here, in doubles. Each value is split into a
   float32 head and its residual for the emulated-double path. */
export function packGen(g, cam, hi, lo, o) {
  let a, b, c, d, sg;
  if (g.t === 1) {
    const f0 = g.nx * (cam.x - g.px) + g.ny * (cam.y - g.py);
    a = 0; b = g.nx; c = g.ny; d = f0 / cam.s; sg = 1;
  } else {
    const dx = g.x - cam.x, dy = g.y - cam.y, dd = Math.hypot(dx, dy);
    a = cam.s / (2 * g.r);
    b = -dx / g.r;
    c = -dy / g.r;
    d = ((dd - g.r) * (dd + g.r)) / (2 * g.r * cam.s);
    sg = g.inside ? 1 : -1;
  }
  const LIM = 1e18, v = [a * sg, b * sg, c * sg, Math.max(-LIM, Math.min(LIM, d * sg))];
  for (let i = 0; i < 4; i++) {
    const h = Math.fround(v[i]);
    hi[o + i] = h;
    lo[o + i] = Math.fround(v[i] - h);
  }
}
export function packEmpty(hi, lo, o) {
  hi[o] = 0; hi[o + 1] = 0; hi[o + 2] = 0; hi[o + 3] = 1;
  lo[o] = 0; lo[o + 1] = 0; lo[o + 2] = 0; lo[o + 3] = 0;
}

/* CPU reference of the shader's inversive reflection, for tests and for
   the explicit-packing ground truth. */
export function reflectVec(v, p) {
  const f = fEval(v, p[0], p[1]);
  const den = 4 * v[0] * f + 1;
  return [(p[0] - 2 * f * v[1]) / den, (p[1] - 2 * f * v[2]) / den];
}
/* Reflect circle w in circle v (both inversive vectors): w - 2<w,v>v */
export function reflectCircleVec(w, v) {
  const k = ip2(w, v);
  return w.map((e, i) => e - 2 * k * v[i]);
}
