/* Inversion v2 — application shell: state, render loop, actions. */
import { createGL } from "./engine/gl.js";
import { Accumulator, jitter } from "./engine/accum.js";
import { PlaneRenderer } from "./engine/render2d.js";
import { SpaceRenderer, apolloSpheres, shell, camOf } from "./engine/render3d.js";
import { LimitRenderer } from "./engine/limitset/renderer.js";
import { exportPNG } from "./engine/export.js";
import { Animator } from "./engine/anim.js";
import { DEFAULTS, HOME_S, clone, merge, encodeState, decodeState, History } from "./engine/state.js";
import * as M from "./engine/planeModel.js";
import { apollonian, ringCircles } from "./engine/math/inversive2d.js";
import { TETRA, tangencyGap } from "./engine/math/sphere3d.js";
import { Panel } from "./ui/panel.js";
import { makeSections } from "./ui/schema.js";
import { drawOverlay } from "./ui/overlay.js";
import { attachInput } from "./ui/input.js";

export const VERSION = "2.1.0";
const TAU = Math.PI * 2;
const $ = (id) => document.getElementById(id);

const app = {
  S: null, G: null, VW: 1, VH: 1, DPR: 1,
  canvas: $("gl"), overlay: $("ov"), stage: $("stage"),
};
window.inversionApp = app; /* for the console and the headless tests */

/* ---------------- state ---------------- */
function loadInitial() {
  const h = location.hash.slice(1);
  if (h) { const d = decodeState(h); if (d) return merge(DEFAULTS, d); }
  return clone(DEFAULTS);
}
app.S = loadInitial();
const undoStack = new History();
undoStack.push(app.S);

/* ---------------- GL ---------------- */
function fail(msg) { const e = $("err"); e.style.display = "grid"; e.textContent = msg; }
app.G = createGL(app.canvas);
if (!app.G) { fail("WebGL is unavailable in this browser. Enable hardware acceleration and reload."); throw new Error("no webgl"); }
const acc = new Accumulator(app.G);
app.acc = acc;
app.plane = new PlaneRenderer(app.G);
app.space = new SpaceRenderer(app.G);
app.limit = new LimitRenderer(app.G, (queued) => { limitDirty = true; if (queued) app.S.engine === "limit" && requestLimit(); schedule(); });
app.anim = new Animator(app);

/* ---------------- loop ---------------- */
let raf = 0, dirty = true, limitDirty = true, interacting = 0, hashTimer = 0, lastErr = null;
function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

app.lineScaleBase = () => app.DPR * app.S.render.quality;
/* 3D accumulates linear HDR (tone mapped after averaging) whenever the
   accumulator is floating point */
app.linearHDR = () => app.G.accumName !== "8-bit";
app.drawScene = (full, off, lineScale, n, quick = false) => {
  if (app.S.engine === "space") app.space.draw(app.S, full, off, n, quick, app.linearHDR());
  else app.plane.draw(app.S, null, full, off, lineScale);
};

function interactScale() {
  if (app.S.engine === "space") return app.S.render.interactScale;
  return app.plane.info.deep ? 0.5 : 1;
}
function sampleTarget() {
  if (app.anim.recording) return app.S.engine === "limit" ? 1 : app.S.anim.recSamples;
  if (interacting || app.anim.playing) return 1;
  return app.S.render.samples;
}
function requestLimit() { app.limit.update(app.S.limit, app.canvas.width / app.canvas.height, app.canvas.height); }

function frame() {
  raf = 0;
  const S = app.S, gl = app.G.gl;
  const cw = app.canvas.width, ch = app.canvas.height;

  if (S.engine === "limit") {
    const ready = !app.limit.pending;
    if (app.anim.playing && ready && !dirty) { app.anim.step(app.anim.recording ? 1 / 30 : undefined); dirty = true; }
    if (dirty) { requestLimit(); dirty = false; limitDirty = true; }
    if (limitDirty) {
      app.limit.draw(S, null, cw, ch, [cw, ch], [0, 0, 1, 1], app.lineScaleBase());
      limitDirty = false;
      if (app.anim.playing && !app.limit.pending) app.anim.frameDone();
    }
    if (app.anim.playing) schedule();
  } else {
    acc.ensure(cw, ch);
    const target = sampleTarget();
    if (app.anim.playing && !dirty && acc.n >= target) { app.anim.step(app.anim.recording ? 1 / 30 : undefined); dirty = true; }
    if (dirty) { acc.reset(interacting || (app.anim.playing && !app.anim.recording) ? interactScale() : 1); dirty = false; }
    acc.tone = S.engine === "space" && app.linearHDR();
    if (acc.n < target) {
      const vp = acc.begin();
      const quick = S.engine === "space" && (interacting > 0 || (app.anim.playing && !app.anim.recording));
      const j = acc.scale < 1 && !quick ? [0, 0] : jitter(acc.n);
      app.drawScene([vp.w, vp.h], j, app.lineScaleBase() * acc.scale, acc.n, quick);
      acc.end();
      acc.blit(null, cw, ch);
      if (acc.n >= target && app.anim.playing) app.anim.frameDone();
    }
    if (acc.n < target || app.anim.playing) schedule();
  }
  drawOverlay(app.overlay.getContext("2d"), app);
  renderHUD();
  app.panel.refreshLive();
  const err = S.engine === "space" ? app.space.info.err : S.engine === "plane" ? app.plane.info.err : null;
  if (err !== lastErr) { lastErr = err; if (err) fail("Shader failed to build:\n\n" + err); else $("err").style.display = "none"; }
  void gl;
}

app.changed = ({ commit } = {}) => {
  dirty = true;
  schedule();
  if (commit) app.commit();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    try { window.history.replaceState(null, "", "#" + encodeState(app.S)); } catch (e) { /* file:// or sandbox */ }
  }, 500);
};
app.commit = () => { undoStack.push(app.S); };
app.beginInteract = () => { interacting++; };
app.endInteract = () => { interacting = Math.max(0, interacting - 1); dirty = true; schedule(); };

/* ---------------- sizing ---------------- */
app.resize = () => {
  const r = app.stage.getBoundingClientRect();
  app.VW = Math.max(1, Math.round(r.width));
  app.VH = Math.max(1, Math.round(r.height));
  app.DPR = Math.min(window.devicePixelRatio || 1, 2);
  const q = app.S.render.quality;
  const w = Math.max(1, Math.round(app.VW * app.DPR * q)), h = Math.max(1, Math.round(app.VH * app.DPR * q));
  if (app.canvas.width !== w || app.canvas.height !== h) { app.canvas.width = w; app.canvas.height = h; }
  const ow = Math.round(app.VW * app.DPR), oh = Math.round(app.VH * app.DPR);
  if (app.overlay.width !== ow || app.overlay.height !== oh) { app.overlay.width = ow; app.overlay.height = oh; }
  dirty = true;
  schedule();
};
window.addEventListener("resize", app.resize);

/* ---------------- readouts ---------------- */
function renderHUD() {
  const S = app.S, hud = $("hud");
  const samp = S.engine === "limit" ? "" : ` &nbsp; samples <b>${acc.n}/${sampleTarget()}</b>`;
  if (S.engine === "space") {
    hud.innerHTML = `${{ apollo: "Apollonian packing", pk: "Pseudo-Kleinian", lat: "Lattice Apollonian", klein: "Kleinian 3D" }[S.space.formula]} &nbsp; iterations <b>${S.space[S.space.formula].maxIter}</b>${samp}`;
    return;
  }
  const cam = S.engine === "limit" ? S.limit.cam : S.plane.cam;
  const z = HOME_S / cam.s;
  const zs = z < 1000 ? z.toFixed(z < 10 ? 2 : 0) : z.toExponential(1);
  if (S.engine === "limit") {
    const st = app.limit.stats;
    hud.innerHTML = `zoom <b>${zs}&times;</b> &nbsp; segments <b>${st.segs.toLocaleString()}</b>` +
      (app.limit.pending ? " &nbsp; <b style='color:#e8b163'>searching&hellip;</b>" : ` &nbsp; <b>${Math.round(st.ms)} ms</b>`);
    return;
  }
  const info = app.plane.info;
  let warn = "";
  if (info.form === 0 && !info.deep && z > 3000 && (S.plane.precision !== "fast")) warn = " &nbsp; <b style='color:#e8b163'>single-precision limit</b>";
  else if (info.form !== 0 && z > 2e4) warn = " &nbsp; <b style='color:#e8b163'>single-precision limit</b>";
  else if (info.deep && z > 1e10) warn = " &nbsp; <b style='color:#e8b163'>precision limit reached</b>";
  const gens = info.form === 0 ? `seeds <b>${info.seeds}</b>${info.dual ? ` &nbsp; duals <b>${info.duals}</b>` : ""}` : info.form === 1 ? `pairs <b>${info.seeds / 2}</b>` : "Maskit";
  hud.innerHTML = `zoom <b>${zs}&times;</b> &nbsp; depth <b>${S.plane.maxIter}</b> &nbsp; ${gens} &nbsp; float <b>${info.deep ? "double (emulated)" : "single"}</b>${samp}${warn}`;
}

app.bendsHTML = () => {
  const pl = app.S.plane, cs = M.currentCircles(pl);
  if (!cs.length) return '<div class="chk bad">Degenerate configuration.</div>';
  let rows = "";
  const shown = Math.min(cs.length, 6);
  for (let i = 0; i < shown; i++) {
    const c = cs[i], k = (c.inside === false ? -1 : 1) / c.r;
    rows += `<div class="r"><i>circle ${i + 1}${c.inside === false ? " &middot; outer" : ""}</i><em>${k >= 0 ? "+" : ""}${k.toFixed(3)}</em></div>`;
  }
  if (cs.length > shown) rows += `<div class="r"><i>&hellip; ${cs.length - shown} more</i><em></em></div>`;
  let note;
  if (pl.formula === "apollonian" && cs.length >= 4) {
    const kk = cs.slice(0, 4).map((c) => (c.inside === false ? -1 : 1) / c.r);
    const s1 = kk.reduce((a, b) => a + b, 0), s2 = kk.reduce((a, b) => a + b * b, 0);
    const resid = Math.abs(s1 * s1 - 2 * s2) / Math.max(s2, 1e-9), ok = resid < 1e-6;
    note = `<div class="chk${ok ? "" : " bad"}">Descartes residual <b>${resid.toExponential(1)}</b>${ok ? " &mdash; mutually tangent" : ""}</div>`;
  } else if (pl.formula === "steiner") {
    note = `<div class="chk">Steiner's porism: the chain closes for every roll angle, so it can rotate forever.</div>`;
  } else note = '<div class="chk">Signed bend = &plusmn;1/r, negative for a circle whose outside is reflected.</div>';
  return rows + note;
};
app.tetStatsHTML = () => {
  const g = apolloSpheres(app.S.space);
  const gap = g.length >= 4 ? tangencyGap(g) : NaN;
  return `Tangency gap <b>${gap.toFixed(4)}</b>${gap <= 1e-4 ? " &mdash; mutually tangent" : ""}`;
};
app.limitStatsHTML = () => {
  const st = app.limit.stats;
  if (st.error) return `<span class="warn">${st.error}</span>`;
  const ct = st.comm ? `${st.comm[0].toFixed(3)}${st.comm[1] >= 0 ? "+" : "&minus;"}${Math.abs(st.comm[1]).toFixed(3)}i` : "&ndash;";
  const parab = st.comm && Math.hypot(st.comm[0] + 2, st.comm[1]) < 1e-6;
  return `tr[a,b] <b>${ct}</b> ${parab ? "(parabolic: curve)" : "(dust)"}<br>` +
    `${st.segs.toLocaleString()} segments &middot; ${st.nodes.toLocaleString()} words &middot; ${Math.round(st.ms)} ms` +
    (st.truncated ? '<br><span class="warn">Search capped: raise segment length or lower word length.</span>' : "");
};
app.renderStatsHTML = () => {
  const G = app.G;
  return `Accumulation <b>${G.accumName}</b> &middot; canvas <b>${app.canvas.width}&times;${app.canvas.height}</b>` +
    (G.ext.deriv ? "" : "<br><span class='warn'>No derivatives extension: relief disabled.</span>");
};

/* ---------------- free-circle lists ---------------- */
app.freeList = {
  nodes: {},
  mount(n, kind) { n.className = "clist"; this.nodes[kind] = n; this.update(kind); },
  update(kind) {
    const n = this.nodes[kind];
    if (!n) return;
    const pl = app.S.plane, list = kind === "free" ? pl.free : pl.sfree, sel = kind === "free" ? pl.freeSel : pl.sfreeSel;
    const key = JSON.stringify([list.map((c) => [c.r.toFixed(3), c.inside]), sel]);
    if (n._key === key) return;
    n._key = key;
    n.innerHTML = "";
    const hues = ["#7ce0d3", "#e8b163", "#d58cf0", "#8fb8ff", "#f08c8c", "#b6e07c"];
    list.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "crow" + (i === sel ? " on" : "");
      const col = kind === "sfree" ? hues[(i >> 1) % hues.length] : i === sel ? "var(--amber)" : "var(--ink-faint)";
      const filled = kind === "sfree" ? i % 2 === 0 : c.inside;
      const label = kind === "free" ? `circle ${i + 1}` : `pair ${(i >> 1) + 1} &middot; ${i % 2 ? "b" : "a"}`;
      row.innerHTML = `<span class="sw" style="${filled ? "background:" + col : "border:1px solid " + col}"></span>${label}<span class="k">${(kind === "free" ? (c.inside ? 1 : -1) / c.r : 1 / c.r).toFixed(2)}</span>`;
      row.addEventListener("click", () => { if (kind === "free") pl.freeSel = i; else pl.sfreeSel = i; app.panel.refresh(); app.changed({}); });
      n.appendChild(row);
    });
  },
};

/* ---------------- actions ---------------- */
app.toast = (msg) => {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("on"), 2600);
};
app.download = (blob, name) => {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
app.fileStem = () => {
  const S = app.S, f = S.engine === "plane" ? S.plane.formula : S.engine === "space" ? S.space.formula : S.limit.recipe;
  return `inversion-v${VERSION}-${S.engine}-${f}-${Date.now()}`;
};
app.validTri = () => !!apollonian(app.S.plane.tri);

function fitPlane() {
  const pl = app.S.plane, cam = pl.cam;
  if (pl.formula === "maskit") { cam.x = pl.maskit.mu[0] * 0.5; cam.y = pl.maskit.mu[1] * 0.5; cam.s = 1.15; return; }
  let cs = M.isSchottky(pl.formula) ? M.schottkyConfig(pl).circles : M.currentCircles(pl);
  if (!cs.length) return;
  const outer = cs.find((c) => c.inside === false);
  let cx = 0, cy = 0, R = 0.1;
  if (outer) { cx = outer.x; cy = outer.y; R = outer.r; }
  else {
    cs.forEach((c) => { cx += c.x; cy += c.y; });
    cx /= cs.length; cy /= cs.length;
    cs.forEach((c) => { R = Math.max(R, Math.hypot(c.x - cx, c.y - cy) + c.r); });
  }
  cam.x = cx; cam.y = cy; cam.s = Math.max(1e-12, Math.min(60, R * 1.12));
}

app.onFormula = () => {
  const S = app.S;
  if (S.engine === "plane") {
    const pl = S.plane;
    if (pl.formula === "free" && pl.free.length === 0) {
      const prev = app._prevPlaneFormula && M.isInversive(app._prevPlaneFormula) ? { ...pl, formula: app._prevPlaneFormula } : { ...pl, formula: "apollonian" };
      pl.free = M.currentCircles(prev).map((c) => ({ x: c.x, y: c.y, r: c.r, inside: c.inside !== false }));
      pl.freeSel = 0;
    }
    app._prevPlaneFormula = pl.formula;
    fitPlane();
  }
  app.changed({ commit: true });
};
app.onEngine = () => {
  if (app.S.engine === "limit") { limitDirty = true; }
  app.changed({ commit: true });
};

function rand(a, b) { return a + Math.random() * (b - a); }
const actions = {
  addCircle() {
    const pl = app.S.plane, room = 12 - (pl.mir.on ? 2 : 0);
    if (pl.free.length >= room) { app.toast(`At most ${room} circles.`); return; }
    const a = Math.random() * TAU, cam = pl.cam;
    pl.free.push({ x: cam.x + Math.cos(a) * cam.s * 0.4, y: cam.y + Math.sin(a) * cam.s * 0.4, r: cam.s * 0.28, inside: true });
    pl.freeSel = pl.free.length - 1;
    app.panel.refresh(); app.changed({ commit: true });
  },
  delCircle() {
    const pl = app.S.plane;
    if (pl.free.length <= 1) return;
    pl.free.splice(pl.freeSel, 1);
    pl.freeSel = Math.min(pl.freeSel, pl.free.length - 1);
    app.panel.refresh(); app.changed({ commit: true });
  },
  flipCircle() {
    const pl = app.S.plane, c = pl.free[pl.freeSel];
    if (!c) return;
    c.inside = !c.inside;
    app.panel.refresh(); app.changed({ commit: true });
  },
  addPair() {
    const pl = app.S.plane;
    if (pl.sfree.length >= 12) { app.toast("At most 6 pairs."); return; }
    const a = Math.random() * TAU, cam = pl.cam, d = cam.s * 0.6, r = cam.s * 0.18;
    pl.sfree.push({ x: cam.x + Math.cos(a) * d, y: cam.y + Math.sin(a) * d, r }, { x: cam.x - Math.cos(a) * d, y: cam.y - Math.sin(a) * d, r });
    pl.sfreeSel = pl.sfree.length - 2;
    app.panel.refresh(); app.changed({ commit: true });
  },
  delPair() {
    const pl = app.S.plane;
    if (pl.sfree.length <= 2) return;
    const k = pl.sfreeSel >> 1;
    pl.sfree.splice(k * 2, 2);
    pl.sfreeSel = Math.max(0, Math.min(pl.sfreeSel, pl.sfree.length - 2) & ~1);
    app.panel.refresh(); app.changed({ commit: true });
  },
  randomise() {
    const S = app.S;
    if (S.engine === "plane") {
      const pl = S.plane;
      switch (pl.formula) {
        case "apollonian": {
          for (let tries = 0; tries < 50; tries++) {
            const base = Math.random() * TAU;
            pl.tri = [0, 1, 2].map((i) => { const a = base + (i * TAU) / 3 + (Math.random() - 0.5) * 0.9, r = rand(0.45, 0.95); return { x: Math.cos(a) * r, y: Math.sin(a) * r }; });
            if (app.validTri()) break;
          }
          break;
        }
        case "ring": pl.ring.n = 3 + ((Math.random() * 7) | 0); pl.ring.tight = Math.random() < 0.5 ? 1 : rand(0.72, 1.2); pl.ring.rot = Math.random() * TAU; break;
        case "steiner": pl.steiner.n = 3 + ((Math.random() * 6) | 0); pl.steiner.ecc = rand(0, 0.8); pl.steiner.dir = Math.random() * TAU; pl.steiner.rot = Math.random() * TAU; break;
        case "free": {
          const n = 3 + ((Math.random() * 3) | 0), out = [];
          for (let j = 0; j < n; j++) { const th = (j * TAU) / n + Math.random() * 0.5; out.push({ x: Math.cos(th) * 0.55, y: Math.sin(th) * 0.55, r: rand(0.28, 0.58), inside: true }); }
          out.push({ x: 0, y: 0, r: 1.05, inside: false });
          pl.free = out; pl.freeSel = 0;
          break;
        }
        case "schottky": pl.schottky.pairs = 1 + ((Math.random() * 4) | 0); pl.schottky.tight = rand(0.75, 1); pl.schottky.twist = rand(-1, 1); break;
        case "sfree": {
          const n = 2 + ((Math.random() * 2) | 0), out = [];
          for (let k = 0; k < n; k++) { const a = (k * Math.PI) / n + rand(-0.2, 0.2), d = rand(0.5, 0.7), r = rand(0.18, 0.32); out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r }, { x: -Math.cos(a) * d, y: -Math.sin(a) * d, r: r * rand(0.7, 1.3) }); }
          pl.sfree = out; pl.sfreeSel = 0; pl.schottky.twist = rand(-0.8, 0.8);
          break;
        }
        case "maskit": pl.maskit.mu = [rand(-0.4, 0.4), rand(1.85, 2.05)]; break;
      }
      fitPlane();
    } else if (S.engine === "limit") {
      const L = S.limit;
      if (L.recipe === "maskit") L.mu = [rand(-0.3, 0.3), rand(1.9, 2.05)];
      else if (L.recipe === "riley") L.c = [rand(-1.5, 1.5), rand(0.6, 2.2)];
      else { L.ta = [rand(1.85, 2.3), rand(-0.12, 0.12)]; L.tb = [rand(1.85, 2.6), rand(-0.12, 0.12)]; }
    } else {
      const sp = S.space, f = sp.formula;
      if (f === "pk") { sp.pk.csize = [rand(0.8, 1.1), rand(0.8, 1.1), rand(0.8, 1.1)]; sp.pk.size = rand(0.85, 1.2); }
      else if (f === "lat") { sp.lat.s = rand(1.15, 1.5); }
      else if (f === "klein") { sp.klein.mu = [rand(-0.3, 0.3), rand(1.9, 2.02)]; }
      else { sp.srad = rand(0.85, 1.05); }
    }
    S.color.hue = Math.random();
    app.panel.refresh();
    app.changed({ commit: true });
    if (S.engine === "limit") actions.fit();
  },
  fit() {
    const S = app.S;
    if (S.engine === "plane") fitPlane();
    else if (S.engine === "limit") {
      app.limit.bounds(S.limit, (b) => { if (b) { Object.assign(S.limit.cam, b); app.changed({ commit: true }); } });
      return;
    } else {
      const f = S.space.formula;
      S.space.cams[f] = clone(DEFAULTS.space.cams[f]);
      if (f === "apollo") {
        const h = S.space.hollow | 0;
        S.space.cams[f].dist = h === 4 ? 7.2 : h === -1 ? 1.35 : 0.55;
        if (h === 4) { S.space.cams[f].yaw = 0.62; S.space.cams[f].pitch = 0.38; }
      }
    }
    app.changed({ commit: true });
  },
  toggleHandles() { app.S.handles = !app.S.handles; app.panel.refresh(); app.changed({}); },
  undo() { const s = undoStack.undo(); if (s) { app.S = merge(DEFAULTS, s); app.panel.refresh(); app.changed({}); } },
  redo() { const s = undoStack.redo(); if (s) { app.S = merge(DEFAULTS, s); app.panel.refresh(); app.changed({}); } },
  resetTet() { app.S.space.tet = TETRA.map((v) => v.slice()); app.changed({ commit: true }); },
  cutToCamera() {
    const c = camOf(app.S.space), cut = app.S.space.cut;
    cut.yaw = c.yaw; cut.pitch = c.pitch;
    app.panel.refresh(); app.changed({ commit: true });
  },
  focusTarget() { const c = camOf(app.S.space); app.S.space.focus = c.dist; app.panel.refresh(); app.changed({ commit: true }); },
  async savePNG(btn) {
    if (actions._busy) return;
    actions._busy = true;
    const label = btn ? btn.textContent : "";
    try {
      const { blob, W, H } = await exportPNG(app, app.S.render.exportScale, (p) => { if (btn) btn.textContent = `Rendering ${Math.round(p * 100)}%`; });
      app.download(blob, app.fileStem() + ".png");
      app.toast(`Saved ${W} × ${H} PNG`);
    } catch (e) {
      console.error(e);
      app.toast("Export failed: " + e.message);
    } finally {
      if (btn) btn.textContent = label || "Save PNG";
      actions._busy = false;
      dirty = true; limitDirty = true; schedule();
    }
  },
  async copyLink(btn) {
    const url = location.href.split("#")[0] + "#" + encodeState(app.S);
    try { await navigator.clipboard.writeText(url); app.toast("Link copied"); }
    catch (e) { window.prompt("Copy this link:", url); }
    void btn;
  },
  exportJSON() {
    const blob = new Blob([JSON.stringify({ app: "inversion", version: VERSION, state: app.S }, null, 2)], { type: "application/json" });
    app.download(blob, app.fileStem() + ".json");
  },
  importJSON() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        app.S = merge(DEFAULTS, j.state || j);
        app.panel.refresh(); app.changed({ commit: true });
        app.toast("Loaded " + f.name);
      } catch (e) { app.toast("Could not read that file."); }
    };
    inp.click();
  },
  loadPreset(p) {
    const keepAnim = clone(app.S.anim);
    app.S = merge(DEFAULTS, p.state);
    if (!p.state.anim) app.S.anim = keepAnim;
    app._prevPlaneFormula = app.S.plane.formula;
    app.panel.refresh();
    app.changed({ commit: true });
    if (app.S.engine === "limit" && !(p.state.limit && p.state.limit.cam)) actions.fit();
  },
  saveUserPreset() {
    const name = (window.prompt("Name this preset:", "My " + (app.S.engine === "plane" ? app.S.plane.formula : app.S.engine)) || "").trim();
    if (!name) return;
    const list = app.userPresets();
    list.push({ group: "Saved", name, state: clone(app.S) });
    try { localStorage.setItem("inversion.presets", JSON.stringify(list)); } catch (e) { app.toast("Browser storage is unavailable here; use Export JSON."); }
    app.panel.refresh();
  },
  deleteUserPreset(i) {
    const list = app.userPresets();
    list.splice(i, 1);
    try { localStorage.setItem("inversion.presets", JSON.stringify(list)); } catch (e) { /* ignore */ }
    app.panel.refresh();
  },
};
app.actions = actions;
app.userPresets = () => {
  try { return JSON.parse(localStorage.getItem("inversion.presets") || "[]"); } catch (e) { return []; }
};

/* ---------------- boot ---------------- */
app.panel = new Panel($("controls"), app);
app.panel.build(makeSections(app));
$("ver").textContent = "v" + VERSION;
$("menu").addEventListener("click", () => $("panel").classList.toggle("open"));
attachInput(app);
app._prevPlaneFormula = app.S.plane.formula;
app.resize();
window.addEventListener("hashchange", () => {
  const d = decodeState(location.hash.slice(1));
  if (d && JSON.stringify(d) !== JSON.stringify(app.S)) { app.S = merge(DEFAULTS, d); app.panel.refresh(); app.changed({}); }
});
void ringCircles; void shell;
