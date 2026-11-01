import { describe, expect, it } from "vitest";
import { SPECIES, SPECIES_ORDER } from "../data/fish";
import { SAND_H, TANKS } from "../data/tanks";
import type { SpeciesId, TankType } from "../types";
import { makeRng } from "./rng";
import { reactToAnimalTap, stepBehavior, type BehaviorEnv, type BehaviorState } from "./behavior";
import { floorAt, frontAt, newSwimState, stepSwim, tankFishBounds, type SwimState } from "./swim";
import { animalGeometry } from "../../scene/models/animals";
import { jellyPulse, jellyPulseStyle } from "./motion";
import { eelBounds, eelDenRail, eelFloor, EEL_RADIUS } from "./eelBody";

const expansion: SpeciesId[] = ["angelfish", "goby", "chromis", "eel", "octopus", "crab", "stingray", "moonjelly", "spottedjelly", "seanettle"];
function setup(id: SpeciesId, type: TankType, seed: number, decoration = true) {
  const def = SPECIES[id], tank = TANKS[type];
  const bounds = id === "eel" ? eelBounds(tank) : tankFishBounds(tank, SAND_H, def);
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

/** An eel's collision envelope is a head radius and a recorded body, rather
 * than half its total length. The rig tests cover every trailing point. */
function eelHeadInside(s: SwimState, state: BehaviorState, env: BehaviorEnv): boolean {
  const r = EEL_RADIUS, epsilon = 1e-6, tank = env.tank;
  if (!Number.isFinite(s.x + s.y + s.z + s.vx + s.vy + s.vz)
    || Math.abs(s.x) > tank.w / 2 - r + epsilon
    || s.z > tank.d / 2 - r + epsilon || s.z < -tank.d / 2 + r - epsilon
    || s.y < r - epsilon || s.y > tank.h - r + epsilon) return false;
  const face = -tank.d / 2 + (tank.backRock ?? 0);
  const index = state.denIndex ?? 0, body = state.eel, mouth = tank.dens?.[index];
  // The straight rail lane is q=0..0.40 m in front of the mouth. Its last
  // 12 mm of lateral capture error blend to zero by q=.075, before crossing.
  if (mouth && body?.rail && s.z >= mouth.z && s.z <= mouth.z + 0.40
    && Math.hypot(s.x - mouth.x, s.y - mouth.y) <= 0.012 + epsilon) return true;
  // Head travel behind the face follows the assigned tunnel. Crossing and
  // full-body clearance are checked against its actual mouth in eelBody tests.
  if (s.z < face + r) {
    if (!tank.dens?.[index] || !body?.rail) return false;
    const rail = { x: 0, y: 0, z: 0 };
    eelDenRail(rail, tank, index, body.railQ);
    return Math.hypot(s.x - rail.x, s.y - rail.y, s.z - rail.z) < epsilon;
  }
  return s.y >= eelFloor(tank, s.x, s.z) - epsilon
    && env.columns.every(column => Math.hypot(s.x - column.x, s.z - column.z) >= column.r + r - epsilon
      || s.y >= column.top + r - epsilon);
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
        let valid = true, onSurface = true, compact = true, firstInvalid = "";
        for (let i = 0; i < 2400; i++) {
          // Out-of-glass food and show targets must also stay contained.
          if (i % 600 === 0) env.attract = { x: 5, y: 3, z: 4 };
          if (i % 600 === 90) env.attract = null;
          env.show = i % 600 < 45;
          env.speedMul = i % 400 < 80 ? 1.4 : 0.8;
          stepBehavior(s, state, def, env, 0.05, rand);
          const headInside = id === "eel" ? eelHeadInside(s, state, env) : inside(s, env, def.radius);
          if (!headInside && !firstInvalid) firstInvalid = JSON.stringify({ i, s, mode: state.mode, rail: state.eel?.rail,
            railQ: state.eel?.railQ, yaw: state.eel?.yaw, pitch: state.eel?.pitch,
            floor: id === "eel" ? eelFloor(env.tank, s.x, s.z) : floorAt(s.x, s.z, env.bounds, env.columns, def.radius),
            columns: env.columns });
          valid &&= headInside;
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
        expect(valid, `bounds, seed ${seed}: ${firstInvalid}`).toBe(true);
        expect(onSurface, `surface, seed ${seed}`).toBe(true);
        expect(compact, `school radius, seed ${seed}`).toBe(true);
        if (def.school) expect((state.members?.length ?? 0) + 1).toBe(def.school);
      }
    });
  }

  for (const id of SPECIES_ORDER.filter(id => SPECIES[id].movement === "swim")) {
    it(`${id} delegates to repeatable stepSwim motion without additional random draws`, () => {
      const type = SPECIES[id].habitat[0];
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
      for (const seed of [12 + index, 3, 19, 101]) {
        const { def, env, rand, s, state } = setup("eel", "cave", seed, false);
        env.denIndex = index;
        let departures = 0, returns = 0, previous: BehaviorState["mode"];
        const mouth = TANKS.cave.dens![index];
        const homeX = mouth?.x ?? (-.1 + (index - TANKS.cave.dens!.length) * .5);
        let homeY = mouth?.y ?? eelFloor(env.tank, homeX, .39);
        if (!mouth) for (let i = 1; i < 16; i++) homeY = Math.max(homeY, eelFloor(env.tank, homeX - i * def.length / 15, .39));
        const homeZ = mouth ? mouth.z + .16 : .39;
        if (seed === 12 + index) mouths.push(homeX);
        for (let i = 0; i < 4000; i++) {
          stepBehavior(s, state, def, env, 0.05, rand);
          if (state.mode === "rest") {
            // Head and neck remain in the open water; the recorded spine extends
            // through the real aperture into the hidden tunnel behind the disc.
            if (mouth) {
              expect(Math.abs(s.x - mouth.x)).toBeLessThan(1e-6);
              expect(Math.abs(s.y - mouth.y)).toBeLessThan(1e-6);
              expect(s.z).toBeGreaterThanOrEqual(mouth.z + 0.13 - 1e-6);
              expect(s.z).toBeLessThanOrEqual(mouth.z + 0.19 + 1e-6);
            } else {
              expect(Math.hypot(s.x - homeX, s.y - homeY, s.z - homeZ)).toBeLessThan(.026);
              expect(s.y).toBeGreaterThanOrEqual(eelFloor(env.tank, s.x, s.z) - 1e-6);
              expect(s.z).toBeGreaterThan(env.bounds.min.z);
            }
          }
          if (previous === "rest" && state.mode === "cruise") departures++;
          if (previous === "return" && state.mode === "rest") {
            returns++;
            const peekZ = mouth ? mouth.z + .16 + .03 * Math.sin(state.eel!.phase * .27) : homeZ;
            expect(Math.hypot(s.x - homeX, s.y - homeY, s.z - peekZ)).toBeLessThan(mouth ? .016 : .026);
            expect(state.modeTimer).toBeGreaterThanOrEqual(8);
            expect(state.modeTimer).toBeLessThanOrEqual(15);
          }
          previous = state.mode;
        }
        expect(departures, `den ${index}, seed ${seed}`).toBeGreaterThan(2);
        expect(returns, `den ${index}, seed ${seed}`).toBeGreaterThan(2);
      }
    }
    expect(new Set(mouths).size).toBe(TANKS.cave.capacity);
  }, 60_000);

  for (const id of ["jellyfish", "moonjelly", "spottedjelly", "seanettle"] as const) {
    it(`${id} contracts faster than it relaxes and applies thrust on the contraction`, () => {
      const style = jellyPulseStyle(id), turn = Math.PI * 2;
      expect(style.contract).toBeLessThan(0.3);
      expect(jellyPulse(id, 0)).toBeCloseTo(0);
      expect(jellyPulse(id, style.contract * turn)).toBeCloseTo(1);
      expect(jellyPulse(id, turn)).toBeCloseTo(0);
      expect(jellyPulse(id, style.contract * 0.5 * turn)).toBeCloseTo(0.5);
      const { def, env, rand, s, state } = setup(id, "tall", 38, false);
      s.y = (env.bounds.min.y + env.bounds.max.y) / 2;
      s.vy = 0; state.pulsePhase = style.contract * 0.5 * turn;
      stepBehavior(s, state, def, env, 0.01, rand);
      expect(s.vy).toBeGreaterThan(0);
      s.vy = 0; state.pulsePhase = (style.contract + (1 - style.contract) * 0.5) * turn;
      stepBehavior(s, state, def, env, 0.01, rand);
      expect(s.vy).toBeLessThan(0);
    });
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

  it("a tap starts one short burst without restarting it every frame", () => {
    const { s, state } = setup("octopus", "cave", 38, false);
    reactToAnimalTap(s, state, -10, 0);
    expect(s.burst).toBe(0);
    reactToAnimalTap(s, state, 3, 3.02);
    expect(s.burst).toBe(0.55);
    expect(s.wait).toBe(0);
    s.burst = 0.2;
    reactToAnimalTap(s, state, 3, 3.04);
    expect(s.burst).toBe(0.2);
    reactToAnimalTap(s, state, 4, 4.02);
    expect(s.burst).toBe(0.55);
  });

  it("octopuses investigate actual den lips as well as open sand", () => {
    const { def, env, rand, s, state } = setup("octopus", "cave", 43, false);
    let denVisits = 0, sandVisits = 0;
    for (let i = 0; i < 6000; i++) {
      const previous = state.mode;
      stepBehavior(s, state, def, env, 0.05, rand);
      if (previous === "rest" && state.mode !== "rest") {
        if (env.tank.dens?.some(den => Math.abs(s.tx - den.x) < 0.01 && Math.abs(s.tz - env.bounds.min.z) < 0.01)) denVisits++;
        else sandVisits++;
      }
    }
    expect(denVisits).toBeGreaterThan(0);
    expect(sandVisits).toBeGreaterThan(0);
  });
});
