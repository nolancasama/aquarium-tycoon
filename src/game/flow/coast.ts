import { commit, getGame, model, setGame, toast, updateModel, useGame, type GameState } from "../store";
import { COAST_HALL } from "../data/rooms";
import { EXHIBITS, type CoastHabitat } from "../data/coast";
import { COAST_DECOR } from "../data/decor";
import { PENGUIN_NUMBER_PHRASE, type PhraseId } from "../logic/english";
import { award, buyDecor, tankAt } from "../logic/model";
import { checkCoastMilestones, COAST_PRICE, coastUnlocked, HABITAT_PAD, habitatOpen, openCoast, recordCoastActivity } from "../logic/coast";
import { coastRt, feedCoast, holdAnimal } from "../coast/coastRuntime";
import { isOnRock } from "../coast/motion";
import type { CoastDecorKind, VisitorType } from "../types";
import { ask, speak } from "./ask";
import { canTravel, comingSoon, travelTo } from "./hub";
import { areaAvailable } from "../data/release";
import { audio } from "../../audio/audio";
import { rt } from "../runtime";

/**
 * The Coastal & Polar Zone's flow: buying it at the hub, the exhibit views,
 * habitat items, feeding, the English questions visitors ask at the windows
 * (each about what the animals are visibly doing), and milestone celebrations.
 * Every question is mic-free through the usual ask() prompt.
 */

export const inCoast = (g: GameState = getGame()) => g.screen === "game" && g.hall === COAST_HALL;

/** The habitat tank the current view manages (null in the overview). */
export function coastTank() {
  const g = getGame();
  if (!inCoast(g) || g.coastView === "all") return null;
  const t = tankAt(g.model, HABITAT_PAD[g.coastView]);
  return t && t.type === g.coastView ? t : null;
}

const free = () => {
  const g = getGame();
  return g.screen === "game" && g.mode === "play" && !g.prompt && !g.line && !g.settingsOpen && !g.coastActivity;
};

export function setCoastView(view: GameState["coastView"]) {
  skipCoastReveal();
  if (!free()) return;
  if (view !== "all" && !habitatOpen(model(), view)) {
    audio.play("error");
    toast({ en: "Not open yet!", ja: "まだ ひらいて いないよ。もくひょうを クリアしよう！", tone: "info" });
    return;
  }
  audio.play("tick");
  setGame({ coastView: view, coastUnderwater: false, panel: null, placing: null });
}

/** The extra fixed window view belongs to Penguin Coast only. */
export function setCoastUnderwater() {
  skipCoastReveal();
  if (!free() || !inCoast() || getGame().coastView !== "penguins") return;
  audio.play("tick");
  setGame({ coastUnderwater: true });
}

/** The hub's coast doorway (and the map card): travel, the purchase offer, or what is still needed. */
export function tapCoastDoor() {
  if (!canTravel()) return;
  // Held back for now (data/release.ts): saved coastal progress is kept, but nothing opens the zone.
  if (!areaAvailable("coast")) { comingSoon(); return; }
  const m = model();
  if (m.progress.coastOpen) { travelTo(COAST_HALL); return; }
  if (!coastUnlocked(m)) {
    audio.play("error");
    toast({ en: "Finish the Shark Tunnel first!", ja: "さきに サメの トンネルの トロフィーを とろう！", tone: "info" }, 4500);
    return;
  }
  audio.play("tick");
  setGame({ coastOffer: true, mapOpen: false });
}

export function buyCoast() {
  const r = commit(openCoast(model()));
  setGame({ coastOffer: false });
  if (!r.ok) {
    audio.play("error");
    if (r.reason === "coins") toast({ en: "More coins, please!", ja: `${COAST_PRICE} コイン ひつようだよ`, tone: "warn" });
    return;
  }
  audio.play("purchase");
  setGame({ coastView: "all" });
  travelTo(COAST_HALL);
}

/** Habitat items are bought by tapping (the zone's English is in its observation questions). */
export function buyCoastItem(kind: CoastDecorKind) {
  if (!free()) return;
  const r = commit(buyDecor(model(), kind, null));
  if (!r.ok) {
    audio.play("error");
    toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    return;
  }
  audio.play("purchase");
  setGame({ panel: "decorate", placing: { kind: "decor", decorId: r.id! } });
}

export const habitatItems = (h: CoastHabitat) => COAST_DECOR[h];

/** Feed: the food the habitat's animals eat; on land they go to the fish station, in the water to the front. */
export function feedCoastVisual(h: CoastHabitat) {
  feedCoast(model(), h);
}

// ------------------------------------------------------------------ English at the windows

/** Which animal a question is about (the scene rings it). */
export const coastFocus = { id: null as string | null, numbers: false };

const VISITORS: VisitorType[] = ["child", "adult", "fan", "grandma", "explorer"];
let nextVisitorAt = 12;

/** A visitor comes to a window with a question now and then (only while the zone is shown and calm). */
export function coastVisitorTick() {
  const g = getGame();
  if (!inCoast(g) || g.coastRevealing || g.coastWaiting || g.coastActivity || !free() || g.panel || g.placing) return;
  if (coastRt.time < nextVisitorAt) return;
  nextVisitorAt = coastRt.time + 22 + Math.random() * 14;
  const open = (["penguins", "seals", "otters"] as CoastHabitat[]).filter((h) => habitatOpen(g.model, h) && (tankAt(g.model, HABITAT_PAD[h])?.fish.length ?? 0) > 0);
  if (!open.length) return;
  // Prefer the habitat on screen, then the one the next milestone is about.
  const on = g.coastView !== "all" && open.includes(g.coastView) ? g.coastView : null;
  const ms = g.model.progress.coast?.milestone ?? 0;
  const wanted: CoastHabitat = ms <= 1 ? "penguins" : ms === 2 ? "seals" : ms === 3 ? "otters" : open[Math.floor(Math.random() * open.length)];
  const habitat = on ?? (open.includes(wanted) ? wanted : open[0]);
  setGame({ coastWaiting: { habitat, type: VISITORS[Math.floor(Math.random() * VISITORS.length)] } });
  audio.play("tick");
}

/** The waiting visitor's chip was tapped: show their habitat and ask. */
export async function startCoastActivity() {
  const g = getGame();
  const w = g.coastWaiting;
  if (!w || !free()) return;
  skipCoastReveal();
  setGame({ coastWaiting: null, coastView: w.habitat, coastUnderwater: false, coastActivity: { habitat: w.habitat, by: w.type }, panel: null, placing: null });
  // Let the camera arrive before asking.
  await new Promise((r) => window.setTimeout(r, rt.time > 0 ? 700 : 0));
  let ok = false;
  try {
    if (w.habitat === "penguins") ok = await askPenguins(w.type);
    else if (w.habitat === "seals") ok = await askSeal(w.type);
    else ok = await askOtter(w.type);
  } finally {
    coastFocus.id = null;
    coastFocus.numbers = false;
    setGame({ coastActivity: null });
  }
  if (!ok) return;
  audio.play("happy");
  const before = model().progress.coast?.milestone ?? 0;
  updateModel((m) => award(recordCoastActivity(m, w.habitat), 3));
  toast({ en: "Thank you! +3", ja: "ありがとう！", tone: "good" });
  celebrate(before);
}

const animalsIn = (h: CoastHabitat) => [...coastRt.animals.values()].filter((a) => a.habitat === h);

async function askPenguins(by: VisitorType): Promise<boolean> {
  const n = animalsIn("penguins").length;
  if (n < 1 || n > 6) return false;
  coastFocus.numbers = true;
  for (const a of animalsIn("penguins")) holdAnimal(a.m.id, 30);
  const lo = Math.max(1, Math.min(n - 1, 4));
  const ids = [1, 2, 3, 4, 5, 6].map((k) => PENGUIN_NUMBER_PHRASE[k]);
  const id = await ask({
    pattern: "countPenguins",
    kind: "command",
    options: [PENGUIN_NUMBER_PHRASE[n]],
    judge: ids,
    frame: { before: "", after: n === 1 ? " penguin!" : " penguins!", slots: ids },
    choices: [lo, lo + 1, lo + 2].map((k) => PENGUIN_NUMBER_PHRASE[k]),
    shuffle: false,
    question: { en: "How many penguins?", ja: "ペンギンは なんわ？", by },
    readQuestion: true,
    cancellable: true,
    help: "ペンギンを かぞえよう！ ばんごうを みてね"
  });
  for (const a of animalsIn("penguins")) coastRt.hold.delete(a.m.id);
  return Boolean(id);
}

async function askSeal(by: VisitorType): Promise<boolean> {
  const seals = animalsIn("seals");
  if (!seals.length) return false;
  // A seal clearly in one place: resting on a rock, or swimming (not halfway up a ramp).
  const steady = seals.find((a) => a.m.mode === "rest" || a.m.mode === "swim" || a.m.mode === "breathe") ?? seals[0];
  holdAnimal(steady.m.id, 30);
  coastFocus.id = steady.m.id;
  const correct: PhraseId = isOnRock(steady.m) ? "onRock" : "inWater";
  const id = await ask({
    pattern: "whereSeal",
    kind: "command",
    options: [correct],
    judge: ["onRock", "inWater"],
    choices: ["onRock", "inWater"],
    shuffle: false,
    question: { en: "Where is the seal?", ja: "アザラシは どこに いる？", by },
    readQuestion: true,
    cancellable: true,
    help: "いわの うえ？ それとも みずの なか？"
  });
  coastRt.hold.delete(steady.m.id);
  return Boolean(id);
}

async function askOtter(by: VisitorType): Promise<boolean> {
  const otters = animalsIn("otters");
  if (!otters.length) return false;
  const a = otters[Math.floor(Math.random() * otters.length)];
  holdAnimal(a.m.id, 30);
  coastFocus.id = a.m.id;
  const swim = Math.random() < 0.7;
  const id = await ask({
    pattern: "canIt",
    kind: "command",
    options: [swim ? "yesItCan" : "noItCant"],
    judge: ["yesItCan", "noItCant"],
    choices: ["yesItCan", "noItCant"],
    shuffle: false,
    question: { en: swim ? "Can it swim?" : "Can it fly?", ja: swim ? "ラッコは およげる？" : "ラッコは とべる？", by },
    readQuestion: true,
    cancellable: true,
    help: swim ? "およげる？ はい / いいえ" : "そらを とべる？ はい / いいえ"
  });
  coastRt.hold.delete(a.m.id);
  return Boolean(id);
}

// ------------------------------------------------------------------ milestones

export const COAST_MILESTONES = [
  { en: "Open the Coast", ja: "かいがんを ひらこう", todo: { en: "Open the zone at the Grand Hub", ja: "グランド ホールで ひらこう" }, reward: { en: "Three penguins", ja: "ペンギン 3わ" } },
  { en: "Penguin Paradise", ja: "ペンギンの らくえん", todo: { en: "Resting rocks, a swim, 2 questions", ja: "やすむ いわ・およぐ ところ・しつもん 2つ" }, reward: { en: "A penguin and Seal Cove", ja: "ペンギンと アザラシの いりえ" } },
  { en: "Seal Cove", ja: "アザラシの いりえ", todo: { en: "Haul-out rock, a dive, help 2 visitors", ja: "いわ・もぐる ところ・2にん たすける" }, reward: { en: "A play ball and Otter Bay", ja: "ボールと ラッコの わん" } },
  { en: "Otter Bay", ja: "ラッコの わん", todo: { en: "Floating toy, watch otters float, 1 question", ja: "おもちゃ・うかぶ ラッコ・しつもん 1つ" }, reward: { en: "A cozy den and a seal", ja: "かくれがと アザラシ" } },
  { en: "Coastal Celebration", ja: "かいがんの おいわい", todo: { en: "All three happy, one question each", ja: "3つ ぜんぶ ハッピー・しつもんを 1つずつ" }, reward: { en: "The Coastal & Polar trophy", ja: "かいがんの トロフィー" } }
] as const;

/** Celebrate milestones reached since `before` (the model already holds the rewards). */
export function celebrate(before: number) {
  const after = model().progress.coast?.milestone ?? 0;
  if (after <= before) return;
  const ms = COAST_MILESTONES[after - 1];
  audio.play("trophy");
  setGame({ coastCelebration: { milestone: after } });
  void speak(`${ms.en}!`);
  window.setTimeout(() => { if (getGame().coastCelebration?.milestone === after) setGame({ coastCelebration: null }); }, 4200);
}

/** Commit the model's own milestone check (items placed, happiness reached) and celebrate. */
export function checkCoastNow() {
  const before = model().progress.coast?.milestone ?? 0;
  updateModel((m) => checkCoastMilestones(m).m);
  celebrate(before);
}

/** Runtime-only sweep; the existing optional seen flag keeps saves compatible. */
export const coastReveal = { t0: null as number | null };
let revealTimer: number | undefined;
export function skipCoastReveal() {
  if (coastReveal.t0 === null) return;
  // Clear first: the model update below re-runs watchCoastIntro, which calls back in here.
  coastReveal.t0 = null;
  window.clearTimeout(revealTimer);
  if (getGame().previewAreas.includes("coast") && getGame().model.progress.coastOpen) {
    updateModel((m) => ({ ...m, progress: { ...m.progress, coastIntroSeen: true } }));
  }
  setGame({ coastRevealing: false });
}

export function coastRevealProgress() {
  if (coastReveal.t0 === null) return 1;
  return Math.max(0, Math.min(1, (rt.time - coastReveal.t0) / 7.2));
}

/** First visit: a brief coastal tour. Any tap, including a HUD action, skips it. */
export function watchCoastIntro(): () => void {
  const check = () => {
    const g = getGame();
    if (!inCoast(g) || !g.previewAreas.includes("coast")) { skipCoastReveal(); return; }
    if (coastReveal.t0 !== null || !g.model.progress.coastOpen || g.model.progress.coastIntroSeen || g.mode !== "play" || g.fade !== 0 || g.line || g.prompt) return;
    coastReveal.t0 = rt.time;
    setGame({ coastUnderwater: false, coastRevealing: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { skipCoastReveal(); return; }
    revealTimer = window.setTimeout(skipCoastReveal, 7200);
  };
  window.addEventListener("pointerdown", skipCoastReveal, true);
  window.addEventListener("keydown", skipCoastReveal, true);
  const unsubscribe = useGame.subscribe(check);
  check();
  return () => {
    unsubscribe();
    window.removeEventListener("pointerdown", skipCoastReveal, true);
    window.removeEventListener("keydown", skipCoastReveal, true);
    skipCoastReveal();
  };
}

/** The exhibit sign was tapped: hear the animal's name (never during a question). */
export function tapCoastSign(h: CoastHabitat) {
  const g = getGame();
  if (g.prompt || g.coastActivity) return;
  const word = h === "penguins" ? "Penguin." : h === "seals" ? "Seal." : "Sea otter.";
  void speak(word);
  toast({ en: word.replace(".", "!"), ja: EXHIBITS[h].ja, tone: "info" }, 1800);
}
