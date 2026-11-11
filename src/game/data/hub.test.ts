import { afterEach, describe, expect, it } from "vitest";
import { doorCoordinates, doorLocal, doorStep, DOOR_OPENING, HUB_BAYS, HUB_CENTRE, HUB_CORRIDOR, HUB_DOORS, HUB_ENTRANCE, HUB_WINDOW, hubArrivalRoute, hubArrivalSpawn, hubDoorOpen, hubDoorRoute, hubRoute, onHubFloor, PLAZA_SPOTS, segmentClear, TANK_CLEAR, VIEW_RING, onRing } from "./hub";
import { HUB_HALL, inHallRow, isWingHall, ROOMS, roomOpen, SHARKS_HALL } from "./rooms";
import { clearHubVisitors, HUB_FILE_SPACING, HUB_MEMBER_RADIUS, hubGroups, memberWorld, setupHubReviewJourney, stepHubVisitors } from "../hub/hubVisitors";
import { clearPreviewAccess, grantPreview } from "./release";

const progress = (p: Partial<{ hallOpen: boolean; galleryOpen: boolean; atriumOpen: boolean; tunnelOpen: boolean; freePlay: boolean }>) =>
  ({ hallOpen: true, galleryOpen: true, atriumOpen: true, tunnelOpen: false, freePlay: true, ...p });

afterEach(() => { clearPreviewAccess(); clearHubVisitors(); });

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
  it("has one uninterrupted central panoramic bay", () => {
    expect(HUB_BAYS.filter((b) => b.kind === "window")).toEqual([expect.objectContaining({ angle: 0 })]);
    expect(HUB_WINDOW.halfAngle).toBeGreaterThan(Math.PI / 8 - 0.05);
  });

  it("centres each doorway route inside its clear opening and ends behind its corridor return", () => {
    for (const kind of HUB_DOORS) {
      const route = hubDoorRoute(HUB_ENTRANCE, kind);
      for (let i = 1; i < route.length; i++) {
        expect(segmentClear(route[i - 1], route[i]), kind).toBe(true);
        for (let f = 0; f <= 1; f += 0.1) {
          const p = { x: route[i - 1].x + (route[i].x - route[i - 1].x) * f, z: route[i - 1].z + (route[i].z - route[i - 1].z) * f };
          const local = doorCoordinates(kind, p);
          if (local.depth > -0.2 && local.depth < 1.7) expect(Math.abs(local.side) + HUB_MEMBER_RADIUS, kind).toBeLessThan(DOOR_OPENING.w / 2);
        }
      }
      const end = doorCoordinates(kind, route.at(-1)!);
      expect(end.depth, kind).toBeGreaterThan(2.45 + HUB_MEMBER_RADIUS);
      expect(end.depth, kind).toBeLessThan(HUB_CORRIDOR.depth - HUB_MEMBER_RADIUS);
      expect(end.side - 2 * HUB_FILE_SPACING, kind).toBeGreaterThanOrEqual(HUB_CORRIDOR.hiddenSide);
    }
  });

  it("spawns arrivals behind the corridor return and brings them out through the clear opening", () => {
    for (const kind of HUB_DOORS) {
      const spawn = doorCoordinates(kind, hubArrivalSpawn(kind));
      expect(spawn.depth, kind).toBeGreaterThan(2.45 + HUB_MEMBER_RADIUS);
      expect(spawn.depth, kind).toBeLessThan(HUB_CORRIDOR.depth - HUB_MEMBER_RADIUS);
      expect(spawn.side, kind).toBeGreaterThanOrEqual(HUB_CORRIDOR.hiddenSide - 1e-8);
      const route = [hubArrivalSpawn(kind), ...hubArrivalRoute(kind, onRing(0, VIEW_RING))];
      for (let i = 1; i < route.length; i++) expect(segmentClear(route[i - 1], route[i]), kind).toBe(true);
      expect(route.some((p) => Math.abs(doorCoordinates(kind, p).depth) < 1e-8)).toBe(true);
    }
  });
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
  it("shares the travel open rule, including purchases and ending previews", () => {
    const p = progress({});
    expect(hubDoorOpen("indoor", p)).toBe(true);
    for (const kind of HUB_DOORS.filter((k) => k !== "indoor")) expect(hubDoorOpen(kind, p), kind).toBe(false);
    p.tunnelOpen = true;
    expect(hubDoorOpen("sharks", p)).toBe(true);
    grantPreview("coast");
    expect(hubDoorOpen("coast", p)).toBe(true);
    clearPreviewAccess();
    expect(hubDoorOpen("coast", p)).toBe(false);
  });

  it("never selects closed passages and re-evaluates an existing route when access closes", () => {
    clearHubVisitors(3);
    const p = progress({});
    for (let t = 0; t < 180; t += 0.1) {
      stepHubVisitors(0.1, true, p);
      for (const g of hubGroups) if (g.door) expect(hubDoorOpen(g.door, p), g.door).toBe(true);
    }
    grantPreview("coast");
    setupHubReviewJourney("coast", "departure");
    stepHubVisitors(0.05, true, p);
    clearPreviewAccess();
    stepHubVisitors(0.05, true, p);
    for (const g of hubGroups) expect(g.door).not.toBe("coast");
    setupHubReviewJourney("sharks", "departure");
    p.tunnelOpen = true;
    stepHubVisitors(0.05, true, p);
    p.tunnelOpen = false;
    stepHubVisitors(0.05, true, p);
    for (const g of hubGroups) expect(g.door).not.toBe("sharks");
  });

  it("keeps exterior members visible if a preview ends while their leader has crossed the wall", () => {
    grantPreview("coast");
    setupHubReviewJourney("coast", "departure");
    const p = progress({});
    for (let i = 0; i < 10; i++) stepHubVisitors(0.1, true, p);
    const before = hubGroups[0];
    const outsideIds = before.members.filter((m) => doorCoordinates("coast", memberWorld(before, m)).depth < 0).map((m) => m.id);
    expect(outsideIds.length).toBeGreaterThan(0);
    expect(outsideIds.length).toBeLessThan(3);
    clearPreviewAccess();
    stepHubVisitors(0.05, true, p);
    expect(hubGroups[0].visible).toBe(true);
    expect(hubGroups[0].members.map((m) => m.id)).toEqual(outsideIds);
    expect(hubGroups[0].door).not.toBe("coast");
  });

  it("files all three members through every open doorway and removes them only behind the return", () => {
    grantPreview("coast"); grantPreview("lagoon"); grantPreview("sanctuary");
    const p = progress({ tunnelOpen: true });
    for (const kind of HUB_DOORS) for (const direction of ["arrival", "departure"] as const) {
      const id = setupHubReviewJourney(kind, direction);
      let crossed = false, hidden = false;
      for (let t = 0; t < 13; t += 0.05) {
        stepHubVisitors(0.05, true, p);
        const g = hubGroups.find((x) => x.id === id);
        if (!g) break;
        const members = g.members.map((m) => memberWorld(g, m));
        for (const m of members) {
          const local = doorCoordinates(kind, m);
          if (local.depth > -0.2 && local.depth < 1.5) {
            crossed = true;
            expect(Math.abs(local.side) + HUB_MEMBER_RADIUS, `${kind} ${direction}`).toBeLessThan(DOOR_OPENING.w / 2);
          }
        }
        if (g.door) for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
          expect(Math.hypot(members[i].x - members[j].x, members[i].z - members[j].z)).toBeGreaterThan(HUB_MEMBER_RADIUS * 2);
        }
        if (!g.visible && direction === "departure") {
          hidden = true;
          for (const member of members) {
            const local = doorCoordinates(kind, member);
            expect(local.side, kind).toBeGreaterThanOrEqual(HUB_CORRIDOR.hiddenSide - 0.01);
            expect(local.depth, kind).toBeGreaterThan(2.45 + HUB_MEMBER_RADIUS);
          }
        }
      }
      expect(crossed, `${kind} ${direction}`).toBe(true);
      if (direction === "departure") expect(hidden, kind).toBe(true);
    }
  });

  it("establishes following distance before a three-person group narrows into a file", () => {
    setupHubReviewJourney("indoor", "departure");
    const g = hubGroups[0];
    const from = doorLocal("indoor", 0, -5);
    g.x = from.x; g.z = from.z;
    g.trail = [from, doorLocal("indoor", 0, -13)];
    g.path = hubDoorRoute(from, "indoor");
    g.members.forEach((m, i) => { m.side = (i - 1) * 0.62; m.back = i % 2 ? 0.25 : 0; });
    for (let t = 0; t < 5; t += 0.05) {
      stepHubVisitors(0.05, true);
      const members = g.members.map((m) => memberWorld(g, m));
      for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
        expect(Math.hypot(members[i].x - members[j].x, members[i].z - members[j].z)).toBeGreaterThan(HUB_MEMBER_RADIUS * 2);
      }
    }
  });

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
