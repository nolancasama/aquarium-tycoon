import { getGame, setGame, updateModel, type OutdoorArea } from "../store";
import { rt } from "../runtime";
import { LAGOON_HALL, roomOpen, SANCTUARY_HALL } from "../data/rooms";
import { startLagoon } from "../logic/lagoon";
import { startSanctuary } from "../logic/sanctuary";
import { travelTo } from "./hub";

/**
 * Entering the outdoor expansions (Dolphin Lagoon, Grand Ocean Sanctuary):
 * only where data/release.ts allows (a release, or a development preview), the
 * area's own state started, then the usual fade and, on the first visit of the
 * session, a reveal: the camera comes out of the entrance into the open air.
 */

export const OUTDOOR_HALL: Record<OutdoorArea, number> = { lagoon: LAGOON_HALL, sanctuary: SANCTUARY_HALL };

/** The reveal sweep (runtime only; the area's camera reads it). */
export const outdoorRt = { reveal: null as null | { area: OutdoorArea; t0: number } };
const revealed = new Set<OutdoorArea>();

export const outdoorHall = (area: OutdoorArea) => OUTDOOR_HALL[area];
export const inOutdoor = (area: OutdoorArea, g = getGame()) => g.screen === "game" && g.hall === OUTDOOR_HALL[area];

export function enterOutdoor(area: OutdoorArea) {
  const g = getGame();
  const hall = OUTDOOR_HALL[area];
  if (!roomOpen(hall, g.model.progress) || g.hall === hall) return;
  updateModel((m) => (area === "lagoon" ? startLagoon(m) : startSanctuary(m)));
  setGame(area === "lagoon" ? { lagoonView: "lagoon", areaPanel: null } : { sanctuaryView: "overview", areaPanel: null });
  const first = !revealed.has(area);
  travelTo(hall);
  if (getGame().fade === 0 && getGame().hall !== hall) return; // travel refused (busy)
  revealed.add(area);
  if (first) {
    // The fade takes ~0.4 s; the sweep starts as the new area appears.
    outdoorRt.reveal = { area, t0: rt.time + 0.4 };
    window.setTimeout(() => setGame({ areaArrival: area }), 450);
    window.setTimeout(() => { if (getGame().areaArrival === area) setGame({ areaArrival: null }); }, 4600);
  }
}

/** Seconds of each area's first-visit sweep (the sanctuary's comes in from far out at sea). */
const REVEAL_SECONDS: Record<OutdoorArea, number> = { lagoon: 4, sanctuary: 5.5 };

/** The reveal's progress 0..1 (1 when none is running or it is done). */
export function revealProgress(area: OutdoorArea): number {
  const r = outdoorRt.reveal;
  if (!r || r.area !== area) return 1;
  const p = (rt.time - r.t0) / REVEAL_SECONDS[area];
  if (p >= 1) { outdoorRt.reveal = null; return 1; }
  return Math.max(0, p);
}

/** Tests and a new session start fresh. */
export function resetOutdoorReveal() {
  outdoorRt.reveal = null;
  revealed.clear();
}
