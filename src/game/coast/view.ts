import { coastCamera, EXHIBITS, type CoastView } from "../data/coast";
import type { CameraShot } from "../runtime";
import type { Vec3 } from "../types";
import { COAST_HABITATS_SHOWN } from "../data/release";

export const COAST_VIEW_SECONDS = 0.8;
export type CoastQuestionFrame = "water" | "count";

/** Natural 35 degree lens; gallery eyes stay 1.6 m above its permanent floor. */
export function coastExhibitShot(view: CoastView, aspect: number, underwater: boolean, question?: CoastQuestionFrame, animals: readonly Vec3[] = []): CameraShot {
  const ex = EXHIBITS.penguins;
  const world = (x: number, y: number, z: number): Vec3 => ({ x: ex.x + x, y, z: ex.z + z });
  // Extra portrait retreat leaves the full-width room arrows clear of the shore.
  const portrait = Math.max(0, 1.7 - aspect);
  const k = Math.max(1, 1.78 / aspect) + portrait * 0.5;
  if (view !== "penguins" && !(view === "all" && COAST_HABITATS_SHOWN.length === 1 && COAST_HABITATS_SHOWN[0] === "penguins")) return coastCamera(view, false, underwater);
  if (question) {
    const points = animals.length ? animals : question === "count"
      ? [world(-9, 2.5, -8), world(9, -2.5, 10)]
      : [world(-9, -2.5, 0), world(9, 1.5, 10)];
    const center = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length, z: sum.z + p.z / points.length }), { x: 0, y: 0, z: 0 });
    const spread = Math.max(2, ...points.map((p) => Math.hypot(p.x - center.x, (p.y - center.y) * 1.5, p.z - center.z)));
    const distance = Math.max(12, spread * 6.2) * k;
    return { pos: { x: center.x, y: center.y + distance * 0.622, z: center.z + distance * 0.783 }, target: { ...center, y: center.y + 0.3 } };
  }
  if (underwater) return { pos: world(0, -1.45, 17), target: world(0, -0.8, 4) };
  // The tall fallback has more vertical scene space. Aim higher to keep its
  // extra pool area below the care bar while the entire shore stays visible.
  const target = world(0, 4 + portrait * (2.5 / (1.7 - 4 / 3)), -4.8);
  return { pos: world(0, target.y + (10.2 - target.y) * k, -4.8 + (13.6 + 4.8) * k), target };
}

/** Fixed-duration smoothstep, with exact endpoints and no overshoot. */
export function blendCoastShot(from: CameraShot, to: CameraShot, seconds: number, out: CameraShot): CameraShot {
  const t = Math.max(0, Math.min(1, seconds / COAST_VIEW_SECONDS));
  const ease = t * t * (3 - 2 * t);
  for (const part of ["pos", "target"] as const) {
    for (const axis of ["x", "y", "z"] as const) out[part][axis] = t === 1 ? to[part][axis] : from[part][axis] + (to[part][axis] - from[part][axis]) * ease;
  }
  // A close water question can start above the pool itself. Bend its descent
  // around the terrace's rear edge, including the reverse restoration move.
  if (from.pos.y * to.pos.y < 0) {
    const rear = EXHIBITS.penguins.z + 18;
    const bend = Math.max(0, rear - (from.pos.z + to.pos.z) / 2);
    out.pos.z += 4 * ease * (1 - ease) * bend;
  }
  return out;
}
