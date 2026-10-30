import { commit, getGame, model, setGame, toast, type Panel } from "../store";
import { effect, rt } from "../runtime";
import type { DecorKind, DecorVariant, SlotId, SpeciesId, TankType } from "../types";
import { ANIMAL_ORDER, FISH_ORDER, JELLY_BY_COLOR, SPECIES, SPECIES_BY_COLOR } from "../data/fish";
import { DECOR } from "../data/decor";
import { HALL_OF, PAD_TYPES, TANKS } from "../data/tanks";
import { roomOpen } from "../data/rooms";
import {
  buyDecor,
  buyFish,
  buyTank,
  buyTickets,
  buyUpgrade,
  bagAnimal,
  canLive,
  clean,
  feed,
  hasSpace,
  homesFor,
  homeReason,
  isSpeciesUnlocked,
  moveDecor,
  openHall,
  openGallery,
  placeDecor,
  placeFish,
  placeTank,
  remodelPlan,
  remodelTank,
  setLight,
  LIGHT_COLORS,
  EXPANSION_FROM,
  storeDecor,
  tankAt,
  tankById,
  tanksUnlocked,
  upgradesUnlocked,
  type TutorialStep,
  type HomeReason,
  type Model,
  type UpgradeKind
} from "../logic/model";
import { ANIMAL_PHRASE, SHOP_COLOR_PHRASE, colorOfPhrase, speciesOfPhrase, type PhraseId } from "../logic/english";
import { ask, say, speak } from "./ask";
import { answerShow, inspectRequestTank, openRequest } from "./visitors";
import { dropPellets } from "../sim";
import { toWorld } from "../world";
import { audio } from "../../audio/audio";

/**
 * Everything a button or a tap in the 3D view does. Each action checks that
 * it is allowed now (no prompt open, the tutorial step allows it), applies a
 * pure model rule, and starts the matching animation and sound.
 */

type Act = "tapTank" | "openTank" | "back" | "feed" | "clean" | "decorate" | "tray" | "slot" | "fishShop" | "decorShop" | "tankShop" | "tapFish" | "tapDecor" | "visitor";

const TUTORIAL_ALLOWS: Record<TutorialStep, Act[]> = {
  intro: [],
  buy: ["fishShop"],
  place: ["tapTank"],
  feed: ["feed"],
  visitor: ["tapTank", "openTank", "back", "tapFish", "tapDecor", "visitor"],
  decorate: ["decorate", "tray", "slot"],
  done: []
};

function allowed(act: Act): boolean {
  const g = getGame();
  if (g.screen !== "game" || g.settingsOpen || g.stageCard) return false;
  if (g.mode !== "play") return false;
  const step = g.model.progress.tutorial;
  return step === "done" || TUTORIAL_ALLOWS[step].includes(act);
}

// ------------------------------------------------------------------ views

export function openTank(tankId: string) {
  const t = tankById(model(), tankId);
  if (!t) return;
  audio.play("tick");
  // Back from the close-up lands in this tank's hall.
  setGame({ view: "tank", tankId, hall: HALL_OF[t.slot], panel: null, placing: getGame().placing?.kind === "fish" ? null : getGame().placing });
}

/** The locked door to the Ocean Hall: its offer is in the tank shop (from Level 6). */
export function tapHallDoor() {
  if (!allowed("tankShop")) return;
  if (model().progress.stage < 6) {
    audio.play("error");
    toast({ en: "Not yet!", ja: "アクアリウム スターに なったら ひらけるよ", tone: "info" });
    return;
  }
  openTankShop();
}

/** The Gallery's door in the Ocean Hall: its offer is in the tank shop (from Level 8). */
export function tapGalleryDoor() {
  if (!allowed("tankShop")) return;
  if (model().progress.stage < 8) {
    audio.play("error");
    toast({ en: "Level 8!", ja: "レベル8で クラゲの ギャラリーが ひらけるよ", tone: "info" });
    return;
  }
  openTankShop();
}

/** The arrows at the screen edges: show the neighbouring room (open rooms only). */
export function switchHall(hall: number) {
  const g = getGame();
  if (g.screen !== "game" || g.view !== "room" || !roomOpen(hall, g.model.progress)) return;
  audio.play("tick");
  setGame({ hall });
}

export function backToRoom() {
  const g = getGame();
  setGame({ view: "room", tankId: null, panel: null, placing: g.placing?.kind === "fish" || g.placing?.kind === "tank" ? g.placing : null });
}

export function tapBack() {
  if (!allowed("back")) return;
  audio.play("tick");
  backToRoom();
}

export function closePanel() {
  setGame({ panel: null, placing: null });
}

// ------------------------------------------------------------------ fish shop

const fishWithHome = () => FISH_ORDER.filter((s) => isSpeciesUnlocked(model(), s) && homesFor(model(), s) > 0);

/** The same explanation is used by placement, shop cards and the counter. */
export const HOME_REASON_TEXT: Record<HomeReason, { en: string; ja: string }> = {
  bigger: { en: "Needs a bigger tank!", ja: "もっと おおきな タンクが ひつようだよ" },
  rocky: { en: "Needs a rocky home!", ja: "いわの ほらあな タンクが ひつようだよ" },
  jelly: { en: "Needs a jellyfish tank!", ja: "クラゲの まるい タンクが ひつようだよ" },
  ocean: { en: "Needs the Ocean tank!", ja: "うみの タンクに すむよ" },
  tall: { en: "Needs a tall tank!", ja: "たかい タンクに すむよ" },
  jellyOnly: { en: "Jellyfish only!", ja: "ここは クラゲ だけの タンクだよ" },
  notSafe: { en: "Not safe here!", ja: "ウツボや タコの いえだよ。ここは あぶないよ" },
  noMix: { en: "Jellyfish live alone!", ja: "クラゲは ほかの いきものを さすよ。クラゲ だけで くらすよ" },
  full: { en: "This tank is full!", ja: "この タンクは いっぱい" }
};

export function shopHomeReason(m: Model, species: SpeciesId): HomeReason {
  const homes = m.tanks.filter((t) => SPECIES[species].habitat.includes(t.type));
  const reasons = homes.map((t) => homeReason(species, t));
  // A compatible home can still be reserved by another bagged animal.
  if (reasons.some((r) => r === null || r === "full")) return "full";
  return reasons[0] ?? SPECIES[species].needs;
}

/** Affordable animals with a home; all jellyfish share a single name choice. */
export function animalOrderChoices(m: Model) {
  const species = ANIMAL_ORDER.filter((s) => isSpeciesUnlocked(m, s) && homesFor(m, s) > 0 && m.coins >= SPECIES[s].price);
  const jelly = species.filter((s) => SPECIES[s].counter === "jelly");
  const options = [...new Set(species.map((s) => SPECIES[s].counter === "jelly" ? "jellyfishPlease" as const : ANIMAL_PHRASE[s]!))];
  return { species, jelly, options, jellyColors: jelly.map((s) => SHOP_COLOR_PHRASE[SPECIES[s].color]!) };
}

export function openFishShop() {
  if (!allowed("fishShop")) return;
  if (model().progress.tutorial === "buy") {
    setGame({ guide: null, nudge: null });
    void orderFish({ tutorial: true });
    return;
  }
  if (!fishWithHome().length) {
    audio.play("error");
    toast({ en: "The tanks are full!", ja: "タンクが いっぱい! おおきな タンクが ひつよう", tone: "warn" });
    return;
  }
  void orderFish();
}

/** Why an animal cannot go somewhere (Japanese help; the English stays in the prompts). */
export function habitatHint(s: SpeciesId): string {
  if (s === "turtle") return "ウミガメは うみの タンク (うみの ホール) に すむよ";
  if (s === "seahorse") return "タツノオトシゴは たかい タンクに すむよ";
  if (s === "jellyfish") return "クラゲは たかい タンクで クラゲだけで くらすよ";
  return "クラゲの タンクには はいれないよ";
}

export function openAnimalShop() {
  if (!allowed("fishShop")) return;
  const m = model();
  const unlocked = ANIMAL_ORDER.filter((s) => isSpeciesUnlocked(m, s));
  if (!unlocked.length) {
    audio.play("error");
    toast({ en: "Level 6!", ja: "うみの ホールを ひらくと かえるよ", tone: "info" });
    return;
  }
  if (!unlocked.some((s) => homesFor(m, s) > 0)) {
    audio.play("error");
    if (m.progress.stage >= EXPANSION_FROM) {
      const reasons = [...new Set(unlocked.map((s) => shopHomeReason(m, s)))];
      toast({ en: reasons.map((r) => HOME_REASON_TEXT[r].en).join(" / "), ja: reasons.map((r) => HOME_REASON_TEXT[r].ja).join(" / "), tone: "warn" }, 4200);
    } else toast({ en: "No home!", ja: unlocked.map(habitatHint).join(" / "), tone: "warn" }, 4200);
    return;
  }
  void orderAnimal();
}

/**
 * The sea-animal counter: "What do you want?" → "A turtle, please!". Animals
 * are ordered by name (fish by colour); only animals with a free home are on offer.
 */
export async function orderAnimal(): Promise<SpeciesId | null> {
  setGame({ panel: "animalShop", placing: null, view: "room", tankId: null });
  for (;;) {
    const m = model();
    const { species, jelly, options, jellyColors } = animalOrderChoices(m);
    if (!species.length) {
      await say("pico", "Sorry! You need more coins.", "コインが たりないよ。おきゃくさんを たすけて コインを ためよう");
      setGame({ panel: null });
      return null;
    }
    const id = await ask({
      kind: "choice",
      options,
      question: { en: "What do you want?", by: "pico" },
      readQuestion: true,
      cancellable: true,
      shuffle: true,
      help: "ほしい いきものの なまえを えいごで いおう!"
    });
    if (!id) {
      setGame({ panel: null });
      return null;
    }
    let s = speciesOfPhrase(id)!;
    if (id === "jellyfishPlease") {
      if (jelly.length > 1) {
        const color = await ask({
          kind: "choice", options: jellyColors,
          question: { en: "What color?", by: "pico" }, readQuestion: true,
          cancellable: true, shuffle: true, help: "ほしい クラゲの いろを えいごで いおう!"
        });
        if (!color) { setGame({ panel: null }); return null; }
        s = JELLY_BY_COLOR[colorOfPhrase(color)!]!;
      } else s = jelly[0];
    }
    const r = commit(buyFish(model(), s));
    if (r.ok) {
      audio.play("purchase");
      setGame({ panel: null });
      startPlacingFish(r.id!);
      return s;
    }
    await say("pico", "Sorry! You need more coins.", "コインが たりないよ");
  }
}

/**
 * Pico's counter: "What color?" → "Blue, please!". The student says (or taps)
 * the colour word of the fish they want; the cards show pictures and prices,
 * never names or colour words.
 */
export async function orderFish(opts: { tutorial?: boolean } = {}): Promise<SpeciesId | null> {
  setGame({ panel: "fishShop", placing: null, view: "room", tankId: null });
  for (;;) {
    const m = model();
    const species = (opts.tutorial ? (["clownfish", "bluetang"] as SpeciesId[]) : fishWithHome()).filter((s) => m.coins >= SPECIES[s].price);
    if (!species.length) {
      await say("pico", "Sorry! You need more coins.", "コインが たりないよ。おきゃくさんを たすけて コインを ためよう");
      setGame({ panel: null });
      return null;
    }
    const options = species.map((s) => SHOP_COLOR_PHRASE[SPECIES[s].color]!) as PhraseId[];
    const id = await ask({
      kind: "choice",
      options,
      question: { en: opts.tutorial ? "Blue or orange?" : "What color?", by: "pico" },
      readQuestion: true,
      cancellable: !opts.tutorial,
      shuffle: true,
      help: "ほしい さかなの いろを えいごで いおう!"
    });
    if (!id) {
      setGame({ panel: null });
      return null;
    }
    const s = SPECIES_BY_COLOR[colorOfPhrase(id)!]!;
    const r = commit(buyFish(model(), s));
    if (r.ok) {
      audio.play("purchase");
      setGame({ panel: null });
      startPlacingFish(r.id!);
      return s;
    }
    if (r.reason === "full") {
      toast({ en: "The tanks are full!", ja: "タンクが いっぱい!", tone: "warn" });
      setGame({ panel: null });
      return null;
    }
    // Not enough coins: say so and ask again (the card is greyed).
    await say("pico", "Sorry! You need more coins.", "コインが たりないよ。ほかの さかなを えらぼう");
  }
}

export function startPlacingFish(fishId: string) {
  setGame({ placing: { kind: "fish", fishId }, view: "room", tankId: null, panel: null });
}

/** The bag chip in the HUD: carry the first bagged fish again. */
export function takeBaggedFish() {
  if (!allowed("tapTank")) return;
  const f = model().inv.fish[0];
  if (f) startPlacingFish(f.id);
}

export function cancelPlacing() {
  if (model().progress.tutorial !== "done") return;
  setGame({ placing: null, panel: null });
}

/** Room view: a tap on a tank. */
export function tapTank(tankId: string) {
  const g = getGame();
  if (g.placing?.kind === "remodel") {
    if (!allowed("tapTank") || g.panel === "remodel") return;
    const plan = remodelPlan(model(), tankId, g.placing.type);
    if (plan.reason && plan.reason !== "habitat" && plan.reason !== "full") return;
    audio.play("tick");
    setGame({ placing: { ...g.placing, tankId }, panel: "remodel" });
    return;
  }
  if (g.placing?.kind === "fish") {
    if (!allowed("tapTank")) return;
    const fishId = g.placing.fishId;
    const t = tankById(model(), tankId);
    const animal = model().inv.fish.find((f) => f.id === fishId);
    if (!t || !animal) return;
    const reason = homeReason(animal.species, t);
    if (reason && model().progress.stage >= EXPANSION_FROM) {
      audio.play("error");
      toast({ ...HOME_REASON_TEXT[reason], tone: "warn" }, 3600);
      return;
    }
    if (!canLive(animal.species, t)) {
      audio.play("error");
      toast({ en: "Not here!", ja: habitatHint(animal.species), tone: "warn" }, 3600);
      return;
    }
    if (!hasSpace(t)) {
      audio.play("error");
      toast({ en: "This tank is full!", ja: "この タンクは いっぱい", tone: "warn" });
      return;
    }
    const r = commit(placeFish(model(), fishId, tankId));
    if (!r.ok) return;
    rt.splash.set(tankId, rt.time);
    const top = toWorld(t.slot, { x: 0, y: TANKS[t.type].h, z: 0 });
    effect("splash", top.x, top.y, top.z);
    audio.play("splash");
    setGame({ placing: null });
    openTank(tankId);
    return;
  }
  if (g.placing) return;
  if (!allowed("openTank") && !allowed("tapTank")) return;
  inspectRequestTank(tankId);
  openTank(tankId);
}

// ------------------------------------------------------------------ tanks

export function openTankShop() {
  if (!allowed("tankShop")) return;
  if (!tanksUnlocked(model())) {
    toast({ en: "Level 4!", ja: "レベル4で かえるよ", tone: "info" });
    return;
  }
  audio.play("tick");
  setGame({ panel: "tankShop", placing: null });
}

export function buyTankType(type: TankType) {
  const m = model();
  const r = commit(buyTank(m, type));
  if (!r.ok) {
    audio.play("error");
    if (r.reason === "coins") toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    else toast({ en: "No room!", ja: "おく ばしょが ないよ", tone: "warn" });
    return;
  }
  audio.play("purchase");
  setGame({ panel: null, view: "room", tankId: null, placing: { kind: "tank", type, slot: null } });
}

export const buyBigTank = () => buyTankType("big");

/** Choose a placed tank before making any changes or paying. */
export function startRemodel(type: TankType) {
  if (!allowed("tankShop") || model().progress.stage < EXPANSION_FROM) return;
  if (!model().tanks.some((t) => {
    const p = remodelPlan(model(), t.id, type);
    return !p.reason || p.reason === "habitat" || p.reason === "full";
  })) return;
  audio.play("pick");
  setGame({ panel: null, view: "room", tankId: null, placing: { kind: "remodel", type, tankId: null } });
}

/** Explicitly move a blocking animal to the bag; the confirmation stays open. */
export function bagRemodelAnimal(id: string) {
  const g = getGame();
  const p = g.placing;
  if (!allowed("tapTank") || g.panel !== "remodel" || p?.kind !== "remodel" || !p.tankId) return;
  const t = tankById(model(), p.tankId);
  const plan = remodelPlan(model(), p.tankId, p.type);
  if (!t?.fish.some((f) => f.id === id) || (!plan.blockers.some((f) => f.id === id) && plan.reason !== "full")) return;
  if (commit(bagAnimal(model(), id)).ok) {
    for (const [key, fish] of rt.fish) if (fish.tankId === t.id) rt.fish.delete(key);
    audio.play("pick");
  }
}

export function confirmRemodel() {
  const g = getGame();
  const p = g.placing;
  if (!allowed("tapTank") || g.panel !== "remodel" || p?.kind !== "remodel" || !p.tankId) return;
  const plan = remodelPlan(model(), p.tankId, p.type);
  const t = tankById(model(), p.tankId);
  if (!t || plan.reason || model().coins < plan.cost) return;
  const r = commit(remodelTank(model(), p.tankId, p.type));
  if (!r.ok) return;
  // Every simulated member of a school must also respawn inside the new bounds.
  for (const [id, fish] of rt.fish) if (fish.tankId === t.id) rt.fish.delete(id);
  const w = toWorld(t.slot, { x: 0, y: TANKS[p.type].h * 0.6, z: 0 });
  effect("sparkle", w.x, w.y, w.z, 14);
  audio.play("purchase");
  setGame({ panel: null, placing: null });
  toast({ en: `New tank! ${plan.toTray.length} decorations in the tray.`, ja: `タンクが かわったよ! かざり ${plan.toTray.length}こを トレーに もどしたよ`, tone: "good" }, 4000);
}

export function buyGallery() {
  if (!allowed("tankShop")) return;
  const r = commit(openGallery(model()));
  if (!r.ok) {
    audio.play("error");
    if (r.reason === "coins") toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    return;
  }
  audio.play("unlock");
  setGame({ panel: null, view: "room", tankId: null, hall: 2 });
  effect("confetti", 24, 2.6, -1, 40);
  toast({ en: "The Jellyfish Gallery!", ja: "クラゲの ギャラリーが ひらいたよ! まるい タンクに クラゲを いれよう", tone: "good" }, 4500);
}

let lightTaught = false;

/** Free display colours use the familiar shop English and prompt controls. */
export async function openLights() {
  if (!allowed("decorate")) return;
  const tankId = getGame().tankId;
  const t = tankId ? tankById(model(), tankId) : null;
  if (!t || !TANKS[t.type].lights || model().progress.stage < EXPANSION_FROM) return;
  setGame({ panel: "lights", placing: null });
  const id = await ask({
    kind: "choice", options: LIGHT_COLORS.map((c) => SHOP_COLOR_PHRASE[c]!),
    question: { en: "What color?", by: "pico" }, readQuestion: true,
    cancellable: true, shuffle: true, help: "ライトの いろを えいごで いおう!"
  });
  setGame({ panel: null });
  if (!id) return;
  const r = commit(setLight(model(), t.id, colorOfPhrase(id)!));
  if (!r.ok) return;
  audio.play("place");
  if (!lightTaught) {
    lightTaught = true;
    toast({ en: "The jellyfish love the light!", ja: "クラゲは ひかりが だいすき!", tone: "good" }, 3500);
  }
}

/** Level 6: open the Ocean Hall (the Ocean tank comes with it) and go and see it. */
export function buyHall() {
  const r = commit(openHall(model()));
  if (!r.ok) {
    audio.play("error");
    toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    return;
  }
  audio.play("unlock");
  setGame({ panel: null, view: "room", tankId: null, hall: 1 });
  effect("confetti", 12, 2.6, -1, 40);
  toast({ en: "The Ocean Hall!", ja: "うみの ホールが ひらいたよ! うみの タンクに ウミガメを いれよう", tone: "good" }, 4000);
}

export function buyTicketGate() {
  const r = commit(buyTickets(model()));
  if (!r.ok) {
    audio.play("error");
    toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    return;
  }
  audio.play("purchase");
  toast({ en: "More visitors!", ja: "おきゃくさんが たくさん くるよ", tone: "good" });
}

/** The box chip: place a bought tank. */
export function takeBoxedTank() {
  if (!allowed("tankShop")) return;
  const type = model().inv.tanks[0];
  if (type) setGame({ placing: { kind: "tank", type, slot: null }, view: "room", tankId: null, panel: null });
}

/** Room view: a tap on an empty pad. */
export function tapPad(slot: SlotId) {
  const g = getGame();
  if (tankAt(model(), slot)) return;
  if (g.placing?.kind === "tank") {
    if (!PAD_TYPES[slot].includes(g.placing.type)) {
      audio.play("error");
      return;
    }
    audio.play("pick");
    setGame({ placing: { ...g.placing, slot } });
    return;
  }
  if (!allowed("tankShop")) return;
  if (model().inv.tanks.length) {
    takeBoxedTank();
    setGame({ placing: { kind: "tank", type: model().inv.tanks[0], slot } });
    return;
  }
  if (!tanksUnlocked(model())) {
    audio.play("error");
    toast({ en: "Level 4!", ja: "レベル4で タンクが おけるよ", tone: "info" });
    return;
  }
  openTankShop();
}

export function confirmTank() {
  const p = getGame().placing;
  if (p?.kind !== "tank" || !p.slot) return;
  const r = commit(placeTank(model(), p.type, p.slot));
  if (!r.ok) return;
  audio.play("place");
  const w = toWorld(p.slot, { x: 0, y: 0.6, z: 0 });
  effect("sparkle", w.x, w.y, w.z, 8);
  setGame({ placing: null });
}

// ------------------------------------------------------------------ decorations

export function openDecorShop() {
  if (!allowed("decorShop") && !allowed("tray")) return;
  if (model().progress.stage < 2) {
    toast({ en: "Level 2!", ja: "レベル2で かえるよ", tone: "info" });
    return;
  }
  audio.play("tick");
  setGame({ panel: "decorShop", placing: null });
}

const VARIANT_PHRASE: Record<string, PhraseId> = { big: "bigPlease", small: "smallPlease", red: "redPlease", blue: "bluePlease" };
const PHRASE_VARIANT: Partial<Record<PhraseId, DecorVariant>> = { bigPlease: "big", smallPlease: "small", redPlease: "red", bluePlease: "blue" };

/** Buy a decoration; two-version items ask "Big or small?" / "Red or blue?". */
export async function buyDecorKind(kind: DecorKind) {
  const g = getGame();
  if (g.mode !== "play") return;
  const def = DECOR[kind];
  const from: Panel = g.view === "tank" ? "decorate" : null;
  let variant: DecorVariant = def.versions[0].variant;
  if (def.versions.length > 1) {
    const coins = model().coins;
    const affordable = def.versions.filter((v) => coins >= v.price);
    if (!affordable.length) {
      audio.play("error");
      toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
      return;
    }
    setGame({ decorAsk: kind });
    const id = await ask({
      kind: "choice",
      options: affordable.map((v) => VARIANT_PHRASE[v.variant!]),
      question: { en: def.question!, by: "pico" },
      readQuestion: true,
      cancellable: true,
      shuffle: true,
      help: kind === "coral" ? "いろを えいごで いおう!" : "おおきさを えいごで いおう!"
    });
    setGame({ decorAsk: null });
    if (!id) return;
    variant = PHRASE_VARIANT[id] ?? null;
  }
  const r = commit(buyDecor(model(), kind, variant));
  if (!r.ok) {
    audio.play("error");
    toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    return;
  }
  audio.play("purchase");
  if (getGame().view === "tank") {
    // Straight to placing it in this tank.
    setGame({ panel: "decorate", placing: { kind: "decor", decorId: r.id! } });
  } else {
    setGame({ panel: from ?? "decorShop" });
    toast({ en: "Got it!", ja: "かったよ! タンクを ひらいて「かざる」で おこう", tone: "good" });
  }
}

export function openDecorate() {
  if (!allowed("decorate")) return;
  audio.play("tick");
  setGame({ panel: "decorate", placing: null });
}

export function pickTrayItem(decorId: string) {
  if (!allowed("tray")) return;
  audio.play("pick");
  setGame({ placing: { kind: "decor", decorId } });
}

/** Decorate mode: a tap on a slot on the sand (empty or holding a decoration). */
export function tapSlot(tankId: string, slot: number) {
  if (!allowed("slot")) return;
  const g = getGame();
  const t = tankById(model(), tankId);
  if (!t || g.panel !== "decorate") return;
  const here = t.decor.find((d) => d.slot === slot);
  const p = g.placing;
  if (p?.kind === "decor") {
    if (here) {
      // Taken: pick that one up instead, keep the tray item for later.
      audio.play("pick");
      setGame({ placing: { kind: "move", tankId, slot } });
      return;
    }
    const r = commit(placeDecor(model(), p.decorId, tankId, slot));
    if (r.ok) placedFx(tankId, slot);
    else if (r.reason === "tooBig") {
      audio.play("error");
      toast({ en: "Too big!", ja: "おおきすぎる! おおきな タンクか うみの タンクに おこう", tone: "warn" }, 3600);
    }
    setGame({ placing: null });
    return;
  }
  if (p?.kind === "move" && p.tankId === tankId) {
    if (p.slot === slot) {
      setGame({ placing: null });
      return;
    }
    const r = commit(moveDecor(model(), tankId, p.slot, slot));
    if (r.ok) placedFx(tankId, slot);
    setGame({ placing: null });
    return;
  }
  if (here) {
    audio.play("pick");
    setGame({ placing: { kind: "move", tankId, slot } });
  }
}

function placedFx(tankId: string, slot: number) {
  const t = tankById(model(), tankId);
  if (!t) return;
  const s = TANKS[t.type].slots[slot];
  const w = toWorld(t.slot, { x: s.x, y: 0.15, z: s.z });
  effect("sparkle", w.x, w.y, w.z, 6);
  audio.play("place");
}

export function putAway() {
  const p = getGame().placing;
  if (p?.kind !== "move") return;
  const r = commit(storeDecor(model(), p.tankId, p.slot));
  if (r.ok) audio.play("pick");
  setGame({ placing: null });
}

export function doneDecorate() {
  if (getGame().mode !== "play") return;
  audio.play("tick");
  setGame({ panel: null, placing: null });
}

// ------------------------------------------------------------------ care

export async function feedTank() {
  if (!allowed("feed")) return;
  const g = getGame();
  const t = g.tankId ? tankById(model(), g.tankId) : null;
  if (!t) return;
  if (!t.fish.length) {
    toast({ en: "No fish!", ja: "さかなが いないよ", tone: "info" });
    return;
  }
  if (t.food >= 90) {
    audio.play("tick");
    toast({ en: "Full!", ja: "おなか いっぱい!", tone: "info" });
    return;
  }
  if (!model().progress.fedOnce) {
    const id = await ask({
      kind: "command",
      options: ["feedFish"],
      readSentence: true,
      cancellable: model().progress.tutorial === "done",
      help: "えさを あげよう! えいごで いってみよう"
    });
    if (!id) return;
  }
  const r = commit(feed(model(), t.id));
  if (!r.ok) return;
  dropPellets(t.id, t.type);
  audio.play("sprinkle");
}

export async function cleanTank() {
  if (!allowed("clean")) return;
  const g = getGame();
  const t = g.tankId ? tankById(model(), g.tankId) : null;
  if (!t) return;
  if (!model().progress.cleanedOnce) {
    const id = await ask({
      kind: "command",
      options: ["cleanPlease"],
      readSentence: true,
      cancellable: true,
      help: "タンクを きれいに しよう! えいごで いってみよう"
    });
    if (!id) return;
  }
  const r = commit(clean(model(), t.id));
  if (!r.ok) return;
  rt.cleaning.set(t.id, rt.time);
  audio.play("scrub");
}

// ------------------------------------------------------------------ taps in a tank

let talkId = 1;

/** Close-up: a fish was tapped. */
export function tapFish(fishId: string) {
  const g = getGame();
  if (g.mode !== "play") return;
  const t = model().tanks.find((x) => x.fish.some((f) => f.id === fishId));
  const f = t?.fish.find((x) => x.id === fishId);
  if (!t || !f) return;
  if (g.request && answerShow({ type: "fish", species: f.species }, t.id, { fishId })) return;
  if (!allowed("tapFish")) return;
  const fr = rt.fish.get(fishId);
  if (fr) {
    fr.tapT0 = rt.time;
    fr.happyT0 = rt.time;
  }
  audio.play("bubble");
  const id = talkId++;
  setGame({ fishTalk: { id, species: f.species } });
  void speak(SPECIES[f.species].likesLine, f.species);
  window.setTimeout(() => {
    if (getGame().fishTalk?.id === id) setGame({ fishTalk: null });
  }, 2600);
}

/** Close-up: a placed decoration was tapped (outside decorate mode). */
export function tapDecor(tankId: string, slot: number) {
  const g = getGame();
  if (g.mode !== "play") return;
  const t = tankById(model(), tankId);
  const d = t?.decor.find((x) => x.slot === slot);
  if (!t || !d) return;
  if (g.request && answerShow({ type: "decor", kind: d.kind, variant: d.variant }, tankId, { slot })) return;
  if (!allowed("tapDecor")) return;
  const s = TANKS[t.type].slots[slot];
  const w = toWorld(t.slot, { x: s.x, y: 0.2, z: s.z });
  effect("sparkle", w.x, w.y, w.z, 4);
  audio.play("bubble");
}

export function tapVisitor(id: string) {
  if (!allowed("visitor")) return;
  void openRequest(id);
}

/** Pico on the counter: a reminder of the current goal. */
export function tapPico() {
  const g = getGame();
  if (g.mode !== "play" || g.model.progress.tutorial !== "done") return;
  rt.pico.waveT0 = rt.time;
  audio.play("happy");
  void speak("Hello!", "pico");
}

/** Species a fish card shows as unlocked / affordable (shop UI). */
export function cardState(s: SpeciesId): "locked" | "coins" | "ok" {
  const m = model();
  if (!isSpeciesUnlocked(m, s)) return "locked";
  return m.coins >= SPECIES[s].price ? "ok" : "coins";
}

// ------------------------------------------------------------------ upgrades

/** Close-up: the upgrade panel (filter, lamp, bigger tank). */
export function openUpgrades() {
  if (!allowed("decorate")) return;
  if (!upgradesUnlocked(model())) {
    audio.play("error");
    toast({ en: "Level 8!", ja: "レベル8で アップグレードが かえるよ", tone: "info" });
    return;
  }
  audio.play("tick");
  setGame({ panel: "upgrade", placing: null });
}

export function buyTankUpgrade(kind: UpgradeKind) {
  const g = getGame();
  if (!g.tankId) return;
  const r = commit(buyUpgrade(model(), g.tankId, kind));
  if (!r.ok) {
    audio.play("error");
    if (r.reason === "coins") toast({ en: "More coins, please!", ja: "もっと コインが ひつよう", tone: "warn" });
    return;
  }
  audio.play("purchase");
  const t = tankById(model(), g.tankId);
  if (t) {
    const w = toWorld(t.slot, { x: 0, y: TANKS[t.type].h * 0.6, z: 0 });
    effect("sparkle", w.x, w.y, w.z, 10);
  }
}
