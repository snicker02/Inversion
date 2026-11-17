/* Parameter animation and WebM capture. A driver nudges one part of the
   state per frame; recording renders a fixed number of samples per frame
   and pushes each finished frame to a MediaRecorder explicitly, so the
   video is not paced by how long a frame took to draw. */

const TAU = Math.PI * 2;
const plane = (f) => (S) => S.engine === "plane" && (!f || f.includes(S.plane.formula));
const space = (f) => (S) => S.engine === "space" && (!f || f.includes(S.space.formula));
const limit = (f) => (S) => S.engine === "limit" && (!f || f.includes(S.limit.recipe));

export const DRIVERS = [
  { id: "none", label: "Choose what moves", when: () => true, apply() {} },
  { id: "ringRot", label: "Plane: ring rotation", when: plane(["ring"]), apply(S, dt) { S.plane.ring.rot = (S.plane.ring.rot + dt * 0.35) % TAU; } },
  { id: "steinerRoll", label: "Plane: Steiner chain roll", when: plane(["steiner"]), apply(S, dt) { S.plane.steiner.rot = (S.plane.steiner.rot + dt * 0.45) % TAU; } },
  { id: "steinerDir", label: "Plane: Steiner offset orbit", when: plane(["steiner"]), apply(S, dt) { S.plane.steiner.dir = (S.plane.steiner.dir + dt * 0.3) % TAU; } },
  { id: "twist", label: "Plane: Schottky twist", when: plane(["schottky", "sfree"]), apply(S, dt) {
    let t = S.plane.schottky.twist + dt * 0.4;
    if (t > Math.PI) t -= TAU;
    S.plane.schottky.twist = t;
  } },
  { id: "schottkyRot", label: "Plane: Schottky ring rotation", when: plane(["schottky"]), apply(S, dt) { S.plane.schottky.rot = (S.plane.schottky.rot + dt * 0.3) % TAU; } },
  { id: "muPlane", label: "Plane: Maskit μ wander", when: plane(["maskit"]), apply(S, dt, t) { S.plane.maskit.mu[0] = 0.35 * Math.sin(t * 0.35); } },
  { id: "ginvOrbit", label: "Plane / Space: global inversion orbit", when: (S) => (S.engine === "plane" && S.plane.ginv.on) || (S.engine === "space" && S.space.ginv.on), apply(S, dt, t) {
    if (S.engine === "plane") { const g = S.plane.ginv, c = S.plane.cam; g.x = c.x + Math.cos(t * 0.3) * c.s * 0.45; g.y = c.y + Math.sin(t * 0.3) * c.s * 0.45; }
    else { const g = S.space.ginv; g.x = Math.cos(t * 0.3) * 0.5; g.z = Math.sin(t * 0.3) * 0.5; }
  } },
  { id: "zoom", label: "Plane / Limit: zoom in", when: (S) => S.engine !== "space", apply(S, dt) {
    const c = S.engine === "plane" ? S.plane.cam : S.limit.cam;
    c.s = Math.max(1e-12, c.s * Math.exp(-dt * 0.35));
  } },
  { id: "traceA", label: "Limit: tₐ circles", when: limit(["grandma", "jorgensen"]), apply(S, dt, t) {
    S.limit.ta[0] = 2 + 0.08 * (1 - Math.cos(t * 0.25)); S.limit.ta[1] = 0.12 * Math.sin(t * 0.25);
  } },
  { id: "muLimit", label: "Limit: Maskit μ wander", when: limit(["maskit"]), apply(S, dt, t) { S.limit.mu[0] = 0.3 * Math.sin(t * 0.3); } },
  { id: "turntable", label: "Space: turntable", when: space(), apply(S, dt) { const c = S.space.cams[S.space.formula]; c.yaw = (c.yaw + dt * 0.22) % TAU; } },
  { id: "light", label: "Space: light orbit", when: space(), apply(S, dt) { S.space.light.yaw = (S.space.light.yaw + dt * 0.5) % TAU; } },
  { id: "pkBox", label: "Space: pseudo-Kleinian box breathe", when: space(["pk"]), apply(S, dt, t) { S.space.pk.csize[1] = 0.90756 + 0.06 * Math.sin(t * 0.4); } },
  { id: "latScale", label: "Space: lattice scale breathe", when: space(["lat"]), apply(S, dt, t) { S.space.lat.s = 1.3 + 0.15 * Math.sin(t * 0.35); } },
  { id: "muSpace", label: "Space: Kleinian μ wander", when: space(["klein"]), apply(S, dt, t) { S.space.klein.mu[0] = 0.3 * Math.sin(t * 0.3); } },
];

export class Animator {
  constructor(app) {
    this.app = app;
    this.playing = false;
    this.recording = false;
    this.t = 0;
    this.last = 0;
    this.rec = null;
    this.track = null;
    this.chunks = [];
  }
  driver() { return DRIVERS.find((d) => d.id === this.app.S.anim.driver) || DRIVERS[0]; }
  hint() {
    const d = this.driver(), S = this.app.S;
    if (d.id === "none") return "Pick a driver, then Play. Recording captures one frame per finished render.";
    if (!d.when(S)) return "<span class='warn'>This driver does nothing in the current view or formula.</span>";
    return this.recording ? "Recording&hellip;" : "Play previews at one sample per frame; recording renders the samples set below for each frame.";
  }
  toggle() {
    this.playing = !this.playing;
    this.last = performance.now();
    if (!this.playing && this.recording) this.stopRecord();
    this.app.changed({ commit: !this.playing });
    this.app.panel.refresh();
  }
  /* advance one frame; returns true if the state moved */
  step(dtOverride) {
    if (!this.playing) return false;
    const now = performance.now();
    const dt = (dtOverride ?? Math.min(0.1, (now - this.last) / 1000)) * this.app.S.anim.speed;
    this.last = now;
    this.t += dt;
    const S = this.app.S, d = this.driver();
    if (d.when(S)) d.apply(S, dt, this.t);
    if (S.anim.hue) S.color.hue = (S.color.hue + dt * 0.03) % 1;
    return true;
  }
  toggleRecord() {
    if (this.recording) { this.stopRecord(); return; }
    const canvas = this.app.canvas;
    if (!canvas.captureStream || typeof MediaRecorder === "undefined") { this.app.toast("This browser cannot record the canvas."); return; }
    const stream = canvas.captureStream(0);
    this.track = stream.getVideoTracks()[0];
    const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16e6 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: "video/webm" });
      this.app.download(blob, this.app.fileStem() + ".webm");
    };
    this.rec.start(500);
    this.recording = true;
    if (!this.playing) { this.playing = true; this.last = performance.now(); }
    this.app.panel.refresh();
    this.app.changed({});
  }
  stopRecord() {
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.recording = false;
    this.rec = null;
    this.track = null;
    this.app.panel.refresh();
  }
  /* called by the render loop once a frame has all its samples */
  frameDone() {
    if (this.recording && this.track && this.track.requestFrame) this.track.requestFrame();
  }
}
