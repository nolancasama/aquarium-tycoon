import { isTunnelDecor } from "../data/decor";
import type { TunnelSpecies } from "../tunnel/contract";
import { HAPPY, happiness, hasSpace, newTank, newTunnelProgress, tankAt, type Model, type Result, type TunnelProgress } from "./model";

export { newTunnelProgress } from "./model";

/** Tuned with the same student/help/tip cycles as the Atrium. */
export const SHARK_TUNNEL_PRICE = 400;

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
 * after milestone 4 can complete the consecutive find → where → count finale. */
export function recordTunnelActivity(m: Model, kind: "find" | "where" | "can" | "count" | "show", byVisitor: boolean): Model {
  if (!m.progress.tunnelOpen) return m;
  const p = m.progress.tunnel ?? newTunnelProgress();
  let progress: TunnelProgress = { ...p, observed: p.observed + 1, helped: p.helped + (byVisitor ? 1 : 0) };
  if (p.milestone === 4 && !byVisitor) {
    progress = {
      ...progress,
      findDone: kind === "find" || (kind === "where" && p.findDone) || (kind === "count" && p.findDone && p.whereDone),
      whereDone: (kind === "where" && p.findDone) || (kind === "count" && p.findDone && p.whereDone),
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
