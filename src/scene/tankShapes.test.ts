import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DECOR, decorFits } from "../game/data/decor";
import { SAND_H, STAND_H, TANKS, type TankDef } from "../game/data/tanks";
import { sandDune, sandSurfaceY } from "../game/logic/tankLayout";
import type { DecorKind } from "../game/types";
import { decorRadius } from "../game/world";
import { decorModel } from "./models/decor";
import { SPECIES } from "../game/data/fish";
import { tankFishBounds } from "../game/logic/swim";
import { EXHIBITS, rampFootprint, type CoastHabitat } from "../game/data/coast";
import { landLegClear, stationLandRoute } from "../game/coast/motion";
import { penguinRampGeometry } from "./coast/coastModels";
import { glassGeometry, surfaceGeometry, tankShellGeometry, waterGeometry } from "./models/tankShell";

const special = Object.values(TANKS).filter((tank) => tank.group === "special");
const newDecor: DecorKind[] = ["kelp", "arch", "cave", "driftwood", "staghorn", "brain", "fan", "table"];
const EPS = 0.00001;

describe("Penguin Coast shore geometry", () => {
  it("the snowy traffic lanes follow the rendered slope and the rock sides flare outward", () => {
    const ex = EXHIBITS.penguins, r = ex.ramps[0];
    const deck = penguinRampGeometry(ex, 0, true), rock = penguinRampGeometry(ex, 0);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(deck, material);
    mesh.updateMatrixWorld();
    for (const dx of [-1.05, 0, 1.05]) for (const t of [0.05, 0.3, 0.6, 0.95]) {
      const z = r.top.z + (r.bottom.z - r.top.z) * t;
      const ray = new THREE.Raycaster(new THREE.Vector3(r.top.x + dx, 5, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(hit, "snow deck supports both traffic lanes").toBeDefined();
      expect(hit.point.y).toBeCloseTo(ex.land.y + (ex.pool.surface - 0.06 - ex.land.y) * t, 5);
    }
    const sides = rock.getAttribute("normal");
    expect(Array.from({ length: sides.count }, (_, i) => Math.abs(sides.getX(i))).some((x) => x > 0.3 && x < 0.99), "sloping rock sides").toBe(true);
    rock.computeBoundingBox();
    expect(rock.boundingBox!.min.y, "shore buttress does not become a floor-deep rectangular column").toBeGreaterThan(ex.pool.floor + 2);
    const footprint = rampFootprint(ex, 0);
    expect(new Set(footprint.map((p) => p.x)).size, "irregular edges").toBeGreaterThan(4);
    expect(Math.min(...footprint.map((p) => p.x))).toBeCloseTo(rock.boundingBox!.min.x, 5);
    expect(Math.max(...footprint.map((p) => p.x))).toBeCloseTo(rock.boundingBox!.max.x, 5);
    deck.dispose(); rock.dispose(); material.dispose();
  });

  it("the deeper shore leaves a route from the back cliff to every occupied station", () => {
    const ex = EXHIBITS.penguins, items = ex.slots.map((slot) => ({ ...slot, r: 0.6 }));
    expect(ex.land.maxZ - ex.land.minZ).toBeGreaterThanOrEqual(8 - EPS);
    const doorApproach = { x: -1.6, z: ex.land.minZ + 0.7 };
    for (const station of ex.slots) {
      const route = stationLandRoute(ex, doorApproach, { x: station.x, z: station.z + 0.9 }, items);
      expect(route, "back-cliff access to the feeding-station standing space").not.toBeNull();
    }
    for (const ice of ex.swimObstacles!.filter((o) => o.kind === "ice")) {
      expect(ice.top).toBeLessThan(ex.pool.surface);
      expect(Math.min(ice.x - ex.pool.minX, ex.pool.maxX - ice.x, ice.z - ex.pool.minZ)).toBeLessThan(ice.r);
    }
    for (const rock of ex.swimObstacles!.filter((o) => o.kind === "rock")) expect(rock.top - ex.pool.floor).toBeLessThan(rock.r * 1.2);
  });
});

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
    case "reef":
      return Math.abs(z) <= tank.d / 2 + EPS && Math.abs(x) + Math.abs(z) <= tank.w / 2 + tank.d / 2 - 0.16 + EPS;
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
      if (tank.shape === "reef") {
        const p = glass.getAttribute("position");
        const corners = new Set(Array.from({ length: p.count }, (_, i) => `${p.getX(i).toFixed(5)},${p.getZ(i).toFixed(5)}`));
        expect(corners.size, "eight panes, including the clipped corners").toBe(8);
      } else if (tank.shape === "hex") {
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
      if (tank.type === "penguins") {
        // Coastal slots stand on the authored shore, whose dimensions need not
        // match the legacy generic tank shell or its decorative sand dune.
        const ex = EXHIBITS[tank.type as CoastHabitat];
        for (const slot of ex.slots) {
          expect(slot.on).toBe("land");
          expect(landLegClear(ex, slot, slot, [], 0.35)).toBe(true);
          expect(ex.land.y).toBeGreaterThan(ex.pool.surface);
        }
        return;
      }
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

    // The giant reef is one fixed centrepiece per aquarium with its whole reef baked in.
    const budget = tank.type === "reef" ? 12000 : 6000;
    it(`${tank.type}: merged shell, glass and water stay below ${budget} triangles`, () => {
      const geometries = [tankShellGeometry(tank.type), glassGeometry(tank.type), waterGeometry(tank.type)];
      // Include the two 32-by-4 torus display bands built by JellyDisplay.
      const lightBands = tank.lights ? 2 * 32 * 4 * 2 : 0;
      expect(geometries.reduce((total, geometry) => total + triangles(geometry), lightBands)).toBeLessThanOrEqual(budget);
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

  it("reef: its open arch is passable, and conservative swim bounds stay within all eight glass faces", () => {
    const tank = TANKS.reef;
    for (const species of Object.values(SPECIES).filter((animal) => animal.habitat.includes("reef"))) {
      const bounds = tankFishBounds(tank, SAND_H, species);
      for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
        expect(inside(tank, x, z), `${species.id} at a swim-bound corner`).toBe(true);
      }
      // No collision column occupies the centre of the tall open arch.
      expect(tank.rocks!.every((rock) => Math.hypot(rock.x, rock.z - 0.06) > rock.r + species.radius)).toBe(true);
    }
    const geometry = tankShellGeometry("reef");
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster(new THREE.Vector3(0, STAND_H + 0.6, 1), new THREE.Vector3(0, 0, -1), 0, 2);
    expect(ray.intersectObject(mesh), "open water through the arch, with no solid rock slab").toHaveLength(0);
    geometry.dispose(); material.dispose();
  });

  it("reef: two low shelf slots have rendered platforms and matching solid-rock clearance", () => {
    const tank = TANKS.reef;
    const shelves = tank.slots.filter((slot) => slot.y !== undefined);
    expect(shelves).toHaveLength(2);
    const geometry = tankShellGeometry("reef");
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    for (const shelf of shelves) {
      const column = tank.rocks!.find((rock) => rock.x === shelf.x && rock.z === shelf.z);
      expect(column?.top).toBe(shelf.y);
      expect(column!.r).toBeGreaterThanOrEqual(0.44);
      for (const dx of [-0.15, 0, 0.15]) for (const dz of [-0.15, 0, 0.15]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(shelf.x + dx, STAND_H + 0.4, shelf.z + dz), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObject(mesh)[0].point.y).toBeCloseTo(STAND_H + shelf.y!, 5);
      }
    }
    geometry.dispose(); material.dispose();
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
      for (const tank of Object.values(TANKS).filter((entry) => decorFits(kind, entry.type))) {
        const radius = decorRadius(kind, null, tank.type);
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
