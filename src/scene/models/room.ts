import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { BENCH, DOOR, HALL2, HALL_DOOR, PEDESTAL, PICO, ROOM } from "../../game/world";
import { SAND_H, SLOT_POS, STAND_H, TANKS } from "../../game/data/tanks";
import type { TankType } from "../../game/types";

/** The room shell and furniture (one merged mesh), and the tank stand/frame per tank type. */

const WALL = "#fbeedb";

interface WallStyle {
  skin?: string;
  low: string;
  rail: string;
  base: string;
}
const HALL1_WALL: WallStyle = { low: "#5cc3d0", rail: "#ffffff", base: "#2b7c99" };
const HALL2_WALL: WallStyle = { skin: "#3f8cc0", low: "#1f6194", rail: "#8fe0f5", base: "#123f63" };

/**
 * One-sided wall dressing on the face at x, pointing into the room (inward ±1):
 * an optional full-height skin, a wainscot, a rail and a baseboard. One-sided so
 * the wall the two halls share can look different from each side.
 */
function dressWall(b: PartBuilder, x: number, inward: number, z0: number, z1: number, s: WallStyle, wallH: number) {
  const len = z1 - z0;
  const z = (z0 + z1) / 2;
  if (s.skin) b.box(0.02, wallH, len, x + inward * 0.01, 0, z, s.skin, 0);
  b.box(0.035, 1.05, len, x + inward * 0.0175, 0, z, s.low);
  b.box(0.06, 0.06, len, x + inward * 0.03, 1.02, z, s.rail);
  b.box(0.07, 0.16, len, x + inward * 0.035, 0, z, s.base);
}

/** One short rope in front of each pad: slot A holds the small tank, slot B the big one. */
const ROPE_POSTS: [number, number][] = [
  [SLOT_POS.A.x - (TANKS.small.w / 2 + 0.45), SLOT_POS.A.x + TANKS.small.w / 2 + 0.45],
  [SLOT_POS.B.x - (TANKS.big.w / 2 + 0.3), SLOT_POS.B.x + TANKS.big.w / 2 + 0.3]
];
const TRIM = "#3f9cc4";
const WOOD = "#c58a55";

export function roomGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.6);
  const { minX, maxX, minZ, maxZ, wallH } = ROOM;
  const t = 0.22;
  // Back wall (the mural is a separate textured plane in front of it).
  b.box(maxX - minX + t * 2, wallH, t, 0, 0, minZ - t / 2, WALL);
  b.box(maxX - minX + t * 2, 0.16, t + 0.04, 0, 0, minZ - t / 2 + 0.02, TRIM);
  b.box(maxX - minX + t * 2, 0.1, t + 0.06, 0, wallH - 0.1, minZ - t / 2 + 0.03, TRIM);
  // Left wall with the entrance opening.
  const doorA = DOOR.z - DOOR.w / 2;
  const doorB = DOOR.z + DOOR.w / 2;
  const leftLen1 = doorA - minZ;
  const leftLen2 = maxZ - doorB;
  b.box(t, wallH, leftLen1, minX - t / 2, 0, minZ + leftLen1 / 2, WALL);
  b.box(t, wallH, leftLen2, minX - t / 2, 0, doorB + leftLen2 / 2, WALL);
  b.box(t, wallH - 2.3, DOOR.w, minX - t / 2, 2.3, DOOR.z, WALL);
  dressWall(b, minX, 1, minZ, doorA, HALL1_WALL, wallH);
  dressWall(b, minX, 1, doorB, maxZ, HALL1_WALL, wallH);
  // Door frame.
  for (const z of [doorA, doorB]) b.box(0.3, 2.4, 0.16, minX, 0, z, "#ffb347");
  b.box(0.3, 0.18, DOOR.w + 0.16, minX, 2.3, DOOR.z, "#ffb347");
  // Right wall, with the doorway to the Ocean Hall (its door is drawn separately).
  const hdA = HALL_DOOR.z - HALL_DOOR.w / 2;
  const hdB = HALL_DOOR.z + HALL_DOOR.w / 2;
  const r1 = hdA - minZ;
  const r2 = maxZ - hdB;
  b.box(t, wallH, r1, maxX + t / 2, 0, minZ + r1 / 2, WALL);
  b.box(t, wallH, r2, maxX + t / 2, 0, hdB + r2 / 2, WALL);
  b.box(t, wallH - 2.3, HALL_DOOR.w, maxX + t / 2, 2.3, HALL_DOOR.z, WALL);
  dressWall(b, maxX, -1, minZ, hdA, HALL1_WALL, wallH);
  dressWall(b, maxX, -1, hdB, maxZ, HALL1_WALL, wallH);
  for (const z of [hdA, hdB]) b.box(0.3, 2.4, 0.16, maxX, 0, z, "#4fb6d8");
  b.box(0.3, 0.18, HALL_DOOR.w + 0.16, maxX, 2.3, HALL_DOOR.z, "#4fb6d8");
  // Pico's counter.
  b.box(1.2, 0.85, 0.6, PICO.x, 0, PICO.z - 0.35, "#2fb3c9");
  b.box(1.3, 0.08, 0.7, PICO.x, 0.85, PICO.z - 0.35, "#ffffff");
  b.box(0.9, 0.5, 0.02, PICO.x, 0.18, PICO.z - 0.04, "#7fd8e6");
  b.sphere(0.13, PICO.x - 0.05, 0.43, PICO.z - 0.02, "#ff8a3d", [1.3, 0.8, 0.3], 10);
  b.add(new THREE.ConeGeometry(0.09, 0.14, 3), "#ff8a3d", [PICO.x + 0.15, 0.43, PICO.z - 0.02], [0, 0, Math.PI / 2], [1, 1, 0.3]);
  // Fish-food jars on the counter.
  for (let i = 0; i < 3; i++) {
    b.cyl(0.07, 0.07, 0.16, PICO.x - 0.35 + i * 0.12, 0.93, PICO.z - 0.45, ["#ffd23f", "#ff7aa2", "#7ad1ff"][i], 10);
    b.cyl(0.075, 0.075, 0.03, PICO.x - 0.35 + i * 0.12, 1.09, PICO.z - 0.45, "#ffffff", 10);
  }
  // The bench (the seat runs along z; visitors sit facing −x).
  b.box(0.5, 0.08, 1.5, BENCH.x, 0.42, BENCH.z, WOOD);
  b.box(0.08, 0.5, 1.5, BENCH.x + 0.24, 0.46, BENCH.z, WOOD);
  for (const dz of [-0.6, 0.6]) b.box(0.45, 0.42, 0.08, BENCH.x, 0, BENCH.z + dz, "#8a5a33");
  // The trophy pedestal.
  b.cyl(0.36, 0.42, 0.12, PEDESTAL.x, 0, PEDESTAL.z, "#e9eef2", 18);
  b.cyl(0.3, 0.32, 0.78, PEDESTAL.x, 0.12, PEDESTAL.z, "#f6f8fa", 18);
  b.cyl(0.38, 0.38, 0.08, PEDESTAL.x, 0.9, PEDESTAL.z, "#ffcc33", 18);
  // Potted plants in the back corners and by the door.
  for (const [x, z, s] of [
    [minX + 0.6, minZ + 0.6, 1.1],
    [maxX - 0.6, minZ + 0.6, 1.1],
    [maxX - 0.6, maxZ - 1.2, 0.9],
    [minX + 0.55, DOOR.z - 1.35, 0.8]
  ]) {
    b.cyl(0.24 * s, 0.18 * s, 0.4 * s, x, 0, z, "#e07a4f", 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(new THREE.SphereGeometry(1, 8, 6), i % 2 ? "#3cbf61" : "#2fa651", [x + Math.cos(a) * 0.12 * s, 0.75 * s, z + Math.sin(a) * 0.12 * s], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], [0.07 * s, 0.38 * s, 0.035 * s]);
    }
  }
  // Rope posts in front of each tank pad (outside the close-up frame).
  for (const x of ROPE_POSTS.flat()) {
    b.cyl(0.05, 0.08, 0.65, x, 0, -1.4, "#d4a017", 8);
    b.sphere(0.07, x, 0.67, -1.4, "#ffcc33", [1, 1, 1], 8);
  }
  return b.build();
}

/** Velvet ropes between the posts (a separate thin mesh, sagging). */
/** The Ocean Hall's walls, furniture and ropes (the floor and mural are separate textured planes). */
export function hall2Geometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.6);
  const { minX, maxX, minZ, maxZ, wallH } = HALL2;
  const t = 0.22;
  const wall = HALL2_WALL.skin!;
  const trim = HALL2_WALL.base;
  b.box(maxX - minX + t, wallH, t, (minX + maxX) / 2, 0, minZ - t / 2, wall);
  b.box(maxX - minX + t, 0.16, t + 0.04, (minX + maxX) / 2, 0, minZ - t / 2 + 0.02, trim);
  b.box(maxX - minX + t, 0.1, t + 0.06, (minX + maxX) / 2, wallH - 0.1, minZ - t / 2 + 0.03, trim);
  b.box(t, wallH, maxZ - minZ, maxX + t / 2, 0, (minZ + maxZ) / 2, wall);
  dressWall(b, maxX, -1, minZ, maxZ, { ...HALL2_WALL, skin: undefined }, wallH);
  // The shared wall's Ocean-side face (the Hall 1 side is cream and teal).
  const face = ROOM.maxX + t;
  const hdA = HALL_DOOR.z - HALL_DOOR.w / 2;
  const hdB = HALL_DOOR.z + HALL_DOOR.w / 2;
  dressWall(b, face, 1, minZ, hdA, HALL2_WALL, wallH);
  dressWall(b, face, 1, hdB, maxZ, HALL2_WALL, wallH);
  b.box(0.02, wallH - 2.3, HALL_DOOR.w, face + 0.01, 2.3, HALL_DOOR.z, wall);
  // A light wave band with bubble dots along the top of the side walls.
  for (const [x, inward] of [[face, 1], [maxX, -1]] as const) {
    b.box(0.03, 0.07, maxZ - minZ, x + inward * 0.015, wallH - 0.5, (minZ + maxZ) / 2, "#6cc6e8", 0);
    for (let z = minZ + 0.3, i = 0; z < maxZ - 0.2; z += 0.42, i++) {
      if (x === face && z > hdA - 0.1 && z < hdB + 0.1) continue;
      b.sphere(i % 2 ? 0.05 : 0.08, x + inward * 0.02, wallH - (i % 2 ? 0.3 : 0.7), z, "#bfeeff", [0.3, 1, 1], 8);
    }
  }
  // Round portholes on the right wall.
  for (const z of [-1.8, 0.9]) {
    b.add(new THREE.TorusGeometry(0.45, 0.07, 6, 20), "#c9a227", [maxX - 0.03, 1.7, z], [0, Math.PI / 2, 0]);
    b.add(new THREE.CircleGeometry(0.42, 20), "#2a7fbf", [maxX - 0.06, 1.7, z], [0, -Math.PI / 2, 0]);
  }
  // Kelp pots in the corners and a low bench for grown-ups.
  for (const [x, z] of [
    [minX + 0.6, minZ + 0.5],
    [maxX - 0.6, minZ + 0.5],
    [maxX - 0.6, maxZ - 0.8]
  ]) {
    b.cyl(0.26, 0.2, 0.42, x, 0, z, "#3a6f8f", 12);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(new THREE.SphereGeometry(1, 8, 6), i % 2 ? "#3cb371" : "#2e8b57", [x + Math.cos(a) * 0.1, 0.95, z + Math.sin(a) * 0.1], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], [0.06, 0.6, 0.03]);
    }
  }
  // Ropes in front of pads C, D and E.
  const posts: [number, number][] = [
    [SLOT_POS.C.x - (TANKS.ocean.w / 2 + 0.35), SLOT_POS.C.x + TANKS.ocean.w / 2 + 0.35],
    [SLOT_POS.D.x - (TANKS.big.w / 2 + 0.25), SLOT_POS.D.x + TANKS.big.w / 2 + 0.25],
    [SLOT_POS.E.x - (TANKS.big.w / 2 + 0.25), SLOT_POS.E.x + TANKS.big.w / 2 + 0.25]
  ];
  for (const [x0, x1] of posts) {
    for (const x of [x0, x1]) {
      b.cyl(0.05, 0.08, 0.65, x, 0, -1.4, "#d4a017", 8);
      b.sphere(0.07, x, 0.67, -1.4, "#ffcc33", [1, 1, 1], 8);
    }
    const n = 10;
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n;
      const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      const ya = 0.6 - Math.sin((i / n) * Math.PI) * 0.1;
      const yb = 0.6 - Math.sin(((i + 1) / n) * Math.PI) * 0.1;
      b.add(new THREE.CylinderGeometry(0.022, 0.022, Math.hypot(xb - xa, yb - ya), 6), "#c92a4a", [(xa + xb) / 2, (ya + yb) / 2, -1.4], [0, 0, Math.PI / 2 + Math.atan2(yb - ya, xb - xa)], [1, 1, 1], { vary: false });
    }
  }
  return b.build();
}

export function ropeGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  for (const [a, c] of ROPE_POSTS) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const x0 = a + (c - a) * t0;
      const x1 = a + (c - a) * t1;
      const y0 = 0.6 - Math.sin(t0 * Math.PI) * 0.1;
      const y1 = 0.6 - Math.sin(t1 * Math.PI) * 0.1;
      const len = Math.hypot(x1 - x0, y1 - y0);
      b.add(new THREE.CylinderGeometry(0.022, 0.022, len, 6), "#c92a4a", [(x0 + x1) / 2, (y0 + y1) / 2, -1.4], [0, 0, Math.PI / 2 + Math.atan2(y1 - y0, x1 - x0)], [1, 1, 1], { vary: false });
    }
  }
  return b.build();
}

/** Stand, glass frame, lamp bar and sand for one tank type (tank-local: pad centre on the floor). */
export function tankShellGeometry(type: TankType): THREE.BufferGeometry {
  const t = TANKS[type];
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
  b.sphere(w * 0.32, -w * 0.18, y0 + SAND_H - 0.01, -d * 0.18, "#e6cf94", [1, 0.09, 0.55], 16);
  const pebble = ["#f2b5c6", "#a9d8f5", "#ffe08a", "#c3e8b8", "#ffffff"];
  for (let i = 0; i < (type === "big" ? 34 : 24); i++) {
    b.add(new THREE.IcosahedronGeometry(0.014 + r() * 0.01, 0), pebble[i % pebble.length], [(r() - 0.5) * (w - 0.08), y0 + SAND_H, (r() - 0.5) * (d - 0.08)], [r(), r(), r()], [1, 0.6, 1]);
  }
  return b.build();
}
