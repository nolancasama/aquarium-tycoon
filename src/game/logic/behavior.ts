import type { SpeciesDef } from "../data/fish";
import type { TankDef } from "../data/tanks";
import { clampToBounds, floorAt, frontAt, stepSwim, type SwimEnv, type SwimState } from "./swim";
import { jellyPulseStyle } from "./motion";
import { collideEelBody, createEelBody, deformEelVertex, eelBounds, eelDenRail, eelFloor, eelRandom, recordEelHead, resetEelHistory, steerEelHead, updateEelRig, type EelBody } from "./eelBody";
import { createOctopusRig, octopusTap, updateOctopusRig, type OctopusRig } from "./octopusRig";

/** Followers only; the caller's SwimState is always the school's leader. */
export interface SchoolMember extends SwimState { ox: number; oy: number; oz: number }
export interface BehaviorState {
  eel?: EelBody;
  octopus?: OctopusRig;
  members?: SchoolMember[];
  mode?: "rest" | "move" | "climb" | "cruise" | "return";
  modeTimer?: number;
  denIndex?: number;
  colourPhase?: number;
  pulsePhase?: number;
  /** Signed turn lean, in radians, used by the ray renderer. */
  bank?: number;
  /** Last tap reacted to; presentation runtime only. */
  reactedTapT0?: number;
  /** Runtime-only den approach and the small remainder blended onto its rail. */
  eelReturnTime?: number;
  eelEntryX?: number;
  eelEntryY?: number;
  eelEntryQ?: number;
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

/** Consume the existing tap timestamp once, without changing input or saves. */
export function reactToAnimalTap(s: SwimState, state: BehaviorState, tapT0: number, now: number): void {
  if (tapT0 < 0 || tapT0 === state.reactedTapT0 || now - tapT0 > 0.3 || now < tapT0) return;
  state.reactedTapT0 = tapT0;
  s.burst = Math.max(s.burst, 0.55);
  s.wait = 0;
  if (state.octopus) octopusTap(state.octopus);
}

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
    const speed = env.show ? Math.max(0.5, def.speed * env.speedMul) : def.speed * env.speedMul * (def.movement === "perch" ? 1.8 : 1) * (s.burst > 0 ? 1.8 : 1);
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
  // The rig's planted arms set the pace: the body is pulled while they grip and
  // waits while they reach, instead of sliding. A visitor's show keeps it brisk.
  const rig = state.octopus ?? (state.octopus = createOctopusRig(s, env.phase ?? 0));
  const speed = env.show ? Math.max(0.5, def.speed * env.speedMul) * Math.max(0.6, rig.pull) : def.speed * env.speedMul * rig.pull * (s.burst > 0 ? 1.6 : 1);
  state.colourPhase = ((state.colourPhase ?? env.phase ?? 0) + dt * 0.35) % TAU;
  if (state.mode === undefined) { ground(s, def, env); state.mode = "rest"; state.modeTimer = duration(def, rand); }
  if (env.attract) {
    s.tx = env.attract.x; s.tz = env.attract.z; s.ty = env.bounds.min.y;
    project(s, env, def.radius); state.mode = "move";
  } else if (state.mode === "rest") {
    stop(s); state.modeTimer = (state.modeTimer ?? 0) - dt;
    if (state.modeTimer <= 0 || s.burst > 0) {
      groundTarget(s, def, env, rand, false);
      if (env.tank.dens?.length && rand() < 0.55) {
        // Investigate a real den's lip, on the accessible side of rockwork.
        const den = env.tank.dens[Math.floor(rand() * env.tank.dens.length)];
        s.tx = den.x; s.tz = env.bounds.min.z;
        s.ty = den.y + def.radius;
        project(s, env, def.radius);
      } else if (env.columns.length && rand() < 0.5) {
        const rock = env.columns[Math.floor(rand() * env.columns.length)];
        const angle = rand() * TAU;
        s.tx = rock.x + Math.cos(angle) * (rock.r + def.radius * 0.7);
        s.tz = rock.z + Math.sin(angle) * (rock.r + def.radius * 0.7);
        s.ty = env.bounds.min.y;
        project(s, env, def.radius);
      } else if (rand() < 0.65) {
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
  updateOctopusRig(rig, s, env.tank, env.columns, env.bounds, dt, state.mode !== "rest", s.y > env.bounds.min.y + 0.015 && Math.abs(s.z - env.bounds.min.z) < 0.03);
}

function stepDen(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number, rand: () => number): void {
  // Eel choices use a runtime-local generator so this rebuild consumes no new
  // draws from another species' shared simulation random sequence.
  void rand;
  state.denIndex = env.denIndex ?? state.denIndex ?? 0;
  const index = state.denIndex, tank = env.tank, den = tank.dens?.[index];
  const body = state.eel ?? (state.eel = createEelBody(s, env.phase ?? index));
  body.den = den;
  body.phase += dt;
  const bounds = body.bounds ?? (body.bounds = eelBounds(tank));
  const homeX = den?.x ?? (-0.1 + (index - (tank.dens?.length ?? 0)) * 0.5);
  const peek = 0.16 + 0.03 * Math.sin(body.phase * 0.27);
  const homeZ = den ? den.z + peek : 0.39;
  let homeY = den?.y ?? eelFloor(tank, homeX, homeZ);
  if (!den) for (let i = 1; i < 16; i++) homeY = Math.max(homeY, eelFloor(tank, homeX - i * def.length / 15, homeZ));
  if (state.mode === undefined) {
    s.x = s.tx = homeX; s.y = s.ty = homeY; s.z = s.tz = homeZ;
    body.yaw = den ? Math.PI / 2 : 0;
    body.railQ = peek;
    resetEelHistory(body, s.x, s.y, s.z, body.yaw, den ? tank : undefined, index, peek);
    state.mode = "rest"; state.modeTimer = 8 + eelRandom(body) * 7; stop(s);
  }
  body.gape = 0.18 + 0.42 * (0.5 + 0.5 * Math.sin(body.phase * 2.7));
  if (state.mode === "rest") {
    s.tx = homeX; s.ty = homeY; s.tz = homeZ;
    if (den) {
      body.railQ = peek;
      s.x = homeX; s.y = homeY; s.z = den.z + body.railQ;
      resetEelHistory(body, s.x, s.y, s.z, Math.PI / 2, tank, index, body.railQ);
    }
    stop(s); body.speed = 0;
    state.modeTimer = (state.modeTimer ?? 0) - dt;
    if (state.modeTimer <= 0 || s.burst > 0 || env.attract) {
      state.mode = "cruise"; state.modeTimer = 6 + eelRandom(body) * 5;
      body.rail = den ? "out" : null; chooseEelTarget(s, body, tank, bounds);
    }
  }
  if (body.rail && den) {
    const ox = s.x, oy = s.y, oz = s.z;
    const rate = Math.max(0.1, def.speed * env.speedMul) * dt;
    body.railQ += body.rail === "enter" ? -rate : rate;
    if (body.rail === "emerge") body.railQ = Math.min(body.railQ, peek);
    eelDenRail(body.point, tank, index, body.railQ);
    if (body.rail === "enter") {
      // Capture on the straight open-water lane, then remove the last lateral
      // millimetres before the body reaches the actual aperture plane.
      // The right mouth's positive-x side neighbours a rock at q=.24. Finish
      // that side's blend in clear water before its narrowest part of the lane.
      const blendEnd = index === 2 && (state.eelEntryX ?? 0) > 0 ? 0.30 : 0.075;
      const blend = clamp((body.railQ - blendEnd) / Math.max(0.001, (state.eelEntryQ ?? 0.2) - blendEnd), 0, 1);
      const smooth = blend * blend * (3 - 2 * blend);
      body.point.x += (state.eelEntryX ?? 0) * smooth;
      body.point.y += (state.eelEntryY ?? 0) * smooth;
    }
    s.x = body.point.x; s.y = body.point.y; s.z = body.point.z;
    s.vx = (s.x - ox) / dt; s.vy = (s.y - oy) / dt; s.vz = (s.z - oz) / dt;
    body.yaw = Math.atan2(s.vz, s.vx); body.pitch = 0; body.speed = Math.hypot(s.vx, s.vz);
    recordEelHead(body, s.x, s.y, s.z, ox, oy, oz);
    if (body.rail === "enter" && body.railQ < -0.76) {
      // All vertices are now behind the dark mouth disc. Reverse the hidden
      // rail before any part of the eel can become visible again.
      body.rail = "emerge"; body.railQ = -0.76;
      eelDenRail(body.point, tank, index, body.railQ);
      s.x = body.point.x; s.y = body.point.y; s.z = body.point.z;
      resetEelHistory(body, s.x, s.y, s.z, 0, tank, index, body.railQ);
    } else if (body.rail === "emerge" && body.railQ >= peek) {
      body.rail = null; state.mode = "rest"; state.modeTimer = 8 + eelRandom(body) * 7;
      stop(s);
    } else if (body.rail === "out" && body.railQ >= 0.27) body.rail = null;
  } else if (state.mode === "cruise") {
    state.modeTimer = (state.modeTimer ?? 0) - dt;
    if (env.attract) {
      s.tx = env.attract.x; s.ty = env.attract.y; s.tz = env.attract.z;
      state.modeTimer = 4;
    } else if (Math.hypot(s.x - s.tx, s.y - s.ty, s.z - s.tz) < 0.065) chooseEelTarget(s, body, tank, bounds);
    if (env.attract && Math.hypot(s.x - s.tx, s.y - s.ty, s.z - s.tz) < 0.04) {
      // Pause at food once reached. Pursuing a stationary point while still
      // swimming would make the minimum-turn-radius head circle around it.
      stop(s); body.speed = 0;
    } else steerEelHead(s, body, tank, env.columns, s.tx, s.ty, s.tz,
      env.show ? 0.35 : def.speed * env.speedMul * (env.attract ? 1.5 : 1), dt);
    if (!env.attract && state.modeTimer <= 0) { state.mode = "return"; body.returning = false; state.eelReturnTime = 0; }
  } else if (state.mode === "return") {
    if (env.attract) { state.mode = "cruise"; state.modeTimer = 4; }
    else if (den) {
      state.eelReturnTime = (state.eelReturnTime ?? 0) + dt;
      const q = s.z - den.z, lateral = Math.hypot(s.x - den.x, s.y - den.y);
      // Begin well outside the face. A point on the axis ahead of the head
      // makes lateral error converge while the bicycle retains its turn radius.
      s.tx = den.x; s.ty = den.y; s.tz = den.z + 0.50;
      if (!body.returning && q > 0.47 && q < 0.63 && lateral < 0.16 && Math.sin(body.yaw) < -0.55) {
        body.returning = true; state.eelReturnTime = 0;
      }
      if (body.returning) {
        s.tz = den.z + Math.max(0.07, q - 0.10);
        // Never continue a failed alignment into the face: circle back through
        // open water to the stand-off and make a fresh approach.
        if (q < 0.17 || (state.eelReturnTime ?? 0) > 9) {
          body.returning = false; state.eelReturnTime = 0; s.tz = den.z + 0.50;
        }
      }
      steerEelHead(s, body, tank, env.columns, s.tx, s.ty, s.tz, def.speed * Math.max(0.7, env.speedMul), dt, !body.returning,
        body.returning ? index : -1, body.returning ? 0.10 : 0);
      const clearEntrySide = index !== 2 || s.x <= den.x || s.z - den.z >= 0.34;
      if (body.returning && clearEntrySide && lateral < 0.012 && q > 0.17 && q < 0.40
        && Math.sin(body.yaw) < -0.94 && Math.abs(body.pitch) < 0.12) {
        body.rail = "enter"; body.railQ = s.z - den.z;
        state.eelEntryX = s.x - den.x; state.eelEntryY = s.y - den.y; state.eelEntryQ = body.railQ;
      }
    } else {
      s.tx = homeX - 0.36; s.ty = homeY; s.tz = homeZ;
      if (!body.returning && s.x < homeX - 0.25 && s.x > homeX - 0.49
        && Math.abs(s.z - homeZ) < 0.22 && Math.cos(body.yaw) > 0.55) {
        body.returning = true; state.eelReturnTime = 0;
      }
      if (body.returning) {
        state.eelReturnTime = (state.eelReturnTime ?? 0) + dt;
        s.tx = s.x + 0.11;
        if (s.x > homeX + 0.025 || (state.eelReturnTime ?? 0) > 8) {
          body.returning = false; state.eelReturnTime = 0; s.tx = homeX - 0.36;
        }
      }
      steerEelHead(s, body, tank, env.columns, s.tx, s.ty, s.tz, def.speed * env.speedMul, dt, true, -1, body.returning ? 0.11 : 0);
      if (Math.hypot(s.x - homeX, s.y - homeY, s.z - homeZ) < 0.025) {
        state.mode = "rest"; state.modeTimer = 8 + eelRandom(body) * 7; stop(s);
      }
    }
  }
  s.burst = Math.max(0, s.burst - dt);
  const waveTarget = den && (body.rail || state.mode === "rest") ? 0 : 1;
  body.wave += clamp(waveTarget - body.wave, -dt * 2, dt * 2);
  updateEelRig(body, s.x, s.y, s.z, body.wave);
  if (den && state.mode === "rest") {
    // The tip looks around without moving the recorded mouth-axis path. The
    // taper ends before the aperture and stays inside its vertical clearance.
    for (let i = 0; i < 3; i++) {
      const taper = (1 - i / 3) ** 2;
      // The rightmost mouth neighbours a permanent rock; look into its open
      // side so the tip cannot consume the head path's small rock clearance.
      const look = index === 2 ? -0.006 * (1 + Math.sin(body.phase * 0.39)) : 0.012 * Math.sin(body.phase * 0.39);
      body.rig[i * 4] += look * taper;
      body.rig[i * 4 + 1] += 0.004 * Math.sin(body.phase * 0.31) * taper;
    }
  }
  collideEelBody(body, tank, env.columns, dt, den ? index : -1);
  deformEelVertex(body.mouth, body.rig, def.length * 0.05, -0.012, 0, 0);
}

function chooseEelTarget(s: SwimState, body: EelBody, tank: BehaviorEnv["tank"], bounds: ReturnType<typeof eelBounds>): void {
  s.tx = bounds.min.x + (bounds.max.x - bounds.min.x) * (0.15 + eelRandom(body) * 0.7);
  s.tz = bounds.min.z + (bounds.max.z - bounds.min.z) * (0.3 + eelRandom(body) * 0.6);
  s.ty = Math.max(eelFloor(tank, s.tx, s.tz), bounds.min.y + eelRandom(body) * 0.35);
}

function stepDrift(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number): void {
  const previous = state.pulsePhase ?? env.phase ?? 0;
  const phase = previous + dt * def.tailHz * TAU;
  state.pulsePhase = phase % TAU;
  const style = jellyPulseStyle(def.id);
  if (env.attract) {
    steer(s, env.attract.x, env.attract.y, env.attract.z, env.show ? Math.max(0.4, def.speed * env.speedMul) : Math.max(0.09, def.speed * 2) * env.speedMul, def.turn * 4, dt);
  } else {
    const r = Math.hypot(s.x, s.z);
    const ring = (env.bounds.round ?? Math.min(env.bounds.max.x - env.bounds.min.x, env.bounds.max.z - env.bounds.min.z) / 2) * 0.62;
    // A weak radial component establishes an orbit even for a jelly starting
    // directly on the axis; tangential flow then carries it around the tank.
    const nx = r > 0.001 ? s.x / r : 1, nz = r > 0.001 ? s.z / r : 0;
    const radial = (ring - r) * 0.25;
    const current = (env.tank.current ?? 0.012) * env.speedMul;
    const k = Math.min(1, dt * 2);
    s.vx += (-nz * current + nx * radial - s.vx) * k;
    s.vz += (nx * current + nz * radial - s.vz) * k;
    const low = env.bounds.min.y + (env.bounds.max.y - env.bounds.min.y) * def.depth[0];
    const high = env.bounds.min.y + (env.bounds.max.y - env.bounds.min.y) * def.depth[1];
    // Thrust coincides with the fast bell contraction, then drag lets the
    // animal sink while the bell slowly refills. No discrete velocity jump.
    const cycle = state.pulsePhase / TAU;
    const thrust = cycle < style.contract ? style.power * Math.sin(cycle / style.contract * Math.PI) : 0;
    s.vy += (thrust * env.speedMul - 0.06 - s.vy * style.drag + (s.y < low ? (low - s.y) * 0.7 : s.y > high ? (high - s.y) * 0.7 : 0)) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  }
  s.burst = Math.max(0, s.burst - dt);
  clampToBounds(s, env.bounds, env.columns, def.radius);
}

/** Pure caller-owned movement: no clock, global state, or per-frame objects. */
export function stepBehavior(s: SwimState, state: BehaviorState, def: SpeciesDef, env: BehaviorEnv, dt: number, rand: () => number): void {
  if (def.movement === "swim") {
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
