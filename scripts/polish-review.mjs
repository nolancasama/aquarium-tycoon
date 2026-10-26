// Rendered evidence for the HUD/collision/polish pass. Start Vite/preview first.
// Usage: node scripts/polish-review.mjs [baseUrl]
// Output: .tmp/polish-review/final/manifest.json plus full frames and bench crops.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = process.argv[2] ?? "http://127.0.0.1:5320/";
const out = path.join(root, ".tmp", "polish-review", "final");
fs.mkdirSync(out, { recursive: true });
const stubsSource = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSource.slice(stubsSource.indexOf("`") + 1, stubsSource.lastIndexOf("`"));
const manifest = { base, seed: 7, frames: [], errors: [], visibilityIssues: [], notes: [
  "Screenshots require human review; generating them does not assert aesthetic correctness.",
  "Static scenes use seeded version-2 saves and explicit review-only UI state.",
  "The first visitor sequence starts from New Game with no save and uses real-speed movement (no fast=1)."
] };

let nextId = 1;
const tank = (type, slot, species) => ({
  id: `t${nextId++}`, type, slot, food: 100, clean: 100,
  fish: species.map((species) => ({ id: `f${nextId++}`, species })), decor: [],
  upgrades: { filter: false, lamp: false }
});
const tanks = [
  tank("small", "A", ["clownfish", "bluetang"]),
  tank("big", "B", ["clownfish", "yellowfish"]),
  tank("ocean", "C", ["turtle"]),
  tank("tall", "D", ["seahorse"]),
  tank("tall", "E", ["jellyfish"])
];
const model = {
  coins: 400, tanks,
  inv: { fish: [], decor: [{ id: "review-plant", kind: "plant", variant: "small" }], tanks: [] },
  progress: {
    stage: 6, tutorial: "done", firstFish: "clownfish", fedOnce: true,
    cleanedOnce: true, counted: true, hearts: 12, helpedInStage: 1,
    namedInStage: 0, photo: true, star: true, freePlay: true,
    hallOpen: true, superStar: false, said: ["orangePlease", "feedFish"]
  },
  stats: { coinsEarned: 300, helped: 12, fishBought: 6, seconds: 1500 },
  nextId, paid: []
};

const browser = await chromium.launch({ args: [
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"
] });

async function reviewPage(saveModel, name) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let virtualMs = 0;
  page.on("pageerror", (e) => manifest.errors.push({ page: name, error: e.message }));
  page.on("console", (m) => {
    if (m.type() === "error") manifest.errors.push({ page: name, error: m.text() });
  });
  await page.addInitScript(stubs);
  await page.addInitScript((fixture) => {
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    if (fixture) localStorage.setItem("at.save.v1", JSON.stringify({ v: 2, model: fixture }));
    else localStorage.removeItem("at.save.v1");
  }, saveModel);
  const epoch = new Date("2026-10-26T00:00:00Z");
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  const call = (method, ...args) => page.evaluate(([method, args]) => window.__at[method](...args), [method, args]);
  const state = () => call("state");
  const step = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      const dt = Math.min(100, ms - elapsed);
      await page.clock.fastForward(dt);
      virtualMs += dt;
    }
  };
  const click = (id) => page.getByTestId(id).dispatchEvent("click");
  async function until(label, pred, timeout = 40_000, advanceDialogue = false) {
    const start = virtualMs;
    for (;;) {
      const s = await state();
      if (pred(s)) return s;
      if (virtualMs - start >= timeout) throw new Error(`Timed out: ${label}: ${JSON.stringify(s)}`);
      if (advanceDialogue && s.line) await click("next");
      await step(100);
    }
  }
  async function shot(file, purpose, extra = {}) {
    const s = await state();
    await page.screenshot({ path: path.join(out, `${file}.png`), animations: "disabled" });
    manifest.frames.push({ file: `${file}.png`, page: name, purpose, virtualMs,
      viewport: page.viewportSize(), hall: s.hall, view: s.view, stage: s.stage,
      visitors: s.visitors, perf: s.perf, ...extra });
    console.log(`saved ${path.relative(root, path.join(out, `${file}.png`))}`);
  }
  async function drag(from, to) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await step(2400);
  }
  await page.goto(`${base}${base.includes("?") ? "&" : "?"}e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await step(100);
  return { context, page, call, state, step, click, until, shot, drag };
}

async function staticScenes() {
  const r = await reviewPage(model, "seeded-scenes");
  const { page, call, step, click, shot, drag } = r;
  await shot("01-title", "Title with Continue, New Game and Settings; no answer-mode selector");
  await click("btn-title-settings");
  await step(100);
  await shot("02-title-settings", "Speak and Tap controls remain inside Settings");
  await click("settings-close");
  await click("btn-continue");
  await step(2400);
  await call("visitors", false);
  await call("freezeFish", true);
  const closedModel = structuredClone(model);
  closedModel.progress.hallOpen = false;
  closedModel.tanks = closedModel.tanks.filter((t) => t.slot === "A" || t.slot === "B");
  await call("set", { model: closedModel, hall: 0, view: "room", tankId: null, nudge: null });
  await step(1200);
  await shot("03-hall1-locked-default", "Initial hall walls, rounded signs and locked Ocean Hall door");
  await drag({ x: 440, y: 500 }, { x: 650, y: 500 });
  await shot("04-hall1-locked-angle-a", "Wall joins, sign corners and lock from one orbit angle");
  await drag({ x: 820, y: 500 }, { x: 400, y: 500 });
  await shot("05-hall1-locked-angle-b", "Wall joins, sign corners and lock from the opposite orbit angle");
  await drag({ x: 440, y: 500 }, { x: 570, y: 500 });
  await call("set", { model: structuredClone(model), nudge: null });
  await step(2400);
  await shot("06-hall1-unlocked", "Ocean Hall unlocked: lock removed, door animation settled");

  async function badgeClearance(label, hall) {
    const overlays = [];
    for (const id of ["goals", "request", "player-status", "btn-help", "btn-settings"]) {
      const locator = page.getByTestId(id);
      if (await locator.isVisible()) overlays.push({ id, ...await locator.boundingBox() });
    }
    const badges = [];
    for (const t of tanks.filter((t) => (["C", "D", "E"].includes(t.slot) ? 1 : 0) === hall)) {
      const center = await call("where", "badge", t.id);
      if (!center) continue;
      const blockedBy = overlays.filter((box) => center.x + 24 > box.x && center.x - 24 < box.x + box.width
        && center.y + 24 > box.y && center.y - 24 < box.y + box.height).map((box) => box.id);
      badges.push({ tank: t.id, center, margin: 24, blockedBy });
      if (blockedBy.length) manifest.visibilityIssues.push({ label, tank: t.id, center, blockedBy });
    }
    return { overlays, badges };
  }

  for (const size of [
    { width: 1366, height: 768 }, { width: 1280, height: 720 },
    { width: 1024, height: 768 }, { width: 844, height: 390 }
  ]) {
    await page.setViewportSize(size);
    for (const hall of [0, 1]) {
      await call("set", { hall, view: "room", tankId: null, panel: null, placing: null, nudge: null });
      await step(2400);
      const toggle = page.getByTestId("btn-objectives");
      if (await toggle.getAttribute("aria-expanded") === "true") await toggle.dispatchEvent("click");
      await step(100);
      const prefix = `hud-${size.width}x${size.height}-hall${hall + 1}`;
      await shot(`${prefix}-collapsed`, "Centered status, separated controls, compact objectives and aquarium indicators",
        await badgeClearance(`${prefix}-collapsed`, hall));
      await toggle.dispatchEvent("click");
      await step(100);
      await shot(`${prefix}-expanded`, "Expanded current-level goals, completion marks, counts and contextual guide",
        await badgeClearance(`${prefix}-expanded`, hall));
      await toggle.dispatchEvent("click");
      await call("set", { request: { visitorId: "review-request", by: "adult", req: { kind: "show", color: "blue", fishOnly: true }, line: "I like blue fish!", misses: 2, status: "ready" } });
      await step(100);
      await shot(`${prefix}-request`, "Persistent room request and its clue leave happiness faces exposed",
        await badgeClearance(`${prefix}-request`, hall));
      await call("set", { request: null });
    }
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  for (const t of tanks) {
    const hall = ["C", "D", "E"].includes(t.slot) ? 1 : 0;
    await call("set", { model: structuredClone(model), hall, view: "tank", tankId: t.id,
      panel: "decorate", placing: { kind: "decor", decorId: "review-plant" }, nudge: null });
    await step(2400);
    const label = t.slot === "E" ? "tall-right" : t.type;
    await shot(`markers-${label}`, "All empty placement circles above sand with normal depth testing");
    await step(500);
    await shot(`markers-${label}-pulse`, "Placement circles at another animation phase");
  }

  await call("set", { view: "room", hall: 0, tankId: null, placing: null, panel: null,
    stageCard: { stage: 6, reward: "tall" }, mode: "busy" });
  await step(2400);
  await shot("stage6-completion", "Stage card: one bilingual Continue action and reward");
  await call("set", { stageCard: null, screen: "results", mode: "busy" });
  await step(2400);
  await shot("level5-results", "Aquarium Star results with Continue and Level 6 progression");
  const finalModel = structuredClone(model);
  finalModel.progress.stage = 8;
  finalModel.progress.superStar = true;
  await call("set", { model: finalModel });
  await step(2400);
  await shot("level8-results", "Super Aquarium Star results with Continue to existing free play");
  await r.context.close();
}

async function tutorialBench() {
  const r = await reviewPage(null, "new-game-first-visitor");
  const { page, call, state, step, click, until, shot, drag } = r;
  await click("btn-new");
  await until("first fish order", (s) => s.prompt?.question === "Blue or orange?", 20_000, true);
  await page.locator("[data-testid=choice][data-id=orangePlease]").dispatchEvent("click");
  await until("carrying first fish", (s) => s.placing?.kind === "fish");
  await step(1600);
  const firstTank = (await state()).tanks[0].id;
  const position = await call("where", "tank", firstTank);
  if (!position) throw new Error("First tank has no projected position");
  await page.mouse.click(position.x, position.y);
  await until("first feeding", (s) => s.tutorial === "feed" && s.view === "tank");
  await step(1800);
  await click("btn-feed");
  await until("feed choice", (s) => s.prompt?.choices.includes("feedFish"));
  await page.locator("[data-testid=choice][data-id=feedFish]").dispatchEvent("click");
  await until("first visitor spawned", (s) => s.visitors.some((v) => v.type === "child" && v.request === "show"), 30_000, true);
  const visitorId = (await state()).visitors.find((v) => v.type === "child" && v.request === "show").id;
  let frame = 0;
  for (let elapsed = 0; elapsed < 30_000;) {
    const s = await state();
    const visitor = s.visitors.find((v) => v.id === visitorId);
    if (!visitor) throw new Error("Tutorial visitor disappeared during approach");
    await shot(`bench-${String(frame++).padStart(2, "0")}`, "Real new-game visitor approach, turn, knee bend and backing into seat", { visitor });
    if (visitor.seat >= 0.999) break;
    const duration = visitor.x > 3.0 || visitor.seat > 0 ? 100 : 1000;
    await step(duration);
    elapsed += duration;
    if (elapsed >= 30_000) throw new Error("Tutorial visitor did not sit within 30 seconds");
  }
  await step(300);
  await shot("bench-seated-default", "First visitor seated with original fish-color request");
  const visitorPoint = await call("where", "visitor", visitorId);
  if (visitorPoint) {
    const vp = page.viewportSize();
    const clip = {
      x: Math.max(0, Math.min(vp.width - 400, visitorPoint.x - 200)),
      y: Math.max(0, Math.min(vp.height - 380, visitorPoint.y - 180)),
      width: 400, height: 380
    };
    await page.screenshot({ path: path.join(out, "bench-seated-detail.png"), clip, animations: "disabled" });
    manifest.frames.push({ file: "bench-seated-detail.png", page: "new-game-first-visitor", purpose: "Native-pixel seated body/legs/bench detail", clip, visitors: (await state()).visitors });
  }
  await drag({ x: 440, y: 500 }, { x: 650, y: 500 });
  await shot("bench-seated-angle-a", "Seated feet, legs, seat and backrest from side orbit");
  await drag({ x: 820, y: 500 }, { x: 400, y: 500 });
  await shot("bench-seated-angle-b", "Seated feet, legs, seat and backrest from opposite orbit");
  await r.context.close();
}

try {
  await staticScenes();
  await tutorialBench();
  if (manifest.errors.length) throw new Error(JSON.stringify(manifest.errors));
} finally {
  fs.writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await browser.close();
}
