import { expect, test } from "@playwright/test";
import { newModel } from "../../src/game/logic/model";
import { encodeSave } from "../../src/game/logic/save";
import { boot, click3d, hook, playing, state, waitFor } from "./helpers";

test("visitor clues preserve the assessment and pattern meanings become optional", async ({ page }) => {
  const model = newModel();
  model.progress = { ...model.progress, stage: 3, tutorial: "done", firstFish: "clownfish" };
  model.tanks[0].fish = [{ id: "f2", species: "clownfish" }, { id: "f3", species: "bluetang" }];
  model.nextId = 4;
  await page.addInitScript((saved) => {
    localStorage.setItem("at.save.v1", saved);
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
  }, encodeSave(model));
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  await playing(page);
  await hook(page, "visitors", false);
  await hook(page, "requestVisitor", "adult", { kind: "show", color: "blue", fishOnly: true });
  await page.getByTestId("chip-visitor").click();
  const request = page.getByTestId("request");
  await expect(request).toHaveAttribute("data-request-tier", "1");
  await expect(page.getByTestId("request-keyword")).toHaveCount(0);
  await expect(page.getByTestId("request-swatch")).toHaveCount(0);
  await expect(page.getByTestId("tap-hand")).toHaveAttribute("data-hand-target", "");
  await expect(request.getByTestId("sentence-meaning")).toHaveText("＿＿の さかなが すきです。");
  await expect(request).not.toContainText("あお");
  await click3d(page, "tank", "t1");
  await waitFor(page, (s) => s.view === "tank", 5000, "close-up");
  await page.waitForTimeout(900);
  await hook(page, "freezeFish", true);
  await expect(page.getByTestId("request-line")).toHaveText("I like blue fish!");
  await expect(page.getByTestId("request-action")).toContainText("TAP A FISH!");
  for (let misses = 1; misses <= 3; misses++) {
    await click3d(page, "fish", "f2");
    await waitFor(page, (s) => s.request?.misses === misses, 5000, `miss ${misses}`);
    await expect(page.getByTestId("request-keyword")).toHaveText("blue");
    await expect(page.getByTestId("request-swatch")).toHaveAttribute("data-color", "blue");
    await expect(page.getByTestId("request-action")).toContainText("TAP THE BLUE FISH!");
    await expect(request).not.toContainText("あお");
    if (misses < 3) await expect(page.getByTestId("tap-hand")).toHaveAttribute("data-hand-target", "");
    await page.waitForTimeout(800);
  }
  expect((await state(page)).requestStep?.fishIds).toEqual(["f3"]);
  await expect(page.getByTestId("tap-hand")).toHaveAttribute("data-hand-target", "fish-f3");
  await page.getByTestId("btn-back").click();
  await waitFor(page, (s) => s.view === "room", 5000, "tier-three room clue");
  await expect(page.getByTestId("tap-hand")).toHaveAttribute("data-hand-target", "tank-t1");
  await click3d(page, "tank", "t1");
  await waitFor(page, (s) => s.view === "tank", 5000, "tier-three fish clue");
  await page.waitForTimeout(900);
  await expect(page.getByTestId("tap-hand")).toHaveAttribute("data-hand-target", "fish-f3");
  await expect(page.getByTestId("tap-hand")).toHaveCSS("pointer-events", "none");
  // The real canvas click passes through the hand at the indicated fish.
  await click3d(page, "fish", "f3");
  await expect(page.getByTestId("tap-hand")).toHaveAttribute("data-hand-target", "");
  await expect(page.getByTestId("request-keyword")).toHaveCount(0);
  await expect(page.getByTestId("request-swatch")).toHaveCount(0);
  await expect(page.getByTestId("sentence-meaning")).toHaveCount(0);
  await waitFor(page, (s) => !s.request && s.mode === "play", 15000, "visitor helped");
  await page.getByTestId("btn-back").click();
  await waitFor(page, (s) => s.view === "room", 5000, "room");
  await hook(page, "requestVisitor", "child", { kind: "show", color: "orange", fishOnly: true });
  await page.getByTestId("chip-visitor").click();
  await expect(page.getByTestId("sentence-meaning")).toHaveCount(0);
  await page.getByTestId("meaning-hint").click();
  await expect(request.getByTestId("sentence-meaning")).toHaveText("＿＿の さかなが すきです。");
  await expect(request).not.toContainText("オレンジの");
  await page.getByTestId("btn-settings").click();
  // The setting hides both an already revealed meaning and the hint control.
  const japanese = page.getByTestId("toggle-japanese");
  await japanese.click();
  await page.getByTestId("settings-close").click();
  await expect(page.getByTestId("sentence-meaning")).toHaveCount(0);
  await expect(page.getByTestId("meaning-hint")).toHaveCount(0);
  expect(errors).toEqual([]);
});
