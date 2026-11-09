import { COAST_DECOR } from "../data/decor";
import { areaAvailable } from "../data/release";
import type { CoastHabitat } from "../data/coast";
import type { SlotId, SpeciesId, TankType } from "../types";
import { happiness, HAPPY, hasSpace, NEED_CAP, newTank, tankAt, type Model, type Result, type TankRec } from "./model";

export { NEED_CAP };

/**
 * Coastal & Polar Zone rules (pure). The zone opens from the Grand Hub once the
 * Shark Tunnel's trophy is won, for coins. Its three habitats are ordinary
 * tanks on pads M (penguins), N (seals) and O (otters): food, cleaning,
 * happiness, tips and Rush Hour work as everywhere else. Each species also
 * needs one item of its own (see `needMet`), and the zone has five milestones.
 */

/** Simulated student (economy.test.ts): reachable in about the same time as the Shark Tunnel from its trophy. */
export const COAST_PRICE = 320;

export const HABITAT_PAD: Record<CoastHabitat, SlotId> = { penguins: "M", seals: "N", otters: "O" };
export const HABITAT_SPECIES: Record<CoastHabitat, SpeciesId> = { penguins: "penguin", seals: "seal", otters: "otter" };
export const isCoastHabitat = (t: TankType): t is CoastHabitat => t === "penguins" || t === "seals" || t === "otters";


export interface CoastProgress {
  /** Number completed, in strict order (0 before the zone opens). */
  milestone: 0 | 1 | 2 | 3 | 4 | 5;
  /** Behaviours the player has seen happen (counted only while the zone is shown). */
  sawPenguinSwim: boolean;
  sawSealDive: boolean;
  sawOtterFloat: boolean;
  /** English activities done, per habitat, since the milestone that asks for them began. */
  penguinActs: number;
  sealActs: number;
  otterActs: number;
  trophy: boolean;
}

export const newCoastProgress = (): CoastProgress => ({
  milestone: 0, sawPenguinSwim: false, sawSealDive: false, sawOtterFloat: false,
  penguinActs: 0, sealActs: 0, otterActs: 0, trophy: false
});

export const coastUnlocked = (m: Model): boolean => Boolean(m.progress.freePlay && m.progress.tunnelOpen && m.progress.tunnel?.trophy);

/** Does this habitat have the item its animals need (resting rocks, a haul-out rock, a kelp bed)? */
export function needMet(t: TankRec): boolean {
  if (!isCoastHabitat(t.type)) return true;
  const need = COAST_DECOR[t.type][0];
  return t.decor.some((d) => d.kind === need);
}

/** Happiness (the coastal need is applied inside happiness() itself, so tips and Rush Hour agree). */
export const habitatHappiness = (t: TankRec): number | null => happiness(t);

/** The habitat a player sees as open (its tank exists). */
export const habitatOpen = (m: Model, h: CoastHabitat) => tankAt(m, HABITAT_PAD[h])?.type === h;

function addHabitat(m: Model, h: CoastHabitat, animals: number): Model {
  if (habitatOpen(m, h)) return giveAnimals(m, h, animals);
  const id = `t${m.nextId}`;
  const out: Model = { ...m, nextId: m.nextId + 1, tanks: [...m.tanks, newTank(id, h, HABITAT_PAD[h])] };
  return giveAnimals(out, h, animals);
}

/** Rewards never overfill a habitat; an animal with no room waits in the bag. */
function giveAnimals(m: Model, h: CoastHabitat, n: number): Model {
  let out = m;
  for (let i = 0; i < n; i++) {
    const species = HABITAT_SPECIES[h];
    const fish = { id: `f${out.nextId}`, species };
    const t = tankAt(out, HABITAT_PAD[h]);
    out = { ...out, nextId: out.nextId + 1 };
    out = t && hasSpace(t, species)
      ? { ...out, tanks: out.tanks.map((x) => x.id === t.id ? { ...x, fish: [...x.fish, fish] } : x) }
      : { ...out, inv: { ...out.inv, fish: [...out.inv.fish, fish] } };
  }
  return out;
}

function giveItem(m: Model, kind: (typeof COAST_DECOR)[CoastHabitat][number]): Model {
  return { ...m, nextId: m.nextId + 1, inv: { ...m.inv, decor: [...m.inv.decor, { id: `d${m.nextId}`, kind, variant: null }] } };
}

export function openCoast(m: Model): Result {
  if (m.progress.coastOpen) return { ok: false, reason: "owned" };
  // Release lock (data/release.ts): no trophy or coin balance opens a held-back area; only a preview can.
  if (!areaAvailable("coast") || !coastUnlocked(m)) return { ok: false, reason: "locked" };
  if (m.coins < COAST_PRICE) return { ok: false, reason: "coins" };
  const opened: Model = { ...m, coins: m.coins - COAST_PRICE, progress: { ...m.progress, coastOpen: true, coastIntroSeen: false, coast: newCoastProgress() } };
  return { ok: true, m: checkCoastMilestones(opened).m };
}

export type CoastEvent = "penguinSwim" | "sealDive" | "otterFloat";

/** Something the player watched happen. */
export function recordCoastSight(m: Model, e: CoastEvent): Model {
  const p = m.progress.coast;
  if (!m.progress.coastOpen || !p) return m;
  const key = e === "penguinSwim" ? "sawPenguinSwim" : e === "sealDive" ? "sawSealDive" : "sawOtterFloat";
  if (p[key]) return m;
  return checkCoastMilestones({ ...m, progress: { ...m.progress, coast: { ...p, [key]: true } } }).m;
}

/** An English activity answered at a habitat. */
export function recordCoastActivity(m: Model, h: CoastHabitat): Model {
  const p = m.progress.coast;
  if (!m.progress.coastOpen || !p) return m;
  const key = h === "penguins" ? "penguinActs" : h === "seals" ? "sealActs" : "otterActs";
  return checkCoastMilestones({ ...m, progress: { ...m.progress, coast: { ...p, [key]: Math.min(99, p[key] + 1) } } }).m;
}

const happy = (m: Model, h: CoastHabitat) => {
  const t = tankAt(m, HABITAT_PAD[h]);
  return Boolean(t && t.type === h && t.fish.length && (habitatHappiness(t) ?? 0) >= HAPPY);
};
const has = (m: Model, h: CoastHabitat, kind: string) => Boolean(tankAt(m, HABITAT_PAD[h])?.decor.some((d) => d.kind === kind));

/** What the next milestone still needs (for the goals card and the guide). */
export function coastMilestoneReady(m: Model, next: number): boolean {
  const p = m.progress.coast ?? newCoastProgress();
  switch (next) {
    case 1: return Boolean(m.progress.coastOpen);
    case 2: return has(m, "penguins", "penguinRock") && p.sawPenguinSwim && p.penguinActs >= 2;
    case 3: return has(m, "seals", "sealRock") && p.sawSealDive && p.sealActs >= 2;
    case 4: return has(m, "otters", "otterToy") && p.sawOtterFloat && p.otterActs >= 1;
    case 5: return happy(m, "penguins") && happy(m, "seals") && happy(m, "otters") && p.penguinActs >= 1 && p.sealActs >= 1 && p.otterActs >= 1;
    default: return false;
  }
}

/** Advance through consecutive completed milestones, awarding each reward exactly once. */
export function checkCoastMilestones(m: Model): { m: Model; reached: number[] } {
  if (!m.progress.coastOpen) return { m, reached: [] };
  let out = m;
  const reached: number[] = [];
  while ((out.progress.coast?.milestone ?? 0) < 5) {
    const p = out.progress.coast ?? newCoastProgress();
    const next = (p.milestone + 1) as CoastProgress["milestone"];
    if (!coastMilestoneReady(out, next)) break;
    // Activity counts start again for the milestone after (each asks for its own).
    out = { ...out, progress: { ...out.progress, coast: { ...p, milestone: next, trophy: next === 5 || p.trophy, penguinActs: 0, sealActs: 0, otterActs: 0 } } };
    if (next === 1) out = addHabitat(out, "penguins", 3);
    if (next === 2) out = addHabitat(giveAnimals(out, "penguins", 1), "seals", 1);
    if (next === 3) out = addHabitat(giveItem(out, "sealBall"), "otters", 2);
    if (next === 4) out = giveAnimals(giveItem(out, "otterDen"), "seals", 1);
    reached.push(next);
  }
  return { m: out, reached };
}
