// Review screenshots only. Does not run controller acceptance or browser suites.
// Run against npm run dev -- --host 127.0.0.1 --port 5320 --strictPort.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const out = "test-results/reef-deck-polish";
fs.mkdirSync(out, { recursive: true });
const stubs = fs.readFileSync("tests/e2e/stubs.ts", "utf8");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", `--log-file=${fs.realpathSync(out)}/chromium.log`] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(stubs.slice(stubs.indexOf("`") + 1, stubs.lastIndexOf("`")));
await page.addInitScript(() => {
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
  const model = {
    coins: 600, inv: { fish: [], decor: [], tanks: [] },
    tanks: [{ id: "t1", type: "small", slot: "A", food: 90, clean: 95, fish: [{ id: "f1", species: "clownfish" }], decor: [], upgrades: { filter: false, lamp: false } }],
    progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
      hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
      atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [], hubIntroSeen: true,
      tunnelOpen: true, tunnelIntroSeen: true, tunnel: { milestone: 3, observed: 6, helped: 3, findDone: false, whereDone: false, countDone: false, trophy: false } },
    rush: { unlocked: true, introSeen: true, phase: "waiting", untilNext: 900, pendingFor: 0, event: null, lastCommitted: null,
      stats: { events: 0, bronze: 0, silver: 0, gold: 0, successes: 0, best: null, bestReady: 0 }, rewards: [] },
    stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: 100, paid: []
  };
  localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
});
const call = (name, ...args) => page.evaluate(([method, values]) => window.__at[method](...values), [name, args]);
async function ready(label, predicate) {
  try { await page.waitForFunction(predicate, undefined, { timeout: 45000 }); }
  catch (cause) { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`, { cause }); }
}
async function settled() {
  await ready("camera settled and frame rendered", () => {
    const s = window.__at.state(), c = s.camera;
    const prior = window.__capturePrevious;
    window.__capturePrevious = { x: c.pos.x, y: c.pos.y, z: c.pos.z, calls: s.perf.calls };
    return s.fade === 0 && s.perf.calls > 0 && prior && Math.hypot(c.pos.x - prior.x, c.pos.y - prior.y, c.pos.z - prior.z) < 0.0001;
  });
}
async function tankCrop() {
  return page.evaluate(async () => {
    const { HUB_TANK: tank } = await import("/src/game/data/hub.ts");
    const { project } = await import("/src/scene/CameraRig.tsx");
    const points = [];
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      for (const y of [0, tank.plinth + tank.h + 0.12]) {
        const point = project(tank.x + Math.cos(a) * tank.plinthR, y, tank.z + Math.sin(a) * tank.plinthR);
        if (!point) throw new Error("HARNESS_PRECONDITION_FAILED: tank projection unavailable");
        points.push(point);
      }
    }
    const padding = 14;
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => p.x)) - padding));
    const y = Math.max(0, Math.floor(Math.min(...points.map(p => p.y)) - padding));
    const right = Math.min(innerWidth, Math.ceil(Math.max(...points.map(p => p.x)) + padding));
    const bottom = Math.min(innerHeight, Math.ceil(Math.max(...points.map(p => p.y)) + padding));
    return { x, y, width: right - x, height: bottom - y };
  });
}
async function saveDoubleCrop(clip, path) {
  const source = (await page.screenshot({ clip })).toString("base64");
  const enlarged = await page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width * 2;
    canvas.height = image.height * 2;
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  }, source);
  fs.writeFileSync(path, Buffer.from(enlarged, "base64"));
}
try {
  await page.goto("http://127.0.0.1:5320/?e2e=1&fast=1&seed=11");
  await page.getByTestId("btn-continue").click();
  await ready("game loaded", () => window.__at?.state().screen === "game");
  await call("visitors", false);
  await call("set", { hall: 5, line: null, mode: "play", nudge: null });
  await ready("Grand Hub", () => window.__at.state().roomId === "hub");
  await settled();
  await page.screenshot({ path: `${out}/hub-normal-camera.png` });
  const reefClip = await tankCrop();
  const reefFrames = [];
  for (let frame = 0; frame < 3; frame++) {
    if (frame > 0) {
      await ready(`reef animation frame ${frame + 1}`, async () => {
        const { rt } = await import("/src/game/runtime.ts");
        return rt.time >= window.__captureReefTime + 1.2;
      });
    }
    const time = await page.evaluate(async () => {
      return window.__captureReefTime = (await import("/src/game/runtime.ts")).rt.time;
    });
    const name = `hub-reef-close-2x-${frame + 1}.png`;
    await saveDoubleCrop(reefClip, `${out}/${name}`);
    reefFrames.push({ name, time });
  }
  await call("preview", "lagoon");
  await call("outdoor", "lagoon");
  await ready("Lagoon preview", () => window.__at.state().roomId === "lagoon" && window.__at.state().fade === 0);
  await ready("reveal completed", async () => (await import("/src/game/flow/outdoor.ts")).revealProgress("lagoon") === 1);
  await call("set", { line: null, mode: "play", nudge: null, areaArrival: null });
  await settled();
  await page.screenshot({ path: `${out}/lagoon-overview.png` });
  await page.getByTestId("lagoon-view-deck").click();
  await ready("Deck viewpoint", () => window.__at.lagoon().view === "deck");
  await settled();
  await page.screenshot({ path: `${out}/deck-viewpoint.png` });
  // Temporarily reposition the existing shot in this isolated dev-page session.
  await page.evaluate(async () => {
    const { LAGOON_SHOTS } = await import("/src/game/data/lagoon.ts");
    window.__originalDeckShot = structuredClone(LAGOON_SHOTS.deck);
    LAGOON_SHOTS.deck.pos = { x: -1, y: 9, z: 24 };
    LAGOON_SHOTS.deck.target = { x: -16, y: 2.6, z: 12.8 };
  });
  await settled();
  await page.screenshot({ path: `${out}/deck-and-supported-stairs.png` });
  await page.evaluate(async () => {
    const { LAGOON_SHOTS } = await import("/src/game/data/lagoon.ts");
    Object.assign(LAGOON_SHOTS.deck, window.__originalDeckShot);
  });
  fs.writeFileSync(`${out}/capture.json`, JSON.stringify({
    errors, screenshots: 7, acceptanceRun: false,
    viewport: { width: 1366, height: 768 },
    reef: { camera: "normal", clip: reefClip, cropScale: 2, frames: reefFrames }
  }, null, 2));
  if (errors.length) throw new Error(`Screenshot page errors: ${errors.join("; ")}`);
  console.log(`Saved seven review screenshots to ${out}`);
} finally { await browser.close(); }
