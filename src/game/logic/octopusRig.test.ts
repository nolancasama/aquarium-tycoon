import { describe, expect, it } from "vitest";
import { SPECIES } from "../data/fish";
import { SAND_H, STAND_H, TANKS } from "../data/tanks";
import { makeRng } from "./rng";
import { reactToAnimalTap, stepBehavior, type BehaviorEnv, type BehaviorState } from "./behavior";
import { newSwimState, tankFishBounds, type Column } from "./swim";
import { sandSurfaceY } from "./tankLayout";
import { deformOctopusVertex, octopusBodyHeight, octopusGrab, octopusTap, OCTOPUS_ARM_LENGTH, type OctopusRig } from "./octopusRig";

const def = SPECIES.octopus, tank = TANKS.cave;
const DECOR: Column[] = [{ x: -0.02, z: 0.2, r: 0.14, top: 0.3 }];

function setup(seed: number, columns: Column[] = [...tank.rocks!]) {
  const env: BehaviorEnv = { tank, bounds: tankFishBounds(tank, SAND_H, def), columns, others: [], speedMul: 1, attract: null, depthBias: 0, phase: seed };
  const rand = makeRng(seed);
  const s = newSwimState(def, env, rand);
  const state: BehaviorState = {};
  return { env, rand, s, state, step: (dt = 1 / 30) => { stepBehavior(s, state, def, env, dt, rand); return state.octopus as OctopusRig; } };
}
const planted = (o: OctopusRig) => o.arms.filter((a) => a.state === "stance").length;

describe("octopus arm rig", () => {
  it("planted tips stay fixed in the water while the body travels", () => {
    const { env, s, step } = setup(5);
    env.attract = { x: 0.6, y: env.bounds.min.y, z: 0.25 };
    s.x = -0.5; s.z = 0.2;
    let o = step();
    const held = o.arms.map((a) => ({ x: a.tip.x, y: a.tip.y, z: a.tip.z, on: a.state === "stance" }));
    let intervals = 0, travelled = 0, last = s.x;
    for (let i = 0; i < 300; i++) {
      o = step();
      travelled += Math.abs(s.x - last); last = s.x;
      o.arms.forEach((a, k) => {
        if (a.state === "stance" && held[k].on) {
          intervals++;
          expect(Math.hypot(a.tip.x - held[k].x, a.tip.y - held[k].y, a.tip.z - held[k].z)).toBeLessThan(0.002);
        }
        held[k] = { x: a.tip.x, y: a.tip.y, z: a.tip.z, on: a.state === "stance" };
      });
    }
    expect(intervals).toBeGreaterThan(500);
    expect(travelled).toBeGreaterThan(0.15);
  });

  it("is pulled by its arms: fast with many planted, barely moving with few", () => {
    const { env, s, step } = setup(7);
    env.attract = { x: 0.7, y: env.bounds.min.y, z: 0.25 };
    s.x = -0.7; s.z = 0.2;
    let few = 0, fewFrames = 0, many = 0, manyFrames = 0, previous = s.x, o = step();
    for (let i = 0; i < 600 && s.x < 0.6; i++) {
      const count = planted(o);
      o = step();
      const moved = Math.abs(s.x - previous); previous = s.x;
      if (count < 3) { few += moved; fewFrames++; }
      if (count >= 7) { many += moved; manyFrames++; }
    }
    expect(manyFrames).toBeGreaterThan(5);
    if (fewFrames) expect(few / fewFrames).toBeLessThan(many / manyFrames * 0.5);
  });

  it("arms never all do the same thing, and at most about half lift together while walking", () => {
    const { env, s, step } = setup(11);
    env.attract = { x: 0.7, y: env.bounds.min.y, z: 0.25 };
    s.x = -0.6; s.z = 0.15;
    let lifted = 0, varied = 0, frames = 0;
    for (let i = 0; i < 400; i++) {
      const o = step();
      const states = new Set(o.arms.map((a) => `${a.state}:${a.age.toFixed(2)}`));
      if (states.size > 1) varied++;
      lifted = Math.max(lifted, o.arms.filter((a) => a.state === "swing").length);
      frames++;
    }
    expect(varied).toBe(frames);
    expect(lifted).toBeGreaterThan(0);
    expect(lifted).toBeLessThanOrEqual(5);
    // At rest, arms still act separately rather than holding one pose.
    env.attract = null;
    const rest = setup(11);
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) seen.add(rest.step().arms.map((a) => a.state).join());
    expect(seen.size).toBeGreaterThan(3);
  });

  const layouts: [string, Column[]][] = [["bare", [...tank.rocks!]], ["decorated", [...tank.rocks!, ...DECOR]]];
  for (const [name, columns] of layouts) {
    it(`arm tips and the head stay out of solids over long lives (${name})`, () => {
      for (const seed of [3, 19, 101]) {
        const { s, step } = setup(seed, columns);
        let tallied = 0;
        for (let i = 0; i < 2400; i++) {
          const o = step(0.05);
          const under = sandSurfaceY(tank, o.x, o.z) - STAND_H;
          expect(o.y - def.length * 0.35).toBeGreaterThan(under);
          for (const a of o.arms) {
            tallied++;
            const { x, y, z } = a.tip;
            expect(Math.abs(x)).toBeLessThanOrEqual(tank.w / 2);
            expect(z).toBeLessThanOrEqual(tank.d / 2);
            expect(z).toBeGreaterThanOrEqual(-tank.d / 2 + tank.backRock!);
            expect(y).toBeGreaterThanOrEqual(sandSurfaceY(tank, x, z) - STAND_H);
            for (const c of columns) if (Math.hypot(x - c.x, z - c.z) < c.r - 0.002) expect(y).toBeGreaterThanOrEqual(c.top);
          }
        }
        expect(tallied).toBeGreaterThan(0);
        expect(Number.isFinite(s.x)).toBe(true);
      }
    }, 60_000);
  }

  it("planted arms land on the rendered sand, including the dune", () => {
    const { env, s, step } = setup(23);
    env.attract = { x: tank.w * -0.16, y: env.bounds.min.y, z: tank.d * 0.08 };
    s.x = 0.5; s.z = 0.25;
    let checked = 0;
    for (let i = 0; i < 900; i++) {
      for (const a of step().arms) if (a.state === "stance" && a.tip.y < 0.3) {
        checked++;
        expect(Math.abs(a.tip.y - (sandSurfaceY(tank, a.tip.x, a.tip.z) - STAND_H))).toBeLessThan(0.03);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("the shader mapping meets the root, reaches the tip and keeps arm length roughly constant", () => {
    const { step } = setup(31);
    let o = step();
    for (let i = 0; i < 200; i++) o = step();
    const p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0 };
    for (let arm = 0; arm < 8; arm++) {
      deformOctopusVertex(p, o.rig, arm, 0);
      const a = arm * Math.PI / 4;
      expect(p.x).toBeCloseTo(Math.cos(a) * 0.048, 5);
      expect(p.y).toBeCloseTo(-0.084, 5);
      deformOctopusVertex(p, o.rig, arm, 1);
      expect(p.x).toBeCloseTo(o.rig[(arm + 8) * 4], 5);
      let length = 0;
      deformOctopusVertex(p, o.rig, arm, 0);
      for (let j = 1; j <= 24; j++) {
        deformOctopusVertex(q, o.rig, arm, j / 24);
        length += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        p.x = q.x; p.y = q.y; p.z = q.z;
      }
      expect(Math.abs(length - OCTOPUS_ARM_LENGTH) / OCTOPUS_ARM_LENGTH).toBeLessThan(0.3);
    }
  });

  it("tap reactions leave the walk going and pose free arms with the body", () => {
    for (const reaction of ["raise", "curl", "look", "colour"] as const) {
      const { env, s, step } = setup(41);
      env.attract = { x: 0.7, y: env.bounds.min.y, z: 0.2 };
      s.x = -0.6; s.z = 0.2;
      let o = step();
      for (let i = 0; i < 30; i++) o = step();
      const before = s.x;
      octopusTap(o, reaction);
      expect(o.colour).toBe(1);
      let minPlanted = 8, highest = -1, curled = 0;
      for (let i = 0; i < 25; i++) {
        o = step();
        minPlanted = Math.min(minPlanted, planted(o));
        for (const a of o.arms) { highest = Math.max(highest, a.tip.y - o.y); curled = Math.max(curled, a.curl); }
      }
      expect(s.x).toBeGreaterThan(before);
      if (reaction === "raise") expect(highest).toBeGreaterThan(0.03);
      if (reaction === "curl") expect(curled).toBeGreaterThan(0.9);
      expect(minPlanted).toBeGreaterThanOrEqual(1);
    }
  });

  it("a real tap randomly varies its reaction, and reduced motion keeps only the colour", () => {
    const { s, state, step } = setup(44);
    let o = step();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      reactToAnimalTap(s, state, i + 1, i + 1.1);
      seen.add(o.reaction);
    }
    expect(seen.size).toBeGreaterThan(1);
    o.calm = true;
    for (const a of o.arms) a.held = 0;
    octopusTap(o, "raise");
    for (let i = 0; i < 5; i++) o = step();
    expect(o.arms.every((a) => a.held === 0)).toBe(true);
    expect(o.colour).toBeGreaterThan(0.5);
  });

  it("a grab reaches the point, then carries it to the mouth", () => {
    const { s, step } = setup(50);
    let o = step();
    for (let i = 0; i < 5; i++) o = step();
    const target = { x: s.x + 0.1, y: sandSurfaceY(tank, s.x + 0.1, s.z) - STAND_H + 0.01, z: s.z };
    expect(octopusGrab(o, target.x, target.y, target.z)).toBe(true);
    expect(octopusGrab(o, target.x, target.y, target.z)).toBe(false);
    const arm = o.arms[o.grabArm];
    const phases: string[] = [];
    let touched = Infinity;
    for (let i = 0; i < 120; i++) {
      o = step();
      if (phases[phases.length - 1] !== o.grabPhase) phases.push(o.grabPhase);
      touched = Math.min(touched, Math.hypot(arm.tip.x - target.x, arm.tip.y - target.y, arm.tip.z - target.z));
    }
    expect(phases).toEqual(["reaching", "reached", "mouth", "delivered"]);
    expect(touched).toBeLessThan(0.01);
    expect(arm.state).not.toBe("reach");
  });

  it("the body stands above the highest sand under its head", () => {
    const dune = { x: tank.w * -0.16, z: tank.d * 0.08 };
    expect(octopusBodyHeight(tank, dune.x, dune.z)).toBeGreaterThan(sandSurfaceY(tank, dune.x, dune.z) - STAND_H + def.length * 0.35);
  });
});
