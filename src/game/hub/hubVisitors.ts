import type { Vec2, VisitorType } from "../types";
import { bayOf, doorCoordinates, doorLocal, HUB_CENTRE, HUB_CORRIDOR, HUB_DOORS, HUB_ENTRANCE, hubArrivalRoute, hubArrivalSpawn, hubDoorOpen, hubDoorRoute, hubRoute, onRing, PLAZA_SPOTS, VIEW_RING, type HubDestination, type HubOpenFlags } from "../data/hub";

/**
 * Decorative hub visitors, in small groups: they come in through the main
 * entrance or out of a wing, stop at the display tank to look, point or take a
 * photo, sometimes pause on the plaza, then leave through another doorway.
 * Runtime only, never saved, and they never tip or ask anything.
 */

export interface HubMember {
  id: string;
  type: VisitorType;
  variant: number;
  /** Offset from the group centre: sideways (+ right of heading) and back. */
  side: number;
  back: number;
}

export type HubActivity = "walk" | "look" | "photo" | "point" | "chat";

export interface HubGroup {
  id: string;
  members: HubMember[];
  x: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
  path: Vec2[];
  /** What happens when the path ends. */
  next: "view" | "plaza" | "leave" | "gone";
  activity: HubActivity;
  until: number;
  /** The view-ring angle reserved by this group (null when not at the tank). */
  spot: number | null;
  face: Vec2 | null;
  visible: boolean;
  /** The passage is reserved until the whole group has cleared it. */
  door: HubDestination | null;
  corridor: "arrival" | "departure" | null;
  /** Recent travelled centreline, newest first: members file around the bend. */
  trail: Vec2[];
}

export const HUB_GROUPS = 4;
const WALK = 0.95;
export const HUB_MEMBER_RADIUS = 0.25;
export const HUB_FILE_SPACING = 0.72;
const DEFAULT_ACCESS: HubOpenFlags = { hallOpen: false, galleryOpen: false };
const SPOTS = Array.from({ length: 8 }, (_, i) => -Math.PI + (i + 0.5) * (Math.PI * 2 / 8));

let seed = 7;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

export const hubGroups: HubGroup[] = [];
let nextId = 1;
let clock = 0;
let respawnAt: number[] = [];

const TYPES: VisitorType[] = ["child", "adult", "fan", "grandma", "explorer"];
const VARIANTS: Record<VisitorType, number> = { child: 6, adult: 3, fan: 3, grandma: 2, explorer: 2, judge: 1 };

function makeMembers(): HubMember[] {
  const n = rand() < 0.3 ? 1 : rand() < 0.7 ? 2 : 3;
  const family = n > 1 && rand() < 0.6;
  const out: HubMember[] = [];
  for (let i = 0; i < n; i++) {
    const type: VisitorType = family ? (i === 0 ? pick(["adult", "grandma"] as const) : "child") : pick(TYPES);
    out.push({ id: `h${nextId++}`, type, variant: Math.floor(rand() * VARIANTS[type]), side: (i - (n - 1) / 2) * 0.62, back: i % 2 ? 0.25 : 0 });
  }
  return out;
}

function freeSpot(): number | null {
  const taken = new Set(hubGroups.map((g) => g.spot));
  const free = SPOTS.filter((a) => !taken.has(a));
  return free.length ? pick(free) : null;
}

function availableDoors(progress: HubOpenFlags): HubDestination[] {
  return HUB_DOORS.filter((k) => hubDoorOpen(k, progress) && !hubGroups.some((g) => g.door === k && g.visible));
}

function spawn(progress: HubOpenFlags): HubGroup {
  // Half come in from the main entrance, the rest out of a wing.
  const doors = availableDoors(progress);
  const door = doors.length && rand() >= 0.5 ? pick(doors) : null;
  const from = door ? hubArrivalSpawn(door) : HUB_ENTRANCE;
  const g: HubGroup = {
    id: `g${nextId++}`, members: makeMembers(), x: from.x, z: from.z, heading: 0, speed: 0, phase: rand() * 6,
    path: [], next: "view", activity: "walk", until: 0, spot: null, face: null, visible: true,
    door, corridor: door ? "arrival" : null, trail: []
  };
  goToTank(g);
  if (g.path.length) g.heading = Math.atan2(g.path[0].x - g.x, g.path[0].z - g.z);
  initialiseTrail(g);
  return g;
}

function goToTank(g: HubGroup) {
  const a = freeSpot();
  if (a === null) { goToPlaza(g); return; }
  g.spot = a;
  g.path = g.door && g.corridor === "arrival" ? hubArrivalRoute(g.door, onRing(a, VIEW_RING)) : hubRoute({ x: g.x, z: g.z }, onRing(a, VIEW_RING));
  g.next = "view";
  g.activity = "walk";
}

function goToPlaza(g: HubGroup) {
  g.spot = null;
  g.path = hubRoute({ x: g.x, z: g.z }, pick(PLAZA_SPOTS));
  g.next = "plaza";
  g.activity = "walk";
}

function leave(g: HubGroup, progress: HubOpenFlags) {
  g.spot = null;
  const doors = availableDoors(progress);
  g.door = doors.length && rand() >= 0.4 ? pick(doors) : null;
  g.corridor = g.door ? "departure" : null;
  g.path = g.door ? hubDoorRoute({ x: g.x, z: g.z }, g.door) : hubRoute({ x: g.x, z: g.z }, HUB_ENTRANCE);
  g.next = "leave";
  g.activity = "walk";
  g.face = null;
}

function arrive(g: HubGroup) {
  if (g.next === "view") {
    g.face = { x: HUB_CENTRE.x, z: HUB_CENTRE.z };
    g.activity = pick(["look", "photo", "point", "look"] as const);
    g.until = clock + 4 + rand() * 5;
  } else if (g.next === "plaza") {
    g.face = null;
    g.activity = "chat";
    g.until = clock + 2.5 + rand() * 3;
  } else {
    g.visible = false;
    g.next = "gone";
  }
}

/** Advance the crowd (called from the game tick while the hub is shown; cheap otherwise). */
export function stepHubVisitors(dt: number, active: boolean, progress: HubOpenFlags = DEFAULT_ACCESS) {
  clock += dt;
  if (!active) return;
  for (let i = hubGroups.length - 1; i >= 0; i--) if (hubGroups[i].next === "gone") {
    hubGroups.splice(i, 1);
    respawnAt.push(clock + 2 + rand() * 4);
  }
  while (hubGroups.length + respawnAt.length < HUB_GROUPS) respawnAt.push(clock + rand() * 2);
  respawnAt = respawnAt.filter((t) => {
    if (t > clock || hubGroups.length >= HUB_GROUPS) return true;
    hubGroups.push(spawn(progress));
    return false;
  });
  for (const g of hubGroups) {
    if (g.door && !hubDoorOpen(g.door, progress)) {
      // A just-closed pair of leaves hides members inside. Those still on the
      // concourse remain visible and regroup there before choosing an open exit.
      const outside = g.members.map((m) => ({ m, p: memberWorld(g, m) })).filter(({ p }) => doorCoordinates(g.door!, p).depth <= 0);
      if (!outside.length) {
        g.path = []; g.visible = false; g.next = "gone"; g.door = null; g.corridor = null;
        continue;
      }
      if (outside.length < g.members.length) {
        g.x = outside[0].p.x; g.z = outside[0].p.z;
        g.members = outside.map(({ m }, i) => ({ ...m, side: 0, back: i * HUB_FILE_SPACING }));
        initialiseTrail(g);
      }
      g.door = null; g.corridor = null;
      if (g.next === "leave") leave(g, progress);
    }
    if (g.path.length) {
      const t = g.path[0];
      const dx = t.x - g.x, dz = t.z - g.z, d = Math.hypot(dx, dz);
      g.speed += (WALK - g.speed) * Math.min(1, dt * 3);
      const step = g.speed * dt;
      if (d <= step) { g.x = t.x; g.z = t.z; g.path.shift(); }
      else { g.x += (dx / d) * step; g.z += (dz / d) * step; }
      recordTrail(g);
      if (d > 0.01) g.heading = turn(g.heading, Math.atan2(dx, dz), dt * 5);
      if (g.door && g.corridor === "arrival" && doorCoordinates(g.door, g).depth < -5.1) {
        g.door = null; g.corridor = null;
      }
      g.phase += step * 7.5;
      if (!g.path.length) arrive(g);
      continue;
    }
    g.speed = 0;
    if (g.face) g.heading = turn(g.heading, Math.atan2(g.face.x - g.x, g.face.z - g.z), dt * 3);
    if (clock < g.until) continue;
    if (g.next === "view") { if (rand() < 0.4) goToPlaza(g); else leave(g, progress); }
    else if (g.next === "plaza") leave(g, progress);
  }
}

function turn(from: number, to: number, k: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, k);
}

/** A member's world position: the group centre plus its offset, turned with the group. */
export function memberWorld(g: HubGroup, m: HubMember): Vec2 {
  const s = Math.sin(g.heading), c = Math.cos(g.heading);
  // Heading h faces (sin h, cos h); its right is (cos h, -sin h).
  const spread = { x: g.x + c * m.side - s * m.back, z: g.z - s * m.side - c * m.back };
  const f = fileAmount(g);
  if (!f) return spread;
  const file = trailPoint(g, g.members.indexOf(m) * HUB_FILE_SPACING);
  // Establish front-to-back spacing before narrowing sideways. A direct blend
  // would squeeze the middle and last members together halfway into the file.
  const aligned = { x: file.x + c * m.side, z: file.z - s * m.side };
  const a = f < 0.5 ? spread : aligned, b = f < 0.5 ? aligned : file;
  const blend = f < 0.5 ? f * 2 : (f - 0.5) * 2;
  return { x: a.x + (b.x - a.x) * blend, z: a.z + (b.z - a.z) * blend };
}

/** Followers face their own segment of the bend, rather than the leader's segment. */
export function memberHeading(g: HubGroup, m: HubMember): number {
  if (fileAmount(g) < 0.99) return g.heading;
  const distance = g.members.indexOf(m) * HUB_FILE_SPACING;
  const front = trailPoint(g, Math.max(0, distance - 0.08));
  const back = trailPoint(g, distance + 0.08);
  return Math.atan2(front.x - back.x, front.z - back.z);
}

function fileAmount(g: HubGroup): number {
  if (!g.door || !g.corridor) return 0;
  return Math.max(0, Math.min(1, (doorCoordinates(g.door, g).depth + 5) / 2));
}

function initialiseTrail(g: HubGroup) {
  g.trail = [{ x: g.x, z: g.z }, { x: g.x - Math.sin(g.heading) * 8, z: g.z - Math.cos(g.heading) * 8 }];
}

function recordTrail(g: HubGroup) {
  const last = g.trail[0];
  if (!last || Math.hypot(g.x - last.x, g.z - last.z) >= 0.015) g.trail.unshift({ x: g.x, z: g.z });
  let length = 0;
  for (let i = 1; i < g.trail.length; i++) {
    length += Math.hypot(g.trail[i].x - g.trail[i - 1].x, g.trail[i].z - g.trail[i - 1].z);
    if (length > 8) { g.trail.length = i + 1; break; }
  }
}

function trailPoint(g: HubGroup, distance: number): Vec2 {
  let a: Vec2 = g;
  for (const b of g.trail) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length >= distance && length > 0) return { x: a.x + (b.x - a.x) * distance / length, z: a.z + (b.z - a.z) * distance / length };
    distance -= length;
    a = b;
  }
  return { x: a.x, z: a.z };
}

/** Deterministic review fixture using the production routes, spacing and stepping. */
export function setupHubReviewJourney(kind: HubDestination, direction: "arrival" | "departure"): string {
  clearHubVisitors(17);
  const from = direction === "arrival" ? hubArrivalSpawn(kind) : doorLocal(kind, 0, -0.65);
  const g: HubGroup = {
    id: `g${nextId++}`, members: [0, 1, 2].map((i) => ({ id: `h${nextId++}`, type: i ? "child" : "adult", variant: 0, side: 0, back: i * HUB_FILE_SPACING })),
    x: from.x, z: from.z, heading: 0, speed: WALK, phase: 0, path: [], next: direction === "arrival" ? "view" : "leave",
    activity: "walk", until: 0, spot: null, face: null, visible: true, door: kind, corridor: direction, trail: []
  };
  g.path = direction === "arrival" ? hubArrivalRoute(kind, onRing(bayOf(kind).angle, VIEW_RING)) : [doorLocal(kind, 0, 0), doorLocal(kind, 0, HUB_CORRIDOR.bendDepth), doorLocal(kind, HUB_CORRIDOR.endSide, HUB_CORRIDOR.bendDepth)];
  g.heading = Math.atan2(g.path[0].x - g.x, g.path[0].z - g.z);
  initialiseTrail(g);
  hubGroups.push(g);
  respawnAt = [Infinity, Infinity, Infinity];
  return g.id;
}

export function clearHubVisitors(newSeed = 7) {
  hubGroups.length = 0;
  respawnAt = [];
  seed = newSeed;
  clock = 0;
}
