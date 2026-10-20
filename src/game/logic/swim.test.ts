import { describe, expect, it } from "vitest";
import { SPECIES, SPECIES_ORDER } from "../data/fish";
import { TANKS, SAND_H } from "../data/tanks";
import { makeRng } from "./rng";
import { fishBounds, floorAt, newSwimState, stepSwim, type Column, type SwimEnv } from "./swim";

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
});
