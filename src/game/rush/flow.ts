import { audio } from "../../audio/audio";
import { SLOT_POS, STAND_H, TANKS } from "../data/tanks";
import { flowBusy } from "../flow/story";
import { scripted } from "../flow/visitors";
import type { Model } from "../logic/model";
import { effect, rt } from "../runtime";
import { getGame, setGame, updateModel } from "../store";
import { advance, continueEvent, debugStartEvent, latchReadiness, skip, startEvent } from "./logic";

/** A due event can wait here without interrupting a lesson or a tunnel walk. */
export function rushCalm(): boolean {
  const g = getGame();
  return g.screen === "game" && g.mode === "play" && !g.settingsOpen && !g.stageCard &&
    !g.prompt && !g.line && !g.request && !g.panel && !g.placing && !g.tunnelActivity &&
    !g.tunnelCelebration && !g.exploring && !rt.explore.active && !rt.celebrations.size &&
    !scripted.busy && !flowBusy();
}

function readyCue(m: Model, tankId: string) {
  const t = m.tanks.find((tank) => tank.id === tankId);
  audio.play("correct");
  if (!t) return;
  const p = SLOT_POS[t.slot];
  effect("sparkle", p.x, STAND_H + TANKS[t.type].h, p.z, 8);
}

function announce(kind: "prep" | "rush") {
  audio.play("door"); // The existing short, synthesised two-note bell cue.
  rt.pico.waveT0 = rt.time;
  setGame({ rushAnnouncement: { kind, until: rt.time + 4 } });
}

/** Called only in the care clock's one-second accumulator (also exposed to e2e). */
export function advanceRush(m: Model, seconds: number, rand: () => number): Model {
  return advance(m, seconds, { rand, calm: rushCalm() }).model;
}

/** Effects follow a committed model update; they never grant rewards themselves. */
export function rushTransitionEffects(before: Model, after: Model) {
  const old = before.rush;
  const rush = after.rush;
  if (!rush) return;
  if (rush.phase === "prep" && (old?.phase !== "prep" || old.event?.id !== rush.event?.id)) announce("prep");
  if (rush.phase === "prep" && rush.event) {
    for (const id of rush.event.ready) {
      if (old?.event?.id !== rush.event.id || !old.event.ready.includes(id)) readyCue(after, id);
    }
  }
  if (rush.phase === "rush" && old?.phase !== "rush") announce("rush");
  if (rush.phase === "results" && old?.phase !== "results") {
    setGame({ rushAnnouncement: null });
    audio.play(rush.event?.result?.medal ? "trophy" : "happy");
    if (rush.event?.result?.medal) effect("confetti", rt.camera.target.x, 2, rt.camera.target.z, 32);
  }
}

/** Care still runs only through the normal feed/clean rules. Latch immediately,
 * before the next second's decay can take an exact-threshold tank below 75. */
export function latchRushCare() {
  const before = getGame().model;
  const after = latchReadiness(before);
  if (after === before) return;
  updateModel(() => after);
  rushTransitionEffects(before, after);
}

export function startRush() {
  if (!rushCalm() || getGame().model.rush?.phase !== "pending") return;
  const before = getGame().model;
  updateModel((m) => startEvent(m, Math.random));
  rushTransitionEffects(before, getGame().model);
}

/** Debug menu: start the actual preparation phase immediately.
 * No synthetic rewards, no duplicate events and no bypass of Free Play unlocks. */
export function debugStartRush(): boolean {
  if (!rushCalm()) return false;
  const before = getGame().model;
  const after = debugStartEvent(before, Math.random);
  if (after === before || after.rush?.phase !== "prep") return false;
  updateModel(() => after);
  rushTransitionEffects(before, after);
  return true;
}

export function skipRush() {
  const g = getGame();
  if (g.screen !== "game" || g.mode !== "play" || g.prompt || g.line || g.settingsOpen) return;
  updateModel((m) => skip(m, Math.random));
  setGame({ rushAnnouncement: null });
}

export function continueRush() {
  if (getGame().model.rush?.phase !== "results") return;
  updateModel((m) => continueEvent(m, Math.random));
  setGame({ rushAnnouncement: null });
}
