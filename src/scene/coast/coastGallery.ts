import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

/** Exhibit-local metres. These floors and the stair stay present in both views. */
export const PENGUIN_GALLERY = {
  upper: { minX: -11.7, maxX: 11.7, minZ: 11.15, maxZ: 15.15, top: 0, thickness: 0.18 },
  lower: { minX: -11.7, maxX: 11.7, minZ: 11.15, maxZ: 21, top: -3.05, thickness: 0.24 },
  stair: { minX: 8.15, maxX: 10.25, startZ: 15.15, risers: 17, tread: 0.27 },
  window: { minX: -10.2, maxX: 10.2, minZ: 10.79, maxZ: 11.11 },
} as const;

export function galleryStairSections() {
  const { upper, lower, stair } = PENGUIN_GALLERY;
  const rise = (upper.top - lower.top) / stair.risers;
  return Array.from({ length: stair.risers - 1 }, (_, i) => ({
    minZ: stair.startZ + i * stair.tread,
    maxZ: stair.startZ + (i + 1) * stair.tread,
    top: upper.top - (i + 1) * rise,
  }));
}

/** One closed stair solid: no coplanar overlapping tread boxes at the joins. */
export function galleryStairGeometry(): THREE.BufferGeometry {
  const { upper, lower, stair } = PENGUIN_GALLERY;
  const steps = galleryStairSections(), end = steps[steps.length - 1].maxZ;
  const shape = new THREE.Shape();
  shape.moveTo(stair.startZ, upper.top);
  for (const step of steps) {
    shape.lineTo(step.minZ, step.top);
    shape.lineTo(step.maxZ, step.top);
  }
  shape.lineTo(end, lower.top);
  shape.lineTo(stair.startZ, lower.top);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: stair.maxX - stair.minX, bevelEnabled: false });
  geo.applyMatrix4(new THREE.Matrix4().set(
    0, 0, -1, stair.maxX,
    0, 1, 0, 0,
    1, 0, 0, 0,
    0, 0, 0, 1,
  ));
  return geo;
}

export function lowerGalleryGeometry(): THREE.BufferGeometry {
  const { upper, lower } = PENGUIN_GALLERY;
  const b = new PartBuilder(0);
  b.box(lower.maxX - lower.minX, lower.thickness, lower.maxZ - lower.minZ,
    0, lower.top - lower.thickness, (lower.minZ + lower.maxZ) / 2, "#c5c1af");
  // A low window plinth meets the existing bottom frame without a coplanar face.
  b.box(20.4, 0.2, lower.minZ - PENGUIN_GALLERY.window.maxZ, 0,
    lower.top - 0.2, (lower.minZ + PENGUIN_GALLERY.window.maxZ) / 2, "#718c93");
  // The terrace's load goes to the lower floor through four edge columns.
  // They stay outside the window width and the swimming volume.
  for (const x of [-11.22, 11.22]) {
    for (const z of [11.55, 14.85]) {
      b.box(0.28, upper.top - upper.thickness - 0.16 - lower.top, 0.32, x, lower.top, z, "#728b91");
    }
    b.box(0.28, 0.16, upper.maxZ - upper.minZ, x, upper.top - upper.thickness - 0.16,
      (upper.minZ + upper.maxZ) / 2, "#728b91");
  }
  // Side/rear curbs give the lower landing a readable, grounded perimeter.
  for (const x of [lower.minX + 0.12, lower.maxX - 0.12]) {
    b.box(0.24, 0.22, lower.maxZ - lower.minZ, x, lower.top, (lower.minZ + lower.maxZ) / 2, "#728b91");
  }
  b.box(lower.maxX - lower.minX - 0.48, 0.22, 0.24, 0, lower.top, lower.maxZ - 0.12, "#728b91");
  return b.build();
}

export function galleryStairDetails(): THREE.BufferGeometry {
  const { upper, lower, stair } = PENGUIN_GALLERY;
  const steps = galleryStairSections(), end = steps[steps.length - 1].maxZ;
  const b = new PartBuilder(0);
  b.add(galleryStairGeometry(), "#b8b7a9", [0, 0, 0]);
  // Inset contrasting nosings are separated from the stone tread by 8 mm.
  for (const step of steps) b.box(stair.maxX - stair.minX - 0.18, 0.012, 0.055,
    (stair.minX + stair.maxX) / 2, step.top + 0.008, step.minZ + 0.065, "#557f87");
  const run = end - stair.startZ, drop = upper.top - lower.top;
  for (const x of [stair.minX + 0.04, stair.maxX - 0.04]) {
    const posts = [{ z: stair.startZ, top: upper.top },
      ...steps.filter((_, i) => i % 4 === 3).map((s) => ({ z: s.maxZ - 0.08, top: s.top })),
      { z: end, top: lower.top }];
    for (const post of posts) b.box(0.055, 1, 0.055, x, post.top, post.z, "#527d85");
    b.boxAt(0.075, 0.075, Math.hypot(run, drop),
      [x, (upper.top + lower.top) / 2 + 1, (stair.startZ + end) / 2],
      [Math.atan2(drop, run), 0, 0], "#527d85");
  }
  return b.build();
}
