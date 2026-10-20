import type { SlotId, TankType, Vec3 } from "../types";

export interface TankDef {
  type: TankType;
  name: string;
  price: number;
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
  }
};

/** Height of the stand top (bottom of the water) above the floor. */
export const STAND_H = 0.75;
/** Sand thickness inside the tank. */
export const SAND_H = 0.06;

/** Tank pads along the back of the room (centre of the water, on the floor). */
export const SLOT_POS: Record<SlotId, Vec3> = {
  A: { x: -2.6, y: 0, z: -2.4 },
  B: { x: 2.6, y: 0, z: -2.4 }
};

export const SLOT_ORDER: SlotId[] = ["A", "B"];
