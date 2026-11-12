import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { boot, hook, precondition, state } from "./helpers";

const SAVE_KEY = "at.save.v1";
const BACKUPS_KEY = "at.save.backups.v1";
const PINNED_KEY = "at.save.prerepair.v1";
const fixtureRaw = fs.readFileSync(new URL("../../src/game/logic/realSave.fixture.json", import.meta.url), "utf8");
const fixture = JSON.parse(fixtureRaw) as Saved;

interface SavedTank {
  id: string;
  slot: string;
  type: string;
  fish: { id: string; species: string }[];
  decor: { id: string; kind: string; variant: string | null; slot: number }[];
}
interface Saved {
  model: {
    coins: number;
    progress: { stage: number };
    tanks: SavedTank[];
    inv: { fish: unknown[]; decor: unknown[]; tanks: unknown[] };
    stored?: { tanks: SavedTank[]; fish: unknown[]; decor: unknown[] };
    quarantine?: { reason: string; raw: unknown }[];
  };
}

// Compare owned records, not hunger, dirt or elapsed time that naturally change in play.
function owned(save: Saved) {
  const m = save.model;
  const tanks = [...m.tanks, ...(m.stored?.tanks ?? [])].map((t) => ({
    id: t.id, slot: t.slot, type: t.type,
    fish: t.fish, decor: t.decor
  })).sort((a, b) => a.slot.localeCompare(b.slot));
  return {
    tanks,
    fish: [...m.inv.fish, ...(m.stored?.fish ?? [])],
    decor: [...m.inv.decor, ...(m.stored?.decor ?? [])],
    invTanks: m.inv.tanks
  };
}

const expected = owned(fixture);
const totalFish = expected.tanks.reduce((n, t) => n + t.fish.length, expected.fish.length);
const totalDecor = expected.tanks.reduce((n, t) => n + t.decor.length, expected.decor.length);
const readRaw = (page: Page) => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
const readSaved = async (page: Page): Promise<Saved> => JSON.parse((await readRaw(page))!);

async function prerequisite(label: string, check: () => Promise<unknown>) {
  try {
    await check();
  } catch (cause) {
    throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`, { cause });
  }
}

async function continueFromTitle(page: Page) {
  await prerequisite("seeded save offers Continue", () => expect(page.getByTestId("btn-continue")).toBeVisible());
  await page.getByTestId("btn-continue").click();
  await precondition(page, (s) => s.screen === "game", "Continue entered the game");
  await hook(page, "visitors", false);
}

async function assertPlayableFixture(page: Page, missingFish = 0) {
  const s = await state(page);
  expect(s.tanks.map((t) => t.slot).sort()).toEqual(fixture.model.tanks.map((t) => t.slot).sort());
  expect(s.tanks.filter((t) => ["A", "B", "F", "G", "H"].includes(t.slot)).map((t) => t.slot).sort()).toEqual(["A", "B", "F", "G", "H"]);
  expect(s.tanks.reduce((n, t) => n + t.fishIds.length, 0)).toBe(fixture.model.tanks.reduce((n, t) => n + t.fish.length, 0) - missingFish);
  expect(s.tanks.reduce((n, t) => n + t.decor.length, 0)).toBe(fixture.model.tanks.reduce((n, t) => n + t.decor.length, 0));
  expect(s.stage).toBe(fixture.model.progress.stage);
}

test("save recovery preserves the fixture, exposes rejected records, and restores a complete backup", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  // Playwright supplies a fresh browser context; seed once so reload exercises real storage.
  await page.addInitScript(({ key, raw }) => {
    if (!sessionStorage.getItem("save-recovery-seeded")) {
      localStorage.clear();
      localStorage.setItem(key, raw);
      localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
      sessionStorage.setItem("save-recovery-seeded", "1");
    }
  }, { key: SAVE_KEY, raw: fixtureRaw });
  const errors = await boot(page, "fast=1&seed=37");
  await continueFromTitle(page);
  await assertPlayableFixture(page);
  await hook(page, "advance", 1); // A real model update schedules the production autosave.
  await prerequisite("autosave wrote the continued fixture", () => expect.poll(() => readRaw(page)).not.toBe(fixtureRaw));
  expect(owned(await readSaved(page))).toEqual(expected);
  expect((await readSaved(page)).model.stored?.tanks.map((t) => t.slot).sort()).toEqual(["M", "N", "O"]);

  await page.reload();
  await continueFromTitle(page);
  await assertPlayableFixture(page);
  expect(owned(await readSaved(page))).toEqual(expected);

  // Return to title before editing storage so pagehide cannot overwrite the damaged seed.
  await page.getByTestId("btn-settings").click();
  await prerequisite("settings opened", () => expect(page.getByTestId("settings")).toBeVisible());
  await page.getByTestId("settings-title").click();
  await precondition(page, (s) => s.screen === "title", "title is idle before damaged seed");
  const damaged = JSON.parse(fixtureRaw) as Saved;
  damaged.model.tanks[0].fish[0].species = "unknown-save-test-species";
  damaged.model.tanks[0].fish.push({ ...damaged.model.tanks[0].fish[1] });
  const damagedRaw = JSON.stringify(damaged);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: SAVE_KEY, raw: damagedRaw });
  await page.reload();
  await continueFromTitle(page);
  await assertPlayableFixture(page, 1);
  await page.getByTestId("btn-settings").click();
  await prerequisite("settings opened for damaged save", () => expect(page.getByTestId("settings")).toBeVisible());
  await expect(page.getByTestId("save-issues-badge")).toBeVisible();
  await expect(page.getByTestId("save-issues-badge")).toHaveText("2");
  await page.getByTestId("settings-save-recovery").click();
  await prerequisite("Save Recovery opened", () => expect(page.getByTestId("save-recovery")).toBeVisible());
  const currentCard = page.locator('[data-testid="save-snapshot"][data-source="current"]');
  await prerequisite("current snapshot is inspectable", () => expect(currentCard.getByRole("button", { name: /^Inspect/ })).toBeVisible());
  await currentCard.getByRole("button", { name: /^Inspect/ }).click();
  await prerequisite("current snapshot inspection opened", () => expect(page.getByTestId("save-inspect")).toBeVisible());
  await expect(page.locator('[data-testid="save-rejected-record"][data-reason="unknown-species"]')).toBeVisible();
  await expect(page.locator('[data-testid="save-rejected-record"][data-reason="duplicate-id"]')).toBeVisible();
  await expect(page.getByTestId("save-inspect")).toContainText("unknown-save-test-species");
  const copies = await page.evaluate(({ ring, pinned }) => ({
    ring: JSON.parse(localStorage.getItem(ring) ?? "[]") as { raw: string }[],
    pinned: JSON.parse(localStorage.getItem(pinned) ?? "[]") as { raw: string }[]
  }), { ring: BACKUPS_KEY, pinned: PINNED_KEY });
  expect(copies.ring.some((copy) => copy.raw === damagedRaw)).toBe(true);
  expect(copies.pinned.some((copy) => copy.raw === damagedRaw)).toBe(true);
  expect(copies.ring.some((copy) => owned(JSON.parse(copy.raw) as Saved).tanks.length === expected.tanks.length && (JSON.parse(copy.raw) as Saved).model.tanks[0].fish[0].species !== "unknown-save-test-species")).toBe(true);

  const goodBackup = page.locator(`[data-testid="save-snapshot"][data-source="backup"][data-tanks="${expected.tanks.length}"][data-fish="${totalFish}"][data-decor="${totalDecor}"]`).first();
  await prerequisite("complete good backup is available to restore", () => expect(goodBackup).toBeVisible());
  await goodBackup.getByRole("button", { name: /^Restore/ }).click();
  await prerequisite("restore confirmation opened", () => expect(page.getByTestId("save-restore-confirmation")).toBeVisible());
  await page.getByTestId("save-confirm-restore").click();
  await precondition(page, (s) => s.screen === "title", "restore completed and returned to title");
  expect(owned(await readSaved(page))).toEqual(expected);
  expect((await readSaved(page)).model.coins).toBe(fixture.model.coins);
  expect((await readSaved(page)).model.progress.stage).toBe(fixture.model.progress.stage);
  await continueFromTitle(page);
  await assertPlayableFixture(page);
  expect(owned(await readSaved(page))).toEqual(expected);
  expect(errors).toEqual([]);
});
