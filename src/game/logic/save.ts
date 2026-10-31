import type { ColorId, DecorKind, DecorVariant, SlotId, SpeciesId, StageId, TankType } from "../types";
import { SPECIES } from "../data/fish";
import { DECOR, decorFits } from "../data/decor";
import { BUILT_IN_PADS, HALL_OF, PAD_TYPES, SLOT_ORDER, TANKS } from "../data/tanks";
import { roomOpen } from "../data/rooms";
import { PHRASES, type PhraseId } from "./english";
import { isSentencePattern } from "./sentenceTeaching";
import { canLive, hasSpace, LIGHT_COLORS, newModel, newProgress, newTank, type DecorRec, type FishRec, type Model, type PlacedDecor, type Progress, type TankRec, type TutorialStep } from "./model";

/**
 * Versioned save. Version 1 (Phase 1) and 2 (Phase 2) saves are migrated; a
 * save of an unknown version, or one that does not parse, is discarded whole,
 * never half-loaded. Every field is re-validated: an edited or corrupted save
 * cannot overfill a tank, put a turtle in a small tank, put two decorations in
 * one slot, or hold something its level has not unlocked.
 *
 * Version 3 (Expansion 1) only adds: the special tank types and new species and
 * decorations, pads F–H, `progress.galleryOpen` and `tank.light`. A version 2
 * save reads exactly as before (its ids, tanks, pads and animals are kept);
 * the new fields take their defaults.
 */

export const SAVE_KEY = "at.save.v1";
export const VERSION = 3;

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

/** Is this tank type on this pad possible at this level? */
function tankAllowed(type: TankType, slot: SlotId, p: Progress): boolean {
  if (!PAD_TYPES[slot].includes(type)) return false;
  if (!roomOpen(HALL_OF[slot], p)) return false;
  if (type === "small" || type === "ocean") return true;
  return p.stage >= TANKS[type].fromStage;
}

const isColor = (v: unknown): v is ColorId => typeof v === "string" && (LIGHT_COLORS as string[]).includes(v);

function readTank(raw: unknown, ids: Set<string>, used: Set<SlotId>, p: Progress): TankRec | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || ids.has(id) || !isTankType(raw.type) || !isSlot(raw.slot) || used.has(raw.slot)) return null;
  if (!tankAllowed(raw.type, raw.slot, p)) return null;
  ids.add(id);
  used.add(raw.slot);
  const def = TANKS[raw.type];
  const tank: TankRec = newTank(id, raw.type, raw.slot);
  // Animals one by one, so habitat rules hold for the whole tank.
  for (const f of arr(raw.fish)) {
    const rec = readFish(f, ids);
    if (rec && hasSpace(tank, rec.species) && canLive(rec.species, tank)) tank.fish.push(rec);
  }
  const slots = new Set<number>();
  const decor: PlacedDecor[] = [];
  for (const d of arr(raw.decor)) {
    const rec = readDecor(d, ids);
    const slot = isObj(d) ? Math.floor(num(d.slot, -1)) : -1;
    if (!rec || slot < 0 || slot >= def.slots.length || slots.has(slot) || !decorFits(rec.kind, raw.type)) continue;
    slots.add(slot);
    decor.push({ ...rec, slot });
  }
  tank.decor = decor;
  tank.food = pct(raw.food);
  tank.clean = pct(raw.clean);
  const up = isObj(raw.upgrades) ? raw.upgrades : {};
  tank.upgrades = { filter: up.filter === true && p.stage >= 8, lamp: up.lamp === true && p.stage >= 8 };
  tank.light = def.lights && isColor(raw.light) ? raw.light : null;
  return tank;
}

function readProgress(raw: unknown, version: number): Progress {
  const src = isObj(raw) ? raw : {};
  const p = newProgress();
  const stage = Math.floor(num(src.stage, 1));
  p.stage = (stage >= 1 && stage <= 8 ? stage : 1) as StageId;
  p.tutorial = STEPS.includes(src.tutorial as TutorialStep) ? (src.tutorial as TutorialStep) : "intro";
  // A later stage implies a finished Stage 1 tutorial (apart from its decorating step).
  if (p.stage >= 2 && STEPS.indexOf(p.tutorial) < STEPS.indexOf("decorate")) p.tutorial = "decorate";
  if (p.stage >= 3) p.tutorial = "done";
  p.firstFish = isSpecies(src.firstFish) ? src.firstFish : null;
  p.fedOnce = src.fedOnce === true;
  p.cleanedOnce = src.cleanedOnce === true;
  p.counted = src.counted === true;
  p.helpedInStage = Math.max(0, Math.min(99, Math.floor(num(src.helpedInStage, 0))));
  p.namedInStage = Math.max(0, Math.min(99, Math.floor(num(src.namedInStage, 0))));
  p.hearts = Math.max(0, Math.min(9999, Math.floor(num(src.hearts, 0))));
  p.star = src.star === true && p.stage >= 5;
  // Version 1 ended at the star (Stage 5); the star now opens Level 6.
  if (version === 1 && p.star && p.stage === 5) {
    p.stage = 6;
    p.helpedInStage = 0;
  }
  if (p.stage >= 6) p.star = true;
  p.allHappy = src.allHappy === true && (p.stage === 5 || p.stage === 8);
  p.specialPending = src.specialPending === true && p.stage === 5 && !p.star;
  p.photo = src.photo === true && p.stage >= 5;
  p.freePlay = p.star;
  p.hallOpen = src.hallOpen === true && p.stage >= 6;
  p.tickets = src.tickets === true && p.stage >= 8;
  p.upgraded = src.upgraded === true && p.stage >= 8;
  p.superStar = src.superStar === true && p.stage === 8;
  p.tipsTaught = src.tipsTaught === true;
  p.handShown = [...new Set(arr(src.handShown).filter((id): id is string => typeof id === "string" && ["fish-shop", "place-animal", "visitor", "decor-ring", "room-navigation"].includes(id)))];
  p.seenPatterns = [...new Set(arr(src.seenPatterns).filter(isSentencePattern))];
  p.galleryOpen = src.galleryOpen === true && p.stage >= 8 && p.hallOpen;
  p.said = [...new Set(arr(src.said).filter((s): s is PhraseId => typeof s === "string" && s in PHRASES))];
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
  if (!isObj(raw) || (raw.v !== 1 && raw.v !== 2 && raw.v !== 3) || !isObj(raw.model)) return null;
  const version = raw.v;
  const src = raw.model;
  const m = newModel();
  m.progress = readProgress(src.progress, version);
  const ids = new Set<string>();
  const used = new Set<SlotId>();
  const tanks = arr(src.tanks)
    .map((t) => readTank(t, ids, used, m.progress))
    .filter((t): t is TankRec => Boolean(t));
  // The starter tank is never lost (a small tank, or the big one it grew into, on pad A).
  if (!tanks.some((t) => t.slot === "A")) return null;
  // An open hall always has its Ocean tank.
  if (m.progress.hallOpen && !tanks.some((t) => t.type === "ocean")) {
    let n = 1;
    while (ids.has(`t${900 + n}`)) n++;
    tanks.push(newTank(`t${900 + n}`, "ocean", "C"));
    ids.add(`t${900 + n}`);
  }
  // An open Gallery always has a tank on its middle pad.
  if (m.progress.galleryOpen && !tanks.some((t) => t.slot === "G")) {
    let n = 1;
    while (ids.has(`t${950 + n}`)) n++;
    tanks.push(newTank(`t${950 + n}`, "cylinder", "G"));
    ids.add(`t${950 + n}`);
  }
  m.tanks = tanks;
  const inv = isObj(src.inv) ? src.inv : {};
  const freePads = SLOT_ORDER.filter((s) => !tanks.some((t) => t.slot === s) && roomOpen(HALL_OF[s], m.progress) && !BUILT_IN_PADS.includes(s)).length;
  m.inv = {
    fish: arr(inv.fish)
      .map((f) => readFish(f, ids))
      .filter((f): f is FishRec => Boolean(f)),
    decor: arr(inv.decor)
      .map((d) => readDecor(d, ids))
      .filter((d): d is DecorRec => Boolean(d)),
    tanks: arr(inv.tanks)
      .filter((t): t is TankType => isTankType(t) && t !== "small" && t !== "ocean" && m.progress.stage >= TANKS[t].fromStage)
      .slice(0, freePads)
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
