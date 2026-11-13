import { getGame, setGame, updateModel } from "./store";
import { beginCelebration, endCelebration, rt } from "./runtime";
import { seedChoices } from "./flow/ask";
import { advanceCare, seedSim } from "./sim";
import { ensureRush } from "./rush/logic";
import { RUSH_SECONDS } from "./rush/config";
import { leave, seedVisitors, spawnVisitor, visitorCrowdStats } from "./flow/visitors";
import { decay, goals, happiness, latchHappy, setCare } from "./logic/model";
import type { Request } from "./logic/requests";
import { requestStep } from "./logic/requestGuide";
import { SLOT_POS, STAND_H, TANKS } from "./data/tanks";
import { decorVersion } from "./data/decor";
import { PICO } from "./world";
import { project } from "../scene/CameraRig";
import { HUB_BAYS, HUB_R, onRing } from "./data/hub";
import { coastTo, lagoonTo, sanctuaryTo } from "../ui/DebugPanel";
import { sanctRt } from "./sanctuary/sanctuaryRuntime";
import { sanctFocus, startSanctActivity, type SanctQuestionKind } from "./flow/sanctuary";
import { startLagoonActivity, type LagoonQuestion } from "./flow/lagoon";
import { SANCTUARY_ORIGIN } from "./data/sanctuary";
import { enterOutdoor } from "./flow/outdoor";
import { dropToy, forceRing, forceTrick, lagoonRt } from "./lagoon/lagoonRuntime";
import type { TrickKind } from "./marine/pod";
import { LAGOON_ORIGIN } from "./data/lagoon";
import type { OutdoorArea } from "./store";
import type * as THREE from "three";
import { atmosphere } from "../scene/marine/outdoor";
import { endPreview, previewActive, startPreview } from "./flow/preview";
import { areaReleased, previewAreas, RELEASE_AREAS, type ReleaseArea } from "./data/release";
import { coastRt } from "./coast/coastRuntime";
import { EXHIBITS } from "./data/coast";
import { dprState, perf } from "../scene/GameScene";
import { sandSurfaceY, slotMarkerY } from "./logic/tankLayout";
import type { SlotId, VisitorType } from "./types";
import { visibleCountNumbers } from "./logic/counting";
import { ROOMS } from "./data/rooms";
import { SHARK_DOOR, TUNNEL_SECTIONS, TUNNEL_VIEWING_SPOTS, TUNNEL_ZONES, sectionAt, walkwayFrame, walkwayLength, type TunnelSection } from "./data/sharkTunnel";
import { tunnelRuntime } from "./tunnel/contract";
import { cameraTubeCheck, playerWorld, snapCamera } from "./tunnel/explore";
import { findTargetId, locate, runActivity } from "./tunnel/activities";
import { personWorld, tunnelCrowd, tunnelPeople } from "./tunnel/tunnelVisitors";

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
        hubIntroSeen: Boolean(m.progress.hubIntroSeen),
        mapOpen: g.mapOpen,
        fade: g.fade,
        tunnelView: g.tunnelView,
        habitatTankId: m.tanks.find((t) => t.type === "sharks" && t.slot === "L")?.id ?? null,
        camera: { pos: { ...rt.camera.pos }, target: { ...rt.camera.target } },
        panel: g.panel,
        placing: g.placing,
        micState: g.micState,
        coins: m.coins,
        rush: m.rush,
        crowd: visitorCrowdStats(),
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
        visitors: rt.visitors.map((v) => ({ id: v.id, type: v.type, cosmetic: Boolean(v.cosmetic), state: v.state, request: v.request?.kind ?? null, helped: v.helped, x: v.x, z: v.z, yaw: v.yaw, seat: v.seat, seatId: v.seatId })),
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
    where(kind: "fish" | "tank" | "badge" | "decor" | "slot" | "pad" | "visitor" | "pico" | "tunnel-door" | "hub-door" | "coast-slot", id = "") {
      const m = getGame().model;
      if (kind === "tunnel-door") return project(SHARK_DOOR.x, 1.3, SHARK_DOOR.z + 0.2);
      if (kind === "coast-slot") {
        const [h, i] = id.split(":") as ["penguins" | "seals" | "otters", string];
        const ex = EXHIBITS[h], s = ex?.slots[Number(i)];
        if (!s) return null;
        const y = s.on === "land" ? ex.land.y : s.on === "water" ? ex.pool.surface : ex.pool.floor;
        return project(ex.x + s.x, y + 0.1, ex.z + s.z);
      }
      if (kind === "hub-door") {
        const bay = HUB_BAYS.find((b) => b.kind === id);
        if (!bay) return null;
        const p = onRing(bay.angle, HUB_R - 0.8);
        return project(p.x, 1.7, p.z);
      }
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
    /**
     * Spawning on/off. `clear` also removes the hall visitors already present and
     * empties/pauses the Shark Tunnel crowd (neither tips), so exact coin checks stay exact.
     */
    visitors(on: boolean, clear = false) {
      visitorsOn = on;
      rt.nextSpawn = on ? 3 : 1e9;
      rt.spawnClock = 0;
      if (!on && clear) { rt.visitors = []; tunnelCrowd.paused = true; }
      if (on) tunnelCrowd.paused = false;
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
    visitorsOn: () => visitorsOn,
    /** Coastal zone: jump through its real rules to milestone n (1 opens it), inside a session-only preview (the zone is release-locked). */
    coastTo(n: number) {
      startPreview("coast");
      updateModel((m) => coastTo(m, n));
    },
    /** Development preview of a release-locked area (session only, never saved), as Ctrl+Alt+D does. */
    preview(area: ReleaseArea) {
      return startPreview(area);
    },
    endPreview() {
      return endPreview();
    },
    release() {
      return { preview: previewAreas(), active: previewActive(), released: Object.fromEntries(RELEASE_AREAS.map((a) => [a, areaReleased(a)])), stored: getGame().model.stored ?? null };
    },
    /** Walk into an outdoor area as its doorway does (only where a release or a preview allows). */
    outdoor(area: OutdoorArea) {
      enterOutdoor(area);
      return getGame().hall;
    },
    /** The Dolphin Lagoon now: progress, view, the dolphins (area-local), the toy and the Look! moment. */
    lagoon() {
      const g = getGame();
      const pod = lagoonRt.pod;
      return {
        progress: g.model.progress.lagoon ?? null, view: g.lagoonView, waiting: g.areaWaiting, activity: g.areaActivity, panel: g.areaPanel,
        look: lagoonRt.look ? { kind: lagoonRt.look.kind, ids: lagoonRt.look.ids } : null, time: lagoonRt.time, lastLeap: lagoonRt.lastLeap,
        toy: lagoonRt.toy ? { kind: lagoonRt.toy.kind, x: lagoonRt.toy.x, z: lagoonRt.toy.z } : null, bubbles: lagoonRt.time < lagoonRt.bubblesUntil,
        dolphins: pod ? pod.members.map((m) => ({ id: m.id, mode: m.mode, x: m.x, y: m.y, z: m.z, speed: m.speed })) : []
      };
    },
    /** The outdoor look now (air, water or off) and what the scene really holds. */
    atmosphere() {
      const s = atmosphere.scene, c = atmosphere.camera;
      const fog = s?.fog as THREE.Fog | null | undefined;
      return { mode: atmosphere.mode, fog: fog ? { color: "#" + fog.color.getHexString(), near: fog.near, far: fog.far } : null, far: c?.far ?? null, cameraY: rt.camera.pos.y };
    },
    /** The sanctuary now: progress, view, the orcas and belugas (area-local), the Look! moment, the litter. */
    sanctuary() {
      const g = getGame();
      const pod = (p: typeof sanctRt.orcas) => (p ? p.members.map((m) => ({ id: m.id, mode: m.mode, x: m.x, y: m.y, z: m.z, len: m.len })) : []);
      return {
        progress: g.model.progress.sanctuary ?? null, view: g.sanctuaryView, waiting: g.areaWaiting, activity: g.areaActivity, panel: g.areaPanel,
        look: sanctRt.look ? { kind: sanctRt.look.kind, ids: sanctRt.look.ids } : null, time: sanctRt.time,
        orcas: pod(sanctRt.orcas), belugas: pod(sanctRt.belugas),
        litter: sanctRt.litter.map((l) => ({ i: l.i, kind: l.kind, picked: l.picked >= 0 })), cleanupOn: sanctRt.cleanupOn
      };
    },
    sanctuaryTo(n: number) {
      startPreview("sanctuary");
      updateModel((m) => sanctuaryTo(m, n));
    },
    sanctuaryLook(kind: "breath" | "dive" | "together" | "family" | "spyhop" | "beluga", id = "kuro") {
      const cove = kind === "beluga";
      const m = (cove ? sanctRt.belugas : sanctRt.orcas)?.byId(id);
      if (!m) return false;
      sanctRt.look = { kind, ids: [id], x: m.x, y: 1, z: m.z, until: sanctRt.time + 30, cove };
      return true;
    },
    sanctuaryVisitor() {
      setGame({ areaWaiting: { area: "sanctuary", type: "child" } });
    },
    /** Ask a particular question now (tests then know the answer). */
    sanctuaryAsk(kind: SanctQuestionKind) {
      void startSanctActivity(kind);
    },
    lagoonAsk(kind: LagoonQuestion) {
      void startLagoonActivity(kind);
    },
    /** What a sanctuary question is about: the ringed animal and what the camera frames (island / boat for "where"). */
    sanctuaryFocus() {
      return { ...sanctFocus };
    },
    /** Screen position of a sanctuary thing: the Look! bubble, a piece of litter ("litter:2") or an animal. */
    sanctuaryWhere(what: string) {
      const O = SANCTUARY_ORIGIN;
      if (what === "look") {
        const l = sanctRt.look;
        if (!l) return null;
        const m = (l.cove ? sanctRt.belugas : sanctRt.orcas)?.byId(l.ids[0]);
        const y = rt.camera.pos.y < -0.1 ? Math.min(-1, (m?.y ?? -3) + 2) : 4 + (m?.len ?? 6) * 0.3;
        return project(O.x + (m?.x ?? l.x), y, O.z + (m?.z ?? l.z));
      }
      if (what.startsWith("litter:")) {
        const l = sanctRt.litter.find((x) => x.i === Number(what.slice(7)));
        return l ? project(O.x + l.x, 0.3, O.z + l.z) : null;
      }
      const m = sanctRt.orcas?.byId(what) ?? sanctRt.belugas?.byId(what);
      return m ? project(O.x + m.x, m.y, O.z + m.z) : null;
    },
    lagoonTo(n: number) {
      startPreview("lagoon");
      updateModel((m) => lagoonTo(m, n));
    },
    /** Show a Look! moment now (tests do not wait for a natural one), at a dolphin. */
    lagoonLook(kind: "pair" | "breath" | "dive" | "leap", id = "kai") {
      const m = lagoonRt.pod?.byId(id);
      if (!m) return false;
      lagoonRt.look = { kind, ids: [id], x: m.x, y: 1, z: m.z, until: lagoonRt.time + 30 };
      return true;
    },
    /** Review: start a dolphin trick now (returns the dolphin, or null if none has room), a bubble-ring pass, or a toy. */
    lagoonTrick(kind: TrickKind) {
      return forceTrick(kind);
    },
    lagoonRing(side = 1) {
      return forceRing(side);
    },
    lagoonToy(kind: "ball" | "kelp" | "bubbles") {
      dropToy(kind);
      return true;
    },
    /** Review: where a dolphin and the toy are now (area-local). */
    lagoonBody(id: string) {
      const m = lagoonRt.pod?.byId(id);
      return m ? { x: m.x, y: m.y, z: m.z, mode: m.mode, trick: m.trick?.kind ?? null, toy: lagoonRt.toy ? { x: lagoonRt.toy.x, y: lagoonRt.toy.y, z: lagoonRt.toy.z } : null, rings: lagoonRt.ringPasses, passes: lagoonRt.passes } : null;
    },
    /** A visitor with a question at the lagoon now. */
    lagoonVisitor() {
      setGame({ areaWaiting: { area: "lagoon", type: "child" } });
    },
    /** Screen position of a lagoon thing: the Look! bubble or a dolphin. */
    lagoonWhere(what: "look" | string) {
      if (what === "look") {
        const l = lagoonRt.look;
        if (!l) return null;
        const ms = l.ids.map((id) => lagoonRt.pod?.byId(id)).filter(Boolean);
        const x = ms.length ? ms[0]!.x : l.x, z = ms.length ? ms[0]!.z : l.z;
        const y = rt.camera.pos.y < -0.1 ? Math.min(-0.8, (ms[0]?.y ?? -2) + 1.3) : 2.2;
        return project(LAGOON_ORIGIN.x + x, y, LAGOON_ORIGIN.z + z);
      }
      const m = lagoonRt.pod?.byId(what);
      return m ? project(LAGOON_ORIGIN.x + m.x, m.y, LAGOON_ORIGIN.z + m.z) : null;
    },
    /** The coastal animals now (exhibit-local positions). */
    coast() {
      const g = getGame();
      return {
        open: Boolean(g.model.progress.coastOpen),
        milestone: g.model.progress.coast?.milestone ?? 0,
        progress: g.model.progress.coast ?? null,
        view: g.coastView,
        waiting: g.coastWaiting,
        activity: g.coastActivity,
        entries: { ...coastRt.entries },
        time: coastRt.time,
        motion: [...coastRt.animals.values()].map(({ habitat, m }) => ({
          id: m.id, habitat, heading: m.heading, pitch: m.pitch, speed: m.speed,
          target: m.path[0] ? { ...m.path[0] } : null,
          exit: m.exit ? { kind: m.exit.kind, ramp: m.exit.i } : null,
          feeding: m.feeding?.stage ?? null
          , rampNext: m.rampNext ?? -1, ledgeNext: m.ledgeNext ?? -1,
          island: m.island, ledge: m.ledge ?? -1, yieldingFor: m.blockedFor ?? 0
        })),
        animals: [...coastRt.animals.values()].map((a) => ({ id: a.m.id, habitat: a.habitat, mode: a.m.mode, area: a.m.area, x: a.m.x, y: a.m.y, z: a.m.z }))
      };
    },
    /** Bring a coastal visitor with a question to this habitat now. */
    coastVisitor(habitat: "penguins" | "seals" | "otters") {
      setGame({ coastWaiting: { habitat, type: "child" } });
    }
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
