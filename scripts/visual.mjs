// Deterministic material review. Start npx vite --port 5320 first.
// Usage: node scripts/visual.mjs before|after [baseUrl] [seed]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [label = "before", base = "http://localhost:5320/", seed = "7"] = process.argv.slice(2);
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error("Use a simple label (before/after).");
const out = path.join(root, ".tmp", "visual", label);
fs.mkdirSync(out, { recursive: true });
const stubsSrc = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));
let id = 1;
const tank = (type, slot, species, decor) => ({
  id: `t${id++}`, type, slot, food: 100, clean: 100,
  fish: species.map((species) => ({ id: `f${id++}`, species })),
  decor: decor.map(([kind, variant], slot) => ({ id: `d${id++}`, kind, variant, slot })),
  upgrades: { filter: false, lamp: false }
});
// Version-2 starred save, following phase2.spec.ts; every saved habitat is valid.
const tanks = [
  tank("small", "A", ["clownfish", "bluetang", "yellowfish"], [["plant", "small"], ["shell", null], ["rock", "small"]]),
  tank("big", "B", ["clownfish", "bluetang", "yellowfish", "pufferfish"], [["coral", "red"], ["chest", null], ["rock", "big"], ["coral", "blue"], ["plant", "big"]]),
  tank("ocean", "C", ["turtle", "clownfish", "bluetang"], [["starfish", "pink"], ["castle", "big"], ["anemone", null], ["shipwreck", null], ["plant", "big"], ["starfish", "yellow"]]),
  tank("tall", "D", ["seahorse", "seahorse"], [["plant", "small"], ["shell", null]]),
  tank("tall", "E", ["jellyfish", "jellyfish"], [["anemone", null], ["castle", "small"]])
];
const model = {
  coins: 400, tanks, inv: { fish: [], decor: [], tanks: [] },
  progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, superStar: true, said: ["orangePlease", "feedFish"] },
  stats: { coinsEarned: 300, helped: 10, fishBought: 12, seconds: 1500 }, nextId: id, paid: []
};
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript(stubs);
await page.addInitScript((save) => {
  localStorage.setItem("at.save.v1", JSON.stringify(save));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
}, { v: 2, model });
// Fixed virtual RAF/timer clock, including screenshots: wall-clock GPU speed
// cannot change poses, caustics, camera easing, dirt fades or pellet positions.
const epoch = new Date("2026-10-24T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
// Fixed 100 ms frames match the game's maximum simulation step and avoid
// rendering hundreds of redundant SwiftShader frames during dirt fades.
const step = async (ms) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    await page.clock.fastForward(Math.min(100, ms - elapsed));
  }
};
const perf = { seed: Number(seed), viewport: "1366x768", halls: {} };
async function shot(name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled" });
  console.log(`saved .tmp/visual/${label}/${name}.png`);
}
async function view(tankId, hall = 0) {
  await call("set", { view: tankId ? "tank" : "room", tankId: tankId ?? null, hall, panel: null });
  await step(2400);
}
try {
  await page.goto(`${base}?e2e=1&seed=${Number(seed)}`);
  await page.waitForFunction(() => Boolean(window.__at));
  await call("freezeFish", true);
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(800);
  await call("visitors", false);
  const state = await call("state");
  if (state.tanks.length !== 5 || state.mode !== "play") throw new Error("Phase-2 fixture failed to load");
  await view(null, 0);
  await shot("01-original-hall");
  perf.halls.original = (await call("state")).perf;
  await view(tanks[0].id);
  await shot("02-small-clean-plant-shell-rock");
  await view(tanks[1].id);
  await shot("03-big-four-fish-coral-chest");
  // Same frozen frame and camera, native pixels: extra detail evidence only.
  await page.screenshot({ path: path.join(out, "14-big-fish-detail.png"), clip: { x: 300, y: 260, width: 730, height: 160 }, animations: "disabled" });
  // Trigger the existing puff by tapping the puffer at its frozen position.
  const puffer = tanks[1].fish.find((f) => f.species === "pufferfish");
  const p = await call("where", "fish", puffer.id);
  await page.mouse.click(p.x, p.y);
  await step(480);
  await shot("04-puffer-puffed");
  await step(8000);
  await call("set", { fishTalk: null });
  await shot("05-puffer-unpuffed");
  await call("setCare", tanks[1].id, 35, 8);
  await step(6400);
  await shot("06-dirty-water");
  await call("setCare", tanks[1].id, 35, 100);
  await step(8000);
  await shot("07-clean-water");
  await page.getByTestId("btn-feed").dispatchEvent("click");
  await step(320);
  if ((await call("state")).pellets === 0) throw new Error("No feeding pellets");
  await shot("08-feeding-pellets");
  await step(6400);
  await view(null, 1);
  await shot("09-ocean-hall");
  perf.halls.ocean = (await call("state")).perf;
  await view(tanks[2].id, 1);
  await shot("10-ocean-turtle-special-decor");
  await view(tanks[3].id, 1);
  await shot("11-seahorses");
  await view(tanks[4].id, 1);
  await shot("12-jellyfish");
  // Review-only mixed animal tableau. The save above respects habitats;
  // __at.set stages this impossible combination without changing game rules.
  await view(tanks[2].id, 1);
  // Choose the first seeded spawn with three separate silhouettes. This also
  // keeps the seahorse visible instead of hiding it behind the turtle shell.
  let framed = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const mixed = structuredClone(model);
    mixed.tanks[2].fish = ["turtle", "seahorse", "jellyfish"].map((species) => ({ id: `f${id++}`, species }));
    await call("set", { model: mixed });
    await step(100);
    const points = await Promise.all(mixed.tanks[2].fish.map((f) => call("where", "fish", f.id)));
    framed = points.every((p, i) => p && p.y > 280 && p.y < 430 && p.x > 350 && p.x < 1000 && points.every((q, j) => i === j || Math.hypot(p.x - q.x, p.y - q.y) > 135));
    if (framed) break;
  }
  if (!framed) throw new Error("Could not frame the staged trio");
  await shot("13-staged-ocean-animal-trio");
  fs.writeFileSync(path.join(out, "perf.json"), JSON.stringify(perf, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "errors.json"), JSON.stringify(errors, null, 2) + "\n");
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
