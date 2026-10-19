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
  type Result
} from "./model";

function ok(r: Result): Model & { lastId?: string } {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return Object.assign(r.m, { lastId: r.id });
}

const atStage = (m: Model, stage: 1 | 2 | 3 | 4 | 5): Model => ({ ...m, progress: { ...m.progress, stage, tutorial: stage > 1 ? "done" : "intro" } });

function withFish(m: Model, ...species: ("clownfish" | "bluetang" | "yellowfish")[]): Model {
  let out = { ...m, coins: m.coins + 1000 };
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
    let m = withFish(newModel(), "clownfish", "clownfish");
    expect(freeSpace(m)).toBe(1);
    m = ok(buyFish(m, "clownfish"));
    expect(freeSpace(m)).toBe(0);
    expect(buyFish(m, "clownfish")).toEqual({ ok: false, reason: "full" });
  });

  it("only places fish into a tank with room", () => {
    let m = withFish(newModel(), "clownfish", "clownfish", "clownfish");
    m = { ...m, inv: { ...m.inv, fish: [{ id: "fx", species: "clownfish" }] } };
    expect(placeFish(m, "fx", "t1")).toEqual({ ok: false, reason: "full" });
  });

  it("sells tanks only after Stage 3, and only while a slot is free", () => {
    const early = { ...newModel(), coins: 500 };
    expect(buyTank(early, "big")).toEqual({ ok: false, reason: "locked" });
    let m = ok(buyTank(atStage(early, 4), "big"));
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
    let m = award(newModel(), 10, "v1");
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
    let m = atStage(newModel(), 2);
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
    let m = withFish(newModel(), "clownfish");
    m = decay(m, 150); // food 100 -> 50
    expect(tankById(m, "t1")!.food).toBeCloseTo(50);
    m = ok(feed(m, "t1"));
    expect(tankById(m, "t1")!.food).toBe(100);
    expect(m.progress.fedOnce).toBe(true);
    expect(feed(m, "t1")).toEqual({ ok: false, reason: "foodFull" });
    expect(feed(newModel(), "t1")).toEqual({ ok: false, reason: "empty" });
  });

  it("cleaning restores the water", () => {
    let m = withFish(newModel(), "clownfish");
    m = decay(m, 200);
    expect(tankById(m, "t1")!.clean).toBeCloseTo(60);
    m = ok(clean(m, "t1"));
    expect(tankById(m, "t1")!.clean).toBe(100);
    expect(m.progress.cleanedOnce).toBe(true);
  });

  it("decays only tanks with fish, and never below zero", () => {
    let m = withFish(newModel(), "clownfish");
    m = decay(m, 30);
    expect(tankById(m, "t1")!.food).toBeCloseTo(90);
    expect(tankById(m, "t1")!.clean).toBeCloseTo(94);
    m = decay(m, 10_000);
    expect(tankById(m, "t1")!.food).toBe(0);
    expect(tankById(m, "t1")!.clean).toBe(0);
    expect(decay(newModel(), 100).tanks[0].food).toBe(100);
  });

  it("happiness follows food, cleanliness and decorations", () => {
    let m = withFish(atStage(newModel(), 2), "clownfish");
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
    let m = ok(buyFish(newModel(), "clownfish"));
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
    let m = withFish(atStage(newModel(), 2), "clownfish");
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
    let m = withFish(atStage(newModel(), 3), "clownfish");
    m = helpVisitor(helpVisitor(m, "a", 10), "b", 10);
    expect(completeStage(m).ok).toBe(false);
    m = helpVisitor(m, "c", 10);
    m = ok(completeStage(m));
    expect(m.progress.stage).toBe(4);
    expect(buyTank({ ...m, coins: 80 }, "big").ok).toBe(true);
  });

  it("Stage 4 needs the big tank with a fish and two decorations, then the special visitor pays once", () => {
    let m = withFish(atStage(newModel(), 4), "clownfish");
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
    let m = withFish(atStage(newModel(), 5), "clownfish");
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
    expect(m.progress).toMatchObject({ star: true, freePlay: true });
    expect(goals(m)).toEqual([]);
    expect(judgeReady(m)).toBe(false);
  });
});
