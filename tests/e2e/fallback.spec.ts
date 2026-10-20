import { expect, test } from "@playwright/test";
import { boot, click3d, say, startNew, state, waitFor } from "./helpers";
import { reply } from "./flows";

test("a blocked microphone switches to buttons at once and the tutorial still completes", async ({ page }) => {
  const errors = await boot(page);
  await startNew(page, "speak");
  let s = await waitFor(page, (x) => x.prompt?.question === "Blue or orange?", 20_000, "shop");
  expect(s.prompt!.buttons).toBe(false);
  await say(page, null, "not-allowed");
  s = await waitFor(page, (x) => x.micState === "blocked", 5_000, "mic blocked");
  expect(s.prompt!.buttons).toBe(true);
  // The hard error is not counted as the child's miss.
  expect(s.prompt!.misses).toBe(0);
  await expect(page.getByTestId("mic")).toHaveCount(0);
  await reply(page, "orangePlease");
  await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "bag");
  await page.waitForTimeout(600);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.tutorial === "feed" && x.view === "tank", 10_000, "feed step");
  await page.getByTestId("btn-feed").click();
  s = await waitFor(page, (x) => Boolean(x.prompt), 5_000, "feed prompt");
  // Every later prompt opens with buttons.
  expect(s.prompt!.buttons).toBe(true);
  await reply(page, "feedFish");
  await waitFor(page, (x) => x.progress.fedOnce, 5_000, "fed");
  expect(errors).toEqual([]);
});

test("a browser without speech recognition plays with buttons", async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const w = window as never as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await startNew(page, "speak");
  const s = await waitFor(page, (x) => Boolean(x.prompt), 20_000, "first prompt");
  expect(s.micState).toBe("unsupported");
  expect(s.prompt!.buttons).toBe(true);
  await reply(page, "bluePlease");
  await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "bought");
  expect(errors).toEqual([]);
});

test("silence and a network error are ordinary misses, not a switch to buttons", async ({ page }) => {
  await boot(page);
  await startNew(page, "speak");
  await waitFor(page, (x) => x.prompt?.question === "Blue or orange?", 20_000, "shop");
  await say(page, null);
  let s = await waitFor(page, (x) => x.prompt?.misses === 1, 5_000, "silence");
  await say(page, null, "network");
  s = await waitFor(page, (x) => x.prompt?.misses === 2, 5_000, "network");
  expect(s.micState).toBe("ready");
  expect(s.prompt!.buttons).toBe(false);
  // Tap mode is a teacher setting: switching it on mid-game gives buttons on the next prompt.
  await say(page, "orange please");
  await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "bought");
  await page.getByTestId("btn-settings").click();
  await page.getByTestId("settings-tap").click();
  await page.getByTestId("settings-close").click();
  await page.waitForTimeout(400);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.tutorial === "feed" && x.view === "tank", 10_000, "feed step");
  await page.getByTestId("btn-feed").click();
  s = await waitFor(page, (x) => Boolean(x.prompt), 5_000, "feed prompt");
  expect(s.prompt!.buttons).toBe(true);
  expect((await state(page)).micState).toBe("ready");
  // In Tap mode, Space never opens the microphone.
  const starts = await page.evaluate(() => (window as never as { __speech: { starts: number } }).__speech.starts);
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as never as { __speech: { starts: number } }).__speech.starts)).toBe(starts);
  expect((await state(page)).prompt?.status).toBe("ready");
});
