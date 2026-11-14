import { afterEach, describe, expect, it } from "vitest";
import { CRANE, DECK, LAGOON_DOMAIN } from "../data/lagoon";
import { solveTargetLeap, surfaceY } from "../marine/pod";
import { ballCatchPaused, clearLagoonRt, dropToy, feedPod, holdBall, lagoonAirClear, lagoonPod, lagoonRt, stepLagoonRt } from "./lagoonRuntime";
import { BUOY_AIM_Y, buoyPoint, chooseLane, highJumpActive, jumpRt, snoutTip, startHighJump } from "./highJump";

/**
 * The High Jump against invariants: the crane deploys, one adult swims to a
 * clear lane, leaps and touches the buoy with its snout at the top of its
 * flight, re-enters over open water, the others keep clear, and the crane
 * parks again. Replayable; never left half-done.
 */

const DT = 1 / 30;
afterEach(() => clearLagoonRt());

function runJump(seconds = 90) {
  const pod = lagoonPod();
  const phases: string[] = [];
  let maxSnout = -Infinity, minClearance = Infinity, problems: string[] = [], touchHeight = NaN, airborne = 0;
  for (let t = 0; t < seconds && (highJumpActive() || phases.length === 0); t += DT) {
    stepLagoonRt(DT);
    if (phases[phases.length - 1] !== jumpRt.phase) phases.push(jumpRt.phase);
    const m = jumpRt.id ? pod.byId(jumpRt.id) : undefined;
    if (m && jumpRt.phase === "air") {
      airborne++;
      const tip = snoutTip(m);
      maxSnout = Math.max(maxSnout, tip.y);
      if (jumpRt.touched && Number.isNaN(touchHeight)) touchHeight = tip.y;
      // The whole airborne body is over open water and clear of the deck, bridge, gate and pontoon.
      if (m.mode === "leap") for (const k of [-0.5, 0, 0.5]) {
        const x = m.x + Math.sin(m.yaw) * m.len * k, z = m.z + Math.cos(m.yaw) * m.len * k;
        if (LAGOON_DOMAIN.inside(x, z) < 0.5) problems.push(`over the shore t=${t.toFixed(1)}`);
        if (!lagoonAirClear(x, z)) problems.push(`through a structure t=${t.toFixed(1)}`);
      }
      // Nobody else in the jump's way.
      for (const o of pod.members) if (o !== m) minClearance = Math.min(minClearance, Math.hypot(o.x - m.x, o.z - m.z));
    }
    for (const o of pod.members) {
      if (![o.x, o.y, o.z, o.yaw, o.pitch].every(Number.isFinite)) problems.push(`NaN ${o.id}`);
      if (o.mode !== "leap" && o.mode !== "spyhop" && o.y > surfaceY(o) + 0.05) problems.push(`${o.id} above the surface`);
    }
  }
  return { phases, maxSnout, minClearance, problems, touchHeight, airborne };
}

describe("High Jump", { timeout: 60_000 }, () => {
  it("the solved flight puts the snout tip's highest point exactly on the aim, at the measured distance", () => {
    for (const [y0, dist, reach] of [[-0.4, 2.1, 1.3], [-0.7, 1.2, 1.4], [-0.25, 3.1, 1.25]] as const) {
      const sol = solveTargetLeap(y0, dist, BUOY_AIM_Y, reach);
      expect(sol.peak).toBeCloseTo(BUOY_AIM_Y, 2);
      expect(sol.reachH).toBeCloseTo(dist, 2);
      // A big leap: well above the ordinary high trick (vy 7), and a real flight time.
      expect(sol.vy0).toBeGreaterThan(7.5);
      expect(sol.airtime).toBeGreaterThan(1.4);
      expect(sol.touch).toBeGreaterThan(0.4);
    }
  });

  it("the buoy hangs well above the water, over open lagoon clear of the deck, and a clear lane exists", () => {
    expect(CRANE.buoy.y).toBeGreaterThan(4);
    expect(LAGOON_DOMAIN.inside(CRANE.buoy.x, CRANE.buoy.z)).toBeGreaterThan(5);
    expect(lagoonAirClear(CRANE.buoy.x, CRANE.buoy.z)).toBe(true);
    // The crane stands on land (the breakwater), not in the water.
    expect(LAGOON_DOMAIN.inside(CRANE.base.x, CRANE.base.z)).toBeLessThan(-1);
    expect(CRANE.buoy.z).toBeLessThan(DECK.minZ - 8);
    expect(chooseLane(lagoonAirClear)).not.toBeNull();
  });

  for (const seed of [3, 7, 11]) {
    it(`deploys, an adult leaps and touches the buoy at the top, lands in the water, and the crane parks (seed ${seed})`, () => {
      lagoonPod(seed);
      for (let t = 0; t < 5; t += DT) stepLagoonRt(DT);
      expect(startHighJump()).toBe(true);
      expect(startHighJump()).toBe(false);
      const r = runJump();
      expect(r.problems).toEqual([]);
      expect(r.phases).toEqual(expect.arrayContaining(["deploy", "approach", "run", "air", "splash", "stow", "idle"]));
      expect(jumpRt.touches).toBe(1);
      expect(jumpRt.closest).toBeLessThan(CRANE.buoy.r + 0.16);
      // The touch is at (or within a few centimetres of) the highest point of the snout.
      expect(r.maxSnout).toBeGreaterThan(BUOY_AIM_Y - 0.05);
      expect(r.maxSnout).toBeLessThan(BUOY_AIM_Y + 0.05);
      expect(r.touchHeight).toBeGreaterThan(BUOY_AIM_Y - 0.25);
      expect(r.airborne).toBeGreaterThan(30);
      expect(r.minClearance).toBeGreaterThan(3);
      const jumper = lagoonPod().byId(jumpRt.id ?? "") ?? null;
      expect(jumper).toBeNull(); // released at the end
      expect(jumpRt.slew).toBe(0);
      expect(jumpRt.drop).toBe(0);
      // Adults only.
      expect(lagoonRt.pod!.members.every((m) => m.mode !== "charge")).toBe(true);
    });
  }

  it("succeeds from wherever the pod happens to be (twelve seeds), seldom needing a second run-up", () => {
    let retries = 0, ok = 0;
    for (let seed = 20; seed < 32; seed++) {
      clearLagoonRt();
      lagoonPod(seed);
      for (let t = 0; t < 4 + (seed % 5) * 3; t += DT) stepLagoonRt(DT);
      startHighJump();
      let worst = 0;
      for (let t = 0; t < 90 && highJumpActive(); t += DT) { stepLagoonRt(DT); worst = Math.max(worst, jumpRt.retries); }
      retries += worst;
      if (jumpRt.touches === 1) ok++;
    }
    expect(ok).toBe(12);
    expect(retries).toBeLessThanOrEqual(4);
  });

  it("is replayable, gives only the rate-limited play, and blocks feeding/catch while on", () => {
    lagoonPod(5);
    for (let t = 0; t < 5; t += DT) stepLagoonRt(DT);
    expect(startHighJump()).toBe(true);
    expect(ballCatchPaused()).toBe(true);
    runJump();
    expect(jumpRt.touches).toBe(1);
    expect(highJumpActive()).toBe(false);
    expect(startHighJump()).toBe(true);
    runJump();
    expect(jumpRt.touches).toBe(2);
    expect(jumpRt.jumps).toBe(2);
    // Each touch adds a single play; the flow turns plays into Play no faster than every 6 s.
    expect(lagoonRt.plays).toBeLessThanOrEqual(2);
  });

  it("a crane pointed at the water with no free dolphin gives up gracefully and parks", () => {
    const pod = lagoonPod(4);
    for (const m of pod.members) m.hold = 1e9;
    expect(startHighJump()).toBe(true);
    for (let t = 0; t < 60 && highJumpActive(); t += DT) stepLagoonRt(DT);
    expect(highJumpActive()).toBe(false);
    expect(jumpRt.cancels).toBe(1);
    expect(jumpRt.touches).toBe(0);
    expect(buoyPoint().y).toBeGreaterThan(CRANE.jibY - 1.2); // reeled up again
  });

  it("does not interrupt a feed, and a held ball is not interrupted by it either", () => {
    lagoonPod(6);
    for (let t = 0; t < 3; t += DT) stepLagoonRt(DT);
    dropToy("ball");
    expect(holdBall()).toBe(true);
    expect(feedPod()).toBe(true);
    // The flow refuses the jump during feeding or with the ball in hand (flow/lagoon.ts); here the runtime simply waits.
    expect(startHighJump()).toBe(true);
    for (let t = 0; t < 8; t += DT) stepLagoonRt(DT);
    expect(jumpRt.id === null || jumpRt.phase === "deploy").toBe(true);
  });
});
