import { describe, expect, it } from "vitest";
import { bodyR, Pod, surfaceY, TRICK_KINDS, type MemberDef, type PodEvent, type PodOptions, type TrickKind } from "./pod";
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

describe("dolphin leap water entry", () => {
  function airborne(vy = 7) {
    const pod = new Pod(LAGOON_DOMAIN, [{ id: "test", species: "dolphin", size: 1 }], 7, LAGOON_POD_OPTIONS);
    const m = pod.members[0];
    Object.assign(m, { x: 0, y: -0.15, z: 0, yaw: 0.45, pitch: Math.atan2(vy, 3), vy, mode: "leap", air: { vx: Math.sin(0.45) * 3, vz: Math.cos(0.45) * 3 }, trick: null, breathAt: 100 });
    return { pod, m };
  }

  it("emits exactly one splash at the interpolated downward snout crossing", () => {
    const { pod, m } = airborne();
    const entries: PodEvent[] = [];
    for (let i = 0; i < 100; i++) {
      const reach = m.len * 0.5, oldReach = Math.cos(m.pitch) * reach;
      const x = m.x + Math.sin(m.yaw) * oldReach, y = m.y + Math.sin(m.pitch) * reach, z = m.z + Math.cos(m.yaw) * oldReach;
      pod.step(1 / 30);
      for (const e of pod.drain()) if (e.kind === "splash") {
        entries.push(e);
        const newReach = Math.cos(m.pitch) * reach;
        const nx = m.x + Math.sin(m.yaw) * newReach, ny = m.y + Math.sin(m.pitch) * reach, nz = m.z + Math.cos(m.yaw) * newReach;
        const f = y / (y - ny);
        expect(y).toBeGreaterThan(0);
        expect(ny).toBeLessThanOrEqual(0);
        expect(e.x).toBeCloseTo(x + (nx - x) * f, 7);
        expect(e.y).toBe(0);
        expect(e.z).toBeCloseTo(z + (nz - z) * f, 7);
        expect(e.age).toBeCloseTo((1 - f) / 30, 7);
        expect(e.entry).toBe(true);
        // The nose meets the water before the old centre-depth trigger.
        expect(m.y).toBeGreaterThan(-0.25);
      }
    }
    expect(entries).toHaveLength(1);
    expect(m.mode).not.toBe("leap");
  });

  it("scales the entry strength monotonically with the leap", () => {
    const strengths = [3.2, 5.1, 7].map((vy) => {
      const { pod } = airborne(vy);
      let strength = 0, entries = 0;
      for (let i = 0; i < 70; i++) {
        pod.step(1 / 30);
        for (const e of pod.drain()) if (e.entry) { entries++; strength = e.strength!; }
      }
      expect(entries).toBe(1);
      return strength;
    });
    expect(strengths[0]).toBeGreaterThan(0);
    expect(strengths[1]).toBeGreaterThan(strengths[0]);
    expect(strengths[2]).toBeGreaterThan(strengths[1]);
  });

  for (const kind of [...TRICK_KINDS, "hop"] as TrickKind[]) it(`${kind} emits one real entry and no take-off splash`, () => {
    const { pod, m } = airborne();
    Object.assign(m, { mode: "swim", air: null, y: -1, pitch: 0, vy: 0, speed: 2.1 });
    if (kind === "hop") m.mother = "sora";
    expect(pod.trick(m.id, kind)).toBe(true);
    const events: PodEvent[] = [];
    let crossed = false;
    for (let i = 0; i < 360; i++) {
      const before = m.y + Math.sin(m.pitch) * m.len * 0.5;
      pod.step(1 / 30);
      const batch = pod.drain();
      events.push(...batch);
      if (batch.some((e) => e.entry)) {
        crossed = true;
        // Includes flips/spins: contact must follow the animated snout, not
        // the centre-depth cutoff or a nominal trick timer.
        expect(before).toBeGreaterThan(0);
        expect(m.y + Math.sin(m.pitch) * m.len * 0.5).toBeLessThanOrEqual(0);
        expect(m.vy).toBeLessThan(0);
      }
    }
    expect(crossed).toBe(true);
    expect(events.filter((e) => e.kind === "leap")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "splash")).toHaveLength(1);
    expect(events.find((e) => e.kind === "splash")?.entry).toBe(true);
  });

  it("preserves the interpolated impact time across several integration slices", () => {
    function impactTime(dt: number) {
      const { pod } = airborne();
      for (let i = 0; i < 60; i++) {
        pod.step(dt);
        const entry = pod.drain().find((e) => e.entry);
        if (entry) return pod.time - entry.age!;
      }
      throw new Error("No entry event");
    }
    // Both use the same 50 ms integration slices; only event drain timing
    // differs. The leftover slices must age, not delay, an existing impact.
    expect(impactTime(0.25)).toBeCloseTo(impactTime(0.05), 8);
  });

  for (const species of ["orca", "beluga"] as const) it(`${species} retains its legacy splash event`, () => {
    const pod = new Pod(SANCTUARY_DOMAIN, [{ id: "test", species, size: 1 }], 7, ORCA_POD_OPTIONS);
    const m = pod.members[0];
    Object.assign(m, { x: 0, y: -0.2, z: 0, vy: -2, mode: "leap", air: { vx: 0, vz: 2 }, breathAt: 100 });
    pod.step(0.05);
    const splash = pod.drain().find((e) => e.kind === "splash");
    expect(splash).toMatchObject({ x: m.x, y: 0, z: m.z, len: m.len });
    expect(splash?.entry).toBeUndefined();
    expect(splash?.strength).toBeUndefined();
    expect(m.mode).toBe("swim");
  });

  it("ordinary breathing surfacings never produce an entry splash", () => {
    const { pod, m } = airborne();
    Object.assign(m, { mode: "surface", modeT: 0, modeLen: 1.4, air: null, vy: 0, y: surfaceY(m), pitch: 0 });
    const events: PodEvent[] = [];
    for (let i = 0; i < 90; i++) { pod.step(1 / 30); events.push(...pod.drain()); }
    expect(events.filter((e) => e.entry || e.kind === "splash")).toEqual([]);
  });
});

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
  }, 20_000); // Four minutes across four seeds can exceed 5 s on constrained CI CPUs.

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
  }, 20_000); // Three five-minute bay simulations; keep every invariant assertion.

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
