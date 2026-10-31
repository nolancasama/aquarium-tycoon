import type { GameState } from "../store";
import { HALL_OF, TANKS } from "../data/tanks";
import { roomOpen } from "../data/rooms";
import { canLive, hasSpace } from "./model";
import { requestStep } from "./requestGuide";

export type HandTarget = { id: string; kind: "dom" | "world" };
export type HandCue = HandTarget & { showing: string; first?: string };

/** Semantic target ids share the guide vocabulary; tank guide ids can name a pad. */
function guideTarget(g: GameState, id: string): HandTarget | null {
  if (id === "decor-rings") {
    const tank = g.model.tanks.find((t) => t.id === g.tankId);
    const slot = tank && TANKS[tank.type].slots.findIndex((_, i) => !tank.decor.some((d) => d.slot === i));
    return tank && slot !== undefined && slot >= 0 ? { id: `ring-${tank.id}:${slot}`, kind: "world" } : null;
  }
  if (id.startsWith("tank-")) {
    const name = id.slice(5);
    const tank = g.model.tanks.find((t) => t.id === name || t.slot === name);
    return tank && HALL_OF[tank.slot] === g.hall ? { id: `tank-${tank.id}`, kind: "world" } : null;
  }
  if (id === "door-hall" || id === "hall-door") return { id: "door-1", kind: "world" };
  if (id === "door-gallery" || id === "gallery-door") return { id: "door-2", kind: "world" };
  if (id.startsWith("pad-")) return { id, kind: "world" };
  return { id, kind: "dom" };
}

/** Pure eligibility: assessed requests never supply an exact hand below tier three. */
export function handCue(g: GameState, activeFirst?: string): HandCue | null {
  if (g.screen !== "game" || g.mode !== "play" || g.prompt || g.line || g.stageCard || g.settingsOpen || g.audioCheck) return null;
  const context = `${g.view}:${g.hall}:${g.tankId ?? ""}`;
  const make = (target: HandTarget | null, showing: string, first?: string): HandCue | null => target ? { ...target, showing: `${context}:${showing}`, first } : null;
  const first = (key: string) => activeFirst === key || !(g.model.progress.handShown ?? []).includes(key);
  if (g.request) {
    const step = requestStep(g);
    if (step?.tier !== 3) return null;
    let id: string | undefined;
    if (step.step === "tank") {
      const tank = g.model.tanks.find((t) => step.tankIds.includes(t.id) && HALL_OF[t.slot] === g.hall);
      id = tank ? `tank-${tank.id}` : undefined;
    } else {
      const here = g.model.tanks.find((t) => t.id === g.tankId);
      const fish = here?.fish.find((f) => step.fishIds.includes(f.id));
      const decor = here?.decor.find((d) => step.decorIds.includes(`${here.id}:${d.slot}`));
      id = fish ? `fish-${fish.id}` : decor ? `decor-${here!.id}:${decor.slot}` : undefined;
    }
    return make(id ? { id, kind: "world" } : null, `request:${g.request.visitorId}:${id}`);
  }
  if (g.model.progress.tutorial === "buy" && !g.panel && !g.placing && g.view === "room" && first("fish-shop")) {
    return make({ id: "btn-fish-shop", kind: "dom" }, "first:fish-shop", "fish-shop");
  }
  if (g.placing?.kind === "fish" && g.view === "room" && first("place-animal")) {
    const fish = g.model.inv.fish.find((f) => f.id === (g.placing?.kind === "fish" ? g.placing.fishId : ""));
    const tank = fish && g.model.tanks.find((t) => HALL_OF[t.slot] === g.hall && canLive(fish.species, t) && hasSpace(t, fish.species));
    if (tank) return make({ id: `tank-${tank.id}`, kind: "world" }, "first:place-animal", "place-animal");
  }
  if (g.panel === "decorate" && (g.placing?.kind === "decor" || g.placing?.kind === "move") && first("decor-ring")) {
    return make(guideTarget(g, "decor-rings"), "first:decor-ring", "decor-ring");
  }
  if (g.model.progress.tutorial === "visitor" && g.waiting && !g.panel && !g.placing && g.view === "room" && first("visitor")) {
    return make(g.hall === 0 ? { id: `visitor-${g.waiting.id}`, kind: "world" } : { id: "chip-visitor", kind: "dom" }, "first:visitor", "visitor");
  }
  if (g.view === "room" && !g.panel && first("room-navigation")) {
    const direction = roomOpen(g.hall + 1, g.model.progress) ? "next" : g.hall > 0 && roomOpen(g.hall - 1, g.model.progress) ? "prev" : null;
    if (direction) return make({ id: `btn-hall-${direction}`, kind: "dom" }, "first:room-navigation", "room-navigation");
  }
  // Existing Help C is nudge tier 2 (A is the persistent Next card). Tutorial
  // repeated nudges are emitted only by its existing twenty-second idle timer.
  if (g.nudge?.target && (g.nudge.tier === 2 || (g.model.progress.tutorial !== "done" && g.nudge.repeated))) {
    return make(guideTarget(g, g.nudge.target), `nudge:${g.nudge.id}`);
  }
  return null;
}
