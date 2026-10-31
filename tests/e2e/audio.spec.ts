import { expect, test, type Page } from "@playwright/test";
import { boot, startNew, state, tapFirstFish, waitFor } from "./helpers";

interface AudioStub {
  mode: "unavailable" | "denied" | "silent" | "normal" | "clipping";
  permission: "granted" | "denied" | "prompt";
  contextAvailable: boolean;
  requests: number;
  stops: number;
  activeTracks: number;
  frames: number;
}

const audio = (page: Page): Promise<AudioStub> => page.evaluate(() => (window as unknown as { __audio: AudioStub }).__audio);

async function plan(page: Page, say: string | null, error: string | null = null, delayMs = 1000) {
  await page.evaluate((next) => {
    Object.assign((window as unknown as { __speech: object }).__speech, next);
  }, { say, error, delayMs });
}

async function openCheck(page: Page, kind: "sound" | "mic") {
  await page.getByTestId("btn-title-settings").click();
  await page.getByTestId(`settings-${kind}-check`).click();
  await expect(page.getByTestId("audio-check")).toBeVisible();
}

test("first New Game offers two skippable checks once per device", async ({ page }) => {
  const errors = await boot(page, "fast=1&seed=1", true);
  await page.getByTestId("btn-new").click();
  await expect(page.getByTestId("audio-check")).toContainText("Can you hear Pico?");
  await page.getByTestId("audio-skip").click();
  await expect(page.getByTestId("audio-check")).toContainText("Let's test your microphone!");
  await page.getByTestId("audio-skip").click();
  await expect(page.getByTestId("audio-check")).toHaveCount(0);
  await waitFor(page, (s) => s.screen === "game" && s.tutorial === "buy", 20_000, "tutorial after skipping audio");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("at.settings.v1")!).audioSetupDone)).toBe(true);
  await page.reload();
  await expect(page.getByTestId("title")).toBeVisible();
  await page.getByTestId("btn-new").click();
  if (await page.getByTestId("btn-confirm-new").isVisible()) await page.getByTestId("btn-confirm-new").click();
  await waitFor(page, (s) => s.screen === "game", 10_000, "subsequent New Game");
  await expect(page.getByTestId("audio-check")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("speaker check replays the model and explains the Chromebook volume control", async ({ page }) => {
  await boot(page);
  await openCheck(page, "sound");
  const welcomes = () => page.evaluate(() => (window as unknown as { __ttsSpoken: string[] }).__ttsSpoken.filter((s) => s === "Hello! Welcome!").length);
  await page.getByTestId("audio-speaker-play").click();
  await expect.poll(welcomes).toBe(1);
  await expect(page.getByTestId("audio-speaker-play")).toContainText("Replay");
  await page.getByTestId("audio-speaker-play").click();
  await expect.poll(welcomes).toBe(2);
  await page.getByTestId("audio-speaker-cant").click();
  await expect(page.getByTestId("audio-check")).toContainText("Chromebookの おとの おおきさを たしかめてね。");
  await page.getByTestId("audio-next").click();
  await expect(page.getByTestId("audio-check")).toHaveCount(0);
});

test("microphone check distinguishes received sound from recognised English", async ({ page }) => {
  await boot(page);
  await openCheck(page, "mic");
  await plan(page, "a noisy classroom");
  await page.getByTestId("audio-mic").click();
  await expect(page.getByTestId("audio-check")).toContainText("I can hear sound, but I couldn't understand. Let's try again!");
  await expect(page.getByTestId("audio-permission")).toBeVisible();
  await expect(page.getByTestId("audio-signal")).toContainText(/sound|received|detected/i);
  await expect(page.getByTestId("audio-recognised")).not.toContainText("Great! I heard you!");
  await expect.poll(async () => (await audio(page)).activeTracks).toBe(0);
  expect((await audio(page)).stops).toBeGreaterThan(0);
  await plan(page, "I like fish");
  await page.getByTestId("audio-retry").click();
  await expect(page.getByTestId("audio-check")).toContainText("Great! I heard you!");
  await expect.poll(async () => (await audio(page)).activeTracks).toBe(0);
  await page.getByTestId("audio-skip").click();
});

test("leaving a microphone check stops its live tracks", async ({ page }) => {
  await boot(page);
  await openCheck(page, "mic");
  await plan(page, null, null, 5000);
  await page.getByTestId("audio-mic").click();
  await expect.poll(async () => (await audio(page)).frames).toBeGreaterThan(0);
  expect((await audio(page)).activeTracks).toBe(1);
  await page.getByTestId("audio-skip").click();
  await expect(page.getByTestId("audio-check")).toHaveCount(0);
  await expect.poll(async () => (await audio(page)).activeTracks).toBe(0);
  const released = await audio(page);
  // Permission uses a temporary stream; the analyser owns the second stream.
  expect(released.requests).toBe(2);
  expect(released.stops).toBe(released.requests);
});

test("denied microphone permission falls back to tapping without blocking the tutorial", async ({ page }) => {
  const errors = await boot(page, "fast=1&seed=1", true);
  await page.getByTestId("btn-new").click();
  await page.getByTestId("audio-skip").click();
  await page.evaluate(() => {
    Object.assign((window as unknown as { __audio: AudioStub }).__audio, { mode: "denied", permission: "denied" });
  });
  await plan(page, null, "not-allowed");
  await page.getByTestId("audio-mic").click();
  await expect.poll(async () => (await state(page)).micState).toBe("blocked");
  await page.getByTestId("audio-skip").click();
  await tapFirstFish(page);
  expect((await state(page)).prompt!.buttons).toBe(true);
  await expect(page.getByTestId("mic")).toHaveCount(0);
  const starts = await page.evaluate(() => (window as unknown as { __speech: { starts: number } }).__speech.starts);
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => (window as unknown as { __speech: { starts: number } }).__speech.starts)).toBe(starts);
  await page.locator('[data-testid="choice"][data-id="orangePlease"]').click();
  await waitFor(page, (s) => s.placing?.kind === "fish", 10_000, "fish bought without microphone");
  expect(errors).toEqual([]);
});

test("Say + Tap advances by tapping without opening a mic or claiming recognition", async ({ page }) => {
  const errors = await boot(page);
  await startNew(page, "say-tap");
  await expect(page.getByTestId("prompt-heading")).toContainText("SAY IT, THEN TAP!");
  await expect(page.getByTestId("prompt")).toContainText("Say it out loud, then tap your answer.");
  await expect(page.getByTestId("mic")).toHaveCount(0);
  const before = await audio(page);
  const starts = await page.evaluate(() => (window as unknown as { __speech: { starts: number } }).__speech.starts);
  await page.keyboard.press("Space");
  await expect(page.getByTestId("prompt")).not.toContainText(/I heard you/i);
  await page.locator('[data-testid="choice"][data-id="orangePlease"]').click();
  // The prompt may already have closed; either way it never claims to have heard.
  await expect(page.getByTestId("prompt").filter({ hasText: /I heard you/i })).toHaveCount(0);
  await waitFor(page, (s) => s.placing?.kind === "fish", 10_000, "Say + Tap purchase");
  expect((await audio(page)).requests).toBe(before.requests);
  expect(await page.evaluate(() => (window as unknown as { __speech: { starts: number } }).__speech.starts)).toBe(starts);
  expect(errors).toEqual([]);
});

test("Settings reopens both checks after device setup", async ({ page }) => {
  await boot(page);
  await openCheck(page, "sound");
  await page.getByTestId("audio-skip").click();
  // A Settings check returns to Settings, preserving the selected answer mode.
  if (!await page.getByTestId("settings").isVisible()) await page.getByTestId("btn-title-settings").click();
  await page.getByTestId("settings-mic-check").click();
  await expect(page.getByTestId("audio-check")).toContainText("Let's test your microphone!");
  await page.getByTestId("audio-skip").click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("at.settings.v1")!).audioSetupDone)).toBe(true);
});

test("unsupported speech recognition offers tapping and never opens a microphone", async ({ page }) => {
  const errors = await boot(page, "fast=1&seed=1", true);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await page.getByTestId("btn-new").click();
  await page.getByTestId("audio-skip").click();
  await expect(page.getByText("Speech recognition is unavailable. You can tap answers.")).toBeVisible();
  await expect(page.getByTestId("audio-mic")).toHaveCount(0);
  await expect(page.getByTestId("audio-check")).toHaveCount(0);
  await tapFirstFish(page);
  expect((await state(page)).prompt!.buttons).toBe(true);
  expect((await audio(page)).requests).toBe(0);
  expect(errors).toEqual([]);
});

test("unsupported voice playback shows the model text and an optional Next", async ({ page }) => {
  // tts captures browser capability at module load, so remove it before boot.
  await page.addInitScript(() => Object.defineProperty(window, "speechSynthesis", { configurable: true, value: null }));
  const errors = await boot(page, "fast=1&seed=1", true);
  await page.getByTestId("btn-new").click();
  await expect(page.getByTestId("audio-check")).toContainText("Voice playback is unavailable in this browser.");
  await expect(page.getByTestId("audio-check")).toContainText("Hello! Welcome!");
  await expect(page.getByTestId("audio-speaker-play")).toHaveCount(0);
  await page.getByTestId("audio-next").click();
  await expect(page.getByTestId("audio-check")).toContainText("Let's test your microphone!");
  await page.getByTestId("audio-skip").click();
  await waitFor(page, (s) => s.screen === "game" && s.tutorial === "buy", 20_000, "tutorial without voice playback");
  expect(errors).toEqual([]);
});

for (const capability of ["unavailable", "no-web-audio"] as const) {
  test(`mic check remains usable with ${capability}`, async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate((which) => {
      const stub = (window as unknown as { __audio: AudioStub }).__audio;
      if (which === "unavailable") stub.mode = "unavailable";
      else stub.contextAvailable = false;
    }, capability);
    await openCheck(page, "mic");
    await plan(page, "I like fish");
    await page.getByTestId("audio-mic").click();
    await expect(page.getByTestId("audio-check")).toContainText("Great! I heard you!");
    await page.getByTestId("audio-skip").click();
    expect((await audio(page)).activeTracks).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("sound check answers unlock only after Play Sound; hearing it celebrates and cues Next", async ({ page }) => {
  await boot(page);
  await openCheck(page, "sound");
  await expect(page.getByTestId("audio-speaker-hear")).toBeDisabled();
  await expect(page.getByTestId("audio-speaker-cant")).toBeDisabled();
  await page.getByTestId("audio-speaker-cant").click({ force: true });
  await expect(page.getByTestId("audio-check")).not.toContainText("Chromebookの おとの");
  await page.getByTestId("audio-speaker-play").click();
  await expect(page.getByTestId("audio-speaker-hear")).toBeEnabled();
  // Can't hear: help, no celebration, Play Sound still works.
  await page.getByTestId("audio-speaker-cant").click();
  await expect(page.getByTestId("audio-check")).toContainText("Chromebookの おとの おおきさを たしかめてね。");
  await expect(page.getByTestId("audio-success")).toHaveCount(0);
  await expect(page.getByTestId("audio-speaker-play")).toBeEnabled();
  await page.getByTestId("audio-speaker-play").click();
  await page.getByTestId("audio-speaker-hear").click();
  await expect(page.getByTestId("audio-success")).toBeVisible();
  const next = page.getByTestId("audio-next");
  await expect(next).toHaveClass(/primary/);
  await expect(next).toHaveAttribute("data-next-cue", "true");
  await next.click();
  await expect(page.getByTestId("audio-check")).toHaveCount(0);
});

test("mic check celebrates only a recognised sentence, then cues Next", async ({ page }) => {
  await boot(page);
  await openCheck(page, "mic");
  await plan(page, "a noisy classroom");
  await page.getByTestId("audio-mic").click();
  await expect(page.getByTestId("audio-retry")).toBeVisible();
  await expect(page.getByTestId("audio-success")).toHaveCount(0);
  await expect(page.getByTestId("audio-skip")).toHaveAttribute("data-next-cue", "false");
  await plan(page, "I like fish");
  await page.getByTestId("audio-retry").click();
  await expect(page.getByTestId("audio-success")).toContainText("マイク OK！");
  await expect(page.getByTestId("audio-skip")).toHaveAttribute("data-next-cue", "true");
  await page.getByTestId("audio-skip").click();
  await expect(page.getByTestId("audio-check")).toHaveCount(0);
});
