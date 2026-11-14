import { afterEach, describe, expect, it } from "vitest";
import { decay, HAPPY, happiness, latchHappy, newModel, newTank, type Model, type TankRec } from "./model";
import { DECOR } from "../data/decor";
import type { DecorKind } from "../types";
import { openCoast } from "./coast";
import { decodeSave, encodeSave } from "./save";
import { startEvent } from "../rush/logic";
import { COAST_HALL, HUB_HALL, LAGOON_HALL, roomOpen, roomOwned, SANCTUARY_HALL } from "../data/rooms";
import { anyPreview, clearPreviewAccess, RELEASE, RELEASE_AREAS } from "../data/release";
import { feedLagoon, startLagoon } from "./lagoon";
import { startSanctuary } from "./sanctuary";
import { getGame, setGame } from "../store";
import { endPreview, previewActive, startPreview } from "../flow/preview";

/**
 * Release locks (data/release.ts): the Coastal & Polar Zone, the Dolphin
 * Lagoon and the Grand Ocean Sanctuary stay closed in ordinary play whatever
 * the save, the coins or the trophies; saved coastal progress is kept (stored
 * out of play, written back); a development preview never persists.
 */

afterEach(() => {
  endPreview();
  clearPreviewAccess();
});

/** Free play, every hall, the Shark Tunnel finished, and a coast owned at milestone 3. */
function coastOwner(coins = 99999): Model {
  const m = newModel();
  const reef = newTank("t50", "reef", "I");
  reef.fish = ["clownfish", "bluetang", "yellowfish", "angelfish"].map((s, i) => ({ id: `f${60 + i}`, species: s as "clownfish" }));
  const sharks = newTank("t51", "sharks", "L");
  sharks.fish = [{ id: "f70", species: "blacktip" }];
  const small = newTank("t1", "small", "A");
  small.fish = [{ id: "f2", species: "clownfish" }];
  const penguins = newTank("t80", "penguins", "M");
  penguins.fish = [1, 2, 3, 4].map((k) => ({ id: `f8${k}`, species: "penguin" as const }));
  penguins.decor = [{ id: "d90", kind: "penguinRock", variant: null, slot: 0 }];
  penguins.food = 20;
  penguins.clean = 15;
  const seals = newTank("t81", "seals", "N");
  seals.fish = [{ id: "f91", species: "seal" }];
  seals.decor = [{ id: "d92", kind: "sealRock", variant: null, slot: 0 }];
  const otters = newTank("t82", "otters", "O");
  otters.fish = [{ id: "f93", species: "otter" }, { id: "f94", species: "otter" }];
  return {
    ...m, coins, nextId: 200,
    tanks: [small, newTank("t2", "ocean", "C"), newTank("t3", "cylinder", "G"), reef, sharks, penguins, seals, otters],
    inv: { fish: [{ id: "f95", species: "seal" }], decor: [{ id: "d96", kind: "otterToy", variant: null }, { id: "d97", kind: "plant", variant: "big" }], tanks: [] },
    progress: {
      ...m.progress, stage: 8, tutorial: "done", star: true, superStar: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
      tunnelOpen: true, tunnel: { milestone: 5, observed: 9, helped: 3, findDone: true, whereDone: true, countDone: true, trophy: true },
      coastOpen: true, coastIntroSeen: true,
      coast: { milestone: 3, sawPenguinSwim: true, sawSealDive: true, sawOtterFloat: false, penguinActs: 0, sealActs: 0, otterActs: 0, trophy: false, penguinsBought: 0 }
    }
  };
}

const reload = (m: Model) => decodeSave(encodeSave(m))!.model;

/** Fed, clean and decorated until happy (a pure helper: slots are not the point here). */
function makeHappy(t: TankRec): TankRec {
  if (!t.fish.length) return t;
  let x: TankRec = { ...t, food: 100, clean: 100 };
  const kinds: DecorKind[] = ["castle", "plant", "coral", "rock", "shell", "chest", "kelp", "arch"];
  for (let i = 0; i < kinds.length && (happiness(x) ?? 0) < HAPPY; i++) {
    x = { ...x, decor: [...x.decor, { id: `dj${t.id}${i}`, kind: kinds[i], variant: DECOR[kinds[i]].versions[0].variant, slot: 20 + i }] };
  }
  return x;
}

describe("release locks", () => {
  it("hold all three areas back in this build", () => {
    for (const a of RELEASE_AREAS) expect(RELEASE[a]).toEqual({ built: true, released: false });
    const p = { ...coastOwner().progress, lagoonOpen: true, sanctuaryOpen: true };
    expect(roomOwned(COAST_HALL, p)).toBe(true);
    for (const hall of [COAST_HALL, LAGOON_HALL, SANCTUARY_HALL]) expect(roomOpen(hall, p)).toBe(false);
    // The hub itself is unaffected.
    expect(roomOpen(HUB_HALL, p)).toBe(true);
  });

  it("no trophy or coin balance opens the coast", () => {
    const m = coastOwner(1_000_000);
    const fresh: Model = { ...m, progress: { ...m.progress, coastOpen: false, coast: undefined } };
    expect(openCoast(fresh)).toEqual({ ok: false, reason: "locked" });
  });

  it("keeps a saved coast, out of play, and writes it back unchanged", () => {
    const loaded = reload(coastOwner());
    expect(loaded.progress.coastOpen).toBe(true);
    expect(loaded.progress.coast?.milestone).toBe(3);
    // Nothing of the coast is in play...
    expect(loaded.tanks.map((t) => t.slot)).toEqual(["A", "C", "G", "I", "L"]);
    expect(loaded.inv.fish).toEqual([]);
    expect(loaded.inv.decor.map((d) => d.kind)).toEqual(["plant"]);
    // ...and all of it is kept.
    const s = loaded.stored!;
    expect(s.tanks.map((t) => [t.slot, t.fish.length, t.decor.map((d) => d.kind), Math.round(t.food)])).toEqual([
      ["M", 4, ["penguinRock"], 20], ["N", 1, ["sealRock"], 100], ["O", 2, [], 100]
    ]);
    expect(s.fish.map((f) => f.species)).toEqual(["seal"]);
    expect(s.decor.map((d) => d.kind)).toEqual(["otterToy"]);
    // A second save and load changes nothing (ids stay unique past the stored ones).
    const again = reload(loaded);
    expect(again.stored).toEqual(loaded.stored);
    expect(again.progress.coast).toEqual(loaded.progress.coast);
    expect(again.nextId).toBeGreaterThan(97);
  });

  it("lets no rule count the stored habitats", () => {
    const loaded = reload(coastOwner());
    // Care decay does not touch them.
    expect(decay(loaded, 600).stored).toEqual(loaded.stored);
    // A Rush Hour checklist only lists reachable tanks.
    const pending: Model = { ...loaded, rush: { ...loaded.rush!, unlocked: true, phase: "pending", pendingFor: 0 } };
    const ids = startEvent(pending, () => 0.5).rush!.event!.tankIds;
    expect(ids.sort()).toEqual(["t1", "t50", "t51"].sort());
    // The Level 8 judge only needs reachable tanks happy: the hungry, dirty penguins are stored.
    const judge: Model = { ...loaded, progress: { ...loaded.progress, superStar: false, allHappy: false }, tanks: loaded.tanks.map(makeHappy) };
    expect(judge.tanks.filter((t) => t.fish.length).every((t) => (happiness(t) ?? 0) >= HAPPY)).toBe(true);
    expect(latchHappy(judge).progress.allHappy).toBe(true);
    // Were they in play, the judge could never pass (the bug this storage prevents).
    const unreachable: Model = { ...judge, tanks: [...judge.tanks, ...judge.stored!.tanks] };
    expect(latchHappy(unreachable).progress.allHappy).toBe(false);
  });

  it("does not trust a saved lagoon or sanctuary while they are unreleased", () => {
    const m = coastOwner();
    const forged = { ...m, progress: { ...m.progress, lagoonOpen: true, lagoonIntroSeen: true, lagoon: { milestone: 5, trophy: true }, sanctuaryOpen: true, sanctuary: { milestone: 5, trophy: true } } };
    const loaded = decodeSave(JSON.stringify({ v: 3, model: forged }))!.model;
    expect(loaded.progress.lagoonOpen).toBeUndefined();
    expect(loaded.progress.lagoon).toBeUndefined();
    expect(loaded.progress.sanctuaryOpen).toBeUndefined();
    expect(loaded.progress.sanctuary).toBeUndefined();
  });

  it("runs no lagoon or sanctuary rule without a preview", () => {
    const m = coastOwner();
    expect(startLagoon(m)).toBe(m);
    expect(startSanctuary(m)).toBe(m);
    expect(feedLagoon(m)).toBe(m);
  });
});

describe("development previews", () => {
  it("open an area for the session only, and End preview restores the model", () => {
    const saved = reload(coastOwner());
    setGame({ screen: "game", model: saved, hall: 0 });
    expect(previewActive()).toBe(false);
    expect(startPreview("coast")).toBe(true);
    expect(previewActive()).toBe(true);
    expect(anyPreview()).toBe(true);
    expect(getGame().previewAreas).toEqual(["coast"]);
    expect(roomOpen(COAST_HALL, getGame().model.progress)).toBe(true);
    // In the sandbox the stored habitats are back in play.
    expect(getGame().model.tanks.map((t) => t.slot)).toContain("M");
    // Penguin-only (COAST_HABITATS_SHOWN): the hidden Seal Cove / Otter Bay stay stored, frozen, and nothing else does.
    const stored = getGame().model.stored;
    expect((stored?.tanks ?? []).map((t) => t.type).every((t) => t === "seals" || t === "otters")).toBe(true);
    expect((stored?.tanks ?? []).map((t) => t.slot)).not.toContain("M");
    // The lagoon too, with its state created only in memory.
    expect(startPreview("lagoon")).toBe(true);
    setGame({ model: startLagoon(getGame().model) });
    expect(getGame().model.progress.lagoon?.milestone).toBe(0);
    expect(endPreview()).toBe(true);
    expect(getGame().model).toBe(saved);
    expect(getGame().previewAreas).toEqual([]);
    for (const hall of [COAST_HALL, LAGOON_HALL, SANCTUARY_HALL]) expect(roomOpen(hall, getGame().model.progress)).toBe(false);
  });

  it("leave nothing behind even if the sandbox model were saved", () => {
    setGame({ screen: "game", model: reload(coastOwner()), hall: 0 });
    startPreview("lagoon");
    startPreview("sanctuary");
    setGame({ model: startSanctuary(startLagoon(getGame().model)) });
    const sandbox = getGame().model;
    endPreview();
    // Reloading what the sandbox held: no lagoon, no sanctuary, the coast stored again.
    const after = reload(sandbox);
    expect(after.progress.lagoon).toBeUndefined();
    expect(after.progress.sanctuary).toBeUndefined();
    expect(after.tanks.some((t) => t.slot === "M")).toBe(false);
    expect(after.stored?.tanks.length).toBe(3);
  });
});
