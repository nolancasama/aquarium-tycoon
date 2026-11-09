import type { SpeciesId } from "../types";

/**
 * What each animal eats. Food is flavour and a little English, never a rule:
 * one tap of Feed always brings the right food for everyone in the tank, the
 * meter stays tank-wide, and no food can be "wrong".
 */

export type FoodId = "flakes" | "seaweed" | "shrimp" | "seafood" | "plankton";

export const FOOD: Record<FoodId, { en: string; ja: string; icon: string }> = {
  flakes: { en: "Food", ja: "えさ", icon: "🟠" },
  seaweed: { en: "Seaweed", ja: "かいそう", icon: "🌿" },
  shrimp: { en: "Shrimp", ja: "エビ", icon: "🦐" },
  seafood: { en: "Fish", ja: "さかなの きりみ", icon: "🐟" },
  plankton: { en: "Plankton", ja: "プランクトン", icon: "✨" }
};

/** First is what Feed brings for it; the rest it will also take if it finds them. */
export const DIET: Record<SpeciesId, readonly FoodId[]> = {
  blacktip: ["seafood"],
  zebrashark: ["seafood"],
  eagleray: ["seafood"],
  penguin: ["seafood"], // small whole fish
  seal: ["seafood"],
  otter: ["shrimp", "seafood"], // clams, crabs and urchins: shellfish
  clownfish: ["flakes", "shrimp"],
  bluetang: ["seaweed", "flakes"], // grazes algae
  yellowfish: ["flakes", "shrimp"], // the butterflyfish picks at small animals
  pufferfish: ["seafood", "shrimp"], // crunches shellfish
  turtle: ["seaweed"], // a green sea turtle
  seahorse: ["shrimp"], // sips tiny crustaceans
  jellyfish: ["plankton"],
  moonjelly: ["plankton"],
  spottedjelly: ["plankton"],
  seanettle: ["plankton"],
  angelfish: ["flakes", "shrimp"],
  goby: ["shrimp", "flakes"],
  chromis: ["plankton", "flakes"], // schools pick plankton from the current
  eel: ["seafood"],
  octopus: ["seafood", "shrimp"],
  crab: ["seafood", "seaweed"],
  stingray: ["seafood", "shrimp"],
  parrotfish: ["seaweed"],
  shrimp: ["flakes", "seaweed"]
};

export const eatsFood = (species: SpeciesId, food: FoodId): boolean => DIET[species].includes(food);

/** The foods Feed brings for these residents, in a stable order. */
export function foodsFor(fish: readonly { species: SpeciesId }[]): FoodId[] {
  const foods: FoodId[] = [];
  for (const { species } of fish) if (!foods.includes(DIET[species][0])) foods.push(DIET[species][0]);
  return foods.length ? foods : ["flakes"];
}

/** How a piece of food moves through the water. plankton never settles. */
export const FOOD_FALL: Record<FoodId, { sink: number; spread: number; drift: number; settles: boolean }> = {
  flakes: { sink: 0.055, spread: 1, drift: 0.05, settles: true },
  seaweed: { sink: 0.045, spread: 1.2, drift: 0.065, settles: true },
  shrimp: { sink: 0.08, spread: 1, drift: 0.03, settles: true },
  seafood: { sink: 0.17, spread: 0.8, drift: 0.008, settles: true },
  plankton: { sink: 0.012, spread: 2.2, drift: 0.04, settles: false }
};
/** Compact pellets among the flakes sink straight and fast. */
export const PELLET_SINK = 0.13;
export const PLANKTON_LIFE = 11;

type EatStyle = { seconds: number; beats: number };
const SNAP: EatStyle = { seconds: 0.35, beats: 1 };
const NIBBLE: EatStyle = { seconds: 1, beats: 3 };
const SETTLE: EatStyle = { seconds: 1.1, beats: 1 };
const EAT_STYLE: Partial<Record<SpeciesId, EatStyle>> = {
  blacktip: SNAP, zebrashark: SETTLE, eagleray: SETTLE,
  bluetang: NIBBLE, parrotfish: NIBBLE, shrimp: NIBBLE, goby: { seconds: 0.5, beats: 1 },
  turtle: { seconds: 1.2, beats: 2 }, stingray: SETTLE, crab: { seconds: 1.4, beats: 1 },
  jellyfish: { seconds: 1.5, beats: 1 }, moonjelly: { seconds: 1.5, beats: 1 },
  spottedjelly: { seconds: 1.5, beats: 1 }, seanettle: { seconds: 1.5, beats: 1 }
};

/** 0..1 feeding motion this long after a bite: grazers nibble, a ray settles
 * over its food, jellies gather slowly, and a quick fish makes one snap. */
export function eatResponse(species: SpeciesId, since: number): number {
  const { seconds, beats } = EAT_STYLE[species] ?? SNAP;
  if (since < 0 || since >= seconds) return 0;
  return Math.sin(since / seconds * Math.PI * beats) ** 2;
}
