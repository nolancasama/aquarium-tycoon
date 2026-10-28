import { describe, expect, it } from "vitest";
import { SPECIES, SPECIES_ORDER } from "../data/fish";
import { SAND_H, TANKS } from "../data/tanks";
import type { SpeciesId, TankType } from "../types";
import { makeRng } from "./rng";
import { stepBehavior, type BehaviorEnv, type BehaviorState } from "./behavior";
import { floorAt, frontAt, newSwimState, stepSwim, tankFishBounds, type SwimState } from "./swim";
import { animalGeometry } from "../../scene/models/animals";

const expansion: SpeciesId[] = ["angelfish", "goby", "chromis", "eel", "octopus", "crab", "stingray", "moonjelly", "spottedjelly", "seanettle"];
function setup(id: SpeciesId, type: TankType, seed: number, decoration = true) {
  const def = SPECIES[id], tank = TANKS[type];
  const bounds = tankFishBounds(tank, SAND_H, def);
  const columns = [...(tank.rocks ?? [])];
  if (decoration) columns.push({ x: 0, z: (bounds.min.z + bounds.max.z) / 2, r: 0.1, top: Math.min(bounds.max.y - def.radius, 0.35) });
  const env: BehaviorEnv = { bounds, tank, columns, others: [], speedMul: 1, attract: null, depthBias: 0 };
  const rand = makeRng(seed), s = newSwimState(def, env, rand);
  const state: BehaviorState = {};
  return { def, env, rand, s, state };
}

/** Check shaped glass and obstacle floors, rather than just a tank's box. */
function inside(s: SwimState, env: BehaviorEnv, radius: number): boolean {
  const b = env.bounds, epsilon = 1e-8;
  return Number.isFinite(s.x + s.y + s.z + s.vx + s.vy + s.vz)
    && s.x >= b.min.x - epsilon && s.x <= b.max.x + epsilon
    && s.z >= b.min.z - epsilon && s.z <= frontAt(b, s.x) + epsilon
    && (b.round === undefined || Math.hypot(s.x, s.z) <= b.round + epsilon)
    && s.y >= floorAt(s.x, s.z, b, env.columns, radius) - epsilon && s.y <= b.max.y + epsilon;
}

describe("species movement", () => {
  it("caches finite expansion geometry within each animal's triangle budget", () => {
    for (const id of expansion) {
      const geometry = animalGeometry(id);
      expect(animalGeometry(id)).toBe(geometry);
      const triangles = geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3;
      expect(triangles * (SPECIES[id].school ?? 1)).toBeLessThanOrEqual(2500);
      for (const name of ["position", "normal", "color", "wave"]) {
        const attribute = geometry.getAttribute(name);
        expect(attribute, `${id} ${name}`).toBeDefined();
        expect(Array.from(attribute.array).every(Number.isFinite), `${id} ${name} finite`).toBe(true);
      }
    }
  });
  for (const id of expansion) for (const type of SPECIES[id].habitat) {
    it(`${id} respects the ${type} glass and rockwork for several seeds`, () => {
      for (const seed of [3, 19, 101]) {
        const { def, env, rand, s, state } = setup(id, type, seed);
        let valid = true, onSurface = true, compact = true;
        for (let i = 0; i < 2400; i++) {
          // Out-of-glass food and show targets must also stay contained.
          if (i % 600 === 0) env.attract = { x: 5, y: 3, z: 4 };
          if (i % 600 === 90) env.attract = null;
          env.show = i % 600 < 45;
          env.speedMul = i % 400 < 80 ? 1.4 : 0.8;
          stepBehavior(s, state, def, env, 0.05, rand);
          valid &&= inside(s, env, def.radius);
          if (def.movement === "perch" || def.movement === "walk") {
            onSurface &&= Math.abs(s.y - floorAt(s.x, s.z, env.bounds, env.columns, def.radius)) < 1e-8;
          }
          if (def.movement === "crawl") {
            onSurface &&= s.y <= floorAt(s.x, s.z, env.bounds, env.columns, def.radius) + 0.02 || Math.abs(s.z - env.bounds.min.z) < 0.02;
          }
          for (const m of state.members ?? []) {
            valid &&= inside(m, env, def.radius);
            compact &&= Math.hypot(m.x - s.x, m.y - s.y, m.z - s.z) <= 0.35 + 1e-8;
          }
        }
        expect(valid, `bounds, seed ${seed}`).toBe(true);
        expect(onSurface, `surface, seed ${seed}`).toBe(true);
        expect(compact, `school radius, seed ${seed}`).toBe(true);
        if (def.school) expect((state.members?.length ?? 0) + 1).toBe(def.school);
      }
    });
  }

  for (const id of SPECIES_ORDER.filter(id => SPECIES[id].movement === "swim" || id === "jellyfish")) {
    it(`${id} preserves the exact existing stepSwim trajectory and random draws`, () => {
      const type = id === "jellyfish" ? "tall" : SPECIES[id].habitat[0];
      for (const seed of [7, 23, 77]) {
        const a = setup(id, type, seed), b = setup(id, type, seed);
        for (let i = 0; i < 2400; i++) {
          a.env.attract = b.env.attract = i % 500 < 70 ? { x: 0.1, y: 0.7, z: 0.1 } : null;
          a.env.depthBias = b.env.depthBias = i % 1000 < 200 ? 0.3 : 0;
          stepBehavior(a.s, a.state, a.def, a.env, 1 / 30, a.rand);
          stepSwim(b.s, b.def, b.env, 1 / 30, b.rand);
        }
        expect(a.s).toEqual(b.s);
        expect(a.rand()).toBe(b.rand());
      }
    });
  }

  it("eels repeatedly leave and return to their assigned accessible den mouths", () => {
    const mouths: number[] = [];
    for (let index = 0; index < TANKS.cave.capacity; index++) {
      const { def, env, rand, s, state } = setup("eel", "cave", 12 + index, false);
      env.denIndex = index;
      let departures = 0, returns = 0, previous: BehaviorState["mode"];
      let mouthX = 0, mouthY = 0, mouthZ = 0;
      for (let i = 0; i < 4000; i++) {
        stepBehavior(s, state, def, env, 0.05, rand);
        if (i === 0) { mouthX = s.x; mouthY = s.y; mouthZ = s.z; mouths.push(s.x); }
        if (previous === "rest" && state.mode === "cruise") departures++;
        if (previous === "return" && state.mode === "rest") {
          returns++;
          expect(Math.hypot(s.x - mouthX, s.y - mouthY, s.z - mouthZ)).toBeLessThan(1e-8);
          expect(state.modeTimer).toBeGreaterThanOrEqual(8);
          expect(state.modeTimer).toBeLessThanOrEqual(15);
        }
        previous = state.mode;
      }
      expect(departures).toBeGreaterThan(2);
      expect(returns).toBeGreaterThan(2);
    }
    expect(new Set(mouths).size).toBe(TANKS.cave.capacity);
  });

  for (const id of ["jellyfish", "moonjelly", "spottedjelly", "seanettle"] as const) {
    it(`${id} pulses, sinks between beats and circulates with the jelly column current`, () => {
      const { def, env, rand, s, state } = setup(id, "cylinder", 38, false);
      s.x = 0; s.z = 0; s.vx = 0; s.vz = 0;
      let angle = 0, previous = Math.atan2(s.z, s.x), rising = false, sinking = false;
      for (let i = 0; i < 2400; i++) {
        stepBehavior(s, state, def, env, 0.05, rand);
        const next = Math.atan2(s.z, s.x);
        angle += Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
        previous = next;
        rising ||= s.vy > 0.005; sinking ||= s.vy < -0.005;
      }
      expect(angle).toBeGreaterThan(Math.PI * 3);
      expect(rising).toBe(true); expect(sinking).toBe(true);
      expect(state.pulsePhase).toBeGreaterThanOrEqual(0);
      expect(state.pulsePhase).toBeLessThan(Math.PI * 2);
    });
  }

  for (const id of ["goby", "chromis", "eel", "octopus", "crab", "stingray", "moonjelly"] as const) {
    it(`${id} approaches sand food and comes forward for a visitor`, () => {
      const { def, env, rand, s, state } = setup(id, SPECIES[id].habitat[0], 81, false);
      const b = env.bounds;
      s.x = -0.15; s.z = b.min.z; s.y = b.min.y;
      env.attract = { x: 0.15, y: b.min.y, z: Math.min(frontAt(b, 0.15), b.min.z + 0.08) };
      for (let i = 0; i < 1200; i++) stepBehavior(s, state, def, env, 0.05, rand);
      expect(Math.hypot(s.x - env.attract.x, s.y - env.attract.y, s.z - env.attract.z)).toBeLessThan(0.085);
      env.attract = { x: 0, y: b.min.y, z: frontAt(b, 0) };
      env.show = true;
      for (let i = 0; i < 52; i++) stepBehavior(s, state, def, env, 0.05, rand);
      expect(s.z).toBeGreaterThanOrEqual(Math.min(env.attract.z, b.round ?? Infinity) - 0.08);
      if (def.movement === "den") expect(state.mode).toBe("cruise");
      if (def.movement === "school") for (const m of state.members ?? []) expect(Math.hypot(m.x - s.x, m.y - s.y, m.z - s.z)).toBeLessThan(0.2);
    });
  }

  it("octopuses expose a slow colour phase and climb the rock face", () => {
    const { def, env, rand, s, state } = setup("octopus", "cave", 11, false);
    let climbed = false;
    for (let i = 0; i < 4000; i++) {
      stepBehavior(s, state, def, env, 0.05, rand);
      climbed ||= s.y > env.bounds.min.y + 0.08 && Math.abs(s.z - env.bounds.min.z) < 0.02;
    }
    expect(climbed).toBe(true);
    expect(state.colourPhase).toBeGreaterThan(0);
  });
});
