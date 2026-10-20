import type { DecorKind, DecorVariant, SlotId, SpeciesId, StageId, TankType } from "../types";
import { SPECIES, SPECIES_ORDER } from "../data/fish";
import { DECOR, decorFits, decorVersion } from "../data/decor";
import { HALL_PRICE, PAD_TYPES, SLOT_ORDER, TANKS, TICKETS_PRICE } from "../data/tanks";
import type { PhraseId } from "./english";

/**
 * The whole aquarium as plain data, and every rule that changes it as a pure
 * function. Purchases, rewards, care and progression are deterministic: the
 * same model and action always give the same result, and a refused action
 * returns the reason instead of a half-applied change.
 */

export type TutorialStep = "intro" | "buy" | "place" | "feed" | "visitor" | "decorate" | "done";

export interface FishRec {
  id: string;
  species: SpeciesId;
}

export interface DecorRec {
  id: string;
  kind: DecorKind;
  variant: DecorVariant;
}

export interface PlacedDecor extends DecorRec {
  slot: number;
}

export interface TankUpgrades {
  /** The water gets dirty half as fast. */
  filter: boolean;
  /** +5 happiness; jellyfish love it. */
  lamp: boolean;
}

export interface TankRec {
  id: string;
  type: TankType;
  slot: SlotId;
  /** Every animal in the tank (fish and sea animals). */
  fish: FishRec[];
  decor: PlacedDecor[];
  /** 0–100, fractional while decaying. */
  food: number;
  clean: number;
  upgrades: TankUpgrades;
}

export interface Inventory {
  /** Bought animals waiting in a bag to be put in a tank. */
  fish: FishRec[];
  /** Owned decorations not in a tank. */
  decor: DecorRec[];
  /** Bought tanks waiting in a box to be placed. */
  tanks: TankType[];
}

export interface Progress {
  stage: StageId;
  tutorial: TutorialStep;
  /** The first species bought (the tutorial visitor asks for its colour). */
  firstFish: SpeciesId | null;
  /** First feed / clean done (the English is only asked the first time). */
  fedOnce: boolean;
  cleanedOnce: boolean;
  /** Stage 2: answered Pico's "How many fish?". */
  counted: boolean;
  /** Stages 5 and 8: every tank with animals was happy at the same moment. */
  allHappy: boolean;
  /** Request visitors helped since the level began. */
  helpedInStage: number;
  /** "What's this?" visitors answered since the level began (Level 7). */
  namedInStage: number;
  /** Reputation: every request visitor helped. */
  hearts: number;
  /** The Stage 4 reward event is still to play. */
  specialPending: boolean;
  /** The fish fan's framed photo hangs on the wall. */
  photo: boolean;
  star: boolean;
  freePlay: boolean;
  /** Phase 2: the Ocean Hall is open. */
  hallOpen: boolean;
  /** Phase 2: the ticket gate (more visitors). */
  tickets: boolean;
  /** Level 8: an upgrade was bought. */
  upgraded: boolean;
  /** Level 8: the judge's second visit (the crown). */
  superStar: boolean;
  /** Distinct sentences said or chosen (results card). */
  said: PhraseId[];
}

export interface Stats {
  coinsEarned: number;
  helped: number;
  fishBought: number;
  seconds: number;
}

export interface Model {
  coins: number;
  tanks: TankRec[];
  inv: Inventory;
  progress: Progress;
  stats: Stats;
  nextId: number;
  /** Reward keys already paid (each visitor is rewarded once). */
  paid: string[];
}

export type Reason = "coins" | "locked" | "full" | "missing" | "slotTaken" | "foodFull" | "empty" | "habitat" | "tooBig" | "owned";
export type Result = { ok: true; m: Model; id?: string } | { ok: false; reason: Reason };

export const START_COINS = 100;
export const FEED_AMOUNT = 60;
export const FOOD_DECAY_SECONDS = 3;
export const CLEAN_DECAY_SECONDS = 5;
export const HAPPY = 70;
export const OKAY = 40;
export const LAMP_BONUS = 5;
export type UpgradeKind = "filter" | "lamp" | "bigger";
export const UPGRADE_PRICE: Record<UpgradeKind, number> = { filter: 40, lamp: 30, bigger: 60 };
/** Upgrades are the Level 7 reward. */
export const UPGRADES_FROM: StageId = 8;
const PAID_KEEP = 60;

const fail = (reason: Reason): Result => ({ ok: false, reason });

export function newProgress(): Progress {
  return {
    stage: 1,
    tutorial: "intro",
    firstFish: null,
    fedOnce: false,
    cleanedOnce: false,
    counted: false,
    allHappy: false,
    helpedInStage: 0,
    namedInStage: 0,
    hearts: 0,
    specialPending: false,
    photo: false,
    star: false,
    freePlay: false,
    hallOpen: false,
    tickets: false,
    upgraded: false,
    superStar: false,
    said: []
  };
}

export function newTank(id: string, type: TankType, slot: SlotId): TankRec {
  return { id, type, slot, fish: [], decor: [], food: 100, clean: 100, upgrades: { filter: false, lamp: false } };
}

export function newModel(): Model {
  return {
    coins: START_COINS,
    tanks: [newTank("t1", "small", "A")],
    inv: { fish: [], decor: [], tanks: [] },
    progress: newProgress(),
    stats: { coinsEarned: 0, helped: 0, fishBought: 0, seconds: 0 },
    nextId: 2,
    paid: []
  };
}

// ------------------------------------------------------------------ queries

export const tankById = (m: Model, id: string) => m.tanks.find((t) => t.id === id) ?? null;
export const tankAt = (m: Model, slot: SlotId) => m.tanks.find((t) => t.slot === slot) ?? null;
export const fishCount = (m: Model) => m.tanks.reduce((n, t) => n + t.fish.length, 0);
export const allFish = (m: Model) => m.tanks.flatMap((t) => t.fish.map((f) => ({ ...f, tankId: t.id })));

export function tankOfFish(m: Model, fishId: string): TankRec | null {
  return m.tanks.find((t) => t.fish.some((f) => f.id === fishId)) ?? null;
}

export const hasSpace = (t: TankRec) => t.fish.length < TANKS[t.type].capacity;

/**
 * Can this animal live in this tank? Its habitat must include the tank type,
 * and jellyfish live only with jellyfish (and nothing else with them).
 */
export function canLive(species: SpeciesId, t: TankRec): boolean {
  const def = SPECIES[species];
  if (!def.habitat.includes(t.type)) return false;
  if (def.solitary) return t.fish.every((f) => f.species === species);
  return !t.fish.some((f) => SPECIES[f.species].solitary);
}

/** Places for this animal in placed tanks, after the bagged animals that would need the same places. */
export function homesFor(m: Model, species: SpeciesId): number {
  const homes = m.tanks.filter((t) => canLive(species, t));
  const free = homes.reduce((n, t) => n + TANKS[t.type].capacity - t.fish.length, 0);
  const waiting = m.inv.fish.filter((f) => homes.some((t) => canLive(f.species, t))).length;
  return free - waiting;
}

/** Fish places left in placed tanks, after the fish already waiting in bags (any animal). */
export function freeSpace(m: Model): number {
  const cap = m.tanks.reduce((n, t) => n + TANKS[t.type].capacity, 0);
  return cap - fishCount(m) - m.inv.fish.length;
}

/** Pads with no tank (the Ocean Hall's only once it is open). */
export function freeSlots(m: Model): SlotId[] {
  return SLOT_ORDER.filter((s) => !tankAt(m, s) && (m.progress.hallOpen || (s !== "C" && s !== "D" && s !== "E")));
}

/** Free pads that take this tank type. */
export function padsFor(m: Model, type: TankType): SlotId[] {
  return freeSlots(m).filter((s) => PAD_TYPES[s].includes(type));
}

export function isSpeciesUnlocked(m: Model, s: SpeciesId): boolean {
  const def = SPECIES[s];
  return m.progress.stage >= def.fromStage && (!def.needsHall || m.progress.hallOpen);
}

export const unlockedSpecies = (m: Model) => SPECIES_ORDER.filter((s) => isSpeciesUnlocked(m, s));

export const decorUnlocked = (m: Model) => m.progress.stage >= 2;
export const tanksUnlocked = (m: Model) => m.progress.stage >= 4;
export const upgradesUnlocked = (m: Model) => m.progress.stage >= UPGRADES_FROM;
export const isDecorUnlocked = (m: Model, kind: DecorKind) => m.progress.stage >= DECOR[kind].fromStage;
export const isTankUnlocked = (m: Model, type: TankType) => type !== "ocean" && type !== "small" && m.progress.stage >= TANKS[type].fromStage;

export function cheapestFish(m: Model): number {
  return Math.min(...unlockedSpecies(m).map((s) => SPECIES[s].price));
}

// --------------------------------------------------------------- happiness

export function decorJoy(t: TankRec): number {
  return t.decor.reduce((n, d) => n + decorVersion(d.kind, d.variant).joy, 0);
}

/** Share of the animals whose favourite decoration (or the lamp) is in the tank (0–1). */
export function likedShare(t: TankRec): number {
  if (!t.fish.length) return 0;
  const kinds = new Set<string>(t.decor.map((d) => d.kind));
  if (t.upgrades.lamp) kinds.add("lamp");
  return t.fish.filter((f) => kinds.has(SPECIES[f.species].likes)).length / t.fish.length;
}

/** 0–100, or null for a tank without animals. */
export function happiness(t: TankRec): number | null {
  if (!t.fish.length) return null;
  const h = 0.35 * t.food + 0.25 * t.clean + Math.min(30, decorJoy(t)) + 10 * likedShare(t) + (t.upgrades.lamp ? LAMP_BONUS : 0);
  return Math.max(0, Math.min(100, Math.round(h)));
}

export type Mood = "happy" | "okay" | "sad";

export function mood(h: number | null): Mood {
  if (h === null) return "okay";
  return h >= HAPPY ? "happy" : h >= OKAY ? "okay" : "sad";
}

export const isHungry = (t: TankRec) => t.fish.length > 0 && t.food < 40;
export const isDirty = (t: TankRec) => t.fish.length > 0 && t.clean < 40;

/** Coins a passing visitor leaves for one tank they looked at (1–3). */
export function tipFor(t: TankRec): number {
  const h = happiness(t);
  if (h === null) return 0;
  return 1 + (h >= OKAY ? 1 : 0) + (h >= HAPPY ? 1 : 0);
}

// ---------------------------------------------------------------- purchases

function mapTank(m: Model, id: string, fn: (t: TankRec) => TankRec): Model {
  return { ...m, tanks: m.tanks.map((t) => (t.id === id ? fn(t) : t)) };
}

/** Buy a fish or a sea animal; it waits in a bag until it is put in a tank where it can live. */
export function buyFish(m: Model, species: SpeciesId): Result {
  const def = SPECIES[species];
  if (!isSpeciesUnlocked(m, species)) return fail("locked");
  if (!m.tanks.some((t) => def.habitat.includes(t.type))) return fail("habitat");
  if (homesFor(m, species) <= 0) return fail("full");
  if (m.coins < def.price) return fail("coins");
  const id = `f${m.nextId}`;
  const progress = m.progress.firstFish ? m.progress : { ...m.progress, firstFish: species };
  return {
    ok: true,
    id,
    m: {
      ...m,
      coins: m.coins - def.price,
      nextId: m.nextId + 1,
      inv: { ...m.inv, fish: [...m.inv.fish, { id, species }] },
      progress,
      stats: { ...m.stats, fishBought: m.stats.fishBought + 1 }
    }
  };
}

export function placeFish(m: Model, fishId: string, tankId: string): Result {
  const fish = m.inv.fish.find((f) => f.id === fishId);
  const tank = tankById(m, tankId);
  if (!fish || !tank) return fail("missing");
  if (!canLive(fish.species, tank)) return fail("habitat");
  if (!hasSpace(tank)) return fail("full");
  const placed = { ...m, inv: { ...m.inv, fish: m.inv.fish.filter((f) => f.id !== fishId) } };
  // An empty tank starts fresh when its first animal arrives.
  return {
    ok: true,
    id: fishId,
    m: mapTank(placed, tankId, (t) => ({
      ...t,
      fish: [...t.fish, fish],
      food: t.fish.length ? t.food : 100,
      clean: t.fish.length ? t.clean : 100
    }))
  };
}

export function buyDecor(m: Model, kind: DecorKind, variant: DecorVariant): Result {
  if (!decorUnlocked(m) || !isDecorUnlocked(m, kind)) return fail("locked");
  const def = DECOR[kind];
  const v = def.versions.find((x) => x.variant === variant);
  if (!v) return fail("missing");
  if (m.coins < v.price) return fail("coins");
  const id = `d${m.nextId}`;
  return {
    ok: true,
    id,
    m: { ...m, coins: m.coins - v.price, nextId: m.nextId + 1, inv: { ...m.inv, decor: [...m.inv.decor, { id, kind, variant }] } }
  };
}

export function placeDecor(m: Model, decorId: string, tankId: string, slot: number): Result {
  const d = m.inv.decor.find((x) => x.id === decorId);
  const tank = tankById(m, tankId);
  if (!d || !tank) return fail("missing");
  if (slot < 0 || slot >= TANKS[tank.type].slots.length) return fail("missing");
  if (!decorFits(d.kind, tank.type)) return fail("tooBig");
  if (tank.decor.some((x) => x.slot === slot)) return fail("slotTaken");
  const placed = { ...m, inv: { ...m.inv, decor: m.inv.decor.filter((x) => x.id !== decorId) } };
  return { ok: true, id: decorId, m: mapTank(placed, tankId, (t) => ({ ...t, decor: [...t.decor, { ...d, slot }] })) };
}

/** Move a placed decoration to another slot of its tank (swapping if taken). */
export function moveDecor(m: Model, tankId: string, from: number, to: number): Result {
  const tank = tankById(m, tankId);
  if (!tank) return fail("missing");
  if (to < 0 || to >= TANKS[tank.type].slots.length) return fail("missing");
  if (!tank.decor.some((d) => d.slot === from)) return fail("missing");
  return {
    ok: true,
    m: mapTank(m, tankId, (t) => ({
      ...t,
      decor: t.decor.map((d) => (d.slot === from ? { ...d, slot: to } : d.slot === to ? { ...d, slot: from } : d))
    }))
  };
}

/** Put a placed decoration back in the tray. */
export function storeDecor(m: Model, tankId: string, slot: number): Result {
  const tank = tankById(m, tankId);
  const d = tank?.decor.find((x) => x.slot === slot);
  if (!tank || !d) return fail("missing");
  const rec: DecorRec = { id: d.id, kind: d.kind, variant: d.variant };
  const stored = { ...m, inv: { ...m.inv, decor: [...m.inv.decor, rec] } };
  return { ok: true, id: d.id, m: mapTank(stored, tankId, (t) => ({ ...t, decor: t.decor.filter((x) => x.slot !== slot) })) };
}

/** Buy a tank (big from Level 4, tall from Level 7) while a pad for it is free. */
export function buyTank(m: Model, type: TankType): Result {
  if (!isTankUnlocked(m, type)) return fail("locked");
  if (padsFor(m, type).length - m.inv.tanks.length <= 0) return fail("full");
  const price = TANKS[type].price;
  if (m.coins < price) return fail("coins");
  return { ok: true, m: { ...m, coins: m.coins - price, inv: { ...m.inv, tanks: [...m.inv.tanks, type] } } };
}

export function placeTank(m: Model, type: TankType, slot: SlotId): Result {
  const i = m.inv.tanks.indexOf(type);
  if (i < 0) return fail("missing");
  if (tankAt(m, slot)) return fail("slotTaken");
  if (!freeSlots(m).includes(slot) || !PAD_TYPES[slot].includes(type)) return fail("locked");
  const id = `t${m.nextId}`;
  const tanks = [...m.inv.tanks];
  tanks.splice(i, 1);
  return {
    ok: true,
    id,
    m: { ...m, nextId: m.nextId + 1, inv: { ...m.inv, tanks }, tanks: [...m.tanks, newTank(id, type, slot)] }
  };
}

/** Level 6: the Ocean Hall opens, with the Ocean tank on its middle pad. */
export function openHall(m: Model): Result {
  if (m.progress.stage < 6) return fail("locked");
  if (m.progress.hallOpen) return fail("owned");
  if (m.coins < HALL_PRICE) return fail("coins");
  const id = `t${m.nextId}`;
  return {
    ok: true,
    id,
    m: {
      ...m,
      coins: m.coins - HALL_PRICE,
      nextId: m.nextId + 1,
      tanks: [...m.tanks, newTank(id, "ocean", "C")],
      progress: { ...m.progress, hallOpen: true }
    }
  };
}

/** Small-tank slots 0, 1, 2 land on big-tank slots 0, 2, 4 when the tank grows. */
const GROW_SLOT = [0, 2, 4];

/** Tank upgrades (from Level 8): filter, lamp, or a small tank grown into a big one. */
export function buyUpgrade(m: Model, tankId: string, kind: UpgradeKind): Result {
  if (!upgradesUnlocked(m)) return fail("locked");
  const tank = tankById(m, tankId);
  if (!tank) return fail("missing");
  if (kind === "bigger" && tank.type !== "small") return fail("owned");
  if (kind !== "bigger" && tank.upgrades[kind]) return fail("owned");
  const price = UPGRADE_PRICE[kind];
  if (m.coins < price) return fail("coins");
  const paid = { ...m, coins: m.coins - price, progress: { ...m.progress, upgraded: true } };
  if (kind === "bigger") {
    return {
      ok: true,
      m: mapTank(paid, tankId, (t) => ({ ...t, type: "big", decor: t.decor.map((d) => ({ ...d, slot: GROW_SLOT[d.slot] ?? d.slot })) }))
    };
  }
  return { ok: true, m: mapTank(paid, tankId, (t) => ({ ...t, upgrades: { ...t.upgrades, [kind]: true } })) };
}

/** The ticket gate: up to 4 visitors, arriving more often. */
export function buyTickets(m: Model): Result {
  if (!upgradesUnlocked(m)) return fail("locked");
  if (m.progress.tickets) return fail("owned");
  if (m.coins < TICKETS_PRICE) return fail("coins");
  return { ok: true, m: { ...m, coins: m.coins - TICKETS_PRICE, progress: { ...m.progress, tickets: true, upgraded: true } } };
}

// ---------------------------------------------------------------------- care

export function feed(m: Model, tankId: string): Result {
  const tank = tankById(m, tankId);
  if (!tank) return fail("missing");
  if (!tank.fish.length) return fail("empty");
  if (tank.food >= 90) return fail("foodFull");
  const fed = mapTank(m, tankId, (t) => ({ ...t, food: Math.min(100, t.food + FEED_AMOUNT) }));
  return { ok: true, m: { ...fed, progress: { ...fed.progress, fedOnce: true } } };
}

export function clean(m: Model, tankId: string): Result {
  const tank = tankById(m, tankId);
  if (!tank) return fail("missing");
  const cleaned = mapTank(m, tankId, (t) => ({ ...t, clean: 100 }));
  return { ok: true, m: { ...cleaned, progress: { ...cleaned.progress, cleanedOnce: true } } };
}

/** Time passing during play: animals get hungry, water gets dirty (tanks with animals only; a filter halves the dirt). */
export function decay(m: Model, seconds: number): Model {
  if (seconds <= 0) return m;
  return {
    ...m,
    tanks: m.tanks.map((t) =>
      t.fish.length
        ? {
            ...t,
            food: Math.max(0, t.food - seconds / FOOD_DECAY_SECONDS),
            clean: Math.max(0, t.clean - seconds / CLEAN_DECAY_SECONDS / (t.upgrades.filter ? 2 : 1))
          }
        : t
    ),
    stats: { ...m.stats, seconds: m.stats.seconds + seconds }
  };
}

// ------------------------------------------------------------------- rewards

/** Pay coins once per key (a visitor id); an already-paid key changes nothing. */
export function award(m: Model, amount: number, key?: string): Model {
  if (key && m.paid.includes(key)) return m;
  const paid = key ? [...m.paid, key].slice(-PAID_KEEP) : m.paid;
  return { ...m, coins: m.coins + amount, paid, stats: { ...m.stats, coinsEarned: m.stats.coinsEarned + amount } };
}

/** A request visitor was helped: coins, a heart, and a step toward the level goal. Once per visitor. */
export function helpVisitor(m: Model, visitorId: string, amount: number, named = false): Model {
  const key = `help:${visitorId}`;
  if (m.paid.includes(key)) return m;
  const paidModel = award(m, amount, key);
  const p = paidModel.progress;
  return {
    ...paidModel,
    progress: { ...p, hearts: p.hearts + 1, helpedInStage: p.helpedInStage + 1, namedInStage: p.namedInStage + (named ? 1 : 0) },
    stats: { ...paidModel.stats, helped: paidModel.stats.helped + 1 }
  };
}

export function noteSaid(m: Model, id: PhraseId): Model {
  if (m.progress.said.includes(id)) return m;
  return { ...m, progress: { ...m.progress, said: [...m.progress.said, id] } };
}

/** No fish anywhere and not enough coins for one: Pico gives a clownfish. */
export function needsGift(m: Model): boolean {
  return fishCount(m) === 0 && m.inv.fish.length === 0 && m.coins < cheapestFish(m);
}

export function giftFish(m: Model): Result {
  if (!needsGift(m)) return fail("missing");
  const id = `f${m.nextId}`;
  return { ok: true, id, m: { ...m, nextId: m.nextId + 1, inv: { ...m.inv, fish: [...m.inv.fish, { id, species: "clownfish" }] } } };
}

// --------------------------------------------------------------- progression

export type GoalId =
  | "buyFish"
  | "feed"
  | "visitor"
  | "twoFish"
  | "count"
  | "clean"
  | "help"
  | "placeBig"
  | "fishInBig"
  | "decorBig"
  | "allHappy"
  | "openHall"
  | "turtle"
  | "placeTall"
  | "tallAnimal"
  | "named"
  | "upgrade";

export interface Goal {
  id: GoalId;
  done: boolean;
  /** Progress counter for "help 3" style goals. */
  n?: number;
  of?: number;
}

const bigTank = (m: Model) => m.tanks.find((t) => t.type === "big") ?? null;

export function goals(m: Model): Goal[] {
  const p = m.progress;
  const helped = (of: number): Goal => ({ id: "help", done: p.helpedInStage >= of, n: Math.min(of, p.helpedInStage), of });
  switch (p.stage) {
    case 1:
      return [
        { id: "buyFish", done: fishCount(m) > 0 },
        { id: "feed", done: p.fedOnce },
        { id: "visitor", done: p.hearts > 0 }
      ];
    case 2:
      return [
        { id: "twoFish", done: fishCount(m) >= 2, n: Math.min(2, fishCount(m)), of: 2 },
        { id: "count", done: p.counted },
        { id: "clean", done: p.cleanedOnce }
      ];
    case 3:
      return [helped(3)];
    case 4: {
      const big = bigTank(m);
      const decor = big ? Math.min(2, big.decor.length) : 0;
      return [
        { id: "placeBig", done: Boolean(big) },
        { id: "fishInBig", done: Boolean(big && big.fish.length > 0) },
        { id: "decorBig", done: decor >= 2, n: decor, of: 2 }
      ];
    }
    case 5:
      return p.star ? [] : [helped(3), { id: "allHappy", done: p.allHappy }];
    case 6:
      return [
        { id: "openHall", done: p.hallOpen },
        { id: "turtle", done: m.tanks.some((t) => t.type === "ocean" && t.fish.some((f) => f.species === "turtle")) },
        helped(2)
      ];
    case 7: {
      const tall = m.tanks.filter((t) => t.type === "tall");
      return [
        { id: "placeTall", done: tall.length > 0 },
        { id: "tallAnimal", done: tall.some((t) => t.fish.some((f) => f.species === "seahorse" || f.species === "jellyfish")) },
        { id: "named", done: p.namedInStage >= 2, n: Math.min(2, p.namedInStage), of: 2 }
      ];
    }
    case 8:
      return p.superStar ? [] : [{ id: "upgrade", done: p.upgraded }, helped(3), { id: "allHappy", done: p.allHappy }];
  }
}

/** All goals of the current level are met (Levels 5 and 8: the judge can come). */
export function stageDone(m: Model): boolean {
  const g = goals(m);
  return g.length > 0 && g.every((x) => x.done);
}

/** Levels 5 and 8: latch "every tank with animals is happy" the moment it is true. */
export function latchHappy(m: Model): Model {
  const p = m.progress;
  const judgeLevel = (p.stage === 5 && !p.star) || (p.stage === 8 && !p.superStar);
  if (!judgeLevel || p.allHappy) return m;
  const withFish = m.tanks.filter((t) => t.fish.length > 0);
  if (!withFish.length || !withFish.every((t) => (happiness(t) ?? 0) >= HAPPY)) return m;
  return { ...m, progress: { ...p, allHappy: true } };
}

/** Rewards of Levels 1–4 and 6–7 (Levels 5 and 8 end with the judge). */
export function completeStage(m: Model): Result {
  const p = m.progress;
  if (p.stage === 5 || p.stage >= 8 || !stageDone(m)) return fail("locked");
  const next = (p.stage + 1) as StageId;
  let out: Model = { ...m, progress: { ...p, stage: next, helpedInStage: 0, namedInStage: 0 } };
  if (p.stage === 1) {
    // Decorations unlocked, and two free ones placed with Pico's help.
    const plant: DecorRec = { id: `d${out.nextId}`, kind: "plant", variant: "small" };
    const shell: DecorRec = { id: `d${out.nextId + 1}`, kind: "shell", variant: null };
    out = {
      ...out,
      nextId: out.nextId + 2,
      inv: { ...out.inv, decor: [...out.inv.decor, plant, shell] },
      progress: { ...out.progress, tutorial: "decorate" }
    };
  }
  if (p.stage === 4) out = { ...out, progress: { ...out.progress, specialPending: true } };
  // Level 8 needs its own "all happy" moment.
  if (p.stage === 7) out = { ...out, progress: { ...out.progress, allHappy: false } };
  return { ok: true, m: out };
}

/** The Stage 4 reward event played: the photo hangs and the fan's coins are paid. */
export function finishSpecial(m: Model): Model {
  if (!m.progress.specialPending) return m;
  const paidModel = award(m, 30, "special");
  return { ...paidModel, progress: { ...paidModel.progress, specialPending: false, photo: true } };
}

/** The judge comes: Level 5 (the star) or Level 8 (the crown). */
export function judgeReady(m: Model): boolean {
  const p = m.progress;
  return ((p.stage === 5 && !p.star) || (p.stage === 8 && !p.superStar)) && stageDone(m);
}

/** Level 5's judge: the Aquarium Star, 50 coins, and Level 6 (free play goes on). */
export function earnStar(m: Model): Model {
  if (m.progress.star) return m;
  const paidModel = award(m, 50, "judge");
  return { ...paidModel, progress: { ...paidModel.progress, star: true, freePlay: true, stage: 6, helpedInStage: 0, namedInStage: 0, allHappy: false } };
}

/** Level 8's judge: the crown on the trophy and 80 coins. */
export function earnSuperStar(m: Model): Model {
  if (m.progress.superStar) return m;
  const paidModel = award(m, 80, "judge2");
  return { ...paidModel, progress: { ...paidModel.progress, superStar: true } };
}

/** Set a tank's care levels directly (the tutorial's hungry new fish; tests). */
export function setCare(m: Model, tankId: string, food: number, cleanLevel: number): Model {
  return mapTank(m, tankId, (t) => ({ ...t, food: Math.max(0, Math.min(100, food)), clean: Math.max(0, Math.min(100, cleanLevel)) }));
}

export function setTutorial(m: Model, step: TutorialStep): Model {
  return { ...m, progress: { ...m.progress, tutorial: step } };
}

export function markCounted(m: Model): Model {
  return { ...m, progress: { ...m.progress, counted: true } };
}
