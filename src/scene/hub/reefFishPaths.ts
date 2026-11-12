import * as THREE from "three";

export const REEF_SWIM_RADIUS = 1.88;
export const REEF_SWIM_HEIGHT = 3;

export interface ReefFishPath {
  curve: THREE.CurvePath<THREE.Vector3>;
  length: number;
  phase: number;
  clearance: number;
  band: readonly [number, number];
  waypoints: readonly THREE.Vector3[];
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Exact segment/slab intersection, including the segment's endpoints. */
function crossesBox(a: THREE.Vector3, b: THREE.Vector3, box: THREE.Box3) {
  let enter = 0, exit = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) {
      if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return false;
    } else {
      const t0 = (box.min[axis] - a[axis]) / delta;
      const t1 = (box.max[axis] - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t0, t1));
      exit = Math.min(exit, Math.max(t0, t1));
      if (enter > exit) return false;
    }
  }
  return true;
}

/**
 * A Bezier curve lies inside its control hull. Subdivision proves clearance
 * across the whole turn, including the space between any rendered samples.
 */
function clearTurn(points: THREE.Vector3[], boxes: readonly THREE.Box3[], depth = 0): boolean {
  const hull = new THREE.Box3().setFromPoints(points);
  const nearby = boxes.filter((box) => box.intersectsBox(hull));
  if (!nearby.length) return true;
  if (depth === 14) return false;
  const [a, b, c, d] = points;
  const ab = a.clone().lerp(b, 0.5), bc = b.clone().lerp(c, 0.5), cd = c.clone().lerp(d, 0.5);
  const abc = ab.clone().lerp(bc, 0.5), bcd = bc.clone().lerp(cd, 0.5);
  const middle = abc.clone().lerp(bcd, 0.5);
  return clearTurn([a, ab, abc, middle], nearby, depth + 1)
    && clearTurn([middle, bcd, cd, d], nearby, depth + 1);
}

/**
 * Seeded visibility-graph roaming rather than a circle around the tank axis.
 * Obstacles are the actual decor bounds in tank-local coordinates (floor y=0).
 * The bounding sphere includes the entire fish and its animated tail.
 */
export function createReefFishPath(
  seed: number, band: readonly [number, number], size: number, obstacles: readonly THREE.Box3[]
): ReefFishPath {
  const random = randomSource(seed);
  const clearance = size * 0.6 + 0.035;
  const radius = REEF_SWIM_RADIUS - clearance;
  const low = Math.max(band[0], clearance), high = Math.min(band[1], REEF_SWIM_HEIGHT - clearance);
  if (radius <= 0 || low >= high) throw new Error("Reef fish has no usable swimming band");
  const boxes = obstacles.map((box) => box.clone().expandByScalar(clearance));
  const nodes: THREE.Vector3[] = [];
  for (let attempt = 0; attempt < 3500 && nodes.length < 84; attempt++) {
    const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * radius;
    const point = new THREE.Vector3(Math.cos(angle) * r, low + random() * (high - low), Math.sin(angle) * r);
    if (boxes.every((box) => box.distanceToPoint(point) > 0.025)) nodes.push(point);
  }
  if (nodes.length < 6) throw new Error("Reef decor leaves no clear, smoothly turning fish route");
  const links = nodes.map(() => [] as number[]);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const distance = nodes[i].distanceTo(nodes[j]);
    if (distance > 0.55 && distance < 2.5 && boxes.every((box) => !crossesBox(nodes[i], nodes[j], box))) {
      links[i].push(j);
      links[j].push(i);
    }
  }
  const forward = (previous: number, current: number, next: number) => {
    const incoming = nodes[current].clone().sub(nodes[previous]).normalize();
    const outgoing = nodes[next].clone().sub(nodes[current]).normalize();
    return incoming.dot(outgoing) > -0.65;
  };
  let route: number[] | undefined;
  for (let attempt = 0; attempt < 140 && !route; attempt++) {
    const walk = [Math.floor(random() * nodes.length)];
    const count = 7 + Math.floor(random() * 5);
    for (let step = 1; step < count; step++) {
      const current = walk[walk.length - 1];
      const choices = links[current].filter((next) => !walk.includes(next)
        && (step === 1 || forward(walk[step - 2], current, next)));
      if (!choices.length) break;
      walk.push(choices[Math.floor(random() * choices.length)]);
    }
    if (walk.length < 6) continue;
    const last = walk[walk.length - 1];
    if (links[last].includes(walk[0]) && forward(walk[walk.length - 2], last, walk[0])
      && forward(last, walk[0], walk[1])) route = walk;
  }
  if (!route) throw new Error("Reef decor leaves no clear, smoothly turning fish route");
  const waypoints = route.map((index) => nodes[index]);
  const corners = waypoints.map((point, index) => {
    const previous = waypoints[(index + waypoints.length - 1) % waypoints.length];
    const next = waypoints[(index + 1) % waypoints.length];
    let cut = Math.min(0.23, point.distanceTo(previous) * 0.28, point.distanceTo(next) * 0.28);
    for (let attempt = 0; attempt < 16; attempt++, cut *= 0.5) {
      const entry = point.clone().addScaledVector(previous.clone().sub(point).normalize(), cut);
      const exit = point.clone().addScaledVector(next.clone().sub(point).normalize(), cut);
      const controls = [entry, entry.clone().lerp(point, 2 / 3), exit.clone().lerp(point, 2 / 3), exit];
      if (clearTurn(controls, boxes)) return new THREE.CubicBezierCurve3(...controls as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    }
    throw new Error("Unable to prove reef fish turn clearance");
  });
  const curve = new THREE.CurvePath<THREE.Vector3>();
  corners.forEach((corner, index) => {
    curve.add(corner);
    curve.add(new THREE.LineCurve3(corner.v3, corners[(index + 1) % corners.length].v0));
  });
  return { curve, length: curve.getLength(), phase: random() * Math.PI * 2, clearance, band: [low, high], waypoints };
}

/** Position and physical velocity; orient a +z-nosed model along velocity. */
export function sampleReefFishPath(path: ReefFishPath, time: number, pace: number) {
  const phase = path.phase;
  // Integrate positive speed modulation, preserving smooth motion at every turn.
  const distance = pace * (time + 0.22 / 0.37 * Math.sin(time * 0.37 + phase)
    + 0.1 / 0.91 * Math.sin(time * 0.91 + phase * 1.7));
  const unit = ((distance / path.length + phase / (Math.PI * 2)) % 1 + 1) % 1;
  const speed = pace * (1 + 0.22 * Math.cos(time * 0.37 + phase) + 0.1 * Math.cos(time * 0.91 + phase * 1.7));
  const position = path.curve.getPoint(unit);
  const before = path.curve.getPoint((unit + 1 - 0.00001) % 1);
  const after = path.curve.getPoint((unit + 0.00001) % 1);
  const velocity = after.sub(before).normalize().multiplyScalar(speed);
  return { position, velocity };
}
