import { HUB_R, HUB_CENTRE, onRing } from "../../game/data/hub";

/** Thin backing is embedded into the curved wall at its edges rather than
 * floating a metre toward the player. Its flat front faces the hub centre. */
export const WALL_PLAQUE_INSET = 0.10;
export const WALL_PLAQUE_DEPTH = 0.20;
export const WALL_PLAQUE_FACE_Z = WALL_PLAQUE_DEPTH / 2 + 0.005;

export function wallPlaquePose(angle: number, height: number) {
  const p = onRing(angle, HUB_R - WALL_PLAQUE_INSET);
  return {
    position: [p.x, height, p.z] as [number, number, number],
    rotation: [0, -angle, 0] as [number, number, number]
  };
}

/** Horizontal world normal of a sign, pointing into the rotunda. */
export function wallPlaqueNormal(angle: number) {
  return { x: -Math.sin(angle), z: Math.cos(angle) };
}
