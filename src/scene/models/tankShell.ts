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
  return t.shape === "box" ? new THREE.BoxGeometry(t.w, t.h, t.d) : footprintPrism(footprintPoints(t), t.h, true);
}

/** Vertical glass only: no top or bottom; local y is centred on the water. */
export function glassGeometry(type: TankType, inset = 0): THREE.BufferGeometry {
  return footprintPrism(footprintPoints(TANKS[type], inset), TANKS[type].h, false);
}

/** Horizontal footprint, already in x/z with upward-facing normals. */
export function surfaceGeometry(type: TankType, inset = 0.015): THREE.BufferGeometry {
  const p = footprintPoints(TANKS[type], inset);
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
