import { useEffect, useState, type ReactNode } from "react";
import { setGame, useGame } from "../game/store";
import { lagoonHappiness, lagoonMood, lowestNeed, LAGOON_TOYS, type LagoonToy, type LagoonView } from "../game/logic/lagoon";
import {
  feedDolphins, giveLagoonToy, holdLagoonBall, throwLagoonBall, lagoonHelpNudge, LAGOON_MILESTONES, openToys, setLagoonView, startLagoonActivity, startLagoonTour, TOY_NAMES, watchLagoonIntro
} from "../game/flow/lagoon";
import { ballCatchPaused, canHoldBall, lagoonRt } from "../game/lagoon/lagoonRuntime";
import { Big } from "./Hud";
import { Icon } from "./icons";
import { PersonFace } from "./Portraits";
import { Ja } from "./Talk";
import { playHintAudio } from "./hintAudio";
import { AreaCelebration, NeedBar, OutdoorArrival } from "./OutdoorHud";

/** The Dolphin Lagoon's HUD: goals, viewpoints, the dolphins' three needs, Feed and Toys, a visitor with a question. */

export function DolphinGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 14c3-5 9-7 15-5l3-3 0 4c2 1 3 2 3 3-2 0-3 0-4-1-3 3-9 4-13 3l-3 2 1-3z" fill="#7f98a8" />
      <path d="M9 9l2-4 2 4z" fill="#6b8495" />
      <circle cx="17.5" cy="11.5" r="0.9" fill="#1d2a33" />
    </svg>
  );
}

function BallGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#ffffff" stroke="#3b4a55" strokeWidth="1.2" />
      <path d="M12 2a10 10 0 0 1 0 20" fill="#ff5c5c" />
      <path d="M2 12h20" stroke="#4dabf7" strokeWidth="3" />
    </svg>
  );
}

function ToyPicture({ toy, size = 64 }: { toy: LagoonToy; size?: number }) {
  if (toy === "ball") return <BallGlyph size={size} />;
  if (toy === "bubbles") {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <rect x="4" y="38" width="40" height="6" rx="3" fill="#8a9aa6" />
        {[[12, 30, 4], [20, 22, 3], [26, 31, 5], [33, 18, 3.5], [18, 12, 3], [30, 8, 2.5], [38, 27, 3]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#d6f6ff" stroke="#4dabf7" strokeWidth="1.5" />)}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {[0, 1, 2, 3].map((k) => <path key={k} d={`M${10 + k * 8} 44 C ${4 + k * 8} 30, ${18 + k * 8} 22, ${10 + k * 8} 6`} stroke={k % 2 ? "#4f8a3a" : "#6aa84f"} strokeWidth="5" fill="none" strokeLinecap="round" />)}
    </svg>
  );
}

export function LagoonGoals({ before }: { before?: ReactNode } = {}) {
  const p = useGame((s) => s.model.progress.lagoon);
  const free = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.areaActivity);
  const [open, setOpen] = useState(false);
  const done = p?.milestone ?? 0;
  const cur = LAGOON_MILESTONES[Math.min(4, done)];
  return (
    <div className={`panel goals tunnel-goals coast-goals outdoor-goals ui ${open ? "expanded" : ""}`} data-testid="lagoon-goals" data-milestone={done}>
      {before}
      <header><DolphinGlyph /> Dolphin Lagoon <Ja>イルカの ラグーン</Ja></header>
      {done >= 5 ? (
        <div className="guide-next"><b>All done! Enjoy the dolphins.</b> <Ja>ぜんぶ できた！ イルカと すごそう</Ja></div>
      ) : (
        <div className="guide-next" data-testid="lagoon-next">
          <b>{done + 1}. {cur.en}</b> <Ja>{cur.ja}</Ja>
          <small>{cur.todo.en}</small><Ja>{cur.todo.ja}</Ja>
        </div>
      )}
      {done === 4 && free && (
        <button className="primary outdoor-tour" data-testid="btn-lagoon-tour" onClick={() => void startLagoonTour()}>
          <Icon id="star" size={20} /> Start the tour! <Ja>ツアーを はじめる</Ja>
        </button>
      )}
      <button className="objectives-toggle" data-testid="btn-lagoon-goals" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span> Goals <Ja>もくひょう</Ja>
      </button>
      {open && (
        <ol className="tunnel-milestones">
          {LAGOON_MILESTONES.map((m, i) => (
            <li key={m.en} className={i < done ? "done" : i === done ? "current" : ""} data-testid={`lagoon-milestone-${i + 1}`}>
              <span className="tick">{i < done ? <Icon id="check" size={16} /> : i + 1}</span>
              <span>{m.en}<Ja>{m.ja}</Ja><small>🎁 {m.reward.en}</small></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const VIEWS: { id: LagoonView; en: string; ja: string }[] = [
  { id: "lagoon", en: "Lagoon", ja: "ラグーン" },
  { id: "gallery", en: "Underwater", ja: "すいちゅう" },
  { id: "deck", en: "Deck", ja: "デッキ" },
  { id: "care", en: "Care", ja: "ケア" }
];

function Views() {
  const view = useGame((s) => s.lagoonView);
  const guide = useGame((s) => s.nudge?.target);
  return (
    <div className="wing-views outdoor-views ui" role="group" aria-label="Viewpoints" data-testid="lagoon-views">
      {VIEWS.map((v) => (
        <button key={v.id} className={`${view === v.id ? "on" : ""} ${guide === `lagoon-view-${v.id}` ? "guide" : ""}`} aria-pressed={view === v.id} data-testid={`lagoon-view-${v.id}`} onClick={() => setLagoonView(v.id)}>
          {v.en}<Ja>{v.ja}</Ja>
        </button>
      ))}
    </div>
  );
}

const NEED_HINT = {
  food: { en: "The dolphins are hungry!", ja: "イルカが おなかを すかせているよ！" },
  play: { en: "The dolphins want to play!", ja: "イルカが あそびたがっているよ！" },
  together: { en: "The dolphins want to play together!", ja: "イルカが なかまと あそびたがっているよ！" }
} as const;

function HappinessCard() {
  const p = useGame((s) => s.model.progress.lagoon);
  if (!p) return null;
  const h = lagoonHappiness(p), mood = lagoonMood(p), low = lowestNeed(p);
  return (
    <div className="panel wing-status outdoor-status ui" data-testid="lagoon-status" data-happy={h}>
      <header>
        <span className="outdoor-status-title"><Icon id={mood} size={30} /><span>Dolphins<Ja>イルカの きもち</Ja></span></span>
        <span className="fishcount" data-testid="lagoon-happy">{h}</span>
      </header>
      <NeedBar value={p.food} icon={<Icon id="food" size={22} />} label="Food" id="lagoon-food" />
      <NeedBar value={p.play} icon={<BallGlyph size={20} />} label="Play" id="lagoon-play" />
      <NeedBar value={p.together} icon={<Icon id="heart" size={20} />} label="Together" id="lagoon-together" />
      <div className="need-legend" aria-hidden="true"><span>ごはん</span><span>あそび</span><span>なかま</span></div>
      {low && (
        <button className="coast-need" data-testid="lagoon-need" onClick={() => playHintAudio(NEED_HINT[low].en)}>
          <b>{NEED_HINT[low].en}</b><Ja>{NEED_HINT[low].ja}</Ja> <Icon id="speaker" size={18} />
        </button>
      )}
    </div>
  );
}

const NO_TOYS: LagoonToy[] = [];

function ToyPanel() {
  const toys = useGame((s) => s.model.progress.lagoon?.toys ?? NO_TOYS);
  return (
    <div className="panel shop coast-shop outdoor-toys ui" data-testid="lagoon-toys" role="dialog" aria-label="Toys">
      <header>
        <BallGlyph size={30} />
        <h2>Toys <Ja>おもちゃ（あそびの どうぐ）</Ja></h2>
        <button className="round close-btn" onClick={() => setGame({ areaPanel: null })} aria-label="Close" data-testid="toys-close"><Icon id="close" size={22} /></button>
      </header>
      <div className="grid">
        {LAGOON_TOYS.map((t) => {
          const owned = toys.includes(t);
          return (
            <button key={t} className={`card decor-card ${owned ? "" : "short"}`} onClick={() => giveLagoonToy(t)} data-testid="lagoon-toy" data-toy={t} aria-disabled={!owned}>
              <span className="pics"><ToyPicture toy={t} size={70} /></span>
              <strong className="structure-name">{TOY_NAMES[t].en}<Ja>{TOY_NAMES[t].ja}</Ja></strong>
              {!owned && <small className="need-tag"><Icon id="lock" size={14} /> Reward <Ja>ごほうび</Ja></small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WaitingVisitor() {
  const w = useGame((s) => (s.areaWaiting?.area === "lagoon" ? s.areaWaiting : null));
  if (!w) return null;
  return (
    <button className="chip-btn visitor ui coast-visitor" onClick={() => void startLagoonActivity()} data-testid="lagoon-visitor" aria-label="A visitor has a question about the dolphins">
      <PersonFace type={w.type} size={48} />
      <span className="excl">!</span>
      <small>Dolphins</small>
    </button>
  );
}

/** React updates only on a catch-state boundary; the scene owns ball motion. */
function CatchControls() {
  const read = () => {
    const toy = lagoonRt.toy;
    return `${toy?.kind === "ball" ? toy.state : "none"}|${ballCatchPaused()}|${canHoldBall()}`;
  };
  const [status, setStatus] = useState(read);
  useEffect(() => {
    let previous = read();
    setStatus(previous);
    const timer = window.setInterval(() => {
      const next = read();
      if (next !== previous) { previous = next; setStatus(next); }
    }, 150);
    return () => window.clearInterval(timer);
  }, []);
  const [state, paused, reachable] = status.split("|");
  if (state === "none") return null;
  const held = state === "held";
  const disabled = paused === "true" || (!held && reachable !== "true");
  return (
    <button className="big-btn ui" data-testid={held ? "btn-lagoon-throw" : "btn-lagoon-hold"}
      data-ball-state={state} style={{ position: "relative" }} disabled={disabled} onClick={() => held ? throwLagoonBall() : holdLagoonBall()}>
      <span className="big-icon"><BallGlyph size={40} /></span>
      <span className="big-label">{held ? "Throw!" : "Hold the ball"}<Ja>{held ? "なげる！" : "ボールを もつ"}</Ja></span>
      {held && <small data-testid="lagoon-ball-held" style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, minWidth: 156,
        padding: "6px 9px", borderRadius: 12, border: "2px solid #e7b63e", background: "#fff7d5", color: "#3d4d56", fontSize: 13, lineHeight: 1.25 }}>
        In your hands<Ja>ボールを もっているよ</Ja>
      </small>}
    </button>
  );
}

export function LagoonHud() {
  const free = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.stageCard && !s.areaActivity && s.fade === 0);
  const panel = useGame((s) => s.areaPanel);
  useEffect(() => watchLagoonIntro(), []);
  return (
    <>
      <HappinessCard />
      {free && panel !== "toys" && <Views />}
      {panel === "toys" && <ToyPanel />}
      {free && panel !== "toys" && (
        <div className="bottombar room-bar wing-bar outdoor-bar">
          <div className="chips-left" />
          <div className="bar-main">
            <Big id="btn-lagoon-feed" icon="food" label="Feed" ja="えさ" onClick={feedDolphins} />
            <Big id="btn-lagoon-toys" icon="ball" label="Toys" ja="おもちゃ" onClick={openToys} />
            <CatchControls />
          </div>
          <div className="chips-right"><WaitingVisitor /></div>
        </div>
      )}
      <OutdoorArrival />
      <AreaCelebration />
    </>
  );
}

export function lagoonHelp() {
  lagoonHelpNudge();
}
