import { describe, expect, it } from "vitest";
import {
  bagAnimal,
  buyDecor,
  buyFish,
  buyTank,
  freeSlots,
  happiness,
  homeReason,
  newModel,
  newTank,
  openGallery,
  openHall,
  placeDecor,
  placeFish,
  placeTank,
  remodelPlan,
  remodelTank,
  setLight,
  type Model,
  type Result
} from "./model";
import { decorFits } from "../data/decor";
import { SPECIES, SPECIES_ORDER } from "../data/fish";
import { PAD_TYPES, TANKS } from "../data/tanks";
import { route } from "../world";
import { ROOMS, roomAtX } from "../data/rooms";
import { frontAt, stepSwim, newSwimState, tankFishBounds, type SwimEnv } from "./swim";
import { makeRng } from "./rng";
import { matchesShow, presentAnimals, countableTanks } from "./requests";
import { ANIMAL_PHRASE, ITS_PHRASE, PHRASES } from "./english";

type M = Model & { lastId?: string };
function ok(r: Result): M {
  if (!r.ok) throw new Error(r.reason);
  return Object.assign(r.m, { lastId: r.id });
}
const level8 = (): M => ({ ...newModel(), coins: 5000, progress: { ...newModel().progress, stage: 8, star: true, freePlay: true, tutorial: "done", hallOpen: true } });
const tank = (type: Parameters<typeof newTank>[1], fish: string[] = []) => ({ ...newTank("tx", type, "D"), fish: fish.map((s, i) => ({ id: `x${i}`, species: s as never })) });

describe("habitats and reasons", () => {
  it("explains every refusal in the student's terms", () => {
    expect(homeReason("eel", tank("big"))).toBe("rocky");
    expect(homeReason("octopus", tank("panorama"))).toBe("rocky");
    expect(homeReason("moonjelly", tank("tall"))).toBe("jelly");
    expect(homeReason("stingray", tank("small"))).toBe("bigger");
    expect(homeReason("turtle", tank("panorama"))).toBe("ocean");
    expect(homeReason("seahorse", tank("small"))).toBe("tall");
    expect(homeReason("clownfish", tank("cylinder"))).toBe("jellyOnly");
    expect(homeReason("clownfish", tank("cave"))).toBe("notSafe");
    expect(homeReason("clownfish", tank("tall", ["jellyfish"]))).toBe("jellyOnly");
    expect(homeReason("jellyfish", tank("tall", ["seahorse"]))).toBe("noMix");
    expect(homeReason("moonjelly", tank("cylinder", ["jellyfish", "seanettle"]))).toBeNull();
    expect(homeReason("goby", tank("cave", ["eel"]))).toBeNull();
  });

  it("keeps every existing species' old homes (saved placements stay valid)", () => {
    for (const s of ["clownfish", "bluetang", "yellowfish", "pufferfish"] as const) for (const t of ["small", "big", "tall", "ocean"] as const) expect(SPECIES[s].habitat).toContain(t);
    expect(SPECIES.turtle.habitat).toContain("ocean");
    expect(SPECIES.seahorse.habitat).toContain("tall");
    expect(SPECIES.jellyfish.habitat).toContain("tall");
  });

  it("counts a school and a stingray as two places", () => {
    const t = tank("big", ["clownfish", "clownfish", "clownfish"]);
    expect(homeReason("chromis", t)).toBeNull();
    expect(homeReason("chromis", { ...t, fish: [...t.fish, { id: "y", species: "crab" }] })).toBe("full");
  });

  it("only the shipwreck-sized pieces need a large tank; the jelly column takes small things only", () => {
    expect(decorFits("shipwreck", "small")).toBe(false);
    expect(decorFits("shipwreck", "big")).toBe(true);
    expect(decorFits("cave", "cave")).toBe(true);
    expect(decorFits("coral", "cylinder")).toBe(false);
    expect(decorFits("shell", "cylinder")).toBe(true);
    for (const k of ["plant", "coral", "rock", "shell", "chest", "bubbler", "starfish", "castle", "anemone"] as const) {
      expect(decorFits(k, "small")).toBe(true);
      expect(decorFits(k, "tall")).toBe(true);
    }
  });

  it("every species has an answer, and every sea animal a name to order by", () => {
    for (const s of SPECIES_ORDER) {
      expect(PHRASES[ITS_PHRASE[s]]).toBeTruthy();
      if (SPECIES[s].counter === "animal") expect(ANIMAL_PHRASE[s]).toBeTruthy();
    }
    expect(PHRASES.eelPlease.en).toBe("An eel, please!");
    expect(PHRASES.itsOctopus.en).toBe("It's an octopus.");
    expect(PHRASES.itsCrab.en).toBe("It's a crab.");
  });
});

describe("special tanks, the Gallery and remodelling", () => {
  it("special tanks are Level 8 and go only on pads that take them", () => {
    const early = { ...level8(), progress: { ...level8().progress, stage: 7 as const } };
    expect(buyTank(early, "hex").ok).toBe(false);
    expect(PAD_TYPES.A).not.toContain("panorama");
    expect(PAD_TYPES.D).toContain("panorama");
    let m = ok(buyTank(level8(), "hex"));
    m = ok(placeTank(m, "hex", "B"));
    expect(m.tanks.find((t) => t.slot === "B")?.type).toBe("hex");
  });

  it("the Gallery opens from the Ocean Hall with a jelly column, and adds two free pads", () => {
    let m = level8();
    m = { ...m, progress: { ...m.progress, hallOpen: false } };
    expect(openGallery(m).ok).toBe(false);
    m = ok(openHall(m));
    expect(freeSlots(m)).not.toContain("F");
    m = ok(openGallery(m));
    expect(m.tanks.find((t) => t.slot === "G")?.type).toBe("cylinder");
    expect(freeSlots(m)).toEqual(expect.arrayContaining(["F", "H"]));
    expect(freeSlots(m)).not.toContain("G");
  });

  it("a display light is free, counts like a decoration and makes jellyfish happy", () => {
    let m = ok(openGallery(level8()));
    const id = m.lastId!;
    m = ok(buyFish(m, "moonjelly"));
    m = ok(placeFish(m, m.lastId!, id));
    const before = happiness(m.tanks.find((t) => t.id === id)!)!;
    const coins = m.coins;
    m = ok(setLight(m, id, "blue"));
    expect(m.coins).toBe(coins);
    expect(happiness(m.tanks.find((t) => t.id === id)!)!).toBe(before + 15 + 10);
    expect(setLight(m, "t1", "blue").ok).toBe(false);
  });

  it("remodelling keeps animals, care and fitting decorations; the rest goes to the tray; half the old price comes back", () => {
    let m = level8();
    m = ok(buyTank(m, "big"));
    m = ok(placeTank(m, "big", "B"));
    const big = m.lastId!;
    m = ok(buyFish(m, "bluetang"));
    m = ok(placeFish(m, m.lastId!, big));
    m = ok(buyDecor(m, "shipwreck", null));
    m = ok(placeDecor(m, m.lastId!, big, 4));
    m = ok(buyDecor(m, "coral", "red"));
    m = ok(placeDecor(m, m.lastId!, big, 1));
    const plan = remodelPlan(m, big, "hex");
    expect(plan.reason).toBeNull();
    expect(plan.tradeIn).toBe(40);
    expect(plan.cost).toBe(50);
    expect(plan.keep.map((d) => [d.kind, d.slot])).toEqual([["coral", 1]]);
    expect(plan.toTray.map((d) => d.kind)).toEqual(["shipwreck"]);
    const coins = m.coins;
    const trayBefore = m.inv.decor.length;
    m = ok(remodelTank(m, big, "hex"));
    const t = m.tanks.find((x) => x.id === big)!;
    expect(t.type).toBe("hex");
    expect(t.slot).toBe("B");
    expect(t.fish.map((f) => f.species)).toEqual(["bluetang"]);
    expect(m.coins).toBe(coins - 50);
    expect(m.inv.decor.length).toBe(trayBefore + 1);
  });

  it("refuses a remodel the animals cannot live in, until they are bagged", () => {
    let m = level8();
    m = ok(buyTank(m, "cave"));
    m = ok(placeTank(m, "cave", "B"));
    const cave = m.lastId!;
    m = ok(buyFish(m, "eel"));
    m = ok(placeFish(m, m.lastId!, cave));
    const eel = m.lastId!;
    const plan = remodelPlan(m, cave, "hex");
    expect(plan.reason).toBe("habitat");
    expect(plan.blockers.map((f) => f.id)).toEqual([eel]);
    expect(remodelTank(m, cave, "hex").ok).toBe(false);
    m = ok(bagAnimal(m, eel));
    expect(m.inv.fish.map((f) => f.id)).toContain(eel);
    expect(remodelPlan(m, cave, "hex").reason).toBeNull();
    // The Ocean tank and pads that do not take the type are never remodelled.
    m = ok(openHall({ ...m, progress: { ...m.progress, hallOpen: false } }));
    const ocean = m.tanks.find((t) => t.type === "ocean")!.id;
    expect(remodelPlan(m, ocean, "panorama").reason).toBe("locked");
    expect(remodelPlan(m, "t1", "panorama").reason).toBe("pad");
  });
});

describe("rooms and shapes", () => {
  it("routes through every doorway between two rooms", () => {
    const p = route({ x: 0, z: 0 }, { x: 24, z: 0 });
    expect(p.map((q) => roomAtX(q.x))).toEqual([0, 1, 1, 2, 2]);
    expect(route({ x: 24, z: 0 }, { x: 25, z: 1 })).toEqual([{ x: 25, z: 1 }]);
    expect(ROOMS.map((r) => r.id)).toEqual(["hall", "ocean", "gallery"]);
  });

  it("keeps animals inside round, six-sided and bowed glass, and in front of the cave rockwork", () => {
    const rand = makeRng(7);
    for (const type of ["cylinder", "hex", "panorama", "cave"] as const) {
      const def = TANKS[type];
      for (const s of ["clownfish", "moonjelly", "stingray"] as const) {
        const b = tankFishBounds(def, 0.06, SPECIES[s]);
        const env: SwimEnv = { bounds: b, columns: [], others: [], speedMul: 1.5, attract: null, depthBias: 0 };
        const st = newSwimState(SPECIES[s], env, rand);
        for (let i = 0; i < 1500; i++) {
          stepSwim(st, SPECIES[s], env, 0.05, rand);
          if (b.round !== undefined) expect(Math.hypot(st.x, st.z)).toBeLessThanOrEqual(b.round + 1e-9);
          expect(st.z).toBeLessThanOrEqual(frontAt(b, st.x) + 1e-9);
          expect(st.z).toBeGreaterThanOrEqual(b.min.z - 1e-9);
        }
        if (type === "cave") expect(b.min.z).toBeGreaterThan(-def.d / 2 + def.backRock!);
        if (type === "panorama") expect(frontAt(b, 0)).toBeGreaterThan(b.max.z);
      }
    }
  });
});

describe("requests about new animals", () => {
  it("any jellyfish answers 'I like jellyfish!', and a school is never counted", () => {
    expect(matchesShow({ kind: "showAnimal", species: "jellyfish" }, { type: "fish", species: "seanettle" })).toBe(true);
    expect(matchesShow({ kind: "showAnimal", species: "eel" }, { type: "fish", species: "octopus" })).toBe(false);
    const m = level8();
    m.tanks = [{ ...newTank("t1", "big", "A"), fish: [{ id: "a", species: "clownfish" }, { id: "b", species: "chromis" }] }, { ...newTank("t2", "tall", "B"), fish: [{ id: "c", species: "jellyfish" }, { id: "d", species: "jellyfish" }] }];
    expect(countableTanks(m)).toEqual([]);
    expect(presentAnimals(m)).toEqual(["jellyfish"]);
  });
});
