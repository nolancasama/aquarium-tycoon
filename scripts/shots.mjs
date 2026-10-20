// Real-speed screenshots of the moments the fast e2e run skips: feeding,
// dirty water, cleaning, the visitor's celebration, a hungry badge.
// Needs a server (npm run dev -- --port 5320, or a preview).
// Usage: node scripts/shots.mjs [baseUrl] [WxH] [--touch]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const pos = args.filter((a) => !a.startsWith("--"));
const base = pos[0] ?? "http://127.0.0.1:5320/";
const [vw, vh] = (pos[1] ?? "1366x768").split("x").map(Number);
const touch = flags.has("--touch");
const outDir = path.join(root, ".tmp", "scenes", `${vw}x${vh}${touch ? "-touch" : ""}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const stubsSrc = fs.readFileSync(path.join(root, "tests", "e2e", "stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
const page = await context.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error") logs.push(`[error] ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript(stubs);

const call = (name, ...a) => page.evaluate(([m, v]) => window.__at[m](...v), [name, a]);
const state = () => page.evaluate(() => window.__at.state());
async function until(label, pred, timeout = 40_000) {
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`timeout: ${label} ${JSON.stringify({ mode: s.mode, line: s.line, prompt: s.prompt, request: s.request })}`);
    await page.waitForTimeout(100);
  }
}
let n = 0;
async function shot(name, wait = 0) {
  if (wait) await page.waitForTimeout(wait);
  const file = path.join(outDir, `${String(++n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", path.relative(root, file));
}
const tapChoice = async (id) => {
  await until(`choice ${id}`, (s) => s.prompt?.buttons && s.prompt.choices.includes(id) && s.prompt.status === "ready");
  await page.locator(`[data-testid=choice][data-id=${id}]`).click();
};
const click3d = async (kind, id) => {
  const p = await call("where", kind, id);
  await page.mouse.click(p.x, p.y);
};
const nextLines = async () => {
  for (let i = 0; i < 30; i++) {
    const s = await state();
    if (!s.line) return;
    await page.getByTestId("next").click().catch(() => undefined);
    await page.waitForTimeout(250);
  }
};

try {
  await page.goto(`${base}?e2e=1&seed=2`);
  await page.getByTestId("mode-tap").click();
  await page.getByTestId("btn-new").click();
  await until("shop", (s) => s.prompt || s.line);
  await nextLines();
  await tapChoice("bluePlease");
  await until("bag", (s) => s.placing?.kind === "fish");
  await page.waitForTimeout(900);
  await click3d("tank", "t1");
  await until("feed step", (s) => s.tutorial === "feed" && s.view === "tank");
  await shot("splash", 300);
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-feed").click();
  await tapChoice("feedFish");
  await until("pellets", (s) => s.pellets > 0);
  await shot("pellets-fall", 500);
  await shot("eating", 1500);
  // The tutorial visitor.
  await until("visitor line", (s) => s.line || s.request, 20_000);
  await nextLines();
  await until("request", (s) => s.request);
  await shot("request-in-room", 800);
  await click3d("tank", "t1");
  await until("close-up", (s) => s.view === "tank");
  await page.waitForTimeout(1200);
  await call("freezeFish", true);
  const s = await state();
  await click3d("fish", s.tanks[0].fishIds[0]);
  await call("freezeFish", false);
  await shot("celebration", 700);
  await shot("celebration-2", 900);
  await until("stage card", (x) => x.stageCard, 20_000);
  await shot("stage-card", 400);
  await page.getByTestId("stage-ok").click();
  await nextLines();
  await until("decorate", (x) => x.panel === "decorate" && x.mode === "play");
  await page.locator("[data-testid=tray-item][data-kind=plant]").click();
  await click3d("slot", "t1:1");
  await page.locator("[data-testid=tray-item][data-kind=shell]").click();
  await click3d("slot", "t1:2");
  for (let i = 0; i < 60 && (await state()).tutorial !== "done"; i++) {
    await nextLines();
    await page.waitForTimeout(300);
  }
  await until("play", (x) => x.mode === "play" && !x.line);
  await call("visitors", false);
  // Dirty, hungry water.
  await call("setCare", "t1", 18, 12);
  await page.getByTestId("btn-back").click();
  await shot("room-hungry-dirty-badge", 1500);
  await click3d("tank", "t1");
  await shot("dirty-closeup", 2500);
  await page.getByTestId("btn-clean").click();
  await tapChoice("cleanPlease");
  await shot("cleaning", 700);
  await shot("clean-again", 2500);
  // Visitors looking at the tank.
  await call("visitors", true);
  await page.getByTestId("btn-back").click();
  await page.waitForTimeout(9000);
  await shot("visitors-looking");
} catch (e) {
  console.error(String(e));
  await shot("error");
}
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
