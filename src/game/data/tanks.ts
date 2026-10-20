import type { SlotId, StageId, TankType, Vec3 } from "../types";

export interface TankDef {
  type: TankType;
  name: string;
  price: number;
  /** Level from which it is sold (the Ocean tank comes with the Ocean Hall). */
  fromStage: StageId;
  capacity: number;
  /** Water volume (m): width (x), depth (z), height (y). */
  w: number;
  d: number;
  h: number;
  /** Decoration slots on the sand, as tank-local x/z (origin at the sand centre). */
  slots: { x: number; z: number }[];
}

export const TANKS: Record<TankType, TankDef> = {
  small: {
    type: "small",
    name: "Small tank",
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
  }
};

/** Opening the Ocean Hall (it comes with the Ocean tank on pad C). */
export const HALL_PRICE = 100;
/** The ticket gate: more visitors, more often. */
export const TICKETS_PRICE = 50;

/** Height of the stand top (bottom of the water) above the floor. */
export const STAND_H = 0.75;
/** Sand thickness inside the tank. */
export const SAND_H = 0.06;

/** Tank pads along the back of the room (centre of the water, on the floor). */
export const SLOT_POS: Record<SlotId, Vec3> = {
  A: { x: -2.6, y: 0, z: -2.4 },
  B: { x: 2.6, y: 0, z: -2.4 },
  C: { x: 12, y: 0, z: -2.2 },
  D: { x: 8.05, y: 0, z: -2.4 },
  E: { x: 15.95, y: 0, z: -2.4 }
};

export const SLOT_ORDER: SlotId[] = ["A", "B", "C", "D", "E"];

/** Which hall a pad is in (0: the first hall, 1: the Ocean Hall). */
export const HALL_OF: Record<SlotId, 0 | 1> = { A: 0, B: 0, C: 1, D: 1, E: 1 };

/** Tank types each pad takes: the Ocean tank only on C, never elsewhere. */
export const PAD_TYPES: Record<SlotId, TankType[]> = {
  A: ["small", "big", "tall"],
  B: ["small", "big", "tall"],
  C: ["ocean"],
  D: ["small", "big", "tall"],
  E: ["small", "big", "tall"]
};
