/* Space (3D) ray-marched fragment shader, assembled per formula.

   form 0  Apollonian sphere packing: reflect in the dual spheres, measure
           signed distance to the seeds (Liouville: the map is conformal, so
           the estimate is exact).
   form 1  Pseudo-Kleinian (knighty / Mandelbulber): box fold, then sphere
           inversion; base shape is a disc of radius uThick.
   form 2  Lattice Apollonian (after iq): fold into a cubic cell, invert.
   form 3  Kleinian (Maskit) in upper half-space: the Poincare extension of
           a(z) = mu + 1/z and b(z) = z + 2; surfaces are the strip walls and
           their images.

   Lighting has three modes, all accumulated progressively:
     0 preview  - direct sun without shadows, cheap occlusion (interaction)
     1 studio   - soft shadows, distance-estimate occlusion, sky ambient
     2 path     - Monte Carlo: jittered sun with hard shadow rays (soft
                  penumbrae from the sun's disc), cosine-weighted sky bounces;
                  converges to real occlusion and inter-reflection
   Output is linear HDR when the accumulator is floating point; the present
   pass then applies ACES tone mapping and gamma after averaging.

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
#define MARCH2 160

uniform vec2  uFull, uOff;
uniform int   uMaxIter, uMarch, uCMode, uShadowOn, uRMode, uBounces, uLinear, uBackdrop;
uniform vec3  uEye, uRight, uUp, uFwd;
uniform float uFov, uStep, uFar, uDetail;
uniform float uLens, uFocus, uSeed;
uniform vec3  uLight, uSunCol, uSkyZen, uSkyHor, uGround, uBgA, uBgB;
uniform float uSunSize, uSkyI;
uniform vec3  uLampPos, uLampCol;   /* point lamp for closed scenes; col 0 = off */
uniform float uLampOn;
uniform float uAO, uAOR, uSpec, uShine, uFog, uShadowK, uAmb, uRim, uHead;
uniform float uCyc, uHue, uFill, uGlow, uExposure;
uniform vec3  uCenter;
uniform vec4  uGinv;
uniform vec4  uCut;       /* section plane: normal, offset (w > 1e3 = off) */
${PALETTE}

float gSteps, gLogJ, gLast, gTrap;

#if FORM == 0
uniform float uA3[NS];
uniform vec4  uG3[NS];     /* reflect set: the dual spheres */
uniform float uAD[NS];
uniform vec4  uGD[NS];     /* drawn set: the seed spheres */
uniform int   uNum, uNumD, uSkipOn, uSkipIdx;
uniform vec4  uSkipG;      /* the hollowed sphere (b, c, e, d) and its a */
uniform float uSkipA;
float DEf(vec3 p){
  float logJ = 0.0; gSteps = 0.0; gTrap = 1e9; gLast = 0.0;
  /* Hollowing: a point that starts inside the hollowed sphere (for the
     shell: outside it) is mapped by the duals to itself's side, so it never
     sees that sphere -- but every IMAGE of the sphere is still solid. This
     opens a chamber whose walls are the tangent neighbours. */
  bool skip = uSkipOn == 1 && (uSkipA*dot(p, p) + dot(uSkipG.xyz, p) + uSkipG.w) < 0.0;
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
    if(skip && j == uSkipIdx) continue;
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
uniform float uWrapZ, uThick, uFloor;
float DEf(vec3 pw){
  float logJ = 0.0; gSteps = 0.0; gTrap = 1e9; gLast = 0.0;
  /* model axes: x periodic, y across the strip, z the half-space height.
     The world is turned so height is up and the strip walls stand
     vertical: a corridor of domes open to the sky. */
  vec3 p = pw.xzy;
  /* Everything solid is either a wall (outside the strip) or a wall image,
     and the images are spheres of radius at most 1 centred on the boundary
     plane. Above that height the distance is at least min(wall, height-1):
     a rigorous bound that lets rays cross open sky quickly, where the
     clamped domain bound below would crawl. */
  float hFar = abs(p.z) - 1.0;
  float farB = hFar > 0.0 ? min(min(p.y, uMu.y - p.y), hFar) : 0.0;
  float sh = uMu.x/uMu.y;
  vec3 zp = vec3(1e9), zpp = vec3(1e9);
  float d = 0.0;
  for(int i = 0; i < MAXI; i++){
    if(i >= uMaxIter) break;
    float u = p.x - sh*p.y;
    u -= 2.0*floor((u + 1.0)*0.5);
    p.x = u + sh*p.y;
    if(uWrapZ > 0.0) p.z -= 2.0*uWrapZ*floor((p.z + uWrapZ)/(2.0*uWrapZ));
    if(p.y < 0.0 || p.y > uMu.y){ d = -min(abs(p.y), abs(p.y - uMu.y)); gLast += 2.0; break; }
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
      break;
    }
    zpp = zp; zp = p;
  }
  gLogJ = logJ;
  float de = (d - uThick)*min(exp(min(logJ, 60.0)), 0.5);
  de = max(de, farB);
  /* the boundary plane of half-space as a floor the domes stand on */
  if(uFloor > 0.5 && pw.y < de){ gSteps = 0.0; gLast = 3.0; gTrap = 0.0; gLogJ = 0.0; de = pw.y; }
  return de;
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

/* ------------------------------------------------------------------ */
/* random numbers: a fresh stream per pixel, per sample, per draw */
float gRnd;
float rnd(vec2 fc){
  gRnd += 1.0;
  return hash12(fc*0.917 + vec2(uSeed*17.137 + gRnd*3.731, uSeed*7.913 + gRnd*11.17));
}

/* Sphere tracing. Returns t; hit says whether a surface was reached. A ray
   that runs out of steps very close to the surface counts as a hit rather
   than leaking through to the backdrop (the classic source of speckle). */
float trace(vec3 ro, vec3 rd, float eps0, float pixK, int maxSteps, out bool hit, out float steps){
  float t = 0.0, d = 1e9, eps = eps0;
  hit = false; steps = 0.0;
  for(int i = 0; i < MARCH; i++){
    if(i >= maxSteps) break;
    vec3 P = ro + rd*t;
    if(length(P - uCenter) > uFar) return t;
    d = DE(P);
    eps = max(eps0 + pixK*t, 1e-7);
    if(d < eps){ hit = true; return t; }
    t += max(d, eps*0.3)*uStep;
    steps += 1.0;
  }
  /* only a ray that is genuinely at the surface when its steps run out;
     clamped estimates (Kleinian) sit at a fixed floor in empty space */
  hit = d < eps*2.0;
  return t;
}

vec3 normalAt(vec3 p, float h){
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy*DE(p + k.xyy*h) + k.yyx*DE(p + k.yyx*h) +
                   k.yxy*DE(p + k.yxy*h) + k.xxx*DE(p + k.xxx*h));
}
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k){
  float res = 1.0, t = tmin, ph = 1e10;
  for(int i = 0; i < 80; i++){
    float h = DE(ro + rd*t);
    /* improved penumbra estimate (Aaltonen) */
    float y = h*h/(2.0*ph);
    float dd = sqrt(max(h*h - y*y, 0.0));
    res = min(res, k*dd/max(t - y, 1e-6));
    ph = h;
    t += clamp(h*uStep, tmin*0.5, tmax*0.06);
    if(res < 0.001 || t > tmax) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res*res*(3.0 - 2.0*res);
}
float ambientOcc(vec3 p, vec3 n, float scale, int taps){
  float occ = 0.0, w = 1.0, wsum = 0.0;
  for(int i = 1; i <= 5; i++){
    if(i > taps) break;
    float h = scale*float(i)/float(taps);
    occ += clamp((h - DE(p + n*h))/h, 0.0, 1.0)*w;
    wsum += w;
    w *= 0.75;
  }
  return clamp(1.0 - uAO*occ/wsum, 0.0, 1.0);
}

/* environment: a sky that lights the scene, and a backdrop camera rays see */
vec3 skyCol(vec3 rd){
  float y = rd.y;
  vec3 c = y > 0.0 ? mix(uSkyHor, uSkyZen, pow(y, 0.55)) : mix(uSkyHor, uGround, pow(-y, 0.4));
  return c*uSkyI;
}
vec3 sunDisc(vec3 rd){
  float c = dot(rd, normalize(uLight));
  return uSunCol*(smoothstep(cos(uSunSize*1.6), cos(uSunSize*0.8), c)*6.0 + pow(max(c, 0.0), 180.0)*0.4);
}
vec3 backdrop(vec3 rd){
  if(uBackdrop == 1){
    float t = clamp(0.5 + 0.5*rd.y, 0.0, 1.0);
    return mix(uBgB, uBgA, t);
  }
  return skyCol(rd) + sunDisc(rd);
}

vec3 albedoAt(vec3 P, vec3 n){
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
  /* linear albedo, kept below 0.85 so multiple bounces stay energy-stable */
  return mix(vec3(0.5), pow(pal(tk), vec3(2.2)), uFill)*0.85 + 0.02;
}
float glossy(vec3 n, vec3 L, vec3 rd){
  vec3 h = normalize(L - rd);
  /* normalised Blinn-Phong lobe */
  return pow(max(dot(n, h), 0.0), uShine)*(uShine + 8.0)/25.1327;
}

/* Direct sun for the path tracer: deterministic penumbra estimate whose
   width follows the sun's angular size. Sampling the disc with hard shadow
   rays is exact but converges to salt noise far more slowly; the Monte
   Carlo budget is spent on sky occlusion and inter-reflection instead. */
vec3 sunSoft(vec3 P, vec3 n, vec3 rd, vec3 alb, float eps, bool spec){
  vec3 L = normalize(uLight);
  float ndl = dot(n, L);
  if(ndl <= 0.0) return vec3(0.0);
  float k = clamp(1.0/tan(uSunSize), 2.0, 80.0);
  float sh = softShadow(P, L, eps*6.0, uFar*0.6, k);
  vec3 c = alb*ndl;
  if(spec) c += vec3(uSpec*glossy(n, L, rd)*ndl);
  return c*uSunCol*sh;
}
/* point lamp: inverse-square falloff and a shadow ray (path) or a
   penumbra estimate (studio) */
vec3 lamp(vec3 P, vec3 n, vec3 rd, vec3 alb, float eps, bool stochastic, bool spec){
  if(uLampOn < 0.5) return vec3(0.0);
  vec3 Ld = uLampPos - P;
  float dist = length(Ld);
  vec3 L = Ld/dist;
  float ndl = dot(n, L);
  if(ndl <= 0.0) return vec3(0.0);
  float sh;
  if(stochastic){
    bool hit; float st;
    float th = trace(P + n*eps*3.0, L, eps, 0.0, MARCH2, hit, st);
    sh = (hit && th < dist - eps*4.0) ? 0.0 : 1.0;
  } else {
    sh = uShadowOn > 0 ? softShadow(P + n*eps*2.0, L, eps*6.0, dist*0.98, uShadowK) : 1.0;
  }
  vec3 c = alb*ndl;
  if(spec) c += vec3(uSpec*glossy(n, L, rd)*ndl);
  return c*uLampCol*sh/(dist*dist + 0.02);
}
vec3 cosDir(vec3 n, vec2 fc){
  float a = 6.28318530718*rnd(fc), r2 = rnd(fc), r = sqrt(r2);
  vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  return normalize(t*cos(a)*r + b*sin(a)*r + n*sqrt(max(1.0 - r2, 0.0)));
}

vec3 render(vec2 fc){
  gRnd = 0.0;
  vec2 uv = (fc - 0.5*uFull)/uFull.y;
  vec3 dir = normalize(uFwd*uFov + uRight*uv.x + uUp*uv.y);
  vec3 ro = uEye;
  if(uLens > 0.0){
    float ang = 6.28318530718*rnd(fc), rad = sqrt(rnd(fc))*uLens;
    vec3 focusP = uEye + dir*(uFocus/max(dot(dir, uFwd), 1e-3));
    ro = uEye + (uRight*cos(ang) + uUp*sin(ang))*rad;
    dir = normalize(focusP - ro);
  }
  float pix = uDetail/(uFull.y*uFov);
  bool hit; float marched;
  float t = trace(ro, dir, 0.0, pix, uMarch, hit, marched);
  vec3 bg = backdrop(dir);
  float glow = uGlow*pow(marched/float(uMarch), 2.0);
  vec3 glowCol = pow(pal(uHue + 0.25), vec3(2.2));
  if(!hit) return bg + glowCol*glow;

  vec3 P = ro + dir*t;
  float eps = max(pix*t, 1e-7);
  vec3 n = normalAt(P, eps*2.0);
  if(dot(n, dir) > 0.0) n = normalize(n - dir*dot(n, dir)*1.01);  /* grazing normals */
  DE(P);  /* restore orbit data at the hit */
  vec3 alb = albedoAt(P, n);
  vec3 Po = P + n*eps*2.0;
  vec3 L = normalize(uLight);
  float ndv = max(dot(n, -dir), 0.0);
  float fres = pow(1.0 - ndv, 5.0);
  vec3 col = vec3(0.0);

  if(uRMode == 2){
    /* ---- path traced ---- */
    col += sunSoft(Po, n, dir, alb, eps, true);
    col += lamp(Po, n, dir, alb, eps, false, true);
    vec3 thr = alb, pp = Po, nn = n, rdd = dir;
    float e2 = eps;
    for(int b = 0; b < 3; b++){
      if(b >= uBounces) break;
      vec3 d2 = cosDir(nn, fc);
      bool h2; float s2;
      float t2 = trace(pp + nn*e2*2.0, d2, e2, 0.0, MARCH2, h2, s2);
      if(!h2){ col += min(thr*skyCol(d2), vec3(1.5)); break; }
      vec3 P2 = pp + nn*e2*2.0 + d2*t2;
      e2 = max(e2, eps*0.5 + t2*pix*0.5);
      vec3 n2 = normalAt(P2, e2*2.0);
      if(dot(n2, d2) > 0.0) n2 = -n2;
      DE(P2);
      vec3 a2 = albedoAt(P2, n2);
      /* firefly clamp on indirect light */
      col += min(thr*(sunSoft(P2 + n2*e2*2.0, n2, d2, a2, e2, false) +
                      lamp(P2 + n2*e2*2.0, n2, d2, a2, e2, false, false)), vec3(1.5));
      thr *= a2;
      pp = P2 + n2*e2*2.0; nn = n2; rdd = d2;
    }
    /* sheen: sky reflected at grazing angles, faded by local occlusion */
    col += fres*uRim*skyCol(reflect(dir, n))*ambientOcc(Po, n, uAOR*max(t, 0.02), 2);
  } else {
    /* ---- studio (1) / preview (0) ---- */
    bool full = uRMode == 1;
    float ndl = max(dot(n, L), 0.0);
    float sh = 1.0;
    if(full && uShadowOn > 0 && ndl > 0.0) sh = softShadow(Po, L, eps*6.0, uFar*0.6, uShadowK);
    float ao = ambientOcc(Po, n, uAOR*max(t, 0.02), full ? 5 : 2);
    /* hemisphere sky irradiance */
    vec3 irr = mix(mix(uSkyHor, uGround, 0.5), mix(uSkyHor, uSkyZen, 0.6), 0.5 + 0.5*n.y)*uSkyI;
    col = alb*(uAmb*ao*irr*2.0 + ndl*sh*uSunCol);
    col += uSpec*glossy(n, L, dir)*ndl*sh*uSunCol;
    col += fres*uRim*ao*skyCol(reflect(dir, n));
    col += lamp(Po, n, dir, alb, eps, false, true)*(full ? 1.0 : 0.0);
    if(!full && uLampOn > 0.5){
      vec3 Ld = uLampPos - P; float dl = length(Ld);
      col += alb*max(dot(n, Ld/dl), 0.0)*uLampCol/(dl*dl + 0.02)*ao;
    }
  }
  /* camera fill: reaches inside closed scenes (the shell drawn) */
  col += alb*uHead*ndv*ndv;
  col += glowCol*glow;
  float fog = exp(-t*uFog);
  return mix(uBackdrop == 1 ? uBgB : skyCol(dir), col, fog);
}

vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }

void main(){
  vec2 fc = gl_FragCoord.xy + uOff;
  vec3 c = max(render(fc), 0.0)*uExposure;
  if(uLinear == 1) gl_FragColor = vec4(min(c, vec3(64.0)), 1.0);
  else gl_FragColor = vec4(pow(aces(c), vec3(0.4545)), 1.0);
}
`;
}
