import { useMemo } from "react";
import { setGame, useGame } from "../game/store";
import { ANIMAL_ORDER, FISH_ORDER, JELLY_BY_COLOR, SPECIES } from "../game/data/fish";
import { DECOR, DECOR_ORDER } from "../game/data/decor";
import { GALLERY_PRICE, HALL_PRICE, TANKS, TANK_ORDER, TICKETS_PRICE } from "../game/data/tanks";
import { EXPANSION_FROM, galleryUnlocked, homesFor, isSpeciesUnlocked, padsFor, remodelPlan, tankById, UPGRADE_PRICE, type UpgradeKind } from "../game/logic/model";
import { SHOP_COLOR_PHRASE } from "../game/logic/english";
import { nextStep } from "../game/logic/guide";
import type { ColorId, SpeciesId, TankType } from "../game/types";
import { bagRemodelAnimal, buyDecorKind, buyGallery, buyHall, buyTankType, buyTankUpgrade, buyTicketGate, confirmRemodel, doneDecorate, HOME_REASON_TEXT, openDecorShop, pickTrayItem, putAway, shopHomeReason, startRemodel } from "../game/flow/actions";
import { Icon, type IconId } from "./icons";
import { DecorPicture, FishPicture, LampPicture, TankPicture as ShapePicture } from "./Portraits";
import { Ja } from "./Talk";

type ShopReason = { en: string; ja: string };
const needCoins = (n: number): ShopReason => ({ en: `Need ${n} more coins`, ja: `コインが あと ${n} まい ひつよう` });
const unlocksAt = (n: number): ShopReason => ({ en: `Unlocks at Level ${n}`, ja: `レベル ${n} で つかえるよ` });
const hallFirst: ShopReason = { en: "Open Ocean Hall first", ja: "さきに うみの ホールを ひらこう" };
const noSpace: ShopReason = { en: "No tank space", ja: "タンクの あきが ないよ" };

function DisabledReason({ reason }: { reason: ShopReason | null }) {
  return reason ? <small className="need shop-reason">{reason.en}<Ja>{reason.ja}</Ja></small> : null;
}

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
function AnimalCards({ list, testid, title }: { list: SpeciesId[]; testid: string; title?: string }) {
  const model = useGame((s) => s.model);
  const shopItem = useMemo(() => nextStep(model)?.shopItem, [model]);
  const expansion = model.progress.stage >= EXPANSION_FROM;
  return (
    <div className={`shop-strip ui ${expansion ? "expansion-animal-strip" : ""}`} data-testid={testid}>
      {expansion && title && <strong className="counter-title">{title}</strong>}
      <div className={expansion ? "counter-cards" : "legacy-counter-cards"}>
      {list.map((s) => {
        const def = SPECIES[s];
        const locked = !isSpeciesUnlocked(model, s);
        const short = model.coins < def.price;
        const homeless = !locked && homesFor(model, s) <= 0;
        const habitatReason = shopHomeReason(model, s);
        const reason = model.progress.stage < def.fromStage ? unlocksAt(def.fromStage)
          : def.needsHall && !model.progress.hallOpen ? hallFirst
            : homeless ? expansion ? HOME_REASON_TEXT[habitatReason] : noSpace : short ? needCoins(def.price - model.coins) : null;
        return (
          <div key={s} className={`card fish-card ${locked ? "locked" : ""} ${short || homeless ? "short" : ""} ${shopItem === s ? "guide shop-recommended" : ""}`} data-testid="shop-card" data-species={s} aria-disabled={Boolean(reason)}>
            <FishPicture species={s} size={110} />
            {expansion && <small className="animal-ja" lang="ja">{def.ja}</small>}
            {expansion && <span className="habitat-chips" aria-label="Habitats">
              {def.habitat.map((type) => <span key={type} className="habitat-chip" title={TANKS[type].ja} aria-label={TANKS[type].ja}><ShapePicture type={type} size={26} /></span>)}
            </span>}
            {locked ? (
              <span className="lockline">
                <Icon id="lock" size={20} />
              </span>
            ) : (
              <Price n={def.price} short={short} />
            )}
            <DisabledReason reason={reason} />
          </div>
        );
      })}
      </div>
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
  return <AnimalCards list={list} testid="fish-shop" title="Fish さかな" />;
}

/** The sea-animal counter: pictures and prices; the order is "A turtle, please!". */
export function AnimalShop() {
  const panel = useGame((s) => s.panel);
  const stage = useGame((s) => s.model.progress.stage);
  const prompt = useGame((s) => s.prompt);
  if (panel !== "animalShop") return null;
  if (stage < EXPANSION_FROM) return <AnimalCards list={ANIMAL_ORDER.filter((s) => SPECIES[s].fromStage < EXPANSION_FROM)} testid="animal-shop" />;
  if (prompt?.question?.en === "What color?") {
    const options = new Set(prompt.choices.map((c) => c.id).concat(prompt.sentences.map((c) => c.id)));
    const jellies = Object.entries(JELLY_BY_COLOR).filter(([color]) => options.has(SHOP_COLOR_PHRASE[color as ColorId]!)).map(([, species]) => species!);
    return <AnimalCards list={jellies} testid="jellyfish-choice" title="Jellyfish クラゲ" />;
  }
  return <div className="animal-counter-groups">
    <AnimalCards list={ANIMAL_ORDER.filter((s) => SPECIES[s].counter === "animal")} testid="animal-shop" title="Sea animals うみの いきもの" />
    <AnimalCards list={ANIMAL_ORDER.filter((s) => SPECIES[s].counter === "jelly")} testid="jellyfish-shop" title="Jellyfish クラゲ" />
  </div>;
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
          <DisabledReason reason={coins < v.price ? needCoins(v.price - coins) : null} />
        </div>
      ))}
    </div>
  );
}

export function DecorShop() {
  const panel = useGame((s) => s.panel);
  const model = useGame((s) => s.model);
  const { coins, progress: { stage } } = model;
  const shopItem = useMemo(() => nextStep(model)?.shopItem, [model]);
  const mode = useGame((s) => s.mode);
  if (panel !== "decorShop" || mode === "ask") return null;
  // Phase 2 decorations appear (locked) from Level 6, so there is something to look forward to.
  const expansionDecor = new Set(["kelp", "arch", "cave", "driftwood"]);
  const list = DECOR_ORDER.filter((k) => !expansionDecor.has(k) && (DECOR[k].fromStage <= 2 || stage >= 6) || stage >= EXPANSION_FROM);
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
          const reason = locked ? unlocksAt(def.fromStage) : short ? needCoins(min - coins) : null;
          return (
            <button
              key={k}
              className={`card decor-card ${short || locked ? "short" : ""} ${locked ? "locked" : ""} ${shopItem === k ? "guide shop-recommended" : ""}`}
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
                  <Icon id="lock" size={20} />
                </span>
              ) : (
                <Price n={prices.length > 1 ? `${min}-${Math.max(...prices)}` : min} short={short} />
              )}
              <DisabledReason reason={reason} />
              {def.size === "large" && !locked && (
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

const TANK_RESIDENTS: Partial<Record<TankType, string>> = {
  big: "さかな", tall: "タツノオトシゴ・クラゲ", hex: "ちいさな さかな・タツノオトシゴ",
  panorama: "さかなの むれ・エイ", cylinder: "クラゲ だけ", cave: "ウツボ・タコ・カニ・ハゼ"
};

/** Level 8 keeps each tank family in a short, independently scrolling row. */
function ExpansionTankShop() {
  const m = useGame((s) => s.model);
  const tankOffer = (type: TankType) => {
    const def = TANKS[type];
    const free = padsFor(m, type).length > m.inv.tanks.length;
    const remodel = !free && m.tanks.some((tank) => [null, "habitat", "full"].includes(remodelPlan(m, tank.id, type).reason));
    const reason = !free && !remodel ? noSpace : !remodel && m.coins < def.price ? needCoins(def.price - m.coins) : null;
    return <div key={type} className={`card expansion-tank-offer ${reason ? "short" : ""}`} data-shop-item={type}>
      <ShapePicture type={type} size={88} />
      <strong className="tank-offer-title">{def.name}<Ja>{def.ja}</Ja></strong>
      <div className="tank-capacities"><span className="cap"><Icon id="fish" size={20} /> × {def.capacity}</span><span className="cap"><Icon id="decor" size={20} /> × {def.slots.length}</span></div>
      <small className="tank-residents" lang="ja">{TANK_RESIDENTS[type]}</small>
      <Price n={def.price} short={!remodel && m.coins < def.price} />
      <DisabledReason reason={reason} />
      <button className={remodel ? "secondary buy" : "primary buy"} disabled={Boolean(reason)} onClick={() => remodel ? startRemodel(type) : buyTankType(type)} data-testid={type === "big" ? "btn-buy-tank" : `btn-buy-${type}`}>
        {remodel ? <>Remodel <Ja>かえる</Ja></> : <><Icon id="check" size={22} /> OK</>}
      </button>
    </div>;
  };
  const rooms = [
    ...(!m.progress.hallOpen ? [{ type: "hall" as const, name: "Ocean Hall", ja: "うみの ホール", price: HALL_PRICE, info: "Includes an Ocean tank", help: "うみの タンクが ついてくるよ", buy: buyHall, id: "btn-buy-hall" }] : []),
    ...(galleryUnlocked(m) && !m.progress.galleryOpen ? [{ type: "gallery" as const, name: "Jellyfish Gallery", ja: "クラゲの ギャラリー", price: GALLERY_PRICE, info: "Includes a Jelly column", help: "クラゲの まるい タンクが ついてくるよ", buy: buyGallery, id: "btn-buy-gallery" }] : []),
    ...(!m.progress.tickets ? [{ type: "tickets" as const, name: "Ticket Gate", ja: "チケットゲート", price: TICKETS_PRICE, info: "More visitors!", help: "おきゃくさんが ふえるよ", buy: buyTicketGate, id: "btn-buy-tickets" }] : [])
  ];
  return <div className="panel shop expansion-tank-shop ui" data-testid="tank-shop" role="dialog" aria-label="Tank shop">
    <header><Icon id="tank" size={30} /><h2>Tanks <Ja>タンク</Ja></h2><button className="round close-btn" onClick={() => setGame({ panel: null })} aria-label="Close" data-testid="shop-close"><Icon id="close" size={22} /></button></header>
    <div className="expansion-shop-sections">
      <section><h3>Classic tanks <Ja>いつもの タンク</Ja></h3><div className="expansion-offers">{TANK_ORDER.filter((type) => TANKS[type].group === "classic" && type !== "small" && type !== "ocean").map(tankOffer)}</div></section>
      <section><h3>Special tanks <Ja>とくべつな タンク</Ja></h3><div className="expansion-offers">{TANK_ORDER.filter((type) => TANKS[type].group === "special").map(tankOffer)}</div></section>
      {rooms.length > 0 && <section className="room-expansion-section"><h3>Room expansions <Ja>へやを ひろげる</Ja></h3><div className="expansion-offers">{rooms.map((room) => {
        const short = m.coins < room.price;
        return <div key={room.type} className="card expansion-tank-offer room-expansion-offer" data-shop-item={room.type}>
          <ShapePicture type={room.type} size={88} />
          {room.type !== "tickets" && <span className="room-badge">NEW ROOM</span>}
          <strong className="tank-offer-title">{room.name}<Ja>{room.ja}</Ja></strong>
          <small className="room-includes">{room.info}<Ja>{room.help}</Ja></small>
          <Price n={room.price} short={short} />
          <DisabledReason reason={short ? needCoins(room.price - m.coins) : null} />
          <button className="primary buy" onClick={room.buy} disabled={short} data-testid={room.id}><Icon id="check" size={22} /> OK</button>
        </div>;
      })}</div></section>}
    </div>
  </div>;
}

function RemodelPanel() {
  const m = useGame((s) => s.model);
  const placing = useGame((s) => s.placing);
  if (placing?.kind !== "remodel" || !placing.tankId) return null;
  const tank = tankById(m, placing.tankId);
  if (!tank) return null;
  const plan = remodelPlan(m, tank.id, placing.type);
  const short = m.coins < plan.cost;
  const blockers = plan.reason === "full" ? tank.fish : plan.blockers;
  const reason = plan.reason === "habitat" ? { en: "Move these animals first", ja: "この いきものを さきに うつそう" }
    : plan.reason === "full" ? { en: "Needs more space", ja: "いきものを かばんに いれて へらそう" }
      : plan.reason ? { en: "Choose another tank", ja: "ほかの タンクを えらぼう" }
        : short ? needCoins(plan.cost - m.coins) : null;
  const cancel = () => setGame({ panel: null, placing: null });
  return <div className="panel shop remodel-panel ui" data-testid="remodel-panel" role="dialog" aria-label="Remodel tank">
    <header><Icon id="tank" size={30} /><h2>Remodel <Ja>タンクを かえる</Ja></h2><button className="round close-btn" onClick={cancel} aria-label="Cancel remodel"><Icon id="close" size={22} /></button></header>
    <div className="remodel-before-after"><div><ShapePicture type={tank.type} size={110} /><strong>{TANKS[tank.type].name}<Ja>{TANKS[tank.type].ja}</Ja></strong></div><span aria-label="becomes">→</span><div><ShapePicture type={placing.type} size={110} /><strong>{TANKS[placing.type].name}<Ja>{TANKS[placing.type].ja}</Ja></strong></div></div>
    <div className="remodel-price"><span>Trade-in <Ja>まえの タンクの ぶん</Ja><Price n={plan.tradeIn} short={false} /></span><span>Cost <Ja>はらう コイン</Ja><Price n={plan.cost} short={short} /></span></div>
    {plan.toTray.length > 0 && <section className="remodel-tray"><strong>Back to the tray <Ja>かざりは トレーに もどるよ</Ja></strong><div>{plan.toTray.map((decor) => <DecorPicture key={decor.id} kind={decor.kind} variant={decor.variant} size={48} />)}</div></section>}
    {blockers.length > 0 && <section className="remodel-blockers"><strong>Move these animals <Ja>かばんに いれて ほかの タンクへ</Ja></strong><div className="remodel-animal-list">{blockers.map((fish) => <div key={fish.id} className="remodel-animal"><FishPicture species={fish.species} size={68} /><small lang="ja">{SPECIES[fish.species].ja}</small><button className="secondary" onClick={() => bagRemodelAnimal(fish.id)} data-testid="btn-bag-remodel-animal">Put in bag <Ja>かばんに いれる</Ja></button></div>)}</div></section>}
    <DisabledReason reason={reason} />
    <div className="remodel-buttons"><button className="secondary" onClick={cancel} data-testid="btn-cancel-remodel">Cancel <Ja>やめる</Ja></button><button className="primary" disabled={Boolean(reason)} onClick={confirmRemodel} data-testid="btn-confirm-remodel"><Icon id="check" size={22} /> Remodel <Ja>かえる</Ja></button></div>
  </div>;
}

/** The tank shop: the big tank, the tall tank, the Ocean Hall and the ticket gate, as they unlock. */
export function TankShop() {
  const panel = useGame((s) => s.panel);
  const m = useGame((s) => s.model);
  const shopItem = useMemo(() => nextStep(m)?.shopItem, [m]);
  if (panel === "remodel") return <RemodelPanel />;
  if (panel !== "tankShop") return null;
  if (m.progress.stage >= EXPANSION_FROM) return <ExpansionTankShop />;
  const p = m.progress;
  const tankReason = (type: "big" | "tall"): ShopReason | null => {
    if (p.stage < TANKS[type].fromStage) return unlocksAt(TANKS[type].fromStage);
    if (padsFor(m, type).length - m.inv.tanks.length <= 0) return !p.hallOpen && p.stage >= TANKS.ocean.fromStage ? hallFirst : noSpace;
    return null;
  };
  const offers: { id: string; pic: "big" | "tall" | "hall" | "tickets"; name: string; ja: string; price: number; caps: [IconId, number][]; info?: string; locked: ShopReason | null; buy: () => void }[] = [];
  offers.push({ id: "btn-buy-tank", pic: "big", name: "Big Tank", ja: "おおきな タンク", price: TANKS.big.price, caps: [["fish", TANKS.big.capacity], ["decor", TANKS.big.slots.length]], locked: tankReason("big"), buy: () => buyTankType("big") });
  if (p.stage >= 6 && !p.hallOpen) {
    offers.push({ id: "btn-buy-hall", pic: "hall", name: "Ocean Hall", ja: "うみの ホール", price: HALL_PRICE, caps: [["turtle", TANKS.ocean.capacity]], locked: null, buy: buyHall });
  }
  if (p.stage >= 6) {
    offers.push({
      id: "btn-buy-tall",
      pic: "tall",
      name: "Tall Tank",
      ja: "たかい タンク",
      price: TANKS.tall.price,
      caps: [["fish", TANKS.tall.capacity], ["decor", TANKS.tall.slots.length]],
      info: "タツノオトシゴ・クラゲ",
      locked: tankReason("tall"),
      buy: () => buyTankType("tall")
    });
  }
  if (p.stage >= 8 && !p.tickets) {
    offers.push({ id: "btn-buy-tickets", pic: "tickets", name: "Ticket Gate", ja: "チケットゲート", price: TICKETS_PRICE, caps: [["visitor", 4]], info: "おきゃくさんが ふえる", locked: null, buy: buyTicketGate });
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
          const reason = o.locked ?? (short ? needCoins(o.price - m.coins) : null);
          return (
            <div key={o.id} className={`card tank-offer ${o.pic === "hall" ? "hall-offer" : ""} ${o.locked ? "locked" : ""} ${shopItem === o.pic ? "guide shop-recommended" : ""}`} data-shop-item={o.pic}>
              <span className="tank-pic">
                <TankPicture type={o.pic} />
              </span>
              <div className="tank-info">
                {o.pic === "hall" && <span className="room-badge">NEW ROOM <span lang="ja">あたらしい へや</span></span>}
                <strong className="tank-offer-title">{o.name}<Ja>{o.ja}</Ja></strong>
                {o.pic === "hall" && <small className="info hall-description">Opens a new room and includes an Ocean tank.<Ja>あたらしい へやと うみの タンクが ついてくるよ！</Ja></small>}
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
                <Price n={o.price} short={short} />
                <DisabledReason reason={reason} />
              </div>
              <button className="primary buy" disabled={Boolean(reason)} onClick={() => o.buy()} data-testid={o.id} aria-label={`Buy ${o.name}`}>
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
  const model = useGame((s) => s.model);
  const coins = model.coins;
  const shopItem = useMemo(() => nextStep(model)?.shopItem, [model]);
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
              <div key={r.kind} className={`upgrade-row ${r.owned ? "owned" : ""} ${shopItem === r.kind ? "guide shop-recommended" : ""}`}>
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
                    <DisabledReason reason={short ? needCoins(price - coins) : null} />
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
  const guide = useGame((s) => s.guide === "tray" || s.nudge?.target === "tray");
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
