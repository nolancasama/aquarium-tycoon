import { expect, test, type Page } from "@playwright/test";
import { CROWD_TIERS } from "../../src/game/rush/config";
import { newRushState, type RushState } from "../../src/game/rush/types";
import { afterOpeningLine, boot, hook, playing, shot, state } from "./helpers";

/** A live (real-time) visitor rush: crowd size, cap, groups, frame rate and cleanup. */
const tank = (id: string, type: string, slot: string, species: string) =>
  ({ id, type, slot, fish: [{ id: `${id}f`, species }], decor: [], food: 90, clean: 90 });
const SAVE = {
  v: 3,
  model: {
    coins: 500,
    tanks: [tank("t1", "small", "A", "clownfish"), tank("t2", "big", "B", "bluetang"), tank("t3", "small", "C", "clownfish"), tank("t4", "big", "D", "bluetang")],
    inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 8, tutorial: "done", hallOpen: true, star: true, superStar: true, freePlay: true, fedOnce: true, cleanedOnce: true, counted: true, hearts: 8, said: [], firstFish: "clownfish" },
    stats: { coinsEarned: 100, helped: 6, fishBought: 2, seconds: 900 },
    nextId: 10, paid: [],
    rush: { ...newRushState(), unlocked: true, introSeen: true, untilNext: 600, rewards: ["cabinet"] }
  }
};

type Crowd = { active: number; cosmetic: number; tier: string; maxVisitors: number; reactionTimers: number; trackedCosmetics: number };
const crowd = async (page: Page) => (await state(page) as unknown as { crowd: Crowd }).crowd;
const rush = (page: Page) => hook<RushState>(page, "rushState");

test("a live rush fills the halls in groups, stays under the active cap and leaves nobody behind", async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript((save) => {
    if (sessionStorage.getItem("crowd-seeded")) return;
    sessionStorage.setItem("crowd-seeded", "1");
    localStorage.setItem("at.save.v1", JSON.stringify(save));
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, japanese: true, music: 0, sfx: 0, audioSetupDone: true }));
  }, SAVE);
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  await playing(page);
  await afterOpeningLine(page);
  await hook(page, "visitors", false); // only the crowd: no English requests to answer
  await hook(page, "rushUntilNext", 0);
  await hook(page, "rushAdvance", 1);
  await page.getByTestId("rush-start").click();
  await hook(page, "rushRemaining", 0);
  await hook(page, "rushAdvance", 1);
  expect((await rush(page)).phase).toBe("rush");
  const coins = (await state(page)).coins;

  // Frame times over the whole rush, from the page itself.
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = [];
    let last = performance.now();
    const loop = (t: number) => { w.__frames.push(t - last); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const samples: { t: number; active: number; cosmetic: number; max: number; tier: string }[] = [];
  let lastCosmetic = 0;
  const t0 = Date.now();
  while ((await rush(page)).phase === "rush" && Date.now() - t0 < 120_000) {
    const c = await crowd(page);
    samples.push({ t: Math.round((Date.now() - t0) / 1000), active: c.active, cosmetic: c.cosmetic, max: c.maxVisitors, tier: c.tier });
    // Never above the cap of the active tier (leavers may still be walking out after a tier drop).
    expect(c.active).toBeLessThanOrEqual(CROWD_TIERS.good);
    // Arrivals come in groups, not one by one or all at once.
    if (c.cosmetic > lastCosmetic) expect(c.cosmetic - lastCosmetic).toBeLessThanOrEqual(8);
    lastCosmetic = c.cosmetic;
    if (samples.length === 8) await shot(page, "crowd-full");
    await page.waitForTimeout(5000);
  }
  const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice(5));
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  const sorted = [...frames].sort((a, b) => a - b);
  console.log(JSON.stringify({ samples, fps: Math.round(1000 / mean), p95ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]) }));
  // Ordinary visitors are off here; their 3 reserved places stay empty.
  const peak = Math.max(...samples.map((s) => s.cosmetic));
  // Software rendering in CI is far below 30 fps: the governor must have noticed.
  if (1000 / mean < 20) expect(samples.at(-1)!.tier).not.toBe("good");
  // The governor may cut a slow software renderer to 12; it must still look busy.
  expect(peak).toBeGreaterThanOrEqual(CROWD_TIERS.low - 4); // even the lowest tier looks busy

  await expect(page.getByTestId("rush-results")).toBeVisible();
  expect((await state(page)).coins - coins).toBe((await rush(page)).event!.result!.bonus); // cosmetics never tip
  await page.getByTestId("rush-continue").click();
  await expect.poll(async () => (await crowd(page)).cosmetic, { timeout: 90_000 }).toBe(0);
  const after = await crowd(page);
  expect(after.trackedCosmetics).toBe(0);
  expect(after.reactionTimers).toBe(0);
  expect(errors).toEqual([]);
});
