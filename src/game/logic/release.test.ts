import { afterEach, describe, expect, it } from "vitest";
import { decay, HAPPY, happiness, latchHappy, newModel, newTank, type Model, type TankRec } from "./model";
import { DECOR } from "../data/decor";
import type { DecorKind } from "../types";
import { checkCoastMilestones, COAST_PRICE, habitatOpen, openCoast } from "./coast";
import { decodeSave, encodeSave } from "./save";
import { startEvent } from "../rush/logic";
import { COAST_HALL, HUB_HALL, LAGOON_HALL, roomOpen, roomOwned, SANCTUARY_HALL } from "../data/rooms";
import { anyPreview, clearPreviewAccess, COAST_HABITATS_SHOWN, coastHabitatShown, RELEASE } from "../data/release";
import { feedLagoon, grantLagoon, lagoonActive, newLagoonProgress, startLagoon, type LagoonProgress } from "./lagoon";
import { startSanctuary } from "./sanctuary";
import { getGame, setGame } from "../store";
import { endPreview, previewActive, startPreview } from "../flow/preview";

/**
 * Coast and Lagoon are released, with ownership checked separately. Sanctuary
 * and hidden coastal habitats remain unavailable; previews stay sandboxes.
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
  penguins.fish = [1, 2, 3, 4].map((k) => ({ id: `f8${k}`, species: "penguin" as const, name: `Pip ${k}` }));
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
      coast: { milestone: 3, sawPenguinSwim: true, sawSealDive: true, sawOtterFloat: false, penguinActs: 0, sealActs: 0, otterActs: 0, trophy: false, penguinsBought: 2 }
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

describe("released areas and remaining locks", () => {
  it("releases Coast and Lagoon while keeping Sanctuary and the other coast habitats locked", () => {
    expect(RELEASE.coast).toEqual({ built: true, released: true });
    expect(RELEASE.lagoon).toEqual({ built: true, released: true });
    expect(RELEASE.sanctuary).toEqual({ built: true, released: false });
    expect(COAST_HABITATS_SHOWN).toEqual(["penguins"]);
    expect(coastHabitatShown("seals")).toBe(false);
    expect(coastHabitatShown("otters")).toBe(false);
    const p = { ...coastOwner().progress, lagoonOpen: true, sanctuaryOpen: true };
    expect(roomOwned(COAST_HALL, p)).toBe(true);
    for (const hall of [COAST_HALL, LAGOON_HALL]) expect(roomOpen(hall, p)).toBe(true);
    expect(roomOpen(SANCTUARY_HALL, p)).toBe(false);
    const unowned = { ...p, coastOpen: false, lagoonOpen: false };
    for (const hall of [COAST_HALL, LAGOON_HALL]) expect(roomOpen(hall, unowned)).toBe(false);
    // The hub itself is unaffected.
    expect(roomOpen(HUB_HALL, p)).toBe(true);
  });

  it("charges exactly 320 once after the Shark Tunnel trophy and refuses a second purchase", () => {
    const m = coastOwner(1000);
    const fresh: Model = { ...m, progress: { ...m.progress, coastOpen: false, coast: undefined } };
    fresh.tanks = fresh.tanks.filter((t) => !["M", "N", "O"].includes(t.slot));
    expect(COAST_PRICE).toBe(320);
    expect(openCoast({ ...fresh, progress: { ...fresh.progress, tunnel: { ...fresh.progress.tunnel!, trophy: false } } })).toEqual({ ok: false, reason: "locked" });
    expect(openCoast({ ...fresh, coins: 319 })).toEqual({ ok: false, reason: "coins" });
    const bought = openCoast(fresh);
    expect(bought.ok).toBe(true);
    if (!bought.ok) throw new Error("Coast purchase failed");
    expect(bought.m.coins).toBe(680);
    expect(bought.m.progress.coastOpen).toBe(true);
    expect(bought.m.tanks.find((t) => t.slot === "M")?.fish).toHaveLength(2);
    expect(openCoast(bought.m)).toEqual({ ok: false, reason: "owned" });
    expect(checkCoastMilestones(bought.m)).toEqual({ m: bought.m, reached: [] });
    expect(reload(bought.m).coins).toBe(680);
  });

  it("returns saved penguins from model.stored to play and preserves every coast field", () => {
    const original = coastOwner(1234);
    // This is the shape of an old release-locked save.
    const coastal = original.tanks.filter((t) => ["M", "N", "O"].includes(t.slot));
    const oldSave: Model = { ...original, tanks: original.tanks.filter((t) => !coastal.includes(t)), stored: { tanks: coastal, fish: original.inv.fish, decor: original.inv.decor.filter((d) => d.kind === "otterToy") }, inv: { ...original.inv, fish: [], decor: original.inv.decor.filter((d) => d.kind !== "otterToy") } };
    const loaded = reload(oldSave);
    expect(loaded.progress.coastOpen).toBe(true);
    expect(loaded.progress.coast?.milestone).toBe(3);
    expect(loaded.coins).toBe(1234);
    expect(loaded.progress.coastIntroSeen).toBe(true);
    expect(loaded.progress.coast).toEqual(original.progress.coast);
    expect(loaded.tanks.find((t) => t.slot === "M")).toEqual(coastal[0]);
    expect(loaded.tanks.map((t) => t.slot)).toEqual(["A", "C", "G", "I", "L", "M"]);
    expect(habitatOpen(loaded, "penguins")).toBe(true);
    expect(habitatOpen(loaded, "seals")).toBe(false);
    expect(habitatOpen(loaded, "otters")).toBe(false);
    expect(loaded.inv.fish).toEqual([]);
    expect(loaded.inv.decor.map((d) => d.kind)).toEqual(["plant"]);
    // Hidden habitats are retained outside play.
    const s = loaded.stored!;
    expect(s.tanks.map((t) => [t.slot, t.fish.length, t.decor.map((d) => d.kind), Math.round(t.food)])).toEqual([
      ["N", 1, ["sealRock"], 100], ["O", 2, [], 100]
    ]);
    expect(s.fish.map((f) => f.species)).toEqual(["seal"]);
    expect(s.decor.map((d) => d.kind)).toEqual(["otterToy"]);
    // A second save and load changes nothing (ids stay unique past the stored ones).
    const again = reload(loaded);
    expect(again.stored).toEqual(loaded.stored);
    expect(again.progress.coast).toEqual(loaded.progress.coast);
    expect(again.tanks.find((t) => t.slot === "M")).toEqual(loaded.tanks.find((t) => t.slot === "M"));
    expect(again.coins).toBe(1234);
    expect(again.nextId).toBeGreaterThan(97);
  });

  it("lets no rule count the stored habitats", () => {
    const loaded = reload(coastOwner());
    // Care decay does not touch them.
    expect(decay(loaded, 600).stored).toEqual(loaded.stored);
    // A Rush Hour checklist only lists reachable tanks.
    const pending: Model = { ...loaded, rush: { ...loaded.rush!, unlocked: true, phase: "pending", pendingFor: 0 } };
    const ids = startEvent(pending, () => 0.5).rush!.event!.tankIds;
    expect(ids.sort()).toEqual(["t1", "t50", "t51", "t80"].sort());
    // The Level 8 judge only needs reachable tanks happy, including penguins.
    const judge: Model = { ...loaded, progress: { ...loaded.progress, superStar: false, allHappy: false }, tanks: loaded.tanks.map(makeHappy) };
    expect(judge.tanks.filter((t) => t.fish.length).every((t) => (happiness(t) ?? 0) >= HAPPY)).toBe(true);
    expect(latchHappy(judge).progress.allHappy).toBe(true);
    // Were they in play, the judge could never pass (the bug this storage prevents).
    const unreachable: Model = { ...judge, tanks: [...judge.tanks, ...judge.stored!.tanks] };
    expect(latchHappy(unreachable).progress.allHappy).toBe(false);
  });

  it.each([1, undefined] as const)("drops forged Lagoon ownership at coast milestone %s and all Sanctuary saved state", (milestone) => {
    const m = coastOwner();
    const forged = { ...m, progress: { ...m.progress, coast: milestone === undefined ? undefined : { ...m.progress.coast!, milestone }, lagoonOpen: true, lagoonIntroSeen: true, lagoon: { milestone: 5, trophy: true }, sanctuaryOpen: true, sanctuaryIntroSeen: true, sanctuary: { milestone: 5, trophy: true } } };
    const loaded = decodeSave(JSON.stringify({ v: 3, model: forged }))!.model;
    expect(loaded.progress.lagoonOpen).toBeUndefined();
    expect(loaded.progress.lagoon).toBeUndefined();
    expect(loaded.progress.lagoonIntroSeen).not.toBe(true);
    expect(loaded.progress.sanctuaryOpen).toBeUndefined();
    expect(loaded.progress.sanctuary).toBeUndefined();
    expect(loaded.progress.sanctuaryIntroSeen).toBeUndefined();
  });

  it("runs no Lagoon rule without ownership, nor Sanctuary rule without a preview", () => {
    const m = coastOwner();
    expect(startLagoon(m)).toBe(m);
    expect(startSanctuary(m)).toBe(m);
    expect(feedLagoon(m)).toBe(m);
    const forged = { ...m, progress: { ...m.progress, lagoon: newLagoonProgress() } };
    expect(lagoonActive(forged)).toBe(false);
    expect(feedLagoon(forged)).toBe(forged);
    const owner = grantLagoon(m);
    expect(lagoonActive(owner)).toBe(true);
    expect(feedLagoon(owner).progress.lagoon!.fed).toBe(1);
    const missingState: Model = { ...owner, progress: { ...owner.progress, lagoon: undefined } };
    expect(startLagoon(missingState).progress.lagoon).toEqual(newLagoonProgress());
    expect(startLagoon(owner)).toBe(owner);
  });
});

describe("Dolphin Lagoon ownership", () => {
  it("grants freely at coast milestone 2, is pure and idempotent, and never revokes or resets progress", () => {
    const m = coastOwner(456);
    m.progress.coast!.milestone = 2;
    const original = encodeSave(m);
    const granted = grantLagoon(m);
    expect(encodeSave(m)).toBe(original);
    expect(granted.progress.lagoonOpen).toBe(true);
    expect(granted.progress.lagoonIntroSeen).toBe(false);
    expect(granted.progress.lagoon).toEqual(newLagoonProgress());
    expect(granted.coins).toBe(456);
    expect(grantLagoon(granted)).toBe(granted);

    const progressed: Model = { ...granted, progress: { ...granted.progress, freePlay: false, coastOpen: false, coast: undefined, lagoonIntroSeen: true, lagoon: { ...granted.progress.lagoon!, fed: 7, food: 92 } } };
    expect(grantLagoon(progressed)).toBe(progressed);
    expect(progressed.progress.lagoonOpen).toBe(true);
    expect(progressed.progress.lagoon!.fed).toBe(7);
    expect(progressed.progress.lagoonIntroSeen).toBe(true);
  });

  it.each(["freePlay", "coastOpen", "milestone"] as const)("does not grant without %s", (requirement) => {
    const m = coastOwner();
    const progress = { ...m.progress,
      ...(requirement === "freePlay" ? { freePlay: false } : {}),
      ...(requirement === "coastOpen" ? { coastOpen: false } : {}),
      ...(requirement === "milestone" ? { coast: { ...m.progress.coast!, milestone: 1 as const } } : {})
    };
    const ineligible = { ...m, progress };
    expect(grantLagoon(ineligible)).toBe(ineligible);
    expect(ineligible.progress.lagoonOpen).toBeUndefined();
  });

  it("grants during Penguin Paradise in the same model update with one penguin reward and no coin charge", () => {
    const m = coastOwner(780);
    m.progress.coast = { ...m.progress.coast!, milestone: 1, sawPenguinSwim: true, penguinActs: 2 };
    const penguins = m.tanks.find((t) => t.slot === "M")!.fish.length;
    const completed = checkCoastMilestones(m);
    expect(completed.reached).toEqual([2]);
    expect(completed.m.progress.coast!.milestone).toBe(2);
    expect(completed.m.progress.lagoonOpen).toBe(true);
    expect(completed.m.progress.lagoonIntroSeen).toBe(false);
    expect(completed.m.progress.lagoon).toEqual(newLagoonProgress());
    expect(completed.m.coins).toBe(780);
    expect(completed.m.tanks.find((t) => t.slot === "M")!.fish).toHaveLength(penguins + 1);
    expect(completed.m.nextId).toBe(m.nextId + 1);
    expect(checkCoastMilestones(completed.m)).toEqual({ m: completed.m, reached: [] });
    expect(grantLagoon(completed.m)).toBe(completed.m);
    expect(reload(completed.m).progress.lagoonOpen).toBe(true);
  });

  it.each([1, 2, 3, 5] as const)("migrates an existing coast milestone %i save without replaying or changing coins", (milestone) => {
    const m = coastOwner(872);
    m.progress.coast!.milestone = milestone;
    const loaded = reload(m);
    expect(Boolean(loaded.progress.lagoonOpen)).toBe(milestone >= 2);
    expect(loaded.progress.coast!.milestone).toBe(milestone);
    expect(loaded.coins).toBe(872);
    expect(loaded.tanks.find((t) => t.slot === "M")!.fish).toEqual(m.tanks.find((t) => t.slot === "M")!.fish);
    if (milestone >= 2) {
      expect(loaded.progress.lagoonIntroSeen).toBe(false);
      expect(loaded.progress.lagoon).toEqual(newLagoonProgress());
    } else expect(loaded.progress.lagoon).toBeUndefined();
  });

  it("round-trips all owned Lagoon progress and dolphin names alongside Coast and coins", () => {
    const lagoon: LagoonProgress = {
      milestone: 5, food: 86, play: 74, together: 92,
      visited: ["lagoon", "gallery", "deck", "care"], fed: 11,
      seen: ["pair", "breath", "dive", "leap"], acts: 2,
      toys: ["ball", "bubbles", "kelp"], toysUsed: ["kelp", "ball"],
      decor: ["arch", "telescopes", "fountain"], tourDone: true, trophy: true
    };
    const base = coastOwner(2468);
    const owner: Model = { ...base, dolphinNames: { sora: "Sunny", mimi: "Mini", kai: "Blue", nami: "Wave" }, progress: { ...base.progress, lagoonOpen: true, lagoonIntroSeen: true, lagoon } };
    const loaded = reload(owner);
    expect(loaded.progress.lagoonOpen).toBe(true);
    expect(loaded.progress.lagoonIntroSeen).toBe(true);
    expect(loaded.progress.lagoon).toEqual(lagoon);
    expect(loaded.dolphinNames).toEqual(owner.dolphinNames);
    expect(loaded.progress.coast).toEqual(owner.progress.coast);
    expect(loaded.tanks.find((t) => t.slot === "M")).toEqual(owner.tanks.find((t) => t.slot === "M"));
    expect(loaded.coins).toBe(2468);
    expect(reload(loaded).progress.lagoon).toEqual(lagoon);
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
    // Released penguins are available both normally and in the sandbox.
    expect(getGame().model.tanks.map((t) => t.slot)).toContain("M");
    // Penguin-only (COAST_HABITATS_SHOWN): the hidden Seal Cove / Otter Bay stay stored, frozen, and nothing else does.
    const stored = getGame().model.stored;
    expect((stored?.tanks ?? []).map((t) => t.type).every((t) => t === "seals" || t === "otters")).toBe(true);
    expect((stored?.tanks ?? []).map((t) => t.slot)).not.toContain("M");
    // Lagoon and Sanctuary can still be previewed, and only the sandbox changes.
    expect(startPreview("lagoon")).toBe(true);
    setGame({ model: startLagoon(getGame().model) });
    expect(getGame().model.progress.lagoon?.milestone).toBe(0);
    expect(startPreview("sanctuary")).toBe(true);
    setGame({ model: startSanctuary(getGame().model) });
    expect(roomOpen(SANCTUARY_HALL, getGame().model.progress)).toBe(true);
    expect(getGame().model.progress.sanctuary).toBeDefined();
    expect(endPreview()).toBe(true);
    expect(getGame().model).toBe(saved);
    expect(getGame().previewAreas).toEqual([]);
    for (const hall of [COAST_HALL, LAGOON_HALL]) expect(roomOpen(hall, getGame().model.progress)).toBe(true);
    expect(roomOpen(SANCTUARY_HALL, getGame().model.progress)).toBe(false);
  });

  it("leave nothing behind even if the sandbox model were saved", () => {
    const owner = coastOwner();
    owner.progress.coast!.milestone = 1;
    setGame({ screen: "game", model: reload(owner), hall: 0 });
    startPreview("lagoon");
    startPreview("sanctuary");
    setGame({ model: startSanctuary(startLagoon(getGame().model)) });
    const sandbox = getGame().model;
    endPreview();
    // Unowned preview progress cannot become saved ownership.
    const after = reload(sandbox);
    expect(after.progress.lagoon).toBeUndefined();
    expect(after.progress.sanctuary).toBeUndefined();
    expect(after.tanks.some((t) => t.slot === "M")).toBe(true);
    expect(after.stored?.tanks.map((t) => t.type)).toEqual(["seals", "otters"]);
  });
});
