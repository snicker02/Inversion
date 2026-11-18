/* Progressive accumulation. Each sample is drawn straight into the
   accumulation target with constant-alpha blending at weight 1/(n+1), so
   the target always holds the running mean. Sub-pixel jitter, the lens
   sample and every Monte Carlo choice change per sample, which turns the
   mean into antialiasing, defocus and converged lighting. The 3D view
   accumulates linear HDR and is tone mapped only here, after averaging. */
import { PRESENT_FS } from "./shaders/present.js";

/* low-discrepancy jitter; sample 0 is the pixel centre */
export function halton(i, b) {
  let f = 1, r = 0;
  while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
  return r;
}
export function jitter(n) {
  if (n === 0) return [0, 0];
  return [halton(n, 2) - 0.5, halton(n, 3) - 0.5];
}

export class Accumulator {
  constructor(G) {
    this.G = G;
    this.t = null;
    this.n = 0;
    this.scale = 1;
    this.tone = false;
    this.present = G.program("present", PRESENT_FS);
  }
  ensure(w, h) {
    if (this.t && this.t.w === w && this.t.h === h) return;
    if (this.t) this.t.dispose();
    this.t = this.G.target(w, h);
    this.n = 0;
  }
  reset(scale = 1) { this.n = 0; this.scale = scale; }
  /* bind for drawing sample n; returns the viewport size */
  begin() {
    const gl = this.G.gl, t = this.t;
    const w = Math.max(1, Math.round(t.w * this.scale)), h = Math.max(1, Math.round(t.h * this.scale));
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, w, h);
    if (this.n === 0) {
      gl.disable(gl.BLEND);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (this.n + 1));
    }
    return { w, h };
  }
  end() {
    this.endTile();
    this.n++;
  }
  /* Tiled sampling: a sample may be drawn as several horizontal bands
     (scissored), each its own short draw call, so no single call runs long
     enough to trip the driver's GPU watchdog. The blend weight depends only
     on n, which advances once the whole frame has been covered. */
  endTile() {
    const gl = this.G.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  finishSample() { this.n++; }
  /* Draw the accumulated mean into fb (null = canvas). vw x vh is the
     viewport; the texture is addressed in units of the full target, so a
     partially filled export tile resolves 1:1. */
  blit(fb, vw, vh, opts = {}) {
    const gl = this.G.gl, P = this.present;
    if (!P.p) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, vw, vh);
    gl.disable(gl.BLEND);
    this.G.useFullscreen(P);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.t.tex);
    gl.uniform1i(P.u("uTex"), 0);
    const tile = !!opts.tile;
    gl.uniform2f(P.u("uRes"), tile ? this.t.w : vw, tile ? this.t.h : vh);
    if (tile) gl.uniform2f(P.u("uScale"), 1, 1);
    else {
      const sx = Math.round(this.t.w * this.scale) / this.t.w, sy = Math.round(this.t.h * this.scale) / this.t.h;
      gl.uniform2f(P.u("uScale"), sx, sy);
    }
    gl.uniform1i(P.u("uTone"), this.tone ? 1 : 0);
    this.G.drawFullscreen();
  }
}
