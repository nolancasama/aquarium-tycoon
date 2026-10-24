import { describe, expect, it } from "vitest";
import { BENCH_FACING, BENCH_FOOTPRINT, BENCH_FRONT, BENCH_SEAT, ENTRY, OUTSIDE, benchApproach, insideRoom, requestEligible } from "./world";
import type { Vec2 } from "./types";

/** Slab intersection: includes the edges, so touching furniture also fails. */
function crossesBench(a: Vec2, b: Vec2): boolean {
  let lo = 0;
  let hi = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, BENCH_FOOTPRINT.minX, BENCH_FOOTPRINT.maxX],
    [a.z, b.z - a.z, BENCH_FOOTPRINT.minZ, BENCH_FOOTPRINT.maxZ]
  ]) {
    if (delta === 0) {
      if (start < min || start > max) return false;
    } else {
      const t1 = (min - start) / delta;
      const t2 = (max - start) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}

describe("request bench routing (one seat)", () => {
  it("approaches the seat from the front, outside the seat and backrest", () => {
    expect(BENCH_FRONT.x).toBeLessThan(BENCH_FOOTPRINT.minX - 0.3);
    expect(BENCH_FRONT.z).toBe(BENCH_SEAT.z);
    expect(Math.sin(BENCH_FACING)).toBe(-1);
    for (const from of [OUTSIDE, ENTRY, BENCH_FRONT, { x: -3, z: -0.8 }, { x: 4.9, z: -0.8 }, { x: 14, z: -0.8 }, { x: 8, z: 3 }]) {
      let previous = from;
      const path = benchApproach(from);
      expect(path.at(-1)).toEqual(BENCH_FRONT);
      for (const point of path) {
        expect(crossesBench(previous, point), JSON.stringify({ previous, point })).toBe(false);
        previous = point;
      }
    }
  });

  it("can exit forward and walk to the door without crossing the bench", () => {
    expect(crossesBench(BENCH_FRONT, ENTRY)).toBe(false);
  });
});

describe("request eligibility", () => {
  const walking = { ...ENTRY, request: { kind: "chatLike" }, helped: false, scripted: false, state: "walk" };
  it("offers walking and seated requests only once visibly inside either room", () => {
    expect(requestEligible(walking)).toBe(true);
    expect(requestEligible({ ...walking, ...OUTSIDE })).toBe(false);
    expect(requestEligible({ ...walking, x: -5.8 })).toBe(false);
    expect(requestEligible({ ...walking, ...BENCH_SEAT, state: "sit" })).toBe(true);
    expect(insideRoom({ x: 12, z: 1 })).toBe(true);
    expect(insideRoom({ x: 12, z: 4 })).toBe(false);
  });
  it("excludes ordinary, scripted, helped and already active visitors", () => {
    expect(requestEligible({ ...walking, request: null })).toBe(false);
    expect(requestEligible({ ...walking, scripted: true })).toBe(false);
    expect(requestEligible({ ...walking, helped: true })).toBe(false);
    for (const state of ["help", "leave", "gone", "look"]) expect(requestEligible({ ...walking, state })).toBe(false);
  });
});
