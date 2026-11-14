import { describe, expect, it } from "vitest";
import { EXHIBITS } from "../data/coast";
import { blendCoastShot, coastExhibitShot, COAST_VIEW_SECONDS, UNDERWATER_EYE_Z } from "./view";

describe("coast exhibit cameras", () => {
  it.each([1366 / 768, 1024 / 768, 1024 / 600])("frames land closely and keeps gallery eye height at aspect %s", (aspect) => {
    const ex = EXHIBITS.penguins;
    const land = coastExhibitShot("penguins", aspect, false);
    const lower = coastExhibitShot("penguins", aspect, true);
    expect(land.target.z - ex.z).toBeLessThan(-4);
    expect(land.target.y).toBeLessThanOrEqual(4);
    expect(land.pos.z - ex.z).toBeLessThan(25);
    expect(lower.pos.y).toBeCloseTo(-3.05 + 1.6);
    // Close to the glass (local z 11): the window fills the frame, not the floor.
    expect(lower.pos.z - ex.z).toBeGreaterThanOrEqual(20);
    expect(lower.pos.z - ex.z).toBeLessThanOrEqual(24);
    expect(lower.target.z).toBeLessThan(ex.z + ex.pool.maxZ);
  });

  it("finishes in 0.8 seconds outside the window and above the gallery floor", () => {
    const ex = EXHIBITS.penguins;
    const land = coastExhibitShot("penguins", 1366 / 768, false), lower = coastExhibitShot("penguins", 1366 / 768, true);
    const out = structuredClone(land);
    expect(blendCoastShot(land, lower, 0, out)).toEqual(land);
    for (let elapsed = 0; elapsed <= 0.8; elapsed += 0.005) {
      blendCoastShot(land, lower, elapsed, out);
      const z = out.pos.z - ex.z;
      expect(z).toBeGreaterThan(11.8);
      expect(out.pos.y).toBeGreaterThan(-3.05 + 1.5);
    }
    expect(blendCoastShot(land, lower, COAST_VIEW_SECONDS, out)).toEqual(lower);
    expect(blendCoastShot(land, lower, 5, out)).toEqual(lower);
  });

  it("the closest (widest) underwater shot stays outside the glass and keeps a little floor", () => {
    const ex = EXHIBITS.penguins;
    const lower = coastExhibitShot("penguins", 1366 / 768, true);
    expect(lower.pos.z - ex.z).toBeCloseTo(UNDERWATER_EYE_Z, 1);
    // Looking very slightly up: less walkway floor than the former downward aim.
    expect(lower.target.y).toBeGreaterThan(lower.pos.y);
    expect(lower.target.y - lower.pos.y).toBeLessThan(1);
  });

  it("temporarily fits land and swimming animals for the unchanged all-penguin count", () => {
    const ex = EXHIBITS.penguins;
    const pts = [{ x: ex.x - 8, y: 2.35, z: ex.z - 8 }, { x: ex.x + 8, y: -2, z: ex.z + 10 }];
    const count = coastExhibitShot("penguins", 1024 / 768, true, "count", pts);
    expect(count.pos.y).toBeGreaterThan(20);
    expect(count.target.x).toBe(ex.x);
    expect(count.target.z).toBe(ex.z + 1);
  });
});
