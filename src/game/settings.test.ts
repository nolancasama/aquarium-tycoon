import { describe, expect, it } from "vitest";
import { answerMode, DEFAULT_SETTINGS, parseSettings } from "./store";

describe("device audio settings", () => {
  it("migrates old settings without changing their answer mode or volumes", () => {
    for (const mic of [true, false]) {
      const settings = parseSettings(JSON.stringify({ mic, music: 0.4, sfx: 0, japanese: false, slowVoice: true }));
      expect(settings).toEqual({ mic, music: 0.4, sfx: 0, japanese: false, slowVoice: true, sayAloud: false, audioSetupDone: false, speakTipSeen: false });
      expect(answerMode(settings)).toBe(mic ? "speak" : "tap");
    }
  });
  it("resolves all three modes and only uses sayAloud with the mic off", () => {
    expect(answerMode({ ...DEFAULT_SETTINGS, mic: true, sayAloud: true })).toBe("speak");
    expect(answerMode({ ...DEFAULT_SETTINGS, mic: false, sayAloud: true })).toBe("say-tap");
    expect(answerMode({ ...DEFAULT_SETTINGS, mic: false })).toBe("tap");
  });
  it("defaults malformed or missing settings safely", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{")).toEqual(DEFAULT_SETTINGS);
  });
});
