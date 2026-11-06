// Expansion 1 visual review: every special tank, new animal, the Gallery and the new shop panels.
// Start a server first (npx vite --port 5320). Usage: node scripts/expansion-review.mjs [baseUrl] [part]
// part: all | rooms | tanks | motion | ui. Writes .tmp/expansion-review/.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [base = "http://localhost:5320/", part = "all"] = process.argv.slice(2);
const out = path.join(root, ".tmp", "expansion-review");
fs.mkdirSync(out, { recursive: true });
const stubsSrc = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));
let id = 1;
const tank = (type, slot, species, decor, light = null) => ({
  id: `t${id++}`, type, slot, food: 100, clean: 100, light,
  fish: species.map((species) => ({ id: `f${id++}`, species })),
  decor: decor.map(([kind, variant], slot) => ({ id: `d${id++}`, kind, variant, slot })),
  upgrades: { filter: false, lamp: false }
});
// A Level 8 version-3 save with every special tank and new animal, habitats valid.
const tanks = [
  tank("hex", "A", ["angelfish", "goby", "seahorse"], [["kelp", null], ["coral", "red"], ["shell", null]]),
  tank("cave", "B", ["eel", "octopus", "crab", "goby"], [["cave", null], ["driftwood", null], ["shell", null]]),
  tank("ocean", "C", ["turtle", "stingray", "chromis", "crab"], [["arch", null], ["starfish", "pink"], ["kelp", null], ["shipwreck", null], ["plant", "big"], ["anemone", null]]),
  tank("panorama", "D", ["chromis", "stingray", "angelfish", "clownfish", "bluetang"], [["kelp", null], ["coral", "blue"], ["arch", null], ["plant", "big"], ["driftwood", null], ["rock", "big"]]),
  tank("tall", "E", ["jellyfish", "jellyfish"], [["anemone", null]]),
  tank("cylinder", "F", ["moonjelly", "moonjelly", "moonjelly"], [["shell", null], ["bubbler", null]], "blue"),
  tank("cylinder", "G", ["seanettle", "seanettle", "spottedjelly"], [["starfish", "yellow"]], "pink"),
  tank("cylinder", "H", ["spottedjelly", "spottedjelly", "jellyfish"], [], null)
];
const model = {
  coins: 900, tanks, inv: { fish: [], decor: [], tanks: [] },
  progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, superStar: true, tipsTaught: true, said: ["orangePlease", "feedFish"] },
  stats: { coinsEarned: 300, helped: 10, fishBought: 20, seconds: 1500 }, nextId: id, paid: []
};
const byType = Object.fromEntries(tanks.map((t) => [t.slot, t.id]));

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript(stubs);
await page.addInitScript((save) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("at.save.v1", JSON.stringify(save));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
}, { v: 3, model });
const epoch = new Date("2026-10-29T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
const step = async (ms) => { for (let e = 0; e < ms; e += 100) await page.clock.fastForward(Math.min(100, ms - e)); };
const perf = {};
async function shot(name) {
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled" });
  console.log(`saved .tmp/expansion-review/${name}.png`);
}
async function view(tankId, hall = 0) {
  await call("set", { view: tankId ? "tank" : "room", tankId: tankId ?? null, hall, panel: null, placing: null });
  await step(2400);
}
const want = (p) => part === "all" || part === p;
try {
  await page.goto(`${base}?e2e=1&seed=3`);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(1200);
  await call("visitors", false);
  const s0 = await call("state");
  if (s0.tanks.length !== tanks.length || !s0.progress.galleryOpen) throw new Error(`fixture failed: ${s0.tanks.length} tanks, gallery ${s0.progress.galleryOpen}`);
  await step(3000);
  if (want("rooms")) {
    for (const [hall, name] of [[0, "hall1"], [1, "ocean"], [2, "gallery"]]) {
      await view(null, hall);
      await step(1500);
      await shot(`room-${name}`);
      perf[name] = (await call("state")).perf;
    }
  }
  if (want("tanks")) {
    for (const slot of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      const hall = slot < "C" ? 0 : slot < "F" ? 1 : 2;
      await view(byType[slot], hall);
      await step(3000);
      await shot(`tank-${slot}-${tanks.find((t) => t.slot === slot).type}`);
    }
  }
  if (want("motion")) {
    // The same close-ups over time: dens, crawling, walking, schools, drifting.
    for (const slot of ["B", "D", "F"]) {
      const hall = slot < "C" ? 0 : slot < "F" ? 1 : 2;
      await view(byType[slot], hall);
      for (let i = 0; i < 4; i++) {
        await step(4000);
        await shot(`motion-${slot}-${i}`);
      }
    }
  }
  if (want("ui")) {
    await view(null, 1);
    await page.getByTestId("btn-fish-shop").dispatchEvent("click");
    await step(1500);
    await shot("ui-fish-shop");
    await call("set", { prompt: null, panel: null, mode: "play" });
    await step(600);
    await page.getByTestId("btn-animal-shop").dispatchEvent("click");
    await step(1500);
    await shot("ui-animal-shop");
    await call("set", { prompt: null, panel: null, mode: "play" });
    await step(600);
    await page.getByTestId("btn-tank-shop").dispatchEvent("click");
    await step(1200);
    await shot("ui-tank-shop");
    const tankShop = page.getByTestId("tank-shop");
    await tankShop.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await step(300);
    await shot("ui-tank-shop-scrolled");
    await call("set", { panel: null });
    await view(byType.F, 2);
    await shot("ui-jelly-closeup");
    const lights = page.getByTestId("btn-lights");
    if (await lights.count()) {
      await lights.dispatchEvent("click");
      await step(1500);
      await shot("ui-lights-prompt");
      await call("set", { prompt: null, panel: null, mode: "play" });
    }
    await view(null, 0);
    await call("set", { placing: { kind: "remodel", type: "panorama", tankId: null } });
    await step(1200);
    await shot("ui-remodel-pick");
    await call("set", { placing: { kind: "remodel", type: "hex", tankId: byType.B }, panel: "remodel" });
    await step(1200);
    await shot("ui-remodel-panel");
  }
  fs.writeFileSync(path.join(out, "perf.json"), JSON.stringify(perf, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "errors.json"), JSON.stringify(errors, null, 2) + "\n");
  if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
} finally {
  await browser.close();
}
