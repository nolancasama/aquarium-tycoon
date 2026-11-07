import { describe, expect, it } from "vitest";
import { decodeSave, encodeSave, VERSION } from "./save";
import { buyDecor, buyFish, buyTank, buyTickets, buyUpgrade, newModel, openAtrium, openGallery, openHall, placeDecor, placeFish, placeTank, remodelTank, setLight, type Model, type Result } from "./model";
import { advance, commitResult, lockResult, startEvent } from "../rush/logic";
import { newRushState } from "../rush/types";
import { RUSH_SECONDS } from "../rush/config";

type M = Model & { lastId?: string };

function ok(r: Result): M {
  if (!r.ok) throw new Error(r.reason);
  return Object.assign(r.m, { lastId: r.id });
}

function played(): Model {
  let m: M = { ...newModel(), coins: 300, progress: { ...newModel().progress, stage: 4, tutorial: "done", hearts: 5, said: ["feedFish", "bluePlease"] } };
  m = ok(buyFish(m, "bluetang"));
  m = ok(placeFish(m, m.lastId!, "t1"));
  m = ok(buyFish(m, "clownfish")); // stays in its bag
  m = ok(buyDecor(m, "coral", "red"));
  m = ok(placeDecor(m, m.lastId!, "t1", 1));
  m = ok(buyDecor(m, "plant", "big")); // in the tray
  m = ok(buyTank(m, "big"));
  m = ok(placeTank(m, "big", "B"));
  const { lastId: _drop, ...model } = m as Model & { lastId?: string };
  void _drop;
  return { ...model, tanks: model.tanks.map((t) => ({ ...t, food: 42.5, clean: 61 })) };
}

describe("Rush Hour saves", () => {
  function unlocked(): Model {
    const model = played();
    return advance({ ...model, progress: { ...model.progress, stage: 8, tutorial: "done", star: true, freePlay: true, hallOpen: true } }, 0, { calm: true, rand: () => 0.5 }).model;
  }
  function preparation(): Model {
    const model = unlocked();
    return startEvent({ ...model, rush: { ...model.rush!, phase: "pending" } });
  }

  it.each([1, 2, 3])("loads v%i without rush with the same aquarium and a fresh default", (version) => {
    const raw = JSON.parse(encodeSave(played()));
    raw.v = version;
    delete raw.model.rush;
    const absent = decodeSave(JSON.stringify(raw))!.model;
    expect(absent.rush).toEqual(newRushState());
    raw.model.rush = newRushState();
    expect(decodeSave(JSON.stringify(raw))!.model).toEqual(absent);
    expect(absent.coins).toBe(raw.model.coins);
    expect(absent.tanks).toEqual(raw.model.tanks);
    expect(absent.inv).toEqual(raw.model.inv);
    expect(absent.stats).toEqual(raw.model.stats);
  });

  it("preserves the single rolled delay on repeated decode and encode", () => {
    const model = unlocked();
    const delay = model.rush!.untilNext;
    let saved = model;
    for (let n = 0; n < 3; n++) {
      saved = decodeSave(encodeSave(saved))!.model;
      expect(saved.rush!.untilNext).toBe(delay);
    }
    expect(delay).toBe(600);
  });

  it("resumes preparation and the crowd with their saved active time and locked result", () => {
    let model = preparation();
    model = advance(model, 17, { calm: true, rand: () => 0 }).model;
    let saved = decodeSave(encodeSave(model))!.model;
    expect(saved.rush).toEqual(model.rush);
    expect(saved.rush!.event!.remaining).toBe(103);
    model = lockResult(saved);
    model = advance(model, 23, { calm: false, rand: () => 0 }).model;
    saved = decodeSave(encodeSave(model))!.model;
    expect(saved.rush).toEqual(model.rush);
    expect(saved.rush!.event!.remaining).toBe(RUSH_SECONDS - 23);
    expect(saved.rush!.event!.result).not.toBeNull();
  });

  it("resumes paid results without paying again even after ordinary award keys expire", () => {
    let model = preparation();
    model = { ...model, tanks: model.tanks.map((tank) => ({ ...tank, food: 100, clean: 100 })) };
    model = commitResult(lockResult(model));
    const coins = model.coins;
    const saved = decodeSave(encodeSave({ ...model, paid: [] }))!.model;
    expect(saved.rush).toEqual(model.rush);
    expect(saved.rush!.phase).toBe("results");
    expect(commitResult(saved).coins).toBe(coins);
    expect(commitResult(saved).rush!.stats.events).toBe(1);
  });

  it("drops unknown readiness ids and duplicates without dropping sold tracked ids", () => {
    const raw = JSON.parse(encodeSave(preparation()));
    raw.model.rush.event.tankIds.push("sold-tank");
    raw.model.rush.event.ready = ["t1", "unknown", "t1", "sold-tank"];
    const state = decodeSave(JSON.stringify(raw))!.model.rush!;
    expect(state.phase).toBe("prep");
    expect(state.event!.ready).toEqual(["t1", "sold-tank"]);
    expect(state.event!.tankIds).toContain("sold-tank");
  });

  it.each(["prep", "rush"] as const)("clamps %s remaining to the phase length", (phase) => {
    const model = phase === "prep" ? preparation() : lockResult(preparation());
    const raw = JSON.parse(encodeSave(model));
    raw.model.rush.event.remaining = 99999;
    expect(decodeSave(JSON.stringify(raw))!.model.rush!.event!.remaining).toBe(phase === "prep" ? model.rush!.event!.prepTotal : RUSH_SECONDS);
    raw.model.rush.event.remaining = -10;
    expect(decodeSave(JSON.stringify(raw))!.model.rush!.event!.remaining).toBe(0);
  });

  it.each([
    ["unlocked", "yes"], ["introSeen", 1], ["phase", "cooldown"], ["untilNext", "600"],
    ["pendingFor", null], ["lastCommitted", "someone"], ["event", { id: "broken" }]
  ])("resets invalid %s while retaining independently valid stats and rewards", (key, value) => {
    const raw = JSON.parse(encodeSave(preparation()));
    raw.model.rush.stats = { events: 3, bronze: 1, silver: 1, gold: 1, successes: 3, best: "gold", bestReady: 4 };
    raw.model.rush.rewards = ["cabinet", "bronzeDisplay", "floorPattern", "goldSign"];
    const stats = raw.model.rush.stats;
    const rewards = raw.model.rush.rewards;
    raw.model.rush[key as string] = value;
    expect(decodeSave(JSON.stringify(raw))!.model.rush).toEqual({ ...newRushState(), stats, rewards });
  });

  it("validates every lifetime counter, reward id, and locked-result field", () => {
    for (const key of ["events", "bronze", "silver", "gold", "successes", "bestReady"]) {
      const raw = JSON.parse(encodeSave(unlocked()));
      raw.model.rush.stats[key] = -1;
      const state = decodeSave(JSON.stringify(raw))!.model.rush!;
      expect(state.stats).toEqual(newRushState().stats);
      expect(state.unlocked).toBe(false);
    }
    for (const [key, value] of [["ready", 999], ["eligible", 0], ["medal", "diamond"], ["bonus", 99999], ["newRewards", ["incomeBoost"]]]) {
      const raw = JSON.parse(encodeSave(lockResult(preparation())));
      raw.model.rush.event.result[key as string] = value;
      expect(decodeSave(JSON.stringify(raw))!.model.rush!.event).toBeNull();
    }
    const raw = JSON.parse(encodeSave(unlocked()));
    raw.model.rush.rewards = ["cabinet", "moneyMachine"];
    expect(decodeSave(JSON.stringify(raw))!.model.rush!.rewards).toEqual([]);
  });

  it("rejects inconsistent lifetime success totals and best-medal records", () => {
    for (const stats of [
      { events: 1, bronze: 1, silver: 0, gold: 0, successes: 0, best: "bronze", bestReady: 2 },
      { events: 0, bronze: 1, silver: 0, gold: 0, successes: 1, best: "bronze", bestReady: 2 },
      { events: 1, bronze: 0, silver: 1, gold: 0, successes: 1, best: "gold", bestReady: 2 },
      { events: 1, bronze: 0, silver: 0, gold: 0, successes: 0, best: "bronze", bestReady: 2 }
    ]) {
      const raw = JSON.parse(encodeSave(unlocked()));
      raw.model.rush.stats = stats;
      expect(decodeSave(JSON.stringify(raw))!.model.rush!.stats).toEqual(newRushState().stats);
    }
  });
});

describe("save", () => {
  it("loads a pre-Atrium save with all existing rooms, animals and purchases intact", () => {
    let m: M = { ...played(), coins: 3000, progress: { ...played().progress, stage: 8, star: true, freePlay: true } };
    m = ok(openHall(m));
    m = ok(openGallery(m));
    m = ok(buyTickets(m));
    m = ok(setLight(m, m.tanks.find((t) => t.slot === "G")!.id, "pink"));
    const { lastId: _drop, ...model } = m;
    void _drop;
    const raw = JSON.parse(encodeSave(model));
    delete raw.model.progress.atriumOpen;
    delete raw.model.progress.atriumIntroSeen;
    const back = decodeSave(JSON.stringify(raw))!;
    expect(back.v).toBe(VERSION);
    expect(back.model).toEqual(model);
    expect(back.model.progress.atriumOpen).toBe(false);
    expect(back.model.progress.atriumIntroSeen).toBe(false);
  });

  it("round-trips an open Atrium, stocked reef, its decorations and arrival history", () => {
    let m: M = { ...newModel(), coins: 3000, progress: { ...newModel().progress, stage: 8, star: true, freePlay: true, tutorial: "done" } };
    m = ok(openHall(m));
    m = ok(openGallery(m));
    m = ok(openAtrium(m));
    const reef = m.lastId!;
    for (const species of ["clownfish", "chromis", "stingray", "seahorse"] as const) {
      m = ok(buyFish(m, species));
      m = ok(placeFish(m, m.lastId!, reef));
    }
    m = ok(buyDecor(m, "coral", "red"));
    m = ok(placeDecor(m, m.lastId!, reef, 0));
    m = ok(buyTank(m, "hex"));
    m = ok(placeTank(m, "hex", "J"));
    const { lastId: _drop, ...model } = m;
    void _drop;
    model.progress.atriumIntroSeen = true;
    const back = decodeSave(encodeSave(model))!;
    expect(back.v).toBe(VERSION);
    expect(back.model).toEqual(model);
    expect(back.model.tanks.find((t) => t.slot === "I")?.fish).toHaveLength(4);
    // Repair a missing permanent exhibit, but never invent another paid room.
    const raw = JSON.parse(encodeSave(model));
    raw.model.tanks = raw.model.tanks.filter((t: { slot: string }) => t.slot !== "I");
    expect(decodeSave(JSON.stringify(raw))!.model.tanks.find((t) => t.slot === "I")?.type).toBe("reef");
    raw.model.progress.galleryOpen = false;
    const locked = decodeSave(JSON.stringify(raw))!.model;
    expect(locked.progress.atriumOpen).toBe(false);
    expect(locked.progress.atriumIntroSeen).toBe(false);
    expect(locked.tanks.some((t) => ["I", "J", "K"].includes(t.slot))).toBe(false);
  });

  it("round-trips everything that matters", () => {
    const m = played();
    const back = decodeSave(encodeSave(m))!.model;
    expect(back).toEqual(m);
  });

  it("keeps the tips lesson flag, and older saves without it load as not yet shown", () => {
    const m = played();
    const taught = { ...m, progress: { ...m.progress, tipsTaught: true } };
    expect(decodeSave(encodeSave(taught))!.model.progress.tipsTaught).toBe(true);
    const raw = JSON.parse(encodeSave(m));
    delete raw.model.progress.tipsTaught;
    const old = decodeSave(JSON.stringify(raw))!.model;
    expect(old.progress.tipsTaught).toBe(false);
    expect(old.progress.stage).toBe(m.progress.stage);
  });

  it("discards corrupted, foreign and outdated saves", () => {
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave("{not json")).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 0, model: played() }))).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 4, model: played() }))).toBeNull();
    expect(decodeSave(JSON.stringify([1, 2]))).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 1, model: { tanks: [] } }))).toBeNull();
  });

  it("migrates optional teaching histories without changing the save version", () => {
    const raw = JSON.parse(encodeSave(played()));
    delete raw.model.progress.handShown;
    delete raw.model.progress.seenPatterns;
    const old = decodeSave(JSON.stringify(raw))!;
    expect(old.v).toBe(VERSION);
    expect(old.model.progress.handShown).toEqual([]);
    expect(old.model.progress.seenPatterns).toEqual([]);
    raw.model.progress.handShown = ["fish-shop", "visitor", "visitor", "unknown", 7];
    raw.model.progress.seenPatterns = ["likeFish", "identify", "likeFish", "unknown", false];
    const loaded = decodeSave(JSON.stringify(raw))!.model;
    expect(loaded.progress.handShown).toEqual(["fish-shop", "visitor"]);
    expect(loaded.progress.seenPatterns).toEqual(["likeFish", "identify"]);
    expect(decodeSave(encodeSave(loaded))!.model).toEqual(loaded);
  });

  it("repairs impossible data instead of trusting it", () => {
    const m = played();
    const raw = JSON.parse(encodeSave(m));
    const small = raw.model.tanks[0];
    small.fish = [...small.fish, { id: "x1", species: "clownfish" }, { id: "x2", species: "clownfish" }, { id: "x3", species: "shark" }];
    small.decor.push({ id: "d99", kind: "rock", variant: "big", slot: 1 }); // slot taken
    small.food = 500;
    raw.model.coins = -40;
    raw.model.inv.tanks = ["big", "big", "huge"];
    const back = decodeSave(JSON.stringify(raw))!.model;
    const t = back.tanks[0];
    expect(t.fish).toHaveLength(3); // small tank capacity
    expect(t.fish.some((f) => (f.species as string) === "shark")).toBe(false);
    expect(t.decor).toHaveLength(1);
    expect(t.food).toBe(100);
    expect(back.coins).toBe(0);
    expect(back.inv.tanks).toEqual([]); // both slots are taken
  });

  it("does not keep a big tank from a save that never reached Stage 4", () => {
    const m = played();
    const raw = JSON.parse(encodeSave(m));
    raw.model.progress.stage = 2;
    raw.model.progress.tutorial = "feed";
    const back = decodeSave(JSON.stringify(raw))!.model;
    expect(back.tanks.map((t) => t.type)).toEqual(["small"]);
    // Stage 2 means the Stage 1 tutorial was finished, apart from its decorating step.
    expect(back.progress.tutorial).toBe("decorate");
  });

  it("keeps new ids unique after loading", () => {
    const m = played();
    const raw = JSON.parse(encodeSave(m));
    raw.model.nextId = 1;
    const back = decodeSave(JSON.stringify(raw))!.model;
    const next = ok(buyDecor(back, "shell", null));
    const ids = [...next.tanks.flatMap((t) => [t.id, ...t.fish.map((f) => f.id), ...t.decor.map((d) => d.id)]), ...next.inv.decor.map((d) => d.id), ...next.inv.fish.map((f) => f.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("save version 2 (Phase 2)", () => {
  /** A Phase 1 save exactly as version 1 wrote it (no upgrades, no Phase 2 fields), finished with the star. */
  const V1_STARRED = {
    v: 1,
    model: {
      coins: 140,
      tanks: [
        { id: "t1", type: "small", slot: "A", fish: [{ id: "f2", species: "clownfish" }], decor: [], food: 80, clean: 70 },
        { id: "t5", type: "big", slot: "B", fish: [{ id: "f6", species: "bluetang" }], decor: [{ id: "d7", kind: "coral", variant: "red", slot: 1 }], food: 60, clean: 90 }
      ],
      inv: { fish: [], decor: [], tanks: [] },
      progress: { stage: 5, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, allHappy: true, helpedInStage: 3, hearts: 9, specialPending: false, photo: true, star: true, freePlay: true, said: ["feedFish"] },
      stats: { coinsEarned: 200, helped: 9, fishBought: 2, seconds: 1200 },
      nextId: 8,
      paid: ["judge"]
    }
  };

  it("migrates a version 1 save: everything kept, the star opens Level 6", () => {
    const back = decodeSave(JSON.stringify(V1_STARRED))!;
    expect(back.v).toBe(VERSION);
    const m = back.model;
    expect(m.coins).toBe(140);
    expect(m.progress).toMatchObject({ stage: 6, star: true, freePlay: true, photo: true, hallOpen: false, superStar: false, helpedInStage: 0 });
    expect(m.tanks.map((t) => [t.id, t.type, t.fish.length, t.upgrades])).toEqual([
      ["t1", "small", 1, { filter: false, lamp: false }],
      ["t5", "big", 1, { filter: false, lamp: false }]
    ]);
    expect(m.tanks[1].decor).toEqual([{ id: "d7", kind: "coral", variant: "red", slot: 1 }]);
    // An unfinished version 1 save stays where it was.
    const mid = JSON.parse(JSON.stringify(V1_STARRED));
    mid.model.progress.star = false;
    mid.model.progress.stage = 3;
    expect(decodeSave(JSON.stringify(mid))!.model.progress.stage).toBe(3);
  });

  it("round-trips the Ocean Hall, tall tanks, sea animals and upgrades", () => {
    let m: M = { ...newModel(), coins: 3000, progress: { ...newModel().progress, stage: 8, star: true, freePlay: true, tutorial: "done" } };
    m = ok(openHall(m));
    m = ok(buyTank(m, "tall"));
    m = ok(placeTank(m, "tall", "E"));
    const tall = m.lastId!;
    m = ok(buyFish(m, "jellyfish"));
    m = ok(placeFish(m, m.lastId!, tall));
    m = ok(buyFish(m, "turtle"));
    m = ok(placeFish(m, m.lastId!, m.tanks.find((t) => t.type === "ocean")!.id));
    m = ok(buyUpgrade(m, tall, "lamp"));
    m = ok(buyTickets(m));
    const { lastId: _drop, ...model } = m;
    void _drop;
    expect(decodeSave(encodeSave(model))!.model).toEqual(model);
  });

  it("repairs Phase 2 impossibilities: wrong habitats, hall pads while closed, early upgrades", () => {
    const raw = JSON.parse(JSON.stringify(V1_STARRED));
    raw.v = 2;
    raw.model.progress.stage = 6;
    // A turtle in the small tank, a tank on an Ocean Hall pad while the hall is closed, a lamp at Level 6.
    raw.model.tanks[0].fish.push({ id: "f9", species: "turtle" });
    raw.model.tanks[0].upgrades = { filter: false, lamp: true };
    raw.model.tanks.push({ id: "t10", type: "big", slot: "D", fish: [], decor: [], food: 100, clean: 100 });
    const m = decodeSave(JSON.stringify(raw))!.model;
    expect(m.tanks[0].fish.map((f) => f.species)).toEqual(["clownfish"]);
    expect(m.tanks[0].upgrades.lamp).toBe(false);
    expect(m.tanks.map((t) => t.slot)).toEqual(["A", "B"]);
    // An open hall always has its Ocean tank.
    raw.model.progress.hallOpen = true;
    const open = decodeSave(JSON.stringify(raw))!.model;
    expect(open.tanks.filter((t) => t.type === "ocean").map((t) => t.slot)).toEqual(["C"]);
  });
});

describe("save version 3 (Expansion 1)", () => {
  /** A Level 8 Phase 2 save exactly as version 2 wrote it (no light, no galleryOpen). */
  const V2_LEVEL8 = {
    v: 2,
    model: {
      coins: 512,
      tanks: [
        { id: "t1", type: "big", slot: "A", fish: [{ id: "f2", species: "clownfish" }, { id: "f3", species: "pufferfish" }], decor: [{ id: "d4", kind: "coral", variant: "blue", slot: 2 }], food: 71.5, clean: 64, upgrades: { filter: true, lamp: false } },
        { id: "t5", type: "small", slot: "B", fish: [{ id: "f6", species: "bluetang" }], decor: [{ id: "d7", kind: "shell", variant: null, slot: 0 }], food: 90, clean: 88, upgrades: { filter: false, lamp: false } },
        { id: "t8", type: "ocean", slot: "C", fish: [{ id: "f9", species: "turtle" }], decor: [{ id: "d10", kind: "shipwreck", variant: null, slot: 3 }], food: 55, clean: 47, upgrades: { filter: false, lamp: true } },
        { id: "t11", type: "tall", slot: "D", fish: [{ id: "f12", species: "jellyfish" }, { id: "f13", species: "jellyfish" }], decor: [], food: 80, clean: 80, upgrades: { filter: false, lamp: true } },
        { id: "t14", type: "tall", slot: "E", fish: [{ id: "f15", species: "seahorse" }], decor: [{ id: "d16", kind: "plant", variant: "big", slot: 1 }], food: 66, clean: 70, upgrades: { filter: false, lamp: false } }
      ],
      inv: { fish: [{ id: "f17", species: "yellowfish" }], decor: [{ id: "d18", kind: "starfish", variant: "pink" }], tanks: [] },
      progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, allHappy: false, helpedInStage: 1, namedInStage: 0, hearts: 22, specialPending: false, photo: true, star: true, freePlay: true, hallOpen: true, tickets: true, upgraded: true, superStar: false, tipsTaught: true, said: ["feedFish", "itsTurtle"] },
      stats: { coinsEarned: 900, helped: 22, fishBought: 9, seconds: 3600 },
      nextId: 19,
      paid: ["judge"]
    }
  };

  it("migrates a version 2 save without changing anything it had", () => {
    const back = decodeSave(JSON.stringify(V2_LEVEL8))!;
    expect(back.v).toBe(3);
    const m = back.model;
    const src = V2_LEVEL8.model;
    expect(m.coins).toBe(src.coins);
    expect(m.nextId).toBe(src.nextId);
    expect(m.tanks.map((t) => ({ id: t.id, type: t.type, slot: t.slot, fish: t.fish, decor: t.decor, food: t.food, clean: t.clean, upgrades: t.upgrades }))).toEqual(src.tanks);
    expect(m.inv).toEqual(src.inv);
    expect(m.progress).toMatchObject(src.progress);
    // New fields take their defaults; the Gallery is not open and nothing was moved.
    expect(m.progress.galleryOpen).toBe(false);
    expect(m.tanks.every((t) => t.light === null)).toBe(true);
    // Written back as version 3, it reads the same again.
    expect(decodeSave(encodeSave(m))!.model).toEqual(m);
  });

  it("round-trips the Gallery, special tanks, new animals, lights and a remodel", () => {
    let m: M = { ...newModel(), coins: 5000, progress: { ...newModel().progress, stage: 8, star: true, freePlay: true, tutorial: "done" } };
    m = ok(openHall(m));
    m = ok(openGallery(m));
    const column = m.lastId!;
    m = ok(setLight(m, column, "pink"));
    m = ok(buyFish(m, "moonjelly"));
    m = ok(placeFish(m, m.lastId!, column));
    m = ok(buyTank(m, "cave"));
    m = ok(placeTank(m, "cave", "D"));
    const cave = m.lastId!;
    m = ok(buyFish(m, "octopus"));
    m = ok(placeFish(m, m.lastId!, cave));
    m = ok(buyTank(m, "panorama"));
    m = ok(placeTank(m, "panorama", "E"));
    const pano = m.lastId!;
    m = ok(buyFish(m, "chromis"));
    m = ok(placeFish(m, m.lastId!, pano));
    m = ok(buyFish(m, "stingray"));
    m = ok(placeFish(m, m.lastId!, pano));
    m = ok(remodelTank(m, "t1", "hex"));
    const { lastId: _drop, ...model } = m;
    void _drop;
    expect(model.progress.galleryOpen).toBe(true);
    expect(decodeSave(encodeSave(model))!.model).toEqual(model);
  });

  it("repairs Expansion 1 impossibilities", () => {
    const raw = JSON.parse(JSON.stringify(V2_LEVEL8));
    raw.v = 3;
    raw.model.progress.galleryOpen = true;
    // An eel in a big tank, a sea nettle with fish, a light on a big tank, a panorama on pad A's neighbour B.
    raw.model.tanks[0].fish.push({ id: "f30", species: "eel" });
    raw.model.tanks[0].light = "pink";
    raw.model.tanks[1] = { id: "t5", type: "panorama", slot: "B", fish: [], decor: [], food: 100, clean: 100 };
    raw.model.tanks.push({ id: "t31", type: "cylinder", slot: "F", fish: [{ id: "f32", species: "seanettle" }, { id: "f33", species: "clownfish" }], decor: [], food: 100, clean: 100, light: "orange" });
    const m = decodeSave(JSON.stringify(raw))!.model;
    expect(m.tanks[0].fish.map((f) => f.species)).toEqual(["clownfish", "pufferfish"]);
    expect(m.tanks[0].light).toBeNull();
    expect(m.tanks.some((t) => t.slot === "B")).toBe(false);
    const f = m.tanks.find((t) => t.slot === "F")!;
    expect(f.fish.map((x) => x.species)).toEqual(["seanettle"]);
    expect(f.light).toBe("orange");
    // An open Gallery always has its middle tank.
    expect(m.tanks.find((t) => t.slot === "G")?.type).toBe("cylinder");
    // A Gallery saved before Level 8 is not open, and its tanks are not kept.
    raw.model.progress.stage = 7;
    const early = decodeSave(JSON.stringify(raw))!.model;
    expect(early.progress.galleryOpen).toBe(false);
    expect(early.tanks.some((t) => ["F", "G", "H"].includes(t.slot))).toBe(false);
  });
});
