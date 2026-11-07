import { expect, test, type Page } from "@playwright/test";
import { BONUS_BASE, BONUS_CAP, BONUS_PER_TANK, NEXT_DELAY } from "../../src/game/rush/config";
import { newRushState, type RushState } from "../../src/game/rush/types";
import { boot, hook, playing, shot, state } from "./helpers";

const SAVE = {
  v: 3,
  model: {
    coins: 500,
    tanks: [
      { id: "t1", type: "small", slot: "A", fish: [{ id: "f1", species: "clownfish" }], decor: [], food: 40, clean: 20 },
      { id: "t2", type: "big", slot: "B", fish: [{ id: "f2", species: "bluetang" }], decor: [], food: 40, clean: 20 }
    ],
    inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 8, tutorial: "done", hallOpen: true, star: true, superStar: true, freePlay: true, fedOnce: true, cleanedOnce: true, counted: true, hearts: 8, said: [], firstFish: "clownfish" },
    stats: { coinsEarned: 100, helped: 6, fishBought: 2, seconds: 900 },
    nextId: 10, paid: [],
    rush: { ...newRushState(), unlocked: true, introSeen: true, untilNext: 600, rewards: ["cabinet"] }
  }
};

const rush = (page: Page) => hook<RushState>(page, "rushState");

async function setup(page: Page) {
  await page.addInitScript((save) => {
    if (sessionStorage.getItem("rush-seeded")) return;
    sessionStorage.setItem("rush-seeded", "1");
    localStorage.setItem("at.save.v1", JSON.stringify(save));
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, japanese: true, music: 0, sfx: 0, audioSetupDone: true }));
  }, SAVE);
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  await playing(page);
  await hook(page, "visitors", false);
  return errors;
}

async function due(page: Page) {
  await hook(page, "rushUntilNext", 0);
  await hook(page, "rushAdvance", 1);
  await expect(page.getByTestId("rush-pending")).toBeVisible();
  expect((await rush(page)).phase).toBe("pending");
}

async function start(page: Page) {
  await due(page);
  await page.getByTestId("rush-start").click();
  await expect(page.getByTestId("rush-widget")).toBeVisible();
  expect((await rush(page)).phase).toBe("prep");
}

async function finishPhase(page: Page) {
  await hook(page, "rushRemaining", 0);
  await hook(page, "rushAdvance", 1);
}

async function prepareTanks(page: Page) {
  for (const id of ["t1", "t2"]) {
    await page.getByTestId("rush-checklist-open").click();
    await expect(page.getByTestId("rush-checklist")).toBeVisible();
    await expect(page.getByTestId(`rush-tank-${id}`)).toContainText("Needs food + cleaning");
    await page.getByTestId(`rush-tank-${id}`).click();
    await expect(page.getByTestId("rush-checklist")).toBeHidden();
    await expect.poll(async () => (await state(page)).tankId).toBe(id);
    // Exercise the normal care actions, including their normal animation/reward path.
    await page.getByTestId("btn-feed").click();
    await page.getByTestId("btn-clean").click();
    await expect.poll(async () => (await rush(page)).event?.ready.includes(id)).toBe(true);
  }
}

test("preparation, medal and bonus survive results reload without a second payment", async ({ page }) => {
  const errors = await setup(page);
  await start(page);
  await prepareTanks(page);
  await expect(page.getByTestId("rush-ready-count")).toContainText("2/2");
  await shot(page, "rush-prepared");
  const coinsBefore = (await state(page)).coins;
  await finishPhase(page);
  expect((await rush(page)).phase).toBe("rush");
  await expect(page.getByTestId("rush-widget")).toContainText("RUSH HOUR!");
  await expect(page.getByTestId("rush-medal-preview")).toContainText("Gold shark");
  await shot(page, "rush-crowd");
  await finishPhase(page);
  await expect(page.getByTestId("rush-results")).toBeVisible();
  await expect(page.getByTestId("rush-result-medal")).toHaveAttribute("data-medal", "gold");
  await expect(page.getByTestId("rush-result-ready")).toContainText("2/2");
  const bonus = Math.min(BONUS_CAP, BONUS_BASE + BONUS_PER_TANK * 2);
  await expect(page.getByTestId("rush-result-bonus")).toContainText(`+${bonus}`);
  expect((await state(page)).coins).toBe(coinsBefore + bonus);
  const committed = await rush(page);
  expect(committed.stats.events).toBe(1);
  expect(committed.stats.gold).toBe(1);
  await shot(page, "rush-gold-results");

  // pagehide saves the displayed result; loading it must display only, never award.
  await page.reload();
  await page.getByTestId("btn-continue").click();
  await hook(page, "visitors", false);
  await expect(page.getByTestId("rush-results")).toBeVisible();
  expect((await state(page)).coins).toBe(coinsBefore + bonus);
  expect((await rush(page)).lastCommitted).toBe(committed.lastCommitted);
  await hook(page, "rushAdvance", 2);
  expect((await state(page)).coins).toBe(coinsBefore + bonus);
  expect((await rush(page)).stats.events).toBe(1);
  await page.getByTestId("rush-continue").click();
  await expect(page.getByTestId("rush-results")).toBeHidden();
  const waiting = await rush(page);
  expect(waiting.phase).toBe("waiting");
  expect(waiting.untilNext).toBeGreaterThanOrEqual(NEXT_DELAY[0] - 2);
  expect(waiting.untilNext).toBeLessThanOrEqual(NEXT_DELAY[1]);
  await page.getByTestId("btn-rush-awards").click();
  await expect(page.getByTestId("rush-awards")).toContainText("Gold shark");
  await expect(page.getByTestId("rush-awards")).toContainText("Golden shark sign");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("pending and preparation can both be skipped without a result or penalty", async ({ page }) => {
  const errors = await setup(page);
  const coins = (await state(page)).coins;
  await due(page);
  await page.getByTestId("rush-skip").click();
  expect((await rush(page)).phase).toBe("waiting");
  await expect(page.getByTestId("rush-start")).toHaveCount(0);
  await start(page);
  await page.getByTestId("rush-skip").click();
  const after = await rush(page);
  expect(after.phase).toBe("waiting");
  expect(after.event).toBeNull();
  expect(after.stats.events).toBe(0);
  expect(after.untilNext).toBeGreaterThanOrEqual(NEXT_DELAY[0] - 2);
  expect(after.untilNext).toBeLessThanOrEqual(NEXT_DELAY[1]);
  expect((await state(page)).coins).toBe(coins);
  await expect(page.getByTestId("rush-results")).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function layout(page: Page, id: string, controls: string[]) {
  const viewport = page.viewportSize()!;
  const card = page.getByTestId(id);
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + .5);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + .5);
  for (const other of controls) {
    const element = page.getByTestId(other);
    if (!(await element.isVisible())) continue;
    const b = (await element.boundingBox())!;
    const overlaps = box.x < b.x + b.width - 1 && b.x < box.x + box.width - 1 && box.y < b.y + b.height - 1 && b.y < box.y + box.height - 1;
    expect(overlaps, `${id} overlaps ${other}`).toBe(false);
  }
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
  test.describe(`Rush Hour layout ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("banner, widget, checklist, results and Continue fit around the HUD", async ({ page }) => {
      const errors = await setup(page);
      const controls = ["player-status", "btn-settings", "btn-help", "btn-rush-awards", "btn-fish-shop", "btn-animal-shop", "btn-decor-shop", "btn-tank-shop", "btn-hall-next", "btn-hall-prev", "btn-objectives"];
      await due(page);
      await layout(page, "rush-pending", controls);
      await shot(page, `rush-${viewport.width}-pending`);
      await page.getByTestId("rush-start").click();
      await layout(page, "rush-widget", controls);
      await shot(page, `rush-${viewport.width}-prep`);
      await page.getByTestId("rush-checklist-open").click();
      await layout(page, "rush-checklist", controls);
      await shot(page, `rush-${viewport.width}-checklist`);
      await page.getByTestId("rush-checklist-close").click();
      // A perfect result has the largest first-event reward section.
      await prepareTanks(page);
      await finishPhase(page);
      await finishPhase(page);
      await layout(page, "rush-results", controls);
      const button = page.getByTestId("rush-continue");
      await expect(button).toBeInViewport({ ratio: 1 });
      const buttonBox = (await button.boundingBox())!;
      expect(buttonBox.height).toBeGreaterThanOrEqual(56);
      await shot(page, `rush-${viewport.width}-results`);
      await button.click();
      expect((await rush(page)).phase).toBe("waiting");
      expect(errors).toEqual([]);
    });
  });
}
