import type { Vec2, Vec3 } from "../types";
import type { ReleaseArea } from "./release";

/**
 * The Grand Aquarium Hub: a half rotunda (eight wall bays from the far left,
 * round the back, to the far right) with an open front plaza toward the
 * management camera. The display tank stands in the middle. Every doorway and
 * feature sits in one bay. Angles are measured from straight back (-z),
 * positive toward +x. World metres, like the other rooms (see rooms.ts "hub").
 */

export const HUB_CENTRE: Vec2 = { x: -70, z: -1 };
/** Inner face of the rotunda wall. */
export const HUB_R = 11;
export const HUB_WALL_H = 7;
/** How far the floor runs forward of the centre (the open plaza). */
export const HUB_FRONT = 8.5;

/** The central display tank (decorative: no care, no purchase). */
export const HUB_TANK = { x: HUB_CENTRE.x, z: HUB_CENTRE.z, r: 2, h: 3.2, plinth: 0.55, plinthR: 2.45 };
/** Visitors never come closer to the tank's centre than this. */
export const TANK_CLEAR = HUB_TANK.plinthR + 0.35;

export type HubDestination = "indoor" | "sharks" | "coast" | "lagoon" | "sanctuary";
export type HubBayKind = HubDestination | "trophies" | "window";

export interface HubBay {
  id: string;
  kind: HubBayKind;
  /** Bay centre angle (radians from -z toward +x). */
  angle: number;
  en: string;
  ja: string;
}

const BAY = Math.PI / 8;
const bayAngle = (i: number) => -Math.PI / 2 + BAY * (i + 0.5);

/** Left to right as the camera sees them. */
export const HUB_BAYS: HubBay[] = [
  { id: "indoor", kind: "indoor", angle: bayAngle(0), en: "Indoor Aquarium", ja: "すいぞくかんの なか" },
  { id: "trophies", kind: "trophies", angle: bayAngle(1), en: "Trophies", ja: "トロフィー" },
  { id: "lagoon", kind: "lagoon", angle: bayAngle(2), en: "Dolphin Lagoon", ja: "イルカの ラグーン" },
  { id: "window-l", kind: "window", angle: bayAngle(3), en: "", ja: "" },
  { id: "window-r", kind: "window", angle: bayAngle(4), en: "", ja: "" },
  { id: "sanctuary", kind: "sanctuary", angle: bayAngle(5), en: "Grand Ocean Sanctuary", ja: "うみの サンクチュアリ" },
  { id: "sharks", kind: "sharks", angle: bayAngle(6), en: "Shark Tunnel", ja: "サメの トンネル" },
  { id: "coast", kind: "coast", angle: bayAngle(7), en: "Coastal & Polar Zone", ja: "かいがんと さむい ちいき" }
];

export const HUB_DOORS: HubDestination[] = ["indoor", "sharks", "coast", "lagoon", "sanctuary"];
/** Doorways to release-locked areas (data/release.ts): closed with a lock, a rope and "Coming soon" until released. */
export const RELEASE_DOORS: Partial<Record<HubDestination, ReleaseArea>> = { coast: "coast", lagoon: "lagoon", sanctuary: "sanctuary" };
/** The two outdoor expansions (always future attractions in the hub's art). */
export const FUTURE_DOORS: HubDestination[] = ["lagoon", "sanctuary"];

export const bayOf = (kind: HubBayKind) => HUB_BAYS.find((b) => b.kind === kind)!;

/** A point at radius r and angle a around the hub centre. */
export const onRing = (a: number, r: number): Vec2 => ({ x: HUB_CENTRE.x + Math.sin(a) * r, z: HUB_CENTRE.z - Math.cos(a) * r });

/** Doorway opening (on the wall face) for a bay: width and height in metres. */
export const DOOR_OPENING = { w: 2.6, h: 3.4 };

/** Where people stand just inside a doorway. */
export const doorStep = (kind: HubBayKind) => onRing(bayOf(kind).angle, HUB_R - 1.1);

/** Fixed management camera: a slightly raised three-quarter view of the whole rotunda. */
export const HUB_CAMERA: { pos: Vec3; target: Vec3 } = {
  pos: { x: HUB_CENTRE.x, y: 13.2, z: HUB_CENTRE.z + 21 },
  target: { x: HUB_CENTRE.x, y: 1.9, z: HUB_CENTRE.z - 1.6 }
};

/** Viewing spots round the display tank, and spots on the plaza where groups pause. */
export const VIEW_RING = 3.4;
export const PLAZA_SPOTS: Vec2[] = [
  { x: HUB_CENTRE.x - 5.5, z: HUB_CENTRE.z + 4.2 },
  { x: HUB_CENTRE.x + 5.2, z: HUB_CENTRE.z + 4.6 },
  { x: HUB_CENTRE.x - 1.5, z: HUB_CENTRE.z + 6.2 }
];
/** Visitors arrive from and leave toward the front of the plaza (the main entrance, off screen). */
export const HUB_ENTRANCE: Vec2 = { x: HUB_CENTRE.x + 0.8, z: HUB_CENTRE.z + HUB_FRONT + 1.5 };

const angleOf = (p: Vec2) => Math.atan2(p.x - HUB_CENTRE.x, -(p.z - HUB_CENTRE.z));

/**
 * A walking route from `from` to `to` that never cuts across the display tank:
 * when the straight line would pass too close, the route steps out to the
 * viewing ring and follows it round in short arcs.
 */
export function hubRoute(from: Vec2, to: Vec2): Vec2[] {
  if (segmentClear(from, to)) return [to];
  const a0 = angleOf(from), a1 = angleOf(to);
  let d = a1 - a0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.35));
  const r = VIEW_RING + 0.5;
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) pts.push(onRing(a0 + (d * i) / steps, r));
  pts.push(to);
  return pts;
}

/** Does the segment stay outside the tank's clearance circle? */
export function segmentClear(a: Vec2, b: Vec2, clear = TANK_CLEAR): boolean {
  const cx = HUB_TANK.x, cz = HUB_TANK.z;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cz - a.z) * dz) / len2));
  return Math.hypot(a.x + dx * t - cx, a.z + dz * t - cz) >= clear;
}

/** Inside the walkable floor: within the rotunda and the plaza, clear of the tank. */
export function onHubFloor(p: Vec2): boolean {
  const dx = p.x - HUB_CENTRE.x, dz = p.z - HUB_CENTRE.z;
  if (Math.hypot(dx, dz) < TANK_CLEAR - 0.01) return false;
  if (dz <= 0) return Math.hypot(dx, dz) <= HUB_R - 0.4;
  return Math.abs(dx) <= HUB_R - 0.4 && dz <= HUB_FRONT + 2;
}
