import { expect, test } from "@playwright/test";
import { boot, click3d, hook, playing, startNew, state, waitFor } from "./helpers";
import { stagesTwoToFive, tutorial } from "./flows";

test("the whole loop in Tap mode: tutorial, five stages, the judge, free play", async ({ page }) => {
  const errors = await boot(page);
  await startNew(page, "tap");
  await tutorial(page);
  await stagesTwoToFive(page);
  // Free play: everything stays open; caring still works.
  await hook(page, "advance", 60);
  const s = await playing(page);
  // Free play goes on with Level 6 (the Ocean Hall).
  expect(s.goals.map((g) => g.id)).toEqual(["openHall", "turtle", "help"]);
  // Chromebook budget with both tanks, decorations and visitors on screen.
  await hook(page, "visitors", true);
  await page.waitForTimeout(6000);
  const perf = (await state(page)).perf;
  console.log(`draw calls ${perf.calls}, triangles ${perf.triangles}`);
  expect(perf.calls).toBeLessThan(150);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.view === "tank", 5_000, "close-up");
  const food = (await state(page)).tanks[0].food;
  await page.getByTestId("btn-feed").click();
  await waitFor(page, (x) => x.tanks[0].food > food, 5_000, "routine feed without English");
  expect((await state(page)).prompt).toBeNull();
  expect(errors).toEqual([]);
});
