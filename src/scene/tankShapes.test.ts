import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DECOR, decorFits } from "../game/data/decor";
import { SAND_H, STAND_H, TANKS, type TankDef } from "../game/data/tanks";
import { sandDune, sandSurfaceY } from "../game/logic/tankLayout";
import type { DecorKind } from "../game/types";
import { decorRadius } from "../game/world";
import { decorModel } from "./models/decor";
import { glassGeometry, surfaceGeometry, tankShellGeometry, waterGeometry } from "./models/tankShell";

const special = Object.values(TANKS).filter((tank) => tank.group === "special");
const newDecor: DecorKind[] = ["kelp", "arch", "cave", "driftwood"];
const EPS = 0.00001;

// Deliberately independent of the production footprint helper: a wrong shared
// footprint must not make the same wrong glass pass its containment test.
function inside(tank: TankDef, x: number, z: number): boolean {
  if (Math.abs(x) > tank.w / 2 + EPS || z < -tank.d / 2 - EPS) return false;
  switch (tank.shape) {
    case "round":
      return (x / (tank.w / 2)) ** 2 + (z / (tank.d / 2)) ** 2 <= 1 + EPS;
    case "hex":
      return Math.abs(z) <= tank.d / 2 + EPS && Math.abs(x) <= tank.w / 2 - Math.abs(z) * tank.w / (2 * tank.d) + EPS;
    case "bow":
      return z <= tank.d / 2 + (tank.bulge ?? 0) * (1 - (2 * x / tank.w) ** 2) + EPS;
    default:
      return z <= tank.d / 2 + EPS;
  }
}

function triangles(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
}

describe("special tank footprints", () => {
  for (const tank of special) {
    it(`${tank.type}: glass, water and surface follow the declared footprint`, () => {
      const glass = glassGeometry(tank.type);
      const water = waterGeometry(tank.type);
      const surface = surfaceGeometry(tank.type);
      for (const geometry of [glass, water, surface]) {
        const p = geometry.getAttribute("position");
        expect(p.count).toBeGreaterThan(0);
        for (let i = 0; i < p.count; i++) {
          expect(inside(tank, p.getX(i), p.getZ(i)), `vertex ${i} of ${tank.type}`).toBe(true);
        }
      }
      // Murk and algae use the same walls inset toward the interior.
      for (const inset of [0.006, 0.012]) {
        const overlay = glassGeometry(tank.type, inset);
        const p = overlay.getAttribute("position");
        for (let i = 0; i < p.count; i++) expect(inside(tank, p.getX(i), p.getZ(i))).toBe(true);
        overlay.dispose();
      }
      for (const geometry of [glass, water]) {
        geometry.computeBoundingBox();
        expect(geometry.boundingBox!.min.y).toBeCloseTo(-tank.h / 2, 5);
        expect(geometry.boundingBox!.max.y).toBeCloseTo(tank.h / 2, 5);
        expect(geometry.boundingBox!.min.x).toBeCloseTo(-tank.w / 2, 5);
        expect(geometry.boundingBox!.max.x).toBeCloseTo(tank.w / 2, 5);
        expect(geometry.boundingBox!.min.z).toBeCloseTo(-tank.d / 2, 5);
        expect(geometry.boundingBox!.max.z).toBeCloseTo(tank.d / 2 + (tank.bulge ?? 0), 5);
      }
      const normal = glass.getAttribute("normal");
      for (let i = 0; i < normal.count; i++) expect(Math.abs(normal.getY(i)), "open-ended glass walls").toBeLessThan(EPS);
      if (tank.shape === "hex") {
        const p = glass.getAttribute("position");
        const corners = new Set(Array.from({ length: p.count }, (_, i) => `${p.getX(i).toFixed(5)},${p.getZ(i).toFixed(5)}`));
        expect(corners.size, "six panes meeting at six footprint corners").toBe(6);
      } else if (tank.shape === "round") {
        const p = glass.getAttribute("position");
        const corners = new Set(Array.from({ length: p.count }, (_, i) => `${p.getX(i).toFixed(5)},${p.getZ(i).toFixed(5)}`));
        expect(corners.size).toBeGreaterThanOrEqual(28);
        expect(corners.size).toBeLessThanOrEqual(32);
      }
      glass.dispose();
      water.dispose();
      surface.dispose();
    });

    it(`${tank.type}: the sand supports slots and built-in rocks, and its dune stays inside`, () => {
      const geometry = tankShellGeometry(tank.type);
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld();
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      for (const point of [...tank.slots, ...(tank.rocks ?? [])]) {
        const expected = sandSurfaceY(tank, point.x, point.z);
        ray.set(new THREE.Vector3(point.x, STAND_H + tank.h + 0.2, point.z), down);
        const hits = ray.intersectObject(mesh);
        expect(hits.some((hit) => Math.abs(hit.point.y - expected) < 0.008), `sand at ${point.x}, ${point.z}`).toBe(true);
        expect(expected).toBeGreaterThanOrEqual(STAND_H + SAND_H);
      }
      const dune = sandDune(tank);
      for (let i = 0; i < 64; i++) {
        const angle = i * Math.PI / 32;
        expect(inside(tank, dune.x + Math.cos(angle) * dune.radius, dune.z + Math.sin(angle) * dune.radius * 0.55)).toBe(true);
      }
      geometry.dispose();
      material.dispose();
    });

    it(`${tank.type}: merged shell, glass and water stay below 6,000 triangles`, () => {
      const geometries = [tankShellGeometry(tank.type), glassGeometry(tank.type), waterGeometry(tank.type)];
      // Include the two 32-by-4 torus display bands built by JellyDisplay.
      const lightBands = tank.lights ? 2 * 32 * 4 * 2 : 0;
      expect(geometries.reduce((total, geometry) => total + triangles(geometry), lightBands)).toBeLessThanOrEqual(6000);
      geometries.forEach((geometry) => geometry.dispose());
    });
  }

  it("cave: each den is a dark recess behind an aperture on the declared rock face", () => {
    const tank = TANKS.cave;
    const geometry = tankShellGeometry(tank.type);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    const back = new THREE.Vector3(0, 0, -1);
    const colors = geometry.getAttribute("color");
    const color = new THREE.Color();
    for (const den of tank.dens!) {
      expect(den.z).toBeCloseTo(-tank.d / 2 + tank.backRock!, 6);
      ray.set(new THREE.Vector3(den.x, STAND_H + den.y, tank.d / 2 + 0.1), back);
      const mouth = ray.intersectObject(mesh)[0];
      expect(mouth, `visible mouth at ${den.x}, ${den.y}`).toBeDefined();
      expect(mouth.point.z).toBeCloseTo(den.z - 0.035, 5);
      expect(mouth.face!.normal.z).toBeGreaterThan(0.99);
      color.fromBufferAttribute(colors, mouth.face!.a);
      expect(Math.max(color.r, color.g, color.b)).toBeLessThan(0.08);
      // Probe the left jamb, away from the built-in mound at the right end.
      ray.set(new THREE.Vector3(den.x - 0.14, STAND_H + den.y, tank.d / 2 + 0.1), back);
      const face = ray.intersectObject(mesh)[0];
      expect(face, `rock beside mouth at ${den.x}, ${den.y}`).toBeDefined();
      expect(face.point.z).toBeCloseTo(den.z, 5);
    }
    geometry.dispose();
    material.dispose();
  });
});

describe("new decoration clearance", () => {
  for (const kind of newDecor) {
    it(`${kind}: rests on the sand, has the declared height, and fits all eligible tanks`, () => {
      const model = decorModel(kind, null);
      const p = model.geo.getAttribute("position");
      model.geo.computeBoundingBox();
      expect(model.geo.boundingBox!.min.y).toBeCloseTo(0, 5);
      expect(model.geo.boundingBox!.max.y).toBeCloseTo(DECOR[kind].versions[0].height, 5);
      const radius = decorRadius(kind, null);
      for (const tank of Object.values(TANKS).filter((entry) => decorFits(kind, entry.type))) {
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i) * tank.h;
          const z = p.getZ(i) * tank.h;
          const swayX = kind === "kelp" ? 0.014 * Math.max(0, p.getY(i)) ** 2 * tank.h : 0;
          const swayZ = kind === "kelp" ? 0.009 * Math.max(0, p.getY(i)) ** 2 * tank.h : 0;
          // The normal 1 m model and its tallest eligible tank both remain
          // within the footprint used by placement and fish avoidance.
          expect(Math.hypot(x, z) + Math.hypot(swayX, swayZ), `${tank.type} vertex ${i}`).toBeLessThanOrEqual(radius * 1.1 + EPS);
          for (const slot of tank.slots) {
            expect(inside(tank, slot.x + x, slot.z + z), `${tank.type} slot ${slot.x}, ${slot.z}, vertex ${i}`).toBe(true);
            if (kind === "kelp") {
              for (const signX of [-1, 1]) for (const signZ of [-1, 1]) {
                expect(inside(tank, slot.x + x + signX * swayX, slot.z + z + signZ * swayZ), "sway stays inside glass").toBe(true);
              }
            }
          }
        }
      }
    });
  }
});
