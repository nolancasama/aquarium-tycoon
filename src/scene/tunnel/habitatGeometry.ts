import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { wreckGeometry } from "./wreckGeometry";
import type { Obstacle } from "../../game/tunnel/contract";
import type { TunnelDecorKind } from "../../game/types";
import {
  CHAMBER, HABITAT, MOUTHS, placeObstacle, placePoint, seabedY, TUBE, TUNNEL_LOBBY, TUNNEL_ROCKS, TUNNEL_STRUCTURES, TUNNEL_ZONES, WALKWAY_SAMPLES, walkwayLength
} from "../../game/data/sharkTunnel";

/**
 * Geometry for the Shark Tunnel habitat. Static parts are merged per material
 * (a handful of draw calls for the whole attraction). Rocks and structures are
 * drawn from their collision solids, slightly inset, so what a child sees is
 * what the sharks swim around.
 */

// ------------------------------------------------------------------ noise

function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth value noise, roughly 0..1. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  let out = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const weight = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    out += hash(ix + dx, iy + dy, iz + dz) * weight;
  }
  return out;
}

// ------------------------------------------------------------------ colour helpers

type Paint = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;

/** Gives a non-indexed geometry per-vertex colours from a paint function (world space). */
function paint(g: THREE.BufferGeometry, fn: Paint): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    nn.fromBufferAttribute(n, i);
    const c = fn(v, nn);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return geo;
}

const scratch = new THREE.Color();
const ROCK_A = new THREE.Color("#93a297"), ROCK_B = new THREE.Color("#5f7275"), MOSS = new THREE.Color("#86b672");
const CORAL_TINTS = ["#ff8a73", "#f5b83d", "#c56fd6", "#ff6f91", "#6fd3c4"].map((c) => new THREE.Color(c));
/** Rock with darker crevices and greenish growth on top faces. */
const rockPaint = (base?: THREE.Color): Paint => (p, n) => {
  const k = noise3(p.x * 0.9, p.y * 0.9, p.z * 0.9);
  scratch.copy(base ?? ROCK_A).lerp(ROCK_B, 0.55 * (1 - k));
  if (n.y > 0.45) scratch.lerp(MOSS, Math.min(0.55, (n.y - 0.45) * 1.4) * noise3(p.x * 0.6 + 9, p.y * 0.6, p.z * 0.6));
  return scratch;
};

// ------------------------------------------------------------------ rocks from solids

/** A lumpy rock filling (slightly inside) one collision solid. */
export function solidRock(o: Obstacle, paintFn: Paint = rockPaint(), detail = 1): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  const m = new THREE.Matrix4();
  if (o.kind === "sphere") {
    g = new THREE.IcosahedronGeometry(o.r, detail);
    m.makeTranslation(o.c.x, o.c.y, o.c.z);
  } else if (o.kind === "capsule") {
    const a = new THREE.Vector3(o.a.x, o.a.y, o.a.z), b = new THREE.Vector3(o.b.x, o.b.y, o.b.z);
    const len = a.distanceTo(b);
    g = new THREE.CapsuleGeometry(o.r, Math.max(0.01, len), 3 + detail, 8 + detail * 2);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  } else {
    g = new THREE.BoxGeometry(o.half.x * 2, o.half.y * 2, o.half.z * 2, 4 + detail * 2, 3 + detail, 4 + detail * 2);
    m.compose(new THREE.Vector3(o.c.x, o.c.y, o.c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw ?? 0), new THREE.Vector3(1, 1, 1));
  }
  // Inset lumps: every vertex moves inward by 3-14% of the local size, never outward.
  const p = g.attributes.position;
  const size = o.kind === "box" ? Math.min(o.half.x, o.half.y, o.half.z) : o.r;
  const v = new THREE.Vector3(), centre = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = noise3(v.x * 1.7 + 3, v.y * 1.7, v.z * 1.7 + 7);
    if (o.kind === "box") {
      // Round the corners toward the centre and pit the faces.
      const s = 1 - (0.04 + 0.1 * k) * size / Math.max(0.2, v.length());
      v.multiplyScalar(Math.max(0.78, s));
    } else {
      centre.set(0, o.kind === "capsule" ? THREE.MathUtils.clamp(v.y, -1e9, 1e9) : 0, 0);
      if (o.kind === "capsule") {
        // Push radially toward the capsule axis only.
        const r = Math.hypot(v.x, v.z), inset = (0.05 + 0.22 * k) * o.r;
        if (r > 1e-4) { v.x *= (r - inset) / r; v.z *= (r - inset) / r; }
        if (Math.abs(v.y) > Math.abs(v.length()) * 0.9) v.y *= 0.97;
      } else {
        // Faceted boulders: strong inward noise, slightly flattened, never beyond the solid.
        const k2 = noise3(v.x * 3.1 + 11, v.y * 3.1, v.z * 3.1);
        v.multiplyScalar(1 - (0.06 + 0.2 * k + 0.08 * k2));
        v.y *= 0.82 + 0.15 * k2;
      }
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.applyMatrix4(m);
  return paint(g, paintFn);
}

/** Small coral heads on top of a solid (they sit inside its upper skin). */
function coralOn(o: Obstacle, count: number, seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const h1 = hash(seed, i, 1), h2 = hash(seed, i, 2), h3 = hash(seed, i, 3);
    let x: number, y: number, z: number;
    if (o.kind === "sphere") {
      const a = h1 * Math.PI * 2, r = o.r * 0.55 * Math.sqrt(h2);
      x = o.c.x + Math.cos(a) * r; z = o.c.z + Math.sin(a) * r;
      y = o.c.y + Math.sqrt(Math.max(0, o.r * o.r - r * r)) * 0.86;
    } else if (o.kind === "box") {
      const lx = (h1 - 0.5) * o.half.x * 1.5, lz = (h2 - 0.5) * o.half.z * 1.5;
      const pt = placePoint({ x: lx, y: o.half.y * 0.85, z: lz }, o.c, o.yaw ?? 0);
      x = pt.x; y = pt.y; z = pt.z;
    } else continue;
    const tint = CORAL_TINTS[Math.floor(h3 * CORAL_TINTS.length)];
    const size = 0.12 + 0.16 * h3;
    const g = h1 > 0.5 ? new THREE.ConeGeometry(size * 0.7, size * 1.6, 5) : new THREE.IcosahedronGeometry(size, 0);
    g.translate(x, y + size * 0.3, z);
    out.push(paint(g, () => scratch.copy(tint)));
  }
  return out;
}

// ------------------------------------------------------------------ walls and seabed

const SAND_A = new THREE.Color("#f2e3b8"), SAND_B = new THREE.Color("#dcc595");

function seabedGeometry(): THREE.BufferGeometry {
  const w = HABITAT.max.x - HABITAT.min.x, d = HABITAT.max.z - HABITAT.min.z;
  const g = new THREE.PlaneGeometry(w, d, 64, 60);
  g.rotateX(-Math.PI / 2);
  g.translate((HABITAT.min.x + HABITAT.max.x) / 2, 0, (HABITAT.min.z + HABITAT.max.z) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, seabedY(p.getX(i), p.getZ(i)));
  return paint(g, (v) => scratch.copy(SAND_A).lerp(SAND_B, noise3(v.x * 0.35, 0, v.z * 0.35) * 0.8));
}

/** A rocky cliff face on one habitat wall; bumps recede away from the water (never into it). */
function cliff(axis: "x" | "z", at: number, from: number, to: number, outward: 1 | -1): THREE.BufferGeometry {
  const len = to - from, top = HABITAT.max.y + 1.2, bottom = HABITAT.min.y - 0.2;
  const g = new THREE.PlaneGeometry(len, top - bottom, Math.ceil(len / 0.8), 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + (from + to) / 2, y = p.getY(i) + (top + bottom) / 2;
    const k = noise3(u * 0.45, y * 0.45, at * 0.1) * 0.75 + noise3(u * 1.3, y * 1.3, 4) * 0.3;
    const off = outward * k * 1.1;
    if (axis === "x") p.setXYZ(i, at + off, y, u);
    else p.setXYZ(i, u, y, at + off);
  }
  return paint(g, (v, n) => {
    const depth = THREE.MathUtils.clamp((HABITAT.max.y - v.y) / 9, 0, 1);
    scratch.copy(ROCK_A).lerp(ROCK_B, 0.35 + 0.4 * noise3(v.x * 0.7, v.y * 0.7, v.z * 0.7));
    if (n.y > 0.35) scratch.lerp(MOSS, 0.35);
    return scratch.multiplyScalar(1 - depth * 0.15);
  });
}

/** Everything in the water that never changes: seabed, cliffs, built-in rocks, coral, the walkway structure. */
export function habitatStaticGeometry(): { rock: THREE.BufferGeometry; sand: THREE.BufferGeometry; struct: THREE.BufferGeometry } {
  const rock: THREE.BufferGeometry[] = [
    cliff("x", HABITAT.min.x, HABITAT.min.z - 0.5, HABITAT.max.z + 0.3, -1),
    cliff("x", HABITAT.max.x, HABITAT.min.z - 0.5, HABITAT.max.z + 0.3, 1),
    cliff("z", HABITAT.min.z, HABITAT.min.x - 0.5, HABITAT.max.x + 0.5, -1)
  ];
  // The plane faces +z by default; flip the cliffs so their front faces the water.
  rock[0].rotateY(0); // x-walls were written directly in world space
  TUNNEL_ROCKS.forEach((o, i) => {
    rock.push(solidRock(o));
    rock.push(...coralOn(o, o.kind === "sphere" && o.c.y < 1 ? 7 : 3, i + 11));
  });
  // Distant silhouettes: tall, thin stacks pressed into the side cliffs (outside the swim box).
  for (const [x, z, h] of [[19.3, -14, 7.5], [19.2, -35, 8.5], [52.7, -13, 8], [52.8, -36, 7], [28, -40.7, 8.6], [45, -40.7, 7.8]] as const) {
    rock.push(solidRock({ kind: "capsule", a: { x, y: -0.5, z }, b: { x, y: h, z }, r: 1.1 }, rockPaint(ROCK_B)));
  }
  const sand = [seabedGeometry()];
  // Merge the sunken wreck with existing opaque structures: no new draw call.
  const struct = [tunnelStructureGeometry(), habitatRimGeometry(), wreckGeometry()];
  return { rock: mergeAll(rock), sand: mergeAll(sand), struct: mergeAll(struct) };
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((g) => {
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "color", "uv"].includes(name)) g.deleteAttribute(name);
    return g;
  });
  const merged = mergeGeometries(clean, false);
  clean.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

// ------------------------------------------------------------------ the walkway tube

const DECK = new THREE.Color("#c8c2b4"), DECK_EDGE = new THREE.Color("#7fd6e6"), KERB = new THREE.Color("#4b6470"), RIB = new THREE.Color("#3a4f5c"), PLINTH = new THREE.Color("#8a9696");
// The vertical lower wall must share the kerb's outer bottom edge. Previously
// it was offset 15 cm outward, creating a visible floating right/left edge.
const KERB_FOOT_INSET = 0.05;

/** Points of the loop outside the lobby, plus their frames. */
/** The lobby's back wall (z of its middle): the tube's surfaces start and end inside it. */
const MOUTH_Z = HABITAT.max.z;

function tubeSamples() {
  const n = WALKWAY_SAMPLES.length;
  const framed = WALKWAY_SAMPLES.map((p, i) => {
    const a = WALKWAY_SAMPLES[(i - 1 + n) % n], b = WALKWAY_SAMPLES[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { ...p, tx: dx / l, tz: dz / l, nx: -dz / l, nz: dx / l };
  });
  // Where the loop passes through the lobby wall, add a sample exactly in the wall,
  // so the glass, kerbs and floor meet the wall instead of stopping short in the water.
  const out: typeof framed = [];
  for (let i = 0; i < n; i++) {
    const p = framed[i], q = framed[(i + 1) % n];
    out.push(p);
    if (Boolean(p.inside) !== Boolean(q.inside)) {
      const t = (MOUTH_Z - p.z) / (q.z - p.z || 1e-6);
      if (t > 0 && t < 1) {
        const w = p.inside ? q : p;
        out.push({ ...w, x: p.x + (q.x - p.x) * t, z: MOUTH_Z, s: p.s + (q.s - p.s) * t, inside: undefined });
      }
    }
  }
  return out;
}

/** A ribbon along the loop: for each sample, `cross(sample)` gives points (lateral, y) across. */
function sweep(cross: (s: ReturnType<typeof tubeSamples>[number]) => Array<[number, number]>, color: (i: number, j: number) => THREE.Color, keep: (s: ReturnType<typeof tubeSamples>[number]) => boolean): THREE.BufferGeometry {
  const samples = tubeSamples();
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let base = 0;
  let runStart = -1;
  const rows: number[] = [];
  for (let i = 0; i <= samples.length; i++) {
    const s = samples[i % samples.length];
    if (!keep(s)) { rows.push(-1); continue; }
    const pts = cross(s);
    rows.push(base);
    pts.forEach(([l, y], j) => {
      pos.push(s.x + s.nx * l, y, s.z + s.nz * l);
      const c = color(i, j);
      col.push(c.r, c.g, c.b);
    });
    base += pts.length;
  }
  const width = cross(samples[0]).length;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (a < 0 || b < 0) continue;
    // Rows run in walking order and each cross-section from -lateral to +lateral (the
    // profiles are written so): this winding makes every face point out of the solid
    // (floor and kerb tops up, kerb faces toward the walkway, plinth outward). The
    // material is single-sided, so the opposite winding hid the walkway from inside.
    for (let j = 0; j < width - 1; j++) idx.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
  }
  void runStart;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  flat.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2));
  return flat;
}

const inWater = (s: { inside?: boolean }) => !s.inside;

/** Deck, kerbs, plinth and ribs of the walkway tube. */
function tunnelStructureGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Deck (slightly wider than the walking clamp, up to the kerbs) and plinth sides.
  parts.push(sweep((s) => {
    const w = s.halfWidth - 0.42;
    return [[-w, 0], [-w * 0.94, 0], [w * 0.94, 0], [w, 0]];
  }, (_i, j) => (j === 1 || j === 2 ? DECK : DECK_EDGE), inWater));
  for (const side of [-1, 1]) {
    // Kerb: inner face, top, then the glass foot.
    parts.push(sweep((s) => {
      const a = (s.halfWidth - 0.42) * side, b = (s.halfWidth - KERB_FOOT_INSET) * side;
      const pts: Array<[number, number]> = [[a, 0], [a, 0.5], [b, 0.5], [b, -0.05]];
      return side > 0 ? pts : pts.reverse();
    }, (_i, j) => (side > 0 ? j === 1 || j === 2 : j === 1 || j === 2) ? KERB.clone().multiplyScalar(1.25) : KERB, inWater));
    // Plinth wall down to the sand.
    parts.push(sweep((s) => {
      // Match the kerb's outer foot exactly, on both sides of the curved
      // walkway, so the vertical plinth cannot appear detached during walking.
      const b = (s.halfWidth - KERB_FOOT_INSET) * side;
      const pts: Array<[number, number]> = [[b, -0.05], [b, -0.95]];
      return side > 0 ? pts : pts.reverse();
    }, () => PLINTH, inWater));
  }
  // Ribs: half-ellipse frames every ~3 m, following the tube (and the dome).
  const samples = tubeSamples();
  let next = 0;
  for (const s of samples) {
    if (s.inside || s.s < next) continue;
    next = s.s + (s.halfWidth > 2.6 ? 2.2 : 3);
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k <= 18; k++) {
      const a = (k / 18) * Math.PI, l = Math.cos(a) * (s.halfWidth - 0.02), y = 0.48 + Math.sin(a) * (s.height - 0.5);
      ring.push(new THREE.Vector3(s.x + s.nx * l, y, s.z + s.nz * l));
    }
    const curve = new THREE.CatmullRomCurve3(ring);
    parts.push(paint(new THREE.TubeGeometry(curve, 24, 0.07, 5, false), () => RIB));
  }
  // Portal frames where the tube meets the lobby.
  return mergeAll(parts);
}

/** The concrete rim around the top of the habitat (frames the water from above). */
function habitatRimGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const y = HABITAT.max.y + 0.35, c = new THREE.Color("#c9cfcb");
  const add = (w: number, d: number, x: number, z: number) => {
    const g = new THREE.BoxGeometry(w, 0.7, d);
    g.translate(x, y, z);
    parts.push(paint(g, () => c));
  };
  const { min, max } = HABITAT;
  add(max.x - min.x + 3, 1.2, (min.x + max.x) / 2, min.z - 1.1);
  add(1.2, max.z - min.z + 1.6, min.x - 1.1, (min.z + max.z) / 2);
  add(1.2, max.z - min.z + 1.6, max.x + 1.1, (min.z + max.z) / 2);
  // Front base wall under the front glass (outside the lobby span).
  for (const [x0, x1] of [[min.x - 0.5, TUNNEL_LOBBY.minX], [TUNNEL_LOBBY.maxX, max.x + 0.5]]) {
    const g = new THREE.BoxGeometry(x1 - x0, 1.3, 0.5);
    g.translate((x0 + x1) / 2, min.y + 0.65, max.z + 0.25);
    parts.push(paint(g, () => PLINTH));
  }
  return mergeAll(parts);
}

/** The glass tube itself (one surface, inner and outer seen through the same faces). */
export function tunnelGlassGeometry(): THREE.BufferGeometry {
  const samples = tubeSamples();
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const rows: number[] = [];
  const K = 16;
  let base = 0;
  for (let i = 0; i <= samples.length; i++) {
    const s = samples[i % samples.length];
    if (s.inside) { rows.push(-1); continue; }
    rows.push(base);
    for (let k = 0; k <= K; k++) {
      const a = (k / K) * Math.PI;
      // The glass stands on the kerb top near its outer edge and rises vertically from it
      // (the same profile as the ribs): no flat sliver at kerb height to z-fight with it.
      const w = s.halfWidth - 0.08, rise = s.height - 0.58;
      const l = Math.cos(a) * w, y = 0.5 + Math.sin(a) * rise;
      pos.push(s.x + s.nx * l, y, s.z + s.nz * l);
      const nl = Math.cos(a) / w, ny = Math.sin(a) / rise, nlen = Math.hypot(nl, ny) || 1;
      nor.push((s.nx * nl) / nlen, ny / nlen, (s.nz * nl) / nlen);
    }
    base += K + 1;
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (a < 0 || b < 0) continue;
    for (let k = 0; k < K; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ lobby

const LOBBY_WALL = new THREE.Color("#2f6f86"), LOBBY_FLOOR = new THREE.Color("#d8d2c4"), LOBBY_TRIM = new THREE.Color("#f1e7cf");

/** The dry entrance lobby: floor, walls with the two tube mouths and the Atrium door. */
export function lobbyGeometry(): THREE.BufferGeometry {
  const L = TUNNEL_LOBBY, parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    parts.push(paint(g, (v) => scratch.copy(c).multiplyScalar(0.7 + 0.3 * THREE.MathUtils.smoothstep(v.y, 0, 1.2))));
  };
  box(L.maxX - L.minX, 0.1, L.maxZ - L.minZ, (L.minX + L.maxX) / 2, -0.1, (L.minZ + L.maxZ) / 2, LOBBY_FLOOR);
  // Side walls.
  box(0.25, L.height, L.maxZ - L.minZ, L.minX - 0.125, 0, (L.minZ + L.maxZ) / 2, LOBBY_WALL);
  box(0.25, L.height, L.maxZ - L.minZ, L.maxX + 0.125, 0, (L.minZ + L.maxZ) / 2, LOBBY_WALL);
  // Back wall with the two mouths (each 4.2 m wide, 3.2 m high, an arch frame).
  const mouths = [MOUTHS.entrance, MOUTHS.exit], hw = TUBE.halfWidth;
  const edges = [L.minX, mouths[0] - hw, mouths[0] + hw, mouths[1] - hw, mouths[1] + hw, L.maxX];
  for (let i = 0; i < edges.length; i += 2) box(edges[i + 1] - edges[i], L.height, 0.3, (edges[i] + edges[i + 1]) / 2, 0, L.minZ - 0.15, LOBBY_WALL);
  for (const x of mouths) {
    box(hw * 2, L.height - 3.2, 0.3, x, 3.2, L.minZ - 0.15, LOBBY_WALL);
    // Arch frame.
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k <= 18; k++) {
      const a = (k / 18) * Math.PI;
      ring.push(new THREE.Vector3(x + Math.cos(a) * (hw - 0.02), 0.02 + Math.sin(a) * 3.15, L.minZ + 0.02));
    }
    parts.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring), 24, 0.12, 6, false), () => LOBBY_TRIM));
  }
  // Front wall (the Atrium's back wall seen from inside) with the doorway.
  const door = { x: 32.55, w: 1.8, h: 2.65 };
  box(door.x - door.w / 2 - L.minX, L.height, 0.25, (L.minX + door.x - door.w / 2) / 2, 0, L.maxZ + 0.125, LOBBY_WALL);
  box(L.maxX - (door.x + door.w / 2), L.height, 0.25, (door.x + door.w / 2 + L.maxX) / 2, 0, L.maxZ + 0.125, LOBBY_WALL);
  box(door.w, L.height - door.h, 0.25, door.x, door.h, L.maxZ + 0.125, LOBBY_WALL);
  // Wave trim along the walls and a bench in the middle.
  box(L.maxX - L.minX, 0.08, 0.06, (L.minX + L.maxX) / 2, 2.4, L.maxZ - 0.02, LOBBY_TRIM);
  box(1.8, 0.42, 0.55, 35.55, 0, -7.9, new THREE.Color("#b88752"));
  return mergeAll(parts);
}

// ------------------------------------------------------------------ light shafts

export function shaftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spots: Array<[number, number, number]> = [[27, -18, 0.2], [36.5, -31, -0.15], [45, -21, 0.1], [33, -24, 0.05], [41, -35, -0.1], [25, -33, 0.15]];
  for (const [x, z, lean] of spots) {
    for (const r of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(1.5, HABITAT.max.y - 0.2, 1, 1);
      g.translate(0, (HABITAT.max.y - 0.2) / 2, 0);
      g.rotateZ(lean);
      g.rotateY(r + x * 0.1);
      g.translate(x, 0, z);
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

// ------------------------------------------------------------------ placed structures

const SAND_BANK = new THREE.Color("#ead8ab");

/** One placed structure, in world space, drawn from its collision solids. */
export function structureGeometry(kind: TunnelDecorKind, zone: number): THREE.BufferGeometry {
  const z = TUNNEL_ZONES[zone], def = TUNNEL_STRUCTURES[kind];
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.Color(def.color);
  for (const o of def.obstacles) {
    const w = placeObstacle(o, z, z.yaw);
    if (kind === "tunnelSand" && w.kind === "box") {
      // A low sand dune inside the box: a squashed dome, rippled.
      const g = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(w.half.x * 0.96, w.half.y * 2 * 0.92, w.half.z * 0.96);
      g.rotateY(w.yaw ?? 0);
      g.translate(w.c.x, w.c.y - w.half.y, w.c.z);
      parts.push(paint(g, (v) => scratch.copy(SAND_BANK).multiplyScalar(0.9 + 0.12 * Math.sin(v.x * 6 + v.z * 2))));
      continue;
    }
    parts.push(solidRock(w, rockPaint(base), 1));
  }
  if (kind === "tunnelShelf") for (const o of def.obstacles) parts.push(...coralOn(placeObstacle(o, z, z.yaw), 10, zone * 7 + 3));
  if (kind === "tunnelArch" || kind === "tunnelPinnacle") for (const o of def.obstacles) if (o.kind === "sphere") parts.push(...coralOn(placeObstacle(o, z, z.yaw), 3, zone * 5 + 1));
  return mergeAll(parts);
}

/** The ring geometry for a zone (flat on the sand, big enough to tap from every viewpoint). */
export function zoneRingGeometry(): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(2.1, 2.55, 40);
  g.rotateX(-Math.PI / 2);
  return g;
}

export { CHAMBER, walkwayLength };
