import { SAND_H, STAND_H, type TankDef } from "../data/tanks";

/** The ellipsoid used by the merged sand mesh. Keep overlays on its surface. */
export function sandDune(tank: TankDef) {
  return { radius: tank.w * 0.32, x: -tank.w * 0.18, z: -tank.d * 0.18, y: STAND_H + SAND_H - 0.01 };
}

export function sandSurfaceY(tank: TankDef, x: number, z: number): number {
  const dune = sandDune(tank);
  const k = 1 - ((x - dune.x) / dune.radius) ** 2 - ((z - dune.z) / (dune.radius * 0.55)) ** 2;
  return Math.max(STAND_H + SAND_H, dune.y + dune.radius * 0.09 * Math.sqrt(Math.max(0, k)));
}

export const SLOT_MARKER_RADIUS = 0.15;
export const SLOT_MARKER_MAX_SCALE = 1.12;

/** Rings hover this far above the sand: clear of the contact shadows (+0.002), too little to read as floating. */
export const SLOT_MARKER_LIFT = 0.005;
/** Pebbles (up to 0.024 m) are kept this far from a slot centre so the draped ring never meets one. */
export const PEBBLE_CLEAR_RADIUS = SLOT_MARKER_RADIUS * SLOT_MARKER_MAX_SCALE + 0.03;

/** Height of a ring vertex at tank-local (x, z): rings follow the sand's contour. */
export function slotMarkerY(tank: TankDef, p: { x: number; z: number }): number {
  return sandSurfaceY(tank, p.x, p.z) + SLOT_MARKER_LIFT;
}

export function clearOfSlots(tank: TankDef, x: number, z: number): boolean {
  return tank.slots.every((s) => Math.hypot(x - s.x, z - s.z) > PEBBLE_CLEAR_RADIUS);
}
