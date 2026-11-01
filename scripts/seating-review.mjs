// Focused rendered seating evidence. Starts and stops its own Vite server.
// Usage: node scripts/seating-review.mjs
// Output: .tmp/seating-review/*.png and manifest.json (human visual review).
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".tmp", "seating-review");
fs.mkdirSync(out, { recursive: true });
const manifest = { base: "http://127.0.0.1:5320/", frames: [], errors: [] };
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5320, strictPort: true, hmr: false, watch: null } });
let browser;
let page;
let virtualMs = 0;
const step = async (ms) => {
  // runFor delivers every animation frame; fastForward would skip the motion.
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    const delta = Math.min(100, ms - elapsed);
    await page.clock.runFor(delta);
    virtualMs += delta;
  }
};
const fixture = (method, ...args) => page.evaluate(([method, args]) => window.__seatingReview[method](...args), [method, args]);
async function until(label, predicate, timeout = 15000) {
  const start = virtualMs;
  while (!predicate(await fixture("state"))) {
    if (virtualMs - start >= timeout) throw new Error(`Timed out: ${label}`);
    await step(100);
  }
}
async function shot(name, purpose) {
  const visitors = await fixture("state");
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled" });
  manifest.frames.push({ file: `${name}.png`, purpose, virtualMs, visitors });
  console.log(`saved .tmp/seating-review/${name}.png`);
}

try {
  await server.listen();
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => manifest.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") manifest.errors.push(message.text()); });
  const stubsSource = fs.readFileSync(path.join(root, "tests", "e2e", "stubs.ts"), "utf8");
  await page.addInitScript(stubsSource.slice(stubsSource.indexOf("`") + 1, stubsSource.lastIndexOf("`")));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
  });
  const epoch = new Date("2026-11-01T00:00:00Z");
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  await page.goto(`${manifest.base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.evaluate(async () => {
    const [{ rt }, flow, world, { setGame }, { newModel, newTank }] = await Promise.all([
      import("/src/game/runtime.ts"), import("/src/game/flow/visitors.ts"), import("/src/game/world.ts"),
      import("/src/game/store.ts"), import("/src/game/logic/model.ts")
    ]);
    const model = newModel();
    Object.assign(model.progress, { stage: 8, tutorial: "done", freePlay: true, star: true, superStar: true,
      photo: true, hallOpen: true, galleryOpen: true, atriumOpen: true, atriumIntroSeen: true, tipsTaught: true });
    // Empty displays keep seating evidence clear and avoid unrelated fish motion.
    model.tanks = [newTank("review-a", "small", "A"), newTank("review-reef", "reef", "I")];
    setGame({ model, screen: "game", mode: "busy", hall: 0, view: "room", tankId: null,
      panel: null, line: null, prompt: null, nudge: null, stageCard: null, request: null, waiting: null });
    flow.scripted.busy = true;
    window.__at.visitors(false);
    rt.freezeFish = true;
    rt.visitors = [];
    const seats = world.SEATS.filter((seat) => !seat.requestOnly);
    const state = () => rt.visitors.map((visitor) => ({ id: visitor.id, type: visitor.type, seatId: visitor.seatId,
      state: visitor.state, seat: visitor.seat, x: visitor.x, z: visitor.z, yaw: visitor.yaw,
      path: visitor.path.map((point) => ({ ...point })) }));
    window.__seatingReview = {
      seats: () => seats,
      state,
      clear() { rt.visitors = []; },
      camera(seatId, overview = false) {
        const seat = seats.find((candidate) => candidate.id === seatId);
        setGame({ hall: seat.room, mode: "busy", nudge: null });
        const dx = Math.sin(seat.facing), dz = Math.cos(seat.facing);
        const sideX = Math.cos(seat.facing), sideZ = -Math.sin(seat.facing);
        rt.camera.shot = overview ? null : {
          pos: { x: seat.x + dx * 3.5 + sideX * 2.5, y: 2.35, z: seat.z + dz * 3.5 + sideZ * 2.5 },
          target: { x: seat.x, y: 0.65, z: seat.z }
        };
        rt.camera.snap = true;
      },
      arrive(type, seatId) {
        const seat = seats.find((candidate) => candidate.id === seatId);
        const visitor = flow.spawnVisitor(type, null);
        // Fixture starts in the room at the safe approach; all later placement
        // uses the production walk, turn, benchPose and stand/exit controllers.
        visitor.x = seat.approach.x;
        visitor.z = seat.approach.z;
        visitor.yaw = seat.facing;
        visitor.seatId = seat.id;
        visitor.rested = true;
        visitor.plan = [];
        visitor.at = null;
        visitor.path = world.seatApproach(visitor, seat);
        visitor.bornT = rt.time - 1;
        return visitor.id;
      },
      hold() { for (const visitor of rt.visitors) if (visitor.seat === 1) visitor.until = Infinity; },
      leave(id) { const visitor = rt.visitors.find((candidate) => candidate.id === id); if (visitor) flow.leave(visitor); }
    };
  });
  await step(100);
  const seats = await fixture("seats");
  const benchIds = [...new Set(seats.map((seat) => seat.benchId))];
  for (const benchId of benchIds) {
    const options = seats.filter((seat) => seat.benchId === benchId);
    const seat = options[Math.floor(options.length / 2)];
    const label = benchId.replace(/[^a-z0-9-]/gi, "-");
    for (const type of ["adult", "child"]) {
      await fixture("clear");
      await fixture("camera", seat.id);
      const id = await fixture("arrive", type, seat.id);
      await until(`${label} ${type} reaches front`, (visitors) => visitors.some((visitor) => visitor.id === id && visitor.seat > 0));
      await shot(`${label}-${type}-sit-00`, "Sit starts after walking to the front and turning");
      for (let i = 1; i <= 4; i++) {
        await step(300);
        await shot(`${label}-${type}-sit-0${i}`, "Continuous sit-down, planted feet or child dangling legs");
      }
      await until(`${label} ${type} seated`, (visitors) => visitors.some((visitor) => visitor.id === id && visitor.seat === 1));
      await fixture("hold");
      await step(300);
      await shot(`${label}-${type}-seated`, "Seated hips supported by the actual bench seat, back and proportions visible");
      await fixture("leave", id);
      for (let i = 0; i < 5; i++) {
        if (i) await step(325);
        await shot(`${label}-${type}-stand-0${i}`, "Production leave stands before following front-to-approach exit");
      }
      await step(700);
      await shot(`${label}-${type}-exit`, "Walking clear of the bench after standing");
    }
  }
  for (const room of [0, 3]) {
    await fixture("clear");
    const roomSeats = seats.filter((seat) => seat.room === room);
    await fixture("camera", roomSeats[0].id, true);
    for (const [index, seat] of roomSeats.entries()) await fixture("arrive", index % 2 ? "child" : "adult", seat.id);
    await until(`room ${room} all seated`, (visitors) => visitors.length === roomSeats.length && visitors.every((visitor) => visitor.seat === 1));
    await fixture("hold");
    await step(300);
    await shot(`room-${room}-several-seated`, "Distinct ordinary seats occupied together; both atrium benches shown");
  }
  if (manifest.errors.length) throw new Error(`Browser errors: ${manifest.errors.join("; ")}`);
} catch (error) {
  manifest.errors.push(String(error.stack ?? error));
  if (page) await page.screenshot({ path: path.join(out, "error.png") }).catch(() => {});
  process.exitCode = 1;
  console.error(error);
} finally {
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser?.close();
  await server.close();
}
