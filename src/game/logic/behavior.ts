import type { SpeciesDef } from "../data/fish";
import type { TankDef } from "../data/tanks";
import { clampToBounds, floorAt, frontAt, pickTarget, stepSwim, type SwimEnv, type SwimState } from "./swim";

/** Followers only; the caller's SwimState is always the school's leader. */
export interface SchoolMember extends SwimState { ox: number; oy: number; oz: number }
export interface BehaviorState {
  members?: SchoolMember[];
  mode?: "rest" | "move" | "climb" | "cruise" | "return";
  modeTimer?: number;
  denIndex?: number;
  colourPhase?: number;
  pulsePhase?: number;
  /** Signed turn lean, in radians, used by the ray renderer. */
  bank?: number;
}
export interface BehaviorEnv extends SwimEnv {
  tank: TankDef;
  show?: boolean;
  denIndex?: number;
  phase?: number;
}

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const duration = (def: SpeciesDef, rand: () => number) => def.wander[0] + rand() * (def.wander[1] - def.wander[0]);

/** Project a target without allocating a temporary point or changing velocity. */
function project(s: SwimState, env: BehaviorEnv, radius: number): void {
  const b = env.bounds;
  s.tx = clamp(s.tx, b.min.x, b.max.x);
  s.tz = clamp(s.tz, b.min.z, frontAt(b, s.tx));
  if (b.round !== undefined) {
    const r = Math.hypot(s.tx, s.tz);
    if (r > b.round) { s.tx *= b.round / r; s.tz *= b.round / r; }
  }
  s.ty = clamp(s.ty, floorAt(s.tx, s.tz, b, env.columns, radius), b.max.y);
}

function steer(s: SwimState, tx: number, ty: number, tz: number, speed: number, turn: number, dt: number): void {
  const dx = tx - s.x, dy = ty - s.y, dz = tz - s.z;
  const d = Math.hypot(dx, dy, dz);
  const gain = Math.min(speed / Math.max(d, 0.07), 6);
  const k = Math.min(1, turn * dt);
  s.vx += (dx * gain - s.vx) * k;
  s.vy += (dy * gain - s.vy) * k;
  s.vz += (dz * gain - s.vz) * k;
  s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
}

function stop(s: SwimState): void { s.vx = 0; s.vy = 0; s.vz = 0; }

function ground(s: SwimState, def: SpeciesDef, env: BehaviorEnv): void {
  clampToBounds(s, env.bounds, env.columns, def.radius);
  s.y = floorAt(s.x, s.z, env.bounds, env.columns, def.radius);
  s.vy = 0;
}

function groundTarget(s: SwimState, def: SpeciesDef, env: BehaviorEnv, rand: () => number, hop: boolean): void {
  if (hop) {
    const angle = rand() * TAU, reach = 0.14 + rand() * 0.22;
    s.tx = s.x + Math.cos(angle) * reach; s.tz = s.z + Math.sin(angle) * reach;
  } else {
    s.tx = env.bounds.min.x + rand() * (env.bounds.max.x - env.bounds.min.x);
    s.tz = env.bounds.min.z + rand() * (frontAt(env.bounds, s.tx) - env.bounds.min.z);
  }
  s.ty = env.bounds.min.y;
  project(s, env, def.radius);
}

function stepGround(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number, rand: () => number): void {
  ground(s, def, env);
  if (state.mode === undefined) { state.mode = "rest"; state.modeTimer = duration(def, rand); }
  if (env.attract) {
    // Feeding points are projected to the sand/column surface. A show target
    // also uses its horizontal coordinates so bottom animals visit the glass.
    s.tx = env.attract.x; s.tz = env.attract.z; s.ty = env.bounds.min.y;
    project(s, env, def.radius); state.mode = "move";
  } else if (state.mode === "rest") {
    state.modeTimer = (state.modeTimer ?? 0) - dt;
    if (state.modeTimer <= 0 || s.burst > 0) {
      groundTarget(s, def, env, rand, def.movement === "perch");
      state.mode = "move";
    }
  }
  if (state.mode === "move") {
    // Perchers make a quick short dart; walkers retain a steady sideways pace.
    const speed = env.show ? Math.max(0.5, def.speed * env.speedMul) : def.speed * env.speedMul * (def.movement === "perch" ? 1.8 : 1);
    steer(s, s.tx, s.y, s.tz, speed, def.turn * 2, dt);
    if (!env.attract && Math.hypot(s.tx - s.x, s.tz - s.z) < 0.025) {
      state.mode = "rest"; state.modeTimer = duration(def, rand); stop(s);
    }
  } else stop(s);
  s.burst = Math.max(0, s.burst - dt);
  ground(s, def, env);
}

function stepSchool(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number, rand: () => number): void {
  if (env.show && env.attract) {
    steer(s, env.attract.x, env.attract.y, env.attract.z, Math.max(0.6, def.speed * env.speedMul), def.turn * 3, dt);
    clampToBounds(s, env.bounds, env.columns, def.radius);
  } else stepSwim(s, def, env, dt, rand);
  if (!state.members) {
    state.members = [];
    for (let i = 1; i < (def.school ?? 1); i++) {
      const angle = i * 2.399963;
      const reach = 0.09 + rand() * 0.07;
      state.members.push({ ...s, ox: Math.cos(angle) * reach, oy: (rand() - 0.5) * 0.09, oz: Math.sin(angle) * reach });
    }
  }
  const heading = Math.atan2(s.vz, s.vx), co = Math.cos(heading), si = Math.sin(heading);
  for (const m of state.members) {
    const spread = env.attract ? 0.4 : 1;
    const tx = s.x + (m.ox * co - m.oz * si) * spread;
    const tz = s.z + (m.ox * si + m.oz * co) * spread;
    let wx = s.vx + (tx - m.x) * 3;
    let wy = s.vy + (s.y + m.oy * spread - m.y) * 3;
    let wz = s.vz + (tz - m.z) * 3;
    for (const other of state.members) {
      if (other === m) continue;
      const dx = m.x - other.x, dy = m.y - other.y, dz = m.z - other.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 0.001 && d < 0.065) {
        const force = (0.065 - d) * 2 / d;
        wx += dx * force; wy += dy * force; wz += dz * force;
      }
    }
    const k = Math.min(1, dt * 5);
    m.vx += (wx - m.vx) * k; m.vy += (wy - m.vy) * k; m.vz += (wz - m.vz) * k;
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    const dx = m.x - s.x, dy = m.y - s.y, dz = m.z - s.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 0.3) { const k = 0.3 / d; m.x = s.x + dx * k; m.y = s.y + dy * k; m.z = s.z + dz * k; }
    clampToBounds(m, env.bounds, env.columns, def.radius);
    // A tall column may lift a follower. Collapse safely onto the leader if
    // that surface projection would break the school's compact envelope.
    if (Math.hypot(m.x - s.x, m.y - s.y, m.z - s.z) > 0.35) {
      m.x = s.x; m.y = s.y; m.z = s.z;
    }
  }
}

function stepCrawl(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number, rand: () => number): void {
  const speed = env.show ? Math.max(0.5, def.speed * env.speedMul) : def.speed * env.speedMul;
  state.colourPhase = ((state.colourPhase ?? env.phase ?? 0) + dt * 0.35) % TAU;
  if (state.mode === undefined) { ground(s, def, env); state.mode = "rest"; state.modeTimer = duration(def, rand); }
  if (env.attract) {
    s.tx = env.attract.x; s.tz = env.attract.z; s.ty = env.bounds.min.y;
    project(s, env, def.radius); state.mode = "move";
  } else if (state.mode === "rest") {
    stop(s); state.modeTimer = (state.modeTimer ?? 0) - dt;
    if (state.modeTimer <= 0 || s.burst > 0) {
      groundTarget(s, def, env, rand, false);
      if (rand() < 0.65) {
        s.tz = env.bounds.min.z;
        s.ty = env.bounds.min.y + (env.bounds.max.y - env.bounds.min.y) * (0.2 + rand() * 0.5);
        project(s, env, def.radius);
      }
      state.mode = "move";
    }
  }
  if (state.mode !== "rest") {
    const floor = floorAt(s.x, s.z, env.bounds, env.columns, def.radius);
    const elevated = s.ty > floorAt(s.tx, s.tz, env.bounds, env.columns, def.radius) + 0.01;
    const atBack = Math.abs(s.z - env.bounds.min.z) < 0.015;
    if (elevated && !atBack) {
      steer(s, s.tx, floor, env.bounds.min.z, speed, def.turn * 3, dt);
      ground(s, def, env);
    } else if (!elevated && s.y > floor + 0.015) {
      // Descend the face before heading across the sand.
      steer(s, s.x, floor, s.z, speed, def.turn * 3, dt);
      state.mode = "climb";
    } else {
      steer(s, s.tx, s.ty, s.tz, speed, def.turn * 3, dt);
      if (elevated) { s.z = env.bounds.min.z; s.vz = 0; state.mode = "climb"; }
      else ground(s, def, env);
    }
    if (!env.attract && Math.hypot(s.tx - s.x, s.ty - s.y, s.tz - s.z) < 0.025) {
      state.mode = "rest"; state.modeTimer = duration(def, rand); stop(s);
    }
  }
  s.burst = Math.max(0, s.burst - dt);
  clampToBounds(s, env.bounds, env.columns, def.radius);
}

/** Den mouths lie inside the back rock. The pickable head stays in the
 * accessible bounds; its long rendered body extends back into that mouth. */
function denTarget(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv): void {
  const dens = env.tank.dens;
  const index = state.denIndex ?? 0;
  const den = dens?.[index];
  const overflow = index - (dens?.length ?? 0);
  s.tx = den?.x ?? (overflow % 2 === 0 ? env.bounds.min.x : env.bounds.max.x - Math.min(0.12, (env.bounds.max.x - env.bounds.min.x) / 4));
  s.ty = den?.y ?? env.bounds.min.y;
  s.tz = den?.z ?? env.bounds.min.z;
  project(s, env, def.radius);
}

function stepDen(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number, rand: () => number): void {
  state.denIndex = env.denIndex ?? state.denIndex ?? 0;
  if (state.mode === undefined) {
    denTarget(s, state, def, env);
    s.x = s.tx; s.y = s.ty; s.z = s.tz;
    state.mode = "rest"; state.modeTimer = 8 + rand() * 7; stop(s);
  }
  if (env.attract) {
    state.mode = "cruise"; state.modeTimer = 3;
    steer(s, env.attract.x, env.attract.y, env.attract.z, env.show ? Math.max(0.5, def.speed * env.speedMul) : def.speed * env.speedMul * 1.5, def.turn * 2, dt);
  } else if (state.mode === "rest") {
    denTarget(s, state, def, env); s.x = s.tx; s.y = s.ty; s.z = s.tz; stop(s);
    state.modeTimer = (state.modeTimer ?? 0) - dt;
    if (state.modeTimer <= 0 || s.burst > 0) {
      state.mode = "cruise"; state.modeTimer = 4 + rand() * 4;
      pickTarget(s, def, env, rand);
    }
  } else if (state.mode === "cruise") {
    state.modeTimer = (state.modeTimer ?? 0) - dt;
    steer(s, s.tx, s.ty, s.tz, def.speed * env.speedMul, def.turn, dt);
    if (state.modeTimer <= 0) { state.mode = "return"; denTarget(s, state, def, env); }
  } else {
    denTarget(s, state, def, env);
    steer(s, s.tx, s.ty, s.tz, def.speed * Math.max(0.5, env.speedMul) * 1.5, def.turn * 2, dt);
    if (Math.hypot(s.tx - s.x, s.ty - s.y, s.tz - s.z) < 0.02) {
      s.x = s.tx; s.y = s.ty; s.z = s.tz; stop(s);
      state.mode = "rest"; state.modeTimer = 8 + rand() * 7;
    }
  }
  s.burst = Math.max(0, s.burst - dt);
  clampToBounds(s, env.bounds, env.columns, def.radius);
}

function stepDrift(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number): void {
  const previous = state.pulsePhase ?? env.phase ?? 0;
  const phase = previous + dt * def.tailHz * TAU;
  state.pulsePhase = phase % TAU;
  if (env.attract) {
    steer(s, env.attract.x, env.attract.y, env.attract.z, env.show ? Math.max(0.4, def.speed * env.speedMul) : Math.max(0.09, def.speed * 2) * env.speedMul, def.turn * 4, dt);
  } else {
    const r = Math.hypot(s.x, s.z);
    const ring = (env.bounds.round ?? (env.bounds.max.x - env.bounds.min.x) / 2) * 0.62;
    // A weak radial component establishes an orbit even for a jelly starting
    // directly on the axis; tangential flow then carries it around the tank.
    const nx = r > 0.001 ? s.x / r : 1, nz = r > 0.001 ? s.z / r : 0;
    const radial = (ring - r) * 0.25;
    const current = (env.tank.current ?? 0) * env.speedMul;
    const k = Math.min(1, dt * 2);
    s.vx += (-nz * current + nx * radial - s.vx) * k;
    s.vz += (nx * current + nz * radial - s.vz) * k;
    const low = env.bounds.min.y + (env.bounds.max.y - env.bounds.min.y) * def.depth[0];
    const high = env.bounds.min.y + (env.bounds.max.y - env.bounds.min.y) * def.depth[1];
    // A brief contraction gives an upward kick; drag and gravity dominate
    // between pulses. A gentle depth restoring force keeps it off the glass.
    if (phase >= TAU) s.vy += 0.045 / def.tailHz;
    s.vy += (-0.04 - s.vy * 1.1 + (s.y < low ? (low - s.y) * 0.7 : s.y > high ? (high - s.y) * 0.7 : 0)) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  }
  s.burst = Math.max(0, s.burst - dt);
  clampToBounds(s, env.bounds, env.columns, def.radius);
}

/** Pure caller-owned movement: no clock, global state, or per-frame objects. */
export function stepBehavior(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number, rand: () => number): void {
  // Preserve both numerical results and random draws for all existing motion.
  if (def.movement === "swim" || (def.movement === "drift" && !env.tank.current)) {
    stepSwim(s, def, env, dt, rand); return;
  }
  const step = Math.min(dt, 0.1);
  switch (def.movement) {
    case "perch": case "walk": stepGround(s, state, def, env, step, rand); break;
    case "school": stepSchool(s, state, def, env, step, rand); break;
    case "crawl": stepCrawl(s, state, def, env, step, rand); break;
    case "den": stepDen(s, state, def, env, step, rand); break;
    case "drift": stepDrift(s, state, def, env, step); break;
    case "glide": {
      const vx = s.vx, vz = s.vz;
      if (env.show && env.attract) {
        steer(s, env.attract.x, env.attract.y, env.attract.z, Math.max(0.5, def.speed * env.speedMul), def.turn * 5, step);
        clampToBounds(s, env.bounds, env.columns, def.radius);
      } else stepSwim(s, def, env, step, rand);
      const floor = floorAt(s.x, s.z, env.bounds, env.columns, def.radius);
      if (!env.attract) s.y = Math.min(s.y, Math.max(floor, env.bounds.min.y + (env.bounds.max.y - env.bounds.min.y) * def.depth[1]));
      const turn = (vx * s.vz - vz * s.vx) / Math.max(0.001, vx * vx + vz * vz);
      state.bank = (state.bank ?? 0) + (clamp(-turn * 4, -0.28, 0.28) - (state.bank ?? 0)) * Math.min(1, step * 3);
      break;
    }
  }
}
