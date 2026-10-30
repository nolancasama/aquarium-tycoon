import type { TutorialStep } from "./model";

export interface TapReminderState {
  lastAt: number;
  afterTutorial: number;
}

export const newTapReminder = (): TapReminderState => ({ lastAt: -Infinity, afterTutorial: 0 });

/** Fresh movement-key presses may remind early players that the game uses taps. */
export function tapReminder(
  state: TapReminderState,
  code: string,
  tutorial: TutorialStep,
  stage: number,
  now: number
): TapReminderState | null {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) return null;
  const done = tutorial === "done";
  if ((done && (stage > 2 || state.afterTutorial >= 3)) || now - state.lastAt < 20) return null;
  return { lastAt: now, afterTutorial: state.afterTutorial + (done ? 1 : 0) };
}
