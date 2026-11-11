import { describe, expect, it } from "vitest";
import { COAST_HABITATS, EXHIBITS, ISLAND_CLEAR, type CoastHabitat } from "../data/coast";
import { landLegClear, MAX_SPEED, newMover, rampRect, SPECIES_OF, stationSpots, stepMover, waterLegClear, type Mover, type MoveCtx } from "./motion";

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

function check(m: Mover, h: CoastHabitat, prev: Pick<Mover, "x" | "y" | "z" | "mode" | "area">, dt: number) {
  const ex = EXHIBITS[h];
  const where = `${h} ${m.id} ${m.mode} ${m.area} (${m.x.toFixed(2)}, ${m.y.toFixed(2)}, ${m.z.toFixed(2)})`;
  expect(Number.isFinite(m.x + m.y + m.z + m.heading), where).toBe(true);
  // No teleporting: never further than the fastest leg allows.
  expect(Math.hypot(m.x - prev.x, m.y - prev.y, m.z - prev.z), where).toBeLessThanOrEqual(MAX_SPEED * dt + 1e-6);
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
    for (let i = 0; i < ex.ramps.length; i++) {
      const r = rampRect(ex, i);
      expect(m.x > r.minX && m.x < r.maxX && m.z > r.minZ && m.z < r.maxZ, `${where} inside ramp base`).toBe(false);
    }
  }
  if (m.mode === "rampDown" || m.mode === "rampUp") {
    // On the ramp's slope: between the land top and the waterline, never under the water's surface by more than a body.
    expect(m.y, where).toBeLessThanOrEqual(ex.land.y + 1e-6);
    expect(m.y, where).toBeGreaterThanOrEqual(ex.pool.surface - 0.07);
    expect(ex.ramps.some((r) => Math.abs(m.x - r.top.x) < 0.8), where).toBe(true);
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
  const movers = [0, 1, 2].map((k) => newMover(`${h}${k}`, SPECIES_OF[h], ex, seed * 10 + k, 0, ctxExtra.landItems));
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
      stepMover(m, ex, dt, { time, landItems: [], toy: null, onEvent: (animal, kind) => {
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
    for (const from of [shore, { x: -3.6, z: 2.7 }, { x: 0, z: 2.7 }, { x: 1, z: 2.7 }]) {
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
    const { entered, returned, quietRests } = simulate("penguins", 13, 600, { landItems, restSpots });
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

  for (const slot of [0, 1, 2, 3]) {
    it(`penguins reach station slot ${slot} from land, water, a floe and a ledge, eat apart and resume`, () => {
      const ex = EXHIBITS.penguins, station = ex.slots[slot], dt = 0.1;
      const landItems = ex.slots.map((s, i) => ({ x: s.x, z: s.z, r: i === slot ? 0.45 : 0.6 }));
      const spots = stationSpots(ex, station, 4, landItems);
      expect(spots).toHaveLength(4);
      for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.62);
      const movers = spots.map((_, i) => newMover(`meal-${i}`, "penguin", ex, 40 + i, 0, landItems));
      Object.assign(movers[1], { x: 0, y: 1.05, z: 2.7, mode: "swim", area: "water", path: [], nextBreath: 100 });
      Object.assign(movers[2], { ...ex.islands[0].rest, y: ex.islands[0].top, mode: "rest", area: "island", island: 0 });
      Object.assign(movers[3], { ...ex.ledges![0].rest, y: ex.ledges![0].top, mode: "rest", area: "ledge", ledge: 0, ledgeRest: ex.ledges![0].rest });
      movers.forEach((m, i) => { m.feeding = { spot: spots[i], station, stage: "approach", routed: false, bites: 0, nextBite: 0, until: 0 }; });
      const ate = new Set<string>(), exited = new Set<string>();
      let bites = 0;
      for (let time = dt; time < 110; time += dt) {
        for (const m of movers) {
          const prev = { x: m.x, y: m.y, z: m.z, mode: m.mode, area: m.area };
          stepMover(m, ex, dt, { time, landItems, toy: null, onEvent: (animal, kind) => {
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
      expect(bites).toBe(12);
      expect(ate.size).toBe(4);
      expect(exited).toContain(movers[1].id);
      expect(exited).toContain(movers[2].id);
      expect(movers.every((m) => !m.feeding)).toBe(true);
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
