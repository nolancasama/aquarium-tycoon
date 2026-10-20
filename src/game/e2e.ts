import { getGame, setGame, updateModel } from "./store";
import { rt } from "./runtime";
import { seedChoices } from "./flow/ask";
import { seedSim } from "./sim";
import { seedVisitors, spawnVisitor } from "./flow/visitors";
import { decay, goals, happiness, latchHappy, setCare } from "./logic/model";
import type { Request } from "./logic/requests";
import { SAND_H, SLOT_POS, STAND_H, TANKS } from "./data/tanks";
import { decorVersion } from "./data/decor";
import { PICO } from "./world";
import { project } from "../scene/CameraRig";
import { dprState, perf } from "../scene/GameScene";
import type { SlotId, VisitorType } from "./types";

/**
 * Test hook (only with ?e2e=1): read game state, find where things are on
 * screen, and control time and visitors, so Playwright drives the real UI
 * (clicks on real canvas pixels, real buttons) deterministically.
 */
export function installE2eHook(seed: number) {
  seedChoices(seed);
  seedSim(seed);
  seedVisitors(seed);
  let visitorsOn = true;
  const api = {
    state() {
      const g = getGame();
      const m = g.model;
      return {
        screen: g.screen,
        mode: g.mode,
        view: g.view,
        tankId: g.tankId,
        panel: g.panel,
        placing: g.placing,
        micState: g.micState,
        coins: m.coins,
        stage: m.progress.stage,
        tutorial: m.progress.tutorial,
        progress: m.progress,
        goals: goals(m),
        tanks: m.tanks.map((t) => ({
          id: t.id,
          slot: t.slot,
          type: t.type,
          fish: t.fish.map((f) => f.species),
          fishIds: t.fish.map((f) => f.id),
          decor: t.decor.map((d) => ({ slot: d.slot, kind: d.kind, variant: d.variant })),
          food: Math.round(t.food),
          clean: Math.round(t.clean),
          happy: happiness(t)
        })),
        inv: { fish: m.inv.fish.length, decor: m.inv.decor.map((d) => ({ id: d.id, kind: d.kind, variant: d.variant })), tanks: m.inv.tanks.length },
        prompt: g.prompt
          ? {
              id: g.prompt.id,
              kind: g.prompt.kind,
              status: g.prompt.status,
              buttons: g.prompt.buttons,
              misses: g.prompt.misses,
              highlight: g.prompt.highlight,
              sentences: g.prompt.sentences.map((s) => s.en),
              choices: g.prompt.choices.map((c) => c.id),
              question: g.prompt.question?.en ?? null
            }
          : null,
        line: g.line ? { by: g.line.by, en: g.line.en } : null,
        request: g.request
          ? { kind: g.request.req.kind, color: g.request.req.kind === "show" ? g.request.req.color : null, misses: g.request.misses, status: g.request.status, by: g.request.by }
          : null,
        stageCard: g.stageCard,
        waiting: g.waiting,
        visitors: rt.visitors.map((v) => ({ id: v.id, type: v.type, state: v.state, request: v.request?.kind ?? null, helped: v.helped })),
        pellets: rt.pellets.length,
        countGlow: Boolean(rt.countGlow),
        glowFish: rt.glow.fish.size,
        perf: { ...perf, dpr: dprState.dpr, dprDropped: dprState.dropped }
      };
    },
    /** Screen position of a thing: fish id, tank id, `tankId:slot` (decoration or slot), pad slot, visitor id, pico. */
    where(kind: "fish" | "tank" | "decor" | "slot" | "pad" | "visitor" | "pico", id = "") {
      const m = getGame().model;
      if (kind === "fish") {
        const f = rt.fish.get(id);
        const t = f && m.tanks.find((x) => x.id === f.tankId);
        if (!f || !t) return null;
        const o = SLOT_POS[t.slot];
        return project(o.x + f.s.x, STAND_H + f.s.y, o.z + f.s.z);
      }
      if (kind === "tank") {
        const t = m.tanks.find((x) => x.id === id);
        if (!t) return null;
        const o = SLOT_POS[t.slot];
        return project(o.x, STAND_H + TANKS[t.type].h * 0.5, o.z + TANKS[t.type].d / 2);
      }
      if (kind === "decor" || kind === "slot") {
        const [tankId, s] = id.split(":");
        const t = m.tanks.find((x) => x.id === tankId);
        if (!t) return null;
        const slot = Number(s);
        const p = TANKS[t.type].slots[slot];
        const o = SLOT_POS[t.slot];
        const d = t.decor.find((x) => x.slot === slot);
        const y = kind === "decor" && d ? STAND_H + SAND_H + decorVersion(d.kind, d.variant).height * TANKS[t.type].h * 0.5 : STAND_H + SAND_H + 0.1;
        return project(o.x + p.x, y, o.z + p.z);
      }
      if (kind === "pad") {
        const o = SLOT_POS[id as SlotId];
        return project(o.x, 0.5, o.z);
      }
      if (kind === "visitor") {
        const v = rt.visitors.find((x) => x.id === id);
        return v ? project(v.x, 1.0, v.z) : null;
      }
      return project(PICO.x, 0.6, PICO.z + 0.48);
    },
    /** Fish hold still (clicking a moving fish under SwiftShader's 5 fps is flaky). */
    freezeFish(on: boolean) {
      rt.freezeFish = on;
    },
    /** Let care time pass (hunger and dirt) without waiting. */
    advance(seconds: number) {
      updateModel((m) => latchHappy(decay(m, seconds)));
    },
    setCare(tankId: string, food: number, clean: number) {
      updateModel((m) => setCare(m, tankId, food, clean));
    },
    /** Ordinary visitors on/off (tests spawn their own request visitors). */
    visitors(on: boolean) {
      visitorsOn = on;
      rt.nextSpawn = on ? 3 : 1e9;
      rt.spawnClock = 0;
    },
    /** A request visitor already sitting on the bench. */
    requestVisitor(type: VisitorType, req: Request) {
      return spawnVisitor(type, req, { atBench: true }).id;
    },
    set(patch: Record<string, unknown>) {
      setGame(patch as never);
    },
    visitorsOn: () => visitorsOn
  };
  (window as unknown as { __at: typeof api }).__at = api;
}
