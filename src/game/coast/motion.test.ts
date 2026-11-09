import { describe, expect, it } from "vitest";
import { COAST_HABITATS, EXHIBITS, ISLAND_CLEAR, type CoastHabitat } from "../data/coast";
import { MAX_SPEED, newMover, rampRect, SPECIES_OF, stepMover, type Mover, type MoveCtx } from "./motion";

/** The island's rock: a frustum from its waterline radius up to a flat top (the scene draws the same shape). */
export const ISLAND_TOP_R = 0.55;
function islandSurface(ex: (typeof EXHIBITS)[CoastHabitat], i: number, x: number, z: number): number {
  const isl = ex.islands[i];
  const d = Math.hypot(x - isl.x, z - isl.z);
  const rt = isl.r * ISLAND_TOP_R;
  if (d <= rt) return isl.top;
  if (d >= isl.r) return -Infinity;
  return isl.top + (ex.pool.surface - isl.top) * ((d - rt) / (isl.r - rt));
}

function check(m: Mover, h: CoastHabitat, prev: { x: number; y: number; z: number }, dt: number) {
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
    } else {
      expect(m.area, where).toBe("island");
      const isl = ex.islands[m.island];
      expect(m.y, where).toBeCloseTo(isl.top, 6);
      expect(Math.hypot(m.x - isl.x, m.z - isl.z), where).toBeLessThan(isl.r * ISLAND_TOP_R);
    }
  }
  if (m.mode === "swim" || m.mode === "breathe" || m.mode === "float") {
    expect(m.area, where).toBe("water");
    const p = ex.pool;
    expect(m.x > p.minX && m.x < p.maxX && m.z > p.minZ && m.z < p.maxZ, where).toBe(true);
    expect(m.y, where).toBeGreaterThanOrEqual(p.floor + 0.2);
    expect(m.y, where).toBeLessThanOrEqual(p.surface);
    for (const isl of ex.islands) expect(Math.hypot(m.x - isl.x, m.z - isl.z), where).toBeGreaterThan(isl.r + ISLAND_CLEAR * 0.5);
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
  }
}

function simulate(h: CoastHabitat, seed: number, seconds: number, ctxExtra: Partial<MoveCtx> = {}) {
  const ex = EXHIBITS[h];
  const movers = [0, 1, 2].map((k) => newMover(`${h}${k}`, SPECIES_OF[h], ex, seed * 10 + k));
  const events: string[] = [];
  const modes = new Set<string>();
  const dt = 1 / 30;
  let time = 0;
  for (const m of movers) check(m, h, m, dt);
  for (let i = 0; i < seconds / dt; i++) {
    time += dt;
    for (const m of movers) {
      const prev = { x: m.x, y: m.y, z: m.z };
      stepMover(m, ex, dt, { time, landItems: [], toy: null, onEvent: (_, kind) => events.push(kind), ...ctxExtra });
      check(m, h, prev, dt);
      modes.add(m.mode);
    }
  }
  return { events, modes, movers };
}

describe("semi-aquatic movement", { timeout: 60_000 }, () => {
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
