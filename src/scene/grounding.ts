import * as THREE from "three";
import { SPECIES } from "../game/data/fish";
import { STAND_H, type TankDef } from "../game/data/tanks";
import type { SpeciesId } from "../game/types";
import { sandSurfaceY } from "../game/logic/tankLayout";
import { frontAt, tankFishBounds, type Bounds } from "../game/logic/swim";
import { animalGeometry, deformGroundVertex } from "./models/animals";

type Sample = { x: number; y: number; z: number; part: number; w: number; tag: number; foot: number };
interface Support { minY: number; radius: number; body: Sample[]; tips: Sample[] }
const supports = new Map<SpeciesId, Support>();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const CONTACT_LIFT = 0.0015;

/** Cache the real lower hull and terminal tube rings, rather than species offsets.
 * Geometry is shared, while each animal owns its eight support corrections. */
function supportFor(species: SpeciesId): Support {
  const cached = supports.get(species);
  if (cached) return cached;
  const geometry = animalGeometry(species), p = geometry.getAttribute("position"), wave = geometry.getAttribute("wave");
  const body = new Map<string, Sample>(), tips = new Map<string, Sample>();
  let minY = Infinity, radius = 0;
  for (let i = 0; i < p.count; i++) {
    const s: Sample = { x: p.getX(i), y: p.getY(i), z: p.getZ(i), part: wave.getX(i), w: wave.getY(i), tag: wave.getZ(i), foot: Math.round(wave.getW(i)) };
    minY = Math.min(minY, s.y);
    radius = Math.max(radius, Math.hypot(s.x, s.z));
    const key = `${Math.round(s.x * 300)},${Math.round(s.z * 300)}`;
    if (s.part !== 3 && s.part !== 4) {
      if (!body.has(key) || body.get(key)!.y > s.y) body.set(key, s);
    } else if (s.w > 0.999) tips.set(`${s.foot},${s.x},${s.y},${s.z}`, s);
  }
  // The shader's largest horizontal limb displacement, including idle curls.
  radius += SPECIES[species].length * (species === "crab" ? 0.11 : species === "octopus" ? 0.12 : 0.04);
  const result = { minY, radius, body: [...body.values()], tips: [...tips.values()] };
  supports.set(species, result);
  return result;
}

export function createGroundPose() {
  return { x: 0, y: 0, z: 0, roll: 0, pitch: 0, ready: false,
    feet: new Float32Array(8), errors: new Float32Array(8), rotation: new THREE.Matrix3(),
    euler: new THREE.Euler(0, 0, 0, "YZX"), matrix: new THREE.Matrix4(), point: new THREE.Vector3(),
    tank: null as TankDef | null, bounds: null as Bounds | null };
}
export type GroundPose = ReturnType<typeof createGroundPose>;
const height = (tank: TankDef, x: number, z: number, offset: number) => sandSurfaceY(tank, x, z) - STAND_H + offset;

/** Water-local pose. Sand's public height includes the stand; subtract it once.
 * Body follows a filtered support plane; individual feet bridge dune curvature.
 * No per-frame arrays, vectors or React state are created. */
export function groundAnimal(pose: GroundPose, species: SpeciesId, tank: TankDef,
  x: number, z: number, yaw: number, phase: number, motion: number, reaction: number, time: number, dt: number,
  surfaceOffset = 0): void {
  const support = supportFor(species);
  if (pose.tank !== tank) {
    pose.tank = tank;
    pose.bounds = tankFishBounds(tank, 0, { length: support.radius * 2, radius: 0 });
  }
  const bounds = pose.bounds!;
  pose.x = clamp(x, bounds.min.x, bounds.max.x);
  pose.z = clamp(z, bounds.min.z, frontAt(bounds, pose.x));
  if (bounds.round !== undefined) {
    const r = Math.hypot(pose.x, pose.z);
    if (r > bounds.round) { pose.x *= bounds.round / r; pose.z *= bounds.round / r; }
  }
  const co = Math.cos(yaw), si = Math.sin(yaw), e = Math.max(0.025, support.radius * 0.55);
  const pitch = clamp(Math.atan((height(tank, pose.x + co * e, pose.z - si * e, surfaceOffset) - height(tank, pose.x - co * e, pose.z + si * e, surfaceOffset)) / (2 * e)), -0.18, 0.18);
  const roll = clamp(-Math.atan((height(tank, pose.x + si * e, pose.z + co * e, surfaceOffset) - height(tank, pose.x - si * e, pose.z - co * e, surfaceOffset)) / (2 * e)), -0.18, 0.18);
  const k = pose.ready ? 1 - Math.exp(-dt * 9) : 1;
  pose.roll += (roll - pose.roll) * k; pose.pitch += (pitch - pose.pitch) * k;
  pose.euler.set(pose.roll, yaw, pose.pitch, "YZX");
  pose.matrix.makeRotationFromEuler(pose.euler); pose.rotation.setFromMatrix4(pose.matrix);
  let want = height(tank, pose.x, pose.z, surfaceOffset) - support.minY + CONTACT_LIFT, bodyFloor = -Infinity;
  for (const s of support.body) {
    pose.point.set(s.x, s.y, s.z).applyMatrix3(pose.rotation);
    bodyFloor = Math.max(bodyFloor, height(tank, pose.x + pose.point.x, pose.z + pose.point.z, surfaceOffset) - pose.point.y + CONTACT_LIFT);
  }
  want = Math.max(want, bodyFloor);
  pose.y = pose.ready ? Math.max(bodyFloor, pose.y + (want - pose.y) * k) : want;
  pose.feet.fill(0);
  const upY = pose.rotation.elements[4];
  // A local vertical correction shifts x/z on a tilted body. Re-sample the
  // corrected toe location so the steep lip of a dune stays planted too.
  for (let pass = 0; pass < 3; pass++) {
    pose.errors.fill(-Infinity);
    for (const s of support.tips) {
      pose.point.set(s.x, s.y, s.z);
      deformGroundVertex(pose.point, species, s.part, s.w, s.tag, phase, motion, reaction, time);
      const lift = Math.max(0, pose.point.y - s.y);
      pose.point.y += pose.feet[s.foot];
      pose.point.applyMatrix3(pose.rotation);
      const correction = (height(tank, pose.x + pose.point.x, pose.z + pose.point.z, surfaceOffset) + CONTACT_LIFT + lift - pose.y - pose.point.y) / upY;
      pose.errors[s.foot] = Math.max(pose.errors[s.foot], correction);
    }
    for (let i = 0; i < 8; i++) if (Number.isFinite(pose.errors[i])) pose.feet[i] += pose.errors[i];
  }
  pose.ready = true;
}

/** Full rendered-vertex mirror for regression tests and inspection, including
 * the shader's last sand projection. Uses the caller's reusable vector. */
export function groundedVertex(out: THREE.Vector3, species: SpeciesId, vertex: number, pose: GroundPose,
  tank: TankDef, phase: number, motion: number, reaction = 0, time = 0): THREE.Vector3 {
  const g = animalGeometry(species), p = g.getAttribute("position"), w = g.getAttribute("wave");
  out.fromBufferAttribute(p, vertex);
  deformGroundVertex(out, species, w.getX(vertex), w.getY(vertex), w.getZ(vertex), phase, motion, reaction, time);
  if (w.getX(vertex) === 3 || w.getX(vertex) === 4) out.y += pose.feet[Math.round(w.getW(vertex))] * w.getY(vertex) ** 3;
  out.applyMatrix3(pose.rotation); out.x += pose.x; out.y += pose.y; out.z += pose.z;
  out.y = Math.max(out.y, sandSurfaceY(tank, out.x, out.z) - STAND_H + 0.001);
  return out;
}

/** A moray's origin is its head: confine its whole long, waving body to the
 * accessible water in front of the rock face, not just the head's radius. */
export function containEel(out: THREE.Vector3, tank: TankDef, x: number, y: number, z: number, yaw: number): void {
  const box = animalGeometry("eel").boundingBox!, length = SPECIES.eel.length;
  const co = Math.cos(yaw), si = Math.sin(yaw);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i <= 16; i++) for (let j = 0; j < 2; j++) {
    const lx = box.min.x + (box.max.x - box.min.x) * i / 16;
    const back = clamp(-lx / length - .05, 0, 1);
    const sway = (.117 + back * .09) * back * length;
    const lz = j ? box.max.z + sway : box.min.z - sway;
    const dx = co * lx + si * lz, dz = -si * lx + co * lz;
    minX = Math.min(minX, dx); maxX = Math.max(maxX, dx); minZ = Math.min(minZ, dz); maxZ = Math.max(maxZ, dz);
  }
  out.x = clamp(x, -tank.w / 2 - minX + 0.015, tank.w / 2 - maxX - 0.015);
  out.z = clamp(z, -tank.d / 2 + (tank.backRock ?? 0) - minZ + 0.015, tank.d / 2 - maxZ - 0.015);
  out.y = Math.max(y, sandSurfaceY(tank, out.x, out.z) - STAND_H - box.min.y + 0.015);
  if (tank.rocks) for (const rock of tank.rocks) for (let i = 0; i <= 16; i++) {
    const lx = box.min.x + (box.max.x - box.min.x) * i / 16;
    const back = clamp(-lx / length - .05, 0, 1);
    const reach = rock.r + Math.max(Math.abs(box.min.z), box.max.z) + (.117 + back * .09) * back * length;
    const distance = Math.hypot(out.x + co * lx - rock.x, out.z - si * lx - rock.z) - reach;
    // Begin climbing before the trailing body reaches a freestanding rock,
    // so its head's column test cannot leave the tail intersecting the stone.
    const t = clamp(1 - distance / .12, 0, 1), ease = t * t * (3 - 2 * t);
    const top = rock.top - box.min.y + length * .012 + .015;
    out.y = Math.max(out.y, y + (top - y) * ease);
  }
}
