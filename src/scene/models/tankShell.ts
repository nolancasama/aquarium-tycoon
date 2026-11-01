import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { SAND_H, STAND_H, TANKS, type TankDef } from "../../game/data/tanks";
import type { TankType } from "../../game/types";
import { clearOfSlots, footprintContains, footprintPoints, sandDune, sandSurfaceY } from "../../game/logic/tankLayout";

/**
 * Tank geometry per tank type, in tank-local space (pad centre on the floor):
 * the stand, glass frame and sand (one merged, vertex-coloured mesh), and the
 * water volume. Shared by the placed tank and the placement preview.
 */

const WOOD = "#c58a55";

/** Stand, glass frame, lamp bar and sand for one tank type (tank-local: pad centre on the floor). */
export function tankShellGeometry(type: TankType): THREE.BufferGeometry {
  const t = TANKS[type];
  if (type === "reef") return reefShellGeometry(t);
  if (t.group === "special") return specialShellGeometry(t);
  const b = new PartBuilder(0.4);
  const w = t.w;
  const d = t.d;
  const h = t.h;
  // Wooden cabinet with two doors.
  b.box(w + 0.16, 0.08, d + 0.14, 0, 0, 0, "#7a4a28");
  // The Ocean tank stands on blue stone; the others on wood.
  b.box(w + 0.12, STAND_H - 0.12, d + 0.1, 0, 0.08, 0, type === "ocean" ? "#6f8fa8" : WOOD);
  b.box(w + 0.18, 0.05, d + 0.16, 0, STAND_H - 0.05, 0, "#8f5a30");
  // Brass trim under the top and above the plinth.
  b.box(w + 0.14, 0.022, d + 0.12, 0, STAND_H - 0.075, 0, "#e3b53c");
  b.box(w + 0.14, 0.018, d + 0.12, 0, 0.08, 0, "#e3b53c");
  for (const s of [-1, 1]) {
    b.box((w + 0.12) / 2 - 0.08, STAND_H - 0.28, 0.02, (s * (w + 0.12)) / 4, 0.16, d / 2 + 0.05, "#b57744");
    b.sphere(0.025, s * 0.07, STAND_H * 0.55, d / 2 + 0.07, "#ffcc33", [1, 1, 1], 8);
  }
  // Glass frame: bottom and top rims, corner posts.
  const rim = "#1f4a66";
  const y0 = STAND_H;
  for (const [rw, rd, x, z] of [
    [w + 0.06, 0.04, 0, d / 2 + 0.01],
    [w + 0.06, 0.04, 0, -d / 2 - 0.01],
    [0.04, d + 0.06, w / 2 + 0.01, 0],
    [0.04, d + 0.06, -w / 2 - 0.01, 0]
  ] as const) {
    b.box(rw, 0.06, rd, x, y0 - 0.01, z, rim);
    b.box(rw, 0.05, rd, x, y0 + h - 0.01, z, rim);
  }
  for (const [x, z] of [
    [w / 2 + 0.01, d / 2 + 0.01],
    [-w / 2 - 0.01, d / 2 + 0.01],
    [w / 2 + 0.01, -d / 2 - 0.01],
    [-w / 2 - 0.01, -d / 2 - 0.01]
  ]) {
    b.box(0.035, h, 0.035, x, y0, z, rim);
  }
  // Lamp bar along the back of the top.
  b.box(w * 0.9, 0.06, 0.14, 0, y0 + h + 0.04, -d / 2 + 0.07, "#24313d");
  b.box(w * 0.86, 0.02, 0.08, 0, y0 + h + 0.025, -d / 2 + 0.07, "#fffbe0");
  // A filter box in the back corner (bubbles rise from it).
  b.box(0.07, h * 0.45, 0.06, w / 2 - 0.07, y0 + SAND_H, -d / 2 + 0.05, "#6f93a8");
  b.cyl(0.02, 0.02, 0.05, w / 2 - 0.07, y0 + SAND_H + h * 0.45, -d / 2 + 0.05, "#9fc3d6", 8);
  // Sand with a soft dune and coloured pebbles.
  b.box(w - 0.01, SAND_H, d - 0.01, 0, y0, 0, "#ecd9a4");
  let seed = type === "big" ? 9 : 4;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const dune = sandDune(t);
  // Fine enough that rings and shadows draped on the analytic dune stay within millimetres of it.
  b.sphere(dune.radius, dune.x, dune.y, dune.z, "#e6cf94", [1, 0.09, 0.55], 24);
  const pebble = ["#f2b5c6", "#a9d8f5", "#ffe08a", "#c3e8b8", "#ffffff"];
  for (let i = 0; i < (type === "big" ? 34 : 24); i++) {
    // Draw every value so the remaining pebbles keep their places; none sit under a slot ring.
    const size = 0.014 + r() * 0.01;
    const x = (r() - 0.5) * (w - 0.08);
    const z = (r() - 0.5) * (d - 0.08);
    const spin: [number, number, number] = [r(), r(), r()];
    if (clearOfSlots(t, x, z)) b.add(new THREE.IcosahedronGeometry(size, 0), pebble[i % pebble.length], [x, y0 + SAND_H, z], spin, [1, 0.6, 1]);
  }
  return b.build();
}

/** The water volume (centred on its own middle; the caller lifts it to STAND_H + h / 2). */
export function waterGeometry(type: TankType): THREE.BufferGeometry {
  const t = TANKS[type];
  return t.shape === "box" ? new THREE.BoxGeometry(t.w, t.h, t.d) : footprintPrism(t.shape === "reef" ? reefFootprint(t) : footprintPoints(t), t.h, true);
}

/** Vertical glass only: no top or bottom; local y is centred on the water. */
export function glassGeometry(type: TankType, inset = 0): THREE.BufferGeometry {
  const t = TANKS[type];
  return footprintPrism(t.shape === "reef" ? reefFootprint(t, inset) : footprintPoints(t, inset), t.h, false);
}

/** Horizontal footprint, already in x/z with upward-facing normals. */
export function surfaceGeometry(type: TankType, inset = 0.015): THREE.BufferGeometry {
  const p = TANKS[type].shape === "reef" ? reefFootprint(TANKS[type], inset) : footprintPoints(TANKS[type], inset);
  const positions: number[] = [];
  const uv: number[] = [];
  const t = TANKS[type];
  for (let i = 0; i < p.length; i++) {
    for (const v of [{ x: 0, z: 0 }, p[(i + 1) % p.length], p[i]]) {
      positions.push(v.x, 0, v.z);
      uv.push(v.x / t.w + 0.5, (v.z + t.d / 2) / (t.d + (t.bulge ?? 0)));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Convex footprint extrusion, with outward wall normals and explicit top/bottom caps. */
function footprintPrism(points: { x: number; z: number }[], height: number, caps: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) perimeter += Math.hypot(points[(i + 1) % points.length].x - points[i].x, points[(i + 1) % points.length].z - points[i].z);
  let distance = 0;
  const add = (x: number, y: number, z: number, u: number, v: number) => { pos.push(x, y, z); uv.push(u, v); };
  const lo = -height / 2;
  const hi = height / 2;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const next = distance + Math.hypot(b.x - a.x, b.z - a.z);
    const u = distance / perimeter;
    const v = next / perimeter;
    add(a.x, lo, a.z, u, 0); add(b.x, hi, b.z, v, 1); add(b.x, lo, b.z, v, 0);
    add(a.x, lo, a.z, u, 0); add(a.x, hi, a.z, u, 1); add(b.x, hi, b.z, v, 1);
    if (caps) {
      add(0, hi, 0, 0.5, 0.5); add(b.x, hi, b.z, 1, 1); add(a.x, hi, a.z, 0, 0);
      add(0, lo, 0, 0.5, 0.5); add(a.x, lo, a.z, 0, 0); add(b.x, lo, b.z, 1, 1);
    }
    distance = next;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function slab(b: PartBuilder, t: TankDef, height: number, y: number, inset: number, color: string) {
  b.add(footprintPrism(footprintPoints(t, inset), height, true), color, [0, y + height / 2, 0]);
}

function rim(b: PartBuilder, t: TankDef, y: number, color: string, thickness = 0.035, height = 0.04) {
  const p = footprintPoints(t);
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const c = p[(i + 1) % p.length];
    b.box(Math.hypot(c.x - a.x, c.z - a.z) + thickness * 0.25, height, thickness,
      (a.x + c.x) / 2, y, (a.z + c.z) / 2, color, -Math.atan2(c.z - a.z, c.x - a.x));
  }
}

function specialShellGeometry(t: TankDef): THREE.BufferGeometry {
  const b = new PartBuilder(0.4);
  const cave = t.type === "cave";
  const bow = t.shape === "bow";
  const round = t.shape === "round";
  slab(b, t, 0.09, 0, -0.075, bow || cave ? "#525e66" : "#704c36");
  slab(b, t, STAND_H - 0.16, 0.09, -0.035, round ? "#3a607a" : cave ? "#607079" : WOOD);
  slab(b, t, 0.07, STAND_H - 0.07, -0.065, bow ? "#6b4b34" : "#6d4936");
  rim(b, t, 0.095, round ? "#c8f5ff" : "#dfb55f", 0.065, 0.022);
  rim(b, t, STAND_H - 0.055, "#e4be6a", 0.075, 0.025);
  rim(b, t, STAND_H - 0.008, round ? "#5b869d" : "#2e5266", 0.048, 0.05);
  rim(b, t, STAND_H + t.h - 0.02, round ? "#53798e" : "#2e5266", 0.052, 0.05);
  if (!round) {
    const p = t.shape === "bow" ? footprintPoints({ ...t, shape: "box" }) : footprintPoints(t);
    for (const v of p) b.box(0.031, t.h, 0.031, v.x, STAND_H, v.z, t.shape === "hex" ? "#bb9157" : "#36576a");
    // Cabinets keep the front profile; the Panorama doors also follow its curve.
    for (const x of [-t.w * 0.23, t.w * 0.23]) {
      const front = t.d / 2 + (bow ? (t.bulge ?? 0) * (1 - (2 * x / t.w) ** 2) : 0);
      b.sphere(0.024, x, STAND_H * 0.5, front + 0.045, "#edc56b", [1, 1, 1], 8);
    }
  }
  if (t.shape === "hex") {
    rim(b, t, STAND_H + t.h + 0.035, "#f8e5ab", 0.065, 0.025);
    rim(b, t, STAND_H + t.h + 0.06, "#bb9157", 0.075, 0.025);
  }
  if (round) {
    // Coloured emissive bands are drawn separately by Tank, leaving one merged opaque shell.
    slab(b, t, 0.055, STAND_H + t.h + 0.025, -0.035, "#38596e");
  } else {
    b.box(t.w * 0.82, 0.055, 0.1, 0, STAND_H + t.h + 0.035, -t.d / 2 + 0.08, "#24313d");
    b.box(t.w * 0.76, 0.018, 0.065, 0, STAND_H + t.h + 0.025, -t.d / 2 + 0.08, "#fff4c5");
  }
  // A compact built-in filter stays inside each footprint, including the hex diagonal.
  const filterX = round || t.shape === "hex" ? t.w * 0.2 : t.w / 2 - 0.08;
  const filterZ = round || t.shape === "hex" ? -t.d * 0.24 : -t.d / 2 + 0.08;
  b.box(0.06, t.h * 0.36, 0.055, filterX, STAND_H + SAND_H, filterZ, "#668b9d");
  slab(b, t, SAND_H, STAND_H, 0.007, cave ? "#67706d" : "#ecd9a4");
  const dune = sandDune(t);
  b.sphere(dune.radius, dune.x, dune.y, dune.z, cave ? "#747d77" : "#e6cf94", [1, 0.09, 0.55], 24);
  let seed = 4;
  const r = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const colors = cave ? ["#8a9391", "#596566", "#b0aaa0"] : ["#f2b5c6", "#a9d8f5", "#ffe08a", "#c3e8b8", "#ffffff"];
  for (let i = 0; i < (bow ? 36 : 24); i++) {
    const size = 0.014 + r() * 0.01;
    const x = (r() - 0.5) * (t.w - 0.08);
    const z = (r() - 0.5) * (t.d - 0.08) + (bow ? (t.bulge ?? 0) * 0.3 : 0);
    const spin: [number, number, number] = [r(), r(), r()];
    if (footprintContains(t, x, z, size + 0.01) && clearOfSlots(t, x, z)) {
      b.add(new THREE.IcosahedronGeometry(size, 0), colors[i % colors.length], [x, sandSurfaceY(t, x, z), z], spin, [1, 0.6, 1]);
    }
  }
  if (cave) caveRockwork(b, t);
  return b.build();
}

/** Rock wall with real apertures, dark recessed backs and layered side formations. */
function caveRockwork(b: PartBuilder, t: TankDef) {
  const wall = new THREE.Shape();
  wall.moveTo(-t.w / 2 + 0.012, SAND_H);
  wall.lineTo(t.w / 2 - 0.012, SAND_H);
  wall.lineTo(t.w / 2 - 0.012, t.h * 0.88);
  for (let i = 8; i >= 0; i--) wall.lineTo(-t.w / 2 + 0.012 + (t.w - 0.024) * i / 8, t.h * (0.87 + 0.055 * Math.sin(i * 2.7)));
  wall.closePath();
  for (const den of t.dens ?? []) {
    const hole = new THREE.Path();
    hole.absellipse(den.x, den.y, 0.12, 0.085, 0, Math.PI * 2, true, 0);
    wall.holes.push(hole);
    const mouth = new THREE.CircleGeometry(1, 12);
    b.add(mouth, "#14232a", [den.x, STAND_H + den.y, den.z - 0.035], [0, 0, 0], [0.12, 0.085, 1], { vary: false });
  }
  b.add(new THREE.ExtrudeGeometry(wall, { depth: (t.backRock ?? 0.28) - 0.012, steps: 1, bevelEnabled: false, curveSegments: 3 }),
    "#56666d", [0, STAND_H, -t.d / 2 + 0.012]);
  // Shallow irregular strata on the back face. Gaps leave every den mouth and
  // its rim unobstructed; all relief is merged into the same static shell.
  for (let layer = 0; layer < 5; layer++) {
    const y = 0.12 + layer * 0.165;
    for (let column = 0; column < 6; column++) {
      const x = -t.w * 0.405 + column * t.w * 0.16 + (layer % 2) * 0.035;
      const width = t.w * (0.139 + 0.009 * ((column + layer) % 3));
      const height = 0.10 + (column % 2) * 0.025;
      if ((t.dens ?? []).some((den) => Math.abs(x - den.x) < width / 2 + 0.145 && Math.abs(y - den.y) < height / 2 + 0.105)) continue;
      b.add(new THREE.IcosahedronGeometry(1, 0), layer % 2 ? "#7a8581" : "#667675",
        [x, STAND_H + y, -t.d / 2 + (t.backRock ?? 0.28) - 0.004],
        [0, 0, 0], [width * 0.58, height * 0.65, 0.025]);
    }
  }
  // Narrow strata at the back and ends read as low-poly layered stone, without covering dens.
  for (let level = 0; level < 4; level++) {
    const y = STAND_H + SAND_H + level * t.h * 0.205;
    const depth = 0.72 - level * 0.065;
    for (const side of [-1, 1]) {
      const width = 0.11 + (level % 2) * 0.035;
      b.add(new THREE.CylinderGeometry(1, 1, 1, 6), level % 2 ? "#6c797b" : "#738183",
        [side * (t.w / 2 - width / 2 - 0.012), y + t.h * 0.098, -t.d / 2 + depth / 2 + 0.012],
        [0, 0, 0], [width * 0.5, t.h * 0.205, depth * 0.5]);
    }
  }
  for (const rock of t.rocks ?? []) {
    const floor = sandSurfaceY(t, rock.x, rock.z);
    const height = STAND_H + rock.top - floor;
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const span = bounds.max.y - bounds.min.y;
    geometry.translate(0, -(bounds.min.y + bounds.max.y) / 2, 0);
    b.add(geometry, "#7c8985", [rock.x, floor + height / 2, rock.z],
      [0, 0, 0], [Math.min(rock.r, t.w / 2 - Math.abs(rock.x) - 0.012), height / span, rock.r * 0.8]);
  }
}

/** Eight individually glazed faces on a freestanding stone island. The small
 * corner cut stays outside the existing rectangular swim bounds for every
 * reef species (minimum body-centre inset 0.09 m along both axes). */
export function reefFootprint(t: Pick<TankDef, "w" | "d">, inset = 0) {
  const x = t.w / 2 - inset, z = t.d / 2 - inset;
  const cut = Math.max(0.01, 0.16 - inset * (2 - Math.SQRT2));
  return [{ x: -x + cut, z: -z }, { x: x - cut, z: -z },
    { x, z: -z + cut }, { x, z: z - cut },
    { x: x - cut, z }, { x: -x + cut, z },
    { x: -x, z: z - cut }, { x: -x, z: -z + cut }];
}

function reefShellGeometry(t: TankDef): THREE.BufferGeometry {
  const b = new PartBuilder(0.16);
  const slab = (height: number, y: number, inset: number, color: string) =>
    b.add(footprintPrism(reefFootprint(t, inset), height, true), color, [0, y + height / 2, 0]);
  const trim = (y: number, color: string, height: number, thickness: number) => {
    const p = reefFootprint(t);
    for (let i = 0; i < p.length; i++) {
      const a = p[i], c = p[(i + 1) % p.length];
      b.box(Math.hypot(c.x - a.x, c.z - a.z) + 0.01, height, thickness,
        (a.x + c.x) / 2, y, (a.z + c.z) / 2, color, -Math.atan2(c.z - a.z, c.x - a.x));
    }
  };
  slab(0.09, 0, -0.12, "#577d7b");
  slab(STAND_H - 0.17, 0.09, -0.065, "#dfcaa1");
  slab(0.08, STAND_H - 0.08, -0.105, "#e8e1c9");
  trim(0.12, "#c58e59", 0.024, 0.15);
  trim(STAND_H - 0.075, "#b58150", 0.025, 0.16);
  trim(STAND_H - 0.012, "#457f82", 0.055, 0.06);
  trim(STAND_H + t.h - 0.012, "#387276", 0.045, 0.045);
  for (const p of reefFootprint(t)) b.box(0.023, t.h, 0.023, p.x, STAND_H, p.z, "#72a7aa");
  // Recessed turquoise panels on both long viewing faces; no back wall.
  for (const side of [-1, 1]) for (const x of [-1.7, 0, 1.7]) {
    b.box(1.28, 0.32, 0.012, x, 0.23, side * (t.d / 2 + 0.067), "#639b94");
    b.box(1.08, 0.018, 0.016, x, 0.27, side * (t.d / 2 + 0.075), "#8dbbb0");
  }
  slab(SAND_H, STAND_H, 0.008, "#ecd9a4");
  const dune = sandDune(t);
  b.sphere(dune.radius, dune.x, dune.y, dune.z, "#e6cf94", [1, 0.09, 0.55], 24);
  // The whole reef (rock bank, arch, ledges, coral) is one opaque batch. Every
  // solid stays inside its 'rocks' avoidance column, and nothing overhangs the
  // column-free lane between the arch towers below the animals' ceiling.
  const rocks = t.rocks ?? [];
  const towers = rocks.filter((r) => r.top >= t.h - 0.05);
  rocks.forEach((rock, i) => {
    const floor = sandSurfaceY(t, rock.x, rock.z);
    const top = STAND_H + rock.top;
    if (rock.top <= 0.25) return reefLedge(b, t, rock, floor, top, i);
    if (towers.includes(rock)) return reefMound(b, t, rock, floor, STAND_H + 1.74, i, true);
    // Coral grows up to the column top; the rock under it stops short.
    reefMound(b, t, rock, floor, top - 0.24, i, false);
    reefCoral(b, t, rock, floor, top, i);
  });
  if (towers.length === 2) reefArch(b, t, towers);
  // Sparse sand rubble avoids both the purchasing rings and the open passage.
  for (let i = 0; i < 30; i++) {
    const x = Math.sin(i * 2.4) * 2.35, z = Math.cos(i * 1.7) * 0.96;
    if (clearOfSlots(t, x, z) && Math.abs(x) > 0.4) {
      b.add(new THREE.IcosahedronGeometry(0.018, 0), i % 2 ? "#e4d0a3" : "#c8bca4",
        [x, sandSurfaceY(t, x, z), z], [0, 0, 0], [1.3, 0.5, 1]);
    }
  }
  return b.build();
}

type ReefRock = NonNullable<TankDef["rocks"]>[number];

const REEF_ROCK = ["#b9a48a", "#a89480", "#c6ae94"];
const REEF_LIME = ["#c98aa6", "#a688c4", "#d69c8c"];
const REEF_COLOR = ["#f08a5d", "#f4c64e", "#ee7ea3", "#5fbfae", "#a77ad3", "#ff9f6e"];

/** Seeded 0..1 noise, so a jittered vertex shared by several faces moves once. */
function hash3(x: number, y: number, z: number, seed: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 19.31) * 43758.5453;
  return s - Math.floor(s);
}

/** A lumpy boulder: a jittered icosphere, radius 0.84–1.06 before scaling. */
function lump(seed: number, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.84 + 0.22 * hash3(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100), seed);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** How far a formation may spread: its avoidance column, kept off the glass. */
function reefReach(t: TankDef, rock: ReefRock) {
  return Math.min(rock.r, t.w / 2 - Math.abs(rock.x) - 0.05, t.d / 2 - Math.abs(rock.z) - 0.05);
}

/** A tilted cylinder from a base point (branches, stalks). */
function branch(b: PartBuilder, base: THREE.Vector3, len: number, rBot: number, rTop: number, tiltX: number, tiltZ: number, color: string) {
  const rot = new THREE.Euler(tiltX, 0, tiltZ);
  const mid = new THREE.Vector3(0, len / 2, 0).applyEuler(rot).add(base);
  b.add(new THREE.CylinderGeometry(rTop, rBot, len, 5, 1, true), color, [mid.x, mid.y, mid.z], [tiltX, 0, tiltZ]);
  return new THREE.Vector3(0, len, 0).applyEuler(rot).add(base);
}

/** Stacked, overlapping boulders tapering to `top`, with coralline and colour patches. */
function reefMound(b: PartBuilder, t: TankDef, rock: ReefRock, floor: number, top: number, i: number, tower: boolean) {
  const R = reefReach(t, rock) * 0.8;
  const h = top - floor;
  const layers = tower ? 6 : 4;
  for (let l = 0; l < layers; l++) {
    const f = l / layers;
    const rad = R * (1 - f * (tower ? 0.42 : 0.55));
    const a = i * 1.7 + l * 2.1;
    const off = R * 0.16;
    b.add(lump(i * 31 + l), (i + l) % 3 === 0 ? REEF_LIME[(i + l) % 3] : REEF_ROCK[(i + l) % 3],
      [rock.x + Math.cos(a) * off, floor + h * (0.12 + f * 0.86), rock.z + Math.sin(a) * off],
      [0, a, 0], [rad, h / layers * (tower ? 1.05 : 0.8), rad * 0.9]);
  }
  // Encrusting colour on the visible faces.
  for (let k = 0; k < (tower ? 7 : 5); k++) {
    const f = 0.15 + 0.75 * hash3(i, k, 2, 5);
    const rad = R * (1 - f * (tower ? 0.42 : 0.55)) * 0.86;
    const a = -Math.PI / 2 + (hash3(i, k, 3, 7) - 0.5) * 2.6 + Math.PI; // front half (+z)
    b.add(lump(i * 7 + k, 0), REEF_COLOR[(i + k) % REEF_COLOR.length],
      [rock.x + Math.sin(a) * rad, floor + h * f, rock.z - Math.cos(a) * rad],
      [0, a, 0], [0.06 + 0.03 * hash3(k, i, 4, 1), 0.04, 0.05]);
  }
  // A dark crevice at the foot of some formations, where small fish hide.
  if (!tower && i % 3 === 1) {
    b.add(lump(i, 0), "#3b302c", [rock.x + R * 0.1, floor + 0.07, rock.z + R * 0.82], [0, 0, 0], [0.11, 0.07, 0.05], { vary: false });
  }
}

/** Branching coral on top, and a table-coral shelf on the bigger formations. */
function reefCoral(b: PartBuilder, t: TankDef, rock: ReefRock, floor: number, top: number, i: number) {
  const R = reefReach(t, rock) * 0.8;
  const color = REEF_COLOR[(i * 2) % REEF_COLOR.length];
  const tip = ["#ffe0c8", "#fff1b8", "#ffd3e2", "#c9f2ea", "#e7d4f7", "#ffe1cc"][(i * 2) % 6];
  const base = top - 0.27;
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI * 2 / 6 + i;
    const s = R * 0.42 * hash3(i, k, 5, 2);
    const start = new THREE.Vector3(rock.x + Math.cos(a) * s, base, rock.z + Math.sin(a) * s);
    const tiltX = Math.sin(a) * 0.32, tiltZ = -Math.cos(a) * 0.32;
    const len = 0.16 + 0.07 * hash3(k, i, 6, 3);
    const end = branch(b, start, len, 0.022, 0.014, tiltX, tiltZ, color);
    const fork = branch(b, end, 0.08, 0.013, 0.009, tiltX * 1.6, tiltZ * 1.6, color);
    b.add(new THREE.IcosahedronGeometry(0.016, 0), tip, [fork.x, fork.y, fork.z]);
    b.add(new THREE.IcosahedronGeometry(0.014, 0), tip, [end.x, end.y, end.z]);
  }
  if (rock.r >= 0.45 && i % 2 === 0) {
    // A table coral cantilevered toward the visitors, inside the column.
    const y = floor + (top - floor) * 0.5;
    const r = Math.min(0.26, R * 0.62);
    const x = rock.x + R * 0.12, z = rock.z + R - r;
    branch(b, new THREE.Vector3(x, y - 0.12, z - r * 0.4), 0.13, 0.03, 0.022, 0.35, 0, "#c99a6c");
    b.cyl(r, r * 0.86, 0.028, x, y, z, i % 4 ? "#e0a96e" : "#86c4a2", 12);
    b.cyl(r * 0.7, r * 0.6, 0.02, x, y + 0.028, z, i % 4 ? "#efc596" : "#a9dcbf", 12);
  }
}

/** A low flat-topped ledge (a placement surface) skirted with rock. */
function reefLedge(b: PartBuilder, t: TankDef, rock: ReefRock, floor: number, top: number, i: number) {
  const r = Math.min(reefReach(t, rock) * 0.7, 0.22);
  const h = top - floor;
  b.cyl(r, r * 1.05, h - 0.02, rock.x, floor, rock.z, REEF_ROCK[i % 3], 14);
  b.cyl(r, r, 0.02, rock.x, top - 0.02, rock.z, "#dcc6a2", 14);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + i;
    b.add(lump(i * 13 + k, 0), k % 3 ? REEF_ROCK[k % 3] : REEF_LIME[k % 3],
      [rock.x + Math.cos(a) * r * 0.86, floor + h * 0.38, rock.z + Math.sin(a) * r * 0.86],
      [0, a, 0], [0.07, h * 0.5, 0.06]);
  }
}

/** A thin organic bridge between the two towers. Over the column-free lane
 * (|x| below the towers' inner edge) its underside stays at the surface, above
 * the highest animal body (h - 0.07); it bends down only inside the towers. */
function reefArch(b: PartBuilder, t: TankDef, towers: ReefRock[]) {
  const [l, r] = [...towers].sort((a, c) => a.x - c.x);
  const z = (l.z + r.z) / 2;
  const inner = r.x - r.r;
  const crown = STAND_H + t.h - 0.025;
  const pts = [
    [l.x - 0.08, STAND_H + 1.6], [l.x + 0.1, STAND_H + 1.84], [-inner, crown - 0.004],
    [0, crown], [inner, crown - 0.004], [r.x - 0.1, STAND_H + 1.84], [r.x + 0.08, STAND_H + 1.6]
  ].map(([x, y]) => new THREE.Vector3(x, y, z));
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.04, 7), "#bba68d", [0, 0, 0]);
  // Shoulders thicken where the arch meets each tower.
  for (const tw of [l, r]) for (let k = 0; k < 3; k++) {
    const s = Math.sign(tw.x);
    b.add(lump(k + (s > 0 ? 50 : 60)), k === 1 ? REEF_LIME[k] : REEF_ROCK[k],
      [tw.x - s * (0.06 + k * 0.07), STAND_H + 1.66 + k * 0.08, z],
      [0, k, 0], [0.15 - k * 0.025, 0.12, 0.13]);
  }
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * inner * 0.45;
    b.add(lump(k + 70, 0), REEF_COLOR[k], [x, crown + 0.03, z], [0, k, 0], [0.05, 0.025, 0.04]);
  }
}
