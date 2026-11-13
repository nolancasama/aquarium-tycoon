import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { decorModel } from "../models/decor";

describe("treasure chest lid", () => {
  const model = decorModel("chest", null);
  const geo = model.lid!.geo;

  it("has closed, consistently wound faces including the underside", () => {
    const p = geo.getAttribute("position");
    const edges = new Map<string, number[]>();
    let signedVolume = 0;
    const vertex = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e7)).join(",");
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i);
      const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      signedVolume += a.dot(b.cross(c)) / 6;
      for (const [a, b] of [[i, i + 1], [i + 1, i + 2], [i + 2, i]]) {
        const from = vertex(a), to = vertex(b);
        const key = [from, to].sort().join("/");
        edges.set(key, [...(edges.get(key) ?? []), from < to ? 1 : -1]);
      }
    }
    for (const uses of edges.values()) expect(uses.sort()).toEqual([-1, 1]);
    // A closed, inward-wound shell also passes the edge test, but is invisible
    // from outside with FrontSide. The half-round wooden volume is positive.
    expect(signedVolume).toBeGreaterThan(0.004);
  });

  it("occludes from the roof, underside and both ends through the opening arc", () => {
    const mesh = new THREE.Mesh(geo, model.mat);
    for (const angle of [0, -0.45, -0.9]) {
      mesh.rotation.x = angle;
      mesh.updateMatrixWorld(true);
      for (const [origin, direction] of [
        [[0, 0.4, 0.1], [0, -1, 0]],
        [[0, -0.4, 0.1], [0, 1, 0]],
        [[-0.4, 0.04, 0.1], [1, 0, 0]],
        [[0.4, 0.04, 0.1], [-1, 0, 0]],
      ]) {
        const start = mesh.localToWorld(new THREE.Vector3(...origin));
        const ray = new THREE.Vector3(...direction).transformDirection(mesh.matrixWorld);
        expect(new THREE.Raycaster(start, ray).intersectObject(mesh).length).toBeGreaterThan(0);
      }
      // Check both wood and gold strips across the whole curved roof and cut
      // face, so a reversed or missing band cannot hide behind the centre strip.
      for (const x of [-0.13, -0.096, 0, 0.096, 0.13]) {
        for (const z of [0.04, 0.1, 0.16]) {
          for (const [y, dy] of [[0.3, -1], [-0.1, 1]]) {
            const start = mesh.localToWorld(new THREE.Vector3(x, y, z));
            const ray = new THREE.Vector3(0, dy, 0).transformDirection(mesh.matrixWorld);
            expect(new THREE.Raycaster(start, ray).intersectObject(mesh).length).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(model.mat.transparent).toBe(false);
    expect(model.mat.opacity).toBe(1);
    expect(model.mat.depthWrite).toBe(true);
    expect(model.mat.side).toBe(THREE.FrontSide);
  });
});
