import type { ColorId } from "../types";

/**
 * Every sentence the student says or taps. `keys` are the content words that
 * must be heard: one word from each group (accent and recogniser variants
 * included). "Please", articles, "I like", punctuation and word order are not
 * judged; a false rejection teaches a child that correct English was wrong.
 */
export interface Phrase {
  id: PhraseId;
  en: string;
  keys: string[][];
  /** Hearing any of these rules the phrase out ("no" in a "yes" answer). */
  forbid?: string[];
  /** Wrong-but-plausible sentences for Tap-mode commands. */
  distractors?: PhraseId[];
  /** The word to highlight on the second miss. */
  key: string;
}

export type PhraseId =
  | "orangePlease"
  | "bluePlease"
  | "yellowPlease"
  | "redPlease"
  | "bigPlease"
  | "smallPlease"
  | "feedFish"
  | "cleanPlease"
  | "n1"
  | "n2"
  | "n3"
  | "n4"
  | "n5"
  | "yesIDo"
  | "noIDont"
  | "likeRed"
  | "likeBlue"
  | "likeYellow"
  | "likeGreen"
  | "likeOrange";

const YES = ["yes", "yeah", "yep", "yup", "yea", "yas", "yess", "yesh", "jess", "ies", "guess", "okay", "ok", "sure"];
const NO = ["no", "nope", "nah", "know", "noh", "nou", "nor", "not", "don't", "dont"];

/**
 * Colour words with recogniser variants for Japanese-accented English.
 * "clean"/"glean" count as green only here (colour prompts); the clean
 * command has its own list without "green". "hello" is a frequent
 * misrecognition of "yellow"; no colour prompt offers a greeting.
 */
export const COLOR_WORDS: Record<ColorId, string[]> = {
  red: ["red", "reds", "read", "led", "rad", "wred", "redd", "reddo", "red's"],
  blue: ["blue", "blues", "blew", "bleu", "brew", "brue", "bloo", "bru", "blue's", "buru"],
  yellow: ["yellow", "yellows", "yello", "yelo", "yeller", "iero", "ierou", "jello", "hello", "yellow's"],
  green: ["green", "greens", "grin", "greene", "clean", "glean", "grean", "gureen"],
  orange: ["orange", "oranges", "orrange", "orenji", "orinj", "orange's", "oranje", "orang"]
};

const BIG = ["big", "bigger", "biggest", "bigg", "bigu", "biggu", "beg", "bag", "big's"];
const SMALL = ["small", "smaller", "smallest", "smol", "smal", "smoll", "smalls", "sumo", "sumooru", "small's"];
const FEED = ["feed", "feeds", "feeding", "fead", "feet", "fee", "feat", "fid", "fiid", "feedo"];
const FISH = ["fish", "fishes", "fish's", "fishy", "fisch", "fiche", "fisher", "feesh", "fishu", "fist", "fishing", "fis"];
const CLEAN = ["clean", "cleans", "cleaning", "cleaned", "cleaner", "crean", "klean", "kleen", "cleen", "kurin", "kuriin"];

/** esl-counting's number variants, plus digits (Chrome often writes "3"). */
export const NUMBER_WORDS: Record<number, string[]> = {
  1: ["one", "won", "wan", "1"],
  2: ["two", "too", "to", "tu", "2"],
  3: ["three", "free", "tree", "sri", "sree", "3"],
  4: ["four", "for", "fore", "foe", "4"],
  5: ["five", "fife", "faibu", "5"]
};

const NUMBER_EN = ["", "One", "Two", "Three", "Four", "Five"];

export const NUMBER_PHRASE: Record<number, PhraseId> = { 1: "n1", 2: "n2", 3: "n3", 4: "n4", 5: "n5" };

export const SHOP_COLOR_PHRASE: Partial<Record<ColorId, PhraseId>> = {
  orange: "orangePlease",
  blue: "bluePlease",
  yellow: "yellowPlease",
  red: "redPlease"
};

export const LIKE_COLOR_PHRASE: Record<ColorId, PhraseId> = {
  red: "likeRed",
  blue: "likeBlue",
  yellow: "likeYellow",
  green: "likeGreen",
  orange: "likeOrange"
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const please = (id: PhraseId, c: ColorId): Phrase => ({ id, en: `${cap(c)}, please!`, keys: [COLOR_WORDS[c]], key: cap(c) });
const like = (id: PhraseId, c: ColorId): Phrase => ({ id, en: `I like ${c}.`, keys: [COLOR_WORDS[c]], key: c });
const num = (n: number): Phrase => ({
  id: NUMBER_PHRASE[n],
  en: `${NUMBER_EN[n]} fish!`,
  keys: [NUMBER_WORDS[n]],
  key: NUMBER_EN[n]
});

export const PHRASES: Record<PhraseId, Phrase> = {
  orangePlease: please("orangePlease", "orange"),
  bluePlease: please("bluePlease", "blue"),
  yellowPlease: please("yellowPlease", "yellow"),
  redPlease: please("redPlease", "red"),
  bigPlease: { id: "bigPlease", en: "Big, please!", keys: [BIG], key: "Big" },
  smallPlease: { id: "smallPlease", en: "Small, please!", keys: [SMALL], key: "Small" },
  feedFish: { id: "feedFish", en: "Feed the fish!", keys: [FEED, FISH], distractors: ["cleanPlease", "bigPlease"], key: "Feed" },
  cleanPlease: { id: "cleanPlease", en: "Clean, please!", keys: [CLEAN], distractors: ["feedFish", "smallPlease"], key: "Clean" },
  n1: num(1),
  n2: num(2),
  n3: num(3),
  n4: num(4),
  n5: num(5),
  // Answers are judged on yes / no: the question already fixes "do".
  yesIDo: { id: "yesIDo", en: "Yes, I do.", keys: [YES], forbid: NO, key: "Yes" },
  noIDont: { id: "noIDont", en: "No, I don't.", keys: [NO], forbid: ["yes", "yeah", "yep"], key: "No" },
  likeRed: like("likeRed", "red"),
  likeBlue: like("likeBlue", "blue"),
  likeYellow: like("likeYellow", "yellow"),
  likeGreen: like("likeGreen", "green"),
  likeOrange: like("likeOrange", "orange")
};

export const PHRASE_IDS = Object.keys(PHRASES) as PhraseId[];

export const NUMBER_IDS: PhraseId[] = ["n1", "n2", "n3", "n4", "n5"];

export function numberOf(id: PhraseId): number | null {
  const i = NUMBER_IDS.indexOf(id);
  return i < 0 ? null : i + 1;
}

export function colorOfPhrase(id: PhraseId): ColorId | null {
  for (const [c, p] of Object.entries(SHOP_COLOR_PHRASE)) if (p === id) return c as ColorId;
  for (const [c, p] of Object.entries(LIKE_COLOR_PHRASE)) if (p === id) return c as ColorId;
  return null;
}
