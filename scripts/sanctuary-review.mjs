// Grand Ocean Sanctuary visual review (not the browser suite). Serve a build first
// (npx vite build && npx vite preview --port 5341). Usage:
// node scripts/sanctuary-review.mjs [baseUrl] [width] [height] [milestone]
// Opens the sanctuary in a development preview (it is release-locked) and writes
// .tmp/sanctuary-review/<w>x<h>/ frames + evidence.json.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hubModel } from "./review-saves.mjs";

const [base = "http://localhost:5341/", W = "1366", H = "768", MS = "3"] = process.argv.slice(2);
const w = Number(W), h = Number(H), ms = Number(MS);
const out = path.resolve(`.tmp/sanctuary-review/${w}x${h}`);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const evidence = { errors: [], frames: {}, perf: {} };
page.on("pageerror", (e) => evidence.errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") evidence.errors.push(m.text()); });
await page.addInitScript((model) => {
  localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
}, { ...hubModel(true), coins: 900 });
const epoch = new Date("2026-11-10T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
const step = async (t) => { for (let k = 0; k < t; k += 100) await page.clock.fastForward(Math.min(100, t - k)); };
const shot = async (name) => {
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  evidence.frames[name] = await call("sanctuary");
  evidence.perf[name] = (await call("state")).perf;
};
const clearLines = async () => { for (let i = 0; i < 8; i++) { if (!(await call("state")).line) return; await page.getByTestId("next").dispatchEvent("click"); await step(400); } };
const view = async (v, wait = 3200) => { await page.getByTestId(`sanctuary-view-${v}`).dispatchEvent("click"); await step(wait); await clearLines(); };
try {
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(1500);
  await clearLines();
  await call("visitors", false);
  await call("preview", "sanctuary");
  if (ms > 0) await call("sanctuaryTo", ms);
  await call("outdoor", "sanctuary");
  await step(1200);
  await shot("00-reveal-start");
  await step(2400);
  await shot("01-reveal-mid");
  await step(4000);
  await clearLines();
  await step(4000);
  await clearLines();
  await shot("02-lookout");
  await view("orcas", 4000);
  await shot("03-orcas");
  await step(6000);
  await shot("04-orcas-later");
  await view("underwater", 2600);
  await shot("05-underwater");
  await step(9000);
  await shot("06-underwater-later");
  await view("research");
  await shot("07-research");
  if (ms >= 3) {
    await page.getByTestId("btn-sanctuary-cleanup").dispatchEvent("click");
    await step(2500);
    await shot("08-cleanup");
    await page.getByTestId("btn-sanctuary-improve").dispatchEvent("click");
    await step(600);
    await page.locator("[data-testid=improve-choice][data-choice=music]").dispatchEvent("click");
    await step(600);
    await shot("09-improve-wrong");
    await page.locator("[data-testid=improve-choice][data-choice=kelp]").dispatchEvent("click");
    await step(3200);
    await view("belugas", 4000);
    await shot("10-belugas");
    await step(5000);
    await shot("11-belugas-later");
  }
  await view("overview");
  await call("sanctuaryLook", "breath", "kuro");
  await step(500);
  await shot("12-look");
  await page.getByTestId("btn-sanctuary-notebook").dispatchEvent("click");
  await step(500);
  await shot("13-notebook");
  await page.getByTestId("notebook-close").dispatchEvent("click");
  await step(300);
  await call("sanctuaryVisitor");
  await step(300);
  await page.getByTestId("sanctuary-visitor").dispatchEvent("click");
  await step(9000);
  await shot("14-question");
  evidence.prompt = (await call("state")).prompt;
} catch (e) {
  evidence.errors.push(String(e.message ?? e));
  await page.screenshot({ path: path.join(out, "error.png") });
}
fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
await browser.close();
console.log(JSON.stringify({ errors: evidence.errors, prompt: evidence.prompt?.question ?? null, perf: Object.fromEntries(Object.entries(evidence.perf).map(([k, v]) => [k, `${v.calls} calls ${v.triangles} tris`])) }, null, 1));
