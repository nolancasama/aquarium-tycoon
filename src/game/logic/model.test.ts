import { describe, expect, it } from "vitest";
import {
  award,
  buyDecor,
  buyFish,
  buyTank,
  clean,
  completeStage,
  decay,
  earnStar,
  feed,
  finishSpecial,
  freeSpace,
  giftFish,
  goals,
  happiness,
  helpVisitor,
  judgeReady,
  latchHappy,
  markCounted,
  moveDecor,
  needsGift,
  newModel,
  placeDecor,
  placeFish,
  placeTank,
  stageDone,
  storeDecor,
  tankById,
  tipFor,
  type Model,
  type Result,
  buyTickets,
  buyUpgrade,
  canLive,
  earnSuperStar,
  homesFor,
  openHall,
  tankAt,
  happiness as happy
} from "./model";

type M = Model & { lastId?: string };

function ok(r: Result): M {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return Object.assign(r.m, { lastId: r.id });
}

const atStage = (m: Model, stage: 1 | 2 | 3 | 4 | 5): Model => ({ ...m, progress: { ...m.progress, stage, tutorial: stage > 1 ? "done" : "intro" } });

function withFish(m: Model, ...species: ("clownfish" | "bluetang" | "yellowfish")[]): Model {
  let out: M = { ...m, coins: m.coins + 1000 };
  for (const s of species) {
    out = ok(buyFish(out, s));
    out = ok(placeFish(out, out.inv.fish[0].id, out.tanks[0].id));
  }
  return { ...out, coins: m.coins };
}

describe("economy", () => {
  it("starts with 100 coins, one small tank and nothing else", () => {
    const m = newModel();
    expect(m.coins).toBe(100);
    expect(m.tanks).toHaveLength(1);
    expect(m.tanks[0]).toMatchObject({ type: "small", slot: "A", fish: [], decor: [] });
  });

  it("deducts the exact price and bags the fish", () => {
    const m = ok(buyFish(newModel(), "bluetang"));
    expect(m.coins).toBe(70);
    expect(m.inv.fish).toEqual([{ id: m.lastId, species: "bluetang" }]);
    expect(m.progress.firstFish).toBe("bluetang");
  });

  it("refuses purchases it cannot afford and changes nothing", () => {
    const m = { ...newModel(), coins: 19 };
    const r = buyFish(m, "clownfish");
    expect(r).toEqual({ ok: false, reason: "coins" });
    const d = buyDecor(atStage({ ...newModel(), coins: 4 }, 2), "plant", "small");
    expect(d).toEqual({ ok: false, reason: "coins" });
    const t = buyTank(atStage({ ...newModel(), coins: 79 }, 4), "big");
    expect(t).toEqual({ ok: false, reason: "coins" });
  });

  it("keeps the Yellow Fish locked until the Stage 2 reward", () => {
    expect(buyFish(newModel(), "yellowfish")).toEqual({ ok: false, reason: "locked" });
    expect(buyFish(atStage(newModel(), 3), "yellowfish").ok).toBe(true);
  });

  it("does not sell fish when every place is taken (bags count)", () => {
    let m: M = withFish(newModel(), "clownfish", "clownfish");
    expect(freeSpace(m)).toBe(1);
    m = ok(buyFish(m, "clownfish"));
    expect(freeSpace(m)).toBe(0);
    expect(buyFish(m, "clownfish")).toEqual({ ok: false, reason: "full" });
  });

  it("only places fish into a tank with room", () => {
    let m: M = withFish(newModel(), "clownfish", "clownfish", "clownfish");
    m = { ...m, inv: { ...m.inv, fish: [{ id: "fx", species: "clownfish" }] } };
    expect(placeFish(m, "fx", "t1")).toEqual({ ok: false, reason: "full" });
  });

  it("sells tanks only after Stage 3, and only while a slot is free", () => {
    const early = { ...newModel(), coins: 500 };
    expect(buyTank(early, "big")).toEqual({ ok: false, reason: "locked" });
    let m: M = ok(buyTank(atStage(early, 4), "big"));
    expect(m.coins).toBe(420);
    expect(buyTank(m, "big")).toEqual({ ok: false, reason: "full" });
    m = ok(placeTank(m, "big", "B"));
    expect(m.tanks.map((t) => [t.type, t.slot])).toEqual([
      ["small", "A"],
      ["big", "B"]
    ]);
    expect(placeTank(m, "big", "A")).toEqual({ ok: false, reason: "missing" });
  });

  it("refuses to place a tank on a taken slot", () => {
    const m = ok(buyTank(atStage({ ...newModel(), coins: 100 }, 4), "big"));
    expect(placeTank(m, "big", "A")).toEqual({ ok: false, reason: "slotTaken" });
  });

  it("pays a reward key only once", () => {
    let m: M = award(newModel(), 10, "v1");
    m = award(m, 10, "v1");
    expect(m.coins).toBe(110);
    m = helpVisitor(m, "v2", 10);
    m = helpVisitor(m, "v2", 10);
    expect(m.coins).toBe(120);
    expect(m.progress.hearts).toBe(1);
    expect(m.progress.helpedInStage).toBe(1);
    expect(m.stats.coinsEarned).toBe(20);
  });

  it("gives a free clownfish only when there is no other way to get a fish", () => {
    const broke = { ...newModel(), coins: 5 };
    expect(needsGift(broke)).toBe(true);
    const m = ok(giftFish(broke));
    expect(m.inv.fish[0].species).toBe("clownfish");
    expect(needsGift(m)).toBe(false);
    expect(giftFish(m).ok).toBe(false);
    expect(needsGift(withFish({ ...newModel(), coins: 0 }, "clownfish"))).toBe(false);
  });
});

describe("decorations", () => {
  it("are locked until the Stage 1 reward", () => {
    expect(buyDecor(newModel(), "rock", "big")).toEqual({ ok: false, reason: "locked" });
  });

  it("are bought, placed, moved (swapping) and put away", () => {
    let m: M = atStage(newModel(), 2);
    m = ok(buyDecor(m, "coral", "red"));
    expect(m.coins).toBe(90);
    const coral = m.lastId!;
    m = ok(buyDecor(m, "rock", "small"));
    const rock = m.lastId!;
    m = ok(placeDecor(m, coral, "t1", 0));
    expect(placeDecor(m, rock, "t1", 0)).toEqual({ ok: false, reason: "slotTaken" });
    expect(placeDecor(m, rock, "t1", 3)).toEqual({ ok: false, reason: "missing" });
    m = ok(placeDecor(m, rock, "t1", 2));
    m = ok(moveDecor(m, "t1", 0, 2));
    const t = tankById(m, "t1")!;
    expect(t.decor.find((d) => d.slot === 2)?.id).toBe(coral);
    expect(t.decor.find((d) => d.slot === 0)?.id).toBe(rock);
    m = ok(storeDecor(m, "t1", 2));
    expect(tankById(m, "t1")!.decor).toHaveLength(1);
    expect(m.inv.decor.map((d) => d.id)).toEqual([coral]);
  });
});

describe("care", () => {
  it("feeding adds food (capped) and is refused when the fish are full", () => {
    let m: M = withFish(newModel(), "clownfish");
    m = decay(m, 150); // food 100 -> 50
    expect(tankById(m, "t1")!.food).toBeCloseTo(50);
    m = ok(feed(m, "t1"));
    expect(tankById(m, "t1")!.food).toBe(100);
    expect(m.progress.fedOnce).toBe(true);
    expect(feed(m, "t1")).toEqual({ ok: false, reason: "foodFull" });
    expect(feed(newModel(), "t1")).toEqual({ ok: false, reason: "empty" });
  });

  it("cleaning restores the water", () => {
    let m: M = withFish(newModel(), "clownfish");
    m = decay(m, 200);
    expect(tankById(m, "t1")!.clean).toBeCloseTo(60);
    m = ok(clean(m, "t1"));
    expect(tankById(m, "t1")!.clean).toBe(100);
    expect(m.progress.cleanedOnce).toBe(true);
  });

  it("decays only tanks with fish, and never below zero", () => {
    let m: M = withFish(newModel(), "clownfish");
    m = decay(m, 30);
    expect(tankById(m, "t1")!.food).toBeCloseTo(90);
    expect(tankById(m, "t1")!.clean).toBeCloseTo(94);
    m = decay(m, 10_000);
    expect(tankById(m, "t1")!.food).toBe(0);
    expect(tankById(m, "t1")!.clean).toBe(0);
    expect(decay(newModel(), 100).tanks[0].food).toBe(100);
  });

  it("happiness follows food, cleanliness and decorations", () => {
    let m: M = withFish(atStage(newModel(), 2), "clownfish");
    const t0 = tankById(m, "t1")!;
    expect(happiness(t0)).toBe(60); // fed and clean, nothing to play with
    m = { ...m, coins: 100 };
    m = ok(buyDecor(m, "coral", "blue"));
    m = ok(placeDecor(m, m.lastId!, "t1", 0));
    expect(happiness(tankById(m, "t1")!)).toBe(78); // +8 joy, +10 the clownfish likes coral
    const hungry = decay(m, 300);
    const h = happiness(tankById(hungry, "t1")!)!;
    expect(h).toBeLessThan(78);
    const fed = ok(feed(hungry, "t1"));
    expect(happiness(tankById(fed, "t1")!)!).toBeGreaterThan(h);
    const cleaned = ok(clean(fed, "t1"));
    expect(happiness(tankById(cleaned, "t1")!)!).toBeGreaterThan(happiness(tankById(fed, "t1")!)!);
    expect(happiness(newModel().tanks[0])).toBeNull();
  });

  it("tips 1-3 coins per tank depending on happiness", () => {
    const m = withFish(newModel(), "clownfish");
    expect(tipFor(tankById(m, "t1")!)).toBe(2); // 60: okay
    expect(tipFor(tankById(decay(m, 10_000), "t1")!)).toBe(1);
    const happy = { ...m.tanks[0], decor: [{ id: "x", kind: "chest" as const, variant: null, slot: 0 }, { id: "y", kind: "coral" as const, variant: "red" as const, slot: 1 }] };
    expect(tipFor(happy)).toBe(3);
    expect(tipFor(newModel().tanks[0])).toBe(0);
  });
});

describe("progression", () => {
  it("Stage 1 rewards decorations and two free ones", () => {
    let m: M = ok(buyFish(newModel(), "clownfish"));
    m = ok(placeFish(m, m.lastId!, "t1"));
    expect(stageDone(m)).toBe(false);
    m = decay(m, 60);
    m = ok(feed(m, "t1"));
    m = helpVisitor(m, "tutorial", 10);
    expect(goals(m).every((g) => g.done)).toBe(true);
    m = ok(completeStage(m));
    expect(m.progress.stage).toBe(2);
    expect(m.progress.tutorial).toBe("decorate");
    expect(m.progress.helpedInStage).toBe(0);
    expect(m.inv.decor.map((d) => [d.kind, d.variant])).toEqual([
      ["plant", "small"],
      ["shell", null]
    ]);
  });

  it("Stage 2 needs two fish, the count and a clean; it unlocks the Yellow Fish", () => {
    let m: M = withFish(atStage(newModel(), 2), "clownfish");
    expect(completeStage(m).ok).toBe(false);
    m = withFish(m, "bluetang");
    m = markCounted(m);
    expect(stageDone(m)).toBe(false);
    m = ok(clean(m, "t1"));
    m = ok(completeStage(m));
    expect(m.progress.stage).toBe(3);
    expect(buyFish(m, "yellowfish").ok).toBe(true);
  });

  it("Stage 3 needs three helped visitors and unlocks tanks", () => {
    let m: M = withFish(atStage(newModel(), 3), "clownfish");
    m = helpVisitor(helpVisitor(m, "a", 10), "b", 10);
    expect(completeStage(m).ok).toBe(false);
    m = helpVisitor(m, "c", 10);
    m = ok(completeStage(m));
    expect(m.progress.stage).toBe(4);
    expect(buyTank({ ...m, coins: 80 }, "big").ok).toBe(true);
  });

  it("Stage 4 needs the big tank with a fish and two decorations, then the special visitor pays once", () => {
    let m: M = withFish(atStage(newModel(), 4), "clownfish");
    m = { ...m, coins: 200 };
    m = ok(buyTank(m, "big"));
    m = ok(placeTank(m, "big", "B"));
    const big = m.lastId!;
    m = ok(buyFish(m, "clownfish"));
    m = ok(placeFish(m, m.lastId!, big));
    m = ok(buyDecor(m, "rock", "big"));
    m = ok(placeDecor(m, m.lastId!, big, 0));
    expect(stageDone(m)).toBe(false);
    m = ok(buyDecor(m, "shell", null));
    m = ok(placeDecor(m, m.lastId!, big, 4));
    m = ok(completeStage(m));
    expect(m.progress).toMatchObject({ stage: 5, specialPending: true });
    const coins = m.coins;
    m = finishSpecial(finishSpecial(m));
    expect(m.coins).toBe(coins + 30);
    expect(m.progress).toMatchObject({ specialPending: false, photo: true });
  });

  it("Stage 5 latches 'all happy', then the judge's star opens free play", () => {
    let m: M = withFish(atStage(newModel(), 5), "clownfish");
    m = helpVisitor(helpVisitor(helpVisitor(m, "a", 10), "b", 10), "c", 10);
    expect(judgeReady(m)).toBe(false);
    m = latchHappy(m); // 60: not happy yet
    expect(m.progress.allHappy).toBe(false);
    m = { ...m, coins: 100 };
    m = ok(buyDecor(m, "coral", "red"));
    m = ok(placeDecor(m, m.lastId!, "t1", 0));
    m = latchHappy(m);
    expect(m.progress.allHappy).toBe(true);
    // Latched: getting hungry later does not undo it.
    m = latchHappy(decay(m, 600));
    expect(judgeReady(m)).toBe(true);
    const coins = m.coins;
    m = earnStar(earnStar(m));
    expect(m.coins).toBe(coins + 50);
    expect(m.progress).toMatchObject({ star: true, freePlay: true, stage: 6 });
    // Free play goes on with Level 6's goals.
    expect(goals(m).map((g) => g.id)).toEqual(["openHall", "turtle", "help"]);
    expect(judgeReady(m)).toBe(false);
  });
});

// ------------------------------------------------------------------ Phase 2

/** A starred aquarium at Level 6, 7 or 8 with plenty of coins. */
function level(stage: 6 | 7 | 8, coins = 1000): M {
  const base = withFish(atStage(newModel(), 5), "clownfish");
  return { ...base, coins, progress: { ...base.progress, stage, star: true, freePlay: true } };
}

describe("Phase 2: the Ocean Hall and habitats", () => {
  it("the Ocean Hall opens at Level 6 for 100 coins, with the Ocean tank on pad C", () => {
    expect(openHall({ ...withFish(atStage(newModel(), 5), "clownfish"), coins: 500 })).toEqual({ ok: false, reason: "locked" });
    expect(openHall(level(6, 99))).toEqual({ ok: false, reason: "coins" });
    const m = ok(openHall(level(6, 150)));
    expect(m.coins).toBe(50);
    expect(tankAt(m, "C")).toMatchObject({ type: "ocean", fish: [] });
    expect(m.progress.hallOpen).toBe(true);
    expect(openHall(m)).toEqual({ ok: false, reason: "owned" });
  });

  it("turtles live only in the Ocean tank, and are sold only once it exists", () => {
    expect(buyFish(level(6), "turtle")).toEqual({ ok: false, reason: "locked" });
    let m: M = ok(openHall(level(6)));
    m = ok(buyFish(m, "turtle"));
    const turtle = m.lastId!;
    expect(placeFish(m, turtle, "t1")).toEqual({ ok: false, reason: "habitat" });
    m = ok(placeFish(m, turtle, tankAt(m, "C")!.id));
    expect(tankAt(m, "C")!.fish.map((f) => f.species)).toEqual(["turtle"]);
  });

  it("seahorses need a tall tank; jellyfish live only with jellyfish", () => {
    let m: M = ok(openHall(level(7)));
    expect(buyFish(m, "seahorse")).toEqual({ ok: false, reason: "habitat" });
    m = ok(buyTank(m, "tall"));
    m = ok(placeTank(m, "tall", "D"));
    const tall = m.lastId!;
    m = ok(buyFish(m, "jellyfish"));
    m = ok(placeFish(m, m.lastId!, tall));
    const t = tankById(m, tall)!;
    expect(canLive("jellyfish", t)).toBe(true);
    expect(canLive("seahorse", t)).toBe(false);
    expect(canLive("clownfish", t)).toBe(false);
    // And no jellyfish into a tank with fish.
    expect(canLive("jellyfish", tankAt(m, "A")!)).toBe(false);
    m = ok(buyFish(m, "clownfish"));
    expect(placeFish(m, m.lastId!, tall)).toEqual({ ok: false, reason: "habitat" });
  });

  it("homes count bagged animals; the shop refuses when every home is taken", () => {
    let m: M = ok(openHall(level(6)));
    for (let i = 0; i < 8; i++) m = ok(buyFish(m, "turtle"));
    expect(homesFor(m, "turtle")).toBe(0);
    expect(buyFish(m, "turtle")).toEqual({ ok: false, reason: "full" });
  });

  it("tall tanks from Level 7; Ocean Hall pads only once it is open; pad C takes only the Ocean tank", () => {
    expect(buyTank(level(6), "tall")).toEqual({ ok: false, reason: "locked" });
    let m: M = level(7);
    m = ok(buyTank(m, "tall"));
    // Only pad B is free before the hall opens.
    expect(buyTank(m, "tall")).toEqual({ ok: false, reason: "full" });
    expect(placeTank(m, "tall", "D")).toEqual({ ok: false, reason: "locked" });
    m = ok(openHall(m));
    expect(placeTank(m, "tall", "C")).toEqual({ ok: false, reason: "slotTaken" });
    m = ok(placeTank(m, "tall", "E"));
    expect(tankAt(m, "E")!.type).toBe("tall");
  });

  it("shipwrecks are too big for small and tall tanks; new decorations come with Level 8", () => {
    let m: M = level(8);
    m = ok(buyDecor(m, "shipwreck", null));
    expect(placeDecor(m, m.lastId!, "t1", 0)).toEqual({ ok: false, reason: "tooBig" });
    expect(buyDecor(level(7), "starfish", "pink")).toEqual({ ok: false, reason: "locked" });
  });
});

describe("Phase 2: upgrades", () => {
  it("are the Level 7 reward", () => {
    expect(buyUpgrade(level(7), "t1", "lamp")).toEqual({ ok: false, reason: "locked" });
    expect(buyTickets(level(7))).toEqual({ ok: false, reason: "locked" });
  });

  it("a filter halves how fast the water gets dirty", () => {
    let m: M = ok(buyUpgrade(level(8), "t1", "filter"));
    expect(m.coins).toBe(960);
    expect(m.progress.upgraded).toBe(true);
    m = decay(m, 100);
    expect(tankById(m, "t1")!.clean).toBeCloseTo(90);
    expect(buyUpgrade(m, "t1", "filter")).toEqual({ ok: false, reason: "owned" });
  });

  it("a lamp adds happiness, and jellyfish love it", () => {
    let m: M = ok(openHall(level(8)));
    m = ok(buyTank(m, "tall"));
    m = ok(placeTank(m, "tall", "D"));
    const tall = m.lastId!;
    m = ok(buyFish(m, "jellyfish"));
    m = ok(placeFish(m, m.lastId!, tall));
    const before = happy(tankById(m, tall)!)!;
    m = ok(buyUpgrade(m, tall, "lamp"));
    expect(happy(tankById(m, tall)!)!).toBe(before + 5 + 10);
  });

  it("a small tank grows into a big one, keeping its animals and decorations", () => {
    let m: M = level(8);
    m = ok(buyDecor(m, "rock", "big"));
    m = ok(placeDecor(m, m.lastId!, "t1", 2));
    m = ok(buyUpgrade(m, "t1", "bigger"));
    const t = tankById(m, "t1")!;
    expect(t.type).toBe("big");
    expect(t.fish).toHaveLength(1);
    expect(t.decor.map((d) => d.slot)).toEqual([4]);
    expect(buyUpgrade(m, "t1", "bigger")).toEqual({ ok: false, reason: "owned" });
  });

  it("the ticket gate is bought once", () => {
    const m = ok(buyTickets(level(8)));
    expect(m.progress.tickets).toBe(true);
    expect(buyTickets(m)).toEqual({ ok: false, reason: "owned" });
  });
});

describe("Phase 2: Levels 6 to 8", () => {
  it("Level 6 needs the hall, a turtle and two visitors; it unlocks the tall tank and its animals", () => {
    let m: M = ok(openHall(level(6)));
    m = ok(buyFish(m, "turtle"));
    m = ok(placeFish(m, m.lastId!, tankAt(m, "C")!.id));
    m = helpVisitor(m, "a", 10);
    expect(completeStage(m).ok).toBe(false);
    m = helpVisitor(m, "b", 10);
    m = ok(completeStage(m));
    expect(m.progress.stage).toBe(7);
    expect(buyTank(m, "tall").ok).toBe(true);
  });

  it("Level 7 needs a tall tank with a seahorse or jellyfish and two named animals", () => {
    let m: M = ok(openHall(level(7)));
    m = ok(buyTank(m, "tall"));
    m = ok(placeTank(m, "tall", "D"));
    m = ok(buyFish(m, "seahorse"));
    m = ok(placeFish(m, m.lastId!, tankAt(m, "D")!.id));
    m = helpVisitor(m, "a", 10, true);
    m = helpVisitor(m, "b", 10);
    expect(completeStage(m).ok).toBe(false);
    m = helpVisitor(m, "c", 10, true);
    m = ok(completeStage(m));
    expect(m.progress).toMatchObject({ stage: 8, allHappy: false, namedInStage: 0 });
  });

  it("Level 8 needs an upgrade, three visitors and happy animals; the crown pays once", () => {
    let m: M = level(8);
    m = ok(buyUpgrade(m, "t1", "lamp"));
    m = helpVisitor(helpVisitor(helpVisitor(m, "a", 10), "b", 10), "c", 10);
    expect(judgeReady(m)).toBe(false);
    m = ok(buyDecor(m, "coral", "red"));
    m = ok(placeDecor(m, m.lastId!, "t1", 0));
    m = latchHappy(m);
    expect(judgeReady(m)).toBe(true);
    const coins = m.coins;
    m = earnSuperStar(earnSuperStar(m));
    expect(m.coins).toBe(coins + 80);
    expect(goals(m)).toEqual([]);
    expect(judgeReady(m)).toBe(false);
    expect(completeStage(m).ok).toBe(false);
  });
});
