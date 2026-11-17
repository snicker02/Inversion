/* High-resolution PNG export, rendered in tiles so the image can exceed
   the GPU's texture limit and no single draw runs long enough to trip a
   driver timeout. Each tile accumulates its own jittered samples. */
import { Accumulator, jitter } from "./accum.js";

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export async function exportPNG(app, mult, onProgress) {
  const G = app.G, gl = G.gl, S = app.S;
  const cw = app.canvas.width, ch = app.canvas.height;
  let W = Math.round(cw * mult), H = Math.round(ch * mult);
  const maxSide = 16384, maxArea = 140e6;
  const k = Math.min(1, maxSide / Math.max(W, H), Math.sqrt(maxArea / (W * H)));
  W = Math.floor(W * k); H = Math.floor(H * k);
  const realMult = W / cw;

  const T = Math.min(1024, G.maxTex, G.maxView[0], G.maxView[1]);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  const rgba = G.target(T, T, gl.UNSIGNED_BYTE, false);
  const px = new Uint8Array(T * T * 4);
  const lineScale = realMult * app.lineScaleBase();
  const samples = S.engine === "limit" ? 1 : Math.max(4, S.render.samples);
  const acc = S.engine === "limit" ? null : new Accumulator(G);

  if (S.engine === "limit") await app.limit.prepareExport(S, W, H);

  const nx = Math.ceil(W / T), ny = Math.ceil(H / T);
  let done = 0;
  try {
    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
      const x0 = tx * T, y0 = ty * T, tw = Math.min(T, W - x0), th = Math.min(T, H - y0);
      if (S.engine === "limit") {
        const cx = (2 * (x0 + tw / 2)) / W - 1, cy = (2 * (y0 + th / 2)) / H - 1;
        app.limit.draw(S, rgba.fb, tw, th, [W, H], [(-cx * W) / tw, (-cy * H) / th, W / tw, H / th], lineScale, true);
      } else {
        acc.ensure(T, T);
        acc.reset(1);
        acc.t.w = T; acc.t.h = T;
        for (let n = 0; n < samples; n++) {
          const j = jitter(n);
          const gl2 = G.gl;
          gl2.bindFramebuffer(gl2.FRAMEBUFFER, acc.t.fb);
          const vp = acc.begin();
          gl2.viewport(0, 0, tw, th);
          app.drawScene([W, H], [x0 + j[0], y0 + j[1]], lineScale, n);
          acc.end();
          if (n % 2 === 1) { onProgress && onProgress((done + n / samples) / (nx * ny)); await yieldFrame(); }
          void vp;
        }
        /* resolve the tile into an 8-bit target at 1:1 */
        gl.bindFramebuffer(gl.FRAMEBUFFER, rgba.fb);
        gl.viewport(0, 0, tw, th);
        const P = acc.present;
        G.useFullscreen(P);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, acc.t.tex);
        gl.uniform1i(P.u("uTex"), 0);
        gl.uniform2f(P.u("uRes"), T, T);
        gl.uniform2f(P.u("uScale"), 1, 1);
        G.drawFullscreen();
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, rgba.fb);
      gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const img = ctx.createImageData(tw, th);
      for (let row = 0; row < th; row++) {
        const src = (th - 1 - row) * tw * 4;
        img.data.set(px.subarray(src, src + tw * 4), row * tw * 4);
      }
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      ctx.putImageData(img, x0, H - y0 - th);
      done++;
      onProgress && onProgress(done / (nx * ny));
      await yieldFrame();
    }
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    rgba.dispose();
    if (acc && acc.t) acc.t.dispose();
  }
  return new Promise((res) => out.toBlob((b) => res({ blob: b, W, H }), "image/png"));
}
