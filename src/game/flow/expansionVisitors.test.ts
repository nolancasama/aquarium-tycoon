import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IT_COLOR_IDS, IT_COLOR_PHRASE, ITS_IDS, ITS_IDS_BASE, type PhraseId } from "../logic/english";
import { newModel } from "../logic/model";
import { requestReward } from "../logic/requests";
import { makeRng } from "../logic/rng";
import { resetRuntime, rt } from "../runtime";
import { model, setGame } from "../store";
import type { ColorId } from "../types";
import { ask } from "./ask";
import { openTank } from "./actions";
import { helped, resetVisitors, runRequest, seedVisitors, spawnVisitor, whatColorChoices } from "./visitors";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("./actions", () => ({ openTank: vi.fn() }));
vi.mock("./ask", () => ({
  ask: vi.fn(),
  fastMode: () => false,
  say: vi.fn(async () => undefined),
  speak: vi.fn(async () => undefined),
  wait: vi.fn(async () => undefined)
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { setTimeout: vi.fn() });
  resetRuntime();
  resetVisitors();
  seedVisitors(42);
  const m = newModel();
  m.progress.stage = 8;
  m.progress.tutorial = "done";
  m.tanks[0].fish = [{ id: "animal", species: "turtle" }];
  setGame({ model: m, mode: "play", screen: "game", view: "room", request: null, prompt: null, line: null, placing: null, stageCard: null });
});

afterEach(() => {
  resetRuntime();
  resetVisitors();
  vi.unstubAllGlobals();
});

describe("Expansion 1 visitor questions", () => {
  it("offers exactly one correct colour and two distinct distractors for every colour", () => {
    for (const color of Object.keys(IT_COLOR_PHRASE) as ColorId[]) {
      for (let seed = 0; seed < 20; seed++) {
        const choices = whatColorChoices(color, makeRng(seed));
        expect(choices).toHaveLength(3);
        expect(new Set(choices).size).toBe(3);
        expect(choices.filter((id) => id === IT_COLOR_PHRASE[color])).toHaveLength(1);
        expect(choices.every((id) => IT_COLOR_IDS.includes(id))).toBe(true);
      }
    }
  });

  it("asks about the glowing animal's colour and rewards it without advancing the named goal", async () => {
    const req = { kind: "whatColor", tankId: "t1", fishId: "animal" } as const;
    const v = spawnVisitor("child", req, { atBench: true });
    vi.mocked(ask).mockImplementation(async (prompt) => {
      expect(rt.glow.fish.has("animal")).toBe(true);
      expect(prompt.question?.en).toBe("What color is it?");
      expect(prompt.options).toEqual(["itGreen"]);
      expect(prompt.judge).toBe(IT_COLOR_IDS);
      expect(prompt.choices?.filter((id) => id === "itGreen")).toHaveLength(1);
      return "itGreen";
    });
    const coins = model().coins;
    const reward = requestReward(req, model().tanks[0]);
    const outcome = await runRequest(v, req, { cancellable: true });
    expect(openTank).toHaveBeenCalledWith("t1");
    expect(outcome).toEqual({ ok: true, tankId: "t1" });
    expect(rt.glow.fish.has("animal")).toBe(false);
    await helped(v, req, outcome.tankId);
    expect(model().coins).toBe(coins + reward);
    expect(model().progress.helpedInStage).toBe(1);
    expect(model().progress.namedInStage).toBe(0);
  });

  it("keeps identification distractors familiar through Level 7 and expands them at Level 8", async () => {
    const req = { kind: "whatsThis", tankId: "t1", fishId: "animal" } as const;
    const v = spawnVisitor("child", req, { atBench: true });
    const seen = new Set<PhraseId>();
    vi.mocked(ask).mockImplementation(async (prompt) => {
      expect(prompt.choices).toHaveLength(3);
      expect(prompt.choices?.filter((id) => id === "itsTurtle")).toHaveLength(1);
      for (const id of prompt.choices ?? []) seen.add(id);
      return "itsTurtle";
    });
    for (const stage of [7, 8] as const) {
      model().progress.stage = stage;
      seen.clear();
      for (let seed = 0; seed < 20; seed++) {
        seedVisitors(seed);
        await runRequest(v, req, { cancellable: true });
      }
      expect([...seen].every((id) => (stage === 7 ? ITS_IDS_BASE : ITS_IDS).includes(id))).toBe(true);
      if (stage === 8) expect([...seen].some((id) => !ITS_IDS_BASE.includes(id))).toBe(true);
    }
  });

  it("asks the species-specific like question supplied by the request", async () => {
    const req = { kind: "chatLike", species: "octopus" } as const;
    const v = spawnVisitor("child", req, { atBench: true });
    vi.mocked(ask).mockResolvedValue("yesIDo");
    expect(await runRequest(v, req, { cancellable: true })).toEqual({ ok: true, tankId: null });
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ question: { en: "Do you like octopuses?", by: "child" } }));
  });
});
