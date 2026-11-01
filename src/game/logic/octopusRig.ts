import { STAND_H, type TankDef } from "../data/tanks";
import { sandSurfaceY } from "./tankLayout";
import type { Bounds, Column, SwimState } from "./swim";

export const OCTOPUS_LENGTH = 0.3;
export const OCTOPUS_ARM_LENGTH = OCTOPUS_LENGTH * 0.85;
export type ArmState = "stance" | "swing" | "reach" | "curl" | "rest";
export type OctopusReaction = "raise" | "colour" | "curl" | "look";
interface Point { x: number; y: number; z: number }
export interface OctopusArm {
  state: ArmState; tip: Point; from: Point; target: Point;
  age: number; duration: number; curl: number; planted: number;
  /** Seconds left following a body-space pose (a tap reaction), and that pose. */
  held: number; local: Point;
}
export interface OctopusRig {
  rig: Float32Array; arms: OctopusArm[];
  x: number; y: number; z: number; yaw: number;
  time: number; seed: number; ready: boolean; group: number;
  pull: number; planted: number; reaction: OctopusReaction; reactionTime: number;
  colour: number; grabArm: number; grabPhase: "idle" | "reaching" | "reached" | "mouth" | "delivered";
  grabTarget: Point; point: Point; normal: Point;
  /** Eased 0..1 while the body hugs the rock face. */
  cling: number;
  /** Reduced motion: reactions keep only the colour change. */
  calm: boolean; reactPending: boolean;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const point = (): Point => ({ x: 0, y: 0, z: 0 });
function copy(out: Point, p: Point): void { out.x = p.x; out.y = p.y; out.z = p.z; }
export function octopusRandom(o: OctopusRig): number {
  o.seed = (Math.imul(o.seed, 1664525) + 1013904223) >>> 0;
  return o.seed / 4294967296;
}
export function createOctopusRig(s: SwimState, phase = 0, yaw = 0): OctopusRig {
  return { rig: new Float32Array(64), arms: Array.from({ length: 8 }, (_, i) => ({
    state: i === 1 ? "rest" : i === 5 ? "curl" : "stance", tip: point(), from: point(), target: point(),
    age: i * 0.11, duration: 0.3, curl: 0, planted: 0, held: 0, local: point(),
  })), x: s.x, y: s.y, z: s.z, yaw, time: 0, seed: ((phase * 100003 + s.x * 7919 + s.z * 3571) | 0) >>> 0,
    ready: false, group: 0, pull: 1, planted: 6, reaction: "colour", reactionTime: 0,
    colour: 0, grabArm: -1, grabPhase: "idle", grabTarget: point(), point: point(), normal: point(),
    cling: 0, calm: false, reactPending: false };
}

/** Conservative lower-head support; the real head ends at -.35 body lengths.
 * Sample the entire footprint so breathing and heading cannot bury its hull. */
export function octopusBodyHeight(tank: TankDef, x: number, z: number, elevated = 0): number {
  let y = sandSurfaceY(tank, x, z) - STAND_H;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    y = Math.max(y, sandSurfaceY(tank, x + Math.cos(a) * 0.095, z + Math.sin(a) * 0.095) - STAND_H);
  }
  return y + OCTOPUS_LENGTH * 0.35 + 0.004 + elevated;
}
export function octopusToWorld(out: Point, o: OctopusRig, x: number, y: number, z: number): Point {
  const co = Math.cos(o.yaw), si = Math.sin(o.yaw);
  out.x = o.x + co * x + si * z; out.y = o.y + y; out.z = o.z - si * x + co * z;
  return out;
}
function toBody(out: Point, o: OctopusRig, p: Point): void {
  const co = Math.cos(o.yaw), si = Math.sin(o.yaw), dx = p.x - o.x, dz = p.z - o.z;
  out.x = co * dx - si * dz; out.y = p.y - o.y; out.z = si * dx + co * dz;
}

/** Contacts are terminal points, with a small radius for the taper's last ring.
 * Project repeatedly because a column can meet a glass or rock-face boundary. */
export function octopusContact(p: Point, tank: TankDef, columns: readonly Column[]): void {
  const r = 0.004;
  for (let pass = 0; pass < 4; pass++) {
    p.x = clamp(p.x, -tank.w / 2 + r, tank.w / 2 - r);
    p.z = clamp(p.z, -tank.d / 2 + (tank.backRock ?? 0) + r, tank.d / 2 - r);
    p.y = clamp(p.y, sandSurfaceY(tank, p.x, p.z) - STAND_H + r, tank.h - r);
    for (const c of columns) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < c.r + r && p.y < c.top + r) {
        if (c.top + r - p.y < c.r + r - d) p.y = c.top + r;
        else { const k = (c.r + r) / Math.max(d, 1e-8); p.x = c.x + (d > 1e-8 ? dx * k : c.r + r); p.z = c.z + dz * k; }
      }
    }
  }
}
function landing(o: OctopusRig, i: number, tank: TankDef, columns: readonly Column[], climbing: boolean, ahead: number): void {
  const a = i * Math.PI / 4, p = o.point;
  octopusToWorld(p, o, Math.cos(a) * 0.235 + ahead, -0.1, Math.sin(a) * 0.235);
  if (climbing) {
    p.x = o.x + Math.cos(a) * 0.21;
    p.z = -tank.d / 2 + (tank.backRock ?? 0) + 0.004;
    p.y = o.y - 0.04 + Math.sin(a) * 0.17 + ahead;
  } else p.y = sandSurfaceY(tank, p.x, p.z) - STAND_H + 0.004;
  octopusContact(p, tank, columns);
}
function begin(arm: OctopusArm, state: ArmState, target: Point, duration: number): void {
  copy(arm.from, arm.tip); copy(arm.target, target); arm.age = 0; arm.duration = duration; arm.state = state;
}
export function octopusTap(o: OctopusRig, reaction?: OctopusReaction): void {
  o.reaction = reaction ?? (["raise", "colour", "curl", "look"] as const)[Math.floor(octopusRandom(o) * 4)];
  o.reactionTime = 1.2; o.colour = 1; o.reactPending = true;
}

/** Raise one forward arm or gather three free-side arms, posed in body space so
 * they travel with the animal. Other arms keep walking and supporting it. */
function startReaction(o: OctopusRig): void {
  if (o.reaction !== "raise" && o.reaction !== "curl") return;
  const raise = o.reaction === "raise", order = raise ? [0, 7, 1] : [1, 3, 6, 4, 2];
  let used = 0;
  for (const i of order) {
    const arm = o.arms[i];
    if (used === (raise ? 1 : 3) || i === o.grabArm || arm.state === "swing") continue;
    const a = i * Math.PI / 4, reach = raise ? 0.11 : 0.07;
    arm.local.x = Math.cos(a) * reach; arm.local.y = raise ? 0.075 : -0.05; arm.local.z = Math.sin(a) * reach;
    arm.held = 1.15; used++;
    octopusToWorld(o.point, o, arm.local.x, arm.local.y, arm.local.z);
    begin(arm, "reach", o.point, 0.3);
  }
}
/** A free arm is reserved; supporting arms are never stolen by feeding. */
export function octopusGrab(o: OctopusRig, x: number, y: number, z: number): boolean {
  if (o.grabPhase !== "idle" && o.grabPhase !== "delivered") return false;
  let planted = 0, best = -1, nearest = Infinity;
  for (const arm of o.arms) if (arm.state === "stance") planted++;
  for (let i = 0; i < 8; i++) {
    const arm = o.arms[i], free = arm.state === "rest" || arm.state === "curl";
    if (arm.state === "swing" || arm.state === "reach" || arm.held > 0 || (arm.state === "stance" && planted < 5)) continue;
    const d = Math.hypot(arm.tip.x - x, arm.tip.y - y, arm.tip.z - z) - (free ? 0.04 : 0);
    if (d < nearest) { nearest = d; best = i; }
  }
  if (best < 0) return false;
  o.grabArm = best; o.grabTarget.x = x; o.grabTarget.y = y; o.grabTarget.z = z;
  begin(o.arms[best], "reach", o.grabTarget, 0.55); o.grabPhase = "reaching";
  return true;
}
export function octopusGrabStatus(o: OctopusRig): "idle" | "reaching" | "reached" | "mouth" | "delivered" { return o.grabPhase; }

/** Called before body steering. Gate travel on support and arm extension. */
export function octopusPull(o: OctopusRig): number {
  let planted = 0;
  for (const arm of o.arms) if (arm.state === "stance") planted++;
  o.planted = planted;
  o.pull = planted < 3 ? 0 : clamp(0.25 + (planted - 3) * 0.2, 0.25, 1.15);
  return o.pull;
}

export function updateOctopusRig(o: OctopusRig, s: SwimState, tank: TankDef, columns: readonly Column[], bounds: Bounds,
  dt: number, moving: boolean, climbing: boolean): void {
  o.time += dt; o.reactionTime = Math.max(0, o.reactionTime - dt); o.colour = Math.max(0, o.colour - dt / 1.5);
  // +x is forward, so -PI/2 faces the visitor: on the wall, at rest and when looking.
  const speed = Math.hypot(s.vx, s.vz);
  const targetYaw = speed > 0.005 && !climbing ? Math.atan2(-s.vz, s.vx) : -Math.PI / 2;
  const looking = !o.calm && o.reactionTime > 0 && o.reaction === "look";
  const look = looking ? -Math.PI / 2 : targetYaw;
  o.yaw += Math.atan2(Math.sin(look - o.yaw), Math.cos(look - o.yaw)) * Math.min(1, dt * (looking ? 5 : 2));
  o.cling += ((climbing ? 1 : 0) - o.cling) * Math.min(1, dt * 3);
  o.x = s.x; o.z = s.z - o.cling * 0.10;
  // Rise at once so the head never buries; settle gently off a dune.
  const standing = octopusBodyHeight(tank, o.x, o.z, Math.max(0, s.y - bounds.min.y));
  o.y = o.ready ? Math.max(standing, o.y + (standing - o.y) * Math.min(1, dt * 8)) : standing;
  if (o.reactPending) { o.reactPending = false; if (!o.calm) startReaction(o); }
  if (!o.ready) {
    for (let i = 0; i < 8; i++) { landing(o, i, tank, columns, climbing, 0); copy(o.arms[i].tip, o.point); }
    o.ready = true;
  }
  let lifted = 0;
  for (const arm of o.arms) if (arm.state !== "stance") lifted++;
  // Alternating pairs with individual dwell times; urgent trailing arms step
  // regardless of parity. At least four arms remain available as supports.
  o.group = Math.floor(o.time / 0.48) % 2;
  for (let i = 0; i < 8; i++) {
    const arm = o.arms[i]; arm.age += dt;
    if (i === o.grabArm && o.grabPhase !== "delivered") {
      if (o.grabPhase === "reached" && arm.age > arm.duration + 0.18) {
        octopusToWorld(o.point, o, 0.045, -0.09, 0);
        begin(arm, "reach", o.point, 0.6); o.grabPhase = "mouth";
      }
      if (o.grabPhase === "mouth") { octopusToWorld(arm.target, o, 0.045, -0.09, 0); }
    } else if (arm.held > 0) {
      arm.held -= dt;
      octopusToWorld(arm.target, o, arm.local.x, arm.local.y, arm.local.z);
      if (arm.held <= 0) { arm.state = "rest"; arm.age = 0; }
    } else if (arm.state === "stance") {
      toBody(o.point, o, arm.tip);
      const a = i * Math.PI / 4;
      const extension = Math.hypot(o.point.x - Math.cos(a) * .048, o.point.y + .084, o.point.z - Math.sin(a) * .048);
      if (moving && lifted < 4 && ((i % 2 === o.group && arm.age > 0.43 + i * 0.027) || extension > OCTOPUS_ARM_LENGTH * 0.90)) {
        landing(o, i, tank, columns, climbing, Math.min(.06, speed * .24));
        begin(arm, "swing", o.point, clamp(.30 - speed * .35, .13, .30)); lifted++;
      }
    } else if ((arm.state === "rest" || arm.state === "curl") && moving) {
      landing(o, i, tank, columns, climbing, 0.035); begin(arm, "swing", o.point, .24);
    } else if (!moving && arm.state !== "reach" && arm.age > 1.4 + i * .17 && i === Math.floor(o.time / 2) % 8 && lifted < 4) {
      // Prefer reachable den lips, then nearby column sides, then glass.
      landing(o, i, tank, columns, climbing, 0);
      let found = false;
      for (const den of tank.dens ?? []) if (Math.hypot(den.x - o.x, den.y - o.y, den.z - o.z) < .23) {
        o.point.x = den.x; o.point.y = den.y; o.point.z = den.z + .005; found = true; break;
      }
      if (!found) for (const c of columns) {
        const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
        if (d < c.r + .20) {
          // Each arm takes its own place round the rock, so several can wrap it.
          const angle = Math.atan2(dz, dx) + (i - 3.5) * 0.28;
          o.point.x = c.x + Math.cos(angle) * (c.r + .005); o.point.z = c.z + Math.sin(angle) * (c.r + .005);
          o.point.y = Math.min(c.top, o.y); found = true; break;
        }
      }
      if (!found && tank.d / 2 - o.z < .23) { o.point.z = tank.d / 2 - .005; o.point.y = o.y; found = true; }
      if (found) { limitReach(o, i); octopusContact(o.point, tank, columns); begin(arm, "reach", o.point, .7); lifted++; }
    }
    if (arm.state === "swing" || arm.state === "reach") {
      const t = Math.min(1, arm.age / arm.duration), blend = t * t * (3 - 2 * t);
      arm.tip.x = arm.from.x + (arm.target.x - arm.from.x) * blend;
      arm.tip.y = arm.from.y + (arm.target.y - arm.from.y) * blend + Math.sin(t * Math.PI) * (arm.state === "swing" ? .035 : .018);
      arm.tip.z = arm.from.z + (arm.target.z - arm.from.z) * blend;
      octopusContact(arm.tip, tank, columns);
      if (t === 1) {
        if (i === o.grabArm && o.grabPhase === "reaching") o.grabPhase = "reached";
        else if (i === o.grabArm && o.grabPhase === "mouth") { o.grabPhase = "delivered"; arm.state = "rest"; arm.age = 0; }
        else if (i !== o.grabArm && arm.state === "swing") { arm.state = "stance"; arm.age = 0; arm.planted++; lifted--; }
        else if (i !== o.grabArm && arm.held <= 0 && arm.age > arm.duration + 1.1) { arm.state = "curl"; arm.age = 0; }
      }
    }
    // Expressive motion affects only free arms and keeps all contacts projected.
    if ((arm.state === "rest" || arm.state === "curl") && i !== o.grabArm) {
      arm.curl = .3 + .25 * Math.sin(o.time * .8 + i * 1.7);
    } else arm.curl = 0;
    if (arm.held > 0 && o.reaction === "curl") arm.curl = .95;
    // Also keeps a planted tip out of a decoration placed on top of it.
    octopusContact(arm.tip, tank, columns);
    toBody(o.point, o, arm.tip);
    const k = (i + 8) * 4;
    o.rig[k] = o.point.x; o.rig[k + 1] = o.point.y; o.rig[k + 2] = o.point.z;
    o.rig[i * 4 + 3] = arm.curl;
    solveControl(o.rig, i, arm.state === "stance", o.time);
  }
  // Rest always has an independently curling free arm; never eight locked poses.
  if (!moving && lifted === 0) { const arm = o.arms[1]; arm.state = "rest"; arm.age = 0; }
  octopusPull(o);
}

/** An arm cannot reach further than its length: pull o.point back into range. */
function limitReach(o: OctopusRig, i: number): void {
  const a = i * Math.PI / 4;
  octopusToWorld(o.normal, o, Math.cos(a) * .048, -.084, Math.sin(a) * .048);
  const dx = o.point.x - o.normal.x, dy = o.point.y - o.normal.y, dz = o.point.z - o.normal.z;
  const d = Math.hypot(dx, dy, dz), most = OCTOPUS_ARM_LENGTH * 0.95;
  if (d > most) { const k = most / d; o.point.x = o.normal.x + dx * k; o.point.y = o.normal.y + dy * k; o.point.z = o.normal.z + dz * k; }
}

/** Solve a vertical arch for constant quadratic arc length (24 samples).
 * A planted arm is capped low so it drapes along the ground instead of arching
 * like a leg, and each arm has its own slow sideways bend so none is a straight
 * spike. Only the controller solves it; shader and CPU use the identical control. */
function solveControl(rig: Float32Array, i: number, planted: boolean, time: number): void {
  const a = i * Math.PI / 4, rx = Math.cos(a) * .048, ry = -.084, rz = Math.sin(a) * .048;
  const k = (i + 8) * 4, tx = rig[k], ty = rig[k + 1], tz = rig[k + 2];
  let lo = 0, hi = OCTOPUS_ARM_LENGTH;
  for (let iteration = 0; iteration < 10; iteration++) {
    const arch = (lo + hi) / 2, cx = (rx + tx) / 2, cy = (ry + ty) / 2 + arch, cz = (rz + tz) / 2;
    let length = 0, px = rx, py = ry, pz = rz;
    for (let j = 1; j <= 24; j++) {
      const t = j / 24, u = 1 - t, x = u * u * rx + 2 * u * t * cx + t * t * tx;
      const y = u * u * ry + 2 * u * t * cy + t * t * ty, z = u * u * rz + 2 * u * t * cz + t * t * tz;
      length += Math.hypot(x - px, y - py, z - pz); px = x; py = y; pz = z;
    }
    if (length > OCTOPUS_ARM_LENGTH) hi = arch; else lo = arch;
  }
  const arch = planted ? Math.min(0.038, (lo + hi) / 2) : (lo + hi) / 2;
  const gx = tx - rx, gz = tz - rz, chord = Math.hypot(gx, gz) || 1;
  const bend = Math.sin(time * 0.6 + i * 2.1) * 0.035;
  rig[i * 4] = (rx + tx) / 2 - gz / chord * bend;
  rig[i * 4 + 1] = (ry + ty) / 2 + arch;
  rig[i * 4 + 2] = (rz + tz) / 2 + gx / chord * bend;
}

/** Exact part13 shader mapping, including its curled centreline and frame.
 * Rest vertices use x for longitudinal normals, y/z for tube offsets. */
export function deformOctopusVertex(out: Point, rig: Float32Array, i: number, t: number, y = 0, z = 0,
  normal = false, nx = 0): Point {
  const a = i * Math.PI / 4, rx = Math.cos(a) * .048, ry = -.084, rz = Math.sin(a) * .048;
  const c = i * 4, k = (i + 8) * 4, u = 1 - t;
  const q = clamp((t - .65) / .35, 0, 1), curl = rig[c + 3] * OCTOPUS_LENGTH * .14;
  let dx = 2 * u * (rig[c] - rx) + 2 * t * (rig[k] - rig[c]);
  let dy = 2 * u * (rig[c + 1] - ry) + 2 * t * (rig[k + 1] - rig[c + 1]);
  let dz = 2 * u * (rig[c + 2] - rz) + 2 * t * (rig[k + 2] - rig[c + 2]);
  if (t > .65 && t < 1) dy += curl * Math.PI / .35 * Math.sin(2 * Math.PI * q);
  const dl = Math.hypot(dx, dy, dz);
  if (dl < 1e-8) { dx = 1; dy = 0; dz = 0; } else { dx /= dl; dy /= dl; dz /= dl; }
  let sx = Math.abs(dy) > .98 ? dy : -dz, sy = Math.abs(dy) > .98 ? -dx : 0, sz = Math.abs(dy) > .98 ? 0 : dx;
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  const ux = sy * dz - sz * dy, uy = sz * dx - sx * dz, uz = sx * dy - sy * dx;
  out.x = ux * y + sx * z; out.y = uy * y + sy * z; out.z = uz * y + sz * z;
  if (normal) {
    out.x += dx * nx; out.y += dy * nx; out.z += dz * nx;
    const length = Math.hypot(out.x, out.y, out.z); out.x /= length; out.y /= length; out.z /= length;
  } else {
    out.x += u * u * rx + 2 * u * t * rig[c] + t * t * rig[k];
    out.y += u * u * ry + 2 * u * t * rig[c + 1] + t * t * rig[k + 1] + curl * Math.sin(Math.PI * q) ** 2;
    out.z += u * u * rz + 2 * u * t * rig[c + 2] + t * t * rig[k + 2];
  }
  return out;
}
