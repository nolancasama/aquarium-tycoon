import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BROWSER_STUBS } from "./stubs";

export interface AtState {
  screen: string;
  mode: string;
  view: string;
  tankId: string | null;
  hall: 0 | 1;
  panel: string | null;
  placing: { kind: string; slot?: string | null } | null;
  micState: string;
  coins: number;
  stage: number;
  tutorial: string;
  guide: string | null;
  nudge: { id: number; en: string; target?: string; kind?: string } | null;
  requestStep: { step: string; tier: number; tankIds: string[]; fishIds: string[]; decorIds: string[] } | null;
  progress: { stage: number; tutorial: string; hearts: number; helpedInStage: number; counted: boolean; cleanedOnce: boolean; fedOnce: boolean; allHappy: boolean; star: boolean; freePlay: boolean; photo: boolean; said: string[]; firstFish: string | null; hallOpen: boolean; namedInStage: number; superStar: boolean };
  goals: { id: string; done: boolean; n?: number; of?: number }[];
  tanks: { id: string; slot: string; type: string; fish: string[]; fishIds: string[]; decor: { slot: number; kind: string; variant: string | null }[]; food: number; clean: number; happy: number | null }[];
  inv: { fish: number; decor: { id: string; kind: string; variant: string | null }[]; tanks: number };
  prompt: { id: number; kind: string; status: string; buttons: boolean; misses: number; highlight: boolean; sentences: string[]; choices: string[]; question: string | null } | null;
  line: { by: string; en: string } | null;
  request: { kind: string; color: string | null; misses: number; status: string; by: string } | null;
  stageCard: { stage: number; reward: string } | null;
  waiting: { id: string; type: string } | null;
  visitors: { id: string; type: string; state: string; request: string | null; helped: boolean }[];
  pellets: number;
  countGlow: boolean;
  glowFish: number;
  perf: { calls: number; triangles: number; fps: number };
}

/** Open the game with speech stubs and the test hook. Returns collected page errors. */
export async function boot(page: Page, query = "fast=1&seed=1", showAudioSetup = false): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(BROWSER_STUBS);
  // Existing gameplay specs start after device setup; audio.spec opts into it.
  if (!showAudioSetup) await page.addInitScript(() => {
    const key = "at.settings.v1";
    const previous = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...previous, audioSetupDone: true }));
  });
  await page.goto(`/?e2e=1&${query}`);
  await expect(page.getByTestId("title")).toBeVisible();
  return errors;
}

export const state = (page: Page): Promise<AtState> => page.evaluate(() => (window as never as { __at: { state(): AtState } }).__at.state());

export async function hook<T = unknown>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(([n, a]) => (window as never as Record<string, Record<string, (...x: unknown[]) => unknown>>).__at[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;
}

export async function waitFor(page: Page, pred: (s: AtState) => boolean, timeout = 30_000, label = "condition"): Promise<AtState> {
  const t0 = Date.now();
  let s = await state(page);
  while (!pred(s)) {
    if (Date.now() - t0 > timeout) {
      throw new Error(`timed out waiting for ${label}: ${JSON.stringify({ mode: s.mode, view: s.view, panel: s.panel, line: s.line, prompt: s.prompt, request: s.request, tutorial: s.tutorial, stage: s.stage, stageCard: s.stageCard, goals: s.goals })}`);
    }
    await page.waitForTimeout(60);
    s = await state(page);
  }
  return s;
}

/** Setup failures are distinct from product assertions in controller acceptance. */
export async function precondition(page: Page, pred: (s: AtState) => boolean, label: string, timeout = 30_000) {
  try {
    return await waitFor(page, pred, timeout, label);
  } catch (error) {
    throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`, { cause: error });
  }
}

/** Choose the answer mode in Settings and start a new game. */
export async function startNew(page: Page, mode: "tap" | "speak" | "say-tap", openFirstOrder = true) {
  await expect(page.getByTestId("title").getByRole("radiogroup", { name: "Answer mode" })).toHaveCount(0);
  await page.getByTestId("btn-title-settings").click();
  await page.getByTestId(`settings-${mode}`).click();
  await page.getByTestId("settings-close").click();
  await page.getByTestId("btn-new").click();
  await waitFor(page, (s) => s.screen === "game", 10_000, "game screen");
  if (openFirstOrder) await tapFirstFish(page);
}

/** The tutorial's first interactive step uses the real highlighted Fish button. */
export async function tapFirstFish(page: Page) {
  await precondition(page, (s) => s.tutorial === "buy" && s.mode === "play" && !s.prompt && !s.line, "Tap Fish step", 20_000);
  await expect(page.getByTestId("btn-fish-shop")).toHaveClass(/guide/);
  await page.getByTestId("btn-fish-shop").click();
  await waitFor(page, (s) => Boolean(s.prompt), 10_000, "Fish order opened by tap");
  expect((await state(page)).guide).not.toBe("btn-fish-shop");
}

/** Answer the open prompt: tap the choice (Tap mode / rescue) or speak it into the stub recogniser. */
export async function answer(page: Page, phraseId: string, spoken?: string) {
  const s = await waitFor(page, (x) => Boolean(x.prompt && x.prompt.status !== "correct" && x.prompt.status !== "listening" && x.prompt.status !== "wrong"), 30_000, `prompt for ${phraseId}`);
  if (s.prompt!.buttons) {
    await page.locator(`[data-testid=choice][data-id=${phraseId}]`).click();
  } else {
    await say(page, spoken ?? phraseId);
  }
  await waitFor(page, (x) => !x.prompt || x.prompt.id !== s.prompt!.id, 15_000, `prompt ${phraseId} answered`);
}

/** One Space press = one listening session with the stub saying `text` (null = silence). */
export async function say(page: Page, text: string | null, error: string | null = null) {
  await waitFor(page, (x) => Boolean(x.prompt && x.prompt.status !== "listening" && x.prompt.status !== "correct"), 30_000, "prompt to speak to");
  await page.evaluate(
    ([t, e]) => {
      const w = window as never as { __speech: { say: string | null; error: string | null } };
      w.__speech.say = t;
      w.__speech.error = e;
    },
    [text, error] as const
  );
  await page.keyboard.press("Space");
  await waitFor(page, (x) => !x.prompt || x.prompt.status !== "listening", 12_000, "listening to end");
}

/** Click a thing in the 3D view at its projected screen position. */
export async function click3d(page: Page, kind: string, id = "") {
  const p = await hook<{ x: number; y: number } | null>(page, "where", kind, id);
  if (!p) throw new Error(`nothing on screen for ${kind} ${id}`);
  await page.mouse.click(p.x, p.y);
}

/** Wait until the camera has settled in the close-up (or the room), then click. */
export async function settle(page: Page, ms = 900) {
  await page.waitForTimeout(ms);
}

/** Close a stage card when it shows. */
export async function stageOk(page: Page, stage: number) {
  await waitFor(page, (s) => s.stageCard?.stage === stage, 30_000, `stage ${stage} card`);
  await expect(page.getByTestId("stage-ok")).toContainText("Continue");
  await expect(page.getByTestId("stage-card").getByRole("button")).toHaveCount(1);
  await shot(page, `stage-${stage}-card`);
  await page.getByTestId("stage-ok").click();
}

/** Back to ordinary play (no line, prompt or scripted moment). */
export async function playing(page: Page, timeout = 30_000) {
  return waitFor(page, (s) => s.mode === "play" && !s.line && !s.prompt && !s.stageCard, timeout, "ordinary play");
}

let shotN = 0;
/** Screenshots for review when SHOTS=1 (saved to .tmp/shots/<test>). */
export async function shot(page: Page, name: string) {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(700);
  const dir = path.join(process.cwd(), ".tmp", "shots", process.env.SHOTS_DIR ?? "run");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${String(++shotN).padStart(2, "0")}-${name}.png`) });
}
