import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { decay, HAPPY, happiness, latchHappy, newModel, newTank, tankAt, type Model, type Result } from "./model";
import { clearPreviewAccess, COAST_HABITATS_SHOWN, grantPreview } from "../data/release";
import type { CoastHabitat } from "../data/coast";
import { startEvent } from "../rush/logic";
import { newRushState } from "../rush/types";
import { unstoreAvailable } from "./stored";

// The zone is release-locked (data/release.ts; release.test.ts covers the lock).
// Its own rules are tested as they run when it may be entered: in a preview here.
beforeAll(() => grantPreview("coast"));
afterAll(() => clearPreviewAccess());
import { buyPenguin, PENGUIN_PRICE, PENGUIN_PURCHASES, penguinBuyState, checkCoastMilestones, COAST_PRICE, coastMilestoneLimit, coastQuestionHabitats, coastUnlocked, habitatOpen, NEED_CAP, newCoastProgress, openCoast, recordCoastActivity, recordCoastSight, storeHiddenCoast } from "./coast";
import { decodeSave, encodeSave } from "./save";
import { decorFits } from "../data/decor";
import { COAST_HALL, HUB_HALL, roomOpen } from "../data/rooms";

const shown = COAST_HABITATS_SHOWN as CoastHabitat[];
const originalShown = [...shown];
afterEach(() => shown.splice(0, shown.length, ...originalShown));

function ok(r: Result): Model {
  if (!r.ok) throw new Error(r.reason);
  return r.m;
}

/** Free play with the Shark Tunnel finished (its trophy won). */
function tunnelDone(coins = 1000, trophy = true): Model {
  const m = newModel();
  const reef = newTank("t50", "reef", "I");
  reef.fish = ["clownfish", "bluetang", "yellowfish", "angelfish"].map((s, i) => ({ id: `f${60 + i}`, species: s as "clownfish" }));
  const sharks = newTank("t51", "sharks", "L");
  sharks.fish = [{ id: "f70", species: "blacktip" }];
  return {
    ...m, coins, nextId: 100,
    tanks: [newTank("t1", "small", "A"), newTank("t2", "ocean", "C"), newTank("t3", "cylinder", "G"), reef, sharks],
    progress: { ...m.progress, stage: 8, tutorial: "done", star: true, superStar: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
      tunnelOpen: true, tunnel: { milestone: trophy ? 5 : 4, observed: 9, helped: 3, findDone: trophy, whereDone: trophy, countDone: trophy, trophy } }
  };
}
const place = (m: Model, slot: "M" | "N" | "O", kind: string): Model => ({
  ...m, tanks: m.tanks.map((t) => t.slot === slot ? { ...t, decor: [...t.decor, { id: `d${m.nextId + t.decor.length + 500}`, kind: kind as "penguinRock", variant: null, slot: t.decor.length }] } : t)
});

describe("Coastal & Polar Zone rules", () => {
  it("unlocks after the Shark Tunnel trophy, then costs coins, and opens with two penguins", () => {
    expect(coastUnlocked(tunnelDone(1000, false))).toBe(false);
    expect(openCoast(tunnelDone(1000, false))).toEqual({ ok: false, reason: "locked" });
    expect(openCoast(tunnelDone(COAST_PRICE - 1))).toEqual({ ok: false, reason: "coins" });
    const m = ok(openCoast(tunnelDone(COAST_PRICE + 7)));
    expect(m.coins).toBe(7);
    expect(m.progress.coast?.milestone).toBe(1);
    expect(tankAt(m, "M")?.type).toBe("penguins");
    expect(tankAt(m, "M")?.fish.map((f) => f.species)).toEqual(["penguin", "penguin"]);
    expect(habitatOpen(m, "seals")).toBe(false);
    expect(roomOpen(COAST_HALL, m.progress)).toBe(true);
    expect(roomOpen(HUB_HALL, m.progress)).toBe(true);
    expect(openCoast(m)).toEqual({ ok: false, reason: "owned" });
  });

  it("each habitat takes only its own items", () => {
    expect(decorFits("penguinRock", "penguins")).toBe(true);
    expect(decorFits("penguinRock", "seals")).toBe(false);
    expect(decorFits("sealRock", "seals")).toBe(true);
    expect(decorFits("otterKelp", "otters")).toBe(true);
    expect(decorFits("plant", "penguins")).toBe(false);
    expect(decorFits("penguinNest", "big")).toBe(false);
  });

  it("caps happiness below happy until the needed item is placed", () => {
    let m = ok(openCoast(tunnelDone()));
    const t = tankAt(m, "M")!;
    const full = { ...t, food: 100, clean: 100, decor: [{ id: "dx", kind: "penguinNest" as const, variant: null, slot: 0 }, { id: "dy", kind: "penguinFeeder" as const, variant: null, slot: 1 }] };
    expect(happiness(full)).toBeLessThanOrEqual(NEED_CAP);
    expect(happiness(full)!).toBeLessThan(HAPPY);
    const withRock = { ...full, decor: [...full.decor, { id: "dz", kind: "penguinRock" as const, variant: null, slot: 2 }] };
    expect(happiness(withRock)!).toBeGreaterThanOrEqual(HAPPY);
    m = { ...m, tanks: m.tanks.map((x) => x.id === t.id ? withRock : x) };
    expect(happiness(tankAt(m, "M")!)!).toBeGreaterThanOrEqual(HAPPY);
  });

  it("advances the five milestones in order, each reward once", () => {
    // Widen the single release switch: the original full progression stays available.
    shown.splice(0, shown.length, "penguins", "seals", "otters");
    expect(coastMilestoneLimit()).toBe(5);
    let m = ok(openCoast(tunnelDone()));
    // Penguin Paradise: resting rocks, a swim seen, two activities.
    m = recordCoastSight(m, "penguinSwim");
    m = recordCoastActivity(m, "penguins");
    expect(m.progress.coast?.milestone).toBe(1);
    m = recordCoastActivity(m, "penguins");
    expect(m.progress.coast?.milestone).toBe(1);
    m = checkCoastMilestones(place(m, "M", "penguinRock")).m;
    expect(m.progress.coast?.milestone).toBe(2);
    expect(tankAt(m, "M")?.fish).toHaveLength(3);
    expect(tankAt(m, "N")?.fish.map((f) => f.species)).toEqual(["seal"]);
    // Running the check again pays nothing more.
    const again = checkCoastMilestones(m).m;
    expect(again.tanks.flatMap((t) => t.fish)).toHaveLength(m.tanks.flatMap((t) => t.fish).length);
    // Seal Cove.
    m = place(m, "N", "sealRock");
    m = recordCoastSight(m, "sealDive");
    m = recordCoastActivity(recordCoastActivity(m, "seals"), "seals");
    expect(m.progress.coast?.milestone).toBe(3);
    expect(tankAt(m, "O")?.fish.map((f) => f.species)).toEqual(["otter", "otter"]);
    expect(m.inv.decor.map((d) => d.kind)).toContain("sealBall");
    // Otter Bay: a floating toy, a float seen, one activity.
    m = place(m, "O", "otterToy");
    m = recordCoastActivity(recordCoastSight(m, "otterFloat"), "otters");
    expect(m.progress.coast?.milestone).toBe(4);
    expect(tankAt(m, "N")?.fish).toHaveLength(2);
    // Celebration: all three happy, one activity each.
    m = place(place(m, "O", "otterKelp"), "N", "sealBall");
    m = { ...m, tanks: m.tanks.map((t) => ({ ...t, food: 100, clean: 100 })) };
    for (const h of ["penguins", "seals", "otters"] as const) m = recordCoastActivity(m, h);
    expect(m.progress.coast?.milestone).toBe(5);
    expect(m.progress.coast?.trophy).toBe(true);
  });

  it("caps the penguin-only preview at milestone 2 and grants only its penguin reward", () => {
    let m = ok(openCoast(tunnelDone()));
    m = place(m, "M", "penguinRock");
    m = recordCoastSight(m, "penguinSwim");
    m = recordCoastActivity(recordCoastActivity(m, "penguins"), "penguins");
    expect(coastMilestoneLimit()).toBe(2);
    expect(m.progress.coast?.milestone).toBe(2);
    expect(tankAt(m, "M")?.fish).toHaveLength(3);
    expect(tankAt(m, "N")).toBeNull();
    expect(tankAt(m, "O")).toBeNull();
    expect(m.inv.fish).toEqual([]);
    expect(checkCoastMilestones(m).m).toBe(m);
    expect(recordCoastSight(m, "sealDive")).toBe(m);
    expect(recordCoastActivity(m, "otters")).toBe(m);
  });

  it("preserves hidden habitats, items and later progress through saves and excludes them from care, questions, Rush and the judge", () => {
    let m = ok(openCoast(tunnelDone()));
    const seal = { ...newTank("t200", "seals", "N"), food: 17, clean: 24, fish: [{ id: "f201", species: "seal" as const }], decor: [{ id: "d202", kind: "sealRock" as const, variant: null, slot: 0 }] };
    const otter = { ...newTank("t203", "otters", "O"), food: 13, clean: 19, fish: [{ id: "f204", species: "otter" as const }], decor: [{ id: "d205", kind: "otterToy" as const, variant: null, slot: 0 }] };
    m = { ...m, nextId: 210, tanks: [...m.tanks, seal, otter], inv: { ...m.inv, fish: [{ id: "f206", species: "seal" }], decor: [{ id: "d207", kind: "otterDen", variant: null }] }, progress: { ...m.progress, coast: { ...m.progress.coast!, milestone: 4, sawSealDive: true, sawOtterFloat: true, sealActs: 7, otterActs: 9 } } };
    const frozen = storeHiddenCoast(m);
    expect(frozen.stored?.tanks).toEqual([seal, otter]);
    expect(frozen.stored?.fish).toEqual(m.inv.fish);
    expect(frozen.stored?.decor).toEqual(m.inv.decor);
    expect(storeHiddenCoast(frozen)).toBe(frozen);
    expect(decay(frozen, 600).stored).toBe(frozen.stored);
    const back = storeHiddenCoast(decodeSave(encodeSave(frozen))!.model);
    expect(back.stored).toEqual(frozen.stored);
    expect(back.progress.coast).toEqual(frozen.progress.coast);
    expect(coastQuestionHabitats(m)).toEqual(["penguins"]);
    expect(coastQuestionHabitats(frozen)).toEqual(["penguins"]);
    const pending = { ...frozen, rush: { ...newRushState(), unlocked: true, phase: "pending" as const } };
    expect(startEvent(pending).rush!.event!.tankIds).not.toContain(seal.id);
    expect(startEvent(pending).rush!.event!.tankIds).not.toContain(otter.id);
    // Only the penguin is occupied, happy and reachable; hungry hidden animals cannot block the judge.
    const penguin = place(frozen, "M", "penguinRock").tanks.find((t) => t.type === "penguins")!;
    const judge: Model = { ...frozen, tanks: [{ ...penguin, food: 100, clean: 100 }], progress: { ...frozen.progress, superStar: false, allHappy: false } };
    expect(latchHappy(judge).progress.allHappy).toBe(true);
    // Editing the same switch restores stored records, questions and the original milestone range.
    shown.splice(0, shown.length, "penguins", "seals", "otters");
    const restored = storeHiddenCoast(unstoreAvailable(frozen));
    expect(restored.stored).toBeUndefined();
    expect(tankAt(restored, "N")).toBe(seal);
    expect(tankAt(restored, "O")).toBe(otter);
    expect(coastQuestionHabitats(restored)).toEqual(["penguins", "seals", "otters"]);
    expect(coastMilestoneLimit()).toBe(5);
  });

  it("2 at opening, 3 after Penguin Paradise, then two bought one at a time for 60 coins each (5 in all)", () => {
    let m = ok(openCoast(tunnelDone(COAST_PRICE + 500)));
    const penguins = () => tankAt(m, "M")!.fish.filter((f) => f.species === "penguin");
    expect(penguins()).toHaveLength(2);
    m = place(m, "M", "penguinRock");
    m = recordCoastSight(m, "penguinSwim");
    m = recordCoastActivity(recordCoastActivity(m, "penguins"), "penguins");
    expect(m.progress.coast?.milestone).toBe(2);
    expect(penguins()).toHaveLength(3);
    expect(PENGUIN_PRICE).toBe(60);
    expect(PENGUIN_PURCHASES).toBe(2);
    const coins = m.coins, ids = new Set(penguins().map((f) => f.id));
    const first = buyPenguin(m);
    if (!first.ok) throw new Error(first.reason);
    expect(first.id).toMatch(/^f\d+$/);
    expect(ids.has(first.id!)).toBe(false);
    m = first.m;
    expect(m.coins).toBe(coins - 60);
    expect(penguins().map((f) => f.id)).toContain(first.id);
    expect(m.progress.coast?.penguinsBought).toBe(1);
    const second = buyPenguin(m);
    if (!second.ok) throw new Error(second.reason);
    expect(second.id).not.toBe(first.id);
    m = second.m;
    expect(penguins()).toHaveLength(5);
    expect(m.coins).toBe(coins - 120);
    expect(penguinBuyState(m)).toEqual({ ok: false, reason: "bought", left: 0 });
    expect(buyPenguin(m)).toEqual({ ok: false, reason: "locked" });
    // Bought penguins, their ids and the allowance survive a save and reload.
    const back = decodeSave(encodeSave(m))!.model;
    expect(tankAt(back, "M")!.fish.map((f) => f.id)).toEqual(tankAt(m, "M")!.fish.map((f) => f.id));
    expect(back.progress.coast?.penguinsBought).toBe(2);
    expect(back.coins).toBe(m.coins);
  });

  it("refuses a penguin without coins, without room, or before the coast is open; never overfills", () => {
    const closed = tunnelDone(1000);
    expect(penguinBuyState(closed)).toMatchObject({ ok: false, reason: "locked" });
    let m = ok(openCoast(tunnelDone(COAST_PRICE + 59)));
    expect(penguinBuyState(m)).toEqual({ ok: false, reason: "coins", left: 2 });
    expect(buyPenguin(m)).toEqual({ ok: false, reason: "coins" });
    // A colony already at the six-bird capacity cannot take another, whatever the allowance.
    m = { ...m, coins: 999, tanks: m.tanks.map((t) => t.slot === "M" ? { ...t, fish: Array.from({ length: 6 }, (_, i) => ({ id: `f${900 + i}`, species: "penguin" as const })) } : t) };
    expect(penguinBuyState(m)).toEqual({ ok: false, reason: "full", left: 2 });
    expect(buyPenguin(m)).toEqual({ ok: false, reason: "full" });
  });

  it("an older save keeps its three or four penguins and names, and may still buy two up to six", () => {
    let m = ok(openCoast(tunnelDone(COAST_PRICE + 500)));
    // As saved before 2026-11-14: three penguins from opening, one from Penguin Paradise, no purchase field.
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `f${200 + i}`, species: "penguin" as const, ...(i === 0 ? { name: "ゆき" } : {}) }));
    m = { ...m, tanks: m.tanks.map((t) => t.slot === "M" ? { ...t, fish: four } : t), progress: { ...m.progress, coast: { ...m.progress.coast!, milestone: 2 } } };
    const raw = JSON.parse(encodeSave(m));
    delete raw.model.progress.coast.penguinsBought;
    const old = decodeSave(JSON.stringify(raw))!.model;
    expect(tankAt(old, "M")!.fish).toEqual(four);
    expect(old.progress.coast?.penguinsBought).toBe(0);
    let after = ok(buyPenguin(old));
    after = ok(buyPenguin(after));
    expect(tankAt(after, "M")!.fish).toHaveLength(6);
    expect(tankAt(after, "M")!.fish.slice(0, 4)).toEqual(four);
    expect(penguinBuyState(after)).toMatchObject({ ok: false, reason: "bought" });
    // A forged allowance cannot exceed the limit.
    const forged = JSON.parse(encodeSave(old));
    forged.model.progress.coast.penguinsBought = -7;
    expect(decodeSave(JSON.stringify(forged))!.model.progress.coast?.penguinsBought).toBe(0);
    forged.model.progress.coast.penguinsBought = 40;
    expect(decodeSave(JSON.stringify(forged))!.model.progress.coast?.penguinsBought).toBe(2);
  });

  it("saves and loads the zone; older saves load with it closed; a forged one is not trusted", () => {
    let m = ok(openCoast(tunnelDone()));
    m = recordCoastSight(m, "penguinSwim");
    const back = decodeSave(encodeSave(m))!.model;
    expect(back.progress.coastOpen).toBe(true);
    expect(back.progress.coast).toEqual({ ...newCoastProgress(), milestone: 1, sawPenguinSwim: true });
    expect(tankAt(back, "M")?.fish).toHaveLength(2);
    expect(back.coins).toBe(m.coins);
    // A save from before the zone existed.
    const old = tunnelDone();
    const loaded = decodeSave(JSON.stringify({ v: 3, model: { ...old, progress: { ...old.progress, coastOpen: undefined, coast: undefined, coastIntroSeen: undefined, hubIntroSeen: undefined } } }))!.model;
    expect(loaded.progress.coastOpen).toBe(false);
    expect(loaded.tanks.map((t) => t.id)).toEqual(old.tanks.map((t) => t.id));
    expect(loaded.tanks.flatMap((t) => t.fish.map((f) => f.id))).toEqual(old.tanks.flatMap((t) => t.fish.map((f) => f.id)));
    // Claiming the zone open without the Shark Tunnel trophy is not trusted.
    const forged = tunnelDone(1000, false);
    expect(decodeSave(JSON.stringify({ v: 3, model: { ...forged, progress: { ...forged.progress, coastOpen: true } } }))!.model.progress.coastOpen).toBe(false);
    // A missing habitat is rebuilt for the milestone reached.
    const noSeals = { ...m, progress: { ...m.progress, coast: { ...m.progress.coast!, milestone: 2 as const } } };
    const repaired = decodeSave(encodeSave(noSeals))!.model;
    expect(tankAt(repaired, "N")?.type).toBe("seals");
  });
});
