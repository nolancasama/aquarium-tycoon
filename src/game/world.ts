import type { SlotId, TankType, Vec2, Vec3 } from "./types";
import { SAND_H, SLOT_POS, STAND_H, TANKS } from "./data/tanks";
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

/** A walking route from a point to a point, through each doorway between their rooms in turn. */
export function route(from: Vec2, to: Vec2): Vec2[] {
  const a = hallOfX(from.x);
  const b = hallOfX(to.x);
  if (a === b) return [to];
  const path: Vec2[] = [];
  if (a < b) for (let i = a + 1; i <= b; i++) path.push(doorWest(i), doorEast(i));
  else for (let i = a; i > b; i--) path.push(doorEast(i), doorWest(i));
  return [...path, to];
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
  return { x: o.x + local.x, y: o.y + local.y, z: o.z + local.z };
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
export function decorRadius(kind: string, variant: string | null): number {
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
    r: decorRadius(d.kind, d.variant),
    top: decorTop(t, d.kind, d.variant) + sandSurfaceY(def, slots[d.slot].x, slots[d.slot].z) - STAND_H - SAND_H
  }));
  return def.rocks ? [...placed, ...def.rocks] : placed;
}

/** Where a visitor stands to look into this tank. */
export function lookSpot(slot: SlotId, i = 0): Vec2 {
  const p = SLOT_POS[slot];
  return { x: p.x + (i % 2 ? 0.55 : -0.45), z: p.z + 1.5 };
}
