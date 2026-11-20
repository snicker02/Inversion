/* The control panel, declared. */
import { PALETTES, HOME_S } from "../engine/state.js";
import * as M from "../engine/planeModel.js";
import { DRIVERS } from "../engine/anim.js";
import { PRESETS } from "./presets.js";

const D2R = Math.PI / 180;
const deg = { to: (v) => v * D2R, from: (v) => Math.round((v / D2R) * 10) / 10, fmt: (v) => Math.round(v) + "&deg;" };
const int = (v) => String(Math.round(v));
const f2 = (v) => (+v).toFixed(2), f3 = (v) => (+v).toFixed(3);

const FORMULA_HINT = {
  apollonian: "Three mutually tangent circles at the triangle's vertices plus the outer Soddy circle. <b>Drag a vertex</b>; tangency is kept exactly.",
  ring: "n equal circles round a ring inside an enclosing circle. At tightness 1 they touch and the gap-fill gives a true polyhedral packing.",
  steiner: "A Steiner chain: n circles between two non-concentric circles, built by pushing a concentric chain through a Möbius map. <b>Roll</b> it with rotation; the chain always closes.",
  free: "Place circles anywhere. Overlapping seeds make the group non-discrete, so the packing turns into a haze.",
  schottky: "Schottky group: pairs of opposite circles, each mapped onto its partner by a Möbius transformation. Push tightness to 1 for kissing circles; twist rotates every pairing.",
  sfree: "Schottky pairs you place yourself. Consecutive circles are paired (same colour); keep the circles disjoint for a discrete group.",
  maskit: "Maskit slice: a(z) = &mu; + 1/z with b(z) = z + 2. Escape-time over the strip with the half-turn trick. At &mu; = 2i the limit set is an Apollonian gasket.",
};
const SPACE_HINT = {
  apollo: "Four spheres on a tetrahedron plus their enclosing sphere, reflected in the dual spheres so the packing fills the gaps. <b>Drag a vertex</b> to deform the configuration.",
  pk: "Pseudo-Kleinian (after knighty): fold into a box, invert in a sphere, repeat. Box size and offset change the architecture completely.",
  lat: "Lattice Apollonian (after Inigo Quilez): fold into a cubic cell and invert. Scale near 1.3 gives the classic bubble lattice.",
  klein: "The Maskit group extended to upper half-space (Poincaré extension), turned so the half-space is above a floor: the strip walls stand as a corridor and their images rise as domes.",
};
const LIMIT_HINT = {
  grandma: "Grandma's recipe (Indra's Pearls): traces t<sub>a</sub>, t<sub>b</sub> with parabolic commutator. (2, 2) is the Apollonian gasket; small imaginary parts give quasi-Fuchsian curves.",
  maskit: "Maskit recipe with parameter &mu;. Im &mu; near 2 gives the cusp groups on the slice boundary.",
  riley: "Riley slice: two parabolics. The commutator is not parabolic in general, so the limit set is often dust.",
  jorgensen: "Jorgensen's recipe: traces t<sub>a</sub>, t<sub>b</sub>, parabolic commutator, a different normalisation from Grandma's.",
};

export function makeSections(app) {
  const S = () => app.S;
  const pl = () => app.S.plane, sp = () => app.S.space, L = () => app.S.limit;
  const isPlane = () => S().engine === "plane", isLimit = () => S().engine === "limit", isSpace = () => S().engine === "space";
  const pf = (...f) => () => isPlane() && f.includes(pl().formula);
  const sf = (...f) => () => isSpace() && f.includes(sp().formula);
  const inv = () => isPlane() && M.isInversive(pl().formula);
  const lr = (...r) => () => isLimit() && r.includes(L().recipe);
  const onFormula = () => app.onFormula();

  return [
    {
      id: "engine", title: "View",
      items: [
        { type: "seg", path: "engine", options: [["plane", "Plane"], ["limit", "Limit set"], ["space", "Space"]], refreshAll: true, onChange: () => app.onEngine() },
        { type: "hint", html: () => ({
          plane: "Escape-time rendering: every pixel is mapped back through the group until it leaves the generators.",
          limit: "Depth-first search over group words draws the limit set directly, as curves or dust.",
          space: "Ray-marched 3D inversion fractals with soft shadows, ambient occlusion and depth of field.",
        })[S().engine] },
      ],
    },

    /* ---------------- plane ---------------- */
    {
      id: "pform", title: "Construction", show: isPlane,
      items: [
        { type: "select", path: "plane.formula", refreshAll: true, onChange: onFormula, options: [
          ["apollonian", "Apollonian gasket"], ["ring", "Ring packing"], ["steiner", "Steiner chain"], ["free", "Free circles"],
          ["schottky", "Schottky ring"], ["sfree", "Schottky pairs (free)"], ["maskit", "Kleinian: Maskit slice"]] },
        { type: "hint", html: () => FORMULA_HINT[pl().formula] || "" },
        { type: "check", path: "plane.gapFill", label: "Fill gaps (true packing)", show: () => isPlane() && M.gapFillPossible(pl()),
          tip: "Reflect in the dual circles (orthogonal to each interstice's circles) and measure distance to the seeds" },
        { type: "hint", show: () => isPlane() && M.gapFillPossible(pl()) && pl().gapFill && !M.gapFaces(pl()), html: () => {
          const p = pl();
          if (p.mir.on) return "Gap-fill is off while the mirror wedge is on.";
          if (M.shapesOn(p)) return "Gap-fill needs circular inversion; set the shape back to circle.";
          return "Gap-fill needs the circles to touch: set tightness to exactly 1.000.";
        } },
        { type: "range", path: "plane.ring.n", label: "Circles", min: 3, max: 10, step: 1, fmt: int, show: pf("ring") },
        { type: "range", path: "plane.ring.tight", label: "Tightness", min: 0.6, max: 1.3, step: 0.002, fmt: f3, show: pf("ring"),
          onChange: () => { const r = pl().ring; if (Math.abs(r.tight - 1) < 0.006) r.tight = 1; } },
        { type: "range", path: "plane.ring.rot", label: "Rotation", min: 0, max: 360, step: 1, ...deg, show: pf("ring") },
        { type: "check", path: "plane.ring.outer", label: "Enclosing circle", show: pf("ring") },

        { type: "range", path: "plane.steiner.n", label: "Chain length", min: 3, max: 8, step: 1, fmt: int, show: pf("steiner") },
        { type: "range", path: "plane.steiner.ecc", label: "Eccentricity", min: 0, max: 0.9, step: 0.002, fmt: f3, show: pf("steiner") },
        { type: "range", path: "plane.steiner.dir", label: "Offset direction", min: 0, max: 360, step: 1, ...deg, show: pf("steiner") },
        { type: "range", path: "plane.steiner.rot", label: "Roll", min: 0, max: 360, step: 0.5, ...deg, show: pf("steiner") },
        { type: "range", path: "plane.steiner.tight", label: "Tightness", min: 0.5, max: 1, step: 0.002, fmt: f3, show: pf("steiner"),
          onChange: () => { const r = pl().steiner; if (r.tight > 0.994) r.tight = 1; } },

        { type: "html", show: pf("free"), render: (n) => app.freeList.mount(n, "free"), update: () => app.freeList.update("free") },
        { type: "buttons", show: pf("free"), buttons: [
          { label: "Add circle", onClick: () => app.actions.addCircle() },
          { label: "Delete", onClick: () => app.actions.delCircle() },
          { label: "Flip inside / outside", wide: true, onClick: () => app.actions.flipCircle() }] },
        { type: "hint", show: pf("free"), html: "Drag a centre to move, the rim dot to resize. Filled swatch reflects the inside, hollow the outside." },

        { type: "range", path: "plane.schottky.pairs", label: "Pairs", min: 1, max: 6, step: 1, fmt: int, show: pf("schottky") },
        { type: "range", path: "plane.schottky.tight", label: "Tightness", min: 0.3, max: 1, step: 0.002, fmt: f3, show: pf("schottky") },
        { type: "range", path: "plane.schottky.rot", label: "Rotation", min: 0, max: 360, step: 1, ...deg, show: pf("schottky") },
        { type: "html", show: pf("sfree"), render: (n) => app.freeList.mount(n, "sfree"), update: () => app.freeList.update("sfree") },
        { type: "buttons", show: pf("sfree"), buttons: [
          { label: "Add pair", onClick: () => app.actions.addPair() },
          { label: "Delete pair", onClick: () => app.actions.delPair() }] },
        { type: "range", path: "plane.schottky.twist", label: "Twist", min: -180, max: 180, step: 0.5, ...deg, show: pf("schottky", "sfree") },

        { type: "range", path: "plane.maskit.mu.0", label: "&mu; real", min: -1, max: 1, step: 0.001, fmt: f3, show: pf("maskit") },
        { type: "range", path: "plane.maskit.mu.1", label: "&mu; imaginary", min: 1.5, max: 2.4, step: 0.001, fmt: f3, show: pf("maskit") },
      ],
    },
    {
      id: "shape", title: "Inversion shape", show: inv, collapsible: true,
      items: [
        { type: "select", path: "plane.shape.kind", refreshAll: true, options: [
          ["circle", "Circle (exact, conformal)"], ["superellipse", "Superellipse"], ["polygon", "Regular polygon"], ["hyperbola", "Hyperbola (Lorentz)"]] },
        { type: "range", path: "plane.shape.exp", label: "Exponent", min: 0.5, max: 16, step: 0.05,
          fmt: (v) => (Math.abs(v - 1) < 0.03 ? "diamond" : Math.abs(v - 2) < 0.03 ? "ellipse" : v > 11 ? "square" : v < 0.95 ? v.toFixed(2) + " star" : v.toFixed(2)),
          show: () => inv() && pl().shape.kind === "superellipse" },
        { type: "range", path: "plane.shape.sides", label: "Sides", min: 3, max: 12, step: 1, fmt: int, show: () => inv() && pl().shape.kind === "polygon" },
        { type: "range", path: "plane.shape.aspect", label: "Aspect", min: 0.25, max: 3, step: 0.01, fmt: f2, show: () => inv() && pl().shape.kind !== "circle" },
        { type: "range", path: "plane.shape.ang", label: "Shape angle", min: 0, max: 180, step: 1, ...deg, show: () => inv() && pl().shape.kind !== "circle" },
        { type: "hint", html: "Inversion in a gauge N: u &rarr; u r&sup2;/N(u)&sup2;. Still an involution, but only the circle is conformal, so shapes use single precision and a singular-value distance bound." },
      ],
    },
    {
      id: "mirror", title: "Mirrors", show: inv, collapsible: true, closed: true,
      items: [
        { type: "check", path: "plane.mir.on", label: "Fold into a k-fold wedge", refreshAll: true },
        { type: "range", path: "plane.mir.k", label: "Order k", min: 2, max: 12, step: 1, fmt: int, show: () => inv() && pl().mir.on },
        { type: "range", path: "plane.mir.ang", label: "Wedge angle", min: 0, max: 360, step: 1, ...deg, show: () => inv() && pl().mir.on },
      ],
    },

    /* ---------------- limit set ---------------- */
    {
      id: "group", title: "Group", show: isLimit,
      items: [
        { type: "select", path: "limit.recipe", refreshAll: true, onChange: () => app.actions.fit(), options: [
          ["grandma", "Grandma's recipe"], ["maskit", "Maskit"], ["riley", "Riley"], ["jorgensen", "Jorgensen"]] },
        { type: "hint", html: () => LIMIT_HINT[L().recipe] || "" },
        { type: "range", path: "limit.ta.0", label: "t<sub>a</sub> real", min: 1.6, max: 3.2, step: 0.001, fmt: f3, show: lr("grandma", "jorgensen") },
        { type: "range", path: "limit.ta.1", label: "t<sub>a</sub> imaginary", min: -0.6, max: 0.6, step: 0.001, fmt: f3, show: lr("grandma", "jorgensen") },
        { type: "range", path: "limit.tb.0", label: "t<sub>b</sub> real", min: 1.6, max: 3.2, step: 0.001, fmt: f3, show: lr("grandma", "jorgensen") },
        { type: "range", path: "limit.tb.1", label: "t<sub>b</sub> imaginary", min: -0.6, max: 0.6, step: 0.001, fmt: f3, show: lr("grandma", "jorgensen") },
        { type: "range", path: "limit.mu.0", label: "&mu; real", min: -1, max: 1, step: 0.001, fmt: f3, show: lr("maskit") },
        { type: "range", path: "limit.mu.1", label: "&mu; imaginary", min: 1.5, max: 2.4, step: 0.001, fmt: f3, show: lr("maskit") },
        { type: "range", path: "limit.c.0", label: "c real", min: -2.5, max: 2.5, step: 0.001, fmt: f3, show: lr("riley") },
        { type: "range", path: "limit.c.1", label: "c imaginary", min: -2.5, max: 2.5, step: 0.001, fmt: f3, show: lr("riley") },
        { type: "html", cls: "stats", live: true, update: (n) => { n.innerHTML = app.limitStatsHTML(); } },
      ],
    },
    {
      id: "lsdraw", title: "Search & drawing", show: isLimit,
      items: [
        { type: "range", path: "limit.eps", label: "Segment length", min: 0.4, max: 4, step: 0.05, fmt: (v) => v.toFixed(2) + " px", tip: "Stop a branch once its piece of the curve is this short" },
        { type: "range", path: "limit.maxDepth", label: "Max word length", min: 20, max: 600, step: 1, fmt: int },
        { type: "range", path: "limit.weight", label: "Line weight", min: 0.5, max: 6, step: 0.05, fmt: f2 },
        { type: "range", path: "limit.gain", label: "Density gain", min: 0.1, max: 6, step: 0.05, fmt: f2 },
      ],
    },

    /* ---------------- space ---------------- */
    {
      id: "sform", title: "Formula", show: isSpace,
      items: [
        { type: "select", path: "space.formula", refreshAll: true, onChange: onFormula, options: [
          ["apollo", "Apollonian sphere packing"], ["pk", "Pseudo-Kleinian"], ["lat", "Lattice Apollonian"], ["klein", "Kleinian (Maskit) 3D"]] },
        { type: "hint", html: () => SPACE_HINT[sp().formula] || "" },
        { type: "buttons", show: sf("apollo"), buttons: [{ label: "Reset tetrahedron", wide: true, onClick: () => app.actions.resetTet() }] },
        { type: "html", cls: "stats", show: sf("apollo"), live: true, update: (n) => { n.innerHTML = app.tetStatsHTML(); } },
        { type: "select", path: "space.hollow", label: "Hollow out", num: true, show: sf("apollo"), onChange: () => app.actions.fit(), options: [
          ["0", "Seed sphere 1 (view from inside)"], ["1", "Seed sphere 2"], ["2", "Seed sphere 3"], ["3", "Seed sphere 4"],
          ["4", "Enclosing sphere (view from outside)"], ["-1", "Nothing (solid)"]] },
        { type: "hint", show: sf("apollo"), html: "The packing fills space, so there is nowhere to stand. Hollowing one sphere opens a chamber whose walls are its tangent neighbours; its images stay solid." },
        { type: "range", path: "space.srad", label: "Sphere radius", min: 0.6, max: 1.18, step: 0.005, fmt: f3, show: sf("apollo") },

        { type: "range", path: "space.pk.size", label: "Inversion size", min: 0.4, max: 1.6, step: 0.001, fmt: f3, show: sf("pk") },
        { type: "range", path: "space.pk.csize.0", label: "Box x", min: 0.4, max: 1.6, step: 0.001, fmt: f3, show: sf("pk") },
        { type: "range", path: "space.pk.csize.1", label: "Box y", min: 0.4, max: 1.6, step: 0.001, fmt: f3, show: sf("pk") },
        { type: "range", path: "space.pk.csize.2", label: "Box z", min: 0.4, max: 1.6, step: 0.001, fmt: f3, show: sf("pk") },
        { type: "range", path: "space.pk.c.0", label: "Offset x", min: -0.6, max: 0.6, step: 0.001, fmt: f3, show: sf("pk") },
        { type: "range", path: "space.pk.c.1", label: "Offset y", min: -0.6, max: 0.6, step: 0.001, fmt: f3, show: sf("pk") },
        { type: "range", path: "space.pk.c.2", label: "Offset z", min: -0.6, max: 0.6, step: 0.001, fmt: f3, show: sf("pk") },
        { type: "range", path: "space.pk.thick", label: "Base disc radius", min: 0.01, max: 1.6, step: 0.0005, fmt: (v) => v.toFixed(4), show: sf("pk"), tip: "Radius of the disc whose images build the structure (Mandelbulber uses 0.92784)" },

        { type: "range", path: "space.lat.s", label: "Inversion scale", min: 1.0, max: 1.8, step: 0.001, fmt: f3, show: sf("lat") },
        { type: "range", path: "space.lat.thick", label: "Thickness", min: 0, max: 0.3, step: 0.001, fmt: f3, show: sf("lat") },
        { type: "range", path: "space.lat.shape", label: "Slab / tube blend", min: 0, max: 1, step: 0.01, fmt: f2, show: sf("lat") },

        { type: "range", path: "space.klein.mu.0", label: "&mu; real", min: -1, max: 1, step: 0.001, fmt: f3, show: sf("klein") },
        { type: "range", path: "space.klein.mu.1", label: "&mu; imaginary", min: 1.6, max: 2.2, step: 0.001, fmt: f3, show: sf("klein") },
        { type: "check", path: "space.klein.floor", label: "Floor (the boundary plane)", show: sf("klein") },
        { type: "range", path: "space.klein.wrapz", label: "Depth wrap", min: 0, max: 3, step: 0.01, fmt: (v) => (v === 0 ? "off" : v.toFixed(2)), show: sf("klein"),
          tip: "Fold the third axis periodically (not a group element: knighty's artistic variant)" },
        { type: "range", path: "space.klein.thick", label: "Wall offset", min: -0.03, max: 0.03, step: 0.0005, fmt: (v) => v.toFixed(4), show: sf("klein") },

        { type: "range", path: () => `space.${sp().formula}.maxIter`, label: "Iterations", min: 2, max: 400, step: 1, fmt: int, show: isSpace },
        { type: "range", path: () => `space.${sp().formula}.step`, label: "Step factor", min: 0.1, max: 1.2, step: 0.01, fmt: f2, show: isSpace,
          tip: "Lower if surfaces punch through" },
        { type: "range", path: "space.march", label: "March steps", min: 40, max: 600, step: 1, fmt: int, show: isSpace },
        { type: "range", path: "space.detail", label: "Hit threshold", min: 0.25, max: 6, step: 0.05, fmt: f2, show: isSpace, tip: "In pixels: higher is faster and softer" },
      ],
    },
    {
      id: "light", title: "Lighting & camera", show: isSpace, collapsible: true,
      items: [
        { type: "seg", path: "space.rmode", label: "Renderer", options: [["path", "Path traced"], ["studio", "Studio"]], refreshAll: true },
        { type: "hint", html: () => (sp().rmode === "path"
          ? "Monte Carlo lighting: soft shadows from the sun's disc and sky bounces converge as samples accumulate. While you drag, a fast preview is shown."
          : "Deterministic lighting: penumbra-estimated soft shadows and distance-estimate occlusion. Converges in a few samples.") },
        { type: "range", path: "space.bounces", label: "Bounces", min: 1, max: 3, step: 1, fmt: int, show: () => isSpace() && sp().rmode === "path" },
        { type: "seg", path: "space.backdrop", label: "Backdrop", options: [["dark", "Dark"], ["sky", "Sky"]] },
        { type: "range", path: "space.light.yaw", label: "Sun direction", min: 0, max: 360, step: 1, ...deg },
        { type: "range", path: "space.light.pitch", label: "Sun height", min: -10, max: 89, step: 1, ...deg },
        { type: "range", path: "space.sunI", label: "Sun intensity", min: 0, max: 8, step: 0.05, fmt: f2 },
        { type: "range", path: "space.sunSize", label: "Sun size (softness)", min: 0.005, max: 0.4, step: 0.005, fmt: f3, show: () => isSpace() && sp().rmode === "path" },
        { type: "check", path: "space.lamp.on", label: "Lamp (lights closed scenes)", refreshAll: true },
        { type: "seg", path: "space.lamp.at", label: "Lamp position", show: () => isSpace() && sp().lamp.on, options: [["target", "Orbit centre"], ["eye", "Beside the eye"]] },
        { type: "range", path: "space.lamp.power", label: "Lamp power", min: 0, max: 6, step: 0.01, fmt: f2, show: () => isSpace() && sp().lamp.on },
        { type: "range", path: "space.skyI", label: "Sky intensity", min: 0, max: 3, step: 0.01, fmt: f2 },
        { type: "range", path: "space.skyTint", label: "Sky tint from palette", min: 0, max: 1, step: 0.01, fmt: f2 },
        { type: "check", path: "space.shadows", label: "Soft shadows (studio, lamp)" },
        { type: "range", path: "space.shadowK", label: "Shadow hardness", min: 2, max: 48, step: 0.5, fmt: f2, show: () => isSpace() && sp().rmode === "studio" && sp().shadows },
        { type: "range", path: "space.ao", label: "Ambient occlusion", min: 0, max: 2, step: 0.01, fmt: f2, show: () => isSpace() && sp().rmode === "studio" },
        { type: "range", path: "space.aoR", label: "Occlusion radius", min: 0.005, max: 0.3, step: 0.001, fmt: f3 },
        { type: "range", path: "space.amb", label: "Sky ambient", min: 0, max: 2, step: 0.01, fmt: f2, show: () => isSpace() && sp().rmode === "studio" },
        { type: "range", path: "space.head", label: "Camera light", min: 0, max: 1.5, step: 0.01, fmt: f2, tip: "Unshadowed fill from the eye: lights closed scenes" },
        { type: "range", path: "space.spec", label: "Specular", min: 0, max: 1.5, step: 0.01, fmt: f2 },
        { type: "range", path: "space.shine", label: "Shininess", min: 4, max: 160, step: 1, fmt: int },
        { type: "range", path: "space.rim", label: "Sky sheen", min: 0, max: 1.5, step: 0.01, fmt: f2 },
        { type: "range", path: "space.fog", label: "Fog", min: 0, max: 3, step: 0.01, fmt: f2 },
        { type: "range", path: "space.glow", label: "Glow", min: 0, max: 2, step: 0.01, fmt: f2 },
        { type: "range", path: "space.exposure", label: "Exposure", min: 0.2, max: 4, step: 0.01, fmt: f2 },
        { type: "range", path: "space.lens", label: "Aperture (DOF)", min: 0, max: 1, step: 0.005, fmt: f3, tip: "Depth of field resolves as samples accumulate" },
        { type: "range", path: "space.focus", label: "Focus distance", min: 0.02, max: 6, step: 0.005, fmt: f3, show: () => isSpace() && sp().lens > 0 },
        { type: "buttons", show: () => isSpace() && sp().lens > 0, buttons: [{ label: "Focus on orbit target", wide: true, onClick: () => app.actions.focusTarget() }] },
      ],
    },
    {
      id: "cut", title: "Section plane", show: isSpace, collapsible: true, closed: true,
      items: [
        { type: "check", path: "space.cut.on", label: "Cut the scene open", refreshAll: true },
        { type: "range", path: "space.cut.off", label: "Offset", min: -3, max: 3, step: 0.005, fmt: f3, show: () => isSpace() && sp().cut.on },
        { type: "range", path: "space.cut.yaw", label: "Plane direction", min: 0, max: 360, step: 1, ...deg, show: () => isSpace() && sp().cut.on },
        { type: "range", path: "space.cut.pitch", label: "Plane tilt", min: -90, max: 90, step: 1, ...deg, show: () => isSpace() && sp().cut.on },
        { type: "buttons", show: () => isSpace() && sp().cut.on, buttons: [{ label: "Face the camera", wide: true, onClick: () => app.actions.cutToCamera() }] },
      ],
    },

    /* ---------------- shared ---------------- */
    {
      id: "ginv", title: "Global inversion", show: () => isPlane() || isSpace(), collapsible: true, closed: true,
      items: [
        { type: "check", path: () => (isSpace() ? "space.ginv.on" : "plane.ginv.on"), label: "View through an inverting circle / sphere", refreshAll: true },
        { type: "range", path: () => (isSpace() ? "space.ginv.r" : "plane.ginv.r"), label: "Radius", min: 0.02, max: 3, step: 0.001, fmt: f3,
          show: () => (isSpace() ? sp().ginv.on : isPlane() && pl().ginv.on) },
        { type: "range", path: "space.ginv.x", label: "Centre x", min: -2, max: 2, step: 0.001, fmt: f3, show: () => isSpace() && sp().ginv.on },
        { type: "range", path: "space.ginv.y", label: "Centre y", min: -2, max: 2, step: 0.001, fmt: f3, show: () => isSpace() && sp().ginv.on },
        { type: "range", path: "space.ginv.z", label: "Centre z", min: -2, max: 2, step: 0.001, fmt: f3, show: () => isSpace() && sp().ginv.on },
        { type: "hint", show: () => isPlane() && pl().ginv.on, html: "Drag the amber centre and rim on the canvas. Inverting the view first turns the outside inside: the whole packing folds into the circle." },
      ],
    },
    {
      id: "iter", title: "Iteration", show: isPlane,
      items: [
        { type: "range", path: "plane.maxIter", label: "Reflection depth", min: 4, max: 1200, step: 1, fmt: int },
        { type: "seg", path: "plane.precision", label: "Coordinate precision", show: inv, options: [["auto", "Auto"], ["fast", "Single"], ["deep", "Double"]] },
        { type: "hint", show: inv, html: () => (app.plane.deepBroken
          ? "This driver has no true 24-bit highp float, so the emulated double is unavailable; zoom is limited to about 3&thinsp;000&times;."
          : "Single precision loses the picture past about 3&thinsp;000&times;. Auto switches to an emulated double there (also for the gap-fill duals), holding to about 10<sup>10</sup>&times;.") },
      ],
    },
    {
      id: "colour", title: "Colour",
      items: [
        { type: "html", render: (n) => buildPalettes(n, app), update: (n) => { [...n.querySelectorAll("button")].forEach((b, i) => b.classList.toggle("on", i === S().color.pal)); } },
        { type: "select", path: "color.cmode", label: "Mapped from", num: true, options: [
          ["0", "Reflection count"], ["1", "Magnification"], ["2", "Which generator"], ["3", "Distance / position"],
          ["4", "Orbit trap"], ["5", "Escape angle"], ["6", "Parity (two-tone tiling)"], ["7", "Log depth"]] },
        { type: "range", path: "color.cyc", label: "Cycle", min: 0.05, max: 4, step: 0.01, fmt: f2 },
        { type: "range", path: "color.hue", label: "Shift", min: 0, max: 1, step: 0.005, fmt: f2 },
        { type: "range", path: "color.fill", label: "Fill strength", min: 0, max: 1, step: 0.01, fmt: f2, show: () => !isLimit() },
        { type: "range", path: "color.lineW", label: "Arc weight", min: 0, max: 6, step: 0.05, fmt: f2, show: isPlane },
        { type: "range", path: "color.glow", label: "Halo", min: 0, max: 1, step: 0.01, fmt: f2, show: () => !isSpace() },
        { type: "range", path: "color.relief", label: "Relief", min: 0, max: 2, step: 0.01, fmt: f2, show: () => isPlane() && !!app.G.ext.deriv,
          tip: "Pillow shading from the distance estimate" },
        { type: "range", path: "color.reliefAng", label: "Relief light", min: 0, max: 360, step: 1, ...deg, show: () => isPlane() && S().color.relief > 0 },
      ],
    },
    {
      id: "curv", title: "Curvature", show: inv, collapsible: true, closed: true,
      items: [{ type: "html", cls: "bends", live: true, update: (n) => { n.innerHTML = app.bendsHTML(); } }],
    },
    {
      id: "render", title: "Render & export", collapsible: true,
      items: [
        { type: "range", path: "render.samples", label: "Samples (progressive)", min: 1, max: 256, step: 1, fmt: int, show: () => !isLimit() },
        { type: "range", path: "render.quality", label: "Resolution", min: 0.35, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%", onChange: () => app.resize() },
        { type: "range", path: "render.interactScale", label: "While dragging (3D)", min: 0.2, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + "%", show: isSpace },
        { type: "select", label: "Export size", path: "render.exportScale", num: true, options: [["1", "1&times; view"], ["2", "2&times;"], ["3", "3&times;"], ["4", "4&times;"], ["6", "6&times;"], ["8", "8&times;"]] },
        { type: "buttons", buttons: [
          { label: "Save PNG", id: "bSave", wide: true, onClick: (b) => app.actions.savePNG(b) }] },
        { type: "html", cls: "stats", live: true, update: (n) => { n.innerHTML = app.renderStatsHTML(); } },
      ],
    },
    {
      id: "anim", title: "Animate", collapsible: true, closed: true,
      items: [
        { type: "select", path: "anim.driver", options: DRIVERS.map((d) => [d.id, d.label]) },
        { type: "hint", html: () => app.anim.hint() },
        { type: "range", path: "anim.speed", label: "Speed", min: 0.05, max: 3, step: 0.01, fmt: f2 },
        { type: "check", path: "anim.hue", label: "Cycle colour shift too" },
        { type: "range", path: "anim.recSamples", label: "Samples per recorded frame", min: 1, max: 32, step: 1, fmt: int, show: () => !isLimit() },
        { type: "buttons", update: (b) => { b[0].textContent = app.anim.playing ? "Stop" : "Play"; b[1].textContent = app.anim.recording ? "Stop recording" : "Record WebM"; },
          buttons: [
            { label: "Play", onClick: () => app.anim.toggle() },
            { label: "Record WebM", onClick: () => app.anim.toggleRecord() }] },
      ],
    },
    {
      id: "presets", title: "Presets", collapsible: true,
      items: [
        { type: "html", render: (n) => buildPresets(n, app), update: (n) => updateUserPresets(n, app) },
        { type: "buttons", buttons: [
          { label: "Save to browser", onClick: () => app.actions.saveUserPreset() },
          { label: "Copy link", onClick: (b) => app.actions.copyLink(b) },
          { label: "Export JSON", onClick: () => app.actions.exportJSON() },
          { label: "Import JSON", onClick: () => app.actions.importJSON() }] },
      ],
    },
    {
      id: "actions", title: "",
      items: [
        { type: "buttons", update: (b) => { b[2].textContent = S().handles ? "Hide handles" : "Show handles"; }, buttons: [
          { label: "Randomise", onClick: () => app.actions.randomise() },
          { label: "Fit view", onClick: () => app.actions.fit() },
          { label: "Hide handles", onClick: () => app.actions.toggleHandles() },
          { label: "Undo", onClick: () => app.actions.undo() }] },
        { type: "hint", html: (window.matchMedia && matchMedia("(pointer: coarse)").matches)
          ? "Drag to pan, pinch to zoom, drag a handle to move it. In Space view one finger orbits and two fingers pan. Double-tap any label to reset it."
          : "Scroll to zoom, drag to pan (Space: drag to orbit, shift-drag to pan). <b>H</b> handles &middot; <b>R</b> randomise &middot; <b>F</b> fit &middot; <b>S</b> save &middot; <b>Space</b> play &middot; <b>Ctrl+Z / Ctrl+Shift+Z</b> undo / redo. Double-click any label to reset it." },
      ],
    },
  ];
}

function buildPalettes(node, app) {
  node.className = "seg pal";
  PALETTES.forEach((P, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = P.name;
    const stops = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const col = [0, 1, 2].map((ch) => Math.round(255 * Math.max(0, Math.min(1, P.a[ch] + P.b[ch] * Math.cos(2 * Math.PI * (P.c[ch] * t + P.d[ch]))))));
      stops.push(`rgb(${col.join(",")}) ${Math.round(t * 100)}%`);
    }
    b.style.background = `linear-gradient(90deg,${stops.join(",")})`;
    b.addEventListener("click", () => { app.S.color.pal = i; app.changed({ commit: true }); app.panel.refresh(); });
    node.appendChild(b);
  });
}

function buildPresets(node, app) {
  node.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "presets";
  PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pre";
    b.innerHTML = `<i>${p.group}</i>${p.name}`;
    b.addEventListener("click", () => app.actions.loadPreset(p));
    grid.appendChild(b);
  });
  node.appendChild(grid);
  const user = document.createElement("div");
  user.className = "upresets";
  node.appendChild(user);
  updateUserPresets(node, app);
}
function updateUserPresets(node, app) {
  const user = node.querySelector(".upresets");
  if (!user) return;
  const list = app.userPresets();
  user.innerHTML = list.length ? '<div class="sub">Saved in this browser</div>' : "";
  list.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "crow";
    row.innerHTML = `<span>${p.name.replace(/[<>&]/g, "")}</span><span class="k">&times;</span>`;
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("k")) app.actions.deleteUserPreset(i);
      else app.actions.loadPreset(p);
    });
    user.appendChild(row);
  });
}

export { HOME_S };
