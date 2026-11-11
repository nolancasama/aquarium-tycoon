import { describe, expect, it } from "vitest";
import { SMALL_FISH_KINDS, smallFishGeometry } from "./smallFish";

/** The decorative small-fish shapes: sound, cheap, nose forward, eyes on the head. */
describe("small fish shapes", () => {
  for (const kind of SMALL_FISH_KINDS) {
    it(`${kind}: finite, low-poly, nose at +z, tail at -z, eyes on the head`, () => {
      const g = smallFishGeometry(kind);
      const pos = g.getAttribute("position"), fish = g.getAttribute("aFish");
      const tris = (g.index ? g.index.count : pos.count) / 3;
      expect(tris).toBeGreaterThan(80);
      expect(tris).toBeLessThan(600);
      let minZ = Infinity, maxZ = -Infinity;
      const eyeZ: number[] = [];
      let tailTipZ = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        const part = fish.getZ(i);
        if (part === 2) eyeZ.push(z);
        if (part === 4) tailTipZ = Math.min(tailTipZ, z);
      }
      expect(maxZ).toBeGreaterThan(0.48);
      expect(maxZ).toBeLessThan(0.53);
      expect(minZ).toBeGreaterThan(-0.52);
      expect(tailTipZ).toBeLessThan(-0.4);
      expect(eyeZ.length).toBeGreaterThan(0);
      // The eyes sit in the front fifth of the fish.
      for (const z of eyeZ) expect(z).toBeGreaterThan(0.3);
      // No degenerate triangles in the merged shape.
      const idx = g.index!;
      let degenerate = 0;
      for (let t = 0; t < idx.count; t += 3) {
        const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
        if (a === b || b === c || a === c) degenerate++;
      }
      expect(degenerate).toBe(0);
    });
  }
});
