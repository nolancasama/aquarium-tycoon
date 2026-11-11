import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Small decorative fish for the hub display tank and the outdoor schools
 * (not the main aquarium's English-task fish, which live in models/fish.ts).
 *
 * Each kind is one low-poly procedural shape, length 1 along +z (nose at +0.5,
 * tail tips at -0.5), drawn as one InstancedMesh per kind. Per vertex `aFish`
 * carries (tone: belly 0 .. back 1, s: nose 0 .. tail 1, part); per instance
 * the main colour is `instanceColor` and `iFish` carries (accent rgb, phase).
 * The vertex shader swings the rear body and tail; the fragment shader adds
 * countershading, accent fins and dark eyes with a pale ring.
 */

export type SmallFishKind = "sardine" | "snapper" | "chromis" | "tang" | "wrasse";
export const SMALL_FISH_KINDS: SmallFishKind[] = ["sardine", "snapper", "chromis", "tang", "wrasse"];

const PART = { body: 0, fin: 1, eye: 2, ring: 3, tail: 4 } as const;

interface Shape {
  /** [s, half height, half width, centre y] along the body (s 0 nose .. peduncle). */
  body: [number, number, number, number][];
  tail: "forked" | "lunate" | "round";
  /** Tail fin half height at its tips. */
  tailH: number;
  /** Dorsal fin: start s, end s, peak height above the back. */
  dorsal: [number, number, number];
  /** Anal fin (below), same form; null for none. */
  anal: [number, number, number] | null;
  eye: number;
}

// Body stations end at the caudal peduncle (s ≈ 0.78); the tail fin spans the rest.
const SHAPES: Record<SmallFishKind, Shape> = {
  // Slim silver schooling fish: pointed snout, deep forked tail.
  sardine: {
    body: [[0, 0.006, 0.004, -0.004], [0.06, 0.05, 0.034, 0], [0.18, 0.085, 0.055, 0.004], [0.36, 0.09, 0.056, 0.006], [0.58, 0.06, 0.036, 0.004], [0.78, 0.022, 0.012, 0.002]],
    tail: "forked", tailH: 0.12, dorsal: [0.36, 0.52, 0.05], anal: [0.6, 0.7, 0.03], eye: 0.022
  },
  // A small snapper / grunt: deeper body, slightly forked tail.
  snapper: {
    body: [[0, 0.01, 0.006, -0.01], [0.07, 0.08, 0.045, 0], [0.2, 0.135, 0.07, 0.01], [0.4, 0.14, 0.068, 0.012], [0.62, 0.085, 0.04, 0.006], [0.78, 0.035, 0.016, 0.002]],
    tail: "forked", tailH: 0.13, dorsal: [0.18, 0.66, 0.07], anal: [0.55, 0.7, 0.05], eye: 0.028
  },
  // A chromis / damselfish: tall, short, deeply forked tail.
  chromis: {
    body: [[0, 0.012, 0.008, -0.01], [0.07, 0.11, 0.05, 0], [0.22, 0.19, 0.07, 0.01], [0.42, 0.18, 0.064, 0.012], [0.64, 0.1, 0.036, 0.006], [0.78, 0.04, 0.016, 0.002]],
    tail: "forked", tailH: 0.17, dorsal: [0.16, 0.7, 0.08], anal: [0.5, 0.72, 0.07], eye: 0.034
  },
  // A tang: a tall disc, long dorsal and anal fins, a crescent tail.
  tang: {
    body: [[0, 0.02, 0.008, -0.02], [0.06, 0.15, 0.04, 0], [0.2, 0.27, 0.055, 0.01], [0.42, 0.27, 0.052, 0.01], [0.64, 0.15, 0.034, 0.005], [0.78, 0.045, 0.014, 0.002]],
    tail: "lunate", tailH: 0.2, dorsal: [0.12, 0.74, 0.07], anal: [0.3, 0.74, 0.06], eye: 0.036
  },
  // A wrasse: long and cigar-shaped, a rounded tail.
  wrasse: {
    body: [[0, 0.01, 0.008, -0.006], [0.07, 0.06, 0.042, 0], [0.22, 0.085, 0.055, 0.004], [0.46, 0.08, 0.05, 0.004], [0.66, 0.055, 0.034, 0.002], [0.78, 0.03, 0.016, 0]],
    tail: "round", tailH: 0.085, dorsal: [0.18, 0.72, 0.035], anal: [0.5, 0.72, 0.03], eye: 0.022
  }
};

const zOf = (s: number) => 0.5 - s;

function station(shape: Shape, s: number): [number, number, number] {
  const b = shape.body;
  for (let i = 1; i < b.length; i++) {
    if (s <= b[i][0]) {
      const k = (s - b[i - 1][0]) / (b[i][0] - b[i - 1][0]);
      return [1, 2, 3].map((j) => b[i - 1][j] + (b[i][j] - b[i - 1][j]) * k) as [number, number, number];
    }
  }
  const l = b[b.length - 1];
  return [l[1], l[2], l[3]];
}

/** A piece with positions, the aFish attribute and (indexed) triangles. */
function piece(pos: number[], fish: number[], index: number[], smooth: boolean) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aFish", new THREE.Float32BufferAttribute(fish, 3));
  g.setIndex(index);
  if (smooth) g.computeVertexNormals();
  else {
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    // Re-index trivially so every piece merges as indexed geometry.
    flat.setIndex(Array.from({ length: flat.getAttribute("position").count }, (_, i) => i));
    return flat;
  }
  return g;
}

/** Two-sided flat fin from a polygon fan (points in the y-z plane at x). */
function fin(points: [number, number][], x: number, s0: number, part: number) {
  const pos: number[] = [], fish: number[] = [], index: number[] = [];
  for (const [z, y] of points) {
    pos.push(x, y, z);
    fish.push(y > 0 ? 1 : 0, 0.5 - z, part);
  }
  for (let i = 1; i < points.length - 1; i++) index.push(0, i, i + 1, 0, i + 1, i);
  void s0;
  return piece(pos, fish, index, false);
}

function body(shape: Shape) {
  const SEG = 8, stations: number[] = [];
  for (let s = 0; s <= 0.78 + 1e-6; s += 0.039) stations.push(Math.min(0.78, s));
  const pos: number[] = [], fish: number[] = [], index: number[] = [];
  stations.forEach((s, i) => {
    const [h, w, cy] = station(shape, s);
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const y = Math.cos(a), x = Math.sin(a);
      pos.push(x * w, cy + y * h, zOf(s));
      fish.push((y + 1) / 2, s, PART.body);
    }
    if (i > 0) {
      const r0 = (i - 1) * SEG, r1 = i * SEG;
      for (let k = 0; k < SEG; k++) {
        const k1 = (k + 1) % SEG;
        index.push(r0 + k, r1 + k, r1 + k1, r0 + k, r1 + k1, r0 + k1);
      }
    }
  });
  // Snout cap and peduncle cap.
  const nose = pos.length / 3;
  pos.push(0, station(shape, 0)[2], 0.5 + 0.01);
  fish.push(0.5, 0, PART.body);
  for (let k = 0; k < SEG; k++) index.push(nose, (k + 1) % SEG, k);
  const last = (stations.length - 1) * SEG, tip = pos.length / 3;
  pos.push(0, station(shape, 0.78)[2], zOf(0.79));
  fish.push(0.5, 0.79, PART.body);
  for (let k = 0; k < SEG; k++) index.push(tip, last + k, last + (k + 1) % SEG);
  return piece(pos, fish, index, true);
}

function tail(shape: Shape) {
  const root = zOf(0.775), end = -0.5, H = shape.tailH, ph = station(shape, 0.78)[0] * 0.9;
  let pts: [number, number][];
  if (shape.tail === "forked") pts = [[root, 0], [root, ph], [end, H], [root - (end - root) * -0.5, 0], [end, -H], [root, -ph]];
  else if (shape.tail === "lunate") pts = [[root, 0], [root, ph], [end - 0.01, H], [end + 0.07, H * 0.35], [end + 0.09, 0], [end + 0.07, -H * 0.35], [end - 0.01, -H], [root, -ph]];
  else pts = [[root, 0], [root, ph], ...Array.from({ length: 7 }, (_, i) => {
    const a = Math.PI / 2 - (i / 6) * Math.PI;
    return [root + (end - root) * (0.55 + 0.45 * Math.cos(a)), Math.sin(a) * H] as [number, number];
  }), [root, -ph]];
  // A fan from the root centre; for the fork the notch point bends the fan inward.
  const g = fin(pts, 0, 0.78, PART.tail);
  const f = g.getAttribute("aFish");
  // s along the tail fin: 0.78 at the root .. 1 at the tips.
  const p = g.getAttribute("position");
  for (let i = 0; i < f.count; i++) f.setY(i, 0.5 - p.getZ(i));
  return g;
}

function dorsal(shape: Shape, which: "dorsal" | "anal") {
  const d = which === "dorsal" ? shape.dorsal : shape.anal;
  if (!d) return null;
  const [s0, s1, peak] = d, sign = which === "dorsal" ? 1 : -1;
  const edge = (s: number) => { const [h, , cy] = station(shape, s); return cy + sign * h * 0.92; };
  const sm = s0 + (s1 - s0) * (which === "dorsal" ? 0.3 : 0.4);
  const pts: [number, number][] = [
    [zOf(s0), edge(s0)], [zOf(sm), edge(sm) + sign * peak], [zOf(s1), edge(s1) + sign * peak * 0.35], [zOf(s1 + 0.02), edge(s1 + 0.02)]
  ];
  return fin(pts, 0, s0, PART.fin);
}

function pectorals(shape: Shape) {
  const s = 0.24, [h, w, cy] = station(shape, s), parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * w * 0.95, y = cy - h * 0.25, L = 0.09 + h * 0.25;
    const pos = [x, y, zOf(s), x + side * L * 0.45, y - L * 0.35, zOf(s) - L, x + side * L * 0.15, y + L * 0.12, zOf(s) - L * 0.9];
    const fish = [0.4, s, PART.fin, 0.3, s + 0.1, PART.fin, 0.5, s + 0.1, PART.fin];
    parts.push(piece(pos, fish, [0, 1, 2, 0, 2, 1], false));
  }
  return parts;
}

function eyes(shape: Shape) {
  const s = 0.1, [h, w, cy] = station(shape, s), r = shape.eye, parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (const [part, rr, out] of [[PART.ring, r * 1.35, 0.002], [PART.eye, r, 0.006]] as const) {
      const g = new THREE.SphereGeometry(rr, 6, 4).scale(0.35, 1, 1);
      g.translate(side * (w * 0.92 + out), cy + h * 0.28, zOf(s));
      const n = g.getAttribute("position").count;
      g.setAttribute("aFish", new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [0.6, s, part]).flat(), 3));
      g.deleteAttribute("uv");
      parts.push(g);
    }
  }
  return parts;
}

const cache = new Map<SmallFishKind, THREE.BufferGeometry>();

/** The shared base shape for a kind (do not dispose; clone it to add instance attributes). */
export function smallFishGeometry(kind: SmallFishKind): THREE.BufferGeometry {
  const hit = cache.get(kind);
  if (hit) return hit;
  const shape = SHAPES[kind];
  const parts = [body(shape), tail(shape), dorsal(shape, "dorsal"), dorsal(shape, "anal"), ...pectorals(shape), ...eyes(shape)].filter(Boolean) as THREE.BufferGeometry[];
  const merged = mergeGeometries(parts.map((g) => (g.index ? g : (g.setIndex(Array.from({ length: g.getAttribute("position").count }, (_, i) => i)), g))));
  parts.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  cache.set(kind, merged);
  return merged;
}

export interface SmallFishLook {
  /** Main (back / flank) colour. */
  color: string;
  /** Fins and tail accent. */
  accent: string;
}

export interface SmallFishMesh {
  mesh: THREE.InstancedMesh;
  dispose(): void;
}

/** Time for the tail beat, shared by every small-fish material (advance it in one useFrame). */
export const smallFishTime = { value: 0 };

/**
 * Countershaded instanced fish. `silver` lightens the belly toward a mirror-like
 * silver (schooling fish); reef fish keep more of their colour underneath.
 */
export function smallFishMaterial(silver = 0.7): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: "#ffffff", side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFishTime = smallFishTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec3 aFish;
attribute vec4 iFish;
uniform float uFishTime;
varying vec3 vFish;
varying vec3 vAccent;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vFish = aFish;
vAccent = iFish.rgb;
// Tail beat: the rear body and the tail swing sideways, more toward the tail.
float bend = smoothstep(0.22, 1.0, aFish.y);
float beat = sin(uFishTime * 9.0 + iFish.a * 6.2831 - aFish.y * 4.5);
transformed.x += beat * bend * bend * 0.075;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vFish;
varying vec3 vAccent;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 main = diffuseColor.rgb;
  float part = vFish.z;
  vec3 belly = mix(main, vec3(0.93, 0.95, 0.96), ${silver.toFixed(2)});
  vec3 c = mix(belly, main * 0.88, smoothstep(0.32, 0.72, vFish.x));
  if (part > 3.5) c = vAccent;
  else if (part > 2.5) c = vec3(0.92, 0.88, 0.7);
  else if (part > 1.5) c = vec3(0.03, 0.03, 0.05);
  else if (part > 0.5) c = mix(main, vAccent, 0.7);
  diffuseColor.rgb = c;
}`);
  };
  mat.customProgramCacheKey = () => `small-fish-${silver.toFixed(2)}`;
  return mat;
}

/** An InstancedMesh of `looks.length` fish of one kind, with colours and phases set. */
export function smallFishMesh(kind: SmallFishKind, looks: SmallFishLook[], material: THREE.Material): SmallFishMesh {
  const geo = smallFishGeometry(kind).clone();
  const data = new Float32Array(looks.length * 4), c = new THREE.Color();
  looks.forEach((l, i) => {
    c.set(l.accent);
    data.set([c.r, c.g, c.b, (i * 0.618) % 1], i * 4);
  });
  geo.setAttribute("iFish", new THREE.InstancedBufferAttribute(data, 4));
  const mesh = new THREE.InstancedMesh(geo, material, looks.length);
  looks.forEach((l, i) => mesh.setColorAt(i, c.set(l.color)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.raycast = () => undefined;
  return { mesh, dispose: () => geo.dispose() };
}
