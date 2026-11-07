import { CROWD_TIERS } from "./config";

export type CrowdBudgetTier = keyof typeof CROWD_TIERS;

/** Four seconds smooths isolated slow frames; two poor windows precede a cut. */
export const CROWD_WINDOW_SECONDS = 4;
export const CROWD_POOR_FRAME_MS = 34; // below ~29 fps: under the 30 fps target
export const CROWD_GOOD_FRAME_MS = 24; // above ~42 fps: clear headroom
export const CROWD_DOWN_SECONDS = 8;
export const CROWD_UP_SECONDS = 12;
export const CROWD_RECOVERY_COOLDOWN = 20;
/** Longer gaps are a resumed tab or a hitch, not a frame rate. Frames past the
 * simulation clamp (0.1 s) still count: a 9 fps machine must be able to step down. */
export const CROWD_MAX_SAMPLE_SECONDS = 0.5;

export interface CrowdBudgetState {
  readonly tier: CrowdBudgetTier;
  readonly maxVisitors: number;
  readonly poorSeconds: number;
  readonly goodSeconds: number;
  readonly cooldownSeconds: number;
}

export function createCrowdBudgetState(): CrowdBudgetState {
  return { tier: "good", maxVisitors: CROWD_TIERS.good, poorSeconds: 0, goodSeconds: 0, cooldownSeconds: 0 };
}

/** Pure policy: a completed, eligible window advances evidence and active-play cooldown. */
export function evaluateCrowdBudget(state: CrowdBudgetState, meanFrameMs: number, windowSeconds = CROWD_WINDOW_SECONDS): CrowdBudgetState {
  if (!Number.isFinite(meanFrameMs) || meanFrameMs <= 0 || !Number.isFinite(windowSeconds) || windowSeconds <= 0) return state;
  const cooldownSeconds = Math.max(0, state.cooldownSeconds - windowSeconds);
  const poorSeconds = meanFrameMs > CROWD_POOR_FRAME_MS ? state.poorSeconds + windowSeconds : 0;
  const goodSeconds = meanFrameMs < CROWD_GOOD_FRAME_MS ? state.goodSeconds + windowSeconds : 0;
  let tier = state.tier;
  if (poorSeconds >= CROWD_DOWN_SECONDS) {
    if (tier === "good") tier = "moderate";
    else if (tier === "moderate") tier = "low";
  } else if (goodSeconds >= CROWD_UP_SECONDS && cooldownSeconds === 0) {
    if (tier === "low") tier = "moderate";
    else if (tier === "moderate") tier = "good";
  }
  if (tier !== state.tier) {
    return { tier, maxVisitors: CROWD_TIERS[tier], poorSeconds: 0, goodSeconds: 0, cooldownSeconds: CROWD_RECOVERY_COOLDOWN };
  }
  return { tier, maxVisitors: CROWD_TIERS[tier], poorSeconds, goodSeconds, cooldownSeconds };
}

export function crowdFrameEligible(dtSeconds: number, active: boolean, hidden = false): boolean {
  return active && !hidden && Number.isFinite(dtSeconds) && dtSeconds > 0 && dtSeconds < CROWD_MAX_SAMPLE_SECONDS;
}

export interface CrowdBudgetSampler {
  state: CrowdBudgetState;
  elapsed: number;
  frames: number;
}

export function createCrowdBudgetSampler(): CrowdBudgetSampler {
  return { state: createCrowdBudgetState(), elapsed: 0, frames: 0 };
}

/**
 * Allocation-free frame accumulation around the pure policy, with no DOM or game
 * dependencies. The caller owns this runtime sampler; it is never saved.
 * Passing false discards partial windows and streaks so pauses cannot join two
 * unrelated periods of poor performance. The current tier and cooldown survive.
 */
export function sampleCrowdBudget(sampler: CrowdBudgetSampler, dtSeconds: number, eligible: boolean): CrowdBudgetState {
  if (!crowdFrameEligible(dtSeconds, eligible)) {
    sampler.elapsed = 0;
    sampler.frames = 0;
    if (sampler.state.poorSeconds || sampler.state.goodSeconds) {
      sampler.state = { ...sampler.state, poorSeconds: 0, goodSeconds: 0 };
    }
    return sampler.state;
  }
  sampler.elapsed += dtSeconds;
  sampler.frames++;
  if (sampler.elapsed >= CROWD_WINDOW_SECONDS) {
    sampler.state = evaluateCrowdBudget(sampler.state, sampler.elapsed * 1000 / sampler.frames, sampler.elapsed);
    sampler.elapsed = 0;
    sampler.frames = 0;
  }
  return sampler.state;
}
