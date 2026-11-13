import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getGame, nudge, setGame, toast, useGame } from "../game/store";
import { nextStep, objectivesUnlocked } from "../game/logic/guide";
import { showGuideHint } from "../game/flow/story";
import { canLive, goals, happiness, hasSpace, padsFor, remodelPlan, tankById, usedSpace, type Goal } from "../game/logic/model";
import { HALL_OF, TANKS } from "../game/data/tanks";
import { AREA_LINKS, COAST_HALL, HUB_HALL, inHallRow, LAGOON_HALL, roomIndex, ROOMS, roomOpen, SANCTUARY_HALL, SHARKS_HALL } from "../game/data/rooms";
import type { RoomId } from "../game/types";
import { LagoonGoals, LagoonHud, lagoonHelp } from "./LagoonHud";
import { SanctuaryGoals, SanctuaryHud, sanctuaryHelp } from "./SanctuaryHud";
import { CoastCelebration, CoastGoals, CoastHud, CoastOffer, NEED_TEXT } from "./CoastHud";
import { needMet } from "../game/logic/coast";
import { AquariumMap, MapButton, TrophyCard } from "./AquariumMap";
import { arrowState, arrowTravel, watchHubIntro } from "../game/flow/hub";
import { ExploreHud, TunnelGoals, WingHud } from "./TunnelHud";
import { tunnelHelp } from "../game/tunnel/activities";
import type { VisitorType } from "../game/types";
import {
  cancelPlacing,
  cleanTank,
  confirmTank,
  feedTank,
  openAnimalShop,
  openDecorShop,
  openDecorate,
  openFishShop,
  openTankShop,
  openUpgrades,
  openLights,
  switchHall,
  takeBaggedFish,
  takeBoxedTank,
  tapBack
} from "../game/flow/actions";
import { openRequest } from "../game/flow/visitors";
import { tankStatusEl } from "../scene/CameraRig";
import { Icon, type IconId } from "./icons";
import { PicoFace, PersonFace } from "./Portraits";
import { Ja } from "./Talk";
import { ActionTag } from "./ActionTag";
import { playHintAudio } from "./hintAudio";
import { TapHand } from "./TapHand";
import { RushAwardsButton, RushHour, RushObjective, RushReturn, useRushSlot } from "./RushHour";
import { STAGE_NAMES, STAGE_PREVIEWS, UI, goalText } from "./i18n";

export function Big({
  id,
  icon,
  label,
  ja,
  onClick,
  locked,
  badge,
  reason
}: {
  id: string;
  icon: IconId;
  label: string;
  ja?: string;
  onClick: () => void;
  locked?: boolean;
  badge?: string | number;
  reason?: string;
}) {
  const guide = useGame((s) => s.guide === id || s.nudge?.target === id);
  return (
    <button className={`big-btn ui ${locked ? "locked" : ""} ${guide ? "guide" : ""}`} onClick={onClick} data-testid={id} aria-disabled={locked} title={reason}>
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
        {reason && <small className="button-reason">{reason}</small>}
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

/** The upper-left objective slot: Rush Hour takes it over while an event runs,
 * the goals return afterwards (and can be peeked at during the event). */
function GoalCard() {
  const slot = useRushSlot();
  const [peek, setPeek] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setPeek(false), [slot]);
  if (slot && !peek) return <RushObjective slot={slot} onGoals={slot === "pending" ? undefined : () => setPeek(true)} />;
  return <GoalsPanel expanded={expanded} setExpanded={setExpanded} rushBack={slot ? <RushReturn onBack={() => setPeek(false)} /> : null} />;
}

function GoalsPanel({ expanded, setExpanded, rushBack }: { expanded: boolean; setExpanded: (fn: (open: boolean) => boolean) => void; rushBack: ReactNode }) {
  const model = useGame((s) => s.model);
  const inWing = useGame((s) => s.screen === "game" && (s.hall === SHARKS_HALL || s.exploring));
  const inCoast = useGame((s) => s.screen === "game" && s.hall === COAST_HALL);
  const outdoor = useGame((s) => (s.screen !== "game" ? null : s.hall === LAGOON_HALL ? "lagoon" : s.hall === SANCTUARY_HALL ? "sanctuary" : null));
  const request = useGame((s) => s.request);
  const interrupted = useGame((s) => Boolean(s.prompt || s.line || s.stageCard));
  const waiting = useGame((s) => Boolean(s.waiting));
  const unlocked = objectivesUnlocked(model.progress.tutorial);
  const wasUnlocked = useRef(unlocked);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    const firstReveal = unlocked && !wasUnlocked.current;
    wasUnlocked.current = unlocked;
    if (!firstReveal) return;
    setRevealing(true);
    const timer = window.setTimeout(() => setRevealing(false), 250);
    return () => window.clearTimeout(timer);
  }, [unlocked]);
  const step = useMemo(() => nextStep(model), [model]);
  // Start each level compact and clear an expanded list for scripted interactions.
  useEffect(() => setExpanded(() => false), [model.progress.stage, interrupted, Boolean(request)]);
  if (inWing && !request) return <TunnelGoals before={rushBack} />;
  if (inCoast && !request) return <CoastGoals before={rushBack} />;
  if (outdoor === "lagoon") return <LagoonGoals before={rushBack} />;
  if (outdoor === "sanctuary") return <SanctuaryGoals before={rushBack} />;
  // The tutorial's "Tap the visitor!" card takes this place; in free play the objectives stay.
  if (!unlocked || request || (waiting && !interrupted && model.progress.tutorial !== "done")) return null;
  const p = model.progress;
  const list = goals(model);
  const name = STAGE_NAMES[p.stage];
  return (
    <div className={`panel goals ui ${expanded ? "expanded" : ""} ${revealing ? "goals-reveal" : ""}`} data-testid="goals">
      {rushBack}
      <header>
        {p.star && list.length === 0 ? (
          <>
            <Icon id="star" size={22} /> Free play <Ja>じゆうに あそぼう</Ja>
          </>
        ) : (
          <>
            <span className="lv">Lv {p.stage}</span> {name.en} <Ja>{name.ja}</Ja>
          </>
        )}
      </header>
      {step && (
        <div className="guide-next" data-testid="guide-next" aria-live="polite">
          <b>Next: {step.title.en}</b> <Ja>{step.title.ja}</Ja>
        </div>
      )}
      {list.length > 0 && <>
        <button className="objectives-toggle" data-testid="btn-objectives" aria-expanded={expanded} aria-controls="objective-details" onClick={() => setExpanded((open) => !open)} onKeyDown={(e) => { if (e.code === "Space") e.stopPropagation(); }}>
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span> Objectives <Ja>もくひょう</Ja>
        </button>
        {expanded && <div id="objective-details" className="objective-details" role="region" aria-label="Current objectives" tabIndex={0} onKeyDown={(e) => { if (["Space", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.code)) e.stopPropagation(); }}>
          <ul>{list.map((g) => <GoalRow key={g.id} g={g} />)}</ul>
          {step && <p className="objective-guidance">{step.where.en}<Ja>{step.where.ja}</Ja></p>}
        </div>}
      </>}
    </div>
  );
}

/** Help sits beside Settings, clear of the goal card and the close-up's care card. */
function HelpButton() {
  const canHelp = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.request && !s.stageCard && !s.settingsOpen);
  // A request card carries its own hints and needs this corner on narrow screens.
  const request = useGame((s) => Boolean(s.request));
  if (request) return null;
  return (
    <button className="chip help-btn ui" onClick={() => {
      const hall = getGame().hall;
      if (hall === COAST_HALL) coastHelp();
      else if (hall === HUB_HALL) hubHelp();
      else if (hall === LAGOON_HALL) lagoonHelp();
      else if (hall === SANCTUARY_HALL) sanctuaryHelp();
      else if (getGame().exploring || hall === SHARKS_HALL) tunnelHelp();
      else showGuideHint();
    }} disabled={!canHelp} data-testid="btn-help">
      <b aria-hidden="true">?</b> <span className="help-label">Help <small lang="ja">ヒント</small></span>
    </button>
  );
}

function TopBar() {
  const stage = useGame((s) => s.model.progress.stage);
  const star = useGame((s) => s.model.progress.star);
  const hearts = useGame((s) => s.model.progress.hearts);
  return (
    <div className="topbar">
      <GoalCard />
      <div className="player-status" data-testid="player-status">
        <Coins />
        <LevelOverview stage={stage} star={star} />
        <div className="chip hearts" data-testid="hearts" data-value={hearts}>
          <Icon id="heart" size={26} />
          <b>{hearts}</b>
        </div>
      </div>
      <div className="top-right">
        <MapButton />
        <RushAwardsButton />
        <HelpButton />
        <button className="round settings-btn ui" onClick={() => setGame({ settingsOpen: true })} aria-label="Settings" data-testid="btn-settings">
          <Icon id="gear" size={30} />
        </button>
      </div>
    </div>
  );
}

function LevelOverview({ stage, star }: { stage: number; star: boolean }) {
  const finished = useGame((s) => s.model.progress.superStar);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  return (
    <div className="level-wrap ui" ref={wrap}>
      <button ref={trigger} className="chip level" data-testid="level" aria-label={`Level ${stage}. Level overview`} aria-expanded={open} aria-controls="level-overview" onClick={() => setOpen(!open)}>
        {star ? <Icon id="star" size={24} /> : <span className="lv">Lv</span>}<b>{stage}</b>
      </button>
      {open && (
        <div className="panel level-overview" id="level-overview" role="dialog" aria-label="Levels 1–8" data-testid="level-overview">
          <header><b>Levels 1–8 <Ja>レベル いちらん</Ja></b>
            <button className="round close-btn" ref={close} aria-label="Close level overview" onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon id="close" size={20} /></button>
          </header>
          <ol>{Object.entries(STAGE_NAMES).map(([key, name]) => {
            const n = Number(key);
            const done = n < stage || (n === stage && finished);
            const state = done ? "Done" : n === stage ? "Current" : "Locked";
            return <li key={n} aria-current={state === "Current" ? "step" : undefined}>
              <span className="level-state"><Icon id={done ? "check" : state === "Locked" ? "lock" : "star"} size={18} />{state}<Ja>{done ? "できた" : state === "Current" ? "いま" : "これから"}</Ja></span>
              <div><b>{n}. {name.en}</b><Ja>{name.ja}</Ja><small>{STAGE_PREVIEWS[n].en}</small><Ja>{STAGE_PREVIEWS[n].ja}</Ja></div>
            </li>;
          })}</ol>
        </div>
      )}
    </div>
  );
}

/** Short English room names shown under the arrow icon on small screens. */
const SHORT_ROOM_NAMES: Partial<Record<RoomId, string>> = {
  hall: "Hall 1", ocean: "Ocean", gallery: "Jellyfish", atrium: "Reef", sharks: "Sharks",
  hub: "Hub", coast: "Coast", lagoon: "Lagoon", sanctuary: "Sanctuary"
};
const shortName = (i: number) => SHORT_ROOM_NAMES[ROOMS[i].id as RoomId] ?? ROOMS[i].name;

/** The arrows at the screen edges to the neighbouring rooms (open rooms only). */
function HallSwitch() {
  const progress = useGame((s) => s.model.progress);
  const hall = useGame((s) => s.hall);
  const model = useGame((s) => s.model);
  const placing = useGame((s) => s.placing);
  const hintTarget = useGame((s) => s.nudge?.target);
  useGame((s) => s.previewAreas.length); // re-render when a preview starts or ends (arrow locks)
  const links = AREA_LINKS[ROOMS[hall]?.id];
  const linkOf = (id: RoomId | undefined) => {
    const i = id ? roomIndex(id) : -1;
    const state = i >= 0 ? arrowState(i, model) : null;
    return state ? { hall: i, locked: state === "locked" } : null;
  };
  const prevLink = links?.prev ? linkOf(links.prev) : null;
  const nextLink = links?.next ? linkOf(links.next) : null;
  if (!inHallRow(hall) && !prevLink && !nextLink) return null;
  const prev = prevLink ? prevLink.hall : inHallRow(hall) && hall > 0 && inHallRow(hall - 1) && roomOpen(hall - 1, progress) ? hall - 1 : null;
  const next = nextLink ? nextLink.hall : inHallRow(hall) && inHallRow(hall + 1) && roomOpen(hall + 1, progress) ? hall + 1 : null;
  if (prev === null && next === null) return null;
  const go = (to: number, link: { locked: boolean } | null) => link ? arrowTravel(to) : switchHall(to);
  const lockMark = (link: { locked: boolean } | null) => link?.locked ? <Icon id="lock" size={18} /> : null;
  // Guide: the carried animal (or tank) only fits in rooms on one side.
  let targets: number[] = [];
  if (placing?.kind === "fish") {
    const f = model.inv.fish.find((x) => x.id === placing.fishId);
    targets = f ? model.tanks.filter((t) => hasSpace(t, f.species) && canLive(f.species, t)).map((t) => HALL_OF[t.slot]) : [];
  }
  if (placing?.kind === "tank") targets = padsFor(model, placing.type).map((s) => HALL_OF[s]);
  if (placing?.kind === "remodel") targets = model.tanks.filter((t) => {
    const p = remodelPlan(model, t.id, placing.type);
    return !p.reason || p.reason === "habitat" || p.reason === "full";
  }).map((t) => HALL_OF[t.slot]);
  const away = targets.length > 0 && targets.every((r) => r !== hall);
  const guideNext = (away && targets.every((r) => r > hall)) || hintTarget === "btn-hall-next";
  const guidePrev = (away && targets.every((r) => r < hall)) || hintTarget === "btn-hall-prev";
  return (
    <>
      {prev !== null && (
        <button className={`hall-arrow left ui ${guidePrev ? "guide" : ""} ${prevLink?.locked ? "locked" : ""}`} onClick={() => go(prev, prevLink)} data-testid="btn-hall-prev"
          data-locked={prevLink?.locked ? "true" : undefined} aria-label={`${ROOMS[prev].name}${prevLink?.locked ? " (coming soon)" : ""}`}>
          <b>◀</b>
          <i className="short" aria-hidden="true">{shortName(prev)}</i>
          <span>
            {lockMark(prevLink)}{ROOMS[prev].name} <Ja>{prevLink?.locked ? "もうすぐ オープン" : ROOMS[prev].ja}</Ja>
          </span>
        </button>
      )}
      {next !== null && (
        <button className={`hall-arrow right ui ${guideNext ? "guide" : ""} ${nextLink?.locked ? "locked" : ""}`} onClick={() => go(next, nextLink)} data-testid="btn-hall-next"
          data-locked={nextLink?.locked ? "true" : undefined} aria-label={`${ROOMS[next].name}${nextLink?.locked ? " (coming soon)" : ""}`}>
          <span>
            {lockMark(nextLink)}{ROOMS[next].name} <Ja>{nextLink?.locked ? "もうすぐ オープン" : ROOMS[next].ja}</Ja>
          </span>
          <b>▶</b>
          <i className="short" aria-hidden="true">{shortName(next)}</i>
        </button>
      )}
    </>
  );
}

function RoomBar() {
  const tutorialBuy = useGame((s) => s.model.progress.tutorial === "buy");
  const tutorialVisitor = useGame((s) => s.model.progress.tutorial === "visitor");
  const stage = useGame((s) => s.model.progress.stage);
  const hallOpen = useGame((s) => s.model.progress.hallOpen);
  const bag = useGame((s) => s.model.inv.fish.length);
  const box = useGame((s) => s.model.inv.tanks.length);
  const waiting = useGame((s) => s.waiting);
  const hintTarget = useGame((s) => s.nudge?.target);
  return (
    <div className="bottombar room-bar">
      <div className="chips-left">
        {bag > 0 && (
          <button className={`chip-btn ui ${hintTarget === "chip-bag" ? "guide" : ""}`} onClick={() => takeBaggedFish()} data-testid="chip-bag">
            <Icon id="bag" size={40} />
            <span className="badge">{bag}</span>
          </button>
        )}
        {box > 0 && (
          <button className={`chip-btn ui ${hintTarget === "chip-box" ? "guide" : ""}`} onClick={() => takeBoxedTank()} data-testid="chip-box">
            <Icon id="box" size={40} />
          </button>
        )}
      </div>
      <div className="bar-main">
        {!tutorialVisitor && <Big id="btn-fish-shop" icon="fish" label="Fish" ja="さかな" onClick={openFishShop} />}
        {!tutorialBuy && !tutorialVisitor && stage >= 6 && <Big id="btn-animal-shop" icon="turtle" label="Animals" ja="いきもの" onClick={() => {
          if (!hallOpen) toast({ en: "Open Ocean Hall first", ja: "さきに うみの ホールを ひらこう", tone: "info" }, 5000);
          else openAnimalShop();
        }} locked={!hallOpen} reason={!hallOpen ? "Open Ocean Hall first" : undefined} />}
        {!tutorialBuy && !tutorialVisitor && <Big id="btn-decor-shop" icon="decor" label="Decor" ja="かざり" onClick={openDecorShop} locked={stage < 2} />}
        {!tutorialBuy && !tutorialVisitor && <Big id="btn-tank-shop" icon="tank" label="Tank" ja="タンク" onClick={openTankShop} locked={stage < 4} />}
      </div>
      <div className="chips-right">
        {waiting && (
          <WaitingChip id={waiting.id} type={waiting.type} />
        )}
      </div>
    </div>
  );
}

function WaitingChip({ id, type }: { id: string; type: VisitorType }) {
  const guide = useGame((s) => s.guide === "chip-visitor" || s.nudge?.target === "chip-visitor");
  return (
    <button className={`chip-btn visitor ui ${guide ? "guide" : ""}`} onClick={() => void openRequest(id)} data-testid="chip-visitor">
      <PersonFace type={type} size={48} />
      <span className="excl">!</span>
    </button>
  );
}

function Bar({ value, icon, id, pulse = 0 }: { value: number; icon: IconId; id: string; pulse?: number }) {
  const v = Math.round(value);
  const tone = v >= 70 ? "good" : v >= 40 ? "ok" : "low";
  return (
    <div className={`bar ${tone} ${pulse ? "rise" : ""}`} data-testid={id} data-value={v} key={pulse}>
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
  return <TankStatusPanel key={tank.id} name={def.name} animals={tank.fish.length} spaces={usedSpace(tank)} capacity={def.capacity} food={tank.fish.length ? tank.food : 100} clean={tank.clean} happy={h} />;
}

/** The close-up card; the happiness bar pulses when the value rises (not on opening). */
function TankStatusPanel({ name, animals, spaces, capacity, food, clean, happy }: { name: string; animals: number; spaces: number; capacity: number; food: number; clean: number; happy: number | null }) {
  const prev = useRef(happy);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (happy !== null && prev.current !== null && happy > prev.current) setPulse((n) => n + 1);
    prev.current = happy;
  }, [happy]);
  return (
    <div className="panel tank-status ui" data-testid="status" ref={(el) => void (tankStatusEl.current = el)}>
      <header>
        <span>{name}</span>
        <span className="fishcount" data-testid="fish-count" aria-label={`${spaces} of ${capacity} tank spaces used`}>
          <Icon id="fish" size={20} /> {spaces}/{capacity}
        </span>
      </header>
      {spaces !== animals && (
        <small className="capacity-detail" lang="ja">
          エイと さかなの むれは 2つぶん つかうよ
        </small>
      )}
      <Bar value={food} icon="food" id="bar-food" />
      <Bar value={clean} icon="sponge" id="bar-clean" />
      <Bar value={happy ?? 0} icon="happy" id="bar-happy" pulse={pulse} />
    </div>
  );
}

function TankBar() {
  const waiting = useGame((s) => s.waiting);
  const stage = useGame((s) => s.model.progress.stage);
  const lights = useGame((s) => {
    const tank = s.tankId ? tankById(s.model, s.tankId) : null;
    return Boolean(tank && TANKS[tank.type].lights);
  });
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
        {stage >= 8 && <Big id="btn-upgrade" icon="up" label="" ja="アップ" onClick={openUpgrades} />}
        {stage >= 8 && lights && <Big id="btn-lights" icon="lamp" label="Lights" ja="ライト" onClick={() => void openLights()} />}
      </div>
      <div className="chips-right">{waiting && <WaitingChip id={waiting.id} type={waiting.type} />}</div>
    </div>
  );
}

function PlacingBanner() {
  const placing = useGame((s) => s.placing);
  const step = useGame((s) => s.model.progress.tutorial);
  const view = useGame((s) => s.view);
  const panel = useGame((s) => s.panel);
  if (!placing || view !== "room") return null;
  if (placing.kind === "remodel") {
    if (panel === "remodel") return null;
    return <div className="panel placing ui" data-testid="placing">
      <Icon id="tank" size={40} />
      <span>Tap a tank to remodel!<Ja>かえる タンクを タップしよう!</Ja></span>
      <button className="secondary" onClick={cancelPlacing} data-testid="btn-cancel-remodel">Cancel<Ja>やめる</Ja></button>
    </div>;
  }
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
  const interrupted = useGame((s) => Boolean(s.prompt || s.line || s.stageCard || s.settingsOpen));
  const request = useGame((s) => s.request);
  const waiting = useGame((s) => s.waiting);
  const placingFish = useGame((s) => s.placing?.kind === "fish" && s.view === "room");
  const decorating = useGame((s) => s.panel === "decorate");
  if (!n || interrupted || request || (waiting && n.target === "chip-visitor")) return null;
  // The placing banner and the decoration tray already say this; one instruction at a time.
  if ((placingFish && n.target?.startsWith("tank-")) || (decorating && (n.target === "tray" || n.target === "decor-rings"))) return null;
  return (
    <div className={`nudge ui ${n.repeated ? "repeated" : ""}`} key={n.id} data-testid="nudge" data-tier={n.tier} role="status">
      <button className="nudge-listen" type="button" aria-label={`Hear hint: ${n.en}`} onClick={() => playHintAudio(n.en)}>
        <PicoFace size={58} />
        <span className="nudge-text">
          <ActionTag kind={n.kind ?? (n.target ? "tap" : "look")} en={n.en} ja={n.ja} />
        </span>
        <Icon id="speaker" size={24} />
      </button>
      <button className="nudge-dismiss" type="button" aria-label="Dismiss hint" data-testid="nudge-dismiss" onClick={() => setGame({ nudge: null })}>×</button>
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
  const hall = useGame((s) => s.hall);
  const exploring = useGame((s) => s.exploring);
  if (screen !== "game") return null;
  const free = mode === "play" && !prompt && !line && !shot;
  const wing = hall === SHARKS_HALL;
  const hub = hall === HUB_HALL;
  const coast = hall === COAST_HALL;
  const lagoon = hall === LAGOON_HALL;
  const sanctuary = hall === SANCTUARY_HALL;
  const showRoomBar = free && view === "room" && !panel && !placing && (step === "done" || step === "buy" || step === "visitor");
  const showTankBar = free && view === "tank" && panel !== "decorate";
  return (
    <>
      <TopBar />
      {view === "tank" && <TankStatus />}
      {showRoomBar && !wing && !hub && !coast && !lagoon && !sanctuary && !exploring && <RoomBar />}
      {view === "room" && coast && <CoastHud />}
      {lagoon && <LagoonHud />}
      {sanctuary && <SanctuaryHud />}
      {free && view === "room" && !exploring && <HallSwitch />}
      {free && hub && <HubBar />}
      {view === "room" && wing && !exploring && <WingHud />}
      {exploring && <ExploreHud />}
      {showTankBar && <TankBar />}
      {free && <PlacingBanner />}
      <Toasts />
      {!prompt && !line && <NudgeBubble />}
      <TapHand />
      <RushHour />
      <AquariumMap />
      <CoastOffer />
      <CoastCelebration />
      <TrophyCard />
      <HubIntro />
      <PreviewBadge />
    </>
  );
}

function HubIntro() {
  useEffect(() => watchHubIntro(), []);
  return null;
}

/** A development preview is running: nothing is being saved (flow/preview.ts). */
function PreviewBadge() {
  const areas = useGame((s) => s.previewAreas);
  if (!areas.length) return null;
  return (
    <div className="preview-badge ui" data-testid="preview-badge" role="status">
      PREVIEW · not saved <small>({areas.join(", ")}) · Ctrl+Alt+D</small>
    </div>
  );
}

/** In the hub: one short instruction, tappable to hear it. */
function HubBar() {
  const hasNudge = useGame((s) => Boolean(s.nudge));
  if (hasNudge) return null;
  return (
    <div className="bottombar hub-bar">
      <button className="panel hub-hint ui" data-testid="hub-hint" onClick={() => playHintAudio("Tap a door!")}>
        <Icon id="hand" size={30} /> Tap a door! <Ja>いきたい ドアを タップしよう</Ja> <Icon id="speaker" size={20} />
      </button>
    </div>
  );
}

function coastHelp() {
  const g = getGame();
  const t = g.coastView === "all" ? null : g.model.tanks.find((x) => x.type === g.coastView);
  if (t && !needMet(t) && t.fish.length) nudge({ en: NEED_TEXT[g.coastView as "penguins"].en, ja: NEED_TEXT[g.coastView as "penguins"].ja, kind: "tap", target: "btn-coast-items" });
  else if (g.coastView === "all") nudge({ en: "Tap a habitat!", ja: "すみかを タップしよう", kind: "tap" });
  else nudge({ en: "Watch the animals! Help visitors with !", ja: "どうぶつを みよう！ 「!」の おきゃくさんを たすけよう", kind: "look" });
}

function hubHelp() {
  nudge({ en: "Tap a door to go there!", ja: "いきたい ばしょの ドアを タップしよう。マップ からも いけるよ", kind: "tap", target: "btn-map" });
}
