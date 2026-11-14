import { afterEach, describe, expect, it } from "vitest";
import { ARRIVAL, clearCoast, coastRt, feedCoast, queuePenguinArrival, stepCoast } from "./coastRuntime";
import { keeperRt, startKeeperFeed } from "./keeper";
import { PENGUIN_STAFF_DOOR } from "../data/coast";
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

describe("a bought penguin arriving through the staff door", () => {
  const withNewcomer = (m: ReturnType<typeof colony>) => ({ ...m, tanks: m.tanks.map((t) => ({ ...t, fish: [...t.fish, { id: "f777", species: "penguin" as const }] })) });

  it("waits in the corridor while the door opens, waddles out clear of the others, then the door closes", () => {
    const before = colony(false, 3);
    for (let i = 0; i < 40; i++) stepCoast(before, 0.1, true);
    const m = withNewcomer(before);
    queuePenguinArrival("f777");
    stepCoast(m, 0.05, true);
    const bird = coastRt.animals.get("f777")!.m, door = PENGUIN_STAFF_DOOR;
    expect(bird.mode).toBe("arrive");
    expect(bird.z).toBeLessThan(door.z - 0.5); // inside the dark corridor, not in the exhibit
    expect(keeperRt.arrival.phase).toBe("doorOpening");
    expect(startKeeperFeed(m)).toBe(false); // the keeper never meets the newcomer in the doorway
    const phases: string[] = [];
    let minGap = Infinity, movedBeforeOpen = 0, closedOnBird = false;
    for (let i = 0; i < 600 && (keeperRt.arrival.phase !== "idle" || phases.length === 0); i++) {
      const z = bird.z;
      stepCoast(m, 0.05, true);
      if (phases[phases.length - 1] !== keeperRt.arrival.phase) phases.push(keeperRt.arrival.phase);
      if (keeperRt.arrival.door < 1 && keeperRt.arrival.phase === "doorOpening") movedBeforeOpen += Math.abs(bird.z - z);
      if (keeperRt.arrival.phase === "doorClosing" && bird.z < ARRIVAL.threshold) closedOnBird = true;
      for (const other of coastRt.animals.values()) if (other.m !== bird && other.m.area !== "water") minGap = Math.min(minGap, Math.hypot(other.m.x - bird.x, other.m.z - bird.z));
    }
    // The leaf closes behind the bird while it finishes stepping clear of the doorway.
    for (let i = 0; i < 200 && bird.mode === "arrive"; i++) {
      stepCoast(m, 0.05, true);
      for (const other of coastRt.animals.values()) if (other.m !== bird && other.m.area !== "water") minGap = Math.min(minGap, Math.hypot(other.m.x - bird.x, other.m.z - bird.z));
    }
    expect(phases).toEqual(["doorOpening", "walkOut", "doorClosing", "idle"]);
    expect(movedBeforeOpen).toBe(0);
    expect(closedOnBird).toBe(false);
    expect(keeperRt.arrival.door).toBe(0);
    expect(bird.mode).not.toBe("arrive");
    expect(bird.area).toBe("land");
    expect(bird.z).toBeGreaterThan(door.z + 1);
    expect(minGap).toBeGreaterThanOrEqual(PENGUIN_LAND_SEPARATION - 1e-6);
    expect(startKeeperFeed(m)).toBe(true);
  });

  it("a bird resting right outside the door moves off, so the newcomer comes out promptly", () => {
    const base = colony(false, 2);
    stepCoast(base, 0.05, true);
    const sitter = coastRt.animals.get("penguin-0")!.m;
    // Resting on the doorway apron, in the newcomer's way, for a long time.
    Object.assign(sitter, { x: PENGUIN_STAFF_DOOR.x, z: ARRIVAL.out + 0.1, y: 2.35, mode: "rest", area: "land", until: 1e9, path: [] });
    const m = withNewcomer(base);
    queuePenguinArrival("f777");
    let t = 0;
    for (; t < 30 && (keeperRt.arrival.phase !== "idle" || t < 0.2); t += 0.05) stepCoast(m, 0.05, true);
    expect(keeperRt.arrival.phase).toBe("idle");
    expect(t).toBeLessThan(10);
    const bird = coastRt.animals.get("f777")!.m;
    expect(Math.hypot(bird.x - sitter.x, bird.z - sitter.z)).toBeGreaterThanOrEqual(PENGUIN_LAND_SEPARATION - 1e-6);
  });

  it("leaving mid-arrival leaves the bought bird standing on the shelf; the door is closed on return", () => {
    const m = withNewcomer(colony(false, 2));
    queuePenguinArrival("f777");
    for (let i = 0; i < 20; i++) stepCoast(m, 0.05, true);
    expect(keeperRt.arrival.phase).not.toBe("idle");
    stepCoast(m, 0.05, false);
    const bird = coastRt.animals.get("f777")!.m;
    expect(bird.mode).toBe("rest");
    expect(bird.area).toBe("land");
    expect(bird.z).toBeGreaterThan(PENGUIN_STAFF_DOOR.z + 1);
    expect(keeperRt.arrival.phase).toBe("idle");
    expect(keeperRt.arrival.door).toBe(0);
    expect(coastRt.arrivals).toEqual([]);
    for (let i = 0; i < 20; i++) stepCoast(m, 0.05, true);
    expect(keeperRt.arrival.phase).toBe("idle");
  });

  it("an arrival whose penguin disappears (a preview ends) just closes the door", () => {
    const base = colony(false, 2), m = withNewcomer(base);
    queuePenguinArrival("f777");
    for (let i = 0; i < 25; i++) stepCoast(m, 0.05, true);
    expect(keeperRt.arrival.phase).toBe("walkOut");
    for (let i = 0; i < 40; i++) stepCoast(base, 0.05, true);
    expect(coastRt.animals.has("f777")).toBe(false);
    expect(keeperRt.arrival.phase).toBe("idle");
    expect(keeperRt.arrival.door).toBe(0);
  });
});
