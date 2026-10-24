import { DECOR, decorFits } from "../data/decor";
import { FISH_ORDER, SPECIES } from "../data/fish";
import { HALL_PRICE, TANKS } from "../data/tanks";
import type { SpeciesId } from "../types";
import { canLive, goals, happiness, HAPPY, hasSpace, isSpeciesUnlocked, padsFor, UPGRADE_PRICE, type Goal, type Model, type TankRec } from "./model";

type Line = { en: string; ja: string };
export type Step = {
  goal: Goal["id"];
  title: Line;
  where: Line;
  exact: Line;
  target?: string;
  shopItem?: string;
};

const line = (en: string, ja: string): Line => ({ en, ja });
const tankTarget = (t: TankRec) => `tank-${t.slot}`;

function step(goal: Goal["id"], title: Line, where: Line, exact: Line, target?: string, shopItem?: string): Step {
  return { goal, title, where, exact, target, shopItem };
}

/** A shortfall is an action in its own right, rather than another request to buy. */
function purchase(m: Model, price: number, action: Step): Step {
  if (m.coins >= price) return action;
  const missing = Math.ceil(price - m.coins);
  return {
    ...action,
    title: line(`Need ${missing} more coins!`, `あと ${missing} コイン あつめよう！`),
    where: line("Help visitors and care for your fish.", "おきゃくさんを たすけて、さかなの おせわを しよう！"),
    exact: line(
      `Help a visitor with a !. Feed and clean your tanks for tips. Then save ${price} coins for this item.`,
      `「！」の おきゃくさんを たすけよう。えさと そうじで コインも ふえるよ。${price} コイン ためよう！`
    ),
    target: "chip-visitor"
  };
}

function hall(m: Model, goal: Goal["id"]): Step {
  return purchase(m, HALL_PRICE, step(goal,
    line("Open the Ocean Hall!", "うみの ホールを ひらこう！"),
    line("Tap Tank. Find Ocean Hall.", "「タンク」を おして、うみの ホールを さがそう！"),
    line(`In the Tank shop, choose the blue Ocean Hall. It costs ${HALL_PRICE} coins.`, `「タンク」で あおい うみの ホールを えらぼう。${HALL_PRICE} コインだよ！`),
    "btn-tank-shop", "hall"));
}

function tank(m: Model, goal: Goal["id"], type: "big" | "tall"): Step {
  const en = type === "big" ? "big" : "tall";
  const ja = type === "big" ? "おおきな" : "たかい";
  if (m.inv.tanks.includes(type)) {
    return step(goal, line(`Place the ${en} tank!`, `${ja} タンクを おこう！`),
      line("Tap your tank box. Tap an empty pad.", "タンクの はこを おして、あいている ばしょを おそう！"),
      line(`Tap the box, choose an empty pad, then tap the check mark to place the ${en} tank.`, `はこの タンクを えらんで、あいている ばしょを おそう。チェックで ${ja} タンクを おこう！`), "chip-box");
  }
  if (!padsFor(m, type).length) {
    if (!m.progress.hallOpen && m.progress.stage >= 6) return hall(m, goal);
    return step(goal, line("Find a tank space!", "タンクの ばしょを さがそう！"),
      line("Look for an empty tank pad.", "タンクを おける ばしょを さがそう！"),
      line("A new tank needs an empty pad. Check both rooms for a space.", "あたらしい タンクには あいている ばしょが いるよ。へやを みてみよう！"), "btn-tank-shop");
  }
  return purchase(m, TANKS[type].price, step(goal,
    line(`Get a ${en} tank!`, `${ja} タンクを かおう！`),
    line(`Tap Tank. Find ${type === "big" ? "Big" : "Tall"} Tank.`, `「タンク」で ${ja} タンクを さがそう！`),
    line(`Choose ${type === "big" ? "Big" : "Tall"} Tank for ${TANKS[type].price} coins. Then place its box on an empty pad.`, `${ja} タンクは ${TANKS[type].price} コインだよ。かったら はこを あいている ばしょに おこう！`),
    "btn-tank-shop", type));
}

function placeAnimal(goal: Goal["id"], species: SpeciesId, home: TankRec): Step {
  if (species === "turtle") {
    return step(goal, line("Put the turtle in the Ocean tank!", "うみの タンクに ウミガメを いれよう！"),
      line("Open Ocean Hall and tap its tank.", "うみの ホールを ひらいて、タンクを おそう！"),
      line("Your turtle is in a bag. Tap its bag, open Ocean Hall with the arrow, and tap the Ocean tank.", "うみの タンクに ウミガメを いれよう！ ふくろを おして、やじるしで うみの ホールへ いこう！"), tankTarget(home));
  }
  const name = SPECIES[species].kind === "fish" ? "fish" : SPECIES[species].word;
  return step(goal, line(`Put your ${name} in the tank!`, "ふくろの いきものを タンクに いれよう！"),
    line(`Tap your bag, then tank ${home.slot}.`, `ふくろを おして、タンク ${home.slot} を おそう！`),
    line(`Your ${name} is already bought. Tap the bag and then tank ${home.slot} to put it in.`, `もう かってあるよ！ ふくろを おして、タンク ${home.slot} に いれよう！`), tankTarget(home));
}

function animal(m: Model, goal: Goal["id"], species: SpeciesId, preferred?: TankRec): Step {
  if (SPECIES[species].needsHall && !m.progress.hallOpen) return hall(m, goal);
  const home = preferred
    ? canLive(species, preferred) && hasSpace(preferred) ? preferred : undefined
    : m.tanks.find((t) => canLive(species, t) && hasSpace(t));
  const owned = m.inv.fish.find((f) => f.species === species);
  if (!home) {
    if (species === "seahorse" || species === "jellyfish") {
      if (!m.tanks.some((t) => t.type === "tall")) return tank(m, goal, "tall");
    }
    return step(goal, line("Your animal needs room!", "いきものの ばしょを さがそう！"),
      line("Check a tank with space for this animal.", "この いきものが はいれる タンクを みよう！"),
      line("Find a tank with a free space before getting another animal. Turtles need the Ocean tank; seahorses and jellyfish need a tall tank.", "あいている タンクを さがそう。ウミガメは うみの タンク、タツノオトシゴと クラゲは たかい タンクだよ！"), preferred ? tankTarget(preferred) : "btn-tank-shop");
  }
  if (owned) return placeAnimal(goal, species, home);
  const isFish = SPECIES[species].kind === "fish";
  return purchase(m, SPECIES[species].price, step(goal,
    line(species === "turtle" ? "Get a sea turtle!" : isFish ? "Get a fish!" : `Get a ${SPECIES[species].word}!`, species === "turtle" ? "ウミガメを かおう！" : isFish ? "さかなを かおう！" : "うみの なかまを かおう！"),
    line(isFish ? "Tap Fish. Choose a fish." : `Tap Animals. Buy a ${SPECIES[species].word}.`, isFish ? "「さかな」で さかなを えらぼう！" : species === "turtle" ? "「いきもの」で ウミガメを かおう！" : "「いきもの」で タツノオトシゴか クラゲを かおう！"),
    line(`Tap ${isFish ? "Fish" : "Animals"}. Choose your ${isFish ? "colour" : "animal"} in English. It costs ${SPECIES[species].price} coins. Then tap its tank.`, `「${isFish ? "さかな" : "いきもの"}」で えいごを えらぼう。${SPECIES[species].price} コインだよ。かったら タンクに いれよう！`),
    isFish ? "btn-fish-shop" : "btn-animal-shop", species));
}

function fish(m: Model, goal: Goal["id"], preferred?: TankRec): Step {
  const bag = m.inv.fish.find((f) => (!preferred || canLive(f.species, preferred)) &&
    m.tanks.some((t) => (!preferred || t.id === preferred.id) && canLive(f.species, t) && hasSpace(t)));
  const available = FISH_ORDER.filter((s) => isSpeciesUnlocked(m, s) && (!preferred || canLive(s, preferred)));
  const cheapest = available.reduce((a, b) => SPECIES[a].price <= SPECIES[b].price ? a : b);
  return animal(m, goal, bag?.species ?? cheapest, preferred);
}

function decoration(m: Model, goal: Goal["id"], home: TankRec): Step {
  const owned = m.inv.decor.find((d) => decorFits(d.kind, home.type));
  if (owned) return step(goal, line("Place your decoration!", "もっている かざりを おこう！"),
    line(`Open tank ${home.slot}. Tap Decorate.`, `タンク ${home.slot} を ひらいて、「かざる」を おそう！`),
    line("Tap Decorate, choose a decoration from your tray, then tap an empty spot in the tank.", "「かざる」で もっている かざりを えらんで、タンクの あいている ばしょに おこう！"), tankTarget(home));
  const price = Math.min(...DECOR.plant.versions.map((v) => v.price));
  return purchase(m, price, step(goal, line("Get a decoration!", "かざりを かおう！"),
    line("Tap Decor. Choose a plant.", "「かざり」で みずくさを えらぼう！"),
    line(`A small plant costs ${price} coins. Choose it in the Decor shop, then open tank ${home.slot} and tap Decorate to place it.`, `ちいさな みずくさは ${price} コインだよ。「かざり」で かって、タンク ${home.slot} の「かざる」で おこう！`), "btn-decor-shop", "plant"));
}

function care(goal: Goal["id"], home: TankRec, kind: "feed" | "clean"): Step {
  const feed = kind === "feed";
  return step(goal,
    line(feed ? "Feed your fish!" : "Clean the tank!", feed ? "さかなに えさを あげよう！" : "タンクを そうじしよう！"),
    line(`Open tank ${home.slot}. Tap ${feed ? "Feed" : "Clean"}.`, `タンク ${home.slot} を ひらいて、「${feed ? "えさ" : "そうじ"}」を おそう！`),
    line(`Tap tank ${home.slot}, then the ${feed ? "food" : "sponge"} button. ${feed ? "Give your fish some food!" : "Make the water clean!"}`, `タンク ${home.slot} を おして、したの「${feed ? "えさ" : "そうじ"}」を おそう！`), tankTarget(home));
}

/** Derive the next practical action without changing progression or remembering UI state. */
export function nextStep(m: Model): Step | null {
  const goal = goals(m).find((g) => !g.done);
  if (!goal) {
    if ((m.progress.stage === 5 && !m.progress.star) || (m.progress.stage === 8 && !m.progress.superStar)) {
      return step("allHappy", line("The judge is coming!", "しんさの おきゃくさんが くるよ！"),
        line("Your goals are done. Watch for the judge!", "もくひょう クリア！ しんさの おきゃくさんを まとう！"),
        line("Keep your fish happy. Pico will welcome the judge soon.", "さかなを ハッピーに して まとう。もうすぐ ピコが おむかえするよ！"));
    }
    return null;
  }
  const id = goal.id;
  switch (id) {
    case "buyFish":
    case "twoFish": return fish(m, id);
    case "feed": {
      const home = m.tanks.find((t) => t.fish.length && t.food < 90);
      if (home) return care(id, home, "feed");
      if (!m.tanks.some((t) => t.fish.length)) return fish(m, id);
      return step(id, line("Your fish are full!", "さかなは おなか いっぱい！"),
        line("Wait a little, then feed your fish.", "すこし まってから えさを あげよう！"),
        line("Your fish have enough food. When they are hungry, open their tank and tap Feed.", "いまは おなか いっぱいだよ。すこし まって、タンクの「えさ」を おそう！"), tankTarget(m.tanks.find((t) => t.fish.length)!));
    }
    case "clean": return care(id, m.tanks.find((t) => t.fish.length) ?? m.tanks[0], "clean");
    case "visitor":
    case "help":
    case "named": {
      const named = id === "named";
      return step(id, line(named ? `Name animals: ${goal.n ?? 0} / ${goal.of ?? 2}` : `Help visitors: ${goal.n ?? 0} / ${goal.of ?? 1}`, named ? "いきものの なまえを こたえよう！" : "おきゃくさんを たすけよう！"),
        line("Tap a visitor with a ! when they arrive.", "「！」の おきゃくさんが きたら おそう！"),
        line(named ? "Tap the visitor with a !. For What's this?, say or choose the animal's name." : "Tap the waiting visitor with a !, or the visitor button. Listen and help them!", named ? "「！」の おきゃくさんを おそう。What's this? には いきものの なまえを えいごで こたえよう！" : "「！」の おきゃくさんか おきゃくさんの ボタンを おそう。きいて たすけよう！"), "chip-visitor");
    }
    case "count": {
      const countable = m.tanks.find((t) => t.fish.length >= 2 && t.fish.every((f) => SPECIES[f.species].kind === "fish"));
      if (!countable) return fish(m, id, m.tanks.find((t) => t.fish.length === 1 && hasSpace(t) && t.fish.every((f) => SPECIES[f.species].kind === "fish")));
      return step(id, line("Count your fish with Pico!", "ピコと さかなを かぞえよう！"),
      line("Pico will ask How many fish?", "ピコの しつもんに こたえよう！"),
      line("Count the fish in the tank Pico shows. Say or choose the number in English.", "ピコが みせる タンクの さかなを かぞえて、かずを えいごで こたえよう！"), tankTarget(countable));
    }
    case "placeBig": return tank(m, id, "big");
    case "placeTall": return tank(m, id, "tall");
    case "fishInBig": {
      const home = m.tanks.find((t) => t.type === "big");
      return home ? fish(m, id, home) : tank(m, id, "big");
    }
    case "decorBig": {
      const home = m.tanks.find((t) => t.type === "big");
      return home ? decoration(m, id, home) : tank(m, id, "big");
    }
    case "allHappy": {
      if (!m.tanks.some((t) => t.fish.length)) return fish(m, id);
      const home = m.tanks.find((t) => t.fish.length && (happiness(t) ?? 0) < HAPPY);
      if (!home) return step(id, line("Your fish look happy!", "さかなは ハッピーだね！"),
        line("Pico is checking your tanks.", "ピコが タンクを みているよ！"),
        line("Keep every tank happy together. Pico will check them soon.", "ぜんぶの タンクを ハッピーに して まとう！"));
      if (home.food < 90) return care(id, home, "feed");
      if (home.clean < 100) return care(id, home, "clean");
      if (home.decor.length >= TANKS[home.type].slots.length && m.progress.stage >= 8 && !home.upgrades.lamp) {
        return purchase(m, UPGRADE_PRICE.lamp, step(id, line("Add a lamp for happy animals!", "ライトで いきものを ハッピーに しよう！"),
          line(`Open tank ${home.slot}. Tap Upgrade.`, `タンク ${home.slot} の「アップ」を おそう！`),
          line(`This tank's decoration spots are full. Add a Lamp for ${UPGRADE_PRICE.lamp} coins to help your animals feel happy.`, `かざりは いっぱいだよ。${UPGRADE_PRICE.lamp} コインの ライトで ハッピーに しよう！`), tankTarget(home), "lamp"));
      }
      return decoration(m, id, home);
    }
    case "openHall": return hall(m, id);
    case "turtle": return animal(m, id, "turtle", m.tanks.find((t) => t.type === "ocean"));
    case "tallAnimal": {
      const homes = m.tanks.filter((t) => t.type === "tall");
      if (!homes.length) return tank(m, id, "tall");
      const bag = m.inv.fish.find((f) => (f.species === "seahorse" || f.species === "jellyfish") && homes.some((t) => canLive(f.species, t) && hasSpace(t)));
      if (!bag && !m.progress.hallOpen) return hall(m, id);
      const species = bag?.species ?? (homes.some((t) => canLive("seahorse", t) && hasSpace(t)) ? "seahorse" : "jellyfish");
      return animal(m, id, species, homes.find((t) => canLive(species, t) && hasSpace(t)));
    }
    case "upgrade": {
      const home = m.tanks.find((t) => !t.upgrades.lamp) ?? m.tanks.find((t) => !t.upgrades.filter || t.type === "small");
      const kind = home && !home.upgrades.lamp ? "lamp" : home && !home.upgrades.filter ? "filter" : "bigger";
      const price = UPGRADE_PRICE[kind];
      return purchase(m, price, step(id, line("Upgrade a tank!", "タンクを アップしよう！"),
        line("Open a tank. Tap Upgrade.", "タンクを ひらいて、「アップ」を おそう！"),
        line(`Open tank ${home?.slot ?? "A"}, tap Upgrade, and choose ${kind === "bigger" ? "Bigger tank" : kind === "lamp" ? "Lamp" : "Filter"} for ${price} coins.`, `タンク ${home?.slot ?? "A"} の「アップ」で ${kind === "lamp" ? "ライト" : kind === "filter" ? "フィルター" : "おおきな タンク"}を えらぼう。${price} コインだよ！`), home ? tankTarget(home) : "tank-A", kind));
    }
  }
}
