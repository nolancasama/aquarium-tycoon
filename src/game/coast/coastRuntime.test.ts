import { afterEach, describe, expect, it } from "vitest";
import { clearCoast, coastRt, feedCoast, stepCoast } from "./coastRuntime";
import { newModel, newTank } from "../logic/model";
import { PENGUIN_LAND_SEPARATION } from "./motion";

afterEach(clearCoast);

function colony(station = true, count = 3) {
  const m = newModel(), t = newTank("coast-penguins", "penguins", "M");
  t.fish = Array.from({ length: count }, (_, i) => ({ id: `penguin-${i}`, species: "penguin" as const }));
  if (station) t.decor = [{ id: "station", kind: "penguinFeeder", slot: 1, variant: null }];
  m.tanks = [t];
  m.progress.coastIntroSeen = true;
  return m;
}

const runtimeTrace = () => JSON.stringify({ time: coastRt.time, food: coastRt.stationFood, animals: [...coastRt.animals.values()].map(({ m }) => ({
  id: m.id, x: m.x, y: m.y, z: m.z, mode: m.mode, area: m.area, speed: m.speed, heading: m.heading, pitch: m.pitch,
  path: m.path, feeding: m.feeding, exit: m.exit
})) });

describe("coastal feeding presentation", () => {
  it("replenishes fresh fish, consumes them at actual bites and never changes care or coins", () => {
    const m = colony(), before = JSON.stringify(m);
    feedCoast(m, "penguins");
    expect(coastRt.stationFood?.fish).toBe(9);
    for (let i = 0; i < 2400; i++) stepCoast(m, 0.1, true);
    expect(coastRt.stationFood?.fish, runtimeTrace()).toBe(0);
    expect([...coastRt.animals.values()].every((a) => !a.m.feeding), runtimeTrace()).toBe(true);
    feedCoast(m, "penguins");
    expect(coastRt.stationFood?.fish).toBe(9);
    expect(JSON.stringify(m)).toBe(before);
    clearCoast();
    expect(coastRt.stationFood).toBeNull();
  });

  it("a six-penguin colony reaches distinct station positions and finishes its meal without overlap", () => {
    const m = colony(true, 6), before = JSON.stringify(m);
    feedCoast(m, "penguins");
    expect(coastRt.stationFood?.fish).toBe(18);
    const destinations = [...coastRt.animals.values()].map((a) => a.m.feeding!.spot);
    for (let i = 0; i < destinations.length; i++) for (let j = i + 1; j < destinations.length; j++) {
      expect(Math.hypot(destinations[i].x - destinations[j].x, destinations[i].z - destinations[j].z)).toBeGreaterThanOrEqual(PENGUIN_LAND_SEPARATION);
    }
    const ate = new Set<string>();
    let minGround = Infinity;
    for (let i = 0; i < 3000; i++) {
      stepCoast(m, 0.1, true);
      const animals = [...coastRt.animals.values()];
      for (const a of animals) if (a.m.feeding?.stage === "eating") ate.add(a.m.id);
      for (let a = 0; a < animals.length; a++) for (let b = a + 1; b < animals.length; b++) {
        const first = animals[a].m, second = animals[b].m;
        if (first.area === "land" && second.area === "land") minGround = Math.min(minGround, Math.hypot(first.x - second.x, first.z - second.z));
      }
    }
    expect(ate.size, runtimeTrace()).toBe(6);
    expect(coastRt.stationFood?.fish, runtimeTrace()).toBe(0);
    expect([...coastRt.animals.values()].every((a) => !a.m.feeding), runtimeTrace()).toBe(true);
    expect(minGround, runtimeTrace()).toBeGreaterThanOrEqual(PENGUIN_LAND_SEPARATION - 1e-6);
    expect(JSON.stringify(m)).toBe(before);
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
