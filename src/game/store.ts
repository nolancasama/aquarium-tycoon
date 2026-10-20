import { create } from "zustand";
import type { SlotId, SpeciesId, StageId, TankType, Text, VisitorType } from "./types";
import type { PhraseId } from "./logic/english";
import type { Request } from "./logic/requests";
import { newModel, type Model, type Result } from "./logic/model";

export type Screen = "title" | "game" | "results";

/**
 * play: free to tap around.  ask: an English prompt is open.  talk: a line of
 * dialogue is showing.  busy: a scripted moment (a reward, the judge).
 */
export type Mode = "play" | "ask" | "talk" | "busy";
export type View = "room" | "tank";
export type Panel = null | "fishShop" | "decorShop" | "tankShop" | "decorate";

export type Placing =
  | null
  /** A bagged fish: tap a tank to put it in. */
  | { kind: "fish"; fishId: string }
  /** A decoration from the tray: tap a slot. */
  | { kind: "decor"; decorId: string }
  /** A placed decoration picked up: tap another slot, or put it away. */
  | { kind: "move"; tankId: string; slot: number }
  /** A boxed tank: tap a free pad, then confirm. */
  | { kind: "tank"; type: TankType; slot: SlotId | null };

export interface Settings {
  /** Speak into the microphone (off = Tap mode). A teacher setting. */
  mic: boolean;
  music: number;
  sfx: number;
  /** Japanese help for instructions (never for target English). */
  japanese: boolean;
  slowVoice: boolean;
}

export type MicState = "unknown" | "ready" | "blocked" | "unsupported";

export type Speaker = "pico" | "self" | "game" | VisitorType | SpeciesId;

export interface Choice {
  id: PhraseId;
  en: string;
}

/** "___ fish!" shown as a sentence frame with word slots. */
export interface Frame {
  before: string;
  after: string;
  slots: Choice[];
}

export interface PromptUi {
  id: number;
  kind: "command" | "choice";
  question: { en: string; ja?: string; by: Speaker } | null;
  /** Japanese help line for the task (not a translation of the English). */
  help: string | null;
  /** Sentences shown (inert) in Speak mode. */
  sentences: Choice[];
  frame: Frame | null;
  /** Tappable sentences (Tap mode, or the rescue after three misses). */
  choices: Choice[];
  status: "ready" | "listening" | "miss" | "unclear" | "correct" | "wrong";
  heard: string;
  misses: number;
  buttons: boolean;
  wrongId: PhraseId | null;
  matched: PhraseId | null;
  cancellable: boolean;
  /** The sentence is being read aloud (it pulses). */
  reading: boolean;
  /** Second miss: the key words are highlighted (colour swatches, number pills). */
  highlight: boolean;
}

export interface Line {
  id: number;
  by: Speaker;
  en: string;
  ja?: string;
  /** Target English (to understand): never glossed in Japanese. */
  target?: boolean;
}

export interface RequestUi {
  visitorId: string;
  by: VisitorType;
  req: Request;
  line: string;
  /** Wrong taps so far (the hint ladder). */
  misses: number;
  status: "ready" | "wrong" | "correct";
}

export type Reward = "decor" | "yellow" | "tank" | "special";

export interface StageCard {
  stage: StageId;
  reward: Reward;
}

export interface Toast {
  id: number;
  en: string;
  ja?: string;
  tone: "good" | "info" | "warn";
}

export interface Nudge extends Text {
  id: number;
  /** HUD element to point at (its data-testid). */
  target?: string;
}

export interface GameState {
  screen: Screen;
  mode: Mode;
  view: View;
  tankId: string | null;
  panel: Panel;
  placing: Placing;
  settings: Settings;
  micState: MicState;
  touch: boolean;
  settingsOpen: boolean;
  hasSave: boolean;
  /** The title's "start again?" confirmation. */
  confirmNew: boolean;
  /** A save existed but could not be read. */
  saveLost: boolean;
  fade: number;

  model: Model;

  prompt: PromptUi | null;
  line: Line | null;
  request: RequestUi | null;
  stageCard: StageCard | null;
  toasts: Toast[];
  nudge: Nudge | null;
  /** Coin counter pulse (+n). */
  coinPop: { id: number; n: number } | null;
  /** A request visitor sits on the bench (HUD chip). */
  waiting: { id: string; type: VisitorType } | null;
  /** A tapped fish says what it likes. */
  fishTalk: { id: number; species: SpeciesId } | null;
  /** HUD control the tutorial points at (its data-testid). */
  guide: string | null;
}

const SETTINGS_KEY = "at.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  mic: true,
  music: 0.2,
  sfx: 0.75,
  japanese: true,
  slowVoice: false
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
      return {
        mic: s.mic !== false,
        music: Math.max(0, Math.min(1, Number(s.music) || 0)),
        sfx: Math.max(0, Math.min(1, Number(s.sfx) || 0)),
        japanese: s.japanese !== false,
        slowVoice: s.slowVoice === true
      };
    }
  } catch {
    /* storage blocked on some managed devices */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const useGame = create<GameState>(() => ({
  screen: "title",
  mode: "busy",
  view: "room",
  tankId: null,
  panel: null,
  placing: null,
  settings: loadSettings(),
  micState: "unknown",
  touch: false,
  settingsOpen: false,
  hasSave: false,
  confirmNew: false,
  saveLost: false,
  fade: 0,
  model: newModel(),
  prompt: null,
  line: null,
  request: null,
  stageCard: null,
  toasts: [],
  nudge: null,
  coinPop: null,
  waiting: null,
  fishTalk: null,
  guide: null
}));

export const setGame = useGame.setState;
export const getGame = useGame.getState;
export const model = () => getGame().model;

let popId = 1;

/** Apply a pure model change. */
export function updateModel(fn: (m: Model) => Model) {
  setGame((s) => {
    const next = fn(s.model);
    if (next === s.model) return {};
    const gained = next.coins - s.model.coins;
    return gained > 0 ? { model: next, coinPop: { id: popId++, n: gained } } : { model: next };
  });
}

/** Apply a rule's result if it succeeded. Returns it for the caller's message. */
export function commit(r: Result): Result {
  if (r.ok) updateModel(() => r.m);
  return r;
}

let toastId = 1;
/** Short message in the top-centre stack; disappears by itself. */
export function toast(t: Omit<Toast, "id">, ms = 2600) {
  const id = toastId++;
  setGame((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
  window.setTimeout(() => setGame((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ms);
}

let nudgeId = 1;
/** Pico's one-line nudge (non-blocking). */
export function nudge(n: Omit<Nudge, "id">, ms = 6000) {
  const id = nudgeId++;
  setGame({ nudge: { ...n, id } });
  window.setTimeout(() => {
    if (getGame().nudge?.id === id) setGame({ nudge: null });
  }, ms);
}
