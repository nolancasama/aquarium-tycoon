import { commit, getGame, model, setGame, toast, updateModel, useGame, type GameState } from "../store";
import { COAST_HALL } from "../data/rooms";
import { EXHIBITS, type CoastHabitat } from "../data/coast";
import { COAST_DECOR } from "../data/decor";
import { PENGUIN_NUMBER_PHRASE } from "../logic/english";
import { award, buyDecor, clean, feed, tankAt } from "../logic/model";
import { buyPenguin, checkCoastMilestones, COAST_PRICE, coastUnlocked, coastQuestionHabitats, HABITAT_PAD, habitatOpen, openCoast, PENGUIN_PRICE, penguinBuyState, recordCoastActivity, storeHiddenCoast } from "../logic/coast";
import { clearCoastMeal, coastRt, feedCoast, holdAnimal, queuePenguinArrival, syncCoast } from "../coast/coastRuntime";
import { consumeKeeperBenefit, finishKeepers, keeperBusy, keeperRt, resetKeepers, startKeeperClean, startKeeperFeed, type KeeperCare } from "../coast/keeper";
import type { CoastDecorKind, VisitorType } from "../types";
import { ask, speak } from "./ask";
import { canTravel, comingSoon, travelTo } from "./hub";
import { areaAvailable, COAST_HABITATS_SHOWN, coastHabitatShown } from "../data/release";
import { audio } from "../../audio/audio";
import { effect, rt } from "../runtime";
import { latchRushCare } from "../rush/flow";
import { blendCoastShot, coastExhibitShot, COAST_VIEW_SECONDS, type CoastQuestionFrame } from "../coast/view";
import type { CameraShot } from "../runtime";

/**
 * The Coastal & Polar Zone's flow: buying it at the hub, the exhibit views,
 * habitat items, feeding, the English questions visitors ask at the windows
 * (each about what the animals are visibly doing), and milestone celebrations.
 * Every question is mic-free through the usual ask() prompt.
 */

export const inCoast = (g: GameState = getGame()) => g.screen === "game" && g.hall === COAST_HALL;

const cameraShot: CameraShot = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
const cameraFrom: CameraShot = { pos: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
let cameraKey = "", cameraElapsed = COAST_VIEW_SECONDS;
let questionFrame: { token: symbol; kind: CoastQuestionFrame } | null = null;
let reviewShot: CameraShot | null = null;

/** A question borrows the framing, never changes the player's selected view. */
export function frameCoastWaterForQuestion(includeLand = false): () => void {
  const token = Symbol("coast-question-camera");
  questionFrame = { token, kind: includeLand ? "count" : "water" };
  return () => { if (questionFrame?.token === token) questionFrame = null; };
}

/** Coast-only diagnostic hook; production UI never calls this. */
export function reviewCoastCamera(shot: CameraShot | null) { reviewShot = shot; }

export function releaseCoastCamera() {
  if (rt.camera.shot === cameraShot) rt.camera.shot = null;
  cameraKey = "";
  questionFrame = null;
  reviewShot = null;
}

/** A bounded move outside the window coping and above the lower floor. */
export function coastCameraTick(aspect: number, dt: number) {
  const g = getGame();
  const penguinView = g.coastView === "penguins" || (g.coastView === "all" && COAST_HABITATS_SHOWN.length === 1 && COAST_HABITATS_SHOWN[0] === "penguins");
  if (!inCoast(g) || g.coastRevealing || !penguinView) { releaseCoastCamera(); return; }
  // Other flow-owned shots retain ownership.
  if (rt.camera.shot && rt.camera.shot !== cameraShot) return;
  // Care never moves the camera (2026-11-14): only a visitor question borrows a framing.
  const frame = questionFrame?.kind;
  const key = `${g.coastView}:${g.coastUnderwater}:${frame ?? ""}:${aspect}:${reviewShot ? JSON.stringify(reviewShot) : ""}`;
  const points = questionFrame ? [...coastRt.animals.values()].filter((a) => a.habitat === "penguins" && (questionFrame?.kind === "count" || a.m.area === "water")).map((a) => ({ x: EXHIBITS.penguins.x + a.m.x, y: a.m.y, z: EXHIBITS.penguins.z + a.m.z })) : [];
  const target = reviewShot ?? coastExhibitShot(g.coastView, aspect, g.coastUnderwater, frame, points);
  if (cameraKey !== key) {
    Object.assign(cameraFrom.pos, rt.camera.pos); Object.assign(cameraFrom.target, rt.camera.target);
    cameraElapsed = 0;
    cameraKey = key;
  }
  cameraElapsed = Math.min(COAST_VIEW_SECONDS, cameraElapsed + dt);
  blendCoastShot(cameraFrom, target, cameraElapsed, cameraShot);
  rt.camera.shot = cameraShot;
  rt.camera.snap = true;
}

/** The habitat tank the current view manages (null in the overview). */
export function coastTank() {
  const g = getGame();
  if (!inCoast(g) || g.coastView === "all" || !coastHabitatShown(g.coastView)) return null;
  const t = tankAt(g.model, HABITAT_PAD[g.coastView]);
  return t && t.type === g.coastView ? t : null;
}

const free = () => {
  const g = getGame();
  return g.screen === "game" && g.mode === "play" && !g.prompt && !g.line && !g.settingsOpen && !g.coastActivity;
};

export function setCoastView(view: GameState["coastView"]) {
  if (view !== "all" && !coastHabitatShown(view)) return;
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
  setGame({ coastView: "penguins" });
  travelTo(COAST_HALL);
}

/** Habitat items are bought by tapping (the zone's English is in its observation questions). */
export function buyCoastItem(kind: CoastDecorKind) {
  if (!free() || !COAST_HABITATS_SHOWN.some((h) => COAST_DECOR[h].includes(kind))) return;
  const r = commit(buyDecor(model(), kind, null));
  if (!r.ok) {
    audio.play("error");
    toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    return;
  }
  audio.play("purchase");
  setGame({ panel: "decorate", placing: { kind: "decor", decorId: r.id! } });
}

let lastPenguinBuy = -Infinity;
/**
 * Buy one penguin (60 coins). The purchase and its new id are committed (and
 * saved) at once; the walk out of the staff door is presentation only. One
 * per tap: a second tap is refused while that penguin's door is still busy.
 */
export function buyPenguinNow(): boolean {
  const g = getGame(), now = performance.now();
  if (!free() || !inCoast(g) || g.coastView !== "penguins" || g.panel || g.placing || keeperBusy() || coastRt.arrivals.length || now - lastPenguinBuy < 900) return false;
  const state = penguinBuyState(g.model);
  if (!state.ok) {
    audio.play("error");
    if (state.reason === "coins") toast({ en: "More coins, please!", ja: `${PENGUIN_PRICE} コイン ひつようだよ`, tone: "warn" });
    return false;
  }
  const r = commit(buyPenguin(g.model));
  if (!r.ok || !r.id) return false;
  lastPenguinBuy = now;
  queuePenguinArrival(r.id);
  audio.play("purchase");
  // The view is never switched for the player; from Underwater they are told where to look.
  toast(g.coastUnderwater
    ? { en: "A penguin, please! Here it comes!", ja: "ペンギンが くるよ！「ペンギン」で ドアを みてね", tone: "good" }
    : { en: "A penguin, please! Here it comes!", ja: "ペンギンが くるよ！ ドアを みてね", tone: "good" }, 3200);
  return true;
}

export const habitatItems = (h: CoastHabitat) => coastHabitatShown(h) ? COAST_DECOR[h] : [];

/** Feed: the food the habitat's animals eat; on land they go to the fish station, in the water to the front. */
export function feedCoastVisual(h: CoastHabitat) {
  if (!coastHabitatShown(h)) return;
  feedCoast(model(), h);
}

// ------------------------------------------------------------------ English at the windows

/** Which animal a question is about (the scene rings it). */
export const coastFocus = { id: null as string | null, numbers: false };

// One transaction owns both care presentations. No promises/timers can outlive it.
let careTankId: string | null = null;
let stopCareWatch: (() => void) | null = null;
let cleanFrame = -1;
function stopCareSubscription() { const stop = stopCareWatch; stopCareWatch = null; stop?.(); }

/** Penguin branch of the shared actions: guard before applying any care maths. */
export function startPenguinCare(kind: KeeperCare): boolean {
  const g = getGame(), tank = coastTank();
  if (!free() || g.stageCard || g.panel || g.placing || g.model.rush?.phase === "results" || !tank || tank.type !== "penguins" || keeperBusy() || careTankId) return false;
  if (kind === "feed" && (!tank.fish.length || tank.food >= 90)) return false;
  syncCoast(g.model);
  if (!(kind === "feed" ? startKeeperFeed(g.model) : startKeeperClean(g.model))) return false;
  careTankId = tank.id; cleanFrame = -1;
  const preview = g.previewAreas.includes("coast");
  stopCareWatch = useGame.subscribe((now) => {
    const previewEnded = preview && !now.previewAreas.includes("coast");
    if (!inCoast(now) || previewEnded || !now.model.tanks.some((t) => t.id === careTankId && t.type === "penguins")) {
      stopCareSubscription();
      if (!previewEnded) { finishKeepers(); applyKeeperBenefits(); }
      // Ending preview restores its entire original model, discarding temporary care too.
      careTankId = null; resetKeepers(); clearCoastMeal();
    }
  });
  return true;
}

function applyKeeperBenefits() {
  const id = careTankId;
  if (!id) return;
  if (consumeKeeperBenefit("feed")) {
    const r = commit(feed(model(), id));
    if (r.ok) { latchRushCare(); audio.play("sprinkle"); }
  }
  if (consumeKeeperBenefit("clean")) {
    const r = commit(clean(model(), id));
    if (r.ok) {
      latchRushCare(); rt.cleaning.set(id, rt.time);
      const ex = EXHIBITS.penguins;
      for (const dx of [-3, 0, 3]) effect("sparkle", ex.x + dx, ex.pool.surface + 0.3, ex.z + 2, 8);
      audio.play("scrub");
    }
  }
}

/** Immediately after the coast step; sound is emitted only on discrete montage cuts. */
export function coastKeeperTick() {
  if (!careTankId) return;
  applyKeeperBenefits();
  const c = keeperRt.clean;
  if (c.phase === "montage" && c.frame !== cleanFrame) {
    cleanFrame = c.frame;
    audio.play("tick");
  }
  if (!keeperBusy()) { stopCareSubscription(); careTankId = null; }
}

const VISITORS: VisitorType[] = ["child", "adult", "fan", "grandma", "explorer"];
let nextVisitorAt = 12;

/** A visitor comes to a window with a question now and then (only while the zone is shown and calm). */
export function coastVisitorTick() {
  const g = getGame();
  if (!inCoast(g) || g.coastRevealing || g.coastWaiting || g.coastActivity || !free() || g.panel || g.placing || keeperRt.arrival.phase !== "idle") return;
  if (coastRt.time < nextVisitorAt) return;
  nextVisitorAt = coastRt.time + 22 + Math.random() * 14;
  const open = coastQuestionHabitats(g.model);
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
  // Questions count and hold every penguin: wait until a newcomer is out of the doorway.
  if (!w || !free() || !coastHabitatShown(w.habitat) || keeperRt.arrival.phase !== "idle" || coastRt.arrivals.length) return;
  skipCoastReveal();
  setGame({ coastWaiting: null, coastView: w.habitat, ...(w.habitat !== "penguins" ? { coastUnderwater: false } : {}), coastActivity: { habitat: w.habitat, by: w.type }, panel: null, placing: null });
  const restoreCamera = w.habitat === "penguins" ? frameCoastWaterForQuestion(true) : () => {};
  // Let the camera arrive before asking.
  await new Promise((r) => window.setTimeout(r, rt.time > 0 ? 700 : 0));
  let ok = false;
  try {
    if (w.habitat === "penguins") ok = await askPenguins(w.type);
    else if (w.habitat === "seals") ok = await askSeal(w.type);
    else ok = await askOtter(w.type);
  } finally {
    restoreCamera();
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
  // Ring a steady animal so identification is about one visible seal.
  const steady = seals.find((a) => a.m.mode === "rest" || a.m.mode === "swim" || a.m.mode === "breathe") ?? seals[0];
  holdAnimal(steady.m.id, 30);
  coastFocus.id = steady.m.id;
  const id = await ask({
    pattern: "identify",
    kind: "command",
    options: ["itsSeal"],
    judge: ["itsSeal", "itsPenguin", "itsOtter"],
    choices: ["itsSeal", "itsPenguin", "itsOtter"],
    question: { en: "What's this?", ja: "これは なに？", by },
    readQuestion: true,
    cancellable: true,
    help: "ひかっている いきものは なに？"
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
  const id = await ask({
    pattern: "identify",
    kind: "command",
    options: ["itsOtter"],
    judge: ["itsOtter", "itsSeal", "itsPenguin"],
    choices: ["itsOtter", "itsSeal", "itsPenguin"],
    question: { en: "What's this?", ja: "これは なに？", by },
    readQuestion: true,
    cancellable: true,
    help: "ひかっている いきものは なに？"
  });
  coastRt.hold.delete(a.m.id);
  return Boolean(id);
}

// ------------------------------------------------------------------ milestones

export const COAST_MILESTONES = [
  { en: "Open the Coast", ja: "かいがんを ひらこう", todo: { en: "Open the zone at the Grand Hub", ja: "グランド ホールで ひらこう" }, reward: { en: "Two penguins", ja: "ペンギン 2わ" } },
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

/** Reward text follows the same content switch as the actual reward. */
export const coastMilestoneReward = (milestone: number) => milestone === 2 && !coastHabitatShown("seals")
  ? { en: "A penguin", ja: "ペンギン 1わ" }
  : COAST_MILESTONES[milestone - 1].reward;

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
  let lastInCoast = false;
  const check = () => {
    const g = getGame();
    const here = inCoast(g);
    const entering = here && !lastInCoast;
    lastInCoast = here;
    if (here) {
      const active = storeHiddenCoast(g.model);
      // With one habitat shown, "all" is the same picture as that habitat, so it is not offered.
      const invalidView = g.coastView === "all" ? COAST_HABITATS_SHOWN.length < 2 : !coastHabitatShown(g.coastView);
      const hiddenVisitor = g.coastWaiting && !coastHabitatShown(g.coastWaiting.habitat);
      const hiddenActivity = g.coastActivity && !coastHabitatShown(g.coastActivity.habitat);
      if (active !== g.model || invalidView || entering || hiddenVisitor || hiddenActivity) {
        setGame({ ...(active !== g.model ? { model: active } : {}), ...(invalidView || entering ? { coastView: "penguins", coastUnderwater: false, panel: null, placing: null } : {}), ...(hiddenVisitor ? { coastWaiting: null } : {}), ...(hiddenActivity ? { coastActivity: null } : {}) });
        return;
      }
    }
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
  if (g.prompt || g.coastActivity || !coastHabitatShown(h)) return;
  const word = h === "penguins" ? "Penguin." : h === "seals" ? "Seal." : "Sea otter.";
  void speak(word);
  toast({ en: word.replace(".", "!"), ja: EXHIBITS[h].ja, tone: "info" }, 1800);
}
