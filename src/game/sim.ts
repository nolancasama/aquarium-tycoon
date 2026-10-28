import { getGame, updateModel } from "./store";
import { rt, type FishRt, type Pellet } from "./runtime";
import { SPECIES } from "./data/fish";
import { SAND_H, TANKS } from "./data/tanks";
import { decay, happiness, latchHappy, mood, type TankRec } from "./logic/model";
import { newSwimState, stepSwim, tankFishBounds, type Bounds, type SwimEnv } from "./logic/swim";
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
function boundsFor(type: TankType, species: SpeciesId): Bounds {
  const key = `${type}:${species}`;
  let b = boundsCache.get(key);
  if (!b) {
    b = tankFishBounds(TANKS[type], SAND_H, SPECIES[species]);
    boundsCache.set(key, b);
  }
  return b;
}

/** Keep rt.fish in step with the model (a fish poured in appears; none ever disappear in play). */
function syncFish(tanks: TankRec[]) {
  const live = new Set<string>();
  for (const t of tanks) {
    const columns = columnsOf(t);
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
  for (const id of [...rt.fish.keys()]) if (!live.has(id)) rt.fish.delete(id);
}

let pelletId = 1;

/** Drop a handful of pellets at the tank's feeding spot. */
export function dropPellets(tankId: string, type: TankType) {
  const spot = feedSpot(type);
  const n = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    rt.pellets.push({
      id: pelletId++,
      tankId,
      x: spot.x + (rand() - 0.5) * 0.3,
      y: spot.y + rand() * 0.04,
      z: spot.z + (rand() - 0.5) * 0.25,
      vy: -(0.08 + rand() * 0.06),
      sway: rand() * 6,
      eaten: false,
      landedT: -1
    });
  }
}

const SHOW_SECONDS = 2.6;

function stepFish(dt: number, tanks: TankRec[]) {
  const byTank = new Map<string, FishRt[]>();
  for (const f of rt.fish.values()) {
    const list = byTank.get(f.tankId);
    if (list) list.push(f);
    else byTank.set(f.tankId, [f]);
  }
  for (const t of tanks) {
    const fishes = byTank.get(t.id);
    if (!fishes) continue;
    const columns = columnsOf(t);
    const m = mood(happiness(t));
    const baseMul = m === "happy" ? 1.25 : m === "sad" ? 0.7 : 1;
    const hungry = t.food < 40;
    const pellets = rt.pellets.filter((p) => p.tankId === t.id && !p.eaten);
    for (const f of fishes) {
      const def = SPECIES[f.species];
      const s = f.s;
      const showing = rt.time - f.showT0 < SHOW_SECONDS;
      let attract: SwimEnv["attract"] = null;
      let target: Pellet | null = null;
      const bounds = boundsFor(t.type, f.species);
      if (showing) {
        // Swim to the front glass, in the middle, for the visitor.
        attract = { x: Math.sin((rt.time - f.showT0) * 2.4) * 0.25, y: (bounds.min.y + bounds.max.y) / 2 + Math.cos((rt.time - f.showT0) * 2.4) * 0.12, z: bounds.max.z };
      } else if (pellets.length) {
        let best = Infinity;
        for (const p of pellets) {
          const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2 + (p.z - s.z) ** 2;
          if (d < best) {
            best = d;
            target = p;
          }
        }
        if (target) attract = { x: target.x, y: target.y, z: target.z };
      }
      if (!rt.freezeFish) {
        const others = fishes.filter((o) => o !== f).map((o) => o.s);
        const env: SwimEnv = {
          bounds,
          columns,
          others,
          speedMul: (attract ? 1.35 : baseMul) * (rt.slowFish && !showing ? 0.3 : 1),
          attract,
          depthBias: hungry && !attract ? 0.3 : 0
        };
        stepSwim(s, def, env, dt, rand);
      }
      // Eat a pellet the mouth reaches.
      if (target) {
        const mx = s.x + Math.cos(f.yaw) * def.length * 0.45;
        const mz = s.z - Math.sin(f.yaw) * def.length * 0.45;
        const d = Math.hypot(target.x - mx, target.y - s.y, target.z - mz);
        if (d < 0.07 || Math.hypot(target.x - s.x, target.y - s.y, target.z - s.z) < def.radius * 0.9) {
          target.eaten = true;
          f.eatT0 = rt.time;
          audio.play("gulp");
          if (rand() < 0.3) f.happyT0 = rt.time;
        }
      }
      // Heading and tail beat for drawing.
      const speed = Math.hypot(s.vx, s.vz);
      if (speed > 0.015) {
        const want = Math.atan2(-s.vz, s.vx);
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
      p.x += Math.sin(rt.time * 2 + p.sway) * 0.02 * dt;
      if (p.y <= SAND_H + 0.015) {
        p.y = SAND_H + 0.015;
        p.landedT = rt.time;
      }
    }
  }
  rt.pellets = rt.pellets.filter((p) => !p.eaten && (p.landedT < 0 || rt.time - p.landedT < 6));
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
  if (decayRunning()) {
    rt.decayAcc += dt;
    if (rt.decayAcc >= 1) {
      const s = rt.decayAcc;
      rt.decayAcc = 0;
      updateModel((m) => latchHappy(decay(m, s)));
    }
  }
  visitorsTick(dt);
  storyTick(dt);
}
