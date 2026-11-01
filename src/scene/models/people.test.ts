import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BENCH, BENCH_FACING, BENCH_SEAT_H, SEATS, benchPose } from "../../game/world";
import type { VisitorType } from "../../game/types";
import { ATRIUM_BENCHES } from "./atrium";
import { personModel } from "./people";

// Actual seat/backrest dimensions, with a tiny inset to allow surface contact.
const furniture = [
  new THREE.Box3(new THREE.Vector3(BENCH.x - 0.25 + 0.001, BENCH_SEAT_H - 0.079, BENCH.z - 0.749), new THREE.Vector3(BENCH.x + 0.249, BENCH_SEAT_H - 0.001, BENCH.z + 0.749)),
  new THREE.Box3(new THREE.Vector3(BENCH.x + 0.201, BENCH_SEAT_H - 0.039, BENCH.z - 0.749), new THREE.Vector3(BENCH.x + 0.279, BENCH_SEAT_H + 0.459, BENCH.z + 0.749))
];

function intersects(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, boxes = furniture): boolean {
  const p = geometry.getAttribute("position");
  const triangle = new THREE.Triangle();
  for (let i = 0; i < p.count; i += 3) {
    triangle.a.fromBufferAttribute(p, i).applyMatrix4(matrix);
    triangle.b.fromBufferAttribute(p, i + 1).applyMatrix4(matrix);
    triangle.c.fromBufferAttribute(p, i + 2).applyMatrix4(matrix);
    if (boxes.some((box) => box.intersectsTriangle(triangle))) return true;
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
        const torso = root.clone().multiply(new THREE.Matrix4().makeTranslation(0, model.hip, 0)).multiply(new THREE.Matrix4().makeRotationX(pose.lean)).multiply(new THREE.Matrix4().makeTranslation(0, -model.hip, 0));
        expect(intersects(model.body, torso), `${type} body at ${sample}`).toBe(false);
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

describe("reusable bench geometry", () => {
  // Actual atrium seat, back, supports and armrests from atriumFurnitureGeometry.
  // Contact faces are inset by 1 mm, as for the existing Hall 1 test.
  const atriumFurniture = ATRIUM_BENCHES.flatMap((bench) => {
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.Box3(
      new THREE.Vector3(x - w / 2 + 0.001, y + 0.001, z - d / 2 + 0.001),
      new THREE.Vector3(x + w / 2 - 0.001, y + h - 0.001, z + d / 2 - 0.001)
    );
    return [
      box(2, 0.08, 0.56, bench.x, BENCH_SEAT_H - 0.08, bench.z),
      box(1.92, 0.39, 0.075, bench.x, BENCH_SEAT_H + 0.035, bench.z + 0.33),
      ...[-0.98, 0.98].flatMap((dx) => [
        box(0.12, BENCH_SEAT_H - 0.08, 0.43, bench.x + dx, 0, bench.z - 0.025),
        box(0.08, 0.12, 0.34, bench.x + dx, BENCH_SEAT_H + 0.14, bench.z - 0.045)
      ])
    ];
  });
  for (const seat of SEATS) {
    for (const type of ["adult", "child"] as const) {
      it(`${seat.id}: ${type} clears the actual furniture through sitting and standing`, () => {
        const model = personModel(type, 0);
        const boxes = seat.room === 3 ? atriumFurniture : furniture;
        for (let sample = 0; sample <= 40; sample++) {
          const pose = benchPose(sample / 40, model.hip, seat);
          const root = new THREE.Matrix4().makeTranslation(pose.x, pose.bodyY, pose.z).multiply(new THREE.Matrix4().makeRotationY(seat.facing));
          const torso = root.clone().multiply(new THREE.Matrix4().makeTranslation(0, model.hip, 0)).multiply(new THREE.Matrix4().makeRotationX(pose.lean)).multiply(new THREE.Matrix4().makeTranslation(0, -model.hip, 0));
          expect(intersects(model.body, torso, boxes), `body at ${sample}`).toBe(false);
          for (const sign of [-1, 1]) {
            const thigh = root.clone().multiply(new THREE.Matrix4().makeTranslation(sign * model.legX, model.hip, 0)).multiply(new THREE.Matrix4().makeRotationX(pose.thigh));
            const shin = thigh.clone().multiply(new THREE.Matrix4().makeTranslation(0, -model.thigh, 0)).multiply(new THREE.Matrix4().makeRotationX(pose.knee));
            expect(intersects(model.leg, thigh, boxes), `thigh at ${sample}`).toBe(false);
            expect(intersects(model.shin, shin, boxes), `shin/shoe at ${sample}`).toBe(false);
            // Sitting changes only rigid joint transforms, never body proportions.
            for (const transform of [torso, thigh, shin]) {
              const scale = new THREE.Vector3().setFromMatrixScale(transform);
              expect(scale.x).toBeCloseTo(1, 8);
              expect(scale.y).toBeCloseTo(1, 8);
              expect(scale.z).toBeCloseTo(1, 8);
            }
          }
        }
        const seated = benchPose(1, model.hip, seat);
        const radius = model.hip * (0.075 / 0.74);
        expect(model.hip + seated.bodyY).toBeCloseTo(BENCH_SEAT_H + radius, 5);
        if (type === "child") {
          // A child keeps natural thigh/shin lengths and lets their feet dangle.
          const footY = model.hip + seated.bodyY - model.thigh * (Math.cos(seated.thigh) + Math.cos(seated.thigh + seated.knee));
          expect(footY).toBeGreaterThan(0.08);
          expect(seated.thigh).toBeCloseTo(-Math.PI / 2, 5);
          expect(seated.knee).toBeCloseTo(Math.PI / 2, 5);
        }
      });
    }
  }
});

describe("bench sitting motion", () => {
  const sole = (pose: ReturnType<typeof benchPose>, hip: number) => {
    // Sole of the shin chain in world space (thigh and shin are each half the hip height).
    const a = pose.thigh;
    const b = pose.thigh + pose.knee;
    const forward = -(Math.sin(a) + Math.sin(b)) * (hip / 2);
    return { x: pose.x - forward, y: hip + pose.bodyY - (Math.cos(a) + Math.cos(b)) * (hip / 2) };
  };
  for (const type of ["adult", "grandma", "judge"] as VisitorType[]) {
    it(`${type}: feet stay planted while the hips go back and down, and stay on the floor seated`, () => {
      const { hip } = personModel(type, 0);
      const start = sole(benchPose(0, hip), hip);
      for (let sample = 0; sample <= 40; sample++) {
        const foot = sole(benchPose(sample / 40, hip), hip);
        expect(Math.abs(foot.x - start.x), `foot x at ${sample}`).toBeLessThan(0.03);
        expect(Math.abs(foot.y), `foot y at ${sample}`).toBeLessThan(0.04);
      }
    });
  }
  for (const type of ["child", "adult", "fan", "grandma", "explorer", "judge"] as VisitorType[]) {
    it(`${type}: is not seated until the hips are over the seat, and ends sitting on it`, () => {
      const { hip } = personModel(type, 0);
      const radius = hip * (0.075 / 0.74);
      for (let sample = 0; sample <= 40; sample++) {
        const pose = benchPose(sample / 40, hip);
        // Thighs close to level only once the hips are over the seat.
        if (pose.thigh < -1.3) expect(pose.x, `hips over seat at ${sample}`).toBeGreaterThan(BENCH.x - 0.25);
      }
      const seated = benchPose(1, hip);
      expect(hip + seated.bodyY).toBeCloseTo(BENCH_SEAT_H + radius, 5);
      expect(seated.thigh).toBeCloseTo(-Math.PI / 2, 5);
      expect(seated.knee).toBeCloseTo(Math.PI / 2, 5);
      expect(seated.lean).toBeCloseTo(0, 5);
    });
  }
});
