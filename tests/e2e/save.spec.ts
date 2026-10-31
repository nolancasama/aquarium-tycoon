import { expect, test } from "@playwright/test";
import { boot, click3d, hook, startNew, state, tapFirstFish, waitFor } from "./helpers";
import { reply } from "./flows";

/** A Stage 4 aquarium with the big tank placed, a fish in a bag and a decoration in the tray. */
const STAGE4 = {
  v: 1,
  model: {
    coins: 57,
    tanks: [
      { id: "t1", type: "small", slot: "A", fish: [{ id: "f2", species: "clownfish" }, { id: "f3", species: "bluetang" }], decor: [{ id: "d4", kind: "plant", variant: "small", slot: 0 }], food: 64.5, clean: 81 },
      { id: "t7", type: "big", slot: "B", fish: [{ id: "f8", species: "yellowfish" }], decor: [{ id: "d9", kind: "coral", variant: "blue", slot: 2 }], food: 90, clean: 70 }
    ],
    inv: { fish: [{ id: "f10", species: "clownfish" }], decor: [{ id: "d5", kind: "shell", variant: null }], tanks: [] },
    progress: {
      stage: 4,
      tutorial: "done",
      firstFish: "clownfish",
      fedOnce: true,
      cleanedOnce: true,
      counted: true,
      allHappy: false,
      helpedInStage: 0,
      hearts: 6,
      specialPending: false,
      photo: false,
      star: false,
      freePlay: false,
      said: ["orangePlease", "feedFish"]
    },
    stats: { coinsEarned: 120, helped: 6, fishBought: 4, seconds: 600 },
    nextId: 11,
    paid: []
  }
};

test("progress is saved as it happens and Continue restores it after a refresh", async ({ page }) => {
  const errors = await boot(page);
  await expect(page.getByTestId("btn-continue")).toHaveCount(0);
  await startNew(page, "tap");
  await waitFor(page, (x) => x.prompt?.question === "Blue or orange?", 20_000, "shop");
  await reply(page, "bluePlease");
  await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "bag");
  await page.waitForTimeout(600);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.tanks[0].fish.length === 1, 5_000, "placed");
  // Saved by the autosave itself (a closed lid or a crash fires no pagehide).
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("at.save.v1") ?? "null"));
  expect(stored.model.tanks[0].fish.map((f: { species: string }) => f.species)).toEqual(["bluetang"]);
  expect(stored.model.coins).toBe(70);
  await page.reload();
  await expect(page.getByTestId("btn-continue")).toBeVisible();
  await page.getByTestId("btn-continue").click();
  // The purchase and the placement are back, and the tutorial resumes at feeding.
  const s = await waitFor(page, (x) => x.screen === "game" && x.tutorial === "feed", 10_000, "resumed");
  expect(s.coins).toBe(70);
  expect(s.tanks[0].fish).toEqual(["bluetang"]);
  await waitFor(page, (x) => x.view === "tank", 5_000, "back at the tank");
  await expect(page.getByTestId("btn-feed")).toBeVisible();
  expect(errors).toEqual([]);
});

test("tanks, decorations, bags, unlocks and settings come back; New game asks first and keeps settings", async ({ page }) => {
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("at.save.v1", JSON.stringify(save));
      localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0.1, sfx: 0.5, japanese: false, slowVoice: true, audioSetupDone: true }));
      sessionStorage.setItem("seeded", "1");
    }
  }, STAGE4);
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  let s = await waitFor(page, (x) => x.screen === "game", 10_000, "continued");
  expect(s.stage).toBe(4);
  expect(s.coins).toBe(57);
  expect(s.tanks.map((t) => [t.id, t.slot, t.type, t.fish.join("+")])).toEqual([
    ["t1", "A", "small", "clownfish+bluetang"],
    ["t7", "B", "big", "yellowfish"]
  ]);
  expect(s.tanks[1].decor).toEqual([{ slot: 2, kind: "coral", variant: "blue" }]);
  expect(s.inv.fish).toBe(1);
  expect(s.inv.decor.map((d) => d.kind)).toEqual(["shell"]);
  await expect(page.getByTestId("chip-bag")).toBeVisible();
  // Unlocks: the yellow fish is sold, the tank shop is open.
  await expect(page.getByTestId("btn-tank-shop")).not.toHaveClass(/locked/);
  // Settings came back: Tap mode, no Japanese.
  await expect(page.locator(".ja").first()).toHaveCount(0);
  // The big tank renders and opens.
  await click3d(page, "tank", "t7");
  await waitFor(page, (x) => x.view === "tank" && x.tankId === "t7", 5_000, "big tank close-up");
  await expect(page.getByTestId("fish-count")).toContainText("1/5");
  // New game: asks first; "No" keeps the save.
  await hook(page, "set", { settingsOpen: true });
  await page.getByTestId("settings-title").click();
  await page.getByTestId("btn-new").click();
  await expect(page.getByTestId("confirm-new")).toBeVisible();
  await page.getByTestId("btn-cancel-new").click();
  await expect(page.getByTestId("btn-continue")).toBeVisible();
  await page.getByTestId("btn-new").click();
  await page.getByTestId("btn-confirm-new").click();
  await waitFor(page, (x) => x.screen === "game" && x.tutorial === "buy", 20_000, "fresh start");
  await tapFirstFish(page);
  s = await state(page);
  expect(s.coins).toBe(100);
  expect(s.tanks).toHaveLength(1);
  // Teacher settings survive a new game.
  expect(s.prompt!.buttons).toBe(true);
  expect(errors).toEqual([]);
});

test("a corrupted save is discarded gracefully", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("at.save.v1", "{not json");
      sessionStorage.setItem("seeded", "1");
    }
  });
  const errors = await boot(page);
  await expect(page.getByTestId("save-lost")).toBeVisible();
  await expect(page.getByTestId("btn-continue")).toHaveCount(0);
  await startNew(page, "tap");
  await waitFor(page, (x) => Boolean(x.prompt), 20_000, "plays");
  expect((await state(page)).coins).toBe(100);
  expect(errors).toEqual([]);
});
