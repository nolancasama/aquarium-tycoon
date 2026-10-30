import { getGame, setGame, updateModel } from "./store";
import { rt } from "./runtime";
import { seedChoices } from "./flow/ask";
import { seedSim } from "./sim";
import { leave, seedVisitors, spawnVisitor } from "./flow/visitors";
import { decay, goals, happiness, latchHappy, setCare } from "./logic/model";
import type { Request } from "./logic/requests";
import { requestStep } from "./logic/requestGuide";
import { SLOT_POS, STAND_H, TANKS } from "./data/tanks";
import { decorVersion } from "./data/decor";
import { PICO } from "./world";
import { project } from "../scene/CameraRig";
import { dprState, perf } from "../scene/GameScene";
import { sandSurfaceY, slotMarkerY } from "./logic/tankLayout";
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
        hall: g.hall,
        panel: g.panel,
        placing: g.placing,
        micState: g.micState,
        coins: m.coins,
        stage: m.progress.stage,
        tutorial: m.progress.tutorial,
        guide: g.guide,
        nudge: g.nudge ? { id: g.nudge.id, en: g.nudge.en, target: g.nudge.target, kind: g.nudge.kind } : null,
        requestStep: requestStep({ request: g.request, view: g.view, tankId: g.tankId, model: m, waiting: g.waiting }),
        progress: m.progress,
        goals: goals(m),
        tanks: m.tanks.map((t) => ({
          id: t.id,
          slot: t.slot,
          type: t.type,
          light: t.light,
          fish: t.fish.map((f) => f.species),
          fishIds: t.fish.map((f) => f.id),
          decor: t.decor.map((d) => ({ slot: d.slot, kind: d.kind, variant: d.variant })),
          food: Math.round(t.food),
          clean: Math.round(t.clean),
          happy: happiness(t)
        })),
        inv: { fish: m.inv.fish.length, species: m.inv.fish.map((f) => f.species), decor: m.inv.decor.map((d) => ({ id: d.id, kind: d.kind, variant: d.variant })), tanks: m.inv.tanks.length },
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
        visitors: rt.visitors.map((v) => ({ id: v.id, type: v.type, state: v.state, request: v.request?.kind ?? null, helped: v.helped, x: v.x, z: v.z, yaw: v.yaw, seat: v.seat })),
        pellets: rt.pellets.length,
        countGlow: Boolean(rt.countGlow),
        glowFish: rt.glow.fish.size,
        perf: { ...perf, dpr: dprState.dpr, dprDropped: dprState.dropped }
      };
    },
    /** Screen position of a thing: fish id, tank id, `tankId:slot` (decoration or slot), pad slot, visitor id, pico. */
    where(kind: "fish" | "tank" | "badge" | "decor" | "slot" | "pad" | "visitor" | "pico", id = "") {
      const m = getGame().model;
      if (kind === "fish") {
        const f = rt.fish.get(id);
        const t = f && m.tanks.find((x) => x.id === f.tankId);
        if (!f || !t) return null;
        const o = SLOT_POS[t.slot];
        return project(o.x + f.s.x, STAND_H + f.s.y, o.z + f.s.z);
      }
      if (kind === "tank" || kind === "badge") {
        const t = m.tanks.find((x) => x.id === id);
        if (!t) return null;
        const o = SLOT_POS[t.slot];
        return kind === "badge"
          ? project(o.x, STAND_H + TANKS[t.type].h + 0.5, o.z)
          : project(o.x, STAND_H + TANKS[t.type].h * 0.5, o.z + TANKS[t.type].d / 2);
      }
      if (kind === "decor" || kind === "slot") {
        const [tankId, s] = id.split(":");
        const t = m.tanks.find((x) => x.id === tankId);
        if (!t) return null;
        const slot = Number(s);
        const p = TANKS[t.type].slots[slot];
        const o = SLOT_POS[t.slot];
        const d = t.decor.find((x) => x.slot === slot);
        const y = kind === "decor" && d ? sandSurfaceY(TANKS[t.type], p.x, p.z) + decorVersion(d.kind, d.variant).height * TANKS[t.type].h * 0.5 : slotMarkerY(TANKS[t.type], p);
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
    /** Screen box of a tank's front glass (layout checks beside the close-up). */
    glass(tankId: string) {
      const t = getGame().model.tanks.find((x) => x.id === tankId);
      if (!t) return null;
      const o = SLOT_POS[t.slot];
      const def = TANKS[t.type];
      const pts = [-1, 1].flatMap((sx) => [STAND_H, STAND_H + def.h].map((y) => project(o.x + sx * def.w / 2, y, o.z + def.d / 2)));
      if (pts.some((p) => !p)) return null;
      const xs = pts.map((p) => p!.x);
      const ys = pts.map((p) => p!.y);
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
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
    /** An ordinary visitor who has looked at these tanks leaves now (pays the real tips). */
    tipVisitor(seen: string[], x = 0, z = 1.5) {
      const v = spawnVisitor("adult", null);
      v.x = x;
      v.z = z;
      v.seen = [...seen];
      leave(v);
      return v.id;
    },
    /** Send a visitor home (a seated one stands up first). */
    leaveVisitor(id: string) {
      const v = rt.visitors.find((x) => x.id === id);
      if (v) leave(v);
    },
    set(patch: Record<string, unknown>) {
      setGame(patch as never);
    },
    visitorsOn: () => visitorsOn
  };
  (window as unknown as { __at: typeof api }).__at = api;
}
