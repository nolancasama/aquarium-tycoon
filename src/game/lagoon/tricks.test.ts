import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { LAGOON_DOMAIN } from "../data/lagoon";
import { bodyR, surfaceY, TRICK_KINDS, type PodEvent, type Swimmer, type TrickKind } from "../marine/pod";
import { clearLagoonRt, dropToy, forceRing, forceTrick, lagoonAirClear, lagoonPod, lagoonRt, RING, ringPassOk, stepLagoonRt } from "./lagoonRuntime";

/**
 * Lagoon dolphin tricks against invariants: jumps and flips leave and re-enter
 * the water over open lagoon (never over the shore, the bridge, the gate or
 * the pontoon), finish their turns, and come at a watchable but not constant
 * rhythm; the ball stays in the water and moves by passes; a bubble-ring pass
 * counts only through the middle.
 */

const d = LAGOON_DOMAIN;
const DT = 1 / 30;

afterEach(() => clearLagoonRt());

function check(m: Swimmer, problems: string[], t: number) {
  const where = `${m.id} t=${t.toFixed(1)} mode=${m.mode}`;
  if (![m.x, m.y, m.z, m.yaw, m.pitch, m.roll, m.speed].every(Number.isFinite)) { problems.push(`NaN ${where}`); return; }
  if (m.mode === "leap") {
    // Airborne: the whole body (snout to flukes) over open water and clear air space.
    for (const k of [-0.5, 0, 0.5]) {
      const x = m.x + Math.sin(m.yaw) * m.len * k, z = m.z + Math.cos(m.yaw) * m.len * k;
      if (d.inside(x, z) < 0.3) problems.push(`over the shore ${d.inside(x, z).toFixed(2)} ${where}`);
      if (!lagoonAirClear(x, z)) problems.push(`through a structure ${where}`);
    }
  } else {
    if (d.inside(m.x, m.z) < m.margin * 0.45 - 0.05) problems.push(`shore ${where}`);
    if (m.mode !== "spyhop" && m.y > surfaceY(m) + 0.05) problems.push(`above the surface ${m.y.toFixed(2)} ${where}`);
    if (m.y < d.floor(m.x, m.z) + m.p.clearance * 0.6 + bodyR(m) * 0.5 - 0.02) problems.push(`in the floor ${where}`);
  }
}

function run(seconds: number, problems: string[], onStep?: (t: number, events: PodEvent[]) => void) {
  const pod = lagoonPod();
  const prev = new Map(pod.members.map((m) => [m.id, { x: m.x, y: m.y, z: m.z }]));
  for (let t = 0; t < seconds; t += DT) {
    const events = stepLagoonRt(DT);
    for (const m of pod.members) {
      check(m, problems, t);
      const p = prev.get(m.id)!;
      if (Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z) > (m.p.fast * 1.25 + 6) * DT) problems.push(`teleport ${m.id} t=${t.toFixed(1)}`);
      prev.set(m.id, { x: m.x, y: m.y, z: m.z });
    }
    onStep?.(t, events);
    if (problems.length > 12) break;
  }
}

describe("dolphin tricks", () => {
  for (const kind of TRICK_KINDS) {
    it(`${kind}: run-up, take-off, the figure, re-entry with a splash (3 seeds)`, () => {
      let flown = 0;
      for (const seed of [2, 5, 9]) {
        clearLagoonRt();
        lagoonPod(seed);
        lagoonRt.tricksPaused = true;
        const problems: string[] = [];
        run(6, problems);
        let id: string | null = null;
        for (let i = 0; i < 40 && !id; i++) { id = forceTrick(kind); if (!id) run(0.5, problems); }
        expect(id, `seed ${seed}: no room for ${kind}`).not.toBeNull();
        const pod = lagoonPod(), m = pod.byId(id!)!;
        let airborne = false, landed = false, top = -Infinity, flew: TrickKind | null = null, splash = false;
        run(12, problems, (_, events) => {
          if (m.mode === "leap" && m.trick) { airborne = true; flew = m.trick.kind; top = Math.max(top, m.y); }
          if (airborne && m.mode !== "leap" && !landed) {
            landed = true;
            // Whole turns are finished: upright again, the nose following the arc.
            expect(Math.abs(m.roll), `${kind} roll after landing`).toBeLessThan(0.35);
            expect(Math.abs(m.pitch), `${kind} pitch after landing`).toBeLessThan(1.6);
          }
          if (airborne && events.some((e) => e.kind === "splash" && e.ids[0] === m.id)) splash = true;
        });
        expect(problems).toEqual([]);
        if (airborne) {
          flown++;
          expect(landed).toBe(true);
          expect(splash).toBe(true);
          // Clearly out of the water (a calf's hop is not one of these).
          expect(top).toBeGreaterThan(0.8);
          expect(flew === kind || flew === "high").toBe(true);
        }
      }
      // At least two of three run-ups end in the figure (else the arc was not clear at the surface: a breath instead).
      expect(flown).toBeGreaterThanOrEqual(2);
    });
  }

  for (const seed of [1, 4]) {
    it(`come now and then on their own, never constantly; the calf stays with its mother (seed ${seed}, 4 minutes)`, () => {
      clearLagoonRt();
      lagoonPod(seed);
      const problems: string[] = [];
      const leaps: number[] = [];
      let far = 0;
      run(240, problems, (t, events) => {
        for (const e of events) if (e.kind === "leap") leaps.push(t);
        const sora = lagoonPod().byId("sora")!, mimi = lagoonPod().byId("mimi")!;
        far = Math.max(far, Math.hypot(sora.x - mimi.x, sora.z - mimi.z));
      });
      expect(problems).toEqual([]);
      // A child watching sees one within a minute or so; never a non-stop show.
      for (let m0 = 0; m0 < 240; m0 += 60) {
        const n = leaps.filter((t) => t >= m0 && t < m0 + 60).length;
        expect(n, `leaps in minute ${m0 / 60 + 1}`).toBeLessThanOrEqual(7);
      }
      expect(leaps.length).toBeGreaterThanOrEqual(4);
      let gap = 0;
      for (let i = 1; i < leaps.length; i++) gap = Math.max(gap, leaps[i] - leaps[i - 1]);
      expect(gap).toBeLessThan(75);
      expect(lagoonRt.tricks).toBeGreaterThanOrEqual(6);
      expect(far).toBeLessThan(12);
    });
  }
});

describe("ball play", () => {
  it("passes go snout to snout through the air; the ball stays in the lagoon and on (or over) the water", () => {
    // The runtime picks passers with Math.random. Unseeded, 70 s gave 2–20
    // passes and about 1 run in 15 dropped to 1 (2026-11-14), so seed it.
    let s = 2654435761;
    const random = vi.spyOn(Math, "random").mockImplementation(() => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; });
    onTestFinished(() => random.mockRestore());
    clearLagoonRt();
    lagoonPod(3);
    lagoonRt.tricksPaused = true;
    const problems: string[] = [];
    run(4, problems);
    dropToy("ball");
    let maxY = 0, worst = Infinity;
    run(70, problems, () => {
      const toy = lagoonRt.toy;
      if (!toy) return;
      maxY = Math.max(maxY, toy.y);
      worst = Math.min(worst, d.inside(toy.x, toy.z));
      expect(toy.y).toBeGreaterThanOrEqual(0);
    });
    expect(problems).toEqual([]);
    expect(lagoonRt.passes).toBeGreaterThanOrEqual(2);
    expect(maxY).toBeGreaterThan(0.4);
    expect(maxY).toBeLessThan(3.5);
    expect(worst).toBeGreaterThan(0.5);
  });
});

describe("the bubble ring", () => {
  const dir = { x: Math.sin(RING.yaw), z: Math.cos(RING.yaw) };
  it("counts a pass only through the middle, nose along the axis", () => {
    expect(ringPassOk(RING.x, RING.y, RING.z, RING.yaw, 0, 1, 0.26)).toBe(true);
    expect(ringPassOk(RING.x, RING.y, RING.z, RING.yaw + Math.PI, 0, -1, 0.26)).toBe(true);
    // Near the ring but outside its opening: no.
    expect(ringPassOk(RING.x + dir.z * 0.9, RING.y, RING.z - dir.x * 0.9, RING.yaw, 0, 1, 0.26)).toBe(false);
    expect(ringPassOk(RING.x, RING.y + 0.75, RING.z, RING.yaw, 0, 1, 0.26)).toBe(false);
    // Through the middle but across the ring (sideways): no.
    expect(ringPassOk(RING.x, RING.y, RING.z, RING.yaw + 1.2, 0, 1, 0.26)).toBe(false);
  });

  it("is in open water: clear of the floor, the surface and the shore along its whole lane", () => {
    expect(d.floor(RING.x, RING.z)).toBeLessThan(RING.y - RING.r - 1);
    expect(RING.y + RING.r).toBeLessThan(-0.6);
    for (let k = -7; k <= 5; k += 0.5) expect(d.inside(RING.x + dir.x * k, RING.z + dir.z * k)).toBeGreaterThan(2.3);
  });

  it("dolphins line up and swim through it", () => {
    clearLagoonRt();
    lagoonPod(6);
    lagoonRt.tricksPaused = true;
    const problems: string[] = [];
    run(4, problems);
    for (let i = 0; i < 3 && lagoonRt.ringPasses === 0; i++) {
      forceRing(i % 2 ? -1 : 1);
      run(25, problems);
    }
    expect(problems).toEqual([]);
    expect(lagoonRt.ringPasses).toBeGreaterThanOrEqual(1);
  });
});
