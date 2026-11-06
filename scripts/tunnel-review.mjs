// Shark Tunnel visual review (not the browser suite). Start a server first
// (npx vite --port 5330). Usage: node scripts/tunnel-review.mjs [baseUrl] [part]
// part: all | manage | explore. Writes .tmp/tunnel-review/ (frames + evidence.json).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [base = "http://localhost:5330/", part = "all"] = process.argv.slice(2);
const out = path.resolve(".tmp/tunnel-review");
fs.mkdirSync(out, { recursive: true });
let id = 100;
const tank = (type, slot, species = [], decor = []) => ({
  id: `t${id++}`, type, slot, food: 90, clean: 95,
  fish: species.map((species) => ({ id: `f${id++}`, species })),
  decor: decor.map(([kind, variant, slot]) => ({ id: `d${id++}`, kind, variant, slot })),
  upgrades: { filter: false, lamp: false }
});
const habitat = tank("sharks", "L", ["blacktip", "blacktip", "zebrashark", "eagleray", "eagleray"],
  [["tunnelArch", null, 0], ["tunnelLedge", null, 1], ["tunnelShelf", null, 3], ["tunnelPinnacle", null, 5]]);
const tanks = [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
  tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish", "goby"]), habitat];
const model = (open) => ({
  coins: 600, tanks: open ? tanks : tanks.filter((t) => t.type !== "sharks"), inv: { fish: [], decor: [{ id: "dx1", kind: "tunnelSand", variant: null }], tanks: [] },
  progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
    hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
    atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [],
    tunnelOpen: open, tunnelIntroSeen: false, tunnel: { milestone: 2, observed: 3, helped: 1, findDone: false, whereDone: false, countDone: false, trophy: false } },
  stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
});

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [], evidence = { views: {}, explore: {}, errors };
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript((model) => {
  localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
  localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true }));
}, model(true));
const epoch = new Date("2026-11-06T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([name, args]) => window.__at[name](...args), [name, args]);
const tun = (name, ...args) => page.evaluate(([name, args]) => window.__tunnel[name](...args), [name, args]);
const step = async (ms) => { for (let t = 0; t < ms; t += 100) await page.clock.fastForward(Math.min(100, ms - t)); };
const shot = async (name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); };
try {
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at && window.__tunnel));
  await page.getByTestId("btn-continue").dispatchEvent("click");
  await step(800);
  if (await page.getByTestId("next").count()) { await page.getByTestId("next").dispatchEvent("click"); await step(300); }
  await call("visitors", false);
  if (part === "all" || part === "manage") {
    await call("set", { hall: 3, view: "room", tankId: null, panel: null });
    await step(2600);
    await shot("01-atrium-door");
    await page.getByTestId("btn-hall-next").dispatchEvent("click");
    await step(1800);
    await shot("02-arrival-start");
    await step(2400);
    await shot("03-arrival-sweep");
    await step(2000);
    for (const [width, height] of [[1366, 768], [1280, 720], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      for (const v of ["whole", "left", "right", "entrance"]) {
        await call("set", { tunnelView: v });
        await step(2400);
        await shot(`10-manage-${v}-${width}x${height}`);
        evidence.views[`${v}-${width}x${height}`] = (await call("state")).perf;
      }
      await call("set", { tunnelView: "whole" });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await step(800);
    await page.getByTestId("btn-decorate").dispatchEvent("click");
    await step(1200);
    await shot("11-decorate-rings");
    await call("set", { panel: null, placing: null });
    await step(600);
  }
  if (part === "all" || part === "explore") {
    await call("set", { hall: 4, view: "room", tankId: null, panel: null });
    await step(1500);
    await page.evaluate(() => window.dispatchEvent(new Event("tunnel-skip")));
    await step(1200);
    await page.getByTestId("btn-explore").dispatchEvent("click");
    await step(700);
    await shot("20-enter-transition");
    await step(1600);
    await shot("21-explore-start");
    // Walk forward with the keyboard for a few seconds.
    await page.keyboard.down("ArrowUp");
    await step(3000);
    await page.keyboard.up("ArrowUp");
    await step(600);
    await shot("22-walked");
    evidence.explore.walked = await tun("state");
    for (const sec of ["firstView", "mainCurve", "grandChamber", "returnLeg", "exit"]) {
      const s = await tun("sectionStart", sec);
      await tun("goTo", s + 2.5, 0);
      await step(2500);
      await shot(`23-section-${sec}`);
      const st = await tun("state");
      evidence.explore[sec] = { tube: st.tube, perf: (await call("state")).perf };
    }
    for (const spot of await tun("spots")) {
      await tun("goTo", spot.s, 0);
      await step(3000);
      await shot(`24-spot-${spot.id}`);
    }
    // A shark overhead: bring one over the player in the main curve.
    const curve = await tun("sectionStart", "mainCurve");
    await tun("goTo", curve + 3, 0);
    await step(800);
    let st = await tun("state");
    const shark = st.animals.find((a) => a.species === "blacktip");
    await tun("attract", shark.id, st.player.x, 5, st.player.z, 30);
    for (let i = 0; i < 40; i++) {
      await step(500);
      st = await tun("state");
      if (st.tilt > 0.35) break;
    }
    await shot("25-shark-overhead");
    evidence.explore.overheadTilt = st.tilt;
    // Activities: a find, then a count.
    await tun("activity", "find", "shark", true);
    await step(1500);
    await shot("30-activity-find");
    await step(27000);
    await shot("31-find-help-tier3");
    st = await tun("state");
    const target = st.activity && st.animals.find((a) => a.species !== "eagleray");
    if (target) {
      const pos = await tun("animalOnScreen", target.id);
      if (pos) await page.mouse.click(pos.x, pos.y);
    }
    await step(1500);
    await shot("32-find-answered");
    for (let i = 0; i < 6 && (await page.getByTestId("next").count()); i++) { await page.getByTestId("next").dispatchEvent("click"); await step(500); }
    await tun("activity", "count", "shark", true);
    await step(3500);
    await shot("33-activity-count");
    await page.getByTestId("btn-back-aquarium").dispatchEvent("click").catch(() => {});
    await step(2500);
    await shot("40-back-to-aquarium");
  }
  fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Saved Shark Tunnel frames to ${out}`);
} finally {
  fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
  await browser.close();
}
