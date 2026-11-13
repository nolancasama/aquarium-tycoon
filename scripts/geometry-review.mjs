// Invoked by visual.mjs before|after http://localhost:5351/ 7 geometry.
// Production-only review: inspect the existing R3F root, render alternate
// cameras while virtual RAF is paused. No application hooks or assets change.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hubModel } from "./review-saves.mjs";
const [label = "before", base = "http://localhost:5351/"] = process.argv.slice(2);
const out = path.resolve(".tmp/vis-review", label);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const evidence = { viewport: [1366, 768], errors: [], frames: [] };
page.on("pageerror", e => evidence.errors.push(e.message));
const model = structuredClone(hubModel(true));
model.tanks[0].decor = [{ id: "review-chest", kind: "chest", variant: null, slot: 0 }];
await page.addInitScript(model => {
  localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
}, model);
const epoch = new Date("2026-11-13T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([n, a]) => window.__at[n](...a), [name, args]);
const step = async ms => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
async function render(pos, target, chestAngle) {
  return page.evaluate(({ pos, target, chestAngle }) => {
    // Canvas keeps its onCreated RootState in a ref. Discover that ref without
    // depending on minified component names or bundled module exports.
    const canvas = document.querySelector("canvas");
    let fiber = canvas[Object.keys(canvas).find(k => k.startsWith("__reactFiber"))];
    let root;
    for (; fiber && !root; fiber = fiber.return) {
      let hook = fiber.memoizedState;
      for (let i = 0; hook && i < 80; i++, hook = hook.next) {
        const value = hook.memoizedState?.current;
        if (value?.scene && value?.gl && value?.camera) { root = value; break; }
      }
    }
    if (!root) throw new Error("Cannot find R3F review root");
    const camera = root.camera;
    if (pos) { camera.position.set(...pos); camera.lookAt(...target); camera.updateMatrixWorld(); }
    let chest;
    if (chestAngle !== undefined) {
      root.scene.traverse(o => {
        if (o.isMesh && o.parent?.isGroup && o.parent.position.y > 0.139 && o.parent.position.y < 0.141 && Math.abs(o.parent.position.z + 0.1) < 0.001) chest = o;
      });
      if (!chest) throw new Error("Chest lid not found");
      chest.parent.rotation.x = chestAngle;
      chest.updateWorldMatrix(true, false);
      const centre = chest.parent.localToWorld(chest.position.clone().set(0, 0, 0.1));
      camera.position.set(centre.x + pos[0], centre.y + pos[1], centre.z + pos[2]);
      camera.lookAt(centre.x, centre.y, centre.z);
      camera.updateMatrixWorld();
    }
    root.gl.render(root.scene, camera);
    return { camera: camera.position.toArray(), target, chestAngle, calls: root.gl.info.render.calls };
  }, { pos, target, chestAngle });
}
async function shot(name, pos, target, angle) {
  const state = await render(pos, target, angle);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  evidence.frames.push({ path: `${name}.png`, ...state });
  console.log(`${label}/${name}.png`);
}
try {
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  evidence.bundle = await page.locator("script[type=module]").getAttribute("src");
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(1000);
  await call("visitors", false, true);
  await call("set", { hall: 5, view: "room", line: null, nudge: null, mapOpen: false, fade: 0 });
  await call("preview", "lagoon");
  await step(3500);
  await shot("hub-normal");
  const a = -3 * Math.PI / 16;
  const local = (side, depth, y) => [-70 + Math.sin(a) * (11 + depth) + Math.cos(a) * side, y, -1 - Math.cos(a) * (11 + depth) + Math.sin(a) * side];
  await shot("corridor-front", local(0, -5, 2.4), local(0, 3, 1.5));
  await shot("corridor-oblique", local(-2.4, -4, 2.8), local(0, 2, 1.0));
  await shot("corridor-mid-transition", local(0, -0.1, 2.4), local(0.3, 1.8, 0.25));
  for (let i = 0; i < 8; i++) {
    await call("set", { mode: "play", line: null, nudge: null, prompt: null, request: null, waiting: null, stageCard: null, panel: null });
    await call("outdoor", "lagoon");
    await step(600);
    if ((await call("state")).roomId === "lagoon") break;
  }
  if ((await call("state")).roomId !== "lagoon") { evidence.entryState = await call("state"); throw new Error("Lagoon entry failed"); }
  await step(7000);
  await call("set", { line: null, nudge: null });
  await step(1000);
  await shot("lagoon-normal");
  await shot("lagoon-boardwalk-side", [-300, 9, 280], [-311, 0.9, 274]);
  await call("set", { hall: 0, view: "tank", tankId: model.tanks[0].id, line: null, nudge: null, fade: 0 });
  await step(3000);
  for (const [pose, angle] of [["closed", 0], ["half", -0.45], ["open", -0.9]]) {
    await shot(`chest-${pose}-front`, [0, 0.20, 1.0], [0, 0, 0], angle);
    await shot(`chest-${pose}-above-side`, [0.75, 0.8, 0.85], [0, 0, 0], angle);
  }
} catch (e) { evidence.errors.push(e.stack ?? String(e)); }
finally {
  fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
  await browser.close();
}
if (evidence.errors.length) throw new Error(evidence.errors.join("\n"));
