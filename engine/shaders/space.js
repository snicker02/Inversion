/* Space (3D) ray-marched fragment shader, assembled per formula.

   form 0  Apollonian sphere packing: reflect in the dual spheres, measure
           distance to the seeds (Liouville: the map is conformal, so the
           estimate is exact).
   form 1  Pseudo-Kleinian (knighty): box fold, then sphere inversion.
   form 2  Lattice Apollonian (after iq): fold into a cubic cell, invert.
   form 3  Kleinian (Maskit) in upper half-space: the Poincare extension of
           a(z) = mu + 1/z and b(z) = z + 2, with the same strip algorithm as
           the plane view; surfaces are the images of the strip walls.

   Every DE sets gSteps, gLogJ, gLast, gTrap so colouring is shared. */
import { PALETTE } from "./common.js";

export const NS = 12;

export function spaceKey(o) { return `s${o.form}|${o.ginv ? 1 : 0}`; }

export function spaceFS(o) {
  const D = [`#define FORM ${o.form}`];
  if (o.ginv) D.push("#define GINV 1");
  return `precision highp float;
${D.join("\n")}
#define NS ${NS}
#define MAXI 400
#define MARCH 600

uniform vec2  uFull, uOff;
uniform int   uMaxIter, uMarch, uCMode, uShadowOn;
uniform vec3  uEye, uRight, uUp, uFwd;
uniform float uFov, uStep, uFar, uDetail;
uniform float uLens, uFocus, uSeed;
uniform vec3  uLight, uLightCol;
uniform float uAO, uAOR, uSpec, uShine, uFog, uShadowK, uAmb, uRim, uHead;
uniform float uCyc, uHue, uFill, uGlow, uExposure;
uniform vec3  uBg0, uBg1, uCenter;
uniform vec4  uGinv;
uniform vec4  uCut;       /* section plane: normal, offset (w > 1e3 = off) */
${PALETTE}

float gSteps, gLogJ, gLast, gTrap;

#if FORM == 0
uniform float uA3[NS];
uniform vec4  uG3[NS];     /* reflect set: the dual spheres */
uniform float uAD[NS];
uniform vec4  uGD[NS];     /* drawn set: the seed spheres */
uniform int   uNum, uNumD, uSkipShell;
uniform vec4  uShellG;     /* enclosing sphere (b, c, e, d) and its a */
uniform float uShellA;
float DEf(vec3 p){
  float logJ = 0.0; gSteps = 0.0; gTrap = 1e9; gLast = 0.0;
  /* cut-away: a point that starts outside the enclosing sphere never sees
     it (the group maps that exterior to itself); everything else still
     sees the shell's images */
  bool skipShell = uSkipShell == 1 && (uShellA*dot(p, p) + dot(uShellG.xyz, p) + uShellG.w) < 0.0;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    bool moved = false;
    for(int j = 0; j < NS; j++){
      if(j >= uNum) break;
      float a = uA3[j]; vec4 g = uG3[j];
      float f = a*dot(p, p) + g.x*p.x + g.y*p.y + g.z*p.z + g.w;
      if(f < 0.0){
        float den = max(4.0*a*f + 1.0, 1e-20);
        p = (p - 2.0*f*g.xyz)/den;
        if(!(max(max(abs(p.x), abs(p.y)), abs(p.z)) < 1e15)) p = vec3(1e15, 0.0, 0.0);
        logJ += log(den); gSteps += 1.0; gLast = float(j); moved = true;
      }
    }
    gTrap = min(gTrap, length(p));
    if(!moved) break;
  }
  float d = 1e9;
  for(int j = 0; j < NS; j++){
    if(j >= uNumD) break;
    /* cut-away: drop the enclosing sphere itself, but keep its images */
    if(skipShell && j == uNumD - 1) continue;
    float a = uAD[j]; vec4 g = uGD[j];
    float f = a*dot(p, p) + g.x*p.x + g.y*p.y + g.z*p.z + g.w;
    float q = max(4.0*a*f + 1.0, 0.0);
    /* signed: negative inside a seed, so the spheres are solid */
    d = min(d, 2.0*f/(1.0 + sqrt(q)));
  }
  gLogJ = logJ;
  return d*exp(min(logJ, 60.0));
}
#endif

#if FORM == 1
uniform vec3  uCSize, uKC;
uniform float uKSize, uThick;
float DEf(vec3 p){
  float scale = 1.0; gSteps = 0.0; gTrap = 1e9; gLast = 0.0;
  p = p.xzy;   /* the structure is a sheet in xy: turn it into a floor */
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    p = 2.0*clamp(p, -uCSize, uCSize) - p;
    float r2 = dot(p, p);
    float k = max(uKSize/r2, 1.0);
    if(k > 1.0) gLast += 1.0;
    p *= k; scale *= k;
    p += uKC;
    gSteps += 1.0;
    gTrap = min(gTrap, r2);
  }
  gLogJ = log(scale);
  float rxy = length(p.xy);
  return max(rxy - uThick, abs(rxy*p.z)/length(p))/scale;
}
#endif

#if FORM == 2
uniform float uLatS, uThick, uLatShape;
float DEf(vec3 p){
  float scale = 1.0; gSteps = 0.0; gTrap = 1e9; gLast = 0.0;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    p = -1.0 + 2.0*fract(0.5*p + 0.5);
    float r2 = dot(p, p);
    gTrap = min(gTrap, r2);
    float k = uLatS/r2;
    p *= k; scale *= k;
    gSteps += 1.0;
    if(r2 < 0.5) gLast += 1.0;
  }
  gLogJ = log(scale);
  float slab = abs(p.y) - uThick;
  float tube = length(p.xz) - uThick;
  return 0.25*mix(slab, min(slab, tube), uLatShape)/scale;
}
#endif

#if FORM == 3
uniform vec2  uMu;
uniform float uWrapZ, uThick;
float DEf(vec3 p){
  float logJ = 0.0; gSteps = 0.0; gTrap = 1e9; gLast = 0.0;
  float sh = uMu.x/uMu.y;
  vec3 zp = vec3(1e9), zpp = vec3(1e9);
  float d = 0.0; bool done = false;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    float u = p.x - sh*p.y;
    u -= 2.0*floor((u + 1.0)*0.5);
    p.x = u + sh*p.y;
    if(uWrapZ > 0.0) p.z -= 2.0*uWrapZ*floor((p.z + uWrapZ)/(2.0*uWrapZ));
    if(p.y < 0.0 || p.y > uMu.y){ d = -min(abs(p.y), abs(p.y - uMu.y)); done = true; gLast += 2.0; break; }
    if(p.y > uMu.y*0.5){ p.xy = uMu - p.xy; gLast = 1.0 - mod(gLast, 2.0); }
    float r2 = dot(p, p);
    p = vec3(p.x, -p.y, p.z)/r2;
    p.xy += uMu;
    logJ += log(r2);
    gSteps += 1.0;
    gTrap = min(gTrap, length(p.xy - 0.5*uMu));
    vec3 dz = p - zpp;
    if(dot(dz, dz) < 1e-9){
      /* fundamental domain: bound by the walls only (the unit spheres are
         domain boundaries, not surfaces); clamped as knighty does */
      d = min(min(p.y, uMu.y - p.y), 0.3);
      done = true; break;
    }
    zpp = zp; zp = p;
  }
  gLogJ = logJ;
  return (d - uThick)*min(exp(min(logJ, 60.0)), 0.5);
}
#endif

float DE(vec3 p){
#ifdef GINV
  vec3 dv = p - uGinv.xyz;
  float m = max(dot(dv, dv), 1e-30);
  float r2 = uGinv.w*uGinv.w;
  float d = DEf(uGinv.xyz + dv*r2/m)*m/r2;
#else
  float d = DEf(p);
#endif
  /* section plane: keep the half-space behind it */
  return max(d, dot(p - uCenter, uCut.xyz) - uCut.w);
}

vec3 normalAt(vec3 p, float h){
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy*DE(p + k.xyy*h) + k.yyx*DE(p + k.yyx*h) +
                   k.yxy*DE(p + k.yxy*h) + k.xxx*DE(p + k.xxx*h));
}
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax){
  float res = 1.0, t = tmin;
  for(int i = 0; i < 64; i++){
    float h = DE(ro + rd*t);
    res = min(res, uShadowK*h/t);
    t += clamp(h*uStep*1.6, tmin*0.5, tmax*0.08);
    if(res < 0.002 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}
float ambientOcc(vec3 p, vec3 n, float scale){
  float occ = 0.0, w = 1.0;
  for(int i = 1; i <= 5; i++){
    float h = scale*float(i)/5.0;
    occ += (h - DE(p + n*h))*w;
    w *= 0.7;
  }
  return clamp(1.0 - uAO*occ/scale*1.6, 0.0, 1.0);
}
vec3 background(vec3 dir){
  float t = clamp(0.5 + 0.5*dir.y, 0.0, 1.0);
  return mix(uBg1, uBg0, t);
}

vec3 render(vec2 fc){
  vec2 uv = (fc - 0.5*uFull)/uFull.y;
  vec3 dir = normalize(uFwd*uFov + uRight*uv.x + uUp*uv.y);
  vec3 ro = uEye;
  if(uLens > 0.0){
    float r1 = hash12(fc + uSeed*13.17), r2 = hash12(fc*1.31 + uSeed*7.91 + 3.3);
    float ang = 6.28318530718*r1, rad = sqrt(r2)*uLens;
    vec3 focusP = uEye + dir*(uFocus/max(dot(dir, uFwd), 1e-3));
    ro = uEye + (uRight*cos(ang) + uUp*sin(ang))*rad;
    dir = normalize(focusP - ro);
  }
  float pix = 1.0/(uFull.y*uFov);
  float t = 0.0, de = 1.0, marched = 0.0;
  bool hit = false;
  for(int i = 0; i < MARCH; i++){
    if(i >= uMarch) break;
    vec3 P = ro + dir*t;
    if(length(P - uCenter) > uFar) break;
    de = DE(P);
    float eps = max(pix*t*uDetail, 1e-7);
    if(de < eps){ hit = true; break; }
    t += max(de, eps*0.25)*uStep;
    marched += 1.0;
  }
  vec3 bg = background(dir);
  float glow = uGlow*pow(marched/float(uMarch), 2.0);
  if(!hit) return bg + pow(pal(uHue + 0.25), vec3(2.2))*glow;

  vec3 P = ro + dir*t;
  float eps = max(pix*t*uDetail, 1e-7);
  vec3 n = normalAt(P, eps*1.5);
  DE(P);  /* restore orbit data at the hit */
  float steps = gSteps, logJ = gLogJ, last = gLast, trap = gTrap;
  float tk;
  if(uCMode == 0)      tk = steps*0.045*uCyc + uHue;
  else if(uCMode == 1) tk = logJ*0.045*uCyc + uHue;
  else if(uCMode == 2) tk = last*0.17*uCyc + steps*0.006 + uHue;
  else if(uCMode == 3) tk = length(P - uCenter)*0.6*uCyc + uHue;
  else if(uCMode == 4) tk = trap*1.7*uCyc + uHue;
  else if(uCMode == 5) tk = atan(n.z, n.x)*0.159*uCyc + n.y*0.25 + uHue;
  else if(uCMode == 6) tk = mod(steps, 2.0)*0.5*uCyc + steps*0.004 + uHue;
  else                 tk = log(1.0 + steps)*0.4*uCyc + uHue;
  vec3 base = mix(vec3(0.35), pow(pal(tk), vec3(2.2)), uFill);

  vec3 L = normalize(uLight);
  vec3 Po = P + n*eps*2.0;
  float sh = 1.0;
  float dif = max(dot(n, L), 0.0);
  if(uShadowOn > 0 && dif > 0.0) sh = softShadow(Po, L, eps*4.0, uFar*0.6);
  float ao = ambientOcc(Po, n, uAOR*max(t, 0.02));
  vec3 hv = normalize(L - dir);
  float spec = pow(max(dot(n, hv), 0.0), uShine)*uSpec*sh*dif;
  float fres = pow(1.0 - max(dot(n, -dir), 0.0), 4.0);
  /* key light (shadowed), hemisphere ambient, and a camera fill light that
     still reaches surfaces inside closed scenes such as the sphere packing */
  float hemi = 0.55 + 0.45*n.y;
  float head = max(dot(n, -dir), 0.0);
  vec3 col = base*(uAmb*ao*hemi + dif*sh*uLightCol + uHead*head*ao);
  col += spec*uLightCol + fres*uRim*ao*base;
  col += pow(pal(tk + 0.5), vec3(2.2))*glow;
  float fog = exp(-t*uFog);
  return mix(bg, col, fog);
}

void main(){
  vec2 fc = gl_FragCoord.xy + uOff;
  vec3 c = render(fc)*uExposure;
  c = c/(1.0 + c*0.25);                      /* soft shoulder */
  gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(0.4545)), 1.0);
}
`;
}
