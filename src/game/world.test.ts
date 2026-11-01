import { describe, expect, it } from "vitest";
import { BENCH_FACING, BENCH_FOOTPRINT, BENCH_FRONT, BENCH_SEAT, ENTRY, OUTSIDE, benchApproach, insideRoom, requestEligible } from "./world";
import type { Vec2 } from "./types";
import { ATRIUM_OBSTACLES, SEATS, crossesObstacle, lookSpot, reefLoop, route, seatApproach, seatExit } from "./world";
import { DOOR_W, DOOR_Z, ROOMS } from "./data/rooms";

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

  it("approaches ordinary side seats from the room side without walking along seated knees", () => {
    for (const seat of SEATS.filter((seat) => seat.room === 0 && !seat.requestOnly)) {
      expect(seat.approach.x).toBeLessThan(seat.front.x - 0.6);
      for (const from of [ENTRY, { x: 4.9, z: -0.8 }, { x: 14, z: -0.8 }]) {
        const path = seatApproach(from, seat);
        expect(path.slice(-2)).toEqual([seat.approach, seat.front]);
        let previous = from;
        for (const point of path) {
          expect(crossesBench(previous, point)).toBe(false);
          // All vertical travel beside the bench remains behind the room-side lane.
          if (point.z !== previous.z && Math.max(point.z, previous.z) > 2) {
            expect(Math.max(point.x, previous.x)).toBeLessThanOrEqual(seat.approach.x);
          }
          previous = point;
        }
      }
    }
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

describe("Atrium visitor routes", () => {
  function clearPath(from: Vec2, path: Vec2[], to: Vec2) {
    expect(path.at(-1)).toEqual(to);
    let a = from;
    for (const b of path) {
      if (a.x >= 30 && b.x >= 30) for (const obstacle of ATRIUM_OBSTACLES) {
        expect(crossesObstacle(a, b, obstacle), JSON.stringify({ a, b, obstacle })).toBe(false);
      }
      for (const room of ROOMS.slice(1)) {
        const wall = room.bounds.minX;
        if ((a.x < wall && b.x > wall) || (a.x > wall && b.x < wall)) {
          const z = a.z + (b.z - a.z) * (wall - a.x) / (b.x - a.x);
          expect(Math.abs(z - DOOR_Z)).toBeLessThan(DOOR_W / 2 - 0.3);
        }
      }
      a = b;
    }
  }
  it("walks from Hall 1 to the reef's far side and returns through all three doors", () => {
    const far = { x: 38, z: -3.15 };
    const outward = route(ENTRY, far);
    clearPath(ENTRY, outward, far);
    expect(outward.filter((p) => p.z === DOOR_Z).length).toBeGreaterThanOrEqual(6);
    clearPath(far, route(far, ENTRY), ENTRY);
  });
  it("keeps the complete viewing loop clear of glass, secondary exhibits and scenery", () => {
    const start = { x: 30.7, z: DOOR_Z }, end = lookSpot("I");
    const loop = reefLoop(start, end);
    clearPath(start, loop, end);
    expect(loop.some((p) => p.z < -3)).toBe(true);
    expect(loop.some((p) => p.x > 41)).toBe(true);
  });
  it("connects all exhibit faces and both benches in either direction", () => {
    const points = [lookSpot("I"), lookSpot("J"), lookSpot("K"), { x: 38, z: -3.15 }, ...SEATS.filter((seat) => seat.room === 3).map((seat) => seat.approach)];
    for (const a of points) for (const b of points) clearPath(a, route(a, b), b);
  });

  it("routes every seat through its approach, allowing only the deliberate front stub inside obstacles", () => {
    const starts = [ENTRY, lookSpot("I"), lookSpot("J"), lookSpot("K"), { x: 38, z: -3.15 }];
    for (const seat of SEATS.filter((seat) => seat.room === 3)) {
      expect(ATRIUM_OBSTACLES.some((box) => crossesObstacle(seat.front, seat.front, box))).toBe(true);
      for (const from of starts) {
        const path = seatApproach(from, seat);
        expect(path.slice(-2)).toEqual([seat.approach, seat.front]);
        clearPath(from, path.slice(0, -1), seat.approach);
        for (const obstacle of ATRIUM_OBSTACLES) {
          // The short stub enters only this bench's expanded footprint.
          if (crossesObstacle(seat.approach, seat.front, obstacle)) {
            expect(crossesObstacle(seat.front, seat.front, obstacle)).toBe(true);
          }
        }
      }
    }
  });

  it("exits seated and partially approaching visitors through the stub before routing onward", () => {
    for (const seat of SEATS.filter((seat) => seat.room === 3)) {
      for (const destination of [ENTRY, lookSpot("I"), lookSpot("J"), lookSpot("K")]) {
        const seatedExit = seatExit(seat, destination, seat, true);
        expect(seatedExit.slice(0, 2)).toEqual([seat.front, seat.approach]);
        clearPath(seat.approach, seatedExit.slice(2), destination);
        for (const t of [0.25, 0.5, 0.9, 1]) {
          const from = { x: seat.approach.x + (seat.front.x - seat.approach.x) * t, z: seat.approach.z + (seat.front.z - seat.approach.z) * t };
          const interrupted = seatExit(from, destination, seat, false);
          expect(interrupted[0]).toEqual(seat.approach);
          clearPath(seat.approach, interrupted.slice(1), destination);
        }
        const outsideStub = { x: seat.approach.x, z: seat.approach.z - 0.2 };
        clearPath(outsideStub, seatExit(outsideStub, destination, seat, false), destination);
      }
    }
  });
});
