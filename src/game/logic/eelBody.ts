import { STAND_H, type TankDef } from "../data/tanks";
import { sandSurfaceY } from "./tankLayout";
import type { Bounds, Column, SwimState } from "./swim";

export const EEL_LENGTH = 0.7;
export const EEL_RADIUS = 0.06;
export const EEL_JAW_DROP = 0.068;
export const EEL_MIN_RADIUS = 0.1;
/** Lateral envelope: visible at mid-body, increasing into the slender tail. */
export function eelWaveAmplitude(s: number): number {
  return 0.024 * Math.sin(Math.min(1, s / 0.7) * Math.PI / 2) ** 2;
}
// Larger than radius(s) + wave(s) everywhere, including the dorsal crest.
export const EEL_CORRIDOR = 0.084;
/** Covers the loft's dorsal crest as well as its tapered body tube. */
export function eelRadius(s: number): number {
  const dorsal = s >= 0.1 ? Math.sin((s - 0.1) / 0.9 * Math.PI) * 0.041 : 0;
  return Math.max(EEL_RADIUS * (1 - 0.75 * s ** 1.7), EEL_LENGTH * (0.003 + 0.061 * (1 - s) ** 0.78 + dorsal));
}
const COUNT = 16, HISTORY = 512, SPACING = EEL_LENGTH / 192;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export interface EelPoint { x: number; y: number; z: number }
export interface EelBody {
  rig: Float32Array;
  history: Float64Array;
  offsets: Float64Array;
  previous: Float64Array;
  spine: Float64Array;
  source: Float64Array;
  base: Float32Array;
  samples: number;
  cursor: number;
  distance: number;
  sampled: number;
  yaw: number;
  pitch: number;
  speed: number;
  phase: number;
  wave: number;
  gape: number;
  mouth: EelPoint;
  point: EelPoint;
  target: EelPoint;
  rail: "out" | "enter" | "emerge" | null;
  railQ: number;
  seed: number;
  returning: boolean;
  bounds?: Bounds;
  den?: EelPoint;
}

/** The eel's head uses a radius inset. Its length belongs to the history,
 * rather than to the old rigid-animal box. */
export function eelBounds(tank: TankDef): Bounds {
  const r = EEL_CORRIDOR;
  return { min: { x: -tank.w / 2 + r, y: 0.06 + r, z: -tank.d / 2 + (tank.backRock ?? 0) + r },
    max: { x: tank.w / 2 - r, y: tank.h - r - 0.025, z: tank.d / 2 - r } };
}

/** A tunnel is straight at the aperture, bends at R=.1, then runs sideways
 * within the opaque rock. Its visible part has exactly the mouth's +z axis. */
export function eelDenRail(out: EelPoint, tank: TankDef, index: number, q: number): void {
  const den = tank.dens![index], direction = den.x < 0 ? 1 : -1;
  out.x = den.x; out.y = den.y; out.z = den.z + q;
  if (q < -0.09) {
    const angle = Math.min(Math.PI / 2, (-q - 0.09) / EEL_MIN_RADIUS);
    out.x += direction * EEL_MIN_RADIUS * (1 - Math.cos(angle));
    out.z = den.z - 0.09 - EEL_MIN_RADIUS * Math.sin(angle);
    if (angle === Math.PI / 2) out.x += direction * (-q - 0.09 - EEL_MIN_RADIUS * Math.PI / 2);
  }
}

export function createEelBody(s: SwimState, phase = 0): EelBody {
  const body: EelBody = { rig: new Float32Array(64), history: new Float64Array(HISTORY * 4),
    offsets: new Float64Array(48), previous: new Float64Array(48), spine: new Float64Array(256 * 4), source: new Float64Array(256 * 4), base: new Float32Array(64), samples: 0, cursor: 0, distance: 0, sampled: 0,
    yaw: Math.hypot(s.vx, s.vz) > 0.001 ? Math.atan2(s.vz, s.vx) : 0, pitch: 0, speed: 0,
    phase, wave: 0, gape: 0, mouth: { x: s.x, y: s.y, z: s.z }, point: { x: 0, y: 0, z: 0 },
    target: { x: s.tx, y: s.ty, z: s.tz }, rail: null, railQ: 0.095, seed: ((phase * 98713 + s.x * 3919 + 67393) | 0) >>> 0, returning: false };
  resetEelHistory(body, s.x, s.y, s.z, body.yaw);
  return body;
}

export function eelRandom(body: EelBody): number {
  body.seed = (Math.imul(body.seed, 1664525) + 1013904223) >>> 0;
  return body.seed / 4294967296;
}

export function resetEelHistory(body: EelBody, x: number, y: number, z: number, yaw: number, tank?: TankDef, denIndex = 0, q = 0.095): void {
  body.distance = 0; body.sampled = 0; body.cursor = 0; body.offsets.fill(0);
  for (let j = 0; j < HISTORY; j++) {
    const index = (HISTORY - j) % HISTORY * 4, d = j * SPACING;
    if (tank) eelDenRail(body.point, tank, denIndex, q - d);
    else { body.point.x = x - Math.cos(yaw) * d; body.point.y = y; body.point.z = z - Math.sin(yaw) * d; }
    body.history[index] = body.point.x; body.history[index + 1] = body.point.y; body.history[index + 2] = body.point.z; body.history[index + 3] = -d;
  }
  updateEelRig(body, x, y, z, 0);
}

/** Append at fixed travelled distances, independent of frame rate or pauses. */
export function recordEelHead(body: EelBody, x: number, y: number, z: number, previousX: number, previousY: number, previousZ: number): void {
  const travel = Math.hypot(x - previousX, y - previousY, z - previousZ);
  if (travel < 1e-10) return;
  const old = body.distance; body.distance += travel;
  while (body.sampled + SPACING <= body.distance) {
    body.sampled += SPACING;
    const t = clamp((body.sampled - old) / travel, 0, 1);
    body.cursor = (body.cursor + 1) % HISTORY;
    const index = body.cursor * 4;
    body.history[index] = previousX + (x - previousX) * t;
    body.history[index + 1] = previousY + (y - previousY) * t;
    body.history[index + 2] = previousZ + (z - previousZ) * t;
    body.history[index + 3] = body.sampled;
  }
}

/** Sample the travelled path; the travelling wave advances mainly with travel. */
export function updateEelRig(body: EelBody, x: number, y: number, z: number, wave = 1): void {
  let search = body.cursor;
  let travelled = 0, samples = 0;
  // Build a dense waving centreline, then sample it by its own arc length.
  // A normal displacement on a tight bend otherwise stretches/compresses the
  // eel by the displacement / bend radius even with a perfect path history.
  for (let i = 0; i < 256; i++) {
    const pathS = i * SPACING / EEL_LENGTH, goal = body.distance - i * SPACING;
    let ax = x, ay = y, az = z, ad = body.distance;
    if (goal <= body.sampled) {
      while (body.history[search * 4 + 3] > goal) search = (search + HISTORY - 1) % HISTORY;
      const next = (search + 1) % HISTORY * 4, at = search * 4;
      ax = body.history[next]; ay = body.history[next + 1]; az = body.history[next + 2]; ad = body.history[next + 3];
      const t = clamp((goal - body.history[at + 3]) / Math.max(1e-10, ad - body.history[at + 3]), 0, 1);
      ax = body.history[at] + (ax - body.history[at]) * t;
      ay = body.history[at + 1] + (ay - body.history[at + 1]) * t;
      az = body.history[at + 2] + (az - body.history[at + 2]) * t;
    } else {
      const at = body.cursor * 4, t = (goal - body.sampled) / Math.max(1e-10, body.distance - body.sampled);
      ax = body.history[at] + (x - body.history[at]) * t;
      ay = body.history[at + 1] + (y - body.history[at + 1]) * t;
      az = body.history[at + 2] + (z - body.history[at + 2]) * t;
    }
    const denFade = body.den ? az < body.den.z ? 0 : clamp((Math.hypot(ax - body.den.x, ay - body.den.y, az - body.den.z) - 0.32) / 0.16, 0, 1) : 1;
    const lateral = Math.sin(body.distance * 15 + body.phase * 0.65 - pathS * Math.PI * 2)
      * eelWaveAmplitude(pathS) * Math.min(1, body.speed / 0.12) * wave * denFade;
    // Average the frame over a short neck of history. A glass-contact corner
    // must not flip the lateral frame between two adjacent history samples.
    const tangent = (search + HISTORY - 12) % HISTORY * 4, next = (search + 12) % HISTORY * 4;
    const recent = body.distance - body.history[search * 4 + 3] < 12 * SPACING;
    const dx = (recent ? x : body.history[next]) - body.history[tangent],
      dz = (recent ? z : body.history[next + 2]) - body.history[tangent + 2], d = Math.hypot(dx, dz) || 1;
    const at = i * 4;
    body.spine[at] = ax - dz / d * lateral;
    body.spine[at + 1] = ay;
    body.spine[at + 2] = az + dx / d * lateral;
    if (i) travelled += Math.hypot(body.spine[at] - body.spine[at - 4], body.spine[at + 1] - body.spine[at - 3], body.spine[at + 2] - body.spine[at - 2]);
    body.spine[at + 3] = travelled;
    samples = i;
    if (travelled >= EEL_LENGTH * 1.18) break;
  }
  body.samples = samples;
  body.source.set(body.spine);
  sampleFixedEelRig(body);
  body.base.set(body.rig);
  offsetEelRig(body);
}

/** Offsets deform a continuous path; arc sampling also retains body length
 * while a new decoration lifts it, without any chain constraint iterations. */
function offsetEelRig(body: EelBody): void {
  let arc = 0;
  for (let i = 0; i <= body.samples; i++) {
    const at = i * 4, s = body.source[at + 3] / EEL_LENGTH * 15,
      before = Math.min(14, Math.floor(s)), t = clamp(s - before, 0, 1);
    for (let axis = 0; axis < 3; axis++) body.spine[at + axis] = body.source[at + axis]
      + body.offsets[before * 3 + axis] * (1 - t) + body.offsets[(before + 1) * 3 + axis] * t;
    if (i) arc += Math.hypot(body.spine[at] - body.spine[at - 4], body.spine[at + 1] - body.spine[at - 3], body.spine[at + 2] - body.spine[at - 2]);
    body.spine[at + 3] = arc;
  }
  sampleFixedEelRig(body);
}

function sampleFixedEelRig(body: EelBody): void {
  const samples = body.samples;
  let extent = EEL_LENGTH;
  // The sparse Catmull representation rounds off corners in the dense path.
  // Measure that rounding once and correct the sampling extent, without
  // moving any control point away from the waving centreline.
  for (let sampling = 0; sampling < 2; sampling++) {
    let segment = 0;
    for (let i = 0; i < COUNT; i++) {
      const goal = extent * i / 15;
      while (segment < samples - 1 && body.spine[(segment + 1) * 4 + 3] < goal) segment++;
      const at = segment * 4, next = at + 4;
      const t = clamp((goal - body.spine[at + 3]) / Math.max(1e-9, body.spine[next + 3] - body.spine[at + 3]), 0, 1);
      for (let axis = 0; axis < 3; axis++) {
        body.rig[i * 4 + axis] = body.spine[at + axis] + (body.spine[next + axis] - body.spine[at + axis]) * t;
      }
    }
    if (sampling === 0) {
      let arc = 0, px = body.rig[0], py = body.rig[1], pz = body.rig[2];
      for (let j = 1; j <= 60; j++) {
        sampleEelSpine(body.point, body.rig, j / 60);
        arc += Math.hypot(body.point.x - px, body.point.y - py, body.point.z - pz);
        px = body.point.x; py = body.point.y; pz = body.point.z;
      }
      extent *= EEL_LENGTH / Math.max(0.001, arc);
    }
  }
}

export function eelFloor(tank: TankDef, x: number, z: number, radius = EEL_RADIUS): number {
  return sandSurfaceY(tank, x, z) - STAND_H + radius + 0.003;
}

/** Project a centre against physical surfaces. The hidden rail alone may cross
 * the rock face; its narrow straight segment fits the elliptical aperture. */
export function clearEelPoint(out: EelPoint, tank: TankDef, columns: readonly Column[], radius = EEL_RADIUS, denIndex = -1, verticalRadius = radius, lift = false): void {
  const den = tank.dens?.[denIndex];
  const aperture = den && out.z < den.z + radius && ((out.x - den.x) / (0.12 - radius)) ** 2 + ((out.y - den.y) / (0.085 - radius)) ** 2 < 1;
  const hidden = den && out.z + radius < den.z - 0.035;
  out.x = clamp(out.x, -tank.w / 2 + radius + 0.003, tank.w / 2 - radius - 0.003);
  out.z = clamp(out.z, -tank.d / 2 + (aperture || hidden ? 0 : tank.backRock ?? 0) + radius + 0.003, tank.d / 2 - radius - 0.003);
  // Only the opaque tunnel has no sand/columns. The mouth's open-water side
  // still checks all physical surfaces, even when centred in the ellipse.
  if (hidden) return;
  out.y = clamp(out.y, eelFloor(tank, out.x, out.z, verticalRadius), tank.h - verticalRadius - 0.025);
  for (const c of columns) {
    const dx = out.x - c.x, dz = out.z - c.z, distance = Math.hypot(dx, dz), reach = c.r + radius + (lift && denIndex < 0 ? EEL_LENGTH / 30 : 0);
    if (distance < reach && out.y < c.top + verticalRadius + 0.003) {
      // A newly placed column pushes the continuous body over its top. Using
      // opposite radial exits on neighbouring points would pinch the spine.
      const side = reach - distance, up = c.top + verticalRadius + 0.003 - out.y;
      if (lift || up < side || distance < 0.0001) out.y += up;
      else { out.x += dx / distance * side; out.z += dz / distance * side; }
    }
  }
}

/** Persistent, speed-limited corrections let a decoration placed on the eel
 * displace its body continuously instead of snapping an entire mesh. */
export function collideEelBody(body: EelBody, tank: TankDef, columns: readonly Column[], dt: number, denIndex = -1): void {
  const rig = body.base, limit = dt * 0.12;
  let active = false;
  // One projection of the unmodified path gives an absolute desired offset.
  // The wave is already present here and participates in every contact test.
  for (let i = 0; i < COUNT; i++) {
    const at = i * 4, offset = i * 3;
    const bx = rig[at], by = rig[at + 1], bz = rig[at + 2];
    body.point.x = bx; body.point.y = by; body.point.z = bz;
    clearEelPoint(body.point, tank, columns, eelRadius(i / 15), denIndex, eelRadius(i / 15), true);
    const dx = body.point.x - bx, dy = body.point.y - by, dz = body.point.z - bz;
    active ||= Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-6
      || Math.abs(body.offsets[offset]) + Math.abs(body.offsets[offset + 1]) + Math.abs(body.offsets[offset + 2]) > 1e-6;
    body.previous[offset] = dx; body.previous[offset + 1] = dy; body.previous[offset + 2] = dz;
  }
  if (!active) return;
  for (let i = 1; i < COUNT; i++) {
    const at = i * 3, dx = body.previous[at] - body.offsets[at],
      dy = body.previous[at + 1] - body.offsets[at + 1], dz = body.previous[at + 2] - body.offsets[at + 2];
    const k = Math.min(1, limit / Math.max(1e-9, Math.hypot(dx, dy, dz)));
    body.previous[at] = dx * k; body.previous[at + 1] = dy * k; body.previous[at + 2] = dz * k;
  }
  body.previous[0] = body.previous[1] = body.previous[2] = 0;
  for (let i = 1; i < COUNT; i++) for (let axis = 0; axis < 3; axis++) {
    const at = i * 3 + axis;
    // Smooth offset increments, so a sustained contact can converge fully to
    // its desired correction instead of losing clearance to smoothing drag.
    body.offsets[at] += (body.previous[at - 3] + 2 * body.previous[at] + body.previous[Math.min(i + 1, 15) * 3 + axis]) * 0.25;
  }
  offsetEelRig(body);
}

/** Bicycle steering: angular travel is bounded by travelled distance / .1.
 * There is no yaw transform applied to the rendered animal. */
export function steerEelHead(s: SwimState, body: EelBody, tank: TankDef, columns: readonly Column[], tx: number, ty: number, tz: number, speed: number, dt: number, avoid = true, denIndex = -1, pursuit = 0): void {
  body.target.x = tx; body.target.y = ty; body.target.z = tz;
  const corridor = denIndex >= 0 ? EEL_RADIUS : EEL_CORRIDOR;
  clearEelPoint(body.target, tank, columns, corridor, denIndex, EEL_JAW_DROP);
  let dx = body.target.x - s.x, dy = body.target.y - s.y, dz = body.target.z - s.z;
  const distance = Math.hypot(dx, dy, dz);
  const arrival = clamp(distance / 0.06, 0, 1);
  body.speed += (speed * arrival - body.speed) * Math.min(1, dt * 5);
  if (avoid) {
    const ahead = Math.min(0.16, distance * 0.6), hx = s.x + Math.cos(body.yaw) * ahead, hz = s.z + Math.sin(body.yaw) * ahead;
    body.point.x = hx; body.point.y = s.y + Math.sin(body.pitch) * ahead; body.point.z = hz;
    clearEelPoint(body.point, tank, columns, EEL_CORRIDOR, -1, EEL_JAW_DROP);
    dx += (body.point.x - hx) * 8; dy += (body.point.y - s.y - Math.sin(body.pitch) * ahead) * 8; dz += (body.point.z - hz) * 8;
  }
  const desired = Math.atan2(dz, dx), delta = Math.atan2(Math.sin(desired - body.yaw), Math.cos(desired - body.yaw));
  const turn = body.speed / EEL_MIN_RADIUS * dt;
  body.yaw += clamp(pursuit > 0 ? 2 * body.speed * Math.sin(delta) / pursuit * dt : delta, -turn, turn);
  const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.95, 0.95);
  body.pitch += clamp(pitch - body.pitch, -turn, turn);
  const ox = s.x, oy = s.y, oz = s.z;
  s.vx = Math.cos(body.yaw) * Math.cos(body.pitch) * body.speed;
  s.vy = Math.sin(body.pitch) * body.speed;
  s.vz = Math.sin(body.yaw) * Math.cos(body.pitch) * body.speed;
  s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
  body.point.x = s.x; body.point.y = s.y; body.point.z = s.z;
  clearEelPoint(body.point, tank, columns, corridor, denIndex, EEL_JAW_DROP);
  // The corridor normally makes this sub-millimetre. Bound the fallback for
  // solids introduced at runtime, retaining continuous motion.
  const cx = body.point.x - s.x, cy = body.point.y - s.y, cz = body.point.z - s.z;
  const correction = Math.hypot(cx, cy, cz);
  const k = correction <= body.speed * dt + 0.0001 ? 1 : Math.min(1, dt * 0.22 / Math.max(1e-9, correction));
  s.x += cx * k; s.y += cy * k; s.z += cz * k;
  recordEelHead(body, s.x, s.y, s.z, ox, oy, oz);
}

function catmull(rig: Float32Array, segment: number, t: number, axis: number, derivative: boolean): number {
  const p1 = rig[segment * 4 + axis], p2 = rig[(segment + 1) * 4 + axis];
  const p0 = segment > 0 ? rig[(segment - 1) * 4 + axis] : 2 * p1 - p2;
  const p3 = segment < 14 ? rig[(segment + 2) * 4 + axis] : 2 * p2 - p1;
  const a = -p0 + p2, b = 2 * p0 - 5 * p1 + 4 * p2 - p3, c = -p0 + 3 * p1 - 3 * p2 + p3;
  return derivative ? 0.5 * (a + 2 * b * t + 3 * c * t * t) : 0.5 * (2 * p1 + a * t + b * t * t + c * t * t * t);
}

export function sampleEelSpine(out: EelPoint, rig: Float32Array, s: number): EelPoint {
  const f = clamp(s, 0, 1) * 15, segment = Math.min(14, Math.floor(f)), t = f - segment;
  out.x = catmull(rig, segment, t, 0, false); out.y = catmull(rig, segment, t, 1, false); out.z = catmull(rig, segment, t, 2, false);
  return out;
}

/** Exact CPU mirror of part 12, including the jaw hinge and transported frame. */
export function deformEelVertex(out: EelPoint, rig: Float32Array, x: number, y: number, z: number, s = clamp(-x / EEL_LENGTH, 0, 1), gape = 0, jaw = false): EelPoint {
  if (jaw) {
    const angle = -clamp(gape, 0, 1) * 0.62, co = Math.cos(angle), si = Math.sin(angle), hx = -0.11 * EEL_LENGTH, hy = -0.026 * EEL_LENGTH;
    const dx = x - hx, dy = y - hy;
    x = hx + co * dx - si * dy; y = hy + si * dx + co * dy;
  }
  const f = clamp(s, 0, 1) * 15, segment = Math.min(14, Math.floor(f)), t = f - segment;
  let tx = -catmull(rig, segment, t, 0, true), ty = -catmull(rig, segment, t, 1, true), tz = -catmull(rig, segment, t, 2, true);
  let length = Math.hypot(tx, ty, tz);
  if (length < 1e-8) { tx = 1; ty = 0; tz = 0; length = 1; }
  tx /= length; ty /= length; tz /= length;
  let sx = Math.abs(ty) > 0.98 ? ty : -tz, sy = Math.abs(ty) > 0.98 ? -tx : 0, sz = Math.abs(ty) > 0.98 ? 0 : tx;
  const sideLength = Math.hypot(sx, sy, sz); sx /= sideLength; sy /= sideLength; sz /= sideLength;
  const ux = sy * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy * tx;
  sampleEelSpine(out, rig, s);
  const along = x + s * EEL_LENGTH;
  out.x += tx * along + ux * y + sx * z;
  out.y += ty * along + uy * y + sy * z;
  out.z += tz * along + uz * y + sz * z;
  return out;
}
