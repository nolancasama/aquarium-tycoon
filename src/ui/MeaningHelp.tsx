import { getGame, setGame, useGame } from "../game/store";
import { meaningVisible, SENTENCE_PATTERNS, type SentencePatternId } from "../game/logic/sentenceTeaching";
import "./MeaningHelp.css";

/** The slot is blank even after opening Hint: it never translates an answer. */
export function MeaningHelp({ pattern, first = false, revealed = false, correct = false, owner }: {
  pattern?: SentencePatternId;
  first?: boolean;
  revealed?: boolean;
  correct?: boolean;
  owner: "request" | "prompt";
}) {
  const japanese = useGame((s) => s.settings.japanese);
  if (!japanese || !pattern || correct) return null;
  const shown = meaningVisible(japanese, first, revealed, correct);
  const reveal = () => {
    const current = getGame()[owner];
    if (current && current.pattern === pattern) {
      if (owner === "request") setGame({ request: { ...getGame().request!, meaningRevealed: true } });
      else setGame({ prompt: { ...getGame().prompt!, meaningRevealed: true } });
    }
  };
  return <div className="meaning-help" data-pattern={pattern} data-meaning-shown={shown}>
    {shown ? <span className="sentence-meaning" lang="ja" data-testid="sentence-meaning" data-pattern={pattern}>{SENTENCE_PATTERNS[pattern].ja}</span>
      : <button className="meaning-hint" data-testid="meaning-hint" onClick={reveal}>Hint / ヒント</button>}
  </div>;
}
