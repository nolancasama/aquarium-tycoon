import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EXHIBITS } from "../../game/data/coast";
import { blendCoastShot, coastExhibitShot, COAST_VIEW_SECONDS } from "../../game/coast/view";
import { galleryStairDetails, galleryStairGeometry, galleryStairSections, lowerGalleryGeometry, PENGUIN_GALLERY } from "./coastGallery";

describe("permanent connected penguin gallery", () => {
  it("renders outward-facing treads, risers and sides with the shared front-face material", () => {
    const { upper, lower, stair } = PENGUIN_GALLERY;
    const geometry = galleryStairGeometry();
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const x = (stair.minX + stair.maxX) / 2;
    try {
      const steps = galleryStairSections();
      for (const [i, step] of steps.entries()) {
        const tread = new THREE.Raycaster(new THREE.Vector3(x, upper.top + 1, (step.minZ + step.maxZ) / 2), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
        expect(tread?.point.y).toBeCloseTo(step.top, 5);
        expect(tread?.face?.normal.y).toBeGreaterThan(0.99);
        const previousTop = i ? steps[i - 1].top : upper.top;
        const riser = new THREE.Raycaster(new THREE.Vector3(x, (previousTop + step.top) / 2, step.minZ + 0.05), new THREE.Vector3(0, 0, -1)).intersectObject(mesh)[0];
        expect(riser?.point.z).toBeCloseTo(step.minZ, 5);
        expect(riser?.face?.normal.z).toBeGreaterThan(0.99);
      }
      const side = new THREE.Raycaster(new THREE.Vector3(stair.maxX + 1, lower.top + 0.1, stair.startZ + 0.1), new THREE.Vector3(-1, 0, 0)).intersectObject(mesh)[0];
      expect(side?.point.x).toBeCloseTo(stair.maxX, 5);
      expect(side?.face?.normal.x).toBeGreaterThan(0.99);
    } finally {
      geometry.dispose(); material.dispose();
    }
  });

  it.each([1366 / 768, 1024 / 768, 1024 / 600])("keeps both camera transition directions clear of the terrace and lower floor at aspect %s", (aspect) => {
    const { upper, lower } = PENGUIN_GALLERY;
    const ex = EXHIBITS.penguins;
    const slab = new THREE.Box3(new THREE.Vector3(upper.minX, upper.top - upper.thickness, upper.minZ), new THREE.Vector3(upper.maxX, upper.top, upper.maxZ));
    const land = coastExhibitShot("penguins", aspect, false), water = coastExhibitShot("penguins", aspect, true);
    const out = structuredClone(land);
    for (const [from, to] of [[land, water], [water, land]]) {
      for (let i = 0; i <= 100; i++) {
        blendCoastShot(from, to, COAST_VIEW_SECONDS * i / 100, out);
        const eye = new THREE.Vector3(out.pos.x - ex.x, out.pos.y, out.pos.z - ex.z);
        expect(slab.containsPoint(eye)).toBe(false);
        expect(eye.y).toBeGreaterThan(lower.top + 1.5);
      }
    }
  });

  it("joins the upper floor to the lower landing with comfortable consistent steps", () => {
    const { upper, lower, stair } = PENGUIN_GALLERY;
    const steps = galleryStairSections(), rise = (upper.top - lower.top) / stair.risers;
    expect(stair.startZ).toBe(upper.maxZ);
    expect(steps[0].minZ).toBe(upper.maxZ);
    expect(upper.top - steps[0].top).toBeCloseTo(rise);
    expect(steps[steps.length - 1].top - lower.top).toBeCloseTo(rise);
    expect(rise).toBeGreaterThan(0.15);
    expect(rise).toBeLessThan(0.19);
    expect(stair.tread).toBeGreaterThanOrEqual(0.27);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].minZ).toBeCloseTo(steps[i - 1].maxZ);
      expect(steps[i - 1].top - steps[i].top).toBeCloseTo(rise);
    }
    expect(steps[steps.length - 1].maxZ).toBeLessThan(lower.maxZ - 1.5);
    expect(stair.maxX - stair.minX).toBeGreaterThanOrEqual(2);
    expect(stair.minX).toBeGreaterThan(lower.minX);
    expect(stair.maxX).toBeLessThan(lower.maxX);
  });

  it("restores a close single-swimmer question around the terrace rather than through its floor", () => {
    const { upper } = PENGUIN_GALLERY, ex = EXHIBITS.penguins;
    const slab = new THREE.Box3(new THREE.Vector3(upper.minX, upper.top - upper.thickness, upper.minZ), new THREE.Vector3(upper.maxX, upper.top, upper.maxZ));
    const lower = coastExhibitShot("penguins", 1366 / 768, true);
    for (const x of [-8, 0, 8]) for (const y of [-2.6, 1.95]) for (const z of [0, 10]) {
      const question = coastExhibitShot("penguins", 1366 / 768, true, "water", [{ x: ex.x + x, y, z: ex.z + z }]);
      const out = structuredClone(lower);
      for (const [from, to] of [[lower, question], [question, lower]]) for (let i = 0; i <= 100; i++) {
        blendCoastShot(from, to, COAST_VIEW_SECONDS * i / 100, out);
        expect(slab.containsPoint(new THREE.Vector3(out.pos.x - ex.x, out.pos.y, out.pos.z - ex.z))).toBe(false);
      }
    }
  });

  it("keeps all added solids outside the pool and clear of the window frame", () => {
    const pool = EXHIBITS.penguins.pool;
    const geometries = [galleryStairGeometry(), galleryStairDetails(), lowerGalleryGeometry()];
    try {
      for (const geometry of geometries) {
        geometry.computeBoundingBox();
        expect(geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(pool.maxZ);
        expect(geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(PENGUIN_GALLERY.lower.top - 0.25);
        const positions = geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true);
      }
      expect(PENGUIN_GALLERY.upper.minZ).toBeGreaterThan(PENGUIN_GALLERY.window.maxZ);
      expect(PENGUIN_GALLERY.lower.minZ).toBeGreaterThan(PENGUIN_GALLERY.window.maxZ);
      const stair = geometries[0].boundingBox!;
      expect(stair.min.y).toBeCloseTo(PENGUIN_GALLERY.lower.top);
      expect(stair.max.y).toBeCloseTo(PENGUIN_GALLERY.upper.top);
      expect(stair.min.z).toBeCloseTo(PENGUIN_GALLERY.upper.maxZ);
    } finally {
      geometries.forEach((g) => g.dispose());
    }
  });

  it("provides standing room and unobstructed lower window sightlines under the permanent terrace", () => {
    const { upper, lower } = PENGUIN_GALLERY;
    const eye = new THREE.Vector3(0, -1.45, 17);
    expect(eye.y - lower.top).toBeCloseTo(1.6);
    expect(eye.z).toBeGreaterThan(upper.maxZ + 1);
    expect(eye.z).toBeLessThan(lower.maxZ - 1);
    const ceiling = new THREE.Box3(
      new THREE.Vector3(upper.minX, upper.top - upper.thickness, upper.minZ),
      new THREE.Vector3(upper.maxX, upper.top, upper.maxZ),
    );
    const geometry = lowerGalleryGeometry(), stairs = galleryStairDetails();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const solids = [new THREE.Mesh(geometry, material), new THREE.Mesh(stairs, material)];
    solids.forEach((mesh) => mesh.updateMatrixWorld());
    try {
      for (const x of [-5, 0, 5]) for (const y of [-2.5, -1.5, -0.8]) {
        const target = new THREE.Vector3(x, y, EXHIBITS.penguins.pool.maxZ);
        const direction = target.clone().sub(eye).normalize();
        expect(new THREE.Ray(eye, direction).intersectsBox(ceiling)).toBe(false);
        const raycast = new THREE.Raycaster(eye, direction, 0, eye.distanceTo(target));
        expect(raycast.intersectObjects(solids)).toHaveLength(0);
      }
    } finally {
      geometry.dispose(); stairs.dispose(); material.dispose();
    }
  });
});
