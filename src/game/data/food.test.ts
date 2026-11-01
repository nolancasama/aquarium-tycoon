import { describe, expect, it } from "vitest";
import { DIET, FOOD, FOOD_FALL, eatResponse, eatsFood, foodsFor } from "./food";
import { SPECIES } from "./fish";
import type { SpeciesId } from "../types";

const ALL = Object.keys(SPECIES) as SpeciesId[];

describe("species diets", () => {
  it("gives every animal a food with an English word", () => {
    for (const species of ALL) {
      expect(DIET[species].length).toBeGreaterThan(0);
      for (const food of DIET[species]) expect(FOOD[food].en).toBeTruthy();
    }
  });
  it("feeds animals what they really eat", () => {
    for (const jelly of ["jellyfish", "moonjelly", "spottedjelly", "seanettle"] as const) expect(DIET[jelly]).toEqual(["plankton"]);
    expect(DIET.eel[0]).toBe("seafood");
    expect(DIET.octopus[0]).toBe("seafood");
    expect(DIET.seahorse[0]).toBe("shrimp");
    expect(DIET.parrotfish[0]).toBe("seaweed");
    expect(eatsFood("eel", "flakes")).toBe(false);
    expect(eatsFood("clownfish", "flakes")).toBe(true);
    expect(eatsFood("turtle", "seafood")).toBe(false);
  });
  it("brings each resident's first food once, and something for an empty tank", () => {
    expect(foodsFor([{ species: "clownfish" }, { species: "angelfish" }])).toEqual(["flakes"]);
    expect(foodsFor([{ species: "clownfish" }, { species: "bluetang" }, { species: "eel" }])).toEqual(["flakes", "seaweed", "seafood"]);
    expect(foodsFor([])).toEqual(["flakes"]);
  });
  it("every animal can eat what Feed brings for its own tank", () => {
    for (const species of ALL) expect(eatsFood(species, foodsFor([{ species }])[0])).toBe(true);
  });
  it("foods move differently through the water", () => {
    expect(FOOD_FALL.seafood.sink).toBeGreaterThan(FOOD_FALL.flakes.sink * 2);
    expect(FOOD_FALL.plankton.settles).toBe(false);
    expect(FOOD_FALL.plankton.sink).toBeLessThan(FOOD_FALL.seaweed.sink);
  });
});

describe("feeding motion", () => {
  const peaks = (species: SpeciesId) => {
    let count = 0, a = 0, b = 0;
    for (let t = 0; t < 2; t += 0.005) {
      const c = eatResponse(species, t);
      if (b > a && b > c && b > 0.5) count++;
      a = b; b = c;
    }
    return count;
  };
  const length = (species: SpeciesId) => {
    let last = 0;
    for (let t = 0; t < 3; t += 0.01) if (eatResponse(species, t) > 0.001) last = t;
    return last;
  };
  it("grazers nibble repeatedly where a quick fish snaps once", () => {
    expect(peaks("parrotfish")).toBe(3);
    expect(peaks("bluetang")).toBe(3);
    expect(peaks("clownfish")).toBe(1);
    expect(peaks("turtle")).toBe(2);
  });
  it("a ray and a jelly respond slowly compared with a snap", () => {
    expect(length("stingray")).toBeGreaterThan(length("clownfish") * 2.5);
    expect(length("moonjelly")).toBeGreaterThan(length("stingray"));
  });
  it("is at rest outside the motion", () => {
    expect(eatResponse("clownfish", -1)).toBe(0);
    expect(eatResponse("clownfish", 10)).toBe(0);
  });
});
