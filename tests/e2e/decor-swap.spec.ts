import { expect, test, type Page } from "@playwright/test";
import { newModel, type Model } from "../../src/game/logic/model";
import { encodeSave } from "../../src/game/logic/save";
import { openTank } from "./flows";
import { boot, click3d, hook, playing, shot, state, waitFor } from "./helpers";

function swapFixture(): Model {
  const m = newModel();
  return {
    ...m,
    progress: { ...m.progress, stage: 4, tutorial: "done", counted: true, fedOnce: true, cleanedOnce: true },
    tanks: [{ ...m.tanks[0], decor: [
      { id: "d2", kind: "plant", variant: "big", slot: 0 },
      { id: "d3", kind: "rock", variant: "small", slot: 1 }
    ] }],
    inv: { ...m.inv, decor: [
      { id: "d4", kind: "coral", variant: "blue" },
      { id: "d5", kind: "shipwreck", variant: null }
    ] },
    nextId: 6
  };
}

async function openDecorate(page: Page) {
  await page.addInitScript((save) => {
    if (sessionStorage.getItem("decor-swap-seeded")) return;
    sessionStorage.setItem("decor-swap-seeded", "1");
    localStorage.setItem("at.save.v1", save);
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, japanese: true, music: 0, sfx: 0, audioSetupDone: true }));
  }, encodeSave(swapFixture()));
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  await playing(page);
  await hook(page, "visitors", false);
  await openTank(page, "t1");
  await page.getByTestId("btn-decorate").click();
  await expect(page.getByTestId("tray")).toBeVisible();
  return errors;
}

const trayItem = (page: Page, id: string) => page.locator(`[data-testid=tray-item][data-id=${id}]`);

test("occupied circles and decorations swap directly, keep selection, and save the final placement", async ({ page }) => {
  const errors = await openDecorate(page);
  const coins = (await state(page)).coins;
  await expect(page.getByTestId("tray")).toContainText("Choose a decoration!");
  await expect(page.getByTestId("tray")).toContainText("かざりを えらぼう！");
  await trayItem(page, "d4").click();
  await expect(trayItem(page, "d4")).toHaveClass(/picked/);
  await expect(page.getByTestId("tray")).toContainText("Tap a circle to place or swap!");
  await expect(page.getByTestId("tray")).toContainText("まるを タップして おく・いれかえる！");

  // The big plant partly covers the occupied circle; its geometry is a target too.
  await click3d(page, "decor", "t1:0");
  let s = await waitFor(page, (x) => x.inv.decor.some((d) => d.id === "d2"), 5_000, "plant returned to tray");
  expect(s.tanks[0].decor.find((d) => d.slot === 0)).toEqual({ slot: 0, kind: "coral", variant: "blue" });
  expect(s.placing?.kind).toBe("decor");
  await expect(trayItem(page, "d2")).toHaveClass(/picked/);
  await expect(page.getByTestId("btn-put-away")).toHaveCount(0);
  await shot(page, "decor-swap-displaced-selected");

  for (let i = 0; i < 4; i++) {
    await click3d(page, "slot", "t1:0");
    const selectedId = i % 2 === 0 ? "d4" : "d2";
    await expect(trayItem(page, selectedId)).toHaveClass(/picked/);
    s = await state(page);
    expect(s.placing?.kind).toBe("decor");
    expect(s.tanks[0].decor).toHaveLength(2);
    expect(s.inv.decor).toHaveLength(2);
    expect(s.coins).toBe(coins);
  }

  // Carry the displaced plant straight into a different occupied slot.
  await click3d(page, "slot", "t1:1");
  await expect(trayItem(page, "d3")).toHaveClass(/picked/);
  s = await state(page);
  expect(s.tanks[0].decor.find((d) => d.slot === 1)).toEqual({ slot: 1, kind: "plant", variant: "big" });
  // An empty placement clears the selection as before.
  await click3d(page, "slot", "t1:2");
  s = await waitFor(page, (x) => x.tanks[0].decor.length === 3 && !x.placing, 5_000, "rock placed in empty circle");
  expect(s.inv.decor).toEqual([{ id: "d5", kind: "shipwreck", variant: null }]);
  expect(s.coins).toBe(coins);
  await expect(page.locator("[data-testid=tray-item].picked")).toHaveCount(0);

  // With no tray selection, the original select-and-move interaction remains.
  await click3d(page, "decor", "t1:2");
  await waitFor(page, (x) => x.placing?.kind === "move", 5_000, "existing move mode");
  await expect(page.getByTestId("btn-put-away")).toBeVisible();
  await page.getByTestId("btn-done-decor").click();
  const expectedDecor = (await state(page)).tanks[0].decor;
  await expect.poll(async () => page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("at.save.v1") ?? "null");
    return save?.model.tanks[0].decor.length;
  })).toBe(3);
  await page.reload();
  await page.getByTestId("btn-continue").click();
  s = await playing(page);
  expect(s.tanks[0].decor).toEqual(expectedDecor);
  expect(s.inv.decor).toEqual([{ id: "d5", kind: "shipwreck", variant: null }]);
  expect(errors).toEqual([]);
});

test("an incompatible tray decoration leaves occupied and empty circles unchanged", async ({ page }) => {
  const errors = await openDecorate(page);
  const before = await state(page);
  await trayItem(page, "d5").click();
  for (const [kind, target] of [["decor", "t1:0"], ["slot", "t1:2"]]) {
    await click3d(page, kind, target);
    await expect(page.getByTestId("toast").filter({ hasText: "Too big!" }).last()).toBeVisible();
    const after = await state(page);
    expect(after.tanks[0].decor).toEqual(before.tanks[0].decor);
    expect(after.inv).toEqual(before.inv);
    expect(after.coins).toBe(before.coins);
    expect(after.placing?.kind).toBe("decor");
    await expect(trayItem(page, "d5")).toHaveClass(/picked/);
    await expect(page.getByTestId("btn-put-away")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
