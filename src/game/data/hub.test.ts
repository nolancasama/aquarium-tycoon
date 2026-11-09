import { describe, expect, it } from "vitest";
import { doorStep, HUB_BAYS, HUB_CENTRE, HUB_DOORS, HUB_ENTRANCE, hubRoute, onHubFloor, PLAZA_SPOTS, segmentClear, TANK_CLEAR, VIEW_RING, onRing } from "./hub";
import { HUB_HALL, inHallRow, isWingHall, ROOMS, roomOpen, SHARKS_HALL } from "./rooms";
import { clearHubVisitors, hubGroups, memberWorld, stepHubVisitors } from "../hub/hubVisitors";

const progress = (p: Partial<{ hallOpen: boolean; galleryOpen: boolean; atriumOpen: boolean; tunnelOpen: boolean; freePlay: boolean }>) =>
  ({ hallOpen: true, galleryOpen: true, atriumOpen: true, tunnelOpen: false, freePlay: true, ...p });

describe("hub room", () => {
  it("opens only in free play with the Shark Tunnel open, as a free derived upgrade", () => {
    expect(roomOpen(HUB_HALL, progress({ tunnelOpen: false }))).toBe(false);
    expect(roomOpen(HUB_HALL, progress({ tunnelOpen: true, freePlay: false }))).toBe(false);
    expect(roomOpen(HUB_HALL, progress({ tunnelOpen: true }))).toBe(true);
  });

  it("is never a hall-arrow neighbour, and is entered with a fade like the wing", () => {
    expect(inHallRow(HUB_HALL)).toBe(false);
    expect(inHallRow(SHARKS_HALL)).toBe(true);
    expect([0, 1, 2, 3].every(inHallRow)).toBe(true);
    expect(isWingHall(HUB_HALL)).toBe(true);
    expect(isWingHall(3)).toBe(false);
  });

  it("does not overlap any other room's bounds", () => {
    const hub = ROOMS[HUB_HALL].bounds;
    for (const r of ROOMS.filter((x) => x.id !== "hub")) {
      const b = r.bounds;
      const overlap = hub.minX < b.maxX && hub.maxX > b.minX && hub.minZ < b.maxZ && hub.maxZ > b.minZ;
      expect(overlap, r.id).toBe(false);
    }
  });
});

describe("hub layout", () => {
  it("has the three wing doors and exactly two future attractions", () => {
    expect(HUB_DOORS).toEqual(expect.arrayContaining(["indoor", "sharks", "coast", "lagoon", "sanctuary"]));
    expect(HUB_BAYS.filter((b) => b.kind === "lagoon" || b.kind === "sanctuary")).toHaveLength(2);
    // Indoor on the left, Shark Tunnel and the coast on the right.
    const angle = (k: string) => HUB_BAYS.find((b) => b.kind === k)!.angle;
    expect(angle("indoor")).toBeLessThan(0);
    expect(angle("sharks")).toBeGreaterThan(0);
    expect(angle("coast")).toBeGreaterThan(0);
  });

  it("puts every door step, plaza spot and viewing spot on the walkable floor", () => {
    for (const k of HUB_DOORS) expect(onHubFloor(doorStep(k)), k).toBe(true);
    for (const p of PLAZA_SPOTS) expect(onHubFloor(p)).toBe(true);
    for (let a = -Math.PI; a < Math.PI; a += 0.3) expect(onHubFloor(onRing(a, VIEW_RING))).toBe(true);
  });

  it("routes between any two points without cutting across the display tank", () => {
    const pts = [HUB_ENTRANCE, ...HUB_DOORS.map(doorStep), ...PLAZA_SPOTS];
    for (const a of pts) for (const b of pts) {
      const route = [a, ...hubRoute(a, b)];
      for (let i = 1; i < route.length; i++) expect(segmentClear(route[i - 1], route[i], TANK_CLEAR - 0.05)).toBe(true);
      expect(route[route.length - 1]).toEqual(b);
    }
  });
});

describe("hub visitors", () => {
  it("keep clear of the tank, stay in small groups and keep moving through the hub", () => {
    clearHubVisitors(3);
    let seen = 0;
    let looked = 0;
    for (let t = 0; t < 240; t += 0.05) {
      stepHubVisitors(0.05, true);
      for (const g of hubGroups) {
        expect(g.members.length).toBeGreaterThan(0);
        expect(g.members.length).toBeLessThanOrEqual(3);
        if (!g.visible) continue;
        for (const m of g.members) {
          const p = memberWorld(g, m);
          expect(Math.hypot(p.x - HUB_CENTRE.x, p.z - HUB_CENTRE.z)).toBeGreaterThan(TANK_CLEAR - 0.7);
        }
        if (g.activity !== "walk") looked++;
      }
      seen = Math.max(seen, hubGroups.length);
    }
    expect(seen).toBeGreaterThanOrEqual(3);
    expect(looked).toBeGreaterThan(0);
  });

  it("does nothing while the hub is not shown", () => {
    clearHubVisitors(3);
    for (let i = 0; i < 100; i++) stepHubVisitors(0.1, false);
    expect(hubGroups).toHaveLength(0);
  });
});
