import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPECIES } from "../data/fish";
import { newModel, newTank, remodelPlan, type HomeReason, type Model, type TankRec } from "../logic/model";
import { resetRuntime, rt, type FishRt } from "../runtime";
import { getGame, model, setGame } from "../store";
import type { SpeciesId, TankType } from "../types";
import { ask } from "./ask";
import { animalOrderChoices, bagRemodelAnimal, buyGallery, cancelPlacing, confirmRemodel, HOME_REASON_TEXT, openLights, orderAnimal, orderFish, shopHomeReason, startRemodel, tapTank } from "./actions";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("../sim", () => ({ dropPellets: vi.fn() }));
vi.mock("./visitors", () => ({ answerShow: vi.fn(), openRequest: vi.fn() }));
vi.mock("./ask", () => ({ ask: vi.fn(), say: vi.fn(async () => undefined), speak: vi.fn(async () => undefined) }));

function expansion(): Model {
  const m = newModel();
  return { ...m, coins: 1000, progress: { ...m.progress, stage: 8, tutorial: "done", hallOpen: true } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { setTimeout: vi.fn() });
  resetRuntime();
  setGame({ model: expansion(), screen: "game", mode: "play", view: "room", hall: 0, tankId: null, panel: null, placing: null, prompt: null, line: null, stageCard: null, settingsOpen: false, toasts: [] });
});

afterEach(() => { resetRuntime(); vi.unstubAllGlobals(); });

describe("animal counter decisions", () => {
  it("keeps the Level 7 jellyfish order to its original single question", async () => {
    const m = expansion();
    m.progress.stage = 7;
    m.tanks = [newTank("tall", "tall", "B")];
    setGame({ model: m });
    vi.mocked(ask).mockResolvedValue("jellyfishPlease");
    expect(await orderAnimal()).toBe("jellyfish");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ask).mock.calls[0][0].options).toEqual(["seahorsePlease", "jellyfishPlease"]);
    expect(model().inv.fish[0].species).toBe("jellyfish");
  });

  it("offers one jellyfish name, then only affordable available jelly colours", async () => {
    const m = expansion();
    m.coins = 50;
    m.tanks = [newTank("column", "cylinder", "D")];
    const choices = animalOrderChoices(m);
    expect(choices.options).toEqual(["jellyfishPlease"]);
    expect(choices.jelly).toEqual(["jellyfish", "moonjelly", "spottedjelly"]);
    expect(choices.jellyColors).toEqual(["purplePlease", "whitePlease", "bluePlease"]);
    setGame({ model: m });
    vi.mocked(ask).mockResolvedValueOnce("jellyfishPlease").mockImplementationOnce(async (req) => {
      expect(getGame().panel).toBe("animalShop");
      expect(req.question?.en).toBe("What color?");
      expect(req.options).toEqual(choices.jellyColors);
      return "bluePlease";
    });
    expect(await orderAnimal()).toBe("spottedjelly");
    expect(ask).toHaveBeenCalledTimes(2);
    expect(model().inv.fish[0].species).toBe("spottedjelly");
    expect(model().coins).toBe(0);
  });

  it("buys the sole available new jelly directly and cancels a colour choice without paying", async () => {
    const m = expansion();
    m.tanks = [newTank("column", "cylinder", "D")];
    m.inv.fish = [];
    setGame({ model: m });
    vi.mocked(ask).mockResolvedValueOnce("jellyfishPlease").mockResolvedValueOnce(null);
    expect(await orderAnimal()).toBeNull();
    expect(model()).toBe(m);
    expect(getGame().panel).toBeNull();
    // With a tall home only, the original jellyfish is the sole jelly option at Level 8 too.
    m.tanks = [newTank("tall", "tall", "B")];
    vi.mocked(ask).mockClear().mockResolvedValue("jellyfishPlease");
    expect(await orderAnimal()).toBe("jellyfish");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it.each(["purplePlease", "redPlease", "greenPlease"] as const)("orders a new fish by %s", async (id) => {
    const m = expansion();
    m.tanks = [newTank("reef", "big", "B")];
    setGame({ model: m });
    vi.mocked(ask).mockImplementation(async (req) => { expect(req.options).toContain(id); return id; });
    const species = await orderFish();
    expect(species).toBe(({ purplePlease: "angelfish", redPlease: "goby", greenPlease: "chromis" } as const)[id]);
    expect(model().inv.fish[0].species).toBe(species);
  });
});

describe("habitat explanations", () => {
  const cases: [HomeReason, SpeciesId, TankType, string, string][] = [
    ["bigger", "angelfish", "small", "Needs a bigger tank!", "もっと おおきな タンクが ひつようだよ"],
    ["rocky", "eel", "small", "Needs a rocky home!", "いわの ほらあな タンクが ひつようだよ"],
    ["jelly", "moonjelly", "small", "Needs a jellyfish tank!", "クラゲの まるい タンクが ひつようだよ"],
    ["ocean", "turtle", "big", "Needs the Ocean tank!", "うみの タンクに すむよ"],
    ["tall", "seahorse", "small", "Needs a tall tank!", "たかい タンクに すむよ"],
    ["jellyOnly", "clownfish", "cylinder", "Jellyfish only!", "ここは クラゲ だけの タンクだよ"],
    ["notSafe", "clownfish", "cave", "Not safe here!", "ウツボや タコの いえだよ。ここは あぶないよ"],
    ["noMix", "jellyfish", "tall", "Jellyfish live alone!", "クラゲは ほかの いきものを さすよ。クラゲ だけで くらすよ"],
    ["full", "clownfish", "small", "This tank is full!", "この タンクは いっぱい"]
  ];
  it("covers every HomeReason with shared bilingual copy", () => {
    expect(Object.keys(HOME_REASON_TEXT).sort()).toEqual(cases.map(([r]) => r).sort());
  });
  it.each(cases)("explains %s when placing an animal", (reason, species, type, en, ja) => {
    const m = expansion();
    const t = newTank("home", type, "B");
    if (reason === "noMix") t.fish = [{ id: "resident", species: "seahorse" }];
    if (reason === "full") t.fish = [0, 1, 2].map((i) => ({ id: `r${i}`, species: "clownfish" }));
    m.tanks = [t];
    m.inv.fish = [{ id: "bagged", species }];
    setGame({ model: m, placing: { kind: "fish", fishId: "bagged" } });
    tapTank(t.id);
    expect(getGame().toasts.at(-1)).toMatchObject({ en, ja });
    expect(model()).toBe(m);
  });
  it("uses a compatible occupied home for the shop reason", () => {
    const m = expansion();
    const t = newTank("home", "tall", "B");
    t.fish = [{ id: "resident", species: "seahorse" }];
    m.tanks = [t];
    expect(shopHomeReason(m, "jellyfish")).toBe("noMix");
    expect(shopHomeReason(m, "eel")).toBe(SPECIES.eel.needs);
  });
});

describe("remodel preview and commit", () => {
  function prepare(): TankRec {
    const m = expansion();
    const t = newTank("home", "big", "B");
    t.fish = [{ id: "fish", species: "clownfish" }];
    t.decor = [{ id: "arch", kind: "arch", variant: null, slot: 0 }, { id: "shell", kind: "shell", variant: null, slot: 1 }];
    t.food = 72; t.clean = 83; t.upgrades.lamp = true;
    m.tanks = [t];
    setGame({ model: m });
    return t;
  }
  it("opens the preview from an animal-blocked plan without changing the model; cancel is unchanged", () => {
    const t = prepare();
    const before = model();
    expect(remodelPlan(before, t.id, "cave").reason).toBe("habitat");
    startRemodel("cave");
    tapTank(t.id);
    expect(getGame().panel).toBe("remodel");
    expect(getGame().placing).toEqual({ kind: "remodel", type: "cave", tankId: t.id });
    confirmRemodel();
    expect(model()).toBe(before);
    cancelPlacing();
    expect(getGame().panel).toBeNull();
    expect(model()).toBe(before);
  });
  it("bags blockers explicitly, then commits the trade-in and resets simulated bounds", () => {
    const t = prepare();
    startRemodel("cave"); tapTank(t.id);
    bagRemodelAnimal("fish");
    expect(model().inv.fish).toEqual(t.fish);
    expect(model().tanks[0].fish).toEqual([]);
    const plan = remodelPlan(model(), t.id, "cave");
    const coins = model().coins;
    rt.fish.set("stale-school-member", { tankId: t.id } as FishRt);
    confirmRemodel();
    expect(model().tanks[0]).toMatchObject({ type: "cave", food: 72, clean: 83, upgrades: { lamp: true }, decor: plan.keep });
    expect(model().coins).toBe(coins - plan.cost);
    expect(rt.fish.size).toBe(0);
  });
  it("returns decorations to the tray and preserves animals, and refuses short funds", () => {
    const t = prepare();
    t.fish = [{ id: "horse", species: "seahorse" }];
    startRemodel("hex"); tapTank(t.id);
    const plan = remodelPlan(model(), t.id, "hex");
    expect(plan.toTray.map((d) => d.id)).toEqual(["arch"]);
    setGame({ model: { ...model(), coins: plan.cost - 1 } });
    confirmRemodel();
    expect(model().tanks[0].type).toBe("big");
    setGame({ model: { ...model(), coins: plan.cost } });
    confirmRemodel();
    expect(model().coins).toBe(0);
    expect(model().tanks[0].fish).toEqual(t.fish);
    expect(model().inv.decor).toEqual(plan.toTray);
    expect(getGame().toasts.at(-1)?.en).toContain("1 decorations");
  });
});

describe("display lights and Gallery", () => {
  it("asks a free light colour through the standard phrases", async () => {
    const m = expansion();
    m.tanks = [newTank("column", "cylinder", "D")];
    setGame({ model: m, view: "tank", tankId: "column" });
    vi.mocked(ask).mockResolvedValue("pinkPlease");
    await openLights();
    expect(vi.mocked(ask).mock.calls[0][0].question?.en).toBe("What color?");
    expect(model().tanks[0].light).toBe("pink");
    expect(model().coins).toBe(m.coins);
    expect(getGame().panel).toBeNull();
  });
  it("opens the Gallery and selects its room with a built-in jelly column", () => {
    buyGallery();
    expect(model().progress.galleryOpen).toBe(true);
    expect(getGame().hall).toBe(2);
    expect(model().tanks.some((t) => t.slot === "G" && t.type === "cylinder")).toBe(true);
    expect(getGame().toasts.at(-1)?.en).toBe("The Jellyfish Gallery!");
  });
});
