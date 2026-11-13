import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCoast, coastRt, syncCoast } from "../coast/coastRuntime";
import { type CoastHabitat } from "../data/coast";
import { clearPreviewAccess, grantPreview } from "../data/release";
import { COAST_HALL, LAGOON_HALL, SANCTUARY_HALL } from "../data/rooms";
import { clearLagoonRt } from "../lagoon/lagoonRuntime";
import { HABITAT_PAD, HABITAT_SPECIES, newCoastProgress } from "../logic/coast";
import { isActivePhrase, PHRASES } from "../logic/english";
import { newLagoonProgress } from "../logic/lagoon";
import { newModel, newTank } from "../logic/model";
import { makeRng } from "../logic/rng";
import { newSanctuaryProgress } from "../logic/sanctuary";
import { judgeSpeech } from "../logic/speechMatch";
import { resetRuntime, rt } from "../runtime";
import { clearSanctRt } from "../sanctuary/sanctuaryRuntime";
import { getGame, setGame } from "../store";
import { ask, type AskRequest } from "./ask";
import { coastCameraTick, releaseCoastCamera, startCoastActivity } from "./coast";
import { startLagoonActivity, startLagoonTour } from "./lagoon";
import { startSanctActivity, startSanctuaryTour } from "./sanctuary";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("./ask", () => ({ ask: vi.fn(), say: vi.fn(async () => undefined), speak: vi.fn(async () => undefined) }));
// Exercise the built Seal Cove/Otter Bay generators without changing their release visibility.
vi.mock("../data/release", async (original) => ({
  ...await original<typeof import("../data/release")>(),
  COAST_HABITATS_SHOWN: ["penguins", "seals", "otters"],
  coastHabitatShown: () => true
}));

const asked: AskRequest[] = [];

function checkQuestion(req: AskRequest): void {
  asked.push(req);
  expect(req.question?.en).not.toMatch(/\b(?:Can it|Where is)\b/i);
  for (const id of [...req.options, ...req.choices ?? [], ...req.judge ?? [], ...req.frame?.slots ?? []]) {
    expect(isActivePhrase(id)).toBe(true);
    expect(PHRASES[id].key).not.toMatch(/^(?:in|on|under|by|above|island|boat)$/i);
  }
  for (const id of req.options) {
    expect(req.choices).toContain(id);
    expect(judgeSpeech([PHRASES[id].en], (req.judge ?? req.options).map((p) => PHRASES[p])))
      .toMatchObject({ kind: "match", id });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  asked.length = 0;
  resetRuntime();
  clearCoast(); clearLagoonRt(); clearSanctRt();
  grantPreview("coast"); grantPreview("lagoon"); grantPreview("sanctuary");
  // Let presentation waits resolve immediately; prompts are captured at the actual ask() boundary.
  vi.stubGlobal("window", { setTimeout: (fn: () => void) => { fn(); return 0; }, clearTimeout: vi.fn() });
  setGame({ model: newModel(), screen: "game", mode: "play", prompt: null, line: null, settingsOpen: false,
    fade: 0, areaActivity: null, areaWaiting: null, areaPanel: null, panel: null, placing: null,
    coastActivity: null, coastWaiting: null, coastRevealing: false, toasts: [] });
  vi.mocked(ask).mockImplementation(async (req) => { checkQuestion(req); return null; });
});

afterEach(() => {
  releaseCoastCamera();
  clearCoast(); clearLagoonRt(); clearSanctRt();
  clearPreviewAccess();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("outdoor active curriculum", () => {
  it("scans all coastal habitat questions over many seeds and penguin counts", async () => {
    const random = vi.spyOn(Math, "random");
    for (let seed = 1; seed <= 100; seed++) {
      random.mockImplementation(makeRng(seed));
      for (const habitat of ["penguins", "seals", "otters"] as CoastHabitat[]) {
        const m = newModel(), t = newTank(`home-${habitat}`, habitat, HABITAT_PAD[habitat]);
        t.fish = Array.from({ length: habitat === "penguins" ? seed % 6 + 1 : 2 }, (_, n) => ({ id: `${habitat}-${n}`, species: HABITAT_SPECIES[habitat] }));
        m.tanks = [t];
        m.progress.coastOpen = true;
        m.progress.coastIntroSeen = true;
        m.progress.coast = { ...newCoastProgress(), milestone: 5 };
        setGame({ model: m, hall: COAST_HALL, coastView: habitat, coastUnderwater: habitat === "penguins",
          coastWaiting: { habitat, type: "child" } });
        syncCoast(m);
        const n = asked.length;
        await startCoastActivity();
        expect(asked).toHaveLength(n + 1);
        expect(asked[n].pattern).toBe(habitat === "penguins" ? "countPenguins" : "identify");
        expect(coastRt.hold.size).toBe(0);
      }
    }
  });

  it("borrows the penguin counting camera during the question and restores Underwater", async () => {
    const m = newModel(), t = newTank("penguins", "penguins", "M");
    t.fish = [{ id: "penguin", species: "penguin" }];
    m.tanks = [t]; m.progress.coastOpen = true; m.progress.coastIntroSeen = true;
    setGame({ model: m, hall: COAST_HALL, coastView: "penguins", coastUnderwater: true,
      coastWaiting: { habitat: "penguins", type: "child" } });
    syncCoast(m);
    coastRt.animals.get("penguin")!.m.area = "water";
    coastCameraTick(1366 / 768, 1);
    const gallery = structuredClone(rt.camera.shot);
    vi.mocked(ask).mockImplementationOnce(async (req) => {
      checkQuestion(req);
      coastCameraTick(1366 / 768, 1);
      expect(rt.camera.shot!.pos.y).toBeGreaterThan(10);
      return null;
    });
    await startCoastActivity();
    coastCameraTick(1366 / 768, 1);
    expect(rt.camera.shot).toEqual(gallery);
    expect(getGame().coastUnderwater).toBe(true);
  });

  it("scans Lagoon and Sanctuary visitor generators across milestones, views and seeds", async () => {
    const random = vi.spyOn(Math, "random");
    for (let seed = 1; seed <= 100; seed++) for (let milestone = 0; milestone <= 5; milestone++) {
      random.mockImplementation(makeRng(seed * 1009 + milestone));
      const m = newModel();
      m.progress.lagoon = { ...newLagoonProgress(), milestone: milestone as 0 | 1 | 2 | 3 | 4 | 5 };
      m.progress.sanctuary = { ...newSanctuaryProgress(), milestone: milestone as 0 | 1 | 2 | 3 | 4 | 5,
        belugas: milestone >= 3, asked: ["big", "count"] };
      setGame({ model: m, hall: LAGOON_HALL, lagoonView: seed % 2 ? "gallery" : "lagoon", areaWaiting: { area: "lagoon", type: "child" } });
      let n = asked.length;
      await startLagoonActivity();
      expect(asked).toHaveLength(n + 1);
      setGame({ model: m, hall: SANCTUARY_HALL, sanctuaryView: seed % 2 && milestone >= 3 ? "belugas" : "orcas",
        areaWaiting: { area: "sanctuary", type: "child" } });
      n = asked.length;
      await startSanctActivity();
      expect(asked).toHaveLength(n + 1);
    }
    expect(new Set(asked.map((q) => q.pattern))).toEqual(new Set(["identify", "countDolphins", "countOrcas", "bigSmall", "doLike", "color"]));
  });

  it("keeps tours at four and five questions and completes them with replacement answers", async () => {
    vi.mocked(ask).mockImplementation(async (req) => { checkQuestion(req); return req.options[0]; });
    const m = newModel();
    m.progress.lagoon = { ...newLagoonProgress(), milestone: 4 };
    m.progress.sanctuary = { ...newSanctuaryProgress(), milestone: 4, belugas: true };
    setGame({ model: m, hall: LAGOON_HALL, lagoonView: "lagoon" });
    await startLagoonTour();
    expect(asked.map((q) => q.pattern)).toEqual(["identify", "countDolphins", "bigSmall", "doLike"]);
    expect(getGame().model.progress.lagoon).toMatchObject({ milestone: 5, trophy: true });
    asked.length = 0;
    setGame({ hall: SANCTUARY_HALL, sanctuaryView: "orcas" });
    await startSanctuaryTour();
    expect(asked.map((q) => q.pattern)).toEqual(["identify", "countOrcas", "bigSmall", "identify", "doLike"]);
    expect(getGame().model.progress.sanctuary).toMatchObject({ milestone: 5, trophy: true });
  });

  it("rejects retired activity IDs even through explicit activity entry points", async () => {
    await startLagoonActivity("where" as never);
    await startLagoonActivity("can" as never);
    await startSanctActivity("where" as never);
    expect(asked).toEqual([]);
  });
});
