import { setGame, useGame } from "../game/store";
import { ANIMAL_ORDER, FISH_ORDER, SPECIES } from "../game/data/fish";
import { DECOR, DECOR_ORDER } from "../game/data/decor";
import { HALL_PRICE, TANKS, TICKETS_PRICE } from "../game/data/tanks";
import { homesFor, isSpeciesUnlocked, padsFor, tankById, UPGRADE_PRICE, type UpgradeKind } from "../game/logic/model";
import type { SpeciesId } from "../game/types";
import { buyDecorKind, buyHall, buyTankType, buyTankUpgrade, buyTicketGate, doneDecorate, openDecorShop, pickTrayItem, putAway } from "../game/flow/actions";
import { Icon, type IconId } from "./icons";
import { DecorPicture, FishPicture, LampPicture } from "./Portraits";
import { Ja } from "./Talk";
import { UI } from "./i18n";

function Price({ n, short }: { n: number | string; short: boolean }) {
  return (
    <span className={`price ${short ? "short" : ""}`}>
      <Icon id="coin" size={22} />
      {n}
    </span>
  );
}

/**
 * Pico's fish counter: pictures and prices only (no names, no colour words).
 * The order itself is the English prompt underneath ("What color?").
 */
function AnimalCards({ list, testid }: { list: SpeciesId[]; testid: string }) {
  const model = useGame((s) => s.model);
  return (
    <div className="shop-strip ui" data-testid={testid}>
      {list.map((s) => {
        const def = SPECIES[s];
        const locked = !isSpeciesUnlocked(model, s);
        const short = model.coins < def.price;
        const homeless = !locked && homesFor(model, s) <= 0;
        return (
          <div key={s} className={`card fish-card ${locked ? "locked" : ""} ${short || homeless ? "short" : ""}`} data-testid="shop-card" data-species={s}>
            <FishPicture species={s} size={110} />
            {locked ? (
              <span className="lockline">
                <Icon id="lock" size={20} /> Lv {def.needsHall ? 6 : def.fromStage}
              </span>
            ) : (
              <Price n={def.price} short={short} />
            )}
            {!locked && short && (
              <small className="need" lang="ja">
                {UI.needCoins.ja}
              </small>
            )}
            {!locked && homeless && !short && (
              <small className="need" lang="ja">
                {def.kind === "fish" ? UI.full.ja : "すめる タンクが ひつよう"}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pico's fish counter: pictures and prices only (no names, no colour words).
 * The order itself is the English prompt underneath ("What color?").
 */
export function FishShop() {
  const panel = useGame((s) => s.panel);
  const stage = useGame((s) => s.model.progress.stage);
  const tutorial = useGame((s) => s.model.progress.tutorial !== "done");
  if (panel !== "fishShop") return null;
  // Show what is sold, and the next fish to unlock (a goal to look forward to).
  const list = tutorial ? (["clownfish", "bluetang"] as SpeciesId[]) : FISH_ORDER.filter((s) => SPECIES[s].fromStage <= Math.max(3, stage));
  return <AnimalCards list={list} testid="fish-shop" />;
}

/** The sea-animal counter: pictures and prices; the order is "A turtle, please!". */
export function AnimalShop() {
  const panel = useGame((s) => s.panel);
  if (panel !== "animalShop") return null;
  return <AnimalCards list={ANIMAL_ORDER} testid="animal-shop" />;
}

/** "Red or blue?" / "Big or small?": the two versions as pictures (no words) above the prompt. */
export function DecorChoiceStrip() {
  const kind = useGame((s) => s.decorAsk);
  const coins = useGame((s) => s.model.coins);
  const prompt = useGame((s) => s.prompt);
  if (!kind || !prompt) return null;
  const def = DECOR[kind];
  return (
    <div className="shop-strip ui" data-testid="decor-choice">
      {def.versions.map((v) => (
        <div key={String(v.variant)} className={`card fish-card ${coins < v.price ? "short" : ""}`}>
          <DecorPicture kind={kind} variant={v.variant} size={92} />
          <Price n={v.price} short={coins < v.price} />
        </div>
      ))}
    </div>
  );
}

export function DecorShop() {
  const panel = useGame((s) => s.panel);
  const coins = useGame((s) => s.model.coins);
  const stage = useGame((s) => s.model.progress.stage);
  const mode = useGame((s) => s.mode);
  if (panel !== "decorShop" || mode === "ask") return null;
  // Phase 2 decorations appear (locked) from Level 6, so there is something to look forward to.
  const list = DECOR_ORDER.filter((k) => DECOR[k].fromStage <= 2 || stage >= 6);
  return (
    <div className="panel shop ui" data-testid="decor-shop" role="dialog">
      <header>
        <Icon id="decor" size={30} />
        <h2>
          Decorations <Ja>かざり</Ja>
        </h2>
        <button className="round close-btn" onClick={() => setGame({ panel: null })} aria-label="Close" data-testid="shop-close">
          <Icon id="close" size={22} />
        </button>
      </header>
      <div className="grid">
        {list.map((k) => {
          const def = DECOR[k];
          const prices = [...new Set(def.versions.map((v) => v.price))];
          const min = Math.min(...prices);
          const short = coins < min;
          const locked = stage < def.fromStage;
          return (
            <button
              key={k}
              className={`card decor-card ${short || locked ? "short" : ""} ${locked ? "locked" : ""}`}
              onClick={() => (locked ? undefined : void buyDecorKind(k))}
              data-testid="decor-card"
              data-kind={k}
              aria-disabled={locked}
            >
              <span className="pics">
                {def.versions.map((v) => (
                  <DecorPicture key={String(v.variant)} kind={k} variant={v.variant} size={def.versions.length > 1 ? 58 : 76} />
                ))}
              </span>
              {locked ? (
                <span className="lockline">
                  <Icon id="lock" size={20} /> Lv 8
                </span>
              ) : (
                <Price n={prices.length > 1 ? `${min}-${Math.max(...prices)}` : min} short={short} />
              )}
              {def.bigOnly && !locked && (
                <small className="need" lang="ja">
                  おおきな タンク
                </small>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TankPicture({ type }: { type: "big" | "tall" | "hall" | "tickets" }) {
  if (type === "tall")
    return (
      <svg width="70" height="96" viewBox="0 0 40 56" aria-hidden>
        <rect x="6" y="2" width="28" height="40" rx="2" fill="#5cc8ea" stroke="#1f4a66" strokeWidth="2.5" />
        <rect x="6" y="36" width="28" height="6" fill="#ecd9a4" />
        <rect x="8" y="42" width="24" height="12" rx="2" fill="#c58a55" />
        <path d="M14 30a6 6 0 0 1 12 0z" fill="#c38bff" />
        <path d="M16 30v6M20 30v7M24 30v6" stroke="#d9a8ff" strokeWidth="1.5" />
      </svg>
    );
  if (type === "hall")
    return (
      <svg width="96" height="80" viewBox="0 0 60 50" aria-hidden>
        <rect x="2" y="8" width="56" height="40" rx="3" fill="#1b5f99" />
        <path d="M2 14L30 2l28 12" fill="#0f5c8f" />
        <rect x="18" y="22" width="24" height="16" rx="2" fill="#5cc8ea" stroke="#0f3f6e" strokeWidth="2" />
        <ellipse cx="30" cy="31" rx="7" ry="4" fill="#3f9b5b" />
        <circle cx="38" cy="30" r="2" fill="#9ccf6a" />
      </svg>
    );
  if (type === "tickets")
    return (
      <svg width="90" height="80" viewBox="0 0 60 50" aria-hidden>
        <rect x="6" y="12" width="48" height="26" rx="5" fill="#ffc93c" stroke="#c98a00" strokeWidth="2.5" />
        <path d="M18 12v26" stroke="#c98a00" strokeWidth="2" strokeDasharray="3 3" />
        <path d="M30 25l4-8 4 8-4 6z" fill="#ff5c8a" />
        <circle cx="12" cy="44" r="4" fill="#4aa3ff" />
        <circle cx="24" cy="44" r="4" fill="#ff6b6b" />
        <circle cx="36" cy="44" r="4" fill="#51cf66" />
        <circle cx="48" cy="44" r="4" fill="#cc5de8" />
      </svg>
    );
  return <Icon id="tank" size={100} />;
}

/** The tank shop: the big tank, the tall tank, the Ocean Hall and the ticket gate, as they unlock. */
export function TankShop() {
  const panel = useGame((s) => s.panel);
  const m = useGame((s) => s.model);
  if (panel !== "tankShop") return null;
  const p = m.progress;
  const offers: { id: string; pic: "big" | "tall" | "hall" | "tickets"; price: number; caps: [IconId, number][]; info?: string; locked: string | null; buy: () => void }[] = [];
  offers.push({ id: "btn-buy-tank", pic: "big", price: TANKS.big.price, caps: [["fish", TANKS.big.capacity], ["decor", TANKS.big.slots.length]], locked: null, buy: () => buyTankType("big") });
  if (p.stage >= 6 && !p.hallOpen) {
    offers.push({ id: "btn-buy-hall", pic: "hall", price: HALL_PRICE, caps: [["turtle", TANKS.ocean.capacity]], info: "うみの ホールと うみの タンク", locked: null, buy: buyHall });
  }
  if (p.stage >= 6) {
    offers.push({
      id: "btn-buy-tall",
      pic: "tall",
      price: TANKS.tall.price,
      caps: [["fish", TANKS.tall.capacity], ["decor", TANKS.tall.slots.length]],
      info: "タツノオトシゴ・クラゲ",
      locked: p.stage < 7 ? "Lv 7" : !p.hallOpen && padsFor(m, "tall").length === 0 ? "うみの ホール" : null,
      buy: () => buyTankType("tall")
    });
  }
  if (p.stage >= 8 && !p.tickets) {
    offers.push({ id: "btn-buy-tickets", pic: "tickets", price: TICKETS_PRICE, caps: [["visitor", 4]], info: "おきゃくさんが ふえる", locked: null, buy: buyTicketGate });
  }
  return (
    <div className="panel shop tank-shop ui" data-testid="tank-shop" role="dialog">
      <header>
        <Icon id="tank" size={30} />
        <h2>
          Tanks <Ja>タンク</Ja>
        </h2>
        <button className="round close-btn" onClick={() => setGame({ panel: null })} aria-label="Close" data-testid="shop-close">
          <Icon id="close" size={22} />
        </button>
      </header>
      <div className={`offers n${offers.length}`}>
        {offers.map((o) => {
          const short = m.coins < o.price;
          return (
            <div key={o.id} className={`card tank-offer ${o.locked ? "locked" : ""}`}>
              <span className="tank-pic">
                <TankPicture type={o.pic} />
              </span>
              <div className="tank-info">
                {o.caps.map(([icon, n]) => (
                  <span key={icon} className="cap">
                    <Icon id={icon} size={24} /> × {n}
                  </span>
                ))}
                {o.info && (
                  <small className="info" lang="ja">
                    {o.info}
                  </small>
                )}
                {o.locked ? (
                  <span className="lockline">
                    <Icon id="lock" size={20} /> {o.locked}
                  </span>
                ) : (
                  <Price n={o.price} short={short} />
                )}
              </div>
              <button className="primary buy" disabled={short || Boolean(o.locked)} onClick={() => o.buy()} data-testid={o.id}>
                <Icon id="check" size={24} /> OK
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Close-up: the upgrade panel. Bought with a tap; the Japanese info is optional and never assessed. */
export function UpgradePanel() {
  const panel = useGame((s) => s.panel);
  const tank = useGame((s) => (s.tankId ? tankById(s.model, s.tankId) : null));
  const coins = useGame((s) => s.model.coins);
  const mode = useGame((s) => s.mode);
  if (panel !== "upgrade" || !tank || mode !== "play") return null;
  const rows: { kind: UpgradeKind; icon: IconId; en: string; ja: string; owned: boolean; show: boolean }[] = [
    { kind: "filter", icon: "sponge", en: "Filter", ja: "フィルター: みずが よごれにくく なる", owned: tank.upgrades.filter, show: true },
    { kind: "lamp", icon: "happy", en: "Lamp", ja: "ライト: いきものが よろこぶ (クラゲは だいすき)", owned: tank.upgrades.lamp, show: true },
    { kind: "bigger", icon: "tank", en: "Bigger tank", ja: "おおきな タンクに する", owned: false, show: tank.type === "small" }
  ];
  return (
    <div className="panel shop upgrade-panel ui" data-testid="upgrade-panel" role="dialog">
      <header>
        <Icon id="up" size={30} />
        <h2>
          Upgrades <Ja>アップグレード</Ja>
        </h2>
        <button className="round close-btn" onClick={() => setGame({ panel: null })} aria-label="Close" data-testid="upgrade-close">
          <Icon id="close" size={22} />
        </button>
      </header>
      <div className="upgrade-rows">
        {rows
          .filter((r) => r.show)
          .map((r) => {
            const price = UPGRADE_PRICE[r.kind];
            const short = coins < price;
            return (
              <div key={r.kind} className={`upgrade-row ${r.owned ? "owned" : ""}`}>
                {r.kind === "lamp" ? <LampPicture size={48} /> : <Icon id={r.icon} size={44} />}
                <span className="up-text">
                  {r.en}
                  <Ja>{r.ja}</Ja>
                </span>
                {r.owned ? (
                  <span className="good" data-testid={`up-owned-${r.kind}`}>
                    <Icon id="check" size={28} />
                  </span>
                ) : (
                  <>
                    <Price n={price} short={short} />
                    <button className="primary" disabled={short} onClick={() => buyTankUpgrade(r.kind)} data-testid={`btn-up-${r.kind}`}>
                      <Icon id="check" size={22} /> OK
                    </button>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

/** Decorate mode: the tray of owned decorations, the shop, put away and done. */
export function DecorTray() {
  const panel = useGame((s) => s.panel);
  const view = useGame((s) => s.view);
  const mode = useGame((s) => s.mode);
  const inv = useGame((s) => s.model.inv.decor);
  const placing = useGame((s) => s.placing);
  const guide = useGame((s) => s.guide === "tray");
  const tutorial = useGame((s) => s.model.progress.tutorial !== "done");
  if (panel !== "decorate" || view !== "tank" || mode !== "play") return null;
  const hint =
    placing?.kind === "decor"
      ? { en: "Tap a circle on the sand!", ja: "すなの ○を タップ" }
      : placing?.kind === "move"
        ? { en: "Tap a new place!", ja: "あたらしい ばしょを タップ" }
        : inv.length
          ? { en: "Choose a decoration!", ja: "かざりを えらぼう (おいた かざりを タップすると うごかせるよ)" }
          : { en: "Buy decorations!", ja: "ショップで かざりを かおう" };
  return (
    <div className="panel tray ui" data-testid="tray">
      <div className="tray-hint">
        {hint.en}
        <Ja>{hint.ja}</Ja>
      </div>
      <div className="tray-row">
        <div className={`tray-items ${guide ? "guide" : ""}`}>
          {inv.map((d) => (
            <button
              key={d.id}
              className={`tray-item ${placing?.kind === "decor" && placing.decorId === d.id ? "picked" : ""}`}
              onClick={() => pickTrayItem(d.id)}
              data-testid="tray-item"
              data-id={d.id}
              data-kind={d.kind}
            >
              <DecorPicture kind={d.kind} variant={d.variant} size={56} />
            </button>
          ))}
          {!inv.length && <span className="empty">—</span>}
        </div>
        {placing?.kind === "move" && (
          <button className="secondary" onClick={() => putAway()} data-testid="btn-put-away">
            <Icon id="box" size={28} /> <Ja>しまう</Ja>
          </button>
        )}
        {!tutorial && (
          <button className="secondary" onClick={() => openDecorShop()} data-testid="tray-shop">
            <Icon id="shop" size={30} /> <Ja>ショップ</Ja>
          </button>
        )}
        {!tutorial && (
          <button className="primary" onClick={() => doneDecorate()} data-testid="btn-done-decor">
            <Icon id="check" size={28} /> OK
          </button>
        )}
      </div>
    </div>
  );
}
