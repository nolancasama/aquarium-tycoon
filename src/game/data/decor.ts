import type { ColorId, DecorKind, DecorVariant } from "../types";

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
}

export const DECOR: Record<DecorKind, DecorDef> = {
  plant: {
    kind: "plant",
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
    name: "Seashell",
    question: null,
    ja: "かいがら",
    versions: [{ variant: null, price: 5, joy: 4, color: null, height: 0.1 }]
  },
  chest: {
    kind: "chest",
    name: "Treasure chest",
    question: null,
    ja: "たからばこ",
    versions: [{ variant: null, price: 20, joy: 12, color: null, height: 0.24 }]
  },
  bubbler: {
    kind: "bubbler",
    name: "Bubbles",
    question: null,
    ja: "あわ",
    versions: [{ variant: null, price: 15, joy: 10, color: null, height: 0.12 }]
  }
};

export const DECOR_ORDER: DecorKind[] = ["plant", "coral", "rock", "shell", "chest", "bubbler"];

export function decorVersion(kind: DecorKind, variant: DecorVariant): DecorVersion {
  const def = DECOR[kind];
  return def.versions.find((v) => v.variant === variant) ?? def.versions[0];
}
