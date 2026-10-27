// Rendered evidence for happiness-based tips: per-tank tip tags and the total,
// Pico's one-time tips lesson, happiness-rise feedback, and the coin-shortfall hint.
// Start Vite/preview first.
// Usage: node scripts/tips-review.mjs [baseUrl]
// Output: .tmp/tips-review/manifest.json plus frames (human review).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = process.argv[2] ?? "http://127.0.0.1:5320/";
const out = path.join(root, ".tmp", "tips-review");
fs.mkdirSync(out, { recursive: true });
const stubsSource = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSource.slice(stubsSource.indexOf("`") + 1, stubsSource.lastIndexOf("`"));
const manifest = { base, frames: [], errors: [], checks: [] };

const decor = (id, kind, slot) => ({ id, kind, variant: "big", slot });
const model = (over = {}) => ({
  coins: 20,
  tanks: [
    { id: "t1", type: "small", slot: "A", food: 100, clean: 100, fish: [{ id: "f1", species: "clownfish" }, { id: "f2", species: "bluetang" }],
      decor: [decor("d1", "plant", 0), decor("d2", "coral", 1), decor("d3", "castle", 2)], upgrades: { filter: false, lamp: false } },
    { id: "t2", type: "big", slot: "B", food: 15, clean: 20, fish: [{ id: "f3", species: "clownfish" }], decor: [], upgrades: { filter: false, lamp: false } }
  ],
  inv: { fish: [], decor: [], tanks: [] },
  progress: {
    stage: 6, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 8,
    helpedInStage: 0, namedInStage: 0, photo: true, star: true, freePlay: true, hallOpen: false, superStar: false,
    tipsTaught: false, said: ["orangePlease", "feedFish"]
  },
  stats: { coinsEarned: 300, helped: 8, fishBought: 3, seconds: 1500 },
  nextId: 20, paid: [],
  ...over
});

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function reviewPage(saveModel, name, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => manifest.errors.push({ page: name, error: e.message }));
  page.on("console", (m) => { if (m.type() === "error") manifest.errors.push({ page: name, error: m.text() }); });
  await page.addInitScript(stubs);
  await page.addInitScript((fixture) => {
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    localStorage.setItem("at.save.v1", JSON.stringify({ v: 2, model: fixture }));
  }, saveModel);
  const epoch = new Date("2026-10-27T00:00:00Z");
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  const call = (method, ...args) => page.evaluate(([method, args]) => window.__at[method](...args), [method, args]);
  const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
  const click = (id) => page.getByTestId(id).dispatchEvent("click");
  const shot = async (file, purpose, extra = {}) => {
    await page.screenshot({ path: path.join(out, `${file}.png`), animations: "disabled" });
    manifest.frames.push({ file: `${file}.png`, page: name, purpose, viewport, ...extra });
    console.log(`saved ${file}.png`);
  };
  await page.goto(`${base}${base.includes("?") ? "&" : "?"}e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await step(100);
  await click("btn-continue");
  await step(2400);
  await call("visitors", false);
  await call("freezeFish", true);
  return { context, page, call, step, click, shot };
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }]) {
  const tag = `${viewport.width}x${viewport.height}`;
  // 1. A visitor who saw a happy and a sad tank: +3 and +1 above them, +4 at the visitor.
  {
    const { context, call, step, shot } = await reviewPage(model(), `tips-${tag}`, viewport);
    const before = (await call("state")).coins;
    await call("tipVisitor", ["t1", "t2"], 0, 1.2);
    for (const ms of [250, 300, 450, 600]) {
      await step(ms);
      await shot(`tags-${tag}-${ms}`, "Per-tank tip tags (face = mood) and the visitor's total");
    }
    const after = (await call("state")).coins;
    manifest.checks.push({ tag, paid: after - before, expected: 4 });
    // 2. Pico's lesson follows the first tips (once).
    await step(1500);
    await shot(`lesson-${tag}`, "Pico: Happy fish earn more coins! with the face→coin picture");
    await context.close();
  }
}

// 3. Close-up: caring for the sad tank pops the happiness bar; the happy tank reaching happy cheers once.
{
  const { context, page, call, step, click, shot } = await reviewPage(model({ progress: { ...model().progress, tipsTaught: true } }), "rise", { width: 1366, height: 768 });
  await call("set", { view: "tank", tankId: "t2", hall: 0 });
  await step(2400);
  await shot("rise-sad-before", "Sad big tank before care");
  await click("btn-feed");
  await step(300);
  await page.waitForTimeout(150);
  await shot("rise-fed", "Feeding: bar pulses; sad → okay sparkles");
  await step(2000);
  await call("setCare", "t1", 30, 30);
  await call("set", { view: "room", tankId: null });
  await step(2400);
  await shot("rise-room-before", "Room: happy tank made okay");
  await call("setCare", "t1", 100, 100);
  for (const ms of [150, 250, 400]) {
    await step(ms);
    await shot(`rise-room-${ms}`, "Room: badge bounce, hearts and 'Happy fish earn more coins!' once");
  }
  await context.close();
}

// 4. Shortfall hint for the Ocean Hall names the unhappy tank.
{
  const { context, page, step, click, shot } = await reviewPage(model({ progress: { ...model().progress, tipsTaught: true } }), "hint", { width: 1366, height: 768 });
  await step(600);
  await shot("hint-next", "Next: Need N more coins!");
  for (let i = 0; i < 2; i++) {
    await click("btn-help");
    await step(600);
    await page.waitForTimeout(200);
    await shot(`hint-tier${i + 1}`, "Help tiers: make fish happy for better tips");
  }
  await context.close();
}

fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
await browser.close();
