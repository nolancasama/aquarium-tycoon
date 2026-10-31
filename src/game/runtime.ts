import type { SpeciesId, Vec2, Vec3, VisitorType } from "./types";
import type { SwimState } from "./logic/swim";
import type { BehaviorState } from "./logic/behavior";
import type { Request } from "./logic/requests";
import type { Mood } from "./logic/model";

/**
 * Mutable per-frame state shared by the scene, the per-frame step and the
 * game flow. Kept out of React so 60 fps updates never re-render components.
 */

export interface FishRt extends BehaviorState {
  id: string;
  tankId: string;
  species: SpeciesId;
  s: SwimState;
  /** Smoothed heading for drawing. */
  yaw: number;
  pitch: number;
  bank: number;
  /** Tail-beat phase. */
  phase: number;
  eatT0: number;
  happyT0: number;
  tapT0: number;
  /** Swim to the front glass and loop for a visitor. */
  showT0: number;
  /** Hint glow (0..1, eased by the scene). */
  glow: number;
}

export interface Pellet {
  id: number;
  tankId: string;
  /** Water-local position. */
  x: number;
  y: number;
  z: number;
  vy: number;
  sway: number;
  eaten: boolean;
  /** rt.time when it reached the sand (it fades a little later). */
  landedT: number;
}

export type VisitorState = "walk" | "look" | "sit" | "help" | "leave" | "gone";

export interface VisitorRt {
  id: string;
  type: VisitorType;
  x: number;
  z: number;
  yaw: number;
  /** Walk-cycle phase. */
  step: number;
  moving: boolean;
  path: Vec2[];
  state: VisitorState;
  /** Bench pose 0..1 and its target; transient, never part of a saved model. */
  seat: number;
  seatTarget: 0 | 1;
  /** The current look ends at this rt.time. */
  until: number;
  /** Tank ids still to look at. */
  plan: string[];
  /** Tank ids looked at (each tips when the visitor leaves). */
  seen: string[];
  /** The tank being looked at. */
  at: string | null;
  request: Request | null;
  helped: boolean;
  /** Scripted visitors (the judge, the fish fan's photo day) are moved by the flow only. */
  scripted: boolean;
  bubble: "!" | "heart" | "hmm" | "wow" | null;
  bubbleT0: number;
  anim: { kind: "jump" | "clap" | "photo" | "hmm" | "wave"; t0: number } | null;
  /** Face this point while standing. */
  face: Vec2 | null;
  /** Fade in at the door. */
  bornT: number;
}

export interface CameraShot {
  pos: Vec3;
  target: Vec3;
}

export type EffectKind = "hearts" | "coins" | "sparkle" | "splash" | "confetti" | "flash" | "poof" | "tip" | "tipTotal";

export interface Effect {
  id: number;
  kind: EffectKind;
  x: number;
  y: number;
  z: number;
  t0: number;
  n: number;
  /** "tip" tags: the mood of the tank that paid. */
  tone?: Mood;
}

export const rt = {
  /** Real seconds since load (animation). */
  time: 0,
  fish: new Map<string, FishRt>(),
  pellets: [] as Pellet[],
  /** Tank id -> rt.time the sponge started. */
  cleaning: new Map<string, number>(),
  /** Tank id -> rt.time a fish was poured in. */
  splash: new Map<string, number>(),
  visitors: [] as VisitorRt[],
  camera: {
    /** Management view: orbit (rad, ±0.52) and zoom (0.8..1.25). */
    orbit: 0,
    zoom: 1,
    snap: false,
    shot: null as CameraShot | null,
    pos: { x: 0, y: 8, z: 12 } as Vec3,
    target: { x: 0, y: 1, z: -1 } as Vec3
  },
  effects: [] as Effect[],
  /** Hint glows: whole tanks (room view), fish and decorations (`tankId:slot`). */
  glow: { tanks: new Set<string>(), fish: new Set<string>(), decor: new Set<string>() },
  /** The one DOM demonstration hand; scene markers yield to the same target. */
  hand: { targetId: null as string | null },
  /** Counting clue: the fish of this tank light up one by one. */
  countGlow: null as null | { tankId: string; t0: number },
  /** A "show me" request is waiting for a tap: fish slow down. */
  slowFish: false,
  /** Tests: fish hold still. */
  freezeFish: false,
  /** Seconds since the last visitor arrived / since the last request visitor. */
  spawnClock: 0,
  sinceRequest: 0,
  nextSpawn: 6,
  /** Seconds without goal progress (Pico nudges). */
  idle: 0,
  /** Accumulated care time not yet committed to the model. */
  decayAcc: 0,
  /** Pico's waving and talking. */
  pico: { talking: false, waveT0: -10 },
  /** Earliest start for the next tip tag above each tank (tags queue, never overlap). */
  tipLane: new Map<string, number>(),
  /** Ordinary visitors' tips paid this session (Pico explains tips after the first). */
  tipsPaid: 0,
  /** When the latest tip tags finish (Pico's lesson waits for them). */
  tipsShownUntil: -1e9,
  /** Last happiness seen per tank, and its latest rise (badge pop). */
  moods: new Map<string, { h: number; mood: Mood }>(),
  cheer: new Map<string, { t0: number; level: "up" | "okay" | "happy" }>(),
  /** Tanks that already showed "Happy fish earn more coins!" this session. */
  happyToasted: new Set<string>(),
  lastCoachT: -1e9
};

let effectId = 1;
export function effect(kind: EffectKind, x: number, y: number, z: number, n = 1, opts: { tone?: Mood; delay?: number } = {}) {
  rt.effects.push({ id: effectId++, kind, x, y, z, t0: rt.time + (opts.delay ?? 0), n, tone: opts.tone });
  if (rt.effects.length > 24) rt.effects.shift();
}

export function clearGlow() {
  rt.glow.tanks.clear();
  rt.glow.fish.clear();
  rt.glow.decor.clear();
  rt.countGlow = null;
}

export function resetRuntime() {
  rt.fish.clear();
  rt.pellets = [];
  rt.cleaning.clear();
  rt.splash.clear();
  rt.visitors = [];
  rt.camera.orbit = 0;
  rt.camera.zoom = 1;
  rt.camera.shot = null;
  rt.camera.snap = true;
  rt.effects = [];
  clearGlow();
  rt.hand.targetId = null;
  rt.slowFish = false;
  rt.spawnClock = 0;
  rt.sinceRequest = 0;
  rt.nextSpawn = 6;
  rt.idle = 0;
  rt.decayAcc = 0;
  rt.tipLane.clear();
  rt.moods.clear();
  rt.cheer.clear();
}
