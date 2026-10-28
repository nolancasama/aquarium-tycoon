import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { SAND_H, STAND_H, TANKS } from "../../game/data/tanks";
import type { TankType } from "../../game/types";
import { clearOfSlots, sandDune } from "../../game/logic/tankLayout";

/**
 * Tank geometry per tank type, in tank-local space (pad centre on the floor):
 * the stand, glass frame and sand (one merged, vertex-coloured mesh), and the
 * water volume. Shared by the placed tank and the placement preview.
 */

const WOOD = "#c58a55";

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
  return new THREE.BoxGeometry(t.w, t.h, t.d);
}
