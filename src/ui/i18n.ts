import type { Text } from "../game/types";
import type { Goal } from "../game/logic/model";
import type { RequestStep } from "../game/logic/requestGuide";
import { SPECIES } from "../game/data/fish";
import { DECOR } from "../game/data/decor";

const REQUEST_ACTION = {
  visitor: { en: "TAP THE VISITOR!", ja: "おきゃくさんを タップ！" },
  tank: { en: "TAP A TANK!", ja: "タンクを タップ！" },
  fish: { en: "TAP A FISH!", ja: "さかなを タップ！" },
  animal: { en: "TAP AN ANIMAL!", ja: "いきものを タップ！" },
  thing: { en: "TAP A FISH OR DECORATION!", ja: "さかなや かざりを タップ！" },
  lookTank: { en: "LOOK IN THIS TANK!", ja: "この タンクを みよう！" }
};
const COLOR_JA: Record<string, string> = {
  red: "あかい", blue: "あおい", yellow: "きいろい", green: "みどりの", orange: "オレンジの",
  purple: "むらさきの", pink: "ピンクの", white: "しろい"
};

/** Tag copy lives here; the request logic supplies only its semantic step. */
export function requestAction(step: RequestStep): Text & { kind: "tap" | "look" } {
  if (step.step === "tank" && step.tier >= 2) return { kind: "look", ...REQUEST_ACTION.lookTank };
  if (step.step !== "exact" || !step.exact) return { kind: "tap", ...REQUEST_ACTION[step.step === "exact" ? "thing" : step.step] };
  const target = step.exact;
  const def = target.type === "fish" ? SPECIES[target.species] : DECOR[target.kind];
  const color = target.type === "fish" ? SPECIES[target.species].color : target.variant;
  const fish = target.type === "fish" && SPECIES[target.species].kind === "fish";
  const en = fish ? `${color} fish` : target.type === "fish" ? SPECIES[target.species].word : `${color && COLOR_JA[color] ? `${color} ` : ""}${def.name.toLowerCase()}`;
  const ja = fish ? `${COLOR_JA[color ?? ""] ?? ""} さかな` : `${target.type === "decor" && color && COLOR_JA[color] ? `${COLOR_JA[color]} ` : ""}${def.ja}`;
  return { kind: "tap", en: `TAP THE ${en.toUpperCase()}!`, ja: `${ja}を タップ！` };
}

/** Shared action instructions: colours and icons are fixed by ActionTag. */
export const ACTION = {
  sayThenTap: { en: "SAY IT, THEN TAP!", ja: "いってから タップ！" },
  sayThis: { en: "SAY THIS!", ja: "これを いおう！" },
  sayOne: { en: "SAY ONE!", ja: "ひとつ えらんで いおう！" },
  sayAnswer: { en: "SAY THE ANSWER!", ja: "こたえを いおう！" },
  tapAnswer: { en: "TAP AN ANSWER!", ja: "こたえを タップ！" },
  sayOrTap: { en: "SAY IT OR TAP IT!", ja: "いうか、タップしよう！" },
  lookAnimal: { en: "LOOK AT THE GLOWING ANIMAL!", ja: "ひかる いきものを みよう！" },
  lookFish: { en: "LOOK AT THE FISH!", ja: "さかなを みよう！" },
  tapFish: { en: "Tap Fish!", ja: "「さかな」を タップしよう！" },
  tapTank: { en: "TAP THE TANK!", ja: "タンクを タップ！" },
  tapVisitor: { en: "TAP THE VISITOR!", ja: "おきゃくさんを タップ！" },
  tapCircle: { en: "TAP A CIRCLE!", ja: "まるを タップ！" },
  tapFeed: { en: "TAP FEED!", ja: "「えさ」を タップ！" },
  tapTray: { en: "TAP A DECORATION!", ja: "かざりを タップ！" },
  aquariumBoss: { en: "You're the aquarium boss!", ja: "きみが すいぞくかんの かんちょうだよ！" },
  tapToPlay: { en: "Tap things to play!", ja: "タップして あそぼう！" },
  tapToPlayTouch: { en: "Tap things to play!", ja: "ゆびで タップしよう！" },
  tapToPlayMouse: { en: "Tap things to play!", ja: "マウスで クリックしよう！" }
} satisfies Record<string, Text>;

export const AUDIO = {
  speakClearly: { en: "Speak clearly!", ja: "マイクの ちかくで、はっきり はなそう！" },
  normalVoice: { en: "Use your normal voice. Don't shout!", ja: "ふつうの こえで いいよ！" },
  quiet: { en: "Try speaking closer to the mic!", ja: "マイクに ちかづいて はなそう！" },
  overload: { en: "A little softer, please!", ja: "もう すこし ちいさな こえで はなそう！" },
  neutral: { en: "Let's try again!", ja: "もう いちど やってみよう！" },
  practice: { en: "Say it out loud, then tap your answer.", ja: "こえに だして いってから、こたえを タップしよう。" },
  speaker: { en: "Can you hear Pico?", ja: "ピコの こえが きこえるかな？" },
  mic: { en: "Let's test your microphone!", ja: "マイクを ためしてみよう！" },
  signalOnly: { en: "I can hear sound, but I couldn't understand. Let's try again!", ja: "おとは きこえたよ。ことばは わからなかったよ。もう いちど やってみよう！" },
  recognised: { en: "Great! I heard you!", ja: "いいね！ことばが きこえたよ！" }
} satisfies Record<string, Text>;

/** UI text: short English with optional hiragana-forward Japanese help (never a translation of target English). */
export const UI = {
  speakKeys: { en: "Press SPACE and say it!", ja: "スペースを おして いってみよう" },
  speakTouch: { en: "Tap the mic and say it!", ja: "マイクを おして いってみよう" },
  listening: { en: "Listening...", ja: "きいているよ…" },
  tryAgain: { en: "Try again!", ja: "もう いちど! よく きいてね" },
  lookWord: { en: "Look at the word!", ja: "ひかっている ことばを いってみよう" },
  rescue: { en: "Say it, or tap it.", ja: "いうか、タップしよう" },
  choose: { en: "Choose one.", ja: "えらぼう" },
  unclear: { en: "One answer, please!", ja: "ひとつだけ いってね" },
  wrong: { en: "Not that one.", ja: "それじゃないよ" },
  next: { en: "Next", ja: "つぎへ" },
  micBlocked: { en: "Microphone is off: tap the answers.", ja: "マイクが つかえないので タップで こたえよう" },
  tapTank: { en: "Tap a tank!", ja: "タンクを タップして さかなを いれよう" },
  placeTank: { en: "Tap a place!", ja: "タンクを おく ばしょを タップ" },
  later: { en: "Later", ja: "あとで" },
  full: { en: "Full", ja: "いっぱい" },
  needCoins: { en: "More coins", ja: "もっと コインが ひつよう" },
  showMe: { en: "Show me!", ja: "みせてあげよう! タンクを ひらいて タップ" },
  findFish: { en: "Find the fish the visitor wants!", ja: "おきゃくさんが ほしい さかなを さがそう！" },
  findAnimal: { en: "Find the animal the visitor wants!", ja: "おきゃくさんが ほしい いきものを さがそう！" },
  findThing: { en: "Find what the visitor wants!", ja: "おきゃくさんが ほしい ものを さがそう！" },
  nameAnimal: { en: "Name the glowing animal!", ja: "ひかっている いきものの なまえを えいごで いおう！" },
  countFish: { en: "Count the fish in this tank!", ja: "この タンクの さかなを かぞえて えいごで いおう！" },
  findGlow: { en: "Find the shiny tank!", ja: "もどって、ひかっている タンクを さがそう" }
} satisfies Record<string, Text>;

export const STAGE_NAMES: Record<number, Text> = {
  1: { en: "My First Fish", ja: "はじめての さかな" },
  2: { en: "More Fish", ja: "さかなを ふやそう" },
  3: { en: "First Visitors", ja: "おきゃくさんが きた!" },
  4: { en: "Aquarium Designer", ja: "すいぞくかん デザイナー" },
  5: { en: "Aquarium Star", ja: "アクアリウム スター" },
  6: { en: "Ocean Hall", ja: "うみの ホール" },
  7: { en: "Sea Friends", ja: "うみの なかま" },
  8: { en: "Super Aquarium", ja: "スーパー すいぞくかん" }
};

/** A small preview shared by completion cards and the level overview. */
export const STAGE_PREVIEWS: Record<number, Text> = {
  1: { en: "Get a fish, feed it, and help a visitor.", ja: "さかなを かって、えさを あげて、おきゃくさんを たすけよう。" },
  2: { en: "Get two fish, count them, and clean.", ja: "さかなを 2ひきにして、かぞえて、そうじしよう。" },
  3: { en: "Help three visitors with English.", ja: "えいごで おきゃくさんを 3にん たすけよう。" },
  4: { en: "Fill and decorate a Big Tank.", ja: "おおきな タンクに さかなと かざりを いれよう。" },
  5: { en: "Help visitors and make every tank happy.", ja: "おきゃくさんを たすけて、みんなを ハッピーにしよう。" },
  6: { en: "Open a new room and get a sea turtle.", ja: "あたらしい へやを ひらいて、ウミガメを むかえよう。" },
  7: { en: "Get a Tall Tank and name sea animals.", ja: "たかい タンクを おいて、いきものの なまえを いおう。" },
  8: { en: "Try an upgrade and earn a crown.", ja: "アップグレードして、おうかんを めざそう。" }
};

export const REWARD_TEXT: Record<string, Text> = {
  decor: { en: "Decorations!", ja: "かざりが かえるように なったよ!" },
  yellow: { en: "A new fish!", ja: "あたらしい さかなが かえるよ!" },
  tank: { en: "A big tank!", ja: "おおきな タンクが かえるよ!" },
  special: { en: "A special visitor!", ja: "とくべつな おきゃくさんが くるよ!" },
  tall: { en: "A tall tank!", ja: "たかい タンク、タツノオトシゴ、クラゲが かえるよ!" },
  upgrades: { en: "Upgrades!", ja: "あたらしい かざりと アップグレードが かえるよ!" }
};

export function goalText(g: Goal): Text {
  switch (g.id) {
    case "buyFish":
      return { en: "Get a fish", ja: "さかなを かう" };
    case "feed":
      return { en: "Food time", ja: "えさを あげる" };
    case "visitor":
      return { en: "Help a visitor", ja: "おきゃくさんを たすける" };
    case "twoFish":
      return { en: "Two fish", ja: "さかなを 2ひきに" };
    case "count":
      return { en: "Count the fish", ja: "さかなを かぞえる" };
    case "clean":
      return { en: "Sparkly water", ja: "タンクを そうじする" };
    case "help":
      return { en: "Help visitors", ja: "おきゃくさんを たすける" };
    case "placeBig":
      return { en: "Big tank", ja: "おおきな タンクを おく" };
    case "fishInBig":
      return { en: "Fish in the big tank", ja: "おおきな タンクに さかな" };
    case "decorBig":
      return { en: "Decorate it", ja: "おおきな タンクに かざり 2つ" };
    case "allHappy":
      return { en: "Happy fish everywhere", ja: "ぜんぶの さかなを ハッピーに" };
    case "openHall":
      return { en: "Open the Ocean Hall", ja: "うみの ホールを ひらく" };
    case "turtle":
      return { en: "A turtle", ja: "うみの タンクに ウミガメ" };
    case "placeTall":
      return { en: "A tall tank", ja: "たかい タンクを おく" };
    case "tallAnimal":
      return { en: "Seahorse or jellyfish", ja: "たかい タンクに タツノオトシゴか クラゲ" };
    case "named":
      return { en: "What's this?", ja: "「What's this?」に こたえる" };
    case "upgrade":
      return { en: "An upgrade", ja: "アップグレードを かう" };
  }
}

/** CSS colours for the colour words (swatches on the second miss). */
export const SWATCH: Record<string, string> = {
  red: "#ff4a5c",
  blue: "#2a62e6",
  yellow: "#ffd92e",
  green: "#2fbf5a",
  orange: "#ff6f0f",
  pink: "#ff7fae",
  purple: "#a35cff",
  white: "#f4f1e8"
};
