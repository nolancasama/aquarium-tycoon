import type { AnimalPose, SwimAnimal, SwimVolume, TunnelSwim } from './contract';
import { TUNNEL_SPECIES, type TunnelMotion } from './species';

const HISTORY = 256, INTERVAL = .025, BODY_POINTS = 13, MARGIN = .09;
/** Rest spots are approached this far above contact height. */
export const REST_LIFT = .2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));

/** Conservative signed distance to all static solids. The tunnel uses swept
 * half-ellipses: its centreline is the floor, rather than the middle of a tube.
 * Multiplication by the smaller ellipse radius deliberately underestimates
 * clearance, also covering the changing width at the viewing dome. */
export function tunnelClearance(v: SwimVolume, x: number, y: number, z: number): number {
  let d = Math.min(x - v.min.x, v.max.x - x, z - v.min.z, v.max.z - z,
    y - Math.max(v.min.y, v.floorY(x, z)), v.max.y - y);
  const points = v.tunnel.points;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a.inside && b.inside) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const w = Math.max(a.halfWidth, b.halfWidth), h = Math.max(a.height, b.height);
    const lateral = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    const vertical = Math.max(0, y - a.y - (b.y - a.y) * t);
    d = Math.min(d, (Math.hypot(lateral / w, vertical / h) - 1) * Math.min(w, h));
  }
  for (let i = 0; i < v.obstacles.length; i++) {
    const o = v.obstacles[i];
    if (o.kind === 'sphere') d = Math.min(d, Math.hypot(x - o.c.x, y - o.c.y, z - o.c.z) - o.r);
    else if (o.kind === 'capsule') {
      const dx = o.b.x - o.a.x, dy = o.b.y - o.a.y, dz = o.b.z - o.a.z;
      const t = clamp(((x - o.a.x) * dx + (y - o.a.y) * dy + (z - o.a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
      d = Math.min(d, Math.hypot(x - o.a.x - dx * t, y - o.a.y - dy * t, z - o.a.z - dz * t) - o.r);
    } else {
      const co = Math.cos(o.yaw ?? 0), si = Math.sin(o.yaw ?? 0), dx = x - o.c.x, dz = z - o.c.z;
      const qx = Math.abs(co * dx + si * dz) - o.half.x, qy = Math.abs(y - o.c.y) - o.half.y,
        qz = Math.abs(-si * dx + co * dz) - o.half.z;
      d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0));
    }
  }
  return d;
}

interface Body {
  pose: AnimalPose; spec: TunnelMotion; seed: number;
  x: number; y: number; z: number; yaw: number; pitch: number; speed: number;
  tx: number; ty: number; tz: number; targetAge: number; visits: number;
  desiredYaw: number; desiredPitch: number; plan: number;
  attract: number; ax: number; ay: number; az: number;
  hold: number; holdX: number; holdY: number; holdZ: number;
  rest: number; restIn: number; seekingRest: boolean; restDrop: number;
  history: Float64Array; body: Float64Array; cursor: number; distance: number; recorded: number;
}
function random(b: Body): number { b.seed = (Math.imul(b.seed, 1664525) + 1013904223) >>> 0; return b.seed / 4294967296; }

/** Writes by travelled arc length, so a stationary animal never consumes its
 * history and a bend reaches the peduncle after the head. No interpolated
 * spline can overshoot into glass: samples lie on short recorded segments. */
function sample(b: Body, out: Float32Array | Float64Array, n: number): void {
  let search = b.cursor;
  for (let j = 0; j < n; j++) {
    const goal = b.distance - b.spec.length * j / Math.max(1, n - 1);
    let x = b.x, y = b.y, z = b.z, dist = b.distance;
    if (goal <= b.recorded) {
      while (b.history[search * 4 + 3] > goal) search = (search + HISTORY - 1) % HISTORY;
      const next = (search + 1) % HISTORY * 4;
      x = b.history[next]; y = b.history[next + 1]; z = b.history[next + 2]; dist = b.history[next + 3];
    }
    const at = search * 4, t = clamp((goal - b.history[at + 3]) / Math.max(1e-10, dist - b.history[at + 3]), 0, 1);
    out[j * 3] = b.history[at] + (x - b.history[at]) * t;
    out[j * 3 + 1] = b.history[at + 1] + (y - b.history[at + 1]) * t;
    out[j * 3 + 2] = b.history[at + 2] + (z - b.history[at + 2]) * t;
  }
}

export function createTunnelSwim(initialVolume: SwimVolume, seed = 173): TunnelSwim {
  let volume = initialVolume;
  const bodies: Body[] = [], poses: AnimalPose[] = [];
  let serial = 0;

  function clearance(b: Body, x: number, y: number, z: number, others = true): number {
    let d = tunnelClearance(volume, x, y, z) - b.spec.radius - MARGIN;
    if (others) for (let k = 0; k < bodies.length; k++) {
      const other = bodies[k];
      if (other === b) continue;
      // Segment capsules, rather than only body centres, protect long tails.
      const p = other.body, r = b.spec.radius + other.spec.radius + .055;
      for (let j = 0; j < BODY_POINTS - 1; j++) {
        const at = j * 3, dx = p[at + 3] - p[at], dy = p[at + 4] - p[at + 1], dz = p[at + 5] - p[at + 2];
        const t = clamp(((x - p[at]) * dx + (y - p[at + 1]) * dy + (z - p[at + 2]) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
        d = Math.min(d, Math.hypot(x - p[at] - t * dx, y - p[at + 1] - t * dy, z - p[at + 2] - t * dz) - r);
      }
    }
    return d;
  }

  function target(b: Body): void {
    const s = b.spec, r = s.radius + MARGIN + .15, midX = (volume.min.x + volume.max.x) * .5;
    b.visits++; b.targetAge = 0;
    if (b.attract > 0) { b.tx = b.ax; b.ty = b.ay; b.tz = b.az; return; }
    if (b.hold > 0) { b.tx = b.holdX; b.ty = b.holdY; b.tz = b.holdZ; return; }
    if (s.behaviour === 'bottom' && b.restIn <= 0 && volume.restSpots?.length) {
      for (let i = 0; i < volume.restSpots.length; i++) {
        const spot = volume.restSpots[(i + b.visits) % volume.restSpots.length];
        // A little above the contact height, so look-ahead braking does not stop the approach short;
        // the renderer lowers a resting body onto the sand (REST_DROP in TunnelAnimals).
        if (clearance(b, spot.x, spot.y + s.radius + MARGIN + REST_LIFT, spot.z, false) >= 0) {
          b.tx = spot.x; b.ty = spot.y + s.radius + MARGIN + REST_LIFT; b.tz = spot.z; b.seekingRest = true; return;
        }
      }
    }
    b.seekingRest = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      // Alternate habitat halves rather than letting wander settle in one bay.
      b.tx = b.visits % 2 ? midX + random(b) * (volume.max.x - midX - r) : volume.min.x + r + random(b) * (midX - volume.min.x - r);
      b.tz = volume.min.z + r + random(b) * (volume.max.z - volume.min.z - r * 2);
      const floor = volume.floorY(b.tx, b.tz), depth = volume.max.y - floor;
      b.ty = clamp(floor + depth * (s.depthBand[0] + random(b) * (s.depthBand[1] - s.depthBand[0])), floor + r, volume.max.y - r);
      if (s.behaviour === 'cruise' && b.visits % 3 === 0 && volume.tunnel.points.length) {
        const p = volume.tunnel.points[(b.visits * 3) % volume.tunnel.points.length];
        b.tx = p.x; b.tz = p.z; b.ty = Math.min(volume.max.y - r, p.y + p.height + r + .65);
      } else if (volume.gates?.length && b.visits % 5 === 0) {
        const gate = volume.gates[b.visits % volume.gates.length];
        if (gate.r > s.radius + .2) { b.tx = gate.c.x; b.ty = gate.c.y; b.tz = gate.c.z; }
      }
      if (clearance(b, b.tx, b.ty, b.tz, false) > .1) return;
    }
    b.tx = b.x; b.ty = b.y; b.tz = b.z;
  }

  function spawn(animal: SwimAnimal): Body {
    const spec = TUNNEL_SPECIES[animal.species];
    const pose: AnimalPose = { ...animal, x: 0, y: 0, z: 0, hx: 1, hy: 0, hz: 0, bank: 0, speed: 0, resting: false, radius: spec.length / 2 };
    const b: Body = { pose, spec, seed: (seed + ++serial * 374761393) >>> 0,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: spec.cruiseSpeed[0], tx: 0, ty: 0, tz: 0, targetAge: 0, visits: serial,
      desiredYaw: 0, desiredPitch: 0, plan: 0, attract: 0, ax: 0, ay: 0, az: 0, hold: 0, holdX: 0, holdY: 0, holdZ: 0,
      rest: 0, restIn: 8 + serial * 3, seekingRest: false, restDrop: 0,
      history: new Float64Array(HISTORY * 4), body: new Float64Array(BODY_POINTS * 3), cursor: 0, distance: 0, recorded: 0 };
    let found = false;
    for (let attempt = 0; attempt < 4000 && !found; attempt++) {
      const r = spec.radius + MARGIN + .2;
      b.x = volume.min.x + r + random(b) * (volume.max.x - volume.min.x - r * 2);
      b.z = volume.min.z + r + random(b) * (volume.max.z - volume.min.z - r * 2);
      b.y = volume.min.y + r + random(b) * (volume.max.y - volume.min.y - r * 2);
      b.yaw = random(b) * Math.PI * 2; found = true;
      // Validate the entire initial tail, never initialise through a solid.
      for (let j = 0; j <= 24; j++) if (clearance(b, b.x - Math.cos(b.yaw) * spec.length * j / 24, b.y,
        b.z - Math.sin(b.yaw) * spec.length * j / 24) < .1) { found = false; break; }
    }
    if (!found) throw new Error('Shark habitat has no free spawn corridor');
    for (let j = 0; j < HISTORY; j++) {
      const at = (HISTORY - j) % HISTORY * 4, d = j * INTERVAL;
      b.history[at] = b.x - Math.cos(b.yaw) * d; b.history[at + 1] = b.y;
      b.history[at + 2] = b.z - Math.sin(b.yaw) * d; b.history[at + 3] = -d;
    }
    b.desiredYaw = b.yaw; target(b); sample(b, b.body, BODY_POINTS); updatePose(b, 0); return b;
  }

  function updatePose(b: Body, turn: number, dt = 0): void {
    const p = b.pose, centre = (BODY_POINTS - 1) / 2 * 3;
    p.x = b.body[centre]; p.y = b.body[centre + 1]; p.z = b.body[centre + 2];
    p.hx = Math.cos(b.yaw) * Math.cos(b.pitch); p.hy = Math.sin(b.pitch); p.hz = Math.sin(b.yaw) * Math.cos(b.pitch);
    p.speed = b.speed; p.resting = b.rest > 0;
    p.restDrop = (p.restDrop ?? 0) + ((b.rest > 0 ? b.restDrop : 0) - (p.restDrop ?? 0)) * Math.min(1, dt * .9);
    p.bank += (clamp(-turn * b.speed * .55, -b.spec.maxBank, b.spec.maxBank) - p.bank) * .06;
  }

  function plan(b: Body): void {
    const dx = b.tx - b.x, dy = b.ty - b.y, dz = b.tz - b.z;
    const desiredYaw = Math.atan2(dz, dx), desiredPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -b.spec.maxClimb, b.spec.maxClimb);
    let best = -Infinity;
    // A fan of predicted paths includes climbing and diving escape routes.
    // Steering is infrequent; the final swept move still checks every frame.
    for (let k = 0; k < 15; k++) {
      const column = k % 5;
      const yaw = column === 2 ? desiredYaw : b.yaw + (column - 2) * .52;
      const pitch = clamp(desiredPitch + (Math.floor(k / 5) - 1) * .32, -b.spec.maxClimb, b.spec.maxClimb);
      const hx = Math.cos(yaw) * Math.cos(pitch), hy = Math.sin(pitch), hz = Math.sin(yaw) * Math.cos(pitch);
      let look = Math.max(2, b.speed / b.spec.maxTurnRate * 1.5);
      // Approaching a rest spot: do not probe past it into the sand or ledge it lies on.
      if (b.seekingRest) look = Math.min(look, Math.max(.6, Math.hypot(dx, dy, dz)));
      const near = clearance(b, b.x + hx * look * .45, b.y + hy * look * .45, b.z + hz * look * .45);
      const far = clearance(b, b.x + hx * look, b.y + hy * look, b.z + hz * look);
      const free = Math.min(near, far);
      const score = Math.cos(angle(yaw - desiredYaw)) * 2.8 - Math.abs(pitch - desiredPitch) * 1.6
        + Math.min(2, free) * 1.6 - Math.abs(angle(yaw - b.yaw)) * .12 + (free < .15 ? free * 12 - 5 : 0);
      if (score > best) { best = score; b.desiredYaw = yaw; b.desiredPitch = pitch; }
    }
  }

  const api: TunnelSwim = {
    sync(animals) {
      for (let i = bodies.length - 1; i >= 0; i--) if (!animals.some(a => a.id === bodies[i].pose.id && a.species === bodies[i].pose.species)) {
        bodies.splice(i, 1); poses.splice(i, 1);
      }
      for (const animal of animals) if (!bodies.some(b => b.pose.id === animal.id)) {
        const b = spawn(animal); bodies.push(b); poses.push(b.pose);
      }
    },
    setVolume(next) { volume = next; for (const b of bodies) { b.plan = 0; target(b); } },
    poses: () => poses,
    attract(id, point, seconds) {
      const b = bodies.find(a => a.pose.id === id); if (!b) return;
      b.attract = Math.max(0, seconds); b.ax = point.x; b.ay = point.y; b.az = point.z;
      b.rest = 0; b.seekingRest = false; target(b); b.plan = 0;
    },
    hold(id, seconds) {
      const b = bodies.find(a => a.pose.id === id); if (!b) return;
      b.hold = Math.max(0, seconds); b.holdX = b.pose.x; b.holdY = b.pose.y; b.holdZ = b.pose.z;
      target(b); b.plan = 0;
    },
    spine(id, out, n) {
      const b = bodies.find(a => a.pose.id === id); if (!b) return false;
      sample(b, out, Math.min(n, Math.floor(out.length / 3))); return true;
    },
    step(delta) {
      const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, .05); if (!dt) return;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i], s = b.spec;
        b.attract = Math.max(0, b.attract - dt); b.hold = Math.max(0, b.hold - dt);
        b.restIn -= dt; b.targetAge += dt; b.plan -= dt;
        if (b.rest > 0) {
          b.rest -= dt; b.speed = Math.max(0, b.speed - s.accel * dt);
          if (b.rest <= 0) { b.restIn = 40 + random(b) * 45; target(b); }
        }
        const remaining = Math.hypot(b.tx - b.x, b.ty - b.y, b.tz - b.z);
        // Settling: over the spot and a little above it (dive angles are limited, so it may not get lower);
        // the visual rest drop then lowers the body onto the surface. Give up after a minute.
        const above = b.y - b.ty, across = Math.hypot(b.tx - b.x, b.tz - b.z);
        if (b.seekingRest && across < .8 && above > -.3 && above < 1.2) {
          b.rest = s.restSeconds[0] + random(b) * (s.restSeconds[1] - s.restSeconds[0]); b.seekingRest = false;
          // Contact: the body's underside on the spot (target height minus the approach lift and radius).
          b.restDrop = Math.max(0, b.y - (b.ty - s.radius - MARGIN - REST_LIFT + s.bellyDepth));
        } else if (b.seekingRest && b.targetAge > 60) { b.seekingRest = false; b.restIn = 20; target(b); }
        if (b.hold <= 0 && b.rest <= 0 && !b.seekingRest && (remaining < 1.7 || b.targetAge > 32)) target(b);
        if (b.plan <= 0) { plan(b); b.plan = .18; }
        const turn = clamp(angle(b.desiredYaw - b.yaw), -s.maxTurnRate * dt * .7, s.maxTurnRate * dt * .7);
        b.yaw += turn; b.pitch += clamp(b.desiredPitch - b.pitch, -s.maxTurnRate * dt * .7, s.maxTurnRate * dt * .7);
        const hx = Math.cos(b.yaw) * Math.cos(b.pitch), hy = Math.sin(b.pitch), hz = Math.sin(b.yaw) * Math.cos(b.pitch);
        let wanted = s.cruiseSpeed[0] + (s.cruiseSpeed[1] - s.cruiseSpeed[0]) * .55;
        if (b.attract > 0) wanted = Math.max(wanted, 1.5);
        if (b.hold > 0) wanted = .09;
        // Slow enough near the spot that the turning circle (speed / turn rate) is smaller than the gap.
        if (b.seekingRest) wanted = Math.min(wanted, Math.max(.06, remaining * s.maxTurnRate * .3));
        if (b.rest > 0) wanted = 0;
        const ahead = clearance(b, b.x + hx * Math.max(.3, b.speed * .8), b.y + hy * Math.max(.3, b.speed * .8), b.z + hz * Math.max(.3, b.speed * .8));
        wanted *= clamp(ahead / .6, 0, 1);
        // Question holds brake smoothly but promptly enough to stay by the
        // selected window even when requested at maximum cruising speed.
        b.speed += clamp(wanted - b.speed, -s.accel * (b.hold > 0 ? 2.4 : 1) * dt, s.accel * dt);
        const distance = b.speed * dt, nx = b.x + hx * distance, ny = b.y + hy * distance, nz = b.z + hz * distance;
        // Reject a swept step before contact. This is stopping, never projection
        // or teleportation; the existing safe history remains untouched.
        if (clearance(b, nx, ny, nz) > .002) {
          const previous = b.distance; b.distance += distance;
          while (b.recorded + INTERVAL <= b.distance) {
            b.recorded += INTERVAL; const t = (b.recorded - previous) / Math.max(1e-10, distance);
            b.cursor = (b.cursor + 1) % HISTORY; const at = b.cursor * 4;
            b.history[at] = b.x + hx * distance * t; b.history[at + 1] = b.y + hy * distance * t;
            b.history[at + 2] = b.z + hz * distance * t; b.history[at + 3] = b.recorded;
          }
          b.x = nx; b.y = ny; b.z = nz;
        } else { b.speed = Math.max(0, b.speed - s.accel * dt); b.plan = 0; }
        sample(b, b.body, BODY_POINTS); updatePose(b, turn / dt, dt);
      }
    },
  };
  return api;
}
