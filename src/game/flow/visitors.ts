import { getGame, model, setGame, updateModel } from "../store";
import { clearGlow, effect, rt, type VisitorRt } from "../runtime";
import type { SlotId, Vec2, VisitorType } from "../types";
import { award, fishCount, happiness, helpVisitor, mood, tankById, tipFor, type TankRec } from "../logic/model";
import { makeRequest, matchesShow, requestLine, requestReward, stillValid, tankSatisfies, targetsIn, type Request, type ShowTarget } from "../logic/requests";
import { LIKE_COLOR_PHRASE, NUMBER_IDS, NUMBER_PHRASE, colorOfPhrase, type PhraseId } from "../logic/english";
import { makeRng, shuffle } from "../logic/rng";
import { SPECIES } from "../data/fish";
import { TANKS } from "../data/tanks";
import { BENCH_SEAT, ENTRY, OUTSIDE, lookSpot, tankOrigin } from "../world";
import { ask, fastMode, say, speak, wait } from "./ask";
import { openTank } from "./actions";
import { audio } from "../../audio/audio";
import type { ColorId } from "../types";

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

const WALK_SPEED: Record<VisitorType, number> = { child: 1.15, adult: 1.0, fan: 1.1, judge: 0.9 };
const arrivals = new Map<string, () => void>();

/** A visitor stops working the request (or the judge's step) and is free again. */
function syncWaiting() {
  const w = rt.visitors.find((v) => v.request && !v.helped && v.state === "sit" && !v.scripted);
  const cur = getGame().waiting;
  if ((w?.id ?? null) !== (cur?.id ?? null)) setGame({ waiting: w ? { id: w.id, type: w.type } : null });
}

export function spawnVisitor(type: VisitorType, request: Request | null, opts: { atBench?: boolean; scripted?: boolean } = {}): VisitorRt {
  const m = model();
  const id = `v${visitorNo++}`;
  const plan = m.tanks.filter((t) => t.fish.length > 0).map((t) => t.id);
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
    until: 0,
    plan: request || opts.scripted ? [] : plan,
    seen: [],
    at: null,
    request,
    helped: false,
    scripted: Boolean(opts.scripted),
    bubble: request ? "!" : null,
    bubbleT0: rt.time,
    anim: null,
    face: null,
    bornT: rt.time
  };
  if (opts.atBench) {
    v.x = BENCH_SEAT.x;
    v.z = BENCH_SEAT.z;
    v.state = "sit";
    v.face = { x: BENCH_SEAT.x - 3, z: BENCH_SEAT.z };
  } else if (request) {
    v.path = [ENTRY, BENCH_SEAT];
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
  v.path = [...path];
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
  return { x: o.x + side * (TANKS[t.type].w / 2 + 0.3), z: o.z + 1.25 };
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
  window.setTimeout(() => {
    if (v.state !== "look" || v.at !== tankId) return;
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
  const next = v.plan.shift();
  if (next && tankById(model(), next)) {
    const slot = tankSlot(next)!;
    v.state = "walk";
    v.at = next;
    v.path = [lookSpot(slot, visitorNo + v.seen.length)];
    return;
  }
  leave(v);
}

/** Pay the tips for every tank looked at, then walk out. */
export function leave(v: VisitorRt) {
  if (v.state === "leave" || v.state === "gone") return;
  if (!v.helped && !v.scripted) {
    const m = model();
    const tips = v.seen.reduce((n, id) => {
      const t = tankById(m, id);
      return n + (t ? tipFor(t) : 0);
    }, 0);
    if (tips > 0) {
      updateModel((mm) => award(mm, tips, `tip:${v.id}`));
      effect("coins", v.x, 1.9, v.z, tips);
      audio.play("coin");
    }
  }
  v.state = "leave";
  v.request = null;
  v.at = null;
  v.face = null;
  v.path = [ENTRY, OUTSIDE];
  syncWaiting();
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
    return;
  }
  if (v.request && !v.helped) {
    v.state = "sit";
    v.face = { x: v.x - 3, z: v.z };
    syncWaiting();
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
      if (v.face) {
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
    }
    if (v.bubble && v.bubble !== "!" && rt.time - v.bubbleT0 > 2.5) v.bubble = null;
  }
  if (rt.visitors.some((v) => v.state === "gone")) rt.visitors = rt.visitors.filter((v) => v.state !== "gone");
}

// ------------------------------------------------------------------ spawning

const TYPES: VisitorType[] = ["child", "adult", "fan"];

/** Visitors come only during ordinary play, while at least one fish is in a tank. */
export function visitorsTick(dt: number) {
  const g = getGame();
  const m = g.model;
  if (m.progress.tutorial !== "done" || scripted.busy || fishCount(m) === 0) return;
  if (g.mode === "busy" || g.stageCard) return;
  rt.spawnClock += dt;
  rt.sinceRequest += dt;
  if (rt.spawnClock < rt.nextSpawn) return;
  const active = rt.visitors.filter((v) => v.state !== "gone");
  if (active.length >= 3) return;
  rt.spawnClock = 0;
  rt.nextSpawn = fastMode() ? 3 : 18 + rand() * 10;
  const waiting = active.some((v) => v.request && !v.helped);
  let req: Request | null = null;
  if (!waiting) {
    const p = m.progress;
    const goalStage = !p.star && (p.stage === 3 || p.stage === 5);
    const chance = goalStage ? 0.5 : p.stage >= 2 ? 1 / 3 : 0;
    if ((goalStage && rt.sinceRequest > 45) || rand() < chance) req = makeRequest(m, rand, { last: lastKind });
  }
  if (req) rt.sinceRequest = 0;
  spawnVisitor(TYPES[Math.floor(rand() * TYPES.length)], req);
}

/** Scripted events (the judge, the photo day) stop ordinary visitors. */
export const scripted = { busy: false };

// ------------------------------------------------------------------ requests

interface ShowWait {
  visitorId: string;
  resolve: (r: { ok: boolean; tankId: string | null }) => void;
}

let showWait: ShowWait | null = null;

export type RequestOutcome = { ok: boolean; tankId: string | null };

function numbersAround(n: number): PhraseId[] {
  const lo = Math.max(1, Math.min(n - 1, 3));
  return [lo, lo + 1, lo + 2].map((k) => NUMBER_PHRASE[k]);
}

/** Run one request with its visitor. Resolves when helped (ok) or put off (not ok). */
export async function runRequest(v: VisitorRt, req: Request, opts: { cancellable: boolean }): Promise<RequestOutcome> {
  const line = requestLine(req);
  v.bubble = null;
  if (req.kind === "show") {
    v.state = "help";
    setGame({ request: { visitorId: v.id, by: v.type, req, line, misses: 0, status: "ready" }, panel: null, placing: null });
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
    v.state = "help";
    const spot = cornerSpot(t, -1);
    v.x = spot.x;
    v.z = spot.z;
    v.path = [];
    v.face = { x: tankOrigin(t.slot).x, z: tankOrigin(t.slot).z };
    const n = t.fish.length;
    const id = await ask({
      kind: "command",
      options: [NUMBER_PHRASE[n]],
      judge: NUMBER_IDS,
      frame: { before: "", after: " fish!", slots: NUMBER_IDS },
      choices: numbersAround(n),
      shuffle: false,
      question: { en: line, by: v.type },
      readQuestion: true,
      cancellable: opts.cancellable,
      help: "さかなは なんびき? かぞえて えいごで いおう",
      onClue: () => {
        rt.countGlow = { tankId: t.id, t0: rt.time };
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
  // chatColor: every colour is a good answer.
  v.state = "help";
  const all: PhraseId[] = Object.values(LIKE_COLOR_PHRASE);
  const id = await ask({
    kind: "choice",
    options: all,
    show: all,
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

const PHRASE_EN_NUMBER = ["", "One", "Two", "Three", "Four", "Five"];

/** The fish of a colour swim to the glass (a chat about colours has a visible answer). */
function showOffColor(color: ColorId) {
  for (const f of rt.fish.values()) if (SPECIES[f.species].color === color) f.showT0 = rt.time;
}

/** A fish or decoration was tapped while a "show me" request waits. Returns true if it was handled. */
export function answerShow(target: ShowTarget, tankId: string, ref: { fishId?: string; slot?: number }): boolean {
  const r = getGame().request;
  if (!r || r.req.kind !== "show" || r.status === "correct") return false;
  const req = r.req;
  if (matchesShow(req, target)) {
    setGame({ request: { ...r, status: "correct" }, nudge: null });
    audio.play("correct");
    if (ref.fishId) {
      // Every fish of that colour in the tank comes to the glass.
      for (const f of rt.fish.values()) if (f.tankId === tankId && SPECIES[f.species].color === req.color) f.showT0 = rt.time;
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
  const misses = r.misses + 1;
  audio.play("error");
  setGame({ request: { ...r, misses, status: "wrong" } });
  window.setTimeout(() => {
    const now = getGame().request;
    if (now && now.visitorId === r.visitorId && now.status === "wrong") setGame({ request: { ...now, status: "ready" } });
  }, 700);
  if (misses === 1) void speak(r.line, r.by, true);
  if (misses >= 3) glowAnswers(req);
  return true;
}

/** Third miss: the right tank (room view) and the right fish/decorations (close-up) glow. */
export function glowAnswers(req: Extract<Request, { kind: "show" }>) {
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
  setGame({ request: null });
  w.resolve({ ok: false, tankId: null });
}

/** Replay the request (🔊). */
export function replayRequest() {
  const r = getGame().request;
  if (r) void speak(r.line, r.by);
}

/** The visitor celebrates beside the tank in a three-quarter shot that shows both. */
export async function celebrate(v: VisitorRt, tankId: string | null) {
  v.bubble = "heart";
  v.bubbleT0 = rt.time;
  v.anim = { kind: "jump", t0: rt.time };
  audio.play("happy");
  const t = tankId ? tankById(model(), tankId) : null;
  if (t && getGame().view === "tank") {
    const o = tankOrigin(t.slot);
    const w = TANKS[t.type].w;
    const spot = cornerSpot(t, 1);
    v.x = spot.x;
    v.z = spot.z;
    v.path = [];
    v.face = { x: o.x, z: o.z };
    v.yaw = Math.atan2(o.x - spot.x, o.z - spot.z) + 0.6;
    // From the front-left: the fish at the glass, and the visitor at the
    // right corner turned toward us in three-quarter view.
    rt.camera.shot = {
      pos: { x: o.x - w * 0.15 - 0.9, y: 1.6, z: o.z + 4.1 },
      target: { x: o.x + w * 0.22, y: 1.1, z: o.z + 0.45 }
    };
    // The visitor turns to cheer toward the player.
    v.face = { x: rt.camera.shot.pos.x, z: rt.camera.shot.pos.z };
    effect("hearts", v.x, 1.9, v.z, 5);
    await wait(2600);
    rt.camera.shot = null;
  } else {
    effect("hearts", v.x, 1.9, v.z, 5);
    await wait(1400);
  }
}

/** Reward a helped request visitor (once), celebrate, and let them go. */
export async function helped(v: VisitorRt, req: Request, tankId: string | null) {
  const t = tankId ? tankById(model(), tankId) : null;
  const amount = requestReward(req, t);
  updateModel((m) => helpVisitor(m, v.id, amount));
  v.helped = true;
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

/** Tap on a waiting visitor (or the HUD chip): hear the request and help. */
export async function openRequest(id: string) {
  const g = getGame();
  if (g.mode !== "play" || g.request || g.prompt || g.placing || g.stageCard) return;
  const v = rt.visitors.find((x) => x.id === id);
  if (!v || !v.request || v.helped || v.state !== "sit") return;
  let req: Request | null = v.request;
  if (!stillValid(model(), req)) req = makeRequest(model(), rand, { last: null });
  if (!req) {
    v.request = null;
    await say(v.type, "What a nice aquarium!", "すてきな すいぞくかん!");
    leave(v);
    return;
  }
  v.request = req;
  setGame({ waiting: null });
  const out = await runRequest(v, req, { cancellable: true });
  if (out.ok) {
    await helped(v, req, out.tankId);
  } else if (!v.helped) {
    v.state = "sit";
    v.bubble = "!";
    v.x = BENCH_SEAT.x;
    v.z = BENCH_SEAT.z;
    v.face = { x: v.x - 3, z: v.z };
    syncWaiting();
  }
}

/** The things in a tank a tap could mean (for the "show me" ladder). */
export function showTargets(t: TankRec): ShowTarget[] {
  return targetsIn(t);
}

/** Clear visitors (new game / title). */
export function resetVisitors() {
  arrivals.clear();
  showWait = null;
  lastKind = null;
  setGame({ waiting: null });
}
