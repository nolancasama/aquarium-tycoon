import type { Vec2, Vec3 } from "../types";
import { ISLAND_CLEAR, rampFootprint, SWIM_MARGIN, type CoastHabitat, type ExhibitDef } from "../data/coast";

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
  /** A short authored hop onto or off a low land resting ledge. */
  | "stepUp" | "stepDown"
  /** Under water (or along the surface for otters). */
  | "swim"
  /** Head at the surface to breathe. */
  | "breathe"
  /** Otters: floating on the back at the surface. */
  | "float";

export type Area = "land" | "island" | "ledge" | "water";

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
  /** Optional authored shelf ledge occupied, or approached at the end of a walk. */
  ledge?: number;
  ledgeNext?: number;
  ledgeRest?: Vec2;
  /** Runtime-only station meal. Other species keep their original decisions. */
  feeding?: { spot: Vec3; station: Vec2; stage: "approach" | "eating"; routed: boolean; bites: number; nextBite: number; until: number };
  /** Time yielding on an obstructed walking leg, used to choose another valid destination. */
  blockedFor?: number;
}

export interface MoveCtx {
  time: number;
  /** Item footprints on the land shelf (obstacles; also rest spots). */
  landItems: { x: number; z: number; r: number }[];
  /** A floating enrichment item otters play with, if any. */
  toy: Vec2 | null;
  /** Optional quiet resting destinations beside placed habitat items. */
  restSpots?: Vec2[];
  /** Same-exhibit peers; reused by the runtime, never constructed during steering. */
  movers?: readonly Mover[];
  /** Events: entered or left the water (for milestones and activities). */
  onEvent?: (m: Mover, kind: "enterWater" | "leaveWater" | "breathe" | "dive" | "play" | "eatFish") => void;
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
/** Conservative visible GLB envelopes, including beak and trailing feet. */
export const PENGUIN_LAND_SEPARATION = 0.9;
export const PENGUIN_SWIM_SEPARATION = 1.3;

function rand(m: Mover) {
  m.rng = (m.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(m.rng ^ (m.rng >>> 15), 1 | m.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (m: Mover, [a, b]: [number, number]) => a + (b - a) * rand(m);

export function newMover(id: string, species: CoastSpecies, ex: ExhibitDef, seed: number, time = 0, landItems: MoveCtx["landItems"] = [], peers: readonly Mover[] = []): Mover {
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
    let p = landPoint(m, ex, landItems);
    for (let i = 0; p && i < 120 && peers.some((q) => Math.hypot(p!.x - q.x, p!.z - q.z) < PENGUIN_LAND_SEPARATION + 0.1); i++) p = landPoint(m, ex, landItems);
    p ??= { x: (ex.land.minX + ex.land.maxX) / 2, z: (ex.land.minZ + ex.land.maxZ) / 2 };
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

/** Animals slide off a ramp's end into open water this far beyond it (and climb back on from there). */
export const RAMP_STEP = 0.45;

const rampFootprints = new WeakMap<ExhibitDef, Vec2[][]>();
function footprints(ex: ExhibitDef) {
  let polygons = rampFootprints.get(ex);
  if (!polygons) { polygons = ex.ramps.map((_, i) => rampFootprint(ex, i)); rampFootprints.set(ex, polygons); }
  return polygons;
}

/** Bounds of the sloping rock base; the actual swimming footprint follows its irregular edges. */
export function rampRect(ex: ExhibitDef, i: number) {
  const points = footprints(ex)[i];
  return { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minZ: Math.min(...points.map((p) => p.z)), maxZ: Math.max(...points.map((p) => p.z)) };
}

function pointInPolygon(p: Vec2, polygon: readonly Vec2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function segHitsPolygon(a: Vec2, b: Vec2, polygon: readonly Vec2[], pad: number) {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const c = polygon[i], d = polygon[(i + 1) % polygon.length];
    const crossA = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const crossB = (b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x);
    const crossC = (d.x - c.x) * (a.z - c.z) - (d.z - c.z) * (a.x - c.x);
    const crossD = (d.x - c.x) * (b.z - c.z) - (d.z - c.z) * (b.x - c.x);
    if (crossA * crossB < 0 && crossC * crossD < 0) return true;
    if (Math.min(segDist(a, b, c), segDist(a, b, d), segDist(c, d, a), segDist(c, d, b)) <= pad + 1e-10) return true;
  }
  return false;
}

/** A straight swim leg stays inside the pool and clear of islands and ramp bases. */
export function waterLegClear(ex: ExhibitDef, a: Vec2, b: Vec2, body: number): boolean {
  const p = ex.pool, mg = SWIM_MARGIN + body * 0.4;
  if (a.x < p.minX + mg || a.x > p.maxX - mg || a.z < p.minZ + mg || a.z > p.maxZ - mg || b.x < p.minX + mg || b.x > p.maxX - mg || b.z < p.minZ + mg || b.z > p.maxZ - mg) return false;
  for (const isl of ex.islands) {
    // A leg that starts or ends at the island's climb point (closer than the usual clearance)
    // may not come any closer than that end, and never nearer than its rock plus a hand's width.
    const want = isl.r + ISLAND_CLEAR + body * 0.3;
    const ends = Math.min(Math.hypot(a.x - isl.x, a.z - isl.z), Math.hypot(b.x - isl.x, b.z - isl.z)) - 1e-3;
    if (segDist(a, b, isl) < Math.max(isl.r + 0.3, Math.min(want, ends))) return false;
  }
  for (const o of ex.swimObstacles ?? []) if (segDist(a, b, o) < o.r + body * 0.45 + 0.12) return false;
  for (const polygon of footprints(ex)) if (segHitsPolygon(a, b, polygon, body * 0.35)) return false;
  return true;
}

/** A straight land leg stays on the shelf and clear of boulders and items. */
export function landLegClear(ex: ExhibitDef, a: Vec2, b: Vec2, items: { x: number; z: number; r: number }[], body: number): boolean {
  const l = ex.land, mg = 0.3;
  if (a.x < l.minX + mg || a.x > l.maxX - mg || a.z < l.minZ + mg || a.z > l.maxZ - 0.1 || b.x < l.minX + mg || b.x > l.maxX - mg || b.z < l.minZ + mg || b.z > l.maxZ - 0.1) return false;
  for (const o of ex.boulders) if (segDist(a, b, o) < o.r + body * 0.45) return false;
  for (const o of ex.ledges ?? []) if (segDist(a, b, o) < o.r + body * 0.45) return false;
  for (const o of items) if (segDist(a, b, o) < o.r + body * 0.45) return false;
  return true;
}

function landPoint(m: Mover, ex: ExhibitDef, items: { x: number; z: number; r: number }[]): Vec2 | null {
  const l = ex.land;
  for (let i = 0; i < 24; i++) {
    const p = { x: l.minX + 0.5 + rand(m) * (l.maxX - l.minX - 1), z: l.minZ + 0.5 + rand(m) * (l.maxZ - l.minZ - 0.7) };
    if ([...ex.boulders, ...(ex.ledges ?? []), ...items].every((o) => Math.hypot(p.x - o.x, p.z - o.z) > o.r + 0.4)) return p;
  }
  return null;
}

function waterPoint(m: Mover, ex: ExhibitDef, surface: boolean, deepOnly = false): Vec3 {
  const p = ex.pool, mg = SWIM_MARGIN + PARAMS[m.species].body * 0.4 + 0.05;
  for (let i = 0; i < 40; i++) {
    const q = { x: p.minX + mg + rand(m) * (p.maxX - p.minX - 2 * mg), z: p.minZ + mg + rand(m) * (p.maxZ - p.minZ - 2 * mg) };
    if (ex.islands.some((isl) => Math.hypot(q.x - isl.x, q.z - isl.z) < isl.r + ISLAND_CLEAR + 0.4)) continue;
    if (ex.swimObstacles?.some((o) => Math.hypot(q.x - o.x, q.z - o.z) < o.r + PARAMS[m.species].body * 0.45 + 0.2)) continue;
    if (footprints(ex).some((polygon) => segHitsPolygon(q, q, polygon, 0.4))) continue;
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
  m.blockedFor = 0;
  m.ledgeNext = -1;
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

/** A crowded landing is a temporary destination: retreat through clear water and retry.
 * Breathing birds keep their ascent, with the vertical part outside the crowd.
 */
function clearCrowdedSwimLeg(m: Mover, ex: ExhibitDef, ctx: MoveCtx) {
  for (let i = 0; i < 60; i++) {
    const q = waterPoint(m, ex, false);
    if (m.mode === "breathe") q.y = m.y;
    if (!waterLegClear(ex, m, q, PARAMS.penguin.body) || !peerStepClear(m, q.x, q.y, q.z, ctx.movers ?? [])) continue;
    const top = { x: q.x, y: ex.pool.surface - 0.06, z: q.z };
    if (m.mode === "breathe" && !peerStepClear(m, top.x, top.y, top.z, ctx.movers ?? [], q)) continue;
    m.path = m.mode === "breathe" ? [q, top] : [q];
    m.exit = null;
    m.blockedFor = 0;
    return;
  }
}

/** Directional lanes continue through both land and water approaches. */
function rampLane(m: Mover, ex: ExhibitDef, i: number, up = false) {
  const r = ex.ramps[i];
  if (m.species !== "penguin" || !r.width) return r.top.x;
  return r.top.x + (up ? 1 : -1) * Math.min(1.05, (r.width - 1.1) / 2);
}

function destinationFree(m: Mover, q: Vec2, ctx: MoveCtx, clearance = PENGUIN_LAND_SEPARATION + 0.12) {
  if (m.species !== "penguin") return true;
  for (const peer of ctx.movers ?? []) {
    if (peer === m) continue;
    if (Math.hypot(peer.x - q.x, peer.z - q.z) < clearance) return false;
    const end = peer.path[peer.path.length - 1];
    if (end && Math.hypot(end.x - q.x, end.z - q.z) < clearance) return false;
  }
  return true;
}

/** The way out of the water: the nearest ramp bottom or island climb point, reached by a clear leg. */
function leaveWater(m: Mover, ex: ExhibitDef, ctx: MoveCtx, rampsOnly = false): boolean {
  const body = PARAMS[m.species].body;
  const exits: { at: Vec3; kind: "ramp" | "island"; i: number }[] = [
    ...ex.ramps.map((r, i) => ({ at: { x: rampLane(m, ex, i, true), y: ex.pool.surface - 0.06, z: r.bottom.z + RAMP_STEP }, kind: "ramp" as const, i })),
    ...(m.species === "otter" || rampsOnly ? [] : ex.islands.map((isl, i) => ({ at: { x: isl.climb.x, y: ex.pool.surface - 0.06, z: isl.climb.z }, kind: "island" as const, i })))
  ].sort(() => rand(m) - 0.5);
  for (const e of exits) {
    // One incoming bird owns the landing until it has climbed clear. Others
    // continue swimming rather than forming a stationary crowd at the toe.
    if (m.species === "penguin" && e.kind === "ramp" && ctx.movers?.some((q) => q !== m &&
      ((q.exit?.kind === "ramp" && q.exit.i === e.i) || (q.mode === "rampUp" && Math.abs(q.x - e.at.x) < 0.2)))) continue;
    // Reserve the whole single-file climb until its occupant is back in open water.
    if (m.species === "penguin" && e.kind === "island" && ctx.movers?.some((q) => q !== m && ((q.exit?.kind === "island" && q.exit.i === e.i) || (q.island === e.i && (q.area === "island" || q.mode === "climb" || q.mode === "hop"))))) continue;
    if (e.kind === "island" && !destinationFree(m, ex.islands[e.i].rest, ctx)) continue;
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
  if (m.area === "ledge") {
    m.mode = "stepDown";
    m.path = ledgePath(ex, m.ledge!, m.ledgeRest).reverse().slice(1);
    return;
  }
  if (m.area === "island") {
    // Off the island: a hop back into the water at the climb point.
    const isl = ex.islands[m.island];
    m.mode = "hop";
    m.from = { x: m.x, y: m.y, z: m.z };
    m.path = [{ x: isl.climb.x, y: ex.pool.surface - 0.06, z: isl.climb.z }];
    return;
  }
  // Authored ledges and quiet item destinations only engage for exhibits defining them.
  if (ex.ledges?.length) {
    if (rand(m) < 0.45) {
      const i = Math.floor(rand(m) * ex.ledges.length), ledge = ex.ledges[i];
      const reserved = ctx.movers?.some((q) => q !== m && (q.ledgeNext === i || (q.ledge === i && (q.area === "ledge" || q.mode === "stepUp" || q.mode === "stepDown"))));
      if (!reserved && destinationFree(m, ledge.rest, ctx, ledge.r + 0.8) && destinationFree(m, ledge.approach, ctx) && landLegClear(ex, m, ledge.approach, ctx.landItems, p.body)) {
        m.mode = "walk";
        m.path = [{ ...ledge.approach, y: ex.land.y }];
        m.rampNext = -1;
        m.ledgeNext = i;
        return;
      }
    }
    if (ctx.restSpots?.length && rand(m) < 0.6) {
      const q = ctx.restSpots[Math.floor(rand(m) * ctx.restSpots.length)];
      if (destinationFree(m, q, ctx) && landLegClear(ex, m, q, ctx.landItems, p.body)) {
        m.mode = "walk";
        m.path = [{ ...q, y: ex.land.y }];
        m.rampNext = -1;
        return;
      }
    }
  }
  if (rand(m) < p.toWater && ex.ramps.length) {
    // Walk to a ramp top (clear leg, or via a point straight behind it), then down.
    const r = ex.ramps[Math.floor(rand(m) * ex.ramps.length)];
    const lane = rampLane(m, ex, ex.ramps.indexOf(r));
    const top = { x: lane, y: ex.land.y, z: r.top.z };
    const behind = { x: lane, y: ex.land.y, z: Math.max(ex.land.minZ + 0.6, r.top.z - 1.2) };
    if (landLegClear(ex, m, top, ctx.landItems, p.body)) m.path = [top];
    else if (landLegClear(ex, m, behind, ctx.landItems, p.body) && landLegClear(ex, behind, top, ctx.landItems, p.body)) m.path = [behind, top];
    else { startRest(m, ctx); return; }
    m.mode = "walk";
    m.rampNext = ex.ramps.indexOf(r);
    return;
  }
  for (let i = 0; i < 12; i++) {
    const q = landPoint(m, ex, ctx.landItems);
    if (q && destinationFree(m, q, ctx) && landLegClear(ex, m, q, ctx.landItems, p.body)) {
      m.mode = "walk";
      m.path = [{ x: q.x, y: ex.land.y, z: q.z }];
      m.rampNext = -1;
      return;
    }
  }
  startRest(m, ctx);
}

/** Sample the small hop once, then travel the actual 3D path at bounded speed. */
function ledgePath(ex: ExhibitDef, i: number, rest = ex.ledges![i].rest): Vec3[] {
  const l = ex.ledges![i];
  return Array.from({ length: 13 }, (_, j) => {
    const k = j / 12;
    return {
      x: l.approach.x + (rest.x - l.approach.x) * k,
      z: l.approach.z + (rest.z - l.approach.z) * k,
      y: ex.land.y + (l.top - ex.land.y) * k + Math.sin(k * Math.PI) * 0.22
    };
  });
}


// ------------------------------------------------------------------ the step

/** Advance one animal by dt seconds. */
export function stepMover(m: Mover, ex: ExhibitDef, dt: number, ctx: MoveCtx) {
  const p = PARAMS[m.species];
  m.phase += dt * (m.speed > 0.05 ? (m.area === "water" ? 6 : 9) : 1.2);
  if (m.action && ctx.time > m.actionUntil) m.action = null;
  if (m.species === "penguin" && !m.feeding && (m.mode === "swim" || m.mode === "breathe") && (m.blockedFor ?? 0) > 1.5) clearCrowdedSwimLeg(m, ex, ctx);
  if (m.feeding) {
    const meal = m.feeding;
    if (meal.stage === "eating") {
      m.mode = "rest"; m.speed = 0; m.pitch = 0; m.action = "eat";
      m.heading = turnToward(m.heading, Math.atan2(meal.station.x - m.x, meal.station.z - m.z), dt * 5);
      if (meal.bites < 3 && ctx.time >= meal.nextBite) {
        meal.bites++; meal.nextBite += 1.05;
        ctx.onEvent?.(m, "eatFish");
      }
      if (ctx.time >= meal.until) { m.feeding = undefined; startRest(m, ctx); }
      return;
    }
    if (m.area === "land" && (m.mode === "rest" || m.mode === "walk") && !meal.routed) {
      const route = stationLandRoute(ex, m, meal.spot, ctx.landItems);
      if (route) {
        m.mode = "walk"; m.path = route; m.rampNext = -1; m.ledgeNext = -1; m.action = null; meal.routed = true;
      }
    } else if ((m.area === "island" || m.area === "ledge") && m.mode === "rest") m.until = ctx.time;
    else if (m.area === "water" && (m.mode === "swim" || m.mode === "breathe") && !m.exit) {
      if (leaveWater(m, ex, ctx, true)) { m.mode = "swim"; m.until = 0; }
    }
  }
  switch (m.mode) {
    case "rest": {
      m.speed = 0;
      if (m.attract && m.area === "land") { goToAttract(m, ex, ctx); break; }
      if (ctx.time >= m.until) afterRest(m, ex, ctx);
      break;
    }
    case "walk": {
      if ((m.blockedFor ?? 0) > 1.5 && !m.feeding) { m.rampNext = -1; startRest(m, ctx); break; }
      if (travel(m, ex, dt, p.walk, true, ctx)) {
        if ((m.ledgeNext ?? -1) >= 0) {
          m.ledge = m.ledgeNext;
          m.ledgeNext = -1;
          m.mode = "stepUp";
          const l = ex.ledges![m.ledge!];
          const hash = [...m.id].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0, 7);
          const angle = hash * 2.399963;
          m.ledgeRest = { x: l.rest.x + Math.sin(angle) * l.r * 0.3, z: l.rest.z + Math.cos(angle) * l.r * 0.3 };
          m.path = ledgePath(ex, m.ledge!, m.ledgeRest).slice(1);
        } else if ((m.rampNext ?? -1) >= 0) {
          const r = ex.ramps[m.rampNext!];
          m.mode = "rampDown";
          m.from = { x: m.x, y: m.y, z: m.z };
          m.path = [{ x: m.x, y: ex.pool.surface - 0.06, z: r.bottom.z }, { x: m.x, y: ex.pool.surface - 0.06, z: r.bottom.z + RAMP_STEP }];
          m.rampNext = -1;
        } else {
          if (m.feeding?.routed) {
            const meal = m.feeding;
            meal.stage = "eating"; meal.nextBite = ctx.time + 0.6; meal.until = ctx.time + 3.9;
            m.mode = "rest"; m.speed = 0; m.action = "eat"; m.actionUntil = meal.until;
            break;
          }
          if (m.attract) { m.attract = null; m.action = "eat"; m.actionUntil = ctx.time + 3; }
          startRest(m, ctx);
        }
      }
      break;
    }
    case "stepUp":
    case "stepDown": {
      const up = m.mode === "stepUp";
      if (travel(m, ex, dt, p.walk * 1.4, true, ctx)) {
        m.area = up ? "ledge" : "land";
        if (!up) m.ledge = -1;
        startRest(m, ctx);
        if (up && m.action === "look") {
          // Resting colonies face the shore instead of staring into the back cliffs.
          m.heading = 0;
        }
      }
      break;
    }
    case "rampDown":
    case "rampUp": {
      const down = m.mode === "rampDown";
      if (travel(m, ex, dt, p.walk * (down ? 1.3 : 0.9), false, ctx)) {
        if (down) {
          if (m.species === "penguin" && !canStreamline(m, ctx)) { m.speed = 0; break; }
          m.splashT = ctx.time;
          ctx.onEvent?.(m, "enterWater");
          if (m.species === "otter") { m.mode = "float"; m.area = "water"; m.until = ctx.time + between(m, p.float); }
          else startSwim(m, ex, ctx);
        } else {
          m.area = "land";
          ctx.onEvent?.(m, "leaveWater");
          if (m.feeding) { startRest(m, ctx); break; }
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
      if (travel(m, ex, dt, p.walk * 1.4, false, ctx)) {
        if (up) { m.area = "island"; m.y = isl.top; ctx.onEvent?.(m, "leaveWater"); startRest(m, ctx); }
        else {
          if (m.species === "penguin" && !canStreamline(m, ctx)) { m.speed = 0; break; }
          m.splashT = ctx.time; ctx.onEvent?.(m, "enterWater"); m.island = -1; startSwim(m, ex, ctx);
        }
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
      if (travel(m, ex, dt, p.swim * (m.exit ? 0.8 : 1), true, ctx)) {
        if (m.exit) {
          const e = m.exit;
          m.exit = null;
          if (e.kind === "ramp") {
            const r = ex.ramps[e.i];
            m.mode = "rampUp";
            m.from = { x: m.x, y: m.y, z: m.z };
            m.path = [{ x: m.x, y: ex.pool.surface - 0.06, z: r.bottom.z }, { x: m.x, y: ex.land.y, z: r.top.z }];
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
      if (m.path.length) { travel(m, ex, dt, p.swim * 0.7, true, ctx); break; }
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
        travel(m, ex, dt, p.swim * 0.8, false, ctx);
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
      travel(m, ex, dt, 0.18, false, ctx);
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

/** A small visibility graph around solid footprints, used only for station trips. */
export function stationLandRoute(ex: ExhibitDef, from: Vec2, to: Vec2, items: MoveCtx["landItems"]): Vec3[] | null {
  const body = PARAMS.penguin.body;
  const clear = (a: Vec2, b: Vec2) => landLegClear(ex, a, b, items, body);
  if (!clear(to, to)) return null;
  if (clear(from, to)) return [{ ...to, y: ex.land.y }];
  const points: Vec2[] = [from, to];
  for (const o of [...ex.boulders, ...(ex.ledges ?? []), ...items]) {
    // Extra clearance keeps the chords between ring points outside the solid.
    const radius = o.r + body * 0.45 + 0.12;
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, q = { x: o.x + Math.cos(a) * radius, z: o.z + Math.sin(a) * radius };
      if (clear(q, q)) points.push(q);
    }
  }
  const dist = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  dist[0] = 0;
  while (visited.size < points.length) {
    let at = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (at < 0 || dist[i] < dist[at])) at = i;
    if (at < 0 || !Number.isFinite(dist[at])) return null;
    if (at === 1) {
      const route: Vec3[] = [];
      for (let i = 1; i !== 0; i = previous[i]) route.unshift({ ...points[i], y: ex.land.y });
      return route;
    }
    visited.add(at);
    for (let i = 1; i < points.length; i++) {
      if (visited.has(i) || !clear(points[at], points[i])) continue;
      const d = dist[at] + Math.hypot(points[at].x - points[i].x, points[at].z - points[i].z);
      if (d < dist[i]) { dist[i] = d; previous[i] = at; }
    }
  }
  return null;
}

/** Distinct safe standing places around the tray; occupied slots stay solid. */
export function stationSpots(ex: ExhibitDef, station: Vec2, count: number, items: MoveCtx["landItems"]): Vec3[] {
  const spots: Vec3[] = [];
  for (const radius of [0.82, 1.12, 1.42, 1.72]) for (let i = 0; i < 24 && spots.length < count; i++) {
    const a = i * Math.PI / 12;
    const q = { x: station.x + Math.sin(a) * radius, z: station.z + Math.cos(a) * radius, y: ex.land.y };
    if (landLegClear(ex, q, q, items, PARAMS.penguin.body) && spots.every((p) => Math.hypot(p.x - q.x, p.z - q.z) >= PENGUIN_LAND_SEPARATION + 0.04)) spots.push(q);
  }
  return spots;
}

/** Move along the path at `speed`; returns true when the last point is reached. Turns the heading toward the leg. */
// Shared scratch points: stepMover is synchronous; steering never allocates per frame.
const proposed = { x: 0, y: 0, z: 0 };

function canStreamline(m: Mover, ctx: MoveCtx) {
  for (const q of ctx.movers ?? []) if (q !== m && (q.mode === "swim" || q.mode === "breathe") && Math.hypot(m.x - q.x, m.y - q.y, m.z - q.z) < PENGUIN_SWIM_SEPARATION) return false;
  return true;
}

/** Segment against every peer's visible envelope, including the space between samples. */
function peerStepClear(m: Mover, x: number, y: number, z: number, peers: readonly Mover[], from: Vec3 = m) {
  for (const q of peers) {
    if (q === m || q.species !== "penguin") continue;
    const water = m.mode === "swim" || m.mode === "breathe" || q.mode === "swim" || q.mode === "breathe";
    if (!water && Math.abs(m.y - q.y) > 0.8) continue;
    const gap = water ? PENGUIN_SWIM_SEPARATION : PENGUIN_LAND_SEPARATION;
    const dx = x - from.x, dy = water ? y - from.y : 0, dz = z - from.z;
    const ax = from.x - q.x, ay = water ? from.y - q.y : 0, az = from.z - q.z;
    const along = Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / (dx * dx + dy * dy + dz * dz || 1)));
    const closest = Math.hypot(ax + dx * along, ay + dy * along, az + dz * along);
    // Existing intersections (e.g. an external harness placing birds) may only separate.
    if (closest < gap - 1e-7 && closest < Math.min(gap, Math.hypot(ax, ay, az)) - 1e-9) return false;
  }
  return true;
}

function travel(m: Mover, ex: ExhibitDef, dt: number, speed: number, steer: boolean, ctx: MoveCtx): boolean {
  if (!m.path.length) { m.speed = 0; return true; }
  const t = m.path[0];
  const dx = t.x - m.x, dy = t.y - m.y, dz = t.z - m.z;
  const d = Math.hypot(dx, dy, dz);
  const flat = Math.hypot(dx, dz);
  if (m.species === "penguin") {
    const swimming = m.mode === "swim" || m.mode === "breathe";
    const freeSteer = swimming || m.mode === "walk";
    const peers = ctx.movers;
    let vx = dx / (d || 1), vy = dy / (d || 1), vz = dz / (d || 1);
    let pace = 1;
    // If the remaining leg already clears bodies, keep it. This is essential around
    // occupied trays: a safe destination must not orbit inside a soft avoidance halo.
    const peerClearLeg = peers ? peerStepClear(m, t.x, t.y, t.z, peers) : true;
    if (freeSteer && peers && !peerClearLeg) for (const q of peers) {
      if (q === m || q.species !== "penguin") continue;
      const water = swimming || q.mode === "swim" || q.mode === "breathe";
      if (!water && Math.abs(q.y - m.y) > 0.8) continue;
      const ax = m.x - q.x, ay = water ? m.y - q.y : 0, az = m.z - q.z;
      const distance = Math.hypot(ax, ay, az), gap = water ? PENGUIN_SWIM_SEPARATION : PENGUIN_LAND_SEPARATION;
      const ahead = -(ax * vx + ay * vy + az * vz);
      if (distance < gap + 1.5 && ahead > -0.1) {
        const strength = Math.max(0, (gap + 1.5 - distance) / 1.5);
        // All birds pass on their right; the convention is stable through head-on approaches.
        const horizontal = Math.hypot(vx, vz) || 1;
        vx += (vz / horizontal * 1.4 + ax / (distance || 1)) * strength;
        vz += (-dx / (d || 1) / horizontal * 1.4 + az / (distance || 1)) * strength;
        if (water) vy += ay / (distance || 1) * strength;
        pace = Math.min(pace, 0.35 + Math.max(0, Math.min(0.65, (distance - gap) / 1.8)));
      }
    }
    const heading = Math.hypot(vx, vz) > 1e-7 ? Math.atan2(vx, vz) : m.heading;
    const pitch = swimming ? Math.atan2(vy, Math.hypot(vx, vz)) : 0;
    if (freeSteer) {
      m.heading += Math.max(-dt * 2.4, Math.min(dt * 2.4, angleDiff(m.heading, heading)));
      m.pitch += Math.max(-dt * 2, Math.min(dt * 2, pitch - m.pitch));
      // Walking also follows its smoothed heading, rather than sliding sideways during turns.
      const cp = Math.cos(m.pitch);
      vx = Math.sin(m.heading) * cp; vy = swimming ? Math.sin(m.pitch) : 0; vz = Math.cos(m.heading) * cp;
      if (Math.abs(angleDiff(m.heading, heading)) > 1 || Math.abs(m.pitch - pitch) > 0.8) pace = 0;
    } else {
      if (flat > 0.02) m.heading = turnToward(m.heading, Math.atan2(dx, dz), dt * 5);
      m.pitch += (0 - m.pitch) * Math.min(1, dt * 5);
    }
    m.speed += (Math.min(speed * pace, d * 2) - m.speed) * Math.min(1, dt * 4);
    let step = Math.min(m.speed * dt, MAX_SPEED * dt, d);
    // An aligned endpoint is reached exactly, without overshooting or orbiting it.
    const end = d < 1e-5 || (d <= step + 1e-6 && (!freeSteer || (Math.abs(angleDiff(m.heading, Math.atan2(dx, dz))) < 0.14 && (!swimming || Math.abs(m.pitch - Math.atan2(dy, flat)) < 0.14))));
    if (end) { vx = dx / (d || 1); vy = dy / (d || 1); vz = dz / (d || 1); step = d; }
    proposed.x = m.x + vx * step; proposed.y = m.y + vy * step; proposed.z = m.z + vz * step;
    let valid = true;
    if (swimming) valid = waterLegClear(ex, m, proposed, PARAMS.penguin.body) && waterLegClear(ex, proposed, t, PARAMS.penguin.body) && proposed.y >= ex.pool.floor + SWIM_MARGIN && proposed.y <= ex.pool.surface - 0.04;
    else if (m.mode === "walk") valid = landLegClear(ex, m, proposed, ctx.landItems, PARAMS.penguin.body) && landLegClear(ex, proposed, t, ctx.landItems, PARAMS.penguin.body);
    if (!valid || (peers && !peerStepClear(m, proposed.x, proposed.y, proposed.z, peers))) {
      // Yield in place; never project a body out of a wall or teleport it away from a peer.
      m.speed = 0;
      m.blockedFor = (m.blockedFor ?? 0) + dt;
      if (!valid && freeSteer) {
        const wantHeading = flat > 1e-7 ? Math.atan2(dx, dz) : m.heading;
        m.heading += Math.max(-dt * 2.4, Math.min(dt * 2.4, angleDiff(m.heading, wantHeading)));
        if (swimming) m.pitch += Math.max(-dt * 2, Math.min(dt * 2, Math.atan2(dy, flat) - m.pitch));
      }
      return false;
    }
    if (step > 1e-9 && swimming) {
      if (Math.hypot(vx, vz) > 1e-7) m.heading = Math.atan2(vx, vz);
      m.pitch = Math.atan2(vy, Math.hypot(vx, vz));
    }
    m.x = proposed.x; m.y = proposed.y; m.z = proposed.z;
    m.blockedFor = 0;
    if (end || d < 1e-5) { m.path.shift(); return m.path.length === 0; }
    return false;
  }
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
export const isOnRock = (m: Mover) => m.area === "land" || m.area === "island" || m.area === "ledge";
