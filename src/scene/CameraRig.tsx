import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { TANKS } from "../game/data/tanks";
import { HALL_X, PEDESTAL, tankOrigin, waterCentre } from "../game/world";
import { tankById } from "../game/logic/model";

/** The live camera, for projecting world points to the screen (picking, tests). */
export const cameraRef: { current: THREE.PerspectiveCamera | null } = { current: null };

/** Height (px) of the prompt / dialogue stack at the bottom of the screen, kept by the UI. */
export const bottomPanel = { height: 0 };

/** The tank close-up's status panel; the rig places it beside the glass (no React state per frame). */
export const tankStatusEl: { current: HTMLDivElement | null } = { current: null };

export const FOV = 35;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

/** Management view: the whole hall from the front, a little above. */
export function roomView(aspect: number, orbit: number, zoom: number, hall: 0 | 1 = 0) {
  const target = new THREE.Vector3(HALL_X[hall], 0.6, -0.8);
  const dist = (13.2 / zoom) * Math.max(1, 1.72 / aspect);
  const pitch = 0.6;
  const h = dist * Math.cos(pitch);
  return {
    pos: new THREE.Vector3(target.x + Math.sin(orbit) * h, target.y + dist * Math.sin(pitch), target.z + Math.cos(orbit) * h),
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
  const dh = (def.h + 0.32) / (0.66 * 2 * TAN);
  const d = Math.max(dw, dh) + def.d / 2;
  return { pos: new THREE.Vector3(c.x, c.y + 0.12, c.z + d), target: new THREE.Vector3(c.x, c.y + 0.02, c.z) };
}

const STATUS_GAP = 18;
const STATUS_EDGE = 14;
/** Below the coins/level/hearts and Help/Settings row. */
const STATUS_TOP = 76;
const scratch = new THREE.PerspectiveCamera(FOV);
const corner = new THREE.Vector3();

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
  // The front glass edges are the outermost on screen.
  for (const sx of [-1, 1]) {
    for (const y of [o.y, o.y + def.h + 0.02]) {
      corner.set(o.x + sx * (def.w / 2 + 0.03), y, o.z + def.d / 2).project(scratch);
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

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const cam = camera as THREE.PerspectiveCamera;
    cameraRef.current = cam;
    const c = rt.camera;
    const g = getGame();
    const aspect = size.width / Math.max(1, size.height);
    if (c.shot) {
      want.current.set(c.shot.pos.x, c.shot.pos.y, c.shot.pos.z);
      wantLook.current.set(c.shot.target.x, c.shot.target.y, c.shot.target.z);
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
