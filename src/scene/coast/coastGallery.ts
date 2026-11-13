import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

/** Exhibit-local metres. The lower gallery is the only penguin visitor level. */
export const PENGUIN_GALLERY = {
  lower: { minX: -11.7, maxX: 11.7, minZ: 11.16, maxZ: 21, top: -3.05, thickness: 0.24 },
  window: { minX: -10.2, maxX: 10.2, minZ: 10.84, maxZ: 11.16, paneZ: 10.97 },
  coping: { minX: -10.97, maxX: 10.97, minZ: 11.15, maxZ: 11.8, bottom: 2.55, thickness: 0.18 },
  entrance: { minZ: 14.8, maxZ: 18.4, outerX: 14.5, clearHeight: 2.6 },
} as const;

/** One horizontal floor, with level side passages rather than stairs to a lost deck. */
export function lowerGalleryGeometry(): THREE.BufferGeometry {
  const { lower, window, coping, entrance } = PENGUIN_GALLERY;
  const b = new PartBuilder(0);
  b.box(lower.maxX - lower.minX, lower.thickness, lower.maxZ - lower.minZ,
    0, lower.top - lower.thickness, (lower.minZ + lower.maxZ) / 2, "#c5c1af");
  // The floor butts into the bottom frame. A plinth on top masks the glass
  // bottom without entering the swimming volume or overlapping a visible face.
  b.box(window.maxX - window.minX, 0.22, 0.26,
    0, lower.top, window.maxZ + 0.13, "#718c93");
  // Narrow piers carry a plain 65 cm coping, with no terrace or rails.
  for (const side of [-1, 1]) {
    b.box(0.64, coping.bottom - lower.top, coping.maxZ - coping.minZ,
      side * 10.65, lower.top, (coping.minZ + coping.maxZ) / 2, "#728b91");
  }
  b.box(coping.maxX - coping.minX, coping.thickness, coping.maxZ - coping.minZ,
    0, coping.bottom, (coping.minZ + coping.maxZ) / 2, "#8fa3a2");
  // Side passages have the same floor height. Their far ends stay open.
  for (const side of [-1, 1]) {
    const edge = lower.maxX, width = entrance.outerX - edge;
    b.box(width, lower.thickness, entrance.maxZ - entrance.minZ,
      side * (edge + width / 2), lower.top - lower.thickness,
      (entrance.minZ + entrance.maxZ) / 2, "#b9b7a8");
    for (const [start, end] of [[coping.maxZ, entrance.minZ], [entrance.maxZ, lower.maxZ]]) {
      b.box(0.4, entrance.clearHeight, end - start,
        side * (edge - 0.2), lower.top, (start + end) / 2, "#73898b");
    }
    b.box(width + 0.4, 0.22, entrance.maxZ - entrance.minZ,
      side * (edge + width / 2 - 0.2), lower.top + entrance.clearHeight,
      (entrance.minZ + entrance.maxZ) / 2, "#647c80");
    for (const z of [entrance.minZ + 0.1, entrance.maxZ - 0.1]) {
      b.box(width, entrance.clearHeight, 0.2,
        side * (edge + width / 2), lower.top, z, "#647c80");
    }
  }
  b.box(lower.maxX - lower.minX - 0.8, 0.12, 0.18,
    0, lower.top, lower.maxZ - 0.09, "#728b91");
  return b.build();
}
