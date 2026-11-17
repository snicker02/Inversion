/* Progressive accumulation. Each sample is drawn straight into the
   accumulation target with constant-alpha blending at weight 1/(n+1), so
   the target always holds the running mean. Sub-pixel jitter (and the lens
   sample for depth of field) changes per sample, which turns the mean into
   antialiasing and defocus for free. */
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
    this.present = G.program("present", PRESENT_FS);
  }
  ensure(w, h) {
    if (this.t && this.t.w === w && this.t.h === h) return;
    if (this.t) this.t.dispose();
    this.t = this.G.target(w, h);
    this.n = 0;
  }
  reset(scale = 1) { this.n = 0; this.scale = scale; }
  /* bind for drawing sample n; returns viewport size */
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
    const gl = this.G.gl;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.n++;
  }
  /* draw the accumulated mean to fb (null = canvas) at w x h */
  blit(fb, w, h) {
    const gl = this.G.gl, P = this.present;
    if (!P.p) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    this.G.useFullscreen(P);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.t.tex);
    gl.uniform1i(P.u("uTex"), 0);
    gl.uniform2f(P.u("uRes"), w, h);
    const sx = Math.round(this.t.w * this.scale) / this.t.w, sy = Math.round(this.t.h * this.scale) / this.t.h;
    gl.uniform2f(P.u("uScale"), sx, sy);
    this.G.drawFullscreen();
  }
}
