import { describe, expect, it } from "vitest";
import { judgeSpeech, matchesPhrase } from "./speechMatch";
import { NUMBER_IDS, PHRASES, type PhraseId } from "./english";

const P = (...ids: PhraseId[]) => ids.map((id) => PHRASES[id]);

describe("speech matching", () => {
  it("accepts the care sentences with or without punctuation and articles", () => {
    for (const said of ["feed the fish", "Feed the fish!", "FEED FISH", "feet the fish", "feeding the fishes"]) {
      expect(judgeSpeech([said], P("feedFish"))).toMatchObject({ kind: "match", id: "feedFish" });
    }
    for (const said of ["clean please", "Clean, please!", "clean", "kleen please"]) {
      expect(judgeSpeech([said], P("cleanPlease"))).toMatchObject({ kind: "match", id: "cleanPlease" });
    }
  });

  it("rejects incorrect sentences", () => {
    expect(judgeSpeech(["fish"], P("feedFish")).kind).toBe("none");
    expect(judgeSpeech(["feed"], P("feedFish")).kind).toBe("none");
    expect(judgeSpeech(["clean please"], P("feedFish")).kind).toBe("none");
    expect(judgeSpeech(["green please"], P("cleanPlease")).kind).toBe("none");
    expect(judgeSpeech(["hello"], P("feedFish")).kind).toBe("none");
  });

  it("accepts colour choices with accented variants and rejects other colours", () => {
    const shop = P("orangePlease", "bluePlease");
    expect(judgeSpeech(["blue please"], shop)).toMatchObject({ kind: "match", id: "bluePlease" });
    expect(judgeSpeech(["Bru, please."], shop)).toMatchObject({ kind: "match", id: "bluePlease" });
    expect(judgeSpeech(["orenji"], shop)).toMatchObject({ kind: "match", id: "orangePlease" });
    expect(judgeSpeech(["or range please"], shop)).toMatchObject({ kind: "match", id: "orangePlease" });
    expect(judgeSpeech(["red please"], shop).kind).toBe("none");
    expect(judgeSpeech(["led please"], P("redPlease", "bluePlease"))).toMatchObject({ kind: "match", id: "redPlease" });
    expect(judgeSpeech(["yello"], P("yellowPlease", "bluePlease"))).toMatchObject({ kind: "match", id: "yellowPlease" });
  });

  it("treats two answers at once as unclear, never as correct", () => {
    expect(judgeSpeech(["blue orange"], P("orangePlease", "bluePlease")).kind).toBe("unclear");
    expect(judgeSpeech(["two three"], P(...NUMBER_IDS)).kind).toBe("unclear");
    expect(judgeSpeech(["big small"], P("bigPlease", "smallPlease")).kind).toBe("unclear");
  });

  it("hears numbers as words, digits and accented variants", () => {
    const nums = P(...NUMBER_IDS);
    expect(judgeSpeech(["three"], nums)).toMatchObject({ id: "n3" });
    expect(judgeSpeech(["3"], nums)).toMatchObject({ id: "n3" });
    expect(judgeSpeech(["Three fish!"], nums)).toMatchObject({ id: "n3" });
    expect(judgeSpeech(["tree fish"], nums)).toMatchObject({ id: "n3" });
    expect(judgeSpeech(["for fish"], nums)).toMatchObject({ id: "n4" });
    expect(judgeSpeech(["two"], nums)).toMatchObject({ id: "n2" });
    expect(judgeSpeech(["five fish"], nums)).toMatchObject({ id: "n5" });
    expect(judgeSpeech(["fish"], nums).kind).toBe("none");
  });

  it("answers yes or no, not both", () => {
    const yn = P("yesIDo", "noIDont");
    expect(judgeSpeech(["yes I do"], yn)).toMatchObject({ id: "yesIDo" });
    expect(judgeSpeech(["Yeah."], yn)).toMatchObject({ id: "yesIDo" });
    expect(judgeSpeech(["no I don't"], yn)).toMatchObject({ id: "noIDont" });
    expect(judgeSpeech(["yes no"], yn).kind).toBe("none");
  });

  it("'I like ___.' is judged on the colour", () => {
    const likes = P("likeRed", "likeBlue", "likeYellow", "likeGreen", "likeOrange");
    expect(judgeSpeech(["I like green"], likes)).toMatchObject({ id: "likeGreen" });
    expect(judgeSpeech(["i rike blue"], likes)).toMatchObject({ id: "likeBlue" });
    expect(judgeSpeech(["I like"], likes).kind).toBe("none");
  });

  it("only the top hypothesis judges; alternatives only rescue a result that matched nothing", () => {
    const shop = P("orangePlease", "bluePlease");
    expect(judgeSpeech(["blue please", "orange please"], shop)).toMatchObject({ id: "bluePlease" });
    expect(judgeSpeech(["um", "orange please"], shop)).toMatchObject({ id: "orangePlease" });
    expect(judgeSpeech(["blue orange", "orange"], shop).kind).toBe("unclear");
  });

  it("an interim result is judged like a final one", () => {
    // "feed the" (interim) is not yet a match; "feed the fish" is.
    expect(matchesPhrase("feed the", PHRASES.feedFish)).toBe(false);
    expect(matchesPhrase("feed the fish", PHRASES.feedFish)).toBe(true);
  });
});
