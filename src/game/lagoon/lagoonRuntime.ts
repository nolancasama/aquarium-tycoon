import { DOLPHINS, type LagoonSight, type LagoonToy } from "../logic/lagoon";
import { Pod, type MemberDef, type PodEvent, type PodOptions } from "../marine/pod";
import { BUBBLE_SPOT, FEED_POINT, LAGOON_DOMAIN, PLATFORM } from "../data/lagoon";

/**
 * The lagoon's live state (runtime only, never saved): the dolphin pod, the
 * toy in the water, the bubble curtain, feeding, and the "Look!" moment on
 * screen. Stepped only while the lagoon is shown. The flow (game/flow/lagoon.ts)
 * turns events into needs, milestones and English.
 */

export const LAGOON_POD: MemberDef[] = DOLPHINS.map((d) => ({ id: d.id, species: "dolphin" as const, size: d.size, mother: d.mother }));
export const LAGOON_POD_OPTIONS: PodOptions = { groupChance: 0.3, pairChance: 0.75, planEvery: [24, 42], leader: "kai" };

/** Toys float for this long, then the care team takes them out. */
export const TOY_SECONDS = 75;
export const BUBBLE_SECONDS = 30;

export interface Toy {
  kind: Exclude<LagoonToy, "bubbles">;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Ball bob after a push (m/s up), and the height. */
  vy: number;
  y: number;
  born: number;
  carriedBy: string | null;
  carryUntil: number;
}

export interface LookMoment {
  kind: LagoonSight;
  ids: string[];
  x: number;
  y: number;
  z: number;
  until: number;
}

export const lagoonRt = {
  pod: null as Pod | null,
  time: 0,
  toy: null as Toy | null,
  bubblesUntil: -1,
  feedT: -100,
  /** The "Look!" bubble shown now (the scene draws and positions it). */
  look: null as LookMoment | null,
  lookReadyAt: 6,
  lastLeap: -100,
  /** Effects for the scene to play (spouts, splashes); drained each frame. */
  fx: [] as PodEvent[],
  /** Plays since the last need gain (the flow rate-limits). */
  plays: 0,
  pairs: 0,
  /** Where the visitors are watching from (set by the viewpoint): curious dolphins come to have a look. */
  watch: null as null | { x: number; y: number; z: number; spread: number }
};

/** The viewpoints' watching spots: in front of the gallery window, below the deck, beside the pontoon. */
export const WATCH_SPOTS = {
  gallery: { x: 9, y: -2.6, z: 7.2, spread: 6.5 },
  deck: { x: -10.5, y: -0.9, z: 3.5, spread: 3.5 },
  // Beside the pontoon (its footprint is out of the water's reach).
  care: { x: 9.5, y: -0.8, z: -3.8, spread: 2 }
} as const;

export function lagoonPod(seed = 7): Pod {
  if (!lagoonRt.pod) lagoonRt.pod = new Pod(LAGOON_DOMAIN, LAGOON_POD, seed, LAGOON_POD_OPTIONS);
  return lagoonRt.pod;
}

/** A toy into the water from the care platform (one at a time; a new one replaces the old). */
export function dropToy(kind: LagoonToy) {
  const t = lagoonRt.time;
  if (kind === "bubbles") {
    lagoonRt.bubblesUntil = t + BUBBLE_SECONDS;
    return;
  }
  lagoonRt.toy = { kind, x: PLATFORM.x - PLATFORM.w / 2 - 1.2, z: PLATFORM.z + 0.6, vx: -1.4, vz: 0.3, vy: 0, y: 0, born: t, carriedBy: null, carryUntil: 0 };
}

/** Feeding: the keeper throws fish from the pontoon; the pod comes to its lagoon side. */
export function feedPod() {
  const pod = lagoonPod();
  lagoonRt.feedT = lagoonRt.time;
  pod.members.forEach((m, i) => pod.attract(m.id, { x: FEED_POINT.x - (i % 2) * 1.4, y: FEED_POINT.y, z: FEED_POINT.z + (i - 1.5) * 1.3 }, 10, "feed"));
}

const domain = LAGOON_DOMAIN;

function stepToy(dt: number) {
  const toy = lagoonRt.toy;
  const pod = lagoonRt.pod!;
  if (!toy) return;
  if (lagoonRt.time - toy.born > TOY_SECONDS) { lagoonRt.toy = null; return; }
  if (toy.carriedBy) {
    // Kelp draped over a dolphin's fin: it travels with the dolphin for a while.
    const c = pod.byId(toy.carriedBy);
    if (!c || lagoonRt.time > toy.carryUntil) { toy.carriedBy = null; }
    else { toy.x = c.x + Math.sin(c.yaw) * c.len * 0.1; toy.z = c.z + Math.cos(c.yaw) * c.len * 0.1; toy.y = Math.min(0, c.y + 0.25); return; }
  }
  toy.x += toy.vx * dt;
  toy.z += toy.vz * dt;
  const damp = Math.exp(-dt * 0.55);
  toy.vx *= damp;
  toy.vz *= damp;
  toy.vy -= 9.8 * dt;
  toy.y = Math.max(0, toy.y + toy.vy * dt);
  if (toy.y === 0) toy.vy = 0;
  // Keep it in open water (a push toward a shore bounces back).
  if (domain.inside(toy.x, toy.z) < 1.6) {
    const back = Math.atan2(domain.centre.x - toy.x, domain.centre.z - toy.z);
    const v = Math.max(0.6, Math.hypot(toy.vx, toy.vz));
    toy.vx = Math.sin(back) * v;
    toy.vz = Math.cos(back) * v;
  }
}

/** Every few seconds a dolphin goes to the toy or the bubbles, or passes the visitors. */
let nextInterest = 0;
/** Pass-bys in progress: the points still to swim through, per dolphin. */
const passes = new Map<string, { x: number; y: number; z: number }[]>();

function stepPasses() {
  const pod = lagoonRt.pod!;
  for (const [id, pts] of passes) {
    const m = pod.byId(id);
    if (!m || !m.attract || m.attract.kind !== "point") { passes.delete(id); continue; }
    if (Math.hypot(m.x - pts[0].x, m.z - pts[0].z) < 2.4) {
      pts.shift();
      if (!pts.length) { passes.delete(id); m.attract = null; continue; }
      pod.attract(id, pts[0], 14, "point");
    }
  }
}
let nextWatch = 0;
function interest() {
  const pod = lagoonRt.pod!;
  const t = lagoonRt.time;
  const w = lagoonRt.watch;
  // Curious dolphins: while the visitors watch from a viewpoint, one of them (often with a
  // companion) is always cruising past it, there and back.
  if (w && passes.size === 0 && t >= nextWatch) {
    nextWatch = t + 2.5;
    const can = pod.members.filter((m) => !m.attract && !m.mother && m.mode !== "leap" && m.mode !== "spyhop");
    if (can.length) {
      const m = can[Math.floor(Math.random() * can.length)];
      const side = Math.random() < 0.5 ? -1 : 1, y = w.y + (Math.random() - 0.5) * 0.6;
      const pass = (k: number) => [{ x: w.x + side * w.spread, y, z: w.z + k * 1.3 }, { x: w.x - side * w.spread, y, z: w.z + k * 1.3 }, { x: w.x + side * w.spread * 0.4, y, z: w.z - 2 + k * 1.3 }];
      passes.set(m.id, pass(0));
      pod.attract(m.id, passes.get(m.id)![0], 14, "point");
      const friend = pod.members.find((x) => x !== m && !x.attract && (x.follow?.id === m.id || m.follow?.id === x.id));
      if (friend && !friend.mother) { passes.set(friend.id, pass(1)); pod.attract(friend.id, passes.get(friend.id)![0], 14, "point"); }
    }
  }
  if (t < nextInterest) return;
  nextInterest = t + 4 + Math.random() * 4;
  const busy = new Set(pod.members.filter((m) => m.attract).map((m) => m.id));
  const free = pod.members.filter((m) => !busy.has(m.id) && m.mode === "swim");
  if (!free.length) return;
  const m = free[Math.floor(Math.random() * free.length)];
  if (lagoonRt.toy && !lagoonRt.toy.carriedBy) pod.attract(m.id, { x: lagoonRt.toy.x, y: -0.3, z: lagoonRt.toy.z }, 9, "toy");
  else if (t < lagoonRt.bubblesUntil) {
    // Through the bubble curtain, often two together.
    pod.attract(m.id, { x: BUBBLE_SPOT.x, y: -2.2, z: BUBBLE_SPOT.z }, 8, "bubbles");
    const friend = free.find((x) => x !== m);
    if (friend) pod.attract(friend.id, { x: BUBBLE_SPOT.x + 1.2, y: -1.8, z: BUBBLE_SPOT.z - 0.8 }, 8, "bubbles");
  }
}

/** Advance the lagoon (only while it is shown); returns the pod's events for the flow. */
export function stepLagoonRt(dt: number): PodEvent[] {
  const pod = lagoonPod();
  lagoonRt.time += dt;
  // Keep chasing a moving toy (bubble-curtain visits go to the fixed ring instead).
  const toy = lagoonRt.toy;
  if (toy) for (const m of pod.members) if (m.attract?.kind === "toy") { m.attract.x = toy.x; m.attract.z = toy.z; }
  pod.step(dt);
  stepToy(dt);
  stepPasses();
  interest();
  const events = pod.drain();
  for (const e of events) {
    if (e.kind === "touch") {
      lagoonRt.plays++;
      const m = pod.byId(e.ids[0]);
      const t = lagoonRt.toy;
      if (m && t && Math.hypot(m.x - t.x, m.z - t.z) < m.len) {
        if (t.kind === "kelp" && !t.carriedBy) { t.carriedBy = m.id; t.carryUntil = lagoonRt.time + 6; }
        else { t.vx = Math.sin(m.yaw) * 2.6; t.vz = Math.cos(m.yaw) * 2.6; t.vy = 2.2; }
      }
    }
    if (e.kind === "leap") lagoonRt.lastLeap = lagoonRt.time;
    if (e.kind === "pair") lagoonRt.pairs++;
    if (e.kind === "breathe" || e.kind === "splash" || e.kind === "leap" || e.kind === "dive") lagoonRt.fx.push(e);
  }
  if (lagoonRt.fx.length > 24) lagoonRt.fx.splice(0, lagoonRt.fx.length - 24);
  if (lagoonRt.look && lagoonRt.time > lagoonRt.look.until) lagoonRt.look = null;
  return events;
}

export function clearLagoonRt() {
  lagoonRt.pod = null;
  lagoonRt.time = 0;
  lagoonRt.toy = null;
  lagoonRt.bubblesUntil = -1;
  lagoonRt.feedT = -100;
  lagoonRt.look = null;
  lagoonRt.lookReadyAt = 6;
  lagoonRt.lastLeap = -100;
  lagoonRt.fx = [];
  lagoonRt.plays = 0;
  lagoonRt.pairs = 0;
  lagoonRt.watch = null;
  nextInterest = 0;
  nextWatch = 0;
  passes.clear();
}
