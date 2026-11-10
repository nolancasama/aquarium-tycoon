import { describe, expect, it } from "vitest";
import { bodyR, Pod, surfaceY, type MemberDef, type PodEvent, type PodOptions } from "./pod";
import type { WaterDomain } from "./domain";
import { LAGOON_DOMAIN } from "../data/lagoon";
import { LAGOON_POD, LAGOON_POD_OPTIONS } from "../lagoon/lagoonRuntime";
import { COVE_DOMAIN, SANCTUARY_DOMAIN } from "../data/sanctuary";
import { BELUGA_POD, BELUGA_POD_OPTIONS, ORCA_POD, ORCA_POD_OPTIONS } from "../sanctuary/sanctuaryRuntime";

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
});
