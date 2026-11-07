import { describe, expect, it } from "vitest";
import {
  CHAMBER_S, EXPLORE_START_S, glassHeightAt, HABITAT, seabedY, sectionAt, sharkSwimVolume, structureObstacles,
  TUNNEL_ROCKS, TUNNEL_SHAPE, TUNNEL_STRUCTURES, TUNNEL_VIEWING_SPOTS, TUNNEL_ZONES, walkHalfWidth, walkwayFrame,
  walkwayLength, walkwayPoint, WALKWAY_SAMPLES
} from "./sharkTunnel";
import { tunnelClearance } from "../tunnel/swim3d";
import type { TunnelDecorKind } from "../types";
import type { Obstacle } from "../tunnel/contract";

const KINDS = Object.keys(TUNNEL_STRUCTURES) as TunnelDecorKind[];

/** Distance from a point to the closest tube floor centreline sample (horizontal). */
function nearestTube(x: number, z: number) {
  let best = Infinity, w = 0;
  for (const p of TUNNEL_SHAPE.points) {
    if (p.inside) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < best) { best = d; w = p.halfWidth; }
  }
  return best - w;
}

/** Signed clearance of the tube solid only (the tunnel part of the swim oracle). */
function tubeGap(x: number, y: number, z: number) {
  const v = sharkSwimVolume([]);
  return tunnelClearance({ ...v, obstacles: [], min: { x: -1e3, y: -1e3, z: -1e3 }, max: { x: 1e3, y: 1e3, z: 1e3 }, floorY: () => -1e3 }, x, y, z);
}

function obstacleExtent(o: Obstacle) {
  if (o.kind === "sphere") return [o.c.x - o.r, o.c.x + o.r, o.c.z - o.r, o.c.z + o.r, o.c.y - o.r, o.c.y + o.r];
  if (o.kind === "capsule") return [Math.min(o.a.x, o.b.x) - o.r, Math.max(o.a.x, o.b.x) + o.r, Math.min(o.a.z, o.b.z) - o.r, Math.max(o.a.z, o.b.z) + o.r, Math.min(o.a.y, o.b.y) - o.r, Math.max(o.a.y, o.b.y) + o.r];
  const c = Math.abs(Math.cos(o.yaw ?? 0)), s = Math.abs(Math.sin(o.yaw ?? 0));
  const hx = c * o.half.x + s * o.half.z, hz = s * o.half.x + c * o.half.z;
  return [o.c.x - hx, o.c.x + hx, o.c.z - hz, o.c.z + hz, o.c.y - o.half.y, o.c.y + o.half.y];
}

describe("Shark Tunnel geometry", () => {
  it("is a smooth closed loop through the habitat, with the lobby outside the water", () => {
    expect(walkwayLength).toBeGreaterThan(55);
    expect(walkwayLength).toBeLessThan(90);
    for (let i = 0; i < WALKWAY_SAMPLES.length; i++) {
      const a = WALKWAY_SAMPLES[i], b = WALKWAY_SAMPLES[(i + 1) % WALKWAY_SAMPLES.length];
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.7);
      if (!a.inside) {
        expect(a.x).toBeGreaterThan(HABITAT.min.x + a.halfWidth);
        expect(a.x).toBeLessThan(HABITAT.max.x - a.halfWidth);
        expect(a.z).toBeGreaterThan(HABITAT.min.z + a.halfWidth);
      }
    }
    // Direction changes gently everywhere (no kinks for camera or walking).
    for (let s = 0; s < walkwayLength; s += 0.25) {
      const a = walkwayFrame(s), b = walkwayFrame(s + 0.25);
      // The dry lobby turns tighter (it is a room); the tube itself is a gentle curve.
      expect(Math.acos(Math.min(1, a.dx * b.dx + a.dz * b.dz)), `s=${s}`).toBeLessThan(a.inside || b.inside ? 0.3 : 0.12);
    }
  });

  it("keeps an adult's head under the glass anywhere people may walk", () => {
    for (let s = 0; s < walkwayLength; s += 0.3) {
      const f = walkwayFrame(s);
      if (f.inside) continue;
      const w = walkHalfWidth(s);
      // Shoulders: 0.25 m beyond the clamp; head 1.8 m.
      expect(glassHeightAt(s, w + 0.25), `s=${s.toFixed(1)}`).toBeGreaterThan(1.85);
      const p = walkwayPoint(s, w + 5);
      expect(Math.hypot(p.x - f.x, p.z - f.z)).toBeLessThanOrEqual(w + 1e-6);
      // And the walking volume itself is inside the tube solid.
      expect(tubeGap(p.x, 1.0, p.z)).toBeLessThan(-0.3);
    }
  });

  it("places sections and viewing spots in walking order", () => {
    expect(sectionAt(EXPLORE_START_S)).toBe("entrance");
    expect(sectionAt(CHAMBER_S)).toBe("grandChamber");
    for (const spot of TUNNEL_VIEWING_SPOTS) expect(sectionAt(spot.s)).toBe(spot.section);
    expect(walkwayFrame(CHAMBER_S).chamber).toBeGreaterThan(0.9);
  });

  it("keeps every zone's structure clear of the tube, the walls, the rocks and the other zones", () => {
    for (let zone = 0; zone < TUNNEL_ZONES.length; zone++) for (const kind of KINDS) {
      for (const o of structureObstacles(kind, zone)) {
        const [x0, x1, z0, z1, y0] = obstacleExtent(o);
        expect(x0).toBeGreaterThan(HABITAT.min.x + 0.8);
        expect(x1).toBeLessThan(HABITAT.max.x - 0.8);
        expect(z0).toBeGreaterThan(HABITAT.min.z + 0.8);
        expect(z1).toBeLessThan(HABITAT.max.z - 0.8);
        expect(y0).toBeGreaterThan(HABITAT.min.y - 1.5);
        for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) expect(nearestTube(x, z), `${kind} @${zone}`).toBeGreaterThan(0.8);
        for (const r of TUNNEL_ROCKS) {
          const [rx0, rx1, rz0, rz1] = obstacleExtent(r);
          const overlap = x0 < rx1 && x1 > rx0 && z0 < rz1 && z1 > rz0;
          expect(overlap, `${kind} @${zone} vs rock`).toBe(false);
        }
      }
    }
    for (let a = 0; a < TUNNEL_ZONES.length; a++) for (let b = a + 1; b < TUNNEL_ZONES.length; b++) {
      expect(Math.hypot(TUNNEL_ZONES[a].x - TUNNEL_ZONES[b].x, TUNNEL_ZONES[a].z - TUNNEL_ZONES[b].z)).toBeGreaterThan(6);
    }
  });

  it("keeps built-in rocks off the tube and inside the water", () => {
    for (const r of TUNNEL_ROCKS) {
      const [x0, x1, z0, z1] = obstacleExtent(r);
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) expect(nearestTube(x, z)).toBeGreaterThan(0.6);
      expect(x0).toBeGreaterThan(HABITAT.min.x - 0.5);
      expect(x1).toBeLessThan(HABITAT.max.x + 0.5);
    }
  });

  it("builds a swim volume whose seabed is in the water and whose rest spots are free", () => {
    const v = sharkSwimVolume([{ zone: 1, kind: "tunnelLedge" }, { zone: 3, kind: "tunnelArch" }]);
    for (let x = v.min.x; x <= v.max.x; x += 2) for (let z = v.min.z; z <= v.max.z; z += 2) {
      expect(v.floorY(x, z)).toBeGreaterThanOrEqual(v.min.y);
      expect(v.floorY(x, z)).toBeLessThan(0);
    }
    expect(v.gates).toHaveLength(1);
    expect(v.restSpots!.length).toBe(3);
    // A zebra shark (radius 0.4 + margin) fits at each rest spot's approach height.
    for (const p of v.restSpots!) expect(tunnelClearance(v, p.x, p.y + 0.4 + 0.09 + 0.2, p.z)).toBeGreaterThan(0.45);
    expect(seabedY(36, -25)).toBeLessThan(-0.2);
  });
});
