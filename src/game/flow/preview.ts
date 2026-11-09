import { getGame, setGame, updateModel } from "../store";
import { clearPreviewAccess, grantPreview, previewAreas, RELEASE, type ReleaseArea } from "../data/release";
import { unstoreAvailable } from "../logic/stored";
import { encodeSave, writeSave } from "../logic/save";
import type { Model } from "../logic/model";

/**
 * Development previews of release-locked areas (Ctrl+Alt+D). A preview is a
 * sandbox for the whole session: the ordinary save is written once (flushed),
 * then autosave stops (story.ts saveNow checks previewActive). "End preview"
 * puts that model back; a reload, the title, New Game or Continue simply forget
 * the preview, because nothing of it was ever written. So no preview can unlock
 * an area, spend or earn coins, or change progress for real.
 */

let snapshot: Model | null = null;

export const previewActive = () => snapshot !== null;

/** Open an area for this session only (and bring its stored habitats into play, in the sandbox). */
export function startPreview(area: ReleaseArea): boolean {
  const g = getGame();
  if (!RELEASE[area].built || g.screen !== "game") return false;
  if (!snapshot) {
    // Whatever was played before the preview is kept, exactly as it was.
    writeSave(encodeSave(g.model));
    snapshot = g.model;
  }
  grantPreview(area);
  setGame({ previewAreas: previewAreas() });
  updateModel(unstoreAvailable);
  return true;
}

/** End the sandbox: the model from before the preview returns and autosave resumes. */
export function endPreview(): boolean {
  if (!snapshot) return false;
  const m = snapshot;
  snapshot = null;
  clearPreviewAccess();
  setGame({ previewAreas: [], model: m, view: "room", tankId: null, panel: null, placing: null, mapOpen: false, coastOffer: false, coastActivity: null, coastWaiting: null, coastCelebration: null, areaActivity: null, areaWaiting: null, areaCelebration: null });
  return true;
}

/** Leaving the session (title, New Game, Continue): forget the preview; the save on disk was never touched by it. */
export function dropPreview() {
  if (!snapshot && !previewAreas().length) return;
  snapshot = null;
  clearPreviewAccess();
  setGame({ previewAreas: [] });
}
