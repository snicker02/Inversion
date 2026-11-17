/* Plane renderer: picks the shader variant for the current formula and
   feeds it the generators packed into the view frame. */
import { planeFS, planeKey, NG, NR, NP } from "./shaders/plane.js";
import { packGen, packEmpty } from "./math/inversive2d.js";
import { packSchottky } from "./math/schottky.js";
import * as M from "./planeModel.js";
import { PALETTES, HOME_S } from "./state.js";

export const DEEP_FROM = 3.0e3;

export class PlaneRenderer {
  constructor(G) {
    this.G = G;
    this.genHi = new Float32Array(NG * 4); this.genLo = new Float32Array(NG * 4);
    this.refHi = new Float32Array(NR * 4); this.refLo = new Float32Array(NR * 4);
    this.sc = new Float32Array(NG * 4);
    this.pairs = new Float32Array(NP * 8);
    this.deepBroken = !G.highp;
    this.info = { deep: false, dual: false, seeds: 0, duals: 0, err: null };
  }

  variant(S) {
    const pl = S.plane, f = pl.formula;
    const o = { form: 0, deep: false, dual: false, shape: -1, ginv: !!pl.ginv.on, relief: S.color.relief > 0 && !!this.G.ext.deriv };
    if (M.isSchottky(f)) o.form = 1;
    else if (f === "maskit") o.form = 2;
    else {
      o.dual = !!M.gapFaces(pl);
      if (M.shapesOn(pl)) o.shape = { superellipse: 0, polygon: 1, hyperbola: 2 }[pl.shape.kind] ?? 0;
      const z = HOME_S / pl.cam.s;
      const want = pl.precision === "deep" || (pl.precision === "auto" && z > DEEP_FROM);
      o.deep = want && o.shape < 0 && !o.ginv && !this.deepBroken;
      if (o.shape >= 0) o.dual = false;
    }
    return o;
  }

  draw(S, vp, full, off, lineScale) {
    const G = this.G, gl = G.gl, pl = S.plane;
    let o = this.variant(S);
    let prog = G.program(planeKey(o), planeFS(o));
    if (!prog.p && o.deep) { this.deepBroken = true; o = this.variant(S); prog = G.program(planeKey(o), planeFS(o)); }
    if (!prog.p) { this.info.err = prog.err; return; }
    this.info.err = null;
    G.useFullscreen(prog);
    const u = (n) => prog.u(n);
    const cam = pl.cam;

    if (o.form === 0) {
      const gens = M.buildGens(pl);
      const n = Math.min(gens.length, NG);
      for (let i = 0; i < NG; i++) {
        if (i < n) packGen(gens[i], cam, this.genHi, this.genLo, i * 4);
        else packEmpty(this.genHi, this.genLo, i * 4);
      }
      gl.uniform4fv(u("uGen"), this.genHi);
      if (o.deep) gl.uniform4fv(u("uGenL"), this.genLo);
      gl.uniform1i(u("uNum"), n);
      this.info.seeds = n;
      this.info.duals = 0;
      if (o.dual) {
        const D = M.dualGens(pl) || [];
        const nd = Math.min(D.length, NR);
        for (let i = 0; i < NR; i++) {
          if (i < nd) packGen(D[i], cam, this.refHi, this.refLo, i * 4);
          else packEmpty(this.refHi, this.refLo, i * 4);
        }
        gl.uniform4fv(u("uRefl"), this.refHi);
        if (o.deep) gl.uniform4fv(u("uReflL"), this.refLo);
        gl.uniform1i(u("uNumR"), nd);
        this.info.duals = nd;
      }
      if (o.shape >= 0) {
        const sh = pl.shape;
        for (let i = 0; i < NG; i++) {
          const k = i * 4, g = gens[i];
          if (i < n && g.t === 0) {
            this.sc[k] = (g.x - cam.x) / cam.s; this.sc[k + 1] = (g.y - cam.y) / cam.s;
            this.sc[k + 2] = g.r / cam.s; this.sc[k + 3] = g.inside ? 1 : -1;
          } else { this.sc[k] = 0; this.sc[k + 1] = 0; this.sc[k + 2] = 0; this.sc[k + 3] = 1; }
        }
        gl.uniform4fv(u("uSC"), this.sc);
        const asp = Math.max(0.05, sh.aspect), af = Math.max(1, 1 / asp);
        let p0, gmax;
        if (sh.kind === "polygon") { p0 = Math.max(3, Math.round(sh.sides)); gmax = af / Math.cos(Math.PI / p0); }
        else if (sh.kind === "hyperbola") { p0 = 2; gmax = 0; }
        else { p0 = sh.exp; gmax = af * (p0 <= 2 ? Math.pow(2, 1 / p0 - 0.5) : 1); }
        gl.uniform4f(u("uShapeP"), p0, asp, 0, gmax);
        gl.uniform2f(u("uShapeR"), Math.cos(sh.ang), Math.sin(sh.ang));
      }
    } else if (o.form === 1) {
      const cfg = M.schottkyConfig(pl);
      const twist = pl.formula === "schottky" ? pl.schottky.twist : pl.schottky.twist;
      const n = packSchottky(cfg, cam, twist, this.pairs, NP);
      gl.uniform4fv(u("uPair"), this.pairs);
      gl.uniform1i(u("uNumP"), n);
      this.info.seeds = n * 2;
    } else {
      gl.uniform2f(u("uMu"), pl.maskit.mu[0], pl.maskit.mu[1]);
      gl.uniform3f(u("uCam"), cam.x, cam.y, cam.s);
      this.info.seeds = 2;
    }
    if (o.ginv) {
      const gi = pl.ginv;
      gl.uniform4f(u("uGinv"), (gi.x - cam.x) / cam.s, (gi.y - cam.y) / cam.s, Math.max(gi.r, 1e-6) / cam.s, 1);
    }
    this.info.deep = o.deep;
    this.info.dual = o.dual;
    this.info.form = o.form;

    const C = S.color, Pal = PALETTES[C.pal] || PALETTES[0];
    gl.uniform2f(u("uFull"), full[0], full[1]);
    gl.uniform2f(u("uOff"), off[0], off[1]);
    gl.uniform1i(u("uMaxIter"), pl.maxIter);
    gl.uniform1f(u("uLineW"), C.lineW * lineScale);
    gl.uniform1f(u("uGlow"), C.glow);
    gl.uniform1f(u("uFill"), C.fill);
    gl.uniform1f(u("uCyc"), C.cyc);
    gl.uniform1f(u("uHue"), C.hue);
    gl.uniform1f(u("uRelief"), C.relief * 3.0);
    gl.uniform1f(u("uReliefAng"), C.reliefAng);
    gl.uniform1i(u("uCMode"), C.cmode);
    gl.uniform3fv(u("uPa"), Pal.a); gl.uniform3fv(u("uPb"), Pal.b);
    gl.uniform3fv(u("uPc"), Pal.c); gl.uniform3fv(u("uPd"), Pal.d);
    gl.uniform3fv(u("uBG"), Pal.bg); gl.uniform3fv(u("uLine"), Pal.line); gl.uniform3fv(u("uSet"), Pal.set);
    G.drawFullscreen();
  }
}
