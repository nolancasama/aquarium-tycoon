import type { Vec2, Vec3 } from "../types";
import { makeDomain, type Pt } from "../marine/domain";
import type { LagoonView } from "../logic/lagoon";

/**
 * The Dolphin Lagoon: the aquarium's first outdoor habitat. A natural-looking
 * seawater lagoon (about 44 × 24 m and 6.5 m deep) joined by a channel under a
 * footbridge to a smaller bay pool, behind a rocky breakwater with a sea gate
 * and the open sea beyond. A quay with a boardwalk runs along the front; the
 * underwater gallery's window is set into it, the observation deck stands over
 * the beach on the left and the care team's pontoon floats on the right.
 *
 * Area-local metres around LAGOON_ORIGIN: x right, z toward the visitors (+z),
 * y up; the water surface is y = 0 and the land LAND_Y (0.8). Far from every
 * other area (only the active area is drawn).
 */

export const LAGOON_ORIGIN: Vec2 = { x: -320, z: 260 };

/** The water's outline, going round: front quay, gallery window, right shore, breakwater, bay, left beach. */
const OUTLINE: Pt[] = [
  { x: -11, z: 9.6 }, { x: -4, z: 10 }, { x: 2.5, z: 10 }, { x: 15.5, z: 10 }, { x: 19, z: 8.6 },
  { x: 22.5, z: 5 }, { x: 23.5, z: 0 }, { x: 22.5, z: -5 }, { x: 19.5, z: -9.5 }, { x: 14, z: -12.6 },
  { x: 6, z: -13.6 }, { x: -2, z: -13.6 }, { x: -9, z: -12.8 }, { x: -14.5, z: -10.8 }, { x: -18.5, z: -9.2 },
  { x: -22.5, z: -10.6 }, { x: -26, z: -12.4 }, { x: -30.5, z: -13.8 }, { x: -35, z: -13 }, { x: -37.5, z: -9.6 },
  { x: -37, z: -5.6 }, { x: -34, z: -3.2 }, { x: -29.5, z: -2.6 }, { x: -25.5, z: -3.4 }, { x: -22.5, z: -4.1 },
  { x: -19.5, z: -2.8 }, { x: -21, z: 1.5 }, { x: -19.5, z: 5.8 }, { x: -16, z: 8.6 }
];
/** Quay walls (1, 3) and the gallery window (2): deep right up to them. The breakwater (9–11) is a rubble slope. */
const WALLS = [1, 2, 3];

/** The gallery's window wall (part of the front quay) and the window in it. */
export const GALLERY = { minX: 2.5, maxX: 15.5, z: 10, back: 18.2, floor: -5.3, ceiling: -0.35, window: { minX: 3.5, maxX: 14.5, bottom: -5.0, top: -0.55 }, mullions: [3.5, 7.17, 10.83, 14.5] };
/** The care team's floating pontoon: top height, footprint, and where the dolphins come to be fed (its lagoon side). */
export const PLATFORM = { x: 15, z: -6.5, w: 5, d: 3.4, top: 0.35, r: 2.45 };
export const FEED_POINT: Vec3 = { x: 10.6, y: -0.35, z: -6.3 };
/** The observation deck over the beach (top height and footprint). */
export const DECK = { minX: -23, maxX: -14, minZ: 9.5, maxZ: 15.5, top: 4.6 };
/** The footbridge over the channel (x, from z to z, arch height). */
export const BRIDGE = { x: -21, z0: -12.6, z1: -0.8, rise: 1.6 };
/** The sea gate in the breakwater: a gap with a net (the dolphins stay in; the sea comes in). */
export const SEA_GATE = { minX: 0.5, maxX: 4.5, z0: -13.6, z1: -18 };
/** Where the toys go in (floating), and the bubble curtain's ring on the floor. */
export const TOY_SPOT: Vec3 = { x: -3, y: 0, z: -1 };
export const BUBBLE_SPOT: Vec2 = { x: 4, z: 2.5 };

export const LAGOON_DOMAIN = makeDomain({
  outline: OUTLINE,
  wallEdges: WALLS,
  depth: 6.5,
  shelf: 5.5,
  obstacles: [{ x: PLATFORM.x, z: PLATFORM.z, r: PLATFORM.r }],
  centre: { x: 0, z: -1 },
  // A few low reef mounds and seagrass hollows so the floor is not a bowl.
  // (Only in deeper water, so the beaches stay smooth.)
  shape: (x, z, f) => {
    const deep = Math.max(0, Math.min(1, (-f - 1) / 2));
    return f + deep * (0.5 * Math.sin(x * 0.31) * Math.sin(z * 0.43) - 0.4 * Math.exp(-((x - 4) ** 2 + (z - 2.5) ** 2) / 18));
  }
});

/** World position of an area-local point. */
export const lagoonWorld = (p: { x: number; y?: number; z: number }): Vec3 => ({ x: LAGOON_ORIGIN.x + p.x, y: p.y ?? 0, z: LAGOON_ORIGIN.z + p.z });

/** Curated viewpoints (area-local). Narrow screens step back along the view. */
export const LAGOON_SHOTS: Record<LagoonView, { pos: Vec3; target: Vec3 }> = {
  // High enough to manage the whole lagoon, low enough to keep the horizon and the sky in the frame.
  lagoon: { pos: { x: 0, y: 18, z: 38 }, target: { x: 0, y: 3, z: -18 } },
  // Inside the gallery, behind the visitors at the window.
  gallery: { pos: { x: 9, y: -3.0, z: 16.3 }, target: { x: 9, y: -2.2, z: 0 } },
  // Standing on the deck, out across the lagoon (where the pod swims) to the sea.
  deck: { pos: { x: -17.4, y: 6.9, z: 12.6 }, target: { x: 4, y: 0.2, z: -10 } },
  care: { pos: { x: 3.5, y: 5.5, z: 2.5 }, target: { x: 12, y: -0.3, z: -6.5 } }
};
/** The first-visit reveal starts on the boardwalk (between the lamps), looking out at the sky over the water. */
export const LAGOON_REVEAL_FROM = { pos: { x: 3.8, y: 2.4, z: 19.5 }, target: { x: 2.5, y: 3.0, z: -2 } };
/** Counting: high over the lagoon so every dolphin and its number stay in view. */
export const LAGOON_COUNT_SHOT = { pos: { x: 0, y: 33, z: 30 }, target: { x: 0, y: -2, z: -2 } };

/** Visitor strolls (area-local) and standing spots. */
export const BOARDWALK_PATH: Vec2[] = [{ x: -10, z: 12.2 }, { x: 0, z: 12.6 }, { x: 10, z: 12.4 }, { x: 19, z: 11.2 }];
/** Deck visitors stand at the railing beside the viewpoint, never in front of it. */
export const DECK_SPOTS: Vec2[] = [{ x: -21.6, z: 10.2 }, { x: -22.2, z: 12.6 }, { x: -18.6, z: 14.8 }];
/** Gallery visitors stand at the window's side panes. */
export const GALLERY_SPOTS: Vec2[] = [{ x: 6.4, z: 11.5 }, { x: 11.7, z: 11.4 }, { x: 8.2, z: 11.6 }];
