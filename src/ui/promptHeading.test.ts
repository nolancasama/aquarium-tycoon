import { describe, expect, it } from "vitest";
import { promptHeading } from "./promptHeading";

describe("prompt action heading", () => {
  it("offers a short SAY tag only on the first pattern encounter", () => {
    expect(promptHeading({ buttons: false, firstPattern: true }, true)).toMatchObject({ kind: "say", en: "SAY" });
    expect(promptHeading({ buttons: false, firstPattern: false }, true)).toBeNull();
    expect(promptHeading({ buttons: false }, true)).toBeNull();
  });
  it("leaves later spoken prompts quiet, including tap rescue", () => {
    expect(promptHeading({ buttons: true, firstPattern: false }, true)).toBeNull();
  });
  it("keeps the tap instruction when the microphone is unavailable", () => {
    expect(promptHeading({ buttons: true, firstPattern: false }, false)).toMatchObject({ kind: "tap", en: "TAP AN ANSWER!" });
    expect(promptHeading({ buttons: true, firstPattern: true }, false)).toMatchObject({ kind: "tap", en: "TAP AN ANSWER!" });
  });
  it("introduces Say + Tap once without treating it as microphone fallback", () => {
    expect(promptHeading({ buttons: true, firstPattern: true, answerMode: "say-tap" }, false)).toMatchObject({ kind: "say", en: "SAY / TAP" });
    expect(promptHeading({ buttons: true, firstPattern: false, answerMode: "say-tap" }, false)).toBeNull();
  });
  it("uses a short TAP introduction in the teacher's tap mode", () => {
    expect(promptHeading({ buttons: true, firstPattern: true, answerMode: "tap" }, false)).toMatchObject({ kind: "tap", en: "TAP" });
    expect(promptHeading({ buttons: true, firstPattern: false, answerMode: "tap" }, false)).toBeNull();
  });
});
