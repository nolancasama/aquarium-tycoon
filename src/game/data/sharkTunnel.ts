import type { TunnelDecorKind } from "../types";
import type { Obstacle, P3, SwimVolume, TunnelShape } from "../tunnel/contract";

/**
 * Shark Tunnel geometry (world metres, y up). The wing lies behind the Coral Reef
 * Atrium's back wall (z = -5.5), independent of the +x hall row: a lobby, then one
 * enormous habitat with a glass walkway tube looping through it. Everything that
 * the scene, the swim simulation, exploration and visitors need about space is
 * defined here once. See DESIGN_DECISIONS.md "Shark Tunnel expansion".
 */

/** The doorway in the Atrium's back wall (left bay). */
export const SHARK_DOOR = { x: 32.55, z: -5.5, w: 1.8, h: 2.65 };

/** The dry entrance lobby between the Atrium and the habitat. */
export const TUNNEL_LOBBY = { minX: 29.5, maxX: 42.6, minZ: -10.5, maxZ: -5.5, height: 4.2 };

/** The water: inner faces of the habitat walls, the seabed's lowest level and the surface. */
export const HABITAT = {
  min: { x: 20, y: -0.7, z: -40 },
  max: { x: 52, y: 8, z: -10.5 },
  centre: { x: 36, y: 0, z: -25 }
};
/** The walkway floor is at y = 0 on a plinth; the sand lies a little below it. */
export const seabedY = (x: number, z: number): number => -0.45 + 0.1 * Math.sin(x * 0.42) * Math.cos(z * 0.32) + 0.06 * Math.sin(x * 0.17 + z * 0.23);

/** Glass tube outer dimensions (half-width at the floor, height of the crown). */
export const TUBE = { halfWidth: 2.1, height: 3.2 };
/** The Grand Viewing Chamber dome. */
export const CHAMBER = { x: 36.4, z: -32.3, halfWidth: 4.5, height: 4.5, blendFrom: 6, blendTo: 2.2 };
/** The bottom of the U is a true circular arc around this centre, its radius well above the
 * dome's half-width, so the tube's inner side never folds back on itself (it did at r 3.4). */
const ARC = { x: 36.4, z: -25.5, r: 6.8 };
const arc = (deg: number): [number, number] => [ARC.x + ARC.r * Math.cos((deg * Math.PI) / 180), ARC.z - ARC.r * Math.sin((deg * Math.PI) / 180)];

/** Where the tube passes through the lobby's back wall (x of each mouth's centre). */
export const MOUTHS = { entrance: 32.45, exit: 40.2 };

/** Control points in walking order (closed); z > lobby edge means inside the lobby. */
const CONTROL: Array<[number, number]> = [
  [32.55, -7.4], // 0 lobby, from the Atrium door
  // Straight through the lobby wall at both mouths, so each glass ring meets the
  // wall squarely instead of slanting through it.
  [MOUTHS.entrance, -10.6], // 1 entrance mouth
  [MOUTHS.entrance, -12.4], // 2
  [30.7, -15.8], // 3 first viewing section
  [29.4, -20.4], // 4
  arc(180), // 5 main underwater curve (the arc starts)
  arc(150), // 6
  arc(120), // 7
  arc(90), // 8 Grand Viewing Chamber (= CHAMBER)
  arc(60), // 9
  arc(30), // 10
  arc(0), // 11 return leg
  [43.3, -20.4], // 12 rock window
  [41.7, -15.6], // 13
  [MOUTHS.exit, -12.8], // 14
  [MOUTHS.exit, -10.6], // 15 exit mouth
  [40.0, -7.6], // 16
  [35.55, -6.9] // 17 lobby, back past the Atrium door
];
/** Named places on the loop (indices into CONTROL). */
const C = { start: 0, firstView: 3, mainCurve: 5, chamber: 8, rockWindow: 12, returnEnd: 13, exitEnd: 16 };

/** Centripetal Catmull-Rom on the closed control loop. */
function curvePoint(i: number, t: number): [number, number] {
  const n = CONTROL.length;
  const p0 = CONTROL[(i - 1 + n) % n], p1 = CONTROL[i], p2 = CONTROL[(i + 1) % n], p3 = CONTROL[(i + 2) % n];
  const knot = (a: [number, number], b: [number, number]) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
    const w = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 0 in the ordinary tube, 1 under the dome's centre. */
export const chamberBlend = (x: number, z: number) => smooth(CHAMBER.blendFrom, CHAMBER.blendTo, Math.hypot(x - CHAMBER.x, z - CHAMBER.z));
const inLobby = (z: number) => z > HABITAT.max.z + 0.05;

/** Dense samples of the loop (about every 0.5 m), with tube dimensions. */
function buildPath() {
  const raw: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < CONTROL.length; i++) for (let k = 0; k < 24; k++) {
    const [x, z] = curvePoint(i, k / 24);
    raw.push({ x, z });
  }
  // Resample by arc length.
  const acc = [0];
  for (let i = 1; i <= raw.length; i++) acc.push(acc[i - 1] + Math.hypot(raw[i % raw.length].x - raw[i - 1].x, raw[i % raw.length].z - raw[i - 1].z));
  const total = acc[acc.length - 1];
  const count = Math.round(total / 0.5);
  const pts: Array<P3 & { halfWidth: number; height: number; inside?: boolean; s: number }> = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = (k / count) * total;
    while (acc[j + 1] < s) j++;
    const a = raw[j], b = raw[(j + 1) % raw.length], f = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, c = chamberBlend(x, z);
    pts.push({ x, y: 0, z, s, halfWidth: TUBE.halfWidth + (CHAMBER.halfWidth - TUBE.halfWidth) * c, height: TUBE.height + (CHAMBER.height - TUBE.height) * c, ...(inLobby(z) ? { inside: true } : {}) });
  }
  return { pts, total };
}

const PATH = buildPath();
/** Length of the closed walking loop (m). */
export const walkwayLength = PATH.total;
/** Dense loop samples with distance `s` along the loop. */
export const WALKWAY_SAMPLES = PATH.pts;

/** The tube as animals must avoid it (about every 1 m, from the same samples). */
export const TUNNEL_SHAPE: TunnelShape = {
  closed: true,
  points: PATH.pts.filter((_, i) => i % 2 === 0).map(({ x, y, z, halfWidth, height, inside }) => ({ x, y, z, halfWidth, height, ...(inside ? { inside } : {}) }))
};

const wrap = (s: number) => ((s % walkwayLength) + walkwayLength) % walkwayLength;

export interface WalkwayFrame {
  x: number; y: number; z: number;
  /** Unit tangent in walking direction; (-dz, dx) is the +lateral direction (the walker's right). */
  dx: number; dz: number;
  halfWidth: number; height: number;
  inside: boolean;
  /** 0..1, how far into the Grand Viewing Chamber. */
  chamber: number;
}

/** The loop at distance s: position, tangent and tube size (interpolated, smooth). */
export function walkwayFrame(distance: number): WalkwayFrame {
  const s = wrap(distance), n = PATH.pts.length, step = walkwayLength / n;
  const i = Math.min(n - 1, Math.floor(s / step)), f = s / step - i;
  const a = PATH.pts[i], b = PATH.pts[(i + 1) % n], c = PATH.pts[(i + 2) % n], p = PATH.pts[(i - 1 + n) % n];
  const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
  // Tangent blended between neighbouring chords, so direction changes continuously.
  const t0x = b.x - p.x, t0z = b.z - p.z, t1x = c.x - a.x, t1z = c.z - a.z;
  let dx = t0x + (t1x - t0x) * f, dz = t0z + (t1z - t0z) * f;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  const halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * f, height = a.height + (b.height - a.height) * f;
  return { x, y: 0, z, dx, dz, halfWidth, height, inside: Boolean(a.inside && b.inside), chamber: chamberBlend(x, z) };
}

/**
 * How far from the centreline people may walk at s. In the ordinary tube an adult
 * at this offset stays well under the glass (the crown is elliptical); in the
 * chamber and the lobby there is more room.
 */
export const WALKWAY_HALF_WIDTH = 1.25;
export function walkHalfWidth(s: number): number {
  const f = walkwayFrame(s);
  if (f.inside) return 1.6;
  return WALKWAY_HALF_WIDTH + 2.1 * f.chamber;
}

/** A point on the walkway: s along the loop, lateral offset (+ is right of walking direction), clamped. */
export function walkwayPoint(s: number, lateral: number): P3 {
  const f = walkwayFrame(s), w = walkHalfWidth(s), l = Math.max(-w, Math.min(w, lateral));
  return { x: f.x - f.dz * l, y: 0, z: f.z + f.dx * l };
}

/** Inner glass height above the floor at a lateral offset (the tube is a half-ellipse). */
export function glassHeightAt(s: number, lateral: number): number {
  const f = walkwayFrame(s), k = Math.min(1, Math.abs(lateral) / (f.halfWidth - 0.12));
  return (f.height - 0.12) * Math.sqrt(Math.max(0, 1 - k * k));
}

/** Distance along the loop of the sample nearest a control point. */
function sAtControl(i: number): number {
  const [cx, cz] = CONTROL[i];
  let best = 0, bestD = Infinity;
  for (const p of PATH.pts) { const d = Math.hypot(p.x - cx, p.z - cz); if (d < bestD) { bestD = d; best = p.s; } }
  return best;
}
const S = CONTROL.map((_, i) => sAtControl(i));

export type TunnelSection = "lobby" | "entrance" | "firstView" | "mainCurve" | "grandChamber" | "returnLeg" | "exit";
/** Distance ranges along the loop (the lobby wraps past 0). */
export const TUNNEL_SECTIONS: Record<TunnelSection, { from: number; to: number }> = {
  entrance: { from: S[C.start], to: S[C.firstView] - 1.5 },
  firstView: { from: S[C.firstView] - 1.5, to: S[C.mainCurve] - 1.5 },
  mainCurve: { from: S[C.mainCurve] - 1.5, to: S[C.chamber] - 4 },
  grandChamber: { from: S[C.chamber] - 4, to: S[C.chamber] + 4 },
  returnLeg: { from: S[C.chamber] + 4, to: S[C.returnEnd] + 1 },
  exit: { from: S[C.returnEnd] + 1, to: S[C.exitEnd] },
  lobby: { from: S[C.exitEnd], to: walkwayLength }
};
export function sectionAt(distance: number): TunnelSection {
  const s = wrap(distance);
  for (const [name, r] of Object.entries(TUNNEL_SECTIONS) as Array<[TunnelSection, { from: number; to: number }]>) if (s >= r.from && s < r.to) return name;
  return "lobby";
}
/** Where exploration starts: just inside the lobby, facing the entrance mouth. */
export const EXPLORE_START_S = S[C.start] + 0.4;
/** The middle of the Grand Viewing Chamber. */
export const CHAMBER_S = S[C.chamber];

/** Interesting views: walk up to them and the camera reframes; tap to walk there. */
export interface ViewingSpot {
  id: string;
  s: number;
  /** +1: the view is on the +lateral side (right of walking direction), -1 the other side, 0 overhead. */
  side: 1 | -1 | 0;
  section: TunnelSection;
  en: string;
  ja: string;
}
export const TUNNEL_VIEWING_SPOTS: ViewingSpot[] = [
  { id: "first", s: S[C.firstView], side: -1, section: "firstView", en: "First window", ja: "さいしょの まど" },
  { id: "curve", s: S[C.mainCurve] + 1, side: 1, section: "mainCurve", en: "Big curve", ja: "おおきな カーブ" },
  { id: "chamber", s: S[C.chamber], side: 0, section: "grandChamber", en: "Grand chamber", ja: "おおきな ドーム" },
  { id: "return", s: S[C.rockWindow], side: -1, section: "returnLeg", en: "Rock window", ja: "いわの まど" }
];

export type TunnelView = "whole" | "left" | "right" | "entrance";
/** Management viewpoints (the elevated diorama camera). Base framing at 16:9; CameraRig widens for narrower screens. */
export const TUNNEL_VIEWS: Record<TunnelView, { pos: P3; target: P3 }> = {
  whole: { pos: { x: 36, y: 36, z: 10 }, target: { x: 36, y: 0, z: -22.5 } },
  left: { pos: { x: 15, y: 19, z: -6 }, target: { x: 29, y: 0.5, z: -25 } },
  right: { pos: { x: 57, y: 19, z: -6 }, target: { x: 43, y: 0.5, z: -25 } },
  entrance: { pos: { x: 35.5, y: 10, z: 1.5 }, target: { x: 35.5, y: 0.6, z: -14 } }
};

/**
 * Six placement zones on the seabed, clear of the tube, the back rocks and each other.
 * `yaw` turns the structure about +y: every zone stands its structure parallel to the
 * side walls (an arch's opening then faces across the habitat, toward the tube).
 */
export const TUNNEL_ZONES: Array<P3 & { yaw: number }> = [
  [24.2, -15.4], [24, -25.2], [26, -35.4], [48, -15.4], [48.4, -25.2], [46.4, -35.4]
].map(([x, z]) => ({ x, y: seabedY(x, z), z, yaw: Math.PI / 2 }));

export interface TunnelStructure {
  /** Visual and collision extent (relative to the zone, base at the sand). */
  dimensions: P3;
  color: string;
  /** Solids, relative to the zone point; the renderer draws exactly these (rock-textured). */
  obstacles: Obstacle[];
  gate?: { c: P3; axis: P3; r: number };
  restSpot?: P3;
}
const sphere = (x: number, y: number, z: number, r: number): Obstacle => ({ kind: "sphere", c: { x, y, z }, r });
const capsule = (a: P3, b: P3, r: number): Obstacle => ({ kind: "capsule", a, b, r });
const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Obstacle => ({ kind: "box", c: { x, y, z }, half: { x: hx, y: hy, z: hz } });
/** The arch spans x (legs at ±1.85); animals pass through it along z. */
const ARCH: P3[] = [
  { x: -1.85, y: 0.4, z: 0 }, { x: -1.85, y: 2.9, z: 0 }, { x: -1.3, y: 3.95, z: 0 }, { x: 0, y: 4.35, z: 0 },
  { x: 1.3, y: 3.95, z: 0 }, { x: 1.85, y: 2.9, z: 0 }, { x: 1.85, y: 0.4, z: 0 }
];

export const TUNNEL_STRUCTURES: Record<TunnelDecorKind, TunnelStructure> = {
  tunnelArch: {
    dimensions: { x: 4.9, y: 4.95, z: 1.3 }, color: "#6f8f8a",
    obstacles: [...ARCH.slice(1).map((p, i) => capsule(ARCH[i], p, 0.6)), sphere(-1.85, 0.35, 0, 0.85), sphere(1.85, 0.35, 0, 0.85)],
    gate: { c: { x: 0, y: 1.9, z: 0 }, axis: { x: 0, y: 0, z: 1 }, r: 1.2 }
  },
  tunnelPinnacle: {
    dimensions: { x: 2.8, y: 5.2, z: 2.8 }, color: "#57727b",
    obstacles: [sphere(0, 0.6, 0, 1.4), capsule({ x: 0, y: 1.2, z: 0 }, { x: 0.15, y: 3.6, z: 0.1 }, 1.0), sphere(0.2, 4.3, 0.1, 0.75)]
  },
  tunnelShelf: {
    dimensions: { x: 4.4, y: 2.4, z: 3.2 }, color: "#6a8c80",
    obstacles: [box(0, 0.75, 0.2, 1.3, 0.75, 1.1), box(0, 1.95, 0, 2.2, 0.45, 1.6)]
  },
  tunnelLedge: {
    dimensions: { x: 4.4, y: 2.3, z: 3.2 }, color: "#738f8c",
    obstacles: [box(-1.75, 0.95, 0, 0.45, 0.95, 1.6), box(1.75, 0.95, 0, 0.45, 0.95, 1.6), box(0, 2.05, 0, 2.2, 0.25, 1.6)],
    restSpot: { x: 0, y: 0, z: 0 }
  },
  tunnelSand: {
    dimensions: { x: 4.6, y: 0.75, z: 3.6 }, color: "#d9c69b",
    obstacles: [box(0, 0.32, 0, 2.3, 0.4, 1.8)]
  }
};

/** Built-in rock formations near the habitat walls (a back arch, side buttresses). Drawn from these solids. */
export const TUNNEL_ROCKS: Obstacle[] = [
  sphere(21.6, 1.2, -20.5, 1.7), sphere(21.4, 3.3, -20.8, 1.2), sphere(21.2, 5.2, -21, 0.9),
  sphere(21.8, 1.4, -30.3, 1.8), sphere(21.4, 3.7, -30.2, 1.3),
  sphere(50.4, 1.2, -20.5, 1.7), sphere(50.6, 3.4, -20.7, 1.2),
  sphere(50.2, 1.4, -30.3, 1.8), sphere(50.6, 3.6, -30.1, 1.25), sphere(50.8, 5.4, -30, 0.85),
  // The tall back arch, framing the far wall behind the Grand Viewing Chamber.
  sphere(31, 1.3, -38.4, 1.6), sphere(42, 1.3, -38.4, 1.6),
  capsule({ x: 31, y: 1.5, z: -38.4 }, { x: 31.4, y: 5.6, z: -38.4 }, 0.95),
  capsule({ x: 42, y: 1.5, z: -38.4 }, { x: 41.6, y: 5.6, z: -38.4 }, 0.95),
  capsule({ x: 31.4, y: 5.6, z: -38.4 }, { x: 36.5, y: 6.7, z: -38.4 }, 0.85),
  capsule({ x: 36.5, y: 6.7, z: -38.4 }, { x: 41.6, y: 5.6, z: -38.4 }, 0.85),
  // Low reef mounds inside the U, below the open overhead swim space.
  sphere(36.4, -0.2, -20.5, 1.3), sphere(34.9, -0.3, -21.8, 0.9), sphere(37.9, -0.3, -18.9, 0.85)
];

/** Rotate about +y by yaw (same convention as THREE's rotation.y), then translate. */
export function placePoint(p: P3, o: P3, yaw = 0): P3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: o.x + c * p.x + s * p.z, y: o.y + p.y, z: o.z - s * p.x + c * p.z };
}
export function placeObstacle(o: Obstacle, offset: P3, yaw = 0): Obstacle {
  if (o.kind === "capsule") return { ...o, a: placePoint(o.a, offset, yaw), b: placePoint(o.b, offset, yaw) };
  if (o.kind === "box") return { ...o, c: placePoint(o.c, offset, yaw), yaw: (o.yaw ?? 0) + yaw };
  return { ...o, c: placePoint(o.c, offset, yaw) };
}
/** A placed structure's solids in world space. */
export function structureObstacles(kind: TunnelDecorKind, zone: number): Obstacle[] {
  const z = TUNNEL_ZONES[zone];
  if (!z || !TUNNEL_STRUCTURES[kind]) return [];
  return TUNNEL_STRUCTURES[kind].obstacles.map((o) => placeObstacle(o, z, z.yaw));
}

/** Open-sand rest spots used when no resting ledge is placed. */
const OPEN_REST: P3[] = [{ x: 36.4, y: 0, z: -14.5 }, { x: 25.5, y: 0, z: -30.4 }];

/** The habitat as the swim simulation sees it, for these placed structures. */
export function sharkSwimVolume(placed: ReadonlyArray<{ zone: number; kind: TunnelDecorKind }>): SwimVolume {
  const valid = placed.filter((p) => TUNNEL_ZONES[p.zone] && TUNNEL_STRUCTURES[p.kind]);
  return {
    min: { ...HABITAT.min }, max: { ...HABITAT.max }, floorY: seabedY, tunnel: TUNNEL_SHAPE,
    obstacles: [
      ...TUNNEL_ROCKS,
      // The lobby building's habitat face and the walkway plinth under the tube are covered by
      // the tube itself (inside points are skipped), so the lobby gets its own block.
      { kind: "box", c: { x: (TUNNEL_LOBBY.minX + TUNNEL_LOBBY.maxX) / 2, y: 2, z: -8 }, half: { x: (TUNNEL_LOBBY.maxX - TUNNEL_LOBBY.minX) / 2, y: 2.5, z: 2.6 } },
      ...valid.flatMap((p) => structureObstacles(p.kind, p.zone))
    ],
    gates: valid.flatMap((p) => {
      const g = TUNNEL_STRUCTURES[p.kind].gate, z = TUNNEL_ZONES[p.zone];
      return g ? [{ ...g, c: placePoint(g.c, z, z.yaw), axis: placePoint(g.axis, { x: 0, y: 0, z: 0 }, z.yaw) }] : [];
    }),
    restSpots: [
      ...valid.flatMap((p) => {
        const r = TUNNEL_STRUCTURES[p.kind].restSpot, z = TUNNEL_ZONES[p.zone];
        return r ? [placePoint(r, z, z.yaw)] : [];
      }),
      ...OPEN_REST.map((p) => ({ ...p, y: seabedY(p.x, p.z) }))
    ]
  };
}
