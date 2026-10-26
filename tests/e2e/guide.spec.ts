import { expect, test, type Page } from "@playwright/test";
import { HALL_PRICE } from "../../src/game/data/tanks";
import { SPECIES } from "../../src/game/data/fish";
import { boot, click3d, hook, playing, settle, shot, state, waitFor } from "./helpers";
import { reply } from "./flows";

/** The same starred Level 6 starting point as Phase 2, before opening the hall. */
const LEVEL_SIX = {
  v: 2,
  model: {
    coins: 400,
    tanks: [
      { id: "t1", type: "small", slot: "A", fish: [{ id: "f2", species: "clownfish" }, { id: "f3", species: "bluetang" }], decor: [{ id: "d4", kind: "plant", variant: "small", slot: 0 }], food: 100, clean: 100 },
      { id: "t5", type: "big", slot: "B", fish: [{ id: "f6", species: "clownfish" }], decor: [{ id: "d7", kind: "shell", variant: null, slot: 0 }, { id: "d8", kind: "coral", variant: "red", slot: 4 }], food: 100, clean: 100 }
    ],
    inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 6, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, helpedInStage: 0, photo: true, star: true, freePlay: true, said: ["orangePlease", "feedFish"] },
    stats: { coinsEarned: 300, helped: 10, fishBought: 3, seconds: 1500 },
    nextId: 9,
    paid: []
  }
};

async function continueLevelSix(page: Page) {
  await page.addInitScript((save) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("at.save.v1", JSON.stringify(save));
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
  }, LEVEL_SIX);
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  await playing(page);
  await hook(page, "visitors", false);
  return errors;
}

test("Level 6 guide: hints, the labelled Ocean Hall, a carried turtle, then visitors", async ({ page }) => {
  const errors = await continueLevelSix(page);
  const next = page.getByTestId("guide-next");
  await expect(next).toContainText("Open the Ocean Hall!");
  await expect(page.getByTestId("btn-objectives")).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("btn-objectives").click();
  await expect(page.getByTestId("goal-openHall")).toBeVisible();
  await expect(page.getByTestId("goal-turtle")).toBeVisible();
  await expect(page.getByTestId("goal-help")).toBeVisible();
  await page.getByTestId("btn-objectives").click();

  // Help advances from where to the exact action, including its real price.
  const help = page.getByTestId("btn-help");
  await expect(help).toContainText("Help");
  await help.click();
  await expect(page.getByTestId("nudge")).toContainText("Tap Tank");
  await expect(page.getByTestId("nudge")).toContainText("Ocean Hall");
  await expect(page.getByTestId("btn-tank-shop")).toHaveClass(/guide/);
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("nudge")).toContainText(`${HALL_PRICE}`);
  await expect(page.getByTestId("nudge")).toContainText("Ocean Hall");
  await shot(page, "guide-exact-hall-hint");

  // Animals explain their prerequisite, and the new room is a named offer.
  await expect(page.getByTestId("btn-animal-shop")).toHaveAttribute("aria-disabled", "true");
  await page.getByTestId("btn-tank-shop").click();
  const hallOffer = page.locator(".tank-offer").filter({ has: page.getByTestId("btn-buy-hall") });
  await expect(hallOffer).toContainText("Ocean Hall");
  await expect(hallOffer).toContainText("うみの ホール");
  await expect(hallOffer).toContainText(`${HALL_PRICE}`);
  await expect(hallOffer).toContainText("NEW ROOM");
  await expect(hallOffer).toContainText("includes an Ocean tank");
  await expect(page.getByTestId("btn-buy-hall")).toBeEnabled();
  await shot(page, "guide-labelled-hall-offer");
  await page.getByTestId("btn-buy-hall").click();
  let s = await waitFor(page, (x) => x.progress.hallOpen && x.tanks.some((t) => t.type === "ocean"), 5_000, "Ocean Hall opened");
  expect(s.coins).toBe(LEVEL_SIX.model.coins - HALL_PRICE);
  const ocean = s.tanks.find((t) => t.type === "ocean")!.id;
  await expect(page.getByTestId("btn-animal-shop")).toHaveAttribute("aria-disabled", "false");
  await expect(next).toContainText("Get a sea turtle!");
  await settle(page, 1500);

  // The English order still runs. A purchased turtle changes the guide to placement.
  await page.getByTestId("btn-animal-shop").click();
  await waitFor(page, (x) => x.prompt?.question === "What do you want?", 10_000, "animal order");
  await reply(page, "turtlePlease");
  s = await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "carrying the turtle");
  expect(s.coins).toBe(LEVEL_SIX.model.coins - HALL_PRICE - SPECIES.turtle.price);
  expect(s.inv.fish).toBe(1);
  await expect(next).toContainText("Put the turtle in the Ocean tank!");
  await expect(next).not.toContainText("Get a sea turtle");
  await shot(page, "guide-place-carried-turtle");
  await settle(page, 600);
  await click3d(page, "tank", ocean);
  s = await waitFor(page, (x) => x.tanks.find((t) => t.id === ocean)!.fish.includes("turtle"), 5_000, "turtle placed");
  expect(s.inv.fish).toBe(0);
  await expect(next).toContainText(/Help visitors:\s*0\s*\/\s*2/);
  await expect(page.getByTestId("btn-objectives")).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("btn-objectives").click();
  await expect(page.getByTestId("goal-openHall")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("goal-turtle")).toHaveAttribute("data-done", "true");
  await shot(page, "guide-next-visitors");
  expect((await state(page)).stage).toBe(6);
  expect(errors).toEqual([]);
});

test("Repeated wrong shops advance hints once per tier; the level overview dismisses with Escape", async ({ page }) => {
  const errors = await continueLevelSix(page);
  const nudge = page.getByTestId("nudge");
  const openDecor = async () => {
    await page.getByTestId("btn-decor-shop").click();
    await expect(page.getByTestId("decor-shop")).toBeVisible();
  };
  const closeDecor = () => page.getByTestId("shop-close").click();

  await openDecor();
  await expect(nudge).toBeHidden();
  await closeDecor();
  await openDecor();
  await expect(nudge).toHaveAttribute("data-tier", "1");
  await expect(nudge).toContainText("Tap Tank");
  await closeDecor();

  await openDecor();
  await expect(nudge).toHaveAttribute("data-tier", "1");
  await closeDecor();
  await openDecor();
  await expect(nudge).toHaveAttribute("data-tier", "2");
  await expect(nudge).toContainText(`${HALL_PRICE}`);
  await closeDecor();

  // Dismissing the final hint does not make another pair restart its animation.
  await nudge.click();
  for (let i = 0; i < 2; i++) {
    await openDecor();
    await closeDecor();
  }
  await settle(page, 600);
  await expect(nudge).toBeHidden();

  const level = page.getByTestId("level");
  await level.click();
  const overview = page.getByTestId("level-overview");
  await expect(overview).toBeVisible();
  await expect(level).toHaveAttribute("aria-expanded", "true");
  const rows = overview.locator("ol > li");
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(0)).toContainText("Done");
  await expect(rows.nth(0)).toContainText("My First Fish");
  await expect(rows.nth(5)).toHaveAttribute("aria-current", "step");
  await expect(rows.nth(5)).toContainText("Current");
  await expect(rows.nth(5)).toContainText("Ocean Hall");
  await expect(rows.nth(5)).toContainText("Open a new room and get a sea turtle.");
  await expect(rows.nth(6)).toContainText("Locked");
  await expect(rows.nth(6)).toContainText("Sea Friends");
  await expect(rows.nth(7)).toContainText("Locked");
  await expect(overview.getByRole("button", { name: "Close level overview" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(overview).toBeHidden();
  await expect(level).toHaveAttribute("aria-expanded", "false");
  await expect(level).toBeFocused();
  expect(errors).toEqual([]);
});
