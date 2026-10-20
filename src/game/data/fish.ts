import type { ColorId, DecorKind, SpeciesId, StageId, TankType } from "../types";

/** How an animal moves and is drawn. */
export type BodyStyle = "fish" | "puffer" | "upright" | "jelly" | "turtle";

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  /** "fish": bought by colour at the fish counter. "animal": by name at the sea-animal counter. */
  kind: "fish" | "animal";
  color: ColorId;
  /** The animal word ("turtle") and its plural ("turtles") for requests and shopping. */
  word: string;
  plural: string;
  price: number;
  /** Level from which it is sold (the Yellow Fish is the Stage 2 reward, so Level 3). */
  fromStage: StageId;
  /** Sold only once the Ocean Hall is open. */
  needsHall?: boolean;
  /** Tank types it can live in. */
  habitat: TankType[];
  /** Lives only with its own kind (jellyfish sting fish). */
  solitary?: boolean;
  /** Body length (m). */
  length: number;
  /** Collision / boundary radius (m). */
  radius: number;
  /** Cruising speed (m/s) and steering. */
  speed: number;
  turn: number;
  /** Seconds between new wander targets (min, max). */
  wander: [number, number];
  /** Preferred depth band as a fraction of the water height (0 = sand, 1 = surface). */
  depth: [number, number];
  /** Tail beat (or flipper / bell pulse) frequency (Hz) and body-bend amplitude. */
  tailHz: number;
  tailAmp: number;
  /** How darty the motion is: bursts of speed (0 = smooth glider). */
  burst: number;
  /** Favourite decoration kind, or the lamp upgrade. */
  likes: DecorKind | "lamp";
  /** "I like coral!" when tapped. */
  likesLine: string;
  /** TTS voice of the animal. */
  voice: { pitch: number; rate: number };
  body: BodyStyle;
}

const ANY: TankType[] = ["small", "big", "tall", "ocean"];

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  clownfish: {
    id: "clownfish",
    name: "Clownfish",
    kind: "fish",
    color: "orange",
    word: "fish",
    plural: "fish",
    price: 20,
    fromStage: 1,
    habitat: ANY,
    length: 0.22,
    radius: 0.09,
    speed: 0.26,
    turn: 3.2,
    wander: [1.2, 2.6],
    depth: [0.12, 0.55],
    tailHz: 3.4,
    tailAmp: 0.32,
    burst: 0.6,
    likes: "coral",
    likesLine: "I like coral!",
    voice: { pitch: 1.5, rate: 1 },
    body: "fish"
  },
  bluetang: {
    id: "bluetang",
    name: "Blue Tang",
    kind: "fish",
    color: "blue",
    word: "fish",
    plural: "fish",
    price: 30,
    fromStage: 1,
    habitat: ANY,
    length: 0.3,
    radius: 0.12,
    speed: 0.3,
    turn: 1.6,
    wander: [2.4, 4.2],
    depth: [0.35, 0.75],
    tailHz: 1.9,
    tailAmp: 0.22,
    burst: 0,
    likes: "plant",
    likesLine: "I like plants!",
    voice: { pitch: 1.2, rate: 0.95 },
    body: "fish"
  },
  yellowfish: {
    id: "yellowfish",
    name: "Yellow Fish",
    kind: "fish",
    color: "yellow",
    word: "fish",
    plural: "fish",
    price: 40,
    fromStage: 3,
    habitat: ANY,
    length: 0.2,
    radius: 0.09,
    speed: 0.38,
    turn: 4.2,
    wander: [0.7, 1.6],
    depth: [0.5, 0.88],
    tailHz: 4.2,
    tailAmp: 0.28,
    burst: 1,
    likes: "rock",
    likesLine: "I like rocks!",
    voice: { pitch: 1.7, rate: 1.05 },
    body: "fish"
  },
  pufferfish: {
    id: "pufferfish",
    name: "Pufferfish",
    kind: "fish",
    color: "white",
    word: "pufferfish",
    plural: "pufferfish",
    price: 35,
    fromStage: 6,
    habitat: ANY,
    length: 0.2,
    radius: 0.1,
    speed: 0.2,
    turn: 2.4,
    wander: [1.5, 3],
    depth: [0.2, 0.7],
    tailHz: 3,
    tailAmp: 0.25,
    burst: 0.3,
    likes: "rock",
    likesLine: "I like rocks!",
    voice: { pitch: 1.4, rate: 0.95 },
    body: "puffer"
  },
  turtle: {
    id: "turtle",
    name: "Sea Turtle",
    kind: "animal",
    color: "green",
    word: "turtle",
    plural: "turtles",
    price: 60,
    fromStage: 6,
    needsHall: true,
    habitat: ["ocean"],
    length: 0.55,
    radius: 0.22,
    speed: 0.22,
    turn: 1.0,
    wander: [3, 5],
    depth: [0.25, 0.8],
    tailHz: 0.9,
    tailAmp: 0,
    burst: 0,
    likes: "plant",
    likesLine: "I like plants!",
    voice: { pitch: 0.9, rate: 0.85 },
    body: "turtle"
  },
  seahorse: {
    id: "seahorse",
    name: "Seahorse",
    kind: "animal",
    color: "pink",
    word: "seahorse",
    plural: "seahorses",
    price: 40,
    fromStage: 7,
    habitat: ["tall"],
    length: 0.2,
    radius: 0.07,
    speed: 0.07,
    turn: 1.4,
    wander: [2.5, 4.5],
    depth: [0.2, 0.8],
    tailHz: 2.5,
    tailAmp: 0.1,
    burst: 0,
    likes: "plant",
    likesLine: "I like plants!",
    voice: { pitch: 1.6, rate: 0.9 },
    body: "upright"
  },
  jellyfish: {
    id: "jellyfish",
    name: "Jellyfish",
    kind: "animal",
    color: "purple",
    word: "jellyfish",
    plural: "jellyfish",
    price: 45,
    fromStage: 7,
    habitat: ["tall"],
    solitary: true,
    length: 0.22,
    radius: 0.12,
    speed: 0.05,
    turn: 0.6,
    wander: [3, 6],
    depth: [0.2, 0.95],
    tailHz: 0.7,
    tailAmp: 0,
    burst: 0,
    likes: "lamp",
    likesLine: "I like the light!",
    voice: { pitch: 1.3, rate: 0.8 },
    body: "jelly"
  }
};

export const SPECIES_ORDER: SpeciesId[] = ["clownfish", "bluetang", "yellowfish", "pufferfish", "turtle", "seahorse", "jellyfish"];
export const FISH_ORDER = SPECIES_ORDER.filter((s) => SPECIES[s].kind === "fish");
export const ANIMAL_ORDER = SPECIES_ORDER.filter((s) => SPECIES[s].kind === "animal");

/** Fish are bought by colour ("Blue, please!"). */
export const SPECIES_BY_COLOR: Partial<Record<ColorId, SpeciesId>> = {
  orange: "clownfish",
  blue: "bluetang",
  yellow: "yellowfish",
  white: "pufferfish"
};
