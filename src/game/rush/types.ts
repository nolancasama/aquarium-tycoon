/**
 * Rush Hour state: the frozen interface shared by the event logic/UI and the
 * 3D trophy cabinet and cosmetic rewards. Stored as the optional `Model.rush`;
 * a save without it gets `newRushState()`.
 */

export type Medal = "bronze" | "silver" | "gold";

/**
 * waiting: counting active seconds to the next event (also the cooldown after one).
 * pending: due, waiting for a calm moment / Start Now / Skip / auto-start.
 * prep:    preparation countdown.
 * rush:    the 90-second visitor rush (result already locked).
 * results: results screen shown until Continue; rewards already committed.
 * "locked" is not a phase: before unlock `unlocked` is false and nothing runs.
 */
export type RushPhase = "waiting" | "pending" | "prep" | "rush" | "results";

/** Permanent cosmetic rewards, in unlock order. Fixed positions in Hall 1's entrance area. */
export type RushRewardId =
  | "cabinet" // given at unlock, empty slots
  | "bronzeDisplay" // first bronze or better
  | "floorPattern" // first silver or better
  | "goldSign" // first gold
  | "bubbleFountain" // 5 successful events
  | "bench" // 10 golds
  | "sharkStatue"; // 25 successful events

export interface RushResult {
  ready: number;
  eligible: number;
  medal: Medal | null;
  bonus: number;
  /** Rewards unlocked by this event (shown on the results screen). */
  newRewards: RushRewardId[];
}

export interface RushEvent {
  /** "rush-<n>", n = stats.events + 1 at start. The once-only key for commit. */
  id: string;
  /** Occupied tank ids captured at start: the fixed denominator. */
  tankIds: string[];
  /** Tracked ids that have been prepared during this event (latched; never removed). */
  ready: string[];
  /** Preparation length chosen at start (seconds). */
  prepTotal: number;
  /** Active seconds left in the current phase (prep or rush). */
  remaining: number;
  /** Locked at the end of preparation; null before. */
  result: RushResult | null;
}

export interface RushStats {
  /** Completed events (results committed). Skips do not count. */
  events: number;
  bronze: number;
  silver: number;
  gold: number;
  /** Events with any medal. */
  successes: number;
  best: Medal | null;
  /** Most tanks prepared in one event. */
  bestReady: number;
}

export interface RushState {
  unlocked: boolean;
  introSeen: boolean;
  phase: RushPhase;
  /** Active seconds left until the next event is due (phase "waiting"); rolled once, persisted. */
  untilNext: number;
  /** Active seconds spent in "pending". */
  pendingFor: number;
  event: RushEvent | null;
  /** Id of the last event whose rewards were committed (durable double-pay guard). */
  lastCommitted: string | null;
  stats: RushStats;
  rewards: RushRewardId[];
}

export const newRushStats = (): RushStats => ({
  events: 0, bronze: 0, silver: 0, gold: 0, successes: 0, best: null, bestReady: 0
});

export const newRushState = (): RushState => ({
  unlocked: false,
  introSeen: false,
  phase: "waiting",
  untilNext: 0,
  pendingFor: 0,
  event: null,
  lastCommitted: null,
  stats: newRushStats(),
  rewards: []
});

/** Read-only helpers for the scene (safe on saves without `rush`). */
export const hasRushReward = (rush: RushState | undefined, id: RushRewardId): boolean =>
  Boolean(rush?.rewards.includes(id));
