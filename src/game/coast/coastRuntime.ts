import { COAST_HABITATS, EXHIBITS, PENGUIN_STAFF_DOOR, type CoastHabitat } from "../data/coast";
import { tankAt, type Model } from "../logic/model";
import { HABITAT_PAD, recordCoastSight } from "../logic/coast";
import { coastHabitatShown } from "../data/release";
import { landLegClear, newMover, PENGUIN_LAND_SEPARATION, RAMP_STEP, SPECIES_OF, stationSpots, stepMover, waterLegClear, type Mover, type MoveCtx } from "./motion";
import { cleanShotAt, CREW_RADIUS, finishKeepers, KEEPER_CLEARANCE, keeperBusy, keeperRt, resetKeepers, startArrival, stepArrival, stepKeepers, UPPER_CLEANERS } from "./keeper";

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
  /** A fresh tray is runtime presentation only; feeding care/cost is still applied once by the flow. */
  stationFood: null as { slot: number; fish: number; fedAt: number } | null,
  /** Animals held still for a question (id -> until). */
  hold: new Map<string, number>(),
  /** Sights waiting to be committed to the model (the flow drains this). */
  sights: [] as ("penguinSwim" | "sealDive" | "otterFloat")[],
  /** Count of entries into the water, per habitat (activities and tests). */
  entries: { penguins: 0, seals: 0, otters: 0 } as Record<CoastHabitat, number>,
  /** Bought penguins waiting to come out of the staff door (runtime only: a reload simply places them on land). */
  arrivals: [] as string[]
};

const door = PENGUIN_STAFF_DOOR;
/** Inside the dark corridor behind the leaf, then the threshold, then clear of the doorway on the shelf. */
export const ARRIVAL = { inside: door.z - 0.75, threshold: door.z + 0.2, out: door.z + 1.35 };
/** Queue a just-bought penguin (already in the saved model) to walk out through the staff door. */
export function queuePenguinArrival(id: string) { if (!coastRt.arrivals.includes(id)) coastRt.arrivals.push(id); }

let seed = 1;
const peerLists: Record<CoastHabitat, Mover[]> = { penguins: [], seals: [], otters: [] };
const liveIds = new Set<string>();
const staffBody = { x: 0, z: 0, active: false, r: KEEPER_CLEARANCE };
// Reused crew bodies for the Clean montage's upper team: no per-frame objects.
const crewSlots = UPPER_CLEANERS.map(() => ({ x: 0, z: 0, r: CREW_RADIUS }));
const crewLive: { x: number; z: number; r: number }[] = [];
function makeContext(h: CoastHabitat): MoveCtx { return {
  time: 0, landItems: [], toy: null, restSpots: [], movers: peerLists[h],
  ...(h === "penguins" ? { staff: staffBody, crew: crewLive } : {}),
  onEvent: (_m: Mover, kind: Parameters<NonNullable<MoveCtx["onEvent"]>>[1]) => {
    if (kind === "eatFish" && coastRt.stationFood) coastRt.stationFood.fish = Math.max(0, coastRt.stationFood.fish - 1);
    if (kind === "enterWater") coastRt.entries[h]++;
    if (h === "penguins" && kind === "enterWater") coastRt.sights.push("penguinSwim");
    if (h === "seals" && (kind === "dive" || kind === "enterWater")) coastRt.sights.push("sealDive");
  }
}; }
const contexts: Record<CoastHabitat, MoveCtx> = { penguins: makeContext("penguins"), seals: makeContext("seals"), otters: makeContext("otters") };
const decorRefs = new Map<CoastHabitat, unknown>();

function cachedCtx(model: Model, h: CoastHabitat) {
  const decor = tankAt(model, HABITAT_PAD[h])?.decor;
  if (!decorRefs.has(h) || decorRefs.get(h) !== decor) {
    Object.assign(contexts[h], habitatCtx(model, h));
    decorRefs.set(h, decor);
  }
  return contexts[h];
}

/** Match the movers to the saved animals (new ones appear on land or floating; gone ones leave). */
export function syncCoast(model: Model) {
  if (coastRt.stationFood && !tankAt(model, HABITAT_PAD.penguins)?.decor.some((d) => d.kind === "penguinFeeder" && d.slot === coastRt.stationFood!.slot)) {
    coastRt.stationFood = null;
    for (const a of coastRt.animals.values()) if (a.m.feeding) {
      a.m.feeding = undefined;
      if (a.m.action === "eat") a.m.action = null;
    }
  }
  const live = liveIds;
  live.clear();
  for (const h of COAST_HABITATS) {
    if (!coastHabitatShown(h)) continue;
    const t = tankAt(model, HABITAT_PAD[h]);
    if (!t || t.type !== h) continue;
    for (const f of t.fish) {
      live.add(f.id);
      if (!coastRt.animals.has(f.id)) {
        const m = newMover(f.id, SPECIES_OF[h], EXHIBITS[h], seed++ * 31 + f.id.length, coastRt.time, cachedCtx(model, h).landItems, h === "penguins" ? peerLists[h] : undefined);
        if (h === "penguins" && coastRt.arrivals.includes(f.id)) {
          // A bought penguin waits in the dark corridor until the door opens.
          Object.assign(m, { x: door.x, y: EXHIBITS.penguins.land.y, z: ARRIVAL.inside, mode: "arrive", area: "land", heading: 0, speed: 0, pitch: 0, action: null });
          m.path = [];
        } else if (h === "penguins" && !model.progress.coastIntroSeen) {
          // Initial positions only: the arrival camera watches real, continuously moving animals.
          const n = [...coastRt.animals.values()].filter((a) => a.habitat === h).length;
          const ex = EXHIBITS[h], r = ex.ramps[0], surface = ex.pool.surface - 0.06;
          if (n === 0 && r.width) {
            Object.assign(m, { x: r.top.x, z: (r.top.z + r.bottom.z) / 2, y: (ex.land.y + surface) / 2, mode: "rampDown", speed: 0.5, heading: 0 });
            m.path = [{ ...r.bottom, y: surface }, { x: r.bottom.x, z: r.bottom.z + RAMP_STEP, y: surface }];
            m.from = { x: m.x, y: m.y, z: m.z };
          } else if (n === 1 && ex.swimObstacles) {
            const from = { x: -3.6, z: 2.7, y: 1.05 }, to = { x: 1.85, z: 2.7, y: 1.05 };
            if (waterLegClear(ex, from, to, 0.35)) {
              Object.assign(m, from, { mode: "swim", area: "water", heading: Math.PI / 2, speed: 0.9, boutEnd: coastRt.time + 18, nextBreath: coastRt.time + 7 });
              m.path = [to];
            }
          }
        }
        coastRt.animals.set(f.id, { habitat: h, m });
        peerLists[h].push(m);
      }
    }
  }
  for (const [id, a] of coastRt.animals) if (!live.has(id)) {
    const peers = peerLists[a.habitat], at = peers.indexOf(a.m);
    if (at >= 0) peers.splice(at, 1);
    coastRt.animals.delete(id);
  }
}

/** Item footprints on the land shelf (obstacles and rest spots), and a floating toy, from the habitat's placed items. */
export function habitatCtx(model: Model, h: CoastHabitat): Pick<MoveCtx, "landItems" | "toy" | "restSpots"> {
  const t = tankAt(model, HABITAT_PAD[h]);
  const ex = EXHIBITS[h];
  const landItems: MoveCtx["landItems"] = [];
  if (h === "penguins") landItems.push({ x: PENGUIN_STAFF_DOOR.x, z: PENGUIN_STAFF_DOOR.z, r: 0.8 });
  const restSpots: NonNullable<MoveCtx["restSpots"]> = [];
  let toy: MoveCtx["toy"] = null;
  for (const d of t?.decor ?? []) {
    const s = ex.slots[d.slot];
    if (!s) continue;
    if (s.on === "land") landItems.push({ x: s.x, z: s.z, r: d.kind === "penguinFeeder" ? 0.45 : 0.6 });
    if (d.kind === "penguinNest") restSpots.push({ x: s.x, z: s.z + 0.9 });
    if (s.on === "water" && (d.kind === "otterToy" || d.kind === "sealBall")) toy = { x: s.x, z: s.z };
  }
  return { landItems, toy, restSpots };
}

/** Advance every coastal animal (called each frame while the zone is shown). */
export function stepCoast(model: Model, dt: number, shown: boolean) {
  if (!shown) {
    if (keeperBusy()) { finishKeepers(); clearCoastMeal(); }
    settleArrivals();
    staffBody.active = false;
    crewLive.length = 0;
    return;
  }
  coastRt.time += dt;
  syncCoast(model);
  stepKeepers(model, dt, peerLists.penguins);
  const f = keeperRt.feed;
  staffBody.x = f.x; staffBody.z = f.z;
  staffBody.active = f.phase !== "idle" && f.phase !== "doorClosing";
  // (Never at the same time as feeding: an arrival then reserves the doorway apron instead.)
  stepArrivals(dt);
  // The upper cleaners of the current photograph are solid to walking penguins.
  crewLive.length = 0;
  const shot = keeperRt.clean.phase === "montage" ? cleanShotAt(keeperRt.clean.elapsed) : null;
  if (shot) for (const i of UPPER_CLEANERS) { const w = shot.workers[i], c = crewSlots[i]; c.x = w.x; c.z = w.z; crewLive.push(c); }
  if (f.phase === "tip" && !f.pileStarted) {
    clearCoastMeal();
    f.pileStarted = true;
    if (f.slot >= 0 && tankAt(model, HABITAT_PAD.penguins)?.decor.some((d) => d.kind === "penguinFeeder" && d.slot === f.slot)) {
      coastRt.stationFood = { slot: f.slot, fish: 0, fedAt: coastRt.time };
    }
  }
  if (f.phase === "tip" && coastRt.stationFood) coastRt.stationFood.fish = Math.floor(f.tip * peerLists.penguins.length * 3);
  if (f.phase === "watch" && !f.mealStarted) {
    f.mealStarted = true;
    feedCoast(model, "penguins");
  }
  for (const a of coastRt.animals.values()) {
    const until = coastRt.hold.get(a.m.id);
    if (until !== undefined) {
      if (coastRt.time < until) { a.m.speed = 0; continue; }
      coastRt.hold.delete(a.m.id);
    }
    const ctx = cachedCtx(model, a.habitat);
    ctx.time = coastRt.time;
    stepMover(a.m, EXHIBITS[a.habitat], dt, ctx);
    if (a.habitat === "otters" && a.m.mode === "float" && a.m.y > EXHIBITS.otters.pool.surface - 0.1) coastRt.sights.push("otterFloat");
  }
}

/** One bought penguin at a time comes out once the door is free (never during feeding or cleaning). */
function stepArrivals(dt: number) {
  const a = keeperRt.arrival;
  if (a.phase === "idle" && coastRt.arrivals.length && !keeperBusy()) {
    const id = coastRt.arrivals[0], bird = coastRt.animals.get(id);
    if (!bird || bird.m.mode !== "arrive") coastRt.arrivals.shift();
    else if (startArrival(id)) coastRt.arrivals.shift();
  }
  if (a.phase === "idle") return;
  const bird = a.id ? coastRt.animals.get(a.id) : undefined;
  // The doorway apron is reserved like the keeper's body: others keep off it, and
  // a bird resting there gets up and goes elsewhere, so the newcomer is never stuck.
  if (a.phase !== "doorClosing") {
    staffBody.x = door.x; staffBody.z = door.z + 0.9; staffBody.active = true;
    for (const p of peerLists.penguins) {
      if (p === bird?.m || p.mode !== "rest" || p.area !== "land") continue;
      if (Math.hypot(p.x - staffBody.x, p.z - staffBody.z) < staffBody.r + 0.5) p.until = Math.min(p.until, coastRt.time);
    }
  }
  const where = !bird ? "gone" : bird.m.mode === "arrive" && bird.m.z < ARRIVAL.threshold + 0.25 ? "inside" : "clear";
  if (stepArrival(dt, where) && bird) {
    const y = EXHIBITS.penguins.land.y;
    bird.m.path = [{ x: door.x, y, z: ARRIVAL.threshold }, { x: door.x, y, z: ARRIVAL.out }];
  }
}

/** Leaving mid-arrival (or before one began): every bought bird is simply on the shelf, clear of the others. */
function settleArrivals() {
  coastRt.arrivals.length = 0;
  const ex = EXHIBITS.penguins, items = contexts.penguins.landItems;
  for (const a of coastRt.animals.values()) {
    if (a.habitat !== "penguins" || a.m.mode !== "arrive") continue;
    const m = a.m;
    let spot: { x: number; z: number } | null = null;
    for (let ring = 0; ring < 6 && !spot; ring++) for (let k = 0; k < 8 && !spot; k++) {
      const angle = k * Math.PI / 4, r = ring * 0.9;
      const q = { x: door.x + Math.sin(angle) * r, z: ARRIVAL.out + Math.abs(Math.cos(angle)) * r };
      if (landLegClear(ex, q, q, items, 0.35) && peerLists.penguins.every((p) => p === m || Math.hypot(p.x - q.x, p.z - q.z) >= PENGUIN_LAND_SEPARATION + 0.1)) spot = q;
    }
    spot ??= { x: door.x, z: ARRIVAL.out };
    Object.assign(m, { x: spot.x, z: spot.z, y: ex.land.y, mode: "rest", area: "land", speed: 0, pitch: 0, heading: 0, until: coastRt.time + 1 });
    m.path = [];
  }
}

/** Presentation cleanup on leave: re-entry never resumes a half-finished meal. */
export function clearCoastMeal() {
  coastRt.stationFood = null;
  for (const a of coastRt.animals.values()) if (a.habitat === "penguins") {
    a.m.feeding = undefined; a.m.attract = null;
    if (a.m.action === "eat") a.m.action = null;
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
  if (!coastHabitatShown(h)) return;
  syncCoast(model);
  coastRt.fedAt[h] = coastRt.time;
  const ex = EXHIBITS[h];
  const t = tankAt(model, HABITAT_PAD[h]);
  const feeder = t?.decor.find((d) => d.kind === "penguinFeeder");
  const fs = feeder ? ex.slots[feeder.slot] : null;
  if (h === "penguins" && fs && feeder) {
    const animals = [...coastRt.animals.values()].filter((a) => a.habitat === h);
    const items = habitatCtx(model, h).landItems;
    // Reserve the keeper's working spot through the departure, including birds already on land.
    if (keeperRt.feed.phase !== "idle") items.push({ x: keeperRt.feed.x, z: keeperRt.feed.z, r: KEEPER_CLEARANCE });
    const spots = stationSpots(ex, fs, animals.length, items);
    coastRt.stationFood = { slot: feeder.slot, fish: Math.min(spots.length, animals.length) * 3, fedAt: coastRt.time };
    animals.forEach((a, i) => {
      a.m.feeding = undefined;
      const spot = spots[i];
      if (!spot) return;
      a.m.attract = null;
      a.m.feeding = { spot, station: { x: fs.x, z: fs.z }, stage: "approach", routed: false, bites: 0, nextBite: 0, until: 0 };
      // A swimming bird turns toward a ramp from its present position; transitions already on a ramp/ledge finish normally.
      if (a.m.mode === "swim" || a.m.mode === "breathe") a.m.exit = null;
    });
    return;
  }
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
  resetKeepers();
  staffBody.active = false;
  coastRt.animals.clear();
  coastRt.hold.clear();
  coastRt.sights = [];
  coastRt.time = 0;
  coastRt.stationFood = null;
  coastRt.entries = { penguins: 0, seals: 0, otters: 0 };
  coastRt.arrivals = [];
  crewLive.length = 0;
  seed = 1;
  for (const h of COAST_HABITATS) peerLists[h].length = 0;
  decorRefs.clear();
}
