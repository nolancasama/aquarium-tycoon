import { EXHIBITS, PENGUIN_STAFF_DOOR } from "../data/coast";
import { tankAt, type Model } from "../logic/model";
import { HABITAT_PAD } from "../logic/coast";
import type { Vec3 } from "../types";
import { landLegClear, stationLandRoute, type Mover, type MoveCtx } from "./motion";

export type KeeperPhase = "idle" | "doorOpening" | "walkOut" | "tip" | "watch" | "walkBack" | "doorClosing";
export type KeeperCare = "feed" | "clean";
const door = PENGUIN_STAFF_DOOR, ex = EXHIBITS.penguins;
export const CLEAN_MONTAGE_SECONDS = 5;
export type CleanPose = "glassScrub" | "crouchCollect" | "sprayWipe" | "kneelBrush" | "finalWipe";
export type CleanTool = "sponge" | "bucket" | "spray" | "brush" | "cloth";
/** Five photographs, held for one second each. Positions never interpolate or wrap. */
export const CLEAN_SHOTS = [
  { start: 0, duration: 1, x: -5.5, z: -3.2, heading: -0.45, pose: "glassScrub", tool: "sponge" },
  { start: 1, duration: 1, x: -2.75, z: -3.2, heading: 0.5, pose: "crouchCollect", tool: "bucket" },
  { start: 2, duration: 1, x: 0, z: -3.2, heading: -0.35, pose: "sprayWipe", tool: "spray" },
  { start: 3, duration: 1, x: 2.75, z: -3.2, heading: 0.55, pose: "kneelBrush", tool: "brush" },
  { start: 4, duration: 1, x: 5.5, z: -3.2, heading: -0.6, pose: "finalWipe", tool: "cloth" }
] as const satisfies readonly { start: number; duration: number; x: number; z: number; heading: number; pose: CleanPose; tool: CleanTool }[];
export function cleanShotAt(elapsed: number): (typeof CLEAN_SHOTS)[number] | null {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= CLEAN_MONTAGE_SECONDS) return null;
  return CLEAN_SHOTS.find((shot) => elapsed >= shot.start && elapsed < shot.start + shot.duration) ?? null;
}
export const KEEPER_CLEARANCE = 1.05;
export const keeperRt = {
  feed: { phase: "idle" as KeeperPhase, elapsed: 0, x: door.x, z: door.z, heading: 0, door: 0, tip: 0, walking: false,
    route: [] as Vec3[], leg: 0, blocked: 0, targetX: 0, targetZ: 0, slot: -1, mealStarted: false, pileStarted: false },
  clean: { phase: "idle" as "idle" | "montage", elapsed: 0, frame: 0 }
};
const pending = { feed: false, clean: false }, delivered = { feed: true, clean: true };
let active: KeeperCare | null = null;
let items: MoveCtx["landItems"] = [];
const next = { x: 0, z: 0 };
const noPeers: readonly Mover[] = [];

// A tiny external store: React only rerenders at start/finish, never every frame.
const listeners = new Set<() => void>();
export const subscribeKeeperCare = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const keeperBusy = () => keeperRt.feed.phase !== "idle" || keeperRt.clean.phase !== "idle";
function changed() { for (const fn of listeners) fn(); }

function placedItems(model: Model) {
  const out: MoveCtx["landItems"] = [];
  for (const d of tankAt(model, HABITAT_PAD.penguins)?.decor ?? []) {
    const s = ex.slots[d.slot];
    if (s?.on === "land") out.push({ x: s.x, z: s.z, r: d.kind === "penguinFeeder" ? 0.45 : 0.6 });
  }
  return out;
}

export function startKeeperFeed(model: Model): boolean {
  if (keeperBusy() || pending.feed || pending.clean) return false;
  items = placedItems(model);
  const f = keeperRt.feed;
  const feeder = tankAt(model, HABITAT_PAD.penguins)?.decor.find((d) => d.kind === "penguinFeeder");
  const station = feeder && ex.slots[feeder.slot];
  // Work from the rear of the tray, leaving the front and sides to the birds.
  const target = station ? { x: station.x, z: station.z - 1.25 } : { x: 0, z: -2.3 };
  const route = stationLandRoute(ex, door, target, items, 0.7);
  if (!route) return false; // No broken path, including after unusual item placement.
  f.route = route; f.leg = 0; f.blocked = 0;
  f.targetX = station ? station.x : target.x; f.targetZ = station ? station.z : target.z + 0.65;
  f.slot = feeder?.slot ?? -1; f.mealStarted = false; f.pileStarted = false;
  f.x = door.x; f.z = door.z; f.heading = 0; f.door = 0; f.tip = 0; f.walking = false;
  f.phase = "doorOpening"; f.elapsed = 0;
  active = "feed"; delivered.feed = false;
  changed();
  return true;
}

export function startKeeperClean(_model: Model): boolean {
  if (keeperBusy() || pending.feed || pending.clean) return false;
  keeperRt.clean.phase = "montage"; keeperRt.clean.elapsed = 0; keeperRt.clean.frame = 0;
  active = "clean"; delivered.clean = false;
  changed();
  return true;
}

function phase(p: KeeperPhase) { keeperRt.feed.phase = p; keeperRt.feed.elapsed = 0; keeperRt.feed.walking = false; }

/** Swept body clearance, shared by staff and penguin travel; no temporary vectors. */
export function keeperSegmentClear(ax: number, az: number, bx: number, bz: number, x: number, z: number, gap = KEEPER_CLEARANCE) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  const start = Math.hypot(ax - x, az - z), closest = Math.hypot(ax + dx * t - x, az + dz * t - z);
  // A pre-existing overlap may separate, never deepen.
  return closest >= Math.min(gap, start) - 1e-8;
}

function walk(dt: number, peers: readonly Mover[]) {
  const f = keeperRt.feed, to = f.route[f.leg];
  if (!to) return true;
  const dx = to.x - f.x, dz = to.z - f.z, distance = Math.hypot(dx, dz), step = Math.min(distance, dt * 1.15);
  next.x = f.x + dx / (distance || 1) * step; next.z = f.z + dz / (distance || 1) * step;
  let clear = landLegClear(ex, f, next, items, 0.7);
  for (const m of peers) if (Math.abs(m.y - ex.land.y) < 0.85 && !keeperSegmentClear(f.x, f.z, next.x, next.z, m.x, m.z)) { clear = false; break; }
  if (!clear) {
    f.walking = false; f.blocked += dt;
    if (f.blocked >= 1.5) {
      // Exceptional obstruction: rebuild the graph around current birds. Not a frame allocation.
      const obstacles = placedItemsForRoute(peers);
      const goal = f.route[f.route.length - 1];
      const route = stationLandRoute(ex, f, goal, obstacles, 0.7);
      if (route) { f.route = route; f.leg = 0; }
      f.blocked = 0;
    }
    return false;
  }
  f.blocked = 0; f.walking = step > 1e-5;
  if (distance > 1e-5) f.heading = Math.atan2(dx, dz);
  f.x = next.x; f.z = next.z;
  if (distance <= step + 1e-6) f.leg++;
  return f.leg === f.route.length;
}
function placedItemsForRoute(peers: readonly Mover[]) {
  const obstacles = items.slice();
  for (const m of peers) if (Math.abs(m.y - ex.land.y) < 0.85 && Math.hypot(m.x - keeperRt.feed.x, m.z - keeperRt.feed.z) > KEEPER_CLEARANCE) {
    obstacles.push({ x: m.x, z: m.z, r: KEEPER_CLEARANCE - 0.7 * 0.45 });
  }
  return obstacles;
}

/** Runtime only. Every motion segment is tested, including the return to the threshold. */
export function stepKeepers(_model: Model, dt: number, peers: readonly Mover[] = noPeers) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const f = keeperRt.feed, c = keeperRt.clean;
  if (c.phase === "montage") {
    c.elapsed = Math.min(CLEAN_MONTAGE_SECONDS, c.elapsed + dt + 1e-12);
    c.frame = Math.min(CLEAN_SHOTS.length - 1, Math.floor(c.elapsed));
    if (c.elapsed >= CLEAN_MONTAGE_SECONDS) { pending.clean = !delivered.clean; active = null; c.phase = "idle"; changed(); }
  }
  if (f.phase === "idle") return;
  f.elapsed += dt;
  switch (f.phase) {
    case "doorOpening":
      f.door = Math.min(1, f.elapsed / 0.8);
      if (f.door === 1) phase("walkOut");
      break;
    case "walkOut":
      if (walk(dt, peers)) { phase("tip"); pending.feed = !delivered.feed; }
      break;
    case "tip":
      f.heading = Math.atan2(f.targetX - f.x, f.targetZ - f.z);
      f.tip = Math.min(1, f.elapsed / 1.8);
      if (f.tip === 1) phase("watch");
      break;
    case "watch":
      f.tip = 0;
      if (f.elapsed >= 1.6) {
        const route = stationLandRoute(ex, f, door, items, 0.7);
        if (route) { f.route = route; f.leg = 0; phase("walkBack"); }
      }
      break;
    case "walkBack":
      if (walk(dt, peers)) phase("doorClosing");
      break;
    case "doorClosing":
      f.door = Math.max(0, 1 - f.elapsed / 0.8);
      if (f.door === 0) { phase("idle"); active = null; changed(); }
      break;
  }
}

export function consumeKeeperBenefit(kind: KeeperCare) {
  if (!pending[kind] || delivered[kind]) return false;
  pending[kind] = false; delivered[kind] = true;
  return true;
}

/** Leave settles any unearned care once; clearCoast/model teardown discards it instead. */
export function finishKeepers() {
  if (active && !delivered[active]) pending[active] = true;
  resetPresentation();
}
function resetPresentation() {
  const f = keeperRt.feed;
  f.phase = "idle"; f.elapsed = 0; f.x = door.x; f.z = door.z; f.heading = 0; f.door = 0; f.tip = 0; f.walking = false;
  f.route.length = 0; f.leg = 0; f.blocked = 0; f.slot = -1; f.mealStarted = false; f.pileStarted = false;
  keeperRt.clean.phase = "idle"; keeperRt.clean.elapsed = 0; keeperRt.clean.frame = 0;
  active = null;
  changed();
}
export function resetKeepers() {
  pending.feed = pending.clean = false; delivered.feed = delivered.clean = true;
  resetPresentation();
}
