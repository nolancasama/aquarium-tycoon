import type { DecorKind, DecorVariant, SlotId, SpeciesId, StageId, TankType } from "../types";
import { SPECIES } from "../data/fish";
import { DECOR } from "../data/decor";
import { SLOT_ORDER, TANKS } from "../data/tanks";
import { PHRASES, type PhraseId } from "./english";
import { newModel, newProgress, type DecorRec, type FishRec, type Model, type PlacedDecor, type Progress, type TankRec, type TutorialStep } from "./model";

/**
 * Versioned save. A save of an unknown version, or one that does not parse,
 * is discarded whole, never half-loaded. Every field is re-validated: an
 * edited or corrupted save cannot create coins out of nothing-shaped data,
 * overfill a tank, or put two decorations in one slot.
 */

export const SAVE_KEY = "at.save.v1";
export const VERSION = 1;

export interface SaveData {
  v: number;
  model: Model;
}

export function encodeSave(model: Model): string {
  const data: SaveData = { v: VERSION, model };
  return JSON.stringify(data);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length < 40 ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pct = (v: unknown) => Math.max(0, Math.min(100, num(v, 100)));

const isSpecies = (v: unknown): v is SpeciesId => typeof v === "string" && v in SPECIES;
const isKind = (v: unknown): v is DecorKind => typeof v === "string" && v in DECOR;
const isTankType = (v: unknown): v is TankType => typeof v === "string" && v in TANKS;
const isSlot = (v: unknown): v is SlotId => typeof v === "string" && (SLOT_ORDER as string[]).includes(v);

const STEPS: TutorialStep[] = ["intro", "buy", "place", "feed", "visitor", "decorate", "done"];

function readFish(raw: unknown, ids: Set<string>): FishRec | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || ids.has(id) || !isSpecies(raw.species)) return null;
  ids.add(id);
  return { id, species: raw.species };
}

function readDecor(raw: unknown, ids: Set<string>): DecorRec | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || ids.has(id) || !isKind(raw.kind)) return null;
  const variant = (raw.variant ?? null) as DecorVariant;
  if (!DECOR[raw.kind].versions.some((v) => v.variant === variant)) return null;
  ids.add(id);
  return { id, kind: raw.kind, variant };
}

function readTank(raw: unknown, ids: Set<string>, used: Set<SlotId>): TankRec | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || ids.has(id) || !isTankType(raw.type) || !isSlot(raw.slot) || used.has(raw.slot)) return null;
  ids.add(id);
  used.add(raw.slot);
  const def = TANKS[raw.type];
  const fish = arr(raw.fish)
    .map((f) => readFish(f, ids))
    .filter((f): f is FishRec => Boolean(f))
    .slice(0, def.capacity);
  const slots = new Set<number>();
  const decor: PlacedDecor[] = [];
  for (const d of arr(raw.decor)) {
    const rec = readDecor(d, ids);
    const slot = isObj(d) ? Math.floor(num(d.slot, -1)) : -1;
    if (!rec || slot < 0 || slot >= def.slots.length || slots.has(slot)) continue;
    slots.add(slot);
    decor.push({ ...rec, slot });
  }
  return { id, type: raw.type, slot: raw.slot, fish, decor, food: pct(raw.food), clean: pct(raw.clean) };
}

function readProgress(raw: unknown, m: Model): Progress {
  const src = isObj(raw) ? raw : {};
  const p = newProgress();
  const stage = Math.floor(num(src.stage, 1));
  p.stage = (stage >= 1 && stage <= 5 ? stage : 1) as StageId;
  p.tutorial = STEPS.includes(src.tutorial as TutorialStep) ? (src.tutorial as TutorialStep) : "intro";
  // A later stage implies a finished Stage 1 tutorial (apart from its decorating step).
  if (p.stage >= 2 && STEPS.indexOf(p.tutorial) < STEPS.indexOf("decorate")) p.tutorial = "decorate";
  if (p.stage >= 3) p.tutorial = "done";
  p.firstFish = isSpecies(src.firstFish) ? src.firstFish : null;
  p.fedOnce = src.fedOnce === true;
  p.cleanedOnce = src.cleanedOnce === true;
  p.counted = src.counted === true;
  p.allHappy = src.allHappy === true && p.stage === 5;
  p.helpedInStage = Math.max(0, Math.min(99, Math.floor(num(src.helpedInStage, 0))));
  p.hearts = Math.max(0, Math.min(9999, Math.floor(num(src.hearts, 0))));
  p.specialPending = src.specialPending === true && p.stage === 5;
  p.photo = src.photo === true && p.stage === 5;
  p.star = src.star === true && p.stage === 5;
  p.freePlay = src.freePlay === true && p.star;
  p.said = arr(src.said).filter((s): s is PhraseId => typeof s === "string" && s in PHRASES);
  p.said = [...new Set(p.said)];
  // Unlocks follow the stage: a tank can only exist if the stage that unlocks it was reached.
  if (p.stage < 4) m.tanks = m.tanks.filter((t) => t.type === "small");
  return p;
}

export function decodeSave(text: string | null): SaveData | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.v !== VERSION || !isObj(raw.model)) return null;
  const src = raw.model;
  const m = newModel();
  const ids = new Set<string>();
  const used = new Set<SlotId>();
  const tanks = arr(src.tanks)
    .map((t) => readTank(t, ids, used))
    .filter((t): t is TankRec => Boolean(t));
  // The starter tank is never lost.
  if (!tanks.some((t) => t.type === "small")) return null;
  m.tanks = tanks;
  m.progress = readProgress(src.progress, m);
  const inv = isObj(src.inv) ? src.inv : {};
  m.inv = {
    fish: arr(inv.fish)
      .map((f) => readFish(f, ids))
      .filter((f): f is FishRec => Boolean(f)),
    decor: arr(inv.decor)
      .map((d) => readDecor(d, ids))
      .filter((d): d is DecorRec => Boolean(d)),
    tanks: m.progress.stage >= 4 ? arr(inv.tanks).filter((t): t is TankType => t === "big").slice(0, Math.max(0, SLOT_ORDER.length - m.tanks.length)) : []
  };
  m.coins = Math.max(0, Math.min(99999, Math.floor(num(src.coins, 0))));
  const stats = isObj(src.stats) ? src.stats : {};
  m.stats = {
    coinsEarned: Math.max(0, Math.floor(num(stats.coinsEarned, 0))),
    helped: Math.max(0, Math.floor(num(stats.helped, 0))),
    fishBought: Math.max(0, Math.floor(num(stats.fishBought, 0))),
    seconds: Math.max(0, num(stats.seconds, 0))
  };
  // Ids must stay unique after loading: continue numbering past every saved id.
  let maxId = 1;
  for (const id of ids) {
    const n = Number(id.replace(/^\D+/, ""));
    if (Number.isFinite(n)) maxId = Math.max(maxId, n);
  }
  m.nextId = Math.max(maxId + 1, Math.floor(num(src.nextId, 0)));
  m.paid = arr(src.paid)
    .filter((k): k is string => typeof k === "string" && k.length < 60)
    .slice(-60);
  return { v: VERSION, model: m };
}

export function readSave(): SaveData | null {
  try {
    return decodeSave(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

/** Is there anything stored under the save key (valid or not)? */
export function rawSaveExists(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function writeSave(text: string) {
  try {
    localStorage.setItem(SAVE_KEY, text);
  } catch {
    /* storage blocked on some managed devices */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
