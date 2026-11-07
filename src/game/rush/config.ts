/**
 * Rush Hour tuning numbers (DESIGN_DECISIONS "Rush Hour event (design freeze)").
 * Every balancing constant lives here; UI and logic import, never redefine.
 */

/** Active-play seconds from eligibility to the first event (random within). */
export const FIRST_DELAY: readonly [number, number] = [8 * 60, 12 * 60];
/** Active-play seconds from the end (or skip) of one event to the next. */
export const NEXT_DELAY: readonly [number, number] = [12 * 60, 18 * 60];
/** A due event waits in the "pending" banner this many active seconds, then starts by itself. */
export const PENDING_AUTOSTART = 20;

/** Preparation seconds by the number of eligible tanks, fixed at event start. */
export function prepSeconds(eligible: number): number {
  if (eligible >= 10) return 210;
  if (eligible >= 5) return 150;
  return 120;
}
/** The visitor rush lasts this long for every aquarium size. */
export const RUSH_SECONDS = 90;

/** A tank is prepared when food and cleanliness are both at least this (0–100), at the same moment. */
export const READY_FOOD = 75;
export const READY_CLEAN = 75;

/** Medal thresholds on the exact ready fraction (never a rounded percentage). */
export const BRONZE_AT = 0.5;
export const SILVER_AT = 0.75;
/** Gold is exactly every tracked tank ready (fraction === 1). */

/** Preparation bonus: floor(min(BONUS_CAP, BONUS_BASE + BONUS_PER_TANK × eligible) × readyFraction). */
export const BONUS_BASE = 10;
export const BONUS_PER_TANK = 3;
export const BONUS_CAP = 40;

/** Extra cosmetic (never tipping) visitors during the rush, and the hard cap on all visitors in the halls. */
export const CROWD_EXTRA = 8;
export const CROWD_CAP = 14;
/** At most this many English visitor questions per rush, through the normal ask() flow. */
export const RUSH_QUESTIONS = 2;

/** Successful-event (any medal) and gold counts for the milestone rewards. */
export const FOUNTAIN_AT_SUCCESSES = 5;
export const BENCH_AT_GOLDS = 10;
export const STATUE_AT_SUCCESSES = 25;
