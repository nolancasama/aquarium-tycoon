// Grand Aquarium Hub visual review (not the browser suite). Start a server first
// (npx vite --port 5340). Usage: node scripts/hub-review.mjs [baseUrl]
// Writes .tmp/hub-review/ (frames + evidence.json) at 1366×768, 1280×720 and 1024×768.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [base = "http://localhost:5340/"] = process.argv.slice(2);
const out = path.resolve(".tmp/hub-review");
fs.mkdirSync(out, { recursive: true });
import { hubModel } from "./review-saves.mjs";

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const evidence = { errors: [], views: {} };
for (const [w, h] of [[1366, 768], [1280, 720], [1024, 768]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => evidence.errors.push(`${w}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") evidence.errors.push(`${w}: ${m.text()}`); });
  await page.addInitScript((model) => {
    localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true }));
  }, hubModel(w !== 1366));
  const epoch = new Date("2026-11-10T00:00:00Z");
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
  const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
  const clearLines = async () => { for (let i = 0; i < 6; i++) { if (!(await call("state")).line) return; await page.getByTestId("next").dispatchEvent("click"); await step(500); } };
  const shot = async (name) => { await page.screenshot({ path: path.join(out, `${w}-${name}.png`) }); };
  try {
    await page.goto(`${base}?e2e=1&seed=7`);
    await page.waitForFunction(() => Boolean(window.__at));
    await page.getByTestId("btn-continue").dispatchEvent("click");
    await step(2500);
    if (w === 1366) {
      // Pico's one-time introduction, then the guided Map chip.
      await shot("01-intro");
      evidence.intro = (await call("state")).line;
      if (await page.getByTestId("next").count()) await page.getByTestId("next").dispatchEvent("click");
      await step(600);
      await shot("02-map-chip-guide");
    }
    await clearLines();
    await page.getByTestId("btn-map").dispatchEvent("click");
    await step(400);
    await shot("03-map");
    await page.getByTestId("map-hub").dispatchEvent("click");
    await step(1500);
    const s = await call("state");
    evidence.views[w] = { hall: s.hall, roomId: s.roomId, perf: s.perf };
    await shot("04-hub");
    await step(6000);
    await shot("05-hub-later");
    if (w === 1366) {
      await page.getByTestId("btn-map").dispatchEvent("click");
      await step(300);
      await shot("06-map-in-hub");
      await page.getByTestId("map-close").dispatchEvent("click");
      await step(300);
    }
  } catch (e) {
    evidence.errors.push(`${w}: ${e.message}`);
    await shot("error");
  }
  await page.close();
}
fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
await browser.close();
console.log(JSON.stringify(evidence, null, 2));
