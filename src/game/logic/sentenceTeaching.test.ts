import { describe, expect, it } from "vitest";
import { newModel } from "./model";
import { encounterPattern, meaningVisible, phrasePattern, requestKeyword, requestPattern, SENTENCE_PATTERNS, visibleRequestKeyword } from "./sentenceTeaching";
import { requestAction } from "../../ui/i18n";

describe("sentence clues and blanked pattern meanings", () => {
  it("gets keyword metadata from requests and limits swatches to colours", () => {
    expect(requestKeyword({ kind: "show", color: "orange", fishOnly: true })).toEqual({ word: "orange", color: "orange" });
    expect(requestKeyword({ kind: "showAnimal", species: "turtle" })).toEqual({ word: "turtles" });
    expect(requestKeyword({ kind: "showAnimal", species: "moonjelly" })).toEqual({ word: "jellyfish" });
    expect(requestKeyword({ kind: "whatsThis", tankId: "t1", fishId: "f1" })).toBeNull();
  });
  it("maps variable words to shared frames without sentence matching", () => {
    expect(requestPattern({ kind: "show", color: "blue", fishOnly: true })).toBe("likeFish");
    expect(requestPattern({ kind: "show", color: "orange", fishOnly: true })).toBe("likeFish");
    expect(requestPattern({ kind: "showAnimal", species: "turtle" })).toBe(requestPattern({ kind: "showAnimal", species: "octopus" }));
    expect(phrasePattern("bluePlease")).toBe(phrasePattern("orangePlease"));
    expect(phrasePattern("itsEel")).toBe(phrasePattern("itsTurtle"));
    expect(phrasePattern("n1")).toBe(phrasePattern("n10"));
    for (const pattern of Object.values(SENTENCE_PATTERNS)) expect(pattern.ja).toContain("＿＿");
  });
  it("shows first encounters automatically, later encounters only when asked, and honours Japanese off", () => {
    const first = encounterPattern(newModel(), "likeFish");
    expect(first.first).toBe(true);
    expect(first.model.progress.seenPatterns).toEqual(["likeFish"]);
    const later = encounterPattern(first.model, "likeFish");
    expect(later).toEqual({ model: first.model, first: false });
    expect(meaningVisible(true, first.first)).toBe(true);
    expect(meaningVisible(true, later.first)).toBe(false);
    expect(meaningVisible(true, later.first, true)).toBe(true);
    expect(meaningVisible(false, true, true)).toBe(false);
    expect(meaningVisible(true, true, true, true)).toBe(false);
  });
  it("keeps tier one generic, reveals English/visual clues at tier two and clears on success", () => {
    const req = { kind: "show" as const, color: "orange" as const, fishOnly: true };
    const base = { step: "fish" as const, tankIds: [], fishIds: [], decorIds: [] };
    expect(visibleRequestKeyword(req, 1)).toBeNull();
    expect(visibleRequestKeyword(req, 2)).toEqual({ word: "orange", color: "orange" });
    expect(visibleRequestKeyword(req, 3, true)).toBeNull();
    expect(requestAction({ ...base, tier: 1 }, req).en).toBe("TAP A FISH!");
    const action = requestAction({ ...base, tier: 2 }, req);
    expect(action.en).toBe("TAP THE ORANGE FISH!");
    expect(action.ja).not.toContain("オレンジ");
    const animal = requestAction({ ...base, step: "animal", tier: 3 }, { kind: "showAnimal", species: "turtle" });
    expect(animal.en).toBe("TAP THE TURTLE!");
    expect(animal.ja).not.toContain("かめ");
  });
});
