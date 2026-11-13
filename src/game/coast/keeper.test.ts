import { afterEach, describe, expect, it } from "vitest";
import { EXHIBITS, PENGUIN_STAFF_DOOR } from "../data/coast";
import { newModel, newTank } from "../logic/model";
import { clearCoast, coastRt, habitatCtx, stepCoast } from "./coastRuntime";
import { CLEAN_MONTAGE_SECONDS, CLEAN_SHOTS, cleanShotAt, consumeKeeperBenefit, finishKeepers, KEEPER_CLEARANCE, keeperRt, keeperSegmentClear, resetKeepers, startKeeperClean, startKeeperFeed, stepKeepers } from "./keeper";
import { landLegClear, newMover, stepMover, type MoveCtx } from "./motion";

afterEach(clearCoast);

function colony(slot: number | null = 1) {
  const m = newModel(), t = newTank("penguin-home", "penguins", "M");
  t.fish = Array.from({ length: 3 }, (_, i) => ({ id: `penguin-${i}`, species: "penguin" as const }));
  if (slot !== null) t.decor = [{ id: "station", kind: "penguinFeeder", slot, variant: null }];
  m.tanks = [t];
  m.progress.coastIntroSeen = true;
  return m;
}

describe("penguin keeper runtime", () => {
  it("cuts through five distinct left-to-right photographs for exactly five seconds", () => {
    expect(CLEAN_SHOTS.length).toBeGreaterThanOrEqual(5);
    expect(CLEAN_SHOTS.reduce((total, shot) => total + shot.duration, 0)).toBe(CLEAN_MONTAGE_SECONDS);
    expect(CLEAN_MONTAGE_SECONDS).toBe(5);
    for (let i = 0; i < CLEAN_SHOTS.length; i++) {
      const shot = CLEAN_SHOTS[i], previous = CLEAN_SHOTS[i - 1];
      expect(shot.duration).toBeGreaterThan(0);
      expect(shot.start).toBe(previous ? previous.start + previous.duration : 0);
      if (previous) {
        expect(shot.x).toBeGreaterThan(previous.x);
        expect(shot.pose).not.toBe(previous.pose);
        expect(shot.tool).not.toBe(previous.tool);
      }
      expect(cleanShotAt(shot.start)).toBe(shot);
      expect(cleanShotAt(shot.start + shot.duration - 0.001)).toBe(shot);
    }
    expect(new Set(CLEAN_SHOTS.map((shot) => shot.pose)).size).toBe(5);
    for (const elapsed of [-1, 5, 5.001, 10, Infinity, NaN]) expect(cleanShotAt(elapsed)).toBeNull();
  });

  it("holds one care action at a time and emits feeding care once, only when tipping starts", () => {
    const m = colony(), before = JSON.stringify(m);
    expect(startKeeperFeed(m)).toBe(true);
    expect(startKeeperFeed(m)).toBe(false);
    expect(startKeeperClean(m)).toBe(false);
    expect(keeperRt.feed.phase).toBe("doorOpening");
    expect(consumeKeeperBenefit("feed")).toBe(false);
    expect(coastRt.stationFood?.fish ?? 0).toBe(0);
    for (let i = 0; i < 2000 && keeperRt.feed.phase !== "tip"; i++) {
      expect(consumeKeeperBenefit("feed")).toBe(false);
      expect(coastRt.stationFood?.fish ?? 0).toBe(0);
      stepKeepers(m, 0.05);
    }
    expect(keeperRt.feed.phase).toBe("tip");
    expect(consumeKeeperBenefit("feed")).toBe(true);
    expect(consumeKeeperBenefit("feed")).toBe(false);
    let sawGrowingPile = false, maxFish = 0;
    for (let i = 0; i < 2000 && keeperRt.feed.phase !== "idle"; i++) {
      stepCoast(m, 0.05, true);
      const fish = coastRt.stationFood?.fish ?? 0;
      if (fish > 0 && fish < 9) sawGrowingPile = true;
      maxFish = Math.max(maxFish, fish);
    }
    expect(sawGrowingPile).toBe(true);
    expect(maxFish).toBe(9);
    expect(keeperRt.feed.phase).toBe("idle");
    expect(keeperRt.feed.door).toBe(0);
    expect(consumeKeeperBenefit("feed")).toBe(false);
    expect(JSON.stringify(m)).toBe(before);
  });

  it("waits for a penguin obstructing its next segment, then resumes safely", () => {
    const m = colony();
    startKeeperFeed(m);
    for (let i = 0; i < 30 && keeperRt.feed.phase === "doorOpening"; i++) stepKeepers(m, 0.05);
    expect(keeperRt.feed.phase).toBe("walkOut");
    const f = keeperRt.feed, to = f.route[f.leg];
    const length = Math.hypot(to.x - f.x, to.z - f.z);
    const bird = newMover("obstruction", "penguin", EXHIBITS.penguins, 72, 0);
    Object.assign(bird, { x: f.x + (to.x - f.x) / length * 0.5, z: f.z + (to.z - f.z) / length * 0.5, y: EXHIBITS.penguins.land.y });
    const x = f.x, z = f.z;
    stepKeepers(m, 0.1, [bird]);
    expect(f.x).toBe(x);
    expect(f.z).toBe(z);
    expect(f.walking).toBe(false);
    for (let i = 0; i < 1000 && keeperRt.feed.phase === "walkOut"; i++) stepKeepers(m, 0.05);
    expect(keeperRt.feed.phase).toBe("tip");
  });

  it("checks a walking penguin's swept segments against the keeper body", () => {
    const ex = EXHIBITS.penguins, bird = newMover("walker", "penguin", ex, 24, 0);
    Object.assign(bird, { x: -2.5, z: -5.1, y: ex.land.y, mode: "walk", area: "land", heading: Math.PI / 2, speed: 0.4 });
    bird.path = [{ x: 2.5, z: -5.1, y: ex.land.y }];
    const staff = { x: 0, z: -5.1, r: KEEPER_CLEARANCE, active: true };
    const ctx: MoveCtx = { time: 0, landItems: [], toy: null, movers: [bird], staff };
    let moved = 0;
    for (let i = 0; i < 400; i++) {
      const x = bird.x, z = bird.z;
      ctx.time += 0.05;
      stepMover(bird, ex, 0.05, ctx);
      expect(keeperSegmentClear(x, z, bird.x, bird.z, staff.x, staff.z), JSON.stringify({ x, z, bird })).toBe(true);
      moved += Math.hypot(bird.x - x, bird.z - z);
    }
    expect(moved).toBeGreaterThan(0.5);
  });

  it.each([0, 1, 2, 3, null])("walks collision-checked segments with station slot %s", (slot) => {
    const m = colony(slot), ex = EXHIBITS.penguins;
    // The fixed door blocks penguins; staff intentionally cross their own threshold.
    const items = habitatCtx(m, "penguins").landItems.filter((item) => item.x !== PENGUIN_STAFF_DOOR.x || item.z !== PENGUIN_STAFF_DOOR.z);
    expect(startKeeperFeed(m)).toBe(true);
    const phases = new Set<string>([keeperRt.feed.phase]);
    let distance = 0;
    for (let i = 0; i < 4000 && keeperRt.feed.phase !== "idle"; i++) {
      const prev = { x: keeperRt.feed.x, z: keeperRt.feed.z };
      stepKeepers(m, 0.05);
      phases.add(keeperRt.feed.phase);
      const next = keeperRt.feed;
      const moved = Math.hypot(next.x - prev.x, next.z - prev.z);
      if (moved > 1e-8) {
        expect(landLegClear(ex, prev, next, items, 0.35), JSON.stringify({ slot, prev, next })).toBe(true);
        expect(moved).toBeLessThan(0.2);
        distance += moved;
      }
    }
    expect(distance).toBeGreaterThan(2);
    expect([...phases]).toEqual(["doorOpening", "walkOut", "tip", "watch", "walkBack", "doorClosing", "idle"]);
    expect(consumeKeeperBenefit("feed")).toBe(true);
  });

  it("steps the cleaning montage discretely and finishes after five seconds with one benefit", () => {
    const m = colony(), before = JSON.stringify(m);
    expect(startKeeperClean(m)).toBe(true);
    expect(startKeeperClean(m)).toBe(false);
    expect(startKeeperFeed(m)).toBe(false);
    const frames = new Set<number>();
    for (let i = 0; i < 49; i++) {
      stepKeepers(m, 0.1);
      frames.add(keeperRt.clean.frame);
      expect(keeperRt.clean.phase).toBe("montage");
      expect(consumeKeeperBenefit("clean")).toBe(false);
    }
    expect([...frames]).toEqual([0, 1, 2, 3, 4]);
    stepKeepers(m, 0.11);
    expect(keeperRt.clean.phase).toBe("idle");
    expect(cleanShotAt(keeperRt.clean.elapsed)).toBeNull();
    expect(consumeKeeperBenefit("clean")).toBe(true);
    expect(consumeKeeperBenefit("clean")).toBe(false);
    expect(JSON.stringify(m)).toBe(before);
  });

  it.each(["feed", "clean"] as const)("settles unfinished %s once on leave and resets presentation", (kind) => {
    const m = colony();
    expect(kind === "feed" ? startKeeperFeed(m) : startKeeperClean(m)).toBe(true);
    stepCoast(m, 0.1, false);
    expect(keeperRt.feed.phase).toBe("idle");
    expect(keeperRt.feed.door).toBe(0);
    expect(keeperRt.clean.phase).toBe("idle");
    expect(consumeKeeperBenefit(kind)).toBe(true);
    finishKeepers();
    expect(consumeKeeperBenefit(kind)).toBe(false);
    resetKeepers();
    expect(startKeeperFeed(m)).toBe(true);
  });

  it("discards unfinished presentation and pending care on runtime teardown", () => {
    const m = colony();
    startKeeperFeed(m);
    finishKeepers();
    clearCoast();
    expect(consumeKeeperBenefit("feed")).toBe(false);
    expect(keeperRt.feed.phase).toBe("idle");
    expect(keeperRt.clean.phase).toBe("idle");
    expect(coastRt.stationFood).toBeNull();
  });
});
