/* Two-generator Kleinian group recipes (Mumford, Series & Wright,
   "Indra's Pearls"). Each returns determinant-one matrices a, b. The
   limit-set renderer only needs the generators; whether the commutator is
   parabolic (trace -2) decides between drawing curves and dust. */
import { C, cadd, csub, cmul, cdiv, cscale, csqrt, mtrace, mmul, minv, mnormalize, I } from "./complex.js";

const two = C(2), four = C(4);

/* Grandma's special parabolic-commutator recipe: tr a = ta, tr b = tb,
   tr abAB = -2. */
export function grandma(ta, tb) {
  const ta2 = cmul(ta, ta), tb2 = cmul(tb, tb);
  const disc = csqrt(csub(cmul(ta2, tb2), cscale(cadd(ta2, tb2), 4)));
  let tab = cscale(csub(cmul(ta, tb), disc), 0.5);
  /* the other root gives the mirror-image group; pick the root with
     positive imaginary part where it matters, as the book does */
  const tab2 = cscale(cadd(cmul(ta, tb), disc), 0.5);
  if (tab[1] < 0 && tab2[1] >= 0) tab = tab2;
  const z0 = cdiv(cmul(csub(tab, two), tb), cadd(csub(cmul(tb, tab), cscale(ta, 2)), cmul(cscale(I, 2), tab)));
  const a = [
    cscale(ta, 0.5),
    cdiv(cadd(csub(cmul(ta, tab), cscale(tb, 2)), cmul(four, I)), cmul(cadd(cscale(tab, 2), four), z0)),
    cdiv(cmul(csub(csub(cmul(ta, tab), cscale(tb, 2)), cmul(four, I)), z0), csub(cscale(tab, 2), four)),
    cscale(ta, 0.5),
  ];
  const b = [
    cscale(csub(tb, cmul(two, I)), 0.5),
    cscale(tb, 0.5),
    cscale(tb, 0.5),
    cscale(cadd(tb, cmul(two, I)), 0.5),
  ];
  return { a: mnormalize(a), b: mnormalize(b) };
}

/* Maskit slice: a(z) = mu + 1/z, b(z) = z + 2. */
export function maskit(mu) {
  const mI = cmul(mu, I);
  const a = [cscale(mI, -1), cscale(I, -1), cscale(I, -1), C(0)];
  const b = [C(1), C(2), C(0), C(1)];
  return { a: mnormalize(a), b };
}

/* Riley slice: two parabolics a = [[1,2],[0,1]], b = [[1,0],[c,1]]. */
export function riley(c) {
  return { a: [C(1), C(2), C(0), C(1)], b: [C(1), C(0), c, C(1)] };
}

/* Jorgensen's recipe: tr a = ta, tr b = tb, tr ab = tab where tab is
   chosen so the commutator is parabolic (same quadratic as Grandma). */
export function jorgensen(ta, tb) {
  const ta2 = cmul(ta, ta), tb2 = cmul(tb, tb);
  const disc = csqrt(csub(cmul(ta2, tb2), cscale(cadd(ta2, tb2), 4)));
  let tab = cscale(csub(cmul(ta, tb), disc), 0.5);
  const tab2 = cscale(cadd(cmul(ta, tb), disc), 0.5);
  if (tab[1] < 0 && tab2[1] >= 0) tab = tab2;
  const a = [
    csub(ta, cdiv(tb, tab)),
    cdiv(ta, cmul(tab, tab)),
    ta,
    cdiv(tb, tab),
  ];
  const b = [
    csub(tb, cdiv(ta, tab)),
    cscale(cdiv(tb, cmul(tab, tab)), -1),
    cscale(tb, -1),
    cdiv(ta, tab),
  ];
  return { a: mnormalize(a), b: mnormalize(b) };
}

export function commutatorTrace(g) {
  const A = minv(g.a), B = minv(g.b);
  return mtrace(mmul(mmul(mmul(g.a, g.b), A), B));
}

export function buildRecipe(p) {
  switch (p.recipe) {
    case "maskit": return maskit(C(p.mu[0], p.mu[1]));
    case "riley": return riley(C(p.c[0], p.c[1]));
    case "jorgensen": return jorgensen(C(p.ta[0], p.ta[1]), C(p.tb[0], p.tb[1]));
    default: return grandma(C(p.ta[0], p.ta[1]), C(p.tb[0], p.tb[1]));
  }
}
