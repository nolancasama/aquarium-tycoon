import type { PromptUi } from "../game/store";
import { ACTION } from "./i18n";

type HeadingState = Pick<PromptUi, "kind" | "sentences" | "frame" | "buttons" | "misses">;

/** Presentation only: accepted answers and the existing miss ladder remain in ask(). */
export function promptHeading(p: HeadingState, mic: boolean) {
  if (p.buttons && !mic) return { kind: "tap" as const, ...ACTION.tapAnswer };
  if (p.buttons && p.misses >= 3) return { kind: "say" as const, ...ACTION.sayOrTap };
  if (p.kind === "choice") return { kind: "say" as const, ...ACTION.sayOne };
  if (p.frame || p.sentences.length > 1) return { kind: "say" as const, ...ACTION.sayAnswer };
  return { kind: "say" as const, ...ACTION.sayThis };
}
