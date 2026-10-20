import type { Text } from "../game/types";
import type { Goal } from "../game/logic/model";

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
  findGlow: { en: "Find the shiny tank!", ja: "もどって、ひかっている タンクを さがそう" }
} satisfies Record<string, Text>;

export const STAGE_NAMES: Record<number, Text> = {
  1: { en: "My First Fish", ja: "はじめての さかな" },
  2: { en: "More Fish", ja: "さかなを ふやそう" },
  3: { en: "First Visitors", ja: "おきゃくさんが きた!" },
  4: { en: "Aquarium Designer", ja: "すいぞくかん デザイナー" },
  5: { en: "Aquarium Star", ja: "アクアリウム スター" }
};

export const REWARD_TEXT: Record<string, Text> = {
  decor: { en: "Decorations!", ja: "かざりが かえるように なったよ!" },
  yellow: { en: "A new fish!", ja: "あたらしい さかなが かえるよ!" },
  tank: { en: "A big tank!", ja: "おおきな タンクが かえるよ!" },
  special: { en: "A special visitor!", ja: "とくべつな おきゃくさんが くるよ!" }
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
  }
}

/** CSS colours for the colour words (swatches on the second miss). */
export const SWATCH: Record<string, string> = {
  red: "#ff4a5c",
  blue: "#2a62e6",
  yellow: "#ffd92e",
  green: "#2fbf5a",
  orange: "#ff6f0f"
};
