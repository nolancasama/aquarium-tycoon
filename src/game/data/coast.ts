import type { CoastDecorKind, DecorKind, TankType, Vec2, Vec3 } from "../types";

/**
 * The Coastal & Polar Zone: three separate exhibits side by side behind a
 * visitor walkway, each a cutaway diorama: a rocky land shelf at the back, a
 * deep pool in front whose underwater part shows through the viewing window.
 * Every exhibit is authored data: the land shelf (flat, one height), the water
 * volume, the shore ramps that join them, and islands (rocks rising out of the
 * pool). Animals only move along these pieces, so they cannot walk under water,
 * swim through rock or sink into the ground. See game/coast/motion.ts.
 *
 * Coordinates: world metres. Exhibit-local x runs left to right, z toward the
 * viewing window (+z), y up from the walkway floor.
 */

export type CoastHabitat = "penguins" | "seals" | "otters";
export const COAST_HABITATS: CoastHabitat[] = ["penguins", "seals", "otters"];

/** The wing's origin, far from the halls and the hub (only the active area is drawn). */
export const COAST_ORIGIN: Vec2 = { x: -130, z: -60 };
/** Exhibit width (x) and depth (z, from the back wall to the window). */
export const EX_W = 13;
export const EX_D = 10;
export const WINDOW_Z = EX_D / 2;
export const WALKWAY_D = 4;
/** Glass and wall top (the rail visitors lean on above the water). */
export const GLASS_TOP = 2.55;

export interface Island {
  x: number;
  z: number;
  /** Footprint radius at the waterline, and the flat top's height. */
  r: number;
  top: number;
  /** Optional broad flat top (legacy rocks use 55% of the waterline radius). */
  topRadius?: number;
  /** Where an animal waits in the water before climbing out (exhibit-local, at the surface). */
  climb: Vec2;
  /** Where it rests on top. */
  rest: Vec2;
}

export interface Ramp {
  /** Top on the land shelf and bottom at the waterline (exhibit-local x/z). */
  top: Vec2;
  bottom: Vec2;
  /** Full width of the solid shore slope; older exhibits keep their 1.5 m ramp. */
  width?: number;
}

/** A low shelf rock with a flat snowy resting top and a single safe step route. */
export interface RestLedge {
  x: number;
  z: number;
  r: number;
  top: number;
  approach: Vec2;
  rest: Vec2;
}

export interface ExhibitDef {
  id: CoastHabitat;
  /** Exhibit centre in world space. */
  x: number;
  z: number;
  /** Land shelf: a rectangle at one height (exhibit-local). */
  land: { minX: number; maxX: number; minZ: number; maxZ: number; y: number };
  /** Water: the pool rectangle, floor and surface heights. */
  pool: { minX: number; maxX: number; minZ: number; maxZ: number; floor: number; surface: number };
  ramps: Ramp[];
  islands: Island[];
  /** Optional authored resting rocks; ordinary land paths go around their solid bases. */
  ledges?: RestLedge[];
  /** Solid pool pieces, conservatively avoided at every swimming depth. */
  swimObstacles?: { x: number; z: number; r: number; top: number; kind: "ice" | "rock" }[];
  /** Built-in boulders on the land shelf (scenery and obstacles: centre and radius). */
  boulders: { x: number; z: number; r: number; h: number }[];
  /** Item positions (exhibit-local). `land` items stand on the shelf, `water` ones float, `floor` ones sit on the pool bottom. */
  slots: { x: number; z: number; on: "land" | "water" | "floor" }[];
  /** Palette: rock, land top, water tint. */
  colors: { rock: string; top: string; water: string; accent: string };
  name: string;
  ja: string;
}

const SURFACE = 1.95;

export const EXHIBITS: Record<CoastHabitat, ExhibitDef> = {
  penguins: {
    id: "penguins", name: "Penguin Coast", ja: "ペンギンの かいがん",
    x: COAST_ORIGIN.x - 15, z: COAST_ORIGIN.z,
    land: { minX: -6.1, maxX: 6.1, minZ: -4.6, maxZ: -0.7, y: 2.35 },
    pool: { minX: -6.3, maxX: 6.3, minZ: -0.6, maxZ: 4.85, floor: 0.15, surface: SURFACE },
    ramps: [{ top: { x: -1.6, z: -1.0 }, bottom: { x: -1.6, z: 1.15 }, width: 3.5 }],
    islands: [{ x: 3.75, z: 1.65, r: 1.15, top: 2.18, topRadius: 1.0, climb: { x: 2.08, z: 1.65 }, rest: { x: 3.75, z: 1.6 } }],
    ledges: [
      { x: -4.25, z: -2.5, r: 0.85, top: 2.68, approach: { x: -4.25, z: -1.15 }, rest: { x: -4.25, z: -2.5 } },
      { x: 3.95, z: -2.8, r: 0.8, top: 2.78, approach: { x: 3.95, z: -1.5 }, rest: { x: 3.95, z: -2.8 } }
    ],
    swimObstacles: [
      { x: -5.25, z: 0.75, r: 0.65, top: 2.12, kind: "ice" },
      { x: 5.35, z: 3.55, r: 0.5, top: 2.08, kind: "ice" },
      { x: 5.45, z: -0.05, r: 0.5, top: 2.02, kind: "ice" },
      { x: -4.55, z: 3.6, r: 0.6, top: 1.12, kind: "rock" },
      { x: 0.75, z: 3.8, r: 0.55, top: 0.95, kind: "rock" },
      { x: 0.65, z: 0.45, r: 0.5, top: 1.05, kind: "rock" }
    ],
    boulders: [{ x: -5.2, z: -4.0, r: 0.7, h: 1.0 }, { x: 5.3, z: -3.9, r: 0.65, h: 0.9 }, { x: 0.6, z: -4.3, r: 0.5, h: 0.6 }],
    slots: [{ x: -2.7, z: -3.2, on: "land" }, { x: 0.65, z: -2.5, on: "land" }, { x: 2.5, z: -1.8, on: "land" }, { x: -1.0, z: -3.85, on: "land" }],
    colors: { rock: "#697f8e", top: "#bacbd0", water: "#68bdc9", accent: "#eff7f6" }
  },
  seals: {
    id: "seals", name: "Seal Cove", ja: "アザラシの いりえ",
    x: COAST_ORIGIN.x, z: COAST_ORIGIN.z,
    land: { minX: -6.1, maxX: 6.1, minZ: -4.6, maxZ: -2.2, y: 2.3 },
    pool: { minX: -6.3, maxX: 6.3, minZ: -2.1, maxZ: 4.85, floor: 0.15, surface: SURFACE },
    ramps: [{ top: { x: 3.6, z: -2.4 }, bottom: { x: 3.6, z: -0.3 } }],
    islands: [{ x: -2.6, z: 1.3, r: 1.6, top: 2.25, climb: { x: -0.6, z: 1.6 }, rest: { x: -2.6, z: 1.2 } }],
    boulders: [{ x: -5.0, z: -3.8, r: 0.8, h: 1.1 }, { x: 0.4, z: -4.0, r: 0.6, h: 0.8 }],
    slots: [{ x: -2.4, z: -3.3, on: "land" }, { x: 1.8, z: -3.4, on: "land" }, { x: 1.2, z: 3.2, on: "water" }, { x: 4.6, z: 3.6, on: "water" }, { x: 5.0, z: 1.6, on: "floor" }, { x: 0.2, z: 3.9, on: "floor" }],
    colors: { rock: "#7d7368", top: "#a89c8c", water: "#4fb3cf", accent: "#d9cbb6" }
  },
  otters: {
    id: "otters", name: "Otter Bay", ja: "ラッコの わん",
    x: COAST_ORIGIN.x + 15, z: COAST_ORIGIN.z,
    land: { minX: -6.1, maxX: 6.1, minZ: -4.6, maxZ: -1.4, y: 2.3 },
    pool: { minX: -6.3, maxX: 6.3, minZ: -1.3, maxZ: 4.85, floor: 0.15, surface: SURFACE },
    ramps: [{ top: { x: -3.4, z: -1.6 }, bottom: { x: -3.4, z: 0.5 } }],
    islands: [],
    boulders: [{ x: 5.0, z: -3.9, r: 0.75, h: 1.0 }, { x: -0.5, z: -4.2, r: 0.55, h: 0.7 }],
    slots: [{ x: 1.6, z: 2.0, on: "water" }, { x: -1.0, z: 3.3, on: "water" }, { x: 4.2, z: 3.4, on: "water" }, { x: 3.4, z: -3.0, on: "land" }, { x: 0.8, z: -3.2, on: "land" }],
    colors: { rock: "#6f6253", top: "#8f9a6a", water: "#58b9c4", accent: "#3e8f5a" }
  }
};

/** World position of an exhibit-local point. */
export const exWorld = (ex: ExhibitDef, p: { x: number; z: number }, y = 0): Vec3 => ({ x: ex.x + p.x, y, z: ex.z + p.z });

/** Viewpoints: the whole wing, or one exhibit. Narrow screens step back along the view. */
export type CoastView = "all" | CoastHabitat;
export function coastCamera(view: CoastView, counting = false, underwater = false): { pos: Vec3; target: Vec3 } {
  // Counting: higher and further back, so every animal (shelf and pool) stays clear of the HUD while the question panel lifts the view.
  if (counting && view !== "all") {
    const ex = EXHIBITS[view];
    return { pos: { x: ex.x, y: 15, z: ex.z + 11 }, target: { x: ex.x, y: 0.4, z: ex.z - 1.2 } };
  }
  if (view === "all") {
    return { pos: { x: COAST_ORIGIN.x, y: 21, z: COAST_ORIGIN.z + 38 }, target: { x: COAST_ORIGIN.x, y: 0.9, z: COAST_ORIGIN.z + 0.5 } };
  }
  const ex = EXHIBITS[view];
  if (view === "penguins") {
    if (underwater) return { pos: { x: ex.x, y: 1.05, z: ex.z + 13.1 }, target: { x: ex.x, y: 1.15, z: ex.z + 0.4 } };
    return { pos: { x: ex.x + 0.7, y: 7.4, z: ex.z + 17.6 }, target: { x: ex.x, y: 1.85, z: ex.z - 0.3 } };
  }
  return { pos: { x: ex.x, y: 8.8, z: ex.z + 13.6 }, target: { x: ex.x, y: 1.45, z: ex.z + 0.2 } };
}

/** Where each coastal item can stand: on the land shelf, floating on the water, or on the pool floor. */
export const ITEM_ON: Record<CoastDecorKind, "land" | "water" | "floor"> = {
  penguinRock: "land", penguinNest: "land", penguinFeeder: "land",
  sealRock: "land", sealBall: "water", sealBuoy: "floor",
  otterKelp: "water", otterToy: "water", otterDen: "land"
};

/** Can this item go in this slot of a coastal habitat? (Other tanks: always.) */
export function coastSlotFits(type: TankType, slot: number, kind: DecorKind): boolean {
  if (type !== "penguins" && type !== "seals" && type !== "otters") return true;
  const on = ITEM_ON[kind as CoastDecorKind];
  return Boolean(on) && EXHIBITS[type].slots[slot]?.on === on;
}

/** Swimmers keep this far inside the pool sides, floor and surface. */
export const SWIM_MARGIN = 0.35;
/** Bodies stay this far from an island's rock. */
export const ISLAND_CLEAR = 0.45;
