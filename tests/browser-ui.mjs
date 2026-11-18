/* Optional: needs Playwright + Chrome. Serve the repo on $PORT (default 8765) first. */
import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const R = []; const ok = (c, m) => R.push((c ? "PASS " : "FAIL ") + m);
await page.goto("http://localhost:" + (process.env.PORT || 8765) + "/index.html");
await page.waitForFunction(() => window.inversionApp && window.inversionApp.panel);
const A = (fn, arg) => page.evaluate(fn, arg);
const settle = async () => { await page.waitForTimeout(250); await page.waitForFunction(() => { const a = inversionApp; return a.S.engine === "limit" ? !a.limit.pending : a.acc.n >= Math.min(a.S.render.samples, 4); }, null, { timeout: 300000 }); };
await A(() => { inversionApp.S.render.samples = 4; });

/* 1. engine segmented buttons */
for (const lab of ["Limit set", "Space", "Plane"]) {
  await page.click(`#sec-engine .seg button:has-text("${lab}")`);
  await settle();
}
ok(await A(() => inversionApp.S.engine) === "plane", "engine switching via buttons");

/* 2. formula select + slider + double-click reset */
await page.selectOption("#sec-pform select", "ring");
await settle();
ok(await A(() => inversionApp.S.plane.formula) === "ring", "formula select");
const slider = page.locator("#sec-pform input[type=range]").first();
await slider.fill("7"); await settle();
ok(await A(() => inversionApp.S.plane.ring.n) === 7, "ring circles slider -> 7");
ok(await page.locator("#sec-pform .lab span.mod").count() > 0, "changed label marked");
await page.locator("#sec-pform .lab span", { hasText: "Circles" }).dblclick(); await settle();
ok(await A(() => inversionApp.S.plane.ring.n) === 5, "double-click resets to default 5");

/* 3. undo / redo */
await page.keyboard.press("Control+z"); await settle();
const afterUndo = await A(() => inversionApp.S.plane.ring.n);
await page.keyboard.press("Control+Shift+z"); await settle();
const afterRedo = await A(() => inversionApp.S.plane.ring.n);
ok(afterUndo === 7 && afterRedo === 5, `undo/redo (${afterUndo}, ${afterRedo})`);

/* 4. URL round trip */
await A(() => { inversionApp.S.plane.ring.n = 6; inversionApp.S.color.pal = 3; inversionApp.changed({ commit: true }); });
await page.waitForTimeout(800);
const url = page.url();
const p2 = await ctx.newPage();
await p2.goto(url);
await p2.waitForFunction(() => window.inversionApp && window.inversionApp.panel);
const rt = await p2.evaluate(() => [inversionApp.S.plane.formula, inversionApp.S.plane.ring.n, inversionApp.S.color.pal]);
ok(rt[0] === "ring" && rt[1] === 6 && rt[2] === 3, "URL hash restores state " + JSON.stringify(rt));
await p2.close();

/* 5. drag an Apollonian vertex */
await page.selectOption("#sec-pform select", "apollonian"); await settle();
const before = await A(() => JSON.stringify(inversionApp.S.plane.tri[0]));
const box = await page.locator("#stage").boundingBox();
const vp = await A(() => { const a = inversionApp, t = a.S.plane.tri[0], c = a.S.plane.cam, h = a.VH / 2; return { x: a.VW / 2 + (t.x - c.x) / c.s * h, y: a.VH / 2 - (t.y - c.y) / c.s * h }; });
await page.mouse.move(box.x + vp.x, box.y + vp.y); await page.mouse.down();
await page.mouse.move(box.x + vp.x + 30, box.y + vp.y + 20, { steps: 4 }); await page.mouse.up(); await settle();
const after = await A(() => JSON.stringify(inversionApp.S.plane.tri[0]));
ok(before !== after, "vertex drag moves the triangle");
ok(await A(() => !!inversionApp.validTri()), "triangle still valid after drag");

/* 6. deep zoom engages df64 incl. gap-fill duals */
await A(() => { const a = inversionApp; a.actions.loadPreset({ state: { engine: "plane" } }); a.S.render.samples = 2; a.S.plane.cam = { x: 0.1016314495479526, y: 0.02875123284395342, s: 0.00023067474836078577 }; a.S.plane.maxIter = 400; a.changed({}); });
await settle();
const deep = await A(() => ({ deep: inversionApp.plane.info.deep, dual: inversionApp.plane.info.dual }));
ok(deep.deep && deep.dual, "deep zoom 6.7e3 uses emulated double with duals " + JSON.stringify(deep));
const sd = await A(() => { const c = document.getElementById("gl"), g = c.getContext("webgl"), w = c.width, h = c.height, px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px); let s = 0, s2 = 0, n = 0; for (let k = 0; k < px.length; k += 4 * 11) { const l = px[k]; s += l; s2 += l * l; n++; } const m = s / n; return Math.sqrt(s2 / n - m * m); });
ok(sd > 5, "deep image has structure (sd " + sd.toFixed(1) + ")");
await page.locator("#stage").screenshot({ path: "/tmp/shots/ui-deep.png" });

/* 7. every shape kind + relief + ginv compile and render */
for (const kind of ["superellipse", "polygon", "hyperbola"]) {
  await A((k) => { const a = inversionApp; a.actions.loadPreset({ state: { engine: "plane", plane: { gapFill: false, shape: { kind: k, exp: 3, aspect: 1.4, sides: 5, ang: 0.3 } }, color: { relief: 0.6 } } }); a.S.render.samples = 2; a.changed({}); }, kind);
  await settle();
  ok(!(await A(() => inversionApp.plane.info.err)), "shape " + kind + " renders");
}
await A(() => { const a = inversionApp; a.S.plane.ginv.on = true; a.S.plane.formula = "steiner"; a.changed({}); }); await settle();
ok(!(await A(() => inversionApp.plane.info.err)), "global inversion + steiner + shape");

/* 8. PNG export: plane, limit, space */
for (const [eng, extra] of [["plane", {}], ["limit", {}], ["space", { space: { formula: "lat" } }]]) {
  await A(([e, x]) => { const a = inversionApp; a.actions.loadPreset({ state: Object.assign({ engine: e }, x) }); a.S.render.samples = 2; a.S.render.exportScale = 1; a.S.render.quality = e === "space" ? 0.4 : 1; a.resize(); a.changed({}); }, [eng, extra]);
  await settle();
  const dl = page.waitForEvent("download", { timeout: 600000 });
  await page.click("#bSave");
  const d = await dl;
  const path = `/tmp/shots/export-${eng}.png`;
  await d.saveAs(path);
  ok(/inversion-v2\.1\.2-/.test(d.suggestedFilename()), `${eng} export name ${d.suggestedFilename()}`);
}
/* 9. WebM recording (short) */
await A(() => { const a = inversionApp; a.actions.loadPreset({ state: { engine: "plane", plane: { formula: "steiner" }, anim: { driver: "steinerRoll", speed: 1, hue: false, recSamples: 1 } } }); a.changed({}); });
await settle();
const dlv = page.waitForEvent("download", { timeout: 120000 });
await A(() => inversionApp.anim.toggleRecord());
await page.waitForTimeout(2500);
const rotBefore = await A(() => inversionApp.S.plane.steiner.rot);
await A(() => inversionApp.anim.toggleRecord());
const v = await dlv; await v.saveAs("/tmp/shots/rec.webm");
ok(rotBefore > 0.05 && v.suggestedFilename().endsWith(".webm"), "recording advanced the driver and saved " + v.suggestedFilename());
await A(() => { if (inversionApp.anim.playing) inversionApp.anim.toggle(); });

/* 10. free mode add/flip/delete; schottky free add pair */
await page.selectOption("#sec-pform select", "free"); await settle();
const n0 = await A(() => inversionApp.S.plane.free.length);
await page.click('#sec-pform button:has-text("Add circle")');
await page.click('#sec-pform button:has-text("Flip inside / outside")');
const n1 = await A(() => inversionApp.S.plane.free.length);
await page.click('#sec-pform button:has-text("Delete")');
const n2 = await A(() => inversionApp.S.plane.free.length);
ok(n1 === n0 + 1 && n2 === n0, `free circles add/delete ${n0}->${n1}->${n2}`);
await page.selectOption("#sec-pform select", "sfree"); await settle();
await page.click('#sec-pform button:has-text("Add pair")'); await settle();
ok(await A(() => inversionApp.S.plane.sfree.length) === 6, "schottky add pair");
ok(!(await A(() => inversionApp.plane.info.err)), "schottky free renders");
/* 11. user preset save via prompt */
page.once("dialog", (d) => d.accept("Test preset"));
await page.click('#sec-presets button:has-text("Save to browser")');
ok(await page.locator(".upresets .crow").count() === 1, "user preset saved & listed");

console.log(R.join("\n"));
console.log("console errors:", errors.length ? "\n" + errors.join("\n") : "none");
await browser.close();
