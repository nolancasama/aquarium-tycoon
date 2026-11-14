import type { ColorId, DecorKind, DecorVariant, SlotId, SpeciesId, StageId, TankType } from "../types";
import { SPECIES } from "../data/fish";
import { DECOR, decorFits } from "../data/decor";
import { BUILT_IN_PADS, HALL_OF, isWingHabitat, PAD_TYPES, SLOT_ORDER, TANKS } from "../data/tanks";
import { roomOpen, roomOwned } from "../data/rooms";
import { isSavedPhrase } from "./english";
import { isSavedSentencePattern } from "./sentenceTeaching";
import { decodeRush } from "../rush/decode";
import { PENGUIN_PURCHASES, type CoastProgress } from "./coast";
import { coastSlotFits } from "../data/coast";
import { areaReleased } from "../data/release";
import { storeLocked } from "./stored";
import { readLagoonProgress } from "./lagoon";
import { readSanctuaryProgress } from "./sanctuary";
import { cleanAnimalName, readDolphinNames } from "./animalNames";
import { canLive, hasSpace, LIGHT_COLORS, newModel, newProgress, newTank, type DecorRec, type FishRec, type Model, type PlacedDecor, type Progress, type TankRec, type TutorialStep, type TunnelProgress } from "./model";

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

export interface SaveCounts {
  tanks: number;
  fish: number;
  decor: number;
}

export interface RejectedRecord {
  kind: "tank" | "fish" | "decor" | "invTank" | "invFish" | "invDecor";
  id: string | null;
  slot?: string | number;
  type?: string;
  species?: string;
  /** Decoration kind (the `kind` field above identifies the record category). */
  decorKind?: string;
  reason: string;
  raw: unknown;
}

export interface DecodeReport {
  rejected: RejectedRecord[];
  synthesizedTanks: { slot: SlotId; type: TankType; why: string }[];
  counts: { raw: SaveCounts; decoded: SaveCounts };
  error?: string;
}

// Whole records only: larger originals remain available in the pinned raw backup.
const QUARANTINE_LIMIT = 200;
const QUARANTINE_BYTES = 512 * 1024;

function quarantine(entries: unknown[]): NonNullable<Model["quarantine"]> {
  const kept: NonNullable<Model["quarantine"]> = [];
  const seen = new Set<string>();
  let size = 0;
  for (const entry of entries) {
    if (!isObj(entry) || typeof entry.reason !== "string" || !("raw" in entry)) continue;
    const record = { reason: entry.reason, raw: entry.raw };
    let key: string;
    try { key = JSON.stringify(record); } catch { continue; }
    if (seen.has(key) || size + key.length * 2 > QUARANTINE_BYTES) continue;
    if (kept.length === QUARANTINE_LIMIT) break;
    seen.add(key);
    size += key.length * 2;
    kept.push(record);
  }
  return kept;
}

export function encodeSave(model: Model): string {
  const data: SaveData = { v: VERSION, model: model.quarantine ? { ...model, quarantine: quarantine(model.quarantine) } : model };
  return JSON.stringify(data);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length < 40 ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pct = (v: unknown) => Math.max(0, Math.min(100, num(v, 100)));

const isSpecies = (v: unknown): v is SpeciesId => typeof v === "string" && Object.prototype.hasOwnProperty.call(SPECIES, v);
const isKind = (v: unknown): v is DecorKind => typeof v === "string" && Object.prototype.hasOwnProperty.call(DECOR, v);
const isTankType = (v: unknown): v is TankType => typeof v === "string" && Object.prototype.hasOwnProperty.call(TANKS, v);
const isSlot = (v: unknown): v is SlotId => typeof v === "string" && (SLOT_ORDER as string[]).includes(v);

const STEPS: TutorialStep[] = ["intro", "buy", "place", "feed", "visitor", "decorate", "done"];

type Reject = (kind: RejectedRecord["kind"], raw: unknown, reason: string, slot?: string | number) => null;

function readFish(raw: unknown, ids: Set<string>, reject: Reject, kind: "fish" | "invFish" = "fish", slot?: SlotId): FishRec | null {
  if (!isObj(raw)) return reject(kind, raw, "invalid-record", slot);
  const id = str(raw.id);
  if (!id) return reject(kind, raw, "invalid-id", slot);
  if (ids.has(id)) return reject(kind, raw, "duplicate-id", slot);
  if (!isSpecies(raw.species)) return reject(kind, raw, "unknown-species", slot);
  ids.add(id);
  const name = raw.species === "penguin" ? cleanAnimalName(raw.name) : undefined;
  return { id, species: raw.species, ...(name ? { name } : {}) };
}

function readDecor(raw: unknown, ids: Set<string>, reject: Reject, kind: "decor" | "invDecor" = "decor", slot?: SlotId): DecorRec | null {
  if (!isObj(raw)) return reject(kind, raw, "invalid-record", slot);
  const id = str(raw.id);
  if (!id) return reject(kind, raw, "invalid-id", slot);
  if (ids.has(id)) return reject(kind, raw, "duplicate-id", slot);
  if (!isKind(raw.kind)) return reject(kind, raw, "unknown-decor", slot);
  const variant = (raw.variant ?? null) as DecorVariant;
  if (!DECOR[raw.kind].versions.some((v) => v.variant === variant)) return reject(kind, raw, "unknown-variant", slot);
  ids.add(id);
  return { id, kind: raw.kind, variant };
}

const isColor = (v: unknown): v is ColorId => typeof v === "string" && (LIGHT_COLORS as string[]).includes(v);

function readTank(raw: unknown, ids: Set<string>, used: Set<SlotId>, p: Progress, reject: Reject): TankRec | null {
  const fail = (reason: string): null => {
    reject("tank", raw, reason);
    if (isObj(raw)) {
      const slot = typeof raw.slot === "string" ? raw.slot : undefined;
      for (const fish of arr(raw.fish)) reject("fish", fish, `tank-${reason}`, slot);
      for (const decor of arr(raw.decor)) reject("decor", decor, `tank-${reason}`, slot);
    }
    return null;
  };
  if (!isObj(raw)) return fail("invalid-record");
  const id = str(raw.id);
  if (!id) return fail("invalid-id");
  if (ids.has(id)) return fail("duplicate-id");
  if (!isTankType(raw.type)) return fail("unknown-type");
  if (!isSlot(raw.slot)) return fail("unknown-slot");
  if (used.has(raw.slot)) return fail("slot-taken");
  if (!PAD_TYPES[raw.slot].includes(raw.type)) return fail("pad-type");
  if (!roomOwned(HALL_OF[raw.slot], p)) return fail("room-not-owned");
  if (raw.type !== "small" && raw.type !== "ocean" && p.stage < TANKS[raw.type].fromStage) return fail("stage-too-low");
  ids.add(id);
  used.add(raw.slot);
  const def = TANKS[raw.type];
  const tank: TankRec = newTank(id, raw.type, raw.slot);
  // Animals one by one, so habitat rules hold for the whole tank.
  for (const f of arr(raw.fish)) {
    const rec = readFish(f, ids, reject, "fish", raw.slot);
    if (!rec) continue;
    if (!hasSpace(tank, rec.species)) reject("fish", f, "no-space", raw.slot);
    else if (!canLive(rec.species, tank)) reject("fish", f, "cannot-live", raw.slot);
    else tank.fish.push(rec);
  }
  const slots = new Set<number>();
  const decor: PlacedDecor[] = [];
  for (const d of arr(raw.decor)) {
    const rec = readDecor(d, ids, reject, "decor", raw.slot);
    const slot = isObj(d) ? Math.floor(num(d.slot, -1)) : -1;
    if (!rec) continue;
    if (slot < 0 || slot >= def.slots.length || slots.has(slot) || !decorFits(rec.kind, raw.type) || !coastSlotFits(raw.type, slot, rec.kind)) {
      reject("decor", d, "decor-slot", raw.slot);
      continue;
    }
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
  p.seenPatterns = [...new Set(arr(src.seenPatterns).filter(isSavedSentencePattern))];
  p.galleryOpen = src.galleryOpen === true && p.stage >= 8 && p.hallOpen;
  p.atriumOpen = src.atriumOpen === true && p.galleryOpen;
  p.atriumIntroSeen = src.atriumIntroSeen === true && p.atriumOpen;
  p.tunnelOpen = src.tunnelOpen === true && p.atriumOpen && p.freePlay;
  p.tunnelIntroSeen = src.tunnelIntroSeen === true && p.tunnelOpen;
  if (p.tunnelOpen) {
    const tunnel = isObj(src.tunnel) ? src.tunnel : {};
    const milestone = Math.max(1, Math.min(5, Math.floor(num(tunnel.milestone, 1)))) as TunnelProgress["milestone"];
    const findDone = milestone >= 4 && tunnel.findDone === true;
    const whereDone = findDone && tunnel.whereDone === true;
    p.tunnel = {
      milestone,
      observed: Math.max(0, Math.min(99999, Math.floor(num(tunnel.observed, 0)))),
      helped: Math.max(0, Math.min(99999, Math.floor(num(tunnel.helped, 0)))),
      findDone, whereDone, countDone: whereDone && tunnel.countDone === true,
      trophy: milestone === 5
    };
  }
  p.hubIntroSeen = src.hubIntroSeen === true && p.tunnelOpen;
  // The coast needs the Shark Tunnel's trophy; its milestone is at least 1 once open.
  p.coastOpen = src.coastOpen === true && Boolean(p.tunnel?.trophy) && p.freePlay;
  p.coastIntroSeen = src.coastIntroSeen === true && p.coastOpen;
  if (p.coastOpen) {
    const c = isObj(src.coast) ? src.coast : {};
    const milestone = Math.max(1, Math.min(5, Math.floor(num(c.milestone, 1)))) as CoastProgress["milestone"];
    const acts = (v: unknown) => Math.max(0, Math.min(99, Math.floor(num(v, 0))));
    p.coast = {
      milestone,
      sawPenguinSwim: c.sawPenguinSwim === true, sawSealDive: c.sawSealDive === true, sawOtterFloat: c.sawOtterFloat === true,
      penguinActs: acts(c.penguinActs), sealActs: acts(c.sealActs), otterActs: acts(c.otterActs),
      trophy: milestone === 5,
      // Added 2026-11-14; older saves have bought none. Owned penguins are never derived from this.
      penguinsBought: Math.max(0, Math.min(PENGUIN_PURCHASES, Math.floor(num(c.penguinsBought, 0))))
    };
  }
  // The outdoor expansions: only a released area can be owned. Until then any
  // saved field is dropped (no unlock rule exists, and previews are never saved).
  if (areaReleased("lagoon") && src.lagoonOpen === true && p.freePlay) {
    p.lagoonOpen = true;
    p.lagoonIntroSeen = src.lagoonIntroSeen === true;
    p.lagoon = readLagoonProgress(src.lagoon);
  }
  if (areaReleased("sanctuary") && src.sanctuaryOpen === true && p.freePlay) {
    p.sanctuaryOpen = true;
    p.sanctuaryIntroSeen = src.sanctuaryIntroSeen === true;
    p.sanctuary = readSanctuaryProgress(src.sanctuary);
  }
  p.said = [...new Set(arr(src.said).filter(isSavedPhrase))];
  return p;
}

/** Decode with a complete account of records that cannot safely enter play. */
export function decodeSaveReport(text: string | null): { data: SaveData | null; report: DecodeReport } {
  const report: DecodeReport = {
    rejected: [], synthesizedTanks: [],
    counts: { raw: { tanks: 0, fish: 0, decor: 0 }, decoded: { tanks: 0, fish: 0, decor: 0 } }
  };
  try {
    return decodeWithReport(text, report);
  } catch {
    // Pathological JSON must remain recoverable as raw text, never crash Continue/import.
    report.error = "invalid-save-data";
    return { data: null, report };
  }
}

function decodeWithReport(text: string | null, report: DecodeReport): { data: SaveData | null; report: DecodeReport } {
  const invalid = (error: string) => { report.error = error; return { data: null, report }; };
  if (!text) return invalid("empty-save");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return invalid("invalid-json");
  }
  if (!isObj(raw) || (raw.v !== 1 && raw.v !== 2 && raw.v !== 3) || !isObj(raw.model)) return invalid("unsupported-save");
  const version = raw.v;
  const src = raw.model;
  const m = newModel();
  const dolphinNames = readDolphinNames(src.dolphinNames);
  if (dolphinNames) m.dolphinNames = dolphinNames;
  m.progress = readProgress(src.progress, version);
  const ids = new Set<string>();
  const used = new Set<SlotId>();
  // Stored habitats (a release-locked area's) are read with the rest, then stored again below.
  const stored = isObj(src.stored) ? src.stored : {};
  const inv = isObj(src.inv) ? src.inv : {};
  const rawTanks = [...arr(src.tanks), ...arr(stored.tanks)];
  report.counts.raw = {
    tanks: rawTanks.length + arr(inv.tanks).length,
    fish: rawTanks.reduce<number>((sum, tank) => sum + (isObj(tank) ? arr(tank.fish).length : 0), 0) + arr(inv.fish).length + arr(stored.fish).length,
    decor: rawTanks.reduce<number>((sum, tank) => sum + (isObj(tank) ? arr(tank.decor).length : 0), 0) + arr(inv.decor).length + arr(stored.decor).length
  };
  const reject: Reject = (kind, raw, reason, parentSlot) => {
    const obj = isObj(raw) ? raw : {};
    const slot = parentSlot ?? (typeof obj.slot === "string" || typeof obj.slot === "number" ? obj.slot : undefined);
    report.rejected.push({
      kind, id: typeof obj.id === "string" ? obj.id : null, reason, raw,
      ...(slot !== undefined ? { slot } : {}),
      ...(typeof obj.type === "string" ? { type: obj.type } : kind === "invTank" && typeof raw === "string" ? { type: raw } : {}),
      ...(typeof obj.species === "string" ? { species: obj.species } : {}),
      ...(typeof obj.kind === "string" ? { decorKind: obj.kind } : {})
    });
    return null;
  };
  const tanks = rawTanks
    .map((t) => readTank(t, ids, used, m.progress, reject))
    .filter((t): t is TankRec => Boolean(t));
  // The starter tank is never lost (a small tank, or the big one it grew into, on pad A).
  const starterMissing = !tanks.some((t) => t.slot === "A");
  // An open hall always has its Ocean tank.
  if (m.progress.hallOpen && !tanks.some((t) => t.type === "ocean")) {
    let n = 1;
    while (ids.has(`t${900 + n}`)) n++;
    tanks.push(newTank(`t${900 + n}`, "ocean", "C"));
    report.synthesizedTanks.push({ slot: "C", type: "ocean", why: "open-hall-missing-tank" });
    ids.add(`t${900 + n}`);
  }
  // An open Gallery always has a tank on its middle pad.
  if (m.progress.galleryOpen && !tanks.some((t) => t.slot === "G")) {
    let n = 1;
    while (ids.has(`t${950 + n}`)) n++;
    tanks.push(newTank(`t${950 + n}`, "cylinder", "G"));
    report.synthesizedTanks.push({ slot: "G", type: "cylinder", why: "open-gallery-missing-tank" });
    ids.add(`t${950 + n}`);
  }
  // The central reef is permanent, including when repairing an incomplete save.
  if (m.progress.atriumOpen && !tanks.some((t) => t.slot === "I")) {
    let n = 1;
    while (ids.has(`t${980 + n}`)) n++;
    tanks.push(newTank(`t${980 + n}`, "reef", "I"));
    report.synthesizedTanks.push({ slot: "I", type: "reef", why: "open-atrium-missing-tank" });
    ids.add(`t${980 + n}`);
  }
  if (m.progress.tunnelOpen && !tanks.some((t) => t.slot === "L")) {
    let n = 1;
    while (ids.has(`t${1000 + n}`)) n++;
    tanks.push(newTank(`t${1000 + n}`, "sharks", "L"));
    report.synthesizedTanks.push({ slot: "L", type: "sharks", why: "open-tunnel-missing-tank" });
    ids.add(`t${1000 + n}`);
  }
  // Each opened coastal habitat keeps its exhibit (penguins from milestone 1, seals from 2, otters from 3).
  const coastAt = m.progress.coast?.milestone ?? 0;
  for (const [type, slot, from] of [["penguins", "M", 1], ["seals", "N", 2], ["otters", "O", 3]] as const) {
    if (!m.progress.coastOpen || coastAt < from || tanks.some((t) => t.slot === slot)) continue;
    let n = 1;
    while (ids.has(`t${1100 + n}`)) n++;
    tanks.push(newTank(`t${1100 + n}`, type, slot));
    report.synthesizedTanks.push({ slot, type, why: "open-coast-missing-tank" });
    ids.add(`t${1100 + n}`);
  }
  m.tanks = tanks;
  const freePads = SLOT_ORDER.filter((s) => !tanks.some((t) => t.slot === s) && roomOpen(HALL_OF[s], m.progress) && !BUILT_IN_PADS.includes(s)).length;
  m.inv = {
    fish: [...arr(inv.fish), ...arr(stored.fish)]
      .map((f) => readFish(f, ids, reject, "invFish"))
      .filter((f): f is FishRec => Boolean(f)),
    decor: [...arr(inv.decor), ...arr(stored.decor)]
      .map((d) => readDecor(d, ids, reject, "invDecor"))
      .filter((d): d is DecorRec => Boolean(d)),
    tanks: []
  };
  for (const type of arr(inv.tanks)) {
    if (!isTankType(type)) reject("invTank", type, "unknown-type");
    else if (type === "small" || type === "ocean" || type === "reef" || isWingHabitat(type)) reject("invTank", type, "unbuyable-type");
    else if (m.progress.stage < TANKS[type].fromStage) reject("invTank", type, "stage-too-low");
    else if (m.inv.tanks.length >= freePads) reject("invTank", type, "no-free-pad");
    else m.inv.tanks.push(type);
  }
  const retained = quarantine([...arr(src.quarantine), ...report.rejected.map(({ reason, raw }) => ({ reason, raw }))]);
  if (retained.length) m.quarantine = retained;
  report.counts.decoded = {
    tanks: tanks.length + m.inv.tanks.length,
    fish: tanks.reduce((sum, t) => sum + t.fish.length, 0) + m.inv.fish.length,
    decor: tanks.reduce((sum, t) => sum + t.decor.length, 0) + m.inv.decor.length
  };
  // Still inspect every record when the mandatory starter is absent, but never load a partial aquarium.
  if (starterMissing) return invalid("missing-starter-tank");
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
  const reservedIds = new Set(ids);
  for (const entry of [...arr(src.quarantine), ...report.rejected]) {
    if (!isObj(entry)) continue;
    const records = [entry.raw];
    while (records.length) {
      const record = records.pop();
      if (!isObj(record)) continue;
      if (typeof record.id === "string") reservedIds.add(record.id);
      for (const child of arr(record.fish)) records.push(child);
      for (const child of arr(record.decor)) records.push(child);
    }
  }
  for (const id of reservedIds) {
    const n = Number(id.replace(/^\D+/, ""));
    if (Number.isFinite(n)) maxId = Math.max(maxId, n);
  }
  m.nextId = Math.max(maxId + 1, Math.floor(num(src.nextId, 0)));
  m.paid = arr(src.paid)
    .filter((k): k is string => typeof k === "string" && k.length < 60)
    .slice(-60);
  m.rush = decodeRush(src.rush);
  // What belongs to a release-locked area waits out of play (kept, and saved back).
  return { data: { v: VERSION, model: storeLocked(m) }, report };
}

/** Compatibility wrapper: callers that do not need diagnostics keep the same API. */
export function decodeSave(text: string | null): SaveData | null {
  return decodeSaveReport(text).data;
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

export function writeSave(text: string): boolean {
  try {
    localStorage.setItem(SAVE_KEY, text);
    return true;
  } catch {
    /* storage blocked on some managed devices */
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
