import { expect, test, type Page } from "@playwright/test";
import { boot, click3d, hook, playing, shot, state, waitFor } from "./helpers";

const SAVE = {
  v: 1,
  model: {
    coins: 120,
    tanks: [
      { id: "t1", type: "small", slot: "A", fish: [{ id: "f2", species: "clownfish" }, { id: "f3", species: "bluetang" }], decor: [{ id: "d4", kind: "plant", variant: "small", slot: 0 }], food: 30, clean: 35 },
      { id: "t7", type: "big", slot: "B", fish: [{ id: "f8", species: "yellowfish" }], decor: [], food: 90, clean: 90 }
    ],
    inv: { fish: [{ id: "f9", species: "clownfish" }], decor: [{ id: "d5", kind: "shell", variant: null }], tanks: [] },
    progress: { stage: 5, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 6, helpedInStage: 1, said: [] },
    stats: { coinsEarned: 100, helped: 6, fishBought: 4, seconds: 900 },
    nextId: 10,
    paid: []
  }
};

const OCEAN_SAVE = {
  v: 2,
  model: {
    ...SAVE.model,
    tanks: [...SAVE.model.tanks,
      { id: "t11", type: "ocean", slot: "C", fish: [{ id: "f12", species: "turtle" }], decor: [], food: 100, clean: 100 },
      { id: "t13", type: "tall", slot: "D", fish: [{ id: "f14", species: "seahorse" }], decor: [], food: 100, clean: 100 },
      { id: "t15", type: "tall", slot: "E", fish: [{ id: "f16", species: "jellyfish" }], decor: [], food: 100, clean: 100 }
    ],
    progress: { ...SAVE.model.progress, stage: 6, hallOpen: true, star: true, freePlay: true },
    nextId: 17
  }
};

async function seed(page: Page, mic: boolean, ocean = false) {
  await page.addInitScript(
    ([save, m]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("at.save.v1", JSON.stringify(save));
      localStorage.setItem("at.settings.v1", JSON.stringify({ mic: m, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    },
    [ocean ? OCEAN_SAVE : SAVE, mic] as const
  );
}

for (const size of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 844, height: 390 }
]) {
  test.describe(`centered HUD ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("objectives collapse independently of viewport-centered status and controls", async ({ page }) => {
      await seed(page, false, true);
      const errors = await boot(page);
      await page.getByTestId("btn-continue").click();
      await playing(page);
      await hook(page, "visitors", false);
      const toggle = page.getByTestId("btn-objectives");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveAttribute("aria-controls", "objective-details");
      await expect(page.getByTestId("guide-next")).toBeVisible();

      const center = async () => {
        const box = (await page.getByTestId("player-status").boundingBox())!;
        expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(1);
        return box.x + box.width / 2;
      };
      const before = await center();
      await checkLayout(page, ["player-status", "goals", "btn-help", "btn-settings"], "collapsed HUD");
      await shot(page, `hud-${size.width}x${size.height}-collapsed`);

      // Keyboard interaction must expose all goals without moving status.
      await toggle.focus();
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const details = page.locator("#objective-details");
      await expect(details).toBeVisible();
      for (const goal of (await state(page)).goals) {
        await expect(page.getByTestId(`goal-${goal.id}`)).toBeVisible();
      }
      expect(await center()).toBeCloseTo(before, 1);
      await checkLayout(page, ["player-status", "goals", "btn-help", "btn-settings"], "expanded HUD");
      await shot(page, `hud-${size.width}x${size.height}-expanded`);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(details).toBeHidden();
      expect(await center()).toBeCloseTo(before, 1);

      // Level Overview remains accessible from the centered level indicator.
      await page.getByTestId("level").click();
      await expect(page.getByTestId("level-overview")).toBeVisible();
      expect(await center()).toBeCloseTo(before, 1);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("level-overview")).toBeHidden();

      // The aquarium itself is the reason for the layout: include all three
      // Ocean Hall tanks, with both objective states and an active request.
      for (const hall of [0, 1]) {
        if ((await state(page)).hall !== hall) {
          await page.getByTestId(hall ? "btn-hall-next" : "btn-hall-prev").click();
          await page.waitForTimeout(1200);
        }
        for (const expanded of [false, true]) {
          if ((await toggle.getAttribute("aria-expanded")) !== String(expanded)) await toggle.click();
          await checkTankFaces(page, hall);
          await center();
          await checkLayout(page, ["goals", hall ? "btn-hall-prev" : "btn-hall-next", "player-status", "btn-help", "btn-settings", "chip-bag"], "hall HUD");
        }
        await hook(page, "requestVisitor", "adult", { kind: "show", color: "blue", fishOnly: true });
        await page.getByTestId("chip-visitor").click();
        await expect(page.getByTestId("request")).toBeVisible();
        await checkTankFaces(page, hall);
        await page.getByTestId("request-later").click();
        await expect(page.getByTestId("request")).toBeHidden();
      }
      expect(errors).toEqual([]);
    });
  });
}

type Box = { id: string; x: number; y: number; w: number; h: number };

async function checkTankFaces(page: Page, hall: number) {
  const s = await state(page);
  for (const tank of s.tanks.filter((t) => (["C", "D", "E"].includes(t.slot) ? 1 : 0) === hall)) {
    const p = await hook<{ x: number; y: number }>(page, "where", "badge", tank.id);
    for (const id of ["goals", "request", "player-status", "btn-help", "btn-settings"]) {
      const control = page.getByTestId(id);
      if (!(await control.isVisible())) continue;
      const b = (await control.boundingBox())!;
      const covered = p.x + 24 > b.x && p.x - 24 < b.x + b.width && p.y + 24 > b.y && p.y - 24 < b.y + b.height;
      expect(covered, `${id} covers tank ${tank.slot}'s happiness face`).toBe(false);
    }
  }
}

/** Every listed HUD element is on screen, big enough, and no two overlap. */
async function checkLayout(page: Page, ids: string[], label: string) {
  const vp = page.viewportSize()!;
  const boxes: Box[] = [];
  for (const id of ids) {
    const el = page.getByTestId(id).first();
    await expect(el, `${label}: ${id} visible`).toBeVisible();
    const b = (await el.boundingBox())!;
    boxes.push({ id, x: b.x, y: b.y, w: b.width, h: b.height });
    expect(b.x, `${label}: ${id} left edge`).toBeGreaterThanOrEqual(0);
    expect(b.y, `${label}: ${id} top edge`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `${label}: ${id} right edge`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.height, `${label}: ${id} bottom edge`).toBeLessThanOrEqual(vp.height + 0.5);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      expect(overlap, `${label}: ${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

async function minButton(page: Page, selector: string, min: number) {
  for (const b of await page.locator(selector).all()) {
    const box = (await b.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(min);
  }
}

for (const size of [
  { w: 1366, h: 768, touch: false },
  { w: 1280, h: 800, touch: true },
  { w: 1024, h: 600, touch: true }
]) {
  test.describe(`${size.w}x${size.h}${size.touch ? " touch" : ""}`, () => {
    test.use({ viewport: { width: size.w, height: size.h }, hasTouch: size.touch });

    test("HUD, close-up and prompts fit; shops work by touch", async ({ page }) => {
      await seed(page, false);
      const errors = await boot(page);
      const press = (id: string) => (size.touch ? page.getByTestId(id).tap() : page.getByTestId(id).click());
      await press("btn-continue");
      await playing(page);
      await page.waitForTimeout(500);
      await checkLayout(page, ["coins", "level", "hearts", "goals", "btn-settings", "btn-fish-shop", "btn-decor-shop", "btn-tank-shop", "chip-bag"], "room");
      await minButton(page, ".big-btn", 64);
      // Close-up.
      await click3d(page, "tank", "t1");
      await waitFor(page, (x) => x.view === "tank", 5_000, "close-up");
      await page.waitForTimeout(900);
      await checkLayout(page, ["coins", "goals", "btn-settings", "status", "btn-back", "btn-feed", "btn-clean", "btn-decorate"], "tank");
      // The status panel stands just right of the glass, its top level with the tank's.
      // The camera eases its lens shift in; measure once the glass has stopped moving.
      let glass = (await hook<{ left: number; right: number; top: number }>(page, "glass", "t1"))!;
      await expect
        .poll(async () => {
          const now = (await hook<{ left: number; right: number; top: number }>(page, "glass", "t1"))!;
          const still = Math.abs(now.right - glass.right) < 0.5 && Math.abs(now.top - glass.top) < 0.5;
          glass = now;
          return still;
        }, { intervals: [250], timeout: 10_000 })
        .toBe(true);
      await page.waitForTimeout(500);
      const status = (await page.getByTestId("status").boundingBox())!;
      expect(status.x - glass.right, "gap right of glass").toBeGreaterThan(8);
      expect(status.x - glass.right, "gap right of glass").toBeLessThan(48);
      expect(Math.abs(status.y - glass.top), "top aligned with tank").toBeLessThan(20);
      expect(status.x + status.width).toBeLessThanOrEqual(size.w);
      expect(glass.left).toBeGreaterThanOrEqual(0);
      await minButton(page, ".big-btn", 64);
      // A prompt (decoration shop, "Big or small?") with its pictures and buttons.
      await press("btn-decorate");
      await press("tray-shop");
      await expect(page.getByTestId("decor-shop")).toBeVisible();
      await checkLayout(page, ["decor-shop"], "decor shop");
      const plant = page.locator("[data-testid=decor-card][data-kind=plant]");
      if (size.touch) await plant.tap();
      else await plant.click();
      await waitFor(page, (x) => Boolean(x.prompt?.buttons), 5_000, "size prompt");
      await checkLayout(page, ["prompt", "decor-choice"], "prompt");
      await minButton(page, "[data-testid=choice]", 56);
      const big = page.locator("[data-testid=choice][data-id=bigPlease]");
      if (size.touch) await big.tap();
      else await big.click();
      const s = await waitFor(page, (x) => x.placing?.kind === "decor", 5_000, "bought by touch");
      expect(s.coins).toBe(112);
      expect(errors).toEqual([]);
      void state;
    });
  });
}
