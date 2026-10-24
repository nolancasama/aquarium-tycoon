import type { SlotId, TankType, Vec2, Vec3 } from "./types";
import { SAND_H, SLOT_POS, STAND_H, TANKS } from "./data/tanks";
import { DECOR, decorVersion } from "./data/decor";
import type { TankRec } from "./logic/model";
import type { Column } from "./logic/swim";

/**
 * Room layout and tank geometry in world space (metres). The room's front
 * (+z) faces the management camera; tanks stand along the back.
 */

export const ROOM = { minX: -6, maxX: 6, minZ: -4, maxZ: 4, wallH: 3.2 };
/** The Ocean Hall (Phase 2), right of the first hall, sharing its right wall. */
export const HALL2 = { minX: 6, maxX: 18, minZ: -4, maxZ: 4, wallH: 3.2 };
/** Management-view centre of each hall. */
export const HALL_X = [0, 12] as const;

/** The entrance is in the left wall, toward the front. */
export const DOOR = { x: -6, z: 1.5, w: 1.8 };
export const ENTRY: Vec2 = { x: -5.3, z: 1.5 };
export const OUTSIDE: Vec2 = { x: -7.4, z: 1.5 };
/** The doorway between the halls (in the shared wall), and the points either side of it. */
export const HALL_DOOR = { x: 6, z: 1.5, w: 1.8 };
export const DOOR_WEST: Vec2 = { x: 5.3, z: 1.5 };
export const DOOR_EAST: Vec2 = { x: 6.7, z: 1.5 };
/** The bench where request visitors wait (they sit facing the room centre). */
export const BENCH: Vec2 = { x: 4.4, z: 2.95 };
export const BENCH_SEAT: Vec2 = { x: 4.3, z: 2.95 };
/** Seat and backrest bounds from the room model; front is the -x side. */
export const BENCH_FOOTPRINT = { minX: BENCH.x - 0.25, maxX: BENCH.x + 0.28, minZ: BENCH.z - 0.75, maxZ: BENCH.z + 0.75 };
export const BENCH_FRONT: Vec2 = { x: BENCH.x - 0.95, z: BENCH_SEAT.z };
export const BENCH_FACING = -Math.PI / 2;

/** Keep walking outside the furniture; the final seat placement is a seated pose. */
export function benchApproach(from: Vec2): Vec2[] {
  return [...route(from, { x: BENCH_FRONT.x, z: ENTRY.z }), BENCH_FRONT];
}

/** A body-width inset avoids offering a visitor still passing through a wall. */
export function insideRoom(p: Vec2): boolean {
  const bounds = hallOfX(p.x) === 0 ? ROOM : HALL2;
  return p.x >= bounds.minX + 0.4 && p.x <= bounds.maxX - 0.4 && p.z >= bounds.minZ + 0.4 && p.z <= bounds.maxZ - 0.4;
}

export function requestEligible(v: Vec2 & { request: unknown; helped: boolean; scripted: boolean; state: string }): boolean {
  return Boolean(v.request) && !v.helped && !v.scripted && (v.state === "walk" || v.state === "sit") && insideRoom(v);
}

export const hallOfX = (x: number): 0 | 1 => (x > HALL_DOOR.x ? 1 : 0);

/** A walking route from a point to a point, through the doorway when they are in different halls. */
export function route(from: Vec2, to: Vec2): Vec2[] {
  const a = hallOfX(from.x);
  const b = hallOfX(to.x);
  if (a === b) return [to];
  return a === 0 ? [DOOR_WEST, DOOR_EAST, to] : [DOOR_EAST, DOOR_WEST, to];
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
  return 0.1;
}

export function decorTop(t: TankRec, kind: keyof typeof DECOR, variant: TankRec["decor"][number]["variant"]): number {
  return SAND_H + decorVersion(kind, variant).height * TANKS[t.type].h;
}

/** Decorations as columns the fish swim over. */
export function columnsOf(t: TankRec): Column[] {
  const slots = TANKS[t.type].slots;
  return t.decor.map((d) => ({
    x: slots[d.slot].x,
    z: slots[d.slot].z,
    r: decorRadius(d.kind, d.variant),
    top: decorTop(t, d.kind, d.variant)
  }));
}

/** Where a visitor stands to look into this tank. */
export function lookSpot(slot: SlotId, i = 0): Vec2 {
  const p = SLOT_POS[slot];
  return { x: p.x + (i % 2 ? 0.55 : -0.45), z: p.z + 1.5 };
}
