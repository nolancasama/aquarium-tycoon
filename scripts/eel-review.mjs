// Self-contained gameplay renderer evidence: node scripts/eel-review.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/eel-review');
const base = 'http://127.0.0.1:5320';
fs.mkdirSync(out, { recursive: true });
let server;
let browser;
const errors = [];
const manifest = {};
try {
  try { await fetch(base); }
  catch {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5320', '--strictPort'], { cwd: root, windowsHide: true, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      try { if ((await fetch(base)).ok) break; } catch {}
      if (i === 99) throw Error('Vite did not start on port 5320');
    }
  }
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-logging', '--log-level=3'],
    env: { ...process.env, CHROME_LOG_FILE: path.join(out, 'chromium-debug.log') },
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const stub = fs.readFileSync(path.join(root, 'tests/e2e/stubs.ts'), 'utf8');
  await page.addInitScript(stub.slice(stub.indexOf('`') + 1, stub.lastIndexOf('`')));
  await page.addInitScript(() => {
    const tank = { id: 'eel-tank', type: 'cave', slot: 'A', food: 100, clean: 100, fish: [{ id: 'eel-review', species: 'eel' }], decor: [], upgrades: { filter: false, lamp: false }, light: 'blue' };
    localStorage.setItem('at.save.v1', JSON.stringify({ v: 3, model: { coins: 999, tanks: [tank], inv: { fish: [], decor: [], tanks: [] }, progress: { stage: 8, tutorial: 'done', firstFish: 'clownfish', fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, superStar: true, galleryOpen: true, said: ['orangePlease', 'feedFish'] }, stats: { coinsEarned: 300, helped: 10, fishBought: 1, seconds: 1500 }, nextId: 3, paid: [] } }));
    localStorage.setItem('at.settings.v1', JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
  });
  const epoch = new Date('2026-11-01T00:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.waitForTimeout(1200);
  await page.getByTestId('btn-continue').dispatchEvent('click');
  const render = async () => { await page.clock.fastForward(50); };
  // R3F mounts asynchronously after Continue; wait for its first simulation
  // frame before freezing or touching the presentation runtime.
  for (let i = 0; i < 60; i++) {
    await render();
    const ready = await page.evaluate(async () => { const { rt } = await import('/src/game/runtime.ts'); return rt.fish.has('eel-review'); });
    if (ready) break;
    if (i === 59) throw Error(`Fixture failed to initialise: ${JSON.stringify(await page.evaluate(() => window.__at.state()))}`);
    await page.waitForTimeout(25);
  }
  await page.evaluate(async () => {
    window.__at.visitors(false);
    window.__at.set({ view: 'tank', tankId: 'eel-tank', hall: 0, panel: null, fishTalk: null, line: null });
    const { rt } = await import('/src/game/runtime.ts');
    rt.freezeFish = true;
  });
  // Direct pure-controller stepping holds the review at exact simulation times;
  // the mesh, material, lighting, rock occlusion and camera remain the real scene.
  async function setup(kind) {
    await page.evaluate(async kind => {
      const { rt } = await import('/src/game/runtime.ts');
      const { TANKS } = await import('/src/game/data/tanks.ts');
      const { tankOrigin } = await import('/src/game/world.ts');
      const { SPECIES } = await import('/src/game/data/fish.ts');
      const { stepBehavior } = await import('/src/game/logic/behavior.ts');
      const { eelBounds, createEelBody } = await import('/src/game/logic/eelBody.ts');
      const f = rt.fish.get('eel-review');
      delete f.eel; delete f.mode; delete f.modeTimer;
      f.denIndex = 0; f.phase = 1; f.eatT0 = -10;
      const env = { tank: TANKS.cave, bounds: eelBounds(TANKS.cave), columns: TANKS.cave.rocks, others: [], speedMul: 1, attract: null, depthBias: 0, denIndex: 0, phase: 1 };
      stepBehavior(f.s, f, SPECIES.eel, env, 1 / 60, () => 0.5);
      window.__eelReview = { f, env, stepBehavior, def: SPECIES.eel, elapsed: 0, kind };
      const origin = tankOrigin('A');
      rt.camera.shot = { pos: { x: origin.x, y: origin.y + 1, z: origin.z + 2.65 }, target: { x: origin.x, y: origin.y + 0.33, z: origin.z - 0.01 } };
      rt.camera.snap = true;
      if (['left-turn', 'right-turn', 'reversal'].includes(kind)) {
        Object.assign(f.s, { x: -0.05, y: 0.3, z: 0.15, vx: 0.12, vy: 0, vz: 0 });
        f.eel = createEelBody(f.s, 1);
        f.eel.speed = 0.12;
        f.mode = 'cruise'; f.modeTimer = 100;
        env.attract = kind === 'left-turn' ? { x: 0.25, y: 0.3, z: 0.38 } : kind === 'right-turn' ? { x: 0.25, y: 0.3, z: -0.12 } : { x: -0.8, y: 0.3, z: 0.15 };
      } else if (kind === 'feeding') {
        f.modeTimer = 0;
        env.attract = { x: -0.15, y: 0.075, z: 0.25 };
        rt.pellets.length = 0;
        rt.pellets.push({ id: 999, tankId: 'eel-tank', ...env.attract, vy: 0, sway: 0, visualKind: 'seafood', eaten: false, landedT: rt.time + 100 });
      } else if (kind !== 'resting-at-den') {
        f.modeTimer = 0;
      }
    }, kind);
    for (let i = 0; i < 12; i++) await render();
    if ((await page.evaluate(() => window.__at.state())).line) {
      await page.keyboard.press('Space');
      for (let i = 0; i < 8; i++) await render();
    }
  }
  async function advance(seconds) {
    return page.evaluate(async seconds => {
      const r = window.__eelReview;
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        r.env.phase += 1 / 60; r.elapsed += 1 / 60;
        r.stepBehavior(r.f.s, r.f, r.def, r.env, 1 / 60, () => 0.5);
      }
      const body = r.f.eel;
      let nearestDen = Infinity;
      for (let i = 0; i < 16; i++) for (const den of r.env.tank.dens) {
        nearestDen = Math.min(nearestDen, Math.hypot(body.rig[i * 4] - den.x, body.rig[i * 4 + 1] - den.y, body.rig[i * 4 + 2] - den.z));
      }
      return { mode: r.f.mode, elapsed: r.elapsed, rail: body.rail, railQ: body.railQ, returning: body.returning, nearestDen,
        head: { x: r.f.s.x, y: r.f.s.y, z: r.f.s.z }, rig: Array.from(body.rig) };
    }, seconds);
  }
  async function finishStrip(name, frames, state) {
    const sheet = await browser.newPage({ viewport: { width: 1366 * frames.length, height: 768 }, deviceScaleFactor: 1 });
    await sheet.setContent(`<style>*{margin:0}body{display:flex}img{width:1366px;height:768px}</style>${frames.map(frame => `<img src="data:image/png;base64,${frame.toString('base64')}">`).join('')}`);
    await sheet.screenshot({ path: path.join(out, `${name}-strip.png`) });
    await sheet.close();
    manifest[name] = { frames: frames.map((_, i) => `${name}-${i}.png`), strip: `${name}-strip.png`, state };
  }
  async function capture(name, frames, state, snapshot, label) {
    state.push({ ...snapshot, label });
    await render();
    frames.push(await page.screenshot({ path: path.join(out, `${name}-${frames.length}.png`), animations: 'disabled' }));
  }
  async function strip(name, times) {
    const frames = [], state = [];
    let elapsed = 0;
    for (const time of times) {
      await capture(name, frames, state, await advance(time - elapsed)); elapsed = time;
    }
    await finishStrip(name, frames, state);
  }
  async function seek(label, accepts, step = 1 / 60, limit = 180) {
    let state = await advance(0);
    for (let i = 0; i < Math.ceil(limit / step); i++) {
      if (accepts(state)) return state;
      state = await advance(step);
    }
    throw Error(`No ${label} reached: ${JSON.stringify(state)}`);
  }
  async function orbitPair(prefix) {
    for (const orbit of [-0.52, 0.52]) {
      await page.evaluate(async orbit => {
        const { rt } = await import('/src/game/runtime.ts');
        const { tankOrigin } = await import('/src/game/world.ts');
        const origin = tankOrigin('A');
        rt.camera.shot = { pos: { x: origin.x + Math.sin(orbit) * 2.65, y: origin.y + 0.9, z: origin.z + Math.cos(orbit) * 2.65 }, target: { x: origin.x, y: origin.y + 0.33, z: origin.z } };
        rt.camera.snap = true;
      }, orbit);
      await render();
      await page.screenshot({ path: path.join(out, `${prefix}-${orbit < 0 ? 'left' : 'right'}.png`) });
    }
    await page.evaluate(async () => {
      const { rt } = await import('/src/game/runtime.ts');
      const { tankOrigin } = await import('/src/game/world.ts');
      const origin = tankOrigin('A');
      rt.camera.shot = { pos: { x: origin.x, y: origin.y + 1, z: origin.z + 2.65 }, target: { x: origin.x, y: origin.y + 0.33, z: origin.z - 0.01 } };
      rt.camera.snap = true;
    });
  }
  for (const name of ['left-turn', 'right-turn', 'reversal', 'feeding', 'exploring', 'entering-a-den', 'resting-at-den']) {
    console.log(`Capturing ${name}`);
    await setup(name);
    if (name === 'feeding') {
      await advance(0.5); await render();
      await page.screenshot({ path: path.join(out, 'feeding-approach.png') });
      for (let i = 0; i < 240; i++) {
        await advance(0.1); await render();
        const ate = await page.evaluate(async () => { const { rt } = await import('/src/game/runtime.ts'); return rt.time - rt.fish.get('eel-review').eatT0 < 0.2; });
        if (ate) break;
        if (i === 239) throw Error('The production mouth reach check never ate the sand food');
      }
    }
    if (name === 'exploring') {
      const frames = [], state = [];
      for (let i = 0; i < 4; i++) {
        if (i) await advance(0.8);
        const snapshot = await seek('open-water exploration', s => s.mode === 'cruise' && !s.rail && s.nearestDen >= 0.24, 0.1);
        await capture(name, frames, state, snapshot, 'whole body at least 0.24 m from every den');
      }
      await finishStrip(name, frames, state);
      continue;
    }
    if (name === 'entering-a-den') {
      const frames = [], state = [];
      await capture(name, frames, state, await seek('return approach', s => s.mode === 'return' && !s.rail && s.head.z > -0.04), 'open-water approach');
      await capture(name, frames, state, await seek('head at aperture', s => s.rail === 'enter' && s.railQ <= 0.015), 'head passes mouth');
      await capture(name, frames, state, await seek('body partly through aperture', s => s.rail === 'enter' && s.railQ <= -0.30), 'mid body passes mouth');
      await orbitPair('entry-orbit');
      manifest['entry-orbit'] = { frames: ['entry-orbit-left.png', 'entry-orbit-right.png'], state: await advance(0) };
      await capture(name, frames, state, await seek('tail entering aperture', s => s.rail === 'enter' && s.railQ <= -0.63), 'tail passes mouth');
      await capture(name, frames, state, await seek('tail hidden', s => s.rail === 'enter' && s.railQ <= -0.735), 'tail disappears');
      await finishStrip(name, frames, state);
      continue;
    }
    await strip(name, name === 'feeding' ? [0, 0.05, 0.12, 0.3] : name === 'resting-at-den' ? [0, 1, 2, 3] : [0, 0.8, 3.2, 6.4]);
  }
  // Additional real gameplay views reveal whether hidden rail segments leak.
  await setup('resting-at-den');
  for (const orbit of [-0.52, 0.52]) {
    await page.evaluate(async orbit => {
      const { rt } = await import('/src/game/runtime.ts');
      const { tankOrigin } = await import('/src/game/world.ts');
      const origin = tankOrigin('A');
      window.__at.set({ view: 'tank', tankId: 'eel-tank' });
      rt.camera.shot = { pos: { x: origin.x + Math.sin(orbit) * 2.65, y: origin.y + 0.9, z: origin.z + Math.cos(orbit) * 2.65 }, target: { x: origin.x, y: origin.y + 0.33, z: origin.z } };
      rt.camera.snap = true;
    }, orbit);
    await render();
    await page.screenshot({ path: path.join(out, `rest-oblique-${orbit < 0 ? 'left' : 'right'}.png`) });
    await page.evaluate(async orbit => {
      const { rt } = await import('/src/game/runtime.ts');
      window.__at.set({ view: 'room', tankId: null });
      rt.camera.shot = null; rt.camera.orbit = orbit; rt.camera.snap = true;
    }, orbit);
    await render();
    await page.screenshot({ path: path.join(out, `rest-orbit-${orbit < 0 ? 'left' : 'right'}.png`) });
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ viewport: [1366, 768], renderer: 'SwiftShader', captures: manifest, errors }, null, 2));
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors, null, 2));
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`Eel review: ${out}`);
} catch (error) {
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify({ error: String(error), browser: errors }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  fs.rmSync(path.join(root, 'debug.log'), { force: true });
  fs.rmSync(path.join(out, 'chromium-debug.log'), { force: true });
}
