import { rt, effect } from "../runtime";
import { getGame, model, nudge, setGame, updateModel, type TunnelActivityUi } from "../store";
import { ask, say, speak } from "../flow/ask";
import { audio } from "../../audio/audio";
import { checkTunnelMilestones, recordTunnelActivity } from "../logic/tunnel";
import { SHARK_NUMBER_IDS, SHARK_NUMBER_PHRASE, type PhraseId } from "../logic/english";
import { CHAMBER, sectionAt, walkwayFrame } from "../data/sharkTunnel";
import type { VisitorType } from "../types";
import { tunnelRuntime, type AnimalPose, type TunnelSpecies } from "./contract";
import { loopDelta, playerWorld } from "./explore";
import { personWorld, tunnelPeople } from "./tunnelVisitors";

/**
 * English activities in the Shark Tunnel. Visitors ask (and Pico asks at the
 * viewing spots, and on the final tour). Everything works by tapping; speech
 * is optional through the usual ask() prompt. Nothing depends on timing: the
 * asked-about animal is attracted to the player by ordinary swimming, and a
 * location question waits for a clear position, then holds the animal there.
 *
 * Kinds:
 *  find  "Where is the shark?"  — tap the shark (or "Find a ray!")
 *  show  "Look at the big shark!" — tap the zebra shark (both sharks present)
 *  where "Where is the shark?"  — It's above me! / It's by me!
 *  can   "Can it swim?" / "Can it walk?" — Yes, it can! / No, it can't!
 *  count "How many sharks?"     — One shark! .. Six sharks! (every shark is numbered)
 */

export type TunnelActKind = TunnelActivityUi["kind"];
type Target = "shark" | "ray" | "bigshark";

const SHARKS: TunnelSpecies[] = ["blacktip", "zebrashark"];
const isShark = (s: TunnelSpecies) => s !== "eagleray";

let activityNo = 1;
let nextRequestAt = 0;
let nextPicoAt = 0;
/** The live activity (runtime detail beyond the UI card). */
let live: null | {
  ui: TunnelActivityUi;
  visitorId: string | null;
  target: Target;
  t0: number;
  /** The animal being attracted / held / asked about. */
  animalId: string | null;
  tour: boolean;
  resolve: (ok: boolean) => void;
} = null;

export function activityActive(): boolean {
  return live !== null;
}

/** Every visible shark's number tag while a count question is open (read by the HUD). */
export const countTags: { on: boolean } = { on: false };

function poses(): readonly AnimalPose[] {
  return tunnelRuntime.swim?.poses() ?? [];
}

function present(): { sharks: number; rays: number; species: Set<TunnelSpecies> } {
  const p = poses();
  const species = new Set(p.map((a) => a.species));
  return { sharks: p.filter((a) => isShark(a.species)).length, rays: p.filter((a) => a.species === "eagleray").length, species };
}

function matches(target: Target, s: TunnelSpecies): boolean {
  return target === "ray" ? s === "eagleray" : target === "bigshark" ? s === "zebrashark" : isShark(s);
}

/** Where an animal is relative to the player, for the location question (null: not clear). */
export function locate(a: AnimalPose): "above" | "by" | null {
  const p = playerWorld(), f = walkwayFrame(rt.explore.s);
  const d = Math.hypot(a.x - p.x, a.z - p.z);
  const ay = a.y - (a.restDrop ?? 0);
  // Above: over the crown, within the tube's width of the player.
  if (d < f.halfWidth + 0.6 && ay > f.height + 0.45) return "above";
  // By: outside the glass beside the player, roughly at walking height, close.
  const lateral = Math.abs((a.x - f.x) * -f.dz + (a.z - f.z) * f.dx);
  const along = Math.abs((a.x - f.x) * f.dx + (a.z - f.z) * f.dz);
  if (lateral > f.halfWidth + 0.3 && lateral < f.halfWidth + 4 && along < 3.5 && ay < 2.6) return "by";
  return null;
}

function nearestMatch(target: Target): AnimalPose | null {
  const p = playerWorld();
  let best: AnimalPose | null = null, bd = Infinity;
  for (const a of poses()) {
    if (!matches(target, a.species)) continue;
    const d = Math.hypot(a.x - p.x, a.y - 2, a.z - p.z);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** Bring the animal over the player's stretch of tunnel by ordinary swimming. */
function callOver(a: AnimalPose, where: "above" | "by" = "above") {
  const p = playerWorld(), f = walkwayFrame(rt.explore.s);
  const point = where === "above"
    ? { x: p.x + f.dx * 2, y: f.height + 2.2, z: p.z + f.dz * 2 }
    : { x: f.x - f.dz * (f.halfWidth + 2), y: 1.6, z: f.z + f.dx * (f.halfWidth + 2) };
  tunnelRuntime.swim?.attract(a.id, point, 22);
}

const QUESTION: Record<Target, { en: string; ja: string }> = {
  shark: { en: "Where is the shark?", ja: "サメは どこ？" },
  ray: { en: "Find a ray!", ja: "エイを さがして！" },
  bigshark: { en: "Look at the big shark!", ja: "おおきな サメを みて！" }
};
const TODO: Record<Target, { en: string; ja: string }> = {
  shark: { en: "Tap the shark!", ja: "サメを タップ！" },
  ray: { en: "Tap the ray!", ja: "エイを タップ！" },
  bigshark: { en: "Tap the big shark!", ja: "おおきな サメを タップ！" }
};

function setUi(patch: Partial<TunnelActivityUi>) {
  if (!live) return;
  live.ui = { ...live.ui, ...patch };
  setGame({ tunnelActivity: live.ui });
}

function finish(ok: boolean) {
  if (!live) return;
  const l = live;
  live = null;
  countTags.on = false;
  rt.explore.frame = null;
  setGame({ tunnelActivity: null });
  const v = l.visitorId ? tunnelPeople.find((p) => p.id === l.visitorId) : null;
  if (v) { v.request = null; v.stopUntil = rt.time + 1.5; }
  l.resolve(ok);
}

/** Record a success: counters, milestones (rewards), a small celebration. */
async function succeed(kind: TunnelActKind, byVisitor: boolean, by: VisitorType | "pico") {
  const before = model().progress.tunnel?.milestone ?? 0;
  updateModel((m) => recordTunnelActivity(m, kind, byVisitor));
  const p = playerWorld();
  effect("sparkle", p.x, 2.2, p.z, 8);
  audio.play("correct");
  const thanks = by === "pico" ? { en: "Great job!", ja: "すごいね！" } : { en: "Thank you!", ja: "ありがとう！" };
  await say(by, thanks.en, thanks.ja);
  const after = model().progress.tunnel?.milestone ?? 0;
  if (after > before) celebrateMilestones(before, after);
}

/** Milestone reached: a card, confetti, and for the last one the trophy and every animal overhead. */
export function celebrateMilestones(before: number, after: number) {
  for (let m = before + 1; m <= after; m++) setGame({ tunnelCelebration: { milestone: m } });
  audio.play(after >= 5 ? "trophy" : "happy");
  const p = rt.explore.active ? playerWorld() : { x: CHAMBER.x, z: CHAMBER.z };
  effect("confetti", p.x, 3, p.z, 30);
  if (after >= 5) for (const a of poses()) tunnelRuntime.swim?.attract(a.id, { x: CHAMBER.x, y: 6, z: CHAMBER.z }, 20);
}

// ------------------------------------------------------------------ requests

/** Choose what to ask, from what lives in the habitat. */
function chooseKind(rand: () => number): { kind: TunnelActKind; target: Target } | null {
  const { sharks, rays, species } = present();
  if (!sharks && !rays) return null;
  const options: Array<{ kind: TunnelActKind; target: Target; w: number }> = [];
  if (sharks) options.push({ kind: "find", target: "shark", w: 3 }, { kind: "where", target: "shark", w: 2.5 }, { kind: "count", target: "shark", w: 1.5 });
  if (rays) options.push({ kind: "find", target: "ray", w: 2 });
  if (species.has("blacktip") && species.has("zebrashark")) options.push({ kind: "show", target: "bigshark", w: 1.5 });
  options.push({ kind: "can", target: sharks ? "shark" : "ray", w: 1.5 });
  const total = options.reduce((n, o) => n + o.w, 0);
  let r = rand() * total;
  for (const o of options) { r -= o.w; if (r <= 0) return o; }
  return options[0];
}

/** Each frame while exploring: now and then a nearby visitor has a question; Pico asks at viewing spots. */
export function tunnelActivitiesTick() {
  const g = getGame();
  if (!rt.explore.active || g.mode !== "play" || live || g.prompt || g.line) return;
  if (!poses().length) return;
  if (!nextRequestAt) nextRequestAt = rt.time + 6;
  // A visitor with a question (the "!" and the HUD chip). Expires after a minute.
  const waiting = tunnelPeople.find((p) => p.request);
  if (waiting && rt.time - waiting.bornT > 0 && waiting.stopUntil < rt.time) { waiting.request = null; setGame({ tunnelWaiting: null }); }
  if (!waiting && rt.time > nextRequestAt) {
    const player = playerWorld();
    const near = tunnelPeople
      .filter((p) => sectionAt(p.s) !== "lobby" && sectionAt(p.s) !== "exit")
      .map((p) => ({ p, d: Math.hypot(personWorld(p).x - player.x, personWorld(p).z - player.z) }))
      .filter((x) => x.d > 1.2 && x.d < 9)
      .sort((a, b) => a.d - b.d)[0];
    if (near) {
      const choice = chooseKind(Math.random);
      if (choice) {
        near.p.request = `${choice.kind}:${choice.target}`;
        near.p.state = "stop";
        near.p.stopUntil = rt.time + 60;
        near.p.bubble = { en: "Excuse me!", ja: "すみません！", until: rt.time + 2.5 };
        setGame({ tunnelWaiting: { id: near.p.id, type: near.p.type } });
        audio.play("bubble");
      }
    }
    nextRequestAt = rt.time + 22 + Math.random() * 14;
  }
  // Pico's observation question when the player lingers at a viewing spot.
  if (rt.explore.spot && rt.explore.speed < 0.1 && rt.time > nextPicoAt && !g.tunnelWaiting) {
    nextPicoAt = rt.time + 40;
    const choice = chooseKind(Math.random);
    if (choice) void runActivity(choice.kind, choice.target, null, false);
  } else if (!rt.explore.spot) nextPicoAt = Math.max(nextPicoAt, rt.time + 3);
}

/** Tapping a tunnel visitor who has a question (or the HUD chip). */
export function tapTunnelVisitor(id: string) {
  const p = tunnelPeople.find((x) => x.id === id);
  if (!p?.request || live || getGame().mode !== "play") return;
  const [kind, target] = p.request.split(":") as [TunnelActKind, Target];
  setGame({ tunnelWaiting: null });
  void runActivity(kind, target, p.id, false);
}

/** The final tour (milestone 5): Pico asks find, where and count in a row. */
export async function startFinalTour() {
  if (live || !rt.explore.active || getGame().mode !== "play") return;
  const m = model().progress.tunnel;
  if (!m || m.milestone !== 4 || !present().sharks) return;
  await say("pico", "Welcome to the final tour!", "さいごの ツアーへ ようこそ！ サメの しつもんに 3つ こたえよう！");
  for (const [kind, target] of [["find", "shark"], ["where", "shark"], ["count", "shark"]] as Array<[TunnelActKind, Target]>) {
    const ok = await runActivity(kind, target, null, true);
    if (!ok) {
      await say("pico", "Let's try again later!", "また あとで やってみよう！");
      return;
    }
  }
}

// ------------------------------------------------------------------ running one activity

export function runActivity(kind: TunnelActKind, target: Target, visitorId: string | null, tour: boolean): Promise<boolean> {
  if (live) return Promise.resolve(false);
  const v = visitorId ? tunnelPeople.find((p) => p.id === visitorId) : null;
  const by: VisitorType | "pico" = v ? v.type : "pico";
  if (v) {
    v.state = "stop";
    v.stopUntil = rt.time + 120;
    const pw = playerWorld();
    v.face = { x: pw.x, z: pw.z };
    v.activity = null;
  }
  return new Promise<boolean>((resolve) => {
    const ui: TunnelActivityUi = {
      id: activityNo++, kind, by, tier: 0, clue: null, status: "seek",
      question: kind === "count" ? { en: "How many sharks?", ja: "サメは なんびき？" } : kind === "can" ? { en: "Can it swim?", ja: "およげる？" } : QUESTION[target],
      todo: kind === "count" ? { en: "Count the sharks!", ja: "サメを かぞえよう！" } : kind === "can" ? { en: "Look at it!", ja: "よく みて！" } : TODO[target]
    };
    live = { ui, visitorId, target, t0: rt.time, animalId: null, tour, resolve };
    if (kind === "find" || kind === "show") return startFind(by);
    if (kind === "where") return void startWhere(by, tour);
    if (kind === "can") return void startCan(by, tour);
    return void startCount(by, tour);
  });
}

function startFind(by: VisitorType | "pico") {
  if (!live) return;
  const a = nearestMatch(live.target);
  if (!a) return finish(false);
  live.animalId = a.id;
  callOver(a);
  setGame({ tunnelActivity: live.ui, mode: "play" });
  void speak(live.ui.question.en, by);
}

/** Each frame: help tiers for a find, a waiting location question. */
export function stepTunnelActivity() {
  if (!live) return;
  const t = rt.time - live.t0;
  if (live.ui.kind === "find" || live.ui.kind === "show") {
    const a = poses().find((x) => x.id === live!.animalId);
    // Keep the animal coming (an attract lasts ~20 s; renew it while it is still far).
    if (a && Math.floor(t) % 15 === 0 && t % 1 < 0.02) callOver(a);
    const tier = t > 34 ? 4 : t > 25 ? 3 : t > 17 ? 2 : t > 9 ? 1 : 0;
    if (tier !== live.ui.tier) {
      const clue = live.target === "ray" ? { en: "Look for wide fins!", ja: "おおきな ひれを さがそう！" } : { en: "Look up!", ja: "うえを みて！" };
      setUi({ tier, clue: tier >= 1 ? clue : null });
      if (tier === 1) void speak(clue.en, live.ui.by);
    }
    // Tier 2+: the camera turns toward the animal.
    if (a && live.ui.tier >= 2) rt.explore.frame = { kind: "point", x: a.x, y: a.y, z: a.z };
  }
}

/** A tap on the screen while a find is open: is it on (or near) the right animal? */
export function tapForFind(hit: { id: string; species: TunnelSpecies } | null): "ok" | "wrong" | "none" {
  if (!live || (live.ui.kind !== "find" && live.ui.kind !== "show")) return "none";
  if (!hit) return "none";
  if (!matches(live.target, hit.species)) {
    audio.play("hmm");
    const name = hit.species === "eagleray" ? { en: "That's a ray!", ja: "それは エイだよ！" } : hit.species === "zebrashark" && live.target === "shark" ? null : { en: "That's a shark!", ja: "それは サメだよ！" };
    if (live.target === "bigshark" && hit.species === "blacktip") setUi({ clue: { en: "Find the BIG shark!", ja: "もっと おおきな サメ！" } });
    else if (name) setUi({ clue: name });
    return "wrong";
  }
  const l = live;
  const kind = l.ui.kind;
  setUi({ status: "done", clue: null, tier: 0, todo: { en: "You found it!", ja: "みつけた！" } });
  void (async () => {
    await succeed(kind, Boolean(l.visitorId), l.ui.by);
    finish(true);
  })();
  return "ok";
}

/** The animal the find is about (the HUD draws the arrow / ring on it at tiers 3-4). */
export function findTargetId(): string | null {
  return live && (live.ui.kind === "find" || live.ui.kind === "show") ? live.animalId : null;
}
/** The target kind of the open find ("shark", "ray", "bigshark"). */
export function findTarget(): Target | null {
  return live ? live.target : null;
}

async function startWhere(by: VisitorType | "pico", tour: boolean) {
  if (!live) return;
  const l = live;
  setUi({ status: "wait", todo: { en: "Wait for a shark...", ja: "サメを まとう…" } });
  const t0 = rt.time;
  let chosen: { a: AnimalPose; where: "above" | "by" } | null = null;
  // Call the nearest shark over (alternating above / by), then wait for a clear position.
  const first = nearestMatch("shark");
  if (!first) return finish(false);
  callOver(first, Math.random() < 0.6 ? "above" : "by");
  while (!chosen && rt.time - t0 < 40 && live === l) {
    for (const a of poses()) {
      if (!isShark(a.species)) continue;
      const where = locate(a);
      if (where) { chosen = { a, where }; break; }
    }
    if (!chosen) await nextFrames(6);
  }
  if (!chosen || live !== l) return finish(false);
  // The stable moment: hold it there, look at it, then ask.
  tunnelRuntime.swim?.hold(chosen.a.id, 9);
  l.animalId = chosen.a.id;
  rt.explore.frame = { kind: "point", x: chosen.a.x, y: chosen.a.y, z: chosen.a.z };
  setUi({ status: "ask" });
  const correct: PhraseId = chosen.where === "above" ? "aboveMe" : "byMe";
  const id = await ask({
    pattern: "where",
    kind: "command",
    options: [correct],
    judge: ["aboveMe", "byMe"],
    choices: ["aboveMe", "byMe"],
    shuffle: false,
    question: { en: "Where is the shark?", ja: "サメは どこに いる？", by },
    readQuestion: true,
    cancellable: !tour,
    help: "サメは うえ？ それとも よこ？"
  });
  if (!id) return finish(false);
  await succeed("where", Boolean(l.visitorId), by);
  finish(true);
}

async function startCan(by: VisitorType | "pico", tour: boolean) {
  if (!live) return;
  const l = live;
  const a = nearestMatch(l.target);
  if (!a) return finish(false);
  l.animalId = a.id;
  callOver(a, "by");
  rt.explore.frame = { kind: "point", x: a.x, y: a.y, z: a.z };
  const swim = Math.random() < 0.6;
  const word = a.species === "eagleray" ? "ray" : "shark";
  setUi({ status: "ask" });
  const id = await ask({
    pattern: "canIt",
    kind: "command",
    options: [swim ? "yesItCan" : "noItCant"],
    judge: ["yesItCan", "noItCant"],
    choices: ["yesItCan", "noItCant"],
    shuffle: false,
    question: { en: swim ? `Can it swim?` : `Can it walk?`, ja: swim ? `この ${word === "ray" ? "エイ" : "サメ"}は およげる？` : `この ${word === "ray" ? "エイ" : "サメ"}は あるける？`, by },
    readQuestion: true,
    cancellable: !tour,
    help: swim ? "およげる？ はい / いいえ" : "あるける？ はい / いいえ"
  });
  if (!id) return finish(false);
  await succeed("can", Boolean(l.visitorId), by);
  finish(true);
}

async function startCount(by: VisitorType | "pico", tour: boolean) {
  if (!live) return;
  const l = live;
  const n = poses().filter((a) => isShark(a.species)).length;
  if (n < 1 || n > 6) return finish(false);
  // Gather every shark just ahead of the player, above and beside the tube, and look
  // there. The question waits until they have all arrived (or 25 s), so a child counts
  // what is on the screen; each shark carries a number tag meanwhile.
  const pw = playerWorld(), f = walkwayFrame(rt.explore.s);
  const gx = pw.x + f.dx * 5, gz = pw.z + f.dz * 5, gy = f.height + 2.4;
  rt.explore.frame = { kind: "point", x: gx, y: gy, z: gz };
  countTags.on = true;
  setUi({ status: "wait", todo: { en: "Watch! Here they come!", ja: "みて！ サメが くるよ！" } });
  const sharks = () => poses().filter((a) => isShark(a.species));
  sharks().forEach((a, i) => tunnelRuntime.swim?.attract(a.id, { x: gx + (i - 2) * 1.8, y: gy + (i % 2) * 1.2, z: gz + ((i * 1.7) % 3) - 1.5 }, 40));
  const t0 = rt.time;
  while (live === l && rt.time - t0 < 25 && !sharks().every((a) => Math.hypot(a.x - gx, a.y - gy, a.z - gz) < 7)) await nextFrames(6);
  if (live !== l) return;
  for (const a of sharks()) tunnelRuntime.swim?.hold(a.id, 12);
  setUi({ status: "ask" });
  const lo = Math.max(1, Math.min(n - 1, 4));
  const id = await ask({
    pattern: "countSharks",
    kind: "command",
    options: [SHARK_NUMBER_PHRASE[n]],
    judge: SHARK_NUMBER_IDS,
    frame: { before: "", after: n === 1 ? " shark!" : " sharks!", slots: SHARK_NUMBER_IDS },
    choices: [lo, lo + 1, lo + 2].map((k) => SHARK_NUMBER_PHRASE[k]),
    shuffle: false,
    question: { en: "How many sharks?", ja: "サメは なんびき？", by },
    readQuestion: true,
    cancellable: !tour,
    help: "サメは なんびき？ かぞえて こたえよう（エイは かぞえないよ）"
  });
  countTags.on = false;
  if (!id) return finish(false);
  await succeed("count", Boolean(l.visitorId), by);
  finish(true);
}

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let k = 0;
    const tick = () => (++k >= n ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
}

/** Help / ヒント in the Shark Tunnel: the next help tier for a find, otherwise what to do next. */
export function tunnelHelp() {
  const g = getGame();
  if (live && (live.ui.kind === "find" || live.ui.kind === "show")) {
    // Jump the clock to the next tier (clue → turn the camera → arrow → hand).
    const t = rt.time - live.t0;
    const next = t < 9 ? 9.05 : t < 17 ? 17.05 : t < 25 ? 25.05 : 34.05;
    live.t0 = rt.time - next;
    return;
  }
  if (!g.exploring) {
    const m = g.model.progress.tunnel?.milestone ?? 0;
    const tank = g.model.tanks.find((t) => t.type === "sharks");
    if (tank && !tank.fish.length) nudgeLine({ en: "Tap Animals to buy a shark!", ja: "「いきもの」で サメを かおう！" });
    else if (m === 3) nudgeLine({ en: "Tap Rocks, then Place them. Feed and clean!", ja: "「いわ」を かって おこう。えさと そうじも わすれずに！" });
    else nudgeLine({ en: "Tap Explore Tunnel and walk inside!", ja: "「トンネルを あるく」を タップして なかを あるこう！" });
    return;
  }
  if (g.tunnelWaiting) nudgeLine({ en: "A visitor needs help! Tap the ! button.", ja: "おきゃくさんが こまっているよ！「！」を タップ！" });
  else if ((g.model.progress.tunnel?.milestone ?? 0) === 4) nudgeLine({ en: "Tap Final Tour!", ja: "「さいごの ツアー」を タップ！" });
  else nudgeLine({ en: "Walk with the joystick or arrow keys. Stop at a glowing circle!", ja: "ジョイスティックか やじるしキーで あるこう。ひかる まるで とまってみよう！" });
}

function nudgeLine(t: { en: string; ja: string }) {
  nudge({ en: t.en, ja: t.ja, kind: "look" }, 6000);
}

/** Leaving the tunnel cancels whatever was going on (no penalty). */
export function cancelTunnelActivity() {
  if (live) finish(false);
  for (const p of tunnelPeople) p.request = null;
  setGame({ tunnelWaiting: null });
  nextRequestAt = rt.time + 8;
}

/** Reached milestones are checked when exploration starts (e.g. habitat now happy). */
export function refreshMilestones() {
  const before = model().progress.tunnel?.milestone ?? 0;
  updateModel((m) => checkTunnelMilestones(m).m);
  const after = model().progress.tunnel?.milestone ?? 0;
  if (after > before) celebrateMilestones(before, after);
}

export { loopDelta, SHARKS };
