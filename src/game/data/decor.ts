import type { ColorId, DecorKind, DecorVariant, StageId, TankType } from "../types";

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
  /** Level from which it is sold (Phase 2 decorations: the Level 7 reward). */
  fromStage: StageId;
  /** Too big for small and tall tanks. */
  bigOnly?: boolean;
}

export const DECOR: Record<DecorKind, DecorDef> = {
  plant: {
    kind: "plant",
    fromStage: 2,
    name: "Plant",
    question: "Big or small?",
    ja: "みずくさ",
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
    versions: [{ variant: null, price: 5, joy: 4, color: null, height: 0.1 }]
  },
  chest: {
    kind: "chest",
    fromStage: 2,
    name: "Treasure chest",
    question: null,
    ja: "たからばこ",
    versions: [{ variant: null, price: 20, joy: 12, color: null, height: 0.24 }]
  },
  bubbler: {
    kind: "bubbler",
    fromStage: 2,
    name: "Bubbles",
    question: null,
    ja: "あわ",
    versions: [{ variant: null, price: 15, joy: 10, color: null, height: 0.12 }]
  },
  starfish: {
    kind: "starfish",
    fromStage: 8,
    name: "Starfish",
    question: "Pink or yellow?",
    ja: "ヒトデ",
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
    versions: [{ variant: null, price: 12, joy: 8, color: "purple", height: 0.22 }]
  },
  shipwreck: {
    kind: "shipwreck",
    fromStage: 8,
    name: "Shipwreck",
    question: null,
    ja: "しずんだ ふね",
    bigOnly: true,
    versions: [{ variant: null, price: 30, joy: 15, color: null, height: 0.3 }]
  }
};

export const DECOR_ORDER: DecorKind[] = ["plant", "coral", "rock", "shell", "chest", "bubbler", "starfish", "castle", "anemone", "shipwreck"];

/** Can this decoration go in this kind of tank? */
export function decorFits(kind: DecorKind, tank: TankType): boolean {
  return !DECOR[kind].bigOnly || tank === "big" || tank === "ocean";
}

export function decorVersion(kind: DecorKind, variant: DecorVariant): DecorVersion {
  const def = DECOR[kind];
  return def.versions.find((v) => v.variant === variant) ?? def.versions[0];
}
