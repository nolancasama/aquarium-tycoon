import type { Vec2, VisitorType } from "../types";
import { doorStep, HUB_CENTRE, HUB_ENTRANCE, hubRoute, onRing, PLAZA_SPOTS, VIEW_RING, type HubBayKind } from "../data/hub";

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
}

export const HUB_GROUPS = 4;
const WALK = 0.95;
const EXITS: HubBayKind[] = ["indoor", "sharks", "coast"];
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

function spawn(): HubGroup {
  // Half come in from the main entrance, the rest out of a wing.
  const from = rand() < 0.5 ? HUB_ENTRANCE : doorStep(pick(EXITS));
  const g: HubGroup = {
    id: `g${nextId++}`, members: makeMembers(), x: from.x, z: from.z, heading: 0, speed: 0, phase: rand() * 6,
    path: [], next: "view", activity: "walk", until: 0, spot: null, face: null, visible: true
  };
  goToTank(g);
  return g;
}

function goToTank(g: HubGroup) {
  const a = freeSpot();
  if (a === null) { goToPlaza(g); return; }
  g.spot = a;
  g.path = hubRoute({ x: g.x, z: g.z }, onRing(a, VIEW_RING));
  g.next = "view";
  g.activity = "walk";
}

function goToPlaza(g: HubGroup) {
  g.spot = null;
  g.path = hubRoute({ x: g.x, z: g.z }, pick(PLAZA_SPOTS));
  g.next = "plaza";
  g.activity = "walk";
}

function leave(g: HubGroup) {
  g.spot = null;
  const out = rand() < 0.4 ? HUB_ENTRANCE : doorStep(pick(EXITS));
  g.path = hubRoute({ x: g.x, z: g.z }, out);
  g.next = "leave";
  g.activity = "walk";
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
export function stepHubVisitors(dt: number, active: boolean) {
  clock += dt;
  if (!active) return;
  for (let i = hubGroups.length - 1; i >= 0; i--) if (hubGroups[i].next === "gone") {
    hubGroups.splice(i, 1);
    respawnAt.push(clock + 2 + rand() * 4);
  }
  while (hubGroups.length + respawnAt.length < HUB_GROUPS) respawnAt.push(clock + rand() * 2);
  respawnAt = respawnAt.filter((t) => {
    if (t > clock || hubGroups.length >= HUB_GROUPS) return true;
    hubGroups.push(spawn());
    return false;
  });
  for (const g of hubGroups) {
    if (g.path.length) {
      const t = g.path[0];
      const dx = t.x - g.x, dz = t.z - g.z, d = Math.hypot(dx, dz);
      g.speed += (WALK - g.speed) * Math.min(1, dt * 3);
      const step = g.speed * dt;
      if (d <= step) { g.x = t.x; g.z = t.z; g.path.shift(); }
      else { g.x += (dx / d) * step; g.z += (dz / d) * step; }
      if (d > 0.01) g.heading = turn(g.heading, Math.atan2(dx, dz), dt * 5);
      g.phase += step * 7.5;
      if (!g.path.length) arrive(g);
      continue;
    }
    g.speed = 0;
    if (g.face) g.heading = turn(g.heading, Math.atan2(g.face.x - g.x, g.face.z - g.z), dt * 3);
    if (clock < g.until) continue;
    if (g.next === "view") { if (rand() < 0.4) goToPlaza(g); else leave(g); }
    else if (g.next === "plaza") leave(g);
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
  return { x: g.x + c * m.side - s * m.back, z: g.z - s * m.side - c * m.back };
}

export function clearHubVisitors(newSeed = 7) {
  hubGroups.length = 0;
  respawnAt = [];
  seed = newSeed;
  clock = 0;
}
