import type { PromptUi } from "../game/store";
import { ACTION } from "./i18n";

type HeadingState = Pick<PromptUi, "buttons" | "firstPattern" | "answerMode">;

/** Presentation only: accepted answers and the existing miss ladder remain in ask(). */
export function promptHeading(p: HeadingState, mic: boolean) {
  if (p.answerMode === "say-tap") return p.firstPattern ? { kind: "say" as const, ...ACTION.sayTap } : null;
  if (p.buttons && !mic && p.answerMode !== "tap") return { kind: "tap" as const, ...ACTION.tapAnswer };
  if (p.buttons && !mic) return p.firstPattern ? { kind: "tap" as const, ...ACTION.tap } : null;
  return p.firstPattern ? { kind: "say" as const, ...ACTION.say } : null;
}
