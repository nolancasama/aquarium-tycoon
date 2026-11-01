import type { SlotId, StageId, TankShape, TankType, Vec3 } from "../types";
import { ROOMS, ROOM_OF } from "./rooms";

/** Decoration size classes: a tank takes decorations up to its own class. */
export type DecorSize = "small" | "medium" | "large";
export const SIZE_RANK: Record<DecorSize, number> = { small: 0, medium: 1, large: 2 };

export interface TankDef {
  type: TankType;
  name: string;
  ja: string;
  /** Glass shape; w is the full width (x), d the depth (z) at the sides. */
  shape: TankShape;
  /** Shop section. */
  group: "classic" | "special";
  price: number;
  /** Level from which it is sold (the Ocean tank comes with the Ocean Hall). */
  fromStage: StageId;
  capacity: number;
  /** Water volume (m): width (x), depth (z), height (y). */
  w: number;
  d: number;
  h: number;
  /** Tank-local decoration positions; optional y is a shelf top above the glass bottom. */
  slots: { x: number; z: number; y?: number }[];
  /** Largest decoration class it takes. */
  decorSize: DecorSize;
  /** "bow": how far the curved front glass bulges past d/2 at the middle (m). */
  bulge?: number;
  /** "cave": depth of the rockwork along the back wall (animals stay in front of it). */
  backRock?: number;
  /** "cave": den mouths in the rockwork face, tank-local (y up from the glass bottom). */
  dens?: Vec3[];
  /** Built-in rock formations on the sand (fish swim over them like decorations). */
  rocks?: { x: number; z: number; r: number; top: number }[];
  /** A coloured display light the player chooses ("What color?"). */
  lights?: boolean;
  /** Circulating current (m/s) that carries drifting animals round the tank. */
  current?: number;
}

export const TANKS: Record<TankType, TankDef> = {
  small: {
    type: "small",
    name: "Small tank",
    ja: "ちいさな タンク",
    shape: "box",
    group: "classic",
    decorSize: "medium",
    price: 0,
    fromStage: 1,
    capacity: 3,
    w: 1.6,
    d: 0.8,
    h: 0.9,
    slots: [
      { x: -0.52, z: 0.02 },
      { x: 0, z: -0.2 },
      { x: 0.52, z: 0.04 }
    ]
  },
  big: {
    type: "big",
    name: "Big tank",
    ja: "おおきな タンク",
    shape: "box",
    group: "classic",
    decorSize: "large",
    price: 80,
    fromStage: 4,
    capacity: 5,
    w: 2.4,
    d: 0.9,
    h: 1.1,
    slots: [
      { x: -0.86, z: 0.12 },
      { x: -0.46, z: -0.22 },
      { x: 0, z: -0.24 },
      { x: 0.46, z: -0.22 },
      { x: 0.86, z: 0.12 }
    ]
  },
  tall: {
    type: "tall",
    name: "Tall tank",
    ja: "たかい タンク",
    shape: "box",
    group: "classic",
    decorSize: "medium",
    price: 70,
    fromStage: 7,
    capacity: 4,
    w: 1.0,
    d: 0.8,
    h: 1.5,
    slots: [
      { x: -0.27, z: 0.06 },
      { x: 0.27, z: -0.12 }
    ]
  },
  ocean: {
    type: "ocean",
    name: "Ocean tank",
    ja: "うみの タンク",
    shape: "box",
    group: "classic",
    decorSize: "large",
    price: 0,
    fromStage: 6,
    capacity: 8,
    w: 3.4,
    d: 1.2,
    h: 1.3,
    slots: [
      { x: -1.3, z: 0.22 },
      { x: -0.8, z: -0.32 },
      { x: -0.26, z: -0.36 },
      { x: 0.3, z: -0.36 },
      { x: 0.84, z: -0.32 },
      { x: 1.3, z: 0.22 }
    ]
  },
  // ---- Expansion 1 special tanks (Level 8).
  hex: {
    type: "hex",
    name: "Hexagon tank",
    ja: "ろっかくの タンク",
    shape: "hex",
    group: "special",
    price: 90,
    fromStage: 8,
    capacity: 4,
    // Corner to corner along x; flat to flat along z (a flat face toward the visitors).
    w: 1.32,
    d: 1.14,
    h: 1.15,
    decorSize: "medium",
    slots: [
      { x: -0.27, z: 0.1 },
      { x: 0.27, z: 0.1 },
      { x: 0, z: -0.28 }
    ]
  },
  panorama: {
    type: "panorama",
    name: "Panorama tank",
    ja: "パノラマ タンク",
    shape: "bow",
    group: "special",
    price: 150,
    fromStage: 8,
    capacity: 7,
    w: 3.0,
    d: 1.0,
    h: 1.2,
    bulge: 0.3,
    decorSize: "large",
    slots: [
      { x: -1.15, z: 0.15 },
      { x: -0.7, z: -0.25 },
      { x: -0.22, z: -0.3 },
      { x: 0.25, z: -0.3 },
      { x: 0.72, z: -0.25 },
      { x: 1.15, z: 0.15 }
    ]
  },
  cylinder: {
    type: "cylinder",
    name: "Jelly column",
    ja: "クラゲの まるい タンク",
    shape: "round",
    group: "special",
    price: 100,
    fromStage: 8,
    capacity: 5,
    // Diameter 1.1 m.
    w: 1.1,
    d: 1.1,
    h: 1.6,
    decorSize: "small",
    lights: true,
    current: 0.06,
    slots: [
      { x: -0.2, z: 0.15 },
      { x: 0.22, z: 0.12 }
    ]
  },
  cave: {
    type: "cave",
    name: "Rocky cave tank",
    ja: "いわの ほらあな タンク",
    shape: "box",
    group: "special",
    price: 110,
    fromStage: 8,
    capacity: 5,
    w: 2.2,
    d: 1.0,
    h: 1.0,
    decorSize: "large",
    backRock: 0.28,
    // Den mouths in the rockwork face (z = -d/2 + backRock).
    dens: [
      { x: -0.62, y: 0.2, z: -0.22 },
      { x: 0.3, y: 0.44, z: -0.22 },
      { x: 0.72, y: 0.16, z: -0.22 }
    ],
    rocks: [{ x: 0.95, z: 0.02, r: 0.17, top: 0.34 }],
    slots: [
      { x: -0.62, z: 0.22 },
      { x: -0.02, z: 0.2 },
      { x: 0.5, z: 0.26 }
    ]
  },
  reef: {
    type: "reef",
    name: "Giant reef",
    ja: "おおきな サンゴしょう",
    shape: "reef",
    group: "special",
    price: 0,
    fromStage: 8,
    capacity: 14,
    w: 5.2,
    d: 2.3,
    h: 2,
    decorSize: "large",
    // Overlapping back-bank formations, with a column-free central swim lane.
    // The organic arch's central crown is above animals' upper body clearance;
    // its sloping shoulders are reserved by the inner two columns.
    rocks: [
      { x: -2.02, z: -0.61, r: 0.49, top: 0.76 },
      { x: -1.48, z: -0.61, r: 0.52, top: 1.40 },
      { x: -0.94, z: -0.62, r: 0.48, top: 1.32 },
      { x: -0.70, z: -0.48, r: 0.36, top: 1.99 },
      { x: 0.70, z: -0.48, r: 0.36, top: 1.99 },
      { x: 1.00, z: -0.62, r: 0.48, top: 1.18 },
      { x: 1.52, z: -0.61, r: 0.52, top: 1.36 },
      { x: 2.06, z: -0.60, r: 0.45, top: 0.72 },
      { x: -1.56, z: -0.04, r: 0.40, top: 0.64 },
      { x: 1.46, z: 0.00, r: 0.42, top: 0.76 },
      { x: -2.12, z: 0.42, r: 0.45, top: 0.20 },
      { x: 2.12, z: 0.38, r: 0.45, top: 0.20 }
    ],
    slots: [
      { x: -2.12, z: 0.42, y: 0.2 }, { x: -1.46, z: 0.60 },
      { x: -0.94, z: 0.36 }, { x: -0.38, z: 0.38 },
      { x: 0.26, z: 0.40 }, { x: 1.46, z: 0.63 },
      { x: 2.12, z: 0.38, y: 0.2 }, { x: -2.1, z: -0.06 },
      { x: 0.83, z: 0.30 }, { x: 1.95, z: -0.04 }
    ]
  }
};

/** Tank types in shop order. */
export const TANK_ORDER: TankType[] = ["small", "big", "tall", "ocean", "hex", "panorama", "cylinder", "cave"];

/** Opening the Ocean Hall (it comes with the Ocean tank on pad C). */
export const HALL_PRICE = 100;
/** Opening the Jellyfish Gallery (it comes with a Jelly column on pad G). */
export const GALLERY_PRICE = 150;
/** Opening the Coral Reef Atrium includes its giant freestanding reef. */
export const ATRIUM_PRICE = 260;
/** The ticket gate: more visitors, more often. */
export const TICKETS_PRICE = 50;

/** Height of the stand top (bottom of the water) above the floor. */
export const STAND_H = 0.75;
/** Sand thickness inside the tank. */
export const SAND_H = 0.06;

/** Tank pad centres, on the floor; newer rooms supply their own layouts. */
const atriumPads = ROOMS.find((room) => room.id === "atrium")!.padLayout!;
export const SLOT_POS: Record<SlotId, Vec3> = {
  A: { x: -2.6, y: 0, z: -2.4 },
  B: { x: 2.6, y: 0, z: -2.4 },
  C: { x: 12, y: 0, z: -2.2 },
  D: { x: 8.05, y: 0, z: -2.4 },
  E: { x: 15.95, y: 0, z: -2.4 },
  F: { x: 20.6, y: 0, z: -2.3 },
  G: { x: 24, y: 0, z: -2.3 },
  H: { x: 27.4, y: 0, z: -2.3 },
  I: { ...atriumPads.I!, y: 0 },
  J: { ...atriumPads.J!, y: 0 },
  K: { ...atriumPads.K!, y: 0 }
};

export const SLOT_ORDER: SlotId[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
export const SLOT_FACING = Object.fromEntries(SLOT_ORDER.map((slot) => [slot,
  ROOMS.find((room) => room.pads.includes(slot))?.padLayout?.[slot]?.facing ?? 0
])) as Record<SlotId, number>;

/** Which room a pad is in (index into ROOMS: 0 the first hall, 1 the Ocean Hall, 2 the Jellyfish Gallery). */
export const HALL_OF: Record<SlotId, number> = ROOM_OF;

/**
 * Tank types each pad takes. The Ocean tank only on C. The first hall keeps
 * its small-aquarium scale (no panorama, no jelly column); the Gallery shows
 * slim displays only.
 */
const HALL1_TYPES: TankType[] = ["small", "big", "tall", "hex", "cave"];
const OCEAN_SIDE_TYPES: TankType[] = ["small", "big", "tall", "hex", "cave", "panorama", "cylinder"];
const GALLERY_TYPES: TankType[] = ["cylinder", "tall", "hex"];
export const PAD_TYPES: Record<SlotId, TankType[]> = {
  A: HALL1_TYPES,
  B: HALL1_TYPES,
  C: ["ocean"],
  D: OCEAN_SIDE_TYPES,
  E: OCEAN_SIDE_TYPES,
  F: GALLERY_TYPES,
  G: GALLERY_TYPES,
  H: GALLERY_TYPES,
  I: ["reef"],
  J: ["hex", "panorama", "cave"],
  K: ["hex", "panorama", "cave"]
};

/** Pads that are never empty once their room is open (they come with a tank). */
export const BUILT_IN_PADS: SlotId[] = ["C", "G", "I"];
