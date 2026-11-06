import { getGame, setGame, updateModel } from "./store";
import { rt, type FishRt, type Pellet } from "./runtime";
import { SPECIES } from "./data/fish";
import { SAND_H, STAND_H, TANKS } from "./data/tanks";
import { decay, happiness, latchHappy, mood, type TankRec } from "./logic/model";
import { newSwimState, tankFishBounds, frontAt, floorAt, type Bounds, type SwimEnv, type Column } from "./logic/swim";
import { reactToAnimalTap, stepBehavior, type BehaviorEnv } from "./logic/behavior";
import { eelBounds } from "./logic/eelBody";
import { sandSurfaceY } from "./logic/tankLayout";
import { FOOD_FALL, PELLET_SINK, PLANKTON_LIFE, eatsFood, foodsFor, type FoodId } from "./data/food";
import { seabedY } from "./data/sharkTunnel";
import { SLOT_POS } from "./data/tanks";
import { checkTunnelMilestones } from "./logic/tunnel";
import { makeRng } from "./logic/rng";
import { columnsOf, feedSpot } from "./world";
import { stepVisitors, visitorsTick } from "./flow/visitors";
import { storyTick } from "./flow/story";
import { audio } from "../audio/audio";
import type { SpeciesId, TankType } from "./types";

/**
 * The per-frame step: fish swim (pure steering from logic/swim), pellets fall
 * and get eaten, visitors walk, care time is committed to the model once a
 * second, and the story's watchers run.
 */

let rand = makeRng(12345);
export function seedSim(seed: number) {
  rand = makeRng(seed);
}

const boundsCache = new Map<string, Bounds>();
const columnCache = new Map<string, { tank: TankRec; columns: Column[] }>();
function columnsFor(tank: TankRec): Column[] {
  let cached = columnCache.get(tank.id);
  if (!cached || cached.tank !== tank) {
    cached = { tank, columns: columnsOf(tank) };
    columnCache.set(tank.id, cached);
  }
  return cached.columns;
}
function boundsFor(type: TankType, species: SpeciesId): Bounds {
  const key = `${type}:${species}`;
  let b = boundsCache.get(key);
  if (!b) {
    b = species === "eel" ? eelBounds(TANKS[type]) : tankFishBounds(TANKS[type], SAND_H, SPECIES[species]);
    boundsCache.set(key, b);
  }
  return b;
}

/** Keep rt.fish in step with the model (a fish poured in appears; none ever disappear in play). */
const live = new Set<string>();
function syncFish(tanks: TankRec[]) {
  live.clear();
  for (const t of tanks) {
    if (t.type === "sharks") continue; // The separate tunnelRuntime owns large animals.
    const columns = columnsFor(t);
    for (const f of t.fish) {
      live.add(f.id);
      const have = rt.fish.get(f.id);
      if (have && have.tankId === t.id) continue;
      const def = SPECIES[f.species];
      const env: SwimEnv = { bounds: boundsFor(t.type, f.species), columns, others: [], speedMul: 1, attract: null, depthBias: 0 };
      const s = newSwimState(def, env, rand);
      // A fish poured in arrives from the surface.
      if (rt.splash.has(t.id) && rt.time - (rt.splash.get(t.id) ?? 0) < 1) s.y = env.bounds.max.y;
      rt.fish.set(f.id, {
        id: f.id,
        tankId: t.id,
        species: f.species,
        s,
        yaw: Math.atan2(-s.vz, s.vx),
        pitch: 0,
        bank: 0,
        phase: rand() * 6,
        eatT0: -10,
        happyT0: -10,
        tapT0: -10,
        showT0: -10,
        glow: 0
      });
    }
  }
  for (const id of rt.fish.keys()) if (!live.has(id)) rt.fish.delete(id);
  for (const id of columnCache.keys()) if (!tanks.some((t) => t.id === id)) columnCache.delete(id);
}

let pelletId = 1;

function dropFood(tankId: string, type: TankType, food: FoodId, count: number) {
  const spot = feedSpot(type), tank = TANKS[type], fall = FOOD_FALL[food];
  for (let i = 0; i < count; i++) {
    const id = pelletId++;
    const x = spot.x + (rand() - 0.5) * 0.3 * fall.spread;
    const z = spot.z + (rand() - 0.5) * 0.25 * fall.spread;
    const sink = food === "flakes" && id % 3 === 0 ? PELLET_SINK : fall.sink;
    rt.pellets.push({
      id,
      tankId,
      food,
      x,
      y: spot.y + rand() * 0.04,
      z,
      vy: -sink * (0.85 + rand() * 0.3),
      sway: rand() * 6,
      drift: sink === PELLET_SINK ? 0.006 : fall.drift,
      floor: (type === "sharks" ? seabedY(SLOT_POS.L.x + x, SLOT_POS.L.z + z) : Math.max(SAND_H, sandSurfaceY(tank, x, z) - STAND_H)) + 0.015,
      bornT: rt.time,
      eaten: false,
      landedT: -1
    });
  }
}

/** Drop what the tank's residents eat at its feeding spot, in one tap. */
export function dropPellets(tankId: string, type: TankType) {
  const foods = foodsFor(getGame().model.tanks.find((t) => t.id === tankId)?.fish ?? []);
  const n = Math.min(14, Math.max(6 + Math.floor(rand() * 5), foods.length * 3));
  foods.forEach((food, i) => dropFood(tankId, type, food, Math.floor(n / foods.length) + (i < n % foods.length ? 1 : 0)));
}

/** A small extra pinch from the food strip. It does not touch the meter. */
export function dropPinch(tankId: string, type: TankType, food: FoodId) {
  dropFood(tankId, type, food, 2);
}

const SHOW_SECONDS = 2.6;
const fishes: FishRt[] = [];
const others: FishRt["s"][] = [];
const attraction = { x: 0, y: 0, z: 0 };
const behaviorEnv: BehaviorEnv = {
  tank: TANKS.small,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  columns: [], others, speedMul: 1, attract: null, depthBias: 0
};

function stepFish(dt: number, tanks: TankRec[]) {
  for (const t of tanks) {
    if (t.type === "sharks") continue;
    fishes.length = 0;
    for (const f of rt.fish.values()) if (f.tankId === t.id) fishes.push(f);
    if (!fishes.length) continue;
    const columns = columnsFor(t);
    const m = mood(happiness(t));
    const baseMul = m === "happy" ? 1.25 : m === "sad" ? 0.7 : 1;
    const hungry = t.food < 40;
    let denIndex = 0;
    for (const f of fishes) {
      const def = SPECIES[f.species];
      const s = f.s;
      const showing = rt.time - f.showT0 < SHOW_SECONDS;
      let attract: SwimEnv["attract"] = null;
      let target: Pellet | null = null;
      const bounds = boundsFor(t.type, f.species);
      const ground = def.movement === "walk" || def.movement === "crawl";
      const surfaceFeeder = def.movement !== "swim" && (f.species !== "jellyfish" || !!TANKS[t.type].current);
      if (showing) {
        // Swim to the front glass, in the middle, for the visitor.
        attraction.x = Math.sin((rt.time - f.showT0) * 2.4) * 0.25;
        attraction.y = (bounds.min.y + bounds.max.y) / 2 + Math.cos((rt.time - f.showT0) * 2.4) * 0.12;
        attraction.z = frontAt(bounds, attraction.x);
        attract = attraction;
      } else {
        let best = Infinity;
        for (const p of rt.pellets) {
          if (p.tankId !== t.id || p.eaten || (ground && p.landedT < 0) || !eatsFood(f.species, p.food)) continue;
          const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2 + (p.z - s.z) ** 2;
          if (d < best) {
            best = d;
            target = p;
          }
        }
        if (target) {
          attraction.x = target.x;
          attraction.y = target.y;
          attraction.z = target.z;
          if (surfaceFeeder) {
            // These bounds include body clearance; a pellet may be below the
            // centre or just beyond the head's conservative rockwork inset.
            attraction.x = THREE_clamp(attraction.x, bounds.min.x, bounds.max.x);
            attraction.z = THREE_clamp(attraction.z, bounds.min.z, frontAt(bounds, attraction.x));
            if (bounds.round !== undefined) {
              const r = Math.hypot(attraction.x, attraction.z);
              if (r > bounds.round) {
                attraction.x *= bounds.round / r;
                attraction.z *= bounds.round / r;
              }
            }
            attraction.y = THREE_clamp(attraction.y, floorAt(attraction.x, attraction.z, bounds, columns, def.radius), bounds.max.y);
          }
          attract = attraction;
        }
      }
      const assignedDen = def.movement === "den" ? denIndex++ : undefined;
      // A moray needs one step for its spine, even if the fish start frozen.
      if (!rt.freezeFish || (def.movement === "den" && !f.eel)) {
        reactToAnimalTap(s, f, f.tapT0, rt.time);
        others.length = 0;
        for (const o of fishes) if (o !== f) others.push(o.s);
        behaviorEnv.tank = TANKS[t.type];
        behaviorEnv.bounds = bounds;
        behaviorEnv.columns = columns;
        behaviorEnv.reef = t.type === "reef";
        const counting = rt.countGlow?.numbers.some((x) => x.fishId === f.id);
        behaviorEnv.speedMul = (attract ? 1.35 : baseMul) * (counting ? 0.18 : rt.slowFish && !showing ? 0.3 : 1);
        behaviorEnv.attract = attract;
        behaviorEnv.depthBias = hungry && !attract ? 0.3 : 0;
        behaviorEnv.show = showing;
        behaviorEnv.denIndex = assignedDen;
        behaviorEnv.phase = f.phase;
        stepBehavior(s, f, def, behaviorEnv, dt, rand);
      }
      // Eat a pellet the mouth reaches.
      if (target) {
        const mouth = def.body === "eel" ? 0 : def.length * 0.45;
        const mx = f.eel?.mouth.x ?? s.x + Math.cos(f.yaw) * mouth;
        const my = f.eel?.mouth.y ?? s.y;
        const mz = f.eel?.mouth.z ?? s.z - Math.sin(f.yaw) * mouth;
        const d = Math.hypot(target.x - mx, target.y - my, target.z - mz);
        let reached = d < 0.07 || Math.hypot(target.x - s.x, target.y - s.y, target.z - s.z) < def.radius * 0.9;
        if (surfaceFeeder && attract) reached ||= Math.hypot(attract.x - s.x, attract.y - s.y, attract.z - s.z) < 0.07;
        if (f.species === "eel") reached = d < 0.07;
        // A landed pellet is below a bottom animal's representative centre.
        if (ground || def.movement === "perch" || def.movement === "glide") {
          reached ||= target.landedT >= 0 && Math.hypot(target.x - s.x, target.z - s.z) < def.radius + 0.04 && s.y <= bounds.min.y + 0.09;
        }
        if (f.members) for (const member of f.members) {
          reached ||= Math.hypot(target.x - member.x, target.y - member.y, target.z - member.z) < 0.08;
        }
        if (reached) {
          target.eaten = true;
          f.eatT0 = rt.time;
          audio.play("gulp");
          if (rand() < 0.3) f.happyT0 = rt.time;
        }
      }
      // Heading and tail beat for drawing.
      const speed = Math.hypot(s.vx, s.vz);
      if (speed > 0.015) {
        const want = Math.atan2(-s.vz, s.vx) + (def.id === "crab" ? Math.PI / 2 : 0);
        let d = want - f.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const turn = d * Math.min(1, dt * 6);
        f.yaw += turn;
        f.bank += (THREE_clamp(-turn / Math.max(dt, 1e-3) * 0.08, -0.5, 0.5) - f.bank) * Math.min(1, dt * 4);
      }
      f.pitch += (THREE_clamp(s.vy * 2.2, -0.5, 0.5) - f.pitch) * Math.min(1, dt * 4);
      const effort = 0.55 + Math.min(1.5, Math.hypot(s.vx, s.vy, s.vz) / def.speed) * 0.6;
      f.phase += dt * def.tailHz * Math.PI * 2 * effort * (m === "sad" ? 0.7 : 1);
      // Happy fish play now and then: a loop or a spin.
      if (m === "happy" && !rt.freezeFish && rand() < dt * 0.04) f.happyT0 = rt.time;
    }
  }
}

function THREE_clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function stepPellets(dt: number) {
  if (!rt.pellets.length) return;
  for (const p of rt.pellets) {
    if (p.eaten) continue;
    if (p.landedT < 0) {
      p.y += p.vy * dt;
      p.x += Math.sin(rt.time * 2 + p.sway) * p.drift * dt;
      p.z += Math.cos(rt.time * 1.4 + p.sway) * p.drift * 0.6 * dt;
      if (p.y <= p.floor) {
        p.y = p.floor;
        p.landedT = rt.time;
      }
    }
  }
  rt.pellets = rt.pellets.filter((p) => !p.eaten && (p.food === "plankton"
    ? rt.time - p.bornT < PLANKTON_LIFE
    : p.landedT < 0 || rt.time - p.landedT < 6));
}

/** Care time runs during ordinary play only (not on the title, in Settings or in scripted moments). */
function decayRunning(): boolean {
  const g = getGame();
  return g.screen === "game" && !g.settingsOpen && !g.stageCard && g.mode !== "busy" && g.model.progress.tutorial === "done";
}

export function tick(dt: number) {
  const g = getGame();
  const tanks = g.model.tanks;
  syncFish(tanks);
  stepFish(dt, tanks);
  stepPellets(dt);
  stepVisitors(dt);
  rt.effects = rt.effects.filter((e) => rt.time - e.t0 < 4);
  if (g.screen !== "game") return;
  // Game time, so a slow machine still shows the food words for as long.
  if (g.foodStrip && rt.time > g.foodStrip.until) setGame({ foodStrip: null });
  if (decayRunning()) {
    rt.decayAcc += dt;
    if (rt.decayAcc >= 1) {
      const s = rt.decayAcc;
      rt.decayAcc = 0;
      updateModel((m) => checkTunnelMilestones(latchHappy(decay(m, s))).m);
    }
  }
  visitorsTick(dt);
  storyTick(dt);
}
