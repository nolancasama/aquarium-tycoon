import type { RoomId, SlotId } from "../types";

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
export type RoomUnlock = null | "hallOpen" | "galleryOpen" | "atriumOpen";

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
}

/** Every doorway between rooms is centred here (z) and this wide. */
export const DOOR_Z = 1.5;
export const DOOR_W = 1.8;

export const ROOMS: RoomDef[] = [
  { id: "hall", name: "Hall 1", ja: "はじめの ホール", bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4, wallH: 3.2 }, pads: ["A", "B"], unlock: null },
  { id: "ocean", name: "Ocean Hall", ja: "うみの ホール", bounds: { minX: 6, maxX: 18, minZ: -4, maxZ: 4, wallH: 3.2 }, pads: ["C", "D", "E"], unlock: "hallOpen" },
  { id: "gallery", name: "Jellyfish Gallery", ja: "クラゲの ギャラリー", bounds: { minX: 18, maxX: 30, minZ: -4, maxZ: 4, wallH: 3.2 }, pads: ["F", "G", "H"], unlock: "galleryOpen" },
  { id: "atrium", name: "Coral Reef Atrium", ja: "サンゴの アトリウム", bounds: { minX: 30, maxX: 46, minZ: -5.5, maxZ: 5.5, wallH: 5.5 }, pads: ["I", "J", "K"],
    padLayout: { I: { x: 38, z: -1 }, J: { x: 33, z: 3 }, K: { x: 43.6, z: -3.7 } }, unlock: "atriumOpen" }
];

export type RoomIndex = number;

export const roomIndex = (id: RoomId): RoomIndex => ROOMS.findIndex((r) => r.id === id);

/** Management-view centre (x) of each room. */
export const ROOM_CENTER_X: number[] = ROOMS.map((r) => (r.bounds.minX + r.bounds.maxX) / 2);

/** Which room a pad is in. */
export const ROOM_OF: Record<SlotId, RoomIndex> = Object.fromEntries(ROOMS.flatMap((r, i) => r.pads.map((p) => [p, i]))) as Record<SlotId, RoomIndex>;

/** Is this room open with this progress? */
export function roomOpen(i: RoomIndex, progress: { hallOpen: boolean; galleryOpen: boolean; atriumOpen?: boolean }): boolean {
  const r = ROOMS[i];
  if (!r) return false;
  return r.unlock === null || progress[r.unlock] === true;
}

/** The room containing world x (rooms tile the x axis). */
export function roomAtX(x: number): RoomIndex {
  for (let i = ROOMS.length - 1; i > 0; i--) if (x > ROOMS[i].bounds.minX) return i;
  return 0;
}

/** The doorway x between room i-1 and room i (room i's left wall). */
export const doorX = (i: RoomIndex) => ROOMS[i].bounds.minX;
