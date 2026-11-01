import type { SlotId, TankType, Vec2, Vec3 } from "./types";
import { SAND_H, SLOT_FACING, SLOT_POS, STAND_H, TANKS } from "./data/tanks";
import { DECOR, decorVersion } from "./data/decor";
import { DOOR_W, DOOR_Z, ROOMS, ROOM_CENTER_X, doorX, roomAtX } from "./data/rooms";
import type { TankRec } from "./logic/model";
import type { Column } from "./logic/swim";
import { sandSurfaceY } from "./logic/tankLayout";

/**
 * Room layout and tank geometry in world space (metres). The room's front
 * (+z) faces the management camera; tanks stand along the back. Rooms come
 * from data/rooms.ts; the named constants below are the first rooms' bounds.
 */

export const ROOM = ROOMS[0].bounds;
/** The Ocean Hall (Phase 2), right of the first hall, sharing its right wall. */
export const HALL2 = ROOMS[1].bounds;
/** The Jellyfish Gallery (Expansion 1), right of the Ocean Hall. */
export const GALLERY = ROOMS[2].bounds;
export const ATRIUM = ROOMS[3].bounds;
/** Management-view centre of each room. */
export const HALL_X = ROOM_CENTER_X;

/** The entrance is in the left wall, toward the front. */
export const DOOR = { x: -6, z: 1.5, w: 1.8 };
export const ENTRY: Vec2 = { x: -5.3, z: 1.5 };
export const OUTSIDE: Vec2 = { x: -7.4, z: 1.5 };
/** The doorway between the halls (in the shared wall), and the points either side of it. */
export const HALL_DOOR = { x: doorX(1), z: DOOR_Z, w: DOOR_W };
export const DOOR_WEST: Vec2 = { x: doorX(1) - 0.7, z: DOOR_Z };
export const DOOR_EAST: Vec2 = { x: doorX(1) + 0.7, z: DOOR_Z };
/** The doorway between the Ocean Hall and the Jellyfish Gallery. */
export const GALLERY_DOOR = { x: doorX(2), z: DOOR_Z, w: DOOR_W };
export const ATRIUM_DOOR = { x: doorX(3), z: DOOR_Z, w: DOOR_W };
/** The bench where request visitors wait (they sit facing the room centre). */
export const BENCH: Vec2 = { x: 4.4, z: 2.95 };
export const BENCH_SEAT: Vec2 = { x: 4.22, z: 2.95 };
/** Seat top: low enough that a seated adult's feet reach the floor with level thighs. */
export const BENCH_SEAT_H = 0.32;
/** Seat and backrest bounds from the room model; front is the -x side. */
export const BENCH_FOOTPRINT = { minX: BENCH.x - 0.25, maxX: BENCH.x + 0.28, minZ: BENCH.z - 0.75, maxZ: BENCH.z + 0.75 };
/** Where visitors stand to sit: feet stay here while the hips go back onto the seat. */
export const BENCH_FRONT: Vec2 = { x: BENCH_SEAT.x - 0.38, z: BENCH_SEAT.z };
export const BENCH_FACING = -Math.PI / 2;

const ease = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

const overreachCache = new Map<number, number>();
/** 0 when the planted foot stays in reach along the whole sit, 1 when it is clearly out of reach. */
function overreach(hip: number): number {
  let r = overreachCache.get(hip);
  if (r === undefined) {
    let worst = 0;
    for (let i = 0; i <= 20; i++) {
      const p = i / 20;
      const f = (BENCH_SEAT.x - BENCH_FRONT.x) * ease(p / 0.7);
      const h = hip + (BENCH_SEAT_H + hip * (0.075 / 0.74) - hip) * ease((p - 0.12) / 0.88);
      worst = Math.max(worst, Math.hypot(f, h) - hip);
    }
    r = ease(worst / 0.03);
    overreachCache.set(hip, r);
  }
  return r;
}

/**
 * One continuous sit (progress 0 → 1; standing retraces it): the torso leans
 * forward over planted feet while the hips travel back, then down onto the
 * seat, then the legs settle into the seated pose. Leg angles come from
 * two-bone IK to the planted foot. `hip` is the model's leg-pivot height
 * (thigh and shin are each half of it); `lean` rotates the torso about the hips.
 */
export function benchPose(progress: number, hip: number) {
  const back = ease(progress / 0.7);
  const down = ease((progress - 0.12) / 0.88);
  let settle = ease((progress - 0.65) / 0.35);
  const radius = hip * (0.075 / 0.74);
  const x = BENCH_FRONT.x + (BENCH_SEAT.x - BENCH_FRONT.x) * back;
  const bodyY = (BENCH_SEAT_H + radius - hip) * down;
  let thigh = 0;
  let knee = 0;
  if (hip > 0) {
    // Hip-to-foot vector in the body frame (forward is +z, foot on the floor);
    // equal thigh and shin lengths make the knee bend symmetric.
    const f = x - BENCH_FRONT.x;
    const h = hip + bodyY;
    const d = Math.min(Math.hypot(f, h), hip - 1e-6);
    // Short legs (children) cannot keep the foot planted, so they scoot back and lift them early.
    settle = Math.max(settle, overreach(hip) * ease((progress - 0.15) / 0.75));
    const line = Math.atan2(f, h);
    const bend = Math.acos(d / hip);
    thigh = -line - bend;
    knee = 2 * bend;
  }
  return {
    x,
    z: BENCH_SEAT.z,
    bodyY,
    thigh: thigh + (-Math.PI / 2 - thigh) * settle,
    knee: knee + (Math.PI / 2 - knee) * settle,
    lean: 0.32 * Math.sin(Math.PI * ease(progress / 0.85))
  };
}

/** Keep walking outside the furniture; the final seat placement is a seated pose. */
export function benchApproach(from: Vec2): Vec2[] {
  return [...route(from, { x: BENCH_FRONT.x, z: ENTRY.z }), BENCH_FRONT];
}

/** A body-width inset avoids offering a visitor still passing through a wall. */
export function insideRoom(p: Vec2): boolean {
  const bounds = ROOMS[hallOfX(p.x)].bounds;
  return p.x >= bounds.minX + 0.4 && p.x <= bounds.maxX - 0.4 && p.z >= bounds.minZ + 0.4 && p.z <= bounds.maxZ - 0.4;
}

export function requestEligible(v: Vec2 & { request: unknown; helped: boolean; scripted: boolean; state: string }): boolean {
  return Boolean(v.request) && !v.helped && !v.scripted && (v.state === "walk" || v.state === "sit") && insideRoom(v);
}

/** Which room (index into ROOMS) world x is in. */
export const hallOfX = (x: number): number => roomAtX(x);

/** The doorway into room i (from room i-1): the points 0.7 m either side of it. */
export const doorWest = (i: number): Vec2 => ({ x: doorX(i) - 0.7, z: DOOR_Z });
export const doorEast = (i: number): Vec2 => ({ x: doorX(i) + 0.7, z: DOOR_Z });

export interface WalkObstacle { minX: number; maxX: number; minZ: number; maxZ: number }
/** Conservative solid footprints, including 30 cm for a visitor's body. Pads
 * reserve the largest accepted tank even before it is installed. */
export const ATRIUM_OBSTACLES: WalkObstacle[] = [
  { minX: 34.95, maxX: 41.05, minZ: -2.7, maxZ: 0.7 }, // reef and plinth
  { minX: 31.15, maxX: 34.85, minZ: 2.05, maxZ: 4.15 }, // J
  { minX: 41.75, maxX: 45.45, minZ: -4.65, maxZ: -2.55 }, // K
  { minX: 34.65, maxX: 37.35, minZ: 4.05, maxZ: 5.2 },
  { minX: 40.65, maxX: 43.35, minZ: 4.05, maxZ: 5.2 },
  { minX: 30.35, maxX: 31.65, minZ: -5.25, maxZ: -4 },
  { minX: 44.35, maxX: 45.65, minZ: 4, maxZ: 5.25 },
  { minX: 44.35, maxX: 45.65, minZ: -1.05, maxZ: 0.25 },
  { minX: 31.75, maxX: 33.65, minZ: -5.25, maxZ: -4.25 },
  { minX: 40.1, maxX: 41.9, minZ: -5.25, maxZ: -4.25 }
];

/** Segment/expanded-footprint intersection, also used by path acceptance tests. */
export function crossesObstacle(a: Vec2, b: Vec2, r: WalkObstacle): boolean {
  let lo = 0, hi = 1;
  for (const [p, d, min, max] of [[a.x, b.x - a.x, r.minX, r.maxX], [a.z, b.z - a.z, r.minZ, r.maxZ]]) {
    if (Math.abs(d) < 1e-9) { if (p < min || p > max) return false; }
    else {
      const t0 = (min - p) / d, t1 = (max - p) / d;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      if (lo > hi) return false;
    }
  }
  return true;
}

const atriumClear = (a: Vec2, b: Vec2) => !ATRIUM_OBSTACLES.some((r) => crossesObstacle(a, b, r));
const atriumCorners: Vec2[] = ATRIUM_OBSTACLES.flatMap((r) => [
  { x: r.minX - 0.025, z: r.minZ - 0.025 }, { x: r.maxX + 0.025, z: r.minZ - 0.025 },
  { x: r.maxX + 0.025, z: r.maxZ + 0.025 }, { x: r.minX - 0.025, z: r.maxZ + 0.025 }
]).filter((p) => p.x > ATRIUM.minX + 0.35 && p.x < ATRIUM.maxX - 0.35 && p.z > ATRIUM.minZ + 0.35 && p.z < ATRIUM.maxZ - 0.35 && atriumClear(p, p));

/** Visibility graph around static furniture; calculated only when a route starts. */
function atriumRoute(from: Vec2, to: Vec2): Vec2[] {
  if (atriumClear(from, to)) return [to];
  const points = [from, to, ...atriumCorners];
  const distance = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  distance[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let at = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (at < 0 || distance[i] < distance[at])) at = i;
    if (at < 0 || !Number.isFinite(distance[at])) break;
    if (at === 1) {
      const path: Vec2[] = [];
      for (let i = 1; i > 0; i = previous[i]) path.unshift(points[i]);
      return path;
    }
    visited.add(at);
    for (let i = 1; i < points.length; i++) if (!visited.has(i) && atriumClear(points[at], points[i])) {
      const d = distance[at] + Math.hypot(points[i].x - points[at].x, points[i].z - points[at].z);
      if (d < distance[i]) { distance[i] = d; previous[i] = at; }
    }
  }
  // A caller supplied a point inside solid scenery. Hold rather than crossing it.
  return [];
}

export const ATRIUM_REST_SPOTS: Vec2[] = [{ x: 36, z: 3.65 }, { x: 42, z: 3.65 }];
/** Walk all four viewing faces, keeping the secondary pads outside the loop. */
export function reefLoop(from: Vec2, to: Vec2): Vec2[] {
  const points = [{ x: 34.5, z: 1.25 }, { x: 34.5, z: -3.15 }, { x: 41.4, z: -3.15 }, { x: 41.4, z: 1.25 }, to];
  const result: Vec2[] = [];
  let previous = from;
  for (const p of points) { result.push(...route(previous, p)); previous = p; }
  return result;
}

/** A walking route from a point to a point, through each doorway between their rooms in turn. */
export function route(from: Vec2, to: Vec2): Vec2[] {
  const a = hallOfX(from.x);
  const b = hallOfX(to.x);
  const path: Vec2[] = [];
  if (a < b) for (let i = a + 1; i <= b; i++) path.push(doorWest(i), doorEast(i));
  else for (let i = a; i > b; i--) path.push(doorEast(i), doorWest(i));
  path.push(to);
  const result: Vec2[] = [];
  let previous = from;
  for (const p of path) {
    result.push(...(previous.x >= ATRIUM.minX && p.x >= ATRIUM.minX ? atriumRoute(previous, p) : [p]));
    previous = p;
  }
  return result;
}
/** The trophy pedestal by the entrance. */
export const PEDESTAL: Vec2 = { x: -4.7, z: -0.3 };
/** Pico's counter between the tanks. */
export const PICO: Vec3 = { x: 0, y: 0, z: -2.2 };
/** Walkway lane in front of the tanks. */
export const WALK_Z = 0.9;

/** Water-local origin of a tank: centre of the glass bottom. */
export function tankOrigin(slot: SlotId): Vec3 {
  const p = SLOT_POS[slot];
  return { x: p.x, y: STAND_H, z: p.z };
}

export function toWorld(slot: SlotId, local: Vec3): Vec3 {
  const o = tankOrigin(slot);
  const a = SLOT_FACING[slot], c = Math.cos(a), s = Math.sin(a);
  return { x: o.x + local.x * c + local.z * s, y: o.y + local.y, z: o.z - local.x * s + local.z * c };
}

/** Centre of the water (camera framing, effects). */
export function waterCentre(slot: SlotId, type: TankType): Vec3 {
  const o = tankOrigin(slot);
  return { x: o.x, y: o.y + TANKS[type].h / 2, z: o.z };
}

/** Where pellets fall in (front-left of the surface, away from the lamp's middle). */
export function feedSpot(type: TankType): Vec3 {
  const t = TANKS[type];
  return { x: -t.w * 0.18, y: t.h - 0.05, z: 0.05 };
}

/** Decoration footprint radius (m) for fish clearance and picking. */
export function decorRadius(kind: string, variant: string | null, tank?: TankType): number {
  const footprint = DECOR[kind as keyof typeof DECOR]?.footprint;
  if (footprint !== undefined) return footprint;
  // Existing models scale with water height. Only the new giant habitat needs
  // larger clearance; earlier tanks retain their established avoidance radii.
  return legacyDecorRadius(kind, variant) * (tank === "reef" ? TANKS.reef.h / TANKS.ocean.h : 1);
}

function legacyDecorRadius(kind: string, variant: string | null): number {
  if (kind === "chest") return 0.17;
  if (kind === "plant") return variant === "big" ? 0.16 : 0.12;
  if (kind === "rock") return variant === "big" ? 0.17 : 0.11;
  if (kind === "coral") return 0.14;
  if (kind === "castle") return variant === "big" ? 0.18 : 0.13;
  if (kind === "shipwreck") return 0.26;
  if (kind === "anemone") return 0.13;
  if (kind === "kelp") return 0.12;
  if (kind === "arch") return 0.24;
  if (kind === "cave") return 0.22;
  if (kind === "driftwood") return 0.18;
  return 0.1;
}

export function decorTop(t: TankRec, kind: keyof typeof DECOR, variant: TankRec["decor"][number]["variant"]): number {
  return SAND_H + decorVersion(kind, variant).height * TANKS[t.type].h;
}

/** Decorations, and the tank's built-in rock formations, as columns the fish swim over. */
export function columnsOf(t: TankRec): Column[] {
  const def = TANKS[t.type];
  const slots = def.slots;
  const placed = t.decor.map((d) => ({
    x: slots[d.slot].x,
    z: slots[d.slot].z,
    r: decorRadius(d.kind, d.variant, t.type),
    top: decorTop(t, d.kind, d.variant) + Math.max(sandSurfaceY(def, slots[d.slot].x, slots[d.slot].z), STAND_H + (slots[d.slot].y ?? 0)) - STAND_H - SAND_H
  }));
  return def.rocks ? [...placed, ...def.rocks] : placed;
}

/** Where a visitor stands to look into this tank. */
export function lookSpot(slot: SlotId, i = 0): Vec2 {
  const p = SLOT_POS[slot];
  if (slot === "I") return { x: p.x + (i % 2 ? 0.65 : -0.65), z: 1.25 };
  return { x: p.x + (i % 2 ? 0.55 : -0.45), z: p.z + 1.5 };
}
