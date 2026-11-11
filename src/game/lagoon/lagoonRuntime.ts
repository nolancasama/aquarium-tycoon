import { DOLPHINS, type LagoonSight, type LagoonToy } from "../logic/lagoon";
import { bodyR, Pod, TRICK_KINDS, type MemberDef, type PodEvent, type PodOptions, type TrickKind } from "../marine/pod";
import { BRIDGE, DECK, LAGOON_DOMAIN, PLATFORM, SEA_GATE } from "../data/lagoon";
import { beginFeeding, createFeeding, feedPose, feedingActive, mouthPoint, stepFeeding } from "./feeding";
import type { Swimmer } from "../marine/pod";
import { publishFeedingTestState } from "./feedingTestState";

/**
 * The lagoon's live state (runtime only, never saved): the dolphin pod, the
 * toy in the water, the bubble curtain, feeding, and the "Look!" moment on
 * screen. Stepped only while the lagoon is shown. The flow (game/flow/lagoon.ts)
 * turns events into needs, milestones and English.
 */

export const LAGOON_POD: MemberDef[] = DOLPHINS.map((d) => ({ id: d.id, species: "dolphin" as const, size: d.size, mother: d.mother }));

/** Air space a jumping dolphin may not cross: the footbridge, the sea gate, the pontoon and the deck. */
export function lagoonAirClear(x: number, z: number): boolean {
  if (Math.abs(x - BRIDGE.x) < 3.5 && z > BRIDGE.z0 - 2 && z < BRIDGE.z1 + 2) return false;
  if (x > SEA_GATE.minX - 2 && x < SEA_GATE.maxX + 2 && z < SEA_GATE.z0 + 2.5) return false;
  if (x > DECK.minX - 1.5 && x < DECK.maxX + 1.5 && z > DECK.minZ - 1.5) return false;
  return Math.hypot(x - PLATFORM.x, z - PLATFORM.z) > PLATFORM.r + 2;
}

export const LAGOON_POD_OPTIONS: PodOptions = { groupChance: 0.3, pairChance: 0.75, planEvery: [24, 42], leader: "kai", tricks: true, airClear: lagoonAirClear };

/** Seconds between spontaneous tricks, pod-wide (the rare surfacing leaps come on top). */
export const TRICK_EVERY: readonly [number, number] = [13, 22];

/**
 * The bubble ring (the bubble-curtain toy): a vertical ring of bubbles in open
 * water, its axis along a clear lane, seen at an angle from the underwater
 * gallery. A pass counts only if the body centre crosses the ring's plane
 * inside the inner radius, nose along the axis.
 */
export const RING = { x: 9, y: -2.6, z: 3, yaw: 0.75, r: 1.05, inner: 0.82 } as const;
const RING_DIR = { x: Math.sin(RING.yaw), z: Math.cos(RING.yaw) };
/** Approach (far, near) and exit points of a pass in direction `side` (+1 along the axis, -1 against). */
export function ringPoints(side: number) {
  const at = (k: number) => ({ x: RING.x + RING_DIR.x * k * side, y: RING.y, z: RING.z + RING_DIR.z * k * side });
  return [at(-7), at(-3.2), at(5)];
}
/** Did a body centred here, heading so, pass through the ring (called at the plane crossing)? */
export function ringPassOk(x: number, y: number, z: number, yaw: number, pitch: number, side: number, bodyRadius: number): boolean {
  const lateral = Math.abs((x - RING.x) * RING_DIR.z - (z - RING.z) * RING_DIR.x);
  const radial = Math.hypot(lateral, y - RING.y);
  const along = Math.cos(yaw - Math.atan2(RING_DIR.x * side, RING_DIR.z * side));
  return radial + bodyRadius < RING.inner && along > 0.9 && Math.abs(pitch) < 0.4;
}

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
  /** Ball play: who nudged it last, who it was passed to, and where the pass comes down. */
  lastBy: string | null;
  passTo: string | null;
  landX: number;
  landZ: number;
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
  feeding: createFeeding(),
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
  watch: null as null | { x: number; y: number; z: number; spread: number },
  /** No spontaneous tricks now (a question holds or counts the dolphins); set by the flow. */
  tricksPaused: false,
  /** Counters for tests and review: tricks started, ball passes (and misses), bubble-ring passes. */
  tricks: 0,
  passes: 0,
  misses: 0,
  ringPasses: 0
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
  lagoonRt.toy = { kind, x: PLATFORM.x - PLATFORM.w / 2 - 1.2, z: PLATFORM.z + 0.6, vx: -1.4, vz: 0.3, vy: 0, y: 0, born: t, carriedBy: null, carryUntil: 0, lastBy: null, passTo: null, landX: 0, landZ: 0 };
}

/** Feeding: the keeper throws fish from the pontoon; the pod comes to its lagoon side. */
export function feedPod() {
  const pod = lagoonPod();
  if (!beginFeeding(lagoonRt.feeding, pod, lagoonRt.time)) return false;
  lagoonRt.feedT = lagoonRt.time;
  passes.clear();
  publishFeedingTestState(feedingSnapshot);
  return true;
}

export const isFeeding = () => feedingActive(lagoonRt.feeding);
export const feedingPose = (id: string) => feedPose(lagoonRt.feeding, id, lagoonRt.time);
export const dolphinMouthPoint = (m: Swimmer, pitch = m.pitch + feedingPose(m.id).pitch) => mouthPoint(m, pitch, feedingPose(m.id).jaw);
/** Leaving the area cancels only the transient coordination and its poses. */
export function resetFeeding() {
  if (lagoonRt.feeding.phase === "idle") return;
  for (const m of lagoonRt.pod?.members ?? []) if (m.attract?.kind === "feed") m.attract = null;
  lagoonRt.feeding = createFeeding();
}
/** A detached read-only copy for preview assertions and review frames. */
export function feedingSnapshot() {
  const f = lagoonRt.feeding;
  return {
    phase: f.phase, elapsed: lagoonRt.time - f.startedAt, phaseElapsed: lagoonRt.time - f.phaseAt,
    participants: [...f.participants], ready: [...f.ready], completed: f.completed, fallback: f.fallback,
    fish: f.fish ? { ...f.fish, from: { ...f.fish.from }, to: { ...f.fish.to } } : null,
    history: f.history.map((h) => ({ ...h }))
  };
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
  const flying = toy.y > 0;
  toy.vy -= 9.8 * dt;
  toy.y = Math.max(0, toy.y + toy.vy * dt);
  if (flying && toy.y === 0) {
    // Down on the water: a small bounce and a splash, then it floats and slows (water drag).
    lagoonRt.fx.push({ kind: "splash", ids: [], x: toy.x, y: 0, z: toy.z, len: 0.9 });
    toy.vy = toy.vy < -2.5 ? -toy.vy * 0.25 : 0;
    toy.vx *= 0.55;
    toy.vz *= 0.55;
    if (toy.vy > 0) toy.y = 0.001;
  } else if (toy.y === 0) toy.vy = 0;
  // Air drag is slight; on the water it drifts to a stop.
  const damp = Math.exp(-dt * (toy.y > 0 ? 0.05 : 0.7));
  toy.vx *= damp;
  toy.vz *= damp;
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
  const toy = lagoonRt.toy;
  if (toy && !toy.carriedBy) {
    // Someone fetches the toy (a missed pass, or nobody playing yet), unless a catcher is already on the way.
    const chasing = pod.members.some((o) => o.attract?.kind === "toy");
    if (!chasing && toy.y === 0) pod.attract(m.id, { x: toy.x, y: -0.3, z: toy.z }, 9, "toy");
  } else if (t < lagoonRt.bubblesUntil && ringRuns.size === 0) {
    // Through the bubble ring, often a second dolphin following.
    const side = trng() < 0.5 ? 1 : -1;
    const adults = free.filter((x) => !x.mother);
    const first = adults[0];
    if (first) {
      startRing(first, side);
      const friend = adults.find((x) => x !== first);
      if (friend && trng() < 0.6) startRing(friend, side);
    }
  }
}

// ------------------------------------------------------------------ tricks: a seeded rhythm, never all at once

let trickSeed = 12345;
/** A small seeded random source for the trick rhythm (repeatable in tests). */
function trng() {
  trickSeed = (trickSeed * 1103515245 + 12345) & 0x7fffffff;
  return trickSeed / 0x7fffffff;
}
let nextTrick = 9;
let lastKind: TrickKind | null = null;

function scheduleTricks() {
  const pod = lagoonRt.pod!, t = lagoonRt.time;
  if (t < nextTrick) return;
  if (lagoonRt.tricksPaused || isFeeding() || pod.members.some((m) => t < m.hold)) { nextTrick = t + 2; return; }
  const kinds = TRICK_KINDS.filter((k) => k !== lastKind);
  const kind = kinds[Math.floor(trng() * kinds.length)];
  const free = pod.members.filter((m) => !m.mother && m.mode === "swim" && !m.attract && !ringRuns.has(m.id));
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(trng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const star = free.find((m) => pod.trick(m.id, kind));
  if (!star) { nextTrick = t + 1.5; return; }
  lastKind = kind;
  lagoonRt.tricks++;
  nextTrick = t + TRICK_EVERY[0] + trng() * (TRICK_EVERY[1] - TRICK_EVERY[0]);
  // A close partner swimming alongside joins in (a synchronised jump); a calf hops beside its mother.
  for (const o of pod.members) {
    if (o.follow?.id !== star.id || o.mode !== "swim" || o.attract) continue;
    const near = Math.hypot(o.x - star.x, o.z - star.z) < 5 && Math.cos(o.yaw - star.yaw) > 0.8;
    if (o.mother && near) pod.trick(o.id, "hop");
    else if (!o.mother && near && trng() < 0.5) pod.trick(o.id, kind);
  }
}

/** Force one trick now (review and tests): the first adult that can start it. */
export function forceTrick(kind: TrickKind): string | null {
  const pod = lagoonPod();
  const m = pod.members.find((x) => !x.mother && pod.trick(x.id, kind));
  if (m) { lagoonRt.tricks++; lastKind = kind; }
  return m?.id ?? null;
}

// ------------------------------------------------------------------ ball play: snout passes between dolphins

const PASS_MISS = 0.25;

/** A dolphin's rostrum tip, where the ball is touched. */
export const snoutOf = (m: Swimmer) => ({ x: m.x + Math.sin(m.yaw) * m.len * 0.5, z: m.z + Math.cos(m.yaw) * m.len * 0.5 });

/** The ball was nudged by this dolphin's snout: a ballistic pass toward a partner (or a miss into open water). */
function passBall(m: Swimmer, toy: Toy) {
  const pod = lagoonRt.pod!;
  const partners = pod.members.filter((o) => o !== m && !o.mother && o.mode !== "leap" && o.mode !== "charge" && (!o.attract || o.attract.kind === "toy"));
  const dist = (o: Swimmer) => Math.hypot(o.x - toy.x, o.z - toy.z);
  // The one who passed it before is the natural partner (back and forth); else the nearest within reach.
  const partner = partners.find((o) => o.id === toy.lastBy && dist(o) < 14) ?? partners.filter((o) => dist(o) > 2.5 && dist(o) < 14).sort((a, b) => dist(a) - dist(b))[0];
  let aim: { x: number; z: number };
  const miss = !partner || trng() < PASS_MISS;
  if (partner) {
    const lead = 1.2;
    aim = { x: partner.x + Math.sin(partner.yaw) * lead, z: partner.z + Math.cos(partner.yaw) * lead };
    if (miss) {
      const a = trng() * Math.PI * 2, r = 1.8 + trng() * 1.2;
      aim = { x: aim.x + Math.cos(a) * r, z: aim.z + Math.sin(a) * r };
    }
  } else aim = { x: toy.x + Math.sin(m.yaw) * 4, z: toy.z + Math.cos(m.yaw) * 4 };
  // Never out of the water: pull a wide pass back toward open water.
  for (let i = 0; i < 8 && domain.inside(aim.x, aim.z) < 2; i++) aim = { x: aim.x + (domain.centre.x - aim.x) * 0.25, z: aim.z + (domain.centre.z - aim.z) * 0.25 };
  const dx = aim.x - toy.x, dz = aim.z - toy.z, d = Math.hypot(dx, dz);
  // A lob: about 0.8 s up and down, a little longer for a long pass.
  const T = Math.min(1.25, Math.max(0.7, d / 8));
  toy.vx = dx / T;
  toy.vz = dz / T;
  toy.vy = 9.8 * T / 2;
  toy.y = 0.02;
  toy.landX = aim.x;
  toy.landZ = aim.z;
  toy.lastBy = m.id;
  toy.passTo = partner && !miss ? partner.id : null;
  lagoonRt.passes++;
  if (miss) lagoonRt.misses++;
  // The receiver swims to where the ball comes down, facing it.
  if (partner) pod.attract(partner.id, { x: aim.x, y: -0.3, z: aim.z }, 9, "toy");
}

// ------------------------------------------------------------------ the bubble ring

/** Ring passes in progress: the stage (0 far approach, 1 near approach, 2 through and out) and the side of the plane. */
const ringRuns = new Map<string, { side: number; stage: number; prev: number }>();

function startRing(m: Swimmer, side: number) {
  ringRuns.set(m.id, { side, stage: 0, prev: -1 });
  lagoonRt.pod!.attract(m.id, ringPoints(side)[0], 14, "point");
}

/** Force a ring pass now (review and tests). */
export function forceRing(side = 1): string | null {
  const pod = lagoonPod();
  if (lagoonRt.time >= lagoonRt.bubblesUntil) dropToy("bubbles");
  const m = pod.members.find((x) => !x.mother && x.mode === "swim" && !ringRuns.has(x.id));
  if (m) startRing(m, side);
  return m?.id ?? null;
}

function stepRings() {
  const pod = lagoonRt.pod!;
  for (const [id, run] of ringRuns) {
    const m = pod.byId(id);
    if (!m || !m.attract || m.attract.kind !== "point" || (run.stage < 2 && lagoonRt.time >= lagoonRt.bubblesUntil)) { ringRuns.delete(id); continue; }
    const pts = ringPoints(run.side), goal = pts[run.stage];
    const d = Math.hypot(m.x - goal.x, m.z - goal.z);
    if (run.stage === 0 && d < 2) { run.stage = 1; pod.attract(id, pts[1], 10, "point"); }
    else if (run.stage === 1 && d < 0.6 && Math.abs(m.y - RING.y) < 0.35) { run.stage = 2; pod.attract(id, pts[2], 8, "point"); }
    else if (run.stage === 2) {
      const axial = ((m.x - RING.x) * RING_DIR.x + (m.z - RING.z) * RING_DIR.z) * run.side;
      if (run.prev < 0 && axial >= 0 && ringPassOk(m.x, m.y, m.z, m.yaw, m.pitch, run.side, bodyR(m))) {
        lagoonRt.ringPasses++;
        lagoonRt.plays++;
        lagoonRt.fx.push({ kind: "ring", ids: [id], x: RING.x, y: RING.y, z: RING.z, len: m.len });
      }
      run.prev = axial;
      if (d < 1.5) { ringRuns.delete(id); m.attract = null; }
    }
  }
}

/** Advance the lagoon (only while it is shown); returns the pod's events for the flow. */
export function stepLagoonRt(dt: number): PodEvent[] {
  publishFeedingTestState(feedingSnapshot);
  const pod = lagoonPod();
  lagoonRt.time += dt;
  // Keep chasing a moving toy: where a pass will come down while it is in the air, else the toy itself.
  const toy = lagoonRt.toy;
  if (toy) for (const m of pod.members) if (m.attract?.kind === "toy") {
    m.attract.x = toy.y > 0 ? toy.landX : toy.x;
    m.attract.z = toy.y > 0 ? toy.landZ : toy.z;
  }
  pod.step(dt);
  stepFeeding(lagoonRt.feeding, pod, lagoonRt.time);
  stepToy(dt);
  stepPasses();
  stepRings();
  interest();
  scheduleTricks();
  const events = pod.drain();
  for (const e of events) {
    if (e.kind === "touch") {
      const m = pod.byId(e.ids[0]);
      const t = lagoonRt.toy;
      if (m && t && t.kind === "ball") {
        const tip = snoutOf(m);
        // Only a ball floating on the water, right at the snout, is nudged; else keep going for it.
        if (t.y === 0 && Math.hypot(tip.x - t.x, tip.z - t.z) < 0.9) { lagoonRt.plays++; passBall(m, t); }
        else pod.attract(m.id, { x: t.x, y: -0.3, z: t.z }, 6, "toy");
      } else if (m && t && Math.hypot(m.x - t.x, m.z - t.z) < m.len) {
        lagoonRt.plays++;
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
  lagoonRt.feeding = createFeeding();
  lagoonRt.look = null;
  lagoonRt.lookReadyAt = 6;
  lagoonRt.lastLeap = -100;
  lagoonRt.fx = [];
  lagoonRt.plays = 0;
  lagoonRt.pairs = 0;
  lagoonRt.watch = null;
  lagoonRt.tricksPaused = false;
  lagoonRt.tricks = 0;
  lagoonRt.passes = 0;
  lagoonRt.misses = 0;
  lagoonRt.ringPasses = 0;
  nextInterest = 0;
  nextWatch = 0;
  nextTrick = 9;
  lastKind = null;
  trickSeed = 12345;
  passes.clear();
  ringRuns.clear();
}
