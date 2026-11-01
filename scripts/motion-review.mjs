// Gameplay-camera motion evidence, SwiftShader. Run against npm run dev.
// node scripts/motion-review.mjs http://localhost:5320 motion [before|after] [slots]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const [base = 'http://localhost:5320', part = 'motion', label = 'after', slots = 'ABCDEFGH'] = process.argv.slice(2);
if (part !== 'motion' || !['before', 'after'].includes(label)) throw Error('Use motion before|after');
const out = path.resolve('.tmp/motion-review', label);
fs.mkdirSync(out, { recursive: true });
const stub = fs.readFileSync('tests/e2e/stubs.ts', 'utf8');
let id = 1;
const tank = (type, slot, species) => ({ id: `t${id++}`, type, slot, food: 100, clean: 100, fish: species.map(species => ({ id: `f${id++}`, species })), decor: [], upgrades: { filter: false, lamp: false }, light: 'blue' });
const tanks = [tank('cave', 'A', ['crab', 'octopus', 'eel', 'goby']), tank('big', 'B', ['crab', 'clownfish', 'bluetang', 'yellowfish', 'pufferfish']), tank('ocean', 'C', ['crab', 'octopus', 'stingray', 'turtle']), tank('panorama', 'D', ['crab', 'chromis', 'angelfish']), tank('hex', 'E', ['seahorse', 'goby']), tank('cylinder', 'F', ['moonjelly', 'spottedjelly', 'seanettle']), tank('cylinder', 'G', ['moonjelly']), tank('tall', 'H', ['jellyfish'])];
const model = { coins: 999, tanks, inv: { fish: [], decor: [], tanks: [] }, progress: { stage: 8, tutorial: 'done', firstFish: 'clownfish', fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, superStar: true, galleryOpen: true, said: ['orangePlease','feedFish'] }, stats: { coinsEarned: 300, helped: 10, fishBought: 30, seconds: 1500 }, nextId: id, paid: [] };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log('navigation', frame.url()); });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(stub.slice(stub.indexOf('`') + 1, stub.lastIndexOf('`')));
await page.addInitScript(save => {
  localStorage.setItem('at.save.v1', JSON.stringify(save));
  localStorage.setItem('at.settings.v1', JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
}, { v: 3, model });
const epoch = new Date('2026-11-01T00:00:00Z');
await page.clock.install({ time: epoch });
await page.clock.pauseAt(epoch);
const call = (name, ...args) => page.evaluate(([n,a]) => window.__at[n](...a), [name,args]);
const step = async ms => { for (let i=0;i<ms;i+=100) await page.clock.fastForward(Math.min(100,ms-i)); };
const perf = {};
async function shot(name) { await page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' }); }
try {
  await page.goto(`${base}?e2e=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__at));
  // Vite can reload once after its initial dependency optimization. Let that
  // navigation finish before Continue; otherwise it can reset the test save.
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => Boolean(window.__at));
  await page.getByTestId('btn-continue').dispatchEvent('click');
  await call('visitors', false);
  await step(800);
  await page.waitForFunction(() => Boolean(window.__at));
  if ((await call('state')).line) {
    await page.keyboard.press('Space');
    await step(300);
  }
  if ((await call('state')).tanks.length !== 8) throw Error('Fixture did not load all eight tanks');
  for (let hall=0;hall<3;hall++) {
    await call('set', { view: 'room', tankId: null, hall, panel: null, fishTalk: null });
    await step(2400);
    perf[`hall${hall}`] = (await call('state')).perf;
    await shot(`hall-${hall}`);
  }
  if (label === 'after') for (let i=0;i<tanks.length;i++) {
    const t = tanks[i], hall = i<2 ? 0 : i<5 ? 1 : 2;
    if (!slots.includes(t.slot)) continue;
    await call('set', { view: 'tank', tankId: t.id, hall, panel: null, fishTalk: null });
    await step(2400);
    for (let phase=0;phase<3;phase++) {
      await step(phase === 0 ? 100 : 430);
      await shot(`${t.slot}-${t.type}-phase-${phase}`);
    }
    if (t.type === 'cave') {
      const f = t.fish.find(f => f.species === 'octopus');
      const p = await call('where', 'fish', f.id);
      await page.mouse.click(p.x,p.y);
      await step(100);
      const reacted = await page.evaluate(async id => {
        const {rt} = await import('/src/game/runtime.ts');
        const f=rt.fish.get(id);
        return f && rt.time-f.tapT0 < .3 && f.s.burst>0;
      }, f.id);
      if (!reacted) throw Error('The gameplay octopus tap did not trigger its reaction');
      await shot('octopus-tap');
      await step(450);
      await shot('octopus-jet');
    }
  }
  fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify(perf,null,2));
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors,null,2));
  console.log(JSON.stringify({ out, perf, errors }));
  if (errors.length) throw Error(errors.join('\n'));
} catch (error) {
  fs.writeFileSync(path.join(out,'errors.json'),JSON.stringify(errors,null,2));
  console.log('capture errors',errors);
  throw error;
} finally { await browser.close(); }
