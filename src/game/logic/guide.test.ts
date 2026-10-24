import { describe, expect, it } from "vitest";
import { SPECIES } from "../data/fish";
import { HALL_PRICE, TANKS } from "../data/tanks";
import type { StageId } from "../types";
import { nextStep } from "./guide";
import { buyFish, goals, newModel, newTank, openHall, placeFish, UPGRADE_PRICE, type Goal, type Model, type Result } from "./model";
import { decodeSave } from "./save";

function ok(result: Result): Model {
  if (!result.ok) throw new Error(`Purchase or placement refused: ${result.reason}`);
  return result.m;
}

function level(stage: StageId): Model {
  const m = newModel();
  m.coins = HALL_PRICE + TANKS.big.price + TANKS.tall.price + SPECIES.turtle.price + SPECIES.seahorse.price;
  m.progress.stage = stage;
  m.progress.tutorial = "done";
  m.progress.star = stage >= 6;
  m.tanks[0].fish = [{ id: "f-start", species: "clownfish" }];
  m.tanks[0].food = 50;
  if (stage === 1) m.tanks[0].fish = [];
  return m;
}

/** Finish exactly one panel goal, so each subsequent assertion checks panel order. */
function finish(m: Model, id: Goal["id"]) {
  switch (id) {
    case "buyFish": m.tanks[0].fish = [{ id: "f-start", species: "clownfish" }]; break;
    case "feed": m.progress.fedOnce = true; break;
    case "visitor": m.progress.hearts = 1; break;
    case "twoFish": m.tanks[0].fish = [{ id: "f-start", species: "clownfish" }, { id: "f-other", species: "bluetang" }]; break;
    case "count": m.progress.counted = true; break;
    case "clean": m.progress.cleanedOnce = true; break;
    case "help": m.progress.helpedInStage = goals(m).find((g) => g.id === "help")!.of!; break;
    case "placeBig": m.tanks.push(newTank("t-big", "big", "B")); break;
    case "fishInBig": m.tanks.find((t) => t.type === "big")!.fish = [{ id: "f-big", species: "bluetang" }]; break;
    case "decorBig": m.tanks.find((t) => t.type === "big")!.decor = [{ id: "d-one", kind: "plant", variant: "small", slot: 0 }, { id: "d-two", kind: "shell", variant: null, slot: 1 }]; break;
    case "allHappy": m.progress.allHappy = true; break;
    case "openHall": m.progress.hallOpen = true; m.tanks.push(newTank("t-ocean", "ocean", "C")); break;
    case "turtle": m.tanks.find((t) => t.type === "ocean")!.fish = [{ id: "f-turtle", species: "turtle" }]; break;
    case "placeTall": m.progress.hallOpen = true; m.tanks.push(newTank("t-tall", "tall", "D")); break;
    case "tallAnimal": m.tanks.find((t) => t.type === "tall")!.fish = [{ id: "f-seahorse", species: "seahorse" }]; break;
    case "named": m.progress.namedInStage = 2; break;
    case "upgrade": m.progress.upgraded = true; break;
  }
}

describe("state-derived progression guide", () => {
  for (const stage of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
    it(`guides each Level ${stage} goal in the same order as the goal panel`, () => {
      const m = level(stage);
      while (goals(m).some((g) => !g.done)) {
        const first = goals(m).find((g) => !g.done)!;
        const before = JSON.stringify(m);
        const action = nextStep(m);
        expect(action?.goal).toBe(first.id);
        for (const tier of [action!.title, action!.where, action!.exact]) {
          expect(tier.en.length).toBeGreaterThan(0);
          expect(tier.ja.length).toBeGreaterThan(0);
        }
        expect(JSON.stringify(m)).toBe(before);
        finish(m, first.id);
      }
      expect(nextStep(m)?.title.en ?? null).toBe(stage === 5 || stage === 8 ? "The judge is coming!" : null);
    });
  }

  it("covers every existing goal id", () => {
    // Separate from the loop above: independent fixtures keep this test order-independent.
    const ids = new Set<Goal["id"]>();
    for (const stage of [1, 2, 3, 4, 5, 6, 7, 8] as const) goals(level(stage)).forEach((g) => ids.add(g.id));
    expect([...ids].sort()).toEqual(["buyFish", "feed", "visitor", "twoFish", "count", "clean", "help", "placeBig", "fishInBig", "decorBig", "allHappy", "openHall", "turtle", "placeTall", "tallAnimal", "named", "upgrade"].sort());
    for (const stage of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const m = level(stage);
      while (goals(m).some((g) => !g.done)) {
        const id = goals(m).find((g) => !g.done)!.id;
        expect(nextStep(m)?.goal).toBe(id);
        ids.delete(id);
        finish(m, id);
      }
    }
    expect(ids.size).toBe(0);
  });

  it("follows the full Level 6 hall, purchase, placement, visitor sequence", () => {
    let m = level(6);
    expect(nextStep(m)).toMatchObject({ goal: "openHall", title: { en: "Open the Ocean Hall!" }, target: "btn-tank-shop", shopItem: "hall" });
    expect(nextStep(m)?.exact.en).toContain(`${HALL_PRICE} coins`);
    m = ok(openHall(m));
    expect(nextStep(m)).toMatchObject({ goal: "turtle", title: { en: "Get a sea turtle!" }, where: { en: "Tap Animals. Buy a turtle.", ja: "「いきもの」で ウミガメを かおう！" }, target: "btn-animal-shop", shopItem: "turtle" });
    m = ok(buyFish(m, "turtle"));
    const bought = nextStep(m)!;
    expect(bought).toMatchObject({ goal: "turtle", title: { en: "Put the turtle in the Ocean tank!" }, target: "tank-C" });
    expect(`${bought.title.en} ${bought.where.en} ${bought.exact.en}`).not.toMatch(/buy|purchase/i);
    m = ok(placeFish(m, m.inv.fish[0].id, m.tanks.find((t) => t.type === "ocean")!.id));
    expect(nextStep(m)).toMatchObject({ goal: "help", title: { en: "Help visitors: 0 / 2" }, target: "chip-visitor" });
    m.progress.helpedInStage = 1;
    expect(nextStep(m)?.title.en).toBe("Help visitors: 1 / 2");
    m.progress.helpedInStage = 2;
    expect(nextStep(m)).toBeNull();
  });

  it("uses an already owned hall without asking to buy it again", () => {
    const m = ok(openHall(level(6)));
    m.coins = SPECIES.turtle.price;
    expect(nextStep(m)).toMatchObject({ goal: "turtle", shopItem: "turtle", title: { en: "Get a sea turtle!" } });
  });

  it("gives coin earning guidance using the real hall and turtle prices", () => {
    let m = level(6);
    m.coins = HALL_PRICE - 7;
    expect(nextStep(m)).toMatchObject({ goal: "openHall", title: { en: "Need 7 more coins!" }, shopItem: "hall" });
    expect(nextStep(m)?.where.en).toContain("Help visitors");
    expect(nextStep(m)?.exact.en).toContain(`${HALL_PRICE} coins`);
    m.coins = HALL_PRICE + SPECIES.turtle.price;
    m = ok(openHall(m));
    m.coins = SPECIES.turtle.price - 3;
    expect(nextStep(m)?.title.en).toBe("Need 3 more coins!");
    expect(nextStep(m)?.exact.en).toContain(`${SPECIES.turtle.price} coins`);
  });

  it("does not require visitor goals to be done after the hall and turtle", () => {
    let m = level(6);
    m.progress.helpedInStage = 2;
    expect(nextStep(m)?.goal).toBe("openHall");
    m = ok(openHall(m));
    expect(nextStep(m)?.goal).toBe("turtle");
    m = ok(buyFish(m, "turtle"));
    expect(nextStep(m)?.title.en).toContain("Put the turtle");
    m = ok(placeFish(m, m.inv.fish[0].id, m.tanks.find((t) => t.type === "ocean")!.id));
    expect(nextStep(m)).toBeNull();
  });

  it("gives a sensible next action after loading and migrating a starred v1 save", () => {
    const old = level(5);
    old.progress.star = true;
    old.progress.helpedInStage = 3;
    const loaded = decodeSave(JSON.stringify({ v: 1, model: old }));
    expect(loaded?.model.progress.stage).toBe(6);
    expect(nextStep(loaded!.model)).toMatchObject({ goal: "openHall", title: { en: "Open the Ocean Hall!" }, shopItem: "hall" });
  });

  it("places owned fish and boxed tanks before suggesting another purchase", () => {
    let m = level(1);
    m = ok(buyFish(m, "clownfish"));
    expect(nextStep(m)).toMatchObject({ goal: "buyFish", target: "tank-A" });
    expect(nextStep(m)?.title.en).toContain("Put your fish");
    m = level(4);
    m.inv.tanks = ["big"];
    m.coins = 0;
    expect(nextStep(m)).toMatchObject({ goal: "placeBig", title: { en: "Place the big tank!" }, target: "chip-box" });
    m = level(7);
    m.inv.tanks = ["tall"];
    expect(nextStep(m)).toMatchObject({ goal: "placeTall", target: "chip-box" });
  });

  it("places owned decorations and tall animals instead of asking to buy again", () => {
    const m = level(4);
    finish(m, "placeBig");
    finish(m, "fishInBig");
    m.inv.decor = [{ id: "d-owned", kind: "shell", variant: null }];
    m.coins = 0;
    expect(nextStep(m)).toMatchObject({ goal: "decorBig", title: { en: "Place your decoration!" }, target: "tank-B" });
    const tall = level(7);
    finish(tall, "placeTall");
    tall.inv.fish = [{ id: "f-owned", species: "jellyfish" }];
    tall.coins = 0;
    expect(nextStep(tall)).toMatchObject({ goal: "tallAnimal", title: { en: "Put your jellyfish in the tank!" }, target: "tank-D" });
  });

  it("uses real tank and upgrade prices for shortfalls", () => {
    const big = level(4);
    big.coins = TANKS.big.price - 2;
    expect(nextStep(big)?.title.en).toBe("Need 2 more coins!");
    const tall = level(7);
    tall.progress.hallOpen = true;
    tall.coins = TANKS.tall.price - 4;
    expect(nextStep(tall)?.title.en).toBe("Need 4 more coins!");
    const upgrade = level(8);
    upgrade.coins = UPGRADE_PRICE.lamp - 6;
    expect(nextStep(upgrade)?.title.en).toBe("Need 6 more coins!");
    expect(nextStep(upgrade)?.exact.en).toContain(`${UPGRADE_PRICE.lamp} coins`);
  });

  it("keeps prerequisite actions attached to the panel's first incomplete goal", () => {
    const m = level(7);
    m.tanks.push(newTank("t-extra", "big", "B"));
    expect(nextStep(m)).toMatchObject({ goal: "placeTall", shopItem: "hall" });
    m.inv.tanks = ["tall"];
    expect(nextStep(m)?.goal).toBe(goals(m).find((g) => !g.done)?.id);
  });

  it("shows judge waiting only until the inspection is finished", () => {
    for (const stage of [5, 8] as const) {
      const m = level(stage);
      for (const g of goals(m)) finish(m, g.id);
      expect(nextStep(m)?.title.en).toBe("The judge is coming!");
      if (stage === 5) m.progress.star = true;
      else m.progress.superStar = true;
      expect(nextStep(m)).toBeNull();
    }
  });

  it("chooses care, owned decorations, and a lamp for a full unhappy tank", () => {
    const m = level(8);
    m.progress.upgraded = true;
    m.progress.helpedInStage = 3;
    expect(nextStep(m)).toMatchObject({ goal: "allHappy", title: { en: "Feed your fish!" } });
    m.tanks[0].food = 100;
    m.tanks[0].clean = 50;
    expect(nextStep(m)?.title.en).toBe("Clean the tank!");
    m.tanks[0].clean = 100;
    m.inv.decor = [{ id: "d-owned", kind: "plant", variant: "small" }];
    expect(nextStep(m)?.title.en).toBe("Place your decoration!");
    m.tanks = [newTank("t-tall", "tall", "D")];
    m.tanks[0].fish = [{ id: "f-seahorse", species: "seahorse" }];
    m.tanks[0].decor = [{ id: "d-one", kind: "shell", variant: null, slot: 0 }, { id: "d-two", kind: "shell", variant: null, slot: 1 }];
    expect(nextStep(m)).toMatchObject({ goal: "allHappy", shopItem: "lamp", target: "tank-D" });
  });
});
