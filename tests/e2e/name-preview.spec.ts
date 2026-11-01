import { expect, test, type Page } from "@playwright/test";
import { boot, startNew, state, waitFor } from "./helpers";

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __ttsSpoken: string[] }).__ttsSpoken);
async function idleAudio(page: Page) {
  // Wait for prompt playback to finish, rather than racing its visual state.
  await page.waitForFunction(() => (window as unknown as { __ttsPending: number }).__ttsPending === 0);
}

for (const width of [1366, 1024]) {
  for (const mode of ["speak", "say-tap", "tap"] as const) {
    test(`${mode}: picture previews without ordering at ${width}x768`, async ({ page }) => {
      await page.setViewportSize({ width, height: 768 });
      const errors = await boot(page);
      await startNew(page, mode);
      await idleAudio(page);
      const before = await state(page);
      const picture = page.getByRole("button", { name: "Hear: Clownfish", exact: true });
      const box = await picture.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(88);
      expect(box!.height).toBeGreaterThanOrEqual(88);
      const count = (await spoken(page)).filter((s) => s === "Clownfish!").length;
      await page.evaluate(() => { (window as unknown as { __ttsMs: number }).__ttsMs = 3000; });
      await picture.click();
      await expect(page.getByRole("status").filter({ hasText: "Clownfish" })).toBeVisible();
      await expect(page.locator(".name-preview-label .ja")).toHaveText("クマノミ");
      await expect.poll(async () => (await spoken(page)).filter((s) => s === "Clownfish!").length).toBe(count + 1);
      // Replay with keyboard while the first preview is still speaking.
      await picture.focus();
      await page.keyboard.press("Space");
      await expect.poll(async () => (await spoken(page)).filter((s) => s === "Clownfish!").length).toBe(count + 2);
      expect(await page.evaluate(() => (window as unknown as { __ttsPending: number }).__ttsPending)).toBe(1);
      const after = await state(page);
      expect(after.coins).toBe(before.coins);
      expect(after.inv).toEqual(before.inv);
      expect(after.placing).toEqual(before.placing);
      expect(after.prompt).toEqual(before.prompt);
      expect(after.tanks).toEqual(before.tanks);
      await page.screenshot({ path: `.tmp/name-preview/${mode}-${width}.png` });
      await expect(page.locator(".name-preview-label")).toHaveCount(0, { timeout: 2500 });
      expect(errors).toEqual([]);
    });
  }
}

test("listening recognition makes the picture visual-only", async ({ page }) => {
  await boot(page);
  await startNew(page, "speak");
  await idleAudio(page);
  await page.evaluate(() => {
    Object.assign((window as unknown as { __speech: object }).__speech, { say: null, delayMs: 6000 });
  });
  await page.getByTestId("mic").click();
  const before = await waitFor(page, (s) => s.prompt?.status === "listening");
  const utterances = await spoken(page);
  await page.getByRole("button", { name: "Hear: Clownfish", exact: true }).click();
  await expect(page.locator(".name-preview-label")).toContainText("Clownfish");
  expect(await spoken(page)).toEqual(utterances);
  const after = await state(page);
  expect(after.prompt).toEqual(before.prompt);
  expect(after.coins).toBe(before.coins);
  expect(after.inv).toEqual(before.inv);
});
