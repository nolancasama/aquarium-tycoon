import type { RoomId, SlotId } from "../types";
import { anyPreview, areaPreviewed, areaReleased, type ReleaseArea } from "./release";

/**
 * The aquarium's rooms, in walking order along +x. Each room shares its left
 * wall with the previous room's right wall, with a doorway at DOOR_Z. A new
 * room is one entry here (bounds, pads, how it opens) plus its own scenery;
 * routes, hall arrows, camera framing and "which room is this pad in" all
 * read this list. See README "Adding a room, tank shape or animal".
 */

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  wallH: number;
}

/** What a room needs from the saved progress to be open (the first hall always is). */
export type RoomUnlock = null | "hallOpen" | "galleryOpen" | "atriumOpen" | "tunnelOpen" | "hubOpen" | "coastOpen" | "lagoonOpen" | "sanctuaryOpen";

export interface RoomDef {
  id: RoomId;
  name: string;
  ja: string;
  bounds: RoomBounds;
  /** Tank pads in this room, including freestanding and side exhibits. */
  pads: SlotId[];
  /** Optional world-space pad placements; facing is rotation about +y in radians. */
  padLayout?: Partial<Record<SlotId, { x: number; z: number; facing?: number }>>;
  unlock: RoomUnlock;
  /** Branching areas do not participate in the ordinary hall row or visitor routes. */
  wing?: RoomId;
}

/** Every doorway between rooms is centred here (z) and this wide. */
export const DOOR_Z = 1.5;
export const DOOR_W = 1.8;

export const ROOMS: RoomDef[] = [
  { id: "hall", name: "Hall 1", ja: "はじめの ホール", bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4, wallH: 3.2 }, pads: ["A", "B"], unlock: null },
  { id: "ocean", name: "Ocean Hall", ja: "うみの ホール", bounds: { minX: 6, maxX: 18, minZ: -4, maxZ: 4, wallH: 3.2 }, pads: ["C", "D", "E"], unlock: "hallOpen" },
  { id: "gallery", name: "Jellyfish Gallery", ja: "クラゲの ギャラリー", bounds: { minX: 18, maxX: 30, minZ: -4, maxZ: 4, wallH: 3.2 }, pads: ["F", "G", "H"], unlock: "galleryOpen" },
  { id: "atrium", name: "Coral Reef Atrium", ja: "サンゴの アトリウム", bounds: { minX: 30, maxX: 46, minZ: -5.5, maxZ: 5.5, wallH: 5.5 }, pads: ["I", "J", "K"],
    padLayout: { I: { x: 38, z: -1 }, J: { x: 33, z: 3 }, K: { x: 43.6, z: -3.7 } }, unlock: "atriumOpen" },
  { id: "sharks", name: "Shark Tunnel", ja: "サメの トンネル", bounds: { minX: 20, maxX: 52, minZ: -40, maxZ: -5.5, wallH: 8 },
    pads: ["L"], padLayout: { L: { x: 36, z: -25 } }, unlock: "tunnelOpen", wing: "atrium" },
  // The Grand Aquarium Hub: a rotunda well away from the hall row (only the active area is drawn).
  // It is reached through the Aquarium Map, never through the hall arrows. See data/hub.ts.
  { id: "hub", name: "Grand Hub", ja: "グランド ホール", bounds: { minX: -84, maxX: -56, minZ: -12, maxZ: 9, wallH: 7 },
    pads: [], unlock: "hubOpen", wing: "hub" },
  // The Coastal & Polar Zone: three exhibits side by side, entered from the hub. See data/coast.ts.
  { id: "coast", name: "Coastal & Polar Zone", ja: "かいがんと さむい ちいき", bounds: { minX: -152, maxX: -108, minZ: -66, maxZ: -50, wallH: 4 },
    pads: ["M", "N", "O"], unlock: "coastOpen", wing: "hub" },
  // The outdoor expansions, entered from the hub (release-locked: see data/release.ts). See data/lagoon.ts, data/sanctuary.ts.
  { id: "lagoon", name: "Dolphin Lagoon", ja: "イルカの ラグーン", bounds: { minX: -380, maxX: -260, minZ: 200, maxZ: 320, wallH: 0 },
    pads: [], unlock: "lagoonOpen", wing: "hub" },
  { id: "sanctuary", name: "Grand Ocean Sanctuary", ja: "うみの サンクチュアリ", bounds: { minX: 120, maxX: 720, minZ: 200, maxZ: 800, wallH: 0 },
    pads: [], unlock: "sanctuaryOpen", wing: "hub" }
];

export type RoomIndex = number;

export const roomIndex = (id: RoomId): RoomIndex => ROOMS.findIndex((r) => r.id === id);

/** Management-view centre (x) of each room. */
export const ROOM_CENTER_X: number[] = ROOMS.filter((r) => !r.wing).map((r) => (r.bounds.minX + r.bounds.maxX) / 2);

/** Which room a pad is in. */
export const ROOM_OF: Record<SlotId, RoomIndex> = Object.fromEntries(ROOMS.flatMap((r, i) => r.pads.map((p) => [p, i]))) as Record<SlotId, RoomIndex>;

type OpenFlags = { hallOpen: boolean; galleryOpen: boolean; atriumOpen?: boolean; tunnelOpen?: boolean; freePlay?: boolean; coastOpen?: boolean; lagoonOpen?: boolean; sanctuaryOpen?: boolean };

/** Rooms held back by a release lock (data/release.ts). */
export const RELEASE_OF: Partial<Record<RoomId, ReleaseArea>> = { coast: "coast", lagoon: "lagoon", sanctuary: "sanctuary" };

/**
 * Does the player's own progress own this room? Release locks are ignored:
 * save validation uses this, so a locked area's saved habitats are kept.
 */
export function roomOwned(i: RoomIndex, progress: OpenFlags): boolean {
  const r = ROOMS[i];
  if (!r) return false;
  if (r.unlock === "hubOpen") return Boolean(progress.freePlay && progress.tunnelOpen);
  return r.unlock === null || progress[r.unlock] === true;
}

/**
 * Can the player go there now? A release-locked area needs a development
 * preview (this session only) whatever the save says; a preview also opens the
 * hub, so the doorways can be tested. The hub is a free upgrade, derived (never bought).
 */
export function roomOpen(i: RoomIndex, progress: OpenFlags): boolean {
  const r = ROOMS[i];
  if (!r) return false;
  const area = RELEASE_OF[r.id];
  if (area) return areaPreviewed(area) || (areaReleased(area) && roomOwned(i, progress));
  if (r.unlock === "hubOpen" && anyPreview()) return true;
  return roomOwned(i, progress);
}

/** Rooms on the hall row plus the Shark Tunnel (which branches from the Atrium): the hall arrows link only these. */
export const inHallRow = (i: RoomIndex): boolean => Boolean(ROOMS[i]) && (!ROOMS[i].wing || ROOMS[i].wing === "atrium");

/** Areas that are entered with a fade and drawn on their own (the Shark Tunnel, the hub, the coast). */
export const isWingHall = (i: RoomIndex): boolean => Boolean(ROOMS[i]?.wing);

/** The room containing world x (rooms tile the x axis). */
export function roomAtX(x: number): RoomIndex {
  for (let i = ROOMS.length - 1; i > 0; i--) if (!ROOMS[i].wing && x > ROOMS[i].bounds.minX) return i;
  return 0;
}

/** The doorway x between room i-1 and room i (room i's left wall). */
export const doorX = (i: RoomIndex) => {
  if (ROOMS[i]?.wing) throw new Error("Branching wings have an authored doorway, not a hall-row doorX");
  return ROOMS[i].bounds.minX;
};

/** The Shark Tunnel wing's index in ROOMS (management view of the habitat). */
export const SHARKS_HALL: RoomIndex = ROOMS.findIndex((r) => r.id === "sharks");
/** The Coastal & Polar Zone's index in ROOMS. */
export const COAST_HALL: RoomIndex = ROOMS.findIndex((r) => r.id === "coast");
/** The Grand Aquarium Hub's index in ROOMS. */
export const HUB_HALL: RoomIndex = ROOMS.findIndex((r) => r.id === "hub");
/** The outdoor expansions' indices in ROOMS. */
export const LAGOON_HALL: RoomIndex = ROOMS.findIndex((r) => r.id === "lagoon");
export const SANCTUARY_HALL: RoomIndex = ROOMS.findIndex((r) => r.id === "sanctuary");
