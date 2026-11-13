import { expect, test, type Page } from "@playwright/test";
import { answer, boot, click3d, hook, state, waitFor } from "./helpers";

/**
 * Coastal & Polar Zone, release-locked (data/release.ts): in ordinary play its
 * doorway and map card only say "Coming soon" whatever the trophy and coins; a
 * saved coast is kept (stored out of play). Inside a development preview the
 * real rules still work: the offer, the penguin slice (needs rocks -> place
 * resting rocks; penguins use the ramp and swim; "How many penguins?" by
 * tapping), feeding; and a reload forgets the preview entirely.
 */

let id = 400;
const tank = (type: string, slot: string, species: string[] = []) => ({
  id: `t${id++}`, type, slot, food: 90, clean: 95,
  fish: species.map((s) => ({ id: `f${id++}`, species: s })), decor: [], upgrades: { filter: false, lamp: false }
});
function save(coins: number) {
  return {
    coins, inv: { fish: [], decor: [], tanks: [] },
    tanks: [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
      tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish"]), tank("sharks", "L", ["blacktip", "eagleray", "zebrashark"])],
    progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
      hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
      atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [], hubIntroSeen: true,
      tunnelOpen: true, tunnelIntroSeen: true, tunnel: { milestone: 5, observed: 9, helped: 3, findDone: true, whereDone: true, countDone: true, trophy: true } },
    rush: { unlocked: true, introSeen: true, phase: "waiting", untilNext: 900, pendingFor: 0, event: null, lastCommitted: null,
      stats: { events: 0, bronze: 0, silver: 0, gold: 0, successes: 0, best: null, bestReady: 0 }, rewards: [] },
    stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
  };
}

type Coast = { open: boolean; milestone: number; view: string; underwater: boolean; entries: Record<string, number>; animals: { id: string; habitat: string; mode: string; area: string; y: number }[]; progress: Record<string, unknown> | null };
const coast = (page: Page) => hook<Coast>(page, "coast");

async function load(page: Page, model: unknown) {
  await page.addInitScript((m) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model: m }));
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
  }, model);
  const errors = await boot(page, "fast=1&seed=9");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game");
  await hook(page, "visitors", false);
  for (let i = 0; i < 6 && (await state(page)).line; i++) await page.getByTestId("next").click({ timeout: 2000 }).catch(() => undefined);
  return errors;
}

type Release = { preview: string[]; active: boolean; released: Record<string, boolean>; stored: { tanks: { slot: string; fish: { species: string }[]; decor: { kind: string }[] }[] } | null };
const release = (page: Page) => hook<Release>(page, "release");
const roomId = async (page: Page) => (await state(page) as unknown as { roomId: string }).roomId;

test("locked at the hub and on the map; a preview sandbox opens it; penguins need rocks; a question; feed; reload forgets it", async ({ page }) => {
  const errors = await load(page, save(700));
  await waitFor(page, (s) => s.mode === "play" && !s.line, 10_000, "calm");
  // The Shark Tunnel trophy and 700 coins: still only "Coming soon" (no offer, no travel, no charge).
  await page.getByTestId("btn-map").click();
  await expect(page.getByTestId("map-coast")).toHaveAttribute("data-soon", "true");
  await page.getByTestId("map-coast").click();
  await expect(page.getByTestId("map-coast-soon")).toContainText("Coming soon!");
  await expect(page.getByTestId("coast-offer")).toHaveCount(0);
  await page.getByTestId("map-hub").click();
  await waitFor(page, (s) => (s as unknown as { roomId: string; fade: number }).roomId === "hub" && (s as unknown as { fade: number }).fade === 0 && s.mode === "play", 10_000, "in the hub");
  await page.waitForTimeout(900);
  await click3d(page, "hub-door", "coast");
  await expect(page.getByTestId("toast").filter({ hasText: "Coming soon" })).toBeVisible();
  await page.waitForTimeout(600);
  expect(await roomId(page)).toBe("hub");
  await expect(page.getByTestId("coast-offer")).toHaveCount(0);
  expect((await state(page)).coins).toBe(700);
  expect((await coast(page)).open).toBe(false);

  // A development preview (session only): the real opening rules run in the sandbox.
  expect(await hook(page, "preview", "coast")).toBe(true);
  await expect(page.getByTestId("preview-badge")).toBeVisible();
  await page.getByTestId("btn-map").click();
  await page.getByTestId("map-coast").click();
  await expect(page.getByTestId("coast-offer")).toBeVisible();
  await page.getByTestId("btn-buy-coast").click();
  await waitFor(page, (s) => (s as unknown as { roomId: string }).roomId === "coast" && s.mode === "play", 15_000, "in the coast");
  let c = await coast(page);
  expect(c.open).toBe(true);
  expect(c.milestone).toBe(1);
  expect((await state(page)).coins).toBe(700 - 320);
  // The first-visit camera tour finishes or can be skipped by any tap.
  await waitFor(page, (s) => !s.line && (s.progress as { coastIntroSeen?: boolean }).coastIntroSeen === true, 15_000, "intro done");
  await expect(page.getByTestId("coast-goals")).toContainText("Penguin Paradise");

  // The penguins: three of them, unhappy until they have resting rocks.
  await page.getByTestId("coast-view-penguins").click();
  await expect(page.getByTestId("coast-status")).toBeVisible();
  await expect(page.getByTestId("coast-capacity")).toContainText("3/6");
  await expect(page.getByTestId("coast-need")).toContainText("The penguins need rocks!");
  await page.getByTestId("btn-coast-items").click();
  await expect(page.getByTestId("coast-shop")).toBeVisible();
  await page.locator("[data-testid=coast-item][data-kind=penguinRock]").click();
  // Placing: rings only on land slots; tap one.
  await waitFor(page, (s) => s.panel === "decorate" && s.placing?.kind === "decor", 10_000, "placing the rocks");
  await page.waitForTimeout(1200);
  await click3d(page, "coast-slot", "penguins:0");
  await waitFor(page, (s) => s.tanks.find((t) => t.type === "penguins")!.decor.length === 1, 5_000, "rocks placed");
  await page.getByTestId("btn-done-decor").click();
  await expect(page.getByTestId("coast-need")).toHaveCount(0);
  const penguins = (await state(page)).tanks.find((t) => t.type === "penguins")!;
  expect(penguins.decor.map((d) => d.kind)).toEqual(["penguinRock"]);

  // Penguins move between land and water by themselves (the ramp): wait for an entry.
  for (let i = 0; i < 60 && (await coast(page)).entries.penguins === 0; i++) await page.waitForTimeout(1000);
  c = await coast(page);
  expect(c.entries.penguins).toBeGreaterThan(0);
  expect((c.progress as { sawPenguinSwim: boolean }).sawPenguinSwim).toBe(true);

  // A visitor asks "How many penguins?"; answered by tapping (Tap mode).
  await page.getByTestId("coast-view-underwater").click();
  await page.waitForTimeout(1000);
  await hook(page, "coastVisitor", "penguins");
  await page.getByTestId("coast-visitor").click();
  const countQuestion = await waitFor(page, (s) => s.prompt?.question === "How many penguins?", 10_000, "the question");
  expect(countQuestion.prompt!.choices).toEqual(["pg2", "pg3", "pg4"]);
  expect((await coast(page)).underwater).toBe(true);
  expect((await state(page) as unknown as { camera: { pos: { y: number } } }).camera.pos.y).toBeGreaterThan(5);
  await answer(page, "pg3");
  await waitFor(page, (s) => !s.prompt, 10_000, "answered");
  c = await coast(page);
  expect((c.progress as { penguinActs: number }).penguinActs).toBe(1);
  await page.waitForTimeout(1200);
  expect((await state(page) as unknown as { camera: { pos: { y: number } } }).camera.pos.y).toBeCloseTo(-1.45, 1);
  await page.getByTestId("coast-view-penguins").click();

  // Feed the penguins.
  await hook(page, "setCare", penguins.id, 30, 100);
  await page.getByTestId("btn-feed").click();
  // The keeper walks out of the staff door first (no station here: the shore fallback).
  await expect(page.getByTestId("btn-feed")).toBeDisabled();
  await expect(page.getByTestId("btn-feed")).toContainText("Feeding...");
  await waitFor(page, (s) => s.tanks.find((t) => t.type === "penguins")!.food >= 85, 30_000, "fed");
  await expect(page.getByTestId("btn-feed")).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId("btn-feed")).toContainText("Feed");
  // Reload: the preview was never saved. Coins, the coast and everything else are as before it.
  await page.reload();
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game again");
  const s2 = await state(page);
  expect(s2.coins).toBe(700);
  expect(s2.tanks.some((t) => t.type === "penguins")).toBe(false);
  expect((await coast(page)).open).toBe(false);
  const r = await release(page);
  expect(r.active).toBe(false);
  expect(r.preview).toEqual([]);
  expect(r.stored).toBeNull();
  await expect(page.getByTestId("preview-badge")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a saved coast is kept but closed; End preview restores the save", async ({ page }) => {
  // A save from before the lock: the coast owned at milestone 2, three penguins on their rocks.
  const s = save(500);
  const penguins = tank("penguins", "M", ["penguin", "penguin", "penguin"]);
  penguins.decor = [{ id: "d901", kind: "penguinRock", variant: null, slot: 0 }] as never;
  const owned = { ...s, tanks: [...s.tanks, penguins, tank("seals", "N", ["seal"])],
    progress: { ...s.progress, coastOpen: true, coastIntroSeen: true, coast: { milestone: 2, sawPenguinSwim: true, sawSealDive: false, sawOtterFloat: false, penguinActs: 0, sealActs: 0, otterActs: 0, trophy: false } } };
  const errors = await load(page, owned);
  // Kept, out of play: not among the tanks, but stored with its animals and items.
  expect((await state(page)).tanks.some((t) => t.slot === "M" || t.slot === "N")).toBe(false);
  const r = await release(page);
  expect(r.stored!.tanks.map((t) => [t.slot, t.fish.length, t.decor.map((d) => d.kind)])).toEqual([["M", 3, ["penguinRock"]], ["N", 1, []]]);
  expect((await coast(page)).milestone).toBe(2);
  await page.getByTestId("btn-map").click();
  await expect(page.getByTestId("map-coast")).toHaveAttribute("data-soon", "true");
  await expect(page.getByTestId("map-coast-soon")).toContainText("2/5 saved");
  await page.getByTestId("map-close").click();

  // A preview shows the saved habitats; ending it puts the saved game back exactly.
  await hook(page, "preview", "coast");
  await waitFor(page, (st) => st.tanks.some((t) => t.slot === "M"), 5_000, "habitats in the sandbox");
  await hook(page, "set", { hall: 6, view: "room", tankId: null, panel: null, coastView: "penguins" });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6 && (await state(page)).line; i++) await page.getByTestId("next").click({ timeout: 2000 }).catch(() => undefined);
  await expect(page.getByTestId("coast-status")).toBeVisible();
  await expect(page.getByTestId("coast-capacity")).toContainText("3/6");
  expect(await hook(page, "endPreview")).toBe(true);
  await hook(page, "set", { hall: 5 });
  await page.waitForTimeout(400);
  expect((await state(page)).tanks.some((t) => t.slot === "M")).toBe(false);
  expect((await release(page)).stored!.tanks.length).toBe(2);
  expect(errors).toEqual([]);
});

test("a real tap on a coastal slot ring places the item (in a preview)", async ({ page }) => {
  const errors = await load(page, save(700));
  await hook(page, "coastTo", 1);
  await hook(page, "set", { hall: 6, view: "room", tankId: null, panel: null, coastView: "penguins" });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6 && (await state(page)).line; i++) await page.getByTestId("next").click({ timeout: 2000 }).catch(() => undefined);
  await page.getByTestId("btn-coast-items").click();
  await page.locator("[data-testid=coast-item][data-kind=penguinNest]").click();
  await waitFor(page, (s) => s.panel === "decorate" && s.placing?.kind === "decor", 10_000, "placing the nest");
  await page.waitForTimeout(1200);
  await click3d(page, "coast-slot", "penguins:3");
  await waitFor(page, (s) => s.tanks.find((t) => t.type === "penguins")!.decor.some((d) => d.kind === "penguinNest" && d.slot === 3), 5_000, "nest placed");
  expect(errors).toEqual([]);
});

test("leaving the coast while its first-visit reveal plays ends the reveal cleanly", async ({ page }) => {
  const errors = await load(page, save(700));
  await hook(page, "coastTo", 5);
  await hook(page, "set", { hall: 6, view: "room", tankId: null, panel: null, coastView: "all" });
  await expect(page.getByTestId("coast-reveal")).toBeVisible();
  // Skipping marks the intro seen, and that model update re-runs the reveal watcher: it must not call back in forever.
  await hook(page, "set", { hall: 0 });
  await expect(page.getByTestId("coast-reveal")).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const [width, height] of [[1366, 768], [1280, 720], [1024, 768], [1024, 600]] as const) {
  test(`penguin window camera and coast HUD fit at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors = await load(page, save(700));
    await hook(page, "coastTo", 5);
    await hook(page, "set", { hall: 6, view: "room", tankId: null, panel: null, coastView: "all" });
    await expect(page.getByTestId("coast-reveal")).toBeVisible();
    await expect(page.getByTestId("coast-view-underwater")).toBeVisible();
    await expect(page.getByTestId("coast-view-seals")).toHaveCount(0);
    await expect(page.getByTestId("coast-view-otters")).toHaveCount(0);
    // A HUD action both skips the tour and performs its original action.
    await page.getByTestId("coast-view-penguins").click();
    await expect(page.getByTestId("coast-reveal")).toHaveCount(0);
    await expect(page.getByTestId("coast-view-underwater")).toBeVisible();
    await page.waitForTimeout(1600);
    type CameraState = { camera: { pos: { x: number; y: number; z: number } } };
    const land = (await state(page) as unknown as CameraState).camera.pos;
    expect(land.z).toBeLessThan(-35);
    expect(land.y).toBeLessThan(14);
    await page.getByTestId("coast-view-underwater").click();
    await expect(page.getByTestId("coast-view-underwater")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1600);
    const water = (await state(page) as unknown as CameraState).camera.pos;
    expect(water.y).toBeLessThan(land.y - 3);
    expect(water.y).toBeLessThan(1.4);
    expect(water.y).toBeCloseTo(-1.45, 1);
    // Standing back in the lower gallery (local z = 30) so its walkway shows.
    expect(water.z).toBeCloseTo(-30, 1);

    const box = async (tid: string) => (await page.getByTestId(tid).boundingBox())!;
    const goals = await box("coast-goals"), views = await box("coast-views"), status = await box("coast-status");
    const settings = await box("btn-settings"), bar = await box("btn-coast-items");
    for (const b of [goals, views, status, bar]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(height + 0.5);
    }
    expect(views.y).toBeGreaterThanOrEqual(goals.y + goals.height - 1);
    expect(status.y).toBeGreaterThanOrEqual(settings.y + settings.height - 1);
    expect(views.y + views.height).toBeLessThanOrEqual(bar.y + 1);
    expect(status.x).toBeGreaterThan(views.x + views.width);

    await page.getByTestId("coast-view-penguins").click();
    await expect(page.getByTestId("coast-view-underwater")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("coast-view-penguins")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1600);
    expect((await state(page) as unknown as CameraState).camera.pos.y).toBeGreaterThan(land.y - 0.2);
    // Penguin-only coast: no "All" view (the same picture as Penguins), no Seals / Otters views.
    for (const view of ["all", "seals", "otters"]) await expect(page.getByTestId(`coast-view-${view}`)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
