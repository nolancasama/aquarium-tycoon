import { award, type Model } from "../logic/model";
import {
  BENCH_AT_GOLDS, BONUS_BASE, BONUS_CAP, BONUS_PER_TANK, BRONZE_AT,
  FIRST_DELAY, FOUNTAIN_AT_SUCCESSES, NEXT_DELAY, PENDING_AUTOSTART,
  prepSeconds, READY_CLEAN, READY_FOOD, RUSH_SECONDS, SILVER_AT, STATUE_AT_SUCCESSES
} from "./config";
import { newRushState, type Medal, type RushResult, type RushRewardId } from "./types";

export interface RushTransition {
  type: "unlock" | "pending" | "prep" | "ready" | "rush" | "results" | "cancel";
  tankId?: string;
}
export interface RushContext {
  rand: () => number;
  /** Includes idle mode, no scripted/celebration overlays, and no tunnel exploration. */
  calm: boolean;
}

export function ensureRush(model: Model): Model {
  return model.rush ? model : { ...model, rush: newRushState() };
}

export function canUnlock(model: Model): boolean {
  return model.progress.tutorial === "done" && model.progress.freePlay &&
    model.progress.hallOpen && model.tanks.some((tank) => tank.fish.length > 0);
}

function roll(range: readonly [number, number], rand: () => number): number {
  const sample = rand();
  const fraction = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
  return range[0] + Math.floor(fraction * (range[1] - range[0]));
}

function waiting(model: Model, rand: () => number): Model {
  return { ...model, rush: { ...model.rush!, phase: "waiting", untilNext: roll(NEXT_DELAY, rand), pendingFor: 0, event: null } };
}

/** Only a due event can start; calling twice cannot replace the tracked tanks. */
export function startEvent(model: Model, rand: () => number = Math.random): Model {
  const rush = model.rush;
  if (!rush?.unlocked || rush.phase !== "pending" || model.progress.tutorial !== "done") return model;
  const tankIds = model.tanks.filter((tank) => tank.fish.length > 0).map((tank) => tank.id);
  if (tankIds.length === 0) return waiting(model, rand);
  const prepTotal = prepSeconds(tankIds.length);
  return latchReadiness({ ...model, rush: {
    ...rush, phase: "prep", pendingFor: 0,
    event: { id: `rush-${rush.stats.events + 1}`, tankIds, ready: [], prepTotal, remaining: prepTotal, result: null }
  } });
}

/** Debug-only bypass of the random wait, never the tutorial or eligibility rules.
 * Uses the normal unlocking, preparation and award pipeline. */
export function debugStartEvent(input: Model, rand: () => number = Math.random): Model {
  const model = ensureRush(input);
  if (model.progress.tutorial !== "done" || !model.tanks.some(t => t.fish.length > 0) ||
      (model.rush!.phase !== "waiting" && model.rush!.phase !== "pending")) return input;

  // An eligible aquarium might not have had its first simulation tick since unlocking
  // Free Play; initialise the normal cabinet reward and Rush Hour state if needed.
  const unlocked = model.rush!.unlocked ? model : advance(model, 0, { rand, calm: true }).model;
  if (!unlocked.rush!.unlocked) return input;

  const pending: Model = { ...unlocked, rush: {
    ...unlocked.rush!, phase: "pending", untilNext: 0, pendingFor: 0
  } };
  return startEvent(pending, rand);
}

/** A single simultaneous care check earns a permanent checkmark for this event. */
export function latchReadiness(model: Model): Model {
  const rush = model.rush;
  if (rush?.phase !== "prep" || !rush.event) return model;
  const event = rush.event;
  const newlyReady = event.tankIds.filter((id) => !event.ready.includes(id) && model.tanks.some((tank) =>
    tank.id === id && tank.fish.length > 0 && tank.food >= READY_FOOD && tank.clean >= READY_CLEAN));
  if (!newlyReady.length) return model;
  return { ...model, rush: { ...rush, event: { ...event, ready: [...event.ready, ...newlyReady] } } };
}

export function resultFor(ready: number, eligible: number): RushResult {
  const fraction = eligible > 0 ? ready / eligible : 0;
  const medal: Medal | null = fraction === 1 ? "gold" : fraction >= SILVER_AT ? "silver" : fraction >= BRONZE_AT ? "bronze" : null;
  return { ready, eligible, medal, bonus: Math.floor(Math.min(BONUS_CAP, BONUS_BASE + BONUS_PER_TANK * eligible) * fraction), newRewards: [] };
}

/** End preparation and preserve the result throughout the crowd and reloads. */
export function lockResult(model: Model): Model {
  model = latchReadiness(model);
  const rush = model.rush;
  if (rush?.phase !== "prep" || !rush.event || rush.event.result) return model;
  const event = rush.event;
  return { ...model, rush: { ...rush, phase: "rush", event: {
    ...event, remaining: RUSH_SECONDS, result: resultFor(event.ready.length, event.tankIds.length)
  } } };
}

const rank = (medal: Medal | null) => medal === "gold" ? 3 : medal === "silver" ? 2 : medal === "bronze" ? 1 : 0;

/** The only payment path: coins, lifetime records, and cosmetics change together. */
export function commitResult(model: Model): Model {
  const rush = model.rush;
  if (!rush?.event?.result || (rush.phase !== "rush" && rush.phase !== "results")) return model;
  const event = rush.event;
  if (rush.lastCommitted === event.id) {
    return rush.phase === "results" ? model : { ...model, rush: { ...rush, phase: "results", event: { ...event, remaining: 0 } } };
  }
  const result = event.result!;
  const medal = result.medal;
  const stats = {
    ...rush.stats, events: rush.stats.events + 1,
    bronze: rush.stats.bronze + Number(medal === "bronze"),
    silver: rush.stats.silver + Number(medal === "silver"),
    gold: rush.stats.gold + Number(medal === "gold"),
    successes: rush.stats.successes + Number(medal !== null),
    best: rank(medal) > rank(rush.stats.best) ? medal : rush.stats.best,
    bestReady: Math.max(rush.stats.bestReady, result.ready)
  };
  const rewards = [...rush.rewards];
  const newRewards: RushRewardId[] = [];
  const grant = (id: RushRewardId, condition: boolean) => {
    if (condition && !rewards.includes(id)) { rewards.push(id); newRewards.push(id); }
  };
  grant("bronzeDisplay", medal !== null);
  grant("floorPattern", rank(medal) >= rank("silver"));
  grant("goldSign", medal === "gold");
  grant("bubbleFountain", stats.successes >= FOUNTAIN_AT_SUCCESSES);
  grant("bench", stats.gold >= BENCH_AT_GOLDS);
  grant("sharkStatue", stats.successes >= STATUE_AT_SUCCESSES);
  return { ...award(model, result.bonus, event.id), rush: {
    ...rush, phase: "results", lastCommitted: event.id, stats, rewards,
    event: { ...event, remaining: 0, result: { ...result, newRewards } }
  } };
}

export function skip(model: Model, rand: () => number = Math.random): Model {
  return model.rush?.unlocked && (model.rush.phase === "pending" || model.rush.phase === "prep") ? waiting(model, rand) : model;
}

export function continueEvent(model: Model, rand: () => number = Math.random): Model {
  return model.rush?.phase === "results" ? waiting(model, rand) : model;
}

/** Called by the shared active-play accumulator, never by a wall-clock timer. */
export function advance(input: Model, activeSeconds: number, ctx: RushContext): { model: Model; events: RushTransition[] } {
  let model = ensureRush(input);
  const events: RushTransition[] = [];
  if (model.progress.tutorial !== "done") return { model, events };
  let rush = model.rush!;
  if (!rush.unlocked) {
    if (!canUnlock(model)) return { model, events };
    const rewards = rush.rewards.includes("cabinet") ? rush.rewards : [...rush.rewards, "cabinet" as const];
    model = { ...model, rush: { ...rush, unlocked: true, untilNext: roll(FIRST_DELAY, ctx.rand), rewards } };
    events.push({ type: "unlock" });
    return { model, events };
  }
  let seconds = Number.isFinite(activeSeconds) ? Math.max(0, activeSeconds) : 0;
  // There is at most one complete event in this call; results always require Continue.
  for (;;) {
    rush = model.rush!;
    if (rush.phase === "results") break;
    if (rush.phase === "waiting") {
      const spent = Math.min(seconds, rush.untilNext);
      seconds -= spent;
      model = { ...model, rush: { ...rush, untilNext: rush.untilNext - spent } };
      if (model.rush!.untilNext > 0) break;
      model = { ...model, rush: { ...model.rush!, phase: "pending", pendingFor: 0 } };
      events.push({ type: "pending" });
    } else if (rush.phase === "pending") {
      if (!ctx.calm) break;
      const spent = Math.min(seconds, Math.max(0, PENDING_AUTOSTART - rush.pendingFor));
      seconds -= spent;
      model = { ...model, rush: { ...rush, pendingFor: rush.pendingFor + spent } };
      if (model.rush!.pendingFor < PENDING_AUTOSTART) break;
      model = startEvent(model, ctx.rand);
      if (model.rush!.phase !== "prep") { events.push({ type: "cancel" }); break; }
      events.push({ type: "prep" });
      for (const tankId of model.rush!.event!.ready) events.push({ type: "ready", tankId });
    } else {
      const before = rush.event!.ready;
      model = latchReadiness(model);
      const event = model.rush!.event!;
      for (const tankId of event.ready) if (!before.includes(tankId)) events.push({ type: "ready", tankId });
      const spent = Math.min(seconds, event.remaining);
      seconds -= spent;
      model = { ...model, rush: { ...model.rush!, event: { ...event, remaining: event.remaining - spent } } };
      if (model.rush!.event!.remaining > 0) break;
      if (rush.phase === "prep") { model = lockResult(model); events.push({ type: "rush" }); }
      else { model = commitResult(model); events.push({ type: "results" }); break; }
    }
    if (seconds <= 0) break;
  }
  return { model, events };
}
