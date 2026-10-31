import { SPECIES } from "../data/fish";
import { colorOfPhrase, NUMBER_IDS, speciesOfPhrase, type PhraseId } from "./english";
import type { Model } from "./model";
import type { Request } from "./requests";
import type { ColorId } from "../types";

/** Frames are instructional meanings. The assessed slot is always blank. */
export const SENTENCE_PATTERNS = {
  likeFish: { en: "I like ___ fish!", ja: "＿＿の さかなが すきです。" },
  likeThing: { en: "I like ___!", ja: "＿＿が すきです。" },
  countFish: { en: "How many fish? — ___ fish!", ja: "さかなは なんびき？ ＿＿ひきです。" },
  identify: { en: "What's this? — It's a ___.", ja: "これは なに？ ＿＿です。" },
  color: { en: "What color is it? — It's ___.", ja: "なにいろ？ ＿＿です。" },
  doLike: { en: "Do you like ___?", ja: "＿＿は すきですか？" },
  favoriteColor: { en: "What color do you like? — I like ___.", ja: "なにいろが すき？ ＿＿が すきです。" },
  please: { en: "___, please!", ja: "＿＿を おねがいします。" },
  animalPlease: { en: "A ___, please!", ja: "＿＿を おねがいします。" },
  feed: { en: "___ the fish!", ja: "さかなに ＿＿してね。" },
  clean: { en: "___, please!", ja: "＿＿を おねがいします。" },
  yesNo: { en: "___, I do / don't.", ja: "＿＿、そうです／そうでは ありません。" }
} as const;
export type SentencePatternId = keyof typeof SENTENCE_PATTERNS;
export const isSentencePattern = (id: unknown): id is SentencePatternId => typeof id === "string" && Object.prototype.hasOwnProperty.call(SENTENCE_PATTERNS, id);

export function requestPattern(req: Request): SentencePatternId {
  switch (req.kind) {
    case "show": return req.fishOnly ? "likeFish" : "likeThing";
    case "showAnimal": return "likeThing";
    case "count": return "countFish";
    case "whatsThis": return "identify";
    case "whatColor": return "color";
    case "chatLike": return "doLike";
    case "chatColor": return "favoriteColor";
  }
}

/** Phrase ids and existing phrase metadata, never completed sentence strings. */
export function phrasePattern(id: PhraseId): SentencePatternId {
  if (NUMBER_IDS.includes(id)) return "countFish";
  if (speciesOfPhrase(id)) return "animalPlease";
  if (id.startsWith("its")) return "identify";
  if (id.startsWith("like")) return "favoriteColor";
  if (id.startsWith("it")) return "color";
  if (colorOfPhrase(id) || id === "bigPlease" || id === "smallPlease") return "please";
  if (id === "feedFish") return "feed";
  if (id === "cleanPlease") return "clean";
  return "yesNo";
}

export type RequestKeyword = { word: string; color?: ColorId };
export function requestKeyword(req: Request): RequestKeyword | null {
  if (req.kind === "show") return { word: req.color, color: req.color };
  if (req.kind === "showAnimal") return { word: SPECIES[req.species].plural };
  return null;
}

export function visibleRequestKeyword(req: Request, tier: number, correct = false): RequestKeyword | null {
  return tier >= 2 && !correct ? requestKeyword(req) : null;
}

export function meaningVisible(japanese: boolean, first: boolean, revealed = false, correct = false): boolean {
  return japanese && !correct && (first || revealed);
}

export function encounterPattern(m: Model, pattern: SentencePatternId): { model: Model; first: boolean } {
  const seen = m.progress.seenPatterns ?? [];
  if (seen.includes(pattern)) return { model: m, first: false };
  return { model: { ...m, progress: { ...m.progress, seenPatterns: [...seen, pattern] } }, first: true };
}

