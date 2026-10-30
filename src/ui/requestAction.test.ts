import { describe, expect, it } from "vitest";
import type { RequestStep } from "../game/logic/requestGuide";
import { requestAction } from "./i18n";

const base: RequestStep = { step: "tank", tier: 1, tankIds: [], fishIds: [], decorIds: [] };

describe("visitor action copy", () => {
  it("keeps the first step generic and uses LOOK for the tank clue", () => {
    expect(requestAction(base)).toMatchObject({ kind: "tap", en: "TAP A TANK!" });
    expect(requestAction({ ...base, step: "fish" })).toMatchObject({ kind: "tap", en: "TAP A FISH!" });
    expect(requestAction({ ...base, tier: 2 })).toMatchObject({ kind: "look", en: "LOOK IN THIS TANK!" });
  });
  it("names the fish only when the exact step supplies it", () => {
    expect(requestAction({ ...base, step: "exact", tier: 3, exact: { type: "fish", species: "bluetang" } }))
      .toMatchObject({ kind: "tap", en: "TAP THE BLUE FISH!", ja: "あおい さかなを タップ！" });
  });
  it("uses an animal name or a decoration colour for an exact target", () => {
    expect(requestAction({ ...base, step: "exact", tier: 3, exact: { type: "fish", species: "turtle" } }).en)
      .toBe("TAP THE TURTLE!");
    expect(requestAction({ ...base, step: "exact", tier: 3, exact: { type: "decor", kind: "coral", variant: "red" } }).en)
      .toBe("TAP THE RED CORAL!");
  });
});
