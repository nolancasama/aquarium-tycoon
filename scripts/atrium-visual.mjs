// Focused Atrium frames, not the browser suite. Start npm run dev on port5320.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(".tmp/visual/atrium");
fs.mkdirSync(out, { recursive: true });
let id = 100;
const tank = (type, slot, species = [], decor = []) => ({
  id: `t${id++}`, type, slot, food: 100, clean: 100,
  fish: species.map((species) => ({ id: `f${id++}`, species })),
  decor: decor.map(([kind, variant, slot]) => ({ id: `d${id++}`, kind, variant, slot })),
  upgrades: { filter: false, lamp: false }
});
const tanks = [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
  tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish", "goby", "chromis", "crab", "seahorse", "stingray"],
    [["staghorn", "red", 0], ["brain", null, 1], ["fan", "blue", 4], ["table", null, 6]])];
const model = { coins: 500, tanks, inv: { fish: [], decor: [], tanks: [] },
  progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
    hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
    atriumIntroSeen: false, superStar: true, tipsTaught: true, tickets: true, said: [] },
  stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id, paid: [] };
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [], evidence = { views: {}, errors };
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((model) => {
  localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true }));
}, model);
const epoch = new Date("2026-11-01T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
const shot = async (name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); };
try {
  await page.goto(`${process.argv[2] ?? "http://localhost:5320/"}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(800);
  if (await page.getByTestId("next").count()) {
    await page.getByTestId("next").dispatchEvent("click");
    await step(300);
  }
  await call("visitors", false);
  await call("freezeFish", true);
  await call("set", { hall: 3, view: "room", tankId: null, panel: null });
  await step(1400);
  if (!await page.getByTestId("atrium-arrival").isVisible()) throw new Error("arrival card missing");
  await shot("01-arrival");
  await page.getByTestId("atrium-arrival").getByRole("button").dispatchEvent("click");
  await step(2600);
  if (await page.getByTestId("atrium-arrival").count()) throw new Error("skip failed");
  const reef = tanks.find((t) => t.type === "reef");
  for (const [width, height] of [[1366, 768], [1280, 720], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    await call("set", { hall: 3, view: "room", tankId: null, panel: null });
    await step(2600);
    await shot(`02-room-${width}x${height}`);
    evidence.views[`${width}x${height}`] = (await call("state")).perf;
    await call("set", { hall: 3, view: "tank", tankId: reef.id, panel: null });
    await step(2600);
    await shot(`03-reef-${width}x${height}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await call("set", { hall: 2, view: "room", tankId: null, panel: null });
  await step(2600);
  await shot("04-gallery-door");
  await page.getByTestId("btn-hall-next").dispatchEvent("click");
  await step(2600);
  if (await page.getByTestId("atrium-arrival").count()) throw new Error("arrival repeated");
  await page.getByTestId("btn-hall-prev").dispatchEvent("click");
  await step(2600);
  if ((await call("state")).hall !== 2) throw new Error("return arrow failed");
  fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Saved Atrium frames and renderer stats to ${out}`);
} finally { await browser.close(); }
