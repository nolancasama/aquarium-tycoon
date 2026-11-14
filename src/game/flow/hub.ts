import { getGame, nudge, setGame, toast, updateModel, useGame } from "../store";
import { rt } from "../runtime";
import { HUB_HALL, inHallRow, LAGOON_HALL, RELEASE_OF, roomOpen, ROOMS, SANCTUARY_HALL, SHARKS_HALL } from "../data/rooms";
import { areaAvailable } from "../data/release";
import { enterOutdoor } from "./outdoor";
import type { HubDestination } from "../data/hub";
import { backToRoom, switchHall, tapSharkTunnelDoor } from "./actions";
import { say } from "./ask";
import { audio } from "../../audio/audio";
import type { Model } from "../logic/model";
import { openRushAwards } from "../rush/bridge";
import { tapCoastDoor } from "./coast";

/**
 * Hub navigation: the Aquarium Map chip, the hub's doorways and Pico's
 * one-time introduction. Travel always goes through switchHall, so the usual
 * fade and the wing rules apply. Nothing here changes coins or saved state,
 * except the intro flag.
 */

export const hubUnlocked = (m: Model) => roomOpen(HUB_HALL, m.progress);

/** The indoor hall the player last travelled from (the hub's indoor doorway returns there). */
let lastIndoor = 0;

/** Free to travel: no English, line, purchase, placement, celebration or scripted moment open. */
export function canTravel(): boolean {
  const g = getGame();
  return g.screen === "game" && g.mode === "play" && !g.prompt && !g.line && !g.stageCard && !g.settingsOpen &&
    !g.panel && !g.placing && !g.exploring && !g.request && !g.tunnelActivity && !g.tunnelCelebration && !g.areaActivity && !g.areaPanel &&
    g.model.rush?.phase !== "results" && rt.celebrations.size === 0 && hubUnlocked(g.model);
}

export function openMap() {
  if (!canTravel()) return;
  audio.play("tick");
  setGame({ mapOpen: true, trophiesOpen: false, ...(getGame().nudge?.target === "btn-map" ? { nudge: null } : {}) });
}

export function closeMap() {
  setGame({ mapOpen: false });
}

/** Go to a room (index into ROOMS) from the map or a doorway. */
export function travelTo(hall: number) {
  const g = getGame();
  setGame({ mapOpen: false, trophiesOpen: false });
  if (!canTravel() || !roomOpen(hall, g.model.progress)) return;
  if (hall === g.hall && g.view === "room") return;
  if (inHallRow(g.hall) && g.hall !== SHARKS_HALL) lastIndoor = g.hall;
  if (g.view === "tank") backToRoom();
  switchHall(hall);
}

export const lastIndoorHall = () => lastIndoor;

/** A doorway in the hub was tapped. */
export function tapHubDoor(kind: HubDestination) {
  if (!canTravel()) return;
  if (kind === "indoor") { travelTo(lastIndoor); return; }
  if (kind === "sharks") {
    if (getGame().model.progress.tunnelOpen) travelTo(SHARKS_HALL);
    else tapSharkTunnelDoor();
    return;
  }
  if (kind === "coast") { tapCoastDoor(); return; }
  tapOutdoorDoor(kind);
}

export const COMING_SOON = { en: "Coming soon!", ja: "もうすぐ オープン！ おたのしみに！" } as const;
export const LAGOON_REQUIREMENT = { en: "Finish Penguin Paradise at Penguin Coast", ja: "ペンギン コーストで ペンギンの らくえんを クリア" } as const;

/** A release-locked destination: only the message (no travel, no coins, no offer, no ceremony). */
export function comingSoon() {
  audio.play("error");
  toast({ ...COMING_SOON, tone: "info" }, 3200);
}

/** The Dolphin Lagoon / Ocean Sanctuary doorway or map card: enter only where a release or a preview allows. */
export function tapOutdoorDoor(area: "lagoon" | "sanctuary") {
  if (!canTravel()) return;
  const hall = area === "lagoon" ? LAGOON_HALL : SANCTUARY_HALL;
  if (!roomOpen(hall, getGame().model.progress)) {
    if (!areaAvailable(area)) comingSoon();
    else {
      audio.play("error");
      toast({ ...LAGOON_REQUIREMENT, tone: "info" }, 4500);
    }
    return;
  }
  enterOutdoor(area);
}

/**
 * A side arrow of a branching area (AREA_LINKS): "open" travels, "locked" is a
 * release-locked area outside a preview (the arrow shows a lock and only says
 * "Coming soon"), null hides the arrow (nothing there for this player yet).
 */
export function arrowState(hall: number, m: Model): "open" | "locked" | null {
  const r = ROOMS[hall];
  if (!r || !hubUnlocked(m)) return null;
  const area = RELEASE_OF[r.id];
  if (area && !areaAvailable(area)) return "locked";
  return roomOpen(hall, m.progress) ? "open" : null;
}

/** Travel by a side arrow: the same checked entry as the matching doorway (fade, reveal, offer, locks). */
export function arrowTravel(hall: number) {
  if (!canTravel()) return;
  const id = ROOMS[hall]?.id;
  if (id === "coast") tapCoastDoor();
  else if (id === "lagoon" || id === "sanctuary") tapOutdoorDoor(id);
  else travelTo(hall);
}

export function openTrophies() {
  if (!canTravel()) return;
  audio.play("tick");
  setGame({ trophiesOpen: true, mapOpen: false });
}

export function closeTrophies() {
  setGame({ trophiesOpen: false });
}

export function trophiesToRush() {
  setGame({ trophiesOpen: false });
  openRushAwards();
}

let introRunning = false;

/** Pico announces the hub once, the first calm moment after it opens; the Map chip is then pointed at. */
export function watchHubIntro(): () => void {
  const check = () => {
    const g = getGame();
    if (introRunning || g.model.progress.hubIntroSeen || !hubUnlocked(g.model)) return;
    if (!canTravel() || g.view !== "room" || g.hall === SHARKS_HALL || g.nudge || g.waiting || g.model.rush?.phase === "prep" || g.model.rush?.phase === "rush" || g.model.rush?.phase === "pending") return;
    introRunning = true;
    updateModel((m) => ({ ...m, progress: { ...m.progress, hubIntroSeen: true } }));
    void say("pico", "Your aquarium is growing! Let's open the Grand Hub!", "すいぞくかんが おおきくなったよ！ マップから グランド ホールへ いこう！").then(() => {
      introRunning = false;
      nudge({ en: "Tap Map!", ja: "マップを タップしよう！", kind: "tap", target: "btn-map" }, 9000);
    });
  };
  const unsubscribe = useGame.subscribe(check);
  const timer = window.setInterval(check, 1500);
  return () => { unsubscribe(); window.clearInterval(timer); introRunning = false; };
}
