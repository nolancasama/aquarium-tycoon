// Quick look at Speak-mode prompts: ready, listening, the second-miss highlight,
// the rescue buttons (dev aid). Usage: node scripts/peek.mjs [baseUrl] [WxH] [--touch]
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
const outDir = path.join(root, ".tmp", "peek", `${vw}x${vh}${touch ? "-touch" : ""}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const stubsSrc = fs.readFileSync(path.join(root, "tests", "e2e", "stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
const page = await context.newPage();
await page.addInitScript(stubs);
const state = () => page.evaluate(() => window.__at.state());
async function until(pred, timeout = 20_000) {
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (pred(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error("timeout");
    await page.waitForTimeout(100);
  }
}
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const speak = async (text, slow = 0) => {
  await page.evaluate(([t, s]) => {
    window.__speech.say = t;
    window.__ttsMs = 120;
    void s;
  }, [text, slow]);
  await page.keyboard.press("Space");
};

await page.goto(`${base}?e2e=1&seed=1`);
await page.waitForTimeout(1500);
await shot("1-title");
await page.getByTestId("btn-title-settings").click();
await page.getByTestId("settings-speak").click();
await page.getByTestId("settings-close").click();
await page.getByTestId("btn-new").click();
await until((s) => s.prompt || s.line);
for (let i = 0; i < 6 && (await state()).line; i++) {
  await page.getByTestId("next").click().catch(() => undefined);
  await page.waitForTimeout(400);
}
await until((s) => s.prompt?.status === "ready");
await page.waitForTimeout(600);
await shot("2-speak-ready");
// A slow recogniser so the listening state is visible.
await page.evaluate(() => {
  window.__speech.say = null;
});
await page.keyboard.press("Space");
await page.waitForTimeout(120);
await shot("3-listening");
await until((s) => s.prompt?.misses === 1);
await speak("hello");
await until((s) => s.prompt?.misses === 2);
await page.waitForTimeout(500);
await shot("4-highlight");
await speak("purple");
await until((s) => s.prompt?.misses === 3);
await page.waitForTimeout(500);
await shot("5-rescue");
await browser.close();
console.log("saved to", path.relative(root, outDir));
