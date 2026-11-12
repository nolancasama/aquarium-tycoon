import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createHubReef, REEF_INTERIOR_RADIUS } from "./hubReef";

describe("Grand Hub miniature reef", () => {
  it("keeps substrate, stacked rock and attached colonies grounded inside the cylindrical glass", () => {
    const reef = createHubReef();
    for (const element of reef.elements) {
      if (["gravel", "shell", "vegetation"].includes(element.kind)) {
        expect(Math.abs(element.bounds.min.y), element.kind).toBeLessThan(1e-6);
      } else if (element.kind === "rock" && element.bounds.min.y > 1e-6) {
        expect(reef.elements.some(other => other.kind === "rock" && other !== element
          && other.bounds.min.y < element.bounds.min.y && other.bounds.intersectsBox(element.bounds)), "supported slab").toBe(true);
      } else if (element.kind !== "rock") {
        const attachment = element.attachment!;
        expect(attachment, element.kind).toBeDefined();
        const rock = reef.elements[attachment.rock];
        expect(rock.kind).toBe("rock");
        expect(element.bounds.min.y).toBeCloseTo(attachment.point.y - 0.035, 5);
        expect(element.bounds.intersectsBox(rock.bounds), element.kind).toBe(true);
        const positions = rock.geometry.getAttribute("position");
        const triangle = new THREE.Triangle(), closest = new THREE.Vector3();
        let distance = Infinity;
        for (let i = 0; i < positions.count; i += 3) {
          triangle.a.fromBufferAttribute(positions, i);
          triangle.b.fromBufferAttribute(positions, i + 1);
          triangle.c.fromBufferAttribute(positions, i + 2);
          triangle.closestPointToPoint(attachment.point, closest);
          distance = Math.min(distance, closest.distanceTo(attachment.point));
        }
        expect(distance, `${element.kind} seated on real rock surface`).toBeLessThan(1e-6);
      }
      const p = element.geometry.getAttribute("position");
      let minY = Infinity, maxY = -Infinity, maxRadius = 0;
      for (let i = 0; i < p.count; i++) {
        minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i));
        maxRadius = Math.max(maxRadius, Math.hypot(p.getX(i), p.getZ(i)));
      }
      expect(minY, element.kind).toBeGreaterThanOrEqual(-1e-6);
      expect(maxY, element.kind).toBeLessThan(3);
      expect(maxRadius, element.kind).toBeLessThan(REEF_INTERIOR_RADIUS);
    }
    expect(new Set(reef.elements.map(e => e.kind))).toEqual(new Set([
      "rock", "branching", "plate", "fan", "rounded", "anemone", "soft", "gravel", "shell", "vegetation"
    ]));
    const rocks = reef.elements.filter(e => e.kind === "rock");
    // The lintel has open water underneath, rather than one solid boulder's box.
    const cave = new THREE.Vector3(0, 0.24, -0.37);
    expect(rocks.some(e => e.bounds.containsPoint(cave))).toBe(false);
    expect(rocks.some(e => e.bounds.min.x < cave.x && e.bounds.max.x > cave.x
      && e.bounds.min.z < cave.z && e.bounds.max.z > cave.z && e.bounds.min.y > cave.y)).toBe(true);
    reef.elements.forEach(e => e.geometry.dispose()); reef.geometry.dispose();
  });

  it("merges static decor into one coloured geometry and uses its true bounds for avoidance", () => {
    const reef = createHubReef();
    expect(reef.geometry.groups).toHaveLength(0);
    expect(reef.geometry.getAttribute("position").count).toBe(reef.elements.reduce((n, e) => n + e.geometry.getAttribute("position").count, 0));
    expect(reef.obstacles).toHaveLength(reef.elements.filter(e => e.obstacle).length);
    reef.elements.filter(e => e.obstacle).forEach((element, i) => expect(reef.obstacles[i].equals(element.bounds)).toBe(true));
    const colors = reef.geometry.getAttribute("color");
    expect(new Set(Array.from({ length: colors.count }, (_, i) => colors.getX(i))).size).toBeGreaterThan(100);
    reef.elements.forEach(e => e.geometry.dispose()); reef.geometry.dispose();
  });
});
