// Dolphin Lagoon visual review (not the browser suite). Start a server first
// (npx vite build, then npx vite preview --port 5353).
// Usage: node scripts/lagoon-review.mjs [baseUrl] [width] [height] [milestone] [--play]
// Opens the lagoon in a development preview (it is release-locked) and writes
// .tmp/lagoon-review/<w>x<h>/ frames + evidence.json. --play instead captures
// splash/ and catch/ evidence (1024px records the held layout only).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hubModel } from "./review-saves.mjs";

const playReview = process.argv.includes("--play");
const [base = "http://localhost:5353/", W = "1366", H = "768", MS = "0"] = process.argv.slice(2).filter((arg) => arg !== "--play");
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
  fs.mkdirSync(path.dirname(path.join(out, `${name}.png`)), { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const s = await call("state");
  evidence.frames[name] = await call("lagoon");
  evidence.frames[name].feeding = await call("lagoonFeeding");
  if (playReview) evidence.frames[name].catch = await call("lagoonCatch");
  evidence.perf[name] = s.perf;
};
// Contact sheets use the browser's PNG encoder, keeping this review free of image libraries.
const strip = async (names, destination) => {
  const sources = names.map((name) => ({ label: name.split("/").pop(), data: `data:image/png;base64,${fs.readFileSync(path.join(out, `${name}.png`)).toString("base64")}` }));
  const png = await page.evaluate(async ({ sources, width, height }) => {
    const columns = Math.min(4, sources.length), tileWidth = 456, tileHeight = Math.round(tileWidth * height / width), caption = 24;
    const canvas = document.createElement("canvas");
    canvas.width = columns * tileWidth;
    canvas.height = Math.ceil(sources.length / columns) * (tileHeight + caption);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#122a38";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "14px sans-serif";
    for (let i = 0; i < sources.length; i++) {
      const img = new Image();
      img.src = sources[i].data;
      await img.decode();
      const x = i % columns * tileWidth, y = Math.floor(i / columns) * (tileHeight + caption);
      ctx.drawImage(img, x, y, tileWidth, tileHeight);
      ctx.fillStyle = "white";
      ctx.fillText(sources[i].label, x + 8, y + tileHeight + 17);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, { sources, width: w, height: h });
  fs.writeFileSync(path.join(out, `${destination}.png`), Buffer.from(png, "base64"));
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const catchState = async () => {
  const snapshot = await call("lagoonCatch");
  assert(snapshot && ["floating", "held", "thrown", "dolphin-play", "returning"].includes(snapshot.state), "Missing single-ball catch state");
  return snapshot;
};
// With a paused clock, Playwright's normal click auto-wait cannot advance the
// HUD's 150 ms publication interval. Advance it explicitly, with a tight bound.
const catchButton = async (kind) => {
  const button = page.getByTestId(`btn-lagoon-${kind}`);
  for (let elapsed = 0; elapsed <= 1200; elapsed += 100) {
    if (await button.count() && await button.isEnabled()) return button;
    await step(100);
  }
  throw new Error(`${kind} HUD never became enabled: ${JSON.stringify(await catchState())}`);
};
const heldLayout = async () => {
  const views = await page.getByTestId("lagoon-views").boundingBox();
  const feed = await page.getByTestId("btn-lagoon-feed").boundingBox();
  const held = await page.getByTestId("lagoon-ball-held").boundingBox();
  assert(views && feed && held, "Missing held HUD layout element");
  assert(views.y + views.height <= feed.y + 1, "Held HUD overlaps viewpoint buttons");
  assert(held.x >= 0 && held.y >= 0 && held.x + held.width <= w && held.y + held.height <= h, "Held indicator leaves the screen");
};
const runPlayReview = async () => {
  await step(6200);
  await clearLines();
  await page.getByTestId("lagoon-view-lagoon").dispatchEvent("click");
  await step(2600);
  await clearLines();
  evidence.play = { splash: {}, catch: { history: [] } };
  if (w <= 1024) {
    await call("lagoonReviewSetup", "catch");
    await step(200);
    const ball = await call("lagoonWhere", "ball");
    assert(ball, "No ball projection for tap-to-hold check");
    await page.mouse.click(ball.x, ball.y);
    assert((await catchState()).state === "held", "Ball tap did not hold the ball at narrow width");
    await catchButton("throw");
    await step(200);
    await heldLayout();
    await shot(`../catch/${w}x${h}/00-held`);
    evidence.play.catch.assertions = { held: true, ballTap: true };
    return;
  }
  for (const kind of ["high", "hop"]) {
    const before = await call("lagoonEntries");
    const beforePerf = (await call("state")).perf;
    const setup = await call("lagoonReviewSetup", kind);
    const id = typeof setup === "string" ? setup : setup?.id;
    assert(id, `Could not start ${kind} leap`);
    const frames = [];
    let entry = null, sinceEntry = 0, airborne = false;
    const entryFrames = [];
    for (let elapsed = 0; elapsed < 8000; elapsed += 100) {
      const body = await call("lagoonBody", id);
      const entries = await call("lagoonEntries");
      const fresh = entries.slice(before.length).filter((e) => !e.ids || e.ids.includes(id));
      if (!entry && fresh.length) entry = fresh[0];
      airborne ||= body?.mode === "leap";
      if (airborne || entry) {
        const name = `../splash/${w}x${h}/${kind}-${String(elapsed).padStart(4, "0")}ms`;
        await shot(name);
        frames.push(name);
        if (entry) { entryFrames.push(name); sinceEntry += 100; }
      }
      if (sinceEntry >= 700) break;
      await step(100);
    }
    const entries = (await call("lagoonEntries")).slice(before.length).filter((e) => !e.ids || e.ids.includes(id));
    assert(entries.length === 1, `${kind}: expected one entry, got ${entries.length}`);
    assert(frames.length >= 4, `${kind}: insufficient airborne/entry frames`);
    const destination = `../splash/${w}x${h}/${kind}-strip`;
    await strip(frames, destination);
    const activeCalls = entryFrames.map((name) => evidence.perf[name].calls);
    evidence.play.splash[kind] = { id, entry, beforePerf, activePerf: evidence.perf[entryFrames[0]],
      drawCalls: { before: beforePerf.calls, duringEntryMin: Math.min(...activeCalls), duringEntryMax: Math.max(...activeCalls) },
      frames, entryFrames, strip: `${destination}.png` };
    await step(1800);
  }
  await call("lagoonReviewSetup", "catch");
  await step(200);
  evidence.play.catch.beforeHoldPerf = (await call("state")).perf;
  const catchFrames = [];
  const catchShot = async (name) => {
    const file = `../catch/${w}x${h}/${name}`;
    await shot(file);
    catchFrames.push(file);
  };
  await (await catchButton("hold")).click();
  assert((await catchState()).state === "held", "Hold HUD did not hold the ball");
  await catchButton("throw");
  await step(200);
  await catchShot("00-held");
  await heldLayout();
  evidence.play.catch.heldPerf = (await call("state")).perf;
  await (await catchButton("throw")).click();
  assert((await catchState()).state === "thrown", "Throw HUD did not launch the ball");
  await step(350);
  assert((await catchState()).state === "thrown", "Ball arc ended before mid-arc frame");
  await catchShot("01-mid-arc");
  let approached = false, pushed = false, returned = false;
  let previous = "thrown";
  for (let elapsed = 350; elapsed < 60000; elapsed += 100) {
    const snapshot = await catchState();
    if (snapshot.state !== previous) {
      evidence.play.catch.history.push({ elapsed, ...snapshot });
      previous = snapshot.state;
    }
    if (!approached && snapshot.state === "dolphin-play" && snapshot.chaser) {
      approached = true;
      await catchShot("02-dolphin-approaching");
    }
    if (!pushed && snapshot.state === "returning") {
      assert(snapshot.lastBy !== null, "Return started by timeout; no dolphin snout push was seen");
      pushed = true;
      await catchShot("03-pushing-back");
    }
    if (snapshot.returned && snapshot.canHold) { returned = true; break; }
    await step(100);
  }
  assert(approached, "Ball never entered dolphin play");
  assert(pushed, "Ball never entered returning state");
  assert(returned, "Ball did not return to reachable water within 60 seconds");
  evidence.play.catch.returned = await catchState();
  await (await catchButton("hold")).click();
  assert((await catchState()).state === "held", "Returned ball could not be held again");
  await catchButton("throw");
  await step(200);
  await catchShot("04-held-again");
  await strip(catchFrames, `../catch/${w}x${h}/catch-strip`);
  evidence.play.catch.frames = catchFrames;
  evidence.play.catch.drawCalls = { floating: evidence.play.catch.beforeHoldPerf.calls, held: evidence.play.catch.heldPerf.calls,
    midArc: evidence.perf[catchFrames[1]].calls, heldAgain: evidence.perf[catchFrames[4]].calls };
  evidence.play.catch.assertions = { held: true, thrown: true, approached, pushed, returned, heldAgain: true };
  const water = await call("lagoonWaterWhere", -5, 3);
  assert(water, "No water projection for aim check");
  // A spontaneous demonstration may start as soon as the fetched ball is held
  // again. Its input pause is intentional: verify it, then let the real trick land.
  if ((await catchState()).paused) {
    await page.mouse.click(water.x, water.y);
    assert((await catchState()).state === "held", "Water tap escaped the catch input pause");
    evidence.play.catch.assertions.pausedTapIgnored = true;
    for (let elapsed = 0; elapsed < 12000 && (await catchState()).paused; elapsed += 100) await step(100);
  }
  assert(!(await catchState()).paused, "Catch input did not resume after the demonstration");
  await catchButton("throw");
  await page.mouse.click(water.x, water.y);
  assert((await catchState()).state === "thrown", "Tapping water did not throw the held ball");
  evidence.play.catch.assertions.waterTap = true;
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
  if (playReview) {
    await runPlayReview();
  } else {
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
  await shot("05-gathering");
  const foodBefore = evidence.frames["04-care-later"].progress;
  for (let t = 0; t < 12000 && (await call("lagoonFeeding")).phase !== "throwing"; t += 100) await step(100);
  if ((await call("lagoonFeeding")).phase !== "throwing") throw new Error("No fish throw within 12 seconds");
  for (let i = 0; i < 10; i++) {
    await shot(`05-catch-${String(i).padStart(2, "0")}`);
    await step(200);
  }
  for (let t = 0; t < 16000 && (await call("lagoonFeeding")).phase !== "finished"; t += 100) await step(100);
  await shot("06-fed");
  const fed = evidence.frames["06-fed"];
  if (fed.feeding.phase !== "finished") throw new Error("Feeding did not finish within bound");
  if (fed.progress.fed !== foodBefore.fed + 1) throw new Error("Feed care effect was not applied exactly once");
  const phases = fed.feeding.history.map((entry) => entry.phase);
  if (!["gathering", "ready", "throwing", "catching", "finished"].every((phase) => phases.includes(phase))) throw new Error(`Missing feeding phase: ${phases}`);
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
  await call("lagoonAsk", "count");
  await step(4200);
  await shot("10-question");
  evidence.prompt = (await call("state")).prompt;
  }
} catch (e) {
  evidence.errors.push(String(e.message ?? e));
  await page.screenshot({ path: path.join(out, "error.png") });
}
fs.writeFileSync(path.join(out, playReview ? "play-evidence.json" : "evidence.json"), JSON.stringify(evidence, null, 2));
await browser.close();
console.log(JSON.stringify({ errors: evidence.errors, prompt: evidence.prompt?.question ?? null,
  ...(playReview ? { drawCalls: { splash: Object.fromEntries(Object.entries(evidence.play?.splash ?? {}).map(([kind, result]) => [kind, result.drawCalls])), catch: evidence.play?.catch.drawCalls }, assertions: evidence.play?.catch.assertions } : { perf: evidence.perf }) }, null, 1));
if (evidence.errors.length) process.exitCode = 1;
