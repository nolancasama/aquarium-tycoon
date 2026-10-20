import { expect, test } from "@playwright/test";
import { boot, click3d, hook, say, startNew, state, waitFor } from "./helpers";
import { stagesTwoToFive, tutorial } from "./flows";

test("the whole loop in Speak mode, every answer spoken", async ({ page }) => {
  const errors = await boot(page);
  await startNew(page, "speak");
  const s = await waitFor(page, (x) => Boolean(x.prompt), 20_000, "first prompt");
  // Speak mode: the sentences are shown, the buttons are not.
  expect(s.prompt!.buttons).toBe(false);
  expect(s.micState).toBe("ready");
  await tutorial(page);
  await stagesTwoToFive(page);
  const said = (await state(page)).progress.said;
  expect(said).toEqual(expect.arrayContaining(["orangePlease", "feedFish", "bluePlease", "n2", "cleanPlease", "yesIDo", "redPlease"]));
  expect(errors).toEqual([]);
});

test("wrong speech never acts; the hint ladder; one utterance = one action; interim results count", async ({ page }) => {
  const errors = await boot(page);
  await startNew(page, "speak");
  let s = await waitFor(page, (x) => x.prompt?.question === "Blue or orange?", 20_000, "shop prompt");
  const pid = s.prompt!.id;

  // Miss 1: another colour. Nothing is bought; "Try again".
  await say(page, "red please");
  s = await waitFor(page, (x) => x.prompt?.misses === 1, 5_000, "miss 1");
  expect(s.coins).toBe(100);
  expect(s.inv.fish).toBe(0);
  expect(s.prompt!.buttons).toBe(false);
  await expect(page.getByTestId("prompt-status")).toContainText("Try again");

  // Miss 2: silence. The key words light up.
  await say(page, null);
  s = await waitFor(page, (x) => x.prompt?.misses === 2, 5_000, "miss 2");
  expect(s.prompt!.highlight).toBe(true);
  await expect(page.locator("mark.key").first()).toBeVisible();

  // Miss 3: both colours at once is not an answer. The buttons become a rescue.
  // (Interim only: a normal recogniser's first interim "blue" would rightly be accepted.)
  await page.evaluate(() => {
    (window as never as { __speech: { interimOnly: boolean } }).__speech.interimOnly = true;
  });
  await say(page, "blue orange");
  await page.evaluate(() => {
    (window as never as { __speech: { interimOnly: boolean } }).__speech.interimOnly = false;
  });
  s = await waitFor(page, (x) => x.prompt?.misses === 3, 5_000, "miss 3");
  expect(s.prompt!.buttons).toBe(true);
  expect(s.prompt!.id).toBe(pid);
  expect(s.coins).toBe(100);

  // Inert sentences in Speak mode never answered anything; the mic still works after the rescue.
  await say(page, "Blue, please! Blue, please!");
  s = await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "bought by voice");
  // One utterance (even repeated words) buys exactly one fish.
  expect(s.coins).toBe(70);
  expect(s.inv.fish).toBe(1);

  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.tutorial === "feed" && x.view === "tank", 10_000, "feed step");
  await page.getByTestId("btn-feed").click();
  s = await waitFor(page, (x) => Boolean(x.prompt), 5_000, "feed prompt");
  // "Feed" alone is not the sentence.
  await say(page, "feed");
  s = await waitFor(page, (x) => x.prompt?.misses === 1, 5_000, "feed miss");
  expect(s.progress.fedOnce).toBe(false);
  // An interim result with the whole sentence is accepted at once (no final result ever comes).
  await page.evaluate(() => {
    (window as never as { __speech: { interimOnly: boolean } }).__speech.interimOnly = true;
  });
  await say(page, "feed the fish");
  s = await waitFor(page, (x) => x.progress.fedOnce, 5_000, "fed on an interim result");
  expect(s.pellets).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("Speak mode counts with digits and accent variants", async ({ page }) => {
  await boot(page);
  await startNew(page, "speak");
  await tutorialQuick(page);
  await hook(page, "visitors", false);
  await page.getByTestId("btn-back").click({ timeout: 3_000 }).catch(() => undefined);
  await waitFor(page, (x) => x.view === "room", 5_000, "room");
  await page.getByTestId("btn-fish-shop").click();
  await say(page, "blew please");
  await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "blue bought with an accent");
  await page.waitForTimeout(600);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.prompt?.question === "How many fish?", 15_000, "Pico counts");
  await say(page, "tree");
  let s = await waitFor(page, (x) => x.prompt?.misses === 1, 5_000, "three is wrong for two fish");
  expect(s.progress.counted).toBe(false);
  await say(page, "2");
  s = await waitFor(page, (x) => x.progress.counted, 5_000, "a digit counts");
});

/** Stage 1 by voice, without the screenshots and checks of the full flow. */
async function tutorialQuick(page: import("@playwright/test").Page) {
  await waitFor(page, (x) => x.prompt?.question === "Blue or orange?", 20_000, "shop");
  await say(page, "orange please");
  await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "bag");
  await page.waitForTimeout(600);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.tutorial === "feed" && x.view === "tank", 10_000, "feed step");
  await page.getByTestId("btn-feed").click();
  await say(page, "feed the fish");
  await waitFor(page, (x) => x.request?.kind === "show", 40_000, "visitor");
  await page.waitForTimeout(600);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.view === "tank", 5_000, "close-up");
  await page.waitForTimeout(900);
  await hook(page, "freezeFish", true);
  const s = await state(page);
  await click3d(page, "fish", s.tanks[0].fishIds[0]);
  await hook(page, "freezeFish", false);
  await waitFor(page, (x) => x.stageCard?.stage === 1, 20_000, "stage card");
  await page.getByTestId("stage-ok").click();
  await waitFor(page, (x) => x.panel === "decorate" && x.mode === "play", 20_000, "decorate");
  await page.locator("[data-testid=tray-item]").first().click();
  await click3d(page, "slot", "t1:0");
  await waitFor(page, (x) => x.tutorial === "done" && x.mode === "play" && !x.line, 20_000, "tutorial done");
}
