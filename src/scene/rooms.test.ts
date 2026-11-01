import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { DOOR_W, DOOR_Z, ROOMS, doorX } from "../game/data/rooms";
import { PAD_TYPES, SLOT_POS, TANKS } from "../game/data/tanks";
import {
  GALLERY_PORTHOLES,
  HALL2_PORTHOLE_Z,
  galleryGeometry,
  hall2Geometry
} from "./models/room";
import { atriumFurnitureGeometry, atriumSkylightGeometry, atriumWallGeometry } from "./models/atrium";

/** Test individual triangles: a merged room's bounding box spans every doorway. */
function intersectsGeometry(geometry: THREE.BufferGeometry, box: THREE.Box3): boolean {
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex();
  const count = indices?.count ?? positions.count;
  const triangle = new THREE.Triangle();
  for (let i = 0; i < count; i += 3) {
    triangle.a.fromBufferAttribute(positions, indices ? indices.getX(i) : i);
    triangle.b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1);
    triangle.c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2);
    if (box.intersectsTriangle(triangle)) return true;
  }
  return false;
}

function bounds(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
}

describe("room scenery clearance", () => {
  let ocean: THREE.BufferGeometry;
  let gallery: THREE.BufferGeometry;
  let furniture: THREE.BufferGeometry;

  beforeAll(() => {
    ocean = hall2Geometry();
    gallery = galleryGeometry();
    furniture = galleryGeometry("extras");
  });
  afterAll(() => {
    ocean.dispose();
    gallery.dispose();
    furniture.dispose();
  });

  it.each([1, 2])("keeps Ocean Hall scenery off the walking line at doorway %i", (room) => {
    const x = doorX(room);
    // A thin box covers the continuous walking line, including the entire body height.
    expect(intersectsGeometry(ocean, bounds(x - 0.8, x + 0.8, 0.1, 1.8, DOOR_Z - 0.001, DOOR_Z + 0.001))).toBe(false);
  });

  it("keeps Gallery scenery off the walking line through its entrance", () => {
    const x = doorX(2);
    expect(intersectsGeometry(gallery, bounds(x - 0.8, x + 0.8, 0.1, 1.8, DOOR_Z - 0.001, DOOR_Z + 0.001))).toBe(false);
  });

  it("moves the Ocean Hall portholes clear of the Gallery doorway", () => {
    expect(HALL2_PORTHOLE_Z).toEqual([-2.3, -0.6]);
    const radius = 0.45 + 0.07;
    for (const z of HALL2_PORTHOLE_Z) {
      expect(Math.abs(z - DOOR_Z) - radius).toBeGreaterThan(DOOR_W / 2);
    }
  });

  it("keeps each Gallery porthole's complete rim clear of the doorway", () => {
    expect(GALLERY_PORTHOLES.length).toBeGreaterThanOrEqual(2);
    expect(GALLERY_PORTHOLES.length).toBeLessThanOrEqual(3);
    const doorway = bounds(doorX(2) - 0.15, doorX(2) + 0.4, 0, 2.3, DOOR_Z - DOOR_W / 2, DOOR_Z + DOOR_W / 2);
    const radius = 0.48 + 0.055;
    for (const p of GALLERY_PORTHOLES) {
      const halfX = Math.abs(Math.cos(p.rotationY)) * radius + 0.055;
      const halfZ = Math.abs(Math.sin(p.rotationY)) * radius + 0.055;
      expect(doorway.intersectsBox(bounds(p.x - halfX, p.x + halfX, p.y - radius, p.y + radius, p.z - halfZ, p.z + halfZ))).toBe(false);
    }
  });

  it("keeps Gallery furniture outside the visitor lane", () => {
    const { minX, maxX } = ROOMS[2].bounds;
    expect(intersectsGeometry(furniture, bounds(minX + 0.4, maxX - 0.4, 0.1, 1.8, 0, 2.5))).toBe(false);
  });

  it.each(["F", "G", "H"] as const)("keeps Gallery furniture outside every allowed tank footprint on pad %s", (slot) => {
    const p = SLOT_POS[slot];
    // Include the stand's overhang and the largest dimensions that this pad accepts.
    const halfW = Math.max(...PAD_TYPES[slot].map((type) => TANKS[type].w)) / 2 + 0.12;
    const halfD = Math.max(...PAD_TYPES[slot].map((type) => TANKS[type].d)) / 2 + 0.12;
    expect(intersectsGeometry(furniture, bounds(p.x - halfW, p.x + halfW, 0.03, 3, p.z - halfD, p.z + halfD))).toBe(false);
  });

  it("leaves triangle budget for the Gallery's decorative planes", () => {
    const triangles = (gallery.getIndex()?.count ?? gallery.getAttribute("position").count) / 3;
    expect(triangles).toBeLessThanOrEqual(25_000 - 500);
  });
});

describe("Atrium shell and public walkway", () => {
  let walls: THREE.BufferGeometry;
  let furniture: THREE.BufferGeometry;
  let gallery: THREE.BufferGeometry;
  beforeAll(() => {
    walls = atriumWallGeometry();
    furniture = atriumFurnitureGeometry();
    gallery = galleryGeometry("walls");
  });
  afterAll(() => { walls.dispose(); furniture.dispose(); gallery.dispose(); });

  it("opens the Gallery's east wall and keeps both doorframes off the walking line", () => {
    const passage = bounds(29.2, 30.8, 0.1, 1.8, DOOR_Z - 0.3, DOOR_Z + 0.3);
    expect(intersectsGeometry(gallery, passage)).toBe(false);
    expect(intersectsGeometry(walls, passage)).toBe(false);
    expect(intersectsGeometry(furniture, passage)).toBe(false);
  });

  it("closes both deeper returns and the taller shared-wall step", () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(walls, material);
    mesh.updateMatrixWorld();
    for (const [y, z] of [[1.4, -4.8], [1.4, 4.8], [4.4, -2], [4.4, DOOR_Z]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(31, y, z), new THREE.Vector3(-1, 0, 0), 0, 2);
      const hit = ray.intersectObject(mesh)[0];
      expect(hit, `missing wall return at y=${y}, z=${z}`).toBeDefined();
      expect(hit.point.x).toBeCloseTo(30.24, 4);
    }
    material.dispose();
  });

  it.each(["I", "J", "K"] as const)("keeps furniture outside the full allowed exhibit footprint on %s", (slot) => {
    const p = SLOT_POS[slot];
    const halfW = Math.max(...PAD_TYPES[slot].map((t) => TANKS[t].w)) / 2 + 0.12;
    const halfD = Math.max(...PAD_TYPES[slot].map((t) => TANKS[t].d + (TANKS[t].bulge ?? 0))) / 2 + 0.12;
    expect(intersectsGeometry(furniture, bounds(p.x - halfW, p.x + halfW, 0.03, 3.2, p.z - halfD, p.z + halfD))).toBe(false);
  });

  it("preserves continuous body-width viewing paths on all four sides of the reef", () => {
    for (const area of [
      bounds(34.35, 34.95, 0.1, 1.8, -3.1, 1.5),
      bounds(41.05, 41.65, 0.1, 1.8, -3.1, 1.5),
      bounds(34.35, 41.65, 0.1, 1.8, -3.35, -2.75),
      bounds(34.35, 41.65, 0.1, 1.8, 1.2, 1.8)
    ]) expect(intersectsGeometry(furniture, area)).toBe(false);
  });

  it("keeps the glazed ceiling above the fish and leaves a Chromebook geometry budget", () => {
    const roof = atriumSkylightGeometry();
    roof.computeBoundingBox();
    expect(roof.boundingBox!.min.y).toBeGreaterThan(5.4);
    const triangles = [walls, furniture, roof].reduce((sum, g) => sum + (g.getIndex()?.count ?? g.getAttribute("position").count) / 3, 0);
    expect(triangles).toBeLessThan(11_000);
    roof.dispose();
  });
});
