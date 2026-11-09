import { describe, expect, it } from "vitest";
import { bayOf, HUB_CENTRE, HUB_DOORS, HUB_R } from "../../game/data/hub";
import { WALL_PLAQUE_DEPTH, WALL_PLAQUE_FACE_Z, WALL_PLAQUE_INSET, wallPlaqueNormal, wallPlaquePose } from "./hubSignMount";

describe("Grand Hub wall plaques", () => {
  it("orients every doorway plaque perpendicular to its curved wall, not the camera", () => {
    for (const kind of [...HUB_DOORS, "trophies" as const]) {
      const a = bayOf(kind).angle;
      const pose = wallPlaquePose(a, 4.65);
      const normal = wallPlaqueNormal(a);
      const outwardX = (pose.position[0] - HUB_CENTRE.x) / (HUB_R - WALL_PLAQUE_INSET);
      const outwardZ = (pose.position[2] - HUB_CENTRE.z) / (HUB_R - WALL_PLAQUE_INSET);
      expect(pose.rotation).toEqual([0, -a, 0]);
      expect(normal.x * outwardX + normal.z * outwardZ).toBeCloseTo(-1, 8);
      expect(Math.hypot(pose.position[0] - HUB_CENTRE.x, pose.position[2] - HUB_CENTRE.z)).toBeCloseTo(HUB_R - WALL_PLAQUE_INSET, 8);
    }
  });

  it("keeps sign faces in front of the curved wall without clipping", () => {
    const frontR = HUB_R - WALL_PLAQUE_INSET - WALL_PLAQUE_FACE_Z;
    // Wide 3-metre doorway sign: corners must remain in front of the wall.
    const cornerR = Math.hypot(frontR, 1.5);
    expect(cornerR).toBeLessThan(HUB_R);
    // Back is nearly at the wall; frame corners intersect it slightly.
    const backR = HUB_R - WALL_PLAQUE_INSET + WALL_PLAQUE_DEPTH / 2;
    expect(backR).toBeCloseTo(HUB_R, 8);
    expect(Math.hypot(backR, 1.61)).toBeGreaterThan(HUB_R);
  });
});
