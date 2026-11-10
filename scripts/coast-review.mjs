// Coastal & Polar Zone visual review (not the browser suite). Start a server first
// (npx vite build, then npx vite preview --port 5341).
// Usage: node scripts/coast-review.mjs [baseUrl] [width] [height] [milestone] [label]
// Writes .tmp/coast-review/<w>/ frames + evidence.json.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hubModel } from "./review-saves.mjs";

const [base = "http://localhost:5341/", W = "1366", H = "768", MS = "3", label = ""] = process.argv.slice(2);
const w = Number(W), h = Number(H), ms = Number(MS);
const out = path.resolve(`.tmp/coast-review/${label ? `${label}/` : ""}${w}`);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const evidence = { errors: [], steps: [], frames: {} };
page.on("pageerror", (e) => evidence.errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") evidence.errors.push(m.text()); });
await page.addInitScript((model) => {
  localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
}, { ...hubModel(true), coins: 900 });
const epoch = new Date("2026-11-10T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const mark = (t) => evidence.steps.push(t);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
const shot = async (name) => {
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const state = await call("state");
  evidence.frames[name] = { ...await call("coast"), perf: state.perf, camera: state.camera };
};
const clearLines = async () => { for (let i = 0; i < 8; i++) { if (!(await call("state")).line) return; await page.getByTestId("next").dispatchEvent("click"); await step(400); } };
try {
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(1500);
  await clearLines();
  await call("visitors", false);
  mark("coastTo");
  await call("coastTo", ms);
  mark("coastTo done");
  const coastHall = (await call("state")).hall; // still the hall the save opened in
  await call("set", { hall: 6, view: "room", tankId: null, panel: null, coastView: "all" });
  if (label !== "before") {
    for (let i = 0; i < 8; i++) {
      await step(1000);
      await shot(`00-reveal-${i + 1}s`);
    }
  } else await step(2500);
  await clearLines();
  await step(3000);
  mark("shot all");
  await shot("01-all");
  for (const v of ["penguins", "seals", "otters"]) {
    await call("set", { coastView: v });
    await step(2500);
    await shot(`02-${v}`);
    await step(6000);
    await shot(`03-${v}-later`);
    if (v === "penguins" && label !== "before") {
      await page.getByTestId("coast-view-underwater").dispatchEvent("click");
      await step(2500);
      await shot("06-underwater");
      await page.getByTestId("coast-view-penguins").dispatchEvent("click");
      await step(2500);
      // Observe the real simulation; never reposition an animal for the shoreline frames.
      let entering = null;
      for (let t = 0; t < 180 && !entering; t++) {
        const animals = (await call("coast")).animals;
        entering = animals.find((a) => a.habitat === "penguins" && a.mode === "rampDown");
        if (!entering) await step(500);
      }
      if (!entering) throw new Error("No penguin walked down the shoreline within 90 simulation seconds");
      evidence.shorePenguin = entering.id;
      for (let i = 0; i < 9; i++) {
        await shot(`07-shore-${String(i).padStart(2, "0")}`);
        await step(1000);
      }
    }
  }
  // An activity at the penguins: the count with numbers.
  await call("set", { coastView: "penguins" });
  await step(1500);
  await call("coastVisitor", "penguins");
  await step(300);
  await shot("04-visitor-chip");
  await page.getByTestId("coast-visitor").dispatchEvent("click");
  await step(1800);
  await shot("05-count-question");
  evidence.prompt = (await call("state")).prompt;
  evidence.startHall = coastHall;
} catch (e) {
  evidence.errors.push(String(e.message ?? e));
  await page.screenshot({ path: path.join(out, "error.png") });
}
fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
await browser.close();
console.log(JSON.stringify({ errors: evidence.errors, prompt: evidence.prompt, frames: Object.fromEntries(Object.entries(evidence.frames).map(([k, v]) => [k, v.animals.map((a) => `${a.habitat[0]}:${a.mode}`).join(" ")])) }, null, 1));
if (evidence.errors.length) process.exitCode = 1;
