/**
 * Release control for the big expansion areas. Three separate facts:
 *
 * - built:    the area exists in this build and can be tested internally;
 * - released: ordinary players may enter it (a deliberate release change here);
 * - unlocked: the player's own progress owns it (saved in the model).
 *
 * Travel needs released + unlocked, or a development preview. A preview is
 * session-only (memory, never saved): see game/flow/preview.ts. To release an
 * area later, flip `released` here and decide its unlock rule separately.
 */

export type ReleaseArea = "coast" | "lagoon" | "sanctuary";
export const RELEASE_AREAS: ReleaseArea[] = ["coast", "lagoon", "sanctuary"];

export const RELEASE: Readonly<Record<ReleaseArea, { built: boolean; released: boolean }>> = {
  // Built and played in 2026-11-10, held back until the outdoor areas are ready.
  coast: { built: true, released: false },
  lagoon: { built: true, released: false },
  sanctuary: { built: true, released: false }
};

/** Areas open for development testing this session only (Ctrl+Alt+D previews). */
const previewAccess = new Set<ReleaseArea>();

export const areaReleased = (a: ReleaseArea): boolean => RELEASE[a].released;
export const areaPreviewed = (a: ReleaseArea): boolean => previewAccess.has(a);
/** May this area be entered at all right now (released, or previewed this session)? */
export const areaAvailable = (a: ReleaseArea): boolean => RELEASE[a].released || previewAccess.has(a);
export const previewAreas = (): ReleaseArea[] => RELEASE_AREAS.filter((a) => previewAccess.has(a));
export const anyPreview = (): boolean => previewAccess.size > 0;

/** Only game/flow/preview.ts calls these (it keeps the store in step). */
export function grantPreview(a: ReleaseArea) {
  if (RELEASE[a].built) previewAccess.add(a);
}
export function clearPreviewAccess() {
  previewAccess.clear();
}
