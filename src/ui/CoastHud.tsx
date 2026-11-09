import { useEffect, useState, type ReactNode } from "react";
import { setGame, useGame } from "../game/store";
import { COAST_HALL } from "../game/data/rooms";
import { DECOR, COAST_DECOR } from "../game/data/decor";
import { TANKS } from "../game/data/tanks";
import { COAST_PRICE, HABITAT_PAD, habitatOpen, needMet } from "../game/logic/coast";
import { happiness, tankAt, usedSpace } from "../game/logic/model";
import { buyCoast, buyCoastItem, COAST_MILESTONES, setCoastView, startCoastActivity, watchCoastIntro } from "../game/flow/coast";
import { cleanTank, feedTank, openDecorate } from "../game/flow/actions";
import type { CoastHabitat } from "../game/data/coast";
import type { CoastDecorKind } from "../game/types";
import { Big } from "./Hud";
import { Icon } from "./icons";
import { DecorPicture, PersonFace } from "./Portraits";
import { Ja } from "./Talk";
import { playHintAudio } from "./hintAudio";
import "./CoastHud.css";

/** The coastal zone's management HUD (shown in its hall, like the Shark Tunnel's WingHud). */

const NAMES: Record<CoastHabitat, { en: string; ja: string }> = {
  penguins: { en: "Penguins", ja: "ペンギン" },
  seals: { en: "Seals", ja: "アザラシ" },
  otters: { en: "Sea Otters", ja: "ラッコ" }
};
export const NEED_TEXT: Record<CoastHabitat, { en: string; ja: string }> = {
  penguins: { en: "The penguins need rocks!", ja: "ペンギンに やすむ いわが ひつようだよ！" },
  seals: { en: "The seal needs a rock!", ja: "アザラシに いわが ひつようだよ！" },
  otters: { en: "The otters need kelp!", ja: "ラッコに コンブの ベッドが ひつようだよ！" }
};

function PenguinGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="14" rx="6" ry="8" fill="#1f242e" />
      <ellipse cx="12.5" cy="15" rx="4" ry="6" fill="#f4f6f8" />
      <circle cx="12" cy="6" r="4" fill="#1f242e" />
      <path d="M14 6l4 1-4 1z" fill="#e8a23a" />
    </svg>
  );
}

export function CoastGoals({ before }: { before?: ReactNode } = {}) {
  const c = useGame((s) => s.model.progress.coast);
  const [open, setOpen] = useState(false);
  const done = c?.milestone ?? 0;
  const cur = COAST_MILESTONES[Math.min(4, done)];
  return (
    <div className={`panel goals tunnel-goals coast-goals ui ${open ? "expanded" : ""}`} data-testid="coast-goals" data-milestone={done}>
      {before}
      <header><PenguinGlyph /> Coastal &amp; Polar <Ja>かいがんと さむい ちいき</Ja></header>
      {done >= 5 ? (
        <div className="guide-next"><b>All done! Enjoy the animals.</b> <Ja>ぜんぶ できた！ どうぶつと あそぼう</Ja></div>
      ) : (
        <div className="guide-next" data-testid="coast-next">
          <b>{done + 1}. {cur.en}</b> <Ja>{cur.ja}</Ja>
          <small>{cur.todo.en}</small><Ja>{cur.todo.ja}</Ja>
        </div>
      )}
      <button className="objectives-toggle" data-testid="btn-coast-goals" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span> Goals <Ja>もくひょう</Ja>
      </button>
      {open && (
        <ol className="tunnel-milestones">
          {COAST_MILESTONES.map((m, i) => (
            <li key={m.en} className={i < done ? "done" : i === done ? "current" : ""} data-testid={`coast-milestone-${i + 1}`}>
              <span className="tick">{i < done ? <Icon id="check" size={16} /> : i + 1}</span>
              <span>{m.en}<Ja>{m.ja}</Ja><small>🎁 {m.reward.en}</small></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Views() {
  const view = useGame((s) => s.coastView);
  const model = useGame((s) => s.model);
  const views: Array<{ id: "all" | CoastHabitat; en: string; ja: string }> = [{ id: "all", en: "All", ja: "ぜんたい" }, ...(["penguins", "seals", "otters"] as CoastHabitat[]).map((h) => ({ id: h, ...NAMES[h] }))];
  return (
    <div className="wing-views coast-views ui" role="group" aria-label="Habitats" data-testid="coast-views">
      {views.map((v) => {
        const locked = v.id !== "all" && !habitatOpen(model, v.id);
        return (
          <button key={v.id} className={`${view === v.id ? "on" : ""} ${locked ? "locked" : ""}`} aria-pressed={view === v.id} aria-disabled={locked} data-testid={`coast-view-${v.id}`} onClick={() => setCoastView(v.id)}>
            {locked && <Icon id="lock" size={14} />}{v.en}<Ja>{v.ja}</Ja>
          </button>
        );
      })}
    </div>
  );
}

function HabitatCard({ h }: { h: CoastHabitat }) {
  const tank = useGame((s) => tankAt(s.model, HABITAT_PAD[h]));
  if (!tank || tank.type !== h) return null;
  const used = usedSpace(tank), cap = TANKS[h].capacity, happy = happiness(tank);
  const bar = (v: number, icon: "food" | "sponge" | "happy", id: string) => (
    <div className={`bar ${v >= 70 ? "good" : v >= 40 ? "ok" : "low"}`} data-testid={id} data-value={Math.round(v)}>
      <Icon id={icon} size={24} />
      <div className="track"><div className="fill" style={{ width: `${Math.max(4, v)}%` }} /></div>
    </div>
  );
  const need = !needMet(tank) && tank.fish.length > 0;
  return (
    <div className="panel wing-status coast-status ui" data-testid="coast-status" data-habitat={h}>
      <header>
        <span>{TANKS[h].name}<Ja>{TANKS[h].ja}</Ja></span>
        <span className="fishcount" data-testid="coast-capacity">{used}/{cap}</span>
      </header>
      {bar(tank.fish.length ? tank.food : 100, "food", "coast-food")}
      {bar(tank.clean, "sponge", "coast-clean")}
      {bar(happy ?? 0, "happy", "coast-happy")}
      {need && (
        <button className="coast-need" data-testid="coast-need" onClick={() => playHintAudio(NEED_TEXT[h].en)}>
          <b>{NEED_TEXT[h].en}</b><Ja>{NEED_TEXT[h].ja}</Ja> <Icon id="speaker" size={18} />
        </button>
      )}
    </div>
  );
}

/** The habitat's few items, bought by tapping; the first is the animals' need. */
function ItemShop({ h }: { h: CoastHabitat }) {
  const coins = useGame((s) => s.model.coins);
  return (
    <div className="panel shop coast-shop ui" data-testid="coast-shop" role="dialog">
      <header>
        <Icon id="decor" size={30} />
        <h2>{NAMES[h].en} items <Ja>{NAMES[h].ja}の どうぐ</Ja></h2>
        <button className="round close-btn" onClick={() => setGame({ panel: null })} aria-label="Close" data-testid="shop-close"><Icon id="close" size={22} /></button>
      </header>
      <div className="grid">
        {COAST_DECOR[h].map((k: CoastDecorKind, i) => {
          const def = DECOR[k], price = def.versions[0].price, short = coins < price;
          return (
            <button key={k} className={`card decor-card ${short ? "short" : ""} ${i === 0 ? "coast-needed" : ""}`} onClick={() => buyCoastItem(k)} data-testid="coast-item" data-kind={k}>
              <span className="pics"><DecorPicture kind={k} variant={null} size={76} /></span>
              <strong className="structure-name">{def.name}<Ja>{def.ja}</Ja></strong>
              {i === 0 && <small className="need-tag">Needed! <Ja>ひつよう</Ja></small>}
              <span className="price"><Icon id="coin" size={22} /> {price}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WaitingVisitor() {
  const w = useGame((s) => s.coastWaiting);
  if (!w) return null;
  return (
    <button className="chip-btn visitor ui coast-visitor" onClick={() => void startCoastActivity()} data-testid="coast-visitor" aria-label={`A visitor at the ${NAMES[w.habitat].en.toLowerCase()} has a question`}>
      <PersonFace type={w.type} size={48} />
      <span className="excl">!</span>
      <small>{NAMES[w.habitat].en}</small>
    </button>
  );
}

export function CoastHud() {
  const view = useGame((s) => s.coastView);
  const free = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.stageCard && !s.placing && !s.coastActivity);
  const panel = useGame((s) => s.panel);
  const decorating = panel === "decorate";
  useEffect(() => watchCoastIntro(), []);
  const h = view === "all" ? null : view;
  return (
    <>
      {h && !decorating && <HabitatCard h={h} />}
      {free && !panel && <Views />}
      {h && panel === "decorShop" && <ItemShop h={h} />}
      {free && !panel && (
        <div className="bottombar room-bar wing-bar coast-bar">
          <div className="chips-left" />
          <div className="bar-main">
            {h ? (
              <>
                <Big id="btn-coast-items" icon="decor" label="Items" ja="どうぐ" onClick={() => setGame({ panel: "decorShop" })} />
                <Big id="btn-decorate" icon="hand" label="Place" ja="おく" onClick={openDecorate} />
                <Big id="btn-feed" icon="food" label="" ja="えさ" onClick={() => void feedTank()} />
                <Big id="btn-clean" icon="sponge" label="" ja="そうじ" onClick={() => void cleanTank()} />
              </>
            ) : (
              <button className="panel hub-hint ui" data-testid="coast-hint" onClick={() => playHintAudio("Tap a habitat!")}>
                <Icon id="hand" size={30} /> Tap a habitat! <Ja>すみかを タップしよう</Ja> <Icon id="speaker" size={20} />
              </button>
            )}
          </div>
          <div className="chips-right"><WaitingVisitor /></div>
        </div>
      )}
    </>
  );
}

export function CoastCelebration() {
  const c = useGame((s) => s.coastCelebration);
  if (!c) return null;
  const ms = COAST_MILESTONES[c.milestone - 1];
  return (
    <div className="coast-celebration ui" data-testid="coast-celebration" role="status">
      <Icon id={c.milestone === 5 ? "trophy" : "star"} size={44} />
      <b>{ms.en}!</b><Ja>{ms.ja}</Ja>
      <small>🎁 {ms.reward.en}<Ja>{ms.reward.ja}</Ja></small>
    </div>
  );
}

/** The hub's offer to open the zone (from its doorway or the map). */
export function CoastOffer() {
  const open = useGame((s) => s.coastOffer);
  const coins = useGame((s) => s.model.coins);
  if (!open) return null;
  const short = coins < COAST_PRICE;
  return (
    <div className="map-backdrop ui" onPointerDown={(e) => { if (e.target === e.currentTarget) setGame({ coastOffer: false }); }}>
      <div className="panel map-panel coast-offer" role="dialog" aria-label="Open the Coastal & Polar Zone" data-testid="coast-offer">
        <header><b>Coastal &amp; Polar Zone <Ja>かいがんと さむい ちいき</Ja></b></header>
        <p>Penguins, seals and sea otters! <Ja>ペンギン・アザラシ・ラッコ！</Ja></p>
        <p className="coast-offer-gift"><PenguinGlyph size={30} /><PenguinGlyph size={30} /><PenguinGlyph size={30} /> Three penguins come with it. <Ja>ペンギンが 3わ ついてくるよ</Ja></p>
        <footer>
          <button className="primary" disabled={short} onClick={buyCoast} data-testid="btn-buy-coast"><Icon id="coin" size={24} /> {COAST_PRICE} Open! <Ja>ひらく</Ja></button>
          <button className="secondary" onClick={() => setGame({ coastOffer: false })} data-testid="btn-coast-later">Not now <Ja>あとで</Ja></button>
        </footer>
        {short && <small className="coast-short">{COAST_PRICE - coins} more coins <Ja>コインが あと {COAST_PRICE - coins} ひつよう</Ja></small>}
      </div>
    </div>
  );
}

export const inCoastHall = (hall: number) => hall === COAST_HALL;
