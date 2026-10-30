import { describe, expect, it } from "vitest";
import type { PromptUi } from "../game/store";
import { promptHeading } from "./promptHeading";

const command: Pick<PromptUi, "kind" | "sentences" | "frame" | "buttons" | "misses"> = {
  kind: "command", sentences: [{ id: "feedFish", en: "Feed the fish!" }], frame: null, buttons: false, misses: 0
};

describe("prompt action heading", () => {
  it("distinguishes a model sentence from a free choice", () => {
    expect(promptHeading(command, true).en).toBe("SAY THIS!");
    expect(promptHeading({ ...command, kind: "choice" }, true).en).toBe("SAY ONE!");
  });
  it("asks for the correct answer when alternatives or a frame form a quiz", () => {
    expect(promptHeading({ ...command, sentences: [...command.sentences, { id: "cleanPlease", en: "Clean, please!" }] }, true).en).toBe("SAY THE ANSWER!");
    expect(promptHeading({ ...command, frame: { before: "", after: " fish!", slots: [] } }, true).en).toBe("SAY THE ANSWER!");
  });
  it("uses tapping for unavailable microphones and preserves the spoken rescue", () => {
    expect(promptHeading({ ...command, buttons: true }, false)).toMatchObject({ kind: "tap", en: "TAP AN ANSWER!" });
    expect(promptHeading({ ...command, buttons: true, misses: 3 }, true)).toMatchObject({ kind: "say", en: "SAY IT OR TAP IT!" });
    expect(promptHeading({ ...command, buttons: true, misses: 3 }, false).en).toBe("TAP AN ANSWER!");
  });
});
