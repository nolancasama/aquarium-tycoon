import { areaAvailable } from "../data/release";
import { HAPPY, OKAY, type Model } from "./model";

/**
 * Dolphin Lagoon rules (pure). The lagoon is not a tank: its welfare is three
 * visible needs (Food, Play, Together) whose average is the dolphins'
 * happiness, and they only change while the lagoon is shown (the care team
 * looks after the pod otherwise). Five milestones, in order. Release-locked:
 * nothing here runs unless the area is available (released and owned, or a
 * development preview). See DESIGN_DECISIONS.md "Dolphin Lagoon".
 */

export type LagoonView = "lagoon" | "gallery" | "deck" | "care";
export const LAGOON_VIEWS: LagoonView[] = ["lagoon", "gallery", "deck", "care"];
export type LagoonToy = "ball" | "bubbles" | "kelp";
export const LAGOON_TOYS: LagoonToy[] = ["ball", "bubbles", "kelp"];
export type LagoonDecor = "arch" | "telescopes" | "fountain";
/** Moments the player watched (a "Look!" bubble tapped). */
export type LagoonSight = "pair" | "breath" | "dive" | "leap";
const SIGHTS: LagoonSight[] = ["pair", "breath", "dive", "leap"];

export interface LagoonProgress {
  /** Milestones completed, in strict order. */
  milestone: 0 | 1 | 2 | 3 | 4 | 5;
  /** The three needs, 0–100. */
  food: number;
  play: number;
  together: number;
  /** Viewpoints looked from (the first milestone asks for two). */
  visited: LagoonView[];
  /** Feeds since the lagoon opened (capped). */
  fed: number;
  seen: LagoonSight[];
  /** English questions answered since the current milestone began. */
  acts: number;
  toys: LagoonToy[];
  /** Different toys given (the fourth milestone asks for two). */
  toysUsed: LagoonToy[];
  decor: LagoonDecor[];
  tourDone: boolean;
  trophy: boolean;
}

/** The pod: a mother and her calf, and two friends. Fixed (no buying or selling dolphins). */
export const DOLPHINS = [
  { id: "sora", name: "Sora", ja: "ソラ", size: 1, mother: null },
  { id: "mimi", name: "Mimi", ja: "ミミ", size: 0.62, mother: "sora" },
  { id: "kai", name: "Kai", ja: "カイ", size: 1.08, mother: null },
  { id: "nami", name: "Nami", ja: "ナミ", size: 0.96, mother: null }
] as const;
export type DolphinId = (typeof DOLPHINS)[number]["id"];

/** Seconds for a full need to empty while the lagoon is shown. */
export const NEED_SECONDS = { food: 300, play: 240, together: 360 } as const;
/** Needs never fall below this: the care team is always there. */
export const NEED_FLOOR = 12;
export const FEED_GAIN = 45;
export const TOY_GAIN = 14;
export const PLAY_GAIN = 10;
export const PAIR_GAIN = 18;
export const BUBBLE_TOGETHER = 16;

export const newLagoonProgress = (): LagoonProgress => ({
  milestone: 0, food: 55, play: 30, together: 50, visited: [], fed: 0, seen: [], acts: 0,
  toys: ["ball", "bubbles"], toysUsed: [], decor: [], tourDone: false, trophy: false
});

/** The lagoon's rules run only where the area may be entered (released + owned, or a preview). */
export const lagoonActive = (m: Model): boolean => Boolean(m.progress.lagoon) && areaAvailable("lagoon");

export const lagoonHappiness = (p: LagoonProgress): number => Math.round((p.food + p.play + p.together) / 3);
export const lagoonMood = (p: LagoonProgress): "happy" | "okay" | "sad" => {
  const h = lagoonHappiness(p);
  return h >= HAPPY ? "happy" : h >= OKAY ? "okay" : "sad";
};
/** The need to point at first (lowest under 50), if any. */
export function lowestNeed(p: LagoonProgress): "food" | "play" | "together" | null {
  const order = (["food", "play", "together"] as const).filter((k) => p[k] < 50);
  return order.sort((a, b) => p[a] - p[b])[0] ?? null;
}

const clamp = (v: number) => Math.max(NEED_FLOOR, Math.min(100, v));

function patch(m: Model, fn: (p: LagoonProgress) => LagoonProgress): Model {
  const p = m.progress.lagoon;
  if (!p || !lagoonActive(m)) return m;
  return checkLagoonMilestones({ ...m, progress: { ...m.progress, lagoon: fn(p) } }).m;
}

/** Open the lagoon's state (a preview, or later a release's unlock rule). Idempotent. */
export function startLagoon(m: Model): Model {
  if (m.progress.lagoon || !areaAvailable("lagoon")) return m;
  return { ...m, progress: { ...m.progress, lagoon: newLagoonProgress() } };
}

/** Time passes while the lagoon is shown. */
export function tickLagoon(m: Model, seconds: number): Model {
  const p = m.progress.lagoon;
  if (!p || !lagoonActive(m) || !(seconds > 0)) return m;
  return { ...m, progress: { ...m.progress, lagoon: {
    ...p,
    food: clamp(p.food - (100 * seconds) / NEED_SECONDS.food),
    play: clamp(p.play - (100 * seconds) / NEED_SECONDS.play),
    together: clamp(p.together - (100 * seconds) / NEED_SECONDS.together)
  } } };
}

export const visitLagoonView = (m: Model, v: LagoonView) =>
  patch(m, (p) => (p.visited.includes(v) ? p : { ...p, visited: [...p.visited, v] }));

export const feedLagoon = (m: Model) => patch(m, (p) => ({ ...p, food: clamp(p.food + FEED_GAIN), fed: Math.min(99, p.fed + 1) }));

/** A toy goes into the water (only an owned one). */
export function giveToy(m: Model, toy: LagoonToy): Model {
  const p = m.progress.lagoon;
  if (!p || !p.toys.includes(toy)) return m;
  return patch(m, (q) => ({
    ...q,
    play: clamp(q.play + TOY_GAIN),
    together: toy === "bubbles" ? clamp(q.together + BUBBLE_TOGETHER) : q.together,
    toysUsed: q.toysUsed.includes(toy) ? q.toysUsed : [...q.toysUsed, toy]
  }));
}

/** A dolphin played with the toy (the flow rate-limits these). */
export const lagoonPlayed = (m: Model) => patch(m, (p) => ({ ...p, play: clamp(p.play + PLAY_GAIN) }));

/** Two dolphins swam together (seen or not, the pod enjoys it). */
export const lagoonTogether = (m: Model) => patch(m, (p) => ({ ...p, together: clamp(p.together + PAIR_GAIN) }));

export const recordLagoonSight = (m: Model, s: LagoonSight) =>
  patch(m, (p) => (p.seen.includes(s) ? p : { ...p, seen: [...p.seen, s] }));

export const recordLagoonActivity = (m: Model) => patch(m, (p) => ({ ...p, acts: Math.min(99, p.acts + 1) }));

export const finishLagoonTour = (m: Model) => patch(m, (p) => ({ ...p, tourDone: true }));

/** What the next milestone still needs (goals card, guide, debug). */
export function lagoonMilestoneReady(p: LagoonProgress, next: number): boolean {
  switch (next) {
    case 1: return p.visited.includes("gallery") && p.visited.includes("deck") && p.fed >= 1;
    case 2: return p.seen.includes("pair") && p.acts >= 2;
    case 3: return p.seen.includes("breath") && p.seen.includes("dive") && p.acts >= 2;
    case 4: return p.toysUsed.length >= 2 && lagoonHappiness(p) >= HAPPY && p.food >= 50 && p.play >= 50 && p.together >= 50;
    case 5: return p.tourDone;
    default: return false;
  }
}

/** Advance through completed milestones, each reward exactly once. */
export function checkLagoonMilestones(m: Model): { m: Model; reached: number[] } {
  let p = m.progress.lagoon;
  if (!p || !lagoonActive(m)) return { m, reached: [] };
  const reached: number[] = [];
  while (p.milestone < 5 && lagoonMilestoneReady(p, p.milestone + 1)) {
    const next = (p.milestone + 1) as LagoonProgress["milestone"];
    // Each milestone asks for its own answers.
    p = { ...p, milestone: next, acts: 0 };
    if (next === 1) p = { ...p, decor: add(p.decor, "arch") };
    if (next === 2) p = { ...p, toys: add(p.toys, "kelp") };
    if (next === 3) p = { ...p, decor: add(p.decor, "telescopes") };
    if (next === 4) p = { ...p, decor: add(p.decor, "fountain") };
    if (next === 5) p = { ...p, trophy: true };
    reached.push(next);
  }
  if (!reached.length) return { m, reached };
  return { m: { ...m, progress: { ...m.progress, lagoon: p } }, reached };
}

const add = <T>(list: T[], x: T): T[] => (list.includes(x) ? list : [...list, x]);

// ------------------------------------------------------------------ save reading (used once the area is released)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  [...new Set(Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : [])];

/** Re-validate a saved lagoon: rewards follow from the milestone reached, never the other way round. */
export function readLagoonProgress(raw: unknown): LagoonProgress {
  const src = isObj(raw) ? raw : {};
  const p = newLagoonProgress();
  p.milestone = Math.max(0, Math.min(5, Math.floor(num(src.milestone, 0)))) as LagoonProgress["milestone"];
  const need = (v: unknown, d: number) => Math.max(NEED_FLOOR, Math.min(100, num(v, d)));
  p.food = need(src.food, p.food);
  p.play = need(src.play, p.play);
  p.together = need(src.together, p.together);
  p.visited = pick(src.visited, LAGOON_VIEWS);
  p.fed = Math.max(0, Math.min(99, Math.floor(num(src.fed, 0))));
  p.seen = pick(src.seen, SIGHTS);
  p.acts = Math.max(0, Math.min(99, Math.floor(num(src.acts, 0))));
  p.toys = pick(["ball", "bubbles", ...(p.milestone >= 2 ? ["kelp"] : [])], LAGOON_TOYS);
  p.toysUsed = pick(src.toysUsed, p.toys);
  p.decor = (["arch", "telescopes", "fountain"] as LagoonDecor[]).filter((_, i) => p.milestone >= [1, 3, 4][i]);
  p.tourDone = src.tourDone === true && p.milestone >= 4;
  p.trophy = p.milestone === 5;
  return p;
}
