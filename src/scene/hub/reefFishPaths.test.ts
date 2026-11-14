import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createReefFishPath, REEF_SWIM_HEIGHT, REEF_SWIM_RADIUS, sampleReefFishPath } from "./reefFishPaths";
import { createHubReef } from "./hubReef";

const rocks = [
  new THREE.Box3(new THREE.Vector3(-0.95, 0, -0.75), new THREE.Vector3(-0.2, 1.35, 0.15)),
  new THREE.Box3(new THREE.Vector3(0.3, 0, -0.65), new THREE.Vector3(0.95, 0.9, 0.3)),
  // A tall fan at a different depth exercises more than floor-only avoidance.
  new THREE.Box3(new THREE.Vector3(-0.1, 0.6, 0.45), new THREE.Vector3(0.45, 1.75, 0.7))
];

describe("reef fish roaming", () => {
  it("clears actual production reef geometry for every displayed fish and its real body size", () => {
    const reef = createHubReef();
    const production = [
      { count: 4, size: 0.43, band: [0.6, 5.3] as const },
      { count: 6, size: 0.28, band: [0.65, 5.7] as const },
      { count: 4, size: 0.36, band: [0.35, 2.6] as const },
      { count: 4, size: 0.38, band: [0.7, 4.8] as const },
      { count: 4, size: 0.29, band: [1.8, 6.0] as const }
    ];
    let index = 0, highest = 0, upperHalf = 0;
    for (const school of production) for (let fish = 0; fish < school.count; fish++, index++) {
      const size = school.size * (0.88 + ((index * 29) % 10) / 60);
      const path = createReefFishPath(index + 1, school.band, size, reef.obstacles);
      const expanded = reef.obstacles.map((box) => box.clone().expandByScalar(path.clearance));
      let collisions = 0, maxRadius = 0, minY = Infinity, maxY = -Infinity;
      for (let pointIndex = 0; pointIndex < 1500; pointIndex++) {
        const point = path.curve.getPoint(pointIndex / 1500);
        if (expanded.some((box) => box.containsPoint(point))) collisions++;
        maxRadius = Math.max(maxRadius, Math.hypot(point.x, point.z) + path.clearance);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
      expect(collisions, `fish ${index + 1}`).toBe(0);
      expect(maxRadius, `fish ${index + 1}`).toBeLessThanOrEqual(REEF_SWIM_RADIUS + 1e-8);
      expect(minY, `fish ${index + 1}`).toBeGreaterThanOrEqual(path.band[0] - 1e-8);
      expect(maxY, `fish ${index + 1}`).toBeLessThanOrEqual(path.band[1] + 1e-8);
      expect(maxY + path.clearance, `fish ${index + 1}`).toBeLessThanOrEqual(REEF_SWIM_HEIGHT + 1e-8);
      highest = Math.max(highest, maxY);
      if (maxY > REEF_SWIM_HEIGHT / 2) upperHalf++;
    }
    // The tall (6.4 m) tank is used: fish reach near the surface, and most
    // routes climb into the upper half rather than staying by the reef.
    expect(REEF_SWIM_HEIGHT).toBeGreaterThan(6);
    expect(highest).toBeGreaterThan(5.3);
    expect(upperHalf).toBeGreaterThanOrEqual(14);
    reef.geometry.dispose();
    reef.elements.forEach((element) => element.geometry.dispose());
  });

  it("keeps whole smooth paths clear of reef volumes and cylindrical glass, including low swimming bands", () => {
    for (const band of [[0.55, 1.45], [1.1, 2.35], [1.8, 2.7]] as const) {
      for (const seed of [11, 37, 83, 109]) {
        const path = createReefFishPath(seed, band, 0.4, rocks);
        const expanded = rocks.map((box) => box.clone().expandByScalar(path.clearance));
        let collisions = 0, maxRadius = 0, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < 1800; i++) {
          const point = path.curve.getPoint(i / 1800);
          maxRadius = Math.max(maxRadius, Math.hypot(point.x, point.z) + path.clearance);
          minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
          if (expanded.some((box) => box.containsPoint(point))) collisions++;
        }
        expect(maxRadius).toBeLessThanOrEqual(REEF_SWIM_RADIUS + 1e-8);
        expect(minY).toBeGreaterThanOrEqual(path.band[0] - 1e-8);
        expect(maxY).toBeLessThanOrEqual(Math.min(path.band[1], REEF_SWIM_HEIGHT - path.clearance) + 1e-8);
        expect(collisions).toBe(0);
      }
    }
  });

  it("is repeatable per seed and varies depth and speed while velocity follows travel", () => {
    const path = createReefFishPath(47, [0.7, 2.5], 0.35, rocks);
    const repeat = createReefFishPath(47, [0.7, 2.5], 0.35, rocks);
    const depths: number[] = [], speeds: number[] = [];
    for (let time = 0; time < 90; time += 0.37) {
      const sample = sampleReefFishPath(path, time, 0.22);
      const next = sampleReefFishPath(path, time + 0.0001, 0.22);
      const actualVelocity = next.position.clone().sub(sample.position).divideScalar(0.0001);
      expect(sample.position.distanceTo(sampleReefFishPath(repeat, time, 0.22).position)).toBeLessThan(1e-10);
      expect(actualVelocity.clone().normalize().dot(sample.velocity.clone().normalize())).toBeGreaterThan(0.998);
      expect(actualVelocity.length()).toBeCloseTo(sample.velocity.length(), 2);
      depths.push(sample.position.y);
      speeds.push(sample.velocity.length());
    }
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.35);
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(0.06);
    expect(path.waypoints.length).toBeGreaterThanOrEqual(6);
  });

  it("reports impossible layouts instead of silently swimming through them", () => {
    const blocked = new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 3, 2));
    expect(() => createReefFishPath(1, [0.5, 2.5], 0.4, [blocked])).toThrow(/no clear/);
  });
});
