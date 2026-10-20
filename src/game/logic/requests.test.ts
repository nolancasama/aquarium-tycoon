import { describe, expect, it } from "vitest";
import { makeRng } from "./rng";
import { buyDecor, buyFish, newModel, placeDecor, placeFish, type Model, type Result } from "./model";
import { countableTanks, makeRequest, matchesShow, presentColors, requestLine, requestReward, stillValid, tankSatisfies, type Request } from "./requests";
import type { SpeciesId } from "../types";

type M = Model & { lastId?: string };

function ok(r: Result): M {
  if (!r.ok) throw new Error(r.reason);
  return Object.assign(r.m, { lastId: r.id });
}

function aquarium(stage: 1 | 2 | 3 | 4 | 5, fish: SpeciesId[], coral = false): Model {
  let m: M = { ...newModel(), coins: 1000, progress: { ...newModel().progress, stage, tutorial: "done" } };
  for (const s of fish) {
    m = ok(buyFish(m, s));
    m = ok(placeFish(m, m.inv.fish[0].id, "t1"));
  }
  if (coral) {
    m = ok(buyDecor(m, "coral", "red"));
    m = ok(placeDecor(m, m.lastId!, "t1", 0));
  }
  return m;
}

describe("visitor requests", () => {
  it("only asks for colours that are in the aquarium", () => {
    const m = aquarium(3, ["clownfish", "bluetang"]);
    expect(presentColors(m, true).sort()).toEqual(["blue", "orange"]);
    const rand = makeRng(1);
    for (let i = 0; i < 300; i++) {
      const r = makeRequest(m, rand, { last: null });
      expect(r).not.toBeNull();
      if (r!.kind === "show") {
        expect(["blue", "orange"]).toContain(r!.color);
        expect(r!.fishOnly).toBe(true);
        expect(stillValid(m, r!)).toBe(true);
      }
    }
  });

  it("asks about decorations only from Stage 4", () => {
    const early = aquarium(3, ["clownfish"], true);
    const late = aquarium(4, ["clownfish"], true);
    const kinds = (m: Model) => {
      const rand = makeRng(5);
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) {
        const r = makeRequest(m, rand, { last: null });
        if (r?.kind === "show") seen.add(`${r.color}:${r.fishOnly}`);
      }
      return seen;
    };
    expect([...kinds(early)].every((k) => k.endsWith(":true"))).toBe(true);
    expect(kinds(late).has("red:false")).toBe(true);
  });

  it("counts only tanks with 2 to 5 fish", () => {
    expect(countableTanks(aquarium(3, ["clownfish"]))).toEqual([]);
    const m = aquarium(3, ["clownfish", "clownfish"]);
    expect(countableTanks(m).map((t) => t.id)).toEqual(["t1"]);
    const rand = makeRng(9);
    let counts = 0;
    for (let i = 0; i < 200; i++) if (makeRequest(m, rand, { last: null })?.kind === "count") counts++;
    expect(counts).toBeGreaterThan(20);
  });

  it("never repeats the same kind twice in a row when there is another", () => {
    const m = aquarium(3, ["clownfish", "bluetang"]);
    const rand = makeRng(11);
    let last: Request["kind"] | null = null;
    for (let i = 0; i < 300; i++) {
      const r: Request = makeRequest(m, rand, { last })!;
      expect(r.kind).not.toBe(last);
      last = r.kind;
    }
  });

  it("makes no request for an empty aquarium", () => {
    expect(makeRequest(newModel(), makeRng(1), { last: null })).toBeNull();
  });

  it("'I like blue!' accepts anything blue; 'I like blue fish!' only fish", () => {
    const any = { kind: "show", color: "blue", fishOnly: false } as const;
    const fish = { kind: "show", color: "blue", fishOnly: true } as const;
    expect(matchesShow(any, { type: "fish", species: "bluetang" })).toBe(true);
    expect(matchesShow(any, { type: "decor", kind: "coral", variant: "blue" })).toBe(true);
    expect(matchesShow(fish, { type: "decor", kind: "coral", variant: "blue" })).toBe(false);
    expect(matchesShow(fish, { type: "fish", species: "clownfish" })).toBe(false);
    expect(matchesShow(any, { type: "decor", kind: "rock", variant: "big" })).toBe(false);
    const m = aquarium(4, ["clownfish"], true);
    expect(tankSatisfies({ kind: "show", color: "red", fishOnly: false }, m.tanks[0])).toBe(true);
    expect(tankSatisfies({ kind: "show", color: "red", fishOnly: true }, m.tanks[0])).toBe(false);
  });

  it("says short sentences and pays more when the fish are happy", () => {
    expect(requestLine({ kind: "show", color: "yellow", fishOnly: true })).toBe("I like yellow fish!");
    expect(requestLine({ kind: "show", color: "red", fishOnly: false })).toBe("I like red!");
    expect(requestLine({ kind: "count", tankId: "t1" })).toBe("How many fish?");
    const m = aquarium(4, ["clownfish"], true);
    expect(requestReward({ kind: "count", tankId: "t1" }, m.tanks[0])).toBe(15);
    expect(requestReward({ kind: "count", tankId: "t1" }, aquarium(3, ["clownfish"]).tanks[0])).toBe(10);
    expect(requestReward({ kind: "chatLike" }, null)).toBe(8);
  });
});
