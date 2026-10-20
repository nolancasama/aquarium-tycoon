import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { TANKS } from "../game/data/tanks";
import { PEDESTAL, waterCentre } from "../game/world";
import { tankById } from "../game/logic/model";

/** The live camera, for projecting world points to the screen (picking, tests). */
export const cameraRef: { current: THREE.PerspectiveCamera | null } = { current: null };

/** Height (px) of the prompt / dialogue stack at the bottom of the screen, kept by the UI. */
export const bottomPanel = { height: 0 };

export const FOV = 35;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

/** Management view: the whole room from the front, a little above. */
export function roomView(aspect: number, orbit: number, zoom: number) {
  const target = new THREE.Vector3(0, 0.6, -0.8);
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
      const v = roomView(aspect, c.orbit, c.zoom);
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
    const wantX = g.screen === "results" && aspect > 1.2 ? size.width * 0.24 : 0;
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
