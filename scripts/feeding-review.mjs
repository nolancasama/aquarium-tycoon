// Feeding frames for human review. Start a server first (npx vite --port 5320).
// Usage: node scripts/feeding-review.mjs. Writes .tmp/feeding-review/.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".tmp", "feeding-review");
fs.mkdirSync(out, { recursive: true });
const stubsSrc = fs.readFileSync(path.join(root, "tests/e2e/stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));
let id = 1;
const tank = (tankId, type, slot, species) => ({
  id: tankId, type, slot, food: 30, clean: 100, light: type === "cylinder" ? "blue" : null,
  fish: species.map((s) => ({ id: `f${id++}`, species: s })), decor: [], upgrades: { filter: false, lamp: false }
});
const tanks = [
  tank("reef-fish", "big", "A", ["clownfish", "bluetang", "angelfish", "crab"]),
  tank("cave", "cave", "B", ["eel", "octopus", "crab"]),
  tank("ocean", "ocean", "C", ["turtle", "stingray", "chromis"]),
  tank("jelly", "cylinder", "F", ["moonjelly", "spottedjelly"])
];
const save = { v: 3, model: { coins: 500, tanks, inv: { fish: [], decor: [], tanks: [] },
  progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, superStar: true, tipsTaught: true, said: ["orangePlease", "feedFish"] },
  stats: { coinsEarned: 300, helped: 10, fishBought: 12, seconds: 1500 }, nextId: id, paid: [] } };

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-logging"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(stubs);
await page.addInitScript((s) => {
  localStorage.setItem("at.save.v1", JSON.stringify(s));
  localStorage.setItem("at.settings.v1", JSON.stringify({ audioSetupDone: true, mic: false, music: 0, sfx: 0, japanese: true }));
}, save);
await page.goto("http://127.0.0.1:5320/?e2e=1&seed=3");
await page.getByTestId("btn-continue").click();
await page.waitForTimeout(1500);
await page.evaluate(() => window.__at.visitors(false));
for (const t of tanks) {
  const hall = t.slot === "C" ? 1 : t.slot === "F" ? 2 : 0;
  await page.evaluate(([tankId, h]) => window.__at.set({ view: "tank", tankId, hall: h, line: null, nudge: null, stageCard: null, mode: "play" }), [t.id, hall]);
  await page.waitForTimeout(2500);
  await page.getByTestId("btn-feed").click();
  for (const [i, wait] of [600, 1500, 2500, 3500].entries()) {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(out, `${t.id}-${i}.png`) });
  }
  // Scripted fixtures: food that is not eaten clears before the next tank.
  await page.waitForTimeout(800);
}
fs.writeFileSync(path.join(out, "errors.json"), JSON.stringify(errors, null, 2));
console.log(`Feeding review: ${out}; browser errors: ${errors.length}`);
await browser.close();
