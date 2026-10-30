import { describe, expect, it } from "vitest";
import { newModel } from "./model";
import { tutorialGuide } from "./tutorialGuide";

function state(step: ReturnType<typeof newModel>["progress"]["tutorial"]): Parameters<typeof tutorialGuide>[0] {
  const model = newModel();
  model.progress.tutorial = step;
  return { model, mode: "play", prompt: null, line: null, request: null, stageCard: null, settingsOpen: false, panel: null, placing: null, waiting: null };
}

describe("state-derived tutorial guide", () => {
  it("shows the interactive Fish step on fresh and resumed buy states", () => {
    const g = state("buy");
    expect(tutorialGuide(g)?.target).toBe("btn-fish-shop");
    expect(tutorialGuide({ ...g, mode: "ask" })).toBeNull();
    g.model.inv.fish.push({ id: "f", species: "clownfish" });
    expect(tutorialGuide(g)).toBeNull();
  });

  it("follows placement, care and the waiting visitor", () => {
    expect(tutorialGuide({ ...state("place"), placing: { kind: "fish", fishId: "f" } })?.target).toBe("tank-A");
    const g = state("feed");
    expect(tutorialGuide(g)?.target).toBe("btn-feed");
    g.model.progress.fedOnce = true;
    expect(tutorialGuide(g)).toBeNull();
    expect(tutorialGuide({ ...state("visitor"), waiting: { id: "v", type: "child" } })?.target).toBe("chip-visitor");
    expect(tutorialGuide(state("visitor"))).toBeNull();
  });

  it("switches tray guidance to circles only while an item is carried", () => {
    const g = { ...state("decorate"), panel: "decorate" as const };
    expect(tutorialGuide(g)?.target).toBe("tray");
    expect(tutorialGuide({ ...g, placing: { kind: "decor", decorId: "d" } })?.target).toBe("decor-rings");
    g.model.tanks[0].decor.push({ id: "d", kind: "plant", variant: "small", slot: 0 });
    expect(tutorialGuide(g)).toBeNull();
  });
});
