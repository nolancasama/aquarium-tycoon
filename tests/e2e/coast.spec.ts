import { expect, test, type Page } from "@playwright/test";
import { answer, boot, click3d, hook, state, waitFor } from "./helpers";

/**
 * Coastal & Polar Zone: opening it from the Grand Hub for coins, the penguin
 * slice (needs rocks -> place resting rocks -> happy; penguins walk, use the
 * ramp and swim; a visitor's "How many penguins?" answered by tapping), feeding,
 * and a reload that keeps the zone, its animals and its items.
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

type Coast = { open: boolean; milestone: number; view: string; entries: Record<string, number>; animals: { id: string; habitat: string; mode: string; area: string; y: number }[]; progress: Record<string, unknown> | null };
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

test("open the coast at the hub; penguins need rocks; a counting question; feed; reload", async ({ page }) => {
  const errors = await load(page, save(700));
  await waitFor(page, (s) => s.mode === "play" && !s.line, 10_000, "calm");
  await page.getByTestId("btn-map").click();
  await page.getByTestId("map-coast").click();
  // From the map: the offer (the zone is unlocked by the Shark Tunnel trophy).
  await expect(page.getByTestId("coast-offer")).toBeVisible();
  await page.getByTestId("btn-buy-coast").click();
  await waitFor(page, (s) => (s as unknown as { roomId: string }).roomId === "coast" && s.mode === "play", 15_000, "in the coast");
  let c = await coast(page);
  expect(c.open).toBe(true);
  expect(c.milestone).toBe(1);
  expect((await state(page)).coins).toBe(700 - 320);
  // Pico's two introduction lines (they close by themselves in fast mode).
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
  await hook(page, "coastVisitor", "penguins");
  await page.getByTestId("coast-visitor").click();
  await waitFor(page, (s) => s.prompt?.question === "How many penguins?", 10_000, "the question");
  await answer(page, "pg3");
  await waitFor(page, (s) => !s.prompt, 10_000, "answered");
  c = await coast(page);
  expect((c.progress as { penguinActs: number }).penguinActs).toBe(1);

  // Feed the penguins.
  await hook(page, "setCare", penguins.id, 30, 100);
  await page.getByTestId("btn-feed").click();
  await waitFor(page, (s) => s.tanks.find((t) => t.type === "penguins")!.food >= 85, 5_000, "fed");

  // Reload: the zone, its penguins and the rocks are kept.
  const coins = (await state(page)).coins;
  await page.reload();
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game again");
  const s2 = await state(page);
  expect(s2.coins).toBe(coins);
  const p2 = s2.tanks.find((t) => t.type === "penguins")!;
  expect(p2.fish).toEqual(["penguin", "penguin", "penguin"]);
  expect(p2.decor.map((d) => d.kind)).toEqual(["penguinRock"]);
  expect((await coast(page)).milestone).toBe(1);
  expect(errors).toEqual([]);
});

test("a real tap on a coastal slot ring places the item (no hook)", async ({ page }) => {
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
