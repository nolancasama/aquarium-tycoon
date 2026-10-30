import { getGame, nudge, setGame } from "../store";
import { cancelAsk, chooseIndex, hasLine, micPress, nextLine } from "./ask";
import { backToRoom, cancelPlacing, closePanel } from "./actions";
import { closeStageCard } from "./story";
import { newTapReminder, tapReminder } from "../logic/tapReminder";
import { ACTION } from "../../ui/i18n";

let reminderState = newTapReminder();

/** Fresh key presses, routed by what is on screen. */
export function onKey(code: string) {
  const g = getGame();
  if (g.screen !== "game") return;

  if (g.settingsOpen) {
    if (code === "Escape") setGame({ settingsOpen: false });
    return;
  }
  if (g.stageCard) {
    if (code === "Space" || code === "Enter" || code === "NumpadEnter") closeStageCard();
    return;
  }
  if (hasLine()) {
    if (code === "Space" || code === "Enter" || code === "NumpadEnter") nextLine();
    return;
  }
  if (g.mode === "ask") {
    if (code === "Space") micPress();
    else if (code === "Escape") cancelAsk();
    else if (code.startsWith("Digit") || code.startsWith("Numpad")) {
      const n = Number(code.replace(/\D/g, ""));
      if (n >= 1 && n <= 5) chooseIndex(n - 1);
    }
    return;
  }
  if (g.mode !== "play") return;
  if (!g.prompt && !g.line) {
    const next = tapReminder(reminderState, code, g.model.progress.tutorial, g.model.progress.stage, performance.now() / 1000);
    if (next) {
      reminderState = next;
      nudge({ ...(g.touch ? ACTION.tapToPlayTouch : ACTION.tapToPlayMouse), kind: "tap" }, 4000);
    }
  }
  if (code === "Escape") {
    if (g.placing) cancelPlacing();
    else if (g.panel) closePanel();
    else if (g.view === "tank" && g.model.progress.tutorial === "done") backToRoom();
    else if (g.view === "room") setGame({ settingsOpen: true });
  }
}
