import { describe, expect, it } from "vitest";
import { decodeSave, encodeSave } from "./save";
import { buyDecor, buyFish, buyTank, buyTickets, buyUpgrade, newModel, openHall, placeDecor, placeFish, placeTank, type Model, type Result } from "./model";

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

describe("save", () => {
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
    expect(decodeSave(JSON.stringify({ v: 3, model: played() }))).toBeNull();
    expect(decodeSave(JSON.stringify([1, 2]))).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 1, model: { tanks: [] } }))).toBeNull();
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
    expect(back.v).toBe(2);
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
