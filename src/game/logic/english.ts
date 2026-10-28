import type { ColorId, SpeciesId } from "../types";

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
  | "whitePlease"
  | "pinkPlease"
  | "turtlePlease"
  | "seahorsePlease"
  | "jellyfishPlease"
  | "bigPlease"
  | "smallPlease"
  | "feedFish"
  | "cleanPlease"
  | "n1"
  | "n2"
  | "n3"
  | "n4"
  | "n5"
  | "n6"
  | "n7"
  | "n8"
  | "n9"
  | "n10"
  | "itsTurtle"
  | "itsSeahorse"
  | "itsJellyfish"
  | "itsFish"
  | "yesIDo"
  | "noIDont"
  | "likeRed"
  | "likeBlue"
  | "likeYellow"
  | "likeGreen"
  | "likeOrange"
  | "likePink"
  | "likePurple"
  | "likeWhite"
  // Expansion 1: new fish colours, sea animals by name, "It's ___." and "What color is it?".
  | "greenPlease"
  | "purplePlease"
  | "eelPlease"
  | "octopusPlease"
  | "crabPlease"
  | "stingrayPlease"
  | "itsEel"
  | "itsOctopus"
  | "itsCrab"
  | "itsStingray"
  | "itRed"
  | "itBlue"
  | "itYellow"
  | "itGreen"
  | "itOrange"
  | "itPink"
  | "itPurple"
  | "itWhite";

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
  orange: ["orange", "oranges", "orrange", "orenji", "orinj", "orange's", "oranje", "orang"],
  pink: ["pink", "pinks", "pinku", "ping", "pinky", "pink's"],
  purple: ["purple", "purples", "purpur", "pupple", "purpel", "papuru", "paapuru", "purple's"],
  white: ["white", "whites", "wite", "wait", "howaito", "whyte", "white's"]
};

/** Animal names with recogniser variants ("sea horse" and "jelly fish" are heard joined). */
const TURTLE = ["turtle", "turtles", "turtle's", "tuttle", "tertle", "tattle", "turtl", "tatoru", "kurtle"];
const SEAHORSE = ["seahorse", "seahorses", "seahorse's", "seahose", "shehorse", "sihorse", "horse", "horses"];
const JELLYFISH = ["jellyfish", "jellyfishes", "jellyfish's", "jerryfish", "jelly", "jellies", "jerry", "zeryfish"];
const EEL = ["eel", "eels", "eel's", "eal", "iel", "moray", "morays", "eeru", "iiru"];
const OCTOPUS = ["octopus", "octopuses", "octopi", "octopus's", "octopuss", "octapus", "oktopus", "okutopasu", "tako"];
const CRAB = ["crab", "crabs", "crab's", "krab", "crabb", "kurabu", "grab"];
const STINGRAY = ["stingray", "stingrays", "stingray's", "sting", "ray", "rays", "sutingurei", "stingrey"];
/** "It's a fish." must not also match "jelly fish", "sea horse", "turtle" or the other sea animals. */
const NOT_FISH = ["jelly", "jellyfish", "jerry", "jerryfish", "seahorse", "horse", "turtle", "turtles", "eel", "moray", "octopus", "crab", "stingray", "ray"];

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
  5: ["five", "fife", "faibu", "5"],
  6: ["six", "sicks", "siks", "shix", "sikkusu", "6"],
  7: ["seven", "sevens", "seben", "sebun", "7"],
  8: ["eight", "ate", "eito", "eighth", "8"],
  9: ["nine", "nein", "nain", "nine's", "9"],
  10: ["ten", "tan", "tin", "tenn", "10"]
};

const NUMBER_EN = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export const NUMBER_PHRASE: Record<number, PhraseId> = { 1: "n1", 2: "n2", 3: "n3", 4: "n4", 5: "n5", 6: "n6", 7: "n7", 8: "n8", 9: "n9", 10: "n10" };

export const SHOP_COLOR_PHRASE: Partial<Record<ColorId, PhraseId>> = {
  orange: "orangePlease",
  blue: "bluePlease",
  yellow: "yellowPlease",
  red: "redPlease",
  white: "whitePlease",
  pink: "pinkPlease",
  green: "greenPlease",
  purple: "purplePlease"
};

/**
 * Sea animals are ordered by name ("A turtle, please!"). Every kind of
 * jellyfish is ordered as "A jellyfish, please!" (then by colour once there
 * is more than one kind): the phrase maps to the original jellyfish.
 */
export const ANIMAL_PHRASE: Partial<Record<SpeciesId, PhraseId>> = {
  turtle: "turtlePlease",
  seahorse: "seahorsePlease",
  jellyfish: "jellyfishPlease",
  eel: "eelPlease",
  octopus: "octopusPlease",
  crab: "crabPlease",
  stingray: "stingrayPlease"
};

/** "What's this?" answers: every fish is "a fish", every jellyfish "a jellyfish". */
export const ITS_PHRASE: Record<SpeciesId, PhraseId> = {
  clownfish: "itsFish",
  bluetang: "itsFish",
  yellowfish: "itsFish",
  pufferfish: "itsFish",
  turtle: "itsTurtle",
  seahorse: "itsSeahorse",
  jellyfish: "itsJellyfish",
  angelfish: "itsFish",
  goby: "itsFish",
  chromis: "itsFish",
  eel: "itsEel",
  octopus: "itsOctopus",
  crab: "itsCrab",
  stingray: "itsStingray",
  moonjelly: "itsJellyfish",
  spottedjelly: "itsJellyfish",
  seanettle: "itsJellyfish"
};

/** "What color is it?" answers ("It's blue."). */
export const IT_COLOR_PHRASE: Record<ColorId, PhraseId> = {
  red: "itRed",
  blue: "itBlue",
  yellow: "itYellow",
  green: "itGreen",
  orange: "itOrange",
  pink: "itPink",
  purple: "itPurple",
  white: "itWhite"
};

export const LIKE_COLOR_PHRASE: Record<ColorId, PhraseId> = {
  red: "likeRed",
  blue: "likeBlue",
  yellow: "likeYellow",
  green: "likeGreen",
  orange: "likeOrange",
  pink: "likePink",
  purple: "likePurple",
  white: "likeWhite"
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const please = (id: PhraseId, c: ColorId): Phrase => ({ id, en: `${cap(c)}, please!`, keys: [COLOR_WORDS[c]], key: cap(c) });
const like = (id: PhraseId, c: ColorId): Phrase => ({ id, en: `I like ${c}.`, keys: [COLOR_WORDS[c]], key: c });
const itColor = (id: PhraseId, c: ColorId): Phrase => ({ id, en: `It's ${c}.`, keys: [COLOR_WORDS[c]], key: c });
const animal = (id: PhraseId, en: string, keys: string[], key: string): Phrase => ({ id, en, keys: [keys], key });
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
  whitePlease: please("whitePlease", "white"),
  pinkPlease: please("pinkPlease", "pink"),
  turtlePlease: animal("turtlePlease", "A turtle, please!", TURTLE, "turtle"),
  seahorsePlease: animal("seahorsePlease", "A seahorse, please!", SEAHORSE, "seahorse"),
  jellyfishPlease: animal("jellyfishPlease", "A jellyfish, please!", JELLYFISH, "jellyfish"),
  bigPlease: { id: "bigPlease", en: "Big, please!", keys: [BIG], key: "Big" },
  smallPlease: { id: "smallPlease", en: "Small, please!", keys: [SMALL], key: "Small" },
  feedFish: { id: "feedFish", en: "Feed the fish!", keys: [FEED, FISH], distractors: ["cleanPlease", "bigPlease"], key: "Feed" },
  cleanPlease: { id: "cleanPlease", en: "Clean, please!", keys: [CLEAN], distractors: ["feedFish", "smallPlease"], key: "Clean" },
  n1: num(1),
  n2: num(2),
  n3: num(3),
  n4: num(4),
  n5: num(5),
  n6: num(6),
  n7: num(7),
  n8: num(8),
  n9: num(9),
  n10: num(10),
  itsTurtle: animal("itsTurtle", "It's a turtle.", TURTLE, "turtle"),
  itsSeahorse: animal("itsSeahorse", "It's a seahorse.", SEAHORSE, "seahorse"),
  itsJellyfish: animal("itsJellyfish", "It's a jellyfish.", JELLYFISH, "jellyfish"),
  itsFish: { id: "itsFish", en: "It's a fish.", keys: [FISH], forbid: NOT_FISH, key: "fish" },
  // Answers are judged on yes / no: the question already fixes "do".
  yesIDo: { id: "yesIDo", en: "Yes, I do.", keys: [YES], forbid: NO, key: "Yes" },
  noIDont: { id: "noIDont", en: "No, I don't.", keys: [NO], forbid: ["yes", "yeah", "yep"], key: "No" },
  likeRed: like("likeRed", "red"),
  likeBlue: like("likeBlue", "blue"),
  likeYellow: like("likeYellow", "yellow"),
  likeGreen: like("likeGreen", "green"),
  likeOrange: like("likeOrange", "orange"),
  likePink: like("likePink", "pink"),
  likePurple: like("likePurple", "purple"),
  likeWhite: like("likeWhite", "white"),
  greenPlease: please("greenPlease", "green"),
  purplePlease: please("purplePlease", "purple"),
  eelPlease: animal("eelPlease", "An eel, please!", EEL, "eel"),
  octopusPlease: animal("octopusPlease", "An octopus, please!", OCTOPUS, "octopus"),
  crabPlease: animal("crabPlease", "A crab, please!", CRAB, "crab"),
  stingrayPlease: animal("stingrayPlease", "A stingray, please!", STINGRAY, "stingray"),
  itsEel: animal("itsEel", "It's an eel.", EEL, "eel"),
  itsOctopus: animal("itsOctopus", "It's an octopus.", OCTOPUS, "octopus"),
  itsCrab: animal("itsCrab", "It's a crab.", CRAB, "crab"),
  itsStingray: animal("itsStingray", "It's a stingray.", STINGRAY, "stingray"),
  itRed: itColor("itRed", "red"),
  itBlue: itColor("itBlue", "blue"),
  itYellow: itColor("itYellow", "yellow"),
  itGreen: itColor("itGreen", "green"),
  itOrange: itColor("itOrange", "orange"),
  itPink: itColor("itPink", "pink"),
  itPurple: itColor("itPurple", "purple"),
  itWhite: itColor("itWhite", "white")
};

export const PHRASE_IDS = Object.keys(PHRASES) as PhraseId[];

export const NUMBER_IDS: PhraseId[] = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10"];

/** "What's this?" answers before Level 8 (distractors stay among animals the class has met). */
export const ITS_IDS_BASE: PhraseId[] = ["itsTurtle", "itsSeahorse", "itsJellyfish", "itsFish"];
/** Every "What's this?" answer (the judge hears them all). */
export const ITS_IDS: PhraseId[] = [...ITS_IDS_BASE, "itsEel", "itsOctopus", "itsCrab", "itsStingray"];
export const IT_COLOR_IDS: PhraseId[] = Object.values(IT_COLOR_PHRASE);

export function numberOf(id: PhraseId): number | null {
  const i = NUMBER_IDS.indexOf(id);
  return i < 0 ? null : i + 1;
}

export function speciesOfPhrase(id: PhraseId): SpeciesId | null {
  for (const [sp, p] of Object.entries(ANIMAL_PHRASE)) if (p === id) return sp as SpeciesId;
  return null;
}

export function colorOfPhrase(id: PhraseId): ColorId | null {
  for (const [c, p] of Object.entries(SHOP_COLOR_PHRASE)) if (p === id) return c as ColorId;
  for (const [c, p] of Object.entries(LIKE_COLOR_PHRASE)) if (p === id) return c as ColorId;
  for (const [c, p] of Object.entries(IT_COLOR_PHRASE)) if (p === id) return c as ColorId;
  return null;
}
