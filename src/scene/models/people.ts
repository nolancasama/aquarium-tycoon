import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import type { VisitorType } from "../../game/types";

/**
 * Visitors and Pico, low-poly and friendly. Each is a merged body plus
 * separate legs (walk cycle) or flippers (waving). They face +z.
 */

export interface PersonModel {
  body: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  /** Hip height (leg pivot). */
  hip: number;
  /** Leg x offset from the centre. */
  legX: number;
  /** Total height (for bubbles and picking). */
  height: number;
}

interface Palette {
  shirt: string;
  pants: string;
  hair: string;
  skin: string;
  extra: string;
}

const PALETTES: Record<VisitorType, Palette[]> = {
  child: [
    { shirt: "#ff6b6b", pants: "#3b5bdb", hair: "#3a2a1e", skin: "#f6d2b0", extra: "#ffd43b" },
    { shirt: "#51cf66", pants: "#495057", hair: "#1e1e24", skin: "#efc9a4", extra: "#ff922b" },
    { shirt: "#fcc419", pants: "#1971c2", hair: "#5c3b1e", skin: "#f8dcc0", extra: "#e64980" }
  ],
  adult: [
    { shirt: "#748ffc", pants: "#343a40", hair: "#2b1d14", skin: "#f1cfac", extra: "#e8590c" },
    { shirt: "#f783ac", pants: "#5c3d2e", hair: "#1a1a1a", skin: "#eac09a", extra: "#12b886" },
    { shirt: "#20c997", pants: "#2f4858", hair: "#7a4a24", skin: "#f6d7bb", extra: "#7048e8" }
  ],
  fan: [
    { shirt: "#22b8cf", pants: "#364fc7", hair: "#2f1f12", skin: "#f3d0ad", extra: "#ff7a1a" },
    { shirt: "#ffa94d", pants: "#2b8a3e", hair: "#151515", skin: "#e9c39c", extra: "#2a62e6" },
    { shirt: "#cc5de8", pants: "#1864ab", hair: "#4a2e1a", skin: "#f7dcc4", extra: "#ffd92e" }
  ],
  grandma: [
    { shirt: "#c77dff", pants: "#5a4a6b", hair: "#d9d9d9", skin: "#f2d2b6", extra: "#7a4a24" },
    { shirt: "#ff8fab", pants: "#4a5568", hair: "#e9e9e9", skin: "#eac7a6", extra: "#2b6cb0" }
  ],
  explorer: [
    { shirt: "#c9a66b", pants: "#6b5a3e", hair: "#3b2a1a", skin: "#e8bf98", extra: "#e9d8a6" },
    { shirt: "#8fae6b", pants: "#4f5b3a", hair: "#1e1e1e", skin: "#f3d3b3", extra: "#f1e3b8" }
  ],
  judge: [{ shirt: "#2b3a67", pants: "#1f2a4d", hair: "#c8c8c8", skin: "#f0cca8", extra: "#e03131" }]
};

export const paletteCount = (t: VisitorType) => PALETTES[t].length;

const cache = new Map<string, PersonModel>();

export function personModel(type: VisitorType, variant: number): PersonModel {
  const key = `${type}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = PALETTES[type][variant % PALETTES[type].length];
  const child = type === "child";
  const s = child ? 0.74 : 1;
  const hip = 0.74 * s;
  const b = new PartBuilder(0.3);
  // Torso, shoulders, arms, hands.
  b.add(new THREE.CylinderGeometry(0.2 * s, 0.23 * s, 0.6 * s, 10), p.shirt, [0, hip + 0.3 * s, 0]);
  b.sphere(0.21 * s, 0, hip + 0.58 * s, 0, p.shirt, [1.1, 0.5, 0.85], 10);
  for (const x of [-1, 1]) {
    b.add(new THREE.CylinderGeometry(0.055 * s, 0.06 * s, 0.5 * s, 7), p.shirt, [x * 0.27 * s, hip + 0.36 * s, 0], [0, 0, x * 0.12]);
    b.sphere(0.065 * s, x * 0.3 * s, hip + 0.08 * s, 0.01, p.skin, [1, 1, 1], 8);
  }
  // Neck and head.
  b.cyl(0.06 * s, 0.07 * s, 0.08 * s, 0, hip + 0.6 * s, 0, p.skin, 8);
  const hy = hip + 0.86 * s;
  const hr = (child ? 0.2 : 0.17) * (child ? 1 : s);
  b.sphere(hr, 0, hy, 0, p.skin, [1, 1.02, 0.96], 16);
  // Hair: a cap over the back and top of the head.
  b.sphere(hr * 1.06, 0, hy + hr * 0.18, -hr * 0.12, p.hair, [1, 0.88, 0.98], 14);
  // Face: eyes, smile, blush.
  for (const x of [-1, 1]) {
    b.sphere(hr * 0.12, x * hr * 0.36, hy + hr * 0.06, hr * 0.9, "#1b1f27", [1, 1.25, 0.6], 8);
    b.sphere(hr * 0.14, x * hr * 0.6, hy - hr * 0.22, hr * 0.78, "#ffa8a8", [1, 0.6, 0.4], 8);
  }
  b.add(new THREE.TorusGeometry(hr * 0.22, hr * 0.045, 4, 10, Math.PI), "#8a3b3b", [0, hy - hr * 0.22, hr * 0.92], [0, 0, Math.PI]);
  b.sphere(hr * 0.13, 0, hy - hr * 0.02, hr * 0.98, p.skin, [0.8, 0.8, 0.8], 8);
  // Type extras.
  if (type === "child") {
    // Cap with a brim, and a backpack.
    b.sphere(hr * 1.08, 0, hy + hr * 0.3, 0, p.extra, [1, 0.62, 1], 14);
    b.add(new THREE.CylinderGeometry(hr * 0.75, hr * 0.75, 0.02, 14, 1, false, -Math.PI / 2, Math.PI), p.extra, [0, hy + hr * 0.38, hr * 0.55], [0, 0, 0]);
    b.box(0.28 * s, 0.34 * s, 0.14 * s, 0, hip + 0.12 * s, -0.25 * s, p.extra);
    b.box(0.2 * s, 0.12 * s, 0.04 * s, 0, hip + 0.16 * s, -0.33 * s, "#ffffff");
  } else if (type === "adult") {
    // A shoulder bag with a strap.
    b.box(0.2, 0.18, 0.08, 0.3, hip - 0.05, 0.02, p.extra);
    b.add(new THREE.BoxGeometry(0.035, 0.75, 0.03), p.extra, [0.04, hip + 0.32, 0.17], [0, 0, -0.55]);
  } else if (type === "fan") {
    // A fish hat and a camera.
    b.sphere(hr * 0.9, 0, hy + hr * 1.0, 0, p.extra, [1.35, 0.6, 0.62], 14);
    b.add(new THREE.ConeGeometry(hr * 0.45, hr * 0.7, 8), p.extra, [-hr * 1.45, hy + hr * 1.0, 0], [0, 0, Math.PI / 2], [1, 1, 0.4]);
    for (const z of [-1, 1]) b.sphere(hr * 0.16, hr * 0.8, hy + hr * 1.1, z * hr * 0.42, "#ffffff", [1, 1, 0.6], 8);
    b.box(0.2, 0.13, 0.08, 0, hip + 0.38, 0.22, "#2b2b33");
    b.cyl(0.04, 0.045, 0.05, 0, hip + 0.38, 0.27, "#555b66", 10);
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), "#6fc3ff", [0, hip + 0.445, 0.29], [Math.PI / 2, 0, 0]);
  } else if (type === "grandma") {
    // A bun, round glasses, a cardigan's buttons and a handbag.
    b.sphere(hr * 0.5, 0, hy + hr * 0.75, -hr * 0.55, p.hair, [1, 1, 1], 12);
    for (const x of [-1, 1]) b.add(new THREE.TorusGeometry(hr * 0.2, hr * 0.035, 5, 14), "#5a4632", [x * hr * 0.36, hy + hr * 0.06, hr * 0.98], [0, 0, 0]);
    b.box(hr * 0.2, hr * 0.04, hr * 0.04, 0, hy + hr * 0.08, hr * 1.0, "#5a4632");
    for (let i = 0; i < 3; i++) b.sphere(0.018, 0, hip + 0.18 + i * 0.12, 0.215, "#ffffff", [1, 1, 0.5], 6);
    b.box(0.18, 0.15, 0.08, -0.3, hip - 0.08, 0.04, p.extra);
    b.torus(0.06, 0.012, [-0.3, hip + 0.1, 0.04], [0, 0, 0], p.extra);
  } else if (type === "explorer") {
    // A wide safari hat and binoculars on the chest.
    b.add(new THREE.CylinderGeometry(hr * 1.75, hr * 1.75, 0.025, 18), p.extra, [0, hy + hr * 0.55, 0]);
    b.sphere(hr * 1.02, 0, hy + hr * 0.55, 0, p.extra, [1, 0.62, 1], 14);
    b.add(new THREE.CylinderGeometry(hr * 1.03, hr * 1.03, 0.03, 18), "#6b5a3e", [0, hy + hr * 0.6, 0]);
    for (const x of [-0.045, 0.045]) b.add(new THREE.CylinderGeometry(0.032, 0.035, 0.1, 10), "#2b2b33", [x, hip + 0.4, 0.23], [Math.PI / 2, 0, 0]);
    b.box(0.03, 0.03, 0.06, 0, hip + 0.4, 0.22, "#2b2b33");
  } else {
    // The judge: suit, bow tie, rosette, clipboard, moustache.
    b.add(new THREE.ConeGeometry(0.05, 0.08, 4), p.extra, [-0.04, hip + 0.56, 0.2], [0, 0, Math.PI / 2]);
    b.add(new THREE.ConeGeometry(0.05, 0.08, 4), p.extra, [0.04, hip + 0.56, 0.2], [0, 0, -Math.PI / 2]);
    b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), "#ffcc33", [0.12, hip + 0.42, 0.2], [Math.PI / 2, 0, 0]);
    b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 12), p.extra, [0.12, hip + 0.42, 0.21], [Math.PI / 2, 0, 0]);
    b.box(0.22, 0.28, 0.025, -0.28, hip + 0.02, 0.12, "#b07a3c");
    b.box(0.18, 0.22, 0.01, -0.28, hip + 0.04, 0.135, "#ffffff");
    b.sphere(hr * 0.3, 0, hy - hr * 0.12, hr * 0.92, p.hair, [1.6, 0.45, 0.5], 8);
  }
  const body = b.build();
  const lb = new PartBuilder(0.2);
  // A leg hangs from its hip pivot (y = 0) down to the shoe.
  lb.add(new THREE.CylinderGeometry(0.075 * s, 0.065 * s, hip - 0.06, 8), p.pants, [0, -(hip - 0.06) / 2, 0]);
  lb.sphere(0.085 * s, 0, -hip + 0.05, 0.04 * s, type === "judge" ? "#111111" : "#f1f3f5", [1, 0.6, 1.5], 8);
  const model: PersonModel = { body, leg: lb.build(), hip, legX: 0.1 * s, height: hy + hr * (type === "fan" ? 1.6 : type === "explorer" ? 1.5 : 1.2) };
  cache.set(key, model);
  return model;
}

export interface PicoModel {
  body: THREE.BufferGeometry;
  flipper: THREE.BufferGeometry;
}

let pico: PicoModel | null = null;

/** Pico the penguin: keeper's cap and bow tie. Flippers pivot at the shoulder. */
export function picoModel(): PicoModel {
  if (pico) return pico;
  const b = new PartBuilder(0.2);
  b.sphere(0.3, 0, 0.42, 0, "#26303d", [1, 1.35, 0.95], 18);
  b.sphere(0.24, 0, 0.4, 0.09, "#ffffff", [1, 1.3, 0.85], 16);
  b.sphere(0.24, 0, 0.86, 0, "#26303d", [1, 0.95, 0.95], 16);
  for (const x of [-1, 1]) {
    b.sphere(0.085, x * 0.085, 0.88, 0.17, "#ffffff", [1, 1.15, 0.6], 12);
    b.sphere(0.045, x * 0.085, 0.885, 0.215, "#15202b", [1, 1.2, 0.6], 10);
    b.sphere(0.016, x * 0.085 + 0.012, 0.91, 0.24, "#ffffff", [1, 1, 0.6], 6);
    b.sphere(0.045, x * 0.15, 0.79, 0.19, "#ffb3c1", [1, 0.6, 0.4], 8);
    // Feet.
    b.sphere(0.09, x * 0.1, 0.03, 0.08, "#ff9f1c", [1, 0.35, 1.5], 10);
  }
  b.add(new THREE.ConeGeometry(0.05, 0.12, 10), "#ff9f1c", [0, 0.8, 0.27], [Math.PI / 2, 0, 0]);
  // Cap with a fish badge.
  b.sphere(0.2, 0, 1.0, -0.01, "#1f7ae0", [1.08, 0.55, 1.08], 14);
  b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 14, 1, false, -Math.PI / 2, Math.PI), "#1f7ae0", [0, 1.02, 0.13]);
  b.sphere(0.04, 0, 1.06, 0.19, "#ffd23f", [1.3, 0.7, 0.4], 8);
  // Bow tie.
  b.add(new THREE.ConeGeometry(0.045, 0.07, 4), "#ff4d6d", [-0.035, 0.66, 0.29], [0, 0, Math.PI / 2]);
  b.add(new THREE.ConeGeometry(0.045, 0.07, 4), "#ff4d6d", [0.035, 0.66, 0.29], [0, 0, -Math.PI / 2]);
  const fb = new PartBuilder(0.05);
  fb.sphere(0.08, 0, -0.17, 0, "#26303d", [0.55, 1.6, 0.9], 10);
  pico = { body: b.build(), flipper: fb.build() };
  return pico;
}
