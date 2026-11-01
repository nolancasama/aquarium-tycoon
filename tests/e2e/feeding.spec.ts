import { expect, test, type Page } from "@playwright/test";
import { boot, hook, playing, state, waitFor } from "./helpers";

const fish = (species: string[], base: number) => species.map((s, i) => ({ id: `f${base + i}`, species: s }));
const tank = (id: string, type: string, slot: string, species: string[], base: number) => ({
  id, type, slot, food: 30, clean: 100, fish: fish(species, base), decor: [], upgrades: { filter: false, lamp: false }, light: null
});
const SAVE = {
  v: 3,
  model: {
    coins: 500,
    tanks: [tank("mixed", "big", "A", ["clownfish", "bluetang", "crab"], 1), tank("cave", "cave", "B", ["eel", "octopus"], 10)],
    inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, superStar: true, tipsTaught: true, said: ["orangePlease", "feedFish"] },
    stats: { coinsEarned: 300, helped: 10, fishBought: 5, seconds: 1500 },
    nextId: 40,
    paid: []
  }
};

async function open(page: Page, tankId: string) {
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("at.save.v1", JSON.stringify(save));
      sessionStorage.setItem("seeded", "1");
    }
  }, SAVE);
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  const loaded = await waitFor(page, (s) => s.screen === "game" && s.tanks.some((t) => t.id === tankId), 15_000, "save loaded");
  expect(loaded.stage).toBe(8);
  await hook(page, "visitors", false);
  // Pico's one-time introduction of the expansion runs first.
  await playing(page);
  await hook(page, "set", { view: "tank", tankId, hall: 0 });
  await expect(page.getByTestId("btn-feed")).toBeVisible();
  return errors;
}
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __ttsSpoken: string[] }).__ttsSpoken);
const foodOf = async (page: Page, id: string) => (await state(page)).tanks.find((t) => t.id === id)!.food;

test("one tap feeds a mixed tank what each animal eats, with no chooser", async ({ page }) => {
  const errors = await open(page, "mixed");
  const before = await foodOf(page, "mixed");
  await page.getByTestId("btn-feed").click();
  await waitFor(page, (s) => s.pellets > 0, 5_000, "food dropped");
  expect(await foodOf(page, "mixed")).toBeGreaterThan(before + 50);
  const s = await state(page);
  expect(s.prompt).toBeFalsy();
  expect([...new Set(s.pelletFoods)].sort()).toEqual(["flakes", "seafood", "seaweed"]);
  await expect(page.getByTestId("food-strip")).toBeVisible();
  for (const food of ["flakes", "seaweed", "seafood"]) await expect(page.getByTestId(`food-${food}`)).toBeVisible();
  // It goes away by itself, leaving the meter and the bar as they were.
  await expect(page.getByTestId("food-strip")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("btn-feed")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a food word speaks and adds a free pinch", async ({ page }) => {
  const errors = await open(page, "mixed");
  // Held still, nothing eats the food, so the pinch can be counted exactly.
  await hook(page, "freezeFish", true);
  await page.getByTestId("btn-feed").click();
  const chip = page.getByTestId("food-seaweed");
  await expect(chip).toBeVisible();
  const before = await state(page);
  await chip.click();
  await expect.poll(async () => (await spoken(page)).includes("Seaweed")).toBe(true);
  const after = await state(page);
  expect(after.coins).toBe(before.coins);
  expect(after.tanks.find((t) => t.id === "mixed")!.food).toBeLessThanOrEqual(before.tanks.find((t) => t.id === "mixed")!.food);
  expect(after.pelletFoods.filter((f) => f === "seaweed").length).toBe(before.pelletFoods.filter((f) => f === "seaweed").length + 2);
  expect(errors).toEqual([]);
});

test("a tank with one diet shows one food and the action bar stays clickable", async ({ page }) => {
  const errors = await open(page, "cave");
  await page.getByTestId("btn-feed").click();
  await expect(page.getByTestId("food-seafood")).toBeVisible();
  await expect(page.locator(".food-chip")).toHaveCount(1);
  for (const id of ["btn-feed", "btn-clean", "btn-decorate"]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid"), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toBe(id);
  }
  expect(errors).toEqual([]);
});

for (const [width, height] of [[1366, 768], [1280, 720], [1024, 768]] as const) {
  test(`the food strip fits above the action bar at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, "mixed");
    await page.getByTestId("btn-feed").click();
    const strip = page.getByTestId("food-strip");
    await expect(strip).toBeVisible();
    const box = (await strip.boundingBox())!, bar = (await page.locator(".bar-main").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // Really on screen and on top: "above the bar" alone also passes when it is off the top.
    expect(box.y).toBeGreaterThan(height / 2);
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    const hit = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="food-strip"]')), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toBe(true);
    await page.screenshot({ path: `.tmp/feeding/strip-${width}x${height}.png` });
  });
}
