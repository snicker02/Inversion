/* Space renderer: camera, per-formula uniforms, environment and lighting. */
import { spaceFS, spaceKey, NS } from "./shaders/space.js";
import * as S3 from "./math/sphere3d.js";
import { PALETTES } from "./state.js";

export function palJS(P, t) {
  return [0, 1, 2].map((c) => Math.max(0, Math.min(1, P.a[c] + P.b[c] * Math.cos(2 * Math.PI * (P.c[c] * t + P.d[c])))));
}
const lin = (c) => c.map((x) => Math.pow(Math.max(x, 0), 2.2));
const mix3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const scale3 = (a, s) => a.map((x) => x * s);

export function apolloSpheres(sp) {
  if (!sp.tet) sp.tet = S3.TETRA.map((v) => v.slice());
  return S3.build3Dfrom(sp.tet, sp.srad) || S3.build3Dfrom(S3.TETRA.map((v) => v.slice()), sp.srad) || [];
}
export function shell(sp) {
  const g = apolloSpheres(sp);
  return g.length ? g[g.length - 1] : { c: [0, 0, 0], r: 1 };
}

export function camOf(sp) { return sp.cams[sp.formula]; }

/* Sphere packing camera: orbit the hollowed sphere's centre. Hollow shell
   (4): from outside, any distance. Hollow seed (0-3): stay inside that
   chamber. Nothing hollowed (-1): inside the shell. */
export function apolloFrame(sp) {
  const g = apolloSpheres(sp), h = sp.hollow | 0;
  const E = g.length ? g[g.length - 1] : { c: [0, 0, 0], r: 1 };
  if (h >= 0 && h < 4 && g[h]) return { target: g[h].c, maxDist: 0.92 * g[h].r, sphere: g[h], idx: h };
  if (h === 4) return { target: E.c, maxDist: 40, sphere: E, idx: 4 };
  return { target: E.c, maxDist: 0.9 * E.r, sphere: null, idx: -1 };
}

export function camBasis(sp) {
  const c = camOf(sp);
  let target = c.target;
  if (sp.formula === "apollo") {
    const F = apolloFrame(sp);
    target = F.target;
    c.dist = Math.max(0.02, Math.min(F.maxDist, c.dist));
  }
  const cp = Math.cos(c.pitch);
  const e = [target[0] + c.dist * cp * Math.cos(c.yaw), target[1] + c.dist * Math.sin(c.pitch), target[2] + c.dist * cp * Math.sin(c.yaw)];
  const v = [target[0] - e[0], target[1] - e[1], target[2] - e[2]];
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  const fw = [v[0] / L, v[1] / L, v[2] / L];
  let rt = [fw[2], 0, -fw[0]];
  const lr = Math.hypot(rt[0], rt[2]) || 1;
  rt = [rt[0] / lr, 0, rt[2] / lr];
  const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  return { e, fw, rt, up, fov: 1.35, target };
}

/* world point -> CSS pixel, matching the shader's ray setup */
export function project3(P, B, VW, VH) {
  const v = [P[0] - B.e[0], P[1] - B.e[1], P[2] - B.e[2]];
  const dz = v[0] * B.fw[0] + v[1] * B.fw[1] + v[2] * B.fw[2];
  if (dz <= 1e-4) return null;
  const dx = v[0] * B.rt[0] + v[1] * B.rt[1] + v[2] * B.rt[2];
  const dy = v[0] * B.up[0] + v[1] * B.up[1] + v[2] * B.up[2];
  return { x: VW * 0.5 + (B.fov * dx / dz) * VH, y: VH * 0.5 - (B.fov * dy / dz) * VH, z: dz };
}

/* Environment in linear light. A neutral studio sky (cool zenith, pale
   horizon, warm ground bounce, warm sun) optionally tinted by the palette. */
export function environment(S) {
  const sp = S.space, C = S.color, Pal = PALETTES[C.pal] || PALETTES[0];
  const tint = sp.skyTint;
  const pz = lin(palJS(Pal, C.hue + 0.6)), ph = lin(palJS(Pal, C.hue + 0.15));
  const zen = mix3([0.16, 0.27, 0.52], scale3(pz, 0.6), tint);
  const hor = mix3([0.66, 0.70, 0.76], scale3(ph, 0.9), tint * 0.6);
  const gnd = mix3([0.20, 0.17, 0.14], scale3(ph, 0.25), tint * 0.5);
  const sun = scale3(mix3([1.0, 0.91, 0.78], [1, 1, 1], 0.2), sp.sunI);
  const lightBg = Pal.bg[0] + Pal.bg[1] + Pal.bg[2] > 1.5;
  const bgA = lightBg ? lin(Pal.bg) : lin(palJS(Pal, C.hue + 0.62).map((x) => 0.012 + x * 0.07));
  const bgB = lightBg ? lin(Pal.bg.map((x) => x * 0.88)) : lin(Pal.bg.map((x) => x * 0.9));
  return { zen, hor, gnd, sun, bgA, bgB };
}

export class SpaceRenderer {
  constructor(G) {
    this.G = G;
    this.a3 = new Float32Array(NS); this.g3 = new Float32Array(NS * 4);
    this.ad = new Float32Array(NS); this.gd = new Float32Array(NS * 4);
    this.info = { err: null };
  }
  packApollo(sp) {
    const gens = apolloSpheres(sp);
    const seedV = gens.map(S3.vecOf);
    const duals = S3.dualsOf(seedV).filter((d) => d);
    const fill = (A, Gv, i, v) => { A[i] = v[0]; Gv[i * 4] = v[1]; Gv[i * 4 + 1] = v[2]; Gv[i * 4 + 2] = v[3]; Gv[i * 4 + 3] = v[4]; };
    const empty = (A, Gv, i) => { A[i] = 0; Gv[i * 4] = 0; Gv[i * 4 + 1] = 0; Gv[i * 4 + 2] = 0; Gv[i * 4 + 3] = 1; };
    for (let i = 0; i < NS; i++) {
      if (i < duals.length) fill(this.a3, this.g3, i, duals[i]); else empty(this.a3, this.g3, i);
      if (i < seedV.length) fill(this.ad, this.gd, i, seedV[i]); else empty(this.ad, this.gd, i);
    }
    return {
      n: Math.min(duals.length, NS), nd: Math.min(seedV.length, NS),
      E: gens[gens.length - 1],
    };
  }
  /* quick: interactive preview lighting; linear: write HDR for the
     present pass to tone map */
  draw(S, full, off, sampleIndex, quick, linear) {
    const G = this.G, gl = G.gl, sp = S.space, f = sp.formula;
    const form = { apollo: 0, pk: 1, lat: 2, klein: 3 }[f] ?? 0;
    const o = { form, ginv: !!sp.ginv.on };
    const prog = G.program(spaceKey(o), spaceFS(o));
    if (!prog.p) { this.info.err = prog.err; return; }
    this.info.err = null;
    G.useFullscreen(prog);
    const u = (n) => prog.u(n);
    const par = sp[f];
    const B = camBasis(sp);
    let center = B.target, far = camOf(sp).dist * 14 + 12;

    if (form === 0) {
      const pk = this.packApollo(sp);
      gl.uniform1fv(u("uA3"), this.a3); gl.uniform4fv(u("uG3"), this.g3);
      gl.uniform1fv(u("uAD"), this.ad); gl.uniform4fv(u("uGD"), this.gd);
      gl.uniform1i(u("uNum"), pk.n); gl.uniform1i(u("uNumD"), pk.nd);
      const F = apolloFrame(sp);
      gl.uniform1i(u("uSkipOn"), F.sphere ? 1 : 0);
      gl.uniform1i(u("uSkipIdx"), F.idx);
      const sv = F.sphere ? S3.vecOf(F.sphere) : [0, 0, 0, 0, 1];
      gl.uniform4f(u("uSkipG"), sv[1], sv[2], sv[3], sv[4]); gl.uniform1f(u("uSkipA"), sv[0]);
      if (pk.E) { center = pk.E.c; far = Math.max(pk.E.r * 2.4, camOf(sp).dist + pk.E.r * 1.5); }
    } else if (form === 1) {
      gl.uniform3fv(u("uCSize"), par.csize); gl.uniform3fv(u("uKC"), par.c);
      gl.uniform1f(u("uKSize"), par.size); gl.uniform1f(u("uThick"), par.thick);
    } else if (form === 2) {
      gl.uniform1f(u("uLatS"), par.s); gl.uniform1f(u("uThick"), par.thick); gl.uniform1f(u("uLatShape"), par.shape);
    } else {
      gl.uniform2f(u("uMu"), par.mu[0], par.mu[1]);
      gl.uniform1f(u("uWrapZ"), par.wrapz); gl.uniform1f(u("uThick"), par.thick);
      gl.uniform1f(u("uFloor"), par.floor ? 1 : 0);
    }
    if (o.ginv) gl.uniform4f(u("uGinv"), sp.ginv.x, sp.ginv.y, sp.ginv.z, Math.max(sp.ginv.r, 1e-4));

    const C = S.color, Pal = PALETTES[C.pal] || PALETTES[0], env = environment(S);
    gl.uniform2f(u("uFull"), full[0], full[1]);
    gl.uniform2f(u("uOff"), off[0], off[1]);
    gl.uniform1i(u("uMaxIter"), par.maxIter);
    gl.uniform1i(u("uMarch"), sp.march);
    gl.uniform1i(u("uCMode"), C.cmode);
    gl.uniform1i(u("uShadowOn"), sp.shadows ? 1 : 0);
    gl.uniform1i(u("uRMode"), quick ? 0 : sp.rmode === "path" ? 2 : 1);
    gl.uniform1i(u("uBounces"), Math.max(1, Math.min(3, sp.bounces | 0)));
    gl.uniform1i(u("uLinear"), linear ? 1 : 0);
    gl.uniform1i(u("uBackdrop"), sp.backdrop === "dark" ? 1 : 0);
    gl.uniform3f(u("uEye"), B.e[0], B.e[1], B.e[2]);
    gl.uniform3f(u("uFwd"), B.fw[0], B.fw[1], B.fw[2]);
    gl.uniform3f(u("uRight"), B.rt[0], B.rt[1], B.rt[2]);
    gl.uniform3f(u("uUp"), B.up[0], B.up[1], B.up[2]);
    gl.uniform1f(u("uFov"), B.fov);
    gl.uniform1f(u("uStep"), par.step);
    gl.uniform1f(u("uFar"), far);
    gl.uniform1f(u("uDetail"), sp.detail);
    gl.uniform1f(u("uLens"), sp.lens * 0.05);
    gl.uniform1f(u("uFocus"), sp.focus);
    gl.uniform1f(u("uSeed"), (sampleIndex % 4093) + 0.5);
    const ly = sp.light.yaw, lp = sp.light.pitch;
    gl.uniform3f(u("uLight"), Math.cos(lp) * Math.cos(ly), Math.sin(lp), Math.cos(lp) * Math.sin(ly));
    gl.uniform3fv(u("uSunCol"), env.sun);
    gl.uniform3fv(u("uSkyZen"), env.zen); gl.uniform3fv(u("uSkyHor"), env.hor); gl.uniform3fv(u("uGround"), env.gnd);
    gl.uniform3fv(u("uBgA"), env.bgA); gl.uniform3fv(u("uBgB"), env.bgB);
    gl.uniform1f(u("uSunSize"), Math.max(0.002, sp.sunSize));
    gl.uniform1f(u("uSkyI"), sp.skyI);
    const lp3 = sp.lamp;
    let lpos = B.e;
    if (lp3.at === "target") lpos = B.target;
    else if (lp3.at === "eye") {
      /* a little above and to the right of the eye, so it models the surface */
      const k = camOf(sp).dist * 0.35;
      lpos = [0, 1, 2].map((a) => B.e[a] + (B.rt[a] * 0.6 + B.up[a]) * k);
    }
    gl.uniform3fv(u("uLampPos"), lpos);
    gl.uniform3fv(u("uLampCol"), scale3([1.0, 0.86, 0.68], lp3.power));
    gl.uniform1f(u("uLampOn"), lp3.on ? 1 : 0);
    gl.uniform1f(u("uAO"), sp.ao); gl.uniform1f(u("uAOR"), sp.aoR);
    gl.uniform1f(u("uSpec"), sp.spec); gl.uniform1f(u("uShine"), sp.shine);
    gl.uniform1f(u("uFog"), sp.fog); gl.uniform1f(u("uShadowK"), sp.shadowK);
    gl.uniform1f(u("uAmb"), sp.amb); gl.uniform1f(u("uRim"), sp.rim); gl.uniform1f(u("uHead"), sp.head);
    gl.uniform1f(u("uCyc"), C.cyc); gl.uniform1f(u("uHue"), C.hue);
    gl.uniform1f(u("uFill"), C.fill); gl.uniform1f(u("uGlow"), sp.glow);
    gl.uniform1f(u("uExposure"), sp.exposure);
    gl.uniform3f(u("uCenter"), center[0], center[1], center[2]);
    const cut = sp.cut;
    if (cut.on) {
      const cp = Math.cos(cut.pitch);
      gl.uniform4f(u("uCut"), cp * Math.cos(cut.yaw), Math.sin(cut.pitch), cp * Math.sin(cut.yaw), cut.off);
    } else gl.uniform4f(u("uCut"), 0, 1, 0, 1e9);
    gl.uniform3fv(u("uPa"), Pal.a); gl.uniform3fv(u("uPb"), Pal.b);
    gl.uniform3fv(u("uPc"), Pal.c); gl.uniform3fv(u("uPd"), Pal.d);
    G.drawFullscreen();
  }
}
