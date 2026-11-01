// Self-contained visual evidence: node scripts/octopus-review.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp/octopus-review');
const base = 'http://127.0.0.1:5320';
fs.mkdirSync(out, { recursive: true });
let server;
let browser;
const errors = [];
const captures = {};
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
    const tank = { id: 'octopus-tank', type: 'cave', slot: 'A', food: 100, clean: 100, fish: [{ id: 'octopus-review', species: 'octopus' }], decor: [], upgrades: { filter: false, lamp: false }, light: 'blue' };
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
  for (let i = 0; i < 60; i++) {
    await render();
    if (await page.evaluate(async () => (await import('/src/game/runtime.ts')).rt.fish.has('octopus-review'))) break;
    if (i === 59) throw Error('Octopus fixture did not initialise');
    await page.waitForTimeout(25);
  }
  await page.evaluate(async () => {
    window.__at.visitors(false);
    window.__at.set({ view: 'tank', tankId: 'octopus-tank', hall: 0, panel: null, fishTalk: null, line: null });
    (await import('/src/game/runtime.ts')).rt.freezeFish = true;
  });

  // Step the production pure controller at exact times. Geometry, shader,
  // terrain, lighting, occlusion and camera are the real gameplay scene.
  async function setup(kind = 'walking') {
    await page.evaluate(async kind => {
      const { rt } = await import('/src/game/runtime.ts');
      const { TANKS, SAND_H } = await import('/src/game/data/tanks.ts');
      const { SPECIES } = await import('/src/game/data/fish.ts');
      const { stepBehavior } = await import('/src/game/logic/behavior.ts');
      const { tankFishBounds, floorAt } = await import('/src/game/logic/swim.ts');
      const { octopusTap } = await import('/src/game/logic/octopusRig.ts');
      const f = rt.fish.get('octopus-review'), def = SPECIES.octopus, tank = TANKS.cave;
      delete f.octopus;
      f.mode = 'rest'; f.modeTimer = 100; f.phase = 1; f.yaw = 0; f.tapT0 = -10; f.eatT0 = -10; f.happyT0 = -10;
      const bounds = tankFishBounds(tank, SAND_H, def);
      const env = { tank, bounds, columns: tank.rocks, others: [], speedMul: 1, attract: null, depthBias: 0, denIndex: 0, phase: 1, yaw: 0 };
      Object.assign(f.s, { x: 0.05, y: bounds.min.y, z: 0.13, vx: 0, vy: 0, vz: 0, tx: 0.05, ty: bounds.min.y, tz: 0.13, burst: 0, wait: 0 });
      if (kind === 'resting-rock') Object.assign(f.s, { x: 0.66, z: 0.03, tx: 0.66, tz: 0.03 });
      if (kind === 'den-lip') Object.assign(f.s, { x: -0.62, y: 0.28, z: bounds.min.z, tx: -0.62, ty: 0.28, tz: bounds.min.z });
      if (kind === 'climbing') {
        Object.assign(f.s, { x: -0.08, y: 0.32, z: bounds.min.z, tx: -0.08, ty: 0.58, tz: bounds.min.z });
        f.mode = 'climb';
      }
      if (kind === 'walking' || kind.startsWith('tap-') || kind === 'close-up') {
        f.s.y = floorAt(f.s.x, f.s.z, bounds, env.columns, def.radius);
        f.mode = 'move'; env.attract = { x: 0.55, y: bounds.min.y, z: 0.15 };
      }
      stepBehavior(f.s, f, def, env, 1 / 60, () => 0.5);
      window.__octopusReview = { f, env, def, stepBehavior, octopusTap, elapsed: 0, kind };
      if (!f.octopus) throw Error('Production behavior did not create an octopus rig');
    }, kind);
    await camera(kind === 'climbing' ? 'climbing' : kind === 'resting-rock' ? 'rock' : 'close');
    for (let i = 0; i < 8; i++) await render();
  }
  async function camera(kind) {
    await page.evaluate(async kind => {
      const { rt } = await import('/src/game/runtime.ts');
      const { tankOrigin } = await import('/src/game/world.ts');
      const o = tankOrigin('A'), f = window.__octopusReview.f;
      let offset = { x: 0.24, y: 0.58, z: 1.1 };
      if (kind === 'underside') offset = { x: 0.35, y: 0.08, z: 0.83 };
      if (kind === 'climbing') offset = { x: 0.35, y: 0.22, z: 1.08 };
      if (kind === 'rock') offset = { x: -0.22, y: 0.5, z: 1.2 };
      const target = { x: o.x + f.s.x, y: o.y + f.s.y + 0.015, z: o.z + f.s.z };
      rt.camera.shot = { pos: { x: target.x + offset.x, y: target.y + offset.y, z: target.z + offset.z }, target };
      rt.camera.snap = true;
    }, kind);
    await render();
  }
  async function advance(seconds) {
    return page.evaluate(seconds => {
      const r = window.__octopusReview;
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        r.env.phase += 1 / 60; r.elapsed += 1 / 60;
        r.stepBehavior(r.f.s, r.f, r.def, r.env, 1 / 60, () => 0.5);
      }
      const rig = r.f.octopus;
      let nearestDen = Infinity, nearestRock = Infinity;
      for (const arm of rig.arms) {
        for (const den of r.env.tank.dens) nearestDen = Math.min(nearestDen, Math.hypot(arm.tip.x - den.x, arm.tip.y - den.y, arm.tip.z - den.z));
        for (const col of r.env.columns) nearestRock = Math.min(nearestRock, Math.abs(Math.hypot(arm.tip.x - col.x, arm.tip.z - col.z) - col.r));
      }
      return { elapsed: r.elapsed, mode: r.f.mode, position: { x: r.f.s.x, y: r.f.s.y, z: r.f.s.z }, reaction: rig.reaction, reactionTime: rig.reactionTime, nearestDen, nearestRock,
        arms: rig.arms.map((arm, index) => ({ index, state: arm.state, tip: { ...arm.tip }, target: { ...arm.target } })), rig: Array.from(rig.rig) };
    }, seconds);
  }
  async function markers(show) {
    await page.evaluate(async show => {
      document.getElementById('octopus-tip-markers')?.remove();
      if (!show) return;
      // A plain text key: the frames themselves show the tips.
      const rig = window.__octopusReview.f.octopus;
      const overlay = document.createElement('div');
      overlay.id = 'octopus-tip-markers';
      overlay.style.cssText = 'position:fixed;left:24px;top:88px;padding:8px 12px;border-radius:8px;background:#102a35e8;color:white;font:15px system-ui;pointer-events:none;z-index:10000';
      overlay.textContent = rig.arms.map(arm => arm.state[0]).join(' ') + '  (s = planted)';
      document.body.appendChild(overlay);
    }, show);
  }
  async function capture(name, state = null, tips = false) {
    await render();
    await markers(tips);
    const png = await page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });
    await markers(false);
    captures[name] = { path: `${name}.png`, state: state ?? await advance(0), plantedTipOverlay: tips };
    return png;
  }
  async function seek(label, accept, limit = 12) {
    let state = await advance(0);
    for (let i = 0; i < limit * 20; i++) {
      if (accept(state)) return state;
      state = await advance(0.05);
    }
    throw Error(`No ${label} reached: ${JSON.stringify(state)}`);
  }

  console.log('Capturing planted walking sequence');
  await setup('walking');
  const frames = [];
  for (let i = 0; i < 5; i++) {
    const state = await advance(i ? 0.24 : 0.15);
    frames.push(await capture(`walking-${i}`, state, true));
  }
  const sheet = await browser.newPage({ viewport: { width: 1366 * frames.length, height: 768 }, deviceScaleFactor: 1 });
  await sheet.setContent(`<style>*{margin:0}body{display:flex}img{width:1366px;height:768px}</style>${frames.map(png => `<img src="data:image/png;base64,${png.toString('base64')}">`).join('')}`);
  await sheet.screenshot({ path: path.join(out, 'walking-strip.png') });
  await sheet.close();
  captures['walking-strip'] = { path: 'walking-strip.png', sourceFrames: frames.map((_, i) => `walking-${i}.png`) };

  console.log('Capturing arms and sucker close-up');
  await setup('close-up');
  await advance(0.3);
  await camera('underside');
  await capture('arms-and-suckers');

  console.log('Capturing procedural contacts');
  await setup('resting-rock');
  await capture('resting-against-rock', await seek('resting rock contact', state => state.arms.some(arm => arm.state === 'curl' || arm.state === 'reach') && state.nearestRock < 0.04));
  await setup('den-lip');
  await capture('arm-at-den-lip', await seek('arm at den lip', state => state.nearestDen < 0.07));
  await setup('climbing');
  await capture('climbing-rock-face', await seek('climbing stance', state => state.mode === 'climb' && state.arms.filter(arm => arm.state === 'stance').length >= 3), true);

  for (const reaction of ['raise', 'colour', 'curl', 'look']) {
    console.log(`Capturing tap ${reaction}`);
    await setup(`tap-${reaction}`);
    await advance(0.2);
    await page.evaluate(reaction => { const r = window.__octopusReview; r.octopusTap(r.f.octopus, reaction); }, reaction);
    await capture(`tap-${reaction}`, await advance(0.18));
  }
  console.log('Capturing gameplay room view');
  await setup('walking');
  await advance(0.5);
  await page.evaluate(async () => {
    const { rt } = await import('/src/game/runtime.ts');
    window.__at.set({ view: 'room', tankId: null });
    rt.camera.shot = null; rt.camera.orbit = 0; rt.camera.zoom = 1; rt.camera.snap = true;
  });
  for (let i = 0; i < 12; i++) await render();
  await capture('gameplay-room');
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ viewport: [1366, 768], renderer: 'SwiftShader', captures, errors }, null, 2));
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors, null, 2));
  if (errors.length) throw Error(errors.join('\n'));
  console.log(`Octopus review: ${out}`);
} catch (error) {
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ viewport: [1366, 768], renderer: 'SwiftShader', captures, errors }, null, 2));
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify({ error: String(error), browser: errors }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  fs.rmSync(path.join(root, 'debug.log'), { force: true });
  fs.rmSync(path.join(out, 'chromium-debug.log'), { force: true });
}
