import { describe, expect, it } from "vitest";
import { SPECIES, SPECIES_ORDER } from "../data/fish";
import { TANKS, SAND_H } from "../data/tanks";
import { makeRng } from "./rng";
import { fishBounds, floorAt, newSwimState, pickTarget, REEF_AFFINITY, stepSwim, type Column, type SwimEnv } from "./swim";

describe("fish swimming", () => {
  for (const id of SPECIES_ORDER) {
    for (const type of SPECIES[id].habitat) {
      it(`${id} stays inside the ${type} tank, above the sand and decorations`, () => {
        const def = SPECIES[id];
        const tank = TANKS[type];
        const bounds = fishBounds(tank.w, tank.d, tank.h, SAND_H, def);
        const columns: Column[] = tank.slots.slice(0, 2).map((s, i) => ({ x: s.x, z: s.z, r: 0.14, top: SAND_H + tank.h * (i ? 0.6 : 0.3) }));
        const rand = makeRng(7 + id.length);
        const others = [{ x: 0, y: 0.4, z: 0 }];
        const env: SwimEnv = { bounds, columns, others, speedMul: 1, attract: null, depthBias: 0 };
        const s = newSwimState(def, env, rand);
        for (let i = 0; i < 20_000; i++) {
          env.speedMul = 0.3 + rand() * 1.5;
          // Sometimes chase a point far outside the glass (a bad pellet), sometimes drift up hungry.
          env.attract = i % 900 < 120 ? { x: (rand() - 0.5) * 6, y: rand() * 3 - 1, z: (rand() - 0.5) * 3 } : null;
          env.depthBias = i % 2000 < 500 ? 0.4 : 0;
          stepSwim(s, def, env, rand() * 0.12, rand);
          expect(s.x).toBeGreaterThanOrEqual(bounds.min.x);
          expect(s.x).toBeLessThanOrEqual(bounds.max.x);
          expect(s.z).toBeGreaterThanOrEqual(bounds.min.z);
          expect(s.z).toBeLessThanOrEqual(bounds.max.z);
          expect(s.y).toBeLessThanOrEqual(bounds.max.y);
          expect(s.y).toBeGreaterThanOrEqual(floorAt(s.x, s.z, bounds, columns, def.radius) - 1e-9);
        }
        // The body (half a length either side) never reaches the glass.
        expect(bounds.min.x - def.length / 2).toBeGreaterThan(-tank.w / 2);
        expect(bounds.max.z + def.length / 2).toBeLessThan(tank.d / 2);
      });
    }
  }

  it("swims to food that falls in", () => {
    const def = SPECIES.bluetang;
    const tank = TANKS.small;
    const bounds = fishBounds(tank.w, tank.d, tank.h, SAND_H, def);
    const rand = makeRng(3);
    const pellet = { x: 0.3, y: 0.5, z: 0.05 };
    const env: SwimEnv = { bounds, columns: [], others: [], speedMul: 1, attract: pellet, depthBias: 0 };
    const s = newSwimState(def, env, rand);
    s.x = bounds.min.x;
    let t = 0;
    while (Math.hypot(s.x - pellet.x, s.y - pellet.y, s.z - pellet.z) > 0.08 && t < 10) {
      stepSwim(s, def, env, 1 / 30, rand);
      t += 1 / 30;
    }
    expect(t).toBeLessThan(10);
  });

  it("is repeatable with the same seed", () => {
    const def = SPECIES.clownfish;
    const tank = TANKS.big;
    const run = () => {
      const rand = makeRng(42);
      const env: SwimEnv = { bounds: fishBounds(tank.w, tank.d, tank.h, SAND_H, def), columns: [], others: [], speedMul: 1, attract: null, depthBias: 0 };
      const s = newSwimState(def, env, rand);
      for (let i = 0; i < 500; i++) stepSwim(s, def, env, 1 / 60, rand);
      return [s.x, s.y, s.z];
    };
    expect(run()).toEqual(run());
  });

  it("seahorses hover between propulsion strokes while tangs keep gliding", () => {
    for (const id of ["seahorse", "bluetang"] as const) {
      const def = SPECIES[id], tank = TANKS.tall;
      const env: SwimEnv = { bounds: fishBounds(tank.w, tank.d, tank.h, SAND_H, def), columns: [], others: [], speedMul: 1, attract: null, depthBias: 0 };
      const rand = makeRng(16), s = newSwimState(def, env, rand);
      s.rhythmPhase = 0; s.burst = 0;
      let minimum = 2, maximum = 0;
      for (let i = 0; i < 800; i++) {
        // Isolate the propulsion rhythm from optional spontaneous bursts.
        s.burst = 0;
        stepSwim(s, def, env, 0.025, rand);
        minimum = Math.min(minimum, s.effort ?? 1);
        maximum = Math.max(maximum, s.effort ?? 1);
      }
      expect(maximum).toBeGreaterThan(1);
      if (id === "seahorse") expect(minimum).toBeLessThan(0.1);
      else expect(minimum).toBeGreaterThanOrEqual(0.56);
      env.attract = { x: 0, y: 0.5, z: 0 };
      s.burst = 0.55;
      for (let i = 0; i < 20; i++) stepSwim(s, def, env, 0.025, rand);
      expect(s.effort).toBeGreaterThan(0.85);
    }
  });

  it("turns through a heading change instead of reversing at a new target", () => {
    const def = SPECIES.bluetang, tank = TANKS.ocean;
    const env: SwimEnv = { bounds: fishBounds(tank.w, tank.d, tank.h, SAND_H, def), columns: [], others: [], speedMul: 1, attract: { x: -0.8, y: 0.5, z: 0 }, depthBias: 0 };
    const rand = makeRng(4), s = newSwimState(def, env, rand);
    s.x = 0; s.y = 0.5; s.z = 0; s.vx = 0.2; s.vz = 0;
    let previous = Math.atan2(s.vz, s.vx);
    for (let i = 0; i < 60; i++) {
      stepSwim(s, def, env, 1 / 60, rand);
      const heading = Math.atan2(s.vz, s.vx);
      const change = Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
      expect(Math.abs(change)).toBeLessThanOrEqual(def.turn / 60 + 1e-8);
      previous = heading;
    }
    expect(s.vz).not.toBe(0);
  });
});

describe("reef fish keep to the coral", () => {
  const tank = TANKS.reef;
  const columns: Column[] = (tank.rocks ?? []).map((r) => ({ x: r.x, z: r.z, r: r.r, top: SAND_H + r.top }));
  // In open water (not above rock), on a formation's visitor side, close to its edge.
  const beside = (x: number, z: number, radius: number) =>
    columns.every((c) => Math.hypot(x - c.x, z - c.z) > c.r) &&
    columns.some((c) => z > c.z && Math.hypot(x - c.x, z - c.z) - c.r < radius + 0.2);
  const besideRate = (id: keyof typeof REEF_AFFINITY, reef: boolean) => {
    const def = SPECIES[id];
    const bounds = fishBounds(tank.w, tank.d, tank.h, SAND_H, def);
    const env: SwimEnv = { bounds, columns, others: [], speedMul: 1, attract: null, depthBias: 0, reef };
    const rand = makeRng(11);
    const s = newSwimState(def, env, rand);
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      pickTarget(s, def, env, rand);
      expect(s.tx).toBeGreaterThanOrEqual(bounds.min.x);
      expect(s.tx).toBeLessThanOrEqual(bounds.max.x);
      expect(s.ty).toBeLessThanOrEqual(bounds.max.y);
      expect(s.ty).toBeGreaterThanOrEqual(floorAt(s.tx, s.tz, bounds, columns, def.radius) - 1e-9);
      if (beside(s.tx, s.tz, def.radius)) hits++;
    }
    return hits / 400;
  };

  for (const id of Object.keys(REEF_AFFINITY) as (keyof typeof REEF_AFFINITY)[]) {
    it(`${id}: in the reef, targets hover beside formations' visitor side and stay in the water`, () => {
      const open = besideRate(id, false);
      expect(besideRate(id, true)).toBeGreaterThan(open + REEF_AFFINITY[id]! * 0.4);
    });
  }

  it("outside the giant reef the wander pick is unchanged", () => {
    const def = SPECIES.clownfish;
    const bounds = fishBounds(tank.w, tank.d, tank.h, SAND_H, def);
    const pick = (reef: boolean | undefined) => {
      const rand = makeRng(5);
      const env: SwimEnv = { bounds, columns, others: [], speedMul: 1, attract: null, depthBias: 0, reef };
      const s = newSwimState(def, env, rand);
      pickTarget(s, def, env, rand);
      return [s.tx, s.ty, s.tz];
    };
    expect(pick(false)).toEqual(pick(undefined));
  });
});
