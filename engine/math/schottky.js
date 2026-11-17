/* Schottky groups: pairs of disjoint circles (P, r) and (Q, s) with the
   orientation-preserving Moebius map
       g(z) = Q + r s u / (z - P),   |u| = 1 (the twist)
   which sends the outside of the first circle onto the inside of the
   second. A point inside the second is pulled back by g^-1, one inside
   the first is pushed out by g; when it sits in no circle it has reached
   the fundamental domain. Conformal, so the distance estimate is exact. */

export const TAU = Math.PI * 2;

export function schottkyRing(p) {
  /* 2n circles evenly spaced, circle i paired with circle i+n */
  const n = p.pairs, m = 2 * n, R = 0.7;
  const rTan = R * Math.sin(Math.PI / m); /* tangent neighbours at tight=1 */
  const r = rTan * p.tight;
  const circles = [];
  for (let i = 0; i < m; i++) {
    const th = p.rot + (i * TAU) / m;
    circles.push({ x: R * Math.cos(th), y: R * Math.sin(th), r });
  }
  const pairs = [];
  for (let i = 0; i < n; i++) pairs.push([i, i + n]);
  return { circles, pairs };
}

/* Free mode keeps circles in consecutive pairs (0,1), (2,3), ... */
export function schottkyFree(list) {
  const pairs = [];
  for (let i = 0; i + 1 < list.length; i += 2) pairs.push([i, i + 1]);
  return { circles: list, pairs };
}

/* Pack pairs into the view frame (X = cam + s*p): same formula with
   view-scaled radii. Two vec4 per pair: (Pv, r, cos tw), (Qv, s, sin tw). */
export function packSchottky(cfg, cam, twist, out, maxPairs) {
  const n = Math.min(cfg.pairs.length, maxPairs);
  const cu = Math.cos(twist), su = Math.sin(twist);
  for (let k = 0; k < maxPairs; k++) {
    const o = k * 8;
    if (k < n) {
      const A = cfg.circles[cfg.pairs[k][0]], B = cfg.circles[cfg.pairs[k][1]];
      out[o] = (A.x - cam.x) / cam.s; out[o + 1] = (A.y - cam.y) / cam.s; out[o + 2] = A.r / cam.s; out[o + 3] = cu;
      out[o + 4] = (B.x - cam.x) / cam.s; out[o + 5] = (B.y - cam.y) / cam.s; out[o + 6] = B.r / cam.s; out[o + 7] = su;
    } else {
      for (let i = 0; i < 8; i++) out[o + i] = 0;
      out[o + 2] = 0; out[o + 6] = 0;
    }
  }
  return n;
}

/* CPU reference of the shader orbit (tests). Returns {escaped, steps}. */
export function schottkyOrbit(cfg, twist, z, maxIter = 400) {
  const u = [Math.cos(twist), Math.sin(twist)];
  let x = z[0], y = z[1], steps = 0;
  for (let it = 0; it < maxIter; it++) {
    let moved = false;
    for (const [i, j] of cfg.pairs) {
      const A = cfg.circles[i], B = cfg.circles[j], rs = A.r * B.r;
      let dx = x - B.x, dy = y - B.y;
      if (dx * dx + dy * dy < B.r * B.r) {
        const m = dx * dx + dy * dy, qx = (u[0] * dx + u[1] * dy) / m, qy = (u[1] * dx - u[0] * dy) / m;
        x = A.x + rs * qx; y = A.y + rs * qy; steps++; moved = true; continue;
      }
      dx = x - A.x; dy = y - A.y;
      if (dx * dx + dy * dy < A.r * A.r) {
        const m = dx * dx + dy * dy, qx = (u[0] * dx + u[1] * dy) / m, qy = (u[1] * dx - u[0] * dy) / m;
        x = B.x + rs * qx; y = B.y + rs * qy; steps++; moved = true;
      }
    }
    if (!moved) return { escaped: true, steps, z: [x, y] };
  }
  return { escaped: false, steps, z: [x, y] };
}
