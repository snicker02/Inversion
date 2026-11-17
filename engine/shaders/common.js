/* GLSL fragments shared by the plane and space shaders. */

export const VS = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/* cosine palette + per-pixel hash */
export const PALETTE = `
uniform vec3 uPa, uPb, uPc, uPd;
vec3 pal(float t){ return clamp(uPa + uPb*cos(6.28318530718*(uPc*t + uPd)), 0.0, 1.0); }
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx)*0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y)*p3.z);
}
`;

/* Two-float (df64) arithmetic: ~48 bits of mantissa from a pair of
   float32s. The orbit leaves the zoom window on its first reflection, so
   the point has to carry enough digits to represent the whole plane at
   pixel resolution; recentring cannot fix that, only more bits can. */
export const DF64 = `
vec2 dsAdd(vec2 a, vec2 b){
  float t1 = a.x + b.x;
  float e  = t1 - a.x;
  float t2 = ((b.x - e) + (a.x - (t1 - e))) + (a.y + b.y);
  float hi = t1 + t2;
  return vec2(hi, t2 - (hi - t1));
}
vec2 dsMul(vec2 a, vec2 b){
  float cona = a.x*4097.0, conb = b.x*4097.0;
  float a1 = cona - (cona - a.x), b1 = conb - (conb - b.x);
  float a2 = a.x - a1,            b2 = b.x - b1;
  float c11 = a.x*b.x;
  float c21 = a2*b2 - (((c11 - a1*b1) - a2*b1) - a1*b2);
  float c2  = a.x*b.y + a.y*b.x;
  float t1 = c11 + c2;
  float e  = t1 - c11;
  float t2 = ((c2 - e) + (c11 - (t1 - e))) + c21 + a.y*b.y;
  float hi = t1 + t2;
  return vec2(hi, t2 - (hi - t1));
}
vec2 dsDiv(vec2 a, vec2 b){
  vec2 q = vec2(a.x/b.x, 0.0);
  vec2 r = dsAdd(a, -dsMul(q, b));
  q = dsAdd(q, vec2(r.x/b.x, 0.0));
  r = dsAdd(a, -dsMul(q, b));
  return dsAdd(q, vec2(r.x/b.x, 0.0));
}
vec2 dsF(vec2 A, vec2 B, vec2 C, vec2 D, vec2 px, vec2 py){
  return dsAdd(dsAdd(dsMul(A, dsAdd(dsMul(px,px), dsMul(py,py))), dsMul(B,px)),
               dsAdd(dsMul(C,py), D));
}
`;
