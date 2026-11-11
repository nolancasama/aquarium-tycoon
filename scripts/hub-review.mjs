// Production review: npx vite build; npx vite preview --port 5342
// node scripts/hub-review.mjs [baseUrl] [--baseline]
// Close views crop the fixed gameplay camera; no camera overrides.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hubModel } from "./review-saves.mjs";

const base = process.argv.find((x) => /^https?:/.test(x)) ?? "http://localhost:5342/";
const baseline = process.argv.includes("--baseline");
const out = path.resolve(".tmp/hub-review");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const evidence = { baseline, errors: [], views: {}, frames: [], notes: ["Close views crop the unchanged hub camera.", "Indoor Aquarium is always open: no legal locked indoor state exists."] };
try {
  for (const [w, h] of [[1366, 768], [1024, 768]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => evidence.errors.push(`${w}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") evidence.errors.push(`${w}: ${m.text()}`); });
    await page.addInitScript((model) => {
      localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
      localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true }));
    }, hubModel(true));
    const epoch = new Date("2026-11-11T00:00:00Z");
    await page.clock.install({ time: epoch });
    await page.clock.pauseAt(new Date(epoch.getTime() + 60000));
    const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
    const review = (name, ...args) => page.evaluate(([name, args]) => window.__hubReview[name](...args), [name, args]);
    const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
    const shot = async (name, clip) => {
      const file = `${baseline ? "baseline-" : ""}${w}-${name}.png`;
      await page.screenshot({ path: path.join(out, file) });
      evidence.frames.push(file);
      if (clip) {
        const close = file.replace(/\.png$/, "-close.png");
        await page.screenshot({ path: path.join(out, close), clip });
        evidence.frames.push(close);
      }
    };
    try {
      await page.goto(`${base}?e2e=1&seed=7`);
      await page.waitForFunction(() => Boolean(window.__at));
      await page.getByTestId("btn-continue").dispatchEvent("click");
      await step(800);
      await call("set", { hall: 5, view: "room", line: null, nudge: null, mapOpen: false, fade: 0 });
      await step(2500);
      const s = await call("state");
      evidence.views[w] = { hall: s.hall, roomId: s.roomId, perf: s.perf, camera: s.camera,
        bundle: await page.locator("script[type=module]").getAttribute("src") };
      await shot("default");
      if (baseline) continue;
      await page.waitForFunction(() => Boolean(window.__hubReview));
      let r = await review("state");
      await shot("window-00", r.window);
      await step(3000);
      r = await review("state");
      await shot("window-03s", r.window);
      for (const kind of ["indoor", "sharks", "coast", "lagoon", "sanctuary"]) {
        if (["coast", "lagoon", "sanctuary"].includes(kind)) await call("preview", kind);
        await step(400);
        r = await review("state");
        if (!r.doors[kind]) throw new Error(`${kind} open fixture is closed`);
        await shot(`door-${kind}-open`, r.doorway[kind]);
        if (kind === "indoor") continue;
        if (kind === "sharks") {
          await call("preview", "coast");
          await review("tunnel", false);
        } else await call("endPreview");
        await step(400);
        r = await review("state");
        if (r.doors[kind]) throw new Error(`${kind} locked fixture is open`);
        await shot(`door-${kind}-locked`, r.doorway[kind]);
        if (kind === "sharks") await call("endPreview");
      }
      await call("preview", "lagoon");
      await step(400);
      evidence.views[w].journeys = {};
      for (const direction of ["departure", "arrival"]) {
        const id = await review("journey", "lagoon", direction);
        const frames = [];
        for (let i = 0; i < 18; i++) {
          await step(i ? 500 : 100);
          const state = await review("state");
          frames.push({ seconds: i * 0.5, perf: (await call("state")).perf,
            group: state.groups.find((g) => g.id === id) ?? null });
          await shot(`${direction}-${String(i).padStart(2, "0")}`, state.doorway.lagoon);
        }
        evidence.views[w].journeys[direction] = { id, frames };
        if (direction === "departure") {
          await call("endPreview");
          await step(200);
          evidence.views[w].emptyHubPerf = (await call("state")).perf;
          await call("preview", "lagoon");
          await step(200);
        }
      }
      await call("endPreview");
      await step(400);
      await shot("default-final");
      evidence.views[w].finalPerf = (await call("state")).perf;
    } catch (e) {
      evidence.errors.push(`${w}: ${e.stack ?? e.message}`);
      await shot("error");
    } finally { await page.close(); }
  }
} finally {
  fs.writeFileSync(path.join(out, baseline ? "baseline-evidence.json" : "evidence.json"), JSON.stringify(evidence, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ errors: evidence.errors, views: Object.fromEntries(Object.entries(evidence.views).map(([k,v]) => [k, { perf:v.perf, finalPerf:v.finalPerf }])), frames: evidence.frames.length }, null, 2));
if (evidence.errors.length) process.exitCode = 1;
