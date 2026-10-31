import { describe, expect, it } from "vitest";
import { getGame, type GameState, type RequestUi } from "../store";
import { newModel } from "./model";
import { handCue } from "./tapHand";

function state(): GameState {
  const model = newModel();
  model.progress.tutorial = "done";
  model.progress.handShown = ["fish-shop", "place-animal", "visitor", "decor-ring", "room-navigation"];
  model.tanks[0].fish = [{ id: "blue", species: "bluetang" }];
  return { ...getGame(), model, screen: "game", mode: "play", view: "room", hall: 0, tankId: null, prompt: null, line: null, stageCard: null, request: null, waiting: null, nudge: null, panel: null, placing: null, settingsOpen: false, audioCheck: null };
}

describe("the bounded tap demonstration's eligibility", () => {
  it("shows the first Fish interaction, keeps its current showing, then remembers it", () => {
    const g = state();
    g.model.progress.tutorial = "buy";
    delete g.model.progress.handShown;
    expect(handCue(g)).toMatchObject({ id: "btn-fish-shop", kind: "dom", first: "fish-shop" });
    g.model.progress.handShown = ["fish-shop"];
    expect(handCue(g, "fish-shop")?.id).toBe("btn-fish-shop");
    expect(handCue(g)).toBeNull();
    expect(handCue({ ...g, mode: "ask" }, "fish-shop")).toBeNull();
  });
  it("never names assessed targets until tier three, and clears on success", () => {
    const g = state();
    const request: RequestUi = { visitorId: "visitor", by: "child", req: { kind: "show", color: "blue", fishOnly: true }, line: "I like blue fish!", misses: 0, status: "ready" };
    expect(handCue({ ...g, request })).toBeNull();
    expect(handCue({ ...g, request: { ...request, misses: 1 } })).toBeNull();
    expect(handCue({ ...g, request: { ...request, idleHint: true } })).toBeNull();
    const exact = { ...request, misses: 3 };
    expect(handCue({ ...g, request: exact })?.id).toBe(`tank-${g.model.tanks[0].id}`);
    expect(handCue({ ...g, view: "tank", tankId: g.model.tanks[0].id, request: exact })?.id).toBe("fish-blue");
    expect(handCue({ ...g, request: { ...exact, status: "correct" } })).toBeNull();
  });
  it("reuses Help C and the existing tutorial long-idle nudge", () => {
    const g = state();
    const nudge = { id: 5, en: "Tap Fish", target: "btn-fish-shop", tier: 1 as const };
    expect(handCue({ ...g, nudge })).toBeNull();
    expect(handCue({ ...g, nudge: { ...nudge, tier: 2 } })?.id).toBe("btn-fish-shop");
    g.model.progress.tutorial = "feed";
    expect(handCue({ ...g, nudge: { ...nudge, tier: undefined, repeated: true } })?.id).toBe("btn-fish-shop");
  });
  it("finds the first placement, visitor, free ring and room arrow from current state", () => {
    const g = state();
    g.model.progress.handShown = [];
    g.model.inv.fish = [{ id: "bagged", species: "clownfish" }];
    expect(handCue({ ...g, placing: { kind: "fish", fishId: "bagged" } })?.id).toBe(`tank-${g.model.tanks[0].id}`);
    expect(handCue({ ...g, waiting: { id: "v1", type: "child" } })?.id).toBe("visitor-v1");
    expect(handCue({ ...g, panel: "decorate", view: "tank", tankId: g.model.tanks[0].id, placing: { kind: "decor", decorId: "d1" } })?.id).toBe(`ring-${g.model.tanks[0].id}:0`);
    g.model.progress.hallOpen = true;
    expect(handCue(g)?.id).toBe("btn-hall-next");
    expect(handCue({ ...g, settingsOpen: true })).toBeNull();
  });
});
