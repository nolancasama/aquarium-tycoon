import { describe, expect, it } from "vitest";
import { bodyR, Pod, surfaceY, type MemberDef, type PodEvent, type PodOptions } from "./pod";
import type { WaterDomain } from "./domain";
import { LAGOON_DOMAIN } from "../data/lagoon";
import { clearLagoonRt, feedPod, lagoonRt, LAGOON_POD, LAGOON_POD_OPTIONS, resetFeeding } from "../lagoon/lagoonRuntime";
import { COVE_DOMAIN, SANCTUARY_DOMAIN } from "../data/sanctuary";
import { BELUGA_POD, BELUGA_POD_OPTIONS, ORCA_POD, ORCA_POD_OPTIONS } from "../sanctuary/sanctuaryRuntime";
import { beginFeeding, createFeeding, FEED_GATHER_SECONDS, feedingSlot, stepFeeding } from "../lagoon/feeding";

/**
 * The swimming simulation against invariants, for several seeds and minutes
 * of simulated time: in the water (body centre and snout), above the floor,
 * at or under the surface except a leap or a spy-hop, no teleporting, no NaN,
 * and the behaviours the milestones need actually happen.
 */

export function runPod(domain: WaterDomain, defs: MemberDef[], opts: PodOptions, seed: number, seconds: number) {
  const pod = new Pod(domain, defs, seed, opts);
  const events: PodEvent[] = [];
  const dt = 1 / 30;
  const problems: string[] = [];
  const prev = new Map(pod.members.map((m) => [m.id, { x: m.x, y: m.y, z: m.z }]));
  for (let t = 0; t < seconds; t += dt) {
    pod.step(dt);
    events.push(...pod.drain());
    for (const m of pod.members) {
      const where = `${m.id} t=${t.toFixed(1)} mode=${m.mode}`;
      if (![m.x, m.y, m.z, m.yaw, m.pitch, m.speed, m.phase, m.amp].every(Number.isFinite)) { problems.push(`NaN ${where}`); continue; }
      const inside = domain.inside(m.x, m.z);
      if (inside < m.margin * 0.45 - 0.05) problems.push(`shore ${inside.toFixed(2)} ${where}`);
      const reach = m.len * 0.5 * Math.cos(m.pitch);
      const snout = domain.inside(m.x + Math.sin(m.yaw) * reach, m.z + Math.cos(m.yaw) * reach);
      if (snout < -0.15) problems.push(`snout in the shore ${snout.toFixed(2)} ${where}`);
      if (m.mode !== "leap" && m.mode !== "spyhop" && m.y > surfaceY(m) + 0.05) problems.push(`above the surface ${m.y.toFixed(2)} ${where}`);
      const floor = domain.floor(m.x, m.z) + m.p.clearance * 0.6 + bodyR(m) * 0.5;
      if (m.mode !== "leap" && m.y < floor - 0.02) problems.push(`in the floor ${(m.y - floor).toFixed(2)} ${where}`);
      const p = prev.get(m.id)!;
      const step = Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z);
      if (step > (m.p.fast * 1.25 + 6) * dt) problems.push(`jump ${step.toFixed(2)} ${where}`);
      prev.set(m.id, { x: m.x, y: m.y, z: m.z });
    }
    if (problems.length > 20) break;
  }
  return { pod, events, problems };
}

const count = (events: PodEvent[], kind: PodEvent["kind"]) => events.filter((e) => e.kind === kind).length;

describe("dolphin pod in the lagoon", () => {
  for (const seed of [1, 2, 3]) {
    it(`stays in the water and shows its behaviours (seed ${seed}, 5 minutes)`, () => {
      const { events, problems, pod } = runPod(LAGOON_DOMAIN, LAGOON_POD, LAGOON_POD_OPTIONS, seed, 300);
      expect(problems).toEqual([]);
      expect(count(events, "breathe")).toBeGreaterThanOrEqual(12);
      expect(count(events, "dive")).toBeGreaterThanOrEqual(1);
      expect(count(events, "pair")).toBeGreaterThanOrEqual(1);
      // The calf stays close to its mother.
      const sora = pod.byId("sora")!, mimi = pod.byId("mimi")!;
      expect(Math.hypot(sora.x - mimi.x, sora.z - mimi.z)).toBeLessThan(6);
    });
  }

  it("leaps now and then, but rarely (all seeds together)", () => {
    let leaps = 0, breaths = 0;
    for (const seed of [4, 5, 6, 7]) {
      const { events, problems } = runPod(LAGOON_DOMAIN, LAGOON_POD, LAGOON_POD_OPTIONS, seed, 240);
      expect(problems).toEqual([]);
      leaps += count(events, "leap");
      breaths += count(events, "breathe");
    }
    expect(leaps).toBeGreaterThanOrEqual(1);
    expect(leaps).toBeLessThan(breaths / 3);
  });

  it("orcas: stay in the bay, clear of the island, boat and station; breathe, dive, travel together, spy-hop now and then", () => {
    let spyhops = 0;
    for (const seed of [1, 2, 3]) {
      const { events, problems, pod } = runPod(SANCTUARY_DOMAIN, ORCA_POD, ORCA_POD_OPTIONS, seed, 300);
      expect(problems).toEqual([]);
      expect(count(events, "breathe")).toBeGreaterThanOrEqual(8);
      expect(count(events, "dive")).toBeGreaterThanOrEqual(1);
      expect(count(events, "pair")).toBeGreaterThanOrEqual(1);
      spyhops += count(events, "spyhop");
      const yuki = pod.byId("yuki")!, chibi = pod.byId("chibi")!;
      expect(Math.hypot(yuki.x - chibi.x, yuki.z - chibi.z)).toBeLessThan(12);
      for (const m of pod.members) expect(SANCTUARY_DOMAIN.inside(m.x, m.z)).toBeGreaterThan(0);
    }
    expect(spyhops).toBeGreaterThanOrEqual(1);
  });

  it("belugas: stay in their own cove", () => {
    for (const seed of [4, 5]) {
      const { problems, events, pod } = runPod(COVE_DOMAIN, BELUGA_POD, BELUGA_POD_OPTIONS, seed, 240);
      expect(problems).toEqual([]);
      expect(count(events, "breathe")).toBeGreaterThanOrEqual(6);
      // The cove and the orcas' bay never overlap.
      for (const m of pod.members) expect(SANCTUARY_DOMAIN.inside(m.x, m.z)).toBeLessThan(0);
    }
  });

  it("comes to a point when attracted (feeding) and holds still for a question", () => {
    const pod = new Pod(LAGOON_DOMAIN, LAGOON_POD, 9, LAGOON_POD_OPTIONS);
    for (const m of pod.members) pod.attract(m.id, { x: 10.6, y: -0.35, z: -6.3 }, 40, "feed");
    for (let t = 0; t < 40; t += 1 / 30) pod.step(1 / 30);
    const near = pod.members.filter((m) => Math.hypot(m.x - 10.6, m.z + 6.3) < 4.5);
    expect(near.length).toBeGreaterThanOrEqual(3);
    const kai = pod.byId("kai")!;
    pod.hold("kai", 20, -3);
    const at = { x: kai.x, z: kai.z };
    for (let t = 0; t < 8; t += 1 / 30) pod.step(1 / 30);
    expect(Math.hypot(kai.x - at.x, kai.z - at.z)).toBeLessThan(3);
    expect(kai.y).toBeLessThan(-2.2);
  });

  it("gathers every dolphin from typical lagoon positions within nine seconds, holds safely, then releases", () => {
    for (const seed of [7, 13, 29]) {
      const pod = new Pod(LAGOON_DOMAIN, LAGOON_POD, seed, LAGOON_POD_OPTIONS);
      const positions = [{ x: -8, z: -1 }, { x: -7.2, z: -1 }, { x: 0, z: 2 }, { x: 4, z: 4 }];
      pod.members.forEach((m, i) => { Object.assign(m, positions[i], { y: -2, yaw: -0.6, mode: "swim", speed: 1.2 }); });
      const feeding = createFeeding();
      expect(beginFeeding(feeding, pod, 0)).toBe(true);
      // Repeat Feed never changes a running sequence or its start time.
      expect(beginFeeding(feeding, pod, 0.1)).toBe(false);
      for (let frame = 1; frame <= 21 * 30; frame++) {
        const time = frame / 30;
        pod.step(1 / 30);
        stepFeeding(feeding, pod, time);
        for (const m of pod.members) {
          expect(LAGOON_DOMAIN.inside(m.x, m.z)).toBeGreaterThan(m.margin * 0.45 - 0.05);
          const snout = { x: m.x + Math.sin(m.yaw) * m.len * 0.5, z: m.z + Math.cos(m.yaw) * m.len * 0.5 };
          expect(LAGOON_DOMAIN.inside(snout.x, snout.z)).toBeGreaterThan(-0.15);
          expect(m.y).toBeGreaterThanOrEqual(LAGOON_DOMAIN.floor(m.x, m.z) + m.p.clearance * 0.6 + bodyR(m) * 0.5 - 0.02);
        }
        if (feeding.phase === "ready") {
          expect(time).toBeLessThanOrEqual(FEED_GATHER_SECONDS + 0.05);
          expect(feeding.ready).toHaveLength(4);
        }
        if (feeding.phase === "throwing" || feeding.phase === "catching") {
          for (const [i, id] of feeding.ready.entries()) {
            const m = pod.byId(id)!, slot = feedingSlot(m, i);
            expect(Math.hypot(m.x - slot.x, m.z - slot.z)).toBeLessThan(1.25);
          }
        }
      }
      expect(feeding.phase).toBe("finished");
      expect(feeding.completed).toBe(4);
      expect(feeding.history.map((h) => h.phase)).toContain("throwing");
      expect(pod.members.every((m) => m.attract?.kind !== "feed")).toBe(true);
      const mother = pod.byId("sora")!, calf = pod.byId("mimi")!;
      expect(calf.follow?.id).toBe(mother.id);
      expect(Math.hypot(calf.x - mother.x, calf.z - mother.z)).toBeLessThan(6);
    }
  });

  it("times out to a single surface fish when no dolphin is ready", () => {
    const pod = new Pod(LAGOON_DOMAIN, LAGOON_POD, 3, LAGOON_POD_OPTIONS);
    pod.members.forEach((m) => { m.x = -10; m.z = 0; });
    const feeding = createFeeding();
    beginFeeding(feeding, pod, 0);
    // Frozen swimmers model an interrupted approach; the coordinator still
    // has a bounded result and a reachable surface fallback.
    for (let frame = 1; frame < 13 * 30; frame++) stepFeeding(feeding, pod, frame / 30);
    expect(feeding.phase).toBe("finished");
    expect(feeding.fallback).toBe(true);
    expect(feeding.completed).toBe(1);
    expect(feeding.fish?.id).toBeNull();
    expect(feeding.fish?.to.y).toBe(0.02);
    expect(feeding.history.find((h) => h.phase === "ready")?.at).toBeCloseTo(FEED_GATHER_SECONDS);
    expect(pod.members.every((m) => m.attract?.kind === "point")).toBe(true);
  });

  it("cancels the transient sequence cleanly when leaving the lagoon", () => {
    clearLagoonRt();
    expect(feedPod()).toBe(true);
    expect(feedPod()).toBe(false);
    resetFeeding();
    expect(lagoonRt.feeding.phase).toBe("idle");
    expect(lagoonRt.feeding.fish).toBeNull();
    expect(lagoonRt.pod!.members.every((m) => m.attract?.kind !== "feed")).toBe(true);
    expect(feedPod()).toBe(true);
    clearLagoonRt();
  });
});
