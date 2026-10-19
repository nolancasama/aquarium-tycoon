export type ColorId = "red" | "blue" | "yellow" | "green" | "orange";
export type SpeciesId = "clownfish" | "bluetang" | "yellowfish";
export type DecorKind = "plant" | "coral" | "rock" | "shell" | "chest" | "bubbler";
/** Size for plants and rocks, colour for coral, none for one-version items. */
export type DecorVariant = "big" | "small" | "red" | "blue" | null;
export type TankType = "small" | "big";
export type SlotId = "A" | "B";
export type StageId = 1 | 2 | 3 | 4 | 5;
export type VisitorType = "child" | "adult" | "fan" | "judge";

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
