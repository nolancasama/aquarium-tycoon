import { describe, expect, it } from "vitest";
import { WRECK_SITE } from "../../game/data/sharkTunnel";
import { wreckGeometry } from "./wreckGeometry";

describe("Shark Tunnel central wreck", () => {
  it("creates a modest, colored, finite low-poly structure in the center of the bend", () => {
    const g = wreckGeometry();
    try {
      const p = g.getAttribute("position");
      expect(p.count).toBeGreaterThan(100);
      expect(p.count / 3).toBeLessThan(2000);
      for (const name of ["normal", "uv", "color"]) expect(g.getAttribute(name).count).toBe(p.count);
      for (let i = 0; i < p.count; i++) for (const c of [p.getX(i), p.getY(i), p.getZ(i)]) expect(Number.isFinite(c)).toBe(true);
      const b = g.boundingBox!;
      expect(b.min.x).toBeGreaterThan(WRECK_SITE.x - 2.8);
      expect(b.max.x).toBeLessThan(WRECK_SITE.x + 2.8);
      expect(b.min.z).toBeGreaterThan(WRECK_SITE.z - 2.0);
      expect(b.max.z).toBeLessThan(WRECK_SITE.z + 2.0);
      expect(b.max.y).toBeLessThan(3.5);
    } finally {
      g.dispose();
    }
  });
});
