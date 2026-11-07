import { expect, test, type Page } from "@playwright/test";
import { newRushState } from "../../src/game/rush/types";
import { boot, hook, playing, shot } from "./helpers";

// Visual capture only (SHOTS=1): the rush crowd, the awards panel and the cabinet with rewards.
const SAVE = {
  v: 3,
  model: {
    coins: 500,
    tanks: [
      { id: "t1", type: "small", slot: "A", fish: [{ id: "f1", species: "clownfish" }], decor: [], food: 90, clean: 90 },
      { id: "t2", type: "big", slot: "B", fish: [{ id: "f2", species: "bluetang" }], decor: [], food: 90, clean: 90 }
    ],
    inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 8, tutorial: "done", hallOpen: true, star: true, superStar: true, freePlay: true, fedOnce: true, cleanedOnce: true, counted: true, hearts: 8, said: [], firstFish: "clownfish" },
    stats: { coinsEarned: 100, helped: 6, fishBought: 2, seconds: 900 },
    nextId: 10, paid: [],
    rush: {
      ...newRushState(), unlocked: true, introSeen: true, untilNext: 600,
      stats: { events: 26, bronze: 6, silver: 8, gold: 12, successes: 26, best: "gold", bestReady: 2 },
      rewards: ["cabinet", "bronzeDisplay", "floorPattern", "goldSign", "bubbleFountain", "bench", "sharkStatue"]
    }
  }
};

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
  return errors;
}

test("rush crowd, awards panel and cabinet", async ({ page }) => {
  const errors = await setup(page);
  await shot(page, "visual-cabinet-all");
  await page.getByTestId("btn-rush-awards").click();
  await expect(page.getByTestId("rush-awards")).toBeVisible();
  await shot(page, "visual-awards");
  await page.getByTestId("rush-awards-close").click();
  await hook(page, "rushUntilNext", 0);
  await hook(page, "rushAdvance", 1);
  await page.getByTestId("rush-start").click();
  await hook(page, "rushRemaining", 0);
  await hook(page, "rushAdvance", 1);
  await page.waitForTimeout(9000);
  await shot(page, "visual-crowd-9s");
  await page.waitForTimeout(12000);
  await shot(page, "visual-crowd-21s");
  expect(errors).toEqual([]);
});
