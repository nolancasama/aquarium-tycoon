import { PHRASES, type PhraseId } from "../logic/english";
import { judgeSpeech, type Judgement } from "../logic/speechMatch";
import { makeRng, shuffle } from "../logic/rng";
import { noteSaid } from "../logic/model";
import { answerMode, getGame, setGame, updateModel, useGame, type Choice, type Line, type Mode, type PromptUi, type Speaker } from "../store";
import { SPECIES } from "../data/fish";
import { recognition, HARD_ERRORS } from "../../audio/recognition";
import { tts } from "../../audio/tts";
import { audio } from "../../audio/audio";
import { rt } from "../runtime";
import { canMeterDuringRecognition, classifyMicAttempt, createMicLevel, markMicWorked } from "../../audio/micLevel";
import { phrasePattern, type SentencePatternId } from "../logic/sentenceTeaching";
import { meetPattern } from "./meaning";

export const promptMeter = createMicLevel();
// Also clean up when navigation removes a prompt outside finish().
useGame.subscribe((s, prev) => {
  if (answerMode(s.settings) !== answerMode(prev.settings)) promptMeter.stop();
  if (s.prompt?.id !== prev.prompt?.id || (s.prompt?.status !== "listening" && prev.prompt?.status === "listening")) promptMeter.stop();
  if (s.prompt?.id !== prev.prompt?.id && active && !active.done && prev.prompt?.id !== undefined) {
    active.done = true;
    active.stopListening?.();
    active.resolve(null);
    active = null;
    audio.setListening(false);
  }
});

/**
 * The English interaction layer. Everything the student says or chooses goes
 * through `ask()`, which resolves with the sentence they produced:
 *
 *  - command: one target sentence ("Feed the fish!", "Three fish!"). Speech
 *    must match it; Tap mode shows it among real alternatives.
 *  - choice: several sentences, all valid ("Blue, please!" / "Orange,
 *    please!"); whichever is said or tapped is the answer.
 *
 * One press of Space / 🎤 = one bounded listening session. A valid interim
 * result is accepted at once; a session that ends without a match is a miss.
 * Miss 1: "Try again!" and the English is replayed slowly. Miss 2: the key
 * word is highlighted (with a picture clue). Miss 3: the choices become
 * tappable. Permission/hardware errors switch to tapping for the session.
 */

export interface AskRequest {
  /** Request data can identify a question frame independently of its answer. */
  pattern?: SentencePatternId;
  kind: "command" | "choice";
  /** Accepted sentences (a command accepts only the first). */
  options: PhraseId[];
  /** Sentences displayed in Speak mode (default: the command target, or every choice). */
  show?: PhraseId[];
  /** Show "before ___ after" with word slots instead of whole sentences (Speak mode). */
  frame?: { before: string; after: string; slots: PhraseId[] };
  /** Speech is judged against these (default: the options). Two of them at once is unclear. */
  judge?: PhraseId[];
  /** Tap-mode buttons (default: the choices, or the command and its distractors). */
  choices?: PhraseId[];
  question?: { en: string; ja?: string; by: Speaker };
  /** Japanese help for the task. */
  help?: string;
  /** Shuffle the tappable choices (so the right one is not always first). */
  shuffle?: boolean;
  cancellable?: boolean;
  readQuestion?: boolean;
  /** Read the target sentence aloud when the prompt opens (Speak mode, commands). */
  readSentence?: boolean;
  /** Second miss: an extra visual clue in the world (the counting glow). */
  onClue?: () => void;
}

interface Active {
  req: AskRequest;
  resolve: (id: PhraseId | null) => void;
  done: boolean;
  stopListening: (() => void) | null;
  back: Mode;
}

let active: Active | null = null;
let promptId = 1;
let rng = makeRng(Date.now() % 100000);

export function seedChoices(seed: number) {
  rng = makeRng(seed);
}

/** Mic can be used right now (setting on, recogniser present, not blocked). */
export function micUsable(): boolean {
  const g = getGame();
  return (g.prompt?.answerMode ?? answerMode(g.settings)) === "speak" && recognition.supported && g.micState !== "blocked" && g.micState !== "unsupported";
}

/** Shared permission fallback, including checks opened over an existing prompt. */
export function blockMic() {
  setGame({ micState: "blocked" });
  update({ status: "miss", buttons: true });
}

const VOICES: Record<string, { pitch: number; rate: number }> = {
  pico: { pitch: 1.3, rate: 0.9 },
  self: { pitch: 1.3, rate: 0.92 },
  game: { pitch: 1.1, rate: 0.9 },
  child: { pitch: 1.55, rate: 0.95 },
  adult: { pitch: 0.95, rate: 0.9 },
  fan: { pitch: 1.2, rate: 0.98 },
  judge: { pitch: 0.85, rate: 0.86 }
};

function voiceOf(by: Speaker): { pitch: number; rate: number } {
  return VOICES[by] ?? SPECIES[by as keyof typeof SPECIES]?.voice ?? VOICES.game;
}

export function speak(text: string, by: Speaker = "game", slow = false): Promise<void> {
  const v = voiceOf(by);
  rt.pico.talking = by === "pico";
  return tts.speak(text, { pitch: v.pitch, rate: v.rate * (slow ? 0.7 : 1) }).finally(() => {
    if (by === "pico") rt.pico.talking = false;
  });
}

function update(patch: Partial<PromptUi>) {
  const p = getGame().prompt;
  if (!p) return;
  setGame({ prompt: { ...p, ...patch } });
}

const choice = (id: PhraseId): Choice => ({ id, en: PHRASES[id].en });

function choicesFor(req: AskRequest): Choice[] {
  if (req.choices) return (req.shuffle === false ? req.choices : shuffle(req.choices, rng)).map(choice);
  if (req.kind === "choice") {
    const list = req.options.map(choice);
    return req.shuffle ? shuffle(list, rng) : list;
  }
  const target = req.options[0];
  const ids = [target, ...(PHRASES[target].distractors ?? [])].slice(0, 3);
  return shuffle(ids, rng).map(choice);
}

export function ask(req: AskRequest): Promise<PhraseId | null> {
  if (active && !active.done) finish(null);
  const g = getGame();
  const mic = micUsable();
  const show = req.show ?? (req.kind === "command" ? [req.options[0]] : req.options);
  const prompt: PromptUi = {
    ...meetPattern(req.pattern ?? phrasePattern(req.options[0])),
    answerMode: answerMode(g.settings),
    id: promptId++,
    kind: req.kind,
    question: req.question ?? null,
    help: req.help ?? null,
    sentences: show.map(choice),
    frame: req.frame ? { before: req.frame.before, after: req.frame.after, slots: req.frame.slots.map(choice) } : null,
    choices: choicesFor(req),
    status: "ready",
    heard: "",
    misses: 0,
    buttons: !mic,
    wrongId: null,
    matched: null,
    cancellable: Boolean(req.cancellable),
    reading: false,
    highlight: false
  };
  const back: Mode = g.mode === "busy" ? "busy" : "play";
  setGame({ prompt, mode: "ask", line: null });
  return new Promise((resolve) => {
    active = { req, resolve, done: false, stopListening: null, back };
    void readOpening(req, prompt.id);
  });
}

async function readOpening(req: AskRequest, id: number) {
  if (req.readQuestion && req.question) await speak(req.question.en, req.question.by);
  if (getGame().prompt?.id !== id) return;
  // Tap mode: the student must read; reading the right answer aloud would give it away.
  if (req.readSentence && req.kind === "command" && (micUsable() || getGame().prompt?.answerMode === "say-tap")) await readSentences(id);
}

async function readSentences(id: number, slow = false) {
  const p = getGame().prompt;
  if (!p || p.id !== id) return;
  update({ reading: true });
  const list = p.frame ? [] : p.sentences;
  for (const s of list) {
    if (getGame().prompt?.id !== id) return;
    await speak(s.en, "self", slow);
  }
  if (getGame().prompt?.id === id) update({ reading: false });
}

/** Miss 1: the English again, slowly: the question for a choice, the sentence for a command. */
async function replaySlow(id: number) {
  const a = active;
  const p = getGame().prompt;
  if (!a || !p || p.id !== id) return;
  tts.cancel();
  if (a.req.kind === "command" && !p.frame) {
    await readSentences(id, true);
  } else if (p.question) {
    await speak(p.question.en, p.question.by, true);
  }
}

/** Replay (🔊): the question and the sentence to say; in Tap mode every choice in order (listening, not a give-away). */
export async function replay() {
  const p = getGame().prompt;
  if (!p || p.status === "listening") return;
  tts.cancel();
  if (p.question) await speak(p.question.en, p.question.by);
  if (getGame().prompt?.id !== p.id) return;
  if (p.buttons) {
    for (const c of p.choices) {
      if (getGame().prompt?.id !== p.id) return;
      await speak(c.en, "self");
    }
    return;
  }
  if (active?.req.kind === "command") void readSentences(p.id);
}

function finish(id: PhraseId | null) {
  const a = active;
  if (!a || a.done) return;
  a.done = true;
  a.stopListening?.();
  a.stopListening = null;
  active = null;
  setGame({ prompt: null, mode: a.back });
  a.resolve(id);
}

function succeed(id: PhraseId) {
  const a = active;
  if (!a || a.done) return;
  // One success = one action: everything after this is ignored.
  a.done = true;
  a.stopListening?.();
  a.stopListening = null;
  audio.setListening(false);
  tts.cancel();
  audio.play("correct");
  update({ status: "correct", matched: id, wrongId: null });
  updateModel((m) => noteSaid(m, id));
  window.setTimeout(() => {
    active = null;
    if (getGame().prompt?.status === "correct") setGame({ prompt: null, mode: a.back });
    a.resolve(id);
  }, fastMode() ? 60 : 650);
}

function accepted(id: PhraseId): boolean {
  const a = active;
  if (!a) return false;
  return a.req.kind === "choice" ? a.req.options.includes(id) : a.req.options[0] === id;
}

/** Space / 🎤: start one listening session (or end the current one early). */
export function micPress() {
  const a = active;
  const p = getGame().prompt;
  if (!a || a.done || !p || p.status === "correct") return;
  if (p.status === "listening") {
    a.stopListening?.();
    return;
  }
  if (!micUsable()) {
    update({ buttons: true });
    return;
  }
  tts.cancel();
  const judgeIds = a.req.judge ?? (a.req.kind === "choice" ? a.req.options : [a.req.options[0]]);
  const speechOptions = judgeIds.map((id) => PHRASES[id]);
  let last: Judgement = { kind: "none", heard: "" };
  let hard = false;
  let ended = false;
  const settingMode = answerMode(getGame().settings);
  audio.setListening(true);
  audio.play("micOn");
  update({ status: "listening", heard: "", reading: false, wrongId: null, micFeedback: undefined, meterAvailable: undefined });
  a.stopListening = recognition.listen(
    {
      onResult(alts) {
        if (a.done) return;
        markMicWorked();
        const j = judgeSpeech(alts, speechOptions);
        if (alts[0]) update({ heard: alts[0] });
        if (j.kind === "match" && accepted(j.id)) {
          succeed(j.id);
          return;
        }
        last = j;
      },
      onError(err) {
        if (HARD_ERRORS.has(err)) hard = true;
      },
      onEnd() {
        ended = true;
        const summary = promptMeter.stop();
        audio.setListening(false);
        if (a.done) return;
        a.stopListening = null;
        audio.play("micOff");
        miss(last, hard, classifyMicAttempt(summary));
      }
    },
    7000
  );
  // Recognition always starts first. This passive meter never requests permission.
  void canMeterDuringRecognition().then(async (allowed) => {
    if (!allowed || ended || a.done || getGame().prompt?.id !== p.id || answerMode(getGame().settings) !== settingMode) return;
    const available = await promptMeter.start();
    if (ended || a.done || getGame().prompt?.id !== p.id) return;
    update({ meterAvailable: available === "available" });
  });
}

function miss(j: Judgement, hard: boolean, micFeedback: PromptUi["micFeedback"] = "neutral") {
  const a = active;
  const p = getGame().prompt;
  if (!p || !a) return;
  if (hard) {
    blockMic();
    return;
  }
  const misses = p.misses + 1;
  audio.play("error");
  update({ status: j.kind === "unclear" ? "unclear" : "miss", micFeedback, misses, buttons: p.buttons || misses >= 3, highlight: p.highlight || misses >= 2 });
  if (misses === 1) void replaySlow(p.id);
  if (misses === 2) a.req.onClue?.();
}

/** Tap / click / number key on a sentence. */
export function choose(id: PhraseId) {
  const a = active;
  const p = getGame().prompt;
  if (!a || a.done || !p || !p.buttons || p.status === "listening") return;
  if (accepted(id)) {
    succeed(id);
    return;
  }
  audio.play("error");
  update({ status: "wrong", wrongId: id, misses: p.misses + 1, highlight: p.misses + 1 >= 2 });
  if (p.misses + 1 === 2) a.req.onClue?.();
  window.setTimeout(() => {
    const now = getGame().prompt;
    if (now && now.id === p.id && now.wrongId === id) update({ wrongId: null, status: "ready" });
  }, 700);
}

export function chooseIndex(i: number) {
  const p = getGame().prompt;
  const c = p?.choices[i];
  if (c) choose(c.id);
}

export function cancelAsk() {
  const p = getGame().prompt;
  if (!p?.cancellable || p.status === "correct") return;
  tts.cancel();
  audio.setListening(false);
  finish(null);
}

export function isAsking() {
  return Boolean(active && !active.done);
}

// ---------------------------------------------------------------- dialogue

let lineId = 1;
let lineDone: (() => void) | null = null;

/** Show a line of dialogue, read it aloud, wait for Next. */
export function say(by: Speaker, en: string, ja?: string, extra: Partial<Line> = {}): Promise<void> {
  const line: Line = { id: lineId++, by, en, ja, ...extra };
  const mode = getGame().mode;
  setGame({ line, mode: mode === "busy" ? "busy" : "talk", prompt: null });
  if (by === "pico") rt.pico.waveT0 = rt.time;
  void speak(en, by);
  return new Promise((resolve) => {
    lineDone = () => {
      lineDone = null;
      resolve();
    };
    if (fastMode()) window.setTimeout(() => nextLine(), 30);
  });
}

/** Next ▶ (click, Space, Enter). */
export function nextLine() {
  if (!getGame().line || !lineDone) return;
  tts.cancel();
  audio.play("tick");
  const g = getGame();
  setGame({ line: null, mode: g.mode === "talk" ? "play" : g.mode });
  lineDone();
}

export function hasLine() {
  return Boolean(getGame().line && lineDone);
}

/** Test runs (?fast=1) skip pauses and auto-advance dialogue. */
export function fastMode(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).get("fast") === "1";
}

/** A pause that test runs shorten. */
export function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, fastMode() ? Math.min(ms, 40) : ms));
}
