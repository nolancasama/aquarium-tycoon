import { describe, expect, it } from "vitest";
import { TANKS } from "../data/tanks";
import { SPECIES } from "../data/fish";
import { stepBehavior, type BehaviorEnv, type BehaviorState } from "./behavior";
import { createEelBody, EEL_CORRIDOR, EEL_LENGTH, EEL_MIN_RADIUS, EEL_RADIUS, eelBounds, eelDenRail, eelFloor, eelRadius, eelWaveAmplitude, sampleEelSpine, steerEelHead, updateEelRig } from "./eelBody";
import type { SwimState } from "./swim";

const head = (): SwimState => ({ x: 0, y: 0.4, z: 0, vx: 0.15, vy: 0, vz: 0, tx: 2, ty: 0.4, tz: 0, wait: 0, burst: 0 });
const point = { x: 0, y: 0, z: 0 }, other = { x: 0, y: 0, z: 0 };
function heading(rig: Float32Array, s: number): number {
  sampleEelSpine(point, rig, Math.max(0, s - 0.001));
  sampleEelSpine(other, rig, Math.min(1, s + 0.001));
  return Math.atan2(point.z - other.z, point.x - other.x);
}
function length(rig: Float32Array): number {
  let result = 0;
  sampleEelSpine(point, rig, 0);
  for (let i = 1; i <= 120; i++) {
    sampleEelSpine(other, rig, i / 120);
    result += Math.hypot(other.x - point.x, other.y - point.y, other.z - point.z);
    point.x = other.x; point.y = other.y; point.z = other.z;
  }
  return result;
}

describe("moray distance-history spine", () => {
  it("shows a travelling mid-body swim wave and suppresses it in a den", () => {
    const s = head(), body = createEelBody(s), straight = new Float32Array(64);
    body.speed = 0.15;
    updateEelRig(body, s.x, s.y, s.z, 0); straight.set(body.rig);
    let amplitude = 0;
    for (let frame = 0; frame < 160; frame++) {
      body.phase = frame * 0.1;
      updateEelRig(body, s.x, s.y, s.z, 1);
      amplitude = Math.max(amplitude, Math.abs(body.rig[8 * 4 + 2] - straight[8 * 4 + 2]));
      expect(length(body.rig)).toBeLessThan(EEL_LENGTH * 1.03);
    }
    expect(amplitude).toBeGreaterThanOrEqual(0.01);
    updateEelRig(body, s.x, s.y, s.z, 0);
    expect(body.rig).toEqual(straight);
    body.speed = 0;
    updateEelRig(body, s.x, s.y, s.z, 1);
    expect(body.rig).toEqual(straight);
    for (let i = 0; i <= 100; i++) expect(eelRadius(i / 100) + eelWaveAmplitude(i / 100)).toBeLessThan(EEL_CORRIDOR);
  });
  for (const turn of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
    it(`propagates a ${turn} turn by arc length and preserves length`, () => {
      const s = head(), body = createEelBody(s), tank = { ...TANKS.cave, w: 30, d: 30, backRock: 0 };
      const times = [-1, -1, -1];
      let previous = body.yaw;
      for (let frame = 0; frame < 650; frame++) {
        steerEelHead(s, body, tank, [], Math.cos(turn) * 10, 0.4, Math.sin(turn) * 10, 0.15, 0.02, false);
        updateEelRig(body, s.x, s.y, s.z, 0);
        const change = Math.abs(Math.atan2(Math.sin(body.yaw - previous), Math.cos(body.yaw - previous)));
        expect(change).toBeLessThanOrEqual(body.speed * 0.02 / EEL_MIN_RADIUS + 1e-9);
        previous = body.yaw;
        for (let i = 0; i < 3; i++) if (times[i] < 0 && Math.abs(heading(body.rig, i / 2)) > 0.12) times[i] = frame * 0.02;
        expect(length(body.rig)).toBeGreaterThan(EEL_LENGTH * 0.97);
        expect(length(body.rig)).toBeLessThan(EEL_LENGTH * 1.03);
      }
      expect(times[0]).toBeGreaterThanOrEqual(0);
      expect(times[1] - times[0]).toBeCloseTo(EEL_LENGTH / 2 / 0.15, 0);
      expect(times[2] - times[1]).toBeCloseTo(EEL_LENGTH / 2 / 0.15, 0);
    });
  }

  it("keeps every hidden rail sample inside the rock and crosses only the aperture", () => {
    for (let denIndex = 0; denIndex < 3; denIndex++) {
      const tank = TANKS.cave, den = tank.dens![denIndex];
      for (let q = -1.46; q < 0.13; q += 0.002) {
        eelDenRail(point, tank, denIndex, q);
        if (point.z < den.z - 0.035) {
          expect(Math.abs(point.x) + EEL_RADIUS).toBeLessThan(tank.w / 2);
          expect(point.z - EEL_RADIUS).toBeGreaterThan(-tank.d / 2);
          expect(point.y - EEL_RADIUS).toBeGreaterThan(0.06);
        }
        if (Math.abs(point.z - den.z) < 0.005) {
          expect(((point.x - den.x) / (0.12 - EEL_RADIUS)) ** 2 + ((point.y - den.y) / (0.085 - EEL_RADIUS)) ** 2).toBeLessThan(1);
        }
      }
    }
  });

  it("retains all control-point clearance through long seeded cave lives", () => {
    const errors: string[] = [];
    for (const seed of [3, 19, 101]) for (let index = 0; index < 5; index++) {
      const tank = TANKS.cave, s = head(), state: BehaviorState = {}, env: BehaviorEnv = { tank, bounds: eelBounds(tank),
        columns: [...tank.rocks!, { x: -0.02, z: 0.2, r: 0.11, top: 0.31 }], others: [], speedMul: 1, attract: null, depthBias: 0, denIndex: index, phase: seed };
      let clearance = Infinity, worstLength = 0;
      for (let frame = 0; frame < 2400; frame++) {
        stepBehavior(s, state, SPECIES.eel, env, 0.05, () => 0.5);
        const rig = state.eel!.rig;
        if (frame % 20 === 0) worstLength = Math.max(worstLength, Math.abs(length(rig) / EEL_LENGTH - 1));
        for (let i = 0; i < 16; i++) {
          const x = rig[i * 4], y = rig[i * 4 + 1], z = rig[i * 4 + 2], r = eelRadius(i / 15);
          if (index < 3 && i > 0) {
            const den = tank.dens![index], previousZ = rig[(i - 1) * 4 + 2];
            if ((z - den.z) * (previousZ - den.z) <= 0 && Math.abs(z - previousZ) > 1e-8) {
              const t = (den.z - z) / (previousZ - z), crossingX = x + (rig[(i - 1) * 4] - x) * t,
                crossingY = y + (rig[(i - 1) * 4 + 1] - y) * t, crossingR = eelRadius((i - t) / 15);
              const ellipse = ((crossingX - den.x) / (0.12 - crossingR)) ** 2 + ((crossingY - den.y) / (0.085 - crossingR)) ** 2;
              if (ellipse > 1) errors.push(`aperture seed=${seed} index=${index} frame=${frame} ellipse=${ellipse}`);
            }
          }
          if (index < 3 && z < tank.dens![index].z + r) {
            const den = tank.dens![index];
            const aperture = ((x - den.x) / (0.12 - r)) ** 2 + ((y - den.y) / (0.085 - r)) ** 2 <= 1;
            const hidden = z + r < den.z - 0.035 && z - r > -tank.d / 2 && Math.abs(x) + r < tank.w / 2;
            if (aperture || hidden) continue;
          }
          clearance = Math.min(clearance, tank.w / 2 - Math.abs(x) - r, tank.d / 2 - z - r,
            z - (-tank.d / 2 + tank.backRock!) - r, y - eelFloor(tank, x, z, r) + 0.003, tank.h - y - r);
          for (const c of env.columns) clearance = Math.min(clearance, Math.max(Math.hypot(x - c.x, z - c.z) - c.r - r, y - c.top - r));
        }
      }
      if (clearance < -0.001 || worstLength > 0.03) errors.push(`seed=${seed} index=${index} clearance=${clearance} length=${worstLength}`);
    }
    expect(errors).toEqual([]);
  }, 60_000);

  it("moves continuously out of a decoration newly placed on its body", () => {
    const tank = TANKS.cave, s = head(), state: BehaviorState = {}, columns = [...tank.rocks!];
    const env: BehaviorEnv = { tank, bounds: eelBounds(tank), columns, others: [], speedMul: 1, attract: null, depthBias: 0, denIndex: 3 };
    stepBehavior(s, state, SPECIES.eel, env, 0.05, () => 0.5);
    const body = state.eel!, at = 8 * 4, decoration = { x: body.rig[at], z: body.rig[at + 2], r: 0.07, top: body.rig[at + 1] + 0.12 };
    columns.push(decoration);
    const previous = new Float32Array(body.rig);
    let jump = 0, worstLength = 0;
    for (let frame = 0; frame < 180; frame++) {
      stepBehavior(s, state, SPECIES.eel, env, 0.05, () => 0.5);
      for (let i = 0; i < 16; i++) jump = Math.max(jump, Math.hypot(body.rig[i * 4] - previous[i * 4], body.rig[i * 4 + 1] - previous[i * 4 + 1], body.rig[i * 4 + 2] - previous[i * 4 + 2]));
      worstLength = Math.max(worstLength, Math.abs(length(body.rig) / EEL_LENGTH - 1));
      previous.set(body.rig);
    }
    expect(jump).toBeLessThan(0.025);
    expect(worstLength).toBeLessThan(0.03);
    for (let i = 0; i < 16; i++) {
      const r = eelRadius(i / 15);
      expect(Math.max(Math.hypot(body.rig[i * 4] - decoration.x, body.rig[i * 4 + 2] - decoration.z) - decoration.r - r,
        body.rig[i * 4 + 1] - decoration.top - r)).toBeGreaterThan(-0.001);
    }
  });
});
