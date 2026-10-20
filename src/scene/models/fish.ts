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
    g.computeVertexNormals();
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

const cache = new Map<SpeciesId, THREE.BufferGeometry>();

export function fishGeometry(s: SpeciesId): THREE.BufferGeometry {
  let g = cache.get(s);
  if (!g) {
    const L = SPECIES[s].length;
    g = s === "clownfish" ? clownfish(L) : s === "bluetang" ? blueTang(L) : yellowFish(L);
    cache.set(s, g);
  }
  return g;
}
