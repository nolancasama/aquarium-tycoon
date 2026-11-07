import { getGame, setGame, updateModel } from "./store";
import { beginCelebration, endCelebration, rt } from "./runtime";
import { seedChoices } from "./flow/ask";
import { advanceCare, seedSim } from "./sim";
import { ensureRush } from "./rush/logic";
import { RUSH_SECONDS } from "./rush/config";
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
import { visibleCountNumbers } from "./logic/counting";
import { ROOMS } from "./data/rooms";
import { SHARK_DOOR, TUNNEL_SECTIONS, TUNNEL_VIEWING_SPOTS, TUNNEL_ZONES, sectionAt, walkwayFrame, walkwayLength, type TunnelSection } from "./data/sharkTunnel";
import { tunnelRuntime } from "./tunnel/contract";
import { cameraTubeCheck, playerWorld, snapCamera } from "./tunnel/explore";
import { findTargetId, locate, runActivity } from "./tunnel/activities";
import { personWorld, tunnelPeople } from "./tunnel/tunnelVisitors";

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
  const heldCelebrations: symbol[] = [];
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
        roomId: ROOMS[g.hall]?.id ?? null,
        tunnelOpen: Boolean(m.progress.tunnelOpen),
        tunnelIntroSeen: Boolean(m.progress.tunnelIntroSeen),
        tunnelMilestone: m.progress.tunnel?.milestone ?? 0,
        tunnelObserved: m.progress.tunnel?.observed ?? 0,
        tunnelHelped: m.progress.tunnel?.helped ?? 0,
        tunnelArrival: g.tunnelArrival,
        tunnelView: g.tunnelView,
        habitatTankId: m.tanks.find((t) => t.type === "sharks" && t.slot === "L")?.id ?? null,
        camera: { pos: { ...rt.camera.pos }, target: { ...rt.camera.target } },
        panel: g.panel,
        placing: g.placing,
        micState: g.micState,
        coins: m.coins,
        rush: m.rush,
        stage: m.progress.stage,
        tutorial: m.progress.tutorial,
        guide: g.guide,
        nudge: g.nudge ? { id: g.nudge.id, en: g.nudge.en, target: g.nudge.target, kind: g.nudge.kind } : null,
        handTargetId: rt.hand.targetId,
        keywordShown: document.querySelector<HTMLElement>("[data-testid=request-keyword]")?.dataset.keyword ?? null,
        swatchShown: document.querySelector<HTMLElement>("[data-testid=request-swatch]")?.dataset.color ?? null,
        meaningsShown: Array.from(document.querySelectorAll<HTMLElement>("[data-testid=sentence-meaning]"), (el) => el.dataset.pattern!),
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
        visitors: rt.visitors.map((v) => ({ id: v.id, type: v.type, state: v.state, request: v.request?.kind ?? null, helped: v.helped, x: v.x, z: v.z, yaw: v.yaw, seat: v.seat, seatId: v.seatId })),
        pellets: rt.pellets.length,
        pelletFoods: rt.pellets.map((p) => p.food),
        countGlow: Boolean(rt.countGlow),
        countNumbers: visibleCountNumbers(rt.countGlow, rt.time).filter((x) => rt.fish.has(x.fishId)),
        glowFish: rt.glow.fish.size,
        glowVisitors: [...rt.glow.visitors],
        pendingVisitorTap: rt.pendingVisitorTap?.visitorId ?? null,
        visitorTapAck: rt.visitorTapAck?.id ?? null,
        celebrations: rt.celebrations.size,
        perf: { ...perf, dpr: dprState.dpr, dprDropped: dprState.dropped }
      };
    },
    /** Screen position of a thing: fish id, tank id, `tankId:slot` (decoration or slot), pad slot, visitor id, pico. */
    where(kind: "fish" | "tank" | "badge" | "decor" | "slot" | "pad" | "visitor" | "pico" | "tunnel-door", id = "") {
      const m = getGame().model;
      if (kind === "tunnel-door") return project(SHARK_DOOR.x, 1.3, SHARK_DOOR.z + 0.2);
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
        // The habitat answers taps on its water surface (y 8), over the open middle of the U.
        if (t.type === "sharks") return project(o.x, 8, -21);
        return kind === "badge"
          ? project(o.x, STAND_H + TANKS[t.type].h + 0.5, o.z)
          : project(o.x, STAND_H + TANKS[t.type].h * 0.5, o.z + TANKS[t.type].d / 2);
      }
      if (kind === "decor" || kind === "slot") {
        const [tankId, s] = id.split(":");
        const t = m.tanks.find((x) => x.id === tankId);
        if (!t) return null;
        const slot = Number(s);
        if (t.type === "sharks") {
          const zone = TUNNEL_ZONES[slot];
          return zone ? project(zone.x, zone.y + 0.06, zone.z) : null;
        }
        const p = TANKS[t.type].slots[slot];
        const o = SLOT_POS[t.slot];
        const d = t.decor.find((x) => x.slot === slot);
        const base = Math.max(sandSurfaceY(TANKS[t.type], p.x, p.z), STAND_H + (p.y ?? 0));
        const y = kind === "decor" && d ? base + decorVersion(d.kind, d.variant).height * TANKS[t.type].h * 0.5 : Math.max(slotMarkerY(TANKS[t.type], p), base + 0.005);
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
    /** Hold (or release the latest) visitor celebration; fast mode makes real ones shorter than a frame. */
    holdCelebration(on: boolean) {
      if (on) heldCelebrations.push(beginCelebration());
      else {
        const token = heldCelebrations.pop();
        if (token) endCelebration(token);
      }
      return rt.celebrations.size;
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
    rushState() {
      return getGame().model.rush ?? null;
    },
    rushUntilNext(seconds: number) {
      if (!Number.isFinite(seconds)) return;
      updateModel((m) => {
        const next = ensureRush(m);
        return { ...next, rush: { ...next.rush!, untilNext: Math.max(0, seconds) } };
      });
    },
    rushRemaining(seconds: number) {
      if (!Number.isFinite(seconds)) return;
      updateModel((m) => {
        const r = m.rush;
        if (!r?.event || (r.phase !== "prep" && r.phase !== "rush")) return m;
        const limit = r.phase === "prep" ? r.event.prepTotal : RUSH_SECONDS;
        return { ...m, rush: { ...r, event: { ...r.event, remaining: Math.max(0, Math.min(limit, seconds)) } } };
      });
    },
    rushAdvance(seconds: number) {
      advanceCare(seconds);
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
  (window as unknown as { __tunnel: typeof tunnelApi }).__tunnel = tunnelApi;
}

/** Shark Tunnel test hook: exploration state, teleport along the walkway, activities. */
const tunnelApi = {
  state() {
    const e = rt.explore;
    const swim = tunnelRuntime.swim;
    const p = playerWorld();
    return {
      active: e.active, s: e.s, lateral: e.lateral, section: sectionAt(e.s), spot: e.spot, speed: e.speed,
      player: p, cam: { ...e.cam }, tube: e.active ? cameraTubeCheck() : null, length: walkwayLength,
      animals: swim ? swim.poses().map((a) => ({ id: a.id, species: a.species, x: a.x, y: a.y - (a.restDrop ?? 0), z: a.z, resting: a.resting, where: e.active ? locate(a) : null })) : [],
      visitors: tunnelPeople.map((v) => ({ id: v.id, type: v.type, s: v.s, lateral: v.lateral, state: v.state, activity: v.activity, request: v.request, ...personWorld(v) })),
      activity: getGame().tunnelActivity, waiting: getGame().tunnelWaiting, tilt: e.tilt, findTarget: findTargetId()
    };
  },
  /** Put the player at distance s along the loop (lateral offset optional). */
  goTo(s: number, lateral = 0) {
    rt.explore.s = ((s % walkwayLength) + walkwayLength) % walkwayLength;
    rt.explore.lateral = lateral;
    rt.explore.walkTo = null;
    // Face along the walking direction, as if the player had walked here.
    const f = walkwayFrame(rt.explore.s);
    rt.explore.heading = Math.atan2(f.dx, f.dz);
    snapCamera();
  },
  sectionStart(name: TunnelSection) {
    return TUNNEL_SECTIONS[name].from;
  },
  spots: () => TUNNEL_VIEWING_SPOTS.map((v) => ({ id: v.id, s: v.s, side: v.side })),
  /** Start an activity as a visitor's (visitor: true) or Pico's question. */
  activity(kind: "find" | "show" | "where" | "can" | "count", target: "shark" | "ray" | "bigshark", visitor = true) {
    const v = visitor ? tunnelPeople[0] : null;
    void runActivity(kind, target, v?.id ?? null, false);
  },
  /** Screen position of an animal (for tapping it). */
  animalOnScreen(id: string) {
    const a = tunnelRuntime.swim?.poses().find((x) => x.id === id);
    return a ? project(a.x, a.y - (a.restDrop ?? 0), a.z) : null;
  },
  /** Bring an animal over the player now (tests do not wait for ordinary swimming). */
  attract(id: string, x: number, y: number, z: number, seconds = 20) {
    tunnelRuntime.swim?.attract(id, { x, y, z }, seconds);
  }
};
