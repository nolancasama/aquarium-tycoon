import type { VisitorRt } from "../runtime";
import type { GameState, Screen } from "../store";
import { requestEligible } from "../world";

export interface PendingVisitorTap {
  visitorId: string;
  queuedAt: number;
  screen: Screen;
  hall: number;
}

type TapGame = Pick<GameState, "screen" | "hall" | "mode" | "request" | "prompt" | "placing" | "stageCard" | "settingsOpen" | "line" | "fade">;

/** Revalidate the original intent before doing anything after an interruption. */
export function queuedVisitorTapState(pending: PendingVisitorTap, now: number, g: TapGame, visitor: VisitorRt | undefined,
  transient: { activeRequest: boolean; scriptedBusy: boolean; cameraMoving: boolean; picoTalking: boolean }): "drop" | "wait" | "open" {
  if (now - pending.queuedAt >= 10 || g.screen !== "game" || g.screen !== pending.screen || g.hall !== pending.hall ||
    !visitor || !requestEligible(visitor) || g.request || g.prompt || g.placing || g.stageCard || g.settingsOpen ||
    transient.activeRequest || transient.scriptedBusy || g.fade > 0 || g.mode === "ask") return "drop";
  if (g.mode !== "play" || g.line || transient.cameraMoving || transient.picoTalking) return "wait";
  return "open";
}
