import { afterEach, describe, expect, it } from "vitest";
import { newModel, type Model } from "../logic/model";
import { AREA_LINKS, COAST_HALL, HUB_HALL, LAGOON_HALL, roomIndex, SANCTUARY_HALL, SHARKS_HALL } from "../data/rooms";
import { clearPreviewAccess, grantPreview } from "../data/release";
import { arrowState } from "./hub";

/**
 * Side arrows of the branching areas (AREA_LINKS): the tour order, and that an
 * arrow never opens a release-locked area (it is shown locked instead).
 */

afterEach(() => clearPreviewAccess());

function tunnelOwner(): Model {
  const m = newModel();
  return { ...m, progress: { ...m.progress, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true, tunnelOpen: true } };
}

describe("area arrows", () => {
  it("follow the tour Shark Tunnel → Grand Hub → Penguin Coast → Dolphin Lagoon → Grand Ocean Sanctuary", () => {
    expect(AREA_LINKS.sharks).toEqual({ next: "hub" });
    expect(AREA_LINKS.coast).toEqual({ prev: "hub", next: "lagoon" });
    expect(AREA_LINKS.lagoon).toEqual({ prev: "coast", next: "sanctuary" });
    expect(AREA_LINKS.hub).toBeUndefined();
    expect(roomIndex("hub")).toBe(HUB_HALL);
  });

  it("lead from the Shark Tunnel to the Grand Hub once it is open, and are hidden before", () => {
    expect(arrowState(HUB_HALL, tunnelOwner())).toBe("open");
    const early = newModel();
    expect(arrowState(HUB_HALL, early)).toBeNull();
    expect(SHARKS_HALL).toBeGreaterThan(0);
  });

  it("opens owned released areas, while Sanctuary stays locked whatever the save claims", () => {
    const m = tunnelOwner();
    const owner = { ...m, progress: { ...m.progress, coastOpen: true, lagoonOpen: true, sanctuaryOpen: true } };
    for (const hall of [COAST_HALL, LAGOON_HALL]) expect(arrowState(hall, owner)).toBe("open");
    expect(arrowState(SANCTUARY_HALL, owner)).toBe("locked");
  });

  it("hides unowned released areas, including Lagoon until Penguin Paradise", () => {
    const m = tunnelOwner();
    expect(arrowState(COAST_HALL, m)).toBeNull();
    expect(arrowState(LAGOON_HALL, m)).toBeNull();
    expect(arrowState(SANCTUARY_HALL, m)).toBe("locked");
  });

  it("opens only the previewed area during a preview; unowned neighbours stay hidden", () => {
    grantPreview("lagoon");
    const m = tunnelOwner();
    expect(arrowState(LAGOON_HALL, m)).toBe("open");
    expect(arrowState(SANCTUARY_HALL, m)).toBe("locked");
    expect(arrowState(COAST_HALL, m)).toBeNull();
    expect(arrowState(HUB_HALL, m)).toBe("open");
  });

  it("keeps Sanctuary preview available without granting normal ownership", () => {
    const m = tunnelOwner();
    grantPreview("sanctuary");
    expect(arrowState(SANCTUARY_HALL, m)).toBe("open");
    clearPreviewAccess();
    expect(arrowState(SANCTUARY_HALL, m)).toBe("locked");
  });
});
