import { rt } from "../runtime";
import { getGame, setGame } from "../store";
import { SHARKS_HALL } from "../data/rooms";
import {
  CHAMBER, EXPLORE_START_S, glassHeightAt, sectionAt, TUNNEL_VIEWING_SPOTS, walkHalfWidth, walkwayFrame, walkwayLength,
  type TunnelSection
} from "../data/sharkTunnel";
import { keyboardMove } from "../../input/keyboard";
import { tunnelRuntime } from "./contract";

/**
 * Exploration of the Shark Tunnel: the player walks the walkway loop as the
 * aquarium boss. Position is (s, lateral) on the loop, so leaving the path or
 * touching the glass is impossible by construction. The camera is authored per
 * section and also lives on the loop (inside the tube's cross-section).
 * Nothing here is saved.
 */

export const WALK_SPEED = 1.7;
export const AUTO_WALK_SPEED = 1.9;
const TURN_RATE = 7;
/** Seconds of the enter / leave transition (fade at the midpoint). */
export const TRANSITION = 1.1;

const wrap = (s: number) => ((s % walkwayLength) + walkwayLength) % walkwayLength;
/** Shortest signed distance along the loop from a to b. */
export function loopDelta(a: number, b: number): number {
  let d = wrap(b) - wrap(a);
  if (d > walkwayLength / 2) d -= walkwayLength;
  if (d < -walkwayLength / 2) d += walkwayLength;
  return d;
}
const angleTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Direction the player last travelled along the loop (+1 walking order, -1 against it). */
let travel = 1;
/** Visitor bodies the player must not walk into (set by the tunnel visitor simulation). */
export const tunnelBodies: Array<{ x: number; z: number; r: number }> = [];

export function playerWorld(): { x: number; y: number; z: number } {
  const f = walkwayFrame(rt.explore.s), l = rt.explore.lateral;
  return { x: f.x - f.dz * l, y: 0, z: f.z + f.dx * l };
}

/** Start exploring (from the management view of the wing): camera move, fade, then the avatar. */
export function startExplore() {
  const g = getGame();
  if (g.screen !== "game" || g.mode !== "play" || rt.explore.transition || rt.explore.active) return;
  rt.explore.transition = { kind: "enter", t0: rt.time };
  setGame({ panel: null, placing: null, nudge: null, mode: "busy" });
}

/** Back to the management view (keeps everything; nothing to save). */
export function stopExplore() {
  if (!rt.explore.active || rt.explore.transition) return;
  rt.explore.transition = { kind: "leave", t0: rt.time };
  setGame({ mode: "busy", nudge: null });
}

/** Called each frame by the camera: advances transitions, flips the mode at the fade's midpoint. */
export function stepTransition(): { fade: number } {
  const tr = rt.explore.transition;
  if (!tr) return { fade: 0 };
  const t = (rt.time - tr.t0) / TRANSITION;
  const fade = t < 0.5 ? Math.max(0, (t - 0.15) / 0.35) : Math.max(0, 1 - (t - 0.5) / 0.5);
  if (t >= 0.5 && tr.kind === "enter" && !rt.explore.active) {
    rt.explore.active = true;
    rt.explore.s = EXPLORE_START_S;
    rt.explore.lateral = 0;
    rt.explore.speed = 0;
    rt.explore.walkTo = null;
    rt.explore.frame = null;
    const f = walkwayFrame(EXPLORE_START_S);
    rt.explore.heading = Math.atan2(f.dx, f.dz);
    travel = 1;
    snapCamera();
    setGame({ exploring: true, hall: SHARKS_HALL, view: "room", tankId: null });
  }
  if (t >= 0.5 && tr.kind === "leave" && rt.explore.active) {
    rt.explore.active = false;
    rt.explore.frame = null;
    rt.camera.snap = true;
    setGame({ exploring: false, hall: SHARKS_HALL, view: "room", tankId: null });
  }
  if (t >= 1) {
    rt.explore.transition = null;
    if (getGame().mode === "busy") setGame({ mode: "play" });
    return { fade: 0 };
  }
  return { fade: Math.min(1, fade) };
}

/** Tap a viewing-spot marker: walk there (any input cancels). */
export function walkToSpot(id: string) {
  const spot = TUNNEL_VIEWING_SPOTS.find((v) => v.id === id);
  if (!spot || !rt.explore.active) return;
  rt.explore.walkTo = spot.s;
}

/** One frame of walking. `camYaw`: the camera's horizontal facing (rotation.y convention). */
export function stepExplore(dt: number, camYaw: number, blocked = false) {
  const e = rt.explore;
  if (!e.active) return;
  const k = keyboardMove();
  const ix = blocked ? 0 : Math.max(-1, Math.min(1, e.input.x + k.x));
  const iy = blocked ? 0 : Math.max(-1, Math.min(1, e.input.y + k.y));
  const f = walkwayFrame(e.s);
  // Camera-relative input in world space (three.js: yaw 0 looks toward -z).
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  let mx = fx * iy + rx * ix, mz = fz * iy + rz * ix;
  const mag = Math.min(1, Math.hypot(mx, mz));
  if (mag > 0.08) e.walkTo = null;
  let speedWanted = mag * WALK_SPEED;
  if (e.walkTo !== null && mag <= 0.08) {
    const d = loopDelta(e.s, e.walkTo);
    if (Math.abs(d) < 0.25) e.walkTo = null;
    else {
      const dir = Math.sign(d);
      mx = f.dx * dir - (-f.dz) * e.lateral * 0.4; // drift back toward the middle
      mz = f.dz * dir - f.dx * e.lateral * 0.4;
      const l = Math.hypot(mx, mz) || 1;
      mx /= l; mz /= l;
      speedWanted = Math.min(AUTO_WALK_SPEED, 0.6 + Math.abs(d));
    }
  } else if (mag > 0.08) { mx /= mag; mz /= mag; }
  // Ease speed (a child's walk: quick to start, quick to stop).
  e.speed += (speedWanted - e.speed) * Math.min(1, dt * (speedWanted > e.speed ? 6 : 9));
  if (e.speed < 0.02 && speedWanted === 0) e.speed = 0;
  if (e.speed > 0) {
    const step = e.speed * dt;
    // Project onto the loop: tangent changes s, the left normal changes the lateral offset.
    let ds = (mx * f.dx + mz * f.dz) * step;
    let dl = (mx * -f.dz + mz * f.dx) * step;
    // Slide around visitors instead of walking through them.
    const here = playerWorld();
    for (const b of tunnelBodies) {
      const nx = here.x + f.dx * ds - f.dz * dl, nz = here.z + f.dz * ds + f.dx * dl;
      const dx = nx - b.x, dz = nz - b.z, d = Math.hypot(dx, dz), min = b.r + 0.3;
      if (d < min) {
        // Remove the component of the move toward the body.
        const ux = (b.x - here.x), uz = (b.z - here.z), ul = Math.hypot(ux, uz) || 1;
        const wx = f.dx * ds - f.dz * dl, wz = f.dz * ds + f.dx * dl;
        const into = (wx * ux + wz * uz) / ul;
        if (into > 0) {
          const cx = wx - (ux / ul) * into, cz = wz - (uz / ul) * into;
          ds = cx * f.dx + cz * f.dz;
          dl = cx * -f.dz + cz * f.dx;
        }
      }
    }
    if (Math.abs(ds) > 1e-4) travel = Math.sign(ds);
    e.s = wrap(e.s + ds);
    const w = walkHalfWidth(e.s);
    e.lateral = Math.max(-w, Math.min(w, e.lateral + dl));
    // Face the walking direction.
    const want = Math.atan2(mx, mz);
    e.heading += angleTo(e.heading, want) * Math.min(1, dt * TURN_RATE);
    e.phase += step * 3.2;
  }
  // Which viewing spot (if any) the player stands at.
  let spot: string | null = null;
  for (const v of TUNNEL_VIEWING_SPOTS) if (Math.abs(loopDelta(e.s, v.s)) < 1.8) spot = v.id;
  e.spot = spot;
}

// ------------------------------------------------------------------ camera

interface Shot { back: number; height: number; lookAhead: number; lookY: number; side: number }
const SHOTS: Record<TunnelSection, Shot> = {
  lobby: { back: 3.2, height: 2.2, lookAhead: 3, lookY: 1.2, side: 0 },
  entrance: { back: 3.4, height: 2.0, lookAhead: 3.5, lookY: 1.35, side: 0 },
  firstView: { back: 3.6, height: 1.9, lookAhead: 3.5, lookY: 1.6, side: 0 },
  mainCurve: { back: 4.4, height: 1.25, lookAhead: 3, lookY: 2.5, side: 0 },
  grandChamber: { back: 4.2, height: 1.5, lookAhead: 2.5, lookY: 2.9, side: 0 },
  returnLeg: { back: 3.6, height: 1.9, lookAhead: 3.5, lookY: 1.6, side: 0 },
  exit: { back: 3.4, height: 2.0, lookAhead: 3.5, lookY: 1.35, side: 0 }
};

/** Keep a camera point inside the tube's cross-section at its own place on the loop. */
function insideTube(s: number, lateral: number, y: number): { l: number; y: number } {
  const f = walkwayFrame(s);
  const maxL = f.inside ? 1.4 : f.halfWidth - 0.75;
  const l = Math.max(-maxL, Math.min(maxL, lateral));
  const top = f.inside ? 3.6 : glassHeightAt(s, l) - 0.35;
  return { l, y: Math.max(0.6, Math.min(top, y)) };
}

function pointAt(s: number, lateral: number, y: number) {
  const f = walkwayFrame(s);
  return { x: f.x - f.dz * lateral, y, z: f.z + f.dx * lateral };
}

/** The authored camera for the current state (position and look target, unsmoothed). */
export function exploreShot(): { x: number; y: number; z: number; tx: number; ty: number; tz: number } {
  const e = rt.explore;
  const p = playerWorld();
  const sec = sectionAt(e.s);
  const shot = SHOTS[sec];
  const frame = e.frame;
  if (frame?.kind === "chamber") {
    // Wide: from the chamber's near rim, looking up across the dome.
    const f = walkwayFrame(e.s);
    const camS = e.s - travel * 3.2;
    const c = insideTube(camS, -e.lateral * 0.4, 1.4);
    const cp = pointAt(camS, c.l, c.y);
    void f;
    return { ...cp, tx: CHAMBER.x, ty: 3.4, tz: CHAMBER.z };
  }
  const spot = TUNNEL_VIEWING_SPOTS.find((v) => v.id === e.spot);
  if (frame?.kind === "point" || (spot && e.speed < 0.6)) {
    // Reframe toward something outside the glass: camera behind and opposite the target side.
    let tx: number, ty: number, tz: number;
    const f = walkwayFrame(e.s);
    if (frame?.kind === "point") { tx = frame.x; ty = frame.y; tz = frame.z; }
    else if (spot!.side === 0) { tx = p.x; ty = 5.6; tz = p.z; }
    else {
      const side = spot!.side;
      tx = f.x - f.dz * side * 6; ty = 1.9; tz = f.z + f.dx * side * 6;
    }
    // Which side is the target on? The camera stands behind the player on the other
    // side, and looks between the player and the view, so both stay in frame.
    const sideSign = Math.sign((tx - f.x) * -f.dz + (tz - f.z) * f.dx) || 1;
    const camS = e.s - travel * 4.2;
    const c = insideTube(camS, -sideSign * 0.9, 1.75);
    const cp = pointAt(camS, c.l, c.y);
    const head = { x: p.x, y: 1.3, z: p.z };
    // Overhead (the dome): look up past the player. Side windows: turn only partly, so the player stays in frame.
    const w = frame?.kind === "point" ? 0.6 : spot!.side === 0 ? 0.85 : 0.35;
    return { ...cp, tx: head.x + (tx - head.x) * w, ty: head.y + (ty - head.y) * w, tz: head.z + (tz - head.z) * w };
  }
  const camS = e.s - travel * shot.back;
  const c = insideTube(camS, e.lateral * 0.5, shot.height);
  const cp = pointAt(camS, c.l, c.y);
  const look = pointAt(e.s + travel * shot.lookAhead, e.lateral * 0.3, shot.lookY + e.tilt * 2.4);

  return { ...cp, tx: look.x, ty: look.y, tz: look.z };
}

/** Upward tilt when a shark glides over the player's stretch of tunnel (0..1). */
export function overheadTilt(): number {
  const swim = tunnelRuntime.swim;
  if (!swim) return 0;
  const p = playerWorld();
  const f = walkwayFrame(rt.explore.s);
  let best = 0;
  for (const a of swim.poses()) {
    if (a.species === "eagleray" && a.y < f.height + 0.5) continue;
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    if (d < 6 && a.y > f.height + 0.3) best = Math.max(best, 1 - d / 6);
  }
  return best;
}

let camReady = false;
/** Smoothly move the exploration camera toward the authored shot (writes rt.explore.cam). */
export function stepExploreCamera(dt: number) {
  const e = rt.explore;
  e.tilt += (overheadTilt() * 0.8 - e.tilt) * Math.min(1, dt * 1.2);
  const want = exploreShot();
  const c = e.cam;
  if (!camReady) { Object.assign(c, want); camReady = true; return; }
  const k = 1 - Math.exp(-dt * 2.6), kl = 1 - Math.exp(-dt * 3.4);
  c.x += (want.x - c.x) * k; c.y += (want.y - c.y) * k; c.z += (want.z - c.z) * k;
  c.tx += (want.tx - c.tx) * kl; c.ty += (want.ty - c.ty) * kl; c.tz += (want.tz - c.tz) * kl;
  // Smoothing moves in straight lines; on a curve that could cut toward the glass.
  // Project back into the tube's cross-section at the nearest point of the loop.
  let bestS = e.s, bestD = Infinity;
  for (let d = -9; d <= 9; d += 0.25) {
    const f = walkwayFrame(e.s + d), dd = (f.x - c.x) ** 2 + (f.z - c.z) ** 2;
    if (dd < bestD) { bestD = dd; bestS = e.s + d; }
  }
  const f = walkwayFrame(bestS);
  const lateral = (c.x - f.x) * -f.dz + (c.z - f.z) * f.dx;
  const inside = insideTube(bestS, lateral, c.y);
  c.x = f.x - f.dz * inside.l; c.z = f.z + f.dx * inside.l; c.y = inside.y;
}

/** The camera's current place on the loop (for tests): lateral offset and height limit there. */
export function cameraTubeCheck(): { lateral: number; y: number; maxLateral: number; maxY: number } {
  const c = rt.explore.cam;
  let bestS = rt.explore.s, bestD = Infinity;
  for (let d = -12; d <= 12; d += 0.1) {
    const f = walkwayFrame(rt.explore.s + d), dd = (f.x - c.x) ** 2 + (f.z - c.z) ** 2;
    if (dd < bestD) { bestD = dd; bestS = rt.explore.s + d; }
  }
  const f = walkwayFrame(bestS);
  const lateral = (c.x - f.x) * -f.dz + (c.z - f.z) * f.dx;
  return { lateral, y: c.y, maxLateral: f.inside ? 1.45 : f.halfWidth - 0.7, maxY: f.inside ? 3.65 : glassHeightAt(bestS, lateral) - 0.3 };
}

export function snapCamera() {
  camReady = false;
}
