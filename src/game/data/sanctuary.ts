import type { Vec2, Vec3 } from "../types";
import { makeDomain, type Pt } from "../marine/domain";
import type { SanctuaryView } from "../logic/sanctuary";

/**
 * The Grand Ocean Sanctuary: a natural bay (about 230 × 130 m, 14 m deep)
 * between two rocky headlands, open to the ocean beyond a line of buoys that
 * marks the sanctuary's edge. Orcas live in the bay; belugas in their own
 * sheltered, colder cove behind a rock breakwater (never mixed). Along the
 * shore: the research station with its dock, a pier out to the underwater
 * observation station, a care platform; the observation point stands high on
 * the west headland. An island and the research boat are scenery and landmarks.
 *
 * Area-local metres around SANCTUARY_ORIGIN: x east, z toward the shore (+z),
 * y up; the sea surface is y = 0.
 */

export const SANCTUARY_ORIGIN: Vec2 = { x: 420, z: 500 };

/** The orcas' bay: the shore (south), the headlands' inner shores, and the buoy line (north). */
const BAY: Pt[] = [
  { x: -96, z: 44 }, { x: -60, z: 52 }, { x: -20, z: 55 }, { x: 22, z: 54 }, { x: 52, z: 50 },
  { x: 78, z: 44 }, { x: 96, z: 30 }, { x: 102, z: 8 }, { x: 104, z: -22 }, { x: 100, z: -56 },
  { x: 92, z: -84 }, { x: 40, z: -92 }, { x: -20, z: -94 }, { x: -80, z: -90 }, { x: -112, z: -78 },
  { x: -120, z: -48 }, { x: -116, z: -10 }, { x: -110, z: 20 }
];
/** The buoy line across the bay's mouth (edges 10–13 of BAY). */
export const BUOY_LINE: Pt[] = [{ x: 92, z: -84 }, { x: 40, z: -92 }, { x: -20, z: -94 }, { x: -80, z: -90 }, { x: -112, z: -78 }];

/** The island and the research boat: landmarks (and obstacles). */
export const ISLAND = { x: -42, z: -18, r: 13, top: 7 };
export const ISLET = { x: 58, z: -52, r: 6, top: 4 };
export const BOAT = { x: 30, z: 18, r: 5.5, yaw: 0.6 };
/** The underwater observation station at the end of its pier: a round room, half under the sea. */
export const STATION = { x: 66, z: 22, r: 6.5, floor: -6, roof: 2.4, pierFrom: { x: 66, z: 58 } };
/** The care platform, where enrichment goes in. */
export const CARE = { x: -8, z: 34, w: 8, d: 5, top: 0.4 };
/** The observation point on the west headland's clifftop. */
export const LOOKOUT = { x: -118, y: 17.6, z: 40 };
/** The research station on the shore, and its dock. */
export const RESEARCH = { x: 24, z: 74, dock: { x: 24, z: 56 } };

export const SANCTUARY_DOMAIN = makeDomain({
  outline: BAY,
  // The buoy line is open water: deep right up to it (the orcas stay inside).
  wallEdges: [10, 11, 12, 13],
  depth: 14,
  shelf: 14,
  obstacles: [
    { x: ISLAND.x, z: ISLAND.z, r: ISLAND.r }, { x: ISLET.x, z: ISLET.z, r: ISLET.r },
    { x: BOAT.x, z: BOAT.z, r: BOAT.r }, { x: STATION.x, z: STATION.z, r: STATION.r + 1 },
    // The pier's pillars, from the shore out to the station.
    { x: STATION.x, z: 31, r: 1.6 }, { x: STATION.x, z: 37, r: 1.6 }, { x: STATION.x, z: 43, r: 1.6 },
    { x: CARE.x, z: CARE.z, r: 5 }
  ],
  centre: { x: 0, z: -30 },
  // Deeper in the middle, a shelf under the island, gentle rolls everywhere.
  shape: (x, z, f) => {
    const deep = Math.max(0, Math.min(1, (-f - 1.5) / 3));
    const isl = Math.exp(-(((x - ISLAND.x) ** 2 + (z - ISLAND.z) ** 2) / 900));
    return f + deep * (1.2 * Math.sin(x * 0.07) * Math.sin(z * 0.09) + 5 * isl);
  }
});

/** Beluga Cove: a sheltered cold-water cove east of the bay, behind its own breakwater. */
const COVE: Pt[] = [
  { x: 118, z: 58 }, { x: 132, z: 62 }, { x: 150, z: 58 }, { x: 160, z: 44 }, { x: 158, z: 24 },
  { x: 146, z: 12 }, { x: 128, z: 10 }, { x: 118, z: 20 }, { x: 114, z: 40 }
];
export const COVE_ICE: Vec2[] = [{ x: 138, z: 30 }, { x: 146, z: 40 }, { x: 132, z: 44 }];
export const COVE_DOMAIN = makeDomain({ outline: COVE, depth: 7, shelf: 6, obstacles: [], centre: { x: 138, z: 34 } });

export const sanctuaryWorld = (p: { x: number; y?: number; z: number }): Vec3 => ({ x: SANCTUARY_ORIGIN.x + p.x, y: p.y ?? 0, z: SANCTUARY_ORIGIN.z + p.z });

/** Curated viewpoints (area-local). "orcas" follows the pod (see CameraRig). */
export const SANCTUARY_SHOTS: Record<Exclude<SanctuaryView, "orcas">, { pos: Vec3; target: Vec3 }> = {
  // From the observation point high on the headland: the whole bay to the horizon.
  // Standing at the back of the lookout platform, the rail and the visitors in front.
  overview: { pos: { x: LOOKOUT.x - 4.2, y: LOOKOUT.y + 2.6, z: LOOKOUT.z + 4.6 }, target: { x: 10, y: -4, z: -40 } },
  // Inside the observation station, looking out under the sea.
  underwater: { pos: { x: STATION.x + 3.2, y: -3.4, z: STATION.z + 3.4 }, target: { x: STATION.x - 14, y: -3.0, z: STATION.z - 22 } },
  research: { pos: { x: RESEARCH.x - 36, y: 13, z: RESEARCH.z + 12 }, target: { x: RESEARCH.x, y: 0, z: 34 } },
  belugas: { pos: { x: 137, y: 7.5, z: 72 }, target: { x: 140, y: -1, z: 36 } }
};
/** The first-visit reveal: high over the open ocean, sweeping in to the observation point. */
export const SANCTUARY_REVEAL_FROM = { pos: { x: -20, y: 150, z: -360 }, target: { x: 0, y: 0, z: 10 } };

/** Where curious orcas cruise past the station's windows (a line across its view, out of reach of the walls). */
export const STATION_PASS: Vec3[] = [{ x: 65.6, y: -3.6, z: 4.8 }, { x: 49.6, y: -3.2, z: 16.8 }, { x: 60, y: -4, z: 8 }];
/** Scenic orca positions beside the island or research boat. */
export const BY_ISLAND: Vec3 = { x: ISLAND.x + 20, y: -1.2, z: ISLAND.z + 6 };
export const BY_BOAT: Vec3 = { x: BOAT.x - 4, y: -1.2, z: BOAT.z - 14 };

/** Visitors' places. */
export const LOOKOUT_SPOTS: Vec2[] = [{ x: LOOKOUT.x - 3, z: LOOKOUT.z - 2.5 }, { x: LOOKOUT.x + 1.5, z: LOOKOUT.z - 3.2 }];
export const STATION_SPOTS: Vec2[] = [{ x: STATION.x - 2.4, z: STATION.z - 1.8 }, { x: STATION.x + 2.2, z: STATION.z - 3.4 }];
export const PIER_PATH: Vec2[] = [{ x: STATION.x - 1, z: 56 }, { x: STATION.x - 1, z: 30 }];

/** Floating litter for the Ocean Cleanup: near the shore by the research station and the pier (area-local). */
export const LITTER_SPOTS: (Vec2 & { kind: "bottle" | "bag" | "can" | "cup" | "net" })[] = [
  { x: 6, z: 44, kind: "bottle" }, { x: 18, z: 40, kind: "bag" }, { x: 34, z: 44, kind: "can" }, { x: 46, z: 38, kind: "cup" }, { x: 12, z: 30, kind: "net" }
];
