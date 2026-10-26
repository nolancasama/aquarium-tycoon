import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BENCH, BENCH_FACING, BENCH_SEAT_H, benchPose } from "../../game/world";
import type { VisitorType } from "../../game/types";
import { personModel } from "./people";

// Actual seat/backrest dimensions, with a tiny inset to allow surface contact.
const furniture = [
  new THREE.Box3(new THREE.Vector3(BENCH.x - 0.25 + 0.001, 0.421, BENCH.z - 0.749), new THREE.Vector3(BENCH.x + 0.249, BENCH_SEAT_H - 0.001, BENCH.z + 0.749)),
  new THREE.Box3(new THREE.Vector3(BENCH.x + 0.201, 0.461, BENCH.z - 0.749), new THREE.Vector3(BENCH.x + 0.279, 0.959, BENCH.z + 0.749))
];

function intersects(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): boolean {
  const p = geometry.getAttribute("position");
  const triangle = new THREE.Triangle();
  for (let i = 0; i < p.count; i += 3) {
    triangle.a.fromBufferAttribute(p, i).applyMatrix4(matrix);
    triangle.b.fromBufferAttribute(p, i + 1).applyMatrix4(matrix);
    triangle.c.fromBufferAttribute(p, i + 2).applyMatrix4(matrix);
    if (furniture.some((box) => box.intersectsTriangle(triangle))) return true;
  }
  return false;
}

describe("bench pose clearance", () => {
  for (const type of ["child", "adult", "fan", "grandma", "explorer", "judge"] as VisitorType[]) {
    it(`${type}: body, thighs and shoes clear the bench through sitting and standing`, () => {
      const model = personModel(type, 0);
      // Standing retraces these same poses, so checking the full curve covers both.
      for (let sample = 0; sample <= 40; sample++) {
        const pose = benchPose(sample / 40, model.hip);
        const root = new THREE.Matrix4().makeTranslation(pose.x, pose.bodyY, pose.z).multiply(new THREE.Matrix4().makeRotationY(BENCH_FACING));
        expect(intersects(model.body, root), `${type} body at ${sample}`).toBe(false);
        for (const sign of [-1, 1]) {
          const thigh = root.clone().multiply(new THREE.Matrix4().makeTranslation(sign * model.legX, model.hip, 0)).multiply(new THREE.Matrix4().makeRotationX(pose.thigh));
          const shin = thigh.clone().multiply(new THREE.Matrix4().makeTranslation(0, -model.thigh, 0)).multiply(new THREE.Matrix4().makeRotationX(pose.knee));
          expect(intersects(model.leg, thigh), `${type} thigh at ${sample}`).toBe(false);
          expect(intersects(model.shin, shin), `${type} shin/shoe at ${sample}`).toBe(false);
        }
      }
    });
  }
});
