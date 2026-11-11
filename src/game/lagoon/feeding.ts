import { FEED_POINT, PLATFORM } from "../data/lagoon";
import { surfaceY, type Pod, type Swimmer } from "../marine/pod";

export type FeedingPhase = "idle" | "gathering" | "ready" | "throwing" | "catching" | "finished";
export interface FeedPoint { x: number; y: number; z: number }
export interface FeedFish {
  id: string | null;
  from: FeedPoint;
  to: FeedPoint;
  start: number;
  duration: number;
  arc: number;
  caught: boolean;
}
export interface FeedingState {
  phase: FeedingPhase;
  phaseAt: number;
  startedAt: number;
  participants: string[];
  ready: string[];
  index: number;
  fish: FeedFish | null;
  completed: number;
  fallback: boolean;
  history: { phase: FeedingPhase; at: number }[];
}

export const FEED_GATHER_SECONDS = 9;
export const FEED_THROW_SECONDS = 0.85;
export const FEED_CATCH_SECONDS = 0.85;
const HEAD_LIFT = 0.28;
const OPEN_JAW = 0.4;
export const FEED_FROM: FeedPoint = { x: PLATFORM.x - 1.6, y: PLATFORM.top + 1.4, z: PLATFORM.z + 0.2 };

export function createFeeding(): FeedingState {
  return { phase: "idle", phaseAt: 0, startedAt: -100, participants: [], ready: [], index: 0, fish: null, completed: 0, fallback: false, history: [] };
}

export const feedingActive = (f: FeedingState) => f.phase !== "idle" && f.phase !== "finished";

function enter(f: FeedingState, phase: FeedingPhase, time: number) {
  f.phase = phase;
  f.phaseAt = time;
  f.history.push({ phase, at: time });
}

/** Separate, reachable slots; the calf's slot stays beside its mother's. */
export function feedingSlot(m: Swimmer, index: number): FeedPoint & { facing: number } {
  const x = FEED_POINT.x - 1.6 - (m.mother ? 0.6 : 0);
  const z = FEED_POINT.z + (index - 1.5) * 1.4;
  return { x, y: surfaceY(m) - 0.025, z, facing: Math.atan2(FEED_FROM.x - x, FEED_FROM.z - z) };
}

export function beginFeeding(f: FeedingState, pod: Pod, time: number): boolean {
  if (feedingActive(f)) return false;
  Object.assign(f, createFeeding());
  f.startedAt = time;
  f.participants = pod.members.filter((m) => m.species === "dolphin").map((m) => m.id);
  for (const [i, id] of f.participants.entries()) {
    const m = pod.byId(id)!;
    pod.release(id);
    pod.attract(id, feedingSlot(m, i), 25, "feed");
  }
  enter(f, "gathering", time);
  return true;
}

export function dolphinReady(m: Swimmer, index: number) {
  const slot = feedingSlot(m, index);
  return m.mode !== "leap" && Math.hypot(m.x - slot.x, m.z - slot.z) < 1.2
    && Math.abs(m.y - slot.y) < 0.2 && Math.cos(m.yaw - slot.facing) > 0.94 && m.speed < 0.2;
}

/** Pose shared by the renderer and the fish's predicted mouth contact. */
export function feedPose(f: FeedingState, id: string, time: number) {
  if (f.fish?.id !== id) return { jaw: 0, pitch: 0, happy: 0 };
  const age = time - f.phaseAt;
  if (f.phase === "throwing") {
    return { jaw: OPEN_JAW * Math.min(1, Math.max(0, (age - 0.18) / 0.25)), pitch: HEAD_LIFT * Math.min(1, age / 0.3), happy: 0 };
  }
  if (f.phase === "catching") {
    const close = Math.min(1, Math.max(0, (age - 0.12) / 0.26));
    const recovery = Math.max(0, 1 - age / FEED_CATCH_SECONDS);
    return { jaw: OPEN_JAW * (1 - close), pitch: HEAD_LIFT * recovery + Math.sin(age * Math.PI * 4) * 0.065 * Math.sin(age / FEED_CATCH_SECONDS * Math.PI), happy: Math.sin(Math.min(1, age / FEED_CATCH_SECONDS) * Math.PI) };
  }
  return { jaw: 0, pitch: 0, happy: 0 };
}

/** The mesh's +Z rostrum after its shader bend and YXZ world rotation. */
export function mouthPoint(m: Swimmer, pitch: number, jaw = OPEN_JAW): FeedPoint {
  const station = 0.01 - 0.42;
  let x = -m.turn * m.len * 0.13 * station * station;
  let y = m.len * (-0.018 - 0.025 * Math.sin(jaw)) + m.arch * m.len * 0.11 * (station * station - 0.05);
  let z = m.len * 0.49;
  const cr = Math.cos(m.roll), sr = Math.sin(m.roll);
  const rx = cr * x - sr * y;
  y = sr * x + cr * y;
  x = rx;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const py = cp * y + sp * z;
  z = -sp * y + cp * z;
  y = py;
  return { x: m.x + Math.cos(m.yaw) * x + Math.sin(m.yaw) * z, y: m.y + y, z: m.z - Math.sin(m.yaw) * x + Math.cos(m.yaw) * z };
}

function throwNext(f: FeedingState, pod: Pod, time: number) {
  const id = f.ready[f.index] ?? null;
  const m = pod.byId(id);
  f.fish = {
    id, from: { ...FEED_FROM }, to: m ? mouthPoint(m, m.pitch + HEAD_LIFT) : { x: FEED_POINT.x - 0.8, y: 0.02, z: FEED_POINT.z },
    start: time, duration: FEED_THROW_SECONDS, arc: 0.75, caught: false
  };
  enter(f, "throwing", time);
}

/** A bounded coordination sequence. No arrival, animation or contact can block it. */
export function stepFeeding(f: FeedingState, pod: Pod, time: number) {
  if (!feedingActive(f)) return;
  const age = time - f.phaseAt;
  if (f.phase === "gathering") {
    f.ready = f.participants.filter((id, i) => { const m = pod.byId(id); return m && dolphinReady(m, i); });
    if (age >= 1.2 && (f.ready.length === f.participants.length || age >= FEED_GATHER_SECONDS)) {
      f.fallback = f.ready.length === 0;
      enter(f, "ready", time);
    }
  } else if (f.phase === "ready" && age >= 0.35) {
    throwNext(f, pod, time);
  } else if (f.phase === "throwing" && f.fish) {
    // The held swimmer can still settle a few centimetres vertically. Track
    // that predicted contact so the end of the short arc meets its real mouth.
    const m = pod.byId(f.fish.id);
    if (m) f.fish.to = mouthPoint(m, m.pitch + HEAD_LIFT);
    if (age >= f.fish.duration) {
      f.fish.caught = true;
      f.completed++;
      enter(f, "catching", time);
    }
  } else if (f.phase === "catching" && age >= FEED_CATCH_SECONDS) {
    f.index++;
    if (f.index < f.ready.length) throwNext(f, pod, time);
    else {
      for (const id of f.participants) {
        const m = pod.byId(id);
        if (m?.attract?.kind === "feed") m.attract = null;
      }
      // With no ready animal, the single fish lands on the surface and the
      // pod follows it briefly; the sequence still completes on schedule.
      if (f.fallback && f.fish) for (const id of f.participants) pod.attract(id, f.fish.to, 6, "point");
      enter(f, "finished", time);
    }
  }
}
