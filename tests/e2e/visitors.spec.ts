import { expect, test, type Page } from "@playwright/test";
import { boot, click3d, hook, playing, state, waitFor } from "./helpers";

async function walkingRequest(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    localStorage.setItem("at.save.v1", JSON.stringify({
      v: 1,
      model: {
        coins: 30,
        tanks: [{ id: "t1", type: "small", slot: "A", fish: [{ id: "f2", species: "clownfish" }, { id: "f3", species: "bluetang" }], decor: [{ id: "d4", kind: "plant", variant: "small", slot: 0 }], food: 100, clean: 100 }],
        inv: { fish: [], decor: [], tanks: [] },
        progress: { stage: 3, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 1, helpedInStage: 0, said: [] },
        stats: { coinsEarned: 10, helped: 1, fishBought: 2, seconds: 100 },
        nextId: 5,
        paid: []
      }
    }));
  });
  // Seed 7's first ordinary arrival requests a blue fish. Use the real arrival
  // rather than requestVisitor(), which places a visitor directly on the bench.
  const errors = await boot(page, "fast=1&seed=7");
  await page.getByTestId("btn-continue").click();
  await playing(page);
  const s = await waitFor(page, (x) => Boolean(x.waiting && x.visitors.some((v) => v.id === x.waiting!.id && v.state === "walk")), 20_000, "walking request inside the room");
  await hook(page, "visitors", false);
  expect(s.visitors).toHaveLength(1);
  await expect(page.getByTestId("chip-visitor")).toBeVisible();
  return { id: s.waiting!.id, errors };
}

async function openByTappingVisitor(page: Page, id: string) {
  await click3d(page, "visitor", id);
  await expect(page.getByTestId("request-line")).toHaveText("I like blue fish!");
  await waitFor(page, (s) => s.visitors.some((v) => v.id === id && v.state === "help"), 5_000, "visitor stopped to talk");
  // A second tap during the conversation must not start a second request.
  await click3d(page, "visitor", id);
}

async function completeOnce(page: Page, id: string) {
  await click3d(page, "tank", "t1");
  await waitFor(page, (s) => s.view === "tank", 5_000, "tank close-up");
  await page.waitForTimeout(900);
  await hook(page, "freezeFish", true);
  const before = await state(page);
  const tank = before.tanks.find((t) => t.id === "t1")!;
  const fishId = tank.fishIds[tank.fish.indexOf("bluetang")];
  await click3d(page, "fish", fishId);
  const paid = await waitFor(page, (s) => s.progress.hearts === before.progress.hearts + 1, 10_000, "one completed request");
  expect(paid.coins - before.coins).toBe(tank.happy! >= 70 ? 15 : 10);
  // Repeat the successful action during celebration and once it has finished.
  await click3d(page, "fish", fishId);
  await waitFor(page, (s) => !s.visitors.some((v) => v.id === id), 20_000, "helped visitor leaves");
  await click3d(page, "fish", fishId);
  const after = await state(page);
  expect(after.coins).toBe(paid.coins);
  expect(after.progress.hearts).toBe(paid.progress.hearts);
  expect(after.request).toBeNull();
}

test("tap a walking request visitor and complete the request once", async ({ page }) => {
  const { id, errors } = await walkingRequest(page);
  expect((await state(page)).visitors.find((v) => v.id === id)?.state).toBe("walk");
  await openByTappingVisitor(page, id);
  await page.waitForTimeout(1200);
  expect((await state(page)).visitors.find((v) => v.id === id)?.state).toBe("help");
  await completeOnce(page, id);
  expect(errors).toEqual([]);
});

test("put off a walking request, then help the visitor after sitting", async ({ page }) => {
  const { id, errors } = await walkingRequest(page);
  await openByTappingVisitor(page, id);
  const before = await state(page);
  await page.getByTestId("request-later").click();
  const seated = await waitFor(page, (s) => !s.request && s.visitors.some((v) => v.id === id && v.state === "sit"), 20_000, "visitor reaches the bench after cancellation");
  expect(seated.coins).toBe(before.coins);
  expect(seated.progress.hearts).toBe(before.progress.hearts);
  await expect(page.getByTestId("chip-visitor")).toBeVisible();
  await openByTappingVisitor(page, id);
  await completeOnce(page, id);
  expect(errors).toEqual([]);
});
