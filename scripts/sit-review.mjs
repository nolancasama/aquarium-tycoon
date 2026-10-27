// Rendered evidence for the sitting motion, the floating Ocean Hall lock, the
// sand-draped slot rings and the status panel beside the tank close-up.
// Start Vite/preview first.
// Usage: node scripts/sit-review.mjs [baseUrl] [stats|markers|sit|stand]
// Output: .tmp/sit-review/manifest.json plus frames and crops (human review).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = process.argv[2] ?? "http://127.0.0.1:5320/";
const only = process.argv[3];
const out = path.join(root, ".tmp", "sit-review");
fs.mkdirSync(out, { recursive: true });
const stubsSource = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSource.slice(stubsSource.indexOf("`") + 1, stubsSource.lastIndexOf("`"));
const manifest = { base, seed: 7, frames: [], errors: [], layout: [], layoutIssues: [] };

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
const SLOTS = { small: 3, big: 5, tall: 2, ocean: 6 };
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
const request = { visitorId: "review-request", by: "adult", req: { kind: "show", color: "blue", fishOnly: true }, line: "I like blue fish!", misses: 2, status: "ready" };

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function reviewPage(saveModel, name) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let virtualMs = 0;
  page.on("pageerror", (e) => manifest.errors.push({ page: name, error: e.message }));
  page.on("console", (m) => { if (m.type() === "error") manifest.errors.push({ page: name, error: m.text() }); });
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
    await page.screenshot({ path: path.join(out, `${file}.png`), animations: "disabled" });
    manifest.frames.push({ file: `${file}.png`, page: name, purpose, virtualMs, viewport: page.viewportSize(), ...extra });
    console.log(`saved ${file}.png`);
  }
  async function crop(file, center, w, h, extra = {}) {
    const vp = page.viewportSize();
    const clip = { x: Math.max(0, Math.min(vp.width - w, center.x - w / 2)), y: Math.max(0, Math.min(vp.height - h, center.y - h / 2)), width: w, height: h };
    await page.screenshot({ path: path.join(out, `${file}.png`), clip, animations: "disabled" });
    manifest.frames.push({ file: `${file}.png`, page: name, clip, virtualMs, ...extra });
  }
  await page.goto(`${base}${base.includes("?") ? "&" : "?"}e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await step(100);
  return { context, page, call, state, step, click, until, shot, crop };
}

const overlap = (a, b) => Boolean(a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y);

async function statsLayout() {
  const r = await reviewPage(model, "tank-stats");
  const { page, call, step, click, shot } = r;
  await click("btn-continue");
  await step(2400);
  await call("visitors", false);
  await call("freezeFish", true);
  const box = async (id) => {
    const l = page.getByTestId(id);
    return (await l.count()) && (await l.first().isVisible()) ? await l.first().boundingBox() : null;
  };
  for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    for (const t of tanks.slice(0, 4)) {
      const hall = ["C", "D", "E"].includes(t.slot) ? 1 : 0;
      for (const mode of ["plain", "request", "prompt"]) {
        await call("set", { model: structuredClone(model), hall, view: "tank", tankId: t.id, panel: null, placing: null, nudge: null, prompt: null, request: mode === "request" ? request : null });
        await step(2400);
        if (mode === "prompt") {
          await click("btn-feed");
          await step(2400);
        }
        // The panel's CSS ease runs on real time, not the paused game clock.
        await page.waitForTimeout(600);
        const glass = await call("glass", t.id);
        const status = await box("status");
        const req = await box("request");
        const prompt = await box("prompt");
        const glassBox = glass && { x: glass.left, y: glass.top, width: glass.right - glass.left, height: glass.bottom - glass.top };
        const rec = {
          size, tank: t.type, mode,
          gapRight: glass && status ? Math.round(status.x - glass.right) : null,
          topDelta: glass && status ? Math.round(status.y - glass.top) : null,
          glassLeft: glass && Math.round(glass.left), glassWidth: glass && Math.round(glass.right - glass.left),
          overGlass: overlap(status, glassBox), overRequest: overlap(status, req), overPrompt: overlap(status, prompt),
          onScreen: Boolean(status && status.x >= 0 && status.x + status.width <= size.width && status.y >= 0 && status.y + status.height <= size.height)
        };
        manifest.layout.push(rec);
        if (!status || rec.overGlass || rec.overRequest || rec.overPrompt || !rec.onScreen) manifest.layoutIssues.push(rec);
        await shot(`stats-${size.width}x${size.height}-${t.type}-${mode}`, "Status panel right of the glass, top level with the tank top", rec);
        if (mode === "prompt") {
          await call("set", { prompt: null, mode: "play" });
          await step(600);
        }
      }
    }
  }
  await r.context.close();
}

async function markersAndLock() {
  const r = await reviewPage(model, "markers-lock");
  const { call, step, click, shot, crop } = r;
  await click("btn-continue");
  await step(2400);
  await call("visitors", false);
  await call("freezeFish", true);
  for (const t of tanks) {
    const hall = ["C", "D", "E"].includes(t.slot) ? 1 : 0;
    await call("set", { model: structuredClone(model), hall, view: "tank", tankId: t.id, panel: "decorate", placing: { kind: "decor", decorId: "review-plant" }, nudge: null });
    await step(2400);
    const label = t.slot === "E" ? "tall-right" : t.type;
    await shot(`markers-${label}`, "Rings draped on the sand, dunes included");
    for (let i = 0; i < SLOTS[t.type]; i++) {
      const p = await call("where", "slot", `${t.id}:${i}`);
      if (p) await crop(`markers-${label}-slot${i}`, p, 240, 160, { slot: i, tank: t.type });
    }
    await step(300);
    await shot(`markers-${label}-pulse`, "Rings at another pulse phase");
  }
  const closedModel = structuredClone(model);
  closedModel.progress.hallOpen = false;
  closedModel.tanks = closedModel.tanks.filter((t) => t.slot === "A" || t.slot === "B");
  await call("set", { model: closedModel, hall: 0, view: "room", tankId: null, panel: null, placing: null, nudge: null });
  await step(2400);
  await shot("lock-room", "Locked Ocean Hall door with floating lock");
  for (let i = 0; i < 5; i++) {
    await shot(`lock-phase${i}`, "Lock float phase");
    await step(400);
  }
  await call("set", { model: structuredClone(model), nudge: null });
  await step(2400);
  await shot("lock-unlocked", "Ocean Hall purchased: lock gone, door open");
  await r.context.close();
}

async function benchSequence() {
  const r = await reviewPage(null, "new-game-first-visitor");
  const { page, call, state, step, click, until, shot, crop } = r;
  await click("btn-new");
  await until("first fish order", (s) => s.prompt?.question === "Blue or orange?", 20_000, true);
  await page.locator("[data-testid=choice][data-id=orangePlease]").dispatchEvent("click");
  await until("carrying first fish", (s) => s.placing?.kind === "fish");
  await step(1600);
  const firstTank = (await state()).tanks[0].id;
  const position = await call("where", "tank", firstTank);
  await page.mouse.click(position.x, position.y);
  await until("first feeding", (s) => s.tutorial === "feed" && s.view === "tank");
  await step(1800);
  await click("btn-feed");
  await until("feed choice", (s) => s.prompt?.choices.includes("feedFish"));
  await page.locator("[data-testid=choice][data-id=feedFish]").dispatchEvent("click");
  await until("first visitor spawned", (s) => s.visitors.some((v) => v.type === "child" && v.request === "show"), 30_000, true);
  const visitorId = (await state()).visitors.find((v) => v.type === "child" && v.request === "show").id;
  let frame = 0;
  let anchor = null;
  let orbited = false;
  for (let elapsed = 0; elapsed < 30_000;) {
    const visitor = (await state()).visitors.find((v) => v.id === visitorId);
    if (!visitor) throw new Error("Tutorial visitor disappeared");
    const near = visitor.x > 3.0 || visitor.seat > 0;
    if (near && !orbited) {
      // A side-on orbit shows the sitting profile (the default view faces the seat).
      orbited = true;
      await page.mouse.move(820, 500);
      await page.mouse.down();
      await page.mouse.move(560, 500, { steps: 8 });
      await page.mouse.up();
      await step(800);
      await shot("sit-orbit", "Side-on orbit used for the sitting frames");
    }
    if (near && visitor.z > 2.9) {
      if (!anchor) {
        const p = await call("where", "visitor", visitorId);
        anchor = { x: p.x, y: p.y + 70 };
      }
      await crop(`sit-${String(frame++).padStart(2, "0")}`, anchor, 300, 300, { visitor });
    }
    if (visitor.seat >= 0.999) break;
    const d = near ? 100 : 1000;
    await step(d);
    elapsed += d;
  }
  await step(300);
  await shot("sit-seated", "First visitor seated");
  await r.context.close();
}

async function ordinaryStand() {
  const r = await reviewPage(model, "stand-up");
  const { call, state, step, click, shot, crop } = r;
  await click("btn-continue");
  await step(2400);
  await call("visitors", false);
  await call("set", { hall: 0, view: "room", tankId: null, panel: null, nudge: null });
  await step(2400);
  for (const type of ["adult", "grandma", "explorer"]) {
    const id = await call("requestVisitor", type, { kind: "show", color: "blue", fishOnly: true });
    await step(600);
    const anchor = await call("where", "visitor", id);
    await crop(`stand-${type}-seated`, anchor, 360, 320);
    await call("leaveVisitor", id);
    for (let i = 0; i < 18; i++) {
      await step(100);
      await crop(`stand-${type}-${String(i).padStart(2, "0")}`, anchor, 360, 320, { visitor: (await state()).visitors.find((v) => v.id === id) });
    }
    await shot(`stand-${type}-walking`, "Walking away after standing");
    await step(6000);
  }
  await r.context.close();
}

try {
  if (!only || only === "stats") await statsLayout();
  if (!only || only === "markers") await markersAndLock();
  if (!only || only === "sit") await benchSequence();
  if (!only || only === "stand") await ordinaryStand();
} catch (e) {
  manifest.errors.push({ fatal: String(e?.stack ?? e) });
  console.error(e);
} finally {
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser.close();
}
