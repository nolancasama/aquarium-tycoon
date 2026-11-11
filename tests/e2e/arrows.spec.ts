import { expect, test, type Page } from "@playwright/test";
import { boot, hook, state, waitFor } from "./helpers";

/**
 * Side arrows of the branching areas (data/rooms.ts AREA_LINKS): Shark Tunnel →
 * Grand Hub, Penguin Coast ↔ Grand Hub / Dolphin Lagoon, Dolphin Lagoon ↔
 * Penguin Coast / Grand Ocean Sanctuary. They travel through the doorway rules,
 * so a release-locked neighbour is shown locked and only says "Coming soon".
 */

let id = 700;
const tank = (type: string, slot: string, species: string[] = []) => ({
  id: `t${id++}`, type, slot, food: 90, clean: 95,
  fish: species.map((s) => ({ id: `f${id++}`, species: s })), decor: [], upgrades: { filter: false, lamp: false }
});
function save(coins: number) {
  return {
    coins, inv: { fish: [], decor: [], tanks: [] },
    tanks: [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
      tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish"]), tank("sharks", "L", ["blacktip", "eagleray"])],
    progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
      hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
      atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [], hubIntroSeen: true,
      tunnelOpen: true, tunnelIntroSeen: true, tunnel: { milestone: 3, observed: 6, helped: 3, findDone: false, whereDone: false, countDone: false, trophy: false } },
    rush: { unlocked: true, introSeen: true, phase: "waiting", untilNext: 900, pendingFor: 0, event: null, lastCommitted: null,
      stats: { events: 0, bronze: 0, silver: 0, gold: 0, successes: 0, best: null, bestReady: 0 }, rewards: [] },
    stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
  };
}

async function load(page: Page, coins = 600) {
  await page.addInitScript((m) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model: m }));
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
  }, save(coins));
  const errors = await boot(page, "fast=1&seed=11");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game");
  await hook(page, "visitors", false);
  return errors;
}

type Room = { roomId: string; fade: number };
const inRoom = (page: Page, r: string) => waitFor(page, (s) => (s as unknown as Room).roomId === r && (s as unknown as Room).fade === 0 && s.mode === "play", 15_000, `in ${r}`);
const roomId = async (page: Page) => ((await state(page)) as unknown as Room).roomId;
async function calm(page: Page) {
  for (let i = 0; i < 12; i++) {
    const s = await state(page);
    if (!s.line && s.mode === "play") { await page.waitForTimeout(400); if (!(await state(page)).line) return; }
    await page.getByTestId("next").click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

test("side arrows: Shark Tunnel → Grand Hub; coast and lagoon arrows travel only where a preview allows", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = await load(page, 600);
  await calm(page);

  // Shark Tunnel: Coral Reef Atrium on the left, Grand Hub on the right.
  await page.getByTestId("btn-map").click();
  await page.getByTestId("map-sharks").click();
  await inRoom(page, "sharks");
  await calm(page);
  await expect(page.getByTestId("btn-hall-prev")).toContainText("Coral Reef");
  await expect(page.getByTestId("btn-hall-next")).toContainText("Grand Hub");
  await expect(page.getByTestId("btn-hall-next")).not.toHaveAttribute("data-locked", "true");
  // Not while walking the tunnel.
  await page.getByTestId("btn-explore").click();
  await waitFor(page, (s) => Boolean((s as unknown as { exploring?: boolean }).exploring), 10_000, "exploring").catch(() => undefined);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("btn-hall-next")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await waitFor(page, (s) => !(s as unknown as { exploring?: boolean }).exploring, 10_000, "back from the walk");
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-hall-next").click();
  await inRoom(page, "hub");
  // The hub keeps its doorways only.
  await expect(page.getByTestId("btn-hall-next")).toHaveCount(0);

  // A lagoon preview: both neighbours are still release-locked.
  const coins = (await state(page)).coins;
  expect(await hook(page, "preview", "lagoon")).toBe(true);
  await hook(page, "outdoor", "lagoon");
  await inRoom(page, "lagoon");
  await page.waitForTimeout(6000);
  await calm(page);
  for (const tid of ["btn-hall-prev", "btn-hall-next"]) {
    await expect(page.getByTestId(tid)).toHaveAttribute("data-locked", "true");
    await page.getByTestId(tid).click();
    await expect(page.getByTestId("toast").filter({ hasText: "Coming soon" }).first()).toBeVisible();
    await page.waitForTimeout(600);
    expect(await roomId(page)).toBe("lagoon");
  }
  await expect(page.getByTestId("btn-hall-prev")).toContainText("Coastal");
  await expect(page.getByTestId("btn-hall-next")).toContainText("Sanctuary");

  // Preview the coast too: the lagoon's left arrow now walks there, and the coast's arrows lead on.
  await hook(page, "coastTo", 1);
  await calm(page);
  await expect(page.getByTestId("btn-hall-prev")).not.toHaveAttribute("data-locked", "true");
  await page.getByTestId("btn-hall-prev").click();
  await inRoom(page, "coast");
  await page.waitForTimeout(8500); // first-visit reveal
  await calm(page);
  await expect(page.getByTestId("btn-hall-prev")).toContainText("Grand Hub");
  await expect(page.getByTestId("btn-hall-next")).toContainText("Dolphin Lagoon");
  await page.getByTestId("btn-hall-next").click();
  await inRoom(page, "lagoon");
  await page.waitForTimeout(1200);
  await calm(page);
  await page.getByTestId("btn-hall-prev").click();
  await inRoom(page, "coast");
  await page.waitForTimeout(1200);
  await calm(page);
  await page.getByTestId("btn-hall-prev").click();
  await inRoom(page, "hub");

  // End preview: nothing was saved, the arrows' areas are locked again.
  await hook(page, "endPreview");
  await page.waitForTimeout(800);
  expect((await state(page)).coins).toBe(coins);
  await page.reload();
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game again");
  const rel = await hook<{ preview: string[] }>(page, "release");
  expect(rel.preview).toEqual([]);
  expect((await state(page)).coins).toBe(coins);
  expect(errors).toEqual([]);
});
