import type { Vec2, Vec3 } from "../types";
import { ISLAND_CLEAR, SWIM_MARGIN, type CoastHabitat, type ExhibitDef } from "../data/coast";

/**
 * Semi-aquatic movement (penguins, seals, sea otters). Deterministic and
 * testable: every animal is always in exactly one place kind (the land shelf,
 * an island top, a ramp, a climb between island and water, or the water
 * volume). Bodies only travel in straight segments that were checked clear of
 * rocks before they started, so nothing passes through rock, walks under water
 * or appears below the ground, and a change between land and water is always a
 * visible ramp walk, climb or hop, never a jump cut.
 *
 * Positions are exhibit-local (see data/coast.ts). The scene turns `mode`,
 * `speed`, `pitch` and `action` into poses.
 */

export type CoastSpecies = "penguin" | "seal" | "otter";
export const SPECIES_OF: Record<CoastHabitat, CoastSpecies> = { penguins: "penguin", seals: "seal", otters: "otter" };

export type MoveMode =
  /** On land or an island, standing or lying still. */
  | "rest"
  /** Walking (penguin waddle, seal galumph, otter lope) across the land shelf. */
  | "walk"
  /** Down a ramp into the water, or up it out of the water. */
  | "rampDown" | "rampUp"
  /** From the water up onto an island's top, or off it into the water. */
  | "climb" | "hop"
  /** Under water (or along the surface for otters). */
  | "swim"
  /** Head at the surface to breathe. */
  | "breathe"
  /** Otters: floating on the back at the surface. */
  | "float";

export type Area = "land" | "island" | "water";

export interface Mover {
  id: string;
  species: CoastSpecies;
  /** Exhibit-local position (m) and the body's heading (rotation.y; the model faces +z) and pitch (nose up +). */
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: MoveMode;
  area: Area;
  island: number;
  /** Straight-line legs still to travel (exhibit-local, with y). */
  path: Vec3[];
  /** Where a ramp/climb leg started (its progress is measured from here). */
  from: Vec3;
  speed: number;
  /** When the current rest / swim bout / float ends (sim seconds). */
  until: number;
  /** When the swim bout as a whole ends and the animal heads out of the water. */
  boutEnd: number;
  /** Next breath (penguins and seals under water). */
  nextBreath: number;
  /** A cosmetic action the scene can show while resting or floating. */
  action: null | "groom" | "look" | "play" | "eat";
  actionUntil: number;
  /** Animation phase (gait / stroke). */
  phase: number;
  /** rt-free event marks for the scene: last splash time. */
  splashT: number;
  rng: number;
  /** A point to go to (feeding, enrichment); cleared on arrival. */
  attract: Vec3 | null;
  /** The chosen way out of the water, while heading for it. */
  exit?: { at: Vec3; kind: "ramp" | "island"; i: number } | null;
  /** The ramp a walk ends at (then down into the water), or -1. */
  rampNext?: number;
}

export interface MoveCtx {
  time: number;
  /** Item footprints on the land shelf (obstacles; also rest spots). */
  landItems: { x: number; z: number; r: number }[];
  /** A floating enrichment item otters play with, if any. */
  toy: Vec2 | null;
  /** Events: entered or left the water (for milestones and activities). */
  onEvent?: (m: Mover, kind: "enterWater" | "leaveWater" | "breathe" | "dive" | "play") => void;
}

interface Params {
  walk: number;
  swim: number;
  /** Rest on land, swim bout, float (seconds: min, max). */
  rest: [number, number];
  bout: [number, number];
  float: [number, number];
  /** Body length (m): clearance from rocks and the pool sides. */
  body: number;
  /** Chance that a finished rest goes to the water rather than another spot on land. */
  toWater: number;
  /** Height of the body's centre above the ground when standing / lying. */
  stand: number;
}

export const PARAMS: Record<CoastSpecies, Params> = {
  penguin: { walk: 0.42, swim: 1.5, rest: [3, 8], bout: [9, 18], float: [0, 0], body: 0.35, toWater: 0.45, stand: 0 },
  seal: { walk: 0.32, swim: 1.25, rest: [8, 18], bout: [10, 20], float: [0, 0], body: 0.8, toWater: 0.55, stand: 0 },
  otter: { walk: 0.45, swim: 0.85, rest: [6, 12], bout: [6, 12], float: [6, 14], body: 0.6, toWater: 0.75, stand: 0 }
};

/** Fastest any leg can move (m/s): tests use it to prove there is no teleporting. */
export const MAX_SPEED = 1.9;

function rand(m: Mover) {
  m.rng = (m.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(m.rng ^ (m.rng >>> 15), 1 | m.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (m: Mover, [a, b]: [number, number]) => a + (b - a) * rand(m);

export function newMover(id: string, species: CoastSpecies, ex: ExhibitDef, seed: number, time = 0): Mover {
  const m: Mover = {
    id, species, x: 0, y: ex.land.y, z: 0, heading: 0, pitch: 0, mode: "rest", area: "land", island: -1,
    path: [], from: { x: 0, y: 0, z: 0 }, speed: 0, until: time, boutEnd: 0, nextBreath: 0,
    action: null, actionUntil: 0, phase: seed, splashT: -100, rng: seed * 7919 + 13, attract: null
  };
  // Start somewhere sensible: penguins and seals on land, otters floating.
  if (species === "otter") {
    const p = waterPoint(m, ex, true);
    Object.assign(m, { x: p.x, y: p.y, z: p.z, mode: "float", area: "water", until: time + between(m, PARAMS.otter.float) });
  } else {
    const p = landPoint(m, ex, []) ?? { x: (ex.land.minX + ex.land.maxX) / 2, z: (ex.land.minZ + ex.land.maxZ) / 2 };
    Object.assign(m, { x: p.x, z: p.z, until: time + between(m, [0.5, PARAMS[species].rest[1]]) });
  }
  m.heading = rand(m) * Math.PI * 2;
  return m;
}

// ------------------------------------------------------------------ geometry checks

const segDist = (a: Vec2, b: Vec2, c: Vec2) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2));
  return Math.hypot(a.x + dx * t - c.x, a.z + dz * t - c.z);
};

/** The solid under a ramp, as a rectangle (it slopes from the land edge to the waterline). */
export function rampRect(ex: ExhibitDef, i: number) {
  const r = ex.ramps[i];
  return { minX: r.top.x - 0.75, maxX: r.top.x + 0.75, minZ: Math.min(r.top.z, r.bottom.z), maxZ: Math.max(r.top.z, r.bottom.z) - 0.6 };
}

function segHitsRect(a: Vec2, b: Vec2, r: { minX: number; maxX: number; minZ: number; maxZ: number }, pad: number) {
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return true;
  }
  return false;
}

/** A straight swim leg stays inside the pool and clear of islands and ramp bases. */
export function waterLegClear(ex: ExhibitDef, a: Vec2, b: Vec2, body: number): boolean {
  const p = ex.pool, mg = SWIM_MARGIN + body * 0.4;
  for (const q of [a, b]) if (q.x < p.minX + mg || q.x > p.maxX - mg || q.z < p.minZ + mg || q.z > p.maxZ - mg) return false;
  for (const isl of ex.islands) {
    // A leg that starts or ends at the island's climb point (closer than the usual clearance)
    // may not come any closer than that end, and never nearer than its rock plus a hand's width.
    const want = isl.r + ISLAND_CLEAR + body * 0.3;
    const ends = Math.min(Math.hypot(a.x - isl.x, a.z - isl.z), Math.hypot(b.x - isl.x, b.z - isl.z)) - 1e-3;
    if (segDist(a, b, isl) < Math.max(isl.r + 0.3, Math.min(want, ends))) return false;
  }
  for (let i = 0; i < ex.ramps.length; i++) if (segHitsRect(a, b, rampRect(ex, i), body * 0.35)) return false;
  return true;
}

/** A straight land leg stays on the shelf and clear of boulders and items. */
export function landLegClear(ex: ExhibitDef, a: Vec2, b: Vec2, items: { x: number; z: number; r: number }[], body: number): boolean {
  const l = ex.land, mg = 0.3;
  for (const q of [a, b]) if (q.x < l.minX + mg || q.x > l.maxX - mg || q.z < l.minZ + mg || q.z > l.maxZ - 0.1) return false;
  for (const o of [...ex.boulders, ...items]) if (segDist(a, b, o) < o.r + body * 0.45) return false;
  return true;
}

function landPoint(m: Mover, ex: ExhibitDef, items: { x: number; z: number; r: number }[]): Vec2 | null {
  const l = ex.land;
  for (let i = 0; i < 24; i++) {
    const p = { x: l.minX + 0.5 + rand(m) * (l.maxX - l.minX - 1), z: l.minZ + 0.5 + rand(m) * (l.maxZ - l.minZ - 0.7) };
    if ([...ex.boulders, ...items].every((o) => Math.hypot(p.x - o.x, p.z - o.z) > o.r + 0.4)) return p;
  }
  return null;
}

function waterPoint(m: Mover, ex: ExhibitDef, surface: boolean, deepOnly = false): Vec3 {
  const p = ex.pool, mg = SWIM_MARGIN + PARAMS[m.species].body * 0.4 + 0.05;
  for (let i = 0; i < 40; i++) {
    const q = { x: p.minX + mg + rand(m) * (p.maxX - p.minX - 2 * mg), z: p.minZ + mg + rand(m) * (p.maxZ - p.minZ - 2 * mg) };
    if (ex.islands.some((isl) => Math.hypot(q.x - isl.x, q.z - isl.z) < isl.r + ISLAND_CLEAR + 0.4)) continue;
    if (ex.ramps.some((_, k) => segHitsRect(q, q, rampRect(ex, k), 0.4))) continue;
    const top = p.surface - SWIM_MARGIN, bottom = p.floor + SWIM_MARGIN + 0.1;
    const y = surface ? p.surface - 0.06 : deepOnly ? bottom + rand(m) * 0.35 : bottom + rand(m) * (top - bottom);
    return { x: q.x, y, z: q.z };
  }
  return { x: (p.minX + p.maxX) / 2, y: surface ? p.surface - 0.06 : (p.floor + p.surface) / 2, z: p.maxZ - 1 };
}

/** The highest and lowest a swimming body's centre may be. */
export const swimBand = (ex: ExhibitDef) => ({ low: ex.pool.floor + SWIM_MARGIN, high: ex.pool.surface - 0.04 });

// ------------------------------------------------------------------ decisions

function startRest(m: Mover, ctx: MoveCtx) {
  m.mode = "rest";
  m.path = [];
  m.speed = 0;
  m.pitch = 0;
  m.until = ctx.time + between(m, PARAMS[m.species].rest);
  const r = rand(m);
  m.action = r < 0.35 ? "groom" : r < 0.7 ? "look" : null;
  m.actionUntil = ctx.time + 2 + rand(m) * 3;
}

function startSwim(m: Mover, ex: ExhibitDef, ctx: MoveCtx) {
  m.mode = "swim";
  m.area = "water";
  m.boutEnd = ctx.time + between(m, PARAMS[m.species].bout);
  m.nextBreath = ctx.time + 4 + rand(m) * 4;
  nextSwimLeg(m, ex, ctx, m.species !== "otter");
}

function nextSwimLeg(m: Mover, ex: ExhibitDef, _ctx: MoveCtx, deep: boolean) {
  const body = PARAMS[m.species].body;
  for (let i = 0; i < 30; i++) {
    const want = m.species === "otter" && !deep ? waterPoint(m, ex, true) : waterPoint(m, ex, false, m.species === "otter");
    // Prefer gentle turns: reject sharp ones for the first tries.
    const turn = Math.abs(angleDiff(m.heading, Math.atan2(want.x - m.x, want.z - m.z)));
    if (i < 15 && turn > 1.9) continue;
    if (waterLegClear(ex, m, want, body)) {
      m.path = [want];
      return;
    }
  }
  m.path = [];
}

/** The way out of the water: the nearest ramp bottom or island climb point, reached by a clear leg. */
function leaveWater(m: Mover, ex: ExhibitDef, ctx: MoveCtx): boolean {
  const body = PARAMS[m.species].body;
  const exits: { at: Vec3; kind: "ramp" | "island"; i: number }[] = [
    ...ex.ramps.map((r, i) => ({ at: { x: r.bottom.x, y: ex.pool.surface - 0.06, z: r.bottom.z + 0.15 }, kind: "ramp" as const, i })),
    ...(m.species === "otter" ? [] : ex.islands.map((isl, i) => ({ at: { x: isl.climb.x, y: ex.pool.surface - 0.06, z: isl.climb.z }, kind: "island" as const, i })))
  ].sort(() => rand(m) - 0.5);
  for (const e of exits) {
    if (waterLegClear(ex, m, e.at, body)) {
      m.path = [e.at];
      m.exit = e;
      return true;
    }
    // One stop in open water first, if that clears both legs.
    for (let k = 0; k < 10; k++) {
      const mid = waterPoint(m, ex, false);
      if (waterLegClear(ex, m, mid, body) && waterLegClear(ex, mid, e.at, body)) {
        m.path = [mid, e.at];
        m.exit = e;
        return true;
      }
    }
  }
  void ctx;
  return false;
}


function afterRest(m: Mover, ex: ExhibitDef, ctx: MoveCtx) {
  const p = PARAMS[m.species];
  if (m.area === "island") {
    // Off the island: a hop back into the water at the climb point.
    const isl = ex.islands[m.island];
    m.mode = "hop";
    m.from = { x: m.x, y: m.y, z: m.z };
    m.path = [{ x: isl.climb.x, y: ex.pool.surface - 0.06, z: isl.climb.z }];
    return;
  }
  if (rand(m) < p.toWater && ex.ramps.length) {
    // Walk to a ramp top (clear leg, or via a point straight behind it), then down.
    const r = ex.ramps[Math.floor(rand(m) * ex.ramps.length)];
    const top = { x: r.top.x, y: ex.land.y, z: r.top.z };
    const behind = { x: r.top.x, y: ex.land.y, z: Math.max(ex.land.minZ + 0.6, r.top.z - 1.2) };
    if (landLegClear(ex, m, top, ctx.landItems, p.body)) m.path = [top];
    else if (landLegClear(ex, m, behind, ctx.landItems, p.body) && landLegClear(ex, behind, top, ctx.landItems, p.body)) m.path = [behind, top];
    else { startRest(m, ctx); return; }
    m.mode = "walk";
    m.rampNext = ex.ramps.indexOf(r);
    return;
  }
  for (let i = 0; i < 12; i++) {
    const q = landPoint(m, ex, ctx.landItems);
    if (q && landLegClear(ex, m, q, ctx.landItems, p.body)) {
      m.mode = "walk";
      m.path = [{ x: q.x, y: ex.land.y, z: q.z }];
      m.rampNext = -1;
      return;
    }
  }
  startRest(m, ctx);
}


// ------------------------------------------------------------------ the step

/** Advance one animal by dt seconds. */
export function stepMover(m: Mover, ex: ExhibitDef, dt: number, ctx: MoveCtx) {
  const p = PARAMS[m.species];
  m.phase += dt * (m.speed > 0.05 ? (m.area === "water" ? 6 : 9) : 1.2);
  if (m.action && ctx.time > m.actionUntil) m.action = null;
  switch (m.mode) {
    case "rest": {
      m.speed = 0;
      if (m.attract && m.area === "land") { goToAttract(m, ex, ctx); break; }
      if (ctx.time >= m.until) afterRest(m, ex, ctx);
      break;
    }
    case "walk": {
      if (travel(m, dt, p.walk, true)) {
        if ((m.rampNext ?? -1) >= 0) {
          const r = ex.ramps[m.rampNext!];
          m.mode = "rampDown";
          m.from = { x: m.x, y: m.y, z: m.z };
          m.path = [{ x: r.bottom.x, y: ex.pool.surface - 0.06, z: r.bottom.z }];
          m.rampNext = -1;
        } else {
          if (m.attract) { m.attract = null; m.action = "eat"; m.actionUntil = ctx.time + 3; }
          startRest(m, ctx);
        }
      }
      break;
    }
    case "rampDown":
    case "rampUp": {
      const down = m.mode === "rampDown";
      if (travel(m, dt, p.walk * (down ? 1.3 : 0.9), false)) {
        if (down) {
          m.splashT = ctx.time;
          ctx.onEvent?.(m, "enterWater");
          if (m.species === "otter") { m.mode = "float"; m.area = "water"; m.until = ctx.time + between(m, p.float); }
          else startSwim(m, ex, ctx);
        } else {
          m.area = "land";
          ctx.onEvent?.(m, "leaveWater");
          // Step off the ramp top onto the shelf.
          const q = landPoint(m, ex, ctx.landItems);
          if (q && landLegClear(ex, m, q, ctx.landItems, p.body)) { m.mode = "walk"; m.path = [{ x: q.x, y: ex.land.y, z: q.z }]; m.rampNext = -1; }
          else startRest(m, ctx);
        }
      } else {
        // y follows the ramp's slope between its top and bottom.
        rampHeight(m, ex);
      }
      break;
    }
    case "climb":
    case "hop": {
      const isl = ex.islands[m.island];
      const up = m.mode === "climb";
      if (travel(m, dt, p.walk * 1.4, false)) {
        if (up) { m.area = "island"; m.y = isl.top; ctx.onEvent?.(m, "leaveWater"); startRest(m, ctx); }
        else { m.splashT = ctx.time; ctx.onEvent?.(m, "enterWater"); m.island = -1; startSwim(m, ex, ctx); }
      } else {
        // An arc between the waterline and the island top, a little above both.
        const total = Math.hypot((isl.rest.x - isl.climb.x), (isl.rest.z - isl.climb.z)) || 1;
        const k = Math.min(1, Math.hypot(m.x - isl.climb.x, m.z - isl.climb.z) / total);
        m.y = ex.pool.surface - 0.06 + (isl.top - (ex.pool.surface - 0.06)) * k + Math.sin(k * Math.PI) * 0.25;
      }
      break;
    }
    case "swim": {
      m.area = "water";
      if (m.attract && !m.exit) { swimToAttract(m, ex); }
      if (!m.exit && ctx.time >= m.nextBreath && m.species !== "otter") {
        m.mode = "breathe";
        m.until = 0;
        const up = { x: m.x, y: ex.pool.surface - 0.06, z: m.z };
        m.path = [up];
        ctx.onEvent?.(m, "breathe");
        break;
      }
      if (travel(m, dt, p.swim * (m.exit ? 0.8 : 1), true)) {
        if (m.exit) {
          const e = m.exit;
          m.exit = null;
          if (e.kind === "ramp") {
            const r = ex.ramps[e.i];
            m.mode = "rampUp";
            m.from = { x: m.x, y: m.y, z: m.z };
            m.path = [{ x: r.top.x, y: ex.land.y, z: r.top.z }];
          } else {
            const isl = ex.islands[e.i];
            m.mode = "climb";
            m.island = e.i;
            m.from = { x: m.x, y: m.y, z: m.z };
            m.path = [{ x: isl.rest.x, y: isl.top, z: isl.rest.z }];
          }
          break;
        }
        if (m.attract) { m.attract = null; m.action = "eat"; m.actionUntil = ctx.time + 2.5; }
        if (ctx.time >= m.boutEnd && leaveWater(m, ex, ctx)) break;
        if (m.species === "otter" && rand(m) < 0.5) { m.mode = "float"; m.until = ctx.time + between(m, p.float); m.path = []; break; }
        nextSwimLeg(m, ex, ctx, m.species !== "otter" || rand(m) < 0.4);
        if (m.species === "otter" && m.path[0] && m.path[0].y < ex.pool.surface - 0.5) ctx.onEvent?.(m, "dive");
      }
      break;
    }
    case "breathe": {
      if (m.path.length) { travel(m, dt, p.swim * 0.7, true); break; }
      if (!m.until) m.until = ctx.time + 1.2 + rand(m);
      m.speed = 0;
      if (ctx.time >= m.until) {
        m.mode = "swim";
        m.nextBreath = ctx.time + 5 + rand(m) * 5;
        if (ctx.time >= m.boutEnd && leaveWater(m, ex, ctx)) break;
        nextSwimLeg(m, ex, ctx, true);
        ctx.onEvent?.(m, "dive");
      }
      break;
    }
    case "float": {
      // Drift slowly on the back; groom, or play with a toy if there is one.
      m.area = "water";
      const top = ex.pool.surface - 0.06;
      if (m.y < top - 0.02) {
        // Still coming up from a dive: rise to the surface first, then roll onto the back.
        m.path = [{ x: m.x, y: top, z: m.z }];
        travel(m, dt, p.swim * 0.8, false);
        break;
      }
      m.pitch = 0;
      if (!m.path.length) {
        const q = ctx.toy && rand(m) < 0.35 ? { x: ctx.toy.x + (rand(m) - 0.5) * 0.6, y: ex.pool.surface - 0.06, z: ctx.toy.z + 0.5 } : waterPoint(m, ex, true);
        const drift = { x: m.x + (q.x - m.x) * 0.25, y: ex.pool.surface - 0.06, z: m.z + (q.z - m.z) * 0.25 };
        if (waterLegClear(ex, m, drift, p.body)) m.path = [drift];
        if (ctx.toy && Math.hypot(m.x - ctx.toy.x, m.z - ctx.toy.z) < 1.2) { m.action = "play"; m.actionUntil = ctx.time + 3; ctx.onEvent?.(m, "play"); }
        else if (!m.action && rand(m) < 0.4) { m.action = "groom"; m.actionUntil = ctx.time + 3 + rand(m) * 2; }
      }
      travel(m, dt, 0.18, false);
      m.y = top;
      if (ctx.time >= m.until) {
        if (rand(m) < 0.3 && leaveWater(m, ex, ctx)) { m.mode = "swim"; m.boutEnd = ctx.time; break; }
        m.mode = "swim";
        m.boutEnd = ctx.time + between(m, p.bout);
        nextSwimLeg(m, ex, ctx, rand(m) < 0.5);
        if (m.path[0] && m.path[0].y < ex.pool.surface - 0.5) ctx.onEvent?.(m, "dive");
      }
      break;
    }
  }
}

/** Move along the path at `speed`; returns true when the last point is reached. Turns the heading toward the leg. */
function travel(m: Mover, dt: number, speed: number, steer: boolean): boolean {
  if (!m.path.length) { m.speed = 0; return true; }
  const t = m.path[0];
  const dx = t.x - m.x, dy = t.y - m.y, dz = t.z - m.z;
  const d = Math.hypot(dx, dy, dz);
  const flat = Math.hypot(dx, dz);
  // Ease in: a body accelerates rather than jumping to full speed.
  m.speed += (speed - m.speed) * Math.min(1, dt * 2.5);
  const step = Math.min(m.speed * dt, MAX_SPEED * dt);
  if (flat > 0.02) m.heading = turnToward(m.heading, Math.atan2(dx, dz), dt * (steer ? 3 : 5));
  const wantPitch = m.mode === "swim" || m.mode === "breathe" ? Math.atan2(dy, Math.max(0.05, flat)) * 0.8 : 0;
  m.pitch += (Math.max(-0.9, Math.min(0.9, wantPitch)) - m.pitch) * Math.min(1, dt * 3);
  if (d <= step || d < 1e-4) {
    m.x = t.x; m.y = t.y; m.z = t.z;
    m.path.shift();
    return m.path.length === 0;
  }
  m.x += (dx / d) * step;
  m.y += (dy / d) * step;
  m.z += (dz / d) * step;
  return false;
}

function rampHeight(m: Mover, ex: ExhibitDef) {
  // The nearest ramp: height runs linearly from the land top to the waterline along z.
  let best = ex.ramps[0], bd = Infinity;
  for (const r of ex.ramps) { const d = Math.abs(m.x - r.top.x); if (d < bd) { bd = d; best = r; } }
  const k = Math.max(0, Math.min(1, (m.z - best.top.z) / (best.bottom.z - best.top.z)));
  m.y = ex.land.y + (ex.pool.surface - 0.06 - ex.land.y) * k;
}

function goToAttract(m: Mover, ex: ExhibitDef, ctx: MoveCtx) {
  const a = m.attract!;
  const p = PARAMS[m.species];
  if (landLegClear(ex, m, a, ctx.landItems.filter((o) => Math.hypot(o.x - a.x, o.z - a.z) > 0.9), p.body)) {
    m.mode = "walk";
    m.path = [{ x: a.x, y: ex.land.y, z: a.z }];
    m.rampNext = -1;
  } else m.attract = null;
}

function swimToAttract(m: Mover, ex: ExhibitDef) {
  const a = m.attract!;
  const target = { x: a.x, y: Math.min(a.y, ex.pool.surface - 0.06), z: a.z };
  if (waterLegClear(ex, m, target, PARAMS[m.species].body)) m.path = [target];
  else m.attract = null;
}

export function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const turnToward = (from: number, to: number, k: number) => from + angleDiff(from, to) * Math.min(1, k);

/** Where an animal's body is (a test and activity helper): on land, on an island, or in the water. */
export const isOnRock = (m: Mover) => m.area === "land" || m.area === "island";
