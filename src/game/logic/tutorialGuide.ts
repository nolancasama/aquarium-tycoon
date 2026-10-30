import type { GameState } from "../store";
import { ACTION } from "../../ui/i18n";

/** The tutorial uses the same guide target and nudge as ordinary Help. */
export function tutorialGuide(g: Pick<GameState, "model" | "mode" | "prompt" | "line" | "request" | "stageCard" | "settingsOpen" | "panel" | "placing" | "waiting">) {
  if (g.mode !== "play" || g.prompt || g.line || g.request || g.stageCard || g.settingsOpen) return null;
  const step = g.model.progress.tutorial;
  if (step === "buy" && !g.panel && !g.model.inv.fish.length && !g.model.tanks.some((t) => t.fish.length)) return { ...ACTION.tapFish, target: "btn-fish-shop" };
  if (step === "place" && g.placing?.kind === "fish") return { ...ACTION.tapTank, target: "tank-A" };
  if (step === "feed" && !g.model.progress.fedOnce) return { ...ACTION.tapFeed, target: "btn-feed" };
  if (step === "visitor" && g.waiting) return { ...ACTION.tapVisitor, target: "chip-visitor" };
  if (step === "decorate" && g.panel === "decorate" && !g.model.tanks.some((t) => t.decor.length)) {
    return g.placing?.kind === "decor" || g.placing?.kind === "move"
      ? { ...ACTION.tapCircle, target: "decor-rings" }
      : { ...ACTION.tapTray, target: "tray" };
  }
  return null;
}
