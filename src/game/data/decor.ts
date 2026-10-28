import type { ColorId, DecorKind, DecorVariant, StageId, TankType } from "../types";
import { SIZE_RANK, TANKS, type DecorSize } from "./tanks";

export interface DecorVersion {
  variant: DecorVariant;
  price: number;
  joy: number;
  /** Colour word a "show me" request can ask for (null: never asked). */
  color: ColorId | null;
  /** Height as a fraction of the tank's water height (for fish clearance). */
  height: number;
}

export interface DecorDef {
  kind: DecorKind;
  name: string;
  /** Two versions are chosen with English ("Red or blue?" / "Big or small?"). */
  versions: DecorVersion[];
  /** The question for two-version items. */
  question: string | null;
  /** Japanese label for the info text (never assessed). */
  ja: string;
  /** Level from which it is sold (Phase 2 decorations: the Level 7 reward; Expansion 1: Level 8). */
  fromStage: StageId;
  /** Size class: a tank takes decorations up to its own class (the shipwreck only big tanks; the jelly column small things only). */
  size: DecorSize;
}

export const DECOR: Record<DecorKind, DecorDef> = {
  plant: {
    kind: "plant",
    fromStage: 2,
    name: "Plant",
    question: "Big or small?",
    ja: "みずくさ",
    size: "medium",
    versions: [
      { variant: "big", price: 8, joy: 8, color: "green", height: 0.6 },
      { variant: "small", price: 5, joy: 5, color: "green", height: 0.3 }
    ]
  },
  coral: {
    kind: "coral",
    fromStage: 2,
    name: "Coral",
    question: "Red or blue?",
    ja: "さんご",
    size: "medium",
    versions: [
      { variant: "red", price: 10, joy: 8, color: "red", height: 0.38 },
      { variant: "blue", price: 10, joy: 8, color: "blue", height: 0.38 }
    ]
  },
  rock: {
    kind: "rock",
    fromStage: 2,
    name: "Rock",
    question: "Big or small?",
    ja: "いわ",
    size: "medium",
    versions: [
      { variant: "big", price: 8, joy: 6, color: null, height: 0.34 },
      { variant: "small", price: 5, joy: 4, color: null, height: 0.16 }
    ]
  },
  shell: {
    kind: "shell",
    fromStage: 2,
    name: "Seashell",
    question: null,
    ja: "かいがら",
    size: "small",
    versions: [{ variant: null, price: 5, joy: 4, color: null, height: 0.1 }]
  },
  chest: {
    kind: "chest",
    fromStage: 2,
    name: "Treasure chest",
    question: null,
    ja: "たからばこ",
    size: "medium",
    versions: [{ variant: null, price: 20, joy: 12, color: null, height: 0.24 }]
  },
  bubbler: {
    kind: "bubbler",
    fromStage: 2,
    name: "Bubbles",
    question: null,
    ja: "あわ",
    size: "small",
    versions: [{ variant: null, price: 15, joy: 10, color: null, height: 0.12 }]
  },
  starfish: {
    kind: "starfish",
    fromStage: 8,
    name: "Starfish",
    question: "Pink or yellow?",
    ja: "ヒトデ",
    size: "small",
    versions: [
      { variant: "pink", price: 6, joy: 5, color: "pink", height: 0.06 },
      { variant: "yellow", price: 6, joy: 5, color: "yellow", height: 0.06 }
    ]
  },
  castle: {
    kind: "castle",
    fromStage: 8,
    name: "Sand castle",
    question: "Big or small?",
    ja: "すなの おしろ",
    size: "medium",
    versions: [
      { variant: "big", price: 14, joy: 10, color: null, height: 0.36 },
      { variant: "small", price: 9, joy: 7, color: null, height: 0.22 }
    ]
  },
  anemone: {
    kind: "anemone",
    fromStage: 8,
    name: "Anemone",
    question: null,
    ja: "イソギンチャク",
    size: "medium",
    versions: [{ variant: null, price: 12, joy: 8, color: "purple", height: 0.22 }]
  },
  shipwreck: {
    kind: "shipwreck",
    fromStage: 8,
    name: "Shipwreck",
    question: null,
    ja: "しずんだ ふね",
    size: "large",
    versions: [{ variant: null, price: 30, joy: 15, color: null, height: 0.3 }]
  },
  // ---- Expansion 1 habitat pieces (Level 8).
  kelp: {
    kind: "kelp",
    fromStage: 8,
    name: "Kelp",
    question: null,
    ja: "コンブ (たかい かいそう)",
    size: "medium",
    versions: [{ variant: null, price: 10, joy: 8, color: "green", height: 0.85 }]
  },
  arch: {
    kind: "arch",
    fromStage: 8,
    name: "Coral arch",
    question: null,
    ja: "サンゴの アーチ",
    size: "large",
    versions: [{ variant: null, price: 18, joy: 12, color: "pink", height: 0.4 }]
  },
  cave: {
    kind: "cave",
    fromStage: 8,
    name: "Rock cave",
    question: null,
    ja: "いわの ほらあな",
    size: "large",
    versions: [{ variant: null, price: 16, joy: 12, color: null, height: 0.42 }]
  },
  driftwood: {
    kind: "driftwood",
    fromStage: 8,
    name: "Driftwood",
    question: null,
    ja: "りゅうぼく",
    size: "medium",
    versions: [{ variant: null, price: 8, joy: 6, color: null, height: 0.18 }]
  }
};

export const DECOR_ORDER: DecorKind[] = ["plant", "coral", "rock", "shell", "chest", "bubbler", "starfish", "castle", "anemone", "shipwreck", "kelp", "arch", "cave", "driftwood"];

/** Can this decoration go in this kind of tank? */
export function decorFits(kind: DecorKind, tank: TankType): boolean {
  return SIZE_RANK[DECOR[kind].size] <= SIZE_RANK[TANKS[tank].decorSize];
}

export function decorVersion(kind: DecorKind, variant: DecorVariant): DecorVersion {
  const def = DECOR[kind];
  return def.versions.find((v) => v.variant === variant) ?? def.versions[0];
}
