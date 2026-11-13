import { isTunnelDecor } from "../data/decor";
import type { TunnelSpecies } from "../tunnel/contract";
import { HAPPY, happiness, hasSpace, newTank, newTunnelProgress, tankAt, type Model, type Result, type TunnelProgress } from "./model";
import { SHARK_NUMBER_IDS, SHARK_NUMBER_PHRASE, type PhraseId } from "./english";

export { newTunnelProgress } from "./model";

export type TunnelActivityKind = "find" | "show" | "identify" | "like" | "count";
export type TunnelTarget = "shark" | "ray" | "bigshark";
/** Historical completion IDs remain accepted as safe no-ops, never scheduled. */
export const RETIRED_TUNNEL_ACTIVITIES = ["where", "can"] as const;

/** Select only questions that the habitat's current animals can answer. */
export function chooseTunnelActivity(species: readonly TunnelSpecies[], rand: () => number): { kind: TunnelActivityKind; target: TunnelTarget } | null {
  const sharks = species.some((s) => s !== "eagleray"), rays = species.includes("eagleray");
  if (!sharks && !rays) return null;
  const options: Array<{ kind: TunnelActivityKind; target: TunnelTarget; w: number }> = [];
  if (sharks) options.push({ kind: "find", target: "shark", w: 3 }, { kind: "identify", target: "shark", w: 2.5 }, { kind: "count", target: "shark", w: 1.5 });
  if (rays) options.push({ kind: "find", target: "ray", w: 2 }, { kind: "identify", target: "ray", w: 1.5 });
  if (species.includes("blacktip") && species.includes("zebrashark")) options.push({ kind: "show", target: "bigshark", w: 1.5 });
  options.push({ kind: "like", target: sharks ? "shark" : "ray", w: 1.5 });
  let r = rand() * options.reduce((n, o) => n + o.w, 0);
  for (const o of options) { r -= o.w; if (r <= 0) return { kind: o.kind, target: o.target }; }
  return { kind: options[0].kind, target: options[0].target };
}

/** Shared by the activity card, spoken prompt and curriculum regression scan. */
export function tunnelQuestion(kind: TunnelActivityKind, target: TunnelTarget): { en: string; ja: string } {
  if (kind === "count") return { en: "How many sharks?", ja: "サメは なんびき？" };
  if (kind === "identify") return { en: "What's this?", ja: "これは なに？" };
  if (kind === "like") return target === "ray" ? { en: "Do you like rays?", ja: "エイは すき？" } : { en: "Do you like sharks?", ja: "サメは すき？" };
  if (kind === "show") return { en: "Look at the big shark!", ja: "おおきな サメを みて！" };
  return target === "ray" ? { en: "Find a ray!", ja: "エイを さがして！" } : { en: "Find a shark!", ja: "サメを さがして！" };
}

export function tunnelAnswers(kind: TunnelActivityKind, target: TunnelTarget, count = 1): { options: PhraseId[]; choices: PhraseId[]; judge: PhraseId[] } {
  if (kind === "identify") return { options: [target === "ray" ? "itsRay" : "itsShark"], choices: ["itsShark", "itsRay"], judge: ["itsShark", "itsRay"] };
  if (kind === "like") return { options: ["yesIDo", "noIDont"], choices: ["yesIDo", "noIDont"], judge: ["yesIDo", "noIDont"] };
  if (kind === "count") {
    const lo = Math.max(1, Math.min(count - 1, 4));
    return { options: [SHARK_NUMBER_PHRASE[count]], choices: [lo, lo + 1, lo + 2].map((n) => SHARK_NUMBER_PHRASE[n]), judge: SHARK_NUMBER_IDS };
  }
  return { options: [], choices: [], judge: [] };
}

/** Simulated student (economy.test.ts): about 13 minutes from opening the Atrium, including four reef animals. */
export const SHARK_TUNNEL_PRICE = 300;

export const tunnelUnlocked = (m: Model): boolean => Boolean(
  m.progress.freePlay && m.progress.atriumOpen && (tankAt(m, "I")?.fish.length ?? 0) >= 4
);

export function openSharkTunnel(m: Model): Result {
  if (m.progress.tunnelOpen) return { ok: false, reason: "owned" };
  if (!tunnelUnlocked(m)) return { ok: false, reason: "locked" };
  if (m.coins < SHARK_TUNNEL_PRICE) return { ok: false, reason: "coins" };
  const id = `t${m.nextId}`;
  const opened: Model = {
    ...m, coins: m.coins - SHARK_TUNNEL_PRICE, nextId: m.nextId + 1,
    tanks: [...m.tanks, newTank(id, "sharks", "L")],
    progress: { ...m.progress, tunnelOpen: true, tunnelIntroSeen: false, tunnel: newTunnelProgress() }
  };
  return { ok: true, id, m: checkTunnelMilestones(opened).m };
}

/** Rewards do not depend on shop stock or coins, and never overfill the habitat. */
function giveAnimal(m: Model, species: TunnelSpecies): Model {
  const fish = { id: `f${m.nextId}`, species };
  const habitat = tankAt(m, "L");
  const out = { ...m, nextId: m.nextId + 1 };
  return habitat?.type === "sharks" && hasSpace(habitat, species)
    ? { ...out, tanks: m.tanks.map((t) => t.id === habitat.id ? { ...t, fish: [...t.fish, fish] } : t) }
    : { ...out, inv: { ...m.inv, fish: [...m.inv.fish, fish] } };
}

/** A successful observation or visitor activity; later slices own asking/grading it.
 * Visitor activities count as observations too. Only the guided, non-visitor tour
 * after milestone 4 can complete the consecutive find → identify → count finale. */
export function recordTunnelActivity(m: Model, kind: TunnelActivityKind | typeof RETIRED_TUNNEL_ACTIVITIES[number], byVisitor: boolean): Model {
  if (kind === "where" || kind === "can") return m;
  if (!m.progress.tunnelOpen) return m;
  const p = m.progress.tunnel ?? newTunnelProgress();
  // "Help visitors" (milestone 3) counts from the end of the First Tunnel Tour, so the
  // two milestones are distinct steps rather than completing together.
  let progress: TunnelProgress = { ...p, observed: p.observed + 1, helped: p.helped + (byVisitor && p.milestone >= 2 ? 1 : 0) };
  if (p.milestone === 4 && !byVisitor) {
    progress = {
      ...progress,
      findDone: kind === "find" || (kind === "identify" && p.findDone) || (kind === "count" && p.findDone && p.whereDone),
      // Retain the saved field name and completed middle-step credit from older tours.
      whereDone: (kind === "identify" && p.findDone) || (kind === "count" && p.findDone && p.whereDone),
      countDone: kind === "count" && p.findDone && p.whereDone
    };
  }
  return checkTunnelMilestones({ ...m, progress: { ...m.progress, tunnel: progress } }).m;
}

/** Advance only through consecutive completed milestones, awarding each exactly once. */
export function checkTunnelMilestones(m: Model): { m: Model; reached: number[] } {
  if (!m.progress.tunnelOpen) return { m, reached: [] };
  let out = m;
  const reached: number[] = [];
  while ((out.progress.tunnel?.milestone ?? 0) < 5) {
    const p = out.progress.tunnel ?? newTunnelProgress();
    const habitat = tankAt(out, "L");
    const next = (p.milestone + 1) as TunnelProgress["milestone"];
    const ready = next === 1 ? habitat?.type === "sharks"
      : next === 2 ? p.observed >= 3
        : next === 3 ? p.helped >= 3
          : next === 4 ? Boolean(habitat && (happiness(habitat) ?? 0) >= HAPPY && habitat.decor.filter((d) => isTunnelDecor(d.kind)).length >= 3)
            : p.findDone && p.whereDone && p.countDone;
    if (!ready) break;
    out = { ...out, progress: { ...out.progress, tunnel: { ...p, milestone: next, trophy: next === 5 || p.trophy } } };
    if (next === 1) out = giveAnimal(out, "blacktip");
    if (next === 2) {
      out = { ...out, nextId: out.nextId + 1, inv: { ...out.inv, decor: [...out.inv.decor, { id: `d${out.nextId}`, kind: "tunnelArch", variant: null }] } };
    }
    if (next === 3) out = giveAnimal(out, "eagleray");
    if (next === 4) out = giveAnimal(out, "zebrashark");
    reached.push(next);
  }
  return { m: out, reached };
}
