import { setGame, useGame } from "../game/store";
import { SPECIES, SPECIES_ORDER } from "../game/data/fish";
import { DECOR, DECOR_ORDER } from "../game/data/decor";
import { TANKS } from "../game/data/tanks";
import { freeSpace, isSpeciesUnlocked } from "../game/logic/model";
import { buyBigTank, buyDecorKind, doneDecorate, openDecorShop, pickTrayItem, putAway } from "../game/flow/actions";
import { Icon } from "./icons";
import { DecorPicture, FishPicture } from "./Portraits";
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
export function FishShop() {
  const panel = useGame((s) => s.panel);
  const model = useGame((s) => s.model);
  if (panel !== "fishShop") return null;
  const tutorial = model.progress.tutorial !== "done";
  const list = tutorial ? SPECIES_ORDER.filter((s) => s !== "yellowfish") : SPECIES_ORDER;
  const full = freeSpace(model) <= 0;
  return (
    <div className="shop-strip ui" data-testid="fish-shop">
      {list.map((s) => {
        const def = SPECIES[s];
        const locked = !isSpeciesUnlocked(model, s);
        const short = model.coins < def.price;
        return (
          <div key={s} className={`card fish-card ${locked ? "locked" : ""} ${short || full ? "short" : ""}`} data-testid="shop-card" data-species={s}>
            <FishPicture species={s} size={110} />
            {locked ? (
              <span className="lockline">
                <Icon id="lock" size={20} /> Lv 3
              </span>
            ) : (
              <Price n={def.price} short={short} />
            )}
            {!locked && short && (
              <small className="need" lang="ja">
                {UI.needCoins.ja}
              </small>
            )}
            {!locked && full && !short && (
              <small className="need" lang="ja">
                {UI.full.ja}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function DecorShop() {
  const panel = useGame((s) => s.panel);
  const coins = useGame((s) => s.model.coins);
  const mode = useGame((s) => s.mode);
  if (panel !== "decorShop" || mode === "ask") return null;
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
        {DECOR_ORDER.map((k) => {
          const def = DECOR[k];
          const prices = [...new Set(def.versions.map((v) => v.price))];
          const min = Math.min(...prices);
          const short = coins < min;
          return (
            <button key={k} className={`card decor-card ${short ? "short" : ""}`} onClick={() => void buyDecorKind(k)} data-testid="decor-card" data-kind={k}>
              <span className="pics">
                {def.versions.map((v) => (
                  <DecorPicture key={String(v.variant)} kind={k} variant={v.variant} size={def.versions.length > 1 ? 58 : 76} />
                ))}
              </span>
              <Price n={prices.length > 1 ? `${min}-${Math.max(...prices)}` : min} short={short} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TankShop() {
  const panel = useGame((s) => s.panel);
  const coins = useGame((s) => s.model.coins);
  if (panel !== "tankShop") return null;
  const def = TANKS.big;
  const short = coins < def.price;
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
      <div className="tank-offer">
        <span className="tank-pic">
          <Icon id="tank" size={110} />
        </span>
        <div className="tank-info">
          <span className="cap">
            <Icon id="fish" size={26} /> × {def.capacity}
          </span>
          <span className="cap">
            <Icon id="decor" size={26} /> × {def.slots.length}
          </span>
          <Price n={def.price} short={short} />
          {short && (
            <small className="need" lang="ja">
              {UI.needCoins.ja}
            </small>
          )}
        </div>
        <button className="primary buy" disabled={short} onClick={() => buyBigTank()} data-testid="btn-buy-tank">
          <Icon id="check" size={26} /> OK
        </button>
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
