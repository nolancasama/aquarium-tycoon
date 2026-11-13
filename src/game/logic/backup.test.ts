import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./realSave.fixture.json";
import { BACKUPS_KEY, LASTGOOD_KEY, PREREPAIR_KEY, backupRawSave, pinPreRepair, readBackups, readLastGood, readPreRepair, readRawSave, replaceRawSave, summarizeSave, updateLastGood } from "./backup";
import { decodeSave, encodeSave, SAVE_KEY } from "./save";
import { newModel } from "./model";
import { continueGame, installAutosave, newGame, restoreSaveSnapshot, saveNow } from "../flow/story";
import { dropPreview, endPreview, startPreview } from "../flow/preview";
import { getGame, setGame } from "../store";
import { animalName, renameAnimal } from "./animalNames";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), unlock: vi.fn(), setVolumes: vi.fn(), startAmbience: vi.fn(), startMusic: vi.fn() } }));
vi.mock("../../audio/tts", () => ({ tts: { setRate: vi.fn(), cancel: vi.fn() } }));
vi.mock("../../audio/recognition", () => ({ recognition: { supported: false }, requestMicPermission: vi.fn() }));
vi.mock("../flow/ask", () => ({ ask: vi.fn(), say: vi.fn(), speak: vi.fn(), fastMode: () => false, wait: () => new Promise<void>(() => {}) }));

const original = JSON.stringify(fixture);
let disk: Map<string, string>;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
let uninstall: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  disk = new Map();
  storage = { getItem: vi.fn((key: string) => disk.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { disk.set(key, value); }), removeItem: vi.fn((key: string) => { disk.delete(key); }) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  dropPreview();
  setGame({ screen: "title", model: newModel(), saveIssues: 0, settings: { ...getGame().settings, audioSetupDone: true, mic: false } });
});
afterEach(() => {
  uninstall?.(); uninstall = undefined;
  dropPreview();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function snapshot(coins: number): string { return encodeSave({ ...newModel(), coins }); }
function damaged(): string {
  const raw = JSON.parse(original);
  raw.model.tanks[0].fish.push({ id: "f999", species: "missing-species" }, { ...raw.model.tanks[0].fish[0] });
  return JSON.stringify(raw);
}

describe("save preservation", () => {
  it("carries individual names through rotating, last-good and pinned raw backups", () => {
    const model = renameAnimal(renameAnimal(decodeSave(original)!.model, "coast", "f91", "ゆき"), "lagoon", "sora", "青空");
    const raw = encodeSave(model);
    expect(backupRawSave(raw, "session-start")).toBe(true);
    expect(updateLastGood(raw)).toBe(true);
    expect(pinPreRepair(raw)).toBe(true);
    for (const copy of [readBackups()[0], readLastGood()!, readPreRepair()[0]]) {
      expect(copy.raw).toBe(raw);
      const restored = decodeSave(copy.raw)!.model;
      expect(animalName(restored, "coast", "f91")).toBe("ゆき");
      expect(animalName(restored, "lagoon", "sora")).toBe("青空");
    }
  });

  it.each(["before-import", "before-restore"] as const)("Save Recovery %s retains exported individual names", async (reason) => {
    disk.set(SAVE_KEY, original);
    await continueGame();
    const named = renameAnimal(renameAnimal(getGame().model, "coast", "f91", "ゆき"), "lagoon", "sora", "青空");
    const raw = encodeSave(named);
    // Save Recovery exports this exact envelope and imports its raw snapshot.
    const exported = JSON.stringify({ exportedAt: new Date().toISOString(), key: SAVE_KEY, raw });
    const imported = JSON.parse(exported) as { raw: string };
    expect(restoreSaveSnapshot(imported.raw, reason).ok).toBe(true);
    expect(readRawSave()).toBe(raw);
    await continueGame();
    expect(animalName(getGame().model, "coast", "f91")).toBe("ゆき");
    expect(animalName(getGame().model, "lagoon", "sora")).toBe("青空");
    expect(getGame().model.coins).toBe(fixture.model.coins);
  });

  it("discards preview names on exit and reload without modifying any persisted snapshot", async () => {
    const normal = renameAnimal(renameAnimal(decodeSave(original)!.model, "coast", "f91", "ゆき"), "lagoon", "sora", "青空");
    disk.set(SAVE_KEY, encodeSave(normal));
    await continueGame();
    const before = getGame().model;
    uninstall = installAutosave();
    expect(startPreview("coast")).toBe(true);
    expect(startPreview("lagoon")).toBe(true);
    const persisted = new Map(disk);
    storage.setItem.mockClear();
    setGame({ model: renameAnimal(renameAnimal(getGame().model, "coast", "f91", "一時的"), "lagoon", "sora", "プレビュー") });
    expect(animalName(getGame().model, "coast", "f91")).toBe("一時的");
    expect(animalName(getGame().model, "lagoon", "sora")).toBe("プレビュー");
    expect(saveNow()).toBe(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(disk).toEqual(persisted);
    expect(endPreview()).toBe(true);
    expect(getGame().model).toBe(before);
    expect(saveNow()).toBe(true);
    expect(disk).toEqual(persisted);
    const reloaded = decodeSave(readRawSave())!.model;
    expect(animalName(reloaded, "coast", "f91")).toBe("ゆき");
    expect(animalName(reloaded, "lagoon", "sora")).toBe("青空");
  });

  it("keeps five distinct exact raw copies and independent good and pinned snapshots", () => {
    const exact = ` \n${original}\n `;
    expect(updateLastGood(exact)).toBe(true);
    expect(pinPreRepair(damaged())).toBe(true);
    for (let i = 0; i < 9; i++) expect(backupRawSave(snapshot(i), "session-start")).toBe(true);
    const ring = readBackups();
    expect(ring).toHaveLength(5);
    expect(ring.map((b) => b.summary.coins)).toEqual([4, 5, 6, 7, 8]);
    backupRawSave(snapshot(8), "before-new-game");
    expect(readBackups()).toEqual(ring);
    expect(readLastGood()?.raw).toBe(exact);
    expect(readPreRepair()[0].raw).toBe(damaged());
    expect(disk.has(LASTGOOD_KEY)).toBe(true);
    expect(disk.has(PREREPAIR_KEY)).toBe(true);
  });

  it("never promotes damaged, synthesized, or quarantined saves over lastgood", () => {
    updateLastGood(original);
    expect(updateLastGood(damaged())).toBe(false);
    expect(updateLastGood(encodeSave(decodeSave(damaged())!.model))).toBe(false);
    const incomplete = JSON.parse(original);
    incomplete.model.tanks = incomplete.model.tanks.filter((t: { slot: string }) => t.slot !== "G");
    expect(updateLastGood(JSON.stringify(incomplete))).toBe(false);
    expect(readLastGood()?.raw).toBe(original);
  });

  it("repeated saveNow autosaves never change lastgood during a session", async () => {
    disk.set(SAVE_KEY, original);
    await continueGame();
    const lastgood = disk.get(LASTGOOD_KEY);
    expect(lastgood).toBeDefined();
    expect(readLastGood()?.raw).toBe(original);

    for (let i = 1; i <= 20; i++) {
      const current = getGame().model;
      // Include an in-session loss as well as ordinary progress changes.
      const model = { ...current, coins: current.coins + 1,
        tanks: current.tanks.map((tank, index) => index === 0 ? { ...tank, fish: [] } : tank) };
      setGame({ model });
      expect(saveNow()).toBe(true);
      expect(readRawSave()).toBe(encodeSave(model));
      expect(disk.get(LASTGOOD_KEY)).toBe(lastgood);
    }
  });

  it("caps and deduplicates pinned copies separately from ring rotation", () => {
    for (let i = 0; i < 6; i++) pinPreRepair(snapshot(i));
    pinPreRepair(snapshot(5));
    expect(readPreRepair().map((b) => b.summary.coins)).toEqual([3, 4, 5]);
    expect(readBackups()).toEqual([]);
  });

  it("summarizes all rooms and stored animals without repairing the original", () => {
    const summary = summarizeSave(original);
    expect(summary).toMatchObject({ coins: fixture.model.coins, stage: 8, tanks: 15 });
    expect(summary.rooms.find((r) => r.room === "Hall 1")?.tanks.map((t) => t.slot)).toEqual(["A", "B"]);
    expect(summary.rooms.find((r) => r.room === "Jellyfish Gallery")?.tanks.map((t) => t.slot).sort()).toEqual(["F", "G", "H"]);
    expect(summary.rooms.find((r) => r.room === "Coastal & Polar Zone")?.tanks.map((t) => t.slot)).toEqual(["M", "N", "O"]);
  });

  it("backs up Continue before autosave and pins rejected original first", async () => {
    const raw = damaged(); disk.set(SAVE_KEY, raw);
    uninstall = installAutosave();
    await continueGame();
    expect(readRawSave()).toBe(raw);
    expect(readPreRepair()[0].raw).toBe(raw);
    expect(readBackups()[0].raw).toBe(raw);
    const keys = storage.setItem.mock.calls.map((args) => args[0]);
    expect(keys.indexOf(PREREPAIR_KEY)).toBeLessThan(keys.indexOf(BACKUPS_KEY));
    expect(getGame().saveIssues).toBe(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(decodeSave(readRawSave())!.model.quarantine).toHaveLength(2);
    expect(readPreRepair()[0].raw).toBe(raw);
  });

  it.each([original, "{unreadable"])("New Game backs up existing valid or unreadable raw before clearing", async (raw) => {
    disk.set(SAVE_KEY, raw);
    await newGame();
    expect(readBackups().some((b) => b.reason === "before-new-game" && b.raw === raw)).toBe(true);
    expect(decodeSave(readRawSave())!.model.tanks).toHaveLength(1);
    expect(storage.setItem.mock.invocationCallOrder[0]).toBeLessThan(storage.removeItem.mock.invocationCallOrder[0]);
  });

  it.each(["before-restore", "before-import"] as const)("%s writes exactly one whole snapshot and preserves its property identities", async (reason) => {
    disk.set(SAVE_KEY, original); await continueGame();
    const current = encodeSave({ ...getGame().model, coins: 432 }); disk.set(SAVE_KEY, current);
    setGame({ model: { ...getGame().model, coins: 432 } });
    const exact = `\n ${original}\n`;
    expect(restoreSaveSnapshot(exact, reason).ok).toBe(true);
    expect(readRawSave()).toBe(exact);
    expect(getGame().screen).toBe("title");
    expect(readBackups().some((b) => b.raw === current)).toBe(true);
    await continueGame();
    expect(encodeSave(getGame().model)).toBe(encodeSave(decodeSave(original)!.model));
    expect(summarizeSave(readRawSave()!)).toEqual(summarizeSave(original));
  });

  it("preview disables backup, import, restore, lastgood, and autosave writes", async () => {
    disk.set(SAVE_KEY, original); await continueGame();
    expect(startPreview("coast")).toBe(true);
    storage.setItem.mockClear();
    const before = new Map(disk);
    saveNow(); backupRawSave(snapshot(2), "session-start"); pinPreRepair(snapshot(2)); updateLastGood(snapshot(2)); replaceRawSave(snapshot(2));
    expect(restoreSaveSnapshot(snapshot(2), "before-import").ok).toBe(false);
    expect(restoreSaveSnapshot(snapshot(2), "before-restore").ok).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(disk).toEqual(before);
    expect(endPreview()).toBe(true);
  });

  it("retries a quota write once by dropping only the oldest ring entry", () => {
    updateLastGood(original); pinPreRepair(damaged());
    for (let i = 0; i < 3; i++) backupRawSave(snapshot(i), "session-start");
    storage.setItem.mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(backupRawSave(snapshot(3), "session-start")).toBe(true);
    expect(readBackups().map((b) => b.summary.coins)).toEqual([1, 2, 3]);
    expect(readLastGood()?.raw).toBe(original);
    expect(readPreRepair()[0].raw).toBe(damaged());
  });

  it("never evicts the current save's sole undo copy to fit its replacement", () => {
    const current = damaged();
    disk.set(SAVE_KEY, current);
    backupRawSave(current, "before-restore");
    storage.setItem.mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(replaceRawSave(snapshot(2))).toBe(false);
    expect(readRawSave()).toBe(current);
    expect(readBackups()[0].raw).toBe(current);
  });

  it("a synthesized-only repair never replaces lastgood later in the same session", async () => {
    updateLastGood(original);
    const incomplete = JSON.parse(original);
    incomplete.model.tanks = incomplete.model.tanks.filter((t: { slot: string }) => t.slot !== "G");
    disk.set(SAVE_KEY, JSON.stringify(incomplete));
    await continueGame(); saveNow();
    expect(readLastGood()?.raw).toBe(original);
  });

  it("ignores corrupted backup metadata without throwing", () => {
    const broken = { at: "unknown", raw: original, reason: { toString: null } };
    disk.set(BACKUPS_KEY, JSON.stringify([broken]));
    disk.set(PREREPAIR_KEY, JSON.stringify([broken]));
    disk.set(LASTGOOD_KEY, JSON.stringify(broken));
    expect(readBackups()).toEqual([]);
    expect(readPreRepair()).toEqual([]);
    expect(readLastGood()).toBeNull();
  });

  it.each([new Error("blocked"), new DOMException("full", "QuotaExceededError")])("storage failures (%s) do not crash or allow replacement without preservation", async (error) => {
    disk.set(SAVE_KEY, original);
    storage.setItem.mockImplementation(() => { throw error; });
    expect(backupRawSave(original, "session-start")).toBe(false);
    expect(pinPreRepair(original)).toBe(false);
    expect(updateLastGood(original)).toBe(false);
    await continueGame(); saveNow();
    expect(readRawSave()).toBe(original);
    expect(startPreview("coast")).toBe(true);
    expect(readRawSave()).toBe(original);
    endPreview();
    expect(restoreSaveSnapshot(snapshot(2), "before-restore").ok).toBe(false);
    await newGame();
    expect(readRawSave()).toBe(original);
    storage.getItem.mockImplementation(() => { throw new Error("blocked"); });
    expect(readBackups()).toEqual([]);
    expect(readLastGood()).toBeNull();
    expect(readPreRepair()).toEqual([]);
    expect(readRawSave()).toBeNull();
    await expect(newGame()).resolves.toBeUndefined();
    expect(disk.get(SAVE_KEY)).toBe(original);
  });
});
