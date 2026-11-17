/* WebGL1 plumbing: context, program cache, fullscreen triangle, render
   targets. Float accumulation when the driver allows it, half float next,
   8-bit as a last resort. */
import { VS } from "./shaders/common.js";

export function createGL(canvas) {
  const opts = { antialias: false, preserveDrawingBuffer: true, alpha: false, premultipliedAlpha: false };
  const gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
  if (!gl) return null;

  const ext = {
    deriv: gl.getExtension("OES_standard_derivatives"),
    float: gl.getExtension("OES_texture_float"),
    floatLin: gl.getExtension("OES_texture_float_linear"),
    cbf: gl.getExtension("WEBGL_color_buffer_float"),
    half: gl.getExtension("OES_texture_half_float"),
    halfLin: gl.getExtension("OES_texture_half_float_linear"),
    cbh: gl.getExtension("EXT_color_buffer_half_float"),
    floatBlend: gl.getExtension("EXT_float_blend"),
  };

  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(log);
    }
    return sh;
  }
  const cache = new Map();
  /* Programs are cached by key; uniform locations are looked up lazily. */
  function program(key, fsSrc, vsSrc = VS) {
    if (cache.has(key)) return cache.get(key);
    let entry;
    try {
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fsSrc));
      gl.bindAttribLocation(pr, 0, vsSrc === VS ? "aPos" : "aV");
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const locs = new Map();
      entry = {
        p: pr,
        err: null,
        u(name) {
          if (!locs.has(name)) locs.set(name, gl.getUniformLocation(pr, name));
          return locs.get(name);
        },
      };
    } catch (e) {
      entry = { p: null, err: String(e.message || e), u: () => null };
      console.error("[inversion] shader " + key + " failed:\n" + entry.err);
    }
    cache.set(key, entry);
    return entry;
  }
  function useFullscreen(prog) {
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }
  function drawFullscreen() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

  /* Probe a texture type as a colour attachment. */
  function canRender(type) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return ok;
  }
  let accumType = gl.UNSIGNED_BYTE, accumName = "8-bit", accumLinear = true, blendOK = true;
  if (ext.float && canRender(gl.FLOAT)) {
    accumType = gl.FLOAT; accumName = "float32"; accumLinear = !!ext.floatLin;
    blendOK = !!ext.floatBlend;
  }
  if ((accumType === gl.UNSIGNED_BYTE || !blendOK) && ext.half && canRender(ext.half.HALF_FLOAT_OES)) {
    accumType = ext.half.HALF_FLOAT_OES; accumName = "float16"; accumLinear = !!ext.halfLin; blendOK = true;
  }
  if (!blendOK) { accumType = gl.UNSIGNED_BYTE; accumName = "8-bit"; accumLinear = true; }

  function target(w, h, type = accumType, linear = accumLinear) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      tex, fb, w, h,
      dispose() { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); },
    };
  }

  function highpOK() {
    const f = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    return !!f && f.precision >= 23;
  }

  return {
    gl, ext, program, useFullscreen, drawFullscreen, target,
    accumType, accumName, highp: highpOK(),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxView: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
  };
}
