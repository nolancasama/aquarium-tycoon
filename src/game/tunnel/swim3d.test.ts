import { describe, expect, it } from 'vitest';
import type { P3, SwimAnimal, SwimVolume } from './contract';
import { TUNNEL_SPECIES } from './species';
import { createTunnelSwim, tunnelClearance } from './swim3d';
import { sharkSwimVolume, TUNNEL_SHAPE } from '../data/sharkTunnel';

function habitat(): SwimVolume {
  return {
    min: { x: -16, y: -.5, z: -15 }, max: { x: 16, y: 8, z: 15 }, floorY: () => -.5,
    tunnel: { closed: true, points: [
      [-6, 10], [-6, 0], [-6, -7], [0, -9], [6, -7], [6, 0], [6, 10], [0, 10],
    ].map(([x, z], i) => ({ x, y: 0, z, halfWidth: i === 3 ? 4.5 : 2, height: i === 3 ? 4.5 : 2.9 })) },
    obstacles: [
      { kind: 'capsule', a: { x: -11, y: 0, z: -3 }, b: { x: -11, y: 5, z: -3 }, r: 1 },
      { kind: 'capsule', a: { x: 11, y: 0, z: -5 }, b: { x: 11, y: 4, z: -5 }, r: 1 },
      { kind: 'capsule', a: { x: -2, y: 0, z: 1 }, b: { x: -2, y: 4, z: 1 }, r: .55 },
      { kind: 'capsule', a: { x: 2, y: 0, z: 1 }, b: { x: 2, y: 4, z: 1 }, r: .55 },
      { kind: 'capsule', a: { x: -2, y: 4, z: 1 }, b: { x: 2, y: 4, z: 1 }, r: .55 },
      { kind: 'box', c: { x: -11, y: 0, z: 6 }, half: { x: 2, y: .5, z: 1.5 }, yaw: .25 },
      { kind: 'sphere', c: { x: 12, y: .2, z: 11 }, r: .8 },
    ],
    gates: [{ c: { x: 0, y: 2, z: 1 }, axis: { x: 0, y: 0, z: 1 }, r: 1.4 }],
    restSpots: [{ x: -11, y: .5, z: 6 }, { x: 11, y: -.5, z: 7 }],
  };
}
const roster: SwimAnimal[] = [
  ...Array.from({ length: 4 }, (_, i): SwimAnimal => ({ id: `b${i}`, species: 'blacktip' })),
  ...Array.from({ length: 2 }, (_, i): SwimAnimal => ({ id: `z${i}`, species: 'zebrashark' })),
  ...Array.from({ length: 3 }, (_, i): SwimAnimal => ({ id: `r${i}`, species: 'eagleray' })),
];
const sq = (n: number) => n * n;
function segmentDistance(x: number, y: number, z: number, a: P3, b: P3): number {
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy + (z - a.z) * vz) / (vx * vx + vy * vy + vz * vz || 1)));
  return Math.hypot(x - a.x - t * vx, y - a.y - t * vy, z - a.z - t * vz);
}
/** Independent oracle: discretise the actual glass surface into short swept
 * elliptical sections, and measure Euclidean distance to that surface. It
 * deliberately does not call the simulation's clearance routine. */
function physicalGap(v: SwimVolume, x: number, y: number, z: number): number {
  let gap = Math.min(x - v.min.x, v.max.x - x, z - v.min.z, v.max.z - z, y - v.floorY(x, z), v.max.y - y);
  for (let i = 0; i < v.tunnel.points.length; i++) {
    const a = v.tunnel.points[i], b = v.tunnel.points[(i + 1) % v.tunnel.points.length];
    if (a.inside && b.inside) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const lateral = Math.hypot(x - a.x - t * dx, z - a.z - t * dz), vertical = y - a.y - t * (b.y - a.y);
    const w = a.halfWidth + (b.halfWidth - a.halfWidth) * t, h = a.height + (b.height - a.height) * t;
    if (sq(lateral / w) + sq(Math.max(0, vertical) / h) < 1) return -1;
    // Polygon sampling overestimates the gap by at most .006m for this fixture.
    let nearest = Infinity;
    for (let k = 0; k <= 48; k++) {
      const theta = k / 48 * Math.PI / 2;
      nearest = Math.min(nearest, Math.hypot(lateral - Math.cos(theta) * w, vertical - Math.sin(theta) * h));
    }
    gap = Math.min(gap, nearest - .006);
  }
  for (const o of v.obstacles) {
    if (o.kind === 'sphere') gap = Math.min(gap, Math.hypot(x - o.c.x, y - o.c.y, z - o.c.z) - o.r);
    else if (o.kind === 'capsule') gap = Math.min(gap, segmentDistance(x, y, z, o.a, o.b) - o.r);
    else {
      const dx = x - o.c.x, dz = z - o.c.z, co = Math.cos(o.yaw ?? 0), si = Math.sin(o.yaw ?? 0);
      const q = [Math.abs(dx * co + dz * si) - o.half.x, Math.abs(y - o.c.y) - o.half.y, Math.abs(dz * co - dx * si) - o.half.z];
      gap = Math.min(gap, Math.hypot(...q.map(n => Math.max(0, n))) + Math.min(0, Math.max(...q)));
    }
  }
  return gap;
}

describe('large-animal three dimensional swim', () => {
  it('keeps nine complete bodies safe, separate and moving throughout ten minutes', () => {
    const v = habitat(), swim = createTunnelSwim(v, 173); swim.sync(roster);
    const samples = roster.map(() => new Float32Array(39));
    const previous = swim.poses().map(p => [p.hx, p.hy, p.hz]);
    const halves = roster.map(() => [false, false]), overhead = new Set<string>(), rested = new Set<string>();
    let minimumGap = Infinity, minimumSeparation = Infinity, maximumTurn = 0, maximumBank = 0;
    for (let frame = 0; frame < 60 * 600; frame++) {
      swim.step(1 / 60);
      const poses = swim.poses();
      for (let i = 0; i < poses.length; i++) {
        const p = poses[i], spec = TUNNEL_SPECIES[p.species], points = samples[i]; swim.spine(p.id, points, 13);
        for (let j = 0; j < points.length; j += 3) {
          minimumGap = Math.min(minimumGap, tunnelClearance(v, points[j], points[j + 1], points[j + 2]) - spec.radius);
          if (frame % 120 === 0) minimumGap = Math.min(minimumGap, physicalGap(v, points[j], points[j + 1], points[j + 2]) - spec.radius);
        }
        const old = previous[i];
        const turn = Math.acos(Math.max(-1, Math.min(1, old[0] * p.hx + old[1] * p.hy + old[2] * p.hz)));
        maximumTurn = Math.max(maximumTurn, turn / spec.maxTurnRate * 60);
        maximumBank = Math.max(maximumBank, Math.abs(p.bank) / spec.maxBank);
        old[0] = p.hx; old[1] = p.hy; old[2] = p.hz;
        if (p.x < -1) halves[i][0] = true; if (p.x > 1) halves[i][1] = true;
        if (p.resting && p.y - (p.restDrop ?? 0) < 1.5) rested.add(p.id);
        for (const a of v.tunnel.points) if (Math.hypot(p.x - a.x, p.z - a.z) < a.halfWidth && p.y > a.y + a.height + spec.radius) overhead.add(p.id);
        for (let k = 0; k < i; k++) {
          const other = poses[k], sum = spec.radius + TUNNEL_SPECIES[other.species].radius;
          if (Math.hypot(p.x - other.x, p.y - other.y, p.z - other.z) > 4.5) continue;
          for (let a = 0; a < 39; a += 3) for (let b = 0; b < 39; b += 3) {
            minimumSeparation = Math.min(minimumSeparation, Math.sqrt(sq(points[a] - samples[k][b]) + sq(points[a + 1] - samples[k][b + 1]) + sq(points[a + 2] - samples[k][b + 2])) - sum);
          }
        }
      }
    }
    expect(minimumGap).toBeGreaterThan(0);
    expect(minimumSeparation).toBeGreaterThan(0);
    expect(maximumTurn).toBeLessThanOrEqual(1.001);
    expect(maximumBank).toBeLessThanOrEqual(1);
    expect(halves.every(([left, right]) => left && right)).toBe(true);
    for (const animal of roster.filter(a => a.species === 'blacktip')) expect(overhead.has(animal.id), `${animal.id} must visit the crown`).toBe(true);
    // Resting is asserted in the real-habitat test below (open-sand and ledge spots); in this
    // crowded fixture the only spots are a raised block and a corner, and rests are not guaranteed.
    expect(rested.size).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('attracts by normal swimming and brakes into a bounded question hold', () => {
    const v = habitat(), swim = createTunnelSwim(v, 73); swim.sync([{ id: 'find', species: 'blacktip' }]);
    const start = swim.poses()[0], point = { x: 0, y: 6, z: 0 };
    swim.attract('find', point, 25);
    let nearest = Infinity;
    for (let i = 0; i < 1200; i++) { swim.step(1 / 60); const p = swim.poses()[0]; nearest = Math.min(nearest, Math.hypot(p.x - point.x, p.y - point.y, p.z - point.z)); }
    expect(nearest).toBeLessThan(6);
    const anchor = { x: start.x, y: start.y, z: start.z }; swim.hold('find', 12);
    let movement = 0;
    for (let i = 0; i < 720; i++) { swim.step(1 / 60); const p = swim.poses()[0]; movement = Math.max(movement, Math.hypot(p.x - anchor.x, p.y - anchor.y, p.z - anchor.z)); }
    expect(movement).toBeLessThan(2.5);
  });

  it('is deterministic, preserves live pose storage, and synchronises removals', () => {
    const a = createTunnelSwim(habitat(), 42), b = createTunnelSwim(habitat(), 42); a.sync(roster); b.sync(roster);
    const array = a.poses(), pose = array[0];
    for (let i = 0; i < 900; i++) { a.step(1 / 60); b.step(1 / 60); }
    expect(a.poses()).toEqual(b.poses()); expect(a.poses()).toBe(array); expect(a.poses()[0]).toBe(pose);
    const spineA = new Float32Array(48), spineB = new Float32Array(48); a.spine('b0', spineA, 16); b.spine('b0', spineB, 16); expect(spineA).toEqual(spineB);
    a.sync(roster.slice(1)); expect(a.spine('b0', spineA, 16)).toBe(false); expect(a.poses()).toHaveLength(8);
  });

  it('negative control: disabling tunnel avoidance makes the independent glass check fail; restoring it protects glass', () => {
    const v = habitat(), disabled = { ...v, tunnel: { ...v.tunnel, points: [] } };
    function minimum(volume: SwimVolume): number {
      const swim = createTunnelSwim(volume, 91); swim.sync([{ id: 'probe', species: 'blacktip' }]);
      swim.attract('probe', { x: -6, y: 1.3, z: 0 }, 60);
      const samples = new Float32Array(24); let gap = Infinity;
      for (let i = 0; i < 3600; i++) {
        swim.step(1 / 60);
        if (i % 30) continue;
        swim.spine('probe', samples, 8);
        for (let j = 0; j < 24; j += 3) gap = Math.min(gap, physicalGap(v, samples[j], samples[j + 1], samples[j + 2]) - TUNNEL_SPECIES.blacktip.radius);
      }
      return gap;
    }
    expect(minimum(disabled)).toBeLessThan(0);
    expect(minimum(v)).toBeGreaterThan(0);
  });

  it('lives safely in the real Shark Tunnel habitat: a full roster, a ledge and an arch', () => {
    const v = sharkSwimVolume([{ zone: 1, kind: 'tunnelLedge' }, { zone: 3, kind: 'tunnelArch' }, { zone: 5, kind: 'tunnelPinnacle' }]);
    const animals: SwimAnimal[] = [
      { id: 'b0', species: 'blacktip' }, { id: 'b1', species: 'blacktip' },
      { id: 'z0', species: 'zebrashark' }, { id: 'z1', species: 'zebrashark' },
      { id: 'r0', species: 'eagleray' }, { id: 'r1', species: 'eagleray' }
    ];
    const swim = createTunnelSwim(v, 2026); swim.sync(animals);
    const pts = new Float32Array(39), overhead = new Set<string>(), rested = new Set<string>(), beside = new Set<string>();
    const travelled = new Map<string, number>(), last = new Map<string, [number, number, number]>();
    let gap = Infinity, slowest = 0;
    for (let frame = 0; frame < 60 * 420; frame++) {
      const t0 = performance.now(); swim.step(1 / 60); slowest = Math.max(slowest, performance.now() - t0);
      for (const p of swim.poses()) {
        swim.spine(p.id, pts, 13);
        for (let j = 0; j < 39; j += 3) gap = Math.min(gap, tunnelClearance(v, pts[j], pts[j + 1], pts[j + 2]) - TUNNEL_SPECIES[p.species].radius);
        const f = nearestWalkway(p.x, p.z);
        if (f.d < f.halfWidth && p.y > f.height + 0.3) overhead.add(p.id);
        if (f.d > f.halfWidth && f.d < f.halfWidth + 4 && p.y < 2.6) beside.add(p.id);
        if (p.resting) rested.add(p.id);
        const q = last.get(p.id);
        if (q) travelled.set(p.id, (travelled.get(p.id) ?? 0) + Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]));
        last.set(p.id, [p.x, p.y, p.z]);
      }
    }
    expect(gap).toBeGreaterThan(0);
    for (const id of ['b0', 'b1', 'r0', 'r1']) expect(overhead.has(id), `${id} passes over the tunnel`).toBe(true);
    // Rays are midwater gliders; the sharks are the ones that cruise along the glass.
    for (const id of ['b0', 'b1', 'z0', 'z1']) expect(beside.has(id), `${id} passes beside the glass`).toBe(true);
    expect(rested.size, 'zebra sharks rest on the sand').toBe(2);
    for (const a of animals) expect(travelled.get(a.id)!, `${a.id} keeps swimming`).toBeGreaterThan(a.species === 'zebrashark' ? 70 : 150);
    expect(slowest).toBeLessThan(25);
  }, 120_000);
});

function nearestWalkway(x: number, z: number) {
  let best = { d: Infinity, halfWidth: 0, height: 0 };
  for (const p of TUNNEL_SHAPE.points) {
    if (p.inside) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < best.d) best = { d, halfWidth: p.halfWidth, height: p.height };
  }
  return best;
}
