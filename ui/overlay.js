/* Handles and guides drawn over the render. */
import * as M from "../engine/planeModel.js";
import { camBasis, project3 } from "../engine/render3d.js";

const TAU = Math.PI * 2;
const PAIR_HUES = ["#7ce0d3", "#e8b163", "#d58cf0", "#8fb8ff", "#f08c8c", "#b6e07c"];

export function w2s(cam, x, y, VW, VH) {
  const h = VH * 0.5;
  return { x: VW * 0.5 + ((x - cam.x) / cam.s) * h, y: VH * 0.5 - ((y - cam.y) / cam.s) * h };
}
export function s2w(cam, x, y, VW, VH) {
  const h = VH * 0.5;
  return { x: cam.x + ((x - VW * 0.5) / h) * cam.s, y: cam.y - ((y - VH * 0.5) / h) * cam.s };
}

export function drawOverlay(ov, app) {
  const { S, VW, VH, DPR } = app;
  ov.setTransform(DPR, 0, 0, DPR, 0, 0);
  ov.clearRect(0, 0, VW, VH);
  if (!S.handles || app.anim.recording) return;

  if (S.engine === "space") {
    if (S.space.formula !== "apollo" || !S.space.tet) return;
    const B = camBasis(S.space), pts = S.space.tet.map((v) => project3(v, B, VW, VH));
    ov.lineWidth = 1;
    ov.strokeStyle = "rgba(124,224,211,.30)";
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      if (!pts[i] || !pts[j]) continue;
      ov.beginPath(); ov.moveTo(pts[i].x, pts[i].y); ov.lineTo(pts[j].x, pts[j].y); ov.stroke();
    }
    for (const p of pts) {
      if (!p) continue;
      ov.beginPath(); ov.arc(p.x, p.y, 5, 0, TAU);
      ov.fillStyle = "rgba(11,14,18,.85)"; ov.fill();
      ov.strokeStyle = "rgba(232,177,99,.95)"; ov.lineWidth = 1.5; ov.stroke();
    }
    return;
  }
  if (S.engine !== "plane") return;

  const pl = S.plane, cam = pl.cam;
  const dark = S.color.pal !== 11;
  const stroke = dark ? "rgba(124,224,211,.85)" : "rgba(10,40,60,.85)";
  const faint = dark ? "rgba(124,224,211,.22)" : "rgba(10,40,60,.20)";
  const amber = dark ? "rgba(232,177,99,.95)" : "rgba(150,80,10,.95)";
  const P = (x, y) => w2s(cam, x, y, VW, VH);
  const R = (r) => (r / cam.s) * (VH * 0.5);
  function dot(p, fill, r, col) {
    ov.beginPath(); ov.arc(p.x, p.y, r || 4.5, 0, TAU);
    ov.fillStyle = fill ? (col || stroke) : "rgba(0,0,0,.55)"; ov.fill();
    ov.strokeStyle = col || stroke; ov.lineWidth = 1.4; ov.stroke();
  }
  function circle(c, col, dash) {
    const p = P(c.x, c.y), rr = R(c.r);
    if (!(rr < 1e6)) return;
    ov.beginPath(); ov.arc(p.x, p.y, rr, 0, TAU);
    ov.strokeStyle = col; ov.lineWidth = 1;
    ov.setLineDash(dash ? [5, 4] : []); ov.stroke(); ov.setLineDash([]);
  }

  if (M.isInversive(pl.formula)) {
    const cs = M.currentCircles(pl);
    cs.forEach((c, i) => circle(c, pl.formula === "free" && i === pl.freeSel ? amber : faint, c.inside === false));
    if (pl.formula === "apollonian") {
      ov.beginPath();
      pl.tri.forEach((t, i) => { const p = P(t.x, t.y); if (i) ov.lineTo(p.x, p.y); else ov.moveTo(p.x, p.y); });
      ov.closePath(); ov.strokeStyle = faint; ov.lineWidth = 1; ov.stroke();
      pl.tri.forEach((t) => dot(P(t.x, t.y), true));
    } else if (pl.formula === "free") {
      cs.forEach((c, i) => {
        dot(P(c.x, c.y), i === pl.freeSel, 4);
        dot(P(c.x + c.r * 0.7071, c.y + c.r * 0.7071), false, 3.5);
      });
    }
  } else if (M.isSchottky(pl.formula)) {
    const cfg = M.schottkyConfig(pl);
    cfg.pairs.forEach(([a, b], k) => {
      const col = pl.formula === "sfree" ? PAIR_HUES[k % PAIR_HUES.length] : faint;
      const A = cfg.circles[a], B = cfg.circles[b];
      circle(A, pl.formula === "sfree" ? col : faint, false);
      circle(B, pl.formula === "sfree" ? col : faint, true);
      if (pl.formula === "sfree") {
        const pa = P(A.x, A.y), pb = P(B.x, B.y);
        ov.beginPath(); ov.moveTo(pa.x, pa.y); ov.lineTo(pb.x, pb.y);
        ov.strokeStyle = col; ov.globalAlpha = 0.25; ov.setLineDash([2, 4]); ov.stroke(); ov.setLineDash([]); ov.globalAlpha = 1;
        [A, B].forEach((c, j) => {
          const sel = (a + j) === pl.sfreeSel;
          dot(P(c.x, c.y), sel, 4, col);
          dot(P(c.x + c.r * 0.7071, c.y + c.r * 0.7071), false, 3.5, col);
        });
      }
    });
  }
  if (M.isInversive(pl.formula) && pl.mir.on) {
    const p = P(pl.mir.x, pl.mir.y), Lx = Math.max(VW, VH);
    [pl.mir.ang, pl.mir.ang + Math.PI / pl.mir.k].forEach((a) => {
      ov.beginPath();
      ov.moveTo(p.x - Math.cos(a) * Lx, p.y + Math.sin(a) * Lx);
      ov.lineTo(p.x + Math.cos(a) * Lx, p.y - Math.sin(a) * Lx);
      ov.strokeStyle = faint; ov.lineWidth = 1; ov.stroke();
    });
    dot(p, false, 4);
  }
  if (pl.ginv.on) {
    const g = pl.ginv;
    circle(g, amber, true);
    dot(P(g.x, g.y), true, 4, amber);
    dot(P(g.x + g.r * 0.7071, g.y - g.r * 0.7071), false, 3.5, amber);
  }
}

/* what is under a screen point (plane view) */
export function hitPlane(app, sp) {
  const { S, VW, VH } = app, pl = S.plane, cam = pl.cam;
  if (!S.handles) return { kind: "pan" };
  const P = (x, y) => w2s(cam, x, y, VW, VH);
  const near = (p, r) => Math.hypot(p.x - sp.x, p.y - sp.y) < r;
  if (pl.ginv.on) {
    const g = pl.ginv;
    if (near(P(g.x + g.r * 0.7071, g.y - g.r * 0.7071), 12)) return { kind: "grim" };
    if (near(P(g.x, g.y), 13)) return { kind: "gctr" };
  }
  if (pl.formula === "apollonian") for (let i = 0; i < 3; i++) if (near(P(pl.tri[i].x, pl.tri[i].y), 13)) return { kind: "tri", i };
  if (pl.formula === "free") {
    for (let i = pl.free.length - 1; i >= 0; i--) { const c = pl.free[i]; if (near(P(c.x + c.r * 0.7071, c.y + c.r * 0.7071), 12)) return { kind: "rim", i }; }
    for (let i = pl.free.length - 1; i >= 0; i--) { const c = pl.free[i]; if (near(P(c.x, c.y), 13)) return { kind: "ctr", i }; }
  }
  if (pl.formula === "sfree") {
    for (let i = pl.sfree.length - 1; i >= 0; i--) { const c = pl.sfree[i]; if (near(P(c.x + c.r * 0.7071, c.y + c.r * 0.7071), 12)) return { kind: "srim", i }; }
    for (let i = pl.sfree.length - 1; i >= 0; i--) { const c = pl.sfree[i]; if (near(P(c.x, c.y), 13)) return { kind: "sctr", i }; }
  }
  if (M.isInversive(pl.formula) && pl.mir.on && near(P(pl.mir.x, pl.mir.y), 13)) return { kind: "mir" };
  return { kind: "pan" };
}
