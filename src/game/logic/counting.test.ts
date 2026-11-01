import { afterEach, describe, expect, it } from "vitest";
import { countedFish, countLabelPosition, COUNT_LABEL_SIZE, visibleCountNumbers } from "./counting";
import { TANKS } from "../data/tanks";
import { clearGlow, resetRuntime, rt, startCount } from "../runtime";
import type { SpeciesId } from "../types";

const fish = [
  { id: "orange", species: "clownfish" as const },
  { id: "blue", species: "bluetang" as const },
  { id: "yellow", species: "yellowfish" as const }
];
const numbers = [{ fishId: "orange", n: 1 }, { fishId: "blue", n: 2 }, { fishId: "yellow", n: 3 }];

describe("count label position", () => {
  it("keeps the whole label inside every tank at the surface and side walls", () => {
    for (const tank of Object.values(TANKS)) {
      for (const x of [-tank.w, tank.w]) {
        const position = countLabelPosition(x, tank.h + 0.2, tank);
        expect(position.y + COUNT_LABEL_SIZE / 2).toBeLessThan(tank.h);
        expect(Math.abs(position.x) + COUNT_LABEL_SIZE / 2).toBeLessThan(tank.w / 2);
      }
    }
  });
});

afterEach(() => resetRuntime());

describe("counted fish", () => {
  it("assigns consecutive numbers in tank order without changing the animals", () => {
    const original = fish.map((f) => ({ ...f }));
    expect(countedFish(fish)).toEqual(numbers);
    expect(countedFish([fish[2], fish[0]])).toEqual([{ fishId: "yellow", n: 1 }, { fishId: "orange", n: 2 }]);
    expect(fish).toEqual(original);
  });

  it("excludes turtles, jellies, other non-fish animals and schools before numbering", () => {
    const excluded: SpeciesId[] = ["turtle", "seahorse", "jellyfish", "eel", "octopus", "crab", "stingray", "moonjelly", "spottedjelly", "seanettle", "chromis"];
    const animals = excluded.map((species) => ({ id: species, species }));
    expect(countedFish([fish[0], ...animals, fish[1]])).toEqual(numbers.slice(0, 2));
    expect(countedFish(animals)).toEqual([]);
    expect(countedFish([])).toEqual([]);
  });

  it("includes later individual fish species in the same numbering", () => {
    const species: SpeciesId[] = ["pufferfish", "angelfish", "goby"];
    expect(countedFish(species.map((species) => ({ id: species, species }))))
      .toEqual(species.map((fishId, i) => ({ fishId, n: i + 1 })));
  });
});

describe("count sequence", () => {
  it("shows the first number immediately and adds each later number after a beat", () => {
    const sequence = { numbers, t0: 0 };
    expect(visibleCountNumbers(sequence, -0.01)).toEqual([]);
    expect(visibleCountNumbers(sequence, 0)).toEqual(numbers.slice(0, 1));
    expect(visibleCountNumbers(sequence, 0.64)).toEqual(numbers.slice(0, 1));
    expect(visibleCountNumbers(sequence, 0.65)).toEqual(numbers.slice(0, 2));
    expect(visibleCountNumbers(sequence, 1.29)).toEqual(numbers.slice(0, 2));
    expect(visibleCountNumbers(sequence, 1.30)).toEqual(numbers);
    expect(visibleCountNumbers(sequence, 600)).toEqual(numbers);
  });

  it("shows nothing after the sequence is cleared", () => {
    expect(visibleCountNumbers(null, 600)).toEqual([]);
  });

  it("replays from one using the current runtime time", () => {
    rt.time = 10;
    const first = startCount("t1", fish);
    expect(first).toMatchObject({ tankId: "t1", t0: 10, numbers });
    expect(visibleCountNumbers(rt.countGlow, 12)).toEqual(numbers);
    rt.time = 12;
    startCount("t1", fish);
    expect(visibleCountNumbers(rt.countGlow, 12)).toEqual(numbers.slice(0, 1));
  });

  it("clears all labels on activity cleanup and a new game", () => {
    startCount("t1", fish);
    clearGlow();
    expect(rt.countGlow).toBeNull();
    expect(visibleCountNumbers(rt.countGlow, rt.time)).toEqual([]);
    startCount("t1", fish);
    resetRuntime();
    expect(rt.countGlow).toBeNull();
    expect(visibleCountNumbers(rt.countGlow, rt.time)).toEqual([]);
  });
});
