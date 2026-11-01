import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { boot, click3d, hook, playing, startNew, state, waitFor, type AtState } from "./helpers";
import { reply, toRoom, tutorial } from "./flows";

type CountState = AtState & { countNumbers: { fishId: string; n: number }[] };

test("Level 2 counts each fish in order and clears numbers after the English answer", async ({ page }) => {
  const errors = await boot(page);
  await startNew(page, "tap");
  await tutorial(page);
  await hook(page, "visitors", false);
  await playing(page);
  await toRoom(page);
  await page.getByTestId("btn-fish-shop").click();
  await reply(page, "bluePlease");
  await waitFor(page, (s) => s.placing?.kind === "fish", 5_000, "carrying second fish");
  await click3d(page, "tank", "t1");
  const question = await waitFor(page, (s) => s.prompt?.question === "How many fish?", 15_000, "Level 2 count question");
  expect(question.view).toBe("tank");
  expect(question.tankId).toBe("t1");
  const ids = question.tanks.find((t) => t.id === "t1")!.fishIds;
  expect(ids).toHaveLength(2);

  const first = await hook<CountState>(page, "state");
  expect(first.countNumbers).toEqual([{ fishId: ids[0], n: 1 }]);
  const expected = ids.map((fishId, i) => ({ fishId, n: i + 1 }));
  await expect.poll(async () => (await hook<CountState>(page, "state")).countNumbers).toEqual(expected);
  // Earlier labels remain and the sequence leaves the English question open.
  await page.waitForTimeout(800);
  const complete = await hook<CountState>(page, "state");
  expect(complete.countNumbers).toEqual(expected);
  expect(complete.prompt?.question).toBe("How many fish?");
  expect(complete.progress.counted).toBe(false);
  fs.mkdirSync(".tmp", { recursive: true });
  await page.screenshot({ path: ".tmp/count-numbers.png" });

  await page.getByTestId("replay").click();
  expect((await hook<CountState>(page, "state")).countNumbers).toEqual(expected.slice(0, 1));
  await expect.poll(async () => (await hook<CountState>(page, "state")).countNumbers).toEqual(expected);

  await reply(page, "n2");
  await waitFor(page, (s) => s.progress.counted, 10_000, "count answered");
  expect((await hook<CountState>(page, "state")).countNumbers).toEqual([]);
  expect((await state(page)).countGlow).toBe(false);
  expect(errors).toEqual([]);
});
