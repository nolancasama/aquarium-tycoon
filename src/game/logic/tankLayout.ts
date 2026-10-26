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

/** A level circle clears the whole dune beneath its largest animated footprint. */
export function slotMarkerY(tank: TankDef, slot: { x: number; z: number }): number {
  const dune = sandDune(tank);
  const radius = SLOT_MARKER_RADIUS * SLOT_MARKER_MAX_SCALE;
  // The nearest point in the enclosing square gives a conservative dune peak:
  // every point on the pulsing circle is at or below this height.
  const x = Math.max(slot.x - radius, Math.min(dune.x, slot.x + radius));
  const z = Math.max(slot.z - radius, Math.min(dune.z, slot.z + radius));
  // Pebbles can protrude 0.0144 m above the flat sand.
  return Math.max(sandSurfaceY(tank, x, z), STAND_H + SAND_H + 0.015) + 0.008;
}
