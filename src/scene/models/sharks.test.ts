import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { TunnelSpecies } from "../../game/tunnel/contract";
import { createSharkGeometry, MODEL_LENGTHS, SHARK_PART, sharkBodyRadius } from "./sharks";

const species: TunnelSpecies[] = ["blacktip", "zebrashark", "eagleray"];

describe("tunnel animal geometry", () => {
  for (const kind of species) for (const detail of ["close", "far"] as const) {
    it(`${kind} ${detail}: one merged mesh, complete shader attributes and a bounded triangle budget`, () => {
      const g = createSharkGeometry(kind, detail), p = g.getAttribute("position"), normals = g.getAttribute("normal");
      expect(g.groups).toHaveLength(0);
      expect(g.index).toBeNull();
      const triangles = p.count / 3;
      expect(triangles).toBeLessThan(detail === "close" ? 3001 : 600);
      if (detail === "close") expect(triangles).toBeGreaterThanOrEqual(1500);
      for (const name of ["normal", "color", "bodyS", "partId", "side", "uv"]) expect(g.getAttribute(name).count).toBe(p.count);
      for (let i = 0; i < p.count; i++) {
        expect(g.getAttribute("bodyS").getX(i)).toBeCloseTo(THREE.MathUtils.clamp(-p.getX(i) / MODEL_LENGTHS[kind], 0, 1), 5);
        expect(g.getAttribute("side").getX(i)).toBe(Math.sign(p.getZ(i)));
        expect(Number.isFinite(normals.getX(i) + normals.getY(i) + normals.getZ(i))).toBe(true);
      }
      const bounds = g.boundingBox!;
      expect(Math.abs(bounds.max.x)).toBeLessThan(0.03);
      expect(bounds.min.x).toBeCloseTo(-MODEL_LENGTHS[kind], 1);
      if (kind === "eagleray") expect(Math.abs(bounds.max.z - bounds.min.z - 1.8)).toBeLessThan(detail === "close" ? 0.05 : 0.15);
      g.dispose();
    });
  }

  for (const kind of ["blacktip", "zebrashark"] as const) for (const detail of ["close", "far"] as const) {
    it(`${kind} ${detail}: all fin roots are buried within the body cross-section`, () => {
      const g = createSharkGeometry(kind, detail), roots = g.userData.finRoots as [number, number, number][][];
      expect(roots.length).toBeGreaterThanOrEqual(7);
      for (const root of roots) for (const [x, y, z] of root) {
        const [ry, rz] = sharkBodyRadius(kind, x);
        // Roots are well inside the skin, rather than coincident faces that can
        // reveal a crack when normals, banking or tail motion change.
        expect((y / ry) ** 2 + (z / rz) ** 2, `${kind} root ${x},${y},${z}`).toBeLessThan(.8);
      }
      g.dispose();
    });

    it(`${kind} ${detail}: fins have closed edges and body normals face outwards`, () => {
      const g = createSharkGeometry(kind, detail), p = g.getAttribute("position"), id = g.getAttribute("partId"), normal = g.getAttribute("normal");
      const edges = new Map<string, number>();
      const key = (i: number) => `${Math.round(p.getX(i) * 1e6)},${Math.round(p.getY(i) * 1e6)},${Math.round(p.getZ(i) * 1e6)}`;
      for (let i = 0; i < p.count; i += 3) {
        if (id.getX(i) !== SHARK_PART.fin && id.getX(i) !== SHARK_PART.tail) continue;
        for (let j = 0; j < 3; j++) {
          const a = key(i + j), b = key(i + (j + 1) % 3), edge = a < b ? `${a}/${b}` : `${b}/${a}`;
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
      }
      expect(edges.size).toBeGreaterThan(50);
      for (const count of edges.values()) expect(count).toBe(2);
      // Back of the body (zebra ridges included): the great majority of normals face up.
      let top = 0, up = 0;
      for (let i = 0; i < p.count; i++) if (id.getX(i) === SHARK_PART.body && p.getY(i) > .08 && Math.abs(p.getZ(i)) < .02) {
        top++; if (normal.getY(i) > 0) up++;
      }
      expect(top).toBeGreaterThan(0);
      expect(up / top).toBeGreaterThan(0.65);
      g.dispose();
    });
  }

  it("retains distinctive silhouettes and contrasting markings", () => {
    for (const kind of species) {
      const g = createSharkGeometry(kind, "close"), p = g.getAttribute("position"), colour = g.getAttribute("color");
      let dark = 0, pale = 0;
      for (let i = 0; i < p.count; i++) {
        const brightness = Math.max(colour.getX(i), colour.getY(i), colour.getZ(i));
        if (brightness < .2) dark++;
        if (brightness > .75) pale++;
      }
      expect(dark).toBeGreaterThan(20); expect(pale).toBeGreaterThan(20);
      if (kind === "blacktip") expect(g.boundingBox!.max.y).toBeGreaterThan(.45);
      if (kind === "zebrashark") expect(g.boundingBox!.max.y).toBeLessThan(.42);
      g.dispose();
    }
  });
});
