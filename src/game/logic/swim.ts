import type { SpeciesDef } from "../data/fish";
import type { Vec3 } from "../types";

/**
 * Fish steering in water-local coordinates: x across the tank (−w/2..w/2),
 * y up from the glass bottom (0..h), z front-to-back (−d/2 back .. d/2 front).
 * Pure: the caller owns the state and the random source, so movement is
 * repeatable in tests. Whatever the inputs, a fish never leaves its bounds.
 */

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** A decoration as a column the fish swim over, not through. */
export interface Column {
  x: number;
  z: number;
  r: number;
  top: number;
}

export interface SwimState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  tx: number;
  ty: number;
  tz: number;
  /** Seconds until a new wander target. */
  wait: number;
  /** Short speed burst left (s). */
  burst: number;
}

export interface SwimEnv {
  bounds: Bounds;
  columns: readonly Column[];
  /** Other fish in the tank (positions). */
  others: readonly { x: number; y: number; z: number }[];
  /** Overall speed multiplier (mood, a waiting request). */
  speedMul: number;
  /** Swim to this point instead of wandering (a pellet, the front glass). */
  attract: { x: number; y: number; z: number } | null;
  /** Shift of the preferred depth band (hungry fish drift up toward the feeding spot). */
  depthBias: number;
}

/** The space a fish's body can occupy without touching glass, sand or the surface. */
export function fishBounds(w: number, d: number, h: number, sand: number, def: Pick<SpeciesDef, "length" | "radius">): Bounds {
  const side = def.length * 0.5 + 0.04;
  return {
    min: { x: -w / 2 + side, y: sand + def.radius + 0.03, z: -d / 2 + side },
    max: { x: w / 2 - side, y: h - def.radius - 0.07, z: d / 2 - side }
  };
}

/** Lowest height a fish may have at (x, z): above the sand and above any decoration under it. */
export function floorAt(x: number, z: number, bounds: Bounds, columns: readonly Column[], radius: number): number {
  let floor = bounds.min.y;
  for (const c of columns) {
    const reach = c.r + radius;
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < reach * reach) floor = Math.max(floor, Math.min(bounds.max.y, c.top + radius));
  }
  return floor;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function clampToBounds(s: SwimState, b: Bounds, columns: readonly Column[], radius: number): void {
  if (s.x < b.min.x || s.x > b.max.x) {
    s.x = clamp(s.x, b.min.x, b.max.x);
    s.vx *= -0.3;
  }
  if (s.z < b.min.z || s.z > b.max.z) {
    s.z = clamp(s.z, b.min.z, b.max.z);
    s.vz *= -0.3;
  }
  const floor = floorAt(s.x, s.z, b, columns, radius);
  if (s.y < floor) {
    s.y = floor;
    if (s.vy < 0) s.vy *= -0.3;
  }
  if (s.y > b.max.y) {
    s.y = b.max.y;
    if (s.vy > 0) s.vy *= -0.3;
  }
}

export function pickTarget(s: SwimState, def: SpeciesDef, env: SwimEnv, rand: () => number): void {
  const b = env.bounds;
  const h = b.max.y - b.min.y;
  const lo = clamp(def.depth[0] + env.depthBias, 0, 1);
  const hi = clamp(def.depth[1] + env.depthBias, lo, 1);
  // Prefer a target across the tank, so fish cruise instead of jittering in place.
  let tx = b.min.x + rand() * (b.max.x - b.min.x);
  if (Math.abs(tx - s.x) < (b.max.x - b.min.x) * 0.25) tx = s.x > 0 ? b.min.x + rand() * (b.max.x - b.min.x) * 0.4 : b.max.x - rand() * (b.max.x - b.min.x) * 0.4;
  s.tx = tx;
  s.tz = b.min.z + rand() * (b.max.z - b.min.z);
  s.ty = Math.max(floorAt(s.tx, s.tz, b, env.columns, def.radius), b.min.y + h * (lo + rand() * (hi - lo)));
  s.wait = def.wander[0] + rand() * (def.wander[1] - def.wander[0]);
  if (def.burst > 0 && rand() < def.burst * 0.5) s.burst = 0.35 + rand() * 0.35;
}

export function newSwimState(def: SpeciesDef, env: SwimEnv, rand: () => number): SwimState {
  const b = env.bounds;
  const s: SwimState = {
    x: b.min.x + rand() * (b.max.x - b.min.x),
    y: b.min.y + (b.max.y - b.min.y) * (0.4 + rand() * 0.4),
    z: b.min.z + rand() * (b.max.z - b.min.z),
    vx: (rand() - 0.5) * 0.1,
    vy: 0,
    vz: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    wait: 0,
    burst: 0
  };
  clampToBounds(s, b, env.columns, def.radius);
  pickTarget(s, def, env, rand);
  return s;
}

/** Advance one fish by dt seconds (mutates `s`). */
export function stepSwim(s: SwimState, def: SpeciesDef, env: SwimEnv, dt: number, rand: () => number): void {
  const step = Math.min(dt, 0.1);
  s.wait -= step;
  s.burst = Math.max(0, s.burst - step);
  let tx = s.tx;
  let ty = s.ty;
  let tz = s.tz;
  if (env.attract) {
    tx = env.attract.x;
    ty = env.attract.y;
    tz = env.attract.z;
  } else {
    const near = Math.hypot(s.tx - s.x, s.ty - s.y, s.tz - s.z) < def.radius * 1.5;
    if (s.wait <= 0 || near) pickTarget(s, def, env, rand);
    tx = s.tx;
    ty = s.ty;
    tz = s.tz;
  }
  const dx = tx - s.x;
  const dy = ty - s.y;
  const dz = tz - s.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  // Ease off when arriving at an attraction point (a pellet) rather than overshooting.
  const arrive = env.attract ? Math.min(1, dist / 0.15) : 1;
  const speed = def.speed * env.speedMul * (1 + (s.burst > 0 ? 1.4 : 0)) * arrive;
  let wx = (dx / dist) * speed;
  let wy = (dy / dist) * speed * 0.6;
  let wz = (dz / dist) * speed;
  // Soft separation from the other fish.
  for (const o of env.others) {
    const ox = s.x - o.x;
    const oy = s.y - o.y;
    const oz = s.z - o.z;
    const d2 = ox * ox + oy * oy + oz * oz;
    const reach = def.radius * 3;
    if (d2 > 1e-6 && d2 < reach * reach) {
      const d = Math.sqrt(d2);
      const push = ((reach - d) / reach) * def.speed * 1.2;
      wx += (ox / d) * push;
      wy += (oy / d) * push * 0.5;
      wz += (oz / d) * push;
    }
  }
  const k = Math.min(1, def.turn * step);
  s.vx += (wx - s.vx) * k;
  s.vy += (wy - s.vy) * k;
  s.vz += (wz - s.vz) * k;
  s.x += s.vx * step;
  s.y += s.vy * step;
  s.z += s.vz * step;
  clampToBounds(s, env.bounds, env.columns, def.radius);
}
