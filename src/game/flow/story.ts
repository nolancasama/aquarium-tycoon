import { commit, getGame, model, nudge, setGame, toast, updateModel, useGame, type Panel, type Reward } from "../store";
import { effect, resetRuntime, rt } from "../runtime";
import type { StageId } from "../types";
import { SPECIES } from "../data/fish";
import {
  completeStage,
  earnStar,
  earnSuperStar,
  finishSpecial,
  fishCount,
  giftFish,
  judgeReady,
  markCounted,
  needsGift,
  newModel,
  setCare,
  setTutorial,
  stageDone,
  type Model,
  type TutorialStep
} from "../logic/model";
import { nextStep, type Step } from "../logic/guide";
import { countableTanks, presentColors, type Request } from "../logic/requests";
import { NUMBER_IDS, NUMBER_PHRASE } from "../logic/english";
import { clearSave, encodeSave, rawSaveExists, readSave, writeSave } from "../logic/save";
import { ask, say, wait } from "./ask";
import { backToRoom, openTank, orderFish, startPlacingFish } from "./actions";
import { celebrate, leave, numberSlots, numbersAround, resetVisitors, runRequest, helped, scripted, spawnVisitor, walkTo } from "./visitors";
import { ENTRY, PEDESTAL, lookSpot, route } from "../world";
import { HALL_OF } from "../data/tanks";
import { audio } from "../../audio/audio";
import { tts } from "../../audio/tts";
import { recognition, requestMicPermission } from "../../audio/recognition";

/**
 * Starting, continuing and saving; the tutorial with Pico; stage rewards;
 * Pico's counting question; the fish fan's photo day; the judge and the
 * Aquarium Star; nudges when a student stalls.
 */

// ------------------------------------------------------------------ save

let lastSaved = "";
let saveTimer = 0;

export function saveNow() {
  const g = getGame();
  if (g.screen === "title") return;
  const text = encodeSave(g.model);
  if (text === lastSaved) return;
  lastSaved = text;
  writeSave(text);
}

export function installAutosave(): () => void {
  const unsub = useGame.subscribe((s, prev) => {
    if (s.panel && s.panel !== prev.panel && s.screen === "game") noteGuidePanel(s.panel);
    if (s.model === prev.model || s.screen === "title") return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 800);
  });
  const onHide = () => saveNow();
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onHide);
  return () => {
    unsub();
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onHide);
  };
}

export function hasSaved(): boolean {
  return readSave() !== null;
}

/** A save is stored but cannot be read (corrupted or from another version). */
export function saveIsLost(): boolean {
  return rawSaveExists() && readSave() === null;
}

// ------------------------------------------------------------------ flow control

/** Bumped when the game is left: running scripts stop at their next wait. */
let gen = 0;
let busyFlow = false;

class Abort extends Error {}

function alive(g: number) {
  if (g !== gen) throw new Abort();
}

/** Wait until `pred` holds (checked every 100 ms), unless the game is left. */
function until(pred: () => boolean, g: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (g !== gen) {
        reject(new Abort());
        return;
      }
      if (pred()) resolve();
      else window.setTimeout(check, 100);
    };
    check();
  });
}

async function flow(fn: (g: number) => Promise<void>) {
  if (busyFlow) return;
  busyFlow = true;
  const g = gen;
  try {
    await fn(g);
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
  } finally {
    if (g === gen) {
      busyFlow = false;
      if (getGame().mode === "busy") setGame({ mode: "play" });
      setGame({ guide: null });
    }
  }
}

const setStep = (step: TutorialStep) => updateModel((m) => setTutorial(m, step));

// ------------------------------------------------------------------ start

async function beginAudio() {
  audio.unlock();
  const s = getGame().settings;
  audio.setVolumes(s.music, s.sfx);
  tts.setRate(s.slowVoice ? 0.8 : 1);
  audio.startAmbience();
  audio.startMusic("aquarium");
  // The microphone is requested once, up front (never mid-sentence).
  if (s.mic && getGame().micState === "unknown") {
    if (!recognition.supported) setGame({ micState: "unsupported" });
    else
      void requestMicPermission(8000).then((r) => {
        if (getGame().micState === "unknown") setGame({ micState: r === "granted" ? "ready" : r === "timeout" ? "unknown" : "blocked" });
      });
  }
}

function enter(m: Model) {
  gen++;
  busyFlow = false;
  scripted.busy = false;
  resetRuntime();
  resetVisitors();
  resetHints();
  lastSaved = "";
  setGame({
    screen: "game",
    mode: "play",
    view: "room",
    tankId: null,
    panel: null,
    placing: null,
    model: m,
    prompt: null,
    line: null,
    request: null,
    stageCard: null,
    settingsOpen: false,
    confirmNew: false,
    saveLost: false,
    guide: null,
    nudge: null
  });
}

export async function newGame() {
  clearSave();
  void beginAudio();
  enter(newModel());
  saveNow();
  void flow(tutorial);
}

export async function continueGame() {
  const data = readSave();
  if (!data) {
    setGame({ hasSave: false, saveLost: saveIsLost() });
    return;
  }
  void beginAudio();
  enter(data.model);
  if (data.model.progress.tutorial !== "done") void flow(tutorial);
}

export function toTitle() {
  saveNow();
  gen++;
  busyFlow = false;
  scripted.busy = false;
  tts.cancel();
  audio.startMusic("aquarium");
  setGame({
    screen: "title",
    mode: "busy",
    hasSave: hasSaved(),
    settingsOpen: false,
    prompt: null,
    line: null,
    request: null,
    stageCard: null,
    panel: null,
    placing: null,
    view: "room",
    tankId: null
  });
  rt.visitors = [];
}

/** Results → keep playing in free play. */
export function keepPlaying() {
  audio.startMusic("aquarium");
  setGame({ screen: "game", mode: "play", view: "room", tankId: null });
  // After the star, Level 6 begins: point at the Ocean Hall.
  const p = model().progress;
  if (p.stage === 6 && !p.hallOpen) {
    rt.pico.waveT0 = rt.time;
    nudge({ en: "A new hall!", ja: "「タンク」で うみの ホールを ひらこう!", target: "btn-tank-shop" }, 9000);
  }
}

// ------------------------------------------------------------------ tutorial

async function tutorial(g: number) {
  const step = () => model().progress.tutorial;
  if (step() === "intro") {
    setGame({ mode: "busy" });
    await wait(700);
    alive(g);
    await say("pico", "Hello!", "こんにちは! ぼくは ペンギンの ピコ。この すいぞくかんの かかりだよ");
    alive(g);
    await say("pico", "Let's get a fish!", "さかなを かおう!");
    alive(g);
    setStep("buy");
  }
  if (step() === "buy") {
    setGame({ mode: "play" });
    // Not cancellable in the tutorial: it resolves when a fish is bought.
    while (!model().inv.fish.length && fishCount(model()) === 0) {
      await orderFish({ tutorial: true });
      alive(g);
    }
    setStep("place");
  }
  if (step() === "place") {
    const bag = model().inv.fish[0];
    if (bag) {
      startPlacingFish(bag.id);
      setGame({ mode: "play", guide: "tank-A" });
      await until(() => model().inv.fish.length === 0, g);
    }
    // The new fish arrives hungry: feeding is the next lesson.
    const t = model().tanks[0];
    updateModel((m) => setCare(m, t.id, 45, 100));
    setStep("feed");
  }
  if (step() === "feed") {
    const t = model().tanks.find((x) => x.fish.length) ?? model().tanks[0];
    openTank(t.id);
    if (!model().progress.fedOnce) {
      if (t.food >= 90) updateModel((m) => setCare(m, t.id, 45, 100));
      setGame({ mode: "play", guide: "btn-feed" });
      nudge({ en: "Your fish is hungry!", ja: "おなかが すいているよ。「えさ」を おそう" }, 9000);
      await until(() => model().progress.fedOnce, g);
      setGame({ guide: null, nudge: null });
      await wait(3200);
      alive(g);
    }
    setStep("visitor");
  }
  if (step() === "visitor") {
    backToRoom();
    setGame({ mode: "busy" });
    await say("pico", "Look! A visitor!", "おきゃくさんが きたよ!");
    alive(g);
    const first = model().progress.firstFish ?? model().tanks[0].fish[0]?.species ?? "clownfish";
    const req: Request = { kind: "show", color: SPECIES[first].color, fishOnly: true };
    const v = spawnVisitor("child", req);
    await until(() => v.state === "sit", g);
    setGame({ mode: "play" });
    nudge({ en: "Show the fish!", ja: "タンクを ひらいて、その さかなを タップしよう" }, 9000);
    for (;;) {
      const out = await runRequest(v, req, { cancellable: false });
      alive(g);
      if (out.ok) {
        await helped(v, req, out.tankId);
        break;
      }
    }
    alive(g);
    await stageComplete(g);
  }
  if (step() === "decorate") {
    setGame({ mode: "busy" });
    backToRoom();
    await say("pico", "Let's decorate!", "かざりを プレゼント! タンクに おいてみよう");
    alive(g);
    const t = model().tanks[0];
    openTank(t.id);
    setGame({ mode: "play", panel: "decorate", guide: "tray" });
    await until(() => model().tanks.some((x) => x.decor.length > 0), g);
    setGame({ guide: null, nudge: null });
    await wait(900);
    alive(g);
    setGame({ mode: "busy", panel: null, placing: null });
    await say("pico", "Great!", "すてき! かざりが あると さかなが よろこぶよ");
    alive(g);
    setStep("done");
    await say("pico", "Have fun!", "じゆうに あそぼう! めあては 上の カードに あるよ");
    alive(g);
  }
}

// ------------------------------------------------------------------ stages

const REWARD: Record<number, Reward> = { 1: "decor", 2: "yellow", 3: "tank", 4: "special", 6: "tall", 7: "upgrades" };
let cardDone: (() => void) | null = null;

export function closeStageCard() {
  if (!getGame().stageCard) return;
  audio.play("tick");
  setGame({ stageCard: null });
  const done = cardDone;
  cardDone = null;
  done?.();
}

/** The stage card, its reward, and what follows it. */
async function stageComplete(g: number) {
  const stage = model().progress.stage as StageId;
  backToRoom();
  setGame({ mode: "busy", panel: null, placing: null });
  audio.play("unlock");
  effect("confetti", 0, 2.6, 0, 40);
  await new Promise<void>((resolve) => {
    cardDone = resolve;
    setGame({ stageCard: { stage, reward: REWARD[stage] }, nudge: null });
  });
  alive(g);
  commit(completeStage(model()));
  if (stage === 2) {
    await say("pico", "A new fish!", "あたらしい さかなが かえるよ! おみせを みてね");
  } else if (stage === 3) {
    await say("pico", "A big tank!", "おおきな タンクが かえるよ!「タンク」の ボタンを みてね");
  } else if (stage === 4) {
    await specialVisit(g);
  } else if (stage === 6) {
    await say("pico", "A tall tank!", "たかい タンクが かえるよ! タツノオトシゴと クラゲは たかい タンクに すむよ");
  } else if (stage === 7) {
    await say("pico", "New decorations!", "あたらしい かざりと アップグレードが かえるよ! タンクを ひらいて みてね");
  }
  alive(g);
}

/** Stage 4 reward: the fish fan's photo day. */
async function specialVisit(g: number) {
  scripted.busy = true;
  try {
    setGame({ mode: "busy" });
    backToRoom();
    await say("pico", "A special visitor!", "とくべつな おきゃくさん! しゃしんを とりに きたよ");
    alive(g);
    const fan = spawnVisitor("fan", null, { scripted: true });
    await walkTo(fan, [ENTRY]);
    for (const t of model().tanks) {
      alive(g);
      await walkTo(fan, [lookSpot(t.slot, 1)]);
      fan.face = { x: lookSpot(t.slot, 1).x, z: -9 };
      fan.anim = { kind: "photo", t0: rt.time };
      await wait(500);
      effect("flash", fan.x, 1.6, fan.z - 0.4);
      audio.play("flash");
      await wait(900);
    }
    alive(g);
    fan.bubble = "heart";
    fan.bubbleT0 = rt.time;
    await say("fan", "Wow! I like your aquarium!", "すてきな すいぞくかん! しゃしんを かざってね");
    alive(g);
    updateModel(finishSpecial);
    effect("coins", fan.x, 2, fan.z, 8);
    audio.play("coin");
    toast({ en: "A photo for your wall!", ja: "かべに しゃしんが かざられたよ", tone: "good" });
    fan.scripted = false;
    leave(fan);
  } finally {
    scripted.busy = false;
  }
}

/** Stage 2: Pico asks "How many fish?" once two fish share a tank. */
async function picoCount(g: number) {
  const m = model();
  const t = countableTanks(m)[0];
  if (!t) return;
  setGame({ mode: "busy", panel: null, placing: null });
  openTank(t.id);
  await say("pico", "Let's count!", "さかなを かぞえよう!");
  alive(g);
  setGame({ mode: "play" });
  const n = t.fish.length;
  await ask({
    kind: "command",
    options: [NUMBER_PHRASE[n]],
    judge: NUMBER_IDS,
    frame: { before: "", after: " fish!", slots: numberSlots(n) },
    choices: numbersAround(n),
    shuffle: false,
    question: { en: "How many fish?", by: "pico" },
    readQuestion: true,
    help: "さかなは なんびき? かぞえて えいごで いおう",
    onClue: () => {
      rt.countGlow = { tankId: t.id, t0: rt.time };
    }
  });
  rt.countGlow = null;
  alive(g);
  updateModel(markCounted);
  await say("pico", "Yes! Good counting!", "せいかい! よく かぞえたね");
}

/** Stage 5: the judge inspects three things; it cannot be failed. */
async function judgeVisit(g: number) {
  scripted.busy = true;
  try {
    backToRoom();
    setGame({ mode: "busy", panel: null, placing: null, request: null });
    for (const v of rt.visitors) if (!v.scripted) leave(v);
    await say("pico", "The judge is here!", "しんさいんさんが きたよ! アクアリウム スターに なれるかな?");
    alive(g);
    const judge = spawnVisitor("judge", null, { scripted: true });
    let m = model();
    const withFish = m.tanks.filter((t) => t.fish.length);
    const colors = presentColors(m, true);
    // 1. "I like ___ fish!" at the first tank.
    const first = withFish[0];
    await walkTo(judge, [ENTRY, lookSpot(first.slot, 0)]);
    alive(g);
    judge.face = { x: lookSpot(first.slot, 0).x, z: -9 };
    setGame({ mode: "play" });
    const color = colors[Math.floor(Math.random() * colors.length)];
    const show: Request = { kind: "show", color, fishOnly: true };
    for (;;) {
      const out = await runRequest(judge, show, { cancellable: false });
      alive(g);
      if (out.ok) {
        await celebrate(judge, out.tankId);
        break;
      }
    }
    alive(g);
    // 2. "How many fish?" at a tank with 2–5 fish.
    m = model();
    const ct = countableTanks(m).sort((a, b) => (a.id === first.id ? 1 : 0) - (b.id === first.id ? 1 : 0))[0];
    if (ct) {
      backToRoom();
      setGame({ mode: "busy" });
      await walkTo(judge, [lookSpot(ct.slot, 0)]);
      alive(g);
      setGame({ mode: "play" });
      await runRequest(judge, { kind: "count", tankId: ct.id }, { cancellable: false });
      alive(g);
    }
    // 3. "Do you like your aquarium?" — both answers are good.
    backToRoom();
    setGame({ mode: "busy" });
    await walkTo(judge, [{ x: -1.2, z: 1.2 }]);
    judge.face = { x: 0, z: -3 };
    alive(g);
    setGame({ mode: "play" });
    const yes = await ask({
      kind: "choice",
      options: ["yesIDo", "noIDont"],
      question: { en: "Do you like your aquarium?", by: "judge" },
      readQuestion: true,
      help: "こたえよう!"
    });
    alive(g);
    setGame({ mode: "busy" });
    await say("judge", yes === "noIDont" ? "Really? I love it!" : "Me too! It's wonderful!", yes === "noIDont" ? "ほんと? わたしは だいすき!" : "わたしも! すばらしい!");
    alive(g);
    judge.anim = { kind: "clap", t0: rt.time };
    await say("judge", "You are an Aquarium Star!", "あなたは アクアリウム スター!");
    alive(g);
    updateModel(earnStar);
    audio.play("trophy");
    audio.startMusic("celebrate");
    effect("confetti", PEDESTAL.x, 2.2, PEDESTAL.z, 60);
    effect("sparkle", PEDESTAL.x, 1.4, PEDESTAL.z, 12);
    rt.camera.shot = { pos: { x: PEDESTAL.x + 2.6, y: 2.3, z: PEDESTAL.z + 3.6 }, target: { x: PEDESTAL.x, y: 1.1, z: PEDESTAL.z } };
    await wait(3200);
    alive(g);
    rt.camera.shot = null;
    judge.scripted = false;
    // Gone at once: walking out, the judge would cross the trophy shot.
    judge.state = "gone";
    setGame({ screen: "results", mode: "play" });
  } finally {
    scripted.busy = false;
  }
}

/** Level 8: the judge returns: "What's this?", "How many fish?", a yes/no, then the crown. */
async function judgeVisit2(g: number) {
  scripted.busy = true;
  try {
    backToRoom();
    setGame({ mode: "busy", panel: null, placing: null, request: null, hall: 0 });
    for (const v of rt.visitors) if (!v.scripted) leave(v);
    await say("pico", "The judge is back!", "しんさいんさんが また きたよ! スーパー スターに なれるかな?");
    alive(g);
    const judge = spawnVisitor("judge", null, { scripted: true });
    await walkTo(judge, [ENTRY]);
    alive(g);
    // 1. "What's this?" about a sea animal.
    const home = model().tanks.find((t) => t.fish.some((f) => SPECIES[f.species].kind === "animal"));
    if (home) {
      const animal = home.fish.find((f) => SPECIES[f.species].kind === "animal")!;
      setGame({ hall: HALL_OF[home.slot] });
      await walkTo(judge, route(judge, lookSpot(home.slot, 0)));
      alive(g);
      setGame({ mode: "play" });
      await runRequest(judge, { kind: "whatsThis", tankId: home.id, fishId: animal.id }, { cancellable: false });
      alive(g);
      await celebrate(judge, home.id);
      alive(g);
    }
    // 2. "How many fish?" at a tank of fish.
    const ct = countableTanks(model())[0];
    if (ct) {
      backToRoom();
      setGame({ mode: "busy", hall: HALL_OF[ct.slot] });
      await walkTo(judge, route(judge, lookSpot(ct.slot, 0)));
      alive(g);
      setGame({ mode: "play" });
      await runRequest(judge, { kind: "count", tankId: ct.id }, { cancellable: false });
      alive(g);
    }
    // 3. "Do you like sea animals?" — both answers are good.
    backToRoom();
    setGame({ mode: "busy", hall: 0 });
    await walkTo(judge, route(judge, { x: -1.2, z: 1.2 }));
    judge.face = { x: 0, z: -3 };
    alive(g);
    setGame({ mode: "play" });
    const yes = await ask({
      kind: "choice",
      options: ["yesIDo", "noIDont"],
      question: { en: "Do you like sea animals?", by: "judge" },
      readQuestion: true,
      help: "こたえよう!"
    });
    alive(g);
    setGame({ mode: "busy" });
    await say("judge", yes === "noIDont" ? "Really? I love them!" : "Me too!", yes === "noIDont" ? "ほんと? わたしは だいすき!" : "わたしも!");
    alive(g);
    judge.anim = { kind: "clap", t0: rt.time };
    await say("judge", "You are a Super Aquarium Star!", "あなたは スーパー アクアリウム スター!");
    alive(g);
    updateModel(earnSuperStar);
    audio.play("trophy");
    audio.startMusic("celebrate");
    effect("confetti", PEDESTAL.x, 2.2, PEDESTAL.z, 60);
    effect("sparkle", PEDESTAL.x, 1.6, PEDESTAL.z, 12);
    rt.camera.shot = { pos: { x: PEDESTAL.x + 2.6, y: 2.3, z: PEDESTAL.z + 3.6 }, target: { x: PEDESTAL.x, y: 1.2, z: PEDESTAL.z } };
    await wait(3200);
    alive(g);
    rt.camera.shot = null;
    judge.scripted = false;
    // Gone at once: walking out, the judge would cross the trophy shot.
    judge.state = "gone";
    setGame({ screen: "results", mode: "play" });
  } finally {
    scripted.busy = false;
  }
}

async function giftFlow(g: number) {
  const r = commit(giftFish(model()));
  if (!r.ok) return;
  setGame({ mode: "busy" });
  await say("pico", "A present for you!", "プレゼント! さかなを どうぞ");
  alive(g);
  setGame({ mode: "play" });
  startPlacingFish(r.id!);
}

// ------------------------------------------------------------------ watchers

let checkClock = 0;
let hintKey = "";
let hintTier: 0 | 1 | 2 = 0;
let wrongPanels = 0;
let pendingHint = false;
let guideModel: Model | null = null;
let guideStep: Step | null = null;

function resetHints() {
  hintKey = "";
  hintTier = 0;
  wrongPanels = 0;
  pendingHint = false;
  guideModel = null;
  guideStep = null;
  rt.idle = 0;
}

/** Cache by immutable model identity; storyTick itself runs every frame. */
function currentStep() {
  const m = model();
  if (guideModel !== m) {
    guideModel = m;
    guideStep = nextStep(m);
  }
  const key = guideStep ? `${m.progress.stage}:${guideStep.goal}` : "";
  if (key !== hintKey) {
    hintKey = key;
    hintTier = 0;
    wrongPanels = 0;
    pendingHint = false;
    rt.idle = 0;
    if (getGame().nudge?.tier) setGame({ nudge: null });
  }
  return guideStep;
}

function noteGuidePanel(panel: Panel) {
  const step = currentStep();
  if (!step || model().progress.tutorial !== "done") return;
  const expected: Partial<Record<string, Panel>> = {
    "btn-tank-shop": "tankShop", "btn-fish-shop": "fishShop", "btn-animal-shop": "animalShop",
    "btn-decor-shop": "decorShop", "btn-decorate": "decorate", "tray": "decorate", "btn-upgrade": "upgrade"
  };
  if (panel === expected[step.target ?? ""]) return;
  if (panel === "upgrade" && (step.goal === "upgrade" || step.shopItem === "lamp")) return;
  if (panel === "decorate" && (step.goal === "decorBig" || step.goal === "allHappy") && !step.shopItem) return;
  wrongPanels++;
  if (wrongPanels >= 2) {
    wrongPanels = 0;
    pendingHint = true;
  }
}

/** Help and idle nudges share one ladder: A is the HUD, B and C are Pico. */
export function showGuideHint() {
  const g = getGame();
  const step = currentStep();
  if (!step || g.screen !== "game" || g.mode !== "play" || g.prompt || g.line || g.request || g.stageCard || g.settingsOpen) return;
  // Help can reopen C; only the first appearance of each tier animates Pico.
  const repeated = hintTier === 2;
  hintTier = hintTier === 0 ? 1 : 2;
  let text = hintTier === 1 ? step.where : step.exact;
  let target = step.target;
  if (g.view === "tank" && ["btn-fish-shop", "btn-animal-shop", "btn-decor-shop", "btn-tank-shop", "chip-box"].includes(target ?? "") && !g.panel) {
    target = "btn-back";
    text = { en: `Tap Back. ${text.en}`, ja: `「もどる」を おそう。${text.ja}` };
  }
  if (target?.startsWith("tank-")) {
    const tank = g.model.tanks.find((t) => `tank-${t.slot}` === target);
    const placingAnimal = ["buyFish", "twoFish", "fishInBig", "turtle", "tallAnimal", "count"].includes(step.goal) && g.model.inv.fish.length > 0;
    if (g.view === "tank" && (tank?.id !== g.tankId || (placingAnimal && !g.placing))) target = "btn-back";
    else if (g.view === "tank" && tank) {
      if (step.goal === "feed") target = "btn-feed";
      else if (step.goal === "clean") target = "btn-clean";
      else if (step.goal === "decorBig") target = g.panel === "decorate" ? "tray" : "btn-decorate";
      else if (step.goal === "upgrade" || step.shopItem === "lamp") target = "btn-upgrade";
      else if (step.goal === "allHappy") target = tank.food < 90 ? "btn-feed" : tank.clean < 100 ? "btn-clean" : g.panel === "decorate" ? "tray" : "btn-decorate";
    }
    else if (g.view === "room" && tank && HALL_OF[tank.slot] !== g.hall) target = g.hall ? "btn-hall-prev" : "btn-hall-next";
    else if (!g.placing && placingAnimal) target = "chip-bag";
  }
  rt.idle = 0;
  if (!repeated) rt.pico.waveT0 = rt.time;
  nudge({ ...text, target, tier: hintTier, shopItem: hintTier === 2 ? step.shopItem : undefined, repeated }, 12000);
}

export function storyTick(dt: number) {
  const g = getGame();
  if (busyFlow || g.screen !== "game") return;
  const m = g.model;
  // Idle time toward Pico's nudge.
  const step = currentStep();
  const quiet = g.mode === "play" && !g.prompt && !g.request && !g.stageCard && !g.settingsOpen && !g.placing;
  if (quiet) rt.idle += dt;
  checkClock += dt;
  if (checkClock < 0.25) return;
  checkClock = 0;
  if (m.progress.tutorial === "done" && quiet && (pendingHint || rt.idle > 45)) {
    pendingHint = false;
    rt.idle = 0;
    if (hintTier < 2 && (step?.target !== "chip-visitor" || g.waiting)) showGuideHint();
  }
  // Rewards may interrupt the decorating tray (the goal was just met there), never a carried item.
  const calm = g.mode === "play" && !g.prompt && !g.request && !g.stageCard && !g.settingsOpen && !g.placing && (!g.panel || g.panel === "decorate");
  if (!calm || m.progress.tutorial !== "done") return;
  if (needsGift(m)) {
    void flow(giftFlow);
    return;
  }
  if (m.progress.specialPending) {
    void flow(specialVisit);
    return;
  }
  const st = m.progress.stage;
  if ((st <= 4 || st === 6 || st === 7) && stageDone(m)) {
    void flow(stageComplete);
    return;
  }
  if (judgeReady(m)) {
    void flow(st === 8 ? judgeVisit2 : judgeVisit);
    return;
  }
  if (m.progress.stage === 2 && !m.progress.counted && countableTanks(m).length) {
    void flow(picoCount);
    return;
  }
}

/** Tests: is a scripted flow running? */
export function flowBusy() {
  return busyFlow;
}
