import { COAST_HABITATS, EXHIBITS, type CoastHabitat } from "../data/coast";
import { tankAt, type Model } from "../logic/model";
import { HABITAT_PAD, recordCoastSight } from "../logic/coast";
import { newMover, SPECIES_OF, stepMover, type Mover, type MoveCtx } from "./motion";

/**
 * Live animals of the coastal habitats (runtime only, never saved). One mover
 * per animal in each habitat tank; they are stepped only while the zone is on
 * screen (the habitats' care keeps running in the ordinary simulation). What
 * the player watches happen is passed to the milestone rules.
 */

export interface CoastAnimal {
  habitat: CoastHabitat;
  m: Mover;
}

export const coastRt = {
  animals: new Map<string, CoastAnimal>(),
  time: 0,
  /** rt-free feeding marks per habitat (sim seconds). */
  fedAt: { penguins: -100, seals: -100, otters: -100 } as Record<CoastHabitat, number>,
  /** Animals held still for a question (id -> until). */
  hold: new Map<string, number>(),
  /** Sights waiting to be committed to the model (the flow drains this). */
  sights: [] as ("penguinSwim" | "sealDive" | "otterFloat")[],
  /** Count of entries into the water, per habitat (activities and tests). */
  entries: { penguins: 0, seals: 0, otters: 0 } as Record<CoastHabitat, number>
};

let seed = 1;

/** Match the movers to the saved animals (new ones appear on land or floating; gone ones leave). */
export function syncCoast(model: Model) {
  const live = new Set<string>();
  for (const h of COAST_HABITATS) {
    const t = tankAt(model, HABITAT_PAD[h]);
    if (!t || t.type !== h) continue;
    for (const f of t.fish) {
      live.add(f.id);
      if (!coastRt.animals.has(f.id)) coastRt.animals.set(f.id, { habitat: h, m: newMover(f.id, SPECIES_OF[h], EXHIBITS[h], seed++ * 31 + f.id.length, coastRt.time) });
    }
  }
  for (const id of [...coastRt.animals.keys()]) if (!live.has(id)) coastRt.animals.delete(id);
}

/** Item footprints on the land shelf (obstacles and rest spots), and a floating toy, from the habitat's placed items. */
export function habitatCtx(model: Model, h: CoastHabitat): Pick<MoveCtx, "landItems" | "toy"> {
  const t = tankAt(model, HABITAT_PAD[h]);
  const ex = EXHIBITS[h];
  const landItems: MoveCtx["landItems"] = [];
  let toy: MoveCtx["toy"] = null;
  for (const d of t?.decor ?? []) {
    const s = ex.slots[d.slot];
    if (!s) continue;
    if (s.on === "land") landItems.push({ x: s.x, z: s.z, r: d.kind === "penguinFeeder" ? 0.45 : 0.6 });
    if (s.on === "water" && (d.kind === "otterToy" || d.kind === "sealBall")) toy = { x: s.x, z: s.z };
  }
  return { landItems, toy };
}

/** Advance every coastal animal (called each frame while the zone is shown). */
export function stepCoast(model: Model, dt: number, shown: boolean) {
  if (!shown) return;
  coastRt.time += dt;
  syncCoast(model);
  const ctxBy = new Map<CoastHabitat, Pick<MoveCtx, "landItems" | "toy">>();
  for (const a of coastRt.animals.values()) {
    const until = coastRt.hold.get(a.m.id);
    if (until !== undefined) {
      if (coastRt.time < until) { a.m.speed = 0; continue; }
      coastRt.hold.delete(a.m.id);
    }
    let ctx = ctxBy.get(a.habitat);
    if (!ctx) { ctx = habitatCtx(model, a.habitat); ctxBy.set(a.habitat, ctx); }
    stepMover(a.m, EXHIBITS[a.habitat], dt, {
      time: coastRt.time, ...ctx,
      onEvent: (m, kind) => {
        if (kind === "enterWater") coastRt.entries[a.habitat]++;
        if (a.habitat === "penguins" && kind === "enterWater") coastRt.sights.push("penguinSwim");
        if (a.habitat === "seals" && (kind === "dive" || kind === "enterWater")) coastRt.sights.push("sealDive");
        void m;
      }
    });
    if (a.habitat === "otters" && a.m.mode === "float" && a.m.y > EXHIBITS.otters.pool.surface - 0.1) coastRt.sights.push("otterFloat");
  }
}

/** Commit what was watched (once per kind; the rule ignores repeats). */
export function drainSights(m: Model): Model {
  if (!coastRt.sights.length) return m;
  const kinds = new Set(coastRt.sights);
  coastRt.sights = [];
  let out = m;
  for (const k of kinds) out = recordCoastSight(out, k);
  return out;
}

/** Feeding: everyone heads for the food (the feeding station on land if there is one, else the water by the window). */
export function feedCoast(model: Model, h: CoastHabitat) {
  coastRt.fedAt[h] = coastRt.time;
  const ex = EXHIBITS[h];
  const t = tankAt(model, HABITAT_PAD[h]);
  const feeder = t?.decor.find((d) => d.kind === "penguinFeeder");
  const fs = feeder ? ex.slots[feeder.slot] : null;
  let k = 0;
  for (const a of coastRt.animals.values()) {
    if (a.habitat !== h) continue;
    const spread = (k++ - 1.5) * 0.55;
    if (fs && a.m.area === "land") a.m.attract = { x: fs.x + spread, y: ex.land.y, z: fs.z + 0.7 };
    else if (a.m.area === "water") a.m.attract = { x: 0.8 * spread * 3, y: ex.pool.surface - 0.3, z: ex.pool.maxZ - 1.1 };
  }
}

export function holdAnimal(id: string, seconds: number) {
  coastRt.hold.set(id, coastRt.time + seconds);
}

export function clearCoast() {
  coastRt.animals.clear();
  coastRt.hold.clear();
  coastRt.sights = [];
  coastRt.time = 0;
  coastRt.entries = { penguins: 0, seals: 0, otters: 0 };
  seed = 1;
}
