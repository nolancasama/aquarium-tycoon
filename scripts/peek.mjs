// Quick look at the title and the first tutorial moments (dev aid).
// Usage: node scripts/peek.mjs [baseUrl] [WxH] [--touch]
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
const outDir = path.join(root, ".tmp", "peek");
fs.mkdirSync(outDir, { recursive: true });
const stubsSrc = fs.readFileSync(path.join(root, "tests", "e2e", "stubs.ts"), "utf8");
const stubs = stubsSrc.slice(stubsSrc.indexOf("`") + 1, stubsSrc.lastIndexOf("`"));

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
const page = await context.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript(stubs);
await page.goto(`${base}?e2e=1&seed=1`);
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outDir, "1-title.png") });
await page.getByTestId("mode-tap").click();
await page.getByTestId("btn-new").click();
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(outDir, "2-hello.png") });
for (let i = 0; i < 3; i++) {
  const next = page.getByTestId("next");
  if (await next.isVisible().catch(() => false)) await next.click();
  await page.waitForTimeout(900);
}
await page.screenshot({ path: path.join(outDir, "3-shop.png") });
const st = await page.evaluate(() => window.__at.state());
console.log(JSON.stringify({ mode: st.mode, prompt: st.prompt, line: st.line, perf: st.perf }, null, 1));
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
