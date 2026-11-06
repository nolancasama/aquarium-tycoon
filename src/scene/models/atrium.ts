import * as THREE from "three";
import { DOOR_W, DOOR_Z, ROOMS } from "../../game/data/rooms";
import { ATRIUM_BENCHES, BENCH_SEAT_H } from "../../game/world";
export { ATRIUM_BENCHES } from "../../game/world";
import { PartBuilder } from "../partBuilder";
import { SHARK_DOOR } from "../../game/data/sharkTunnel";

/** Ground footprints are also consumed by the walking graph. */
export const ATRIUM_PALMS = [{ x: 31, z: -4.65 }, { x: 45, z: 4.65 }, { x: 45, z: -0.4 }];
// The left board stands beside (not in front of) the Shark Tunnel doorway at x 32.55.
export const ATRIUM_BOARDS = [{ x: 34.5, z: -4.75 }, { x: 40.9, z: -4.75 }];

const CREAM = "#ffe6bf";
const CORAL = "#e99579";
const TEAL = "#53b9b1";

/** Shared-wall structural returns have sole ownership of the extra height and
 * depth. Gallery owns the lower overlap; no coincident exposed surfaces. */
export function atriumWallGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.55);
  const p = ROOMS[2].bounds;
  const r = ROOMS[3].bounds;
  const t = 0.22;
  const x = r.minX + t / 2;
  for (const [z0, z1] of [[r.minZ, p.minZ], [p.maxZ, r.maxZ]]) {
    if (z1 > z0) b.box(t, r.wallH, z1 - z0, x, 0, (z0 + z1) / 2, CREAM);
  }
  if (r.wallH > p.wallH) b.box(t, r.wallH - p.wallH, p.maxZ - p.minZ, x, p.wallH, (p.minZ + p.maxZ) / 2, CREAM);
  // A thin warm lining on the east face of the Gallery's dark shared wall.
  const face = r.minX + t;
  for (const [a, c] of [[r.minZ, DOOR_Z - DOOR_W / 2], [DOOR_Z + DOOR_W / 2, r.maxZ]]) {
    b.box(0.02, r.wallH, c - a, face + 0.01, 0, (a + c) / 2, CREAM);
    b.box(0.05, 0.64, c - a, face + 0.025, 0, (a + c) / 2, TEAL);
    b.box(0.065, 0.06, c - a, face + 0.0325, 0.64, (a + c) / 2, "#fff5dc");
  }
  b.box(0.02, r.wallH - 2.3, DOOR_W, face + 0.01, 2.3, DOOR_Z, CREAM);
  const backStart = r.minX + t;
  const left = SHARK_DOOR.x - SHARK_DOOR.w / 2, right = SHARK_DOOR.x + SHARK_DOOR.w / 2;
  for (const [a, c] of [[backStart, left], [right, r.maxX + t]]) b.box(c - a, r.wallH, t, (a + c) / 2, 0, r.minZ - t / 2, CREAM);
  b.box(SHARK_DOOR.w, r.wallH - SHARK_DOOR.h, t, SHARK_DOOR.x, SHARK_DOOR.h, r.minZ - t / 2, CREAM);
  b.box(t, r.wallH, r.maxZ - r.minZ, r.maxX + t / 2, 0, (r.minZ + r.maxZ) / 2, CREAM);
  // Continuous low turquoise wall bands and pale coping.
  for (const [a, c] of [[backStart, left], [right, r.maxX]]) b.box(c - a, 0.64, 0.055, (a + c) / 2, 0, r.minZ + 0.0275, TEAL);
  b.box(0.055, 0.64, r.maxZ - r.minZ, r.maxX - 0.0275, 0, 0, TEAL);
  for (const [a, c] of [[backStart, left], [right, r.maxX]]) b.box(c - a, 0.06, 0.075, (a + c) / 2, 0.64, r.minZ + 0.0375, "#fff5dc");
  for (const x of [left, right]) b.box(0.12, SHARK_DOOR.h, 0.18, x, 0, r.minZ + 0.09, CORAL);
  b.box(SHARK_DOOR.w + 0.12, 0.13, 0.18, SHARK_DOOR.x, SHARK_DOOR.h, r.minZ + 0.09, CORAL);
  for (const z of [DOOR_Z - DOOR_W / 2, DOOR_Z + DOOR_W / 2]) b.box(0.12, 2.4, 0.16, face + 0.06, 0, z, CORAL);
  b.box(0.12, 0.18, DOOR_W + 0.16, face + 0.06, 2.3, DOOR_Z, CORAL);
  // Clerestory bays, separated by broad coral pilasters. Blue panes are in
  // the same merged opaque mesh: baked daylight never spills into old halls.
  for (const wx of [32.5, 35.3, 38.1, 40.9, 43.7]) {
    b.box(2.3, 1.28, 0.035, wx, 3.78, r.minZ + 0.03, "#8bdae5");
    b.box(2.42, 0.09, 0.12, wx, 3.72, r.minZ + 0.06, "#fff5de");
    b.box(0.06, 1.28, 0.075, wx, 3.78, r.minZ + 0.06, "#fff5de");
    b.box(2.4, 0.07, 0.10, wx, 5.04, r.minZ + 0.05, "#fff5de");
  }
  for (const wx of [31.05, 34, 36.8, 39.6, 42.4, 45.25]) {
    b.box(0.25, r.wallH, 0.19, wx, 0, r.minZ + 0.095, CORAL);
    b.box(0.41, 0.18, 0.27, wx, 3.4, r.minZ + 0.135, "#fff1d6");
  }
  for (const z of [-3.1, 0.1, 3.3]) {
    b.box(0.035, 1.2, 2.35, r.maxX - 0.03, 3.85, z, "#9de0e6");
    b.box(0.10, 0.08, 2.5, r.maxX - 0.05, 3.78, z, "#fff5de");
    b.box(0.08, 1.2, 0.06, r.maxX - 0.05, 3.85, z, "#fff5de");
  }
  // Cutaway glazed roof covers the rear half only: the management camera can
  // always see fish and open pads. One row of pale ribs makes its scale clear.
  for (const wx of [32.5, 35.3, 38.1, 40.9, 43.7]) {
    b.box(0.09, 0.11, 4.5, wx - 1.4, r.wallH - 0.08, -3.23, "#fff0d0");
  }
  b.box(0.09, 0.11, 4.5, 45.1, r.wallH - 0.08, -3.23, "#fff0d0");
  b.box(14.1, 0.12, 0.13, 38.1, r.wallH - 0.08, -0.98, CORAL);
  return b.build();
}

export function atriumFurnitureGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.55);
  for (const p of ATRIUM_PALMS) {
    b.cyl(0.42, 0.32, 0.58, p.x, 0, p.z, CORAL, 12);
    b.cyl(0.39, 0.39, 0.07, p.x, 0.53, p.z, "#ffeed0", 12);
    b.cyl(0.09, 0.14, 1.78, p.x, 0.52, p.z, "#a97949", 8);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      const dx = Math.cos(a), dz = Math.sin(a);
      const room = ROOMS[3].bounds;
      // Bound the *fronds*, not just the trunk: wall-side canopy is shorter.
      const clearance = 0.48;
      const limitX = Math.abs(dx) < 0.001 ? 1.05 : (dx > 0 ? room.maxX - clearance - p.x : p.x - room.minX - clearance) / Math.abs(dx);
      const limitZ = Math.abs(dz) < 0.001 ? 1.05 : (dz > 0 ? room.maxZ - clearance - p.z : p.z - room.minZ - clearance) / Math.abs(dz);
      const reach = Math.max(0.28, Math.min(1.05, limitX, limitZ));
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(p.x, 2.3, p.z), new THREE.Vector3(p.x + dx * reach * 0.62, 2.64, p.z + dz * reach * 0.62), new THREE.Vector3(p.x + dx * reach, 2.05, p.z + dz * reach));
      b.add(new THREE.TubeGeometry(curve, 5, 0.05, 3, false), "#438f5d", [0, 0, 0]);
      for (let j = 1; j <= 4; j++) {
        const q = curve.getPoint(j / 5);
        b.add(new THREE.SphereGeometry(1, 5, 4), i % 2 ? "#66b66d" : "#429b67", [q.x, q.y, q.z], [0, -a, 0.22], [0.32, 0.025, 0.1]);
      }
    }
  }
  for (const p of ATRIUM_BENCHES) {
    b.box(2, 0.08, 0.56, p.x, BENCH_SEAT_H - 0.08, p.z, "#bd8255");
    // Separate the back, seat and armrest faces: touching/coplanar faces
    // flickered as the management camera moved.
    b.box(1.92, 0.39, 0.075, p.x, BENCH_SEAT_H + 0.035, p.z + 0.33, "#d59b68");
    // End-mounted arms leave three usable places, including visitors' bags.
    for (const dx of [-0.98, 0.98]) {
      b.box(0.12, BENCH_SEAT_H - 0.08, 0.43, p.x + dx, 0, p.z - 0.025, "#2e8f93");
      b.box(0.08, 0.12, 0.34, p.x + dx, BENCH_SEAT_H + 0.14, p.z - 0.045, "#2e8f93");
    }
  }
  for (const p of ATRIUM_BOARDS) {
    b.box(0.12, 1.18, 0.12, p.x, 0, p.z, "#3c8d8d");
    b.box(1.25, 0.78, 0.14, p.x, 0.95, p.z, "#fff1d6");
    b.box(0.64, 0.06, 0.4, p.x, 0, p.z, TEAL);
  }
  return b.build();
}

/** All skylight glass in one draw, all fake shafts in another. */
export function atriumSkylightGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (const x of [32.5, 35.3, 38.1, 40.9, 43.7]) b.add(new THREE.PlaneGeometry(2.71, 4.4), "#d2f4f3", [x, 5.47, -3.23], [-Math.PI / 2, 0, 0], [1, 1, 1], { vary: false });
  return b.build();
}

export function atriumShaftGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (const x of [33.8, 38.1, 42.4]) {
    b.add(new THREE.PlaneGeometry(1.3, 5.5), "#fff1bd", [x - 0.55, 2.8, -2.85], [0, 0, -0.21], [1, 1, 1], { vary: false });
  }
  return b.build();
}
