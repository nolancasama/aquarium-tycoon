import { describe, expect, it } from "vitest";
import {
  buyDecor,
  buyFish,
  buyTank,
  clean,
  completeStage,
  decay,
  earnStar,
  feed,
  finishSpecial,
  helpVisitor,
  judgeReady,
  latchHappy,
  markCounted,
  newModel,
  placeDecor,
  placeFish,
  placeTank,
  stageDone,
  tipFor,
  type Model,
  type Result,
  buyUpgrade,
  earnSuperStar,
  happiness,
  openHall,
  UPGRADE_PRICE
} from "./model";
import { HALL_PRICE, TANKS } from "../data/tanks";
import { SPECIES } from "../data/fish";
import type { SpeciesId } from "../types";

/**
 * A simulated student plays the five stages with the real rules: fish need
 * feeding, every visitor tips, request visitors pay. These runs are how the
 * prices are balanced (DESIGN_DECISIONS: the Big tank must be affordable after
 * at most ~6 helped visitors in Stages 3–4, and there is no dead end).
 */

type M = Model & { lastId?: string };

function ok(r: Result): M {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return Object.assign(r.m, { lastId: r.id });
}

let visitorId = 0;

/** ~45 s of play: one ordinary visitor tips at every tank, and the student feeds/cleans when needed. */
function playAWhile(m: Model): Model {
  let out: M = decay(m, 45);
  for (const t of out.tanks) {
    if (t.fish.length && t.food < 50) out = ok(feed(out, t.id));
    if (t.fish.length && t.clean < 50) out = ok(clean(out, t.id));
  }
  const tips = out.tanks.reduce((n, t) => n + tipFor(t), 0);
  return { ...out, coins: out.coins + tips, stats: { ...out.stats, coinsEarned: out.stats.coinsEarned + tips } };
}

/** One request visitor helped (10, or 15 when the tank is happy), after a while of play. */
function helpOne(m: Model): Model {
  const out = playAWhile(m);
  const reward = out.tanks.some((t) => tipFor(t) === 3) ? 15 : 10;
  return helpVisitor(out, `v${++visitorId}`, reward);
}

function buyAndPlace(m: Model, s: SpeciesId, tankId: string): Model {
  const out = ok(buyFish(m, s));
  return ok(placeFish(out, out.lastId!, tankId));
}

function play(first: SpeciesId, second: SpeciesId, spendy: boolean) {
  let m: M = newModel();
  let minCoins = m.coins;
  const track = () => (minCoins = Math.min(minCoins, m.coins));
  // Stage 1 (tutorial).
  m = buyAndPlace(m, first, "t1");
  m = ok(feed(decay(m, 60), "t1"));
  m = helpVisitor(m, "tutorial", 10);
  m = ok(completeStage(m));
  // Pico helps place the free plant.
  m = ok(placeDecor(m, m.inv.decor[0].id, "t1", 0));
  track();
  // Stage 2.
  m = buyAndPlace(m, second, "t1");
  if (spendy) {
    m = ok(buyDecor(m, "chest", null));
    m = ok(placeDecor(m, m.lastId!, "t1", 1));
  }
  m = markCounted(playAWhile(m));
  m = ok(clean(m, "t1"));
  m = ok(completeStage(m));
  track();
  // Stage 3: three request visitors.
  let helped = 0;
  while (!stageDone(m)) {
    m = helpOne(m);
    helped++;
  }
  m = ok(completeStage(m));
  // Stage 4: help visitors until the Big tank is affordable.
  while (m.coins < TANKS.big.price) {
    m = helpOne(m);
    helped++;
    if (helped > 20) throw new Error("the big tank never became affordable");
  }
  const helpedForTank = helped;
  m = ok(buyTank(m, "big"));
  m = ok(placeTank(m, "big", "B"));
  const big = m.lastId!;
  track();
  while (m.coins < 20) m = helpOne(m);
  m = buyAndPlace(m, "clownfish", big);
  track();
  // Two decorations: the free shell from the tray, and a bought (or moved) one.
  m = ok(placeDecor(m, m.inv.decor[0].id, big, 0));
  while (m.coins < 10) m = helpOne(m);
  m = ok(buyDecor(m, "coral", "red"));
  m = ok(placeDecor(m, m.lastId!, big, 4));
  m = ok(completeStage(m));
  m = finishSpecial(m);
  track();
  // Stage 5: three more visitors, and every tank happy at once.
  let guard = 0;
  while (!judgeReady(m)) {
    m = helpOne(m);
    for (const t of m.tanks) {
      if (t.food < 90) m = ok(feed(m, t.id));
      m = ok(clean(m, t.id));
    }
    // Buy what the fish like when the coins allow it.
    if (!m.progress.allHappy && m.coins >= 8) {
      const t = m.tanks.find((x) => x.decor.length < TANKS[x.type].slots.length)!;
      const free = TANKS[t.type].slots.findIndex((_, i) => !t.decor.some((d) => d.slot === i));
      m = ok(buyDecor(m, "plant", "big"));
      m = ok(placeDecor(m, m.lastId!, t.id, free));
    }
    m = latchHappy(m);
    if (++guard > 40) throw new Error("Stage 5 never completed");
  }
  m = earnStar(m);
  track();
  return { m, helpedForTank, minCoins };
}

/** Levels 6–8 from a starred aquarium: the Ocean Hall, a turtle, a tall tank with jellyfish, a lamp, the crown. */
function playPhase2(start: Model) {
  let m = start;
  let helped = 0;
  let minCoins = m.coins;
  const help = (named = false) => {
    m = playAWhile(m);
    const reward = m.tanks.some((t) => tipFor(t) === 3) ? 15 : 10;
    m = helpVisitor(m, `p${++visitorId}`, reward, named);
    helped++;
    if (helped > 80) throw new Error("Phase 2 never finished");
  };
  const spend = (r: Result) => {
    m = ok(r);
    minCoins = Math.min(minCoins, m.coins);
    return (r as { id?: string }).id;
  };
  // Level 6.
  while (m.coins < HALL_PRICE) help();
  spend(openHall(m));
  const ocean = m.tanks.find((t) => t.type === "ocean")!.id;
  while (m.coins < SPECIES.turtle.price) help();
  const turtle = spend(buyFish(m, "turtle"))!;
  spend(placeFish(m, turtle, ocean));
  while (!stageDone(m)) help();
  spend(completeStage(m));
  const level6 = helped;
  // Level 7.
  while (m.coins < TANKS.tall.price) help();
  spend(buyTank(m, "tall"));
  const tall = spend(placeTank(m, "tall", "D"))!;
  while (m.coins < SPECIES.jellyfish.price) help();
  const jelly = spend(buyFish(m, "jellyfish"))!;
  spend(placeFish(m, jelly, tall));
  while (!stageDone(m)) help(true);
  spend(completeStage(m));
  const level7 = helped - level6;
  // Level 8: the jellyfish love a lamp; the turtle likes plants.
  while (m.coins < UPGRADE_PRICE.lamp) help();
  spend(buyUpgrade(m, tall, "lamp"));
  let guard = 0;
  while (!judgeReady(m)) {
    help();
    for (const t of m.tanks) {
      if (t.fish.length && t.food < 90) m = ok(feed(m, t.id));
      m = ok(clean(m, t.id));
    }
    m = latchHappy(m);
    const unhappy = m.tanks.find((t) => t.fish.length && (happiness(t) ?? 0) < 70 && t.decor.length < TANKS[t.type].slots.length);
    if (unhappy && m.coins >= 8) {
      const free = TANKS[unhappy.type].slots.findIndex((_, i) => !unhappy.decor.some((d) => d.slot === i));
      const plant = spend(buyDecor(m, "plant", "big"))!;
      spend(placeDecor(m, plant, unhappy.id, free));
    }
    m = latchHappy(m);
    if (++guard > 40) throw new Error("Level 8 never finished");
  }
  m = earnSuperStar(m);
  return { m, helped, level6, level7, minCoins };
}

describe("economy simulation", () => {
  const paths: [SpeciesId, SpeciesId, boolean][] = [
    ["clownfish", "clownfish", false],
    ["bluetang", "bluetang", false],
    ["bluetang", "bluetang", true],
    ["clownfish", "bluetang", true]
  ];
  for (const [a, b, spendy] of paths) {
    it(`completes all five stages (${a} then ${b}${spendy ? ", buys a chest early" : ""})`, () => {
      const { m, helpedForTank, minCoins } = play(a, b, spendy);
      expect(m.progress.star).toBe(true);
      expect(m.progress.freePlay).toBe(true);
      expect(minCoins).toBeGreaterThanOrEqual(0);
      // The Big tank is within reach in a short first session.
      expect(helpedForTank).toBeLessThanOrEqual(6);
    });
  }

  it("Phase 2: Levels 6 to 8 finish from a typical star without a dead end, in a classroom-sized number of visitors", () => {
    const { m: starred } = play("bluetang", "bluetang", true);
    const { m, helped, level6, level7, minCoins } = playPhase2(starred);
    expect(m.progress.superStar).toBe(true);
    expect(minCoins).toBeGreaterThanOrEqual(0);
    // About one request visitor a minute: each level fits in a lesson.
    expect(level6).toBeLessThanOrEqual(12);
    expect(level7).toBeLessThanOrEqual(10);
    expect(helped).toBeLessThanOrEqual(35);
  });

  it("a student who spent everything can always earn again while a fish is in a tank", () => {
    let m: M = buyAndPlace(newModel(), "bluetang", "t1");
    m = { ...m, coins: 0 };
    // Even starving, dirty fish still earn a coin per visitor.
    m = decay(m, 10_000);
    const tips = m.tanks.reduce((n, t) => n + tipFor(t), 0);
    expect(tips).toBeGreaterThanOrEqual(1);
  });
});
