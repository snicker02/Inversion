/* Present pass for progressive accumulation, plus the limit-set
   (line density) shaders. */
import { PALETTE } from "./common.js";

/* Copy the accumulated image to the screen. uScale < 1 when the last
   frames were rendered at reduced resolution during interaction. */
export const PRESENT_FS = `precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uScale;
uniform int uTone;        /* 1: linear HDR in, ACES + gamma out */
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes*uScale;
  vec3 c = texture2D(uTex, uv).rgb;
  if(uTone == 1) c = pow(aces(max(c, 0.0)), vec3(0.4545));
  /* half-LSB dither hides banding */
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453);
  gl_FragColor = vec4(c + (n - 0.5)/255.0, 1.0);
}
`;

/* Limit set segments: vertex = (x, y, depth, letter), positions rebased to
   the centre the worker used. */
export const LS_VS = `
attribute vec4 aV;
uniform vec2 uCamRel;     /* view centre minus rebase centre (world) */
uniform float uS;         /* view half-height (world) */
uniform vec2 uFull;
uniform vec2 uShift;      /* weight / jitter offset in pixels */
uniform vec4 uTile;       /* clip = clip*zw + xy for tiled export */
varying vec2 vKey;
void main(){
  vec2 c = (aV.xy - uCamRel)/uS;
  c.x *= uFull.y/uFull.x;
  c += uShift*2.0/uFull;
  gl_Position = vec4(c*uTile.zw + uTile.xy, 0.0, 1.0);
  vKey = aV.zw;
}
`;
export const LS_FS = `precision highp float;
${PALETTE}
varying vec2 vKey;
uniform int uCMode;
uniform float uCyc, uHue, uI;
void main(){
  float t;
  if(uCMode == 2)      t = vKey.y*0.17*uCyc + vKey.x*0.006 + uHue;
  else if(uCMode == 6) t = mod(vKey.x, 2.0)*0.5*uCyc + uHue;
  else if(uCMode == 7) t = log(1.0 + vKey.x)*0.4*uCyc + uHue;
  else                 t = vKey.x*0.045*uCyc + uHue;
  gl_FragColor = vec4(pal(t)*uI, uI);
}
`;
/* density -> colour: weighted mean colour, coverage from total weight */
export const LS_PRESENT_FS = `precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec3 uBG;
uniform float uGain, uGlow;
void main(){
  vec4 a = texture2D(uTex, gl_FragCoord.xy/uRes);
  vec3 col = a.rgb/max(a.a, 1e-6);
  float cov = 1.0 - exp(-a.a*uGain);
  vec3 c = mix(uBG, col, cov);
  c += col*uGlow*(1.0 - exp(-a.a*uGain*0.08));
  gl_FragColor = vec4(c, 1.0);
}
`;
