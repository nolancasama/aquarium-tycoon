import { expect, test, type Page } from "@playwright/test";
import { boot, click3d, hook, playing, state, waitFor } from "./helpers";

/** Continue a saved Stage 3 aquarium (clownfish + blue tang in the small tank). */
async function stage3(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    localStorage.setItem(
      "at.save.v1",
      JSON.stringify({
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
      })
    );
  });
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
  await click3d(page, "tank", "t1");
  await waitFor(page, (x) => x.view === "tank", 5_000, "close-up");
  await page.waitForTimeout(900);
  await hook(page, "freezeFish", true);
  const before = await state(page);
  // Wrong 1: "Try again" (the sentence is read again, slowly).
  await tapFish(page, "clownfish");
  let s = await waitFor(page, (x) => x.request?.misses === 1, 5_000, "wrong 1");
  expect(s.progress.hearts).toBe(before.progress.hearts);
  expect(s.coins).toBe(before.coins);
  // Wrong 2: the colour word lights up with a swatch.
  await page.waitForTimeout(800);
  await tapFish(page, "clownfish");
  await waitFor(page, (x) => x.request?.misses === 2, 5_000, "wrong 2");
  await expect(page.getByTestId("request").locator("mark.key")).toContainText("blue");
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

test("a request can wait (no timer); counting shows its clue on the second miss", async ({ page }) => {
  await stage3(page);
  await hook(page, "requestVisitor", "child", { kind: "show", color: "orange", fishOnly: true });
  await page.getByTestId("chip-visitor").click();
  await waitFor(page, (x) => x.request?.kind === "show", 5_000, "request");
  await page.getByTestId("request-later").click();
  let s = await waitFor(page, (x) => !x.request && Boolean(x.waiting), 5_000, "back on the bench");
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
