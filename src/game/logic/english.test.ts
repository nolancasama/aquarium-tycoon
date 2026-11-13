import { describe, expect, it } from "vitest";
import { isActivePhrase, isSavedPhrase, PHRASE_IDS, PHRASES, RETIRED_PHRASE_IDS } from "./english";
import { isSavedSentencePattern, isSentencePattern, phrasePattern, RETIRED_SENTENCE_PATTERN_IDS, SENTENCE_PATTERNS } from "./sentenceTeaching";
import { judgeSpeech } from "./speechMatch";

describe("active curriculum registry", () => {
  it("has no retired language in answers, speech targets or instructional frames", () => {
    for (const id of PHRASE_IDS) {
      const phrase = PHRASES[id];
      expect(phrase.en).not.toMatch(/\b(?:can it|where is|it can|it can't)\b/i);
      expect(phrase.key.toLowerCase()).not.toMatch(/^(?:in|on|under|by|above|island|boat)$/);
      expect(phrase.keys.flat()).not.toEqual(expect.arrayContaining(["above"]));
      expect(isSentencePattern(phrasePattern(id))).toBe(true);
    }
    for (const frame of Object.values(SENTENCE_PATTERNS)) expect(frame.en).not.toMatch(/\b(?:can it|where is)\b/i);
    for (const id of RETIRED_PHRASE_IDS) {
      expect(isSavedPhrase(id)).toBe(true);
      expect(isActivePhrase(id)).toBe(false);
    }
    for (const id of RETIRED_SENTENCE_PATTERN_IDS) {
      expect(isSavedSentencePattern(id)).toBe(true);
      expect(isSentencePattern(id)).toBe(false);
    }
  });

  it("recognizes the existing identification, count, likes and size replacements", () => {
    const groups = [
      ["itsShark", "itsRay"], ["itsPenguin", "itsSeal", "itsOtter"],
      ["itsDolphin", "itsOrca", "itsBeluga"], ["yesIDo", "noIDont"],
      ["itsBig", "itsSmall"], ["pg2", "pg3", "pg4"],
      ["dl2", "dl3", "dl4"], ["oc2", "oc3", "oc4"], ["sk2", "sk3", "sk4"]
    ] as const;
    for (const group of groups) {
      const phrases = group.map((id) => PHRASES[id]);
      for (const phrase of phrases) {
        expect(judgeSpeech([phrase.en], phrases)).toMatchObject({ kind: "match", id: phrase.id });
      }
    }
  });
});
