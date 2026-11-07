import { NEXT_DELAY, PENDING_AUTOSTART, prepSeconds, RUSH_SECONDS } from "./config";
import { resultFor } from "./logic";
import { newRushState, type Medal, type RushEvent, type RushRewardId, type RushState, type RushStats } from "./types";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const count = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const medal = (value: unknown): value is Medal | null => value === null || value === "bronze" || value === "silver" || value === "gold";
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length < 40;
const eventId = (value: unknown): value is string => id(value) && /^rush-[1-9]\d*$/.test(value);
const rewardIds: readonly RushRewardId[] = ["cabinet", "bronzeDisplay", "floorPattern", "goldSign", "bubbleFountain", "bench", "sharkStatue"];
const reward = (value: unknown): value is RushRewardId => rewardIds.includes(value as RushRewardId);
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

function readStats(raw: unknown): RushStats | null {
  if (!object(raw)) return null;
  const keys = ["events", "bronze", "silver", "gold", "successes", "bestReady"] as const;
  if (!keys.every((key) => count(raw[key])) || !medal(raw.best)) return null;
  const stats: RushStats = {
    events: raw.events as number, bronze: raw.bronze as number, silver: raw.silver as number,
    gold: raw.gold as number, successes: raw.successes as number, best: raw.best, bestReady: raw.bestReady as number
  };
  const successes = stats.bronze + stats.silver + stats.gold;
  const best = stats.gold > 0 ? "gold" : stats.silver > 0 ? "silver" : stats.bronze > 0 ? "bronze" : null;
  return stats.successes === successes && successes <= stats.events && stats.best === best ? stats : null;
}

function readRewards(raw: unknown): RushRewardId[] | null {
  return Array.isArray(raw) && raw.every(reward) ? [...new Set(raw)] : null;
}

function readEvent(raw: unknown, phase: RushState["phase"]): RushEvent | null {
  if (!object(raw) || !eventId(raw.id) || !Array.isArray(raw.tankIds) || !raw.tankIds.length ||
    !raw.tankIds.every(id) || new Set(raw.tankIds).size !== raw.tankIds.length ||
    !Array.isArray(raw.ready) || !raw.ready.every(id) || !finite(raw.remaining) ||
    raw.prepTotal !== prepSeconds(raw.tankIds.length)) return null;
  const tankIds: string[] = [...raw.tankIds];
  // Missing/sold tanks remain tracked; only readiness ids outside the captured set are dropped.
  const ready: string[] = [...new Set(raw.ready.filter((tankId: string) => tankIds.includes(tankId)))];
  const prepTotal = raw.prepTotal as number;
  let result: RushEvent["result"] = null;
  if (phase === "prep") {
    if (raw.result !== null) return null;
  } else {
    if (!object(raw.result)) return null;
    const r = raw.result;
    const expected = resultFor(ready.length, tankIds.length);
    const newRewards = readRewards(r.newRewards);
    if (!count(r.ready) || !count(r.eligible) || !medal(r.medal) || !count(r.bonus) || !newRewards ||
      r.ready !== expected.ready || r.eligible !== expected.eligible || r.medal !== expected.medal || r.bonus !== expected.bonus) return null;
    result = { ...expected, newRewards };
  }
  return { id: raw.id, tankIds, ready, prepTotal, remaining: clamp(raw.remaining, phase === "prep" ? prepTotal : phase === "rush" ? RUSH_SECONDS : 0), result };
}

/** Invalid transient state cannot lose independently valid lifetime awards. No rolls occur on load. */
export function decodeRush(raw: unknown): RushState {
  const fallback = newRushState();
  if (!object(raw)) return fallback;
  fallback.stats = readStats(raw.stats) ?? fallback.stats;
  fallback.rewards = readRewards(raw.rewards) ?? fallback.rewards;
  if (typeof raw.unlocked !== "boolean" || typeof raw.introSeen !== "boolean" ||
    !["waiting", "pending", "prep", "rush", "results"].includes(raw.phase as string) ||
    !finite(raw.untilNext) || !finite(raw.pendingFor) ||
    (raw.lastCommitted !== null && !eventId(raw.lastCommitted)) || !readStats(raw.stats) || !readRewards(raw.rewards)) return fallback;
  const phase = raw.phase as RushState["phase"];
  const active = phase === "prep" || phase === "rush" || phase === "results";
  const event = active ? readEvent(raw.event, phase) : null;
  if ((active && (!raw.unlocked || !event)) || (!active && raw.event !== null) ||
    (!raw.unlocked && phase !== "waiting") || (phase === "results" && raw.lastCommitted !== event?.id)) return fallback;
  return {
    unlocked: raw.unlocked, introSeen: raw.introSeen, phase,
    untilNext: clamp(raw.untilNext, NEXT_DELAY[1]), pendingFor: clamp(raw.pendingFor, PENDING_AUTOSTART),
    event, lastCommitted: raw.lastCommitted as string | null, stats: fallback.stats, rewards: fallback.rewards
  };
}
