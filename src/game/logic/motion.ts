import type { SpeciesId } from "../types";

/** Presentation-only rhythms; no habitat, care or saved species data. */
const JELLY_STYLES = {
  jellyfish: { contract: 0.2, power: 0.64, drag: 1.35 },
  moonjelly: { contract: 0.17, power: 0.48, drag: 1.45 },
  spottedjelly: { contract: 0.25, power: 0.58, drag: 1.65 },
  seanettle: { contract: 0.14, power: 0.78, drag: 1.15 }
} as const;

export function jellyPulseStyle(species: SpeciesId) {
  return JELLY_STYLES[species as keyof typeof JELLY_STYLES] ?? JELLY_STYLES.jellyfish;
}

/** One quick squeeze followed by a long, smooth recovery (phase in radians). */
export function jellyPulse(species: SpeciesId, phase: number): number {
  const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  const contract = jellyPulseStyle(species).contract;
  const t = cycle < contract ? cycle / contract : 1 - (cycle - contract) / (1 - contract);
  return t * t * (3 - 2 * t);
}

const RHYTHMS: Partial<Record<SpeciesId, readonly [number, number, number]>> = {
  clownfish: [3.4, 0.46, 0.3],
  bluetang: [6.5, 0.65, 0.57],
  yellowfish: [2.8, 0.6, 0.38],
  pufferfish: [5.2, 0.48, 0.13],
  angelfish: [7.5, 0.56, 0.23],
  seahorse: [8, 0.35, 0.06],
  chromis: [4.2, 0.74, 0.65],
  stingray: [7, 0.8, 0.72]
};
const CONTINUOUS = [5, 1, 1] as const;

/** Seconds per swim/glide cycle, active fraction, and resting effort. */
export function swimRhythm(species: SpeciesId): readonly [number, number, number] {
  return RHYTHMS[species] ?? CONTINUOUS;
}
