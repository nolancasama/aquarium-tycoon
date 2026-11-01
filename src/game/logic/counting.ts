import { SPECIES } from "../data/fish";
import type { SpeciesId } from "../types";
import type { TankDef } from "../data/tanks";

export interface CountNumber { fishId: string; n: number }
export interface CountSequence { tankId: string; t0: number; numbers: CountNumber[] }
export const COUNT_BEAT = 0.65;
export const COUNT_LABEL_SIZE = 0.2;

/** Keep the whole badge inside the water, including below the surface and frame. */
export function countLabelPosition(x: number, y: number, tank: Pick<TankDef, "w" | "h">) {
  const inset = COUNT_LABEL_SIZE / 2 + 0.03;
  return {
    x: Math.max(-tank.w / 2 + inset, Math.min(tank.w / 2 - inset, x)),
    y: Math.max(inset, Math.min(tank.h - COUNT_LABEL_SIZE / 2 - 0.15, y))
  };
}

/** Stable tank order, one label per single fish. Schools are never count questions. */
export function countedFish(fish: readonly { id: string; species: SpeciesId }[]): CountNumber[] {
  return fish.filter((f) => SPECIES[f.species].kind === "fish" && !SPECIES[f.species].school)
    .map((f, i) => ({ fishId: f.id, n: i + 1 }));
}

export function visibleCountNumbers(sequence: Pick<CountSequence, "numbers" | "t0"> | null, time: number): CountNumber[] {
  if (!sequence || time < sequence.t0) return [];
  return sequence.numbers.slice(0, Math.floor((time - sequence.t0) / COUNT_BEAT) + 1);
}
