/* Limit-set view: the worker returns line segments; they are splatted
   additively into a density target and resolved with a soft coverage
   curve. Recomputed only when the group, the precision or the view leave
   the margin the last search covered. */
import { LS_VS, LS_FS, LS_PRESENT_FS } from "../shaders/present.js";
import { PALETTES } from "../state.js";

export class LimitRenderer {
  constructor(G, onUpdate) {
    this.G = G;
    this.onUpdate = onUpdate;
    this.prog = G.program("ls", LS_FS, LS_VS);
    this.pres = G.program("lsp", LS_PRESENT_FS);
    this.vbo = G.gl.createBuffer();
    this.count = 0;
    this.base = { cx: 0, cy: 0 };
    this.target = null;
    this.reqId = 0;
    this.pending = false;
    this.covered = null;
    this.stats = { segs: 0, nodes: 0, ms: 0, truncated: false, comm: null, error: null };
    this.worker = null;
    try {
      this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => this.receive(e.data);
      this.worker.onerror = (e) => { this.stats.error = "worker failed: " + (e.message || "module workers unsupported"); this.pending = false; onUpdate(); };
    } catch (err) {
      this.stats.error = "Web Workers unavailable: " + err.message;
    }
    this.boundsCb = null;
  }
  key(L) {
    return JSON.stringify([L.recipe, L.ta, L.tb, L.mu, L.c, L.maxDepth]);
  }
  /* view rect in world units for a camera and aspect */
  rect(cam, aspect) {
    return { x0: cam.x - cam.s * aspect, x1: cam.x + cam.s * aspect, y0: cam.y - cam.s, y1: cam.y + cam.s };
  }
  /* Ask for a fresh search if what we hold no longer serves this view. */
  update(L, aspect, pxH, exportMode = false) {
    if (!this.worker) return;
    const cam = L.cam, k = this.key(L);
    const eps = (2 * cam.s / pxH) * L.eps;
    const c = this.covered;
    const v = this.rect(cam, aspect);
    const inside = c && v.x0 >= c.view.x0 && v.x1 <= c.view.x1 && v.y0 >= c.view.y0 && v.y1 <= c.view.y1;
    const epsOK = c && eps <= c.eps * 1.6 && eps >= c.eps / 2.5;
    if (!exportMode && c && c.key === k && inside && epsOK) return;
    if (this.pending) { this.queued = true; return; }
    const m = exportMode ? 0.02 : 0.35;
    const W = v.x1 - v.x0, H = v.y1 - v.y0;
    const view = { x0: v.x0 - W * m, x1: v.x1 + W * m, y0: v.y0 - H * m, y1: v.y1 + H * m };
    this.pending = true; this.queued = false;
    this.req = { key: k, view, eps };
    this.worker.postMessage({
      id: ++this.reqId, kind: "set",
      params: { recipe: L.recipe, ta: L.ta, tb: L.tb, mu: L.mu, c: L.c },
      view, opt: { eps, maxDepth: L.maxDepth, maxSegs: exportMode ? 5000000 : 1500000, maxNodes: exportMode ? 3e7 : 9e6 },
    });
  }
  /* Search again at export resolution and wait for it. */
  async prepareExport(S, W, H) {
    const idle = () => new Promise((r) => { const t = () => (this.pending ? setTimeout(t, 30) : r()); t(); });
    await idle();
    this.queued = false;
    this.update(S.limit, W / H, H, true);
    await idle();
  }
  bounds(L, cb) {
    if (!this.worker) return;
    this.boundsCb = cb;
    this.worker.postMessage({ id: ++this.reqId, kind: "bounds", params: { recipe: L.recipe, ta: L.ta, tb: L.tb, mu: L.mu, c: L.c } });
  }
  receive(m) {
    if (m.kind === "bounds") { if (this.boundsCb) this.boundsCb(m.bounds); this.boundsCb = null; return; }
    this.pending = false;
    if (m.error) { this.stats.error = m.error; this.onUpdate(); return; }
    const gl = this.G.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW);
    this.count = m.data.length / 4;
    this.base = { cx: m.cx, cy: m.cy };
    this.covered = this.req;
    this.stats = { segs: m.segs, nodes: m.nodes, ms: m.ms, truncated: m.truncated, comm: m.comm, error: null };
    this.onUpdate(this.queued);
  }
  ensureTarget(w, h) {
    if (this.target && this.target.w === w && this.target.h === h) return;
    if (this.target) this.target.dispose();
    this.target = this.G.target(w, h);
  }
  /* render density for a (possibly tiled) frame, then resolve into fb */
  draw(S, fb, w, h, full, tile, lineScale) { // eslint-disable-line max-params
    const G = this.G, gl = G.gl, L = S.limit, C = S.color, Pal = PALETTES[C.pal] || PALETTES[0];
    if (!this.prog.p || !this.pres.p) return;
    this.ensureTarget(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.count > 0) {
      const P = this.prog;
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.uniform2f(P.u("uCamRel"), L.cam.x - this.base.cx, L.cam.y - this.base.cy);
      gl.uniform1f(P.u("uS"), L.cam.s);
      gl.uniform2f(P.u("uFull"), full[0], full[1]);
      gl.uniform4fv(P.u("uTile"), tile);
      gl.uniform1i(P.u("uCMode"), C.cmode);
      gl.uniform1f(P.u("uCyc"), C.cyc);
      gl.uniform1f(P.u("uHue"), C.hue);
      gl.uniform3fv(P.u("uPa"), Pal.a); gl.uniform3fv(P.u("uPb"), Pal.b);
      gl.uniform3fv(P.u("uPc"), Pal.c); gl.uniform3fv(P.u("uPd"), Pal.d);
      /* antialias by 4 sub-pixel passes; thicken with a ring of offsets */
      const aa = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
      const wgt = Math.max(0, L.weight * lineScale - 1) * 0.5;
      const ring = [[0, 0]];
      if (wgt > 0.05) {
        const nr = wgt > 1.5 ? 10 : 6;
        for (let k = 0; k < nr; k++) ring.push([Math.cos(k / nr * 6.2832) * wgt, Math.sin(k / nr * 6.2832) * wgt]);
        if (wgt > 1.5) for (let k = 0; k < 6; k++) ring.push([Math.cos(k / 6 * 6.2832 + 0.5) * wgt * 0.5, Math.sin(k / 6 * 6.2832 + 0.5) * wgt * 0.5]);
      }
      const passes = aa.length * ring.length;
      const fp16 = G.accumName !== "8-bit";
      gl.uniform1f(P.u("uI"), fp16 ? 4 / passes : 1 / passes);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (const a of aa) for (const r of ring) {
        gl.uniform2f(P.u("uShift"), a[0] + r[0], a[1] + r[1]);
        gl.drawArrays(gl.LINES, 0, this.count);
      }
      gl.disable(gl.BLEND);
    }
    const Q = this.pres;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    G.useFullscreen(Q);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.target.tex);
    gl.uniform1i(Q.u("uTex"), 0);
    gl.uniform2f(Q.u("uRes"), w, h);
    gl.uniform3fv(Q.u("uBG"), Pal.bg);
    const fp16 = G.accumName !== "8-bit";
    gl.uniform1f(Q.u("uGain"), L.gain * (fp16 ? 0.6 : 2.4));
    gl.uniform1f(Q.u("uGlow"), C.glow);
    G.drawFullscreen();
  }
}
