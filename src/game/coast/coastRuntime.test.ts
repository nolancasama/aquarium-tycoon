import { afterEach, describe, expect, it } from "vitest";
import { clearCoast, coastRt, feedCoast, stepCoast } from "./coastRuntime";
import { newModel, newTank } from "../logic/model";

afterEach(clearCoast);

function colony(station = true) {
  const m = newModel(), t = newTank("coast-penguins", "penguins", "M");
  t.fish = [0, 1, 2].map((i) => ({ id: `penguin-${i}`, species: "penguin" as const }));
  if (station) t.decor = [{ id: "station", kind: "penguinFeeder", slot: 1, variant: null }];
  m.tanks = [t];
  m.progress.coastIntroSeen = true;
  return m;
}

describe("coastal feeding presentation", () => {
  it("replenishes fresh fish, consumes them at actual bites and never changes care or coins", () => {
    const m = colony(), before = JSON.stringify(m);
    feedCoast(m, "penguins");
    expect(coastRt.stationFood?.fish).toBe(9);
    for (let i = 0; i < 900; i++) stepCoast(m, 0.1, true);
    expect(coastRt.stationFood?.fish).toBe(0);
    expect([...coastRt.animals.values()].every((a) => !a.m.feeding)).toBe(true);
    feedCoast(m, "penguins");
    expect(coastRt.stationFood?.fish).toBe(9);
    expect(JSON.stringify(m)).toBe(before);
    clearCoast();
    expect(coastRt.stationFood).toBeNull();
  });

  it("keeps the existing feeding fallback without a station", () => {
    feedCoast(colony(false), "penguins");
    expect(coastRt.stationFood).toBeNull();
    expect([...coastRt.animals.values()].every((a) => !a.m.feeding)).toBe(true);
    expect(coastRt.fedAt.penguins).toBe(coastRt.time);
  });

  it("clears a removed station and cancels its pending meal", () => {
    const m = colony();
    feedCoast(m, "penguins");
    m.tanks[0].decor = [];
    stepCoast(m, 0.1, true);
    expect(coastRt.stationFood).toBeNull();
    expect([...coastRt.animals.values()].every((a) => !a.m.feeding)).toBe(true);
  });
});
