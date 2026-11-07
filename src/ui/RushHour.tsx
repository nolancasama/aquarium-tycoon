import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useGame } from "../game/store";
import { ROOMS } from "../game/data/rooms";
import { HALL_OF, TANKS } from "../game/data/tanks";
import { onOpenRushAwards, openRushAwards } from "../game/rush/bridge";
import { BENCH_AT_GOLDS, FOUNTAIN_AT_SUCCESSES, READY_CLEAN, READY_FOOD, STATUE_AT_SUCCESSES } from "../game/rush/config";
import { continueRush, rushCalm, skipRush, startRush } from "../game/rush/flow";
import type { Medal, RushEvent, RushRewardId, RushState } from "../game/rush/types";
import { Icon } from "./icons";
import { Ja } from "./Ja";
import { visitRushTank } from "./rushNavigation";
import "./RushHour.css";

const REWARDS: Record<RushRewardId, { en: string; ja: string; condition: string; conditionJa: string }> = {
  cabinet: { en: "Trophy cabinet", ja: "トロフィーの たな", condition: "Unlock Rush Hour", conditionJa: "ラッシュアワーを はじめよう" },
  bronzeDisplay: { en: "Bronze fish display", ja: "どうの さかな", condition: "Earn a bronze medal or better", conditionJa: "どうの メダル いじょうを とろう" },
  floorPattern: { en: "Ocean floor pattern", ja: "うみの ゆか", condition: "Earn a silver medal or better", conditionJa: "ぎんの メダル いじょうを とろう" },
  goldSign: { en: "Golden shark sign", ja: "きんの サメの かんばん", condition: "Earn a gold medal", conditionJa: "きんの メダルを とろう" },
  bubbleFountain: { en: "Bubble fountain", ja: "あわの ふんすい", condition: `Earn medals in ${FOUNTAIN_AT_SUCCESSES} events`, conditionJa: `${FOUNTAIN_AT_SUCCESSES}かい メダルを とろう` },
  bench: { en: "Celebration bench", ja: "おいわいの ベンチ", condition: `Earn ${BENCH_AT_GOLDS} gold medals`, conditionJa: `きんの メダルを ${BENCH_AT_GOLDS}かい とろう` },
  sharkStatue: { en: "Shark statue", ja: "サメの おきもの", condition: `Earn medals in ${STATUE_AT_SUCCESSES} events`, conditionJa: `${STATUE_AT_SUCCESSES}かい メダルを とろう` }
};
const REWARD_IDS = Object.keys(REWARDS) as RushRewardId[];
const MEDAL_NAMES: Record<Medal, { en: string; ja: string }> = {
  bronze: { en: "Bronze fish", ja: "どうの さかな" },
  silver: { en: "Silver ray", ja: "ぎんの エイ" },
  gold: { en: "Gold shark", ja: "きんの サメ" }
};

/** A flat, distinct animal silhouette for each award: no additional WebGL canvas. */
export function RushMedal({ medal, small = false }: { medal: Medal; small?: boolean }) {
  return <span className={`rush-medal ${medal} ${small ? "small" : ""}`} role="img" aria-label={MEDAL_NAMES[medal].en}>
    <svg viewBox="0 0 120 136" aria-hidden="true">
      <path d="M32 2h22l6 37-22 5zM66 2h22l-6 42-22-5z" fill="#258ca5" />
      <circle cx="60" cy="79" r="49" fill="currentColor" stroke="#fff5ce" strokeWidth="5" />
      <circle cx="60" cy="79" r="40" fill="none" stroke="#fff5ce" strokeWidth="2" opacity=".6" />
      {medal === "bronze" ? <><path d="M35 79c10-20 35-22 51 0-16 22-41 20-51 0l-14-14v28z" fill="#fff9df" /><circle cx="72" cy="75" r="3" fill="#765028" /></>
        : medal === "silver" ? <><path d="M60 54C49 67 41 72 24 80c16 3 24 14 36 15 12-1 20-12 36-15-17-8-25-13-36-26zM58 92l2 24 4-24" fill="#fff9df" /><circle cx="56" cy="72" r="2" fill="#546b7f" /><circle cx="65" cy="72" r="2" fill="#546b7f" /></>
          : <><path d="M23 84c16-14 32-20 45-18l4-20 15 25 14 8-14 9-6 15-9-13-23 1-17 13 3-17-12-12z" fill="#fff9df" /><circle cx="85" cy="78" r="2.5" fill="#8a661e" /><path d="m72 76-3 9m-3-10-3 10" stroke="#aa8030" strokeWidth="2" /></>}
    </svg>
  </span>;
}

function RushDialog({ title, ja, id, close, children }: { title: string; ja: string; id: string; close?: () => void; children: ReactNode }) {
  const heading = useId();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="rush-dialog-shade ui" onPointerDown={(e) => e.stopPropagation()}>
    <section ref={panel} className="panel rush-dialog" role="dialog" aria-modal="true" aria-labelledby={heading} tabIndex={-1} data-testid={id}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" && close) { e.preventDefault(); close(); }
        if (e.key === "Tab") {
          const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
          if (!buttons?.length) return;
          const first = buttons[0]; const last = buttons[buttons.length - 1];
          if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus(); }
        }
      }}>
      <header><h2 id={heading}>{title}<Ja>{ja}</Ja></h2>{close && <button className="round" onClick={close} aria-label="Close" data-testid={`${id}-close`}><Icon id="close" size={22} /></button>}</header>
      {children}
    </section>
  </div>;
}

function MedalCounts({ rush }: { rush: RushState }) {
  return <div className="rush-medal-counts" aria-label="Lifetime medals">{(["bronze", "silver", "gold"] as const).map((medal) => <div key={medal}>
    <RushMedal medal={medal} small /><span>{MEDAL_NAMES[medal].en}<Ja>{MEDAL_NAMES[medal].ja}</Ja><b>{rush.stats[medal]}</b></span>
  </div>)}</div>;
}

function Checklist({ event, close }: { event: RushEvent; close: () => void }) {
  const tanks = useGame((s) => s.model.tanks);
  const canNavigate = useGame((s) => s.mode === "play" && !s.settingsOpen && !s.stageCard);
  return <RushDialog title="Get ready!" ja="じゅんび しよう！" id="rush-checklist" close={close}>
    <p>{event.ready.length}/{event.tankIds.length} tanks ready<Ja>タンクの じゅんび</Ja></p>
    <p className="rush-note">Tap a tank to visit. Feed and clean as usual.<Ja>タンクを タップ。いつもの ボタンで えさやりと おそうじ。</Ja></p>
    <ul className="rush-tanks">{event.tankIds.map((id, index) => {
      const tank = tanks.find((t) => t.id === id);
      const gone = !tank || !tank.fish.length;
      const ready = event.ready.includes(id);
      const food = !gone && tank.food < READY_FOOD;
      const clean = !gone && tank.clean < READY_CLEAN;
      const status = gone ? "Gone" : ready ? "Ready ✓" : food && clean ? "Needs food + cleaning" : food ? "Needs food" : clean ? "Needs cleaning" : "Getting ready…";
      const ja = gone ? "いきものが いないよ" : ready ? "じゅんび オーケー" : food && clean ? "えさと おそうじ" : food ? "えさを あげよう" : clean ? "おそうじ しよう" : "もうすぐ オーケー";
      const room = tank ? ROOMS[HALL_OF[tank.slot]] : null;
      return <li key={id}><button className={`rush-tank-row ${ready ? "ready" : ""}`} data-testid={`rush-tank-${id}`} disabled={gone || !canNavigate}
        onClick={() => {
          if (!tank) return;
          close(); visitRushTank(tank.id);
        }}>
        <span className="rush-ready-mark" key={`${id}-${ready}`} aria-hidden="true">{ready ? "✓" : gone ? "–" : "○"}</span>
        <span><b>{tank ? `${TANKS[tank.type].name} · ${tank.slot}` : `Tank ${index + 1}`}</b><small>{room?.name ?? ""}</small>{tank && <Ja>{TANKS[tank.type].ja} ・ {room?.ja}</Ja>}</span>
        <span className="rush-tank-state">{status}<Ja>{ja}</Ja></span>
      </button></li>;
    })}</ul>
  </RushDialog>;
}

function Results({ rush }: { rush: RushState }) {
  const result = rush.event?.result;
  if (!result) return null;
  return <RushDialog title="RUSH HOUR COMPLETE!" ja="ラッシュアワー おしまい！" id="rush-results">
    <div className="rush-result-award" data-testid="rush-result-medal" data-medal={result.medal ?? "none"}>
      {result.medal ? <><RushMedal medal={result.medal} /><b>{MEDAL_NAMES[result.medal].en}<Ja>{MEDAL_NAMES[result.medal].ja}</Ja></b></> : <><span className="rush-friendly-star" aria-hidden="true">☆</span><b>Keep trying!<Ja>つぎも やってみよう！</Ja></b></>}
    </div>
    <p data-testid="rush-result-ready"><b>{result.ready}/{result.eligible}</b> tanks prepared<Ja>タンクの じゅんびが できたよ</Ja></p>
    <p className="rush-bonus" data-testid="rush-result-bonus">Coin bonus: <b>+{result.bonus}</b><Ja>コインの ボーナス</Ja></p>
    <MedalCounts rush={rush} />
    {result.newRewards.length > 0 && <div className="rush-new-rewards"><b>New rewards!<Ja>あたらしい ごほうび！</Ja></b>{result.newRewards.map((id) => <p key={id}>{REWARDS[id].en}<Ja>{REWARDS[id].ja}</Ja></p>)}</div>}
    <footer className="rush-result-footer"><button className="primary rush-continue" data-testid="rush-continue" onClick={continueRush}>Continue<Ja>つづける</Ja></button></footer>
  </RushDialog>;
}

function Awards({ rush, close }: { rush: RushState; close: () => void }) {
  return <RushDialog title="RUSH HOUR AWARDS" ja="ラッシュアワーの メダル" id="rush-awards" close={close}>
    <div className="rush-best">{rush.stats.best ? <><RushMedal medal={rush.stats.best} small /><span>Best: {MEDAL_NAMES[rush.stats.best].en}<Ja>いちばんの メダル</Ja></span></> : <p>Your first medal is waiting!<Ja>はじめての メダルを めざそう！</Ja></p>}</div>
    <MedalCounts rush={rush} />
    <dl className="rush-stats"><div><dt>Total completed<Ja>おわった かいすう</Ja></dt><dd>{rush.stats.events}</dd></div><div><dt>Perfect preparations<Ja>ぜんぶ じゅんび できたよ</Ja></dt><dd>{rush.stats.gold}</dd></div><div><dt>Best tanks prepared<Ja>いちばん たくさん じゅんび</Ja></dt><dd>{rush.stats.bestReady}</dd></div></dl>
    <ul className="rush-rewards">{REWARD_IDS.map((id) => {
      const unlocked = rush.rewards.includes(id); const item = REWARDS[id];
      return <li key={id} className={unlocked ? "unlocked" : ""}><span aria-label={unlocked ? "Unlocked" : "Locked"}>{unlocked ? "✓" : "○"}</span><div><b>{item.en}</b><Ja>{item.ja}</Ja><small>{item.condition}</small><Ja>{item.conditionJa}</Ja></div></li>;
    })}</ul>
  </RushDialog>;
}

export function RushAwardsButton() {
  const unlocked = useGame((s) => Boolean(s.model.rush?.unlocked));
  const available = useGame((s) => s.mode === "play" && !s.settingsOpen && !s.stageCard && !s.line && !s.prompt);
  return unlocked ? <button className="round rush-awards-button ui" data-testid="btn-rush-awards" onClick={openRushAwards} disabled={!available} aria-label="Rush Hour awards" title="Rush Hour awards"><Icon id="star" size={25} /></button> : null;
}

const clock = (seconds: number) => {
  const whole = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

export function RushHour() {
  const rush = useGame((s) => s.model.rush);
  // Subscribe to all gate inputs used by rushCalm, including story/celebration changes.
  const game = useGame();
  const [panel, setPanel] = useState<"checklist" | "awards" | null>(null);
  const event = rush?.event;
  const previousReady = useRef({ id: event?.id, ready: event?.ready ?? [] });
  const [sparkles, setSparkles] = useState<string[]>([]);
  useEffect(() => {
    if (rush?.phase === "prep" && event) {
      const prior = previousReady.current.id === event.id ? previousReady.current.ready : [];
      const newlyReady = event.ready.filter((id) => !prior.includes(id));
      if (newlyReady.length) setSparkles(newlyReady);
    }
    previousReady.current = { id: event?.id, ready: event?.ready ?? [] };
  }, [rush?.phase, event?.id, event?.ready]);
  useEffect(() => {
    onOpenRushAwards(() => setPanel("awards"));
    return () => onOpenRushAwards(null);
  }, []);
  useEffect(() => {
    if (rush?.phase === "results" || (panel === "checklist" && rush?.phase !== "prep")) setPanel(null);
  }, [rush?.phase, panel]);
  if (!rush?.unlocked || game.screen !== "game") return null;
  const interrupted = game.settingsOpen || game.mode !== "play" || Boolean(game.prompt || game.line || game.request || game.stageCard || game.tunnelCelebration);
  const active = event && (rush.phase === "prep" || rush.phase === "rush");
  return <>
    {game.rushAnnouncement && !interrupted && <div className={`rush-announcement ${game.rushAnnouncement.kind} ui`} role="status" data-testid="rush-announcement" key={`${event?.id}-${game.rushAnnouncement.kind}`}>
      <b>{game.rushAnnouncement.kind === "prep" ? "RUSH HOUR IS COMING!" : "RUSH HOUR!"}</b>
      <Ja>{game.rushAnnouncement.kind === "prep" ? "おきゃくさんが もうすぐ くるよ！" : "おきゃくさんが いっぱい！"}</Ja>
      {game.rushAnnouncement.kind === "prep" && <p>Pico: Feed the animals and clean the tanks!<Ja>えさを あげて、タンクを きれいに しよう！</Ja></p>}
    </div>}
    {rush.phase === "pending" && rushCalm() && <aside className="panel rush-pending ui" data-testid="rush-pending" aria-label="Rush Hour soon">
      <b>Rush Hour soon!<Ja>もうすぐ ラッシュアワー！</Ja></b><div><button className="primary" data-testid="rush-start" onClick={startRush}>Start Now<Ja>はじめる</Ja></button><button className="secondary" data-testid="rush-skip" onClick={skipRush}>Skip<Ja>スキップ</Ja></button></div>
    </aside>}
    {active && !interrupted && <aside className={`panel rush-widget ui ${rush.phase}`} data-testid="rush-widget" aria-label="Rush Hour countdown">
      {sparkles.length > 0 && rush.phase === "prep" && <span className="rush-sparkles" key={sparkles.join("-")} onAnimationEnd={() => setSparkles([])} aria-hidden="true">✦ ✓ Ready! ✦</span>}
      <div className="rush-widget-title"><b>{rush.phase === "prep" ? "RUSH HOUR" : "RUSH HOUR!"}</b><time data-testid="rush-clock">{clock(event.remaining)}</time></div>
      {rush.phase === "prep" ? <><Ja>えさやりと おそうじを しよう！</Ja><progress value={event.ready.length} max={event.tankIds.length} aria-label="Tanks prepared" /><div className="rush-ready-count" data-testid="rush-ready-count"><span className="rush-ready-mark" key={`${event.id}-${event.ready.length}`} aria-hidden="true">✓</span><b>{event.ready.length}/{event.tankIds.length} tanks ready</b><span className="rush-care-icons" aria-label="Food and cleaning"><Icon id="food" size={18} /><Icon id="sponge" size={18} /></span></div><div className="rush-widget-buttons"><button className="secondary" data-testid="rush-checklist-open" onClick={() => setPanel("checklist")}>Checklist<Ja>じゅんびリスト</Ja></button><button className="rush-text-button" data-testid="rush-skip" onClick={skipRush}>Skip<Ja>スキップ</Ja></button></div></>
        : <><Ja>おきゃくさんが いっぱい！</Ja><div className="rush-preview" data-testid="rush-medal-preview">{event.result?.medal ? <><RushMedal medal={event.result.medal} small /><b>{MEDAL_NAMES[event.result.medal].en}</b></> : <b>Thanks for getting ready!<Ja>じゅんび ありがとう！</Ja></b>}</div></>}
    </aside>}
    {rush.phase === "results" && !game.settingsOpen && <Results rush={rush} />}
    {panel === "checklist" && rush.phase === "prep" && event && !interrupted && <Checklist event={event} close={() => setPanel(null)} />}
    {panel === "awards" && rush.phase !== "results" && !interrupted && <Awards rush={rush} close={() => setPanel(null)} />}
  </>;
}
