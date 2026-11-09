import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import type { CoastDecorKind } from "../../game/types";

/**
 * Low-poly coastal animals and habitat items. Each animal is a few merged
 * parts plus the pieces that move on their own (flippers, head, tail), so one
 * animal costs 3-5 draw calls. Animals face +z. Penguins are built upright
 * (feet at y = 0); seals and otters are built lying along +z, centred on their
 * body (the scene lifts them onto the ground when they are out of the water).
 */

export interface PenguinParts { body: THREE.BufferGeometry; flipper: THREE.BufferGeometry; centre: number }
export interface SealParts { front: THREE.BufferGeometry; rear: THREE.BufferGeometry; head: THREE.BufferGeometry; foreFlipper: THREE.BufferGeometry; lift: number }
export interface OtterParts { body: THREE.BufferGeometry; head: THREE.BufferGeometry; paw: THREE.BufferGeometry; tail: THREE.BufferGeometry; lift: number }

let penguin: PenguinParts | null = null;
/** A Humboldt penguin (rocky temperate coasts): black back, white front with a black chest band, pink face patch. */
export function penguinParts(): PenguinParts {
  if (penguin) return penguin;
  const b = new PartBuilder(0);
  const black = "#1f242e", white = "#f4f6f8";
  b.sphere(0.19, 0, 0.3, -0.01, black, [1, 1.55, 0.95], 12);
  b.sphere(0.165, 0, 0.29, 0.05, white, [0.88, 1.38, 0.62], 12);
  // Chest band: a black ring across the white front.
  b.add(new THREE.TorusGeometry(0.15, 0.018, 4, 18, Math.PI), black, [0, 0.42, 0.04], [0, 0, Math.PI], [1, 0.55, 1.1]);
  b.sphere(0.115, 0, 0.6, 0.01, black, [1, 1, 1], 12);
  b.sphere(0.07, 0, 0.585, 0.085, white, [1.2, 0.9, 0.55], 8);
  b.sphere(0.035, 0.05, 0.625, 0.08, "#f2a5a5", [1, 0.8, 0.5], 6);
  b.sphere(0.035, -0.05, 0.625, 0.08, "#f2a5a5", [1, 0.8, 0.5], 6);
  b.add(new THREE.ConeGeometry(0.03, 0.11, 6), "#2b2b2b", [0, 0.6, 0.155], [Math.PI / 2, 0, 0]);
  b.sphere(0.014, 0.045, 0.635, 0.1, "#111111", [1, 1, 1], 6);
  b.sphere(0.014, -0.045, 0.635, 0.1, "#111111", [1, 1, 1], 6);
  b.box(0.07, 0.025, 0.11, 0.07, 0, 0.04, "#d98a8a");
  b.box(0.07, 0.025, 0.11, -0.07, 0, 0.04, "#d98a8a");
  const f = new PartBuilder(0);
  // A flipper hangs from the shoulder (pivot at y = 0).
  f.add(new THREE.BoxGeometry(0.035, 0.24, 0.085), black, [0, -0.12, 0], [0, 0, 0], [1, 1, 1], { vary: false });
  penguin = { body: b.build(), flipper: f.build(), centre: 0.32 };
  return penguin;
}

let seal: SealParts | null = null;
/** A harbor seal: grey with darker spots, a rounded head, small fore flippers, hind flippers that sweep. */
export function sealParts(): SealParts {
  if (seal) return seal;
  const grey = "#8a8f94", pale = "#c9c6bd", spot = "#55595e";
  const front = new PartBuilder(0);
  front.sphere(0.3, 0, 0, 0.12, grey, [1, 0.85, 1.25], 14);
  front.sphere(0.24, 0, -0.1, 0.18, pale, [0.9, 0.55, 1.05], 12);
  for (const [x, y, z] of [[0.12, 0.2, 0.25], [-0.15, 0.18, 0.05], [0.05, 0.24, -0.05], [-0.1, 0.22, 0.3]]) front.sphere(0.04, x, y, z, spot, [1, 0.4, 1], 6);
  const rear = new PartBuilder(0);
  rear.sphere(0.26, 0, 0, -0.28, grey, [1, 0.8, 1.4], 12);
  rear.sphere(0.03, 0.1, 0.18, -0.25, spot, [1, 0.4, 1], 6);
  rear.add(new THREE.ConeGeometry(0.1, 0.32, 4), "#6f7378", [0.08, 0, -0.7], [-Math.PI / 2, 0, 0.25], [1, 1, 0.35]);
  rear.add(new THREE.ConeGeometry(0.1, 0.32, 4), "#6f7378", [-0.08, 0, -0.7], [-Math.PI / 2, 0, -0.25], [1, 1, 0.35]);
  const head = new PartBuilder(0);
  head.sphere(0.17, 0, 0, 0, grey, [1, 0.95, 1.05], 12);
  head.sphere(0.09, 0, -0.04, 0.14, pale, [1, 0.8, 0.9], 8);
  head.sphere(0.03, 0.08, 0.05, 0.13, "#111111", [1, 1, 1], 6);
  head.sphere(0.03, -0.08, 0.05, 0.13, "#111111", [1, 1, 1], 6);
  head.sphere(0.022, 0, -0.01, 0.23, "#222222", [1.3, 0.8, 1], 6);
  const flipper = new PartBuilder(0);
  flipper.add(new THREE.BoxGeometry(0.06, 0.03, 0.17), "#6f7378", [0, 0, 0.06], [0, 0, 0], [1, 1, 1], { vary: false });
  seal = { front: front.build(), rear: rear.build(), head: head.build(), foreFlipper: flipper.build(), lift: 0.24 };
  return seal;
}

let otter: OtterParts | null = null;
/** A sea otter: dark brown body, pale grizzled head, small paws, a flat tail. */
export function otterParts(): OtterParts {
  if (otter) return otter;
  const brown = "#5b4030", dark = "#3f2c21", pale = "#cbbfae";
  const body = new PartBuilder(0);
  body.sphere(0.2, 0, 0, 0, brown, [1, 0.85, 1.9], 12);
  body.sphere(0.16, 0, -0.04, 0.12, "#6d4f3c", [1, 0.7, 1.4], 10);
  body.sphere(0.07, 0.11, -0.12, -0.3, dark, [1, 0.7, 1.4], 6);
  body.sphere(0.07, -0.11, -0.12, -0.3, dark, [1, 0.7, 1.4], 6);
  const head = new PartBuilder(0);
  head.sphere(0.13, 0, 0, 0, pale, [1, 0.92, 1], 12);
  head.sphere(0.065, 0, -0.03, 0.1, "#ddd2c2", [1.1, 0.8, 0.9], 8);
  head.sphere(0.024, 0, 0.0, 0.165, "#1d1d1d", [1.3, 0.9, 1], 6);
  head.sphere(0.018, 0.055, 0.04, 0.11, "#111111", [1, 1, 1], 6);
  head.sphere(0.018, -0.055, 0.04, 0.11, "#111111", [1, 1, 1], 6);
  head.sphere(0.03, 0.1, 0.08, -0.02, pale, [1, 1, 0.6], 6);
  head.sphere(0.03, -0.1, 0.08, -0.02, pale, [1, 1, 0.6], 6);
  const paw = new PartBuilder(0);
  paw.sphere(0.045, 0, 0, 0, dark, [1, 0.8, 1.2], 6);
  const tail = new PartBuilder(0);
  tail.add(new THREE.BoxGeometry(0.12, 0.035, 0.32), dark, [0, 0, -0.16], [0, 0, 0], [1, 1, 1], { vary: false });
  otter = { body: body.build(), head: head.build(), paw: paw.build(), tail: tail.build(), lift: 0.17 };
  return otter;
}

const itemCache = new Map<CoastDecorKind, THREE.BufferGeometry>();
/** A habitat item, built around its slot point (y = 0 is the land top, the water surface, or the pool floor). */
export function itemGeometry(kind: CoastDecorKind): THREE.BufferGeometry {
  const hit = itemCache.get(kind);
  if (hit) return hit;
  const b = new PartBuilder(0.2);
  const rock = (x: number, z: number, r: number, h: number, c: string, rot = 0) =>
    b.add(new THREE.DodecahedronGeometry(r, 0), c, [x, h * 0.4, z], [rot, rot * 1.7, 0], [1, h / r * 0.55, 1]);
  switch (kind) {
    case "penguinRock":
      rock(-0.2, 0, 0.42, 0.34, "#9aa4ad", 0.3);
      rock(0.28, 0.12, 0.32, 0.26, "#b3bcc3", 0.9);
      rock(0.05, -0.28, 0.26, 0.22, "#8a949d", 1.4);
      break;
    case "penguinNest":
      b.add(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#8d8a80", [0, 0, 0], [0, 0, 0], [1, 0.75, 1]);
      b.add(new THREE.CircleGeometry(0.22, 12), "#2a2622", [0, 0.17, 0.46], [-0.25, 0, 0]);
      b.cyl(0.55, 0.6, 0.04, 0, 0, 0, "#b9a27a", 14);
      break;
    case "penguinFeeder":
      b.box(0.9, 0.08, 0.6, 0, 0, 0, "#9b7448");
      b.cyl(0.16, 0.13, 0.26, -0.18, 0.08, 0, "#2f7fc1", 12);
      for (const [x, z] of [[0.12, 0.05], [0.25, -0.1], [0.3, 0.12]]) b.add(new THREE.SphereGeometry(0.05, 6, 4), "#c9d6de", [x, 0.12, z], [0, 0, 0], [0.6, 0.6, 2]);
      break;
    case "sealRock":
      rock(0, 0, 0.75, 0.32, "#8b7f72", 0.2);
      rock(0.45, -0.3, 0.38, 0.28, "#a09383", 1.1);
      break;
    case "sealBall":
      b.sphere(0.24, 0, 0.05, 0, "#e03131", [1, 1, 1], 12);
      b.add(new THREE.TorusGeometry(0.24, 0.035, 4, 16), "#ffffff", [0, 0.05, 0], [0, 0, 0]);
      break;
    case "sealBuoy":
      b.add(new THREE.TorusGeometry(0.42, 0.07, 6, 18), "#ff922b", [0, 0.5, 0], [0, 0, 0]);
      b.cyl(0.04, 0.04, 0.5, 0, 0, 0, "#555b60", 6);
      b.cyl(0.25, 0.3, 0.08, 0, 0, 0, "#555b60", 10);
      break;
    case "otterKelp":
      for (let i = 0; i < 6; i++) b.add(new THREE.CircleGeometry(0.28, 7), "#3f8f4a", [Math.cos(i) * 0.35, 0.02 + i * 0.002, Math.sin(i * 1.3) * 0.3], [-Math.PI / 2, 0, i], [1.4, 0.6, 1]);
      for (const [x, z] of [[-0.2, 0.1], [0.25, -0.1], [0, -0.3]]) b.cyl(0.025, 0.025, 1.6, x, -1.6, z, "#3c7a3e", 5);
      break;
    case "otterToy":
      b.add(new THREE.TorusGeometry(0.2, 0.07, 6, 14), "#ffd43b", [0, 0.04, 0], [Math.PI / 2, 0, 0]);
      b.sphere(0.06, 0.2, 0.08, 0, "#4dabf7", [1, 1, 1], 8);
      break;
    case "otterDen":
      rock(-0.35, 0, 0.55, 0.7, "#6f6253", 0.5);
      rock(0.4, -0.1, 0.5, 0.6, "#7d6f5e", 1.2);
      b.box(1.1, 0.12, 0.7, 0, 0.6, -0.05, "#665a4b");
      b.cone(0.18, 0.35, -0.2, 0.66, 0.1, "#4f8a4a", 5);
      b.cone(0.15, 0.3, 0.3, 0.66, -0.1, "#5a9a50", 5);
      break;
  }
  const g = b.build();
  itemCache.set(kind, g);
  return g;
}
