/** Fixed Rush Hour cosmetics in Hall 1's unused front-left entrance forecourt.
 * Facing is a rotation about +y; model fronts point along local +z.
 * Footprints are world-space bounds, including all solid model overhangs.
 */
export interface RushFootprint { minX: number; maxX: number; minZ: number; maxZ: number }
export interface RushDecorPlacement {
  x: number;
  y: number;
  z: number;
  facing: number;
  footprint: RushFootprint | null;
}

export const RUSH_DECOR = {
  // Turned 35° toward the room camera so the medal shelves read from the default view
  // (facing the room, +x, showed only the cabinet's side).
  cabinet: { x: -5.17, y: 0, z: 3.3, facing: 0.61,
    footprint: { minX: -5.98, maxX: -4.36, minZ: 2.61, maxZ: 3.99 } },
  // A lifted floor inlay, not furniture: walking across it is intentional.
  floorPattern: { x: -3.3, y: 0.008, z: 1.5, facing: 0, footprint: null },
  // Standing on the cabinet's crown (top ≈ 2.01 m; the sign hangs 0.58 m below its origin), facing with it.
  goldSign: { x: -5.17, y: 2.6, z: 3.3, facing: 0.61, footprint: null },
  bubbleFountain: { x: -3.5, y: 0, z: 3.3, facing: 0,
    footprint: { minX: -3.9, maxX: -3.1, minZ: 2.9, maxZ: 3.7 } },
  // Decorative only; this does not add a seat to the visitor seating system.
  bench: { x: -2.25, y: 0, z: 3.35, facing: Math.PI,
    footprint: { minX: -2.95, maxX: -1.55, minZ: 3.08, maxZ: 3.62 } },
  sharkStatue: { x: -0.55, y: 0, z: 3.62, facing: 0,
    footprint: { minX: -0.9, maxX: -0.2, minZ: 3.27, maxZ: 3.97 } }
} satisfies Record<string, RushDecorPlacement>;

/** Permanently reserve the four standing objects plus a 30 cm visitor margin.
 * They are outside every authored visitor/seat route even before unlock, so
 * reservations never change paths when a cosmetic appears or a save loads.
 */
export const RUSH_OBSTACLES: RushFootprint[] = Object.values(RUSH_DECOR)
  .flatMap(({ footprint }) => footprint ? [{
    minX: footprint.minX - 0.3, maxX: footprint.maxX + 0.3,
    minZ: footprint.minZ - 0.3, maxZ: footprint.maxZ + 0.3
  }] : []);
