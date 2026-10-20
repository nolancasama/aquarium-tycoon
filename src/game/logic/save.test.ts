import { describe, expect, it } from "vitest";
import { decodeSave, encodeSave } from "./save";
import { buyDecor, buyFish, buyTank, newModel, placeDecor, placeFish, placeTank, type Model, type Result } from "./model";

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

  it("discards corrupted, foreign and outdated saves", () => {
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave("{not json")).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 0, model: played() }))).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 2, model: played() }))).toBeNull();
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
