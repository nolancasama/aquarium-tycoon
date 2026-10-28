import { SAND_H, STAND_H, type TankDef } from "../data/tanks";

/** Shared glass footprint, ordered around the perimeter. Insets stay inside the real glass. */
export function footprintPoints(tank: TankDef, inset = 0): { x: number; z: number }[] {
  const w = tank.w - inset * 2;
  const d = tank.d - inset * 2;
  if (tank.shape === "hex") {
    const slope = 2 * tank.d / tank.w;
    const diagonal = tank.d - inset * Math.hypot(slope, 1);
    const corner = diagonal / slope;
    const flatEnd = (diagonal - d / 2) / slope;
    return [{ x: corner, z: 0 }, { x: flatEnd, z: d / 2 }, { x: -flatEnd, z: d / 2 },
      { x: -corner, z: 0 }, { x: -flatEnd, z: -d / 2 }, { x: flatEnd, z: -d / 2 }];
  }
  if (tank.shape === "round") {
    return Array.from({ length: 32 }, (_, i) => ({ x: Math.cos(i * Math.PI / 16) * w / 2, z: Math.sin(i * Math.PI / 16) * d / 2 }));
  }
  if (tank.shape === "bow") {
    const points = [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }];
    for (let i = 0; i <= 24; i++) {
      const x = w / 2 - w * i / 24;
      points.push({ x, z: d / 2 + (tank.bulge ?? 0) * (1 - (2 * x / tank.w) ** 2) });
    }
    return points;
  }
  return [{ x: -w / 2, z: -d / 2 }, { x: w / 2, z: -d / 2 }, { x: w / 2, z: d / 2 }, { x: -w / 2, z: d / 2 }];
}

/** Point containment, including a conservative clearance from sloping/curved glass. */
export function footprintContains(tank: TankDef, x: number, z: number, inset = 0): boolean {
  if (tank.shape === "round") return (x / (tank.w / 2 - inset)) ** 2 + (z / (tank.d / 2 - inset)) ** 2 <= 1 + 1e-9;
  if (Math.abs(x) > tank.w / 2 - inset + 1e-9 || z < -tank.d / 2 + inset - 1e-9) return false;
  if (tank.shape === "bow") return z <= tank.d / 2 + (tank.bulge ?? 0) * (1 - (2 * x / tank.w) ** 2) - inset + 1e-9;
  if (Math.abs(z) > tank.d / 2 - inset + 1e-9) return false;
  if (tank.shape !== "hex") return true;
  // Each diagonal joins (+/-w/2, 0) to (+/-w/4, +/-d/2).
  const slope = 2 * tank.d / tank.w;
  return slope * Math.abs(x) + Math.abs(z) <= tank.d - inset * Math.hypot(slope, 1) + 1e-9;
}

/** The ellipsoid used by the merged sand mesh. Keep overlays on its surface. */
export function sandDune(tank: TankDef) {
  if (tank.group === "special") {
    const x = tank.type === "cave" ? -tank.w * 0.16 : -tank.w * 0.1;
    const z = tank.type === "cave" ? tank.d * 0.08 : -tank.d * 0.08;
    let radius = Math.min(tank.w * 0.25, tank.d * 0.48, tank.w / 2 - Math.abs(x) - 0.015, (tank.d / 2 - Math.abs(z) - 0.015) / 0.55);
    // Support of an ellipsoid against a diagonal hex face, or a circle around it.
    if (tank.shape === "hex") {
      const slope = 2 * tank.d / tank.w;
      radius = Math.min(radius, (tank.d - slope * Math.abs(x) - Math.abs(z) - 0.025) / Math.hypot(slope, 0.55));
    }
    if (tank.shape === "round") radius = Math.min(radius, Math.min(tank.w, tank.d) / 2 - Math.hypot(x, z) - 0.015);
    return { radius, x, z, y: STAND_H + SAND_H - 0.01 };
  }
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
