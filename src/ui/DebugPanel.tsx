import { useEffect, useState } from "react";
import { toast, updateModel, useGame } from "../game/store";
import { openGallery, openHall, type Model } from "../game/logic/model";
import type { StageId } from "../game/types";
import "./DebugPanel.css";

const STAGES: StageId[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** Jump to a level with the flags the real path would have set (star from Level 6, tutorial from Level 2). */
function toStage(m: Model, stage: StageId): Model {
  return {
    ...m,
    progress: {
      ...m.progress,
      stage,
      tutorial: stage >= 2 ? "done" : m.progress.tutorial,
      star: stage >= 6 || m.progress.star,
      freePlay: stage >= 6 || m.progress.freePlay,
      helpedInStage: 0,
      namedInStage: 0,
      allHappy: false
    }
  };
}

/** Open a room through its real rule (adds its tank) without charging for it. */
function openFree(m: Model, open: (m: Model) => ReturnType<typeof openHall>): Model {
  const r = open({ ...m, coins: 1e9 });
  return r.ok ? { ...r.m, coins: m.coins } : m;
}

/** Both halls need their levels (Ocean Hall 6, Gallery 8), so this also moves to Level 8 when below it. */
const openAll = (m: Model) => openFree(openFree(m.progress.stage < 8 ? toStage(m, 8) : m, openHall), openGallery);

const ACTIONS: { label: string; run: (m: Model) => Model }[] = [
  {
    label: "Unlock everything (Level 8 + all halls)",
    run: (m) => {
      const o = openAll(toStage(m, 8));
      return { ...o, progress: { ...o.progress, tickets: true } };
    }
  },
  { label: "Open all halls", run: openAll },
  { label: "+1000 coins", run: (m) => ({ ...m, coins: m.coins + 1000 }) },
  { label: "Finish tutorial", run: (m) => ({ ...m, progress: { ...m.progress, tutorial: "done" } }) },
  { label: "All tanks fed and clean", run: (m) => ({ ...m, tanks: m.tanks.map((t) => ({ ...t, food: 100, clean: 100 })) }) },
  { label: "Give the crown (finish Level 8)", run: (m) => ({ ...m, progress: { ...m.progress, superStar: true } }) }
];

/** Debug overlay, always available: Ctrl+Alt+D toggles it, Escape closes it. */
export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const stage = useGame((s) => s.model.progress.stage);
  const coins = useGame((s) => s.model.coins);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  if (!open) return null;
  const run = (label: string, fn: (m: Model) => Model) => {
    updateModel(fn);
    toast({ en: `Debug: ${label}`, tone: "info" });
  };
  return (
    <div className="debug-panel ui panel" role="dialog" aria-label="Debug" data-testid="debug-panel">
      <header>
        <b>Debug</b>
        <span>
          Level {stage} · {coins} coins
        </span>
        <button className="round" onClick={() => setOpen(false)} aria-label="Close debug">
          ×
        </button>
      </header>
      <div className="debug-levels" role="group" aria-label="Jump to level">
        {STAGES.map((s) => (
          <button key={s} className={s === stage ? "on" : ""} onClick={() => run(`Level ${s}`, (m) => toStage(m, s))}>
            {s}
          </button>
        ))}
      </div>
      {ACTIONS.map((a) => (
        <button key={a.label} className="debug-action" onClick={() => run(a.label, a.run)}>
          {a.label}
        </button>
      ))}
      <small>Ctrl+Alt+D to close</small>
    </div>
  );
}
