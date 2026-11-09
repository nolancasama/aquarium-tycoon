import { useEffect, useState } from "react";
import { toast, updateModel, useGame } from "../game/store";
import { openAtrium, openGallery, openHall, type Model } from "../game/logic/model";
import type { StageId } from "../game/types";
import { debugStartRush } from "../game/rush/flow";
import { openSharkTunnel } from "../game/logic/tunnel";
import { checkCoastMilestones, openCoast, recordCoastActivity, recordCoastSight } from "../game/logic/coast";
import { coastSlotFits } from "../game/data/coast";
import type { CoastDecorKind } from "../game/types";
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

/** Open every room in order, including the Atrium's permanent reef. */
const openAll = (m: Model) => openFree(openFree(openFree(m.progress.stage < 8 ? toStage(m, 8) : m, openHall), openGallery), openAtrium);

function unlockAll(m: Model): Model {
  const o = openAll(toStage(m, 8));
  return { ...o, progress: { ...o.progress, tickets: true } };
}

const ACTIONS: { label: string; run: (m: Model) => Model }[] = [
  { label: "Unlock everything (Level 8 + all halls)", run: unlockAll },
  { label: "Open all halls", run: openAll },
  { label: "+1000 coins", run: (m) => ({ ...m, coins: m.coins + 1000 }) },
  { label: "Finish tutorial", run: (m) => ({ ...m, progress: { ...m.progress, tutorial: "done" } }) },
  { label: "All tanks fed and clean", run: (m) => ({ ...m, tanks: m.tanks.map((t) => ({ ...t, food: 100, clean: 100 })) }) },
  { label: "Give the crown (finish Level 8)", run: (m) => ({ ...m, progress: { ...m.progress, superStar: true } }) },
  { label: "Open Grand Aquarium Hub (opens the Shark Tunnel)", run: openHub },
  { label: "Unlock Coastal & Polar Zone (tunnel trophy + zone)", run: (m) => coastTo(m, 1) },
  { label: "Open all coastal habitats", run: (m) => coastTo(m, 3) }
];

/** The Shark Tunnel finished (trophy) and the coast opened through its real rule, then milestones up to `n` with their real rewards. */
export function coastTo(m: Model, n: number): Model {
  let o = openHub(m);
  const t = o.progress.tunnel!;
  o = { ...o, progress: { ...o.progress, tunnel: { ...t, milestone: 5, findDone: true, whereDone: true, countDone: true, trophy: true } } };
  if (!o.progress.coastOpen) {
    const r = openCoast({ ...o, coins: 1e9 });
    if (r.ok) o = { ...r.m, coins: o.coins };
  }
  // Each step satisfies the next milestone's conditions the way a player would (items, sights, activities).
  const need: Record<number, (x: Model) => Model> = {
    2: (x) => withItem(recordCoastActivity(recordCoastActivity(recordCoastSight(x, "penguinSwim"), "penguins"), "penguins"), "M", "penguinRock", 0),
    3: (x) => withItem(recordCoastActivity(recordCoastActivity(recordCoastSight(x, "sealDive"), "seals"), "seals"), "N", "sealRock", 0),
    4: (x) => withItem(recordCoastActivity(recordCoastSight(x, "otterFloat"), "otters"), "O", "otterToy", 0),
    5: (x) => {
      const y = withItem(x, "O", "otterKelp", 1);
      const fed = { ...y, tanks: y.tanks.map((tk) => ({ ...tk, food: 100, clean: 100 })) };
      return (["penguins", "seals", "otters"] as const).reduce((acc, h) => recordCoastActivity(acc, h), fed);
    }
  };
  for (let k = (o.progress.coast?.milestone ?? 0) + 1; k <= n; k++) o = checkCoastMilestones(need[k]?.(o) ?? o).m;
  return o;
}

function withItem(m: Model, slot: "M" | "N" | "O", kind: CoastDecorKind, at: number): Model {
  const t = m.tanks.find((x) => x.slot === slot);
  if (!t || t.decor.some((d) => d.kind === kind)) return m;
  const free = [at, 0, 1, 2, 3, 4, 5].find((i) => !t.decor.some((d) => d.slot === i) && coastSlotFits(t.type, i, kind));
  if (free === undefined) return m;
  return { ...m, nextId: m.nextId + 1, tanks: m.tanks.map((x) => x.id === t.id ? { ...x, decor: [...x.decor, { id: `d${m.nextId}`, kind, variant: null, slot: free }] } : x) };
}

/** Everything the hub needs, through the real rules: all halls, free play, the Shark Tunnel (free). */
export function openHub(m: Model): Model {
  let o = unlockAll(m);
  o = { ...o, progress: { ...o.progress, freePlay: true, tutorial: "done" } };
  if (!o.progress.tunnelOpen) {
    const r = openSharkTunnel({ ...o, coins: 1e9, tanks: o.tanks.map((t) => t.slot === "I" && t.fish.length < 4 ? { ...t, fish: [...t.fish, ...[1, 2, 3, 4].map((k) => ({ id: `dbg-reef-${k}`, species: "clownfish" as const }))].slice(0, Math.max(4, t.fish.length)) } : t) });
    if (r.ok) o = { ...r.m, coins: o.coins };
  }
  return o;
}

/** Debug overlay, always available: Ctrl+Alt+D toggles it, Ctrl+Alt+U unlocks everything and Ctrl+Alt+M adds 1000 coins directly, Escape closes it. */
export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const stage = useGame((s) => s.model.progress.stage);
  const coins = useGame((s) => s.model.coins);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // e.code, not e.key: Ctrl+Alt is AltGr on some layouts and changes the typed character.
      if (e.ctrlKey && e.altKey && e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      } else if (e.ctrlKey && e.altKey && e.code === "KeyU") {
        e.preventDefault();
        e.stopPropagation();
        updateModel(unlockAll);
        toast({ en: "Debug: everything unlocked", tone: "info" });
      } else if (e.ctrlKey && e.altKey && e.code === "KeyM") {
        e.preventDefault();
        e.stopPropagation();
        updateModel((m) => ({ ...m, coins: m.coins + 1000 }));
        toast({ en: "Debug: +1000 coins", tone: "info" });
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
      <div className="debug-levels" role="group" aria-label="Coastal milestone">
        <span>Coast</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => run(`Coastal milestone ${n}`, (m) => coastTo(m, n))} data-testid={`debug-coast-${n}`}>{n}</button>
        ))}
      </div>
      <button className="debug-action" data-testid="debug-rush-start" onClick={() => {
        if (debugStartRush()) {
          setOpen(false);
          toast({ en: "Debug: Rush Hour preparation started", tone: "info" });
        } else {
          toast({ en: "Rush Hour needs Free Play, Ocean Hall, an occupied tank, and no other active event or dialogue.", tone: "warn" });
        }
      }}>Start Rush Hour now</button>
      <small>Ctrl+Alt+D to close · Ctrl+Alt+U unlock all · Ctrl+Alt+M +1000 coins</small>
    </div>
  );
}
