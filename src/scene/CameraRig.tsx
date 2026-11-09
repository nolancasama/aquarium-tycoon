import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { TANKS } from "../game/data/tanks";
import { HALL_X, PEDESTAL, tankOrigin, waterCentre } from "../game/world";
import { tankById } from "../game/logic/model";
import { footprintPoints } from "../game/logic/tankLayout";
import { COAST_HALL, HUB_HALL, ROOMS, SHARKS_HALL } from "../game/data/rooms";
import { coastCamera, EXHIBITS, type CoastView } from "../game/data/coast";
import { coastRt } from "../game/coast/coastRuntime";
import { HUB_CAMERA } from "../game/data/hub";
import { TUNNEL_VIEWS, type TunnelView } from "../game/data/sharkTunnel";
import { stepTransition } from "../game/tunnel/explore";

/** The live camera, for projecting world points to the screen (picking, tests). */
export const cameraRef: { current: THREE.PerspectiveCamera | null } = { current: null };

/** Height (px) of the prompt / dialogue stack at the bottom of the screen, kept by the UI. */
export const bottomPanel = { height: 0 };

/** The tank close-up's status panel; the rig places it beside the glass (no React state per frame). */
export const tankStatusEl: { current: HTMLDivElement | null } = { current: null };

export const FOV = 35;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

/** Management view: the whole hall from the front, a little above. */
export function roomView(aspect: number, orbit: number, zoom: number, hall = 0) {
  const bounds = ROOMS[hall]?.bounds ?? ROOMS[0].bounds;
  const scale = Math.max((bounds.maxX - bounds.minX) / 12, (bounds.maxZ - bounds.minZ) / 8);
  const target = new THREE.Vector3(HALL_X[hall] ?? HALL_X[0], hall === 3 ? 0.85 : 0.6, hall === 3 ? -0.35 : -0.8);
  const dist = (13.2 * scale / zoom) * Math.max(1, 1.72 / aspect);
  const pitch = 0.6;
  const h = dist * Math.cos(pitch);
  return {
    pos: new THREE.Vector3(target.x + Math.sin(orbit) * h, target.y + dist * Math.sin(pitch), target.z + Math.cos(orbit) * h),
    target
  };
}

/** Shark Tunnel management viewpoints; narrower screens step back along the view so the habitat still fits. */
export function tunnelView(view: TunnelView, aspect: number) {
  const v = TUNNEL_VIEWS[view];
  const k = Math.max(1, 1.78 / aspect);
  return {
    pos: { x: v.target.x + (v.pos.x - v.target.x) * k, y: v.target.y + (v.pos.y - v.target.y) * k, z: v.target.z + (v.pos.z - v.target.z) * k },
    target: v.target
  };
}

/** Coastal zone viewpoints (the whole wing or one exhibit); narrower screens step back. */
type Shot = { pos: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } };
export function coastView(view: CoastView, aspect: number, counting = false): Shot {
  if (counting && view !== "all") return countingView(view, aspect);
  const { pos, target } = coastCamera(view);
  const k = Math.max(1, 1.78 / aspect);
  return { pos: { x: target.x + (pos.x - target.x) * k, y: target.y + (pos.y - target.y) * k, z: target.z + (pos.z - target.z) * k }, target };
}

/**
 * Counting animals: aim at the animals themselves and step back to fit their spread, so every
 * numbered one sits in the open band between the top HUD and the question panel (the panel
 * lifts the view, which puts the aim point a little above the middle of that band).
 */
function countingView(view: Exclude<CoastView, "all">, aspect: number): Shot {
  const ex = EXHIBITS[view];
  const pts = [...coastRt.animals.values()].filter((a) => a.habitat === view).map((a) => ({ x: ex.x + a.m.x, y: a.m.y, z: ex.z + a.m.z }));
  if (!pts.length) return coastView(view, aspect);
  const c = pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length, z: s.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
  const spread = Math.max(1.5, ...pts.map((p) => Math.hypot(p.x - c.x, (p.y - c.y) * 1.5, p.z - c.z)));
  const dist = Math.max(9, spread * 6.2) * Math.max(1, 1.78 / aspect);
  // From above and in front, steep enough to see over the window frame into the pool.
  const dir = new THREE.Vector3(0, 0.62, 0.78).normalize();
  return { pos: { x: c.x + dir.x * dist, y: c.y + dir.y * dist, z: c.z + dir.z * dist }, target: { x: c.x, y: c.y + 0.3, z: c.z } };
}

/** The hub's fixed camera; narrower screens step back along the view so both side doorways stay in frame. */
export function hubView(aspect: number) {
  const { pos, target } = HUB_CAMERA;
  const k = Math.max(1, 1.78 / aspect);
  return {
    pos: { x: target.x + (pos.x - target.x) * k, y: target.y + (pos.y - target.y) * k, z: target.z + (pos.z - target.z) * k },
    target
  };
}

/** Close-up: the tank's front fills ~70% of the width (or the height on narrow screens). */
export function tankView(tankId: string, aspect: number) {
  const t = tankById(getGame().model, tankId);
  if (!t) return null;
  const def = TANKS[t.type];
  const c = waterCentre(t.slot, t.type);
  const dw = (def.w + 0.3) / (0.72 * 2 * TAN * aspect);
  const dh = (def.h + (t.type === "reef" ? 1.1 : def.group === "special" ? 0.4 : 0.32)) / (0.66 * 2 * TAN);
  // Measure from the nearest glass: the panorama's centre extends beyond its sides.
  const d = (Math.max(dw, dh) + def.d / 2 + (def.bulge ?? 0)) * (t.type === "reef" ? 1.1 : 1);
  // Include the giant plinth above the bottom controls, even at 720 px tall.
  return { pos: new THREE.Vector3(c.x, c.y + (t.type === "reef" ? 1.1 : 0.12), c.z + d), target: new THREE.Vector3(c.x, c.y + (t.type === "reef" ? -0.15 : 0.02), c.z) };
}

const STATUS_GAP = 18;
const STATUS_EDGE = 14;
/** Below the coins/level/hearts and Help/Settings row. */
const STATUS_TOP = 76;
const scratch = new THREE.PerspectiveCamera(FOV);
const corner = new THREE.Vector3();
// A curved glass silhouette can be widest between its front corners. Cache all
// footprint samples once, then project them without allocating during a frame.
const glassEdges = new Map(
  Object.values(TANKS).map((tank) => [tank.type, tank.group === "special"
    ? footprintPoints(tank).map((edge) => ({ x: edge.x + Math.sign(edge.x) * 0.03, z: edge.z }))
    : [{ x: -(tank.w / 2 + 0.03), z: tank.d / 2 }, { x: tank.w / 2 + 0.03, z: tank.d / 2 }]])
);

/**
 * Where the status panel sits in a close-up: just right of the glass, its top
 * level with the tank's top, in the camera's final framing (pos/look, lens
 * shift y). Returns the horizontal lens shift that makes room for it.
 */
function besideTank(tankId: string, pos: THREE.Vector3, look: THREE.Vector3, width: number, height: number, shiftY: number) {
  const t = tankById(getGame().model, tankId);
  const el = tankStatusEl.current;
  if (!t || !el) return 0;
  const def = TANKS[t.type];
  const o = tankOrigin(t.slot);
  scratch.aspect = width / Math.max(1, height);
  scratch.updateProjectionMatrix();
  scratch.position.copy(pos);
  scratch.lookAt(look);
  scratch.updateMatrixWorld();
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  // Classic entries retain their original two front corners; special entries
  // include the cylinder sides and every sample of the panorama's bowed face.
  for (const edge of glassEdges.get(t.type)!) {
    for (let level = 0; level < 2; level++) {
      const y = o.y + level * (def.h + (def.group === "special" ? 0.04 : 0.02));
      corner.set(o.x + edge.x, y, o.z + edge.z).project(scratch);
      const px = ((corner.x + 1) / 2) * width;
      left = Math.min(left, px);
      right = Math.max(right, px);
      top = Math.min(top, ((1 - corner.y) / 2) * height);
    }
  }
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const need = STATUS_GAP + w + STATUS_EDGE;
  // Slide the view left only as far as the panel needs, never off the left edge.
  const shift = Math.max(0, Math.min(right + need - width, left - STATUS_EDGE));
  const fits = right - shift + need <= width + 0.5;
  const x = fits ? right - shift + STATUS_GAP : width - w - STATUS_EDGE;
  const topMin = height <= 560 ? 60 : STATUS_TOP;
  let y = Math.max(topMin, top - shiftY);
  // Stay clear of a request card above and the prompt stack below.
  const req = document.querySelector<HTMLElement>("[data-testid=request]")?.getBoundingClientRect();
  if (req && req.right > x && req.left < x + w) y = Math.max(y, req.bottom + 10);
  // The objective slot (goals or the Rush Hour card) holds the top-left corner.
  const goal = document.querySelector<HTMLElement>("[data-testid=rush-widget], [data-testid=rush-pending]")?.getBoundingClientRect();
  if (goal && goal.right > x && goal.left < x + w) y = Math.max(y, goal.bottom + 10);
  const floor = height - bottomPanel.height - h - 8;
  if (bottomPanel.height > 0 && floor >= topMin) y = Math.min(y, floor);
  const transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (el.style.transform !== transform) {
    // The first placement is instant; later moves (prompt opens, resize) ease.
    if (!el.dataset.placed) {
      el.dataset.placed = "1";
      el.style.transition = "none";
      el.style.visibility = "visible";
    } else if (el.style.transition === "none") el.style.transition = "";
    el.style.transform = transform;
  } else if (el.style.transition === "none") el.style.transition = "";
  return shift;
}

export function CameraRig() {
  const { camera, size } = useThree();
  const pos = useRef(new THREE.Vector3(0, 8, 13));
  const look = useRef(new THREE.Vector3(0, 0.5, -0.5));
  const want = useRef(new THREE.Vector3());
  const wantLook = useRef(new THREE.Vector3());
  const ready = useRef(false);
  const shift = useRef(0);
  const shiftX = useRef(0);
  const fadeEl = useRef<HTMLElement | null>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const cam = camera as THREE.PerspectiveCamera;
    cameraRef.current = cam;
    const c = rt.camera;
    const g = getGame();
    const aspect = size.width / Math.max(1, size.height);
    if (rt.atriumReveal && c.shot) {
      const p = rt.atriumReveal.reducedMotion ? 0.5 : THREE.MathUtils.smoothstep(rt.time - rt.atriumReveal.t0, 0, 3.6);
      c.shot.pos.x = 34.5 + p * 6;
      c.shot.pos.y = 4.2 + Math.sin(p * Math.PI) * 0.3;
      c.shot.pos.z = 9.2 + Math.max(0, 1.72 / aspect - 1) * 4;
    }
    // Shark Tunnel: the enter/leave fade, the reveal sweep, exploration and the wing's viewpoints.
    const fade = stepTransition().fade;
    if (fadeEl.current === null) fadeEl.current = document.querySelector<HTMLElement>(".fade");
    if (fadeEl.current && (fade > 0 || fadeEl.current.dataset.tunnel)) {
      fadeEl.current.style.opacity = String(fade);
      if (fade > 0) fadeEl.current.dataset.tunnel = "1";
      else delete fadeEl.current.dataset.tunnel;
    }
    if (rt.tunnelReveal && c.shot) {
      const p = rt.tunnelReveal.reducedMotion ? 1 : THREE.MathUtils.smoothstep(rt.time - rt.tunnelReveal.t0, 0, 4.4);
      const from = TUNNEL_VIEWS.entrance, to = tunnelView("whole", aspect);
      c.shot.pos.x = THREE.MathUtils.lerp(from.pos.x, to.pos.x, p) + Math.sin(p * Math.PI) * 6;
      c.shot.pos.y = THREE.MathUtils.lerp(from.pos.y, to.pos.y, p);
      c.shot.pos.z = THREE.MathUtils.lerp(from.pos.z, to.pos.z, p);
      c.shot.target.x = THREE.MathUtils.lerp(from.target.x, to.target.x, p);
      c.shot.target.y = THREE.MathUtils.lerp(from.target.y, to.target.y, p);
      c.shot.target.z = THREE.MathUtils.lerp(from.target.z, to.target.z, p);
    }
    const tunnelTr = rt.explore.transition;
    if (rt.explore.active) {
      // The exploration camera is smoothed (and kept inside the tube) by explore.ts.
      const e = rt.explore.cam;
      want.current.set(e.x, e.y, e.z);
      wantLook.current.set(e.tx, e.ty, e.tz);
      pos.current.copy(want.current);
      look.current.copy(wantLook.current);
    } else if (tunnelTr?.kind === "enter") {
      // Toward the lobby and the tunnel entrance, then the fade.
      want.current.set(33.4, 4.2, -2.5);
      wantLook.current.set(32.45, 1.4, -11.5);
    } else if (c.shot) {
      want.current.set(c.shot.pos.x, c.shot.pos.y, c.shot.pos.z);
      wantLook.current.set(c.shot.target.x, c.shot.target.y, c.shot.target.z);
    } else if (g.screen === "game" && g.hall === SHARKS_HALL && g.view === "room") {
      const v = tunnelView(g.tunnelView, aspect);
      want.current.set(v.pos.x, v.pos.y, v.pos.z);
      wantLook.current.set(v.target.x, v.target.y, v.target.z);
    } else if (g.screen === "game" && g.hall === COAST_HALL) {
      const v = coastView(g.coastView, aspect, g.coastActivity?.habitat === "penguins");
      want.current.set(v.pos.x, v.pos.y, v.pos.z);
      wantLook.current.set(v.target.x, v.target.y, v.target.z);
    } else if (g.screen === "game" && g.hall === HUB_HALL) {
      const v = hubView(aspect);
      want.current.set(v.pos.x, v.pos.y, v.pos.z);
      wantLook.current.set(v.target.x, v.target.y, v.target.z);
    } else if (g.screen === "title") {
      // A slow drift across the room behind the title card.
      const a = Math.sin(rt.time * 0.05) * 0.35;
      const v = roomView(aspect, a, 1.15);
      want.current.copy(v.pos);
      wantLook.current.copy(v.target);
    } else if (g.screen === "results") {
      // A slow turn around the trophy, which stands left of the results card.
      const a = 0.5 + Math.sin(rt.time * 0.15) * 0.5;
      want.current.set(PEDESTAL.x + Math.sin(a) * 3.2, 1.95, PEDESTAL.z + Math.cos(a) * 3.2);
      wantLook.current.set(PEDESTAL.x, 1.2, PEDESTAL.z);
    } else if (g.view === "tank" && g.tankId) {
      const v = tankView(g.tankId, aspect);
      if (v) {
        want.current.copy(v.pos);
        wantLook.current.copy(v.target);
      }
    } else {
      const v = roomView(aspect, c.orbit, c.zoom, g.hall);
      want.current.copy(v.pos);
      wantLook.current.copy(v.target);
    }
    if (!ready.current || c.snap) {
      pos.current.copy(want.current);
      look.current.copy(wantLook.current);
      ready.current = true;
      c.snap = false;
    }
    // ~0.8 s eased moves between views.
    const k = 1 - Math.exp(-dt * 4.2);
    pos.current.lerp(want.current, k);
    look.current.lerp(wantLook.current, k);
    cam.position.copy(pos.current);
    cam.lookAt(look.current);
    // Lens shift: while a prompt or line covers the bottom of the screen, the
    // view slides up by half its height (at most 30% of the screen). No
    // perspective change.
    const h = size.height;
    const wantShift = g.screen === "game" && bottomPanel.height > 0 ? Math.min(bottomPanel.height * 0.5, h * 0.3) : 0;
    shift.current += (wantShift - shift.current) * Math.min(1, dt * 5);
    // Results: the trophy sits in the left part of a wide screen, beside the card.
    // Close-ups: the tank slides left just enough for its status panel.
    const wantX =
      g.screen === "results" && aspect > 1.2
        ? size.width * 0.24
        : g.screen === "game" && g.view === "tank" && g.tankId && !c.shot
          ? besideTank(g.tankId, want.current, wantLook.current, size.width, h, wantShift)
          : 0;
    shiftX.current += (wantX - shiftX.current) * Math.min(1, dt * 5);
    // A celebrating visitor stands where the status panel is: fade it, never move it.
    tankStatusEl.current?.classList.toggle("celebrating", rt.celebrations.size > 0);
    if (Math.abs(shift.current) > 0.5 || Math.abs(shiftX.current) > 0.5) cam.setViewOffset(size.width, h, shiftX.current, shift.current, size.width, h);
    else if (cam.view) cam.clearViewOffset();
    c.pos.x = pos.current.x;
    c.pos.y = pos.current.y;
    c.pos.z = pos.current.z;
    c.target.x = look.current.x;
    c.target.y = look.current.y;
    c.target.z = look.current.z;
  });
  return null;
}

/** Screen position (CSS px) of a world point, or null when behind the camera. */
export function project(x: number, y: number, z: number): { x: number; y: number } | null {
  const cam = cameraRef.current;
  if (!cam) return null;
  const v = new THREE.Vector3(x, y, z).project(cam);
  if (v.z > 1) return null;
  const el = document.querySelector("canvas");
  const r = el?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}
