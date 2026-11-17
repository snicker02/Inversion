/* Plane (2D) escape-time fragment shader, assembled per variant.

   opts = {
     form:  0 inversive reflections (seeds, mirrors, duals, shapes)
            1 Schottky pairs (Moebius pairings of circles)
            2 Maskit / Kleinian (Jos Leys style strip algorithm)
     deep:  emulated-double orbit (form 0, circles only)
     dual:  reflect in the dual set, measure to the seed set (form 0)
     shape: -1 none, 0 superellipse, 1 polygon, 2 hyperbola (form 0, fast)
     ginv:  pre-invert the view through a circle
     relief: pillow shading from the distance estimate (needs derivatives)
   }
   All forms produce the same outputs (steps, logJ, last, trap, d, angle)
   so colouring is shared. logJ accumulates log(1/|F'|): the distance
   estimate in view units is d * exp(logJ). */
import { PALETTE, DF64 } from "./common.js";

export const NG = 12, NR = 16, NP = 6;

export function planeKey(o) {
  return `p${o.form}|${o.deep ? 1 : 0}|${o.dual ? 1 : 0}|${o.shape}|${o.ginv ? 1 : 0}|${o.relief ? 1 : 0}`;
}

export function planeFS(o) {
  const D = [];
  D.push(`#define FORM ${o.form}`);
  if (o.form === 0 && o.deep) D.push("#define DEEP 1");
  if (o.form === 0 && o.dual) D.push("#define DUAL 1");
  if (o.form === 0 && o.shape >= 0 && !o.deep) D.push(`#define SHAPE ${o.shape}`);
  if (o.ginv) D.push("#define GINV 1");
  if (o.relief) D.push("#define RELIEF 1");
  const ext = o.relief ? "#extension GL_OES_standard_derivatives : enable\n" : "";
  return `${ext}precision highp float;
${D.join("\n")}
#define NG ${NG}
#define NR ${NR}
#define NP ${NP}
#define MAXI 1200

uniform vec2  uFull;      /* full image size in pixels */
uniform vec2  uOff;       /* tile offset + sub-pixel jitter */
uniform int   uMaxIter;
uniform float uLineW, uGlow, uFill, uCyc, uHue, uRelief, uReliefAng;
uniform int   uCMode;
uniform vec3  uBG, uLine, uSet;
uniform vec4  uGinv;      /* centre (view frame), radius */
${PALETTE}

#if FORM == 0
uniform vec4 uGen[NG];
uniform int  uNum;
#ifdef DEEP
uniform vec4 uGenL[NG];
#endif
#ifdef DUAL
uniform vec4 uRefl[NR];
uniform int  uNumR;
#ifdef DEEP
uniform vec4 uReflL[NR];
#endif
#endif
#ifdef SHAPE
uniform vec4 uSC[NG];     /* centre, radius (<=0: not shaped), side sign */
uniform vec4 uShapeP;     /* exponent or sides, aspect, -, Gmax */
uniform vec2 uShapeR;     /* rotation cos, sin */
#endif
#endif

#if FORM == 1
uniform vec4 uPair[2*NP];
uniform int  uNumP;
#endif

#if FORM == 2
uniform vec2 uMu;
uniform vec3 uCam;        /* world centre x, y and view scale */
#endif

float oSteps, oLogJ, oLast, oTrap, oD, oAng;
bool  oEsc;

/* ------------------------------------------------------------------ */
#ifdef SHAPE
/* Inversion in a convex gauge N (homogeneous of degree 1): u -> u r^2/N^2.
   Still an exact involution since N(u') = r^2/N(u). Euler gives u.gradN = N,
   so the derivative is k (I - (2/N) u gradN^T), a skew reflection with
   singular values s and 1/s: not conformal, so the distance estimate is
   divided by the larger singular value. */
vec2 shapeFrame(vec2 u){ return vec2(uShapeR.x*u.x + uShapeR.y*u.y, -uShapeR.y*u.x + uShapeR.x*u.y); }
#if SHAPE == 0
float pnorm(vec2 u, float pe){
  vec2 a = abs(u);
  float m = max(a.x, a.y);
  if(m <= 0.0) return 0.0;
  float t = min(a.x, a.y)/m;
  return m*pow(1.0 + pow(t, pe), 1.0/pe);
}
float gaugeN(vec2 w){ return pnorm(vec2(w.x, w.y/uShapeP.y), uShapeP.x); }
vec2 gaugeG(vec2 w, float N){
  vec2 v = vec2(w.x, w.y/uShapeP.y);
  vec2 a = max(abs(v)/max(N, 1e-30), 1e-20);
  float q = uShapeP.x - 1.0;
  vec2 g = vec2(sign(v.x)*pow(a.x, q), sign(v.y)*pow(a.y, q));
  return vec2(g.x, g.y/uShapeP.y);
}
#elif SHAPE == 1
/* regular polygon with circumradius 1: max over face normals / apothem */
vec2 polyNormal(vec2 v){
  float n = uShapeP.x, seg = 6.28318530718/n;
  float k = floor(atan(v.y, v.x)/seg);
  float ph = (k + 0.5)*seg;
  return vec2(cos(ph), sin(ph))/cos(3.14159265359/n);
}
float gaugeN(vec2 w){ vec2 v = vec2(w.x, w.y/uShapeP.y); return dot(v, polyNormal(v)); }
vec2 gaugeG(vec2 w, float N){ vec2 v = vec2(w.x, w.y/uShapeP.y); vec2 g = polyNormal(v); return vec2(g.x, g.y/uShapeP.y); }
#else
/* hyperbolic (Lorentz) gauge sqrt|x^2 - y^2|: degree 1, not convex */
float gaugeN(vec2 w){ vec2 v = vec2(w.x, w.y/uShapeP.y); return sqrt(abs(v.x*v.x - v.y*v.y)); }
vec2 gaugeG(vec2 w, float N){
  vec2 v = vec2(w.x, w.y/uShapeP.y);
  float s = sign(v.x*v.x - v.y*v.y);
  vec2 g = s*vec2(v.x, -v.y)/max(N, 1e-30);
  return vec2(g.x, g.y/uShapeP.y);
}
#endif
float sig1(float a11, float a12, float a21, float a22){
  float F = a11*a11 + a12*a12 + a21*a21 + a22*a22;
  return sqrt(max(0.5*(F + sqrt(max(F*F - 4.0, 0.0))), 1.0));
}
#endif

/* ------------------------------------------------------------------ */
#if FORM == 0
#ifdef DEEP
${DF64}
void orbit(vec2 p0, float logJ0){
  vec2 px = vec2(p0.x, 0.0), py = vec2(p0.y, 0.0);
  vec2 A, B, C, Dd, f; vec4 gh, gv;
  float logJ = logJ0, steps = 0.0, last = 0.0, trap = 1e9;
  bool escaped = false;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    bool moved = false;
#ifdef DUAL
    for(int j = 0; j < NR; j++){
      if(j >= uNumR) break;
      gh = uRefl[j]; gv = uReflL[j];
#else
    for(int j = 0; j < NG; j++){
      if(j >= uNum) break;
      gh = uGen[j]; gv = uGenL[j];
#endif
      A = vec2(gh.x, gv.x); B = vec2(gh.y, gv.y); C = vec2(gh.z, gv.z); Dd = vec2(gh.w, gv.w);
      f = dsF(A, B, C, Dd, px, py);
      if(f.x < 0.0 || (f.x == 0.0 && f.y < 0.0)){
        vec2 den = dsAdd(dsMul(vec2(4.0*A.x, 4.0*A.y), f), vec2(1.0, 0.0));
        if(den.x < 1e-20) den = vec2(1e-20, 0.0);
        vec2 f2 = vec2(2.0*f.x, 2.0*f.y);
        px = dsDiv(dsAdd(px, -dsMul(f2, B)), den);
        py = dsDiv(dsAdd(py, -dsMul(f2, C)), den);
        float m = max(abs(px.x), abs(py.x));
        if(!(m < 1e15)){ px = vec2(1e15, 0.0); py = vec2(0.0); }
        logJ += log(den.x);
        steps += 1.0; last = float(j); moved = true;
      }
    }
    trap = min(trap, length(vec2(px.x, py.x)));
    if(!moved){ escaped = true; break; }
  }
  float d = 1e9;
  for(int j = 0; j < NG; j++){
    if(j >= uNum) break;
    gh = uGen[j]; gv = uGenL[j];
    A = vec2(gh.x, gv.x); B = vec2(gh.y, gv.y); C = vec2(gh.z, gv.z); Dd = vec2(gh.w, gv.w);
    f = dsF(A, B, C, Dd, px, py);
    float q = max(4.0*A.x*f.x + 1.0, 0.0);
    d = min(d, 2.0*abs(f.x)/(1.0 + sqrt(q)));
  }
  oSteps = steps; oLogJ = logJ; oLast = last; oTrap = trap; oD = d; oEsc = escaped;
  oAng = atan(py.x, px.x);
}
#else
void orbit(vec2 p0, float logJ0){
  vec2 p = p0;
  float logJ = logJ0, steps = 0.0, last = 0.0, trap = 1e9;
  bool escaped = false;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    bool moved = false;
#ifdef DUAL
    for(int j = 0; j < NR; j++){
      if(j >= uNumR) break;
      vec4 g = uRefl[j];
#else
    for(int j = 0; j < NG; j++){
      if(j >= uNum) break;
#ifdef SHAPE
      vec4 sc = uSC[j];
      if(sc.z > 0.0){
        vec2 u = p - sc.xy;
        vec2 w = shapeFrame(u);
        float N = max(gaugeN(w), 1e-30);
        if((N - sc.z)*sc.w < 0.0){
          float k = (sc.z*sc.z)/(N*N);
          vec2 gr = gaugeG(w, N);
          float a11 = 1.0 - 2.0*w.x*gr.x/N, a12 = -2.0*w.x*gr.y/N;
          float a21 =     - 2.0*w.y*gr.x/N, a22 = 1.0 - 2.0*w.y*gr.y/N;
          p = sc.xy + u*k;
          if(!(max(abs(p.x), abs(p.y)) < 1e15)) p = vec2(1e15, 0.0);
          logJ -= log(k*sig1(a11, a12, a21, a22));
          steps += 1.0; last = float(j); moved = true;
        }
        continue;
      }
#endif
      vec4 g = uGen[j];
#endif
      float f = g.x*dot(p, p) + g.y*p.x + g.z*p.y + g.w;
      if(f < 0.0){
        /* den = 4a^2|p-C|^2 >= 0; vanishes only at a circle's centre */
        float den = max(4.0*g.x*f + 1.0, 1e-20);
        p = (p - 2.0*f*vec2(g.y, g.z))/den;
        if(!(max(abs(p.x), abs(p.y)) < 1e15)) p = vec2(1e15, 0.0);
        logJ += log(den);
        steps += 1.0; last = float(j); moved = true;
      }
    }
    trap = min(trap, length(p));
    if(!moved){ escaped = true; break; }
  }
  float d = 1e9;
  for(int j = 0; j < NG; j++){
    if(j >= uNum) break;
#ifdef SHAPE
    vec4 sc = uSC[j];
    if(sc.z > 0.0){
      vec2 w = shapeFrame(p - sc.xy);
      float N = gaugeN(w);
      float glen = length(gaugeG(w, max(N, 1e-30)));
      float den = (N > sc.z) ? glen : max(glen, uShapeP.w);
      d = min(d, abs(N - sc.z)/max(den, 1e-20));
      continue;
    }
#endif
    vec4 g = uGen[j];
    float f = g.x*dot(p, p) + g.y*p.x + g.z*p.y + g.w;
    float q = max(4.0*g.x*f + 1.0, 0.0);
    d = min(d, 2.0*abs(f)/(1.0 + sqrt(q)));
  }
  oSteps = steps; oLogJ = logJ; oLast = last; oTrap = trap; oD = d; oEsc = escaped;
  oAng = atan(p.y, p.x);
}
#endif
#endif

/* ------------------------------------------------------------------ */
#if FORM == 1
/* Pair k: circle (P, r) and (Q, s), g(z) = Q + r s u/(z - P). Inside Q's
   circle pull back by g^-1, inside P's push out by g. */
vec2 cdivu(vec2 u, vec2 z){ float m = dot(z, z); return vec2(u.x*z.x + u.y*z.y, u.y*z.x - u.x*z.y)/m; }
void orbit(vec2 p0, float logJ0){
  vec2 p = p0;
  float logJ = logJ0, steps = 0.0, last = 0.0, trap = 1e9;
  bool escaped = false;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    bool moved = false;
    for(int k = 0; k < NP; k++){
      if(k >= uNumP) break;
      vec4 A = uPair[2*k], B = uPair[2*k + 1];
      vec2 u = vec2(A.w, B.w);
      float rs = A.z*B.z;
      vec2 dq = p - B.xy;
      float mq = dot(dq, dq);
      if(mq < B.z*B.z){
        p = A.xy + rs*cdivu(u, dq);
        logJ += log(mq/rs);
        steps += 1.0; last = float(2*k + 1); moved = true;
        continue;
      }
      vec2 dp = p - A.xy;
      float mp = dot(dp, dp);
      if(mp < A.z*A.z){
        p = B.xy + rs*cdivu(u, dp);
        logJ += log(mp/rs);
        steps += 1.0; last = float(2*k); moved = true;
      }
    }
    trap = min(trap, length(p));
    if(!moved){ escaped = true; break; }
  }
  float d = 1e9;
  for(int k = 0; k < NP; k++){
    if(k >= uNumP) break;
    vec4 A = uPair[2*k], B = uPair[2*k + 1];
    d = min(d, abs(length(p - A.xy) - A.z));
    d = min(d, abs(length(p - B.xy) - B.z));
  }
  oSteps = steps; oLogJ = logJ; oLast = last; oTrap = trap; oD = d; oEsc = escaped;
  oAng = atan(p.y, p.x);
}
#endif

/* ------------------------------------------------------------------ */
#if FORM == 2
/* Maskit group a(z) = mu + 1/z, b(z) = z + 2, extended by the half-turn
   s(z) = mu - z (which normalises it: s a s = a^-1, s b s = b^-1). Each step
   wraps by a power of b into the slanted strip, flips the upper half by s,
   then applies a. Outside 0 <= Im z <= Im mu is ordinary; a period-two
   cycle means the point has reached the fundamental domain. Validated
   against the depth-first limit set in tests/math.test.mjs. */
void orbit(vec2 p0, float logJ0){
  vec2 z = uCam.xy + uCam.z*p0;
  float logJ = logJ0 - log(uCam.z), steps = 0.0, last = 0.0, trap = 1e9;
  float sh = uMu.x/uMu.y;
  vec2 zp = vec2(1e9), zpp = vec2(1e9);
  bool escaped = false;
  float d = 1e9;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    float u = z.x - sh*z.y;
    u -= 2.0*floor((u + 1.0)*0.5);
    z.x = u + sh*z.y;
    if(z.y < 0.0 || z.y > uMu.y){
      escaped = true; d = min(abs(z.y), abs(z.y - uMu.y)); last += 2.0; break;
    }
    if(z.y > uMu.y*0.5){ z = uMu - z; last = 1.0 - last; }
    float r2 = dot(z, z);
    z = vec2(z.x, -z.y)/r2 + uMu;
    logJ += log(r2);
    steps += 1.0;
    trap = min(trap, length(z - 0.5*uMu));
    vec2 dz = z - zpp;
    if(dot(dz, dz) < 1e-9){
      escaped = true;
      d = min(min(abs(length(z) - 1.0), abs(length(z - uMu) - 1.0)), min(z.y, uMu.y - z.y));
      break;
    }
    zpp = zp; zp = z;
  }
  oSteps = steps; oLogJ = logJ; oLast = last; oTrap = trap; oD = max(d, 0.0); oEsc = escaped;
  oAng = atan(z.y - 0.5*uMu.y, z.x - 0.5*uMu.x);
}
#endif

/* ------------------------------------------------------------------ */
vec3 colorize(vec2 fc){
  float px = 2.0/uFull.y;
  float logDE = log(max(oD, 1e-30)) + oLogJ;
  float w = max(uLineW, 0.0001)*px;
  float rr = exp(clamp(logDE - log(w), -40.0, 40.0));
#ifdef RELIEF
  float h = oEsc ? sqrt(min(rr*uLineW, 4000.0)) : 0.0;
  vec2 gd = vec2(dFdx(h), dFdy(h));
#endif
  if(!oEsc) return uSet;
  float t;
  if(uCMode == 0)      t = oSteps*0.045*uCyc + uHue;
  else if(uCMode == 1) t = oLogJ*0.045*uCyc + uHue;
  else if(uCMode == 2) t = oLast*0.17*uCyc + oSteps*0.006 + uHue;
  else if(uCMode == 3) t = -logDE*0.16*uCyc + uHue;
  else if(uCMode == 4) t = oTrap*1.7*uCyc + uHue;
  else if(uCMode == 5) t = oAng*0.15915494*uCyc + uHue;
  else if(uCMode == 6) t = mod(oSteps, 2.0)*0.5*uCyc + oSteps*0.004 + uHue;
  else                 t = log(1.0 + oSteps)*0.4*uCyc + uHue;
  vec3 col = mix(uBG, pal(t), uFill);
#ifdef RELIEF
  vec3 n = normalize(vec3(-gd*uRelief, 1.0));
  vec3 L = normalize(vec3(cos(uReliefAng), sin(uReliefAng), 0.9));
  float lam = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);
  col = col*(0.35 + 0.8*lam) + spec*0.25*min(uRelief, 1.0);
#endif
  float line = 1.0 - smoothstep(0.55, 1.45, rr);
  col = mix(col, uLine, line*step(0.0001, uLineW));
  col += pal(t + 0.5)*uGlow/(1.0 + rr*rr*0.05);
  return col;
}

void main(){
  vec2 fc = gl_FragCoord.xy + uOff;
  vec2 p = (2.0*fc - uFull)/uFull.y;
  float logJ0 = 0.0;
#ifdef GINV
  vec2 dv = p - uGinv.xy;
  float m = max(dot(dv, dv), 1e-30);
  p = uGinv.xy + dv*(uGinv.z*uGinv.z)/m;
  logJ0 = log(m/(uGinv.z*uGinv.z));
#endif
  orbit(p, logJ0);
  gl_FragColor = vec4(colorize(fc), 1.0);
}
`;
}
