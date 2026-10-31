import { expect, test, type Page } from "@playwright/test";
import { boot, click3d, hook, playing, precondition, state, waitFor } from "./helpers";

/** Continue a saved Stage 3 aquarium (clownfish + blue tang in the small tank). */
async function stage3(page: Page, expanded = false) {
  await page.addInitScript((withHall) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    localStorage.setItem(
      "at.save.v1",
      JSON.stringify({
        v: withHall ? 2 : 1,
        model: {
          coins: 30,
          tanks: [
            { id: "t1", type: "small", slot: "A", fish: [{ id: "f2", species: "clownfish" }, { id: "f3", species: "bluetang" }], decor: [{ id: "d4", kind: "plant", variant: "small", slot: 0 }], food: 100, clean: 100 },
            ...(withHall ? [
              { id: "t5", type: "big", slot: "B", fish: [{ id: "f6", species: "yellowfish" }], decor: [], food: 100, clean: 100 },
              { id: "t7", type: "ocean", slot: "C", fish: [{ id: "f8", species: "turtle" }], decor: [], food: 100, clean: 100 }
            ] : [])
          ],
          inv: { fish: [], decor: [], tanks: [] },
          progress: { stage: withHall ? 6 : 3, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 1, helpedInStage: 0, said: [], hallOpen: withHall, star: withHall, freePlay: withHall },
          stats: { coinsEarned: 10, helped: 1, fishBought: 2, seconds: 100 },
          nextId: withHall ? 9 : 5,
          paid: []
        }
      })
    );
  }, expanded);
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  await playing(page);
  await hook(page, "visitors", false);
  return errors;
}

async function tapFish(page: Page, species: string) {
  const s = await state(page);
  const t = s.tanks.find((x) => x.id === "t1")!;
  await click3d(page, "fish", t.fishIds[t.fish.indexOf(species)]);
}

test("'show me': wrong taps climb the hint ladder; the right one pays once", async ({ page }) => {
  const errors = await stage3(page);
  await hook(page, "requestVisitor", "adult", { kind: "show", color: "blue", fishOnly: true });
  await page.getByTestId("chip-visitor").click();
  await expect(page.getByTestId("request-line")).toHaveText("I like blue fish!");
  await expect(page.getByTestId("request-action")).toContainText("TAP A TANK!");
  await expect(page.getByTestId("request").locator("mark.key")).toHaveCount(0);
  await expect(page.getByTestId("request-clue")).toHaveCount(0);
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.view === "tank", 5_000, "close-up");
  await page.waitForTimeout(900);
  await expect(page.getByTestId("request-line")).toHaveText("I like blue fish!");
  await page.getByTestId("btn-back").click();
  await waitFor(page, (x) => x.view === "room", 5_000, "room again");
  await page.waitForTimeout(900);
  await expect(page.getByTestId("request-line")).toHaveText("I like blue fish!");
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.view === "tank", 5_000, "close-up again");
  await page.waitForTimeout(900);
  await hook(page, "freezeFish", true);
  const before = await state(page);
  // Tier 2 (first miss): replay, emphasise the word and add its colour swatch.
  await tapFish(page, "clownfish");
  let s = await waitFor(page, (x) => x.request?.misses === 1, 5_000, "wrong 1");
  expect(s.progress.hearts).toBe(before.progress.hearts);
  expect(s.coins).toBe(before.coins);
  await expect(page.getByTestId("request").locator("mark.key")).toHaveText("blue");
  await expect(page.getByTestId("request-swatch")).toBeVisible();
  await expect(page.getByTestId("request-clue")).toHaveCount(0);
  expect(s.glowFish).toBe(0);
  // Another miss keeps the same clue; exact fish targets still wait for tier 3.
  await page.waitForTimeout(800);
  await tapFish(page, "clownfish");
  s = await waitFor(page, (x) => x.request?.misses === 2, 5_000, "wrong 2");
  await expect(page.getByTestId("request").locator("mark.key")).toContainText("blue");
  await expect(page.getByTestId("request-swatch")).toBeVisible();
  await expect(page.getByTestId("request-swatch")).toHaveAttribute("data-color", "blue");
  await expect(page.getByTestId("request-clue")).toBeVisible();
  await expect(page.getByTestId("request-clue")).toContainText("blue");
  await expect(page.getByTestId("request-clue").locator(".swatch")).toBeVisible();
  expect(s.glowFish).toBe(0);
  // Wrong 3: the right fish glows.
  await page.waitForTimeout(800);
  await tapFish(page, "clownfish");
  s = await waitFor(page, (x) => x.request?.misses === 3, 5_000, "wrong 3");
  expect(s.glowFish).toBe(1);
  await page.waitForTimeout(800);
  await tapFish(page, "bluetang");
  s = await waitFor(page, (x) => x.progress.hearts === before.progress.hearts + 1, 10_000, "helped");
  const paid = s.coins - before.coins;
  expect(paid).toBeGreaterThanOrEqual(10);
  // Granted once: taps after the answer change nothing.
  await tapFish(page, "bluetang");
  await page.waitForTimeout(2500);
  s = await state(page);
  expect(s.progress.hearts).toBe(before.progress.hearts + 1);
  expect(s.coins - before.coins).toBe(paid);
  expect(s.request).toBeNull();
  expect(errors).toEqual([]);
});

/** The persistent card must leave every visible HUD control and the fish tap targets clear. */
async function checkRequestLayout(page: Page) {
  const request = page.getByTestId("request");
  await expect(request).toBeVisible();
  await expect(page.getByTestId("request-line")).toContainText(/I like blue(?:\s*blue)?\s+fish!/);
  await expect(page.getByTestId("request-action")).toContainText(/TAP A (?:TANK|FISH)!|Look in this tank!|Tap the blue fish!/i);
  // The request card carries its own hints; Help steps aside until it closes.
  await expect(page.getByTestId("btn-help")).toHaveCount(0);
  const box = (await request.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  for (const id of ["coins", "level", "hearts", "btn-help", "btn-settings", "status", "btn-back", "btn-feed", "btn-clean", "btn-decorate", "btn-upgrade", "btn-fish-shop", "btn-animal-shop", "btn-decor-shop", "btn-tank-shop", "btn-hall-next", "btn-hall-prev"]) {
    const control = page.getByTestId(id);
    if (!(await control.isVisible())) continue;
    const b = (await control.boundingBox())!;
    const overlap = box.x < b.x + b.width - 1 && b.x < box.x + box.width - 1 && box.y < b.y + b.height - 1 && b.y < box.y + box.height - 1;
    expect(overlap, `request overlaps ${id}`).toBe(false);
  }
  const s = await state(page);
  if (s.view === "tank") {
    const tank = s.tanks.find((t) => t.id === s.tankId)!;
    for (const fishId of tank.fishIds) {
      const point = await hook<{ x: number; y: number }>(page, "where", "fish", fishId);
      expect(point.y, `${fishId} stays below the request card`).toBeGreaterThan(box.y + box.height);
    }
  }
}

for (const size of [
  { w: 1366, h: 768, touch: false },
  { w: 1280, h: 800, touch: true },
  { w: 1024, h: 600, touch: true }
]) {
  test.describe(`persistent request ${size.w}x${size.h}${size.touch ? " touch" : ""}`, () => {
    test.use({ viewport: { width: size.w, height: size.h }, hasTouch: size.touch });

    test("stays readable across tanks, halls and the room with sound off", async ({ page }) => {
      const errors = await stage3(page, true);
      const press = (id: string) => size.touch ? page.getByTestId(id).tap() : page.getByTestId(id).click();
      const openTank = async (id: string) => {
        const point = await hook<{ x: number; y: number }>(page, "where", "tank", id);
        if (size.touch) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
        await waitFor(page, (s) => s.view === "tank" && s.tankId === id, 5_000, `tank ${id}`);
        await page.waitForTimeout(900);
        await checkRequestLayout(page);
      };
      const back = async () => {
        await press("btn-back");
        await waitFor(page, (s) => s.view === "room", 5_000, "room");
        await page.waitForTimeout(900);
        await checkRequestLayout(page);
      };
      await hook(page, "requestVisitor", "adult", { kind: "show", color: "blue", fishOnly: true });
      await press("chip-visitor");
      await hook(page, "freezeFish", true);
      await checkRequestLayout(page);
      await openTank("t5"); // An unrelated tank must still show what to find.
      await back();
      await press("btn-hall-next");
      await waitFor(page, (s) => s.hall === 1, 5_000, "Ocean Hall");
      await page.waitForTimeout(900);
      await checkRequestLayout(page);
      await openTank("t7");
      await back();
      await press("btn-hall-prev");
      await waitFor(page, (s) => s.hall === 0, 5_000, "first hall");
      await page.waitForTimeout(900);
      await checkRequestLayout(page);
      await openTank("t1");
      const prior = await precondition(page, (s) => s.view === "tank" && s.tankId === "t1" && s.request?.status === "ready", "matching tank after two wrong tanks");
      const tankMisses = prior.request!.misses;
      expect(tankMisses).toBe(2);
      await tapFish(page, "clownfish");
      await waitFor(page, (s) => s.request?.misses === tankMisses + 1, 5_000, "first wrong fish");
      await precondition(page, (s) => s.request?.status === "ready", "request ready for another wrong fish");
      await tapFish(page, "clownfish");
      await waitFor(page, (s) => s.request?.misses === tankMisses + 2, 5_000, "second wrong fish");
      await expect(page.getByTestId("request-clue")).toBeVisible();
      await checkRequestLayout(page);
      await back();
      expect((await state(page)).request?.misses).toBe(tankMisses + 2);
      await expect(page.getByTestId("request-clue")).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test("a request can wait (no timer); counting shows its clue on the second miss", async ({ page }) => {
  await stage3(page);
  await hook(page, "requestVisitor", "child", { kind: "show", color: "orange", fishOnly: true });
  await page.getByTestId("chip-visitor").click();
  await waitFor(page, (x) => x.request?.kind === "show", 5_000, "request");
  await page.getByTestId("request-later").click();
  let s = await waitFor(page, (x) => !x.request && Boolean(x.waiting), 5_000, "back on the bench");
  // Wait for the physical stand/return/sit sequence before checking patience.
  await waitFor(page, (x) => x.visitors.some((v) => v.request === "show" && v.state === "sit"), 20_000, "visitor sits again");
  // Nobody leaves while waiting.
  await page.waitForTimeout(3000);
  s = await state(page);
  expect(s.visitors.find((v) => v.request === "show")?.state).toBe("sit");
  await expect(page.getByTestId("chip-visitor")).toBeVisible();

  // Counting: two wrong numbers light the fish one by one.
  await hook(page, "requestVisitor", "fan", { kind: "count", tankId: "t1" });
  await page.waitForTimeout(300);
  // The waiting show visitor is first; help them later. Open the counting visitor by tapping them.
  s = await state(page);
  const counter = s.visitors.find((v) => v.request === "count")!;
  await click3d(page, "visitor", counter.id);
  s = await waitFor(page, (x) => x.prompt?.question === "How many fish?", 5_000, "count prompt");
  expect(s.prompt!.choices).toEqual(["n1", "n2", "n3"]);
  await page.locator("[data-testid=choice][data-id=n3]").click();
  await waitFor(page, (x) => x.prompt?.misses === 1, 5_000, "miss 1");
  await page.waitForTimeout(800);
  await page.locator("[data-testid=choice][data-id=n1]").click();
  s = await waitFor(page, (x) => x.prompt?.misses === 2, 5_000, "miss 2");
  expect(s.countGlow).toBe(true);
  await page.waitForTimeout(800);
  const hearts = s.progress.hearts;
  await page.locator("[data-testid=choice][data-id=n2]").click();
  await waitFor(page, (x) => x.progress.hearts === hearts + 1, 10_000, "counted");
});
