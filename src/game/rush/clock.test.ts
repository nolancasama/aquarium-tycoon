import { beforeEach, describe, expect, it, vi } from "vitest";
import { newModel } from "../logic/model";
import { resetRuntime, rt } from "../runtime";
import { advanceCare, decayRunning } from "../sim";
import { getGame, setGame } from "../store";
import { advance, startEvent } from "./logic";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("../flow/story", () => ({ flowBusy: () => false, storyTick: vi.fn() }));
vi.mock("../flow/visitors", () => ({ scripted: { busy: false }, stepVisitors: vi.fn(), visitorsTick: vi.fn() }));
vi.mock("../tunnel/tunnelVisitors", () => ({ stepTunnelVisitors: vi.fn() }));
vi.mock("../tunnel/activities", () => ({ celebrateMilestones: vi.fn(), stepTunnelActivity: vi.fn(), tunnelActivitiesTick: vi.fn() }));

beforeEach(() => {
  resetRuntime();
  const m = newModel();
  m.progress = { ...m.progress, tutorial: "done", freePlay: true, hallOpen: true };
  m.tanks[0].fish = [{ id: "f2", species: "clownfish" }];
  const unlocked = advance(m, 0, { rand: () => 0, calm: true }).model;
  setGame({ model: unlocked, screen: "game", mode: "play", settingsOpen: false, stageCard: null,
    prompt: null, line: null, request: null, panel: null, placing: null, exploring: false,
    tunnelActivity: null, tunnelCelebration: null, rushAnnouncement: null });
});

describe("the shared active care clock", () => {
  it("advances care and persisted waiting time together", () => {
    const before = getGame().model;
    advanceCare(3);
    const after = getGame().model;
    expect(after.rush!.untilNext).toBe(before.rush!.untilNext - 3);
    expect(after.tanks[0].food).toBe(99);
    expect(after.stats.seconds).toBe(before.stats.seconds + 3);
  });

  it.each(["busy", "ask", "talk"] as const)("pauses both clocks in %s mode", (mode) => {
    setGame({ mode });
    const before = getGame().model;
    expect(decayRunning()).toBe(false);
    advanceCare(60);
    expect(getGame().model).toBe(before);
  });

  it("pauses both clocks in Settings and behind a stage card", () => {
    const before = getGame().model;
    setGame({ settingsOpen: true });
    advanceCare(60);
    expect(getGame().model).toBe(before);
    setGame({ settingsOpen: false, stageCard: { stage: 1, reward: "decor" } });
    advanceCare(60);
    expect(getGame().model).toBe(before);
  });

  it("a due event remains pending without counting calm seconds in the tunnel or celebrations", () => {
    const m = getGame().model;
    setGame({ model: { ...m, rush: { ...m.rush!, untilNext: 0 } }, exploring: true });
    rt.explore.active = true;
    advanceCare(30);
    expect(getGame().model.rush?.phase).toBe("pending");
    expect(getGame().model.rush?.pendingFor).toBe(0);
    setGame({ exploring: false });
    rt.explore.active = false;
    rt.celebrations.add(Symbol());
    advanceCare(30);
    expect(getGame().model.rush?.pendingFor).toBe(0);
    rt.celebrations.clear();
    advanceCare(10);
    expect(getGame().model.rush?.pendingFor).toBe(10);
  });

  it("preparation and the rush continue while exploring", () => {
    const m = getGame().model;
    const pending = { ...m, rush: { ...m.rush!, phase: "pending" as const } };
    setGame({ model: startEvent(pending, () => 0), exploring: true });
    rt.explore.active = true;
    advanceCare(120);
    expect(getGame().model.rush?.phase).toBe("rush");
    expect(getGame().model.rush?.event?.remaining).toBe(90);
    advanceCare(10);
    expect(getGame().model.rush?.event?.remaining).toBe(80);
  });

  it("latches simultaneous exact thresholds before the same second's decay", () => {
    const m = getGame().model;
    const prep = startEvent({ ...m, rush: { ...m.rush!, phase: "pending" } }, () => 0);
    prep.rush!.event!.ready = [];
    prep.tanks[0] = { ...prep.tanks[0], food: 75, clean: 75 };
    setGame({ model: prep });
    advanceCare(1);
    expect(getGame().model.rush?.event?.ready).toEqual(["t1"]);
    expect(getGame().model.tanks[0].food).toBeLessThan(75);
  });
});
