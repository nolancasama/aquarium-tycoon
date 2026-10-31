import { getGame, updateModel } from "../store";
import { encounterPattern, type SentencePatternId } from "../logic/sentenceTeaching";

/** Only count an encounter when Japanese help can actually be displayed. */
export function meetPattern(pattern: SentencePatternId) {
  if (!getGame().settings.japanese) return { pattern, firstPattern: false };
  const encounter = encounterPattern(getGame().model, pattern);
  updateModel(() => encounter.model);
  return { pattern, firstPattern: encounter.first };
}
