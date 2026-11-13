import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newModel, type Model } from "./model";
import {
  checkLagoonMilestones, feedLagoon, finishLagoonTour, giveToy, lagoonHappiness, lagoonPlayed, lagoonTogether, NEED_FLOOR, NEED_SECONDS,
  readLagoonProgress, recordLagoonActivity, recordLagoonSight, startLagoon, tickLagoon, visitLagoonView
} from "./lagoon";
import {
  addSticker, checkSanctuaryMilestones, chooseImprovement, CLEANUP_PIECES, finishSanctuaryTour, pickLitter, readSanctuaryProgress, recordSanctuaryAnswer, startSanctuary
} from "./sanctuary";
import { clearPreviewAccess, grantPreview } from "../data/release";
import { lagoonTo, sanctuaryTo } from "../../ui/DebugPanel";

/**
 * The Dolphin Lagoon and Grand Ocean Sanctuary rules, tested as they run when
 * the areas may be entered (a preview here; release.test.ts covers the lock):
 * needs, milestones in order, each reward exactly once, and save reading that
 * never trusts rewards a milestone has not given.
 */

beforeAll(() => { grantPreview("lagoon"); grantPreview("sanctuary"); });
afterAll(() => clearPreviewAccess());

const lagoon = (m: Model) => m.progress.lagoon!;
const sanct = (m: Model) => m.progress.sanctuary!;

describe("Dolphin Lagoon rules", () => {
  it("starts with three needs and only changes them while time passes there", () => {
    const m = startLagoon(newModel());
    expect(lagoon(m)).toMatchObject({ milestone: 0, food: 55, play: 30, together: 50, toys: ["ball", "bubbles"] });
    expect(lagoonHappiness(lagoon(m))).toBe(45);
    const later = tickLagoon(m, NEED_SECONDS.food / 10);
    expect(lagoon(later).food).toBeCloseTo(45, 5);
    // The care team never lets a need fall to nothing.
    expect(lagoon(tickLagoon(m, 10_000)).food).toBe(NEED_FLOOR);
    expect(lagoon(feedLagoon(m)).food).toBe(100);
    expect(lagoon(lagoonTogether(lagoonPlayed(m)))).toMatchObject({ play: 40, together: 68 });
  });

  it("only gives toys the dolphins have (the kelp is a reward)", () => {
    const m = startLagoon(newModel());
    expect(giveToy(m, "kelp")).toBe(m);
    expect(lagoon(giveToy(m, "bubbles"))).toMatchObject({ toysUsed: ["bubbles"], together: 66 });
  });

  it("reaches the five milestones in order, each reward once", () => {
    let m = startLagoon(newModel());
    // 1: two viewpoints and a feed.
    m = visitLagoonView(m, "gallery");
    expect(lagoon(m).milestone).toBe(0);
    m = feedLagoon(visitLagoonView(m, "deck"));
    expect(lagoon(m)).toMatchObject({ milestone: 1, decor: ["arch"] });
    // 2: two swimming together, two answers (answers before the milestone do not count twice).
    m = recordLagoonActivity(recordLagoonSight(m, "pair"));
    expect(lagoon(m).milestone).toBe(1);
    m = recordLagoonActivity(m);
    expect(lagoon(m)).toMatchObject({ milestone: 2, acts: 0 });
    expect(lagoon(m).toys).toContain("kelp");
    // 3: a breath, a deep dive and two visitors helped.
    m = recordLagoonActivity(recordLagoonActivity(recordLagoonSight(recordLagoonSight(m, "breath"), "dive")));
    expect(lagoon(m)).toMatchObject({ milestone: 3, decor: ["arch", "telescopes"] });
    // 4: two different toys and a happy pod.
    m = giveToy(giveToy(m, "kelp"), "kelp");
    expect(lagoon(m).milestone).toBe(3);
    for (let i = 0; i < 3; i++) m = lagoonTogether(lagoonPlayed(lagoonPlayed(feedLagoon(giveToy(m, "ball")))));
    expect(lagoon(m)).toMatchObject({ milestone: 4, decor: ["arch", "telescopes", "fountain"] });
    // 5: the tour, the trophy.
    m = finishLagoonTour(m);
    expect(lagoon(m)).toMatchObject({ milestone: 5, trophy: true });
    // Nothing more, however often it is checked.
    const again = checkLagoonMilestones(checkLagoonMilestones(m).m);
    expect(again.reached).toEqual([]);
    expect(lagoon(again.m).decor).toEqual(["arch", "telescopes", "fountain"]);
    expect(lagoon(again.m).toys).toEqual(["ball", "bubbles", "kelp"]);
  });

  it("the debug jumps use the real rules and never duplicate a reward", () => {
    const m = lagoonTo(lagoonTo(newModel(), 5), 5);
    expect(lagoon(m)).toMatchObject({ milestone: 5, trophy: true, decor: ["arch", "telescopes", "fountain"] });
    expect(lagoon(m).toys.filter((t) => t === "kelp")).toHaveLength(1);
  });

  it("reads a saved lagoon without trusting rewards its milestone has not given", () => {
    const p = readLagoonProgress({ milestone: 1, food: 999, toys: ["ball", "bubbles", "kelp"], decor: ["arch", "fountain"], trophy: true, tourDone: true, seen: ["pair", "nonsense"] });
    expect(p).toMatchObject({ milestone: 1, food: 100, toys: ["ball", "bubbles"], decor: ["arch"], trophy: false, tourDone: false, seen: ["pair"] });
  });
});

describe("Grand Ocean Sanctuary rules", () => {
  it("reaches the five milestones through research and conservation, each reward once", () => {
    let m = startSanctuary(newModel());
    expect(sanct(m).milestone).toBe(0);
    m = addSticker(m, "breath");
    expect(sanct(m)).toMatchObject({ milestone: 1, decor: ["flags"] });
    // Ocean Giants: big or small (its own sticker), how many, a deep dive.
    m = recordSanctuaryAnswer(addSticker(m, "dive"), "big");
    expect(sanct(m).stickers).toContain("big");
    expect(sanct(m).milestone).toBe(1);
    m = recordSanctuaryAnswer(m, "count");
    expect(sanct(m)).toMatchObject({ milestone: 2, decor: ["flags", "sizeBoard"] });
    // Family and Friends: no beluga sticker before their cove opens.
    expect(sanct(addSticker(m, "beluga")).stickers).not.toContain("beluga");
    m = recordSanctuaryAnswer(addSticker(addSticker(m, "together"), "family"), "like");
    expect(sanct(m)).toMatchObject({ milestone: 3, belugas: true });
    expect(sanct(addSticker(m, "beluga")).stickers).toContain("beluga");
    // Ocean Guardians: five pieces of litter and a habitat improvement.
    for (let i = 0; i < CLEANUP_PIECES - 1; i++) m = pickLitter(m);
    expect(sanct(m)).toMatchObject({ litter: CLEANUP_PIECES - 1, cleanupDone: false });
    m = pickLitter(m);
    expect(sanct(m)).toMatchObject({ litter: 0, cleanupDone: true });
    expect(sanct(m).stickers).toContain("clean");
    expect(sanct(m).milestone).toBe(3);
    m = chooseImprovement(m, "quiet");
    expect(sanct(m)).toMatchObject({ milestone: 4, improvement: "quiet", decor: ["flags", "sizeBoard", "guardianFlag"] });
    m = finishSanctuaryTour(m);
    expect(sanct(m)).toMatchObject({ milestone: 5, trophy: true });
    expect(checkSanctuaryMilestones(m).reached).toEqual([]);
  });

  it("the debug jumps use the real rules and never duplicate a reward", () => {
    const m = sanctuaryTo(sanctuaryTo(newModel(), 5), 5);
    expect(sanct(m)).toMatchObject({ milestone: 5, trophy: true, belugas: true, decor: ["flags", "sizeBoard", "guardianFlag"] });
  });

  it("reads a saved sanctuary without trusting what its milestone has not given", () => {
    const p = readSanctuaryProgress({ milestone: 2, belugas: true, stickers: ["breath", "beluga", "fake"], decor: ["guardianFlag"], improvement: "music", litter: 99, trophy: true });
    expect(p).toMatchObject({ milestone: 2, belugas: false, stickers: ["breath"], decor: ["flags", "sizeBoard"], improvement: null, litter: CLEANUP_PIECES - 1, trophy: false });
  });

  it("keeps historical location answers and observation stickers as completed progress", () => {
    const saved = { milestone: 2, asked: ["big", "count", "where"], acts: 7, stickers: ["breath", "dive", "big", "together", "family", "spyhop"], litter: 2 };
    const p = readSanctuaryProgress(saved);
    expect(p.asked).toEqual(saved.asked);
    expect(p.stickers).toEqual(saved.stickers);
    expect(p).toMatchObject({ milestone: 2, acts: 7, litter: 2 });
    const m = newModel();
    m.progress.sanctuary = p;
    expect(recordSanctuaryAnswer(m, "where")).toBe(m);
    expect(sanct(checkSanctuaryMilestones(m).m)).toMatchObject({ milestone: 3, belugas: true, asked: saved.asked, acts: 7 });
  });
});
