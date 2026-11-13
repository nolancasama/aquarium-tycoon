import { describe, expect, it } from "vitest";
import { corridorBoundary, corridorFaceGeometry, corridorStructure, HUB_STRUCTURE_BASE_Y } from "./corridorGeometry";
import { DOOR_OPENING, HUB_R } from "../../game/data/hub";

const boxes = corridorStructure({ wall: "#ffffff", floor: "#dddddd", trim: "#333333", glow: "#eeeeee" });
const faces = corridorBoundary(boxes);
const overlap = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

describe("hub corridor solid boundary", () => {
  it("buries both curved wall cut endpoints at least a centimetre inside the jambs", () => {
    // These are the actual inner-radius endpoints of HubArchitecture's
    // asin doorway cut, expressed in the corridor's side/depth coordinates.
    const half = Math.asin(DOOR_OPENING.w / 2 / HUB_R);
    for (const sign of [-1, 1]) {
      const side = sign * HUB_R * Math.sin(half);
      const depth = HUB_R * Math.cos(half) - HUB_R;
      const jamb = boxes.find(box => box.shell && box.min[1] < 0 && box.max[1] > 3
        && side > box.min[0] && side < box.max[0])!;
      expect(jamb).toBeDefined();
      expect(side - jamb.min[0]).toBeGreaterThanOrEqual(0.01);
      expect(jamb.max[0] - side).toBeGreaterThanOrEqual(0.01);
      expect(depth - jamb.min[2]).toBeGreaterThanOrEqual(0.01);
      expect(jamb.max[2] - depth).toBeGreaterThanOrEqual(0.01);
    }
  });

  it("has no overlapping coplanar surfaces across slabs, walls, frames or thresholds", () => {
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
      const a = faces[i], b = faces[j];
      if (a.axis !== b.axis || Math.abs(a.plane - b.plane) > 1e-7) continue;
      expect(overlap(a.u, b.u) > 1e-7 && overlap(a.v, b.v) > 1e-7).toBe(false);
    }
  });

  it("discards internal solid faces rather than merely moving duplicate faces", () => {
    for (const face of faces) {
      const p = [0, 0, 0];
      p[face.axis] = face.plane + face.sign * 1e-6;
      p[(face.axis + 1) % 3] = (face.u[0] + face.u[1]) / 2;
      p[(face.axis + 2) % 3] = (face.v[0] + face.v[1]) / 2;
      expect(boxes.some(box => p.every((value, axis) => value > box.min[axis] + 1e-8 && value < box.max[axis] - 1e-8))).toBe(false);
    }
  });

  it("keeps actual floor and rotunda-lintel separation", () => {
    expect(HUB_STRUCTURE_BASE_Y).toBeLessThanOrEqual(-0.01);
    const lintel = boxes.find(box => box.shell && box.min[1] > 3.3 && box.min[0] < -1.6)!;
    expect(DOOR_OPENING.h - lintel.min[1]).toBeCloseTo(0.02);
    expect(boxes.some(box => Math.abs(box.max[1]) < 0.01 || Math.abs(box.min[1]) < 0.01)).toBe(false);
  });

  it("emits correctly oriented triangles for both sides of every axis", () => {
    for (const face of faces) {
      const g = corridorFaceGeometry(face), n = g.getAttribute("normal");
      expect(n.getComponent(0, face.axis)).toBeCloseTo(face.sign * (face.axis === 2 ? -1 : 1));
      expect(g.getAttribute("position").count).toBe(face.outline.length === 4 ? 6 : face.outline.length * 3);
      g.dispose();
    }
  });

  it("splits long jamb edges at every neighboring corridor vertex to prevent T-junction cracks", () => {
    expect(faces.some(face => face.outline.length > 4)).toBe(true);
    const vertices = faces.flatMap(face => face.outline);
    for (const face of faces) {
      const geometry = corridorFaceGeometry(face), position = geometry.getAttribute("position");
      for (let edge = 0; edge < face.outline.length; edge++) {
        const a = face.outline[edge], b = face.outline[(edge + 1) % face.outline.length];
        const along = a.findIndex((value, axis) => Math.abs(value - b[axis]) > 1e-8);
        expect(vertices.some(p => p.every((value, axis) => axis === along || Math.abs(value - a[axis]) < 1e-8)
          && p[along] > Math.min(a[along], b[along]) + 1e-8 && p[along] < Math.max(a[along], b[along]) - 1e-8)).toBe(false);
        const matches = (index: number, p: number[]) => Math.abs(position.getX(index) - p[0]) < 1e-6
          && Math.abs(position.getY(index) - p[1]) < 1e-6 && Math.abs(position.getZ(index) + p[2]) < 1e-6;
        let emitted = false;
        for (let i = 0; i < position.count; i += 3) for (let j = 0; j < 3; j++) {
          const k = i + j, next = i + (j + 1) % 3;
          if ((matches(k, a) && matches(next, b)) || (matches(k, b) && matches(next, a))) emitted = true;
        }
        expect(emitted).toBe(true);
      }
      geometry.dispose();
    }
  });
});
