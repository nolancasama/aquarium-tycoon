import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TANKS } from "../game/data/tanks";
import { hall2Geometry, roomGeometry } from "./models/room";
import { sandSurfaceY, slotMarkerY, SLOT_MARKER_MAX_SCALE, SLOT_MARKER_RADIUS } from "../game/logic/tankLayout";

describe("decoration circle clearance", () => {
  for (const tank of Object.values(TANKS)) {
    it(`${tank.type}: every full-size pulsing circle clears sand and walls`, () => {
      const radius = SLOT_MARKER_RADIUS * SLOT_MARKER_MAX_SCALE;
      for (const slot of tank.slots) {
        expect(tank.w / 2 - Math.abs(slot.x) - radius).toBeGreaterThanOrEqual(0.025);
        expect(tank.d / 2 - Math.abs(slot.z) - radius).toBeGreaterThanOrEqual(0.025);
        const y = slotMarkerY(tank, slot);
        // Include the interior of the animated ring's footprint, so a dune
        // crest between two rim vertices cannot hide a piece of the circle.
        for (let r = 0; r <= radius; r += radius / 8) {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 32) {
            expect(y - sandSurfaceY(tank, slot.x + Math.cos(a) * r, slot.z + Math.sin(a) * r)).toBeGreaterThan(0.007);
          }
        }
      }
    });
  }
});

describe("upper wall caps", () => {
  it("has one visible top surface at back-wall centres and side-wall joins", () => {
    const material = new THREE.MeshBasicMaterial();
    for (const [geometry, points] of [
      [roomGeometry(), [[0.137, -4.103], [6.103, -3.973], [-6.103, -3.973]]],
      [hall2Geometry(), [[12.137, -4.103], [18.073, -3.973], [6.231, -3.973]]]
    ] as const) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld();
      for (const [x, z] of points) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
        const heights = ray.intersectObject(mesh).filter((hit) => hit.point.y > 3).map((hit) => hit.point.y);
        expect(heights.length, `${x}, ${z}: closed upper wall`).toBeGreaterThan(0);
        for (let i = 1; i < heights.length; i++) {
          expect(Math.abs(heights[i] - heights[i - 1]), `${x}, ${z}: no duplicate coplanar cap`).toBeGreaterThan(0.001);
        }
      }
      geometry.dispose();
    }
    material.dispose();
  });
});
