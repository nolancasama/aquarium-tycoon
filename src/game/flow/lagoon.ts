import { getGame, model, nudge, setGame, toast, updateModel, useGame } from "../store";
import { rt } from "../runtime";
import { LAGOON_HALL } from "../data/rooms";
import {
  checkLagoonMilestones, DOLPHINS, feedLagoon, finishLagoonTour, giveToy, lagoonActive, lagoonPlayed, lagoonTogether, lowestNeed,
  recordLagoonActivity, recordLagoonSight, tickLagoon, visitLagoonView, type LagoonSight, type LagoonToy, type LagoonView
} from "../logic/lagoon";
import { award } from "../logic/model";
import { DOLPHIN_NUMBER_PHRASE } from "../logic/english";
import { dropToy, feedPod, holdBall, throwBall, isFeeding, lagoonPod, lagoonRt, stepLagoonRt, WATCH_SPOTS } from "../lagoon/lagoonRuntime";
import { type PodEvent } from "../marine/pod";
import { LAGOON_ORIGIN } from "../data/lagoon";
import type { VisitorType } from "../types";
import { ask, say, speak } from "./ask";
import { project } from "../../scene/CameraRig";
import { audio } from "../../audio/audio";

/**
 * The Dolphin Lagoon's flow: viewpoints, feeding, toys, the "Look!" moments,
 * visitors' questions (each about what the dolphins are visibly doing), Pico's
 * guided Dolphin Discovery tour and the milestone celebrations. Everything is
 * mic-free through ask(). The area is release-locked: none of this runs unless
 * a release or a development preview opened it (logic/lagoon.ts lagoonActive).
 */

export const inLagoon = (g = getGame()) => g.screen === "game" && g.hall === LAGOON_HALL;

const calm = () => {
  const g = getGame();
  return inLagoon(g) && g.mode === "play" && !g.prompt && !g.line && !g.settingsOpen && !g.areaActivity && g.fade === 0;
};

// ------------------------------------------------------------------ viewpoints

let viewTimer = 0;
/** Change viewpoint; the underwater gallery is entered with a short fade (the camera never passes through walls). */
export function setLagoonView(v: LagoonView, force = false) {
  const g = getGame();
  if (!inLagoon(g) || v === g.lagoonView || (!force && (g.prompt || g.line || g.areaActivity))) return;
  audio.play("tick");
  window.clearTimeout(viewTimer);
  const through = v === "gallery" || g.lagoonView === "gallery";
  if (through) {
    setGame({ fade: 1, areaPanel: null });
    viewTimer = window.setTimeout(() => {
      rt.camera.snap = true;
      setGame({ lagoonView: v, fade: 0 });
      noteVisit(v);
    }, 340);
  } else {
    setGame({ lagoonView: v, areaPanel: null });
    noteVisit(v);
  }
}

function noteVisit(v: LagoonView) {
  window.setTimeout(() => {
    if (getGame().lagoonView !== v || !inLagoon()) return;
    const before = model().progress.lagoon?.milestone ?? 0;
    updateModel((m) => visitLagoonView(m, v));
    celebrate(before);
  }, 1100);
}

// ------------------------------------------------------------------ care

let fedAt = -100;
export function feedDolphins() {
  if (!calm()) return;
  if (isFeeding() || (lagoonRt.time >= fedAt && lagoonRt.time - fedAt < 12)) {
    toast({ en: "They are still eating!", ja: "まだ たべているよ。すこし まってね", tone: "info" });
    return;
  }
  if (!feedPod()) return;
  fedAt = lagoonRt.time;
  audio.play("sprinkle");
  const before = model().progress.lagoon?.milestone ?? 0;
  updateModel(feedLagoon);
  toast({ en: "Fish for the dolphins!", ja: "イルカに さかなを あげたよ！", tone: "good" }, 2200);
  celebrate(before);
}

export function openToys() {
  if (!calm()) return;
  audio.play("tick");
  setGame({ areaPanel: getGame().areaPanel === "toys" ? null : "toys" });
}

export const TOY_NAMES: Record<LagoonToy, { en: string; ja: string; word: string }> = {
  ball: { en: "Ball", ja: "ボール", word: "Ball!" },
  bubbles: { en: "Bubbles", ja: "あわの カーテン", word: "Bubbles!" },
  kelp: { en: "Kelp", ja: "コンブ", word: "Kelp!" }
};

export function giveLagoonToy(toy: LagoonToy) {
  const p = model().progress.lagoon;
  if (!p) return;
  if (!p.toys.includes(toy)) {
    audio.play("error");
    toast({ en: "Not yet!", ja: "もくひょうを クリアすると もらえるよ", tone: "info" });
    return;
  }
  audio.play("purchase");
  const before = p.milestone;
  updateModel((m) => giveToy(m, toy));
  dropToy(toy);
  setGame({ areaPanel: null });
  void speak(TOY_NAMES[toy].word);
  celebrate(before);
}

/** Catch uses the same calm gate as care; a held ball never delays another activity. */
export function holdLagoonBall() {
  if (!calm() || getGame().areaPanel || getGame().lagoonView === "gallery") return false;
  if (!holdBall()) return false;
  audio.play("pick");
  return true;
}

export function throwLagoonBall(x?: number, z?: number) {
  if (!calm() || getGame().areaPanel || getGame().lagoonView === "gallery") return false;
  if (!throwBall(x, z)) return false;
  audio.play("place");
  return true;
}

// ------------------------------------------------------------------ the live lagoon

const LOOK_TEXT: Record<LagoonSight, { label: string; ja: string; line: string }> = {
  pair: { label: "Swimming together!", ja: "いっしょに およいでいる！", line: "Two dolphins are swimming together!" },
  breath: { label: "Breathing!", ja: "いきを している！", line: "The dolphin is breathing!" },
  dive: { label: "A deep dive!", ja: "ふかく もぐった！", line: "The dolphin is diving!" },
  leap: { label: "A jump!", ja: "ジャンプした！", line: "Look! A dolphin!" }
};
export const lookText = (k: LagoonSight) => LOOK_TEXT[k];

const SIGHT_OF: Partial<Record<PodEvent["kind"], LagoonSight>> = { pair: "pair", breathe: "breath", dive: "dive", leap: "leap" };
const lastShown: Record<LagoonSight, number> = { pair: -100, breath: -100, dive: -100, leap: -100 };

function onScreen(x: number, y: number, z: number): boolean {
  const p = project(LAGOON_ORIGIN.x + x, y, LAGOON_ORIGIN.z + z);
  if (!p) return false;
  const w = window.innerWidth, h = window.innerHeight;
  return p.x > w * 0.12 && p.x < w * 0.88 && p.y > h * 0.18 && p.y < h * 0.78;
}

/** A pod event worth a "Look!": new sights first, a seen one only now and then; one bubble at a time. */
function offerLook(e: PodEvent) {
  const kind = SIGHT_OF[e.kind];
  const p = model().progress.lagoon;
  if (!kind || !p || lagoonRt.look || lagoonRt.time < lagoonRt.lookReadyAt || !calm() || getGame().areaPanel) return;
  const seen = p.seen.includes(kind);
  if (seen && lagoonRt.time - lastShown[kind] < 45) return;
  // From the underwater gallery a breath at the surface is out of sight; a pair or a dive under water is not.
  // A jump's bubble floats above the arc, so it never hides the dolphin in the air.
  const y = e.kind === "pair" ? e.y : e.kind === "dive" ? 0.4 : e.kind === "leap" ? 3.6 : 0.6;
  if (!onScreen(e.x, y, e.z)) return;
  lastShown[kind] = lagoonRt.time;
  lagoonRt.look = { kind, ids: e.ids, x: e.x, y, z: e.z, until: lagoonRt.time + 6 };
  audio.play("tick");
}

/** The Look! bubble was tapped: the sight is recorded and said. */
export function tapLook() {
  const look = lagoonRt.look;
  if (!look || !inLagoon()) return;
  lagoonRt.look = null;
  lagoonRt.lookReadyAt = lagoonRt.time + 8;
  const before = model().progress.lagoon?.milestone ?? 0;
  const isNew = !model().progress.lagoon?.seen.includes(look.kind);
  updateModel((m) => recordLagoonSight(m, look.kind));
  audio.play(isNew ? "happy" : "bubble");
  const t = LOOK_TEXT[look.kind];
  void speak(t.line);
  toast({ en: isNew ? `${t.line} New!` : t.line, ja: t.ja, tone: "good" }, 3200);
  celebrate(before);
}

let lastTogether = -100, lastPlay = -100, needAcc = 0;

/** Every frame while the lagoon is shown (from the scene). */
export function lagoonTick(dt: number) {
  if (!inLagoon() || !lagoonActive(model())) return;
  const view = getGame().lagoonView;
  lagoonRt.watch = view === "lagoon" ? null : WATCH_SPOTS[view];
  // No spontaneous tricks while a visitor's question focuses on the dolphins.
  lagoonRt.tricksPaused = lagoonFocus.count || lagoonFocus.id !== null || Boolean(getGame().areaActivity);
  lagoonRt.catchInputPaused = !calm() || Boolean(getGame().areaPanel) || view === "gallery";
  const events = stepLagoonRt(dt);
  const before = model().progress.lagoon?.milestone ?? 0;
  for (const e of events) {
    if (e.kind === "pair" && lagoonRt.time - lastTogether > 10) { lastTogether = lagoonRt.time; updateModel(lagoonTogether); }
    offerLook(e);
  }
  if (lagoonRt.plays > 0 && lagoonRt.time - lastPlay > 6) {
    lagoonRt.plays = 0;
    lastPlay = lagoonRt.time;
    updateModel(lagoonPlayed);
  }
  // The needs only change while the lagoon is shown and nothing is being asked.
  if (getGame().mode === "play" && !getGame().prompt && !getGame().line) {
    needAcc += dt;
    if (needAcc >= 1) { const s = needAcc; needAcc = 0; updateModel((m) => tickLagoon(m, s)); }
  }
  celebrate(before);
  visitorTick();
}

// ------------------------------------------------------------------ visitors' questions

const VISITORS: VisitorType[] = ["child", "adult", "fan", "grandma", "explorer"];
let nextVisitorAt = 14;

function visitorTick() {
  const g = getGame();
  if (g.areaWaiting || g.areaActivity || !calm() || g.areaPanel) return;
  if (lagoonRt.time < nextVisitorAt) return;
  nextVisitorAt = lagoonRt.time + 22 + Math.random() * 14;
  setGame({ areaWaiting: { area: "lagoon", type: VISITORS[Math.floor(Math.random() * VISITORS.length)] } });
  audio.play("tick");
}

/** Which dolphin a question is about (the scene rings it), and whether numbers are shown. */
export const lagoonFocus = { id: null as string | null, numbers: false, count: false };

export type LagoonQuestion = "count" | "big" | "what" | "like";
const LAGOON_QUESTIONS: readonly LagoonQuestion[] = ["count", "big", "what", "like"];

function pickQuestion(): LagoonQuestion {
  const ms = model().progress.lagoon?.milestone ?? 0;
  if (ms <= 1) return Math.random() < 0.5 ? "count" : Math.random() < 0.5 ? "what" : "like";
  if (ms === 2) return Math.random() < 0.65 ? "big" : "count";
  return LAGOON_QUESTIONS[Math.floor(Math.random() * LAGOON_QUESTIONS.length)];
}

/** The waiting visitor's chip was tapped. */
export async function startLagoonActivity(kind?: LagoonQuestion) {
  if (kind && !LAGOON_QUESTIONS.includes(kind)) return;
  const g = getGame();
  const w = g.areaWaiting;
  if ((!w && !kind) || !calm()) return;
  lagoonRt.look = null;
  setGame({ areaWaiting: null, areaActivity: { area: "lagoon", by: w?.type ?? "child" }, areaPanel: null });
  const ok = await askLagoon(kind ?? pickQuestion(), w?.type ?? "child");
  setGame({ areaActivity: null });
  if (!ok) return;
  audio.play("happy");
  const before = model().progress.lagoon?.milestone ?? 0;
  updateModel((m) => award(recordLagoonActivity(m), 3));
  toast({ en: "Thank you! +3", ja: "ありがとう！", tone: "good" });
  celebrate(before);
}

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, rt.time > 0 ? ms : 0));

async function askLagoon(kind: LagoonQuestion, by: VisitorType | "pico"): Promise<boolean> {
  const pod = lagoonPod();
  const speaker = by === "pico" ? "pico" : by;
  try {
    if (kind === "count") {
      // Every dolphin up near the surface, numbered, seen from high over the lagoon
      // (from the gallery, out into the open air first: the camera never goes through the ceiling).
      if (getGame().lagoonView === "gallery") { setLagoonView("lagoon", true); await wait(700); }
      // The pod gathers loosely in open water (well apart, so the numbers never overlap), then holds near the surface.
      pod.members.forEach((m, i) => pod.attract(m.id, { x: -4 + (i % 2) * 8 + (i > 1 ? 2 : 0), y: -0.7, z: -4 + Math.floor(i / 2) * 6 }, 9, "point"));
      lagoonFocus.count = true;
      await wait(2800);
      for (const m of pod.members) pod.hold(m.id, 40, -0.7);
      await wait(600);
      lagoonFocus.numbers = true;
      const n = pod.members.length;
      const ids = [1, 2, 3, 4, 5, 6].map((k) => DOLPHIN_NUMBER_PHRASE[k]);
      const lo = Math.max(1, Math.min(n - 1, 4));
      const id = await ask({
        pattern: "countDolphins", kind: "command", options: [DOLPHIN_NUMBER_PHRASE[n]], judge: ids,
        frame: { before: "", after: n === 1 ? " dolphin!" : " dolphins!", slots: ids },
        choices: [lo, lo + 1, lo + 2].filter((k) => k <= 6).map((k) => DOLPHIN_NUMBER_PHRASE[k]), shuffle: false,
        question: { en: "How many dolphins?", ja: "イルカは なんとう？", by: speaker }, readQuestion: true, cancellable: true,
        help: "イルカを かぞえよう！ ばんごうを みてね"
      });
      return Boolean(id);
    }
    if (kind === "big") {
      if (getGame().lagoonView === "gallery") { setLagoonView("lagoon", true); await wait(700); }
      const small = Math.random() < 0.5;
      const m = pod.byId(small ? "mimi" : "sora")!;
      lagoonFocus.count = true;
      lagoonFocus.id = m.id;
      pod.hold(m.id, 30, -0.7);
      pod.hold("sora", 30, -0.7);
      await wait(1200);
      const id = await ask({
        pattern: "bigSmall", kind: "command", options: [small ? "itsSmall" : "itsBig"], judge: ["itsBig", "itsSmall"], choices: ["itsBig", "itsSmall"], shuffle: false,
        question: { en: "Is it big or small?", ja: "この イルカは おおきい？ ちいさい？", by: speaker }, readQuestion: true, cancellable: true,
        help: "ひかっている イルカの おおきさを くらべてみよう"
      });
      return Boolean(id);
    }
    if (kind === "what") {
      const m = chooseDolphin(false);
      lagoonFocus.id = m.id;
      pod.hold(m.id, 20, null);
      const id = await ask({
        pattern: "identify", kind: "command", options: ["itsDolphin"], judge: ["itsDolphin", "itsShark", "itsPenguin"], choices: ["itsDolphin", "itsShark", "itsPenguin"],
        question: { en: "What's this?", ja: "これは なに？", by: speaker }, readQuestion: true, cancellable: true, help: "ひかっている いきものは なに？"
      });
      return Boolean(id);
    }
    // Do you like dolphins? Either answer is right: it is the child's own.
    const id = await ask({
      pattern: "doLike", kind: "choice", options: ["yesIDo", "noIDont"], choices: ["yesIDo", "noIDont"], shuffle: false,
      question: { en: "Do you like dolphins?", ja: "イルカは すき？", by: speaker }, readQuestion: true, cancellable: true, help: "すきなら Yes, I do. / ちがうなら No, I don't."
    });
    return Boolean(id);
  } finally {
    for (const m of pod.members) pod.release(m.id);
    lagoonFocus.id = null;
    lagoonFocus.numbers = false;
    lagoonFocus.count = false;
  }
}

/** A dolphin clearly in one place: at the surface (or not), preferring adults in view. */
function chooseDolphin(deep: boolean) {
  const pod = lagoonPod();
  const adults = pod.members.filter((m) => m.id !== "mimi");
  const fit = adults.filter((m) => (deep ? m.y < -1.8 : m.y > -1.2) && m.mode !== "leap");
  const list = fit.length ? fit : adults;
  return list[Math.floor(Math.random() * list.length)];
}

// ------------------------------------------------------------------ the guided tour (milestone 5)

export async function startLagoonTour() {
  const p = model().progress.lagoon;
  if (!p || p.milestone !== 4 || !calm()) return;
  lagoonRt.look = null;
  setGame({ areaActivity: { area: "lagoon", by: "pico" }, areaPanel: null, areaWaiting: null });
  let ok = true;
  try {
    await say("pico", "Let's do the Dolphin Discovery tour!", "イルカ はっけん ツアーを しよう！ 4つの しつもんに こたえてね");
    for (const k of ["what", "count", "big", "like"] as LagoonQuestion[]) {
      if (!(await askLagoon(k, "pico"))) { ok = false; break; }
      audio.play("correct");
    }
  } finally {
    setGame({ areaActivity: null });
  }
  if (!ok) {
    nudge({ en: "Try the tour again!", ja: "また ツアーに ちょうせん しよう！", kind: "tap", target: "btn-lagoon-tour" });
    return;
  }
  const before = model().progress.lagoon?.milestone ?? 0;
  updateModel((m) => award(finishLagoonTour(m), 10));
  celebrate(before);
}

// ------------------------------------------------------------------ milestones

export const LAGOON_MILESTONES = [
  { en: "Welcome to the Lagoon", ja: "ラグーンへ ようこそ", todo: { en: "Look underwater and from the deck, then feed", ja: "すいちゅう・デッキから みて、えさを あげよう" }, reward: { en: "A welcome arch", ja: "ようこその アーチ" } },
  { en: "Dolphin Friends", ja: "イルカの ともだち", todo: { en: "See two swimming together, 2 questions", ja: "いっしょに およぐ 2とう・しつもん 2つ" }, reward: { en: "A kelp toy", ja: "コンブの おもちゃ" } },
  { en: "Deep Dive", ja: "ふかく もぐろう", todo: { en: "See a breath and a deep dive, help 2 visitors", ja: "いきつぎ・ふかい もぐり・2にん たすける" }, reward: { en: "Telescopes on the deck", ja: "デッキの ぼうえんきょう" } },
  { en: "Happy Dolphins", ja: "ハッピーな イルカ", todo: { en: "Give 2 different toys, keep them happy", ja: "ちがう おもちゃ 2つ・ハッピーに しよう" }, reward: { en: "A dolphin fountain", ja: "イルカの ふんすい" } },
  { en: "Dolphin Discovery", ja: "イルカの はっけん", todo: { en: "Pico's tour: 4 questions in a row", ja: "ピコの ツアー：しつもん 4つ" }, reward: { en: "The Dolphin Lagoon trophy", ja: "イルカの ラグーンの トロフィー" } }
] as const;

/** Celebrate milestones reached since `before` (the model already holds the rewards). */
export function celebrate(before: number) {
  const after = model().progress.lagoon?.milestone ?? 0;
  if (after <= before) return;
  const ms = LAGOON_MILESTONES[after - 1];
  audio.play("trophy");
  setGame({ areaCelebration: { area: "lagoon", milestone: after } });
  void speak(`${ms.en}!`);
  window.setTimeout(() => { const c = getGame().areaCelebration; if (c?.area === "lagoon" && c.milestone === after) setGame({ areaCelebration: null }); }, 4200);
  if (after === 4) window.setTimeout(() => nudge({ en: "Start Pico's tour!", ja: "ピコの ツアーを はじめよう！", kind: "tap", target: "btn-lagoon-tour" }, 8000), 4600);
}

/** Commit the model's own milestone check (e.g. after a load) and celebrate. */
export function checkLagoonNow() {
  const before = model().progress.lagoon?.milestone ?? 0;
  updateModel((m) => checkLagoonMilestones(m).m);
  celebrate(before);
}

// ------------------------------------------------------------------ the first visit, taps, help

let introRunning = false;
export function watchLagoonIntro(): () => void {
  const check = () => {
    const g = getGame();
    if (introRunning || !inLagoon(g) || !g.model.progress.lagoon || g.model.progress.lagoonIntroSeen || g.mode !== "play" || g.fade !== 0 || g.line || g.prompt) return;
    introRunning = true;
    updateModel((m) => ({ ...m, progress: { ...m.progress, lagoonIntroSeen: true } }));
    void (async () => {
      await wait(3800);
      await say("pico", "Welcome to the Dolphin Lagoon! We are outside!", "イルカの ラグーンへ ようこそ！ ここは そとだよ！");
      await say("pico", "Look at the dolphins from the deck and underwater!", "デッキと すいちゅう ギャラリーから イルカを みてみよう！");
      introRunning = false;
    })();
  };
  const unsubscribe = useGame.subscribe(check);
  check();
  return () => { unsubscribe(); introRunning = false; };
}

export function tapDolphin(id: string) {
  const g = getGame();
  if (g.prompt || g.areaActivity || !inLagoon(g)) return;
  const d = DOLPHINS.find((x) => x.id === id);
  if (!d) return;
  audio.play("bubble");
  void speak("Dolphin!");
  toast({ en: `${d.name} the dolphin!`, ja: `イルカの ${d.ja}`, tone: "info" }, 1800);
}

/** Help: point at the lowest need, else at what the next milestone asks. */
export function lagoonHelpNudge() {
  const p = model().progress.lagoon;
  if (!p) return;
  const low = lowestNeed(p);
  if (low === "food") return nudge({ en: "The dolphins are hungry! Tap Feed!", ja: "イルカが おなかを すかせているよ。えさを あげよう！", kind: "tap", target: "btn-lagoon-feed" });
  if (low === "play") return nudge({ en: "The dolphins want to play! Tap Toys!", ja: "イルカが あそびたがっているよ。おもちゃを あげよう！", kind: "tap", target: "btn-lagoon-toys" });
  if (low === "together") return nudge({ en: "Bubbles help friends play together!", ja: "あわの カーテンで なかまと あそべるよ！", kind: "tap", target: "btn-lagoon-toys" });
  if (p.milestone === 0) return nudge({ en: "Tap Underwater and Deck!", ja: "「すいちゅう」と「デッキ」を タップしよう", kind: "tap", target: "lagoon-view-gallery" });
  if (p.milestone === 4) return nudge({ en: "Start Pico's tour!", ja: "ピコの ツアーを はじめよう！", kind: "tap", target: "btn-lagoon-tour" });
  nudge({ en: "Watch for Look! and help visitors with !", ja: "「Look!」を タップ！「!」の おきゃくさんを たすけよう", kind: "look" });
}
