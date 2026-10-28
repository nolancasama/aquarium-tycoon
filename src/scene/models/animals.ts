import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { SPECIES } from "../../game/data/fish";
import type { SpeciesId } from "../../game/types";

type V3 = [number, number, number];
type Wave = (x: number, y: number, z: number, u: number) => V3;

/** All dimensions below are body lengths. One merged, vertex-coloured mesh per
 * animal; a wave attribute identifies flexible parts without bones or textures. */
class AnimalBuilder {
  private parts = new PartBuilder(0);

  add(g: THREE.BufferGeometry, colour: string, pos: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rot: V3 = [0, 0, 0], kind = 0, wave?: Wave) {
    const p = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    const a = new Float32Array(p.count * 4);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      const w = wave?.(v.x, v.y, v.z, uv ? uv.getX(i) : 0) ?? [0, 0, 0];
      a.set([kind, ...w], i * 4);
    }
    g.setAttribute("wave", new THREE.BufferAttribute(a, 4));
    this.parts.add(g, colour, pos, rot, scale, { vary: false });
    return this;
  }

  ell(scale: V3, pos: V3, colour: string, kind = 0, wave?: Wave, seg = 10, rot: V3 = [0, 0, 0]) {
    return this.add(new THREE.SphereGeometry(1, seg, 6), colour, pos, scale, rot, kind, wave);
  }

  tube(points: V3[], radius: number, colour: string, kind = 0, phase = 0, segments = 10, sides = 5, taper = 0.8) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, segments, radius, sides, false);
    // Taper the tube around its centreline, preserving its smooth normals.
    const p = g.getAttribute("position"), uv = g.getAttribute("uv");
    const c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const t = uv.getX(i);
      curve.getPoint(t, c);
      // Spotted jellies have thick oral arms with a scalloped, frilly outline.
      const frill = kind === 8 && radius > 0.04 ? 1 + Math.sin(t * Math.PI * 12) * 0.24 : 1;
      const k = (1 - t * taper) * frill;
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
    return this.add(g, colour, [0, 0, 0], [1, 1, 1], [0, 0, 0], kind, (_x, _y, _z, u) => [u, phase, 0]);
  }

  /** Thin closed triangular fins retain a clear silhouette from either side. */
  fin(a: V3, b: V3, c: V3, colour: string, kind = 1) {
    const g = new THREE.BufferGeometry();
    const vertices: number[] = [];
    for (const sign of [1, -1]) for (const p of sign === 1 ? [a, b, c] : [c, b, a]) vertices.push(p[0], p[1], p[2] + sign * 0.006);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      vertices.push(u[0], u[1], u[2] - 0.006, v[0], v[1], v[2] - 0.006, v[0], v[1], v[2] + 0.006,
        u[0], u[1], u[2] - 0.006, v[0], v[1], v[2] + 0.006, u[0], u[1], u[2] + 0.006);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    return this.add(g, colour, [0, 0, 0], [1, 1, 1], [0, 0, 0], kind, x => [Math.max(0, 0.3 - x), 0, 0]);
  }

  eyes(x: number, y: number, z: number, r: number, tiny = false) {
    for (const side of [-1, 1]) {
      this.add(new THREE.SphereGeometry(1, tiny ? 6 : 8, tiny ? 4 : 6), "#fffefa", [x, y, side * z], [r, r, r * 0.68]);
      this.add(new THREE.SphereGeometry(1, tiny ? 6 : 8, tiny ? 4 : 6), "#183342", [x + r * 0.17, y, side * (z + r * 0.53)], [r * 0.56, r * 0.62, r * 0.28]);
      this.add(new THREE.SphereGeometry(1, tiny ? 4 : 6, tiny ? 3 : 6), "#ffffff", [x + r * 0.28, y + r * 0.26, side * (z + r * 0.76)], [r * 0.2, r * 0.2, r * 0.12]);
    }
    return this;
  }

  build(length: number) {
    const g = this.parts.build();
    g.scale(length, length, length);
    g.computeBoundingSphere();
    // Conservative shader envelope, including trailing fins and curled arms.
    if (g.boundingSphere) g.boundingSphere.radius += length * 0.18;
    g.userData.triangles = g.getAttribute("position").count / 3;
    return g;
  }
}

const fishWave: Wave = x => [Math.max(0, 0.3 - x), 0, 0];

function angel() {
  const b = new AnimalBuilder();
  b.ell([0.39, 0.42, 0.11], [0.02, 0, 0], "#9854dd", 1, fishWave, 16);
  for (const side of [-1, 1]) {
    b.fin([0.15, side * 0.27, 0], [-0.1, side * 0.78, 0], [-0.48, side * 0.12, 0], "#713aba");
    b.tube([[-0.1, side * 0.7, 0], [-0.35, side * 0.87, 0], [-0.69, side * 0.88, 0]], 0.014, "#efd366", 1, 0, 7, 4);
    b.fin([-0.33, 0, 0], [-0.62, side * 0.21, 0], [-0.53, 0, 0], "#bd80eb");
  }
  b.eyes(0.28, 0.07, 0.082, 0.071);
  b.ell([0.035, 0.022, 0.041], [0.399, -0.04, 0], "#ecb8e7");
  return b;
}

function goby() {
  const b = new AnimalBuilder();
  b.ell([0.47, 0.16, 0.14], [0, -0.24, 0], "#fff6e8", 1, fishWave, 16);
  b.fin([0.2, -0.13, 0], [0.12, 0.37, 0], [-0.02, -0.13, 0], "#ffb063");
  b.fin([-0.06, -0.13, 0], [-0.15, 0.04, 0], [-0.38, -0.15, 0], "#f06568");
  b.ell([0.13, 0.19, 0.025], [-0.51, -0.24, 0], "#e8455b", 1, fishWave);
  for (const side of [-1, 1]) b.ell([0.15, 0.025, 0.12], [0.08, -0.41, side * 0.11], "#ffe0bb", 1, fishWave);
  b.eyes(0.29, -0.1, 0.11, 0.091);
  return b;
}

function chromis() {
  const b = new AnimalBuilder();
  b.ell([0.38, 0.22, 0.1], [0.05, 0, 0], "#43dfbf", 1, fishWave, 12);
  for (const s of [-1, 1]) {
    b.fin([-0.29, 0, 0], [-0.57, s * 0.25, 0], [-0.49, s * 0.015, 0], "#2089b6");
    b.fin([0.13, s * 0.13, 0], [-0.07, s * 0.31, 0], [-0.28, s * 0.1, 0], "#6cf3b3");
  }
  b.eyes(0.28, 0.045, 0.075, 0.077, true);
  return b;
}

function eel() {
  const b = new AnimalBuilder();
  b.tube([[0, -0.005, 0], [-0.19, -0.005, 0], [-0.39, -0.018, 0.014], [-0.63, -0.026, -0.015], [-0.88, -0.02, 0]], 0.067, "#84ab41", 2, 0, 28, 8, 0.94);
  b.ell([0.081, 0.041, 0.056], [-0.012, 0.026, 0], "#9cb951", 0, undefined, 12);
  b.ell([0.072, 0.023, 0.047], [-0.012, -0.046, 0], "#83a33e", 0, undefined, 10, [0, 0, 0.15]);
  b.ell([0.055, 0.022, 0.043], [0.015, -0.009, 0], "#493b38");
  // A continuous dorsal ribbon follows the long S-wave, behind the fixed head.
  for (let i = 0; i < 12; i++) {
    const x = -0.1 - i * 0.055, h = 0.065 * (1 + x);
    b.fin([x, h, 0], [x - 0.07, h * 1.9, 0], [x - 0.09, h * 0.8, 0], "#c3d25c", 2);
  }
  b.eyes(0.012, 0.04, 0.045, 0.027);
  return b;
}

function octopus() {
  const b = new AnimalBuilder();
  b.ell([0.24, 0.3, 0.24], [-0.03, -0.03, 0], "#ec873c", 0, undefined, 16);
  b.ell([0.19, 0.13, 0.22], [0.045, -0.25, 0], "#f6a650");
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const x = Math.cos(a), z = Math.sin(a);
    b.tube([[x * 0.11, -0.22, z * 0.11], [x * 0.29, -0.4, z * 0.29], [x * 0.46, -0.46, z * 0.46], [x * 0.53 + z * 0.07, -0.38, z * 0.53 - x * 0.07]], 0.075, i % 2 ? "#e87538" : "#f4974d", 3, a, 12, 5, 0.87);
    for (let j = 1; j <= 3; j++) b.add(new THREE.CircleGeometry(0.025, 6), "#ffd3a0", [x * (0.18 + j * 0.075), -0.445, z * (0.18 + j * 0.075)], [1, 1, 1], [Math.PI / 2, 0, 0], 3, () => [0.4 + j * 0.13, a, 0]);
  }
  b.eyes(0.15, -0.12, 0.18, 0.09);
  return b;
}

function crab() {
  const b = new AnimalBuilder();
  b.ell([0.28, 0.14, 0.37], [0, -0.28, 0], "#ed663c", 0, undefined, 16);
  b.ell([0.19, 0.08, 0.31], [0.03, -0.35, 0], "#ffae64");
  // Eight jointed legs: alternating phase per leg and opposite side.
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = 0.17 - i * 0.12;
    b.tube([[x, -0.31, s * 0.25], [x - 0.08, -0.29, s * 0.53], [x - 0.18, -0.69, s * 0.66]], 0.037, "#df5635", 4, i * Math.PI + (s < 0 ? Math.PI : 0), 5, 5, 0.55);
  }
  for (const s of [-1, 1]) {
    b.tube([[0.16, -0.28, s * 0.25], [0.37, -0.18, s * 0.42], [0.51, -0.11, s * 0.34]], 0.045, "#ef7542", 4, s, 5, 5, 0);
    b.ell([0.13, 0.09, 0.11], [0.5, -0.09, s * 0.35], "#ff9250");
    for (const pincer of [-1, 1]) b.ell([0.13, 0.043, 0.045], [0.62, -0.09 + pincer * 0.06, s * 0.35], "#ffb46d", 5, () => [1, pincer, 0], 8, [0, 0, pincer * -0.2]);
    b.tube([[0.18, -0.23, s * 0.18], [0.24, -0.07, s * 0.19]], 0.028, "#ee7c49", 0, 0, 2, 5, 0);
  }
  b.eyes(0.26, -0.035, 0.195, 0.073);
  return b;
}

function ray() {
  const b = new AnimalBuilder();
  // Wide, nearly round disc: the wing wave grows continuously toward its tips.
  b.ell([0.4, 0.053, 0.49], [0, -0.02, 0], "#538db2", 6, (_x, _y, z) => [Math.abs(z) / 0.49, 0, 0], 24);
  b.ell([0.27, 0.07, 0.13], [0.08, 0.01, 0], "#699fc0", 6, (_x, _y, z) => [Math.abs(z) * 1.4, 0, 0], 12);
  b.tube([[-0.3, -0.02, 0], [-0.65, -0.015, 0], [-0.93, 0.01, 0.035], [-1.15, 0.03, 0.02]], 0.018, "#375d78", 1, 0, 14, 5, 0.88);
  b.eyes(0.25, 0.075, 0.09, 0.044);
  return b;
}

function jelly(kind: SpeciesId) {
  const b = new AnimalBuilder();
  const moon = kind === "moonjelly", spotted = kind === "spottedjelly";
  const colour = moon ? "#edf6ff" : spotted ? "#66bbec" : "#f7a154";
  // Open hemisphere with a rounded rim; substantially flatter in the moon jelly.
  const height = moon ? 0.14 : spotted ? 0.35 : 0.26;
  b.add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), colour, [0, 0, 0], [0.44, height, 0.44], [0, 0, 0], 7, (_x, y) => [Math.max(0, 1 - y / height), 0, 0]);
  b.add(new THREE.TorusGeometry(0.425, 0.021, 4, 24), colour, [0, 0.006, 0], [1, 1, 1], [Math.PI / 2, 0, 0], 7, () => [1, 0, 0]);
  if (moon) {
    // Four visible horseshoe-shaped gonad rings, rather than generic spots.
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      b.add(new THREE.TorusGeometry(0.082, 0.015, 4, 12, Math.PI * 1.65), "#ef9cc7", [Math.cos(a) * 0.13, 0.108, Math.sin(a) * 0.13], [1, 1, 1], [Math.PI / 2, 0, -a], 7, () => [0.45, 0, 0]);
    }
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, x = Math.cos(a) * 0.415, z = Math.sin(a) * 0.415;
      b.tube([[x, 0, z], [x * 1.02, -0.07, z * 1.02], [x * 0.97, -0.145, z * 0.97]], 0.0045, "#d6e1f4", 8, a, 4, 3, 0.6);
    }
  } else if (spotted) {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      b.tube([[Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], [Math.cos(a + 0.3) * 0.16, -0.19, Math.sin(a + 0.3) * 0.16], [Math.cos(a) * 0.18, -0.39, Math.sin(a) * 0.18]], 0.064, "#c1ddf3", 8, a, 10, 6, 0.35);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, x = Math.cos(a), z = Math.sin(a);
      b.tube([[x * 0.38, 0, z * 0.38], [x * 0.35, -0.38, z * 0.35], [x * 0.27, -0.8, z * 0.27], [x * 0.34, -1.2, z * 0.34]], 0.008, "#86394e", 8, a, 12, 4, 0.6);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      b.tube([[Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], [Math.cos(a + 0.6) * 0.1, -0.25, Math.sin(a + 0.6) * 0.1], [Math.cos(a) * 0.12, -0.56, Math.sin(a) * 0.12]], 0.035, "#e8a476", 8, a, 8, 4, 0.4);
    }
  }
  // Friendly eyes on the front of the bell are visible through its soft surface.
  b.eyes(0.27, height * 0.36, 0.24, 0.045);
  return b;
}

const geometries = new Map<SpeciesId, THREE.BufferGeometry>();

export function animalGeometry(species: SpeciesId): THREE.BufferGeometry {
  const cached = geometries.get(species);
  if (cached) return cached;
  let builder: AnimalBuilder;
  switch (species) {
    case "angelfish": builder = angel(); break;
    case "goby": builder = goby(); break;
    case "chromis": builder = chromis(); break;
    case "eel": builder = eel(); break;
    case "octopus": builder = octopus(); break;
    case "crab": builder = crab(); break;
    case "stingray": builder = ray(); break;
    case "moonjelly": case "spottedjelly": case "seanettle": builder = jelly(species); break;
    default: throw new Error(`No expansion animal geometry for ${species}`);
  }
  const g = builder.build(SPECIES[species].length);
  // For animals on the sand the runtime point is floor + radius + 3 cm.
  if (species === "goby" || species === "octopus" || species === "crab") {
    g.computeBoundingBox();
    const foot = -(SPECIES[species].radius + 0.03);
    g.translate(0, foot - g.boundingBox!.min.y, 0);
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += SPECIES[species].length * 0.18;
  }
  geometries.set(species, g);
  return g;
}
