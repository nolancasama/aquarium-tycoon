// Controller review artifacts only. Does not run the acceptance/browser suite.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const out = new URL('../test-results/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const capture = await page.context().newCDPSession(page);
await page.clock.install();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const stubs = await fs.readFile(new URL('./e2e/stubs.ts', import.meta.url), 'utf8');
await page.addInitScript(stubs.slice(stubs.indexOf('`') + 1, stubs.lastIndexOf('`')));
await page.addInitScript(() => localStorage.setItem('at.settings.v1', JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true })));
// Continue a calm completed save so New Game's deferred tutorial cannot move
// the camera out of the coast after the review setup selects it.
await page.addInitScript(() => localStorage.setItem('at.save.v1', JSON.stringify({ v: 3, model: {
  coins: 1000, inv: { fish: [], decor: [], tanks: [] }, tanks: [
    { id: 't1', type: 'small', slot: 'A', food: 90, clean: 95, fish: [{ id: 'f2', species: 'clownfish' }], decor: [], upgrades: { filter: false, lamp: false } },
    { id: 't3', type: 'ocean', slot: 'C', food: 90, clean: 95, fish: [{ id: 'f4', species: 'turtle' }], decor: [], upgrades: { filter: false, lamp: false } },
    { id: 't5', type: 'cylinder', slot: 'G', food: 90, clean: 95, fish: [{ id: 'f6', species: 'moonjelly' }], decor: [], upgrades: { filter: false, lamp: false } },
    { id: 't7', type: 'reef', slot: 'I', food: 90, clean: 95, fish: [{ id: 'f8', species: 'clownfish' }, { id: 'f9', species: 'bluetang' }, { id: 'f10', species: 'yellowfish' }, { id: 'f11', species: 'angelfish' }], decor: [], upgrades: { filter: false, lamp: false } },
    { id: 't12', type: 'sharks', slot: 'L', food: 90, clean: 95, fish: [{ id: 'f13', species: 'blacktip' }, { id: 'f14', species: 'eagleray' }, { id: 'f15', species: 'zebrashark' }], decor: [], upgrades: { filter: false, lamp: false } }
  ], nextId: 100, paid: [],
  progress: { stage: 8, tutorial: 'done', firstFish: 'clownfish', fedOnce: true, cleanedOnce: true, counted: true,
    hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
    atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [], hubIntroSeen: true,
    tunnelOpen: true, tunnelIntroSeen: true, coastIntroSeen: true,
    tunnel: { milestone: 5, observed: 9, helped: 3, findDone: true, whereDone: true, countDone: true, trophy: true } },
  rush: { unlocked: true, introSeen: true, phase: 'waiting', untilNext: 900, pendingFor: 0, event: null, lastCommitted: null,
    stats: { events: 0, bronze: 0, silver: 0, gold: 0, successes: 0, best: null, bestReady: 0 }, rewards: [] },
  stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }
} })));
const call = (name, ...args) => page.evaluate(([method, values]) => window.__at[method](...values), [name, args]);
async function precondition(label, predicate, timeout = 45000) {
  console.log(`Waiting: ${label}`);
  try { await page.waitForFunction(predicate, undefined, { timeout }); }
  catch { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`); }
}
const frames = [];
async function shot(name, select) {
  // Stop browser time before saving a frame: SwiftShader screenshots can take
  // longer than a dive. State and pixels must describe the same motion sample.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const state = await call('coast'), subject = select?.(state);
  if (select && !subject) { await page.clock.resume(); return false; }
  // Capture the compositor directly: Playwright's screenshot preparation can
  // wait on animation frames while the review clock is deliberately paused.
  const { data } = await capture.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile(new URL(name + '.png', out), Buffer.from(data, 'base64'));
  frames.push({ name, state, subject: subject?.id, camera: (await call('state')).camera });
  await page.clock.resume();
  return true;
}
async function motionFrames(label, id, interval = 0.35) {
  for (let i = 0; i < 3; i++) {
    const start = (await call('coast')).time;
    await page.waitForFunction(({ start, interval }) => window.__at.coast().time >= start + interval, { start, interval });
    await shot(`penguin-coast-${label}-${i + 1}`);
    frames[frames.length - 1].subject = id;
  }
}
try {
  await page.goto(process.env.COAST_CAPTURE_URL ?? 'http://127.0.0.1:5326/?e2e=1&fast=1&seed=9');
  await page.getByTestId('btn-continue').click();
  await precondition('game initialized', () => window.__at?.state().screen === 'game');
  await call('coastTo', 5);
  await call('visitors', false);
  await call('set', { hall: 6, view: 'room', tankId: null, panel: null, coastView: 'penguins' });
  for (let i = 0; i < 20; i++) {
    const state = await call('state');
    if (!state.line) break;
    // Fast-mode speech may dismiss this optional dialogue between two tool calls.
    await page.evaluate(() => document.querySelector('[data-testid="next"]')?.click());
  }
  await page.getByTestId('coast-view-penguins').click();
  await precondition('Penguins camera settled', () => {
    const c = window.__at.state().camera;
    return c && Math.abs(c.pos.y - 11.9) < 0.03 && Math.abs(c.pos.x + 148.1) < 0.03 && Math.abs(c.pos.z + 30.3) < 0.04 && window.__at.coast().animals.length >= 3;
  });
  await shot('penguin-coast-penguins');
  await page.getByTestId('coast-view-underwater').click();
  await precondition('Underwater camera settled', () => Math.abs(window.__at.state().camera.pos.y + 0.5) < 0.03);
  await shot('penguin-coast-underwater');
  let divingCaptured = false;
  for (let attempt = 0; attempt < 3 && !divingCaptured; attempt++) {
    await precondition('a visible penguin diving in open water', () => {
      const c = window.__at.coast();
      return c.animals.some((a) => a.mode === 'swim' && Math.abs(a.x) < 6 && a.z > 3 && a.y < 0.6 &&
        c.motion.some((m) => m.id === a.id && m.pitch < -0.25 && m.speed > 0.2));
    }, 180000);
    divingCaptured = await shot('penguin-coast-diving', (c) => c.animals.find((a) => a.mode === 'swim' && Math.abs(a.x) < 6 && a.z > 3 && a.y < 0.6 && c.motion.some((m) => m.id === a.id && m.pitch < -0.25 && m.speed > 0.2)));
  }
  if (!divingCaptured) throw new Error('HARNESS_PRECONDITION_FAILED: diving frame held for capture');
  await motionFrames('dive-motion', frames[frames.length - 1].subject);
  await page.getByTestId('coast-view-penguins').click();
  await precondition('Penguins camera returned', () => Math.abs(window.__at.state().camera.pos.y - 11.9) < 0.03);
  await precondition('penguin climbing the ramp above the waterline', () => window.__at.coast().animals.some((a) => a.mode === 'rampUp' && a.y > 2.02 && a.y < 2.28), 180000);
  if (!await shot('penguin-coast-climbing', (c) => c.animals.find((a) => a.mode === 'rampUp' && a.y > 2.02 && a.y < 2.28))) throw new Error('HARNESS_PRECONDITION_FAILED: climbing frame held for capture');
  await motionFrames('climb-motion', frames[frames.length - 1].subject);
} finally {
  const lastState = await call('state').catch(() => null), lastCoast = await call('coast').catch(() => null);
  await fs.writeFile(new URL('penguin-coast-frames.json', out), JSON.stringify({ errors, frames, lastState, lastCoast }, null, 2));
  await browser.close();
}
console.log(`Captured ${frames.length} coast frames; page errors: ${errors.length}`);
