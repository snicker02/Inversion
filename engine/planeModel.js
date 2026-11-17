/* What the plane view is made of, in world coordinates: seed circles,
   mirror lines, dual (gap-filling) circles and Schottky pairs. Shared by
   the renderer, the overlay and the curvature readout. */
import * as P from "./math/inversive2d.js";
import { schottkyRing, schottkyFree } from "./math/schottky.js";

export const INVERSIVE = ["apollonian", "ring", "steiner", "free"];
export const isInversive = (f) => INVERSIVE.includes(f);
export const isSchottky = (f) => f === "schottky" || f === "sfree";
export const NG_MAX = 12;

export function currentCircles(pl) {
  switch (pl.formula) {
    case "ring": return P.ringCircles(pl.ring);
    case "steiner": return P.steinerCircles(pl.steiner);
    case "free": return pl.free;
    case "apollonian": { const A = P.apollonian(pl.tri); return A ? A.circles : []; }
    default: return [];
  }
}

export function shapesOn(pl) {
  const s = pl.shape;
  if (s.kind === "circle") return false;
  if (s.kind === "superellipse" && Math.abs(s.exp - 2) < 1e-6 && Math.abs(s.aspect - 1) < 1e-6) return false;
  return true;
}

export function buildGens(pl) {
  const room = NG_MAX - (pl.mir.on ? 2 : 0);
  const g = currentCircles(pl).slice(0, room).map((c) => ({ t: 0, x: c.x, y: c.y, r: c.r, inside: c.inside !== false }));
  if (pl.mir.on) {
    const th = pl.mir.ang, th2 = th + Math.PI / pl.mir.k;
    g.push({ t: 1, nx: -Math.sin(th), ny: Math.cos(th), px: pl.mir.x, py: pl.mir.y });
    g.push({ t: 1, nx: Math.sin(th2), ny: -Math.cos(th2), px: pl.mir.x, py: pl.mir.y });
  }
  return g;
}

/* Which faces of the tangency graph get a dual, if gap-fill applies. */
export function gapFaces(pl) {
  if (!pl.gapFill || pl.mir.on || shapesOn(pl)) return null;
  if (pl.formula === "apollonian") return P.APOLLO_FACES;
  if (pl.formula === "ring" && pl.ring.outer && Math.abs(pl.ring.tight - 1) < 1e-9) return P.ringFaces(pl.ring.n, true);
  if (pl.formula === "steiner" && Math.abs(pl.steiner.tight - 1) < 1e-9) return P.steinerFaces(pl.steiner.n);
  return null;
}
export function gapFillPossible(pl) {
  return pl.formula === "apollonian" || pl.formula === "steiner" || (pl.formula === "ring" && pl.ring.outer);
}
export function dualGens(pl) {
  const faces = gapFaces(pl);
  if (!faces) return null;
  const cs = currentCircles(pl);
  if (!cs.length) return null;
  const D = P.faceDuals(cs, faces);
  if (D.length < 2) return null;
  return D.map(P.vecToGen);
}

export function schottkyConfig(pl) {
  if (pl.formula === "schottky") return schottkyRing(pl.schottky);
  return schottkyFree(pl.sfree);
}

export { P };
