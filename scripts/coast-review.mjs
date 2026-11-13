// Coastal & Polar Zone visual review (not the browser suite). Start a server first
// (npx vite build, then npx vite preview --port 5341).
// Usage: node scripts/coast-review.mjs [baseUrl] [width] [height] [milestone] [label]
// Add --baseline for the two pre-change views, or --gallery-review for focused
// gallery / stop-motion evidence. Both use <width>x<height> output directories.
// Writes .tmp/coast-review/<w>/ frames + evidence.json.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { hubModel } from "./review-saves.mjs";

const [base = process.env.BASE_URL || "http://localhost:5341/", W = "1366", H = "768", MS = "3", label = ""] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const w = Number(W), h = Number(H), ms = Number(MS);
const focused = process.argv.includes("--gallery-review");
const baseline = process.argv.includes("--baseline");
const out = path.resolve(`.tmp/coast-review/${baseline ? "before/" : focused ? `${label || "clean3b"}/` : label ? `${label}/` : ""}${focused || baseline ? `${w}x${h}` : w}`);
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
// Pause ahead of installation time: Chromium can advance its blank-page clock
// between the two protocol calls, especially during concurrent captures.
await page.clock.pauseAt(new Date(epoch.getTime() + 60_000));
const mark = (t) => evidence.steps.push(t);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
// Read Canvas's existing ref through React, without adding a production hook or
// touching animal state. This is optional evidence; screenshots work if React's
// private bookkeeping changes in a future version.
const penguinPoses = () => page.evaluate(() => {
  let scene = window.__coastReviewScene;
  if (!scene) {
    const canvas = document.querySelector("canvas");
    let fiber = canvas?.[Object.keys(canvas).find((key) => key.startsWith("__reactFiber$"))];
    for (; fiber && !scene; fiber = fiber.return) {
      for (let hook = fiber.memoizedState, n = 0; hook && n < 100; hook = hook.next, n++) {
        const ref = hook.memoizedState?.current;
        if (ref?.scene?.isScene) { scene = ref.scene; window.__coastReviewStore = ref; break; }
      }
    }
    if (scene) window.__coastReviewScene = scene;
  }
  if (!scene) return { available: false };
  const poses = [];
  let stationFood = null;
  scene.traverse((root) => {
    if (root.name === "coast-station-fish") stationFood = { fish: root.count, position: root.position.toArray() };
    if (!root.name.startsWith("coast-animal-")) return;
    const meshes = [];
    root.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      mesh.computeBoundingBox();
      const box = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      meshes.push({
        name: mesh.name, worldBounds: { min: box.min.toArray(), max: box.max.toArray() },
        bones: mesh.skeleton.bones.map((bone) => ({ name: bone.name, rotation: bone.rotation.toArray().slice(0, 3) }))
      });
    });
    if (meshes.length) poses.push({
      id: root.name.slice("coast-animal-".length), position: root.position.toArray(),
      rotation: root.rotation.toArray().slice(0, 3),
      groups: root.children.filter((child) => child.isGroup).map((child) => ({ name: child.name, position: child.position.toArray(), rotation: child.rotation.toArray().slice(0, 3) })),
      meshes
    });
  });
  return { available: true, poses, stationFood };
});
const galleryEvidence = () => page.evaluate(() => {
  const store = window.__coastReviewStore;
  if (!store?.scene || !store.camera) return { available: false };
  const { scene, camera } = store;
  const canvas = document.querySelector("canvas").getBoundingClientRect();
  const buttons = [...document.querySelectorAll("button")].map((button) => {
    const r = button.getBoundingClientRect();
    const id = button.dataset.testid ?? button.textContent.trim();
    return r.width && r.height ? { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
  }).filter(Boolean);
  const panels = [...document.querySelectorAll(".panel.ui, .coast-celebration.ui")].map((panel) => {
    const r = panel.getBoundingClientRect(), style = getComputedStyle(panel);
    return r.width && r.height && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0"
      ? { id: panel.dataset.testid ?? panel.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      : null;
  }).filter(Boolean);
  const navigation = [...document.querySelectorAll("button")].filter((button) => /Grand Hub|Dolphin Lagoon/.test(button.textContent)).map((button) => {
    const r = button.getBoundingClientRect();
    return { id: button.dataset.testid ?? button.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const visible = (obj) => { for (let p = obj; p; p = p.parent) if (!p.visible) return false; return true; };
  const workers = [], tools = [], visitors = [], architecture = [];
  scene.updateMatrixWorld(true);
  scene.traverse((root) => {
    if (/walkway|gallery|stair|window/.test(root.name)) architecture.push({ name: root.name, visible: visible(root) });
    if (root.name.startsWith("coast-visitor-")) visitors.push({ name: root.name, visible: visible(root) });
    if (root.name.startsWith("penguin-clean-tool-")) tools.push({ name: root.name, visible: visible(root) });
    if (!/^penguin-keeper-clean-[012]$/.test(root.name)) return;
    let box = null;
    let bodyBox = null;
    const bodyBounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    root.traverse((mesh) => {
      if (!mesh.isMesh || !visible(mesh)) return;
      mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      if (box) box.union(b); else box = b;
      // Body, cap and articulated limbs only. Tools, target rocks, smudges,
      // mist and sparkles must not inflate the figure's readable height.
      if (mesh.parent === root || /^penguin-clean-(tool|focus|glass)-/.test(mesh.name)) return;
      if (bodyBox) bodyBox.union(b); else bodyBox = b.clone();
      const positions = mesh.geometry.getAttribute("position"), indices = mesh.geometry.index;
      for (let i = 0; i < (indices?.count ?? positions.count); i++) {
        const vertex = indices ? indices.getX(i) : i;
        const p = camera.position.clone().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld).project(camera);
        const x = canvas.left + (p.x + 1) * canvas.width / 2, y = canvas.top + (1 - p.y) * canvas.height / 2;
        bodyBounds.left = Math.min(bodyBounds.left, x); bodyBounds.right = Math.max(bodyBounds.right, x);
        bodyBounds.top = Math.min(bodyBounds.top, y); bodyBounds.bottom = Math.max(bodyBounds.bottom, y);
      }
    });
    if (!box) { workers.push({ name: root.name, visible: false }); return; }
    const projectBounds = (viewCamera) => {
      const points = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = viewCamera.position.clone().set(x, y, z).project(viewCamera);
        points.push({ x: canvas.left + (p.x + 1) * canvas.width / 2, y: canvas.top + (1 - p.y) * canvas.height / 2 });
      }
      return { left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)) };
    };
    const bounds = projectBounds(camera);
    workers.push({ name: root.name, visible: true, position: root.position.toArray(), screenPosition: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }, worldBounds: { min: box.min.toArray(), max: box.max.toArray() }, screenBounds: bounds,
      projectedBodyHeightPx: bodyBox ? bodyBounds.bottom - bodyBounds.top : null,
      bodyScreenBounds: bodyBox ? bodyBounds : null,
      bodyWorldBounds: bodyBox ? { min: bodyBox.min.toArray(), max: bodyBox.max.toArray() } : null,
      insideViewport: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
      overlapsButtons: buttons.filter((b) => bounds.left < b.right && bounds.right > b.left && bounds.top < b.bottom && bounds.bottom > b.top).map((b) => b.id),
      overlapsPanels: panels.filter((p) => bounds.left < p.right && bounds.right > p.left && bounds.top < p.bottom && bounds.bottom > p.top).map((p) => p.id),
      bodyOverlapsPanels: bodyBox ? panels.filter((p) => bodyBounds.left < p.right && bodyBounds.right > p.left && bodyBounds.top < p.bottom && bodyBounds.bottom > p.top).map((p) => p.id) : [],
      overlapsNavigation: navigation.filter((b) => bounds.left < b.right && bounds.right > b.left && bounds.top < b.bottom && bounds.bottom > b.top).map((b) => b.id) });
  });
  return { available: true, workers, tools, visitors, buttons, panels, navigation, architecture };
});
const shot = async (name) => {
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const state = await call("state");
  evidence.frames[name] = { ...await call("coast"), perf: state.perf, camera: state.camera, penguinPoses: await penguinPoses() };
  if (focused || baseline) {
    evidence.frames[name].gallery = await galleryEvidence();
    evidence.frames[name].cleanlinessHud = await page.getByTestId("coast-clean").evaluate((bar) => ({
      value: Number(bar.dataset.value), className: bar.className,
      fillClassName: bar.querySelector(".fill")?.className ?? null,
      fillWidth: bar.querySelector(".fill")?.style.width ?? null
    }));
  }
};
const waitPenguin = async (predicate, seconds, description) => {
  for (let elapsed = 0; elapsed <= seconds * 1000; elapsed += 500) {
    const animal = (await call("coast")).animals.find((a) => a.habitat === "penguins" && predicate(a));
    if (animal) return animal;
    if (elapsed < seconds * 1000) await step(500);
  }
  throw new Error(`No penguin ${description} within ${seconds} simulation seconds`);
};
const reviewLedgesAndFloe = async () => {
  // Watch all four penguins at once so waiting for one feature cannot hide a
  // short hop elsewhere. Every sample comes from normal 100 ms runtime steps.
  const targets = { ledge: null, floe: null };
  const taken = new Set();
  const required = ["08-ledge-step-up", "08-ledge-rest", "08-ledge-step-down", "09-floe-climb", "09-floe-rest", "09-floe-hop"];
  const capture = async (key, animal) => {
    if (taken.has(key)) return;
    taken.add(key);
    evidence[key] = animal.id;
    await shot(key);
  };
  const transition = (key, animal) => capture(taken.has(key) ? `${key}-later` : key, animal);
  for (let elapsed = 0; elapsed <= 180000; elapsed += 500) {
    const animals = (await call("coast")).animals.filter((a) => a.habitat === "penguins");
    const ledge = targets.ledge ? animals.find((a) => a.id === targets.ledge) : animals.find((a) => a.mode === "stepUp");
    if (ledge) {
      targets.ledge ??= ledge.id;
      if (ledge.mode === "stepUp") await transition("08-ledge-step-up", ledge);
      if (ledge.area === "ledge" && ledge.mode === "rest") await capture("08-ledge-rest", ledge);
      if (ledge.mode === "stepDown") await transition("08-ledge-step-down", ledge);
    }
    const floe = targets.floe ? animals.find((a) => a.id === targets.floe) : animals.find((a) => a.mode === "climb");
    if (floe) {
      targets.floe ??= floe.id;
      if (floe.mode === "climb") await transition("09-floe-climb", floe);
      if (floe.area === "island" && floe.mode === "rest") await capture("09-floe-rest", floe);
      if (floe.mode === "hop") await transition("09-floe-hop", floe);
    }
    if (required.every((key) => taken.has(key))) { mark(`ledge/floe review completed after ${elapsed / 1000}s`); return; }
    if (elapsed < 180000) await step(500);
  }
  throw new Error(`Natural ledge/floe review incomplete after 180 simulation seconds: captured ${[...taken].join(", ")}`);
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
  await call("set", { hall: 6, view: "room", tankId: null, panel: null });
  if (baseline) {
    await step(5500);
    await clearLines();
    for (const view of ["penguins", "underwater"]) {
      await page.getByTestId(`coast-view-${view}`).dispatchEvent("click");
      await step(2500);
      await shot(view);
    }
  } else if (focused) {
    await step(5500);
    await clearLines();
    await call("set", { coastView: "penguins", coastWaiting: null });
    await page.getByTestId("coast-view-penguins").dispatchEvent("click");
    await step(1500);
    await shot("00-penguins-no-station");
    const penguinTank = (await call("state")).tanks.find((t) => t.type === "penguins");
    if (!penguinTank.decor.some((d) => d.kind === "penguinFeeder")) {
      await page.getByTestId("btn-coast-items").dispatchEvent("click");
      await page.locator("[data-testid=coast-item][data-kind=penguinFeeder]").dispatchEvent("click");
      await step(500);
      const p = await call("where", "coast-slot", "penguins:1");
      await page.mouse.click(p.x, p.y);
      await call("set", { placing: null, panel: null });
      await step(500);
    }
    await shot("01-penguins");
    await page.getByTestId("coast-view-underwater").dispatchEvent("click");
    await step(400);
    await shot("02-mid-transition");
    await step(1200);
    await shot("03-underwater");
    // Begin from the lower gallery to verify that care borrows its own framing
    // and then restores the selected Underwater view.
    const tank = (await call("state")).tanks.find((t) => t.type === "penguins");
    if (!tank) throw new Error("Penguin tank missing");
    evidence.cleanSetup = { deliberatelySetCare: true, food: 95, clean: 40, reason: "Review fixture dirties the habitat before pressing Clean; excludes this intentional reset from montage monotonicity." };
    await call("setCare", tank.id, 95, 40);
    await call("set", { coastWaiting: null });
    await step(200);
    await page.getByTestId("btn-clean").dispatchEvent("click");
    await page.getByTestId("btn-clean").dispatchEvent("click"); // rapid tap guard
    await step(16); // Let the renderer present the first photograph after the click.
    await shot("06-clean-start");
    let elapsed = 16;
    for (let i = 0; i < 5; i++) {
      const target = 100 + i * 1000;
      await step(target - elapsed);
      elapsed = target;
      await shot(`07-clean-shot-${i + 1}`);
      if (i === 2) await shot("07-lower-glass-spray");
    }
    await step(6500 - elapsed); // Include the bounded return to the selected view.
    await shot("08-clean-after");
    const cleanFrames = Object.entries(evidence.frames).filter(([name]) => name.startsWith("07-clean-shot-"));
    const presentationFrames = Object.entries(evidence.frames).filter(([name]) => name === "06-clean-start" || name.startsWith("07-"));
    evidence.cleanReview = {
      bodyHeightDefinition: "Projected vertices of body, cap and limbs; excludes tools, focus targets, mist and sparkles. screenBounds retains complete visible bounds.",
      shots: cleanFrames.map(([name, frame]) => ({ name, clean: frame.keeper?.clean, cleanlinessHud: frame.cleanlinessHud, workers: frame.gallery.workers })),
      buttonOverlaps: presentationFrames.flatMap(([name, frame]) => frame.gallery.workers.flatMap((worker) => (worker.overlapsButtons ?? []).map((button) => ({ name, button })))),
      panelOverlaps: presentationFrames.flatMap(([name, frame]) => frame.gallery.workers.flatMap((worker) => (worker.overlapsPanels ?? []).map((panel) => ({ name, worker: worker.name, panel, bodyOverlap: worker.bodyOverlapsPanels.includes(panel) })))),
      after: evidence.frames["08-clean-after"].keeper?.clean
    };
    const minimumHeight = w === 1366 && h === 768 ? 55 : w === 1024 && h === 600 ? 40 : null;
    evidence.cleanReview.bodyHeightCheck = {
      minimumPx: minimumHeight,
      undersized: minimumHeight === null ? [] : cleanFrames.flatMap(([name, frame]) => frame.gallery.workers.filter((worker) => worker.visible && worker.projectedBodyHeightPx < minimumHeight).map((worker) => ({ name, worker: worker.name, heightPx: worker.projectedBodyHeightPx })))
    };
    if (process.argv.includes("--strict-clean-height") && evidence.cleanReview.bodyHeightCheck.undersized.length) evidence.errors.push("Clean worker is below the projected body height target; see cleanReview.bodyHeightCheck");
    const displayedCleanliness = [...presentationFrames, ["08-clean-after", evidence.frames["08-clean-after"]]].map(([name, frame]) => ({ name, ...frame.cleanlinessHud }));
    evidence.cleanReview.displayedCleanliness = displayedCleanliness;
    evidence.cleanReview.cleanlinessNondecreasing = displayedCleanliness.every((sample, i) => i === 0 || sample.value >= displayedCleanliness[i - 1].value);
    if (!evidence.cleanReview.cleanlinessNondecreasing) evidence.errors.push("Displayed cleanliness falls during Clean; see cleanReview.displayedCleanliness");
    if (evidence.cleanReview.buttonOverlaps.length) evidence.errors.push("Clean worker overlaps a HUD button; see cleanReview.buttonOverlaps");
    if (evidence.cleanReview.panelOverlaps.length) evidence.errors.push("Clean worker overlaps a HUD panel; see cleanReview.panelOverlaps");
    if (presentationFrames.some(([, frame]) => frame.gallery.workers.some((worker) => worker.overlapsNavigation?.length))) evidence.errors.push("Clean worker overlaps a room arrow");
    if (presentationFrames.some(([, frame]) => frame.gallery.workers.some((worker) => worker.visible && !worker.insideViewport))) evidence.errors.push("Clean worker leaves the viewport");
    if (presentationFrames.some(([, frame]) => frame.gallery.tools.filter((tool) => tool.visible).length < 4)) evidence.errors.push("A Clean snapshot is missing a hand tool (including gallery spray and cloth)");
    if (presentationFrames.some(([, frame]) => frame.gallery.workers.filter((worker) => worker.visible).length !== 3)) evidence.errors.push("A Clean snapshot does not have exactly three visible workers");
    if (presentationFrames.some(([, frame]) => frame.gallery.visitors.some((visitor) => visitor.visible))) evidence.errors.push("A stroller remains in a Clean photograph");
    if (evidence.frames["08-clean-after"].gallery.workers.some((worker) => worker.visible)) evidence.errors.push("Clean worker remains visible after five seconds");
    for (const name of ["01-penguins", "03-underwater"]) {
      const parts = evidence.frames[name].gallery.architecture;
      if (parts.some((part) => /upper-walkway|stairs/.test(part.name))) evidence.errors.push(`Removed terrace or stairs present in ${name}`);
      if (!parts.find((part) => part.name === "coast-lower-gallery-floor")?.visible) evidence.errors.push(`Lower walkway absent in ${name}`);
    }
    const beforeCamera = evidence.frames["03-underwater"].camera;
    const afterCamera = evidence.frames["08-clean-after"].camera;
    evidence.cleanReview.restoration = { before: beforeCamera, after: afterCamera };
    if (Math.abs(beforeCamera.pos.y - afterCamera.pos.y) > 0.1 || Math.abs(beforeCamera.pos.z - afterCamera.pos.z) > 0.1) evidence.errors.push("Selected Underwater camera was not restored");
    mark("Focused gallery review completed without forcing animal positions");
    evidence.startHall = coastHall;
  } else {
  if (label !== "before") {
    for (let i = 0; i < 48; i++) {
      await step(150);
      await shot(`00-reveal-${String(i).padStart(2, "0")}`);
    }
  } else await step(2500);
  await clearLines();
  await step(3000);
  await shot("01-default");
  await call("set", { coastView: "all" });
  await step(2500);
  mark("shot all");
  await shot("01-all");
  for (const v of (label === "before" ? ["penguins", "seals", "otters"] : ["penguins"])) {
    await call("set", { coastView: v });
    await step(2500);
    await shot(`02-${v}`);
    await step(6000);
    await shot(`03-${v}-later`);
    if (v === "penguins") {
      await page.getByTestId("coast-view-underwater").dispatchEvent("click");
      await step(2500);
      const swimmer = await waitPenguin((a) => a.mode === "swim" && a.area === "water", 90, "swimming in the Underwater view");
      evidence.underwaterPenguin = swimmer.id;
      await shot("06-underwater");
      await step(500);
      await shot("06-underwater-stroke");
      await page.getByTestId("coast-view-penguins").dispatchEvent("click");
      await step(2500);
      if (label === "before") continue;
      // Place a real station in the preview fixture; animals remain on their
      // ordinary paths. Use the actual Feed button so care runs exactly once.
      const tank = (await call("state")).tanks.find((t) => t.type === "penguins");
      if (!tank) throw new Error("Penguin tank missing");
      if (!tank.decor.some((d) => d.kind === "penguinFeeder")) {
        const slot = [1, 2, 3, 0].find((i) => !tank.decor.some((d) => d.slot === i));
        if (slot === undefined) throw new Error("No free station slot");
        await page.getByTestId("btn-coast-items").dispatchEvent("click");
        await page.locator("[data-testid=coast-item][data-kind=penguinFeeder]").dispatchEvent("click");
        await step(500);
        const p = await call("where", "coast-slot", `penguins:${slot}`);
        await page.mouse.click(p.x, p.y);
        await step(500);
        // Placement remains open for choosing another item; close it as a player would.
        await call("set", { placing: null, panel: null });
      }
      await call("setCare", tank.id, 40, 95);
      await call("set", { coastWaiting: null });
      await step(200);
      await shot("10-feed-before");
      await page.getByTestId("btn-feed").dispatchEvent("click");
      for (let i = 0; i < 8; i++) {
        await step(700);
        await shot(`10-feed-${String(i).padStart(2, "0")}`);
      }
      // Swimmers must physically return via the shore; also capture the later
      // meal rather than force an arrival to fit a screenshot deadline.
      for (let i = 0; i < 16; i++) {
        await step(700);
        await shot(`11-meal-${String(i).padStart(2, "0")}`);
      }
      for (let i = 0; i < 4; i++) {
        await step(3500);
        await shot(`12-after-meal-${i}`);
      }
      if (process.argv.includes("--ledges")) await reviewLedgesAndFloe();
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
  }
} catch (e) {
  evidence.errors.push(String(e.message ?? e));
  await page.screenshot({ path: path.join(out, "error.png") });
}
fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
await browser.close();
console.log(JSON.stringify({ errors: evidence.errors, prompt: evidence.prompt, frames: Object.fromEntries(Object.entries(evidence.frames).map(([k, v]) => [k, v.animals.map((a) => `${a.habitat[0]}:${a.mode}`).join(" ")])) }, null, 1));
if (evidence.errors.length) process.exitCode = 1;
