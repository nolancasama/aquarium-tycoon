import { describe, expect, it } from "vitest";
import { WALKWAY_SAMPLES } from "../../game/data/sharkTunnel";
import { habitatStaticGeometry } from "./habitatGeometry";

/** The kerb's outer foot and the lower plinth are separate swept surfaces.
 * They must meet exactly, or a thin disconnected wall appears while walking. */
describe("Shark Tunnel lower wall seams", () => {
  it("joins the lower walls to both kerbs throughout the curved walkway", () => {
    const { rock, sand, struct } = habitatStaticGeometry();
    try {
      const xyz = struct.getAttribute("position");
      const samples = WALKWAY_SAMPLES;
      const count = samples.length;
      // Distinct sections of the path, including the main curve and return leg.
      const check = samples.map((s, i) => ({ s, i }))
        .filter(({ s, i }) => !s.inside && i > 2 && i < count - 3)
        .filter((_, i) => i % 19 === 0);
      expect(check.length).toBeGreaterThan(3);
      for (const { s, i } of check) {
        const a = samples[(i - 1 + count) % count], b = samples[(i + 1) % count];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        for (const side of [-1, 1]) {
          const l = (s.halfWidth - 0.05) * side;
          const px = s.x + nx * l, pz = s.z + nz * l;
          let hits = 0;
          for (let v = 0; v < xyz.count; v++) {
            if (Math.abs(xyz.getX(v) - px) < 0.001 &&
                Math.abs(xyz.getY(v) + 0.05) < 0.001 &&
                Math.abs(xyz.getZ(v) - pz) < 0.001) hits++;
          }
          // Both independently generated surfaces share this coordinate;
          // a kerb alone has fewer coincident vertices at its outer foot.
          expect(hits, `seam at sample ${i}, side ${side}`).toBeGreaterThanOrEqual(5);
        }
      }
    } finally {
      struct.dispose();
      rock.dispose();
      sand.dispose();
    }
  });
});
