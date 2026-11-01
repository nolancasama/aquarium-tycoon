import { describe, expect, it } from "vitest";
import { SPECIES } from "../game/data/fish";
import { canSpeakPreview, previewText } from "./namePreviewLogic";

describe("vocabulary preview", () => {
  it.each(["Crab", "Octopus", "Sea turtle", "Stingray", "Angelfish"])("speaks %s as a short exclamation", (name) => {
    expect(previewText(name)).toBe(`${name}!`);
  });
  it("uses existing display names and preserves multiword spacing", () => {
    expect(previewText(SPECIES.turtle.name)).toBe("Sea turtle!");
    expect(previewText(SPECIES.bluetang.name)).toBe("Blue tang!");
  });
  const idle = { available: true, muted: false, listening: false, speaking: false };
  it("speaks only when audio is available and idle", () => expect(canSpeakPreview(idle)).toBe(true));
  it.each([{ available: false }, { muted: true }, { listening: true }, { speaking: true }])("shows visual feedback only for %j", (condition) => {
    expect(canSpeakPreview({ ...idle, ...condition })).toBe(false);
  });
});
