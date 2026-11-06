import type { TunnelSpecies } from './contract';

export interface TunnelMotion {
  /** Nose to tail tip, including the ray's whip. */
  length: number;
  /** Conservative lateral envelope, including fins and shader motion. */
  radius: number;
  cruiseSpeed: readonly [number, number];
  accel: number;
  maxTurnRate: number;
  maxBank: number;
  maxClimb: number;
  /** Fractions of water depth, measured from the seabed. */
  depthBand: readonly [number, number];
  spacing: number;
  restSeconds: readonly [number, number];
  /** Body centre to underside (m), for laying a resting body on the sand. */
  bellyDepth: number;
  behaviour: 'cruise' | 'bottom' | 'soar';
}

export const TUNNEL_SPECIES: Readonly<Record<TunnelSpecies, TunnelMotion>> = {
  blacktip: { length: 1.6, radius: .43, cruiseSpeed: [1.05, 1.6], accel: .42, maxTurnRate: .66,
    maxBank: .30, maxClimb: .40, depthBand: [.43, .83], spacing: .7, restSeconds: [0, 0], bellyDepth: .2, behaviour: 'cruise' },
  zebrashark: { length: 2.4, radius: .40, cruiseSpeed: [.60, .95], accel: .30, maxTurnRate: .52,
    maxBank: .20, maxClimb: .32, depthBand: [.08, .34], spacing: .75, restSeconds: [8, 25], bellyDepth: .26, behaviour: 'bottom' },
  eagleray: { length: 2.4, radius: .96, cruiseSpeed: [.9, 1.35], accel: .34, maxTurnRate: .44,
    maxBank: .48, maxClimb: .30, depthBand: [.39, .72], spacing: .9, restSeconds: [0, 0], bellyDepth: .1, behaviour: 'soar' },
};
