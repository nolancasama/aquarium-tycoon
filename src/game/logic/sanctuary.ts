import { areaAvailable } from "../data/release";
import type { Model } from "./model";

/**
 * Grand Ocean Sanctuary rules (pure). Not a tank and no feeding, cleaning or
 * decorating: the player does research (a notebook of observation stickers),
 * conservation (an ocean cleanup, a habitat improvement) and visitor education
 * (English questions). Belugas live in their own cove, opened by the third
 * milestone. Release-locked like the lagoon (see data/release.ts).
 */

export type SanctuaryView = "overview" | "orcas" | "underwater" | "research" | "belugas";
export const SANCTUARY_VIEWS: SanctuaryView[] = ["overview", "orcas", "underwater", "research", "belugas"];

/** The Research Notebook: one sticker per kind of observation. */
export type Sticker = "breath" | "dive" | "big" | "together" | "family" | "spyhop" | "beluga" | "clean";
export const STICKERS: Sticker[] = ["breath", "dive", "big", "together", "family", "spyhop", "beluga", "clean"];
/** Historical answer ids are retained when loading, but never scheduled. */
export const RETIRED_SANCTUARY_QUESTIONS = ["where"] as const;
export type ActiveSanctuaryQuestion = "what" | "big" | "count" | "like" | "beluga";
export type SanctuaryQuestion = ActiveSanctuaryQuestion | (typeof RETIRED_SANCTUARY_QUESTIONS)[number];
const QUESTIONS: SanctuaryQuestion[] = ["what", "big", "count", "like", "beluga", ...RETIRED_SANCTUARY_QUESTIONS];
/** Habitat improvements: the good choices (the choice card also shows unsuitable ones). */
export type Improvement = "kelp" | "quiet" | "ice";
export const IMPROVEMENTS: Improvement[] = ["kelp", "quiet", "ice"];
export type SanctuaryDecor = "flags" | "sizeBoard" | "guardianFlag";

export interface SanctuaryProgress {
  milestone: 0 | 1 | 2 | 3 | 4 | 5;
  stickers: Sticker[];
  asked: SanctuaryQuestion[];
  /** Questions answered in all (the visitor education count). */
  acts: number;
  /** Litter collected in the current cleanup, and whether one was finished. */
  litter: number;
  cleanupDone: boolean;
  improvement: Improvement | null;
  /** Beluga Cove is open (milestone 3). */
  belugas: boolean;
  decor: SanctuaryDecor[];
  tourDone: boolean;
  trophy: boolean;
}

/** The orca pod: an adult male, two females (one with her calf). Individual fins and saddles (scene/marine). */
export const ORCAS = [
  { id: "kuro", name: "Kuro", ja: "クロ", variant: "male", mother: null },
  { id: "yuki", name: "Yuki", ja: "ユキ", variant: "female", mother: null },
  { id: "chibi", name: "Chibi", ja: "チビ", variant: "calf", mother: "yuki" },
  { id: "umi", name: "Umi", ja: "ウミ", variant: "female2", mother: null }
] as const;
export const BELUGAS = [
  { id: "shiro", name: "Shiro", ja: "シロ" },
  { id: "mochi", name: "Mochi", ja: "モチ" },
  { id: "kumo", name: "Kumo", ja: "クモ" }
] as const;
export const CLEANUP_PIECES = 5;

export const newSanctuaryProgress = (): SanctuaryProgress => ({
  milestone: 0, stickers: [], asked: [], acts: 0, litter: 0, cleanupDone: false,
  improvement: null, belugas: false, decor: [], tourDone: false, trophy: false
});

export const sanctuaryActive = (m: Model): boolean => Boolean(m.progress.sanctuary) && areaAvailable("sanctuary");

function patch(m: Model, fn: (p: SanctuaryProgress) => SanctuaryProgress): Model {
  const p = m.progress.sanctuary;
  if (!p || !sanctuaryActive(m)) return m;
  return checkSanctuaryMilestones({ ...m, progress: { ...m.progress, sanctuary: fn(p) } }).m;
}

/** Open the sanctuary's state (a preview, or later a release's unlock rule). Idempotent. */
export function startSanctuary(m: Model): Model {
  if (m.progress.sanctuary || !areaAvailable("sanctuary")) return m;
  return { ...m, progress: { ...m.progress, sanctuary: newSanctuaryProgress() } };
}

const add = <T>(list: T[], x: T): T[] => (list.includes(x) ? list : [...list, x]);

/** A sticker for the notebook (belugas only once their cove is open). */
export const addSticker = (m: Model, s: Sticker) =>
  patch(m, (p) => (p.stickers.includes(s) || (s === "beluga" && !p.belugas) ? p : { ...p, stickers: [...p.stickers, s] }));

export const recordSanctuaryAnswer = (m: Model, q: SanctuaryQuestion) =>
  q === "where" ? m : patch(m, (p) => ({ ...p, asked: add(p.asked, q), acts: Math.min(999, p.acts + 1), stickers: q === "big" ? add(p.stickers, "big") : q === "beluga" && p.belugas ? add(p.stickers, "beluga") : p.stickers }));

/** One piece of floating litter picked up; the fifth finishes the cleanup. */
export const pickLitter = (m: Model) => patch(m, (p) => {
  const litter = Math.min(CLEANUP_PIECES, p.litter + 1);
  const done = litter >= CLEANUP_PIECES;
  return { ...p, litter: done ? 0 : litter, cleanupDone: p.cleanupDone || done, stickers: done ? add(p.stickers, "clean") : p.stickers };
});

export const chooseImprovement = (m: Model, i: Improvement) => patch(m, (p) => ({ ...p, improvement: i }));

export const finishSanctuaryTour = (m: Model) => patch(m, (p) => ({ ...p, tourDone: true }));

/** Research progress shown on the HUD: stickers collected of all. */
export const researchProgress = (p: SanctuaryProgress) => ({ n: p.stickers.length, of: STICKERS.length });

export function sanctuaryMilestoneReady(p: SanctuaryProgress, next: number): boolean {
  const has = (s: Sticker) => p.stickers.includes(s);
  switch (next) {
    case 1: return has("breath");
    case 2: return has("big") && has("dive") && p.asked.includes("count");
    case 3: return has("together") && has("family") && (p.asked.includes("like") || p.asked.includes("where"));
    case 4: return p.cleanupDone && p.improvement !== null;
    case 5: return p.tourDone;
    default: return false;
  }
}

export function checkSanctuaryMilestones(m: Model): { m: Model; reached: number[] } {
  let p = m.progress.sanctuary;
  if (!p || !sanctuaryActive(m)) return { m, reached: [] };
  const reached: number[] = [];
  while (p.milestone < 5 && sanctuaryMilestoneReady(p, p.milestone + 1)) {
    const next = (p.milestone + 1) as SanctuaryProgress["milestone"];
    p = { ...p, milestone: next };
    if (next === 1) p = { ...p, decor: add(p.decor, "flags") };
    if (next === 2) p = { ...p, decor: add(p.decor, "sizeBoard") };
    if (next === 3) p = { ...p, belugas: true };
    if (next === 4) p = { ...p, decor: add(p.decor, "guardianFlag") };
    if (next === 5) p = { ...p, trophy: true };
    reached.push(next);
  }
  if (!reached.length) return { m, reached };
  return { m: { ...m, progress: { ...m.progress, sanctuary: p } }, reached };
}

// ------------------------------------------------------------------ save reading (used once the area is released)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  [...new Set(Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : [])];

export function readSanctuaryProgress(raw: unknown): SanctuaryProgress {
  const src = isObj(raw) ? raw : {};
  const p = newSanctuaryProgress();
  p.milestone = Math.max(0, Math.min(5, Math.floor(num(src.milestone, 0)))) as SanctuaryProgress["milestone"];
  p.belugas = p.milestone >= 3;
  p.stickers = pick(src.stickers, STICKERS).filter((s) => s !== "beluga" || p.belugas);
  p.asked = pick(src.asked, QUESTIONS);
  p.acts = Math.max(0, Math.min(999, Math.floor(num(src.acts, 0))));
  p.litter = Math.max(0, Math.min(CLEANUP_PIECES - 1, Math.floor(num(src.litter, 0))));
  p.cleanupDone = src.cleanupDone === true;
  p.improvement = IMPROVEMENTS.includes(src.improvement as Improvement) ? (src.improvement as Improvement) : null;
  p.decor = (["flags", "sizeBoard", "guardianFlag"] as SanctuaryDecor[]).filter((_, i) => p.milestone >= [1, 2, 4][i]);
  p.tourDone = src.tourDone === true && p.milestone >= 4;
  p.trophy = p.milestone === 5;
  return p;
}
