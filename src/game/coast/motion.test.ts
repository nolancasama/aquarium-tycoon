import { describe, expect, it } from "vitest";
import { COAST_HABITATS, EXHIBITS, ISLAND_CLEAR, rampSections, type CoastHabitat } from "../data/coast";
import { angleDiff, landLegClear, MAX_SPEED, MAX_SWIM_SPEED, newMover, PENGUIN_DASH, PARAMS, speedCap, PENGUIN_LAND_SEPARATION, PENGUIN_SWIM_SEPARATION, rampRect, SPECIES_OF, stationLandRoute, stationSpots, stepMover, waterLegClear, type Mover, type MoveCtx } from "./motion";

/** The island's rock: a frustum from its waterline radius up to a flat top (the scene draws the same shape). */
export const ISLAND_TOP_R = 0.55;
function islandSurface(ex: (typeof EXHIBITS)[CoastHabitat], i: number, x: number, z: number): number {
  const isl = ex.islands[i];
  const d = Math.hypot(x - isl.x, z - isl.z);
  const rt = isl.topRadius ?? isl.r * ISLAND_TOP_R;
  if (d <= rt) return isl.top;
  if (d >= isl.r) return -Infinity;
  return isl.top + (ex.pool.surface - isl.top) * ((d - rt) / (isl.r - rt));
}

const motionTrace = (movers: readonly Mover[]) => JSON.stringify(movers.map((m) => ({
  id: m.id, x: m.x, y: m.y, z: m.z, mode: m.mode, area: m.area, speed: m.speed, heading: m.heading, pitch: m.pitch,
  path: m.path, feeding: m.feeding, exit: m.exit, blockedFor: m.blockedFor
})));

function check(m: Mover, h: CoastHabitat, prev: Pick<Mover, "x" | "y" | "z" | "mode" | "area">, dt: number) {
  const ex = EXHIBITS[h];
  const where = `${h} ${m.id} ${m.mode} ${m.area} (${m.x.toFixed(2)}, ${m.y.toFixed(2)}, ${m.z.toFixed(2)})`;
  expect(Number.isFinite(m.x + m.y + m.z + m.heading + m.pitch + m.speed), where).toBe(true);
  // No teleporting: never further than the fastest leg allows (penguin bursts under water have their own cap).
  const cap = Math.max(speedCap(m), speedCap({ species: m.species, mode: prev.mode }));
  expect(Math.hypot(m.x - prev.x, m.y - prev.y, m.z - prev.z), where).toBeLessThanOrEqual(cap * dt + 1e-6);
  if (m.mode === "rest" || m.mode === "walk") {
    if (m.area === "land") {
      expect(m.y, where).toBeCloseTo(ex.land.y, 6);
      expect(m.x >= ex.land.minX && m.x <= ex.land.maxX && m.z >= ex.land.minZ && m.z <= ex.land.maxZ, where).toBe(true);
      for (const b of ex.boulders) expect(Math.hypot(m.x - b.x, m.z - b.z), where).toBeGreaterThan(b.r);
      for (const l of ex.ledges ?? []) expect(Math.hypot(m.x - l.x, m.z - l.z), where).toBeGreaterThan(l.r);
    } else if (m.area === "ledge") {
      const l = ex.ledges![m.ledge!];
      expect(m.y, where).toBeCloseTo(l.top, 6);
      expect(Math.hypot(m.x - l.x, m.z - l.z), where).toBeLessThan(l.r * ISLAND_TOP_R);
      if (prev.area !== "ledge") expect(prev.mode, where).toBe("stepUp");
    } else {
      expect(m.area, where).toBe("island");
      const isl = ex.islands[m.island];
      expect(m.y, where).toBeCloseTo(isl.top, 6);
      expect(Math.hypot(m.x - isl.x, m.z - isl.z), where).toBeLessThan(isl.topRadius ?? isl.r * ISLAND_TOP_R);
      if (prev.area !== "island") expect(prev.mode, where).toBe("climb");
    }
  }
  if (m.mode === "swim" || m.mode === "breathe" || m.mode === "float") {
    expect(m.area, where).toBe("water");
    const p = ex.pool;
    expect(m.x > p.minX && m.x < p.maxX && m.z > p.minZ && m.z < p.maxZ, where).toBe(true);
    expect(m.y, where).toBeGreaterThanOrEqual(p.floor + 0.2);
    expect(m.y, where).toBeLessThanOrEqual(p.surface);
    for (const isl of ex.islands) expect(Math.hypot(m.x - isl.x, m.z - isl.z), where).toBeGreaterThan(isl.r + ISLAND_CLEAR * 0.5);
    for (const o of ex.swimObstacles ?? []) expect(Math.hypot(m.x - o.x, m.z - o.z), `${where} inside ${o.kind}`).toBeGreaterThan(o.r + 0.1);
    expect(waterLegClear(ex, m, m, 0), `${where} inside solid swimming footprint`).toBe(true);
  }
  if (m.mode === "rampDown" || m.mode === "rampUp") {
    // On the ramp's slope: between the land top and the waterline, never under the water's surface by more than a body.
    expect(m.y, where).toBeLessThanOrEqual(ex.land.y + 1e-6);
    expect(m.y, where).toBeGreaterThanOrEqual(ex.pool.surface - 0.07);
    expect(ex.ramps.some((r) => Math.abs(m.x - r.top.x) < (r.width ?? 1.5) / 2), where).toBe(true);
  }
  if (m.mode === "climb" || m.mode === "hop") {
    expect(m.y, where).toBeGreaterThanOrEqual(islandSurface(ex, m.island, m.x, m.z) - 1e-6);
    if (m.mode === "climb" && prev.mode !== "climb") {
      const at = ex.islands[m.island].climb;
      expect(Math.hypot(m.x - at.x, m.z - at.z), `${where} did not use floe climb point`).toBeLessThan(1e-6);
    }
  }
  if (m.mode === "stepUp" || m.mode === "stepDown") {
    const l = ex.ledges![m.ledge!], d = Math.hypot(m.x - l.x, m.z - l.z), topR = l.r * ISLAND_TOP_R;
    const surface = d >= l.r ? ex.land.y : d <= topR ? l.top : l.top + (ex.land.y - l.top) * (d - topR) / (l.r - topR);
    expect(m.y, `${where} under resting ledge`).toBeGreaterThanOrEqual(surface - 1e-6);
  }
}

function simulate(h: CoastHabitat, seed: number, seconds: number, ctxExtra: Partial<MoveCtx> = {}) {
  const ex = EXHIBITS[h];
  const movers: Mover[] = [];
  for (let k = 0; k < 3; k++) movers.push(newMover(`${h}${k}`, SPECIES_OF[h], ex, seed * 10 + k, 0, ctxExtra.landItems, movers));
  const events: string[] = [];
  const modes = new Set<string>();
  const ledges = new Set<number>();
  const entered = new Set<string>(), returned = new Set<string>();
  let quietRests = 0;
  const dt = 1 / 30;
  let time = 0;
  for (const m of movers) check(m, h, m, dt);
  for (let i = 0; i < seconds / dt; i++) {
    time += dt;
    for (const m of movers) {
      const prev = { x: m.x, y: m.y, z: m.z, mode: m.mode, area: m.area };
      stepMover(m, ex, dt, { time, landItems: [], toy: null, movers, onEvent: (animal, kind) => {
        events.push(kind);
        if (kind === "enterWater") entered.add(animal.id);
        if (kind === "leaveWater" && entered.has(animal.id)) returned.add(animal.id);
      }, ...ctxExtra });
      check(m, h, prev, dt);
      if (m.area === "land" && (m.mode === "walk" || m.mode === "rest")) {
        for (const item of ctxExtra.landItems ?? []) expect(Math.hypot(m.x - item.x, m.z - item.z), `${h} inside placed item`).toBeGreaterThan(item.r);
      }
      modes.add(m.mode);
      if (m.area === "ledge" && m.mode === "rest") ledges.add(m.ledge!);
      if (m.area === "land" && m.mode === "rest" && ctxExtra.restSpots?.some((q) => Math.hypot(m.x - q.x, m.z - q.z) < 1e-6)) quietRests++;
    }
  }
  return { events, modes, movers, ledges, entered, returned, quietRests };
}

describe("semi-aquatic movement", { timeout: 60_000 }, () => {
  it("the penguin floe approach connects directly to the shore and the glass swimming lane", () => {
    const ex = EXHIBITS.penguins, r = ex.ramps[0], climb = ex.islands[0].climb;
    const shore = { x: r.bottom.x, z: r.bottom.z + 0.45 };
    for (const from of [shore, { x: -3.6, z: 5.7 }, { x: 0, z: 5.7 }, { x: 1, z: 5.7 }]) {
      expect(waterLegClear(ex, from, climb, 0.35)).toBe(true);
      expect(waterLegClear(ex, climb, from, 0.35)).toBe(true);
    }
  });
  for (const h of COAST_HABITATS) {
    for (const seed of [1, 2, 3]) {
      it(`${h} (seed ${seed}) never leaves land, ramps, islands or water, and changes between them by moving`, () => {
        const { events, modes } = simulate(h, seed, 240);
        expect(events).toContain("enterWater");
        expect(events).toContain("leaveWater");
        expect(modes.has("rampDown") || modes.has("hop")).toBe(true);
      });
    }
  }

  it("penguins walk on land, use the ramp, dive and come up to breathe", () => {
    const { events, modes } = simulate("penguins", 4, 300);
    for (const m of ["walk", "rampDown", "rampUp", "swim", "breathe", "rest"]) expect(modes.has(m), m).toBe(true);
    expect(events).toContain("breathe");
  });

  it("penguins use both low resting ledges and the broad floe through their authored approaches", () => {
    const { modes, ledges, entered, returned } = simulate("penguins", 12, 600);
    expect([...ledges].sort()).toEqual([0, 1]);
    for (const mode of ["stepUp", "stepDown", "climb", "hop"]) expect(modes.has(mode), mode).toBe(true);
    expect(entered.size).toBe(3);
    expect(returned.size).toBe(3);
  });

  it("all saved penguin item slots remain clear, flat and reachable with every slot occupied", () => {
    const ex = EXHIBITS.penguins;
    expect(ex.slots.map((s) => s.on)).toEqual(["land", "land", "land", "land"]);
    const landItems = ex.slots.map((s) => ({ ...s, r: 0.6 }));
    for (const s of ex.slots) {
      expect(landLegClear(ex, s, s, [], 0.35)).toBe(true);
      expect(landLegClear(ex, { x: s.x, z: s.z + 0.9 }, { x: s.x, z: s.z + 0.9 }, landItems, 0.35)).toBe(true);
    }
    const restSpots = ex.slots.map((s) => ({ x: s.x, z: s.z + 0.9 }));
    // 660 s: with every slot occupied, one bird of this seed only reaches the water at ~574 s (quiet rests first).
    const { entered, returned, quietRests } = simulate("penguins", 13, 660, { landItems, restSpots });
    expect(entered.size).toBe(3);
    expect(returned.size).toBe(3);
    expect(quietRests).toBeGreaterThan(0);
  });

  it("solid ice and submerged boulders reject crossing swim legs at any depth", () => {
    const ex = EXHIBITS.penguins;
    for (const o of ex.swimObstacles!) {
      expect(waterLegClear(ex, { x: o.x - o.r - 0.4, z: o.z }, { x: o.x + o.r + 0.4, z: o.z }, 0.35)).toBe(false);
    }
  });

  it("the enlarged pool provides a broad deep volume with open multi-depth corridors", () => {
    const ex = EXHIBITS.penguins, p = ex.pool;
    expect(p.maxX - p.minX).toBeGreaterThanOrEqual(19);
    expect(p.maxZ - p.minZ).toBeGreaterThanOrEqual(11);
    expect(p.surface - p.floor).toBeGreaterThanOrEqual(5);
    expect(ex.land.maxX - ex.land.minX).toBeGreaterThan(18);
    expect(ex.land.maxZ - ex.land.minZ).toBeGreaterThan(5);
    for (const z of [4.5, 5.7, 7]) {
      expect(waterLegClear(ex, { x: -6, z }, { x: 4, z }, 0.35)).toBe(true);
    }
    for (let i = 0; i < ex.ramps.length; i++) {
      const r = rampRect(ex, i), z = (r.minZ + r.maxZ) / 2;
      expect(waterLegClear(ex, { x: r.minX - 0.5, z }, { x: r.maxX + 0.5, z }, 0.35)).toBe(false);
    }
  });

  it("swimming clearance follows the flared irregular rock ramp rather than its rectangular deck", () => {
    const ex = EXHIBITS.penguins, sections = rampSections(ex, 0);
    for (const section of sections.slice(1, -1)) {
      for (const [base, deck] of [[section.baseLeft, section.left], [section.baseRight, section.right]]) {
        const onSide = { x: (base + deck) / 2, z: section.z };
        expect(waterLegClear(ex, onSide, onSide, 0)).toBe(false);
      }
    }
    const toe = sections[sections.length - 1];
    const outside = { x: toe.baseLeft - 0.05, z: toe.z - 0.01 };
    expect(waterLegClear(ex, outside, outside, 0)).toBe(true);
    expect(waterLegClear(ex, { x: sections[1].baseLeft - 1, z: sections[1].z }, { x: sections[1].baseRight + 1, z: sections[1].z }, 0)).toBe(false);
  });

  it("swimming heading and pitch follow the actual velocity in every horizontal direction, while diving and ascending", () => {
    const ex = EXHIBITS.penguins, dt = 1 / 60;
    for (let direction = 0; direction < 8; direction++) for (const pitch of [-0.6, 0, 0.6]) {
      const heading = direction * Math.PI / 4;
      const m = newMover(`orientation-${direction}-${pitch}`, "penguin", ex, 250);
      Object.assign(m, { x: 0, y: -0.6, z: 5.7, mode: "swim", area: "water", heading, pitch: 0, speed: 1, boutEnd: 100, nextBreath: 100 });
      m.path = [{ x: Math.sin(heading) * Math.cos(pitch) * 2, y: m.y + Math.sin(pitch) * 2, z: m.z + Math.cos(heading) * Math.cos(pitch) * 2 }];
      for (let frame = 1; frame <= 40; frame++) {
        const { x, y, z } = m;
        stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers: [m] });
        const dx = m.x - x, dy = m.y - y, dz = m.z - z, flat = Math.hypot(dx, dz);
        expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(0);
        expect(Math.abs(angleDiff(m.heading, Math.atan2(dx, dz)))).toBeLessThan(1e-7);
        expect(m.pitch).toBeCloseTo(Math.atan2(dy, flat), 7);
        expect(Math.sign(m.pitch)).toBe(Math.sign(pitch));
      }
    }
  });

  it("turning swimmers rotate their trajectory smoothly and keep their beak aligned with it", () => {
    const ex = EXHIBITS.penguins, dt = 1 / 60;
    const m = newMover("turning", "penguin", ex, 300);
    Object.assign(m, { x: 0, y: -0.6, z: 5.7, mode: "swim", area: "water", heading: 0, pitch: 0, speed: 1, boutEnd: 100, nextBreath: 100 });
    m.path = [{ x: -3, y: -1.8, z: 5.7 }];
    for (let frame = 1; frame <= 60; frame++) {
      const { x, y, z, heading, pitch } = m;
      stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers: [m] });
      const dx = m.x - x, dy = m.y - y, dz = m.z - z;
      expect(Math.abs(angleDiff(heading, m.heading))).toBeLessThanOrEqual(4 * dt);
      expect(Math.abs(m.pitch - pitch)).toBeLessThanOrEqual(4 * dt);
      expect(Math.abs(angleDiff(m.heading, Math.atan2(dx, dz)))).toBeLessThan(1e-7);
      expect(m.pitch).toBeCloseTo(Math.atan2(dy, Math.hypot(dx, dz)), 7);
    }
  });

  it("vertical dives and ascents pitch the head down and up without inventing a horizontal heading", () => {
    const ex = EXHIBITS.penguins, dt = 1 / 60;
    for (const direction of [-1, 1]) {
      const m = newMover(`vertical-${direction}`, "penguin", ex, 301);
      const pitch = direction * Math.PI / 2;
      Object.assign(m, { x: 0, y: -0.6, z: 5.7, mode: "swim", area: "water", heading: 1.1, pitch, speed: 1, boutEnd: 100, nextBreath: 100 });
      m.path = [{ x: m.x, y: m.y + direction * 2, z: m.z }];
      for (let frame = 1; frame <= 30; frame++) {
        const { x, y, z } = m;
        stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers: [m] });
        expect(direction * (m.y - y)).toBeGreaterThan(0);
        expect(m.x).toBeCloseTo(x, 7); expect(m.z).toBeCloseTo(z, 7);
        expect(m.pitch).toBeCloseTo(pitch, 7);
        expect(m.heading).toBeCloseTo(1.1, 7);
      }
    }
  });

  it("six penguins keep body clearance on land and at depth throughout a long deterministic run", () => {
    const ex = EXHIBITS.penguins, dt = 1 / 30, movers: Mover[] = [];
    for (let i = 0; i < 6; i++) movers.push(newMover(`colony-${i}`, "penguin", ex, 100 + i, 0, [], movers));
    const visitedWater = new Set<string>(), visitedLand = new Set<string>(), returnedToLand = new Set<string>();
    let minGround = Infinity, minWater = Infinity, deepest = Infinity, shallowest = -Infinity;
    let maxStep = 0, overCap = -Infinity, fastest = 0, fastestWalk = 0, finite = true, forbiddenSwimSamples = 0, waterPairs = 0, groundPairs = 0;
    const windows = Array.from({ length: 5 }, () => ({ land: 0, ramp: 0, water: 0, perBird: new Map<string, number>(), depths: new Set<number>() }));
    for (let frame = 1; frame <= 900 / dt; frame++) {
      const window = windows[Math.min(4, Math.floor((frame - 1) * dt / 180))];
      for (const m of movers) {
        const { x, y, z, mode } = m;
        stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers, onEvent: (animal, kind) => {
          if (kind === "leaveWater" && visitedWater.has(animal.id)) returnedToLand.add(animal.id);
        } });
        finite &&= Number.isFinite(m.x + m.y + m.z + m.heading + m.pitch + m.speed);
        const distance = Math.hypot(m.x - x, m.y - y, m.z - z);
        maxStep = Math.max(maxStep, distance);
        const cap = Math.max(speedCap(m), speedCap({ species: m.species, mode }));
        overCap = Math.max(overCap, distance - cap * dt);
        if (mode === "swim" && m.mode === "swim") fastest = Math.max(fastest, distance / dt);
        if (mode === "walk" && m.mode === "walk") fastestWalk = Math.max(fastestWalk, distance / dt);
        window.perBird.set(m.id, (window.perBird.get(m.id) ?? 0) + distance);
        if (mode === "walk") window.land += distance;
        if (mode === "rampDown" || mode === "rampUp") window.ramp += distance;
        if (mode === "swim" || mode === "breathe") window.water += distance;
        if (m.area === "land") visitedLand.add(m.id);
        if (m.mode !== "swim" && m.mode !== "breathe") continue;
        visitedWater.add(m.id);
        deepest = Math.min(deepest, m.y); shallowest = Math.max(shallowest, m.y);
        if (distance > 0.001 && Math.abs(m.x) < 6 && m.z >= 3 && m.z <= 8) {
          window.depths.add(Math.min(2, Math.floor((m.y - ex.pool.floor) / ((ex.pool.surface - ex.pool.floor) / 3))));
        }
        const p = ex.pool;
        if (m.x <= p.minX || m.x >= p.maxX || m.z <= p.minZ || m.z >= p.maxZ || m.y < p.floor + 0.2 || m.y > p.surface) forbiddenSwimSamples++;
        for (const o of [...ex.islands, ...ex.swimObstacles!]) if (Math.hypot(m.x - o.x, m.z - o.z) <= o.r + 0.1) forbiddenSwimSamples++;
        if (!waterLegClear(ex, m, m, 0)) forbiddenSwimSamples++;
      }
      for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i], b = movers[j];
        const aSwims = a.mode === "swim" || a.mode === "breathe", bSwims = b.mode === "swim" || b.mode === "breathe";
        if (aSwims && bSwims) {
          minWater = Math.min(minWater, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); waterPairs++;
        } else if (!aSwims && !bSwims && a.area === b.area) {
          minGround = Math.min(minGround, Math.hypot(a.x - b.x, a.z - b.z)); groundPairs++;
        }
      }
    }
    const trace = motionTrace(movers);
    expect(finite, trace).toBe(true);
    expect(overCap, trace).toBeLessThanOrEqual(1e-6);
    expect(maxStep, trace).toBeLessThanOrEqual(MAX_SWIM_SPEED * dt + 1e-6);
    // Bursts really happen in the colony, and walking is not sped up.
    expect(fastest, trace).toBeGreaterThan(2.6);
    expect(fastestWalk, trace).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
    expect(forbiddenSwimSamples, trace).toBe(0);
    expect(groundPairs).toBeGreaterThan(1000);
    expect(waterPairs).toBeGreaterThan(1000);
    expect(minGround, trace).toBeGreaterThanOrEqual(PENGUIN_LAND_SEPARATION - 1e-6);
    expect(minWater, trace).toBeGreaterThanOrEqual(PENGUIN_SWIM_SEPARATION - 1e-6);
    expect(visitedLand.size).toBe(6);
    expect(visitedWater.size, trace).toBe(6);
    expect(returnedToLand.size, trace).toBe(6);
    expect(deepest).toBeLessThan(ex.pool.floor + 1);
    expect(shallowest).toBeGreaterThan(ex.pool.surface - 0.2);
    expect(shallowest - deepest).toBeGreaterThan(3.5);
    for (const [i, window] of windows.entries()) {
      const progress = `180s window ${i}: ${motionTrace(movers)}`;
      expect(window.land, progress).toBeGreaterThan(10);
      expect(window.ramp, progress).toBeGreaterThan(3);
      expect(window.water, progress).toBeGreaterThan(30);
      for (const bird of movers) expect(window.perBird.get(bird.id), `${progress} ${bird.id}`).toBeGreaterThan(3);
      expect([...window.depths].sort(), `${progress} underwater camera depths`).toEqual([0, 1, 2]);
    }
  });

  it("opposing ramp traffic passes in directional lanes and clears both landings", () => {
    const ex = EXHIBITS.penguins, r = ex.ramps[0], dt = 1 / 30;
    const movers = [newMover("ramp-down", "penguin", ex, 420), newMover("ramp-up", "penguin", ex, 421)];
    Object.assign(movers[0], { x: r.top.x - 1.05, y: ex.land.y, z: r.top.z, mode: "rampDown", area: "land", speed: 0, heading: 0,
      path: [{ x: r.top.x - 1.05, y: ex.pool.surface - 0.06, z: r.bottom.z }, { x: r.top.x - 1.05, y: ex.pool.surface - 0.06, z: r.bottom.z + 0.45 }] });
    Object.assign(movers[1], { x: r.top.x + 1.05, y: ex.pool.surface - 0.06, z: r.bottom.z + 0.45, mode: "rampUp", area: "water", speed: 0, heading: Math.PI,
      path: [{ x: r.top.x + 1.05, y: ex.pool.surface - 0.06, z: r.bottom.z }, { x: r.top.x + 1.05, y: ex.land.y, z: r.top.z }] });
    const completed = new Set<string>();
    let minSeparation = Infinity, maxStep = 0, maxReverse = 0;
    for (let frame = 1; frame <= 40 / dt; frame++) {
      for (const m of movers) {
        const { x, y, z, mode } = m;
        stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers, onEvent: (animal, kind) => {
          if (kind === "enterWater" || kind === "leaveWater") completed.add(animal.id);
        } });
        maxStep = Math.max(maxStep, Math.hypot(m.x - x, m.y - y, m.z - z) / Math.max(speedCap(m), speedCap({ species: m.species, mode })) * MAX_SPEED);
        if (mode === "rampDown") maxReverse = Math.max(maxReverse, z - m.z);
        if (mode === "rampUp") maxReverse = Math.max(maxReverse, m.z - z);
      }
      minSeparation = Math.min(minSeparation, Math.hypot(movers[0].x - movers[1].x, movers[0].y - movers[1].y, movers[0].z - movers[1].z));
    }
    expect(completed.size, motionTrace(movers)).toBe(2);
    expect(minSeparation).toBeGreaterThanOrEqual(PENGUIN_LAND_SEPARATION);
    expect(maxStep).toBeLessThanOrEqual(MAX_SPEED * dt + 1e-6);
    expect(maxReverse).toBeLessThan(1e-6);
  });

  for (const water of [false, true]) {
    it(`head-on ${water ? "swimmers" : "walkers"} yield or steer past each other without overlap or deadlock`, () => {
      const ex = EXHIBITS.penguins, dt = 1 / 30;
      const movers = [newMover("head-on-a", "penguin", ex, 400), newMover("head-on-b", "penguin", ex, 401)];
      movers.forEach((m, i) => {
        const side = i === 0 ? -1 : 1;
        Object.assign(m, { x: side * 2, y: water ? -0.8 : ex.land.y, z: water ? 5.7 : -3.1, heading: -side * Math.PI / 2, pitch: 0, mode: water ? "swim" : "walk", area: water ? "water" : "land", speed: water ? 1.5 : 0.42, boutEnd: 1000, nextBreath: 1000, rampNext: -1 });
        m.path = [{ x: -side * 2, y: m.y, z: m.z }];
      });
      const passed = [false, false];
      let minimum = Infinity, maxStep = 0;
      for (let frame = 1; frame <= 45 / dt; frame++) {
        for (const m of movers) {
          const { x, y, z, mode } = m;
          stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers });
          maxStep = Math.max(maxStep, Math.hypot(m.x - x, m.y - y, m.z - z) / Math.max(speedCap(m), speedCap({ species: m.species, mode })) * MAX_SPEED);
        }
        const [a, b] = movers;
        if (a.area === (water ? "water" : "land") && b.area === a.area) minimum = Math.min(minimum, Math.hypot(a.x - b.x, water ? a.y - b.y : 0, a.z - b.z));
        if (a.x > 0.8) passed[0] = true;
        if (b.x < -0.8) passed[1] = true;
      }
      expect(minimum).toBeGreaterThanOrEqual((water ? PENGUIN_SWIM_SEPARATION : PENGUIN_LAND_SEPARATION) - 1e-6);
      expect(maxStep).toBeLessThanOrEqual(MAX_SPEED * dt + 1e-6);
      expect(passed, motionTrace(movers)).toEqual([true, true]);
    });
  }

  it("swimming penguins zip across the window both ways, banking through turns, without bursts on land", () => {
    const ex = EXHIBITS.penguins, dt = 1 / 30;
    const movers = [0, 1, 2].map((i) => newMover(`burst-${i}`, "penguin", ex, 700 + i));
    movers.forEach((m, i) => {
      Object.assign(m, { x: -4 + i * 4, y: -1 + i * 0.5, z: 3.4 + i * 0.6, heading: Math.PI / 2, mode: "swim", area: "water", boutEnd: 1e9, nextBreath: 1e9 });
      m.path = [];
    });
    let right = 0, left = 0, fastest = 0, misaligned = 0, fastSamples = 0, nearGlass = 0;
    const depths = new Set<number>();
    for (let frame = 1; frame <= 240 / dt; frame++) {
      for (const m of movers) {
        const prev = { x: m.x, y: m.y, z: m.z, mode: m.mode, area: m.area };
        m.nextBreath = 1e9; m.boutEnd = 1e9;
        stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers });
        check(m, "penguins", prev, dt);
        const vx = (m.x - prev.x) / dt, vz = (m.z - prev.z) / dt, v = Math.hypot(vx, (m.y - prev.y) / dt, vz);
        fastest = Math.max(fastest, v);
        if (v > 2.5) {
          fastSamples++;
          if (vx > 2.3) right++;
          if (vx < -2.3) left++;
          if (m.z > 7) nearGlass++;
          depths.add(Math.floor((m.y - ex.pool.floor) / 1.7));
          if (Math.abs(angleDiff(m.heading, Math.atan2(vx, vz))) > 0.2) misaligned++;
        }
      }
    }
    expect(fastest).toBeGreaterThan(PARAMS.penguin.swim * PENGUIN_DASH.factor[0] * 0.95);
    expect(fastest).toBeLessThanOrEqual(MAX_SWIM_SPEED + 1e-6);
    // Many fast passes, in both directions, at several depths, some near the glass.
    expect(right).toBeGreaterThan(150);
    expect(left).toBeGreaterThan(150);
    expect(nearGlass).toBeGreaterThan(60);
    expect(depths.size).toBeGreaterThanOrEqual(2);
    // The beak leads: the body points where it travels, even through the banked turns.
    expect(misaligned / fastSamples).toBeLessThan(0.02);
    // Seals and otters keep their own, unchanged pace.
    expect(PARAMS.seal.swim).toBe(1.25);
    expect(PARAMS.otter.swim).toBe(0.85);
    expect(PARAMS.penguin.walk).toBe(0.42);
  });

  it("penguins may cross the same ground position at safely different swimming depths", () => {
    const ex = EXHIBITS.penguins, dt = 1 / 30;
    const movers = [newMover("deep-pass", "penguin", ex, 402), newMover("shallow-pass", "penguin", ex, 403)];
    movers.forEach((m, i) => {
      const side = i === 0 ? -1 : 1;
      Object.assign(m, { x: side * 2, y: i === 0 ? -2 : 0.6, z: 5.7, heading: -side * Math.PI / 2, pitch: 0, mode: "swim", area: "water", speed: 1.5, boutEnd: 1000, nextBreath: 1000 });
      m.path = [{ x: -side * 2, y: m.y, z: m.z }];
    });
    const crossed = [false, false];
    for (let frame = 1; frame <= 2 / dt; frame++) {
      for (const m of movers) stepMover(m, ex, dt, { time: frame * dt, landItems: [], toy: null, movers });
      if (movers[0].x > 0) crossed[0] = true;
      if (movers[1].x < 0) crossed[1] = true;
      expect(Math.hypot(movers[0].x - movers[1].x, movers[0].y - movers[1].y, movers[0].z - movers[1].z)).toBeGreaterThanOrEqual(PENGUIN_SWIM_SEPARATION);
    }
    expect(crossed).toEqual([true, true]);
  });

  it("every feeding slot has six distinct standing places reachable from the ramp", () => {
    const ex = EXHIBITS.penguins;
    for (let slot = 0; slot < ex.slots.length; slot++) {
      const items = ex.slots.map((s, i) => ({ ...s, r: i === slot ? 0.45 : 0.6 }));
      const spots = stationSpots(ex, ex.slots[slot], 6, items);
      expect(spots).toHaveLength(6);
      for (const spot of spots) {
        expect(stationLandRoute(ex, ex.ramps[0].top, spot, items)).not.toBeNull();
        for (const other of spots) if (spot !== other) expect(Math.hypot(spot.x - other.x, spot.z - other.z)).toBeGreaterThanOrEqual(PENGUIN_LAND_SEPARATION);
      }
    }
  });

  for (const slot of [0, 1, 2, 3]) {
    it(`penguins reach station slot ${slot} from land, water, a floe and a ledge, eat apart and resume`, () => {
      const ex = EXHIBITS.penguins, station = ex.slots[slot], dt = 0.1;
      const landItems = ex.slots.map((s, i) => ({ x: s.x, z: s.z, r: i === slot ? 0.45 : 0.6 }));
      const spots = stationSpots(ex, station, 4, landItems);
      expect(spots).toHaveLength(4);
      for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.62);
      const movers: Mover[] = [];
      spots.forEach((_, i) => movers.push(newMover(`meal-${i}`, "penguin", ex, 40 + i, 0, landItems, movers)));
      Object.assign(movers[1], { x: 0, y: (ex.pool.floor + ex.pool.surface) / 2, z: 5.7, mode: "swim", area: "water", path: [], nextBreath: 100 });
      Object.assign(movers[2], { ...ex.islands[0].rest, y: ex.islands[0].top, mode: "rest", area: "island", island: 0 });
      Object.assign(movers[3], { ...ex.ledges![0].rest, y: ex.ledges![0].top, mode: "rest", area: "ledge", ledge: 0, ledgeRest: ex.ledges![0].rest });
      movers.forEach((m, i) => { m.feeding = { spot: spots[i], station, stage: "approach", routed: false, bites: 0, nextBite: 0, until: 0 }; });
      const ate = new Set<string>(), exited = new Set<string>();
      let bites = 0;
      for (let time = dt; time < 240; time += dt) {
        for (const m of movers) {
          const prev = { x: m.x, y: m.y, z: m.z, mode: m.mode, area: m.area };
          stepMover(m, ex, dt, { time, landItems, toy: null, movers, onEvent: (animal, kind) => {
            if (kind === "leaveWater") exited.add(animal.id);
            if (kind === "eatFish") { bites++; ate.add(animal.id); }
          } });
          check(m, "penguins", prev, dt);
          if (m.area === "land" && (m.mode === "walk" || m.mode === "rest")) for (const item of landItems) expect(Math.hypot(m.x - item.x, m.z - item.z)).toBeGreaterThan(item.r);
          if (m.feeding?.stage === "eating") {
            expect(m.area).toBe("land"); expect(m.y).toBe(ex.land.y); expect(m.action).toBe("eat");
            expect(Math.hypot(m.x - m.feeding.spot.x, m.z - m.feeding.spot.z)).toBeLessThan(1e-6);
          }
        }
      }
      expect(bites, motionTrace(movers)).toBe(12);
      expect(ate.size, motionTrace(movers)).toBe(4);
      expect(exited).toContain(movers[1].id);
      expect(exited).toContain(movers[2].id);
      expect(movers.every((m) => !m.feeding), motionTrace(movers)).toBe(true);
    });
  }

  it("seals haul out onto their rock as well as the shore", () => {
    const { modes } = simulate("seals", 5, 600);
    expect(modes.has("climb")).toBe(true);
    expect(modes.has("rampUp")).toBe(true);
  });

  it("otters float on their backs, dive and play with a floating toy", () => {
    const toy = { x: EXHIBITS.otters.slots[0].x, z: EXHIBITS.otters.slots[0].z };
    const { events, modes } = simulate("otters", 6, 300, { toy });
    expect(modes.has("float")).toBe(true);
    expect(events).toContain("dive");
    expect(events).toContain("play");
  });

  it("different animals are not all doing the same thing at once", () => {
    const { movers } = simulate("penguins", 7, 90);
    const areas = new Set(movers.map((m) => `${m.mode}`));
    // Over a long run at least once two of the three differ; check the end state and a fresh seed too.
    const other = simulate("penguins", 8, 60).movers.map((m) => m.mode);
    expect(areas.size + new Set(other).size).toBeGreaterThan(2);
  });
});
