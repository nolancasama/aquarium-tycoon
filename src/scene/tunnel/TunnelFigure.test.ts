import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { phonePitchForArm } from "./phonePose";

describe("Shark Tunnel visitor photo pose", () => {
  it("keeps the phone upright while the visitor raises their arm", () => {
    // Raised arm extends forward; the phone must not point along the forearm.
    for (const armPitch of [0, -0.6, -1.2, -1.725, -2.1]) {
      const phonePitch = phonePitchForArm(armPitch);
      const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(
        new THREE.Vector3(1, 0, 0), armPitch + phonePitch
      );
      expect(up.y).toBeCloseTo(1, 5);
      expect(up.z).toBeCloseTo(0, 5);
    }
  });
});
