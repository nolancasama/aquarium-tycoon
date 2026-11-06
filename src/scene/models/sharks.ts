import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TunnelSpecies } from "../../game/tunnel/contract";

/** Metres, snout at x=0 and tail tip at -length. Eagle ray span is 1.8 m. */
export const MODEL_LENGTHS: Readonly<Record<TunnelSpecies, number>> = { blacktip: 1.6, zebrashark: 2.4, eagleray: 2.4 };
export const SHARK_PART = { body: 0, fin: 1, tail: 2, wing: 3, face: 4 } as const;
type V = [number, number, number];
type Profile = readonly [number, number, number][];
type Paint = (x: number, y: number, z: number, colour: THREE.Color) => void;

const BLACKTIP: Profile = [[0, 0.002, 0.002], [.045, .045, .052], [.12, .095, .105], [.24, .129, .123], [.38, .127, .117], [.53, .098, .09], [.68, .059, .052], [.8, .025, .022], [.87, .015, .017]];
const ZEBRA: Profile = [[0, .023, .032], [.04, .066, .075], [.12, .094, .103], [.23, .11, .112], [.35, .09, .085], [.46, .063, .057], [.58, .039, .033], [.76, .024, .017], [1, .001, .001]];

function radius(profile: Profile, s: number): [number, number] {
  for (let i = 1; i < profile.length; i++) {
    if (s <= profile[i][0]) {
      const a = profile[i - 1], b = profile[i], t = THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1);
      return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)];
    }
  }
  return [profile[profile.length - 1][1], profile[profile.length - 1][2]];
}

/** Exposed for geometric attachment checks; radii are in metres. */
export function sharkBodyRadius(species: "blacktip" | "zebrashark", x: number): [number, number] {
  const length = MODEL_LENGTHS[species], r = radius(species === "blacktip" ? BLACKTIP : ZEBRA, -x / length);
  return [r[0] * length, r[1] * length];
}

class Builder {
  private parts: THREE.BufferGeometry[] = [];
  readonly roots: V[][] = [];
  readonly rootThickness: V[] = [];
  constructor(readonly length: number, readonly close: boolean) {}

  add(g: THREE.BufferGeometry, part: number, paint: Paint): void {
    const p = g.getAttribute("position"), colours = new Float32Array(p.count * 3), bodyS = new Float32Array(p.count), ids = new Float32Array(p.count), side = new Float32Array(p.count);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      paint(x, y, z, c); colours.set([c.r, c.g, c.b], i * 3);
      bodyS[i] = THREE.MathUtils.clamp(-x / this.length, 0, 1); ids[i] = part; side[i] = Math.sign(z);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    g.setAttribute("bodyS", new THREE.BufferAttribute(bodyS, 1));
    g.setAttribute("partId", new THREE.BufferAttribute(ids, 1));
    g.setAttribute("side", new THREE.BufferAttribute(side, 1));
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
    this.parts.push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
  }

  ellipsoid(pos: V, scale: V, paint: Paint, part: number = SHARK_PART.face, segments = this.close ? 8 : 5): void {
    const g = new THREE.SphereGeometry(1, segments, this.close ? 5 : 3);
    g.scale(...scale); g.translate(...pos); this.add(g, part, paint);
  }

  tube(points: V[], r: number, paint: Paint, part: number, segments: number, sides = 4, taper = false): void {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, segments, r, sides, false);
    if (taper) {
      const p = g.getAttribute("position"), uv = g.getAttribute("uv"), c = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        const t = uv.getX(i), k = 1 - t * .96; curve.getPoint(t, c);
        p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
      }
      g.computeVertexNormals();
    }
    this.add(g, part, paint);
  }

  /** Closed tapered foil. The complete root edge is buried under the body. */
  fin(a: V, tip: V, b: V, thickness: V, paint: Paint, part: number = SHARK_PART.fin): void {
    const n = this.close ? 5 : 2, positions: number[] = [], indices: number[] = [];
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...tip), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)));
    const reverse = normal.dot(new THREE.Vector3(...thickness)) < 0;
    const grid: number[][] = [];
    for (let i = 0; i <= n; i++) { grid[i] = []; for (let j = 0; j <= n - i; j++) grid[i][j] = positions.length / 3, positions.push(0, 0, 0); }
    const count = positions.length / 3;
    positions.push(...positions);
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v, id = grid[i][j] + layer * count;
      // A little camber makes the fins feel grown, while the edge closes exactly.
      const thick = (layer === 0 ? 1 : -1) * (.18 + .82 * Math.sin(Math.PI * Math.min(.95, w + v)));
      for (let k = 0; k < 3; k++) positions[id * 3 + k] = a[k] * w + tip[k] * u + b[k] * v + thickness[k] * thick;
      if (i < n && j < n - i) {
        const aa = grid[i][j] + layer * count, bb = grid[i + 1][j] + layer * count, cc = grid[i][j + 1] + layer * count;
        indices.push(...(layer ? [aa, cc, bb] : [aa, bb, cc]));
        if (j < n - i - 1) {
          const dd = grid[i + 1][j + 1] + layer * count;
          indices.push(...(layer ? [bb, cc, dd] : [bb, dd, cc]));
        }
      }
    }
    const edge = [...grid[0], ...Array.from({ length: n }, (_, i) => grid[i + 1][n - i - 1]), ...Array.from({ length: n - 1 }, (_, i) => grid[n - i - 1][0])];
    for (let i = 0; i < edge.length; i++) { const a0 = edge[i], b0 = edge[(i + 1) % edge.length]; indices.push(a0, a0 + count, b0, b0, a0 + count, b0 + count); }
    if (reverse) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
    this.roots.push([a, b]); this.rootThickness.push(thickness); this.add(g, part, paint);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false); this.parts.forEach(p => p.dispose());
    g.computeBoundingBox(); g.computeBoundingSphere();
    // The renderer bends the mesh; do not let the rest-pose sphere cull a curved tail.
    if (g.boundingSphere) g.boundingSphere.radius += .3;
    g.userData.finRoots = this.roots; g.userData.finRootThickness = this.rootThickness; g.userData.triangles = g.getAttribute("position").count / 3;
    return g;
  }
}

const solid = (hex: string): Paint => (_x, _y, _z, c) => { c.set(hex); };
const eye = solid("#10232c"), glint = solid("#fffbea");

function sharkPaint(species: "blacktip" | "zebrashark"): Paint {
  const dark = new THREE.Color(species === "blacktip" ? "#8c9690" : "#d8b969"), belly = new THREE.Color("#fff2cf"), band = new THREE.Color("#d9e2cd");
  return (x, y, _z, c) => {
    const [ry] = sharkBodyRadius(species, x), up = y / Math.max(.018, ry);
    c.copy(belly).lerp(dark, THREE.MathUtils.smoothstep(up, -.38, .32));
    if (species === "blacktip") c.lerp(band, Math.exp(-Math.pow((up + .05) * 9, 2)) * .7);
    // Adult spots are evaluated continuously by sharkMaterials, so they remain
    // round at both detail levels instead of becoming isolated dark triangles.
  };
}

function loftBody(b: Builder, profile: Profile, paint: Paint): void {
  const rings = b.close ? 34 : 10, sides = b.close ? 20 : 8, p: number[] = [], indices: number[] = [], end = profile[profile.length - 1][0];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings * end, [ry, rz] = radius(profile, s);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      p.push(-s * b.length, Math.cos(a) * ry * b.length, Math.sin(a) * rz * b.length);
      if (i < rings && j < sides) { const k = i * (sides + 1) + j; indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2); }
    }
  }
  // Caps are hidden inside the snout/tail, but keep the body a closed surface.
  for (const ring of [0, rings]) for (let j = 1; j < sides - 1; j++) {
    const k = ring * (sides + 1); indices.push(...(ring ? [k, k + j + 1, k + j] : [k, k + j, k + j + 1]));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(indices); g.computeVertexNormals(); b.add(g, SHARK_PART.body, paint);
}

function shark(species: "blacktip" | "zebrashark", close: boolean): THREE.BufferGeometry {
  const b = new Builder(MODEL_LENGTHS[species], close), l = b.length, zebra = species === "zebrashark", paint = sharkPaint(species);
  loftBody(b, zebra ? ZEBRA : BLACKTIP, paint);
  const point = (s: number, y: number, z: number): V => [-s * l, y * l, z * l];
  const finPaint = (tipTest: (x: number, y: number, z: number) => boolean): Paint => (x, y, z, c) => { paint(x, y, z, c); if (!zebra && tipTest(x / l, y / l, z / l)) c.set("#253136"); };
  for (const side of [-1, 1]) {
    b.fin(point(zebra ? .14 : .23, -.025, side * .035), point(zebra ? .34 : .43, -.055, side * (zebra ? .29 : .34)), point(zebra ? .32 : .43, -.035, side * .045), [0, .008 * l, 0], finPaint((_x, _y, z) => Math.abs(z) > .265));
    b.fin(point(zebra ? .37 : .54, -.025, side * .025), point(zebra ? .46 : .66, -.06, side * .13), point(zebra ? .46 : .65, -.02, side * .022), [0, .005 * l, 0], paint);
  }
  b.fin(point(zebra ? .31 : .29, .055, 0), point(zebra ? .39 : .41, zebra ? .163 : .31, 0), point(zebra ? .47 : .52, zebra ? .04 : .058, 0), [0, 0, .009 * l], finPaint((_x, y) => y > .245));
  b.fin(point(zebra ? .47 : .64, .025, 0), point(zebra ? .55 : .71, zebra ? .11 : .11, 0), point(zebra ? .64 : .78, .02, 0), [0, 0, .005 * l], paint);
  if (zebra) {
    // Long, low caudal ribbon: roughly half of this species' total length.
    b.fin(point(.5, .012, 0), point(.8, .062, 0), point(.97, .001, 0), [0, 0, .004 * l], paint, SHARK_PART.tail);
    b.fin(point(.62, -.006, 0), point(.82, -.034, 0), point(.95, -.001, 0), [0, 0, .003 * l], paint, SHARK_PART.tail);
    // Three subtle longitudinal ridges are buried into the top of the stocky body.
    for (const z of [-.036, 0, .036]) {
      const points: V[] = [.13, .23, .35, .46, .58].map(s => { const [ry, rz] = radius(ZEBRA, s); return point(s, ry * Math.sqrt(1 - Math.min(.8, (z / rz) ** 2)) - .004, z); });
      b.tube(points, .007 * l, paint, SHARK_PART.body, close ? 8 : 3, 3);
    }
    for (const side of [-1, 1]) b.tube([point(.03, -.046, side * .035), point(.025, -.067, side * .034), point(.055, -.074, side * .04)], .007, paint, SHARK_PART.face, close ? 4 : 2, 3, true);
  } else {
    b.fin(point(.81, .004, 0), point(1, .25, 0), point(.865, .006, 0), [0, 0, .005 * l], paint, SHARK_PART.tail);
    b.fin(point(.81, -.005, 0), point(.94, -.15, 0), point(.865, -.008, 0), [0, 0, .005 * l], finPaint((_x, y) => y < -.105), SHARK_PART.tail);
    b.fin(point(.67, -.023, 0), point(.74, -.092, 0), point(.79, -.015, 0), [0, 0, .004 * l], paint);
  }
  const eyeS = zebra ? .065 : .095, [ey, ez] = radius(zebra ? ZEBRA : BLACKTIP, eyeS);
  for (const side of [-1, 1]) {
    const pos = point(eyeS, ey * .42, side * ez * .92), r = l * .014;
    b.ellipsoid(pos, [r, r * .95, r * .5], eye);
    if (close) b.ellipsoid([pos[0] + r * .25, pos[1] + r * .27, pos[2] + side * r * .42], [r * .25, r * .25, r * .12], glint, SHARK_PART.face, 5);
    // Five gill slits lie against the body; roots are slightly buried.
    if (close) for (let i = 0; i < 5; i++) {
      const s = .17 + i * .012, [ry, rz] = radius(zebra ? ZEBRA : BLACKTIP, s);
      b.tube([point(s, ry * .3, side * rz * .946), point(s + .008, -.012, side * rz * .993), point(s + .006, -ry * .38, side * rz * .922)], .0018 * l, solid(zebra ? "#8d763d" : "#596c68"), SHARK_PART.face, 2, 3);
    }
  }
  b.tube([point(.035, -.032, -.025), point(.052, -.043, 0), point(.035, -.032, .025)], .003 * l, solid("#776b57"), SHARK_PART.face, close ? 8 : 3, 3);
  return b.build();
}

function ray(close: boolean): THREE.BufferGeometry {
  const b = new Builder(MODEL_LENGTHS.eagleray, close), top = new THREE.Color("#233d50"), bottom = new THREE.Color("#fff4d9");
  const paint: Paint = (_x, y, _z, c) => {
    c.copy(y >= 0 ? top : bottom);
  };
  const rings = close ? 28 : 10, sides = close ? 24 : 12, p: number[] = [], indices: number[] = [];
  // A single closed disc, shared at the wing roots: no joined wing ellipsoids.
  for (let i = 0; i <= rings; i++) {
    const s = i / rings, x = -.2 - s * .79;
    // Straight leading/trailing edges meet at an unmistakably pointed wing tip.
    const tip = .43, halfWidth = s < tip ? s / tip : (1 - s) / (1 - tip);
    const width = .015 + .885 * halfWidth;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, z = Math.sin(a) * width;
      // Pointed wings sit forward of the trailing disc edge.
      const sweep = -.14 * Math.pow(Math.abs(Math.sin(a)), 2) * Math.sin(Math.PI * s);
      p.push(x + sweep, Math.cos(a) * (.016 + .105 * Math.sin(Math.PI * s)) * (1 - Math.pow(Math.abs(Math.sin(a)), 1.5) * .86), z);
      if (i < rings && j < sides) { const k = i * (sides + 1) + j; indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2); }
    }
  }
  for (const ring of [0, rings]) for (let j = 1; j < sides - 1; j++) { const k = ring * (sides + 1); indices.push(...(ring ? [k, k + j + 1, k + j] : [k, k + j, k + j + 1])); }
  const disc = new THREE.BufferGeometry(); disc.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); disc.setIndex(indices); disc.computeVertexNormals(); b.add(disc, SHARK_PART.wing, paint);
  // A proud head and rounded duckbill distinguish an eagle ray from the tank ray.
  b.ellipsoid([-.225, .025, 0], [.225, .078, .102], paint, SHARK_PART.body, close ? 14 : 7);
  b.ellipsoid([-.07, -.008, 0], [.069, .037, .086], paint, SHARK_PART.body, close ? 10 : 6);
  b.tube([[-.87, .008, 0], [-1.18, .015, 0], [-1.65, -.035, .018], [-2.4, -.07, .035]], .021, paint, SHARK_PART.tail, close ? 22 : 10, close ? 6 : 4, true);
  for (const side of [-1, 1]) {
    b.ellipsoid([-.22, .075, side * .079], [.023, .02, .012], eye);
    if (close) b.ellipsoid([-.212, .085, side * .087], [.006, .006, .003], glint, SHARK_PART.face, 5);
    b.fin([-.73, -.012, side * .025], [-.97, -.03, side * .17], [-.96, -.008, side * .022], [0, .004, 0], paint);
  }
  b.tube([[-.065, -.035, -.05], [-.09, -.046, 0], [-.065, -.035, .05]], .004, solid("#716854"), SHARK_PART.face, close ? 8 : 3, 3);
  return b.build();
}

/** One vertex-coloured merged mesh, one material and one draw call. Caller owns it. */
export function createSharkGeometry(species: TunnelSpecies, detail: "close" | "far"): THREE.BufferGeometry {
  return species === "eagleray" ? ray(detail === "close") : shark(species, detail === "close");
}
