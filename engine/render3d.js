/* Space renderer: camera, per-formula uniforms, lighting. */
import { spaceFS, spaceKey, NS } from "./shaders/space.js";
import * as S3 from "./math/sphere3d.js";
import { PALETTES } from "./state.js";

export function palJS(P, t) {
  return [0, 1, 2].map((c) => Math.max(0, Math.min(1, P.a[c] + P.b[c] * Math.cos(2 * Math.PI * (P.c[c] * t + P.d[c])))));
}

export function apolloSpheres(sp) {
  if (!sp.tet) sp.tet = S3.TETRA.map((v) => v.slice());
  return S3.build3Dfrom(sp.tet, sp.srad) || S3.build3Dfrom(S3.TETRA.map((v) => v.slice()), sp.srad) || [];
}
export function shell(sp) {
  const g = apolloSpheres(sp);
  return g.length ? g[g.length - 1] : { c: [0, 0, 0], r: 1 };
}

export function camOf(sp) { return sp.cams[sp.formula]; }

export function camBasis(sp) {
  const c = camOf(sp);
  let target = c.target;
  if (sp.formula === "apollo") {
    const E = shell(sp);
    target = E.c;
    /* with the shell drawn the camera must stay inside it: from outside
       you would only ever see its surface */
    c.dist = Math.max(0.03, Math.min(sp.shellOff ? 40 : 0.9 * E.r, c.dist));
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
    /* cut-away: the enclosing sphere still shapes the group (its duals) but
       is not drawn, so the cluster can be seen from outside */
    return { n: Math.min(duals.length, NS), nd: Math.min(seedV.length, NS), E: gens[gens.length - 1], shellV: seedV[seedV.length - 1] || [0, 0, 0, 0, 1] };
  }
  draw(S, full, off, sampleIndex) {
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
      gl.uniform1i(u("uSkipShell"), sp.shellOff ? 1 : 0);
      const sv = pk.shellV;
      gl.uniform4f(u("uShellG"), sv[1], sv[2], sv[3], sv[4]); gl.uniform1f(u("uShellA"), sv[0]);
      if (pk.E) { center = pk.E.c; far = Math.max(pk.E.r * 2.4, camOf(sp).dist + pk.E.r * 1.5); }
    } else if (form === 1) {
      gl.uniform3fv(u("uCSize"), par.csize); gl.uniform3fv(u("uKC"), par.c);
      gl.uniform1f(u("uKSize"), par.size); gl.uniform1f(u("uThick"), par.thick);
    } else if (form === 2) {
      gl.uniform1f(u("uLatS"), par.s); gl.uniform1f(u("uThick"), par.thick); gl.uniform1f(u("uLatShape"), par.shape);
    } else {
      gl.uniform2f(u("uMu"), par.mu[0], par.mu[1]);
      gl.uniform1f(u("uWrapZ"), par.wrapz); gl.uniform1f(u("uThick"), par.thick);
    }
    if (o.ginv) gl.uniform4f(u("uGinv"), sp.ginv.x, sp.ginv.y, sp.ginv.z, Math.max(sp.ginv.r, 1e-4));

    const C = S.color, Pal = PALETTES[C.pal] || PALETTES[0];
    gl.uniform2f(u("uFull"), full[0], full[1]);
    gl.uniform2f(u("uOff"), off[0], off[1]);
    gl.uniform1i(u("uMaxIter"), par.maxIter);
    gl.uniform1i(u("uMarch"), sp.march);
    gl.uniform1i(u("uCMode"), C.cmode);
    gl.uniform1i(u("uShadowOn"), sp.shadows ? 1 : 0);
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
    gl.uniform1f(u("uSeed"), (sampleIndex % 997) + 0.5);
    const ly = sp.light.yaw, lp = sp.light.pitch;
    gl.uniform3f(u("uLight"), Math.cos(lp) * Math.cos(ly), Math.sin(lp), Math.cos(lp) * Math.sin(ly));
    const lc = palJS(Pal, C.hue + 0.1).map((x) => 0.75 + 0.35 * x);
    gl.uniform3f(u("uLightCol"), lc[0], lc[1], lc[2]);
    gl.uniform1f(u("uAO"), sp.ao); gl.uniform1f(u("uAOR"), sp.aoR);
    gl.uniform1f(u("uSpec"), sp.spec); gl.uniform1f(u("uShine"), sp.shine);
    gl.uniform1f(u("uFog"), sp.fog); gl.uniform1f(u("uShadowK"), sp.shadowK);
    gl.uniform1f(u("uAmb"), sp.amb); gl.uniform1f(u("uRim"), sp.rim); gl.uniform1f(u("uHead"), sp.head);
    gl.uniform1f(u("uCyc"), C.cyc); gl.uniform1f(u("uHue"), C.hue);
    gl.uniform1f(u("uFill"), C.fill); gl.uniform1f(u("uGlow"), sp.glow);
    gl.uniform1f(u("uExposure"), sp.exposure);
    const light = Pal.bg[0] + Pal.bg[1] + Pal.bg[2] > 1.5;
    const top = light ? Pal.bg : palJS(Pal, C.hue + 0.62).map((x) => 0.015 + x * 0.09);
    const bot = light ? Pal.bg.map((x) => x * 0.85) : Pal.bg.map((x) => x * 1.2);
    gl.uniform3fv(u("uBg0"), top.map((x) => Math.pow(x, 2.2))); gl.uniform3fv(u("uBg1"), bot.map((x) => Math.pow(x, 2.2)));
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
