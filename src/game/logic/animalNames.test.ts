import { describe, expect, it } from "vitest";
import fixture from "./realSave.fixture.json";
import { animalName, cleanAnimalName, renameAnimal } from "./animalNames";
import { DOLPHINS } from "./lagoon";
import { decodeSave, decodeSaveReport, encodeSave } from "./save";
import type { Model } from "./model";

const original = JSON.stringify(fixture);
const loaded = () => decodeSave(original)!.model;
const penguin = (model: Model, id = "f91") => [...model.tanks, ...(model.stored?.tanks ?? [])]
  .flatMap((tank) => tank.fish).find((fish) => fish.id === id)!;

describe("individual animal names", () => {
  it("cleans optional names and retains Japanese, Latin, digits, spaces, hyphens and apostrophes", () => {
    expect(cleanAnimalName("  ゆき　 Snow  2 ")).toBe("ゆき Snow 2");
    expect(cleanAnimalName("カイ海-A'2")).toBe("カイ海-A'2");
    expect(cleanAnimalName("<海>&\"🐟")).toBe("海");
    expect(cleanAnimalName("A\u0000\u0007\n\rB")).not.toMatch(/[\u0000-\u001f\u007f]/);
    for (const value of [undefined, null, {}, 42, "   \t\n", "<>/&\"🐟"]) {
      expect(cleanAnimalName(value)).toBeUndefined();
    }
  });

  it("limits names by Unicode code points rather than UTF-16 units", () => {
    const name = "𠮷".repeat(12);
    expect(name.length).toBe(24);
    expect(cleanAnimalName(name)).toBe(name);
    expect(cleanAnimalName(`${name}海`)).toBe(name);
    expect(cleanAnimalName("abcdefghijklmnop")).toBe("abcdefghijkl");
  });

  it("loads the real save without changing any owned records, progress, currency or achievements", () => {
    const { data, report } = decodeSaveReport(original);
    expect(data).not.toBeNull();
    expect(report.rejected).toEqual([]);
    expect(report.synthesizedTanks).toEqual([]);
    expect(report.counts.raw).toEqual(report.counts.decoded);
    expect(data!.model.quarantine).toBeUndefined();
    expect(data!.model.tanks).toEqual(fixture.model.tanks);
    expect(data!.model.stored).toEqual(fixture.model.stored);
    expect(data!.model.inv).toEqual(fixture.model.inv);
    expect(data!.model.coins).toBe(fixture.model.coins);
    expect(data!.model.progress.stage).toBe(fixture.model.progress.stage);
    expect(data!.model.progress.said).toEqual(fixture.model.progress.said);
    expect(data!.model.progress.tunnel).toEqual(fixture.model.progress.tunnel);
    expect(data!.model.rush).toEqual(fixture.model.rush);
    expect(data!.model.stats).toEqual(fixture.model.stats);
    expect(data!.model.paid).toEqual(fixture.model.paid);
    expect(animalName(data!.model, "coast", "f91")).toMatch(/\S/);
    for (const dolphin of DOLPHINS) expect(animalName(data!.model, "lagoon", dolphin.id)).toBe(dolphin.name);
  });

  it("round-trips named stored penguins and release-locked dolphins without touching the aquarium", () => {
    const before = loaded();
    let named = renameAnimal(before, "coast", "f91", "ゆきちゃん");
    named = renameAnimal(named, "lagoon", "sora", "青空");
    expect(penguin(before).name).toBeUndefined();
    expect(penguin(named).name).toBe("ゆきちゃん");
    expect(named.dolphinNames).toEqual({ sora: "青空" });
    const { data, report } = decodeSaveReport(encodeSave(named));
    expect(report.rejected).toEqual([]);
    expect(data!.model).toEqual(named);
    expect(animalName(data!.model, "coast", "f91")).toBe("ゆきちゃん");
    expect(animalName(data!.model, "lagoon", "sora")).toBe("青空");
    expect(named.tanks).toEqual(before.tanks);
    expect(named.coins).toBe(before.coins);
    expect(named.progress).toEqual(before.progress);
  });

  it("keeps names attached to ids when other penguins reorder, arrive or leave", () => {
    const named = renameAnimal(loaded(), "coast", "f91", "雪");
    const changed: Model = { ...named, stored: { ...named.stored!, tanks: named.stored!.tanks
      .slice().reverse().map((tank) => tank.type === "penguins" ? {
        ...tank, fish: [{ id: "f1000", species: "penguin" }, ...tank.fish.slice().reverse().filter((fish) => fish.id !== "f92")]
      } : tank) } };
    const reloaded = decodeSave(encodeSave(changed))!.model;
    expect(animalName(reloaded, "coast", "f91")).toBe("雪");
    expect(animalName(reloaded, "coast", "f93")).toBe(animalName(named, "coast", "f93"));
    expect(penguin(reloaded, "f1000").name).toBeUndefined();
    expect(penguin(reloaded, "f93").name).toBeUndefined();
    const dolphin = renameAnimal(reloaded, "lagoon", "kai", "カイくん");
    expect(animalName(dolphin, "lagoon", "kai")).toBe("カイくん");
    expect(animalName(dolphin, "lagoon", "sora")).toBe("Sora");
  });

  it("preserves the name when a penguin is bagged into locked-area storage", () => {
    const named = renameAnimal(loaded(), "coast", "f91", "ゆき");
    const fish = penguin(named);
    const bagged: Model = { ...named, stored: { ...named.stored!,
      tanks: named.stored!.tanks.map((tank) => ({ ...tank, fish: tank.fish.filter((animal) => animal.id !== fish.id) })),
      fish: [...named.stored!.fish, fish]
    } };
    const renamed = renameAnimal(bagged, "coast", "f91", "雪ちゃん");
    const reloaded = decodeSave(encodeSave(renamed))!.model;
    expect(reloaded.stored!.fish.find((animal) => animal.id === "f91")?.name).toBe("雪ちゃん");
    expect(animalName(reloaded, "coast", "f91")).toBe("雪ちゃん");
  });

  it.each(["a".repeat(30), "海\u0000\n風", "<海>&\"", "   ", { invalid: true }])(
    "sanitizes invalid saved names without quarantining or dropping an animal (%j)", (input) => {
      const raw = JSON.parse(original);
      raw.model.stored.tanks[0].fish[0].name = input;
      raw.model.dolphinNames = { sora: input, kai: "カイ", unknown: "余分" };
      const { data, report } = decodeSaveReport(JSON.stringify(raw));
      expect(report.rejected).toEqual([]);
      expect(report.counts.raw).toEqual(report.counts.decoded);
      expect(data!.model.quarantine).toBeUndefined();
      expect(penguin(data!.model).name).toBe(cleanAnimalName(input));
      expect(data!.model.dolphinNames?.sora).toBe(cleanAnimalName(input));
      expect(data!.model.dolphinNames?.kai).toBe("カイ");
      expect(data!.model.dolphinNames).not.toHaveProperty("unknown");
      const expected = loaded();
      delete penguin(data!.model).name;
      delete data!.model.dolphinNames;
      expect(data!.model).toEqual(expected);
    }
  );

  it("restores default names when an empty cleaned name is saved", () => {
    const before = loaded();
    const named = renameAnimal(renameAnimal(before, "coast", "f91", "雪"), "lagoon", "sora", "空");
    const restored = renameAnimal(renameAnimal(named, "coast", "f91", "  "), "lagoon", "sora", "");
    expect(penguin(restored).name).toBeUndefined();
    expect(restored.dolphinNames?.sora).toBeUndefined();
    expect(animalName(restored, "coast", "f91")).toBe(animalName(before, "coast", "f91"));
    expect(animalName(restored, "lagoon", "sora")).toBe("Sora");
  });
});
