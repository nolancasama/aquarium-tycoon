import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCoast, stepCoast } from "../coast/coastRuntime";
import { keeperRt } from "../coast/keeper";
import { COAST_HALL } from "../data/rooms";
import { clean, feed, newModel, newTank } from "../logic/model";
import { resetRuntime } from "../runtime";
import { getGame, model, setGame } from "../store";
import { cleanTank, feedTank } from "./actions";
import { coastKeeperTick, startPenguinCare } from "./coast";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("../sim", () => ({ dropPellets: vi.fn(), dropPinch: vi.fn() }));
vi.mock("./visitors", () => ({ answerShow: vi.fn(), inspectRequestTank: vi.fn(), openRequest: vi.fn() }));
vi.mock("./ask", () => ({ ask: vi.fn(), say: vi.fn(async () => undefined), speak: vi.fn(async () => undefined) }));

function colony() {
  const m = newModel(), t = newTank("penguin-home", "penguins", "M");
  t.fish = [{ id: "penguin", species: "penguin" }];
  t.decor = [{ id: "station", kind: "penguinFeeder", slot: 1, variant: null }];
  t.food = 10;
  t.clean = 35;
  m.tanks = [t];
  m.progress.tutorial = "done";
  m.progress.coastOpen = true;
  m.progress.coastIntroSeen = true;
  return m;
}

function advance(seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    stepCoast(model(), 0.05, true);
    coastKeeperTick();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { setTimeout: vi.fn(), clearTimeout: vi.fn() });
  clearCoast();
  resetRuntime();
  setGame({ model: colony(), screen: "game", mode: "play", hall: COAST_HALL, view: "room", tankId: null,
    coastView: "penguins", coastUnderwater: false, coastActivity: null, previewAreas: ["coast"],
    settingsOpen: false, stageCard: null, prompt: null, line: null, panel: null, placing: null, toasts: [] });
});

afterEach(() => {
  setGame({ hall: 0 });
  clearCoast();
  resetRuntime();
  vi.unstubAllGlobals();
});

describe("penguin keeper care actions", () => {
  it("guards direct and repeated Feed/Clean actions until one feeding finishes", async () => {
    const before = model(), expected = feed(before, before.tanks[0].id);
    if (!expected.ok) throw new Error(expected.reason);
    await feedTank();
    for (let i = 0; i < 4; i++) {
      await feedTank();
      await cleanTank();
      startPenguinCare("feed");
      startPenguinCare("clean");
    }
    expect(keeperRt.feed.phase).toBe("doorOpening");
    expect(model().tanks[0].food).toBe(10);
    expect(model().tanks[0].clean).toBe(35);
    advance(0.3);
    expect(model().tanks[0].food).toBe(10);
    advance(100);
    expect(keeperRt.feed.phase).toBe("idle");
    expect(model().tanks[0].food).toBe(expected.m.tanks[0].food);
    expect(model().tanks[0].clean).toBe(35);
    expect(model().progress.fedOnce).toBe(true);
    expect(model().coins).toBe(before.coins);
    const settled = model();
    coastKeeperTick();
    expect(model()).toBe(settled);
  });

  it("keeps the existing cleaning maths, applying it once at the end of the montage", async () => {
    const before = model(), expected = clean(before, before.tanks[0].id);
    if (!expected.ok) throw new Error(expected.reason);
    await cleanTank();
    for (let i = 0; i < 4; i++) { await cleanTank(); await feedTank(); }
    advance(4.8);
    expect(keeperRt.clean.phase).toBe("montage");
    expect(model().tanks[0].clean).toBe(35);
    expect(model().tanks[0].food).toBe(10);
    advance(0.3);
    expect(keeperRt.clean.phase).toBe("idle");
    expect(model().tanks[0].clean).toBe(expected.m.tanks[0].clean);
    expect(model().progress.cleanedOnce).toBe(true);
    expect(model().coins).toBe(before.coins);
    setGame({ model: { ...model(), tanks: model().tanks.map((t) => ({ ...t, clean: 70 })) } });
    coastKeeperTick();
    expect(model().tanks[0].clean).toBe(70);
  });

  it.each(["feed", "clean"] as const)("settles unfinished %s exactly once when leaving and re-enters idle", async (kind) => {
    const before = model(), expected = (kind === "feed" ? feed : clean)(before, before.tanks[0].id);
    if (!expected.ok) throw new Error(expected.reason);
    await (kind === "feed" ? feedTank() : cleanTank());
    advance(0.1);
    setGame({ hall: 0 });
    coastKeeperTick();
    expect(model().tanks[0].food).toBe(expected.m.tanks[0].food);
    expect(model().tanks[0].clean).toBe(expected.m.tanks[0].clean);
    expect(keeperRt.feed.phase).toBe("idle");
    expect(keeperRt.feed.door).toBe(0);
    expect(keeperRt.clean.phase).toBe("idle");
    const settled = model();
    stepCoast(model(), 0.1, false);
    coastKeeperTick();
    setGame({ hall: COAST_HALL });
    advance(1);
    expect(model()).toBe(settled);
    expect(getGame().coastView).toBe("penguins");
    expect(keeperRt.feed.phase).toBe("idle");
    expect(keeperRt.clean.phase).toBe("idle");
  });

  it.each(["feed", "clean"] as const)("ending a preview during %s preserves the restored model", async (kind) => {
    const snapshot = model();
    setGame({ model: { ...snapshot, progress: { ...snapshot.progress } } });
    await (kind === "feed" ? feedTank() : cleanTank());
    advance(0.1);
    // endPreview restores its snapshot and removes preview access in one store update.
    setGame({ previewAreas: [], model: snapshot });
    coastKeeperTick();
    stepCoast(model(), 0.1, false);
    coastKeeperTick();
    expect(model()).toBe(snapshot);
    expect(model().tanks[0].food).toBe(10);
    expect(model().tanks[0].clean).toBe(35);
    expect(keeperRt.feed.phase).toBe("idle");
    expect(keeperRt.clean.phase).toBe("idle");
  });
});
