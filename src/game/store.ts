import type { FoodId } from "./data/food";
import { create } from "zustand";
import type { DecorKind, SlotId, SpeciesId, StageId, TankType, Text, VisitorType } from "./types";
import type { PhraseId } from "./logic/english";
import type { Request } from "./logic/requests";
import type { SentencePatternId } from "./logic/sentenceTeaching";
import { newModel, type Model, type Result } from "./logic/model";

export type Screen = "title" | "game" | "results";

/**
 * play: free to tap around.  ask: an English prompt is open.  talk: a line of
 * dialogue is showing.  busy: a scripted moment (a reward, the judge).
 */
export type Mode = "play" | "ask" | "talk" | "busy";
export type View = "room" | "tank";
/** "remodel": the remodel confirmation for `placing` (a chosen tank). "lights": a display tank's light colours (close-up). */
export type Panel = null | "fishShop" | "animalShop" | "decorShop" | "tankShop" | "decorate" | "upgrade" | "remodel" | "lights";

export type Placing =
  | null
  /** A bagged fish: tap a tank to put it in. */
  | { kind: "fish"; fishId: string }
  /** A decoration from the tray: tap a slot. */
  | { kind: "decor"; decorId: string }
  /** A placed decoration picked up: tap another slot, or put it away. */
  | { kind: "move"; tankId: string; slot: number }
  /** A boxed tank: tap a free pad, then confirm. */
  | { kind: "tank"; type: TankType; slot: SlotId | null }
  /** Remodel into this type: tap a tank whose pad takes it (tankId once chosen), then confirm. */
  | { kind: "remodel"; type: TankType; tankId: string | null };

export interface Settings {
  /** Speak into the microphone (off = Tap mode). A teacher setting. */
  mic: boolean;
  music: number;
  sfx: number;
  /** Japanese help for instructions (never for target English). */
  japanese: boolean;
  slowVoice: boolean;
  sayAloud?: boolean;
  audioSetupDone?: boolean;
  speakTipSeen?: boolean;
}

export type AnswerMode = "speak" | "say-tap" | "tap";
export function answerMode(s: Settings): AnswerMode {
  return s.mic ? "speak" : s.sayAloud ? "say-tap" : "tap";
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
  pattern?: SentencePatternId;
  firstPattern?: boolean;
  meaningRevealed?: boolean;
  answerMode?: AnswerMode;
  micFeedback?: "quiet" | "overload" | "neutral";
  meterAvailable?: boolean;
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
  /** A picture under the line: "tips" = sad 1, okay 2, happy 3 coins. */
  visual?: "tips";
}

export interface RequestUi {
  pattern?: SentencePatternId;
  firstPattern?: boolean;
  meaningRevealed?: boolean;
  visitorId: string;
  by: VisitorType;
  req: Request;
  line: string;
  /** Wrong taps so far (the hint ladder). */
  misses: number;
  /** Runtime idle escalation: points out tanks without naming the answer. */
  idleHint?: boolean;
  status: "ready" | "wrong" | "correct";
}

export type Reward = "decor" | "yellow" | "tank" | "special" | "tall" | "upgrades";

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
  kind?: "say" | "tap" | "look";
  /** HUD element to point at (its data-testid). */
  target?: string;
  /** Runtime guide tier and offer; never part of the saved model. */
  tier?: 1 | 2;
  shopItem?: string;
  repeated?: boolean;
}

export interface GameState {
  screen: Screen;
  mode: Mode;
  view: View;
  /** Which room the management view shows (index into ROOMS: 1 the Ocean Hall, 2 the Jellyfish Gallery). */
  hall: number;
  tankId: string | null;
  panel: Panel;
  placing: Placing;
  settings: Settings;
  micState: MicState;
  touch: boolean;
  settingsOpen: boolean;
  audioCheck: null | "setup" | "speaker" | "mic" | "tip";
  hasSave: boolean;
  /** The title's "start again?" confirmation. */
  confirmNew: boolean;
  /** A save existed but could not be read. */
  saveLost: boolean;
  fade: number;
  atriumArrival: boolean;
  tunnelArrival: boolean;
  tunnelView: "whole" | "left" | "right" | "entrance";
  /** Walking the Shark Tunnel (runtime only; rt.explore holds the details). */
  exploring: boolean;
  /** A Shark Tunnel English activity in progress (the card while finding an animal). */
  tunnelActivity: TunnelActivityUi | null;
  /** A tunnel visitor waiting with a question (the HUD chip). */
  tunnelWaiting: { id: string; type: VisitorType } | null;
  /** Shark Tunnel milestone celebration card. */
  tunnelCelebration: { milestone: number } | null;
  /** Short Rush Hour cue, timed by the existing simulation clock. */
  rushAnnouncement: { kind: "prep" | "rush"; until: number } | null;
  /** The Aquarium Map overlay, and the hub's trophy card. */
  mapOpen: boolean;
  trophiesOpen: boolean;
  /** Coastal & Polar Zone: which exhibit the camera shows, the purchase offer, and an English activity in progress. */
  coastView: "all" | "penguins" | "seals" | "otters";
  coastOffer: boolean;
  coastActivity: { habitat: "penguins" | "seals" | "otters"; by: VisitorType } | null;
  /** A visitor at a coastal window has a question (the chip). */
  coastWaiting: { habitat: "penguins" | "seals" | "otters"; type: VisitorType } | null;
  coastCelebration: { milestone: number } | null;

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
  /** The foods just fed to a tank, shown with their English words until rt.time passes `until`. */
  foodStrip: { id: number; tankId: string; foods: FoodId[]; until: number } | null;
  /** HUD control the tutorial points at (its data-testid). */
  guide: string | null;
  /** The decoration whose two versions are being chosen ("Red or blue?"): pictures above the prompt. */
  decorAsk: DecorKind | null;
}

const SETTINGS_KEY = "at.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  mic: true,
  music: 0.2,
  sfx: 0.75,
  japanese: true,
  slowVoice: false,
  sayAloud: false,
  audioSetupDone: false,
  speakTipSeen: false
};

export function parseSettings(raw: string | null): Settings {
  try {
    if (raw) {
      const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
      return {
        mic: s.mic !== false,
        music: Math.max(0, Math.min(1, Number(s.music) || 0)),
        sfx: Math.max(0, Math.min(1, Number(s.sfx) || 0)),
        japanese: s.japanese !== false,
        slowVoice: s.slowVoice === true,
        sayAloud: s.sayAloud === true,
        audioSetupDone: s.audioSetupDone === true,
        speakTipSeen: s.speakTipSeen === true
      };
    }
  } catch {
    /* storage blocked on some managed devices */
  }
  return { ...DEFAULT_SETTINGS };
}

function loadSettings(): Settings {
  try { return parseSettings(localStorage.getItem(SETTINGS_KEY)); }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...getGame().settings, ...patch };
  saveSettings(settings);
  setGame({ settings });
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
  hall: 0,
  tankId: null,
  panel: null,
  placing: null,
  settings: loadSettings(),
  micState: "unknown",
  touch: false,
  settingsOpen: false,
  audioCheck: null,
  hasSave: false,
  confirmNew: false,
  saveLost: false,
  fade: 0,
  atriumArrival: false,
  tunnelArrival: false,
  tunnelView: "whole",
  exploring: false,
  tunnelActivity: null,
  tunnelWaiting: null,
  tunnelCelebration: null,
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
  foodStrip: null,
  guide: null,
  decorAsk: null,
  rushAnnouncement: null,
  mapOpen: false,
  trophiesOpen: false,
  coastView: "all",
  coastOffer: false,
  coastActivity: null,
  coastWaiting: null,
  coastCelebration: null
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

/** The Shark Tunnel activity card (see game/tunnel/activities.ts). */
export interface TunnelActivityUi {
  id: number;
  kind: "find" | "show" | "where" | "can" | "count";
  /** Who asks: a tunnel visitor's type, or Pico on a tour / at a viewing spot. */
  by: VisitorType | "pico";
  question: { en: string; ja: string };
  /** What to do, shown under the question. */
  todo: { en: string; ja: string };
  /** Help tier (0 none .. 4 tap demonstration). */
  tier: number;
  /** A short written clue (tier 1+). */
  clue: { en: string; ja: string } | null;
  status: "seek" | "wait" | "ask" | "done";
}
