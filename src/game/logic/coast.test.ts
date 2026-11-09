import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAPPY, happiness, newModel, newTank, tankAt, type Model, type Result } from "./model";
import { clearPreviewAccess, grantPreview } from "../data/release";

// The zone is release-locked (data/release.ts; release.test.ts covers the lock).
// Its own rules are tested as they run when it may be entered: in a preview here.
beforeAll(() => grantPreview("coast"));
afterAll(() => clearPreviewAccess());
import { checkCoastMilestones, COAST_PRICE, coastUnlocked, habitatOpen, NEED_CAP, newCoastProgress, openCoast, recordCoastActivity, recordCoastSight } from "./coast";
import { decodeSave, encodeSave } from "./save";
import { decorFits } from "../data/decor";
import { COAST_HALL, HUB_HALL, roomOpen } from "../data/rooms";

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
  it("unlocks after the Shark Tunnel trophy, then costs coins, and opens with three penguins", () => {
    expect(coastUnlocked(tunnelDone(1000, false))).toBe(false);
    expect(openCoast(tunnelDone(1000, false))).toEqual({ ok: false, reason: "locked" });
    expect(openCoast(tunnelDone(COAST_PRICE - 1))).toEqual({ ok: false, reason: "coins" });
    const m = ok(openCoast(tunnelDone(COAST_PRICE + 7)));
    expect(m.coins).toBe(7);
    expect(m.progress.coast?.milestone).toBe(1);
    expect(tankAt(m, "M")?.type).toBe("penguins");
    expect(tankAt(m, "M")?.fish.map((f) => f.species)).toEqual(["penguin", "penguin", "penguin"]);
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
    let m = ok(openCoast(tunnelDone()));
    // Penguin Paradise: resting rocks, a swim seen, two activities.
    m = recordCoastSight(m, "penguinSwim");
    m = recordCoastActivity(m, "penguins");
    expect(m.progress.coast?.milestone).toBe(1);
    m = recordCoastActivity(m, "penguins");
    expect(m.progress.coast?.milestone).toBe(1);
    m = checkCoastMilestones(place(m, "M", "penguinRock")).m;
    expect(m.progress.coast?.milestone).toBe(2);
    expect(tankAt(m, "M")?.fish).toHaveLength(4);
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

  it("saves and loads the zone; older saves load with it closed; a forged one is not trusted", () => {
    let m = ok(openCoast(tunnelDone()));
    m = recordCoastSight(m, "penguinSwim");
    const back = decodeSave(encodeSave(m))!.model;
    expect(back.progress.coastOpen).toBe(true);
    expect(back.progress.coast).toEqual({ ...newCoastProgress(), milestone: 1, sawPenguinSwim: true });
    expect(tankAt(back, "M")?.fish).toHaveLength(3);
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
