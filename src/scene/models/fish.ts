import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import type { SpeciesId } from "../../game/types";
import { SPECIES } from "../../game/data/fish";

/**
 * Fish bodies built from scaled spheres and cones, merged into one geometry
 * per species (shared by every fish of that species). Head toward +x, eyes on
 * ±z, centred on the body. The swim shader bends everything behind the head.
 */

type V3 = [number, number, number];

class FishBuilder {
  b = new PartBuilder(0);

  ell(r: V3, at: V3, color: string, rot: V3 = [0, 0, 0], seg = 18) {
    this.b.add(new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7))), color, at, rot, r, { vary: false });
    return this;
  }

  /** A fin: a flattened ellipsoid with a darker rim behind it. */
  fin(r: V3, at: V3, color: string, rim: string | null, rot: V3 = [0, 0, 0]) {
    if (rim) this.ell([r[0] * 1.08, r[1] * 1.1, r[2] * 0.8], [at[0] - r[0] * 0.04, at[1], at[2]], rim, rot, 12);
    this.ell(r, at, color, rot, 12);
    return this;
  }

  /** Big cartoon eyes on both sides. */
  eyes(x: number, y: number, zSurface: number, r: number) {
    for (const s of [1, -1]) {
      this.ell([r, r, r * 0.75], [x, y, s * zSurface], "#ffffff", [0, 0, 0], 14);
      this.ell([r * 0.62, r * 0.66, r * 0.4], [x + r * 0.12, y - r * 0.02, s * (zSurface + r * 0.5)], "#15202b", [0, 0, 0], 12);
      this.ell([r * 0.22, r * 0.22, r * 0.12], [x + r * 0.28, y + r * 0.26, s * (zSurface + r * 0.82)], "#ffffff", [0, 0, 0], 8);
    }
    return this;
  }

  blush(x: number, y: number, zSurface: number, r: number) {
    for (const s of [1, -1]) this.ell([r, r * 0.6, r * 0.25], [x, y, s * zSurface], "#ff9fb0", [0, 0, 0], 10);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = this.b.build();
    // Keep the primitives' smooth normals: recomputing on merged,
    // non-indexed triangles turns every rounded body into flat facets.
    g.computeBoundingSphere();
    return g;
  }
}

/** Radius of an ellipsoid cross-section at x (for bands that hug the body). */
const at = (a: number, x: number) => Math.sqrt(Math.max(0, 1 - (x / a) ** 2));

function clownfish(L: number) {
  const f = new FishBuilder();
  const a = L * 0.5;
  const by = L * 0.27;
  const bz = L * 0.18;
  const orange = "#ff6f0f";
  f.ell([a, by, bz], [0, 0, 0], orange, [0, 0, 0], 24);
  // Three white bands with dark edges, hugging the body.
  for (const [x, w] of [
    [0.3 * a, 0.08],
    [-0.08 * a, 0.1],
    [-0.66 * a, 0.07]
  ]) {
    const k = at(a, x);
    f.ell([w * a * 1.45, by * k + 0.0016, bz * k + 0.0016], [x, 0, 0], "#1c1c22", [0, 0, 0], 20);
    f.ell([w * a, by * k + 0.0032, bz * k + 0.0032], [x, 0, 0], "#ffffff", [0, 0, 0], 20);
  }
  // Fins.
  f.fin([0.34 * a, 0.12 * L, 0.018 * L], [-0.08 * a, by * 0.92, 0], orange, "#1c1c22", [0, 0, -0.08]);
  f.fin([0.16 * a, 0.08 * L, 0.018 * L], [-0.4 * a, -by * 0.9, 0], orange, "#1c1c22", [0, 0, 0.3]);
  for (const s of [1, -1]) f.fin([0.13 * L, 0.06 * L, 0.014 * L], [0.12 * a, -0.25 * by, s * bz * 0.95], orange, "#1c1c22", [s * 0.5, s * 0.4, -0.5]);
  // Tail: two rounded lobes with a dark rim.
  for (const s of [1, -1]) f.fin([0.17 * a, 0.2 * L, 0.02 * L], [-a - 0.05 * a, s * 0.06 * L, 0], orange, "#1c1c22", [0, 0, s * 0.55]);
  f.eyes(0.6 * a, 0.2 * by, bz * 0.72, 0.058 * L);
  f.blush(0.42 * a, -0.25 * by, bz * 0.86, 0.035 * L);
  f.ell([0.03 * L, 0.018 * L, 0.05 * L], [0.97 * a, -0.15 * by, 0], "#a8410a", [0, 0, 0], 8);
  return f.build();
}

function blueTang(L: number) {
  const f = new FishBuilder();
  const a = L * 0.5;
  const by = L * 0.32;
  const bz = L * 0.11;
  const blue = "#2a62e6";
  f.ell([a, by, bz], [0, 0, 0], blue, [0, 0, 0], 24);
  // The dark "palette" mark on the upper flank.
  f.ell([0.62 * a, 0.11 * L, bz * 0.99 + 0.0012], [-0.12 * a, 0.09 * L, 0], "#14245e", [0, 0, -0.12], 20);
  f.ell([0.3 * a, 0.07 * L, bz * 0.99 + 0.0022], [-0.12 * a, 0.075 * L, 0], blue, [0, 0, -0.12], 16);
  // Yellow tail base and tail.
  f.ell([0.2 * a, 0.12 * L, bz * at(a, -0.8 * a) + 0.002], [-0.8 * a, 0, 0], "#ffd23f", [0, 0, 0], 14);
  for (const s of [1, -1]) f.fin([0.15 * a, 0.24 * L, 0.018 * L], [-a - 0.08 * a, s * 0.08 * L, 0], "#ffd23f", "#14245e", [0, 0, s * 0.62]);
  // Long dorsal and anal fins, pectoral fins.
  f.fin([0.78 * a, 0.075 * L, 0.014 * L], [-0.12 * a, by * 0.93, 0], "#1d47b4", "#14245e");
  f.fin([0.55 * a, 0.06 * L, 0.014 * L], [-0.2 * a, -by * 0.93, 0], "#1d47b4", "#14245e");
  for (const s of [1, -1]) f.fin([0.1 * L, 0.05 * L, 0.012 * L], [0.22 * a, -0.15 * by, s * bz * 0.98], "#ffd23f", null, [s * 0.5, s * 0.4, -0.5]);
  f.eyes(0.62 * a, 0.12 * by, bz * 0.68, 0.052 * L);
  f.blush(0.45 * a, -0.3 * by, bz * 0.82, 0.03 * L);
  f.ell([0.025 * L, 0.016 * L, 0.04 * L], [0.98 * a, -0.18 * by, 0], "#0e2a6e", [0, 0, 0], 8);
  return f.build();
}

function yellowFish(L: number) {
  const f = new FishBuilder();
  const a = L * 0.42;
  const by = L * 0.42;
  const bz = L * 0.1;
  const yellow = "#ffd92e";
  f.ell([a, by, bz], [0, 0, 0], yellow, [0, 0, 0], 24);
  // Pointed snout.
  f.b.add(new THREE.ConeGeometry(0.075 * L, 0.2 * L, 14), yellow, [a + 0.06 * L, -0.06 * by, 0], [0, 0, -Math.PI / 2], [1, 1, 0.8], { vary: false });
  f.ell([0.02 * L, 0.02 * L, 0.03 * L], [a + 0.16 * L, -0.06 * by, 0], "#3a2a00", [0, 0, 0], 8);
  // A dark band through the eye and a dark "false eye" spot near the tail.
  f.ell([0.055 * L, by * at(a, 0.5 * a) * 0.95 + 0.002, bz * at(a, 0.5 * a) + 0.0018], [0.5 * a, 0.02 * by, 0], "#2a2a33", [0, 0, 0], 18);
  f.ell([0.06 * L, 0.06 * L, bz * at(a, -0.55 * a) * 0.95 + 0.0018], [-0.55 * a, 0.42 * by, 0], "#2a2a33", [0, 0, 0], 14);
  // Long trailing fins and a fan tail.
  f.fin([0.6 * a, 0.17 * L, 0.014 * L], [-0.3 * a, by * 0.78, 0], yellow, "#ff9a1f", [0, 0, -0.35]);
  f.fin([0.5 * a, 0.14 * L, 0.014 * L], [-0.3 * a, -by * 0.8, 0], yellow, "#ff9a1f", [0, 0, 0.35]);
  f.fin([0.16 * L, 0.17 * L, 0.014 * L], [-a - 0.08 * L, 0, 0], "#ffe98a", "#ff9a1f");
  for (const s of [1, -1]) f.fin([0.08 * L, 0.04 * L, 0.01 * L], [0.15 * a, -0.2 * by, s * bz * 0.97], "#ffe98a", null, [s * 0.5, s * 0.4, -0.5]);
  f.eyes(0.52 * a, 0.08 * by, bz * 0.82, 0.062 * L);
  f.blush(0.25 * a, -0.35 * by, bz * 0.92, 0.035 * L);
  return f.build();
}

function pufferfish(L: number) {
  const f = new FishBuilder();
  const r = L * 0.42;
  f.ell([r * 1.1, r, r * 0.95], [0, 0, 0], "#f6f1e4", [0, 0, 0], 22);
  // A creamy-yellow belly and brown spots.
  f.ell([r * 0.95, r * 0.6, r * 0.85], [0, -r * 0.42, 0], "#fbe7a1", [0, 0, 0], 16);
  let seed = 5;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const b = rnd() * Math.PI * 0.6 + 0.15;
    const p: [number, number, number] = [Math.cos(a) * Math.sin(b) * r * 1.1, Math.cos(b) * r * 0.98, Math.sin(a) * Math.sin(b) * r * 0.95];
    if (p[0] > r * 0.6) continue;
    f.ell([r * 0.12, r * 0.12, r * 0.12], p, "#a07a4a", [0, 0, 0], 8);
  }
  // Little spikes all over (they stand out when it puffs up).
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const b = rnd() * Math.PI;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b));
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    const at: [number, number, number] = [dir.x * r * 1.08, dir.y * r * 0.98, dir.z * r * 0.93];
    f.b.add(new THREE.ConeGeometry(r * 0.06, r * 0.18, 5), "#e8dcc0", at, [e.x, e.y, e.z], [1, 1, 1], { vary: false });
  }
  f.fin([0.12 * L, 0.12 * L, 0.012 * L], [-r * 1.1 - 0.04 * L, 0, 0], "#f1e4c4", "#a07a4a");
  for (const s of [1, -1]) f.fin([0.07 * L, 0.05 * L, 0.012 * L], [r * 0.2, -r * 0.1, s * r * 0.92], "#f1e4c4", null, [s * 0.4, s * 0.4, -0.4]);
  f.eyes(r * 0.62, r * 0.25, r * 0.66, 0.085 * L);
  f.blush(r * 0.55, -r * 0.15, r * 0.8, 0.045 * L);
  f.ell([0.05 * L, 0.045 * L, 0.05 * L], [r * 1.08, -r * 0.1, 0], "#ff8fa3", [0, 0, 0], 10);
  return f.build();
}

/** Built upright: y is up the body, the snout points +x. */
function seahorse(L: number) {
  const f = new FishBuilder();
  const pink = "#ff8fb8";
  const light = "#ffc2d9";
  // An S-shaped body of overlapping beads, the tail curling forward at the bottom.
  const spine: [number, number, number][] = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    spine.push([Math.sin(t * Math.PI * 1.1) * L * 0.08 - L * 0.02, L * (0.32 - t * 0.62), 0]);
  }
  spine.forEach((p, i) => {
    const r = L * (0.11 - i * 0.008);
    f.ell([r, r * 0.9, r * 0.8], p, i % 2 ? pink : "#ff9cc2", [0, 0, 0], 12);
  });
  // The curled tail.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 1.4;
    f.ell([L * 0.03, L * 0.03, L * 0.025], [L * 0.03 + Math.sin(a) * L * 0.07, -L * 0.33 + Math.cos(a) * L * 0.07 - L * 0.07, 0], pink, [0, 0, 0], 8);
  }
  // Head, crest, long snout.
  f.ell([L * 0.11, L * 0.1, L * 0.085], [0, L * 0.38, 0], pink, [0, 0, 0], 14);
  f.b.add(new THREE.CylinderGeometry(L * 0.035, L * 0.05, L * 0.2, 10), pink, [L * 0.15, L * 0.35, 0], [0, 0, Math.PI / 2 + 0.25], [1, 1, 1], { vary: false });
  f.ell([L * 0.04, L * 0.05, L * 0.04], [L * 0.25, L * 0.32, 0], "#ff6f9f", [0, 0, 0], 8);
  f.b.add(new THREE.ConeGeometry(L * 0.04, L * 0.09, 6), light, [-L * 0.02, L * 0.49, 0], [0, 0, 0.3], [1, 1, 1], { vary: false });
  // Belly ridges and the little back fin.
  for (let i = 1; i < 7; i++) f.ell([L * 0.02, L * 0.012, L * 0.07], [spine[i][0] + L * 0.09, spine[i][1], 0], light, [0, 0, 0], 6);
  f.fin([0.07 * L, 0.06 * L, 0.01 * L], [-L * 0.11, L * 0.05, 0], "#ffd6e6", null);
  f.eyes(L * 0.05, L * 0.4, L * 0.06, 0.05 * L);
  return f.build();
}

/** The jellyfish's bell and tentacles (drawn with its own see-through material). */
function jellyfish(L: number) {
  const b = new PartBuilder(0);
  const r = L * 0.5;
  b.add(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), "#c38bff", [0, 0, 0], [0, 0, 0], [1, 0.85, 1], { vary: false });
  b.add(new THREE.SphereGeometry(r * 0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), "#f0d6ff", [0, -r * 0.02, 0], [0, 0, 0], [1, 0.7, 1], { vary: false });
  // A rim, frilly arms in the middle, long thin tentacles round the edge.
  b.add(new THREE.TorusGeometry(r * 0.98, r * 0.06, 5, 20), "#a86bff", [0, -r * 0.05, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { vary: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.add(new THREE.SphereGeometry(1, 8, 6), "#e0b8ff", [Math.cos(a) * r * 0.2, -r * 0.7, Math.sin(a) * r * 0.2], [0, a, 0.1], [r * 0.12, r * 0.7, r * 0.05], { vary: false });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.add(new THREE.CylinderGeometry(r * 0.025, r * 0.012, r * 1.9, 4), "#d9a8ff", [Math.cos(a) * r * 0.85, -r * 1.0, Math.sin(a) * r * 0.85], [0, 0, 0], [1, 1, 1], { vary: false });
  }
  // Cute face on the front of the bell.
  for (const x of [-1, 1]) b.add(new THREE.SphereGeometry(r * 0.09, 8, 6), "#3a1a5a", [x * r * 0.28, r * 0.25, r * 0.78], [0, 0, 0], [1, 1.2, 0.6], { vary: false });
  b.add(new THREE.TorusGeometry(r * 0.12, r * 0.025, 4, 10, Math.PI), "#3a1a5a", [0, r * 0.12, r * 0.84], [0, 0, Math.PI], [1, 1, 1], { vary: false });
  const g = b.build();
  return g;
}

export interface TurtleModel {
  body: THREE.BufferGeometry;
  /** A front flipper (pivot at the shoulder, reaching +z); mirrored for the other side. */
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
}

function turtle(L: number): TurtleModel {
  const f = new FishBuilder();
  const a = L * 0.42;
  // Shell with scutes, a cream plastron underneath, head and tail.
  f.ell([a, L * 0.16, a * 0.82], [0, 0.02 * L, 0], "#3f9b5b", [0, 0, 0], 22);
  f.ell([a * 0.94, L * 0.08, a * 0.78], [0, -0.06 * L, 0], "#f0e2b0", [0, 0, 0], 18);
  const scutes: [number, number][] = [
    [0, 0],
    [0.45, 0],
    [-0.45, 0],
    [0.2, 0.45],
    [-0.2, 0.45],
    [0.2, -0.45],
    [-0.2, -0.45]
  ];
  for (const [x, z] of scutes) {
    const k = Math.sqrt(Math.max(0.15, 1 - x * x - z * z * 0.8));
    f.ell([a * 0.22, L * 0.035, a * 0.2], [x * a, L * 0.02 + L * 0.155 * k, z * a * 0.82], "#2e7d45", [0, 0, 0], 10);
  }
  f.ell([L * 0.12, L * 0.1, L * 0.1], [a + L * 0.09, L * 0.01, 0], "#9ccf6a", [0, 0, 0], 14);
  f.ell([L * 0.05, L * 0.04, L * 0.03], [-a - L * 0.03, -L * 0.01, 0], "#8bc35e", [0, 0, 0], 8);
  f.eyes(a + L * 0.15, L * 0.05, L * 0.065, 0.035 * L);
  f.b.add(new THREE.TorusGeometry(L * 0.025, L * 0.007, 4, 10, Math.PI), "#2d5a1e", [a + L * 0.2, -L * 0.015, 0], [Math.PI / 2, 0, Math.PI], [1, 1, 1], { vary: false });
  const body = f.build();
  const flipper = (len: number) => {
    const b = new PartBuilder(0);
    b.add(new THREE.SphereGeometry(1, 12, 8), "#86c25a", [len * 0.12, 0, len * 0.5], [0, -0.35, 0], [len * 0.22, len * 0.06, len * 0.5], { vary: false });
    const g = b.build();
    return g;
  };
  return { body, front: flipper(L * 0.5), back: flipper(L * 0.26) };
}

const cache = new Map<SpeciesId, THREE.BufferGeometry>();

export function fishGeometry(s: SpeciesId): THREE.BufferGeometry {
  let g = cache.get(s);
  if (!g) {
    const L = SPECIES[s].length;
    switch (s) {
      case "clownfish":
        g = clownfish(L);
        break;
      case "bluetang":
        g = blueTang(L);
        break;
      case "yellowfish":
        g = yellowFish(L);
        break;
      case "pufferfish":
        g = pufferfish(L);
        break;
      case "seahorse":
        g = seahorse(L);
        break;
      case "jellyfish":
        g = jellyfish(L);
        break;
      default:
        g = turtleModel().body;
    }
    cache.set(s, g);
  }
  return g;
}

let turtleCache: TurtleModel | null = null;
export function turtleModel(): TurtleModel {
  if (!turtleCache) turtleCache = turtle(SPECIES.turtle.length);
  return turtleCache;
}
