import { Fragment } from "react";
import { useGame, type Speaker } from "../game/store";
import { cancelAsk, choose, micPress, micUsable, nextLine, replay } from "../game/flow/ask";
import { cancelShow, replayRequest } from "../game/flow/visitors";
import { PHRASES, type PhraseId } from "../game/logic/english";
import { SPECIES } from "../game/data/fish";
import { requestStep } from "../game/logic/requestGuide";
import { Icon } from "./icons";
import { DecorPicture, FishPicture, LampPicture, SpeakerFace } from "./Portraits";
import { ACTION, SWATCH, UI, requestAction } from "./i18n";
import { ActionTag } from "./ActionTag";
import { Ja } from "./Ja";
import { promptHeading } from "./promptHeading";

export { Ja } from "./Ja";

const NAME: Record<string, string> = {
  pico: "Pico",
  self: "You",
  game: "",
  child: "Visitor",
  adult: "Visitor",
  fan: "Fish fan",
  grandma: "Visitor",
  explorer: "Explorer",
  judge: "Judge"
};
export const speakerName = (by: Speaker) => NAME[by] ?? SPECIES[by as keyof typeof SPECIES]?.name ?? "";

/** A sentence with its key word marked (second miss: highlighted, with a colour swatch). */
function Sentence({ id, text, highlight }: { id: PhraseId; text: string; highlight: boolean }) {
  const key = PHRASES[id].key;
  const i = text.toLowerCase().indexOf(key.toLowerCase());
  if (!highlight || i < 0) return <>{text}</>;
  const word = text.slice(i, i + key.length);
  const sw = SWATCH[key.toLowerCase()];
  return (
    <>
      {text.slice(0, i)}
      <mark className="key">
        {sw && <i className="swatch" style={{ background: sw }} />}
        {word}
      </mark>
      {text.slice(i + key.length)}
    </>
  );
}

/** An English prompt: say the sentence (or choose it). */
export function PromptPanel() {
  const p = useGame((s) => s.prompt);
  const touch = useGame((s) => s.touch);
  const expansion = useGame((s) => s.model.progress.stage >= 8);
  useGame((s) => s.micState); // re-render when the mic gets blocked
  if (!p) return null;
  const mic = micUsable();
  const heading = promptHeading(p, mic);
  const lookCue = p.question?.en === "How many fish?" ? ACTION.lookFish
    : p.question?.en === "What's this?" || p.question?.en === "What color is it?" ? ACTION.lookAnimal : null;
  const speakHint = touch ? UI.speakTouch : UI.speakKeys;
  const status =
    p.status === "listening"
      ? UI.listening
      : p.status === "miss"
        ? p.misses >= 3 && mic
          ? UI.rescue
          : p.misses === 2
            ? UI.lookWord
            : UI.tryAgain
        : p.status === "unclear"
          ? UI.unclear
          : p.status === "wrong"
            ? UI.wrong
            : p.buttons && !mic
              ? UI.choose
              : speakHint;
  return (
    <div className={`panel prompt ui ${p.status} ${expansion ? "expansion-prompt" : ""}`} data-testid="prompt" role="dialog" aria-label="English">
      {p.question && (
        <div className="prompt-question">
          <SpeakerFace by={p.question.by} size={54} />
          <div className="q-text">
            <span className="who">{speakerName(p.question.by)}</span>
            <span className="q-en" data-testid="prompt-question">
              {p.question.en}
            </span>
            {lookCue && (
              <span className="request-action" data-testid="request-action">
                <ActionTag kind="look" {...lookCue} secondary />
              </span>
            )}
          </div>
          <div className="prompt-heading" data-testid="prompt-heading"><ActionTag {...heading} /></div>
        </div>
      )}
      <div className="prompt-main">
        <div className="prompt-body">
          {!p.question && <div className="prompt-heading" data-testid="prompt-heading"><ActionTag {...heading} /></div>}
          {!p.buttons && p.frame && (
            <div className="frame" data-testid="frame">
              {p.frame.before && <span className="frame-text">{p.frame.before}</span>}
              <span className="slots">
                {p.frame.slots.map((s) => (
                  <span key={s.id} className={`slot ${p.matched === s.id ? "matched" : ""} ${p.highlight ? "lit" : ""}`} data-testid="slot">
                    {PHRASES[s.id].key}
                  </span>
                ))}
              </span>
              <span className="frame-text">{p.frame.after}</span>
            </div>
          )}
          {!p.buttons && !p.frame && (
            <ol className={`sentences ${p.sentences.length > 1 ? "many" : "one"}`}>
              {p.sentences.map((s) => (
                <li key={s.id} className={`sentence ${p.matched === s.id ? "matched" : ""} ${p.reading ? "reading" : ""}`} data-testid="sentence">
                  <Sentence id={s.id} text={s.en} highlight={p.highlight} />
                </li>
              ))}
            </ol>
          )}
          {p.buttons && (
            <div className={`choices n${p.choices.length}`} role="group">
              {p.choices.map((c, i) => (
                <button
                  key={c.id}
                  className={`choice ${p.wrongId === c.id ? "wrong" : ""} ${p.matched === c.id ? "matched" : ""}`}
                  onClick={() => choose(c.id)}
                  data-testid="choice"
                  data-id={c.id}
                >
                  {!touch && <kbd>{i + 1}</kbd>}
                  <span>
                    <Sentence id={c.id} text={c.en} highlight={p.highlight && p.kind === "command"} />
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="prompt-controls">
            {mic && p.status !== "correct" && (
              <button className={`mic ${p.status === "listening" ? "on" : ""}`} onClick={() => micPress()} aria-label="Speak" data-testid="mic">
                <Icon id="mic" size={32} />
                {!touch && <kbd>SPACE</kbd>}
              </button>
            )}
            <button className="speaker" onClick={() => void replay()} aria-label="Listen again" data-testid="replay">
              <Icon id="speaker" size={26} />
            </button>
            <div className="prompt-status" data-testid="prompt-status" role="status" aria-live="polite">
              {p.status === "correct" ? (
                <span className="good">
                  <Icon id="check" size={26} /> Great!
                </span>
              ) : (
                <>
                  <span>{status.en}</span>
                  <Ja>{status.ja}</Ja>
                  {mic && p.status !== "listening" && status !== speakHint && !(p.buttons && p.misses >= 3) && (
                    <span className="prompt-mic-reminder">{speakHint.en}<Ja>{speakHint.ja}</Ja></span>
                  )}
                </>
              )}
              {p.heard && p.status !== "ready" && (
                <span className="heard" data-testid="heard">
                  “{p.heard}”
                </span>
              )}
            </div>
          </div>
        </div>
        {p.cancellable && p.status !== "correct" && (
          <button className="close" onClick={() => cancelAsk()} aria-label="Close" data-testid="prompt-close">
            <Icon id="close" size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Pico's tips lesson: each face earns its coins from every visitor who looks. */
function TipsPicture() {
  return (
    <div className="tips-picture" data-testid="tips-picture">
      {(["sad", "okay", "happy"] as const).map((md, i) => (
        <span key={md} className={`tips-step ${md}`}>
          <Icon id={md} size={40} />
          <span className="tips-arrow">→</span>
          <span className="tips-coins">
            {Array.from({ length: i + 1 }, (_, k) => (
              <Icon key={k} id="coin" size={26} />
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

/** A line of dialogue (Pico, a visitor, a fish). */
export function DialoguePanel() {
  const line = useGame((s) => s.line);
  const touch = useGame((s) => s.touch);
  if (!line) return null;
  return (
    <div className={`panel dialogue ui by-${line.by}`} onClick={() => nextLine()} data-testid="dialogue" role="dialog">
      <SpeakerFace by={line.by} size={64} />
      <div className="dialogue-body">
        <span className="who">{speakerName(line.by)}</span>
        {line.en === ACTION.tapToPlay.en ? (
          <p className="line-en" data-testid="line"><ActionTag kind="tap" en={line.en} ja={line.ja} /></p>
        ) : (
          <><p className="line-en" data-testid="line">{line.en}</p>{!line.target && <Ja>{line.ja}</Ja>}</>
        )}
        {line.visual === "tips" && <TipsPicture />}
      </div>
      <button
        className="next"
        onClick={(e) => {
          e.stopPropagation();
          nextLine();
        }}
        data-testid="next"
      >
        ▶ {UI.next.en}
        {!touch && <kbd>SPACE</kbd>}
      </button>
    </div>
  );
}

/** A "show me" request waiting for a tap: the visitor's sentence stays on screen. */
export function RequestBanner() {
  const r = useGame((s) => s.request);
  const waiting = useGame((s) => s.waiting);
  const otherNudge = useGame((s) => Boolean(s.nudge && s.nudge.target !== "chip-visitor"));
  const blocked = useGame((s) => Boolean(s.prompt || s.line || s.stageCard || s.settingsOpen || s.screen !== "game"));
  const view = useGame((s) => s.view);
  const tankId = useGame((s) => s.tankId);
  const model = useGame((s) => s.model);
  const step = requestStep({ request: r, waiting, view, tankId, model });
  if (!r && waiting && step && !blocked && !otherNudge && model.progress.tutorial !== "done") return (
    <div className="panel request ui" data-testid="waiting-request" data-request-step="visitor" data-request-tier="1" role="status" style={{ pointerEvents: "none" }}>
      <SpeakerFace by={waiting.type} size={44} />
      <div className="req-body" data-testid="request-action"><ActionTag kind="tap" {...ACTION.tapVisitor} /></div>
    </div>
  );
  if (!r || (r.req.kind !== "show" && r.req.kind !== "showAnimal")) return null;
  const req = r.req;
  const highlight = r.misses >= 1;
  const words = r.line.split(/(\s+)/);
  // The key word: the colour (with a swatch) or the animal (with its picture).
  const key = req.kind === "show" ? req.color : SPECIES[req.species].plural;
  const clue = req.kind === "show" ? <i className="swatch" style={{ background: SWATCH[req.color] }} /> : <FishPicture species={req.species} size={34} />;
  const action = step ? requestAction(step) : null;
  return (
    <div className={`panel request ui ${r.status}`} data-testid="request" data-request-step={step?.step ?? "correct"} data-request-tier={step?.tier ?? ""} role="status">
      <SpeakerFace by={r.by} size={44} />
      <div className="req-body">
        <span className="who">{speakerName(r.by)}</span>
        <p className="req-en" data-testid="request-line">
          {words.map((w, i) =>
            highlight && w.toLowerCase().replace(/[^a-z]/g, "") === key ? (
              <mark key={i} className="key">
                {w}
                {r.misses >= 2 && (
                  <span className="request-clue" data-testid="request-clue">
                    {clue}<small>{req.kind === "show" ? req.color : SPECIES[req.species].word}</small>
                  </span>
                )}
              </mark>
            ) : (
              <Fragment key={i}>{w}</Fragment>
            )
          )}
        </p>
        {action && <div className="request-action" data-testid="request-action"><ActionTag {...action} /></div>}
      </div>
      <button className="speaker" onClick={() => replayRequest()} aria-label="Listen again" data-testid="request-replay">
        <Icon id="speaker" size={24} />
      </button>
      {r.status === "correct" ? (
        <span className="good">
          <Icon id="check" size={26} />
        </span>
      ) : (
        r.by !== "judge" &&
        model.progress.tutorial === "done" && (
          <button className="close" onClick={() => cancelShow()} aria-label={UI.later.en} data-testid="request-later">
            <Icon id="close" size={18} />
          </button>
        )
      )}
    </div>
  );
}

/** A tapped fish says what it likes. */
export function FishTalk() {
  const ft = useGame((s) => s.fishTalk);
  if (!ft) return null;
  const def = SPECIES[ft.species];
  return (
    <div className="panel fish-talk ui" key={ft.id} data-testid="fish-talk">
      <SpeakerFace by={ft.species} size={52} />
      <span className="ft-en">{def.likesLine}</span>
      {def.likes === "lamp" ? <LampPicture size={44} /> : <DecorPicture kind={def.likes} size={44} />}
    </div>
  );
}
