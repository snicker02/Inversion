/* Optional: needs Playwright + Chrome. Serve the repo on $PORT (default 8765) first. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/tmp/shots"; mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto("http://localhost:" + (process.env.PORT || 8765) + "/index.html");
await page.waitForFunction(() => window.inversionApp && window.inversionApp.panel, null, { timeout: 20000 });
const info = await page.evaluate(() => ({ accum: inversionApp.G.accumName, highp: inversionApp.G.highp, deriv: !!inversionApp.G.ext.deriv }));
console.log("GL:", JSON.stringify(info));
const presets = await page.evaluate(async () => (await import("./ui/presets.js")).PRESETS.map((p) => p.name));
for (let i = 0; i < presets.length; i++) {
  if (only && !presets[i].toLowerCase().includes(only.toLowerCase())) continue;
  const t0 = Date.now();
  await page.evaluate(async (i) => {
    const { PRESETS } = await import("./ui/presets.js");
    inversionApp.actions.loadPreset(PRESETS[i]);
    inversionApp.S.render.samples = inversionApp.S.engine === "space" ? 3 : 6;
    inversionApp.S.render.quality = inversionApp.S.engine === "space" ? 0.4 : 1;
    inversionApp.resize();
    inversionApp.acc.n = 0;
    inversionApp.limit.covered = null;
    inversionApp.changed({});
  }, i);
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const a = inversionApp;
    if (a.S.engine === "limit") return !a.limit.pending && a.limit.covered && a.limit.count > 0;
    return a.acc.n >= a.S.render.samples;
  }, null, { timeout: 600000, polling: 500 }).catch(() => errors.push("timeout " + presets[i]));
  await page.waitForTimeout(150);
  const stats = await page.evaluate(() => {
    const c = document.getElementById("gl"), g = c.getContext("webgl");
    const w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
    let s = 0, s2 = 0, n = 0;
    for (let k = 0; k < px.length; k += 4 * 7) { const l = (px[k] + px[k + 1] + px[k + 2]) / 3; s += l; s2 += l * l; n++; }
    const m = s / n;
    return { mean: m.toFixed(1), sd: Math.sqrt(s2 / n - m * m).toFixed(1), hud: document.getElementById("hud").innerText, err: document.getElementById("err").style.display };
  });
  const file = `${OUT}/${String(i).padStart(2, "0")}-${presets[i].replace(/[^a-z0-9]+/gi, "_")}.png`;
  await page.locator("#stage").screenshot({ path: file, timeout: 300000 });
  console.log(`${presets[i].padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(1)}s mean ${stats.mean} sd ${stats.sd} err:${stats.err} | ${stats.hud}`);
}
console.log("console:", errors.length ? "\n" + errors.join("\n") : "clean");
await browser.close();
