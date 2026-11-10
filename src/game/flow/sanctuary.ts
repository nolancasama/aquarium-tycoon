import { getGame, model, nudge, setGame, toast, updateModel, useGame } from "../store";
import { rt } from "../runtime";
import { SANCTUARY_HALL } from "../data/rooms";
import {
  addSticker, BELUGAS, checkSanctuaryMilestones, chooseImprovement, finishSanctuaryTour, ORCAS, pickLitter, recordSanctuaryAnswer, sanctuaryActive,
  type Improvement, type SanctuaryQuestion, type SanctuaryView, type Sticker
} from "../logic/sanctuary";
import { award } from "../logic/model";
import { ORCA_NUMBER_PHRASE } from "../logic/english";
import { belugaPod, orcaPod, passDistance, pickLitterAt, sanctRt, startLitter, stepSanctRt } from "../sanctuary/sanctuaryRuntime";
import { surfaceY, type PodEvent } from "../marine/pod";
import { BY_BOAT, BY_ISLAND, SANCTUARY_ORIGIN } from "../data/sanctuary";
import type { VisitorType } from "../types";
import { ask, say, speak } from "./ask";
import { project } from "../../scene/CameraRig";
import { audio } from "../../audio/audio";

/**
 * The Grand Ocean Sanctuary's flow: research (Look! moments fill the Research
 * Notebook), conservation (the Ocean Cleanup, a Habitat Improvement choice),
 * visitor education (English questions about what is visible), Pico's final
 * tour and the milestones. No feeding, cleaning or decorating here. Release-
 * locked like the lagoon: none of this runs without a release or a preview.
 */

export const inSanctuary = (g = getGame()) => g.screen === "game" && g.hall === SANCTUARY_HALL;

const calm = () => {
  const g = getGame();
  return inSanctuary(g) && g.mode === "play" && !g.prompt && !g.line && !g.settingsOpen && !g.areaActivity && g.fade === 0;
};

const belugasOpen = () => Boolean(model().progress.sanctuary?.belugas);

// ------------------------------------------------------------------ viewpoints

let viewTimer = 0;
export function setSanctuaryView(v: SanctuaryView, force = false) {
  const g = getGame();
  if (!inSanctuary(g) || v === g.sanctuaryView || (!force && (g.prompt || g.line || g.areaActivity))) return;
  if (v === "belugas" && !belugasOpen()) {
    audio.play("error");
    toast({ en: "Not open yet!", ja: "もくひょう 3を クリアすると ひらくよ", tone: "info" });
    return;
  }
  audio.play("tick");
  window.clearTimeout(viewTimer);
  // Into or out of the station (a room under the sea): a short fade, so the camera never passes through walls.
  if (v === "underwater" || g.sanctuaryView === "underwater") {
    setGame({ fade: 1, areaPanel: null });
    viewTimer = window.setTimeout(() => { rt.camera.snap = true; setGame({ sanctuaryView: v, fade: 0 }); }, 340);
  } else setGame({ sanctuaryView: v, areaPanel: null });
}

// ------------------------------------------------------------------ research: Look! moments

const STICKER_OF: Partial<Record<PodEvent["kind"], Sticker>> = { breathe: "breath", dive: "dive", pair: "together", family: "family", spyhop: "spyhop" };

export const STICKER_TEXT: Record<Sticker, { en: string; ja: string; line: string }> = {
  breath: { en: "Breathing", ja: "いきつぎ", line: "The orca is breathing!" },
  dive: { en: "A deep dive", ja: "ふかい もぐり", line: "The orca is diving!" },
  big: { en: "So big!", ja: "とても おおきい", line: "Orcas are big!" },
  together: { en: "Together", ja: "いっしょに", line: "Two orcas are swimming together!" },
  family: { en: "Mother and baby", ja: "おやこ", line: "A baby orca with its mother!" },
  spyhop: { en: "Looking at us", ja: "こっちを みてる", line: "The orca is looking at us!" },
  beluga: { en: "Belugas", ja: "シロイルカ", line: "Belugas are white!" },
  clean: { en: "A clean ocean", ja: "きれいな うみ", line: "The ocean is clean!" }
};

const lastShown = new Map<Sticker, number>();

function onScreen(x: number, y: number, z: number): boolean {
  const p = project(SANCTUARY_ORIGIN.x + x, y, SANCTUARY_ORIGIN.z + z);
  if (!p) return false;
  const w = window.innerWidth, h = window.innerHeight;
  return p.x > w * 0.12 && p.x < w * 0.88 && p.y > h * 0.18 && p.y < h * 0.78;
}

function offerLook(e: PodEvent, cove: boolean) {
  const kind: Sticker | undefined = cove ? (e.kind === "breathe" || e.kind === "spyhop" ? "beluga" : undefined) : STICKER_OF[e.kind];
  const p = model().progress.sanctuary;
  if (!kind || !p || sanctRt.look || sanctRt.time < sanctRt.lookReadyAt || !calm() || getGame().areaPanel) return;
  if (kind === "beluga" && !p.belugas) return;
  const seen = p.stickers.includes(kind);
  if (seen && sanctRt.time - (lastShown.get(kind) ?? -1e9) < 60) return;
  const y = e.kind === "pair" || e.kind === "family" ? Math.min(-0.5, e.y) : 0.8;
  if (!onScreen(e.x, Math.max(0.5, y), e.z)) return;
  lastShown.set(kind, sanctRt.time);
  sanctRt.look = { kind, ids: e.ids, x: e.x, y, z: e.z, until: sanctRt.time + 7, cove };
  audio.play("tick");
}

/** The Look! bubble was tapped: a sticker for the Research Notebook. */
export function tapSanctLook() {
  const look = sanctRt.look;
  if (!look || !inSanctuary()) return;
  sanctRt.look = null;
  sanctRt.lookReadyAt = sanctRt.time + 8;
  const before = model().progress.sanctuary?.milestone ?? 0;
  const isNew = !model().progress.sanctuary?.stickers.includes(look.kind);
  updateModel((m) => addSticker(m, look.kind));
  audio.play(isNew ? "happy" : "bubble");
  const t = STICKER_TEXT[look.kind];
  void speak(t.line);
  toast({ en: isNew ? `${t.line} New sticker!` : t.line, ja: isNew ? `${t.ja}：あたらしい シール！` : t.ja, tone: "good" }, 3400);
  celebrate(before);
}

let comingSaid = false;
export function sanctuaryTick(dt: number) {
  if (!inSanctuary() || !sanctuaryActive(model())) return;
  sanctRt.watchStation = getGame().sanctuaryView === "underwater";
  // In the station: when the orca on its way is still far, say so (they live in a big bay, not a tank).
  if (!sanctRt.watchStation) comingSaid = false;
  else if (!comingSaid && calm()) {
    const d = passDistance();
    if (d !== null) {
      comingSaid = true;
      if (d > 35) toast({ en: "The orcas are coming! Wait and watch.", ja: "シャチが こっちへ およいで くるよ！ まって みていてね", tone: "info" }, 4500);
    }
  }
  const { orca, beluga } = stepSanctRt(dt, belugasOpen());
  for (const e of orca) offerLook(e, false);
  if (getGame().sanctuaryView === "belugas") for (const e of beluga) offerLook(e, true);
  visitorTick();
}

// ------------------------------------------------------------------ conservation

export const LITTER_WORDS: Record<string, { en: string; ja: string }> = {
  bottle: { en: "A bottle!", ja: "ペットボトル" }, bag: { en: "A bag!", ja: "ふくろ" }, can: { en: "A can!", ja: "あきかん" },
  cup: { en: "A cup!", ja: "コップ" }, net: { en: "A net!", ja: "あみ" }
};

export const cleanupAvailable = () => {
  const p = model().progress.sanctuary;
  return Boolean(p && p.milestone >= 3);
};

export function startCleanup() {
  if (!calm() || !cleanupAvailable()) return;
  if (sanctRt.cleanupOn) { setSanctuaryView("research"); return; }
  audio.play("tick");
  startLitter();
  setSanctuaryView("research");
  void speak("Let's clean the ocean!");
  toast({ en: "Let's clean the ocean! Tap the trash.", ja: "うみを きれいに しよう！ ごみを タップしてね", tone: "info" }, 4200);
}

/** A piece of floating litter was tapped. */
export function tapLitter(i: number) {
  const g = getGame();
  if (g.prompt || g.areaActivity || !inSanctuary(g)) return;
  const piece = sanctRt.litter.find((l) => l.i === i && l.picked < 0);
  if (!piece || !pickLitterAt(i)) return;
  audio.play("coin");
  const w = LITTER_WORDS[piece.kind];
  void speak(w.en);
  const before = model().progress.sanctuary?.milestone ?? 0;
  updateModel(pickLitter);
  const left = sanctRt.litter.filter((l) => l.picked < 0).length;
  if (left === 0) {
    updateModel((m) => award(m, 5));
    audio.play("happy");
    window.setTimeout(() => void speak("The ocean is clean! Thank you!"), 900);
    toast({ en: "The ocean is clean! Thank you! +5", ja: "うみが きれいに なった！ ありがとう！", tone: "good" }, 3600);
  } else toast({ en: `${w.en} ${5 - left}/5`, ja: w.ja, tone: "info" }, 1600);
  celebrate(before);
}

export const IMPROVE_CHOICES: { id: Improvement | "music" | "tank"; en: string; ja: string; good: boolean; why: string }[] = [
  { id: "kelp", en: "Plant a kelp forest", ja: "コンブの もり", good: true, why: "コンブの もりで かくれたり あそんだり できるね！" },
  { id: "music", en: "Play loud music", ja: "おおきな おんがく", good: false, why: "シャチは おとで はなしを するよ。おおきな おとは にがて。" },
  { id: "quiet", en: "Make a quiet zone", ja: "しずかな エリア", good: true, why: "ボートの おとが ないと シャチは ゆっくり できるね！" },
  { id: "tank", en: "Move them to a small pool", ja: "せまい プール", good: false, why: "シャチは とても おおきくて、ひろい うみが ひつようだよ。" },
  { id: "ice", en: "Give ice treats", ja: "こおりの おやつ", good: true, why: "こおりの なかの さかなを さがして あそべるね！" }
];

export function openImprove() {
  if (!calm()) return;
  audio.play("tick");
  setGame({ areaPanel: getGame().areaPanel === "improve" ? null : "improve" });
}

/** A choice on the Habitat Improvement card: a good one is applied (and stays visible), a bad one is explained. */
export function chooseHabitat(id: (typeof IMPROVE_CHOICES)[number]["id"]): "good" | "bad" {
  const c = IMPROVE_CHOICES.find((x) => x.id === id)!;
  if (!c.good) {
    audio.play("hmm");
    return "bad";
  }
  audio.play("happy");
  const before = model().progress.sanctuary?.milestone ?? 0;
  updateModel((m) => chooseImprovement(m, id as Improvement));
  void speak(c.en.replace(/^./, (x) => x.toUpperCase()) + "!");
  window.setTimeout(() => { if (getGame().areaPanel === "improve") setGame({ areaPanel: null }); }, 2600);
  celebrate(before);
  return "good";
}

export function openNotebook() {
  if (!inSanctuary()) return;
  audio.play("tick");
  setGame({ areaPanel: getGame().areaPanel === "notebook" ? null : "notebook" });
}

// ------------------------------------------------------------------ visitors' questions

const VISITORS: VisitorType[] = ["child", "adult", "fan", "grandma", "explorer"];
let nextVisitorAt = 16;

function visitorTick() {
  const g = getGame();
  if (g.areaWaiting || g.areaActivity || !calm() || g.areaPanel) return;
  if (sanctRt.time < nextVisitorAt) return;
  nextVisitorAt = sanctRt.time + 24 + Math.random() * 14;
  setGame({ areaWaiting: { area: "sanctuary", type: VISITORS[Math.floor(Math.random() * VISITORS.length)] } });
  audio.play("tick");
}

/** What a question is about: the ringed animal, numbers, and what the camera frames. */
export const sanctFocus = { id: null as string | null, numbers: false, frame: null as null | "pod" | "orca" | "island" | "boat" | "beluga" };

export type SanctQuestionKind = "what" | "big" | "count" | "where" | "like" | "beluga" | "color";

function pickQuestion(): SanctQuestionKind {
  const p = model().progress.sanctuary;
  const ms = p?.milestone ?? 0;
  if (getGame().sanctuaryView === "belugas" && p?.belugas) return Math.random() < 0.5 ? "beluga" : "color";
  if (ms === 0) return Math.random() < 0.6 ? "what" : "like";
  if (ms === 1) return !p?.asked.includes("big") ? "big" : !p?.asked.includes("count") ? "count" : Math.random() < 0.5 ? "big" : "count";
  if (ms === 2) return Math.random() < 0.7 ? "where" : "count";
  const all: SanctQuestionKind[] = ["what", "big", "count", "where", "like"];
  if (p?.belugas) all.push("beluga");
  return all[Math.floor(Math.random() * all.length)];
}

export async function startSanctActivity(kind?: SanctQuestionKind) {
  const g = getGame();
  const w = g.areaWaiting;
  if ((!w && !kind) || !calm()) return;
  sanctRt.look = null;
  setGame({ areaWaiting: null, areaActivity: { area: "sanctuary", by: w?.type ?? "child" }, areaPanel: null });
  const q = kind ?? pickQuestion();
  const ok = await askSanct(q, w?.type ?? "child");
  setGame({ areaActivity: null });
  if (!ok) return;
  audio.play("happy");
  const before = model().progress.sanctuary?.milestone ?? 0;
  updateModel((m) => award(recordSanctuaryAnswer(m, ANSWER_OF[q]), 3));
  toast({ en: "Thank you! +3", ja: "ありがとう！", tone: "good" });
  celebrate(before);
}

const ANSWER_OF: Record<SanctQuestionKind, SanctuaryQuestion> = { what: "what", big: "big", count: "count", where: "where", like: "like", beluga: "beluga", color: "beluga" };

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, rt.time > 0 ? ms : 0));

async function askSanct(kind: SanctQuestionKind, by: VisitorType | "pico"): Promise<boolean> {
  const pod = orcaPod();
  const speaker = by === "pico" ? "pico" : by;
  const adult = () => pod.members.filter((m) => m.id !== "chibi")[Math.floor(Math.random() * 3)];
  try {
    if (kind === "count") {
      sanctFocus.frame = "pod";
      for (const m of pod.members) pod.hold(m.id, 40, -1.2);
      await wait(1400);
      sanctFocus.numbers = true;
      const n = pod.members.length, ids = [1, 2, 3, 4, 5, 6].map((k) => ORCA_NUMBER_PHRASE[k]), lo = Math.max(1, Math.min(n - 1, 4));
      const id = await ask({
        pattern: "countOrcas", kind: "command", options: [ORCA_NUMBER_PHRASE[n]], judge: ids,
        frame: { before: "", after: n === 1 ? " orca!" : " orcas!", slots: ids },
        choices: [lo, lo + 1, lo + 2].filter((k) => k <= 6).map((k) => ORCA_NUMBER_PHRASE[k]), shuffle: false,
        question: { en: "How many orcas?", ja: "シャチは なんとう？", by: speaker }, readQuestion: true, cancellable: true, help: "シャチを かぞえよう！ ばんごうを みてね"
      });
      return Boolean(id);
    }
    if (kind === "where") {
      // Bring an orca beside the island or beside the research boat, then ask where it is.
      const m = adult();
      const at = Math.random() < 0.5 ? "island" : "boat";
      pod.attract(m.id, at === "island" ? BY_ISLAND : BY_BOAT, 40, "point");
      sanctFocus.frame = at;
      sanctFocus.id = m.id;
      for (let k = 0; k < 40 && Math.hypot(m.x - (at === "island" ? BY_ISLAND.x : BY_BOAT.x), m.z - (at === "island" ? BY_ISLAND.z : BY_BOAT.z)) > 6; k++) await wait(250);
      pod.hold(m.id, 30, surfaceY(m) - 0.6);
      const id = await ask({
        pattern: "whereOrca", kind: "command", options: [at === "island" ? "byIsland" : "byBoat"], judge: ["byIsland", "byBoat"], choices: ["byIsland", "byBoat"], shuffle: false,
        question: { en: "Where is the orca?", ja: "シャチは どこに いる？", by: speaker }, readQuestion: true, cancellable: true, help: "しまの そば？ ボートの そば？ ひかっている シャチを みてね"
      });
      return Boolean(id);
    }
    if (kind === "big") {
      // The big male, or the calf beside its mother: the size is plain to see.
      const small = Math.random() < 0.4;
      const m = pod.byId(small ? "chibi" : "kuro")!;
      sanctFocus.frame = "orca";
      sanctFocus.id = m.id;
      pod.hold(m.id, 30, -1);
      if (small) pod.hold("yuki", 30, -1);
      await wait(1200);
      const id = await ask({
        pattern: "bigSmall", kind: "command", options: [small ? "itsSmall" : "itsBig"], judge: ["itsBig", "itsSmall"], choices: ["itsBig", "itsSmall"], shuffle: false,
        question: { en: "Is it big or small?", ja: small ? "この こどもの シャチは おおきい？ ちいさい？" : "この シャチは おおきい？ ちいさい？", by: speaker }, readQuestion: true, cancellable: true,
        help: small ? "となりの おかあさんと くらべてみよう" : "ひとや ボートと くらべてみよう"
      });
      return Boolean(id);
    }
    if (kind === "what") {
      const m = adult();
      sanctFocus.frame = "orca";
      sanctFocus.id = m.id;
      pod.hold(m.id, 25, -0.8);
      await wait(1000);
      const id = await ask({
        pattern: "identify", kind: "command", options: ["itsOrca"], judge: ["itsOrca", "itsDolphin", "itsShark"], choices: ["itsOrca", "itsDolphin", "itsShark"],
        question: { en: "What's this?", ja: "これは なに？", by: speaker }, readQuestion: true, cancellable: true, help: "くろと しろの おおきな いきものは なに？"
      });
      return Boolean(id);
    }
    if (kind === "beluga" || kind === "color") {
      if (!belugasOpen()) return false;
      if (getGame().sanctuaryView !== "belugas") { setSanctuaryView("belugas", true); await wait(1400); }
      const b = belugaPod();
      const m = b.members[Math.floor(Math.random() * b.members.length)];
      sanctFocus.frame = "beluga";
      sanctFocus.id = m.id;
      b.hold(m.id, 25, -0.5);
      await wait(900);
      const id = kind === "beluga"
        ? await ask({
          pattern: "identify", kind: "command", options: ["itsBeluga"], judge: ["itsBeluga", "itsOrca", "itsDolphin"], choices: ["itsBeluga", "itsOrca", "itsDolphin"],
          question: { en: "What's this?", ja: "これは なに？", by: speaker }, readQuestion: true, cancellable: true, help: "しろくて まるい あたまの いきものは なに？"
        })
        : await ask({
          pattern: "color", kind: "command", options: ["itWhite"], judge: ["itWhite", "itBlue", "itPink"], choices: ["itWhite", "itBlue", "itPink"],
          question: { en: "What color is it?", ja: "なにいろ？", by: speaker }, readQuestion: true, cancellable: true, help: "シロイルカの いろは？"
        });
      b.release(m.id);
      return Boolean(id);
    }
    const id = await ask({
      pattern: "doLike", kind: "choice", options: ["yesIDo", "noIDont"], choices: ["yesIDo", "noIDont"], shuffle: false,
      question: { en: "Do you like orcas?", ja: "シャチは すき？", by: speaker }, readQuestion: true, cancellable: true, help: "すきなら Yes, I do. / ちがうなら No, I don't."
    });
    return Boolean(id);
  } finally {
    for (const m of pod.members) { pod.release(m.id); if (m.attract?.kind === "point") m.attract = null; }
    sanctFocus.id = null;
    sanctFocus.numbers = false;
    sanctFocus.frame = null;
  }
}

// ------------------------------------------------------------------ the final tour (milestone 5)

export async function startSanctuaryTour() {
  const p = model().progress.sanctuary;
  if (!p || p.milestone !== 4 || !calm()) return;
  sanctRt.look = null;
  setGame({ areaActivity: { area: "sanctuary", by: "pico" }, areaPanel: null, areaWaiting: null });
  let ok = true;
  try {
    await say("pico", "Let's do the Grand Sanctuary tour!", "サンクチュアリの さいごの ツアー！ 5つの しつもんに こたえてね");
    for (const k of ["what", "count", "where", "beluga", "like"] as SanctQuestionKind[]) {
      if (k === "beluga" && getGame().sanctuaryView === "belugas") { /* already there */ }
      if (k !== "beluga" && getGame().sanctuaryView === "belugas") { setSanctuaryView("orcas", true); await wait(1500); }
      if (!(await askSanct(k, "pico"))) { ok = false; break; }
      audio.play("correct");
    }
  } finally {
    setGame({ areaActivity: null });
  }
  if (!ok) {
    nudge({ en: "Try the tour again!", ja: "また ツアーに ちょうせん しよう！", kind: "tap", target: "btn-sanctuary-tour" });
    return;
  }
  const before = model().progress.sanctuary?.milestone ?? 0;
  updateModel((m) => award(finishSanctuaryTour(m), 15));
  celebrate(before);
}

// ------------------------------------------------------------------ milestones

export const SANCTUARY_MILESTONES = [
  { en: "Welcome to the Sanctuary", ja: "サンクチュアリへ ようこそ", todo: { en: "Watch an orca breathe (tap Look!)", ja: "シャチの いきつぎを みよう（Look! を タップ）" }, reward: { en: "Welcome flags", ja: "ようこその はた" } },
  { en: "Ocean Giants", ja: "うみの きょじん", todo: { en: "Big or small? How many? See a deep dive", ja: "おおきさ・かず の しつもん・ふかい もぐり" }, reward: { en: "A size board", ja: "おおきさ くらべの かんばん" } },
  { en: "Family and Friends", ja: "かぞくと ともだち", todo: { en: "See friends and a mother and baby; where is it?", ja: "ともだち・おやこを みる・どこ？の しつもん" }, reward: { en: "Beluga Cove opens", ja: "シロイルカの いりえ オープン" } },
  { en: "Ocean Guardians", ja: "うみの まもりびと", todo: { en: "Clean up the ocean and help the habitat", ja: "うみの ごみひろい・すみかを よくしよう" }, reward: { en: "The guardian flag", ja: "まもりびとの はた" } },
  { en: "Grand Sanctuary Celebration", ja: "サンクチュアリの おいわい", todo: { en: "Pico's tour: 5 questions in a row", ja: "ピコの ツアー：しつもん 5つ" }, reward: { en: "The Grand Ocean Sanctuary trophy", ja: "うみの サンクチュアリの トロフィー" } }
] as const;

export function celebrate(before: number) {
  const after = model().progress.sanctuary?.milestone ?? 0;
  if (after <= before) return;
  const ms = SANCTUARY_MILESTONES[after - 1];
  audio.play("trophy");
  setGame({ areaCelebration: { area: "sanctuary", milestone: after } });
  void speak(`${ms.en}!`);
  window.setTimeout(() => { const c = getGame().areaCelebration; if (c?.area === "sanctuary" && c.milestone === after) setGame({ areaCelebration: null }); }, 4400);
  if (after === 3) window.setTimeout(() => nudge({ en: "Visit the belugas!", ja: "シロイルカの いりえへ いってみよう！", kind: "tap", target: "sanctuary-view-belugas" }, 8000), 4800);
  if (after === 4) window.setTimeout(() => nudge({ en: "Start Pico's tour!", ja: "ピコの ツアーを はじめよう！", kind: "tap", target: "btn-sanctuary-tour" }, 8000), 4800);
}

export function checkSanctuaryNow() {
  const before = model().progress.sanctuary?.milestone ?? 0;
  updateModel((m) => checkSanctuaryMilestones(m).m);
  celebrate(before);
}

// ------------------------------------------------------------------ the first visit, taps, help

let introRunning = false;
export function watchSanctuaryIntro(): () => void {
  const check = () => {
    const g = getGame();
    if (introRunning || !inSanctuary(g) || !g.model.progress.sanctuary || g.model.progress.sanctuaryIntroSeen || g.mode !== "play" || g.fade !== 0 || g.line || g.prompt) return;
    introRunning = true;
    updateModel((m) => ({ ...m, progress: { ...m.progress, sanctuaryIntroSeen: true } }));
    void (async () => {
      await wait(6200);
      await say("pico", "Welcome to the Grand Ocean Sanctuary!", "うみの サンクチュアリへ ようこそ！ シャチの ための ひろい うみだよ");
      await say("pico", "Let's study the orcas. Tap Look! to find out!", "シャチを しらべよう！「Look!」を タップすると ノートに シールが はれるよ");
      introRunning = false;
    })();
  };
  const unsubscribe = useGame.subscribe(check);
  check();
  return () => { unsubscribe(); introRunning = false; };
}

export function tapOrca(id: string) {
  const g = getGame();
  if (g.prompt || g.areaActivity || !inSanctuary(g)) return;
  const o = ORCAS.find((x) => x.id === id), b = BELUGAS.find((x) => x.id === id);
  if (!o && !b) return;
  audio.play("bubble");
  void speak(o ? "Orca!" : "Beluga!");
  toast({ en: o ? `${o.name} the orca!` : `${b!.name} the beluga!`, ja: o ? `シャチの ${o.ja}` : `シロイルカの ${b!.ja}`, tone: "info" }, 1800);
}

export function sanctuaryHelpNudge() {
  const p = model().progress.sanctuary;
  if (!p) return;
  if (p.milestone <= 2) return nudge({ en: "Watch the orcas. Tap Look!", ja: "シャチを みて、「Look!」を タップ！ 「!」の おきゃくさんも たすけよう", kind: "look" });
  if (p.milestone === 3 && !p.cleanupDone) return nudge({ en: "Clean up the ocean!", ja: "うみの ごみを ひろおう！", kind: "tap", target: "btn-sanctuary-cleanup" });
  if (p.milestone === 3 && !p.improvement) return nudge({ en: "Help the orcas' home!", ja: "シャチの すみかを よくしよう！", kind: "tap", target: "btn-sanctuary-improve" });
  if (p.milestone === 4) return nudge({ en: "Start Pico's tour!", ja: "ピコの ツアーを はじめよう！", kind: "tap", target: "btn-sanctuary-tour" });
  nudge({ en: "Look at the notebook!", ja: "けんきゅう ノートを みてみよう", kind: "tap", target: "btn-sanctuary-notebook" });
}
