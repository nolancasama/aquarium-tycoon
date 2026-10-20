import { expect, test, type Page } from "@playwright/test";
import { boot, click3d, playing, state, waitFor } from "./helpers";

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

async function seed(page: Page, mic: boolean) {
  await page.addInitScript(
    ([save, m]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("at.save.v1", JSON.stringify(save));
      localStorage.setItem("at.settings.v1", JSON.stringify({ mic: m, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    },
    [SAVE, mic] as const
  );
}

type Box = { id: string; x: number; y: number; w: number; h: number };

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
