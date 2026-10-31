import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyMicAttempt, createMicLevel, type MicLevelSummary } from "./micLevel";

const normal: MicLevelSummary = { peakRms: 0.3, activeMs: 1800, sustainedClipMs: 0, durationMs: 4000 };

describe("microphone attempt feedback", () => {
  it("suggests moving closer after a complete near-silent attempt", () => {
    expect(classifyMicAttempt({ ...normal, peakRms: 0.002, activeMs: 0 })).toBe("quiet");
    expect(classifyMicAttempt({ ...normal, activeMs: 90 })).toBe("quiet");
  });

  it("never treats loud normal speech or high AGC RMS alone as overload", () => {
    expect(classifyMicAttempt({ ...normal, peakRms: 0.95, activeMs: 3800 })).toBe("neutral");
  });

  it("requires sustained clipped samples before suggesting a softer voice", () => {
    expect(classifyMicAttempt({ ...normal, sustainedClipMs: 400 })).toBe("overload");
    expect(classifyMicAttempt({ ...normal, sustainedClipMs: 399 })).toBe("neutral");
  });

  it("keeps noisy but unrecognised attempts neutral", () => {
    expect(classifyMicAttempt({ ...normal, peakRms: 0.12, activeMs: 3900 })).toBe("neutral");
  });

  it("keeps short, unavailable and ambiguous attempts neutral", () => {
    expect(classifyMicAttempt(null)).toBe("neutral");
    expect(classifyMicAttempt({ ...normal, activeMs: 0, durationMs: 2999 })).toBe("neutral");
    expect(classifyMicAttempt({ ...normal, sustainedClipMs: 800, durationMs: 2000 })).toBe("neutral");
    expect(classifyMicAttempt({ ...normal, activeMs: 101 })).toBe("neutral");
  });
});

function stubAudio() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const analyser = {
    fftSize: 0,
    getFloatTimeDomainData: vi.fn((frame: Float32Array) => { frame.fill(0.1); }),
    disconnect: vi.fn()
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state: "running",
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    close: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve())
  };
  const AudioCtor = vi.fn(function () { return context; });
  const getUserMedia = vi.fn(() => Promise.resolve(stream));
  vi.stubGlobal("window", { AudioContext: AudioCtor });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { stop, stream, analyser, source, context, AudioCtor, getUserMedia };
}

describe("local microphone meter lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shares one start and releases tracks, nodes and context on stop", async () => {
    const audio = stubAudio();
    const meter = createMicLevel();
    const first = meter.start();
    expect(meter.start()).toBe(first);
    await expect(first).resolves.toBe("available");
    expect(meter.available).toBe(true);
    expect(audio.getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
    expect(audio.AudioCtor).toHaveBeenCalledTimes(1);
    expect(audio.analyser.fftSize).toBe(1024);
    vi.advanceTimersByTime(500);
    const summary = meter.stop();
    expect(summary?.peakRms).toBeCloseTo(0.1);
    expect(summary?.activeMs).toBeGreaterThan(0);
    expect(summary?.sustainedClipMs).toBe(0);
    expect(meter.available).toBe(false);
    expect(meter.latest.rms).toBe(0);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.source.disconnect).toHaveBeenCalledTimes(1);
    expect(audio.analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(audio.context.close).toHaveBeenCalledTimes(1);
    const sampled = audio.analyser.getFloatTimeDomainData.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(audio.analyser.getFloatTimeDomainData).toHaveBeenCalledTimes(sampled);
    expect(meter.stop()).toBeNull();
  });

  it("stops a late stream when the prompt closed while permission was pending", async () => {
    const audio = stubAudio();
    let resolveStream!: (stream: MediaStream) => void;
    audio.getUserMedia.mockReturnValueOnce(new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
    const meter = createMicLevel();
    const pending = meter.start();
    expect(meter.stop()).toBeNull();
    resolveStream(audio.stream);
    await expect(pending).resolves.toBe("unavailable");
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.AudioCtor).not.toHaveBeenCalled();
    expect(meter.available).toBe(false);
  });

  it("silently handles missing microphone and Web Audio APIs", async () => {
    vi.stubGlobal("navigator", undefined);
    await expect(createMicLevel().start()).resolves.toBe("unavailable");
    vi.stubGlobal("navigator", {});
    await expect(createMicLevel().start()).resolves.toBe("unavailable");
    const audio = stubAudio();
    vi.stubGlobal("window", {});
    await expect(createMicLevel().start()).resolves.toBe("unavailable");
    expect(audio.getUserMedia).not.toHaveBeenCalled();
  });

  it.each(["NotAllowedError", "NotReadableError"])("silently handles %s", async (name) => {
    const audio = stubAudio();
    audio.getUserMedia.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { name }));
    const meter = createMicLevel();
    await expect(meter.start()).resolves.toBe("unavailable");
    expect(meter.available).toBe(false);
    expect(meter.stop()).toBeNull();
  });

  it("publishes unavailable after an analyser fails so the DOM meter can hide", async () => {
    const audio = stubAudio();
    const meter = createMicLevel();
    const availability: boolean[] = [];
    meter.subscribe(() => { availability.push(meter.available); });
    await meter.start();
    audio.analyser.getFloatTimeDomainData.mockImplementation(() => { throw new Error("device removed"); });
    vi.advanceTimersByTime(100);
    expect(availability).toEqual([true, false]);
    expect(meter.available).toBe(false);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.context.close).toHaveBeenCalledTimes(1);
  });
});

describe("gameplay microphone meter permission gate", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("only allows granted permission, even after the mic has worked", async () => {
    const { canMeterDuringRecognition, markMicWorked } = await import("./micLevel");
    markMicWorked();
    const query = vi.fn().mockResolvedValue({ state: "granted" });
    vi.stubGlobal("navigator", { permissions: { query } });
    await expect(canMeterDuringRecognition()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith({ name: "microphone" });
    query.mockResolvedValue({ state: "prompt" });
    await expect(canMeterDuringRecognition()).resolves.toBe(false);
    query.mockResolvedValue({ state: "denied" });
    await expect(canMeterDuringRecognition()).resolves.toBe(false);
    query.mockRejectedValue(new Error("unsupported permission"));
    await expect(canMeterDuringRecognition()).resolves.toBe(false);
  });

  it("requires a previously working mic when the permissions API is missing", async () => {
    vi.resetModules();
    const { canMeterDuringRecognition, markMicWorked } = await import("./micLevel");
    vi.stubGlobal("navigator", {});
    await expect(canMeterDuringRecognition()).resolves.toBe(false);
    markMicWorked();
    await expect(canMeterDuringRecognition()).resolves.toBe(true);
    vi.stubGlobal("navigator", undefined);
    await expect(canMeterDuringRecognition()).resolves.toBe(false);
  });
});
