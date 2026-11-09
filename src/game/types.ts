export type ColorId = "red" | "blue" | "yellow" | "green" | "orange" | "pink" | "purple" | "white";
export type SpeciesId =
  | "clownfish"
  | "bluetang"
  | "yellowfish"
  | "pufferfish"
  | "turtle"
  | "seahorse"
  | "jellyfish"
  // Expansion 1 (Level 8): reef fish, a school, cave and floor animals, jellies.
  | "angelfish"
  | "goby"
  | "chromis"
  | "eel"
  | "octopus"
  | "crab"
  | "stingray"
  | "moonjelly"
  | "spottedjelly"
  | "seanettle"
  | "parrotfish"
  | "shrimp"
  | "blacktip"
  | "zebrashark"
  | "eagleray"
  // Coastal & Polar Zone: semi-aquatic animals in their own habitats.
  | "penguin"
  | "seal"
  | "otter";
export type TunnelDecorKind = "tunnelArch" | "tunnelPinnacle" | "tunnelShelf" | "tunnelLedge" | "tunnelSand";
/** Coastal habitat items: each species needs one of its own (rest), the others enrich. */
export type CoastDecorKind = "penguinRock" | "penguinNest" | "penguinFeeder" | "sealRock" | "sealBall" | "sealBuoy" | "otterKelp" | "otterToy" | "otterDen";
export type DecorKind =
  | "plant"
  | "coral"
  | "rock"
  | "shell"
  | "chest"
  | "bubbler"
  | "starfish"
  | "castle"
  | "anemone"
  | "shipwreck"
  | "kelp"
  | "arch"
  | "cave"
  | "driftwood"
  | "staghorn"
  | "brain"
  | "fan"
  | "table"
  | TunnelDecorKind
  | CoastDecorKind;
/** Size for plants, rocks and castles, colour for coral and starfish, none for one-version items. */
export type DecorVariant = "big" | "small" | "red" | "blue" | "pink" | "yellow" | null;
/** Classic tanks (small, big, tall, ocean) and the Expansion 1 special tanks. */
export type TankType = "small" | "big" | "tall" | "ocean" | "hex" | "panorama" | "cylinder" | "cave" | "reef" | "sharks" | "penguins" | "seals" | "otters";
/** Glass shape of a tank: a box, six-sided, round, or a box with a bowed front. */
export type TankShape = "box" | "hex" | "round" | "bow" | "reef" | "tunnel" | "coast";
/** A, B: the first hall. C (the Ocean tank), D, E: the Ocean Hall. F, G (its Jelly Column), H: the Jellyfish Gallery. */
export type SlotId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O";
/** Rooms in walking order; each connects to the previous one through a doorway. */
export type RoomId = "hall" | "ocean" | "gallery" | "atrium" | "sharks" | "hub" | "coast";
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
