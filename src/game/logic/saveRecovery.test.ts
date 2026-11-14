import { describe, expect, it } from "vitest";
import fixture from "./realSave.fixture.json";
import { decodeSave, decodeSaveReport, encodeSave } from "./save";
import { bagAnimal, moveDecor, newModel, newTank, remodelTank, type Model, type Result } from "./model";
import { newLagoonProgress } from "./lagoon";

function editable() {
  return JSON.parse(encodeSave(newModel()));
}

function result(r: Result): Model {
  if (!r.ok) throw new Error(r.reason);
  return r.m;
}

describe("save recovery diagnostics", () => {
  it.each(["real aquarium", "retired language history"])("keeps %s assets, achievements and level when loading retired targets", (name) => {
    const raw = JSON.parse(JSON.stringify(fixture));
    if (name === "retired language history") {
      raw.model.progress.said.push(
        "aboveMe", "byMe", "yesItCan", "noItCant", "onRock", "inWater",
        "onWater", "underWater", "byIsland", "byBoat"
      );
      raw.model.progress.said = [...new Set(raw.model.progress.said)];
      raw.model.progress.seenPatterns.push("where", "canIt", "whereSeal", "whereDolphin", "whereOrca");
      raw.model.progress.seenPatterns = [...new Set(raw.model.progress.seenPatterns)];
      // Archived records are opaque: even old question / Look! ids survive intact.
      raw.model.quarantine = [
        { reason: "retired-language", raw: { kind: "where", answer: "aboveMe", pattern: "where", look: "underWater" } },
        { reason: "retired-language", raw: { kind: "can", answer: "noItCant", pattern: "canIt", look: "jump" } },
        { reason: "retired-language", raw: { kind: "where", answer: "byIsland", pattern: "whereOrca", asked: ["where"], look: "byBoat" } }
      ];
    }
    const loaded = decodeSaveReport(JSON.stringify(raw));
    expect(loaded.report.rejected).toEqual([]);
    expect(loaded.report.synthesizedTanks).toEqual([]);
    expect(loaded.report.counts.decoded).toEqual(loaded.report.counts.raw);
    const model = loaded.data!.model;
    // Tank equality includes every placed fish and decoration, their ids and care.
    expect(model.tanks).toEqual([...raw.model.tanks, ...raw.model.stored.tanks.filter((t: { type: string }) => t.type === "penguins")]);
    expect(model.inv).toEqual(raw.model.inv);
    expect(model.stored).toEqual({ ...raw.model.stored, tanks: raw.model.stored.tanks.filter((t: { type: string }) => t.type !== "penguins") });
    expect(model.coins).toBe(raw.model.coins);
    expect(model.stats).toEqual(raw.model.stats);
    // Includes the eight-level stage, stars, photo, trophies and historical answers.
    // Old saves gain an empty purchase allowance and the Lagoon earned at Penguin Paradise.
    const migrated = raw.model.progress.coast && raw.model.progress.coast.penguinsBought === undefined
      ? { ...raw.model.progress, coast: { ...raw.model.progress.coast, penguinsBought: 0 } } : raw.model.progress;
    expect(model.progress).toEqual({ ...migrated, lagoonOpen: true, lagoonIntroSeen: false, lagoon: newLagoonProgress() });
    expect(model.rush).toEqual(raw.model.rush);
    expect(model.quarantine).toEqual(raw.model.quarantine);
    expect(decodeSave(encodeSave(model))!.model).toEqual(model);
  });

  it("preserves every real tank, animal and decoration across repeated loads and twenty save cycles", () => {
    const text = JSON.stringify(fixture);
    const first = decodeSaveReport(text);
    expect(first.report.rejected).toEqual([]);
    expect(first.report.synthesizedTanks).toEqual([]);
    expect(first.report.counts.raw).toEqual(first.report.counts.decoded);
    expect(first.data!.model.tanks).toEqual([...fixture.model.tanks, ...fixture.model.stored.tanks.filter((t) => t.type === "penguins")]);
    expect(first.data!.model.stored).toEqual({ ...fixture.model.stored, tanks: fixture.model.stored.tanks.filter((t) => t.type !== "penguins") });
    expect(first.data!.model.tanks.filter((t) => ["A", "B"].includes(t.slot)).map((t) => t.slot)).toEqual(["A", "B"]);
    expect(first.data!.model.tanks.filter((t) => ["F", "G", "H"].includes(t.slot)).map((t) => t.slot).sort()).toEqual(["F", "G", "H"]);
    expect(first.data!.model.tanks.filter((t) => t.slot === "M").map((t) => t.slot)).toEqual(["M"]);
    expect(first.data!.model.stored!.tanks.map((t) => t.slot)).toEqual(["N", "O"]);
    for (let n = 0; n < 5; n++) expect(decodeSave(text)).toEqual(first.data);
    let model = first.data!.model;
    for (let n = 0; n < 20; n++) {
      const loaded = decodeSaveReport(encodeSave(model));
      expect(loaded.report.rejected).toEqual([]);
      expect(loaded.report.synthesizedTanks).toEqual([]);
      model = loaded.data!.model;
      expect(model.tanks).toEqual(first.data!.model.tanks);
      expect(model.inv).toEqual(first.data!.model.inv);
      expect(model.stored).toEqual(first.data!.model.stored);
    }
  });

  const cases: { reason: string; kind: string; change: (raw: ReturnType<typeof editable>) => void }[] = [
    { reason: "invalid-record", kind: "fish", change: (r) => r.model.tanks[0].fish.push(null) },
    { reason: "invalid-id", kind: "fish", change: (r) => r.model.tanks[0].fish.push({ species: "clownfish" }) },
    { reason: "duplicate-id", kind: "fish", change: (r) => r.model.tanks[0].fish.push({ id: "t1", species: "clownfish" }) },
    { reason: "unknown-species", kind: "fish", change: (r) => r.model.tanks[0].fish.push({ id: "f2", species: "unknown" }) },
    { reason: "unknown-decor", kind: "decor", change: (r) => r.model.tanks[0].decor.push({ id: "d2", kind: "unknown", slot: 0 }) },
    { reason: "unknown-variant", kind: "decor", change: (r) => r.model.tanks[0].decor.push({ id: "d2", kind: "shell", variant: "unknown", slot: 0 }) },
    { reason: "unknown-type", kind: "tank", change: (r) => r.model.tanks.push({ id: "t2", type: "unknown", slot: "B" }) },
    { reason: "unknown-slot", kind: "tank", change: (r) => r.model.tanks.push({ id: "t2", type: "small", slot: "unknown" }) },
    { reason: "slot-taken", kind: "tank", change: (r) => r.model.tanks.push({ id: "t2", type: "small", slot: "A" }) },
    { reason: "pad-type", kind: "tank", change: (r) => r.model.tanks.push({ id: "t2", type: "cylinder", slot: "B" }) },
    { reason: "room-not-owned", kind: "tank", change: (r) => r.model.tanks.push({ id: "t2", type: "big", slot: "D" }) },
    { reason: "stage-too-low", kind: "tank", change: (r) => r.model.tanks.push({ id: "t2", type: "big", slot: "B" }) },
    { reason: "no-space", kind: "fish", change: (r) => r.model.tanks[0].fish.push(...[2, 3, 4, 5].map((id) => ({ id: `f${id}`, species: "clownfish" }))) },
    { reason: "cannot-live", kind: "fish", change: (r) => r.model.tanks[0].fish.push({ id: "f2", species: "eel" }) },
    { reason: "decor-slot", kind: "decor", change: (r) => r.model.tanks[0].decor.push({ id: "d2", kind: "shell", variant: null, slot: 99 }) },
    { reason: "no-free-pad", kind: "invTank", change: (r) => { r.model.progress.stage = 8; r.model.tanks.push(newTank("t2", "small", "B")); r.model.inv.tanks.push("big"); } },
    { reason: "unknown-type", kind: "invTank", change: (r) => r.model.inv.tanks.push("unknown") },
    { reason: "unbuyable-type", kind: "invTank", change: (r) => r.model.inv.tanks.push("ocean") },
    { reason: "stage-too-low", kind: "invTank", change: (r) => r.model.inv.tanks.push("big") },
    { reason: "unknown-species", kind: "invFish", change: (r) => r.model.inv.fish.push({ id: "f2", species: "unknown" }) },
    { reason: "unknown-decor", kind: "invDecor", change: (r) => r.model.inv.decor.push({ id: "d2", kind: "unknown" }) }
  ];

  it.each(cases)("reports and retains $kind: $reason", ({ reason, kind, change }) => {
    const raw = editable();
    change(raw);
    const loaded = decodeSaveReport(JSON.stringify(raw));
    const rejected = loaded.report.rejected.find((r) => r.kind === kind && r.reason === reason);
    expect(rejected).toBeDefined();
    expect(loaded.data).not.toBeNull();
    const retained = { reason, raw: rejected!.raw };
    expect(loaded.data!.model.quarantine).toContainEqual(retained);
    const again = decodeSaveReport(encodeSave(loaded.data!.model));
    expect(again.report.rejected).toEqual([]);
    expect(again.data!.model.quarantine).toEqual(loaded.data!.model.quarantine);
    expect(again.data!.model.quarantine).toContainEqual(retained);
  });

  it("accounts for every record inside a rejected tank", () => {
    const raw = editable();
    raw.model.tanks.push({ id: "t2", type: "small", slot: "A", fish: [{ id: "f3", species: "clownfish" }], decor: [{ id: "d4", kind: "shell", variant: null, slot: 0 }] });
    const { data, report } = decodeSaveReport(JSON.stringify(raw));
    expect(report.rejected.map((r) => [r.kind, r.reason])).toEqual([["tank", "slot-taken"], ["fish", "tank-slot-taken"], ["decor", "tank-slot-taken"]]);
    expect(data!.model.quarantine).toHaveLength(3);
    expect(report.counts).toEqual({ raw: { tanks: 2, fish: 1, decor: 1 }, decoded: { tanks: 1, fish: 0, decor: 0 } });
  });

  it("keeps earlier quarantine entries verbatim, deduplicates, caps size and reserves their ids", () => {
    const raw = editable();
    const entry = { reason: "unknown-species", raw: { id: "f700", species: "unknown", extra: [1, { keep: true }] } };
    raw.model.quarantine = [entry, entry];
    raw.model.inv.fish.push(entry.raw);
    const loaded = decodeSaveReport(JSON.stringify(raw));
    expect(loaded.data!.model.quarantine).toEqual([entry]);
    expect(loaded.data!.model.nextId).toBeGreaterThan(700);
    expect(decodeSave(encodeSave(loaded.data!.model))!.model.quarantine).toEqual([entry]);
    raw.model.quarantine = Array.from({ length: 300 }, (_, id) => ({ reason: "old", raw: { id } }));
    expect(decodeSave(JSON.stringify(raw))!.model.quarantine).toHaveLength(200);
    raw.model.quarantine = [{ reason: "oversized", raw: "x".repeat(512 * 1024) }, entry];
    expect(decodeSave(JSON.stringify(raw))!.model.quarantine).toEqual([entry]);
  });

  it("reports synthesized permanent tanks without inventing animals or decorations", () => {
    const raw = editable();
    raw.model.progress.stage = 8;
    raw.model.progress.hallOpen = true;
    raw.model.progress.galleryOpen = true;
    const { data, report } = decodeSaveReport(JSON.stringify(raw));
    expect(report.synthesizedTanks.map((t) => [t.slot, t.type])).toEqual([["C", "ocean"], ["G", "cylinder"]]);
    expect(data!.model.tanks.every((t) => !t.fish.length && !t.decor.length)).toBe(true);
  });

  it("reports malformed saves and still diagnoses records if the starter is missing", () => {
    expect(decodeSaveReport("{broken").report.error).toBe("invalid-json");
    expect(decodeSaveReport('{"v":99,"model":{}}').report.error).toBe("unsupported-save");
    const raw = editable();
    raw.model.tanks[0].type = "unknown";
    const loaded = decodeSaveReport(JSON.stringify(raw));
    expect(loaded.data).toBeNull();
    expect(loaded.report.error).toBe("missing-starter-tank");
    expect(loaded.report.rejected).toHaveLength(1);
  });

  it("ordinary moves and remodels persist without creating quarantine or restoring removed records", () => {
    let model = decodeSave(JSON.stringify(fixture))!.model;
    const fish = model.tanks[0].fish[0];
    model = result(bagAnimal(model, fish.id));
    model = result(moveDecor(model, "t1", 0, 1));
    model = result(remodelTank(model, "t1", "hex"));
    const loaded = decodeSaveReport(encodeSave(model));
    expect(loaded.report.rejected).toEqual([]);
    expect(loaded.data!.model.quarantine).toBeUndefined();
    expect(loaded.data!.model.tanks).toEqual(model.tanks);
    expect(loaded.data!.model.inv).toEqual(model.inv);
    expect(loaded.data!.model.tanks[0].type).toBe("hex");
    expect(loaded.data!.model.tanks[0].fish.some((f) => f.id === fish.id)).toBe(false);
    expect(loaded.data!.model.inv.fish).toContainEqual(fish);
  });
});
