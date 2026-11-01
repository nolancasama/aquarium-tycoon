import { describe, expect, it } from "vitest";
import { newModel, newTank, swapDecor, type DecorRec, type Model, type Result } from "./model";
import { decodeSave, encodeSave } from "./save";

const incoming: DecorRec = { id: "d2", kind: "coral", variant: "blue" };
const displaced: DecorRec = { id: "d3", kind: "plant", variant: "big" };
const other: DecorRec = { id: "d4", kind: "rock", variant: "small" };
const spare: DecorRec = { id: "d5", kind: "shell", variant: null };

function fixture(occupied = true): Model {
  const m = newModel();
  return {
    ...m,
    progress: { ...m.progress, stage: 2, tutorial: "done" },
    tanks: [{ ...m.tanks[0], decor: occupied ? [{ ...displaced, slot: 0 }, { ...other, slot: 1 }] : [] }],
    inv: { ...m.inv, decor: [incoming, spare] },
    nextId: 6
  };
}

function success(r: Result): Model {
  if (!r.ok) throw new Error(`Unexpected refusal: ${r.reason}`);
  return r.m;
}

function owned(m: Model): DecorRec[] {
  return [...m.inv.decor, ...m.tanks.flatMap((t) => t.decor)]
    .map(({ id, kind, variant }) => ({ id, kind, variant }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe("decoration tray swapping", () => {
  it("places in an empty slot, removes only the incoming tray item and charges nothing", () => {
    const m = fixture(false);
    const before = structuredClone(m);
    const r = swapDecor(m, "t1", 2, incoming.id);
    const next = success(r);
    expect(r).toMatchObject({ ok: true, id: incoming.id });
    expect(next.tanks[0].decor).toEqual([{ ...incoming, slot: 2 }]);
    expect(next.inv.decor).toEqual([spare]);
    expect(next.coins).toBe(m.coins);
    expect(next.nextId).toBe(m.nextId);
    expect(m).toEqual(before);
  });

  it("replaces an occupied slot atomically and returns the displaced record without its slot", () => {
    const m = fixture();
    const before = structuredClone(m);
    const next = success(swapDecor(m, "t1", 0, incoming.id));
    expect(next.tanks[0].decor).toHaveLength(2);
    expect(next.tanks[0].decor.find((d) => d.slot === 0)).toEqual({ ...incoming, slot: 0 });
    expect(next.tanks[0].decor.find((d) => d.slot === 1)).toEqual({ ...other, slot: 1 });
    expect(next.inv.decor).toEqual([spare, displaced]);
    expect(next.coins).toBe(m.coins);
    expect(next.nextId).toBe(m.nextId);
    expect(m).toEqual(before);
  });

  it("reverses repeatedly when the displaced item is swapped into the same circle", () => {
    const original = fixture();
    let m = original;
    for (let i = 0; i < 20; i++) {
      const id = i % 2 === 0 ? incoming.id : displaced.id;
      m = success(swapDecor(m, "t1", 0, id));
      expect(m.tanks[0].decor.find((d) => d.slot === 0)?.id).toBe(id);
      expect(owned(m)).toEqual(owned(original));
      expect(m.tanks[0].decor).toHaveLength(2);
    }
    expect(m.tanks).toEqual(original.tanks);
    expect(m.inv.decor).toEqual([spare, incoming]);
  });

  it("carries the displaced item across different occupied slots", () => {
    const original = fixture();
    let m = success(swapDecor(original, "t1", 0, incoming.id));
    m = success(swapDecor(m, "t1", 1, displaced.id));
    expect(m.tanks[0].decor.find((d) => d.slot === 0)).toEqual({ ...incoming, slot: 0 });
    expect(m.tanks[0].decor.find((d) => d.slot === 1)).toEqual({ ...displaced, slot: 1 });
    expect(m.inv.decor).toEqual([spare, other]);
    expect(owned(m)).toEqual(owned(original));
  });

  it("leaves the complete input identical if the incoming decoration does not fit", () => {
    const m = fixture();
    m.inv.decor = [{ id: "d6", kind: "shipwreck", variant: null }, spare];
    m.nextId = 7;
    const before = structuredClone(m);
    expect(swapDecor(m, "t1", 0, "d6")).toEqual({ ok: false, reason: "tooBig" });
    expect(m).toEqual(before);
    // The same restriction also applies to an empty target.
    expect(swapDecor(m, "t1", 2, "d6")).toEqual({ ok: false, reason: "tooBig" });
    expect(m).toEqual(before);
  });

  it("checks the receiving tank's size and returns its decoration without further restrictions", () => {
    const m = fixture();
    const column = newTank("t6", "cylinder", "G");
    column.decor = [{ ...spare, slot: 0 }];
    m.tanks.push(column);
    m.inv.decor = [incoming, { id: "d7", kind: "bubbler", variant: null }];
    expect(swapDecor(m, column.id, 0, incoming.id)).toEqual({ ok: false, reason: "tooBig" });
    const next = success(swapDecor(m, column.id, 0, "d7"));
    expect(next.inv.decor).toEqual([incoming, spare]);
    expect(next.tanks[1].decor).toEqual([{ id: "d7", kind: "bubbler", variant: null, slot: 0 }]);
  });

  it("preserves every unique id and variant through swaps and placement", () => {
    const original = fixture();
    let m = success(swapDecor(original, "t1", 0, incoming.id));
    m = success(swapDecor(m, "t1", 1, displaced.id));
    m = success(swapDecor(m, "t1", 2, other.id));
    const records = owned(m);
    expect(records).toEqual(owned(original));
    expect(new Set(records.map((d) => d.id)).size).toBe(records.length);
    expect(new Set(m.tanks[0].decor.map((d) => d.slot)).size).toBe(3);
  });

  it("round-trips the swapped state through the existing save format and can swap back", () => {
    const m = fixture();
    const swapped = success(swapDecor(m, "t1", 0, incoming.id));
    const loaded = decodeSave(encodeSave(swapped));
    expect(loaded?.model).toEqual(swapped);
    const reversed = success(swapDecor(loaded!.model, "t1", 0, displaced.id));
    expect(reversed.tanks).toEqual(m.tanks);
    expect(owned(reversed)).toEqual(owned(m));
  });
});
