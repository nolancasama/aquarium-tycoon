/**
 * Shark Tunnel: the frozen contract between the habitat (data, scene, rules) and
 * the large-animal swim simulation. See DESIGN_DECISIONS.md, "Shark Tunnel
 * expansion (design freeze)". World units are metres, y up.
 *
 * Ownership:
 * - The habitat side builds a `SwimVolume` from its geometry and the placed
 *   structures (`src/game/data/sharkTunnel.ts`) and owns everything around it.
 * - The swim side implements `createTunnelSwim` (`src/game/tunnel/swim3d.ts`),
 *   the animal models and `<TunnelAnimals>` (`src/scene/tunnel/`).
 * Change this file only by agreement between both sides.
 */

/** The large animals that live in the Shark Tunnel habitat. */
export type TunnelSpecies = "blacktip" | "zebrashark" | "eagleray";

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A solid ball: rock lumps, a pinnacle's crown, a decoration's bulk. */
export interface SphereObstacle {
  kind: "sphere";
  c: P3;
  r: number;
}

/** A solid segment with a radius: rock pillars, an arch's legs, a tunnel section. */
export interface CapsuleObstacle {
  kind: "capsule";
  a: P3;
  b: P3;
  r: number;
}

/**
 * An axis-aligned solid block (a ledge, a sand bank, the lobby building).
 * Optional `yaw` (radians about +y, about the centre) for rotated blocks.
 */
export interface BoxObstacle {
  kind: "box";
  c: P3;
  half: P3;
  yaw?: number;
}

export type Obstacle = SphereObstacle | CapsuleObstacle | BoxObstacle;

/**
 * The walk-through tunnel as animals must see it: a centreline (floor level, in
 * walking order, closed loop) and the tube's outer half-width and outer height
 * above the floor at each point (the glass outside surface, not the walkway).
 * Animals keep `clearance` (their own radius plus margin) away from this solid.
 * Sections inside the lobby building are flagged `inside` and are not in water.
 */
export interface TunnelShape {
  points: Array<P3 & { halfWidth: number; height: number; inside?: boolean }>;
  closed: true;
}

/** Everything the swim simulation needs to know about the water. */
export interface SwimVolume {
  /** The water box (inner walls of the habitat and the water surface). */
  min: P3;
  max: P3;
  /** Seabed height at (x, z); must be cheap (called per animal per frame). */
  floorY: (x: number, z: number) => number;
  tunnel: TunnelShape;
  /** Built-in rocks and placed structures. Replaced wholesale when decor changes. */
  obstacles: Obstacle[];
  /**
   * Openings animals are invited to swim through (e.g. the big rock arch):
   * a gate centre and its axis. Optional behaviour hints, never required.
   */
  gates?: Array<{ c: P3; axis: P3; r: number }>;
  /** Spots where a zebra shark may lie on the sand (resting ledges first). */
  restSpots?: P3[];
}

export interface SwimAnimal {
  id: string;
  species: TunnelSpecies;
}

/** One animal's state for rendering, cameras, visitors and English activities. */
export interface AnimalPose {
  id: string;
  species: TunnelSpecies;
  /** Body centre. */
  x: number;
  y: number;
  z: number;
  /** Unit heading (where the head points). */
  hx: number;
  hy: number;
  hz: number;
  /** Bank angle (radians, + rolls right), current speed (m/s). */
  bank: number;
  speed: number;
  /** True while lying on the sand (zebra shark rest). */
  resting: boolean;
  /**
   * How far the renderer lowers the body below (x, y, z) so a resting animal lies on
   * the surface under it (eased in and out by the simulation; 0 while swimming). The
   * space below a rest spot is free, so this never moves a body into a solid.
   */
  restDrop?: number;
  /** Bounding radius for picking and visibility (about half the body length). */
  radius: number;
}

export interface TunnelSwim {
  /** Adds new animals (placed at free spawn points) and removes missing ones. */
  sync(animals: readonly SwimAnimal[]): void;
  /** Replaces the obstacles/gates/rest spots after a decoration change. */
  setVolume(volume: SwimVolume): void;
  /** Advances the simulation; dt is clamped internally. Must not allocate per call. */
  step(dt: number): void;
  /** Live poses, one per animal (stable array; entries updated in place). */
  poses(): readonly AnimalPose[];
  /** Bias this animal's wandering toward a point for some seconds (English "find" help). */
  attract(id: string, point: P3, seconds: number): void;
  /** Slow this animal and keep it near its current spot for some seconds (stable question moment). */
  hold(id: string, seconds: number): void;
  /**
   * Per-animal body shape for the renderer: head-led path samples from head to
   * tail, `n` points, written into `out` as xyz triples. Returns false if unknown.
   */
  spine(id: string, out: Float32Array, n: number): boolean;
}

/** The single live swim instance for the habitat, shared by scene, camera and flow. */
export const tunnelRuntime: { swim: TunnelSwim | null } = { swim: null };
