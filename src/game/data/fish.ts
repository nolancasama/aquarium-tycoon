import type { ColorId, DecorKind, SpeciesId, StageId, TankType } from "../types";

/** How an animal is drawn. */
export type BodyStyle = "fish" | "puffer" | "upright" | "jelly" | "turtle" | "school" | "eel" | "octopus" | "crab" | "ray";

/**
 * How an animal moves (logic/behavior.ts):
 * swim: free steering (logic/swim.ts). perch: rests on the sand, darts to a new spot.
 * school: one record is a group of `school` fish that follow their leader.
 * glide: slow wide turns low over the sand. walk: along the sand only.
 * crawl: over sand and rockwork, now and then exploring. den: rests in a den
 * mouth, head out, and makes short trips. drift: pulses and sinks, carried by
 * the tank's current.
 */
export type Movement = "swim" | "perch" | "school" | "glide" | "walk" | "crawl" | "den" | "drift";

/** Why a tank type is wrong for an animal (shown to the student as "Needs a ___!"). */
export type HomeNeed = "bigger" | "rocky" | "jelly" | "ocean" | "tall";

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  /** Japanese name for cards and help (never assessed). */
  ja: string;
  /** "fish": a fish ("It's a fish."). "animal": any other sea animal, named by its word. */
  kind: "fish" | "animal";
  /** Where it is ordered: fish by colour, sea animals by name, jellyfish by name then colour. */
  counter: "fish" | "animal" | "jelly";
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
  /** The hint when a tank type is not in its habitat. */
  needs: HomeNeed;
  /** Jellyfish live only with jellyfish (they sting other animals). */
  group?: "jelly";
  /** Capacity places it takes (a school or a stingray takes two). */
  space?: number;
  /** A school: how many fish one purchase brings. */
  school?: number;
  movement: Movement;
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
  /** Favourite decoration kind, or the lamp upgrade (a jelly column's display light counts too). */
  likes: DecorKind | "lamp";
  /** "I like coral!" when tapped. */
  likesLine: string;
  /** TTS voice of the animal. */
  voice: { pitch: number; rate: number };
  body: BodyStyle;
}

/** Every tank a reef fish can live in (not the jelly column, not the cave with its eels). */
const ANY: TankType[] = ["small", "big", "tall", "ocean", "hex", "panorama"];

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  clownfish: {
    id: "clownfish",
    name: "Clownfish",
    ja: "クマノミ",
    kind: "fish",
    counter: "fish",
    needs: "bigger",
    movement: "swim",
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
    ja: "ナンヨウハギ",
    kind: "fish",
    counter: "fish",
    needs: "bigger",
    movement: "swim",
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
    // The Yellow Fish is drawn as a longnose butterflyfish (snout, eye band, false eye-spot).
    name: "Butterflyfish",
    ja: "チョウチョウウオ",
    kind: "fish",
    counter: "fish",
    needs: "bigger",
    movement: "swim",
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
    ja: "フグ",
    kind: "fish",
    counter: "fish",
    needs: "bigger",
    movement: "swim",
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
    ja: "ウミガメ",
    kind: "animal",
    counter: "animal",
    needs: "ocean",
    movement: "swim",
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
    ja: "タツノオトシゴ",
    kind: "animal",
    counter: "animal",
    needs: "tall",
    movement: "swim",
    color: "pink",
    word: "seahorse",
    plural: "seahorses",
    price: 40,
    fromStage: 7,
    habitat: ["tall", "hex"],
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
    ja: "クラゲ",
    kind: "animal",
    counter: "jelly",
    needs: "jelly",
    movement: "drift",
    color: "purple",
    word: "jellyfish",
    plural: "jellyfish",
    price: 45,
    fromStage: 7,
    habitat: ["tall", "cylinder"],
    group: "jelly",
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
  },
  // ---- Expansion 1 (Level 8).
  angelfish: {
    id: "angelfish",
    name: "Angelfish",
    ja: "エンゼルフィッシュ",
    kind: "fish",
    counter: "fish",
    needs: "bigger",
    movement: "swim",
    color: "purple",
    word: "fish",
    plural: "fish",
    price: 45,
    fromStage: 8,
    habitat: ["big", "tall", "ocean", "hex", "panorama"],
    length: 0.26,
    radius: 0.12,
    speed: 0.16,
    turn: 1.2,
    wander: [3, 5],
    depth: [0.35, 0.85],
    tailHz: 1.4,
    tailAmp: 0.16,
    burst: 0,
    likes: "plant",
    likesLine: "I like plants!",
    voice: { pitch: 1.35, rate: 0.9 },
    body: "fish"
  },
  goby: {
    id: "goby",
    name: "Goby",
    ja: "ハゼ",
    kind: "fish",
    counter: "fish",
    needs: "bigger",
    movement: "perch",
    color: "red",
    word: "fish",
    plural: "fish",
    price: 25,
    fromStage: 8,
    habitat: ["small", "big", "tall", "ocean", "hex", "panorama", "cave"],
    length: 0.14,
    radius: 0.06,
    speed: 0.3,
    turn: 5,
    wander: [2, 4],
    depth: [0, 0.15],
    tailHz: 5,
    tailAmp: 0.3,
    burst: 1,
    likes: "rock",
    likesLine: "I like rocks!",
    voice: { pitch: 1.8, rate: 1.1 },
    body: "fish"
  },
  chromis: {
    id: "chromis",
    name: "Green Chromis",
    ja: "デバスズメダイ (むれ)",
    kind: "fish",
    counter: "fish",
    needs: "bigger",
    movement: "school",
    school: 6,
    space: 2,
    color: "green",
    word: "fish",
    plural: "fish",
    price: 40,
    fromStage: 8,
    habitat: ["big", "ocean", "panorama"],
    // One fish of the school is 0.1 m; the school keeps within ~0.18 m of its leader.
    length: 0.1,
    radius: 0.18,
    speed: 0.28,
    turn: 2.5,
    wander: [2, 3.5],
    depth: [0.4, 0.85],
    tailHz: 4.5,
    tailAmp: 0.3,
    burst: 0.2,
    likes: "coral",
    likesLine: "I like coral!",
    voice: { pitch: 1.7, rate: 1.05 },
    body: "school"
  },
  eel: {
    id: "eel",
    name: "Moray Eel",
    ja: "ウツボ",
    kind: "animal",
    counter: "animal",
    needs: "rocky",
    movement: "den",
    color: "green",
    word: "eel",
    plural: "eels",
    price: 60,
    fromStage: 8,
    habitat: ["cave"],
    length: 0.7,
    radius: 0.07,
    speed: 0.12,
    turn: 1.5,
    wander: [6, 12],
    depth: [0, 0.4],
    tailHz: 0.8,
    tailAmp: 0.3,
    burst: 0,
    likes: "cave",
    likesLine: "I like caves!",
    voice: { pitch: 0.8, rate: 0.8 },
    body: "eel"
  },
  octopus: {
    id: "octopus",
    name: "Octopus",
    ja: "タコ",
    kind: "animal",
    counter: "animal",
    needs: "rocky",
    movement: "crawl",
    color: "orange",
    word: "octopus",
    plural: "octopuses",
    price: 70,
    fromStage: 8,
    habitat: ["cave"],
    length: 0.3,
    radius: 0.12,
    speed: 0.08,
    turn: 1.2,
    wander: [4, 8],
    depth: [0, 0.6],
    tailHz: 0.6,
    tailAmp: 0,
    burst: 0,
    likes: "shell",
    likesLine: "I like shells!",
    voice: { pitch: 1.1, rate: 0.85 },
    body: "octopus"
  },
  crab: {
    id: "crab",
    name: "Crab",
    ja: "カニ",
    kind: "animal",
    counter: "animal",
    needs: "bigger",
    movement: "walk",
    color: "red",
    word: "crab",
    plural: "crabs",
    price: 30,
    fromStage: 8,
    habitat: ["cave", "big", "ocean", "panorama"],
    length: 0.16,
    radius: 0.09,
    speed: 0.1,
    turn: 3,
    wander: [2, 5],
    depth: [0, 0],
    tailHz: 3,
    tailAmp: 0,
    burst: 0,
    likes: "rock",
    likesLine: "I like rocks!",
    voice: { pitch: 1.5, rate: 1.1 },
    body: "crab"
  },
  stingray: {
    id: "stingray",
    name: "Stingray",
    ja: "エイ",
    kind: "animal",
    counter: "animal",
    needs: "bigger",
    movement: "glide",
    space: 2,
    color: "blue",
    word: "stingray",
    plural: "stingrays",
    price: 80,
    fromStage: 8,
    habitat: ["panorama", "ocean"],
    // Disc width.
    length: 0.5,
    radius: 0.24,
    speed: 0.16,
    turn: 0.8,
    wander: [4, 7],
    depth: [0.02, 0.3],
    tailHz: 0.6,
    tailAmp: 0,
    burst: 0,
    likes: "starfish",
    likesLine: "I like starfish!",
    voice: { pitch: 1.0, rate: 0.85 },
    body: "ray"
  },
  moonjelly: {
    id: "moonjelly",
    name: "Moon Jellyfish",
    ja: "ミズクラゲ",
    kind: "animal",
    counter: "jelly",
    needs: "jelly",
    movement: "drift",
    group: "jelly",
    color: "white",
    word: "jellyfish",
    plural: "jellyfish",
    price: 45,
    fromStage: 8,
    habitat: ["cylinder"],
    length: 0.24,
    radius: 0.13,
    speed: 0.04,
    turn: 0.5,
    wander: [3, 6],
    depth: [0.2, 0.95],
    tailHz: 0.55,
    tailAmp: 0,
    burst: 0,
    likes: "lamp",
    likesLine: "I like the light!",
    voice: { pitch: 1.25, rate: 0.8 },
    body: "jelly"
  },
  spottedjelly: {
    id: "spottedjelly",
    name: "Spotted Jellyfish",
    ja: "タコクラゲ",
    kind: "animal",
    counter: "jelly",
    needs: "jelly",
    movement: "drift",
    group: "jelly",
    color: "blue",
    word: "jellyfish",
    plural: "jellyfish",
    price: 50,
    fromStage: 8,
    habitat: ["cylinder"],
    length: 0.22,
    radius: 0.12,
    speed: 0.06,
    turn: 0.7,
    wander: [2.5, 5],
    depth: [0.15, 0.8],
    tailHz: 0.9,
    tailAmp: 0,
    burst: 0,
    likes: "lamp",
    likesLine: "I like the light!",
    voice: { pitch: 1.4, rate: 0.85 },
    body: "jelly"
  },
  seanettle: {
    id: "seanettle",
    name: "Sea Nettle",
    ja: "アカクラゲ",
    kind: "animal",
    counter: "jelly",
    needs: "jelly",
    movement: "drift",
    group: "jelly",
    color: "orange",
    word: "jellyfish",
    plural: "jellyfish",
    price: 55,
    fromStage: 8,
    habitat: ["cylinder"],
    length: 0.26,
    radius: 0.14,
    speed: 0.035,
    turn: 0.4,
    wander: [4, 7],
    depth: [0.3, 0.95],
    tailHz: 0.45,
    tailAmp: 0,
    burst: 0,
    likes: "lamp",
    likesLine: "I like the light!",
    voice: { pitch: 1.15, rate: 0.8 },
    body: "jelly"
  }
};

export const SPECIES_ORDER: SpeciesId[] = [
  "clownfish",
  "bluetang",
  "yellowfish",
  "pufferfish",
  "turtle",
  "seahorse",
  "jellyfish",
  "angelfish",
  "goby",
  "chromis",
  "eel",
  "octopus",
  "crab",
  "stingray",
  "moonjelly",
  "spottedjelly",
  "seanettle"
];
/** The fish counter ("What color?"). */
export const FISH_ORDER = SPECIES_ORDER.filter((s) => SPECIES[s].counter === "fish");
/** The sea-animal counter ("What do you want?"), jellyfish included (one name for all of them). */
export const ANIMAL_ORDER = SPECIES_ORDER.filter((s) => SPECIES[s].counter !== "fish");
/** Jellyfish: "A jellyfish, please!", then "What color?" once more than one kind is on offer. */
export const JELLY_ORDER = SPECIES_ORDER.filter((s) => SPECIES[s].counter === "jelly");

/** Fish are bought by colour ("Blue, please!"). */
export const SPECIES_BY_COLOR: Partial<Record<ColorId, SpeciesId>> = {
  orange: "clownfish",
  blue: "bluetang",
  yellow: "yellowfish",
  white: "pufferfish",
  purple: "angelfish",
  red: "goby",
  green: "chromis"
};

/** Jellyfish are told apart by colour. */
export const JELLY_BY_COLOR: Partial<Record<ColorId, SpeciesId>> = {
  purple: "jellyfish",
  white: "moonjelly",
  blue: "spottedjelly",
  orange: "seanettle"
};

/** Capacity places an animal takes. */
export const spaceOf = (s: SpeciesId) => SPECIES[s].space ?? 1;
