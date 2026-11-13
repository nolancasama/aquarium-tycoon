import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EXHIBITS } from "../../game/data/coast";
import { blendCoastShot, coastExhibitShot, COAST_VIEW_SECONDS } from "../../game/coast/view";
import { lowerGalleryGeometry, PENGUIN_GALLERY } from "./coastGallery";

function galleryMesh() {
  const geometry = lowerGalleryGeometry();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  return { geometry, material, mesh, dispose() { geometry.dispose(); material.dispose(); } };
}

describe("principal lower penguin gallery", () => {
  it("has one level floor and open side passages, with no upper terrace or stairs", () => {
    const { lower, entrance } = PENGUIN_GALLERY;
    expect("upper" in PENGUIN_GALLERY).toBe(false);
    expect("stair" in PENGUIN_GALLERY).toBe(false);
    const gallery = galleryMesh();
    try {
      for (const x of [-14, -11.5, -8, 0, 8, 11.5, 14]) {
        // Probe from beneath the lintel: every corridor meets the same floor.
        const hit = new THREE.Raycaster(new THREE.Vector3(x, lower.top + 0.1, 16), new THREE.Vector3(0, -1, 0)).intersectObject(gallery.mesh)[0];
        expect(hit?.point.y).toBeCloseTo(lower.top, 5);
        expect(hit?.face?.normal.y).toBeGreaterThan(0.99);
      }
      for (const direction of [-1, 1]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(0, lower.top + 1.6, 16), new THREE.Vector3(direction, 0, 0), 0, entrance.outerX + 0.5);
        expect(ray.intersectObject(gallery.mesh)).toHaveLength(0);
      }
      expect(entrance.clearHeight).toBeGreaterThan(2.4);
    } finally { gallery.dispose(); }
  });

  it("connects the floor, plinth and narrow window coping outside the pool", () => {
    const { lower, window, coping } = PENGUIN_GALLERY;
    const geometry = lowerGalleryGeometry();
    try {
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.z).toBeGreaterThan(EXHIBITS.penguins.pool.maxZ);
      expect(geometry.boundingBox!.min.y).toBeCloseTo(lower.top - lower.thickness);
      expect(lower.minZ).toBe(window.maxZ);
      expect(coping.maxZ - coping.minZ).toBeLessThan(0.7);
      expect(window.paneZ).toBeGreaterThan(EXHIBITS.penguins.pool.maxZ);
      const positions = geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true);
        // Across the window width no elevated horizontal visitor slab remains.
        if (Math.abs(positions.getX(i)) < 10.1 && positions.getZ(i) > coping.maxZ + 0.01) {
          expect(positions.getY(i)).toBeLessThanOrEqual(lower.top + 0.13);
        }
      }
    } finally { geometry.dispose(); }
  });

  it.each([1366 / 768, 1024 / 768, 1024 / 600])("keeps both transition directions outside the geometry at aspect %s", (aspect) => {
    const ex = EXHIBITS.penguins, { lower, coping } = PENGUIN_GALLERY;
    const cap = new THREE.Box3(new THREE.Vector3(coping.minX, coping.bottom, coping.minZ), new THREE.Vector3(coping.maxX, coping.bottom + coping.thickness, coping.maxZ));
    const land = coastExhibitShot("penguins", aspect, false), water = coastExhibitShot("penguins", aspect, true);
    const out = structuredClone(land);
    for (const [from, to] of [[land, water], [water, land]]) {
      for (let i = 0; i <= 100; i++) {
        blendCoastShot(from, to, COAST_VIEW_SECONDS * i / 100, out);
        const eye = new THREE.Vector3(out.pos.x - ex.x, out.pos.y, out.pos.z - ex.z);
        expect(cap.containsPoint(eye)).toBe(false);
        expect(eye.z).toBeGreaterThan(coping.maxZ);
        expect(eye.y).toBeGreaterThan(lower.top + 1.5);
      }
    }
  });

  it("keeps close swimmer question restoration outside the window coping", () => {
    const { coping } = PENGUIN_GALLERY, ex = EXHIBITS.penguins;
    const cap = new THREE.Box3(new THREE.Vector3(coping.minX, coping.bottom, coping.minZ), new THREE.Vector3(coping.maxX, coping.bottom + coping.thickness, coping.maxZ));
    const lower = coastExhibitShot("penguins", 1366 / 768, true);
    for (const x of [-8, 0, 8]) for (const y of [-2.6, 1.95]) for (const z of [0, 10]) {
      const question = coastExhibitShot("penguins", 1366 / 768, true, "water", [{ x: ex.x + x, y, z: ex.z + z }]);
      const out = structuredClone(lower);
      for (const [from, to] of [[lower, question], [question, lower]]) for (let i = 0; i <= 100; i++) {
        blendCoastShot(from, to, COAST_VIEW_SECONDS * i / 100, out);
        expect(cap.containsPoint(new THREE.Vector3(out.pos.x - ex.x, out.pos.y, out.pos.z - ex.z))).toBe(false);
      }
    }
  });

  it.each([1366 / 768, 1024 / 768, 1024 / 600])("shows foreground floor from standing eye height and clear window rays at aspect %s", (aspect) => {
    const { lower } = PENGUIN_GALLERY, ex = EXHIBITS.penguins;
    const shot = coastExhibitShot("penguins", aspect, true);
    const eye = new THREE.Vector3(shot.pos.x - ex.x, shot.pos.y, shot.pos.z - ex.z);
    expect(eye.y - lower.top).toBeCloseTo(1.6);
    expect(eye.z).toBeGreaterThan(lower.minZ);
    expect(eye.z).toBeLessThan(lower.maxZ - 1);
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 500);
    camera.position.copy(eye);
    camera.lookAt(shot.target.x - ex.x, shot.target.y, shot.target.z - ex.z);
    camera.updateMatrixWorld();
    const gallery = galleryMesh();
    try {
      for (const x of [-5, 0, 5]) for (const y of [-2.5, -1.5, -0.8]) {
        const target = new THREE.Vector3(x, y, ex.pool.maxZ);
        const ray = new THREE.Raycaster(eye, target.clone().sub(eye).normalize(), 0, eye.distanceTo(target));
        expect(ray.intersectObject(gallery.mesh)).toHaveLength(0);
      }
      const floorPoint = new THREE.Vector3(0, lower.top, lower.minZ + 0.8).project(camera);
      expect(floorPoint.x).toBeGreaterThan(-1);
      expect(floorPoint.x).toBeLessThan(1);
      // The sill sits near 58% of image height, leaving 20-30% foreground
      // floor before the bottom controls, rather than merely inside the image.
      expect(floorPoint.y).toBeGreaterThan(-0.25);
      expect(floorPoint.y).toBeLessThan(-0.1);
      const lintel = new THREE.Vector3(0, PENGUIN_GALLERY.coping.bottom, PENGUIN_GALLERY.coping.maxZ).project(camera);
      expect(lintel.y).toBeGreaterThan(0.7);
      expect(lintel.y).toBeLessThan(1);
      const foregroundRay = new THREE.Raycaster();
      foregroundRay.setFromCamera(new THREE.Vector2(0, -0.9), camera);
      expect(foregroundRay.intersectObject(gallery.mesh)[0]?.point.y).toBeCloseTo(lower.top);
    } finally { gallery.dispose(); }
  });
});
