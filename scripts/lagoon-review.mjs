// Dolphin Lagoon visual review (not the browser suite). Start a server first
// (npx vite --port 5340). Usage: node scripts/lagoon-review.mjs [baseUrl] [width] [height] [milestone]
// Opens the lagoon in a development preview (it is release-locked) and writes
// .tmp/lagoon-review/<w>x<h>/ frames + evidence.json.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hubModel } from "./review-saves.mjs";

const [base = "http://localhost:5340/", W = "1366", H = "768", MS = "0"] = process.argv.slice(2);
const w = Number(W), h = Number(H), ms = Number(MS);
const out = path.resolve(`.tmp/lagoon-review/${w}x${h}`);
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
  const s = await call("state");
  evidence.frames[name] = await call("lagoon");
  evidence.perf[name] = s.perf;
};
const clearLines = async () => { for (let i = 0; i < 8; i++) { if (!(await call("state")).line) return; await page.getByTestId("next").dispatchEvent("click"); await step(400); } };
try {
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(1500);
  await clearLines();
  await call("visitors", false);
  await call("preview", "lagoon");
  if (ms > 0) await call("lagoonTo", ms);
  await call("outdoor", "lagoon");
  await step(1300);
  await shot("00-reveal-start");
  await step(1600);
  await shot("01-reveal-mid");
  await step(3000);
  await clearLines();
  await step(1500);
  await shot("02-lagoon");
  for (const v of ["gallery", "deck", "care"]) {
    await page.getByTestId(`lagoon-view-${v}`).dispatchEvent("click");
    await step(2600);
    await clearLines();
    await shot(`03-${v}`);
    await step(5000);
    await shot(`04-${v}-later`);
  }
  await page.getByTestId("btn-lagoon-feed").dispatchEvent("click");
  await step(1200);
  await shot("05-feeding");
  await step(5000);
  await shot("06-fed");
  await page.getByTestId("btn-lagoon-toys").dispatchEvent("click");
  await step(600);
  await shot("07-toys");
  await page.locator("[data-testid=lagoon-toy][data-toy=ball]").dispatchEvent("click");
  await step(6000);
  await shot("08-ball");
  await page.getByTestId("lagoon-view-lagoon").dispatchEvent("click");
  await step(2600);
  await call("lagoonLook", "pair", "kai");
  await step(400);
  await shot("09-look");
  await call("lagoonVisitor");
  await step(300);
  await page.getByTestId("lagoon-visitor").dispatchEvent("click");
  await step(2600);
  await shot("10-question");
  evidence.prompt = (await call("state")).prompt;
} catch (e) {
  evidence.errors.push(String(e.message ?? e));
  await page.screenshot({ path: path.join(out, "error.png") });
}
fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
await browser.close();
console.log(JSON.stringify({ errors: evidence.errors, prompt: evidence.prompt?.question ?? null, perf: evidence.perf }, null, 1));
