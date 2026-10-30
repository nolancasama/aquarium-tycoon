import { describe, expect, it } from "vitest";
import { newModel, newTank } from "./model";
import { requestStep } from "./requestGuide";
import type { RequestUi } from "../store";

function state() {
  const model = newModel();
  model.tanks[0].fish = [{ id: "blue", species: "bluetang" }];
  model.tanks.push(newTank("other", "big", "B"));
  model.tanks[1].fish = [{ id: "orange", species: "clownfish" }];
  const request: RequestUi = { visitorId: "v1", by: "child", req: { kind: "show", color: "blue", fishOnly: true }, line: "I like blue fish!", misses: 0, status: "ready" };
  return { model, request, view: "room" as const, tankId: null as string | null };
}

describe("state-derived visitor guidance", () => {
  it("moves from visitor to tank to fish without revealing a tier-one answer", () => {
    const s = state();
    expect(requestStep({ ...s, request: null, waiting: { id: "v1" } })?.step).toBe("visitor");
    expect(requestStep(s)).toMatchObject({ step: "tank", tier: 1, tankIds: [], fishIds: [] });
    expect(requestStep({ ...s, view: "tank", tankId: s.model.tanks[0].id })).toMatchObject({ step: "fish", tier: 1, tankIds: [], fishIds: [] });
  });
  it("uses wrong taps or idle for tank guidance, and three wrong taps for exact targets", () => {
    const s = state();
    expect(requestStep({ ...s, request: { ...s.request, misses: 1 } })).toMatchObject({ tier: 2, tankIds: [s.model.tanks[0].id], fishIds: [] });
    expect(requestStep({ ...s, request: { ...s.request, idleHint: true } })?.tier).toBe(2);
    expect(requestStep({ ...s, view: "tank", tankId: "other", request: { ...s.request, misses: 3 } })?.step).toBe("tank");
    expect(requestStep({ ...s, view: "tank", tankId: s.model.tanks[0].id, request: { ...s.request, misses: 3 } })).toMatchObject({ step: "exact", fishIds: ["blue"], exact: { type: "fish", species: "bluetang" } });
  });
  it("clears immediately on success/cancel and derives animal or decoration actions", () => {
    const s = state();
    expect(requestStep({ ...s, request: null })).toBeNull();
    expect(requestStep({ ...s, request: { ...s.request, status: "correct" } })).toBeNull();
    expect(requestStep({ ...s, view: "tank", tankId: s.model.tanks[0].id, request: { ...s.request, req: { kind: "showAnimal", species: "turtle" } } })?.step).toBe("animal");
    expect(requestStep({ ...s, view: "tank", tankId: s.model.tanks[0].id, request: { ...s.request, req: { kind: "show", color: "blue", fishOnly: false } } })?.step).toBe("thing");
  });
  it("highlights matching decorations only at tier three, including after a tank change", () => {
    const s = state();
    s.model.tanks[1].decor = [{ id: "coral", kind: "coral", variant: "red", slot: 0 }];
    const request: RequestUi = { ...s.request, req: { kind: "show", color: "red", fishOnly: false }, misses: 1 };
    expect(requestStep({ ...s, request })).toMatchObject({ tier: 2, tankIds: ["other"], decorIds: [] });
    expect(requestStep({ ...s, view: "tank", tankId: "other", request: { ...request, misses: 3 } })).toMatchObject({ step: "exact", decorIds: ["other:0"], exact: { type: "decor", kind: "coral", variant: "red" } });
  });
});
