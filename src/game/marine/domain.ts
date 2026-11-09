/**
 * A swimmable body of water for the outdoor areas, authored as one polygon
 * outline (area-local metres; the surface is y = 0). Edges can be shore (a
 * beach that shelves down) or wall (a quay or a viewing window: deep right up
 * to it). Round obstacles (an island, a pontoon, a station) are cut out.
 * Everything that swims or is drawn under water asks this one object, so the
 * animals, the sea floor and the shoreline always agree.
 */

export interface Pt { x: number; z: number }
export interface Obstacle { x: number; z: number; r: number }

export interface WaterDomain {
  /** Signed distance (m) inside the swimmable water at (x, z): > 0 inside, obstacles excluded. */
  inside(x: number, z: number): number;
  /** The bottom height at (x, z) (negative; the land around is at LAND_Y). */
  floor(x: number, z: number): number;
  /** Bounds of the outline (target sampling, terrain). */
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** A deep, central point (the escape direction when an animal is cornered). */
  centre: Pt;
  outline: Pt[];
  walls: boolean[];
  obstacles: Obstacle[];
}

export const LAND_Y = 0.8;

function segDist(px: number, pz: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2));
  return Math.hypot(a.x + dx * t - px, a.z + dz * t - pz);
}

export function pointInPolygon(pts: Pt[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

const smooth = (e0: number, e1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface DomainSpec {
  outline: Pt[];
  /** Indices of edges (outline[i] -> outline[i+1]) that are walls, not beaches. */
  wallEdges?: number[];
  /** Deepest floor (positive metres below the surface) and the beach width over which it shelves. */
  depth: number;
  shelf: number;
  obstacles?: Obstacle[];
  centre: Pt;
  /** Optional floor shaping (a reef, a trench), given the shelved floor. */
  shape?: (x: number, z: number, floor: number) => number;
}

export function makeDomain(spec: DomainSpec): WaterDomain {
  const pts = spec.outline;
  const walls = pts.map((_, i) => Boolean(spec.wallEdges?.includes(i)));
  const obstacles = spec.obstacles ?? [];
  const box = {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z))
  };
  const edgeDist = (x: number, z: number, shoreOnly: boolean) => {
    let d = Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (shoreOnly && walls[i]) continue;
      d = Math.min(d, segDist(x, z, pts[i], pts[(i + 1) % pts.length]));
    }
    return d;
  };
  const outlineSd = (x: number, z: number) => (pointInPolygon(pts, x, z) ? 1 : -1) * edgeDist(x, z, false);
  return {
    box, centre: spec.centre, outline: pts, walls, obstacles,
    inside(x, z) {
      let d = outlineSd(x, z);
      for (const o of obstacles) d = Math.min(d, Math.hypot(x - o.x, z - o.z) - o.r);
      return d;
    },
    floor(x, z) {
      if (!pointInPolygon(pts, x, z)) return LAND_Y - 0.1;
      // Shelving from the beaches only: a wall is deep right up to its face.
      const shore = edgeDist(x, z, true);
      const f = LAND_Y - 0.02 - (LAND_Y + spec.depth) * smooth(0, spec.shelf, shore);
      return spec.shape ? spec.shape(x, z, f) : f;
    }
  };
}

/** A point `r` from the outline, sampled inside (for targets). */
export function randomPoint(d: WaterDomain, rand: () => number, minInside: number, minDepth: number, tries = 40): Pt | null {
  for (let i = 0; i < tries; i++) {
    const x = d.box.minX + rand() * (d.box.maxX - d.box.minX);
    const z = d.box.minZ + rand() * (d.box.maxZ - d.box.minZ);
    if (d.inside(x, z) >= minInside && d.floor(x, z) <= -minDepth) return { x, z };
  }
  return null;
}
