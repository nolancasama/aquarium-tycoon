import { expect, test, type Page } from "@playwright/test";
import { boot, click3d, hook, state, waitFor } from "./helpers";

/**
 * Grand Aquarium Hub: Pico's one-time introduction, the Map chip, travel to
 * the hub and back through real 3D doorway taps, the hall arrows unchanged,
 * a future attraction staying closed, the trophy card, and a reload that
 * keeps everything (no coins or animals lost, no second introduction).
 */

let id = 300;
const tank = (type: string, slot: string, species: string[] = []) => ({
  id: `t${id++}`, type, slot, food: 90, clean: 95,
  fish: species.map((s) => ({ id: `f${id++}`, species: s })), decor: [], upgrades: { filter: false, lamp: false }
});
function save(tunnelOpen: boolean) {
  const tanks = [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
    tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish"])];
  if (tunnelOpen) tanks.push(tank("sharks", "L", ["blacktip"]));
  return {
    coins: 420, tanks, inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
      hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
      atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [],
      ...(tunnelOpen ? { tunnelOpen: true, tunnelIntroSeen: true, tunnel: { milestone: 1, observed: 0, helped: 0, findDone: false, whereDone: false, countDone: false, trophy: false } } : {}) },
    rush: { unlocked: true, introSeen: true, phase: "waiting", untilNext: 900, pendingFor: 0, event: null, lastCommitted: null,
      stats: { events: 0, bronze: 0, silver: 0, gold: 0, successes: 0, best: null, bestReady: 0 }, rewards: [] },
    stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
  };
}

type Hub = { roomId: string; hubIntroSeen: boolean; mapOpen: boolean; fade: number };
const hstate = (page: Page) => state(page) as unknown as Promise<Awaited<ReturnType<typeof state>> & Hub>;

async function load(page: Page, model: unknown) {
  await page.addInitScript((m) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model: m }));
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
  }, model);
  const errors = await boot(page, "fast=1&seed=5");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game");
  await hook(page, "visitors", false);
  return errors;
}

async function clearLines(page: Page) {
  for (let i = 0; i < 8; i++) {
    const s = await state(page);
    if (!s.line) {
      await page.waitForTimeout(400);
      if (!(await state(page)).line) return;
    }
    await page.getByTestId("next").click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

const inRoom = (page: Page, room: string) =>
  waitFor(page, (s) => (s as unknown as Hub).roomId === room && (s as unknown as Hub).fade === 0 && s.mode === "play", 10_000, `in ${room}`);

test("no hub before the Shark Tunnel", async ({ page }) => {
  const errors = await load(page, save(false));
  await page.waitForTimeout(2500);
  await clearLines(page);
  await expect(page.getByTestId("btn-map")).toHaveCount(0);
  expect((await hstate(page)).hubIntroSeen).toBe(false);
  expect(errors).toEqual([]);
});

test("hub: introduction, map travel, doorways both ways, arrows unchanged, reload", async ({ page }) => {
  const errors = await load(page, save(true));
  // Pico's introduction plays once, in the hall the save opened in.
  // (Lines close by themselves in fast mode, so wait on the saved flag and the guided chip.)
  await waitFor(page, (s) => (s as unknown as Hub).hubIntroSeen, 10_000, "hub intro");
  await waitFor(page, (s) => s.nudge?.target === "btn-map", 10_000, "map chip pointed at");
  await clearLines(page);
  await expect(page.getByTestId("btn-map")).toBeEnabled();

  // The map: the hub is the first card; Hall 1 is "here".
  await page.getByTestId("btn-map").click();
  await expect(page.getByTestId("aquarium-map")).toBeVisible();
  await expect(page.getByTestId("map-room-hall").getByTestId("map-here")).toBeVisible();
  // All three release-locked destinations: a lock and "Coming soon"; a tap only says so.
  await expect(page.getByTestId("map-lagoon")).toHaveAttribute("aria-label", /coming soon/);
  for (const id of ["map-coast", "map-lagoon", "map-sanctuary"]) await expect(page.getByTestId(id)).toHaveAttribute("data-soon", "true");
  await expect(page.getByTestId("map-sanctuary")).toContainText("Grand Ocean Sanctuary");
  await page.getByTestId("map-sanctuary").click();
  await expect(page.getByTestId("map-sanctuary-soon")).toContainText("Coming soon!");
  await expect(page.getByTestId("map-sanctuary-soon")).toContainText("おたのしみに");
  await expect(page.getByTestId("aquarium-map")).toBeVisible();
  expect((await hstate(page)).roomId).toBe("hall");
  await page.getByTestId("map-hub").click();
  await inRoom(page, "hub");
  await expect(page.getByTestId("hub-hint")).toBeVisible();
  // No hall arrows or shop bar in the hub.
  await expect(page.getByTestId("btn-hall-next")).toHaveCount(0);
  await expect(page.getByTestId("btn-hall-prev")).toHaveCount(0);
  await expect(page.getByTestId("btn-fish-shop")).toHaveCount(0);
  await page.waitForTimeout(900);

  // The release-locked doorways stay closed; the room and the coins do not change.
  const coins = (await hstate(page)).coins;
  for (const door of ["lagoon", "sanctuary", "coast"]) {
    await click3d(page, "hub-door", door);
    await expect(page.getByTestId("toast").filter({ hasText: "Coming soon" }).first()).toBeVisible();
    await expect(page.getByTestId("toast").filter({ hasText: "おたのしみに" }).first()).toBeVisible();
    await page.waitForTimeout(500);
    expect((await hstate(page)).roomId).toBe("hub");
  }
  expect((await hstate(page)).coins).toBe(coins);
  await expect(page.getByTestId("coast-offer")).toHaveCount(0);

  // Through the Shark Tunnel doorway, then back with the map.
  await click3d(page, "hub-door", "sharks");
  await inRoom(page, "sharks");
  await page.getByTestId("btn-map").click();
  await page.getByTestId("map-hub").click();
  await inRoom(page, "hub");
  await page.waitForTimeout(900);

  // The indoor doorway returns to the indoor hall the player came from (Hall 1).
  await click3d(page, "hub-door", "indoor");
  await inRoom(page, "hall");
  await expect(page.getByTestId("btn-hall-next")).toBeVisible();
  await page.getByTestId("btn-hall-next").click();
  await inRoom(page, "ocean");

  // Map straight to the Atrium; its arrows still lead to the Gallery and the Shark Tunnel.
  await page.getByTestId("btn-map").click();
  await page.getByTestId("map-room-atrium").click();
  await inRoom(page, "atrium");
  await expect(page.getByTestId("btn-hall-prev")).toContainText("Jellyfish");
  await expect(page.getByTestId("btn-hall-next")).toContainText("Shark");

  // Trophies from the hub.
  await page.getByTestId("btn-map").click();
  await page.getByTestId("map-hub").click();
  await inRoom(page, "hub");
  await page.waitForTimeout(900);
  await click3d(page, "hub-door", "trophies");
  await expect(page.getByTestId("hub-trophy-card")).toBeVisible();
  await expect(page.getByTestId("trophy-star")).toHaveAttribute("data-got", "true");
  await expect(page.getByTestId("trophy-sharks")).toHaveAttribute("data-got", "false");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("hub-trophy-card")).toHaveCount(0);

  // Reload: everything kept, no second introduction.
  const before = await hstate(page);
  await page.reload();
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game again");
  await page.waitForTimeout(3000);
  const after = await hstate(page);
  expect(after.coins).toBe(before.coins);
  expect(after.tanks.map((t) => t.fish.length)).toEqual(before.tanks.map((t) => t.fish.length));
  expect(after.hubIntroSeen).toBe(true);
  expect(after.line?.en ?? "").not.toContain("Grand Hub");
  expect(errors).toEqual([]);
});
