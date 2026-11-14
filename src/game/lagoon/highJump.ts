import { CRANE, CRANE_REACH, CRANE_YAW, LAGOON_DOMAIN } from "../data/lagoon";
import type { Pod, Swimmer, TargetLeap } from "../marine/pod";

/**
 * The High Jump attraction (Toys → High Jump), runtime only and never saved.
 * The crane swings its jib out over open water and lowers a padded buoy; an
 * adult dolphin swims to the start of a clear run-up lane, dives a little
 * deeper, sprints up and leaps so that its snout touches the buoy at the top
 * of the jump (pod.targetLeap solves the flight from the real take-off point);
 * the buoy swings, the dolphin re-enters with a big splash, and the crane parks
 * again. One at a time, always replayable; other dolphins keep out of the lane.
 */

export type JumpPhase = "idle" | "deploy" | "approach" | "run" | "air" | "splash" | "stow";
export type JumpEvent = "ready" | "launch" | "touch" | "done" | "cancel";

export const JUMP_TIMES = { slew: 2.2, lower: 1.6, raise: 1.4, settle: 2.4, wait: 25, approach: 30 } as const;
/** The snout aims just under the buoy's bottom, so it touches it without passing into it. */
export const BUOY_AIM_Y = CRANE.buoy.y - CRANE.buoy.r * 0.92;
/** Cable from the jib trolley to the buoy's top when lowered; reeled in to `CABLE_PARKED`. */
export const CABLE_DOWN = CRANE.jibY - 0.2 - CRANE.buoy.y - CRANE.buoy.r;
export const CABLE_PARKED = 0.55;

const T = CRANE.buoy;
/** Run-up geometry: approach point, run start and landing distances along the lane (m from the buoy). */
const LANE = { approach: 15.5, start: 11, landing: 4.5 } as const;
/** Lane headings to try, best for the Deck view first (across it, mast kept to one side). */
const LANE_YAWS = [-2.2, -2.55, -1.85, Math.PI, 2.6, 0.95];

export interface Lane { yaw: number; p0: { x: number; z: number }; p1: { x: number; z: number }; land: { x: number; z: number } }

export const jumpRt = {
  phase: "idle" as JumpPhase,
  /** Seconds in the current phase. */
  t: 0,
  /** Crane presentation: 0 parked … 1 jib over the water; 0 buoy reeled up … 1 lowered. */
  slew: 0,
  drop: 0,
  /** Buoy pendulum (angle along the lane, rad, and its rate). */
  swing: 0,
  swingV: 0,
  id: null as string | null,
  stage: 0,
  retries: 0,
  lane: null as Lane | null,
  plan: null as TargetLeap | null,
  touched: false,
  touchAt: -100,
  keepAwayAt: 0,
  /** Counters for tests and review. */
  jumps: 0,
  touches: 0,
  cancels: 0,
  /** Closest the snout came to the buoy centre during the last flight (m). */
  closest: Infinity
};

export const highJumpActive = () => jumpRt.phase !== "idle";
/** The Deck view's temporary framing holds from the jib swinging out until the splash settles. */
export const highJumpFraming = () => jumpRt.phase !== "idle" && jumpRt.phase !== "stow";

const scratch = { x: 0, y: 0, z: 0 };
const ease = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };

/** Is this water deep and open enough along a straight run (domain distance, depth)? */
function clearRun(a: { x: number; z: number }, b: { x: number; z: number }, margin: number) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
  for (let i = 0; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    if (LAGOON_DOMAIN.inside(x, z) < margin || LAGOON_DOMAIN.floor(x, z) > -3) return false;
  }
  return true;
}

/** The first lane whose approach, run, flight and landing are all over deep, open water clear of structures. */
export function chooseLane(airClear: (x: number, z: number) => boolean): Lane | null {
  for (const yaw of LANE_YAWS) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const at = (k: number) => ({ x: T.x + fx * k, z: T.z + fz * k });
    const p0 = at(-LANE.approach), p1 = at(-LANE.start), land = at(LANE.landing);
    if (!clearRun(p0, land, 2.4)) continue;
    let air = true;
    for (let k = -3.5; k <= LANE.landing + 0.6 && air; k += 0.4) { const q = at(k); air = airClear(q.x, q.z); }
    if (air) return { yaw, p0, p1, land };
  }
  return null;
}

/** The jib's heading now (parked along the breakwater … deployed over the water). */
export const jibYaw = () => CRANE.parkedYaw + (CRANE_YAW - CRANE.parkedYaw) * ease(jumpRt.slew);
/** Cable length below the trolley now. */
export const cableLength = () => CABLE_PARKED + (CABLE_DOWN - CABLE_PARKED) * ease(jumpRt.drop);

/** The trolley (where the cable leaves the jib) and the buoy centre now (area-local), including its swing. */
export function trolleyPoint(out = { x: 0, y: 0, z: 0 }) {
  const yaw = jibYaw();
  out.x = CRANE.base.x + Math.sin(yaw) * CRANE_REACH;
  out.z = CRANE.base.z + Math.cos(yaw) * CRANE_REACH;
  out.y = CRANE.jibY - 0.2;
  return out;
}
export function buoyPoint(out = { x: 0, y: 0, z: 0 }) {
  trolleyPoint(out);
  const swingYaw = jumpRt.lane?.yaw ?? jibYaw(), len = cableLength() + CRANE.buoy.r;
  out.x += Math.sin(swingYaw) * Math.sin(jumpRt.swing) * len;
  out.z += Math.cos(swingYaw) * Math.sin(jumpRt.swing) * len;
  out.y -= Math.cos(jumpRt.swing) * len;
  return out;
}

/** The snout tip of a swimmer, as the pod's own leap uses it (pitch along the flight). */
export function snoutTip(m: Swimmer) {
  const reach = m.len * 0.5, c = Math.cos(m.pitch);
  return { x: m.x + Math.sin(m.yaw) * c * reach, y: m.y + Math.sin(m.pitch) * reach, z: m.z + Math.cos(m.yaw) * c * reach };
}

/** Toys → High Jump. Refused (false) while one is already on. */
export function startHighJump(): boolean {
  if (jumpRt.phase !== "idle") return false;
  Object.assign(jumpRt, { phase: "deploy", t: 0, id: null, stage: 0, retries: 0, lane: null, plan: null, touched: false, touchAt: -100, closest: Infinity });
  return true;
}

function setPhase(p: JumpPhase) { jumpRt.phase = p; jumpRt.t = 0; }

function cancel(events: JumpEvent[], pod: Pod) {
  const m = jumpRt.id ? pod.byId(jumpRt.id) : undefined;
  if (m && m.attract?.kind === "point") m.attract = null;
  jumpRt.cancels++;
  events.push("cancel");
  setPhase("stow");
}

/** The adult best placed for the run (closest to the approach point), never a calf or a mother with her calf alongside. */
function pickJumper(pod: Pod, lane: Lane, now: number): Swimmer | null {
  const calves = new Set(pod.members.filter((m) => m.mother).map((m) => m.mother));
  const free = (m: Swimmer) => !m.mother && (m.mode === "swim" || m.mode === "rise" || m.mode === "surface") && now >= m.hold && m.attract?.kind !== "feed";
  const pool = pod.members.filter((m) => free(m) && !calves.has(m.id));
  const list = pool.length ? pool : pod.members.filter(free);
  const d = (m: Swimmer) => Math.hypot(m.x - lane.p0.x, m.z - lane.p0.z);
  return list.sort((a, b) => d(a) - d(b))[0] ?? null;
}

/** Everyone else steers clear of the lane, the flight and the landing while the jump is on. */
function keepAway(pod: Pod, now: number) {
  const lane = jumpRt.lane;
  if (!lane || now < jumpRt.keepAwayAt) return;
  jumpRt.keepAwayAt = now + 0.5;
  const fx = Math.sin(lane.yaw), fz = Math.cos(lane.yaw);
  for (const m of pod.members) {
    if (m.id === jumpRt.id || m.mode === "leap") continue;
    // Distance from the lane segment (run start to landing), and which side it is on.
    const ax = m.x - lane.p1.x, az = m.z - lane.p1.z, len = LANE.start + LANE.landing;
    const along = Math.max(0, Math.min(len, ax * fx + az * fz)), side = ax * fz - az * fx;
    const off = Math.hypot(ax - fx * along, az - fz * along);
    if (off > 5.5) continue;
    const s = side >= 0 ? 1 : -1;
    const want = { x: lane.p1.x + fx * along + fz * s * 8, z: lane.p1.z + fz * along - fx * s * 8 };
    // Keep the escape point in open water.
    for (let i = 0; i < 8 && LAGOON_DOMAIN.inside(want.x, want.z) < 2.5; i++) { want.x += (LAGOON_DOMAIN.centre.x - want.x) * 0.3; want.z += (LAGOON_DOMAIN.centre.z - want.z) * 0.3; }
    pod.attract(m.id, { x: want.x, y: -1.4, z: want.z }, 4, "point");
  }
}

/**
 * Advance the attraction (only while the lagoon is shown). `blocked` pauses
 * the dolphin part (a question or feeding has the pod); the crane still moves.
 */
export function stepHighJump(pod: Pod, dt: number, now: number, airClear: (x: number, z: number) => boolean, blocked: boolean): JumpEvent[] {
  const events: JumpEvent[] = [];
  if (jumpRt.phase === "idle" || !(dt > 0)) return events;
  jumpRt.t += dt;
  // The buoy is a damped pendulum (a little sway after the jib stops, a big one after the touch).
  const cable = CABLE_PARKED + (CABLE_DOWN - CABLE_PARKED) * ease(jumpRt.drop) + CRANE.buoy.r;
  jumpRt.swingV += (-(9.8 / cable) * Math.sin(jumpRt.swing) - 0.55 * jumpRt.swingV) * dt;
  jumpRt.swing += jumpRt.swingV * dt;
  const m = jumpRt.id ? pod.byId(jumpRt.id) : undefined;
  if (jumpRt.phase !== "deploy" && jumpRt.phase !== "stow") keepAway(pod, now);
  switch (jumpRt.phase) {
    case "deploy": {
      jumpRt.slew = Math.min(1, jumpRt.t / JUMP_TIMES.slew);
      if (jumpRt.slew === 1 && jumpRt.drop === 0) jumpRt.swingV += 0.25;
      if (jumpRt.slew === 1) jumpRt.drop = Math.min(1, (jumpRt.t - JUMP_TIMES.slew) / JUMP_TIMES.lower);
      if (jumpRt.drop < 1) break;
      jumpRt.lane ??= chooseLane(airClear);
      if (!jumpRt.lane) { cancel(events, pod); break; }
      if (blocked) { if (jumpRt.t > JUMP_TIMES.slew + JUMP_TIMES.lower + JUMP_TIMES.wait) cancel(events, pod); break; }
      const jumper = pickJumper(pod, jumpRt.lane, now);
      if (!jumper) { if (jumpRt.t > JUMP_TIMES.slew + JUMP_TIMES.lower + JUMP_TIMES.wait) cancel(events, pod); break; }
      jumpRt.id = jumper.id; jumpRt.stage = 0;
      jumper.follow = null;
      pod.attract(jumper.id, { x: jumpRt.lane.p0.x, y: -1.6, z: jumpRt.lane.p0.z }, 20, "point");
      events.push("ready");
      setPhase("approach");
      break;
    }
    case "approach": {
      const lane = jumpRt.lane!;
      if (!m || jumpRt.t > JUMP_TIMES.approach) { cancel(events, pod); break; }
      if (blocked) break;
      const goal = jumpRt.stage === 0 ? lane.p0 : lane.p1;
      const d = Math.hypot(m.x - goal.x, m.z - goal.z);
      if (m.attract?.kind !== "point") pod.attract(m.id, { x: goal.x, y: jumpRt.stage === 0 ? -1.6 : -2.4, z: goal.z }, 14, "point");
      if (jumpRt.stage === 0 && d < 2.6) { jumpRt.stage = 1; pod.attract(m.id, { x: lane.p1.x, y: -2.4, z: lane.p1.z }, 12, "point"); }
      else if (jumpRt.stage === 1 && d < 2.2) {
        const plan: TargetLeap = { tx: T.x, ty: BUOY_AIM_Y, tz: T.z, lead: 2.1, rise: 6, deep: -2.9 };
        if (pod.targetLeap(m.id, plan)) { jumpRt.plan = plan; setPhase("run"); }
      }
      break;
    }
    case "run": {
      if (!m) { cancel(events, pod); break; }
      if (m.mode === "leap" && m.trick?.plan === jumpRt.plan && jumpRt.plan?.launch) {
        jumpRt.jumps++;
        events.push("launch");
        setPhase("air");
        break;
      }
      if (m.trick?.plan !== jumpRt.plan || m.mode !== "charge") {
        // The run-up missed its window (or was interrupted): go round and try again, twice at most.
        jumpRt.plan = null;
        if (++jumpRt.retries > 2) { cancel(events, pod); break; }
        jumpRt.stage = 0;
        pod.attract(m.id, { x: jumpRt.lane!.p0.x, y: -1.6, z: jumpRt.lane!.p0.z }, 20, "point");
        setPhase("approach");
      }
      break;
    }
    case "air": {
      if (!m) { setPhase("splash"); break; }
      const tip = snoutTip(m), b = buoyPoint(scratch);
      const d = Math.hypot(tip.x - b.x, tip.y - b.y, tip.z - b.z);
      jumpRt.closest = Math.min(jumpRt.closest, d);
      if (!jumpRt.touched && d < CRANE.buoy.r + 0.16) {
        jumpRt.touched = true; jumpRt.touchAt = now; jumpRt.touches++;
        // The nudge from below and along the run sets the buoy swinging.
        jumpRt.swingV += 1.15;
        events.push("touch");
      }
      if (m.mode !== "leap") setPhase("splash");
      break;
    }
    case "splash":
      if (jumpRt.t >= JUMP_TIMES.settle) { events.push("done"); setPhase("stow"); }
      break;
    case "stow": {
      if (m && m.attract?.kind === "point" && jumpRt.t < 0.05) m.attract = null;
      jumpRt.drop = Math.max(0, jumpRt.drop - dt / JUMP_TIMES.raise);
      if (jumpRt.drop === 0) jumpRt.slew = Math.max(0, jumpRt.slew - dt / JUMP_TIMES.slew);
      if (jumpRt.drop === 0 && jumpRt.slew === 0) {
        jumpRt.swing = 0; jumpRt.swingV = 0;
        jumpRt.id = null; jumpRt.plan = null; jumpRt.lane = null;
        jumpRt.phase = "idle"; jumpRt.t = 0;
      }
      break;
    }
  }
  return events;
}

/** Leaving the lagoon: the crane parks at once and the dolphin is free (nothing is saved). */
export function resetHighJump() {
  Object.assign(jumpRt, { phase: "idle", t: 0, slew: 0, drop: 0, swing: 0, swingV: 0, id: null, stage: 0, retries: 0, lane: null, plan: null, touched: false, touchAt: -100, keepAwayAt: 0, closest: Infinity, jumps: 0, touches: 0, cancels: 0 });
}
