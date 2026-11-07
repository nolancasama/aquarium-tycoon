import { describe, expect, it } from "vitest";
import { RUSH_DECOR, RUSH_OBSTACLES, type RushFootprint } from "./data/rushDecor";
import { PAD_TYPES, SLOT_FACING, SLOT_ORDER, SLOT_POS, TANKS } from "./data/tanks";
import { ROOMS } from "./data/rooms";
import type { Vec2 } from "./types";
import {
  ATRIUM_BENCHES, BENCH_FOOTPRINT, DOOR, ENTRY, HALL1_OBSTACLES, OUTSIDE,
  PEDESTAL, PICO, SEATS, WALK_Z, benchApproach, crossesObstacle, lookSpot,
  reefLoop, route, seatApproach, seatExit
} from "./world";

const solids = Object.values(RUSH_DECOR).flatMap(({ footprint }) => footprint ? [footprint] : []);
const box = (x: number, z: number, w: number, d: number): RushFootprint =>
  ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
const overlaps = (a: RushFootprint, b: RushFootprint) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

function clearPath(from: Vec2, path: Vec2[]) {
  let a = from;
  for (const b of path) {
    // Same inclusive segment/box sampling as world.test.ts; checks the whole
    // segment, including every intermediate foot position, rather than endpoints.
    for (const obstacle of HALL1_OBSTACLES) {
      expect(crossesObstacle(a, b, obstacle), JSON.stringify({ a, b, obstacle })).toBe(false);
    }
    a = b;
  }
}

describe("fixed Rush Hour entrance cosmetics", () => {
  it("reserves only standing objects permanently, with a visitor body margin", () => {
    expect(HALL1_OBSTACLES).toBe(RUSH_OBSTACLES);
    expect(solids).toHaveLength(4);
    expect(RUSH_OBSTACLES).toHaveLength(4);
    expect(RUSH_DECOR.floorPattern.footprint).toBeNull();
    expect(RUSH_DECOR.floorPattern.y).toBeGreaterThan(0);
    expect(RUSH_DECOR.goldSign.footprint).toBeNull();
    expect(RUSH_DECOR.goldSign.y - 0.3).toBeGreaterThan(2.01);
    expect(RUSH_DECOR.goldSign.z - 0.6).toBeGreaterThan(DOOR.z + DOOR.w / 2);
    solids.forEach((solid, i) => {
      expect(RUSH_OBSTACLES[i].minX).toBeCloseTo(solid.minX - 0.3);
      expect(RUSH_OBSTACLES[i].maxX).toBeCloseTo(solid.maxX + 0.3);
      expect(RUSH_OBSTACLES[i].minZ).toBeCloseTo(solid.minZ - 0.3);
      expect(RUSH_OBSTACLES[i].maxZ).toBeCloseTo(solid.maxZ + 0.3);
    });
  });

  it("avoids every tank pad/stand, pedestal, door, bench, counter and wall plant", () => {
    const existing: RushFootprint[] = [
      BENCH_FOOTPRINT, box(PEDESTAL.x, PEDESTAL.z, 0.84, 0.84),
      box(DOOR.x, DOOR.z, 0.3, DOOR.w + 0.16),
      box(PICO.x, PICO.z - 0.35, 1.3, 0.7),
      box(0, WALK_Z, 12, 0.6), box(-6.35, ENTRY.z, 2.1, 0.6),
      // Existing Hall 1 corner/entrance plants, including the foliage.
      box(-5.4, -3.4, 0.6, 0.6), box(5.4, -3.4, 0.6, 0.6),
      box(5.4, 2.8, 0.6, 0.6), box(-5.45, 0.15, 0.5, 0.5),
      box(28.5, 3.35, 1.8, 0.57),
      ...ATRIUM_BENCHES.map((p) => box(p.x, p.z, 2.1, 0.55)),
      ...ROOMS.filter((r) => r.unlock && !r.wing).map((r) => box(r.bounds.minX, 1.5, 0.3, 1.96))
    ];
    for (const slot of SLOT_ORDER) for (const type of PAD_TYPES[slot]) {
      const t = TANKS[type], p = SLOT_POS[slot], yaw = SLOT_FACING[slot];
      const w = t.w + 0.24, d = t.d + (t.bulge ?? 0) * 2 + 0.24;
      existing.push(box(p.x, p.z, Math.abs(Math.cos(yaw)) * w + Math.abs(Math.sin(yaw)) * d,
        Math.abs(Math.sin(yaw)) * w + Math.abs(Math.cos(yaw)) * d));
    }
    for (const [i, solid] of solids.entries()) {
      expect(solid.minX).toBeGreaterThan(ROOMS[0].bounds.minX);
      expect(solid.maxX).toBeLessThan(ROOMS[0].bounds.maxX);
      expect(solid.minZ).toBeGreaterThan(ROOMS[0].bounds.minZ);
      expect(solid.maxZ).toBeLessThan(ROOMS[0].bounds.maxZ);
      for (const other of [...existing, ...solids.slice(i + 1)]) {
        expect(overlaps(solid, other), JSON.stringify({ solid, other })).toBe(false);
      }
    }
  });

  it("leaves all visitor routes and complete bench approaches/exits clear", () => {
    const starts = [OUTSIDE, ENTRY, { x: -3, z: -0.8 }, { x: 4.9, z: -0.8 },
      { x: 14, z: -0.8 }, { x: 8, z: 3 }, { x: 38, z: -3.15 },
      ...SLOT_ORDER.filter((slot) => slot !== "L").flatMap((slot) => [lookSpot(slot, 0), lookSpot(slot, 1)]),
      ...SEATS.flatMap((seat) => [seat.approach, seat.front])];
    for (const from of starts) {
      clearPath(from, benchApproach(from));
      clearPath(from, reefLoop(from, lookSpot("I")));
      for (const to of starts) clearPath(from, route(from, to));
      for (const seat of SEATS) clearPath(from, seatApproach(from, seat));
    }
    for (const seat of SEATS) for (const to of starts) {
      clearPath(seat, seatExit(seat, to, seat, true));
      for (const t of [0, 0.25, 0.5, 0.9, 1]) {
        const from = { x: seat.approach.x + (seat.front.x - seat.approach.x) * t,
          z: seat.approach.z + (seat.front.z - seat.approach.z) * t };
        clearPath(from, seatExit(from, to, seat, false));
      }
    }
  });
});
