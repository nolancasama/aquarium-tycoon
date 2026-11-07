import { describe, expect, it, vi } from "vitest";
import { decay, newModel, newTank, type Model } from "../logic/model";
import { decodeSave, encodeSave } from "../logic/save";
import { FIRST_DELAY, NEXT_DELAY, PENDING_AUTOSTART, prepSeconds, RUSH_SECONDS } from "./config";
import { advance, canUnlock, commitResult, continueEvent, ensureRush, latchReadiness, lockResult, resultFor, skip, startEvent } from "./logic";
import { newRushState } from "./types";

function aquarium(n = 1): Model {
  const model = newModel();
  return {
    ...model, progress: { ...model.progress, stage: 8, tutorial: "done", star: true, freePlay: true, hallOpen: true },
    tanks: Array.from({ length: n }, (_, i) => ({ ...newTank(`t${i + 1}`, "small", "A"), food: 20, clean: 20, fish: [{ id: `f${i + 1}`, species: "clownfish" as const }] })),
    rush: newRushState()
  };
}
const ctx = (calm = true, rand = () => 0) => ({ rand, calm });
function pending(n = 1): Model {
  const unlocked = advance(aquarium(n), 0, ctx()).model;
  return { ...unlocked, rush: { ...unlocked.rush!, phase: "pending", untilNext: 0 } };
}
function prepared(n = 1): Model {
  const model = startEvent(pending(n));
  return latchReadiness({ ...model, tanks: model.tanks.map((t) => ({ ...t, food: 100, clean: 100 })) });
}

describe("Rush Hour pure state machine", () => {
  it("fills absent state without changing existing data or rerolling existing state", () => {
    const model = aquarium();
    delete model.rush;
    expect(ensureRush(model)).toEqual({ ...model, rush: newRushState() });
    const existing = ensureRush(model);
    expect(ensureRush(existing)).toBe(existing);
  });

  it.each(["freePlay", "hallOpen", "fish", "tutorial"])("stays locked without %s", (missing) => {
    const model = aquarium();
    if (missing === "fish") model.tanks[0].fish = [];
    else if (missing === "tutorial") model.progress.tutorial = "feed";
    else model.progress[missing as "freePlay" | "hallOpen"] = false;
    const rand = vi.fn(() => 0.5);
    expect(canUnlock(model)).toBe(false);
    expect(advance(model, 1000, ctx(true, rand)).model.rush).toEqual(newRushState());
    expect(rand).not.toHaveBeenCalled();
  });

  it.each([0, 0.5, 1])("rolls each delay once at sample %s", (sample) => {
    const rand = vi.fn(() => sample);
    let model = advance(aquarium(), 0, ctx(true, rand)).model;
    expect(model.rush!.untilNext).toBeGreaterThanOrEqual(FIRST_DELAY[0]);
    expect(model.rush!.untilNext).toBeLessThanOrEqual(FIRST_DELAY[1]);
    expect(model.rush!.rewards).toEqual(["cabinet"]);
    model = advance(model, 1, ctx(true, rand)).model;
    expect(rand).toHaveBeenCalledTimes(1);
    model = { ...model, rush: { ...model.rush!, phase: "pending" } };
    model = skip(model, rand);
    expect(rand).toHaveBeenCalledTimes(2);
    expect(model.rush!.untilNext).toBeGreaterThanOrEqual(NEXT_DELAY[0]);
    expect(model.rush!.untilNext).toBeLessThanOrEqual(NEXT_DELAY[1]);
    expect(skip(model, rand)).toBe(model);
  });

  it("waits pending through non-calm moments and autostarts only after calm active seconds", () => {
    let model = advance(aquarium(), 0, ctx()).model;
    model = advance(model, model.rush!.untilNext, ctx(false)).model;
    expect(model.rush!.phase).toBe("pending");
    expect(advance(model, 100, ctx(false)).model.rush!.pendingFor).toBe(0);
    model = advance(model, PENDING_AUTOSTART - 1, ctx()).model;
    expect(model.rush!.phase).toBe("pending");
    const started = advance(model, 1, ctx());
    expect(started.model.rush!.phase).toBe("prep");
    expect(started.events.map((e) => e.type)).toEqual(["prep"]);
    expect(startEvent(started.model)).toBe(started.model);
    expect(advance(started.model, 1, ctx(false)).model.rush!.event!.remaining).toBe(119);
  });

  it.each(["pending", "prep"] as const)("skips %s without results, coins or penalties", (phase) => {
    const model = phase === "prep" ? startEvent(pending()) : pending();
    const skipped = skip(model, () => 1);
    expect(skipped.rush).toMatchObject({ phase: "waiting", event: null, untilNext: NEXT_DELAY[1], stats: newRushState().stats });
    expect(skipped.coins).toBe(model.coins);
    expect(skipped.paid).toEqual(model.paid);
  });

  it.each([[4, 120], [5, 150], [9, 150], [10, 210]])("fixes preparation at %i tanks to %i seconds", (n, seconds) => {
    const model = startEvent(pending(n));
    expect(prepSeconds(n)).toBe(seconds);
    expect(model.rush!.event).toMatchObject({ prepTotal: seconds, remaining: seconds, id: "rush-1" });
    expect(model.rush!.event!.tankIds).toHaveLength(n);
    expect(startEvent(model)).toBe(model);
  });

  it("requires both care levels at 75 simultaneously, latches once and survives decay", () => {
    let model = startEvent(pending());
    for (const [food, clean] of [[74.99, 75], [75, 74.99]]) {
      model = { ...model, tanks: [{ ...model.tanks[0], food, clean }] };
      expect(latchReadiness(model).rush!.event!.ready).toEqual([]);
    }
    model = { ...model, tanks: [{ ...model.tanks[0], food: 75, clean: 75 }] };
    const latched = advance(model, 0, ctx());
    expect(latched.events).toEqual([{ type: "ready", tankId: "t1" }]);
    expect(latchReadiness(latched.model)).toBe(latched.model);
    model = decay(latched.model, 100);
    expect(advance(model, 0, ctx()).events).toEqual([]);
    expect(model.rush!.event!.ready).toEqual(["t1"]);
    expect(lockResult(model).rush!.event!.result!.medal).toBe("gold");
  });

  it("keeps removed or emptied tracked tanks in the denominator and ignores new tanks", () => {
    let model = startEvent(pending(3));
    model = { ...model, tanks: [
      { ...model.tanks[0], food: 100, clean: 100 },
      { ...model.tanks[1], fish: [], food: 100, clean: 100 },
      { ...newTank("new", "small", "B"), fish: [{ id: "newfish", species: "clownfish" }] }
    ] };
    model = lockResult(model);
    expect(model.rush!.event!.tankIds).toEqual(["t1", "t2", "t3"]);
    expect(model.rush!.event!.result).toMatchObject({ ready: 1, eligible: 3, medal: null });
  });

  it("cancels a start with zero occupied tanks and schedules the normal delay", () => {
    const model = { ...pending(), tanks: [] };
    const next = startEvent(model, () => 0.5);
    expect(next.rush).toMatchObject({ phase: "waiting", event: null, untilNext: 900, stats: newRushState().stats });
    expect(next.coins).toBe(model.coins);
  });

  it.each([[1, 2, "bronze"], [49, 100, null], [3, 4, "silver"], [74, 100, "bronze"], [99, 100, "silver"], [1, 1, "gold"]])(
    "awards the exact fraction %s/%s as %s", (ready, eligible, medal) => {
      expect(resultFor(ready as number, eligible as number).medal).toBe(medal);
    });

  it.each([[3, 3, 19], [6, 6, 28], [10, 10, 40], [5, 10, 20], [20, 20, 40]])(
    "pays %i/%i prepared tanks %i coins", (ready, eligible, bonus) => {
      expect(resultFor(ready, eligible).bonus).toBe(bonus);
    });

  it("locks preparation once, runs rush outside calm moments, and commits once", () => {
    let model = prepared();
    const coins = model.coins;
    model = advance(model, model.rush!.event!.remaining, ctx(false)).model;
    expect(model.rush!.phase).toBe("rush");
    expect(model.rush!.event!.remaining).toBe(RUSH_SECONDS);
    expect(lockResult(model)).toBe(model);
    expect(model.coins).toBe(coins);
    const finished = advance(model, RUSH_SECONDS, ctx(false));
    expect(finished.events).toEqual([{ type: "results" }]);
    model = finished.model;
    expect(model.coins).toBe(coins + 13);
    expect(model.rush!.stats).toMatchObject({ events: 1, gold: 1, successes: 1, best: "gold", bestReady: 1 });
    expect(commitResult(model)).toBe(model);
    const decoded = decodeSave(encodeSave({ ...model, paid: [] }))!.model;
    expect(commitResult(decoded)).toBe(decoded);
    expect(advance(decoded, 10000, ctx()).model.coins).toBe(coins + 13);
    expect(continueEvent(decoded, () => 0).rush).toMatchObject({ phase: "waiting", untilNext: NEXT_DELAY[0], event: null });
  });

  it("records bronze then silver counts, improves the best medal, and grants only the new display", () => {
    let model = pending(4);
    const initialCoins = model.coins;
    for (let ready = 2; ready <= 3; ready++) {
      model = startEvent(model);
      model = { ...model, tanks: model.tanks.map((tank, i) => ({ ...tank, food: i < ready ? 100 : 20, clean: i < ready ? 100 : 20 })) };
      model = commitResult(lockResult(model));
      if (ready === 2) {
        expect(model.rush!.stats).toMatchObject({ events: 1, bronze: 1, silver: 0, gold: 0, successes: 1, best: "bronze", bestReady: 2 });
        expect(model.rush!.event!.result!.newRewards).toEqual(["bronzeDisplay"]);
        model = continueEvent(model);
        model = { ...model, tanks: model.tanks.map((tank) => ({ ...tank, food: 20, clean: 20 })), rush: { ...model.rush!, phase: "pending" } };
      }
    }
    expect(model.rush!.stats).toMatchObject({ events: 2, bronze: 1, silver: 1, gold: 0, successes: 2, best: "silver", bestReady: 3 });
    expect(model.rush!.event!.result!.newRewards).toEqual(["floorPattern"]);
    expect(model.rush!.rewards).toEqual(["cabinet", "bronzeDisplay", "floorPattern"]);
    expect(model.coins).toBe(initialCoins + 11 + 16);
  });

  it("unlocks each fixed reward once, at exactly the lifetime milestone", () => {
    let model = pending();
    for (let i = 1; i <= 26; i++) {
      model = startEvent(model);
      model = { ...model, tanks: model.tanks.map((tank) => ({ ...tank, food: 100, clean: 100 })) };
      model = commitResult(lockResult(model));
      const newRewards = model.rush!.event!.result!.newRewards;
      expect(newRewards.includes("bronzeDisplay")).toBe(i === 1);
      expect(newRewards.includes("floorPattern")).toBe(i === 1);
      expect(newRewards.includes("goldSign")).toBe(i === 1);
      expect(newRewards.includes("bubbleFountain")).toBe(i === 5);
      expect(newRewards.includes("bench")).toBe(i === 10);
      expect(newRewards.includes("sharkStatue")).toBe(i === 25);
      model = continueEvent(model);
      model = { ...model, rush: { ...model.rush!, phase: "pending" } };
    }
    expect(new Set(model.rush!.rewards).size).toBe(7);
  });
});
