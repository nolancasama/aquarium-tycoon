import { useEffect, useState } from "react";
import { setGame, useGame } from "../game/store";
import { goals, happiness, tankById, type Goal } from "../game/logic/model";
import { TANKS } from "../game/data/tanks";
import {
  cancelPlacing,
  cleanTank,
  confirmTank,
  feedTank,
  openDecorShop,
  openDecorate,
  openFishShop,
  openTankShop,
  takeBaggedFish,
  takeBoxedTank,
  tapBack
} from "../game/flow/actions";
import { openRequest } from "../game/flow/visitors";
import { Icon, type IconId } from "./icons";
import { PicoFace, PersonFace } from "./Portraits";
import { Ja } from "./Talk";
import { STAGE_NAMES, UI, goalText } from "./i18n";

function Big({
  id,
  icon,
  label,
  ja,
  onClick,
  locked,
  badge
}: {
  id: string;
  icon: IconId;
  label: string;
  ja?: string;
  onClick: () => void;
  locked?: boolean;
  badge?: string | number;
}) {
  const guide = useGame((s) => s.guide === id || s.nudge?.target === id);
  return (
    <button className={`big-btn ui ${locked ? "locked" : ""} ${guide ? "guide" : ""}`} onClick={onClick} data-testid={id} aria-disabled={locked}>
      <span className="big-icon">
        <Icon id={icon} size={40} />
        {locked && (
          <span className="lock">
            <Icon id="lock" size={18} />
          </span>
        )}
        {badge !== undefined && <span className="badge">{badge}</span>}
      </span>
      <span className="big-label">
        {label}
        <Ja>{ja}</Ja>
      </span>
    </button>
  );
}

function Coins() {
  const coins = useGame((s) => s.model.coins);
  const pop = useGame((s) => s.coinPop);
  const [shown, setShown] = useState<{ id: number; n: number } | null>(null);
  useEffect(() => {
    if (!pop) return;
    setShown(pop);
    const t = window.setTimeout(() => setShown(null), 1200);
    return () => window.clearTimeout(t);
  }, [pop]);
  return (
    <div className={`chip coins ${shown ? "pop" : ""}`} data-testid="coins" data-value={coins}>
      <Icon id="coin" size={34} />
      <b>{coins}</b>
      {shown && (
        <span className="plus" key={shown.id}>
          +{shown.n}
        </span>
      )}
    </div>
  );
}

function GoalRow({ g }: { g: Goal }) {
  const t = goalText(g);
  return (
    <li className={g.done ? "done" : ""} data-testid={`goal-${g.id}`} data-done={g.done}>
      <span className="tick">{g.done ? <Icon id="check" size={18} /> : null}</span>
      <span className="g-text">
        {t.en}
        {g.of ? (
          <b className="count">
            {" "}
            {g.n}/{g.of}
          </b>
        ) : null}
        <Ja>{t.ja}</Ja>
      </span>
    </li>
  );
}

function GoalCard() {
  const model = useGame((s) => s.model);
  const request = useGame((s) => s.request);
  if (request) return null;
  const p = model.progress;
  const list = goals(model);
  const name = STAGE_NAMES[p.stage];
  return (
    <div className="panel goals ui" data-testid="goals">
      <header>
        {p.star ? (
          <>
            <Icon id="star" size={22} /> Free play <Ja>じゆうに あそぼう</Ja>
          </>
        ) : (
          <>
            <span className="lv">Lv {p.stage}</span> {name.en} <Ja>{name.ja}</Ja>
          </>
        )}
      </header>
      {list.length > 0 && <ul>{list.map((g) => <GoalRow key={g.id} g={g} />)}</ul>}
    </div>
  );
}

function TopBar() {
  const stage = useGame((s) => s.model.progress.stage);
  const star = useGame((s) => s.model.progress.star);
  const hearts = useGame((s) => s.model.progress.hearts);
  return (
    <div className="topbar">
      <div className="top-left">
        <Coins />
        <div className="chip level" data-testid="level">
          {star ? <Icon id="star" size={24} /> : <span className="lv">Lv</span>}
          <b>{stage}</b>
        </div>
        <div className="chip hearts" data-testid="hearts" data-value={hearts}>
          <Icon id="heart" size={26} />
          <b>{hearts}</b>
        </div>
      </div>
      <GoalCard />
      <button className="round settings-btn ui" onClick={() => setGame({ settingsOpen: true })} aria-label="Settings" data-testid="btn-settings">
        <Icon id="gear" size={30} />
      </button>
    </div>
  );
}

function RoomBar() {
  const stage = useGame((s) => s.model.progress.stage);
  const bag = useGame((s) => s.model.inv.fish.length);
  const box = useGame((s) => s.model.inv.tanks.length);
  const waiting = useGame((s) => s.waiting);
  return (
    <div className="bottombar room-bar">
      <div className="chips-left">
        {bag > 0 && (
          <button className="chip-btn ui" onClick={() => takeBaggedFish()} data-testid="chip-bag">
            <Icon id="bag" size={40} />
            <span className="badge">{bag}</span>
          </button>
        )}
        {box > 0 && (
          <button className="chip-btn ui" onClick={() => takeBoxedTank()} data-testid="chip-box">
            <Icon id="box" size={40} />
          </button>
        )}
      </div>
      <div className="bar-main">
        <Big id="btn-fish-shop" icon="fish" label="Fish" ja="さかな" onClick={openFishShop} />
        <Big id="btn-decor-shop" icon="decor" label="Decor" ja="かざり" onClick={openDecorShop} locked={stage < 2} />
        <Big id="btn-tank-shop" icon="tank" label="Tank" ja="タンク" onClick={openTankShop} locked={stage < 4} />
      </div>
      <div className="chips-right">
        {waiting && (
          <WaitingChip id={waiting.id} type={waiting.type} />
        )}
      </div>
    </div>
  );
}

function WaitingChip({ id, type }: { id: string; type: "child" | "adult" | "fan" | "judge" }) {
  const guide = useGame((s) => s.nudge?.target === "chip-visitor");
  return (
    <button className={`chip-btn visitor ui ${guide ? "guide" : ""}`} onClick={() => void openRequest(id)} data-testid="chip-visitor">
      <PersonFace type={type} size={48} />
      <span className="excl">!</span>
    </button>
  );
}

function Bar({ value, icon, id }: { value: number; icon: IconId; id: string }) {
  const v = Math.round(value);
  const tone = v >= 70 ? "good" : v >= 40 ? "ok" : "low";
  return (
    <div className={`bar ${tone}`} data-testid={id} data-value={v}>
      <Icon id={icon} size={30} />
      <div className="track">
        <div className="fill" style={{ width: `${Math.max(4, v)}%` }} />
      </div>
    </div>
  );
}

function TankStatus() {
  const tank = useGame((s) => (s.tankId ? tankById(s.model, s.tankId) : null));
  if (!tank) return null;
  const def = TANKS[tank.type];
  const h = happiness(tank);
  return (
    <div className="panel tank-status ui" data-testid="status">
      <header>
        {tank.type === "big" ? "Big tank" : "Small tank"}
        <span className="fishcount" data-testid="fish-count">
          <Icon id="fish" size={22} /> {tank.fish.length}/{def.capacity}
        </span>
      </header>
      <Bar value={tank.fish.length ? tank.food : 100} icon="food" id="bar-food" />
      <Bar value={tank.clean} icon="sponge" id="bar-clean" />
      <Bar value={h ?? 0} icon="happy" id="bar-happy" />
    </div>
  );
}

function TankBar() {
  const stage = useGame((s) => s.model.progress.stage);
  const step = useGame((s) => s.model.progress.tutorial);
  const tutorial = step !== "done";
  return (
    <div className="bottombar tank-bar">
      <div className="chips-left">
        {(!tutorial || step === "visitor") && <Big id="btn-back" icon="back" label="Back" ja="もどる" onClick={tapBack} />}
      </div>
      <div className="bar-main">
        {(!tutorial || step === "feed") && <Big id="btn-feed" icon="food" label="" ja="えさ" onClick={() => void feedTank()} />}
        {!tutorial && <Big id="btn-clean" icon="sponge" label="" ja="そうじ" onClick={() => void cleanTank()} />}
        {!tutorial && <Big id="btn-decorate" icon="decor" label="" ja="かざる" onClick={openDecorate} locked={stage < 2} />}
      </div>
      <div className="chips-right" />
    </div>
  );
}

function PlacingBanner() {
  const placing = useGame((s) => s.placing);
  const step = useGame((s) => s.model.progress.tutorial);
  const view = useGame((s) => s.view);
  if (!placing || view !== "room") return null;
  if (placing.kind === "fish") {
    return (
      <div className="panel placing ui" data-testid="placing">
        <Icon id="bag" size={40} />
        <span>
          {UI.tapTank.en}
          <Ja>{UI.tapTank.ja}</Ja>
        </span>
        {step === "done" && (
          <button className="secondary" onClick={() => cancelPlacing()} data-testid="btn-cancel-place">
            {UI.later.en}
          </button>
        )}
      </div>
    );
  }
  if (placing.kind === "tank") {
    return (
      <div className="panel placing ui" data-testid="placing">
        <Icon id="box" size={40} />
        <span>
          {UI.placeTank.en}
          <Ja>{UI.placeTank.ja}</Ja>
        </span>
        <button className="primary" disabled={!placing.slot} onClick={() => confirmTank()} data-testid="btn-confirm-tank" aria-label="Place">
          <Icon id="check" size={26} />
        </button>
        <button className="secondary" onClick={() => cancelPlacing()} data-testid="btn-cancel-tank" aria-label="Cancel">
          <Icon id="close" size={22} />
        </button>
      </div>
    );
  }
  return null;
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} data-testid="toast">
          {t.en}
          <Ja>{t.ja}</Ja>
        </div>
      ))}
    </div>
  );
}

function NudgeBubble() {
  const n = useGame((s) => s.nudge);
  if (!n) return null;
  return (
    <div className="nudge ui" key={n.id} data-testid="nudge" onClick={() => setGame({ nudge: null })}>
      <PicoFace size={58} />
      <div className="nudge-text">
        {n.en}
        <Ja>{n.ja}</Ja>
      </div>
    </div>
  );
}

export function Hud() {
  const screen = useGame((s) => s.screen);
  const view = useGame((s) => s.view);
  const mode = useGame((s) => s.mode);
  const panel = useGame((s) => s.panel);
  const placing = useGame((s) => s.placing);
  const prompt = useGame((s) => s.prompt);
  const line = useGame((s) => s.line);
  const step = useGame((s) => s.model.progress.tutorial);
  const shot = useGame((s) => s.stageCard);
  if (screen !== "game") return null;
  const free = mode === "play" && !prompt && !line && !shot;
  const showRoomBar = free && view === "room" && !panel && !placing && step === "done";
  const showTankBar = free && view === "tank" && panel !== "decorate";
  return (
    <>
      <TopBar />
      {view === "tank" && <TankStatus />}
      {showRoomBar && <RoomBar />}
      {showTankBar && <TankBar />}
      {free && <PlacingBanner />}
      <Toasts />
      {!prompt && !line && <NudgeBubble />}
    </>
  );
}
