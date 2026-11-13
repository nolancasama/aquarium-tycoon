import { SHARKS_HALL } from "../data/rooms";
import { useGame } from "../store";
import { sharkSwimVolume, WALKWAY_SAMPLES } from "../data/sharkTunnel";
import { tunnelClearance } from "./swim3d";

export const DIVER_SECONDS = 5;
// Body and handheld equipment fit inside this ball, centred at the waist.
// Extension handles are checked separately from wrist to glass work spot.
export const DIVER_RADIUS = 1.18;
export const DIVER_SHOTS = [
  { name: "left-wipe", x: 26.2, y: 2.4, z: -19, yaw: 1.3, tilt: -0.12, arm: -1.2, knee: 0.25, tool: "squeegee" },
  { name: "upper-brush", x: 30, y: 6.4, z: -24, yaw: 0.4, tilt: 1.05, arm: -2.2, knee: 0.65, tool: "brush" },
  { name: "curve-inspect", x: 27, y: 3.7, z: -29, yaw: 1.9, tilt: 0.45, arm: -0.8, knee: 0.95, tool: "torch" },
  { name: "lower-debris", x: 33.5, y: 1.4, z: -25, yaw: -2, tilt: -0.7, arm: -1.8, knee: 1.2, tool: "bag" },
  { name: "right-polish", x: 46.6, y: 2.8, z: -20, yaw: -1.3, tilt: 0.2, arm: -1.6, knee: 0.45, tool: "pad" },
] as const;
// Stop the head just outside the conservative glass outline. A short extension
// handle lets the body stay clear while the squeegee/brush/pad reaches its work.
const glassVolume = { ...sharkSwimVolume([]), obstacles: [] };
export const DIVER_WORK_SPOTS = DIVER_SHOTS.map(shot => {
  const nearest = WALKWAY_SAMPLES.reduce((best, p) =>
    Math.hypot(p.x - shot.x, p.z - shot.z) < Math.hypot(best.x - shot.x, best.z - shot.z) ? p : best);
  const inside = { x: nearest.x, y: Math.min(shot.y, nearest.height * 0.97), z: nearest.z };
  let lo = 0, hi = 1;
  for (let i = 0; i < 32; i++) {
    const t = (lo + hi) / 2;
    if (tunnelClearance(glassVolume, shot.x + (inside.x - shot.x) * t,
      shot.y + (inside.y - shot.y) * t, shot.z + (inside.z - shot.z) * t) > 0.12) lo = t;
    else hi = t;
  }
  return { x: shot.x + (inside.x - shot.x) * lo, y: shot.y + (inside.y - shot.y) * lo, z: shot.z + (inside.z - shot.z) * lo };
});
export function diverShotAt(elapsed: number) {
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < DIVER_SECONDS ? DIVER_SHOTS[Math.floor(elapsed)] : null;
}

const listeners = new Set<() => void>();
export const subscribeDivers = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const diverRt = { active: false, elapsed: 0, visible: false };
export const diversBusy = () => diverRt.active;
function changed() { for (const fn of listeners) fn(); }
let stopWatching: (() => void) | undefined;
export function resetDivers() {
  stopWatching?.(); stopWatching = undefined;
  diverRt.active = false; diverRt.elapsed = 0; diverRt.visible = false; changed();
}
/** The caller has already committed the existing care benefit, synchronously. */
export function startDivers() {
  if (diverRt.active) return false;
  diverRt.active = true; diverRt.elapsed = 0;
  const tankId = useGame.getState().model.tanks.find(t => t.type === "sharks")?.id;
  stopWatching = useGame.subscribe(g => {
    if (g.screen !== "game" || g.hall !== SHARKS_HALL || !g.model.tanks.some(t => t.id === tankId)) resetDivers();
  });
  changed(); return true;
}
export function stepDivers(dt: number) {
  if (!diverRt.active || !Number.isFinite(dt) || dt <= 0) return;
  diverRt.elapsed = Math.min(DIVER_SECONDS, diverRt.elapsed + dt + 1e-12);
  if (diverRt.elapsed >= DIVER_SECONDS) resetDivers();
}
