import { EXHIBITS, PENGUIN_STAFF_DOOR } from "../data/coast";
import { tankAt, type Model } from "../logic/model";
import { HABITAT_PAD } from "../logic/coast";
import type { Vec3 } from "../types";
import { landLegClear, stationLandRoute, type Mover, type MoveCtx } from "./motion";

export type KeeperPhase = "idle" | "doorOpening" | "walkOut" | "tip" | "watch" | "walkBack" | "doorClosing";
export type KeeperCare = "feed" | "clean";
const door = PENGUIN_STAFF_DOOR, ex = EXHIBITS.penguins;
export const CLEAN_MONTAGE_SECONDS = 5;
/** Upper (land) poses, then the lower gallery's glass poses. */
export type CleanPose = "kneelBrush" | "crouchCollect" | "standWipe" | "hoseSpray" | "inspect"
  | "poleReach" | "leanWipe" | "crouchRinse" | "scrubLow";
export type CleanTool = "sponge" | "bucket" | "brush" | "cloth" | "hose" | "pole";
export type CleanWorker = {
  x: number; y: number; z: number; heading: number; pose: CleanPose; tool: CleanTool;
  /** Hose: nozzle elevation (radians above level) along the heading. */
  aim?: number;
  /** Hose: ground points the line follows from the worker's feet to the wall tap. */
  via?: readonly { x: number; z: number }[];
  /** Lower gallery: where the water bucket stands on the floor (the wiped spot follows the real sponge). */
  bucket?: { x: number; z: number };
};
/** Wall tap beside the staff door that the hose runs from (exhibit-local, at the cliff foot). */
export const HOSE_TAP = { x: -1.5, z: -8.95 };
/** Visitor-side floor of the lower gallery, and where the glass cleaners stand (feet behind the window plinth). */
const FLOOR = -3.05, GLASS = 11.72, L = ex.land.y;
/** Five photographs of the whole team (three upper, two lower), held one second each. No interpolation or wrap.
 * Upper: A on the left, B with the hose in the centre, C on the right, never all facing the camera.
 * Lower: two glass cleaners start at either side of the Underwater view (clear of the room
 * arrows at 16:9 and 4:3) and work inward to the centre, never meeting.
 */
export const CLEAN_SHOTS = [
  { start: 0, duration: 1, workers: [
    { x: -5.5, y: L, z: -3.2, heading: -2.1, pose: "kneelBrush", tool: "brush" },
    { x: 0.2, y: L, z: -7.6, heading: Math.PI, pose: "hoseSpray", tool: "hose", aim: -0.1 },
    { x: 5.2, y: L, z: -2.9, heading: 2.28, pose: "kneelBrush", tool: "sponge" },
    { x: -2.8, y: FLOOR, z: GLASS, heading: Math.PI, pose: "poleReach", tool: "pole", bucket: { x: -3.42, z: 12.05 } },
    { x: 2.75, y: FLOOR, z: GLASS, heading: Math.PI, pose: "leanWipe", tool: "sponge", bucket: { x: 3.37, z: 12.05 } }
  ] },
  { start: 1, duration: 1, workers: [
    { x: -6.9, y: L, z: -5.6, heading: Math.PI, pose: "crouchCollect", tool: "bucket" },
    { x: -0.6, y: L, z: -6.0, heading: 1.91, pose: "hoseSpray", tool: "hose", aim: -0.5 },
    { x: 7.6, y: L, z: -6.9, heading: Math.PI, pose: "crouchCollect", tool: "bucket" },
    { x: -2.35, y: FLOOR, z: GLASS, heading: -0.97, pose: "crouchRinse", tool: "sponge", bucket: { x: -2.9, z: 12.1 } },
    { x: 2.3, y: FLOOR, z: GLASS, heading: Math.PI, pose: "poleReach", tool: "pole", bucket: { x: 2.92, z: 12.05 } }
  ] },
  { start: 2, duration: 1, workers: [
    { x: -7.1, y: L, z: -6.7, heading: -1.2, pose: "standWipe", tool: "cloth" },
    { x: -0.7, y: L, z: -7.7, heading: 2.75, pose: "hoseSpray", tool: "hose", aim: 0.3 },
    { x: 5.7, y: L, z: -2.0, heading: 0.35, pose: "kneelBrush", tool: "brush" },
    { x: -1.9, y: FLOOR, z: GLASS, heading: Math.PI, pose: "scrubLow", tool: "sponge", bucket: { x: -2.5, z: 12.05 } },
    { x: 1.85, y: FLOOR, z: GLASS, heading: 0.97, pose: "crouchRinse", tool: "sponge", bucket: { x: 2.4, z: 12.1 } }
  ] },
  { start: 3, duration: 1, workers: [
    { x: -5.4, y: L, z: -6.0, heading: 2.6, pose: "crouchCollect", tool: "bucket" },
    { x: 1.4, y: L, z: -5.4, heading: -2.64, pose: "hoseSpray", tool: "hose", aim: -0.6, via: [{ x: 2.1, z: -7.4 }] },
    { x: 4.9, y: L, z: -4.3, heading: 1.54, pose: "standWipe", tool: "cloth" },
    { x: -1.5, y: FLOOR, z: GLASS, heading: Math.PI, pose: "poleReach", tool: "pole", bucket: { x: -2.1, z: 12.05 } },
    { x: 1.45, y: FLOOR, z: GLASS, heading: Math.PI, pose: "scrubLow", tool: "sponge", bucket: { x: 2.05, z: 12.05 } }
  ] },
  { start: 4, duration: 1, workers: [
    { x: -6.0, y: L, z: -2.4, heading: -2.5, pose: "inspect", tool: "cloth" },
    { x: 1.0, y: L, z: -7.9, heading: 2.6, pose: "hoseSpray", tool: "hose", aim: 0.15 },
    { x: 3.8, y: L, z: -3.7, heading: 0.6, pose: "inspect", tool: "cloth" },
    { x: -1.05, y: FLOOR, z: GLASS, heading: Math.PI, pose: "leanWipe", tool: "sponge", bucket: { x: -1.65, z: 12.05 } },
    { x: 1.0, y: FLOOR, z: GLASS, heading: Math.PI, pose: "poleReach", tool: "pole", bucket: { x: 1.6, z: 12.05 } }
  ] }
] as const satisfies readonly { start: number; duration: number; workers: readonly [CleanWorker, CleanWorker, CleanWorker, CleanWorker, CleanWorker] }[];
/** Indices into a shot's workers. */
export const UPPER_CLEANERS = [0, 1, 2] as const, LOWER_CLEANERS = [3, 4] as const, HOSE_CLEANER = 1;
export function cleanShotAt(elapsed: number): (typeof CLEAN_SHOTS)[number] | null {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= CLEAN_MONTAGE_SECONDS) return null;
  return CLEAN_SHOTS.find((shot) => elapsed >= shot.start && elapsed < shot.start + shot.duration) ?? null;
}
/**
 * Where the hose lies on the shelf for a hose worker (exhibit-local x/z): from
 * the ground beside the worker (on the tap's side, a little forward, where it
 * drops from the nozzle) through any authored via points to the tap's foot.
 * The renderer draws exactly these points; tests check them against scenery.
 */
export function hoseGroundPath(w: Pick<CleanWorker, "x" | "z" | "heading" | "via">): { x: number; z: number }[] {
  const fx = Math.sin(w.heading), fz = Math.cos(w.heading), rx = fz, rz = -fx;
  const side = (HOSE_TAP.x - w.x) * rx + (HOSE_TAP.z - w.z) * rz >= 0 ? 1 : -1;
  const drop = { x: w.x + rx * side * 0.32 + fx * 0.18, z: w.z + rz * side * 0.32 + fz * 0.18 };
  return [drop, ...(w.via ?? []), { x: HOSE_TAP.x, z: HOSE_TAP.z + 0.12 }];
}
/** Land-shelf bodies of the upper team for the current photograph (penguins walk round them). */
export const CREW_RADIUS = 0.7;
export const KEEPER_CLEARANCE = 1.05;
export const keeperRt = {
  feed: { phase: "idle" as KeeperPhase, elapsed: 0, x: door.x, z: door.z, heading: 0, door: 0, tip: 0, walking: false,
    route: [] as Vec3[], leg: 0, blocked: 0, targetX: 0, targetZ: 0, slot: -1, mealStarted: false, pileStarted: false },
  clean: { phase: "idle" as "idle" | "montage", elapsed: 0, frame: 0, startClean: 100 },
  /** A bought penguin coming out through the staff door (runtime presentation; see coastRuntime). */
  arrival: { phase: "idle" as "idle" | "doorOpening" | "walkOut" | "doorClosing", elapsed: 0, door: 0, id: null as string | null }
};
/** How far open the shared staff door is (feeding keeper or an arriving penguin). */
export const staffDoorOpen = () => Math.max(keeperRt.feed.door, keeperRt.arrival.door);
const pending = { feed: false, clean: false }, delivered = { feed: true, clean: true };
let active: KeeperCare | null = null;
let items: MoveCtx["landItems"] = [];
const next = { x: 0, z: 0 };
const noPeers: readonly Mover[] = [];

// A tiny external store: React only rerenders at start/finish, never every frame.
const listeners = new Set<() => void>();
export const subscribeKeeperCare = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const keeperBusy = () => keeperRt.feed.phase !== "idle" || keeperRt.clean.phase !== "idle" || keeperRt.arrival.phase !== "idle";
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

export function startKeeperClean(model: Model): boolean {
  if (keeperBusy() || pending.feed || pending.clean) return false;
  keeperRt.clean.phase = "montage"; keeperRt.clean.elapsed = 0; keeperRt.clean.frame = 0;
  keeperRt.clean.startClean = tankAt(model, HABITAT_PAD.penguins)?.clean ?? 100;
  active = "clean"; delivered.clean = false;
  changed();
  return true;
}

/** Open the staff door for a bought penguin. One staff-door activity at a time: never during feeding or cleaning. */
export function startArrival(id: string): boolean {
  if (keeperBusy() || pending.feed || pending.clean) return false;
  const a = keeperRt.arrival;
  a.phase = "doorOpening"; a.elapsed = 0; a.door = 0; a.id = id;
  changed();
  return true;
}

/**
 * The door half of an arrival (coastRuntime walks the bird). `bird` is where
 * the arriving penguin is: still in the corridor, walking out, clear of the
 * doorway, or gone (sold/preview ended). Returns true once, when it may walk.
 */
export function stepArrival(dt: number, bird: "inside" | "clear" | "gone"): boolean {
  const a = keeperRt.arrival;
  if (a.phase === "idle" || !(dt > 0)) return false;
  a.elapsed += dt;
  if (bird === "gone" && a.phase !== "doorClosing") { a.phase = "doorClosing"; a.elapsed = 0; }
  switch (a.phase) {
    case "doorOpening":
      a.door = Math.min(1, a.elapsed / 0.8);
      if (a.door === 1) { a.phase = "walkOut"; a.elapsed = 0; return true; }
      break;
    case "walkOut":
      // The leaf only closes behind the bird, never on it.
      if (bird !== "inside") { a.phase = "doorClosing"; a.elapsed = 0; }
      break;
    case "doorClosing":
      a.door = Math.max(0, 1 - a.elapsed / 0.8);
      if (a.door === 0) { a.phase = "idle"; a.elapsed = 0; a.id = null; changed(); }
      break;
  }
  return false;
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
  const a = keeperRt.arrival;
  a.phase = "idle"; a.elapsed = 0; a.door = 0; a.id = null;
  active = null;
  changed();
}
export function resetKeepers() {
  pending.feed = pending.clean = false; delivered.feed = delivered.clean = true;
  resetPresentation();
}
