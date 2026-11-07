import { describe, expect, it } from "vitest";
import {
  createCrowdBudgetSampler, createCrowdBudgetState, crowdFrameEligible,
  evaluateCrowdBudget, sampleCrowdBudget
} from "./crowdBudget";

describe("Rush Hour crowd budget", () => {
  it("keeps 18 visitors on a capable machine and leaves reducer inputs unchanged", () => {
    const initial = createCrowdBudgetState();
    const next = evaluateCrowdBudget(initial, 16);
    expect(next.tier).toBe("good");
    expect(next.maxVisitors).toBe(18);
    expect(initial.goodSeconds).toBe(0);
  });

  it("requires sustained poor windows and steps down one tier at a time", () => {
    let state = evaluateCrowdBudget(createCrowdBudgetState(), 40);
    expect(state.maxVisitors).toBe(18);
    state = evaluateCrowdBudget(state, 40);
    expect(state.maxVisitors).toBe(14);
    state = evaluateCrowdBudget(state, 45);
    expect(state.maxVisitors).toBe(14);
    state = evaluateCrowdBudget(state, 45);
    expect(state.maxVisitors).toBe(12);
    for (let i = 0; i < 8; i++) state = evaluateCrowdBudget(state, 45);
    expect(state.maxVisitors).toBe(12);
  });

  it("resets evidence in the hysteresis band and never reacts to isolated bad windows", () => {
    let state = createCrowdBudgetState();
    for (let i = 0; i < 8; i++) {
      state = evaluateCrowdBudget(state, 40);
      state = evaluateCrowdBudget(state, 28);
    }
    expect(state.maxVisitors).toBe(18);
    state = evaluateCrowdBudget(evaluateCrowdBudget(state, 40), 40);
    for (let i = 0; i < 8; i++) state = evaluateCrowdBudget(state, 28);
    expect(state.maxVisitors).toBe(14);
  });

  it("requires both good performance and cooldown before recovering one tier", () => {
    let state = createCrowdBudgetState();
    for (let i = 0; i < 4; i++) state = evaluateCrowdBudget(state, 40);
    expect(state.tier).toBe("low");
    for (let i = 0; i < 4; i++) state = evaluateCrowdBudget(state, 16);
    expect(state.tier).toBe("low");
    state = evaluateCrowdBudget(state, 16);
    expect(state.tier).toBe("moderate");
    for (let i = 0; i < 4; i++) state = evaluateCrowdBudget(state, 16);
    expect(state.tier).toBe("moderate");
    state = evaluateCrowdBudget(state, 16);
    expect(state.tier).toBe("good");
  });

  it("does not allocate a new policy state for every eligible frame", () => {
    const sampler = createCrowdBudgetSampler();
    const initial = sampler.state;
    for (let i = 0; i < 100; i++) expect(sampleCrowdBudget(sampler, 0.016, true)).toBe(initial);
    expect(sampler.frames).toBe(100);
  });

  it("ignores hidden, paused, non-play, invalid and clamped resume samples", () => {
    expect(crowdFrameEligible(0.016, true, true)).toBe(false);
    expect(crowdFrameEligible(0.016, false)).toBe(false);
    for (const dt of [0, -0.01, 0.5, 1, Infinity, NaN]) expect(crowdFrameEligible(dt, true)).toBe(false);
    expect(crowdFrameEligible(0.016, true)).toBe(true);
    const sampler = createCrowdBudgetSampler();
    sampler.state = evaluateCrowdBudget(sampler.state, 40);
    for (let i = 0; i < 100; i++) sampleCrowdBudget(sampler, 0.035, true);
    sampleCrowdBudget(sampler, 0.035, false);
    expect(sampler.elapsed).toBe(0);
    expect(sampler.frames).toBe(0);
    expect(sampler.state.poorSeconds).toBe(0);
    for (let i = 0; i < 134; i++) sampleCrowdBudget(sampler, 0.035, true);
    expect(sampler.state.tier).toBe("good");
    sampleCrowdBudget(sampler, 0.5, true);
    expect(sampler.state.poorSeconds).toBe(0);
    for (let i = 0; i < 1000; i++) sampleCrowdBudget(sampler, 0.035, false);
    expect(sampler.state.tier).toBe("good");
  });

  it("steps down on a very slow machine (frames longer than the simulation clamp)", () => {
    const sampler = createCrowdBudgetSampler();
    for (let i = 0; i < 90; i++) sampleCrowdBudget(sampler, 0.111, true); // ~9 fps for 10 s
    expect(sampler.state.tier).toBe("moderate");
    for (let i = 0; i < 90; i++) sampleCrowdBudget(sampler, 0.111, true);
    expect(sampler.state.tier).toBe("low");
  });

  it("preserves a reduced tier and cooldown across pauses without accumulating evidence", () => {
    const sampler = createCrowdBudgetSampler();
    sampler.state = evaluateCrowdBudget(evaluateCrowdBudget(sampler.state, 40), 40);
    const cooldown = sampler.state.cooldownSeconds;
    for (let i = 0; i < 1000; i++) sampleCrowdBudget(sampler, 0.016, false);
    expect(sampler.state.maxVisitors).toBe(14);
    expect(sampler.state.cooldownSeconds).toBe(cooldown);
  });
});
