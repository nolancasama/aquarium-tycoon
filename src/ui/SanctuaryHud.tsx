import { useEffect, useState, type ReactNode } from "react";
import { setGame, useGame } from "../game/store";
import { researchProgress, STICKERS, type SanctuaryView, type Sticker } from "../game/logic/sanctuary";
import {
  chooseHabitat, cleanupAvailable, IMPROVE_CHOICES, openImprove, openNotebook, SANCTUARY_MILESTONES, sanctuaryHelpNudge, setSanctuaryView,
  startCleanup, startSanctActivity, startSanctuaryTour, STICKER_TEXT, watchSanctuaryIntro
} from "../game/flow/sanctuary";
import { sanctRt } from "../game/sanctuary/sanctuaryRuntime";
import { Big } from "./Hud";
import { Icon } from "./icons";
import { PersonFace } from "./Portraits";
import { Ja } from "./Talk";
import { AreaCelebration, OutdoorArrival } from "./OutdoorHud";

/** The Grand Ocean Sanctuary's HUD: goals, viewpoints, the Research Notebook, the cleanup, the habitat choice, a visitor. */

export function OrcaGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1 14c3-5 10-7 16-5l4-3v4c1 1 2 2 2 3-3 1-6 2-10 2-4 1-9 1-12-1z" fill="#151c24" />
      <path d="M9 9l1.5-6 2 6z" fill="#151c24" />
      <ellipse cx="15" cy="13.8" rx="4" ry="1.2" fill="#f4f6f8" />
      <ellipse cx="18.5" cy="10.6" rx="1.4" ry="0.7" fill="#f4f6f8" />
    </svg>
  );
}

/** Small pictures for the notebook's stickers. */
function StickerPicture({ s }: { s: Sticker }) {
  const orca = (x: number, y: number, k = 1, flip = false) => (
    <g transform={`translate(${x} ${y}) scale(${flip ? -k : k} ${k})`}>
      <path d="M-14 2c4-6 14-8 22-5l5-4v5c2 1 3 3 3 4-4 1-8 2-13 2-6 1-12 1-17-2z" fill="#151c24" />
      <path d="M-3 -4l2-8 3 8z" fill="#151c24" />
      <ellipse cx="4" cy="2" rx="5" ry="1.5" fill="#f4f6f8" />
    </g>
  );
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="0" y="34" width="64" height="30" fill="#5fb3cf" />
      {s === "breath" && <>{orca(32, 38)}<path d="M38 30c-3-8 3-14 0-22M42 30c2-7 7-10 5-18" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" /></>}
      {s === "dive" && <path d="M32 40c0-10-2-16 0-22-6-2-12 0-14-4 6 0 12 1 14 3 2-2 8-3 14-3-2 4-8 2-14 4z" fill="#151c24" />}
      {s === "big" && <>{orca(30, 38, 1.4)}<rect x="52" y="24" width="4" height="10" fill="#e8590c" /><circle cx="54" cy="21" r="3" fill="#e8590c" /></>}
      {s === "together" && <>{orca(22, 36, 0.9)}{orca(42, 44, 0.9)}</>}
      {s === "family" && <>{orca(26, 38, 1.1)}{orca(46, 46, 0.55)}</>}
      {s === "spyhop" && <g><path d="M30 64V24c0-8 8-10 10-4v44z" fill="#151c24" /><ellipse cx="36" cy="26" rx="2" ry="3" fill="#f4f6f8" /></g>}
      {s === "beluga" && <path d="M10 42c6-8 18-10 30-6 4-4 10-6 14-2-4 0-6 2-6 4 4 2 6 4 6 6-10 2-30 6-44-2z" fill="#f4f6f8" stroke="#8aa0a8" strokeWidth="1.5" />}
      {s === "clean" && <><path d="M12 22l6 6 12-14" stroke="#2f9e44" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M44 12l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ffd43b" /></>}
    </svg>
  );
}

export function SanctuaryGoals({ before }: { before?: ReactNode } = {}) {
  const p = useGame((s) => s.model.progress.sanctuary);
  const free = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.areaActivity);
  const [open, setOpen] = useState(false);
  const done = p?.milestone ?? 0;
  const cur = SANCTUARY_MILESTONES[Math.min(4, done)];
  return (
    <div className={`panel goals tunnel-goals coast-goals outdoor-goals ui ${open ? "expanded" : ""}`} data-testid="sanctuary-goals" data-milestone={done}>
      {before}
      <header><OrcaGlyph /> Ocean Sanctuary <Ja>うみの サンクチュアリ</Ja></header>
      {done >= 5 ? (
        <div className="guide-next"><b>All done! You are an Ocean Guardian.</b> <Ja>ぜんぶ できた！ うみの まもりびとだね</Ja></div>
      ) : (
        <div className="guide-next" data-testid="sanctuary-next">
          <b>{done + 1}. {cur.en}</b> <Ja>{cur.ja}</Ja>
          <small>{cur.todo.en}</small><Ja>{cur.todo.ja}</Ja>
        </div>
      )}
      {done === 4 && free && (
        <button className="primary outdoor-tour" data-testid="btn-sanctuary-tour" onClick={() => void startSanctuaryTour()}>
          <Icon id="star" size={20} /> Start the tour! <Ja>ツアーを はじめる</Ja>
        </button>
      )}
      <button className="objectives-toggle" data-testid="btn-sanctuary-goals" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span> Goals <Ja>もくひょう</Ja>
      </button>
      {open && (
        <ol className="tunnel-milestones">
          {SANCTUARY_MILESTONES.map((m, i) => (
            <li key={m.en} className={i < done ? "done" : i === done ? "current" : ""} data-testid={`sanctuary-milestone-${i + 1}`}>
              <span className="tick">{i < done ? <Icon id="check" size={16} /> : i + 1}</span>
              <span>{m.en}<Ja>{m.ja}</Ja><small>🎁 {m.reward.en}</small></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const VIEWS: { id: SanctuaryView; en: string; ja: string }[] = [
  { id: "overview", en: "Lookout", ja: "てんぼうだい" },
  { id: "orcas", en: "Orcas", ja: "シャチ" },
  { id: "underwater", en: "Underwater", ja: "すいちゅう" },
  { id: "research", en: "Research", ja: "けんきゅうじょ" },
  { id: "belugas", en: "Belugas", ja: "シロイルカ" }
];

function Views() {
  const view = useGame((s) => s.sanctuaryView);
  const belugas = useGame((s) => Boolean(s.model.progress.sanctuary?.belugas));
  const guide = useGame((s) => s.nudge?.target);
  return (
    <div className="wing-views outdoor-views ui" role="group" aria-label="Viewpoints" data-testid="sanctuary-views">
      {VIEWS.map((v) => {
        const locked = v.id === "belugas" && !belugas;
        return (
          <button key={v.id} className={`${view === v.id ? "on" : ""} ${locked ? "locked" : ""} ${guide === `sanctuary-view-${v.id}` ? "guide" : ""}`} aria-pressed={view === v.id} aria-disabled={locked} data-testid={`sanctuary-view-${v.id}`} onClick={() => setSanctuaryView(v.id)}>
            {locked && <Icon id="lock" size={14} />}{v.en}<Ja>{v.ja}</Ja>
          </button>
        );
      })}
    </div>
  );
}

function ResearchCard() {
  const p = useGame((s) => s.model.progress.sanctuary);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 500); return () => window.clearInterval(t); }, []);
  if (!p) return null;
  const r = researchProgress(p);
  const litterLeft = sanctRt.cleanupOn ? sanctRt.litter.filter((l) => l.picked < 0).length : null;
  return (
    <button className="panel wing-status outdoor-status research-card ui" data-testid="sanctuary-research" data-stickers={r.n} onClick={openNotebook}>
      <header>
        <span className="outdoor-status-title"><Icon id="notebook" size={30} /><span>Research<Ja>けんきゅう ノート</Ja></span></span>
        <span className="fishcount">{r.n}/{r.of}</span>
      </header>
      <div className="research-slots">
        {STICKERS.map((s) => <span key={s} className={`slot ${p.stickers.includes(s) ? "got" : ""}`} title={STICKER_TEXT[s].en}><StickerPicture s={s} /></span>)}
      </div>
      {litterLeft !== null && <div className="research-mission" data-testid="sanctuary-litter-left"><Icon id="hand" size={18} /> Trash: {5 - litterLeft}/5 <Ja>ごみひろい</Ja></div>}
      {p.improvement && <div className="research-mission"><Icon id="check" size={18} /> {IMPROVE_CHOICES.find((c) => c.id === p.improvement)!.en}</div>}
    </button>
  );
}

function NotebookPanel() {
  const p = useGame((s) => s.model.progress.sanctuary);
  if (!p) return null;
  return (
    <div className="map-backdrop ui" onPointerDown={(e) => { if (e.target === e.currentTarget) setGame({ areaPanel: null }); }}>
      <div className="panel map-panel notebook-panel" role="dialog" aria-label="Research Notebook" data-testid="sanctuary-notebook">
        <header>
          <b>Research Notebook <Ja>けんきゅう ノート</Ja></b>
          <button className="round close-btn" aria-label="Close" onClick={() => setGame({ areaPanel: null })} data-testid="notebook-close"><Icon id="close" size={22} /></button>
        </header>
        <div className="notebook-grid">
          {STICKERS.map((s) => {
            const got = p.stickers.includes(s);
            return (
              <div key={s} className={`sticker ${got ? "got" : ""}`} data-testid={`sticker-${s}`} data-got={got}>
                {got ? <StickerPicture s={s} /> : <Icon id="lock" size={30} />}
                <span>{got ? STICKER_TEXT[s].en : "?"}</span>
                {got && <span className="ja">{STICKER_TEXT[s].ja}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ImprovePanel() {
  const chosen = useGame((s) => s.model.progress.sanctuary?.improvement ?? null);
  const [said, setSaid] = useState<{ id: string; good: boolean } | null>(null);
  const reason = said ? IMPROVE_CHOICES.find((c) => c.id === said.id)?.why : null;
  return (
    <div className="map-backdrop ui" onPointerDown={(e) => { if (e.target === e.currentTarget) setGame({ areaPanel: null }); }}>
      <div className="panel map-panel improve-panel" role="dialog" aria-label="Help the orcas' home" data-testid="sanctuary-improve">
        <header>
          <b>What helps the orcas? <Ja>シャチの ために なにを する？</Ja></b>
          <button className="round close-btn" aria-label="Close" onClick={() => setGame({ areaPanel: null })}><Icon id="close" size={22} /></button>
        </header>
        <div className="improve-grid">
          {IMPROVE_CHOICES.map((c) => (
            <button key={c.id} className={`improve-card ${said?.id === c.id ? (said.good ? "right" : "wrong") : ""} ${chosen === c.id ? "right" : ""}`} data-testid="improve-choice" data-choice={c.id}
              onClick={() => setSaid({ id: c.id, good: chooseHabitat(c.id) === "good" })}>
              <ImprovePicture id={c.id} />
              {c.en}
              <small>{c.ja}</small>
            </button>
          ))}
        </div>
        {reason && <p className={`improve-reason ${said?.good ? "good" : ""}`} data-testid="improve-reason">{said?.good ? "◎ " : "△ "}{reason}</p>}
      </div>
    </div>
  );
}

function ImprovePicture({ id }: { id: string }) {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="2" y="26" width="44" height="20" rx="4" fill="#5fb3cf" />
      {id === "kelp" && [10, 20, 30, 38].map((x, i) => <path key={i} d={`M${x} 46c-4-8 4-14 0-22`} stroke={i % 2 ? "#4f8a3a" : "#6aa84f"} strokeWidth="4" fill="none" strokeLinecap="round" />)}
      {id === "quiet" && <><circle cx="14" cy="30" r="4" fill="#4dabf7" /><circle cx="34" cy="30" r="4" fill="#4dabf7" /><path d="M8 14h10l8-6v24l-8-6H8z" fill="#3b4a55" /><path d="M32 10l10 14M42 10L32 24" stroke="#e03131" strokeWidth="3" /></>}
      {id === "ice" && <><path d="M12 30l8-6 8 2 4 6-8 4-10-2z" fill="#e6f7ff" stroke="#8aa0a8" /><path d="M18 30l3-2 3 1" stroke="#ff8a8a" strokeWidth="2" /></>}
      {id === "music" && <><path d="M8 14h10l8-6v24l-8-6H8z" fill="#3b4a55" /><path d="M30 12c4 4 4 12 0 16M35 8c7 7 7 19 0 26" stroke="#e8590c" strokeWidth="3" fill="none" /></>}
      {id === "tank" && <rect x="14" y="16" width="20" height="16" fill="#9fe6ff" stroke="#2f4f66" strokeWidth="2" />}
    </svg>
  );
}

function WaitingVisitor() {
  const w = useGame((s) => (s.areaWaiting?.area === "sanctuary" ? s.areaWaiting : null));
  if (!w) return null;
  return (
    <button className="chip-btn visitor ui coast-visitor" onClick={() => void startSanctActivity()} data-testid="sanctuary-visitor" aria-label="A visitor has a question about the sea animals">
      <PersonFace type={w.type} size={48} />
      <span className="excl">!</span>
      <small>Orcas</small>
    </button>
  );
}

export function SanctuaryHud() {
  const free = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.stageCard && !s.areaActivity && s.fade === 0);
  const panel = useGame((s) => s.areaPanel);
  const milestone = useGame((s) => s.model.progress.sanctuary?.milestone ?? 0);
  const improved = useGame((s) => Boolean(s.model.progress.sanctuary?.improvement));
  const cleaned = useGame((s) => Boolean(s.model.progress.sanctuary?.cleanupDone));
  useEffect(() => watchSanctuaryIntro(), []);
  return (
    <>
      {!panel && <ResearchCard />}
      {free && !panel && <Views />}
      {panel === "notebook" && <NotebookPanel />}
      {panel === "improve" && <ImprovePanel />}
      {free && !panel && (
        <div className="bottombar room-bar wing-bar outdoor-bar">
          <div className="chips-left" />
          <div className="bar-main">
            <Big id="btn-sanctuary-notebook" icon="notebook" label="Notebook" ja="ノート" onClick={openNotebook} />
            {cleanupAvailable() && <Big id="btn-sanctuary-cleanup" icon="hand" label={cleaned ? "Clean up" : "Clean up!"} ja="ごみひろい" onClick={startCleanup} />}
            {milestone >= 3 && <Big id="btn-sanctuary-improve" icon="heart" label={improved ? "Habitat" : "Help!"} ja="すみか" onClick={openImprove} />}
          </div>
          <div className="chips-right"><WaitingVisitor /></div>
        </div>
      )}
      <OutdoorArrival />
      <AreaCelebration />
    </>
  );
}

export function sanctuaryHelp() {
  sanctuaryHelpNudge();
}
