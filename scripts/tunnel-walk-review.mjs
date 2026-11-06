// Shark Tunnel walking sequences: consecutive frames from the player's normal view in
// every section, both walking directions and both sides of the walkway, at the three
// Chromebook sizes. Start a server first (npx vite --port 5331).
// Usage: node scripts/tunnel-walk-review.mjs <label> [baseUrl]. Writes .tmp/tunnel-walk/<label>/.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [label = "now", base = "http://localhost:5331/"] = process.argv.slice(2);
const out = path.resolve(".tmp/tunnel-walk", label);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let id = 100;
const tank = (type, slot, species = [], decor = []) => ({
  id: `t${id++}`, type, slot, food: 90, clean: 95,
  fish: species.map((species) => ({ id: `f${id++}`, species })),
  decor: decor.map(([kind, variant, slot]) => ({ id: `d${id++}`, kind, variant, slot })),
  upgrades: { filter: false, lamp: false }
});
const model = {
  coins: 600,
  tanks: [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
    tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish"]),
    tank("sharks", "L", ["blacktip", "zebrashark", "eagleray"], [["tunnelArch", null, 0], ["tunnelShelf", null, 3]])],
  inv: { fish: [], decor: [], tanks: [] },
  progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
    hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
    atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [],
    tunnelOpen: true, tunnelIntroSeen: true, tunnel: { milestone: 1, observed: 0, helped: 0, findDone: false, whereDone: false, countDone: false, trophy: false } },
  stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
};

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((model) => {
  localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
}, model);
const epoch = new Date("2026-11-06T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
const tun = (name, ...args) => page.evaluate(([name, args]) => window.__tunnel[name](...args), [name, args]);
const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
const shot = async (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
/** Walk with a key held, capturing a frame every `every` ms. */
async function walk(name, key, frames, every = 350) {
  await page.keyboard.down(key);
  for (let i = 0; i < frames; i++) { await step(every); await shot(`${name}-${String(i).padStart(2, "0")}`); }
  await page.keyboard.up(key);
  await step(300);
}
try {
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at && window.__tunnel));
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(800);
  for (let i = 0; i < 4 && (await page.getByTestId("next").count()); i++) { await page.getByTestId("next").dispatchEvent("click"); await step(400); }
  if (await page.getByTestId("btn-celebration-ok").count()) await page.getByTestId("btn-celebration-ok").dispatchEvent("click");
  await call("visitors", false);
  await call("set", { hall: 4, view: "room", tankId: null, panel: null });
  await step(1500);
  await page.getByTestId("btn-explore").dispatchEvent("click");
  await step(2500);
  const sections = ["entrance", "firstView", "mainCurve", "grandChamber", "returnLeg", "exit"];
  for (const [w, h] of [[1366, 768], [1280, 720], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    const size = `${w}x${h}`;
    const list = w === 1366 ? sections : ["entrance", "mainCurve", "returnLeg"];
    for (const sec of list) {
      const s0 = await tun("sectionStart", sec);
      // Forward along the loop, keeping right (the reported side), then keeping left.
      await tun("goTo", s0 + 0.5, 0.9);
      await step(1500);
      await walk(`${size}-${sec}-fwd-right`, "ArrowUp", w === 1366 ? 6 : 3);
      if (w === 1366) {
        await tun("goTo", s0 + 0.5, -0.9);
        await step(1500);
        await walk(`${size}-${sec}-fwd-left`, "ArrowUp", 3);
        // Turn round and walk back (the camera swings behind).
        await tun("goTo", s0 + 4, 0);
        await step(1200);
        await walk(`${size}-${sec}-back`, "ArrowDown", 5);
      }
    }
  }
  fs.writeFileSync(path.join(out, "errors.json"), JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Saved walking frames to ${out}`);
} finally {
  await browser.close();
}
