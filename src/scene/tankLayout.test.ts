import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SAND_H, STAND_H, TANKS } from "../game/data/tanks";
import { hall2Geometry, roomGeometry, tankShellGeometry } from "./models/room";
import { slotMarkerY, SLOT_MARKER_MAX_SCALE, SLOT_MARKER_RADIUS } from "../game/logic/tankLayout";

describe("decoration circles rest on the sand", () => {
  for (const tank of Object.values(TANKS)) {
    it(`${tank.type}: every draped, pulsing circle sits just above the rendered sand`, () => {
      const geometry = tankShellGeometry(tank.type);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.updateMatrixWorld();
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const sandTop = (x: number, z: number) => {
        ray.set(new THREE.Vector3(x, STAND_H + SAND_H + 0.2, z), down);
        const hit = ray.intersectObject(mesh).find((h) => h.point.y < STAND_H + SAND_H + 0.1);
        return hit ? hit.point.y : -Infinity;
      };
      for (const slot of tank.slots) {
        const outer = SLOT_MARKER_RADIUS * SLOT_MARKER_MAX_SCALE;
        expect(tank.w / 2 - Math.abs(slot.x) - outer).toBeGreaterThanOrEqual(0.025);
        expect(tank.d / 2 - Math.abs(slot.z) - outer).toBeGreaterThanOrEqual(0.025);
        for (const scale of [0.85, 0.88, 1, SLOT_MARKER_MAX_SCALE]) {
          // Inner to outer edge, around the whole ring: vertices and the spans between them.
          for (let r = 0.1 * scale; r <= SLOT_MARKER_RADIUS * scale + 1e-9; r += (SLOT_MARKER_RADIUS - 0.1) * scale / 4) {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 32) {
              const x = slot.x + Math.cos(a) * r;
              const z = slot.z + Math.sin(a) * r;
              const y = slotMarkerY(tank, { x, z });
              const gap = y - sandTop(x, z);
              const where = JSON.stringify({ slot, scale, r, a });
              expect(gap, `visible above sand/pebbles ${where}`).toBeGreaterThan(0.002);
              expect(gap, `resting, not floating ${where}`).toBeLessThan(0.014);
            }
          }
        }
      }
      geometry.dispose();
    }, 30_000);
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
