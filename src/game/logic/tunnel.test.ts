import { describe, expect, it } from "vitest";
import { canLive, homeReason, isSpeciesUnlocked, newModel, newTank, placeDecor, buyDecor, buyFish, placeFish, remodelPlan, usedSpace, hasSpace, type Model, type Result } from "./model";
import { checkTunnelMilestones, chooseTunnelActivity, openSharkTunnel, recordTunnelActivity, RETIRED_TUNNEL_ACTIVITIES, SHARK_TUNNEL_PRICE, tunnelAnswers, tunnelQuestion, tunnelUnlocked } from "./tunnel";
import { decodeSave, encodeSave } from "./save";
import { HUB_HALL, roomOpen } from "../data/rooms";
import { decorFits } from "../data/decor";
import { SPECIES } from "../data/fish";
import { TANKS } from "../data/tanks";
import type { SpeciesId } from "../types";
import type { TunnelSpecies } from "../tunnel/contract";
import { PHRASES } from "./english";
import { makeRng } from "./rng";
import { judgeSpeech } from "./speechMatch";

function ok(r: Result): Model {
  if (!r.ok) throw new Error(r.reason);
  return r.m;
}

/** Free play with the Atrium open and its reef holding `reefAnimals` animals. */
function atrium(reefAnimals: number, coins = 1000): Model {
  const m = newModel();
  const reef = newTank("t50", "reef", "I");
  const species: SpeciesId[] = ["clownfish", "bluetang", "yellowfish", "angelfish", "goby", "parrotfish"];
  reef.fish = species.slice(0, reefAnimals).map((s, i) => ({ id: `f${60 + i}`, species: s }));
  return {
    ...m, coins, nextId: 100,
    tanks: [newTank("t1", "small", "A"), newTank("t2", "ocean", "C"), newTank("t3", "cylinder", "G"), reef],
    progress: { ...m.progress, stage: 8, tutorial: "done", star: true, superStar: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true }
  };
}
const habitat = (m: Model) => m.tanks.find((t) => t.type === "sharks")!;

describe("Shark Tunnel rules", () => {
  it("unlocks after meaningful Atrium progress, then costs coins", () => {
    expect(tunnelUnlocked(atrium(3))).toBe(false);
    expect(openSharkTunnel(atrium(3))).toEqual({ ok: false, reason: "locked" });
    expect(tunnelUnlocked(atrium(4))).toBe(true);
    expect(openSharkTunnel(atrium(4, SHARK_TUNNEL_PRICE - 1))).toEqual({ ok: false, reason: "coins" });
    const m = ok(openSharkTunnel(atrium(4, SHARK_TUNNEL_PRICE + 5)));
    expect(m.coins).toBe(5);
    expect(m.progress.tunnelOpen).toBe(true);
    expect(habitat(m).slot).toBe("L");
    // Milestone 1 (Grand Opening) gives the first blacktip straight into the habitat.
    expect(m.progress.tunnel?.milestone).toBe(1);
    expect(habitat(m).fish.map((f) => f.species)).toEqual(["blacktip"]);
    expect(openSharkTunnel(m)).toEqual({ ok: false, reason: "owned" });
  });

  it("keeps sharks and rays in the habitat and everything else out of it", () => {
    const m = ok(openSharkTunnel(atrium(4)));
    const h = habitat(m);
    for (const s of ["blacktip", "zebrashark", "eagleray"] as SpeciesId[]) {
      expect(canLive(s, h)).toBe(true);
      for (const t of m.tanks.filter((x) => x.type !== "sharks")) expect(canLive(s, t)).toBe(false);
      expect(homeReason(s, m.tanks[0])).toBe("sharks");
    }
    for (const s of ["clownfish", "turtle", "stingray", "moonjelly"] as SpeciesId[]) expect(canLive(s, h)).toBe(false);
    expect(remodelPlan(m, h.id, "ocean").reason).toBe("locked");
  });

  it("uses a large capacity, sharks taking three places and rays two (occupied / total)", () => {
    expect(TANKS.sharks.capacity).toBe(16);
    expect(SPECIES.blacktip.space).toBe(3);
    expect(SPECIES.zebrashark.space).toBe(3);
    expect(SPECIES.eagleray.space).toBe(2);
    let m = ok(openSharkTunnel(atrium(4, 2000)));
    for (const s of ["blacktip", "eagleray", "eagleray", "blacktip"] as SpeciesId[]) {
      m = ok(buyFish(m, s));
      const f = m.inv.fish[m.inv.fish.length - 1];
      m = ok(placeFish(m, f.id, habitat(m).id));
    }
    expect(usedSpace(habitat(m))).toBe(3 + 3 + 2 + 2 + 3);
    expect(hasSpace(habitat(m), "blacktip")).toBe(true);
    expect(hasSpace(habitat(m), "eagleray")).toBe(true);
    m = ok(buyFish(m, "eagleray"));
    m = ok(placeFish(m, m.inv.fish[m.inv.fish.length - 1].id, habitat(m).id));
    expect(usedSpace(habitat(m))).toBe(15);
    expect(hasSpace(habitat(m), "blacktip")).toBe(false);
    expect(hasSpace(habitat(m), "eagleray")).toBe(false);
  });

  it("sells the zebra shark only after milestone 4, and the structures only in the habitat", () => {
    const m = ok(openSharkTunnel(atrium(4)));
    expect(isSpeciesUnlocked(m, "blacktip")).toBe(true);
    expect(isSpeciesUnlocked(m, "eagleray")).toBe(true);
    expect(isSpeciesUnlocked(m, "zebrashark")).toBe(false);
    expect(isSpeciesUnlocked(atrium(4), "blacktip")).toBe(false);
    for (const kind of ["tunnelArch", "tunnelPinnacle", "tunnelShelf", "tunnelLedge", "tunnelSand"] as const) {
      expect(decorFits(kind, "sharks")).toBe(true);
      expect(decorFits(kind, "ocean")).toBe(false);
      expect(decorFits(kind, "reef")).toBe(false);
    }
    expect(decorFits("rock", "sharks")).toBe(false);
  });

  it("advances milestones in order with their rewards", () => {
    let m = ok(openSharkTunnel(atrium(4, 3000)));
    // Help counts only from the end of the First Tunnel Tour: no double completion.
    m = recordTunnelActivity(m, "find", true);
    m = recordTunnelActivity(m, "identify", true);
    expect(m.progress.tunnel?.helped).toBe(0);
    m = recordTunnelActivity(m, "like", false);
    expect(m.progress.tunnel?.milestone).toBe(2);
    // Reward 2: the big arch in the tray.
    expect(m.inv.decor.some((d) => d.kind === "tunnelArch")).toBe(true);
    for (let i = 0; i < 2; i++) m = recordTunnelActivity(m, "find", true);
    expect(m.progress.tunnel?.milestone).toBe(2);
    m = recordTunnelActivity(m, "count", true);
    expect(m.progress.tunnel?.milestone).toBe(3);
    // Reward 3: an eagle ray in the habitat.
    expect(habitat(m).fish.map((f) => f.species)).toContain("eagleray");
    // Milestone 4: three structures and a happy habitat.
    for (const [kind, zone] of [["tunnelPinnacle", 1], ["tunnelShelf", 3]] as const) {
      m = ok(buyDecor(m, kind, null));
      const d = m.inv.decor[m.inv.decor.length - 1];
      m = ok(placeDecor(m, d.id, habitat(m).id, zone));
    }
    const arch = m.inv.decor.find((d) => d.kind === "tunnelArch")!;
    m = ok(placeDecor(m, arch.id, habitat(m).id, 0));
    m = { ...m, tanks: m.tanks.map((t) => (t.type === "sharks" ? { ...t, food: 100, clean: 100 } : t)) };
    const r = checkTunnelMilestones(m);
    expect(r.reached).toEqual([4]);
    m = r.m;
    expect(isSpeciesUnlocked(m, "zebrashark")).toBe(true);
    expect(habitat(m).fish.map((f) => f.species)).toContain("zebrashark");
    // Milestone 5: find, identify, count in a row on the guided tour (not a visitor's question).
    m = recordTunnelActivity(m, "find", false);
    m = recordTunnelActivity(m, "like", false); // breaks the sequence
    m = recordTunnelActivity(m, "identify", false);
    m = recordTunnelActivity(m, "count", false);
    expect(m.progress.tunnel?.milestone).toBe(4);
    m = recordTunnelActivity(m, "find", false);
    m = recordTunnelActivity(m, "identify", false);
    m = recordTunnelActivity(m, "count", false);
    expect(m.progress.tunnel?.milestone).toBe(5);
    expect(m.progress.tunnel?.trophy).toBe(true);
    // Still open and playable afterwards.
    expect(recordTunnelActivity(m, "find", true).progress.tunnel?.observed).toBeGreaterThan(m.progress.tunnel!.observed);
  });

  it("puts a reward animal in the bag when the habitat is full", () => {
    let m = ok(openSharkTunnel(atrium(4, 3000)));
    m = { ...m, tanks: m.tanks.map((t) => (t.type === "sharks" ? { ...t, fish: [...t.fish, ...["a", "b", "c", "d"].map((x) => ({ id: `x${x}`, species: "blacktip" as SpeciesId }))] } : t)) };
    expect(usedSpace(habitat(m))).toBe(15);
    m = { ...m, progress: { ...m.progress, tunnel: { ...m.progress.tunnel!, milestone: 2, helped: 3 } } };
    m = checkTunnelMilestones(m).m;
    expect(m.progress.tunnel?.milestone).toBe(3);
    expect(m.inv.fish.map((f) => f.species)).toContain("eagleray");
  });

  it("never schedules retired grammar across habitat rosters and many seeds", () => {
    const seen = new Set<string>();
    const rosters: TunnelSpecies[][] = [[], ["blacktip"], ["eagleray"], ["zebrashark"], ["blacktip", "zebrashark", "eagleray"]];
    for (const roster of rosters) for (let seed = 1; seed <= 500; seed++) {
      const activity = chooseTunnelActivity(roster, makeRng(seed));
      if (!roster.length) { expect(activity).toBeNull(); continue; }
      expect(activity).not.toBeNull();
      const { kind, target } = activity!;
      seen.add(kind);
      expect(RETIRED_TUNNEL_ACTIVITIES).not.toContain(kind);
      expect(tunnelQuestion(kind, target).en).not.toMatch(/Can it|Where is/i);
      for (let count = 1; count <= 6; count++) {
        const answers = tunnelAnswers(kind, target, count);
        for (const id of [...answers.options, ...answers.choices, ...answers.judge]) {
          expect(PHRASES[id].key).not.toMatch(/^(in|on|under|by|above)$/i);
        }
        for (const id of answers.options) {
          expect(answers.choices).toContain(id);
          expect(judgeSpeech([PHRASES[id].en], answers.judge.map((choice) => PHRASES[choice]))).toMatchObject({ kind: "match", id });
        }
      }
    }
    expect([...seen].sort()).toEqual(["count", "find", "identify", "like", "show"]);
  });

  it("treats retired completion IDs as no-ops and preserves saved final-tour credit", () => {
    const opened = ok(openSharkTunnel(atrium(4)));
    const m: Model = { ...opened, progress: { ...opened.progress, tunnel: { ...opened.progress.tunnel!, milestone: 4, findDone: true, whereDone: true } } };
    for (const retired of RETIRED_TUNNEL_ACTIVITIES) expect(recordTunnelActivity(m, retired, false)).toBe(m);
    const loaded = decodeSave(encodeSave(m))!.model;
    expect(loaded.progress.tunnel).toEqual(m.progress.tunnel);
    expect(recordTunnelActivity(loaded, "count", false).progress.tunnel?.milestone).toBe(5);
  });

  it("saves and loads the wing; old saves load with it closed", () => {
    let m = ok(openSharkTunnel(atrium(4)));
    m = recordTunnelActivity(m, "find", false);
    const back = decodeSave(encodeSave(m))!.model;
    expect(back.progress.tunnelOpen).toBe(true);
    expect(back.progress.tunnel?.milestone).toBe(1);
    expect(back.progress.tunnel?.observed).toBe(1);
    expect(habitat(back).fish.map((f) => f.species)).toEqual(["blacktip"]);
    const old = atrium(4);
    const oldText = JSON.stringify({ v: 3, model: { ...old, progress: { ...old.progress, tunnelOpen: undefined, tunnel: undefined, tunnelIntroSeen: undefined } } });
    const loaded = decodeSave(oldText)!.model;
    expect(loaded.progress.tunnelOpen).toBeFalsy();
    expect(loaded.tanks.some((t) => t.type === "sharks")).toBe(false);
    expect(loaded.tanks.length).toBe(old.tanks.length);
    // A save claiming the wing open without the Atrium is not trusted.
    const forged = JSON.stringify({ v: 3, model: { ...old, progress: { ...old.progress, atriumOpen: false, tunnelOpen: true } } });
    expect(decodeSave(forged)!.model.progress.tunnelOpen).toBe(false);
  });

  it("opens the Grand Hub for a saved Shark Tunnel without any new save field; the intro flag round-trips", () => {
    const m = ok(openSharkTunnel(atrium(4)));
    // A save from before the hub existed: no hubIntroSeen at all.
    const before = JSON.stringify({ v: 3, model: { ...m, progress: { ...m.progress, hubIntroSeen: undefined } } });
    const loaded = decodeSave(before)!.model;
    expect(roomOpen(HUB_HALL, loaded.progress)).toBe(true);
    expect(loaded.progress.hubIntroSeen).toBe(false);
    expect(loaded.coins).toBe(m.coins);
    expect(loaded.tanks.map((t) => t.id)).toEqual(m.tanks.map((t) => t.id));
    const seen = decodeSave(encodeSave({ ...m, progress: { ...m.progress, hubIntroSeen: true } }))!.model;
    expect(seen.progress.hubIntroSeen).toBe(true);
    // Not before the Shark Tunnel.
    expect(roomOpen(HUB_HALL, atrium(4).progress)).toBe(false);
    expect(decodeSave(encodeSave({ ...atrium(4), progress: { ...atrium(4).progress, hubIntroSeen: true } }))!.model.progress.hubIntroSeen).toBe(false);
  });
});
