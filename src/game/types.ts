export type ColorId = "red" | "blue" | "yellow" | "green" | "orange" | "pink" | "purple" | "white";
export type SpeciesId = "clownfish" | "bluetang" | "yellowfish" | "pufferfish" | "turtle" | "seahorse" | "jellyfish";
export type DecorKind = "plant" | "coral" | "rock" | "shell" | "chest" | "bubbler" | "starfish" | "castle" | "anemone" | "shipwreck";
/** Size for plants, rocks and castles, colour for coral and starfish, none for one-version items. */
export type DecorVariant = "big" | "small" | "red" | "blue" | "pink" | "yellow" | null;
export type TankType = "small" | "big" | "tall" | "ocean";
/** A, B: the first hall. C (the Ocean tank), D, E: the Ocean Hall. */
export type SlotId = "A" | "B" | "C" | "D" | "E";
export type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type VisitorType = "child" | "adult" | "fan" | "grandma" | "explorer" | "judge";

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Short English with optional hiragana-forward Japanese help. */
export interface Text {
  en: string;
  ja?: string;
}
