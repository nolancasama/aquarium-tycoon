import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recognition } from "../../audio/recognition";
import { DEFAULT_SETTINGS, getGame, setGame, updateSettings } from "../store";
import { ask, blockMic, cancelAsk, micPress, micUsable } from "./ask";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), setListening: vi.fn() } }));
vi.mock("../../audio/tts", () => ({ tts: { cancel: vi.fn(), speak: vi.fn(async () => {}) } }));
vi.mock("../../audio/recognition", () => ({
  HARD_ERRORS: new Set(["not-allowed"]),
  recognition: { supported: true, listen: vi.fn((handlers: { onEnd(): void }) => () => handlers.onEnd()) }
}));

describe("audio modes and shared permission fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setGame({ prompt: null, mode: "play", micState: "ready", settings: { ...DEFAULT_SETTINGS } });
  });
  afterEach(() => { cancelAsk(); });

  it("keeps Say + Tap on existing buttons and never starts recognition", async () => {
    updateSettings({ mic: false, sayAloud: true });
    const answer = ask({ kind: "command", options: ["feedFish"], cancellable: true });
    expect(getGame().prompt).toMatchObject({ answerMode: "say-tap", buttons: true });
    expect(micUsable()).toBe(false);
    micPress();
    expect(recognition.listen).not.toHaveBeenCalled();
    cancelAsk();
    await expect(answer).resolves.toBeNull();
  });

  it("applies a teacher's mode change on the next prompt", async () => {
    const first = ask({ kind: "command", options: ["feedFish"], cancellable: true });
    updateSettings({ mic: false, sayAloud: true });
    expect(getGame().prompt).toMatchObject({ answerMode: "speak", buttons: false });
    expect(micUsable()).toBe(true);
    micPress();
    expect(recognition.listen).toHaveBeenCalledTimes(1);
    cancelAsk();
    await first;
    const second = ask({ kind: "command", options: ["feedFish"], cancellable: true });
    expect(getGame().prompt).toMatchObject({ answerMode: "say-tap", buttons: true });
    cancelAsk();
    await second;
  });

  it("exposes tap answers without counting a miss when a check denies permission over an open prompt", async () => {
    const answer = ask({ kind: "command", options: ["feedFish"], cancellable: true });
    blockMic();
    expect(getGame().micState).toBe("blocked");
    expect(getGame().prompt).toMatchObject({ buttons: true, misses: 0 });
    micPress();
    expect(recognition.listen).not.toHaveBeenCalled();
    cancelAsk();
    await answer;
  });
});
