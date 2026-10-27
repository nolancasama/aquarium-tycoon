import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { happiness, mood, newModel, newTank, tipBreakdown, tipFor, type Model, type TankRec } from "../logic/model";
import { resetRuntime, rt } from "../runtime";
import { getGame, model, setGame, updateModel } from "../store";
import { leave, resetVisitors, scripted, spawnVisitor } from "./visitors";
import { watchHappiness } from "./cheer";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("./actions", () => ({ openTank: vi.fn() }));
vi.mock("./ask", () => ({
  ask: vi.fn(),
  fastMode: () => false,
  say: vi.fn(async () => undefined),
  speak: vi.fn(async () => undefined),
  wait: vi.fn(async () => undefined)
}));

/** A tank with one clownfish at the given care levels, plus decoration joy for the happy one. */
function tank(id: string, slot: TankRec["slot"], care: number, decorated = false): TankRec {
  const t = newTank(id, "big", slot);
  return {
    ...t,
    food: care,
    clean: care,
    fish: [{ id: `${id}f`, species: "clownfish" }],
    decor: decorated
      ? [
          { id: `${id}d1`, kind: "plant", variant: "big", slot: 0 },
          { id: `${id}d2`, kind: "coral", variant: "big", slot: 1 },
          { id: `${id}d3`, kind: "castle", variant: "big", slot: 2 }
        ]
      : []
  } as TankRec;
}

function seeded(): Model {
  const m = newModel();
  return {
    ...m,
    coins: 50,
    tanks: [tank("h", "A", 100, true), tank("o", "B", 100), tank("s", "C", 20)],
    progress: { ...m.progress, tutorial: "done", stage: 6, hallOpen: true, tipsTaught: true }
  };
}

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: vi.fn() });
  resetRuntime();
  resetVisitors();
  scripted.busy = false;
  rt.tipsPaid = 0;
  rt.happyToasted.clear();
  rt.lastCoachT = -1e9;
  setGame({ model: seeded(), mode: "play", screen: "game", view: "room", request: null, prompt: null, placing: null, stageCard: null, toasts: [], nudge: null });
});

afterEach(() => {
  resetRuntime();
  resetVisitors();
  vi.unstubAllGlobals();
});

describe("happiness-based tips (amounts unchanged)", () => {
  it("pays 1 / 2 / 3 coins for sad / okay / happy tanks", () => {
    const [h, o, s] = model().tanks;
    expect([mood(happiness(h)), mood(happiness(o)), mood(happiness(s))]).toEqual(["happy", "okay", "sad"]);
    expect([tipFor(h), tipFor(o), tipFor(s)]).toEqual([3, 2, 1]);
    // No care at all still earns the minimum.
    expect(tipFor({ ...o, food: 0, clean: 0, decor: [] })).toBe(1);
    expect(tipBreakdown(model(), ["h", "o", "s", "gone"])).toEqual([
      { tankId: "h", tip: 3, mood: "happy" },
      { tankId: "o", tip: 2, mood: "okay" },
      { tankId: "s", tip: 1, mood: "sad" }
    ]);
  });

  it("a visitor who saw three tanks pays their sum once, and the tags show exactly that", () => {
    const v = spawnVisitor("adult", null);
    v.seen = ["h", "o", "s"];
    const before = model().coins;
    leave(v);
    expect(model().coins - before).toBe(6);
    const tags = rt.effects.filter((e) => e.kind === "tip");
    expect(tags.map((e) => [e.n, e.tone])).toEqual([[3, "happy"], [2, "okay"], [1, "sad"]]);
    expect(rt.effects.filter((e) => e.kind === "tipTotal").map((e) => e.n)).toEqual([6]);
    // A repeated departure (or payment) adds no coins and shows no new tags.
    const effects = rt.effects.length;
    v.state = "walk";
    leave(v);
    expect(model().coins - before).toBe(6);
    expect(rt.effects.length).toBe(effects);
    expect(rt.tipsPaid).toBe(1);
  });

  it("one tank: one tag, no separate total; tags above a tank queue when visitors leave together", () => {
    const a = spawnVisitor("adult", null);
    const b = spawnVisitor("child", null);
    a.seen = ["o"];
    b.seen = ["o"];
    leave(a);
    leave(b);
    const tags = rt.effects.filter((e) => e.kind === "tip");
    expect(tags.map((e) => e.n)).toEqual([2, 2]);
    expect(tags[1].t0 - tags[0].t0).toBeCloseTo(0.8, 5);
    expect(rt.effects.some((e) => e.kind === "tipTotal")).toBe(false);
  });

  it("helped and scripted visitors pay no tips", () => {
    const helped = spawnVisitor("adult", null);
    helped.seen = ["h"];
    helped.helped = true;
    const fan = spawnVisitor("fan", null, { scripted: true });
    fan.seen = ["h"];
    const before = model().coins;
    leave(helped);
    leave(fan);
    expect(model().coins).toBe(before);
    expect(rt.effects.some((e) => e.kind === "tip")).toBe(false);
  });

  it("coaches a sad tank at most every two minutes", () => {
    const a = spawnVisitor("adult", null);
    a.seen = ["s"];
    leave(a);
    const b = spawnVisitor("adult", null);
    b.seen = ["s"];
    leave(b);
    expect(getGame().nudge?.en).toBe("Sad fish: only 1 coin. Make them happy!");
    // The bubble timed out; a sad tip within two minutes does not coach again.
    setGame({ nudge: null });
    const c = spawnVisitor("adult", null);
    c.seen = ["s"];
    leave(c);
    expect(getGame().nudge).toBeNull();
  });
});

describe("happiness rises are celebrated without paying", () => {
  it("is silent on first sight, pops on a rise, and says 'Happy fish earn more' once per tank", () => {
    const coins = model().coins;
    watchHappiness(model());
    expect(rt.cheer.size).toBe(0);
    expect(rt.effects.length).toBe(0);
    // Care raises the okay tank to happy: hearts, the bounce, one message.
    updateModel((m) => ({ ...m, tanks: m.tanks.map((t) => (t.id === "o" ? { ...tank("o", "B", 100, true) } : t)) }));
    watchHappiness(model());
    expect(rt.cheer.get("o")?.level).toBe("happy");
    expect(rt.effects.some((e) => e.kind === "hearts")).toBe(true);
    expect(getGame().nudge?.en).toBe("Happy fish earn more coins!");
    setGame({ nudge: null });
    // Dropping and rising again bounces, but does not repeat the message.
    updateModel((m) => ({ ...m, tanks: m.tanks.map((t) => (t.id === "o" ? { ...t, food: 10, clean: 10 } : t)) }));
    watchHappiness(model());
    updateModel((m) => ({ ...m, tanks: m.tanks.map((t) => (t.id === "o" ? { ...t, food: 100, clean: 100 } : t)) }));
    rt.time += 1;
    watchHappiness(model());
    expect(rt.cheer.get("o")?.t0).toBe(rt.time);
    expect(getGame().nudge).toBeNull();
    // A small rise within a mood is a gentle pop; sad → okay is the middle one.
    updateModel((m) => ({ ...m, tanks: m.tanks.map((t) => (t.id === "s" ? { ...t, food: 70, clean: 70 } : t)) }));
    watchHappiness(model());
    expect(rt.cheer.get("s")?.level).toBe("okay");
    expect(model().coins).toBe(coins);
  });
});
