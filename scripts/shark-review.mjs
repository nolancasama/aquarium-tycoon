// Controller-owned review capture. Start Vite separately: npx vite --port 5330
// This script never starts a server and never writes to the game/save state.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/shark-review');
const base = (process.argv[2] ?? 'http://127.0.0.1:5330').replace(/\/$/, '');
fs.mkdirSync(out, { recursive: true });
const errors = [], captures = [];
let browser;
try {
  if (!(await fetch(`${base}/lab/sharks.html`)).ok) throw Error('HARNESS_PRECONDITION_FAILED: lab URL unavailable; start Vite on port 5330');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-logging', '--log-level=3'], env: { ...process.env, CHROME_LOG_FILE: path.join(out, 'chromium-debug.log') } });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  async function open(query = '') {
    await page.goto(`${base}/lab/sharks.html?paused=1&${query}`);
    try { await page.waitForFunction(() => window.__sharkLab?.state().ready, { timeout: 30000 }); }
    catch { throw Error(`HARNESS_PRECONDITION_FAILED: simulation did not initialise (${query})`); }
    await frame();
  }
  async function frame() {
    // R3F must upload updated rig uniforms and render, independent of wall time.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function advance(seconds) {
    const state = await page.evaluate(seconds => window.__sharkLab.advance(seconds), seconds);
    await frame(); return state;
  }
  async function seek(label, condition, limit = 90, increment = .1) {
    let state = await page.evaluate(() => window.__sharkLab.state());
    for (let t = 0; t < limit; t += increment) {
      if (condition(state)) return state;
      state = await advance(increment);
    }
    throw Error(`HARNESS_PRECONDITION_FAILED: ${label}; last state ${JSON.stringify(state)}`);
  }
  async function capture(name) {
    await frame();
    const state = await page.evaluate(() => window.__sharkLab.state());
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    captures.push({ file: `${name}.png`, state });
  }
  for (const species of ['blacktip', 'zebrashark', 'eagleray']) {
    await open(`cam=close&species=${species}`);
    for (const angle of ['side', 'top', 'below', 'front']) {
      await page.evaluate(({ species, angle }) => window.__sharkLab.focus(species, angle), { species, angle });
      await capture(`${species}-rest-${angle}`);
    }
    await seek(`${species} swimming`, s => s.poses[0]?.speed > .12);
    const current = await page.evaluate(() => window.__sharkLab.state().poses[0]);
    // A lateral target requests an actual controller turn; wait on the pose bank.
    await page.evaluate(p => window.__sharkLab.attract(p.id, { x: p.x - p.hz * 6, y: p.y + .5, z: p.z + p.hx * 6 }, 25), current);
    await seek(`${species} mid-turn bank`, s => Math.abs(s.poses[0]?.bank ?? 0) > .045);
    for (const angle of ['side', 'top', 'below', 'front']) {
      await page.evaluate(({ species, angle }) => window.__sharkLab.focus(species, angle), { species, angle });
      await capture(`${species}-turn-${angle}`);
    }
    if (species === 'blacktip') for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.__sharkLab.focus('blacktip', 'top'));
      await capture(`blacktip-turn-${String(i).padStart(2, '0')}`); await advance(.1);
    }
    if (species === 'eagleray') for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.__sharkLab.focus('eagleray', 'front'));
      await capture(`ray-wave-${String(i).padStart(2, '0')}`); await advance(.1);
    }
  }
  await open('cam=tunnel');
  await page.evaluate(() => {
    const p = window.__sharkLab.state().poses.find(p => p.species === 'blacktip');
    if (!p) throw Error('HARNESS_PRECONDITION_FAILED: no blacktip');
    window.__sharkLab.attract(p.id, { x: -6, y: 5, z: 3 }, 60);
  });
  await seek('animal overhead at viewing tube', s => s.poses.some(p => Math.abs(p.x + 6) < 2 && p.z > -1 && p.z < 7 && p.y > 3.5), 90, .2);
  await capture('tunnel-looking-up');
  await page.evaluate(() => window.__sharkLab.camera('management'));
  await capture('management');
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`Shark review frames: ${out}`);
} finally {
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ captures, errors }, null, 2));
  if (browser) await browser.close();
}
