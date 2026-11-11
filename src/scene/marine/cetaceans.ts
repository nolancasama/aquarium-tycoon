import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Low-poly cetaceans for the outdoor areas: a bottlenose dolphin, orcas (an
 * adult male with a tall straight fin, curved-fin females, a calf) and a
 * beluga. Each is one merged mesh (one draw call) lofted from an authored body
 * profile, with foil fins and horizontal flukes. Every vertex carries `skin`
 * (s: snout 0 .. tail 1, h: belly -1 .. back +1, w: left -1 .. right +1, past
 * ±1 along a flipper) and `part` (0 body, 1 dorsal fin, 2 flipper, 3 flukes,
 * 4 eye, dolphin-only 5 jaw / 6 palate / 7 lower mouth), which
 * cetaceanMaterial.ts uses for the vertical fluke beat, turning
 * and the markings (countershading, the orca's patches).
 *
 * Model space: +z is forward (the snout at +L/2), y up; metres for one adult.
 */

export type CetaceanKind = "dolphin" | "orca" | "beluga";
export type FinStyle = "dolphin" | "tall" | "curved" | "nicked" | "small" | "none";
export const PART = { body: 0, dorsal: 1, flipper: 2, flukes: 3, eye: 4, jaw: 5, mouth: 6, jawMouth: 7 } as const;

/** [s, centre y, radius up, radius down, half width], all as fractions of the length. */
type Ring = readonly [number, number, number, number, number];

const DOLPHIN: Ring[] = [
  [0, -0.018, 0.004, 0.004, 0.004], [0.02, -0.019, 0.013, 0.012, 0.013], [0.05, -0.018, 0.022, 0.02, 0.022],
  [0.072, -0.016, 0.028, 0.026, 0.029], [0.086, -0.01, 0.04, 0.032, 0.036], [0.105, 0, 0.062, 0.044, 0.05],
  [0.135, 0.004, 0.078, 0.056, 0.062], [0.18, 0.006, 0.09, 0.068, 0.074], [0.26, 0.007, 0.099, 0.08, 0.083],
  [0.36, 0.005, 0.102, 0.084, 0.085], [0.46, 0.003, 0.095, 0.078, 0.077], [0.56, 0.002, 0.08, 0.064, 0.062],
  [0.66, 0.001, 0.06, 0.048, 0.043], [0.76, 0, 0.04, 0.032, 0.026], [0.84, 0, 0.026, 0.022, 0.015],
  [0.89, 0, 0.017, 0.015, 0.011], [0.925, 0, 0.009, 0.008, 0.007], [0.95, 0, 0.003, 0.003, 0.003]
];
const ORCA: Ring[] = [
  [0, -0.006, 0.006, 0.006, 0.006], [0.02, -0.01, 0.034, 0.03, 0.034], [0.05, -0.01, 0.062, 0.054, 0.062],
  [0.09, -0.006, 0.088, 0.074, 0.086], [0.15, 0, 0.11, 0.094, 0.106], [0.24, 0.002, 0.124, 0.108, 0.116],
  [0.34, 0.003, 0.128, 0.112, 0.118], [0.44, 0.002, 0.12, 0.106, 0.108], [0.54, 0.001, 0.102, 0.09, 0.088],
  [0.64, 0, 0.078, 0.07, 0.062], [0.74, 0, 0.054, 0.048, 0.036], [0.83, 0, 0.034, 0.03, 0.02],
  [0.89, 0, 0.02, 0.018, 0.013], [0.93, 0, 0.01, 0.009, 0.008], [0.955, 0, 0.003, 0.003, 0.003]
];
const BELUGA: Ring[] = [
  [0, -0.02, 0.006, 0.006, 0.006], [0.02, -0.022, 0.02, 0.018, 0.022], [0.045, -0.018, 0.034, 0.03, 0.036],
  [0.062, -0.006, 0.07, 0.04, 0.056], [0.09, 0.01, 0.098, 0.052, 0.074], [0.13, 0.012, 0.104, 0.064, 0.082],
  [0.175, 0.006, 0.092, 0.072, 0.08], [0.22, 0.004, 0.1, 0.086, 0.094], [0.3, 0.004, 0.122, 0.104, 0.116],
  [0.4, 0.002, 0.128, 0.11, 0.12], [0.5, 0.001, 0.124, 0.102, 0.108], [0.6, 0, 0.102, 0.084, 0.084],
  [0.7, 0, 0.068, 0.06, 0.054], [0.8, 0, 0.042, 0.038, 0.03], [0.87, 0, 0.024, 0.022, 0.016],
  [0.92, 0, 0.01, 0.01, 0.008], [0.95, 0, 0.003, 0.003, 0.003]
];
const PROFILES: Record<CetaceanKind, Ring[]> = { dolphin: DOLPHIN, orca: ORCA, beluga: BELUGA };

function ringAt(profile: Ring[], s: number): Ring {
  for (let i = 1; i < profile.length; i++) {
    if (s <= profile[i][0]) {
      const a = profile[i - 1], b = profile[i];
      const t = THREE.MathUtils.smoothstep((s - a[0]) / (b[0] - a[0]), 0, 1);
      return [s, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t];
    }
  }
  return profile[profile.length - 1];
}

interface Piece { g: THREE.BufferGeometry }

class Body {
  readonly pieces: THREE.BufferGeometry[] = [];
  constructor(readonly kind: CetaceanKind, readonly L: number) {}
  get profile() { return PROFILES[this.kind]; }
  ring(s: number) { return ringAt(this.profile, s); }
  z(s: number) { return this.L * (0.5 - s); }
  top(s: number) { const r = this.ring(s); return (r[1] + r[2]) * this.L; }
  centreY(s: number) { return this.ring(s)[1] * this.L; }

  /** Attributes for a finished piece: skin from a per-vertex function, the part id, and a vertex colour. */
  finish(g: THREE.BufferGeometry, part: number, skin: (x: number, y: number, z: number, i: number) => [number, number, number], color: THREE.ColorRepresentation = "#ffffff") {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    const p = geo.getAttribute("position");
    const sk = new Float32Array(p.count * 3), pt = new Float32Array(p.count), col = new Float32Array(p.count * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      sk.set(skin(p.getX(i), p.getY(i), p.getZ(i), i), i * 3);
      pt[i] = part;
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("skin", new THREE.BufferAttribute(sk, 3));
    geo.setAttribute("part", new THREE.BufferAttribute(pt, 1));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
    this.pieces.push(geo);
  }

  /** The lofted body: rings along s, each an egg-shaped section (fuller above than below). */
  loft(rings: number, sides: number) {
    const L = this.L, pos: number[] = [], skin: number[] = [], idx: number[] = [];
    const end = this.profile[this.profile.length - 1][0];
    for (let i = 0; i <= rings; i++) {
      // Denser rings at the snout and the tail stock, where the shape changes fastest.
      const u = i / rings, s = end * (u < 0.5 ? 0.5 * Math.pow(2 * u, 1.25) : 1 - 0.5 * Math.pow(2 * (1 - u), 1.15));
      const r = this.ring(s);
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        pos.push(sa * r[4] * L, (r[1] + (ca >= 0 ? r[2] : r[3]) * ca) * L, this.z(s));
        skin.push(s, ca, sa);
        if (i < rings && j < sides) {
          const k = i * (sides + 1) + j;
          idx.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ni = g.toNonIndexed();
    const sk = new Float32Array(idx.length * 3);
    idx.forEach((v, n) => sk.set([skin[v * 3], skin[v * 3 + 1], skin[v * 3 + 2]], n * 3));
    g.dispose();
    this.finish(ni, PART.body, (_x, _y, _z, i) => [sk[i * 3], sk[i * 3 + 1], sk[i * 3 + 2]]);
    if (this.kind === "dolphin") {
      // The loft is already split into triangles. Keep every rest vertex and
      // normal exactly as authored; only the lower beak triangles articulate.
      // The sides include h=0, giving the upper and lower lips a shared seam.
      const part = ni.getAttribute("part");
      for (let i = 0; i < part.count; i += 3) {
        const h = sk[i * 3 + 1] + sk[(i + 1) * 3 + 1] + sk[(i + 2) * 3 + 1];
        const s = Math.min(sk[i * 3], sk[(i + 1) * 3], sk[(i + 2) * 3]);
        if (h < -0.001 && s < 0.105) for (let k = 0; k < 3; k++) part.setX(i + k, PART.jaw);
      }
      // Two dark palate surfaces seal the new lip seam. They coincide inside
      // the closed rostrum and are discarded by the shader until the jaw opens.
      const stations = Array.from({ length: rings + 1 }, (_, i) => {
        const u = i / rings;
        return end * (u < 0.5 ? 0.5 * Math.pow(2 * u, 1.25) : 1 - 0.5 * Math.pow(2 * (1 - u), 1.15));
      }).filter((s, i, all) => s < 0.105 || (i > 0 && all[i - 1] < 0.105));
      for (const id of [PART.mouth, PART.jawMouth]) {
        const mouth: number[] = [];
        for (let i = 1; i < stations.length; i++) {
          const a = this.ring(stations[i - 1]), b = this.ring(stations[i]);
          const al = [-a[4] * L, a[1] * L, this.z(a[0])], ar = [a[4] * L, a[1] * L, this.z(a[0])];
          const bl = [-b[4] * L, b[1] * L, this.z(b[0])], br = [b[4] * L, b[1] * L, this.z(b[0])];
          mouth.push(...al, ...ar, ...bl, ...ar, ...br, ...bl);
        }
        const interior = new THREE.BufferGeometry();
        interior.setAttribute("position", new THREE.Float32BufferAttribute(mouth, 3));
        interior.computeVertexNormals();
        this.finish(interior, id, (_x, _y, z) => [0.5 - z / L, 0, 0]);
      }
    }
  }

  /** A thin foil from a 2D outline (u along the chord, v along the span), placed by `place`. */
  foil(shape: THREE.Shape, thick: number, part: number, place: (u: number, v: number, t: number) => THREE.Vector3, skin: (u: number, v: number, t: number, w: THREE.Vector3) => [number, number, number]) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 7 });
    const p = g.getAttribute("position");
    const uvt: [number, number, number][] = [];
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i), t = p.getZ(i) - thick / 2;
      uvt.push([u, v, t]);
      const w = place(u, v, t);
      p.setXYZ(i, w.x, w.y, w.z);
    }
    g.computeVertexNormals();
    this.finish(g, part, (x, y, z, i) => skin(uvt[i][0], uvt[i][1], uvt[i][2], new THREE.Vector3(x, y, z)));
  }

  /** A dorsal fin standing on the back, from s0 along the body. */
  dorsal(style: FinStyle, s0: number) {
    if (style === "none") return;
    const L = this.L, sh = new THREE.Shape();
    const root = -0.025 * L;
    if (style === "tall") {
      // An adult male orca: tall, straight and nearly triangular.
      sh.moveTo(0, root); sh.lineTo(0.032 * L, 0.11 * L); sh.quadraticCurveTo(0.045 * L, 0.21 * L, 0.062 * L, 0.25 * L);
      sh.quadraticCurveTo(0.082 * L, 0.15 * L, 0.15 * L, root);
    } else if (style === "curved" || style === "nicked") {
      sh.moveTo(0, root); sh.bezierCurveTo(0.03 * L, 0.07 * L, 0.07 * L, 0.12 * L, 0.125 * L, 0.132 * L);
      if (style === "nicked") { sh.quadraticCurveTo(0.104 * L, 0.095 * L, 0.112 * L, 0.078 * L); sh.lineTo(0.1 * L, 0.07 * L); }
      sh.quadraticCurveTo(0.098 * L, 0.06 * L, 0.135 * L, root);
    } else if (style === "small") {
      sh.moveTo(0, root); sh.bezierCurveTo(0.025 * L, 0.05 * L, 0.06 * L, 0.085 * L, 0.1 * L, 0.092 * L);
      sh.quadraticCurveTo(0.08 * L, 0.045 * L, 0.11 * L, root);
    } else {
      // Bottlenose: falcate, swept back.
      sh.moveTo(0, root); sh.bezierCurveTo(0.03 * L, 0.05 * L, 0.08 * L, 0.105 * L, 0.152 * L, 0.118 * L);
      sh.quadraticCurveTo(0.124 * L, 0.06 * L, 0.18 * L, root);
    }
    const thick = (style === "tall" ? 0.012 : 0.009) * L;
    this.foil(sh, thick, PART.dorsal, (u, v, t) => {
      const s = s0 + u / L;
      return new THREE.Vector3(t * (1 - Math.min(1, Math.max(0, v / (0.25 * L))) * 0.6), this.top(s) + v, this.z(s));
    }, (u) => [s0 + u / L, 1, 0]);
  }

  /** Flippers on the lower sides, pointing out, down and back. */
  flippers(s0: number, style: "pointed" | "paddle" | "beluga") {
    const L = this.L;
    for (const side of [-1, 1]) {
      const sh = new THREE.Shape();
      if (style === "paddle") {
        // Orca: big rounded paddles.
        sh.moveTo(0, 0); sh.bezierCurveTo(0.005 * L, 0.06 * L, 0.04 * L, 0.15 * L, 0.075 * L, 0.15 * L);
        sh.bezierCurveTo(0.105 * L, 0.15 * L, 0.1 * L, 0.06 * L, 0.07 * L, 0);
      } else if (style === "beluga") {
        sh.moveTo(0, 0); sh.bezierCurveTo(0.004 * L, 0.05 * L, 0.03 * L, 0.11 * L, 0.06 * L, 0.115 * L);
        sh.quadraticCurveTo(0.085 * L, 0.1 * L, 0.06 * L, 0);
      } else {
        sh.moveTo(0, 0); sh.bezierCurveTo(0.01 * L, 0.06 * L, 0.05 * L, 0.13 * L, 0.085 * L, 0.15 * L);
        sh.quadraticCurveTo(0.07 * L, 0.06 * L, 0.06 * L, 0);
      }
      const r = this.ring(s0);
      const root = new THREE.Vector3(side * r[4] * L * 0.82, (r[1] - r[3] * 0.5) * L, this.z(s0));
      const chord = new THREE.Vector3(0, 0, -1);
      const span = new THREE.Vector3(side * 0.78, -0.5, -0.38).normalize();
      const n = new THREE.Vector3().crossVectors(chord, span).normalize();
      const spanLen = (style === "paddle" ? 0.15 : style === "beluga" ? 0.115 : 0.15) * L;
      this.foil(sh, 0.012 * L, PART.flipper, (u, v, t) => root.clone().addScaledVector(chord, u).addScaledVector(span, v).addScaledVector(n, t),
        (u, v) => [s0 + u / L, -0.35, side * (1 + v / spanLen)]);
    }
  }

  /** Horizontal flukes with a notch in the middle of the trailing edge. */
  flukes(s0: number, span: number, notch: number) {
    const L = this.L, sh = new THREE.Shape(), half = span * L / 2, chord = 0.1 * L;
    // Outline in (u: back along the body, v: across); built for one side and mirrored by the curve.
    sh.moveTo(0, 0);
    sh.bezierCurveTo(0.02 * L, half * 0.45, chord * 0.75, half * 0.95, chord * 1.15, half);
    sh.quadraticCurveTo(chord * 0.95, half * 0.55, chord * (1 - notch), 0.012 * L);
    // The median notch: the trailing edge dips forward at the middle.
    sh.lineTo(chord * (1 - notch * 1.7), 0);
    sh.lineTo(chord * (1 - notch), -0.012 * L);
    sh.quadraticCurveTo(chord * 0.95, -half * 0.55, chord * 1.15, -half);
    sh.bezierCurveTo(chord * 0.75, -half * 0.95, 0.02 * L, -half * 0.45, 0, 0);
    this.foil(sh, 0.011 * L, PART.flukes, (u, v, t) => {
      const s = s0 + u / L;
      return new THREE.Vector3(v, this.centreY(Math.min(s, 0.95)) + t * (1 - Math.min(1, Math.abs(v) / half) * 0.5), this.z(s));
    }, (u, v, t) => [s0 + u / L, t >= 0 ? 1 : -1, v / half]);
  }

  eyes(s: number, h: number, size: number, color: string) {
    const L = this.L, r = this.ring(s);
    for (const side of [-1, 1]) {
      const g = new THREE.SphereGeometry(size * L, 7, 5);
      g.scale(0.55, 0.8, 1);
      const x = side * r[4] * L * 0.93, y = (r[1] + h * (h >= 0 ? r[2] : r[3])) * L;
      g.translate(x, y, this.z(s));
      this.finish(g, PART.eye, () => [s, h, side], color);
    }
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.pieces, false);
    this.pieces.forEach((p) => p.dispose());
    g.computeBoundingSphere();
    // The shader bends the tail and lifts the flukes: never cull a curved animal by its rest pose.
    if (g.boundingSphere) g.boundingSphere.radius *= 1.25;
    return g;
  }
}

export interface CetaceanSpec {
  kind: CetaceanKind;
  /** Body length (m). */
  length: number;
  fin: FinStyle;
}

export function cetaceanGeometry(spec: CetaceanSpec): THREE.BufferGeometry {
  const b = new Body(spec.kind, spec.length);
  if (spec.kind === "dolphin") {
    b.loft(40, 16);
    b.dorsal(spec.fin, 0.4);
    b.flippers(0.22, "pointed");
    b.flukes(0.86, 0.27, 0.12);
    b.eyes(0.112, -0.05, 0.011, "#141c22");
  } else if (spec.kind === "orca") {
    b.loft(40, 18);
    b.dorsal(spec.fin, spec.fin === "tall" ? 0.33 : 0.36);
    b.flippers(0.2, "paddle");
    b.flukes(0.87, 0.27, 0.1);
    b.eyes(0.13, 0.02, 0.009, "#0b0f13");
  } else {
    b.loft(40, 16);
    b.flippers(0.21, "beluga");
    b.flukes(0.87, 0.25, 0.16);
    b.eyes(0.135, -0.1, 0.01, "#1b2328");
  }
  return b.build();
}

/** The parts of a merged cetacean (tests). */
export type CetaceanPiece = Piece;
