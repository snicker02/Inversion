/* Pointer, wheel and keyboard handling for all three views. */
import { s2w, hitPlane } from "./overlay.js";
import { camBasis, project3, shell, camOf } from "../engine/render3d.js";
import { valid3D } from "../engine/math/sphere3d.js";

export function attachInput(app) {
  const stage = app.stage;
  const pointers = new Map();
  let drag = null, pinch = null;

  const local = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const cam2 = () => (app.S.engine === "limit" ? app.S.limit.cam : app.S.plane.cam);
  const clampScale = (s) => Math.max(1e-12, Math.min(60, s));

  stage.addEventListener("contextmenu", (e) => e.preventDefault());

  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId);
    const sp = local(e);
    pointers.set(e.pointerId, sp);
    app.beginInteract();
    const S = app.S;
    if (S.engine === "space") {
      const pan = e.shiftKey || e.button === 2 || e.button === 1;
      let pick = -1;
      if (!pan && S.handles && S.space.formula === "apollo" && S.space.tet) {
        const B = camBasis(S.space);
        let bd = 22 * 22;
        S.space.tet.forEach((v, i) => {
          const q = project3(v, B, app.VW, app.VH);
          if (!q) return;
          const d2 = (q.x - sp.x) ** 2 + (q.y - sp.y) ** 2;
          if (d2 < bd) { bd = d2; pick = i; }
        });
      }
      drag = pick >= 0 ? { kind: "vert", i: pick, last: sp } : { kind: pan ? "pan3" : "orbit", last: sp };
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
        drag = null;
      }
      return;
    }
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), m, w: s2w(cam2(), m.x, m.y, app.VW, app.VH) };
      drag = null;
      return;
    }
    if (pointers.size !== 1) return;
    const h = S.engine === "plane" ? hitPlane(app, sp) : { kind: "pan" };
    drag = { kind: h.kind, i: h.i, last: sp, w0: s2w(cam2(), sp.x, sp.y, app.VW, app.VH) };
    if (h.kind === "ctr" || h.kind === "rim") { S.plane.freeSel = h.i; app.panel.refresh(); }
    if (h.kind === "sctr" || h.kind === "srim") { S.plane.sfreeSel = h.i; app.panel.refresh(); }
  });

  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const sp = local(e);
    pointers.set(e.pointerId, sp);
    const S = app.S;

    if (S.engine === "space") {
      const c = camOf(S.space);
      if (pinch && pointers.size >= 2) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (d > 4 && pinch.d > 4) dolly(pinch.d / d);
        pinch.d = d;
        return;
      }
      if (!drag) return;
      if (drag.kind === "vert") {
        const B = camBasis(S.space), pr = project3(S.space.tet[drag.i], B, app.VW, app.VH);
        if (pr) {
          const du = (sp.x - drag.last.x) / app.VH, dv = -(sp.y - drag.last.y) / app.VH, k = pr.z / B.fov;
          const v = S.space.tet[drag.i];
          const cand = [0, 1, 2].map((a) => v[a] + (B.rt[a] * du + B.up[a] * dv) * k);
          const trial = S.space.tet.map((w, i) => (i === drag.i ? cand : w.slice()));
          /* refuse moves that leave the group non-discrete */
          if (valid3D(trial, S.space.srad)) S.space.tet = trial;
        }
      } else if (drag.kind === "orbit") {
        c.yaw -= (sp.x - drag.last.x) * 0.006;
        c.pitch = Math.max(-1.5, Math.min(1.5, c.pitch + (sp.y - drag.last.y) * 0.006));
      } else if (drag.kind === "pan3" && S.space.formula !== "apollo") {
        const B = camBasis(S.space), k = c.dist / (B.fov * app.VH);
        const dx = -(sp.x - drag.last.x) * k, dy = (sp.y - drag.last.y) * k;
        for (let a = 0; a < 3; a++) c.target[a] += B.rt[a] * dx + B.up[a] * dy;
      }
      drag.last = sp;
      app.changed({});
      return;
    }

    const cam = cam2();
    if (pinch && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (d > 4 && pinch.d > 4) {
        cam.s = clampScale(cam.s * (pinch.d / d));
        const h = app.VH * 0.5;
        cam.x = pinch.w.x - ((m.x - app.VW * 0.5) / h) * cam.s;
        cam.y = pinch.w.y + ((m.y - app.VH * 0.5) / h) * cam.s;
      }
      pinch.d = d; pinch.m = m; pinch.w = s2w(cam, m.x, m.y, app.VW, app.VH);
      app.changed({});
      return;
    }
    if (!drag) return;
    const w = s2w(cam, sp.x, sp.y, app.VW, app.VH), pl = S.plane;
    switch (drag.kind) {
      case "pan":
        cam.x -= w.x - drag.w0.x; cam.y -= w.y - drag.w0.y;
        drag.w0 = s2w(cam, sp.x, sp.y, app.VW, app.VH);
        break;
      case "tri": {
        const old = { ...pl.tri[drag.i] };
        pl.tri[drag.i] = { x: w.x, y: w.y };
        if (!app.validTri()) pl.tri[drag.i] = old;
        break;
      }
      case "ctr": pl.free[drag.i].x = w.x; pl.free[drag.i].y = w.y; break;
      case "rim": { const c = pl.free[drag.i]; c.r = Math.max(cam.s * 0.004, Math.hypot(w.x - c.x, w.y - c.y)); break; }
      case "sctr": pl.sfree[drag.i].x = w.x; pl.sfree[drag.i].y = w.y; break;
      case "srim": { const c = pl.sfree[drag.i]; c.r = Math.max(cam.s * 0.004, Math.hypot(w.x - c.x, w.y - c.y)); break; }
      case "mir": pl.mir.x = w.x; pl.mir.y = w.y; break;
      case "gctr": pl.ginv.x = w.x; pl.ginv.y = w.y; break;
      case "grim": pl.ginv.r = Math.max(cam.s * 0.004, Math.hypot(w.x - pl.ginv.x, w.y - pl.ginv.y)); break;
    }
    drag.last = sp;
    app.changed({});
  });

  function end(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (drag || pinch === null) app.commit();
      drag = null;
      app.endInteract();
    }
  }
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  function dolly(f) {
    const S = app.S, c = camOf(S.space);
    if (S.space.formula === "apollo" && !S.space.shellOff) c.dist = Math.max(0.03, Math.min(0.9 * shell(S.space).r, c.dist * f));
    else if (S.space.formula === "apollo") c.dist = Math.max(0.03, Math.min(40, c.dist * f));
    else c.dist = Math.max(1e-4, Math.min(200, c.dist * f));
    app.changed({});
  }

  let wheelTimer = 0;
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    app.beginInteract();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { app.endInteract(); app.commit(); }, 220);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const f = Math.exp(dy * 0.0012);
    if (app.S.engine === "space") { dolly(f); return; }
    const cam = cam2(), sp = local(e), before = s2w(cam, sp.x, sp.y, app.VW, app.VH);
    cam.s = clampScale(cam.s * f);
    const h = app.VH * 0.5;
    cam.x = before.x - ((sp.x - app.VW * 0.5) / h) * cam.s;
    cam.y = before.y + ((sp.y - app.VH * 0.5) / h) * cam.s;
    app.changed({});
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    const t = e.target.tagName;
    if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) app.actions.redo(); else app.actions.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); app.actions.redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === "h") app.actions.toggleHandles();
    else if (k === "r") app.actions.randomise();
    else if (k === "f") app.actions.fit();
    else if (k === "s") app.actions.savePNG(document.getElementById("bSave"));
    else if (k === " ") { e.preventDefault(); app.anim.toggle(); }
  });
}
