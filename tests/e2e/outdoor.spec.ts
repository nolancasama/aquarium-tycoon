import { expect, test, type Page } from "@playwright/test";
import { answer, boot, cameraStill, click3d, hook, state, waitFor } from "./helpers";

/**
 * The outdoor expansions (Dolphin Lagoon, Grand Ocean Sanctuary) are built but
 * release-locked: these tests reach them only through the development preview
 * (Ctrl+Alt+D), play them mic-free (Tap mode), return to the hub, and check
 * that ending the preview or reloading leaves the save exactly as it was.
 */

let id = 500;
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
const room = async (page: Page) => (await state(page)) as unknown as Room;
const inRoom = (page: Page, r: string) => waitFor(page, (s) => (s as unknown as Room).roomId === r && (s as unknown as Room).fade === 0 && s.mode === "play", 15_000, `in ${r}`);
async function clearLines(page: Page) {
  for (let i = 0; i < 10; i++) {
    if (!(await state(page)).line) { await page.waitForTimeout(500); if (!(await state(page)).line) return; }
    await page.getByTestId("next").click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
}
type Lagoon = { progress: { milestone: number; food: number; seen: string[]; acts: number; toys: string[]; decor: string[] } | null; view: string; toy: { kind: string } | null };
type Sanct = { progress: { milestone: number; stickers: string[]; belugas: boolean; cleanupDone: boolean; improvement: string | null; decor: string[]; trophy: boolean } | null; litter: { i: number; picked: boolean }[] };
const lagoon = (page: Page) => hook<Lagoon>(page, "lagoon");
const sanct = (page: Page) => hook<Sanct>(page, "sanctuary");
type Release = { preview: string[]; active: boolean };

async function clickAt(page: Page, hookName: string, what: string) {
  const p = await hook<{ x: number; y: number } | null>(page, hookName, what);
  if (!p) throw new Error(`nothing on screen for ${hookName} ${what}`);
  await page.mouse.click(p.x, p.y);
}

test("Ctrl+Alt+D previews the Dolphin Lagoon; it plays mic-free; back to the hub; End preview and a reload keep nothing", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await load(page, 600);
  await waitFor(page, (s) => s.mode === "play" && !s.line, 15_000, "calm");
  // The real debug menu, as a developer opens it.
  await page.keyboard.press("Control+Alt+KeyD");
  await expect(page.getByTestId("debug-panel")).toBeVisible();
  await page.getByTestId("debug-preview-lagoon").click();
  await page.keyboard.press("Control+Alt+KeyD");
  await inRoom(page, "lagoon");
  await expect(page.getByTestId("preview-badge")).toBeVisible();
  await page.waitForTimeout(4500);
  await clearLines(page);
  await expect(page.getByTestId("lagoon-goals")).toContainText("Welcome to the Lagoon");
  await expect(page.getByTestId("lagoon-status")).toBeVisible();

  // Milestone 1: look underwater (the underwater look switches on) and from the deck, then feed.
  await page.getByTestId("lagoon-view-gallery").click();
  await expect.poll(async () => (await hook<{ mode: string }>(page, "atmosphere")).mode, { timeout: 10_000 }).toBe("water");
  await page.waitForTimeout(1600);
  await page.getByTestId("lagoon-view-deck").click();
  await expect.poll(async () => (await hook<{ mode: string }>(page, "atmosphere")).mode, { timeout: 10_000 }).toBe("air");
  await page.waitForTimeout(1600);
  await page.getByTestId("btn-lagoon-feed").click();
  await expect.poll(async () => (await lagoon(page)).progress?.milestone, { timeout: 10_000 }).toBe(1);
  await expect(page.getByTestId("area-celebration")).toHaveAttribute("data-milestone", "1");
  expect((await lagoon(page)).progress!.decor).toEqual(["arch"]);

  // A toy into the water.
  await page.waitForTimeout(4500);
  await page.getByTestId("btn-lagoon-toys").click();
  await page.locator("[data-testid=lagoon-toy][data-toy=ball]").click();
  await expect.poll(async () => (await lagoon(page)).toy?.kind, { timeout: 5_000 }).toBe("ball");

  // A Look! moment, tapped on screen: the sight is recorded.
  await page.getByTestId("lagoon-view-lagoon").click();
  await page.waitForTimeout(2000);
  await hook(page, "lagoonLook", "pair", "kai");
  await page.waitForTimeout(600);
  await clickAt(page, "lagoonWhere", "look");
  await expect.poll(async () => (await lagoon(page)).progress?.seen, { timeout: 5_000 }).toContain("pair");

  // Two questions answered by tapping (no microphone): +3 each, then Dolphin Friends.
  const coins = (await state(page)).coins;
  await hook(page, "lagoonAsk", "count");
  await answer(page, "dl4");
  await waitFor(page, (s) => s.coins === coins + 3, 10_000, "+3 coins");
  await page.waitForTimeout(1200);
  await hook(page, "lagoonAsk", "what");
  await answer(page, "itsDolphin");
  await expect.poll(async () => (await lagoon(page)).progress?.milestone, { timeout: 10_000 }).toBe(2);
  expect((await lagoon(page)).progress!.toys).toContain("kelp");

  // Return to Grand Hub from the debug menu; in the preview its lagoon doorway leads back in.
  await page.keyboard.press("Control+Alt+KeyD");
  await page.getByTestId("debug-return-hub").click();
  await page.keyboard.press("Control+Alt+KeyD");
  await inRoom(page, "hub");
  await cameraStill(page);
  await click3d(page, "hub-door", "lagoon");
  await inRoom(page, "lagoon");

  // End preview: the saved game is back exactly (coins, no lagoon), the doorway locked again.
  await page.keyboard.press("Control+Alt+KeyD");
  await page.getByTestId("debug-end-preview").click();
  await page.keyboard.press("Control+Alt+KeyD");
  await waitFor(page, (s) => (s as unknown as Room).roomId === "hub", 5_000, "back in the hub");
  expect((await state(page)).coins).toBe(600);
  expect((await lagoon(page)).progress).toBeNull();
  expect((await hook<Release>(page, "release")).active).toBe(false);
  await expect(page.getByTestId("preview-badge")).toHaveCount(0);
  await cameraStill(page);
  await click3d(page, "hub-door", "lagoon");
  await expect(page.getByTestId("toast").filter({ hasText: "Coming soon" }).first()).toBeVisible();
  expect((await room(page)).roomId).toBe("hub");

  // A reload: nothing of the preview was ever saved.
  await page.reload();
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game again");
  expect((await state(page)).coins).toBe(600);
  expect((await lagoon(page)).progress).toBeNull();
  expect(errors).toEqual([]);
});

test("Grand Ocean Sanctuary preview: a research sticker, the cleanup by tapping litter, a habitat choice, Pico's tour, the trophy once", async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await load(page, 600);
  await waitFor(page, (s) => s.mode === "play" && !s.line, 15_000, "calm");
  expect(await hook(page, "preview", "sanctuary")).toBe(true);
  await hook(page, "outdoor", "sanctuary");
  await inRoom(page, "sanctuary");
  await page.waitForTimeout(7000);
  await clearLines(page);
  await expect(page.getByTestId("sanctuary-goals")).toContainText("Welcome to the Sanctuary");
  await expect(page.getByTestId("sanctuary-view-belugas")).toHaveAttribute("aria-disabled", "true");

  // Research: a breath, tapped as a Look! moment, is the first sticker and the first milestone.
  await hook(page, "sanctuaryLook", "breath", "kuro");
  await page.waitForTimeout(700);
  await clickAt(page, "sanctuaryWhere", "look");
  await expect.poll(async () => (await sanct(page)).progress?.milestone, { timeout: 8_000 }).toBe(1);
  expect((await sanct(page)).progress!.stickers).toEqual(["breath"]);

  // Through the real rules to Family and Friends: Beluga Cove opens.
  await hook(page, "sanctuaryTo", 3);
  await expect(page.getByTestId("sanctuary-view-belugas")).not.toHaveAttribute("aria-disabled", "true");

  // Ocean Cleanup: five pieces of floating litter, each tapped.
  await page.waitForTimeout(4500);
  await page.getByTestId("btn-sanctuary-cleanup").click();
  await expect.poll(async () => (await sanct(page)).litter.length, { timeout: 5_000 }).toBe(5);
  await page.waitForTimeout(3000);
  for (let i = 0; i < 5; i++) {
    await clickAt(page, "sanctuaryWhere", `litter:${i}`);
    await expect.poll(async () => (await sanct(page)).litter.find((l) => l.i === i)?.picked, { timeout: 5_000 }).toBe(true);
    await page.waitForTimeout(300);
  }
  await expect.poll(async () => (await sanct(page)).progress?.cleanupDone, { timeout: 5_000 }).toBe(true);
  expect((await sanct(page)).progress!.stickers).toContain("clean");

  // Habitat Improvement: an unsuitable choice is explained, a good one applied: Ocean Guardians.
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-sanctuary-improve").click();
  await page.locator("[data-testid=improve-choice][data-choice=music]").click();
  await expect(page.getByTestId("improve-reason")).toContainText("おおきな おと");
  expect((await sanct(page)).progress!.improvement).toBeNull();
  await page.locator("[data-testid=improve-choice][data-choice=kelp]").click();
  await expect.poll(async () => (await sanct(page)).progress?.milestone, { timeout: 8_000 }).toBe(4);
  expect((await sanct(page)).progress!.decor).toEqual(["flags", "sizeBoard", "guardianFlag"]);

  // Pico's tour: five questions in a row, all by tapping; the trophy.
  await page.waitForTimeout(5000);
  const before = (await state(page)).coins;
  await page.getByTestId("btn-sanctuary-tour").click();
  await answer(page, "itsOrca");
  await answer(page, "oc4");
  await waitFor(page, (s) => Boolean(s.prompt), 40_000, "the where question");
  const focus = await hook<{ frame: string }>(page, "sanctuaryFocus");
  await answer(page, focus.frame === "island" ? "byIsland" : "byBoat");
  await answer(page, "itsBeluga");
  await answer(page, "yesIDo");
  await expect.poll(async () => (await sanct(page)).progress?.trophy, { timeout: 10_000 }).toBe(true);
  expect((await state(page)).coins).toBe(before + 15);
  // Jumping to the end again changes nothing: no second reward.
  await hook(page, "sanctuaryTo", 5);
  await page.waitForTimeout(500);
  expect((await sanct(page)).progress!.decor).toEqual(["flags", "sizeBoard", "guardianFlag"]);
  expect((await state(page)).coins).toBe(before + 15);

  expect(await hook(page, "endPreview")).toBe(true);
  expect((await state(page)).coins).toBe(600);
  expect((await sanct(page)).progress).toBeNull();
  expect(errors).toEqual([]);
});

for (const [w, h] of [[1366, 768], [1280, 720], [1024, 768]] as const) {
  test(`outdoor HUD fits at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: w, height: h });
    const errors = await load(page, 600);
    await waitFor(page, (s) => s.mode === "play" && !s.line, 15_000, "calm");
    for (const area of ["lagoon", "sanctuary"] as const) {
      await hook(page, "preview", area);
      await hook(page, "outdoor", area);
      await inRoom(page, area);
      await page.waitForTimeout(7000);
      await clearLines(page);
      await page.waitForTimeout(800);
      const box = async (tid: string) => (await page.getByTestId(tid).boundingBox())!;
      const goals = await box(`${area}-goals`), views = await box(`${area}-views`);
      const status = await box(area === "lagoon" ? "lagoon-status" : "sanctuary-research");
      const settings = await box("btn-settings");
      const bar = await box(area === "lagoon" ? "btn-lagoon-feed" : "btn-sanctuary-notebook");
      // Inside the screen, and not on top of each other.
      for (const b of [goals, views, status, bar]) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(w + 0.5);
        expect(b.y + b.height).toBeLessThanOrEqual(h + 0.5);
      }
      expect(views.y).toBeGreaterThanOrEqual(goals.y + goals.height - 1);
      expect(status.y).toBeGreaterThanOrEqual(settings.y + settings.height - 1);
      expect(views.y + views.height).toBeLessThanOrEqual(bar.y + 1);
      expect(status.x).toBeGreaterThan(views.x + views.width);
    }
    expect(errors).toEqual([]);
  });
}
