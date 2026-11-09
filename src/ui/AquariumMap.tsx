import { useEffect, useRef } from "react";
import { useGame } from "../game/store";
import { HUB_HALL, ROOMS, roomOpen, SHARKS_HALL } from "../game/data/rooms";
import { canTravel, closeMap, closeTrophies, hubUnlocked, openMap, travelTo, trophiesToRush } from "../game/flow/hub";
import { Icon, type IconId } from "./icons";
import { Ja } from "./Talk";
import "./AquariumMap.css";

/**
 * The Aquarium Map (one chip, top right): the Grand Hub first and largest,
 * then each wing with its rooms, lock state, a small progress line and a
 * "You are here" pin. Tapping an open card travels there with the usual fade.
 */

export function MapButton() {
  const unlocked = useGame((s) => hubUnlocked(s.model));
  const free = useGame(() => canTravel());
  const guide = useGame((s) => s.guide === "btn-map" || s.nudge?.target === "btn-map");
  const exploring = useGame((s) => s.exploring);
  if (!unlocked || exploring) return null;
  return (
    <button className={`chip map-btn ui ${guide ? "guide" : ""}`} onClick={openMap} disabled={!free} data-testid="btn-map" aria-label="Aquarium Map">
      <MapGlyph /> <span className="map-label">Map <small lang="ja">マップ</small></span>
    </button>
  );
}

function MapGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M2 6 L9 3 L17 6 L24 3 L24 20 L17 23 L9 20 L2 23 Z" fill="#ffe8a3" stroke="#14506a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 3 L9 20 M17 6 L17 23" stroke="#14506a" strokeWidth="1.6" />
      <circle cx="13" cy="12" r="3" fill="#e8590c" />
    </svg>
  );
}

function Here() {
  return <span className="map-here" data-testid="map-here">You are here<Ja>いま ここ</Ja></span>;
}

function useEscape(close: () => void) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [close]);
  return btn;
}

const INDOOR: { hall: number; icon: IconId }[] = [
  { hall: 0, icon: "fish" },
  { hall: 1, icon: "turtle" },
  { hall: 2, icon: "lamp" },
  { hall: 3, icon: "decor" }
];

export function AquariumMap() {
  const open = useGame((s) => s.mapOpen);
  if (!open) return null;
  return <MapDialog />;
}

function MapDialog() {
  const hall = useGame((s) => s.hall);
  const progress = useGame((s) => s.model.progress);
  const close = useEscape(closeMap);
  const tunnelMilestone = progress.tunnel?.milestone ?? 0;
  return (
    <div className="map-backdrop ui" onPointerDown={(e) => { if (e.target === e.currentTarget) closeMap(); }}>
      <div className="panel map-panel" role="dialog" aria-label="Aquarium Map" data-testid="aquarium-map">
        <header>
          <b>Aquarium Map <Ja>すいぞくかんの マップ</Ja></b>
          <button className="round close-btn" ref={close} aria-label="Close map" onClick={closeMap} data-testid="map-close"><Icon id="close" size={22} /></button>
        </header>
        <div className="map-grid">
          <button className={`map-card hub ${hall === HUB_HALL ? "here" : ""}`} onClick={() => travelTo(HUB_HALL)} data-testid="map-hub">
            <span className="map-icon hub-icon" aria-hidden="true">★</span>
            <span className="map-name">Grand Hub<Ja>グランド ホール</Ja></span>
            {hall === HUB_HALL && <Here />}
          </button>
          <section className="map-wing indoor" aria-label="Indoor Aquarium">
            <h3>Indoor Aquarium<Ja>すいぞくかんの なか</Ja></h3>
            <div className="map-rooms">
              {INDOOR.map(({ hall: i, icon }) => {
                const ok = roomOpen(i, progress);
                return (
                  <button key={i} className={`map-card small ${hall === i ? "here" : ""} ${ok ? "" : "locked"}`} disabled={!ok} onClick={() => travelTo(i)} data-testid={`map-room-${ROOMS[i].id}`}>
                    <span className="map-icon" aria-hidden="true">{ok ? <Icon id={icon} size={30} /> : <Icon id="lock" size={24} />}</span>
                    <span className="map-name">{ROOMS[i].name}<Ja>{ROOMS[i].ja}</Ja></span>
                    {hall === i && <Here />}
                  </button>
                );
              })}
            </div>
          </section>
          <button className={`map-card wing sharks ${hall === SHARKS_HALL ? "here" : ""}`} onClick={() => travelTo(SHARKS_HALL)} data-testid="map-sharks">
            <span className="map-icon" aria-hidden="true"><SharkGlyph /></span>
            <span className="map-name">Shark Tunnel<Ja>サメの トンネル</Ja></span>
            <span className="map-progress" aria-label={`${tunnelMilestone} of 5 milestones`}>{progress.tunnel?.trophy ? <><Icon id="trophy" size={18} /> 5/5</> : <><Icon id="star" size={16} /> {tunnelMilestone}/5</>}</span>
            {hall === SHARKS_HALL && <Here />}
          </button>
          <div className="map-card wing coast locked" data-testid="map-coast" aria-disabled="true">
            <span className="map-icon" aria-hidden="true"><Icon id="lock" size={26} /></span>
            <span className="map-name">Coastal &amp; Polar Zone<Ja>かいがんと さむい ちいき</Ja></span>
            <span className="map-progress">Coming soon<Ja>もうすぐ</Ja></span>
          </div>
          <div className="map-card future" aria-disabled="true" data-testid="map-lagoon">
            <span className="map-icon" aria-hidden="true">☀</span>
            <span className="map-name">Dolphin Lagoon<Ja>イルカの ラグーン</Ja></span>
            <span className="map-progress">Coming soon<Ja>もうすぐ</Ja></span>
          </div>
          <div className="map-card future" aria-disabled="true" data-testid="map-sanctuary">
            <span className="map-icon" aria-hidden="true">≈</span>
            <span className="map-name">Ocean Sanctuary<Ja>うみの サンクチュアリ</Ja></span>
            <span className="map-progress">Coming soon<Ja>もうすぐ</Ja></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SharkGlyph() {
  return (
    <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true">
      <path d="M2 14 Q14 6 26 12 L32 7 L31 17 L26 15 Q14 21 2 14 Z" fill="#5b7a8c" />
      <path d="M14 10 L17 3 L19 10 Z" fill="#5b7a8c" />
    </svg>
  );
}

/** The hub's trophy shelves as a card: the same achievement flags the game already keeps. */
export function TrophyCard() {
  const open = useGame((s) => s.trophiesOpen);
  if (!open) return null;
  return <TrophyDialog />;
}

function TrophyDialog() {
  const p = useGame((s) => s.model.progress);
  const rush = useGame((s) => s.model.rush);
  const close = useEscape(closeTrophies);
  const items: { id: string; got: boolean; en: string; ja: string; how: string; howJa: string }[] = [
    { id: "star", got: p.star, en: "Aquarium Star", ja: "アクアリウム スター", how: "Finish Level 5", howJa: "レベル5を クリア" },
    { id: "crown", got: p.superStar, en: "Super Aquarium Star", ja: "スーパー アクアリウム スター", how: "Finish Level 8", howJa: "レベル8を クリア" },
    { id: "sharks", got: Boolean(p.tunnel?.trophy), en: "Shark Tunnel trophy", ja: "サメの トンネルの トロフィー", how: "Finish the Final Tour", howJa: "さいごの ツアーを クリア" },
    { id: "rush", got: Boolean(rush?.stats.best), en: "Rush Hour medal", ja: "ラッシュアワーの メダル", how: "Win a medal in Rush Hour", howJa: "ラッシュアワーで メダルを とろう" },
    { id: "coast", got: false, en: "Coastal & Polar trophy", ja: "かいがんと さむい ちいきの トロフィー", how: "Coming soon", howJa: "もうすぐ" }
  ];
  return (
    <div className="map-backdrop ui" onPointerDown={(e) => { if (e.target === e.currentTarget) closeTrophies(); }}>
      <div className="panel map-panel trophy-panel" role="dialog" aria-label="Trophies" data-testid="hub-trophy-card">
        <header>
          <b>Trophies <Ja>トロフィー</Ja></b>
          <button className="round close-btn" ref={close} aria-label="Close trophies" onClick={closeTrophies}><Icon id="close" size={22} /></button>
        </header>
        <ul className="trophy-list">
          {items.map((t) => (
            <li key={t.id} className={t.got ? "got" : ""} data-testid={`trophy-${t.id}`} data-got={t.got}>
              <span className="trophy-mark" aria-label={t.got ? "Earned" : "Not yet"}><Icon id={t.got ? "trophy" : "lock"} size={24} /></span>
              <span><b>{t.en}</b><Ja>{t.ja}</Ja>{!t.got && <small>{t.how}<Ja>{t.howJa}</Ja></small>}</span>
            </li>
          ))}
        </ul>
        {rush?.unlocked && <button className="secondary trophy-rush" onClick={trophiesToRush} data-testid="trophy-rush">Rush Hour awards<Ja>ラッシュアワーの メダル</Ja></button>}
      </div>
    </div>
  );
}
