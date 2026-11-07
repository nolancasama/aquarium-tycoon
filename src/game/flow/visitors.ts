import { getGame, model, nudge, setGame, updateModel } from "../store";
import { beginCelebration, clearGlow, clearVisitorTapQueue, effect, endCelebration, resetCelebrations, rt, startCount, type VisitorRt } from "../runtime";
import type { SlotId, Vec2, VisitorType } from "../types";
import { award, EXPANSION_FROM, fishCount, happiness, helpVisitor, mood, tankById, tipBreakdown, type TankRec } from "../logic/model";
import { countableTanks, makeRequest, matchesShow, requestLine, requestReward, stillValid, tankSatisfies, targetsIn, type Request, type ShowTarget } from "../logic/requests";
import { IT_COLOR_IDS, IT_COLOR_PHRASE, ITS_IDS, ITS_IDS_BASE, ITS_PHRASE, LIKE_COLOR_PHRASE, NUMBER_IDS, NUMBER_PHRASE, colorOfPhrase, type PhraseId } from "../logic/english";
import { makeRng, shuffle } from "../logic/rng";
import { SPECIES } from "../data/fish";
import { SLOT_POS, STAND_H, TANKS } from "../data/tanks";
import { ROOM_OF, roomOpen } from "../data/rooms";
import { BENCH_FACING, BENCH_SEAT, ENTRY, OUTSIDE, REQUEST_SEAT, benchApproach, benchPose, hallOfX, lookSpot, reefLoop, requestEligible, route, seatApproach, seatById, seatExit, tankOrigin } from "../world";
import { planRest, restDuration } from "../logic/seating";
import { ask, fastMode, say, speak, wait } from "./ask";
import { openTank } from "./actions";
import { audio } from "../../audio/audio";
import { requestStep } from "../logic/requestGuide";
import type { ColorId } from "../types";
import { requestPattern } from "../logic/sentenceTeaching";
import { meetPattern } from "./meaning";
import { queuedVisitorTapState } from "../logic/visitorTap";
import { CROWD_CAP, CROWD_EXTRA, RUSH_QUESTIONS, RUSH_SECONDS } from "../rush/config";

/**
 * Visitors: they come in, look at each tank, react to how happy its fish are,
 * tip a little and leave. Some carry a request and wait on the bench (no
 * timer) until the student helps them.
 */

let rand = makeRng(777);
export function seedVisitors(seed: number) {
  rand = makeRng(seed);
}

let visitorNo = 1;
let lastKind: Request["kind"] | null = null;

const WALK_SPEED: Record<VisitorType, number> = { child: 1.15, adult: 1.0, fan: 1.1, grandma: 0.8, explorer: 1.05, judge: 0.9 };
/** Visitors who already said "Look! A turtle!" (once each), and when anyone last did. */
const exclaimed = new Set<string>();
let lastExclaim = -100;
const arrivals = new Map<string, () => void>();
let activeRequest: string | null = null;
/** Cosmetic poses and visitor locations are deliberately runtime-only. */
const crowdReactionAt = new Map<string, number>();
const rushQuestionVisitors = new Map<string, string>();
let crowdEvent: string | null = null;
let crowdSpawned = 0;
let nextCrowdAt = 0;
let offerPaid: readonly string[] | null = null;
let offerEvent: string | null = null;
let offerCount = 0;

/** A visitor stops working the request (or the judge's step) and is free again. */
function syncWaiting() {
  let w: VisitorRt | undefined;
  if (!activeRequest) for (const v of rt.visitors) if (visitorRequestAvailable(v)) { w = v; break; }
  const cur = getGame().waiting;
  if ((w?.id ?? null) !== (cur?.id ?? null)) setGame({ waiting: w ? { id: w.id, type: w.type } : null });
}

export function spawnVisitor(type: VisitorType, request: Request | null, opts: { atBench?: boolean; scripted?: boolean; cosmetic?: boolean } = {}): VisitorRt {
  const m = model();
  if (opts.cosmetic) request = null;
  const id = `v${visitorNo++}`;
  const plan = m.tanks.filter((t) => t.type !== "sharks" && t.fish.length > 0).map((t) => t.id);
  const v: VisitorRt = {
    id,
    type,
    x: OUTSIDE.x,
    z: OUTSIDE.z,
    yaw: Math.PI / 2,
    step: 0,
    moving: false,
    path: [],
    state: "walk",
    seat: 0,
    seatTarget: 0,
    until: 0,
    plan: request || opts.scripted ? [] : plan,
    seen: [],
    at: null,
    request,
    helped: false,
    scripted: Boolean(opts.scripted),
    cosmetic: Boolean(opts.cosmetic),
    bubble: request ? "!" : null,
    bubbleT0: rt.time,
    anim: null,
    face: null,
    bornT: rt.time
  };
  if (!request && !opts.scripted && !opts.cosmetic) v.restAfter = 1 + Math.floor(rand() * Math.max(1, plan.length));
  if (opts.atBench) {
    v.seatId = REQUEST_SEAT.id;
    v.x = BENCH_SEAT.x;
    v.z = BENCH_SEAT.z;
    v.state = "sit";
    v.seat = 1;
    v.seatTarget = 1;
    v.yaw = BENCH_FACING;
    v.face = { x: BENCH_SEAT.x - 3, z: BENCH_SEAT.z };
  } else if (request) {
    v.seatId = REQUEST_SEAT.id;
    v.path = [ENTRY, ...benchApproach(ENTRY)];
  } else if (!opts.scripted) {
    v.path = [ENTRY];
  } else {
    v.path = [ENTRY];
  }
  if (request) lastKind = request.kind;
  rt.visitors.push(v);
  audio.play("door");
  syncWaiting();
  return v;
}

/** Walk a visitor along `path`; resolves on arrival. */
export function walkTo(v: VisitorRt, path: Vec2[]): Promise<void> {
  const seat = seatById(v.seatId ?? v.poseSeatId);
  const seated = v.seat > 0 || v.seatTarget === 1;
  v.path = v.seatId && path.length
    ? [...seatExit(v, path[0], seat, seated), ...path.slice(1)] : [...path];
  if (v.seatId) v.poseSeatId = v.seatId;
  v.seatId = undefined;
  v.seatTarget = 0;
  v.face = null;
  return new Promise((resolve) => {
    if (!v.path.length) {
      resolve();
      return;
    }
    arrivals.set(v.id, resolve);
  });
}

function tankSlot(tankId: string): SlotId | null {
  return tankById(model(), tankId)?.slot ?? null;
}

/** Stand at the front corner of a tank (in a close-up the visitor is beside the glass, not in front of it). */
export function cornerSpot(t: TankRec, side: 1 | -1 = 1): Vec2 {
  const o = tankOrigin(t.slot);
  // In front of the rope (z −1.4), beside the glass.
  return { x: o.x + side * (TANKS[t.type].w / 2 + 0.3), z: o.z + (t.type === "reef" ? 1.9 : 1.25) };
}

function startLook(v: VisitorRt, tankId: string) {
  const slot = tankSlot(tankId);
  if (!slot) return;
  const o = tankOrigin(slot);
  v.state = "look";
  v.at = tankId;
  v.face = { x: o.x, z: o.z };
  v.until = rt.time + (fastMode() ? 0.8 : 4 + rand() * 2);
  if (!v.seen.includes(tankId)) v.seen.push(tankId);
  const t = tankById(model(), tankId);
  const md = t ? mood(happiness(t)) : "okay";
  if (v.cosmetic) {
    v.until = rt.time + 8 + rand() * 8;
    crowdReactionAt.set(v.id, rt.time + 0.6 + rand() * 1.8);
    return;
  }
  window.setTimeout(() => {
    if (v.state !== "look" || v.at !== tankId) return;
    // A sea animal is worth saying out loud (ambient English): "Look! A turtle!"
    const animal = t?.fish.find((f) => SPECIES[f.species].kind === "animal");
    const g = getGame();
    if (animal && !exclaimed.has(v.id) && rt.time - lastExclaim > 12 && !g.prompt && !g.line && g.screen === "game") {
      exclaimed.add(v.id);
      lastExclaim = rt.time;
      v.bubble = "wow";
      v.bubbleT0 = rt.time;
      v.anim = { kind: "jump", t0: rt.time };
      void speak(`Look! A ${SPECIES[animal.species].word}!`, v.type);
      return;
    }
    if (md === "happy") {
      v.bubble = "heart";
      v.anim = { kind: "jump", t0: rt.time };
      audio.play("wow");
    } else if (md === "sad") {
      v.bubble = "hmm";
      v.anim = { kind: "hmm", t0: rt.time };
      audio.play("hmm");
    } else {
      v.bubble = "wow";
      v.anim = { kind: "clap", t0: rt.time };
    }
    v.bubbleT0 = rt.time;
  }, fastMode() ? 100 : 900);
}

function nextLookOrLeave(v: VisitorRt) {
  if (!v.cosmetic && v.state === "look" && v.at && v.seen.length >= (v.restAfter ?? 1)) {
    const rest = planRest(v, hallOfX(v.x), v.plan.length === 0, rt.visitors, rand);
    if (rest.decided) v.restDecided = true;
    if (rest.seat) {
      v.seatId = rest.seat.id;
      v.poseSeatId = undefined;
      v.at = null;
      v.face = null;
      v.anim = null;
      v.state = "walk";
      v.path = seatApproach(v, rest.seat);
      return;
    }
  }
  // Finish standing and clear the approach before continuing the tour.
  const seat = v.seatId ? seatById(v.seatId) : null;
  const seated = v.seat > 0 || v.seatTarget === 1;
  if (seat) {
    v.poseSeatId = seat.id;
    v.seatId = undefined;
    v.seatTarget = 0;
  }
  // Crowd members keep touring until the event ends, without occupying the
  // ordinary visitors' seats. Shuffle once per tour, never every frame.
  if (v.cosmetic && !v.plan.length && model().rush?.phase === "rush") v.plan = crowdTankIds();
  const next = v.plan.shift();
  if (next && tankById(model(), next)) {
    const slot = tankSlot(next)!;
    v.state = "walk";
    v.at = next;
    const spot = lookSpot(slot, v.cosmetic ? Math.floor(rand() * CROWD_CAP) : visitorNo + v.seen.length);
    if (v.cosmetic) { spot.x += (rand() - 0.5) * 0.55; spot.z += rand() * 0.4; }
    const from = seat ? seat.approach : v;
    const onward = slot === "I" ? reefLoop(from, spot) : route(from, spot);
    v.path = seat ? [...(seated ? [seat.front] : []), seat.approach, ...onward] : onward;
    return;
  }
  // leave() needs the seat metadata to construct the same safe exit.
  if (seat) v.seatId = seat.id;
  leave(v);
}

/** Pay the tips for every tank looked at, then walk out. */
export function leave(v: VisitorRt) {
  if (v.state === "leave" || v.state === "gone") return;
  const seated = v.seat > 0 || v.seatTarget === 1;
  const seat = v.seatId || v.poseSeatId ? seatById(v.seatId ?? v.poseSeatId) : null;
  if (!v.helped && !v.scripted && !v.cosmetic) payTips(v);
  crowdReactionAt.delete(v.id);
  v.state = "leave";
  v.request = null;
  v.at = null;
  v.face = null;
  // Stand in front of the seat before walking, never through the seat/backrest.
  if (seated) v.seatTarget = 0;
  v.path = [...(seat ? seatExit(v, ENTRY, seat, seated) : route(v, ENTRY)), OUTSIDE];
  v.poseSeatId = seat?.id;
  v.seatId = undefined;
  syncWaiting();
}

/** A seated-out visitor's tips: one tag per tank (its own amount and mood), one total at the visitor. */
function payTips(v: VisitorRt) {
  if (v.cosmetic) return;
  const m = model();
  const parts = tipBreakdown(m, v.seen);
  const tips = parts.reduce((n, p) => n + p.tip, 0);
  if (tips <= 0) return;
  const before = m.coins;
  updateModel((mm) => award(mm, tips, `tip:${v.id}`));
  // The tags show exactly what reached the balance (a repeated payment adds nothing and shows nothing).
  if (model().coins - before !== tips) return;
  let first = Infinity;
  for (const p of parts) {
    const t = tankById(m, p.tankId);
    if (!t) continue;
    const o = SLOT_POS[t.slot];
    // Tags above one tank queue rather than stack when visitors leave together.
    const start = Math.max(rt.time, rt.tipLane.get(t.id) ?? 0);
    rt.tipLane.set(t.id, start + 0.8);
    first = Math.min(first, start - rt.time);
    effect("tip", o.x, STAND_H + TANKS[t.type].h + 0.85, o.z, p.tip, { tone: p.mood, delay: start - rt.time });
  }
  effect("coins", v.x, 1.9, v.z, tips);
  if (parts.length > 1) effect("tipTotal", v.x, 2.3, v.z, tips, { delay: first + 0.35 });
  audio.play("coin");
  rt.tipsPaid++;
  rt.tipsShownUntil = Math.max(rt.tipsShownUntil, rt.time + first + 2.4);
  // After Pico's lesson, now and then coach a sad tank (never more than every two minutes).
  if (m.progress.tipsTaught && parts.some((p) => p.mood === "sad") && rt.time - rt.lastCoachT > 120 && !getGame().nudge) {
    rt.lastCoachT = rt.time;
    nudge({ en: "Sad fish: only 1 coin. Make them happy!", ja: "えさや そうじで ハッピーに しよう！" }, 4500);
  }
}

function arrive(v: VisitorRt) {
  v.moving = false;
  const done = arrivals.get(v.id);
  if (done) {
    arrivals.delete(v.id);
    done();
    return;
  }
  if (v.scripted) return;
  if (v.state === "leave") {
    v.state = "gone";
    v.seatId = undefined;
    v.poseSeatId = undefined;
    return;
  }
  if (v.request && !v.helped) {
    v.seatId = REQUEST_SEAT.id;
    v.seatTarget = 1;
    v.face = { x: BENCH_SEAT.x - 3, z: BENCH_SEAT.z };
    syncWaiting();
    return;
  }
  if (v.seatId) {
    v.seatTarget = 1;
    v.face = null;
    return;
  }
  if (v.at) {
    startLook(v, v.at);
    return;
  }
  nextLookOrLeave(v);
}

/** Per-frame walking and looking. */
export function stepVisitors(dt: number) {
  const speedUp = fastMode() ? 4 : 1;
  for (const v of rt.visitors) {
    if (v.state === "gone") continue;
    if (v.cosmetic && v.state === "look" && rt.time >= (crowdReactionAt.get(v.id) ?? Infinity)) crowdReact(v);
    if (v.seat !== v.seatTarget) {
      // Turn at the spot in front of the seat, then sit back onto it over planted feet.
      const seat = seatById(v.seatId ?? v.poseSeatId);
      let turn = seat.facing - v.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      v.yaw += turn * Math.min(1, dt * 8);
      if (v.seat > 0 || Math.abs(turn) < 0.04) {
        v.seat += Math.sign(v.seatTarget - v.seat) * Math.min(Math.abs(v.seatTarget - v.seat), dt / 1.3);
        const pose = benchPose(v.seat, 0, seat);
        v.x = pose.x;
        v.z = pose.z;
      }
      v.moving = false;
      if (v.seat === 1) {
        v.state = "sit";
        v.yaw = seat.facing;
        if (!v.request && !v.scripted) {
          v.rested = true;
          v.restDecided = true;
          v.until = rt.time + restDuration(fastMode(), rand);
          v.seatedHeartAt = rt.time + 3 + rand() * 4;
          // Nearest tank, computed once on arrival rather than in the renderer.
          let nearest = Infinity;
          for (const tank of model().tanks) {
            const p = tankOrigin(tank.slot);
            const distance = Math.hypot(p.x - v.x, p.z - v.z);
            if (distance < nearest) { nearest = distance; v.face = { x: p.x, z: p.z }; }
          }
        }
      }
      if (v.seat === 0) v.poseSeatId = undefined;
      continue;
    }
    if (v.path.length) {
      const p = v.path[0];
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      const d = Math.hypot(dx, dz);
      const step = WALK_SPEED[v.type] * speedUp * dt;
      v.moving = true;
      if (d <= step) {
        v.x = p.x;
        v.z = p.z;
        v.path.shift();
        if (!v.path.length) arrive(v);
      } else {
        v.x += (dx / d) * step;
        v.z += (dz / d) * step;
        const want = Math.atan2(dx, dz);
        let a = want - v.yaw;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        v.yaw += a * Math.min(1, dt * 8);
      }
      v.step += dt * 9 * speedUp;
    } else {
      v.moving = false;
      if (v.face && v.seat === 0) {
        const want = Math.atan2(v.face.x - v.x, v.face.z - v.z);
        let a = want - v.yaw;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        v.yaw += a * Math.min(1, dt * 5);
      }
      if (v.state === "look" && rt.time > v.until) {
        v.bubble = null;
        nextLookOrLeave(v);
      }
      if (v.state === "sit" && !v.request && !v.scripted) {
        if (rt.time > v.until) { v.bubble = null; nextLookOrLeave(v); }
        else if (v.seatedHeartAt !== undefined && rt.time > v.seatedHeartAt) {
          v.bubble = "heart";
          v.bubbleT0 = rt.time;
          v.seatedHeartAt = rt.time + 7 + rand() * 5;
        }
      }
    }
    if (v.bubble && v.bubble !== "!" && rt.time - v.bubbleT0 > 2.5) v.bubble = null;
  }
  if (rt.visitors.some((v) => v.state === "gone")) rt.visitors = rt.visitors.filter((v) => v.state !== "gone");
  syncWaiting();
  flushVisitorTap();
}

// ------------------------------------------------------------------ spawning

const TYPES: VisitorType[] = ["child", "adult", "fan"];
/** Phase 2 adds grandma and the explorer. */
const MORE_TYPES: VisitorType[] = ["child", "adult", "fan", "grandma", "explorer"];

/** A varied tour across all open halls; the Shark Tunnel has its own people. */
function crowdTankIds(): string[] {
  const m = model();
  return shuffle(m.tanks.filter((t) => {
    if (t.type === "sharks" || !t.fish.length) return false;
    return roomOpen(ROOM_OF[t.slot], m.progress);
  }).map((t) => t.id), rand);
}

function crowdReact(v: VisitorRt) {
  const tank = v.at ? tankById(model(), v.at) : null;
  const popular = tank?.fish.some((f) => SPECIES[f.species].kind === "animal");
  const reaction = rand();
  const kind = reaction < 0.38 ? "point" : reaction < 0.76 ? "photo" : popular ? "jump" : "clap";
  v.anim = { kind, t0: rt.time };
  v.bubble = kind === "jump" ? "heart" : "wow";
  v.bubbleT0 = rt.time;
  crowdReactionAt.set(v.id, rt.time + 3 + rand() * 5);
  // Ambient cheers are staggered and quiet periods remain available for speech.
  const g = getGame();
  if (kind === "jump" && rt.time - lastExclaim > 12 && !g.prompt && !g.line && !rt.pico.talking && g.mode === "play") {
    lastExclaim = rt.time;
    audio.play("wow");
  }
}

function rushQuestionCount(eventId: string): number {
  const paid = model().paid;
  if (offerPaid === paid && offerEvent === eventId) return offerCount;
  let count = 0;
  for (let i = 1; i <= RUSH_QUESTIONS; i++) if (paid.includes(`${eventId}:question:${i}`)) count++;
  offerPaid = paid;
  offerEvent = eventId;
  offerCount = count;
  return count;
}

/** Requests that use this rush's budget stay tappable; other requests wait. */
export function visitorRequestAvailable(v: VisitorRt): boolean {
  if (v.cosmetic || !requestEligible(v)) return false;
  const rush = model().rush;
  if (rush?.phase === "results") return false;
  return rush?.phase !== "rush" || !rush.event || rushQuestionVisitors.get(v.id) === rush.event.id || rushQuestionCount(rush.event.id) < RUSH_QUESTIONS;
}

/** Reserve an offer before showing it, so reloads cannot offer it twice. */
function reserveRushQuestion(eventId: string): boolean {
  const m = model();
  for (let i = 1; i <= RUSH_QUESTIONS; i++) {
    const marker = `${eventId}:question:${i}`;
    if (m.paid.includes(marker)) continue;
    updateModel((mm) => mm.paid.includes(marker) ? mm : { ...mm, paid: [...mm.paid, marker].slice(-60) });
    return true;
  }
  return false;
}

function shortRushQuestion(): Request | null {
  const m = model();
  const counts = countableTanks(m).filter((t) => t.type !== "sharks");
  const animals = m.tanks.filter((t) => t.type !== "sharks" && t.fish.some((f) => SPECIES[f.species].kind === "animal"));
  if (animals.length && (!counts.length || rand() < 0.5)) {
    const tank = animals[Math.floor(rand() * animals.length)];
    const animal = tank.fish.find((f) => SPECIES[f.species].kind === "animal")!;
    return { kind: "whatsThis", tankId: tank.id, fishId: animal.id };
  }
  if (counts.length) return { kind: "count", tankId: counts[Math.floor(rand() * counts.length)].id };
  return m.tanks.some((t) => t.type !== "sharks" && t.fish.length) ? { kind: "chatLike" } : null;
}

/** Uses remaining active event time, rather than a second independent clock. */
function rushVisitorsTick() {
  const g = getGame();
  const rush = g.model.rush;
  if (rush?.phase !== "rush" || !rush.event) {
    if (crowdEvent !== null) {
      for (const v of rt.visitors) if (v.cosmetic) leave(v);
      crowdEvent = null;
      crowdSpawned = 0;
    }
    return;
  }
  const eventId = rush.event.id;
  if (crowdEvent !== eventId) {
    crowdEvent = eventId;
    crowdSpawned = 0;
    nextCrowdAt = RUSH_SECONDS - rush.event.remaining;
    rushQuestionVisitors.clear();
  }
  if (g.mode !== "play" || g.settingsOpen || g.stageCard || g.prompt || g.line || scripted.busy || rt.celebrations.size || rt.pico.talking) return;
  let total = 0;
  let ordinary = 0;
  let waiting = false;
  for (const v of rt.visitors) {
    if (v.state === "gone") continue;
    total++;
    if (!v.cosmetic) ordinary++;
    if (v.request && !v.helped) waiting = true;
  }
  const elapsed = RUSH_SECONDS - rush.event.remaining;
  if (elapsed >= nextCrowdAt && crowdSpawned < CROWD_EXTRA && total < CROWD_CAP) {
    const left = CROWD_EXTRA - crowdSpawned;
    const group = Math.min(left === 4 ? 2 : 2 + Math.floor(rand() * 2), left, CROWD_CAP - total);
    for (let i = 0; i < group; i++) {
      const v = spawnVisitor(i === 0 ? "adult" : "child", null, { cosmetic: true });
      v.plan = crowdTankIds();
      v.x += (i - 1) * 0.32;
      v.z -= rand() * 0.8;
      v.step = rand() * Math.PI * 2;
      crowdSpawned++;
      total++;
    }
    nextCrowdAt = elapsed + RUSH_SECONDS / CROWD_EXTRA;
  }
  const offered = rushQuestionCount(eventId);
  if (!waiting && ordinary < (g.model.progress.tickets ? 4 : 3) && total < CROWD_CAP && offered < RUSH_QUESTIONS &&
      elapsed >= (offered + 1) * RUSH_SECONDS / (RUSH_QUESTIONS + 1)) {
    const request = shortRushQuestion();
    if (request && reserveRushQuestion(eventId)) {
      const v = spawnVisitor(rand() < 0.5 ? "adult" : "child", request);
      rushQuestionVisitors.set(v.id, eventId);
      rt.sinceRequest = 0;
    }
  }
}

/** Visitors come only during ordinary play, while at least one fish is in a tank. */
export function visitorsTick(dt: number) {
  rushVisitorsTick();
  const g = getGame();
  const m = g.model;
  if (m.progress.tutorial !== "done" || scripted.busy || fishCount(m) === 0) return;
  if (g.mode === "busy" || g.stageCard || m.rush?.phase === "results") return;
  rt.spawnClock += dt;
  rt.sinceRequest += dt;
  if (rt.spawnClock < rt.nextSpawn) return;
  const active = rt.visitors.filter((v) => v.state !== "gone" && !v.cosmetic);
  // The ticket gate: up to 4 visitors, arriving more often.
  const tickets = m.progress.tickets;
  if (active.length >= (tickets ? 4 : 3)) return;
  if (m.rush?.phase === "rush" && rt.visitors.length >= CROWD_CAP) return;
  rt.spawnClock = 0;
  rt.nextSpawn = fastMode() ? 3 : tickets ? 14 + rand() * 8 : 18 + rand() * 10;
  const waiting = active.some((v) => v.request && !v.helped);
  let req: Request | null = null;
  if (!waiting && m.rush?.phase !== "rush") {
    const p = m.progress;
    const goalStage = (!p.star && (p.stage === 3 || p.stage === 5)) || (p.stage >= 6 && !p.superStar);
    const chance = goalStage ? 0.5 : p.stage >= 2 ? 1 / 3 : 0;
    if ((goalStage && rt.sinceRequest > 45) || rand() < chance) req = makeRequest(m, rand, { last: lastKind });
  }
  if (req) rt.sinceRequest = 0;
  const types = m.progress.stage >= 6 ? MORE_TYPES : TYPES;
  spawnVisitor(types[Math.floor(rand() * types.length)], req);
}

/** Scripted events (the judge, the photo day) stop ordinary visitors. */
export const scripted = { busy: false };

// ------------------------------------------------------------------ requests

interface ShowWait {
  visitorId: string;
  resolve: (r: { ok: boolean; tankId: string | null }) => void;
}

let showWait: ShowWait | null = null;
let requestQuiet = 0;
let requestView = "";

/** Keep the existing glow targets in sync with the same derived request step. */
function syncRequestGuidance() {
  const g = getGame();
  const step = requestStep({ request: g.request, view: g.view, tankId: g.tankId, model: g.model });
  clearGlow();
  if (!step) return;
  for (const id of step.tankIds) rt.glow.tanks.add(id);
  for (const id of step.fishIds) rt.glow.fish.add(id);
  for (const id of step.decorIds) rt.glow.decor.add(id);
}

/** The request's existing ladder gains only a tank clue after quiet play. */
export function requestGuidanceTick(dt: number) {
  const g = getGame();
  if (!g.request || g.request.status === "correct") { requestQuiet = 0; requestView = ""; return; }
  const key = `${g.request.visitorId}:${g.view}:${g.tankId}:${g.request.misses}`;
  if (key !== requestView) { requestQuiet = 0; requestView = key; syncRequestGuidance(); }
  if (g.mode !== "play" || g.settingsOpen || g.prompt || g.line || g.stageCard) return;
  requestQuiet += dt;
  if (requestQuiet < 20 || g.request.idleHint) return;
  requestQuiet = 0;
  setGame({ request: { ...g.request, idleHint: true } });
  syncRequestGuidance();
}

export type RequestOutcome = { ok: boolean; tankId: string | null };

/** Three number words around the answer (Tap mode), never past ten. */
export function numbersAround(n: number): PhraseId[] {
  const lo = Math.max(1, Math.min(n - 1, 8));
  return [lo, lo + 1, lo + 2].map((k) => NUMBER_PHRASE[k]);
}

/** The number words shown in Speak mode: one to five, or further for a big count. */
export function numberSlots(n: number): PhraseId[] {
  return NUMBER_IDS.slice(0, Math.max(5, Math.min(10, n + 2)));
}

/** One matching colour and two different colours, in a fresh order. */
export function whatColorChoices(color: ColorId, random: () => number = rand): PhraseId[] {
  const answer = IT_COLOR_PHRASE[color];
  const others = shuffle(IT_COLOR_IDS.filter((id) => id !== answer), random).slice(0, 2);
  return shuffle([answer, ...others], random);
}

/** Run one request with its visitor. Resolves when helped (ok) or put off (not ok). */
export async function runRequest(v: VisitorRt, req: Request, opts: { cancellable: boolean }): Promise<RequestOutcome> {
  if (v.cosmetic) return { ok: false, tankId: null };
  const line = requestLine(req);
  v.bubble = null;
  if (req.kind === "whatsThis" || req.kind === "whatColor") {
    const t = tankById(model(), req.tankId);
    const f = t?.fish.find((x) => x.id === req.fishId);
    if (!t || !f) return { ok: false, tankId: null };
    openTank(t.id);
    const spot = cornerSpot(t, -1);
    // Close-up questions use a camera cut to place the visitor beside the tank.
    v.seat = 0;
    v.seatTarget = 0;
    v.seatId = undefined;
    v.poseSeatId = undefined;
    v.state = "help";
    v.x = spot.x;
    v.z = spot.z;
    v.path = [];
    v.face = { x: tankOrigin(t.slot).x, z: tankOrigin(t.slot).z };
    // The animal glows: that is "this".
    rt.glow.fish.add(f.id);
    const colorQuestion = req.kind === "whatColor";
    const answer = colorQuestion ? IT_COLOR_PHRASE[SPECIES[f.species].color] : ITS_PHRASE[f.species];
    const animalAnswers = model().progress.stage >= EXPANSION_FROM ? ITS_IDS : ITS_IDS_BASE;
    // Shown in a shuffled order: the right sentence is not always first.
    const three = colorQuestion
      ? whatColorChoices(SPECIES[f.species].color)
      : shuffle([answer, ...shuffle(animalAnswers.filter((p) => p !== answer), rand).slice(0, 2)], rand);
    const id = await ask({
      pattern: requestPattern(req),
      kind: "command",
      options: [answer],
      judge: colorQuestion ? IT_COLOR_IDS : ITS_IDS,
      show: three,
      choices: three,
      question: { en: line, by: v.type },
      readQuestion: true,
      cancellable: opts.cancellable,
      help: colorQuestion ? "ひかっている いきものは なにいろ? えいごで いおう" : "ひかっている いきものは なに? えいごで いおう"
    });
    rt.glow.fish.delete(f.id);
    if (!id) return { ok: false, tankId: null };
    const animal = SPECIES[f.species];
    await say(v.type, colorQuestion ? `It's ${animal.color}!` : `${/^[aeiou]/i.test(animal.word) ? "An" : "A"} ${animal.word}! I like ${animal.plural}!`, "ありがとう!");
    return { ok: true, tankId: t.id };
  }
  if (req.kind === "show" || req.kind === "showAnimal") {
    v.state = "help";
    requestQuiet = 0;
    requestView = "";
    clearGlow();
    setGame({ request: { ...meetPattern(requestPattern(req)), visitorId: v.id, by: v.type, req, line, misses: 0, status: "ready" }, panel: null, placing: null, guide: null, nudge: null });
    rt.slowFish = true;
    void speak(line, v.type);
    return new Promise((resolve) => {
      showWait = { visitorId: v.id, resolve };
    });
  }
  if (req.kind === "count") {
    const t = tankById(model(), req.tankId);
    if (!t) return { ok: false, tankId: null };
    openTank(t.id);
    const spot = cornerSpot(t, -1);
    // Close-up questions use a camera cut to place the visitor beside the tank.
    v.seat = 0;
    v.seatTarget = 0;
    v.seatId = undefined;
    v.poseSeatId = undefined;
    v.state = "help";
    v.x = spot.x;
    v.z = spot.z;
    v.path = [];
    v.face = { x: tankOrigin(t.slot).x, z: tankOrigin(t.slot).z };
    const n = startCount(t.id, t.fish).numbers.length;
    if (!n) { rt.countGlow = null; return { ok: false, tankId: null }; }
    const id = await ask({
      pattern: requestPattern(req),
      kind: "command",
      options: [NUMBER_PHRASE[n]],
      judge: NUMBER_IDS,
      frame: { before: "", after: " fish!", slots: numberSlots(n) },
      choices: numbersAround(n),
      shuffle: false,
      question: { en: line, by: v.type },
      readQuestion: true,
      cancellable: opts.cancellable,
      help: "さかなは なんびき? かぞえて えいごで いおう",
      onClue: () => {
        startCount(t.id, t.fish);
      }
    });
    rt.countGlow = null;
    if (!id) return { ok: false, tankId: null };
    await say(v.type, `${PHRASE_EN_NUMBER[n]} fish! Wow!`, "ありがとう!");
    return { ok: true, tankId: t.id };
  }
  if (req.kind === "chatLike") {
    v.state = "help";
    const id = await ask({
      pattern: requestPattern(req),
      kind: "choice",
      options: ["yesIDo", "noIDont"],
      question: { en: line, by: v.type },
      readQuestion: true,
      cancellable: opts.cancellable,
      help: "こたえよう!"
    });
    if (!id) return { ok: false, tankId: null };
    await say(v.type, id === "yesIDo" ? "Me too!" : "Oh! Look! They are so cute!", id === "yesIDo" ? "わたしも!" : "みて! かわいいよ!");
    return { ok: true, tankId: null };
  }
  // chatColor: every colour is a good answer ("I like ___." with the colour words).
  v.state = "help";
  const basic: PhraseId[] = ["likeRed", "likeBlue", "likeYellow", "likeGreen", "likeOrange"];
  const all: PhraseId[] = model().progress.stage >= 6 ? Object.values(LIKE_COLOR_PHRASE) : basic;
  const id = await ask({
    pattern: requestPattern(req),
    kind: "choice",
    options: all,
    frame: { before: "I like", after: ".", slots: all },
    choices: shuffle(all, rand).slice(0, 3),
    question: { en: line, by: v.type },
    readQuestion: true,
    cancellable: opts.cancellable,
    help: "すきな いろを えいごで いおう"
  });
  if (!id) return { ok: false, tankId: null };
  const color = colorOfPhrase(id)!;
  showOffColor(color);
  await say(v.type, `Me too! I like ${color}!`, "わたしも!");
  return { ok: true, tankId: null };
}

const PHRASE_EN_NUMBER = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** The fish of a colour swim to the glass (a chat about colours has a visible answer). */
function showOffColor(color: ColorId) {
  for (const f of rt.fish.values()) if (SPECIES[f.species].color === color) f.showT0 = rt.time;
}

/** A fish or decoration was tapped while a "show me" request waits. Returns true if it was handled. */
export function answerShow(target: ShowTarget, tankId: string, ref: { fishId?: string; slot?: number }): boolean {
  const r = getGame().request;
  if (!r || (r.req.kind !== "show" && r.req.kind !== "showAnimal") || r.status === "correct") return false;
  const req = r.req;
  if (matchesShow(req, target)) {
    setGame({ request: { ...r, status: "correct" }, nudge: null, guide: null });
    audio.play("correct");
    if (ref.fishId) {
      // Every animal the visitor asked for in that tank comes to the glass.
      for (const f of rt.fish.values()) {
        if (f.tankId === tankId && matchesShow(req, { type: "fish", species: f.species })) f.showT0 = rt.time;
      }
    }
    rt.slowFish = false;
    clearGlow();
    const w = showWait;
    showWait = null;
    w?.resolve({ ok: true, tankId });
    // The banner shows its tick for a moment, then goes (the judge never calls helped()).
    window.setTimeout(() => {
      const now = getGame().request;
      if (now && now.visitorId === r.visitorId && now.status === "correct") setGame({ request: null });
    }, fastMode() ? 60 : 1200);
    return true;
  }
  wrongRequestTap();
  return true;
}

/** A wrong tank and a wrong object advance exactly the same miss ladder. */
function wrongRequestTap() {
  const r = getGame().request;
  if (!r || r.status === "correct") return;
  requestQuiet = 0;
  const misses = r.misses + 1;
  audio.play("error");
  setGame({ request: { ...r, misses, status: "wrong" } });
  window.setTimeout(() => {
    const now = getGame().request;
    if (now && now.visitorId === r.visitorId && now.status === "wrong") setGame({ request: { ...now, status: "ready" } });
  }, 700);
  if (misses === 1) void speak(r.line, r.by, true);
  syncRequestGuidance();
}

/** Inspect the tank just tapped, while retaining free navigation between tanks. */
export function inspectRequestTank(tankId: string) {
  requestQuiet = 0;
  const r = getGame().request;
  const t = tankById(model(), tankId);
  if (!r || !t || r.status === "correct" || (r.req.kind !== "show" && r.req.kind !== "showAnimal")) return;
  if (!tankSatisfies(r.req, t)) wrongRequestTap();
}

/** Third miss: the right tank (room view) and the right fish/decorations (close-up) glow. */
export function glowAnswers(req: Extract<Request, { kind: "show" | "showAnimal" }>) {
  const m = model();
  clearGlow();
  for (const t of m.tanks) {
    if (!tankSatisfies(req, t)) continue;
    rt.glow.tanks.add(t.id);
    for (const f of t.fish) if (matchesShow(req, { type: "fish", species: f.species })) rt.glow.fish.add(f.id);
    for (const d of t.decor) if (matchesShow(req, { type: "decor", kind: d.kind, variant: d.variant })) rt.glow.decor.add(`${t.id}:${d.slot}`);
  }
}

/** Put a "show me" request off (✖): the visitor sits down again. */
export function cancelShow() {
  const r = getGame().request;
  if (!r || r.status === "correct") return;
  const w = showWait;
  if (!w) return;
  showWait = null;
  rt.slowFish = false;
  clearGlow();
  setGame({ request: null, guide: null, nudge: null });
  w.resolve({ ok: false, tankId: null });
}

/** Replay the request (🔊). */
export function replayRequest() {
  requestQuiet = 0;
  const r = getGame().request;
  if (r) void speak(r.line, r.by);
}

/** The visitor celebrates beside the tank in a three-quarter shot that shows both. */
export async function celebrate(v: VisitorRt, tankId: string | null) {
  const token = beginCelebration();
  let shot: typeof rt.camera.shot = null;
  try {
  v.bubble = "heart";
  v.bubbleT0 = rt.time;
  v.anim = { kind: "jump", t0: rt.time };
  audio.play("happy");
  const t = tankId ? tankById(model(), tankId) : null;
  if (t && getGame().view === "tank") {
    const o = tankOrigin(t.slot);
    const w = TANKS[t.type].w;
    const spot = cornerSpot(t, 1);
    // The close-up celebration is a camera cut; finish any bench pose there.
    v.seat = 0;
    v.seatTarget = 0;
    v.seatId = undefined;
    v.poseSeatId = undefined;
    v.state = "help";
    v.x = spot.x;
    v.z = spot.z;
    v.path = [];
    v.face = { x: o.x, z: o.z };
    v.yaw = Math.atan2(o.x - spot.x, o.z - spot.z) + 0.6;
    // From the front-left: the fish at the glass, and the visitor at the
    // right corner turned toward us in three-quarter view.
    rt.camera.shot = shot = {
      pos: { x: o.x - w * 0.15 - 0.9, y: 1.6, z: o.z + 4.1 },
      target: { x: o.x + w * 0.22, y: 1.1, z: o.z + 0.45 }
    };
    // The visitor turns to cheer toward the player.
    v.face = { x: rt.camera.shot.pos.x, z: rt.camera.shot.pos.z };
    effect("hearts", v.x, 1.9, v.z, 5);
    await wait(2600);
  } else {
    effect("hearts", v.x, 1.9, v.z, 5);
    await wait(1400);
  }
  } finally {
    // An older celebration must not clear a newer celebration's camera cut.
    if (shot && rt.camera.shot === shot) rt.camera.shot = null;
    endCelebration(token);
  }
}

/** Reward a helped request visitor (once), celebrate, and let them go. */
export async function helped(v: VisitorRt, req: Request, tankId: string | null) {
  if (v.helped || v.cosmetic) return;
  v.helped = true;
  const t = tankId ? tankById(model(), tankId) : null;
  const amount = requestReward(req, t);
  updateModel((m) => helpVisitor(m, v.id, amount, req.kind === "whatsThis"));
  effect("coins", v.x, 2, v.z, Math.min(6, Math.round(amount / 3)));
  audio.play("coin");
  rt.sinceRequest = 0;
  setGame({ request: null });
  await celebrate(v, tankId);
  if (!v.scripted) {
    v.request = null;
    leave(v);
  }
}

/** Tap an eligible walking or seated visitor (or the HUD chip). */
export async function openRequest(id: string) {
  const g = getGame();
  const tutorial = g.model.progress.tutorial === "visitor";
  if (g.screen !== "game" || activeRequest || (scripted.busy && !tutorial) || g.request || g.prompt || g.placing || g.stageCard || g.settingsOpen || g.fade > 0 || g.mode === "ask" || g.model.rush?.phase === "results") return;
  const v = rt.visitors.find((x) => x.id === id);
  if (!v || !v.request || !visitorRequestAvailable(v)) return;
  acknowledgeVisitorTap(v);
  if (g.mode !== "play" || g.line || rt.pico.talking || rt.camera.shot) {
    rt.pendingVisitorTap = { visitorId: v.id, queuedAt: rt.time, screen: g.screen, hall: g.hall };
    return;
  }
  rt.pendingVisitorTap = null;
  const rush = model().rush;
  if (rush?.phase === "rush" && rush.event && rushQuestionVisitors.get(v.id) !== rush.event.id) {
    if (!reserveRushQuestion(rush.event.id)) return;
    rushQuestionVisitors.set(v.id, rush.event.id);
  }
  activeRequest = v.id;
  // Get up forward if seated; a walking visitor stops exactly where tapped.
  const seated = v.seat > 0 || v.seatTarget === 1;
  if (seated) v.seatTarget = 0;
  v.state = "help";
  v.path = [];
  v.moving = false;
  v.face = { x: rt.camera.pos.x, z: rt.camera.pos.z };
  if (!seated) v.yaw = Math.atan2(v.face.x - v.x, v.face.z - v.z);
  setGame({ waiting: null, guide: null, nudge: null });
  try {
    let req: Request | null = v.request;
    if (!stillValid(model(), req)) req = makeRequest(model(), rand, { last: null });
    if (!req) {
      v.request = null;
      await say(v.type, "What a nice aquarium!", "すてきな すいぞくかん!");
      leave(v);
      return;
    }
    v.request = req;
    const out = await runRequest(v, req, { cancellable: !tutorial });
    if (out.ok) await helped(v, req, out.tankId);
  } finally {
    if (activeRequest === v.id) activeRequest = null;
    if (!v.helped && v.request && v.state === "help") {
      v.state = "walk";
      v.face = null;
      v.bubble = "!";
      v.path = benchApproach(v);
      v.seatId = REQUEST_SEAT.id;
    }
    syncWaiting();
  }
}

function acknowledgeVisitorTap(v: VisitorRt) {
  rt.visitorTapAck = { id: v.id, t0: rt.time };
  rt.glow.visitors.delete(v.id);
  rt.idle = 0;
  audio.play("tick");
  setGame({ guide: null, nudge: null });
}

/** Called by the existing visitor frame step; no timer or React updates while waiting. */
export function flushVisitorTap() {
  const pending = rt.pendingVisitorTap;
  if (!pending) return;
  const g = getGame();
  const v = rt.visitors.find((x) => x.id === pending.visitorId);
  const state = queuedVisitorTapState(pending, rt.time, g, v, {
    activeRequest: Boolean(activeRequest),
    scriptedBusy: scripted.busy && g.model.progress.tutorial !== "visitor",
    cameraMoving: Boolean(rt.camera.shot),
    picoTalking: rt.pico.talking
  });
  if (state === "wait") return;
  rt.pendingVisitorTap = null;
  if (state === "open") void openRequest(pending.visitorId);
}

/** The things in a tank a tap could mean (for the "show me" ladder). */
export function showTargets(t: TankRec): ShowTarget[] {
  return targetsIn(t);
}

/** Clear visitors (new game / title). */
export function resetVisitors() {
  clearVisitorTapQueue();
  rt.glow.visitors.clear();
  resetCelebrations();
  activeRequest = null;
  arrivals.clear();
  exclaimed.clear();
  showWait = null;
  lastKind = null;
  crowdReactionAt.clear();
  rushQuestionVisitors.clear();
  crowdEvent = null;
  crowdSpawned = 0;
  nextCrowdAt = 0;
  offerPaid = null;
  offerEvent = null;
  offerCount = 0;
  setGame({ waiting: null });
}
