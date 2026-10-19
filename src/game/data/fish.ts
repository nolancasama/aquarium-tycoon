import type { ColorId, DecorKind, SpeciesId, StageId } from "../types";

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  color: ColorId;
  price: number;
  /** Stage from which it is sold (the Yellow Fish is the Stage 2 reward). */
  fromStage: StageId;
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
  /** Tail beat frequency (Hz) and amplitude (body bend). */
  tailHz: number;
  tailAmp: number;
  /** How darty the motion is: bursts of speed (0 = smooth glider). */
  burst: number;
  likes: DecorKind;
  /** "I like coral!" when tapped. */
  likesLine: string;
  /** TTS voice of the fish. */
  voice: { pitch: number; rate: number };
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  clownfish: {
    id: "clownfish",
    name: "Clownfish",
    color: "orange",
    price: 20,
    fromStage: 1,
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
    voice: { pitch: 1.5, rate: 1 }
  },
  bluetang: {
    id: "bluetang",
    name: "Blue Tang",
    color: "blue",
    price: 30,
    fromStage: 1,
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
    voice: { pitch: 1.2, rate: 0.95 }
  },
  yellowfish: {
    id: "yellowfish",
    name: "Yellow Fish",
    color: "yellow",
    price: 40,
    fromStage: 3,
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
    voice: { pitch: 1.7, rate: 1.05 }
  }
};

export const SPECIES_ORDER: SpeciesId[] = ["clownfish", "bluetang", "yellowfish"];

export const SPECIES_BY_COLOR: Partial<Record<ColorId, SpeciesId>> = {
  orange: "clownfish",
  blue: "bluetang",
  yellow: "yellowfish"
};
