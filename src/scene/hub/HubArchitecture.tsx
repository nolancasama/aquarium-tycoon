import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clipToHubPortal, markHubPortal } from "./hubPortalClip";
import { corridorBoundary, corridorFaceGeometry, corridorStructure } from "./corridorGeometry";
import { useGame } from "../../game/store";
import { bayOf, DOOR_OPENING, HUB_CENTRE, HUB_CORRIDOR, HUB_DOORS, HUB_R, HUB_WALL_H, HUB_WINDOW, doorLocal, hubDoorOpen, onRing, type HubDestination } from "../../game/data/hub";
import { PartBuilder } from "../partBuilder";
import { signMaterial, smoothMat } from "../materials";

/** A solid, curved wall sector; openings are gaps between sectors, never overlays. */
function sector(a0: number, a1: number, bottom: number, top: number, inner = HUB_R, outer = HUB_R + 0.32) {
  const p: number[] = [], n = Math.max(1, Math.ceil((a1 - a0) / 0.065));
  const point = (a: number, y: number, r: number) => [HUB_CENTRE.x + Math.sin(a) * r, y, HUB_CENTRE.z - Math.cos(a) * r];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n;
    const il = point(a, bottom, inner), ir = point(b, bottom, inner), it = point(a, top, inner), iu = point(b, top, inner);
    const ol = point(a, bottom, outer), or = point(b, bottom, outer), ot = point(a, top, outer), ou = point(b, top, outer);
    quad(il, it, iu, ir); quad(ol, or, ou, ot); quad(it, ot, ou, iu); quad(il, ir, or, ol);
    if (i === 0) quad(il, ol, ot, it);
    if (i === n - 1) quad(ir, iu, ou, or);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

const THEMES: Record<HubDestination, { wall: string; floor: string; trim: string; glow: string }> = {
  indoor: { wall: "#d5b68c", floor: "#ddc8a3", trim: "#8b6345", glow: "#fff0bb" },
  sharks: { wall: "#24677c", floor: "#478292", trim: "#153c59", glow: "#98ecf7" },
  coast: { wall: "#b5d7df", floor: "#dae9e9", trim: "#658d9b", glow: "#e8fbff" },
  lagoon: { wall: "#e5c79b", floor: "#e9dcb4", trim: "#ae8052", glow: "#fff3b0" },
  sanctuary: { wall: "#456e87", floor: "#7595a4", trim: "#224456", glow: "#a7e4ec" }
};
const shellMat = smoothMat.clone();
shellMat.side = THREE.DoubleSide;
const lightMat = clipToHubPortal(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
const corridorMat = clipToHubPortal(shellMat.clone());

/** Wall, reveals, all five corridors and their details share two draw calls. */
export function HubShell() {
  const geometries = useMemo(() => {
    const b = new PartBuilder(0.35);
    const corridorParts: THREE.BufferGeometry[] = [], lightParts: THREE.BufferGeometry[] = [];
    const cuts = [
      ...HUB_DOORS.map(kind => ({ a: bayOf(kind).angle, half: Math.asin((DOOR_OPENING.w / 2) / HUB_R), low: 0, high: DOOR_OPENING.h })),
      { a: 0, half: HUB_WINDOW.halfAngle, low: HUB_WINDOW.bottom, high: HUB_WINDOW.top }
    ].sort((x, y) => x.a - y.a);
    const band = (start: number, end: number, low: number, high: number) => {
      for (const [lo, hi, color] of [[0, 1.1, "#2f8f9d"], [1.1, 6.3, "#f4ecdc"], [6.3, HUB_WALL_H, "#164f6b"]] as const) {
        const y0 = Math.max(low, lo), y1 = Math.min(high, hi);
        if (y1 > y0 && end > start) b.add(sector(start, end, y0, y1), color, [0, 0, 0]);
      }
    };
    let previous = -Math.PI / 2;
    for (const cut of cuts) {
      band(previous, cut.a - cut.half, 0, HUB_WALL_H);
      band(cut.a - cut.half, cut.a + cut.half, 0, cut.low);
      band(cut.a - cut.half, cut.a + cut.half, cut.high, HUB_WALL_H);
      previous = cut.a + cut.half;
    }
    band(previous, Math.PI / 2, 0, HUB_WALL_H);
    // The former central pier is removed; the other rotunda pilasters stay put.
    for (let k = 0; k <= 8; k++) {
      if (k === 4) continue;
      const a = -Math.PI / 2 + k * Math.PI / 8, p = onRing(a, HUB_R - 0.2);
      b.boxAt(0.6, HUB_WALL_H + 0.2, 0.5, [p.x, (HUB_WALL_H + 0.2) / 2, p.z], [0, -a, 0], "#efe2c8");
      b.boxAt(0.8, 0.3, 0.62, [p.x, HUB_WALL_H + 0.15, p.z], [0, -a, 0], "#d9a441");
      b.boxAt(0.78, 0.25, 0.6, [p.x, 0.12, p.z], [0, -a, 0], "#2a7380");
    }
    // Continuous curved sill/head and full-depth jambs, with no centre divider.
    for (const [low, high] of [[HUB_WINDOW.bottom - 0.1, HUB_WINDOW.bottom + 0.1], [HUB_WINDOW.top - 0.1, HUB_WINDOW.top + 0.1]]) {
      b.add(sector(-HUB_WINDOW.halfAngle - 0.012, HUB_WINDOW.halfAngle + 0.012, low, high, HUB_R - 0.23, HUB_R + 0.38), "#dfcdac", [0, 0, 0]);
    }
    for (const a of [-HUB_WINDOW.halfAngle, HUB_WINDOW.halfAngle]) {
      const p = onRing(a, HUB_R + 0.06);
      b.boxAt(0.18, HUB_WINDOW.top - HUB_WINDOW.bottom, 0.62, [p.x, (HUB_WINDOW.top + HUB_WINDOW.bottom) / 2, p.z], [0, -a, 0], "#dfcdac");
    }
    for (const kind of HUB_DOORS) {
      const a = bayOf(kind).angle, theme = THEMES[kind], h = DOOR_OPENING.h, D = HUB_CORRIDOR.depth;
      const box = (builder: PartBuilder, side: number, depth: number, y: number, width: number, height: number, length: number, color: string) => {
        const p = doorLocal(kind, side, depth);
        builder.boxAt(width, height, length, [p.x, y, p.z], [0, -a, 0], color);
      };
      const corridor = new PartBuilder(0.35), lights = new PartBuilder(0);
      // The reveal, threshold and L bend are one physical solid. Keep only its
      // boundary, while retaining the shell/portal material assignment.
      const origin = doorLocal(kind, 0, 0);
      for (const face of corridorBoundary(corridorStructure(theme))) {
        (face.box.shell ? b : corridor).add(corridorFaceGeometry(face), face.box.color, [origin.x, 0, origin.z], [0, -a, 0]);
      }
      // Inset rails, ceiling coffers and a glowing further portal suggest the wing.
      for (const depth of [0.6, 1.5, 2.5, 3.5]) {
        box(lights, 0, depth, h - 0.04, 0.7, 0.035, 0.16, theme.glow);
      }
      box(lights, 0, D - 0.08, 1.6, 1.15, 2.35, 0.035, theme.glow);
      corridorParts.push(markHubPortal(corridor.build(), origin.x, origin.z, a));
      lightParts.push(markHubPortal(lights.build(), origin.x, origin.z, a));
    }
    const corridors = mergeGeometries(corridorParts), lights = mergeGeometries(lightParts);
    corridorParts.forEach(g => g.dispose()); lightParts.forEach(g => g.dispose());
    return { shell: b.build(), corridors, lights };
  }, []);
  useEffect(() => () => { geometries.shell.dispose(); geometries.corridors.dispose(); geometries.lights.dispose(); }, [geometries]);
  return <group><mesh geometry={geometries.shell} material={shellMat} raycast={() => undefined} /><mesh geometry={geometries.corridors} material={corridorMat} raycast={() => undefined} /><mesh geometry={geometries.lights} material={lightMat} raycast={() => undefined} /></group>;
}

/** Every unavailable destination gets real leaves and the same bilingual ribbon. */
export function HubDoorClosures() {
  const key = useGame(s => (void s.previewAreas, HUB_DOORS.filter(kind => !hubDoorOpen(kind, s.model.progress)).join(",")));
  const geometry = useMemo(() => {
    const b = new PartBuilder(0.25), ribbon = new PartBuilder(0);
    for (const kind of key.split(",").filter(Boolean) as HubDestination[]) {
      const a = bayOf(kind).angle, p = doorLocal(kind, 0, 0.12), theme = THEMES[kind];
      for (const side of [-1, 1]) {
        const q = doorLocal(kind, side * DOOR_OPENING.w / 4, 0.12);
        b.boxAt(DOOR_OPENING.w / 2 - 0.025, DOOR_OPENING.h - 0.06, 0.13, [q.x, DOOR_OPENING.h / 2, q.z], [0, -a, 0], theme.trim);
        const panel = doorLocal(kind, side * DOOR_OPENING.w / 4, 0.035);
        b.boxAt(DOOR_OPENING.w / 2 - 0.2, DOOR_OPENING.h - 0.5, 0.025, [panel.x, DOOR_OPENING.h / 2, panel.z], [0, -a, 0], theme.wall);
        const knob = doorLocal(kind, side * 0.12, -0.02);
        b.boxAt(0.05, 0.26, 0.06, [knob.x, 1.55, knob.z], [0, -a, 0], "#d9b25e");
      }
      ribbon.add(new THREE.PlaneGeometry(2.43, 0.54), "#ffffff", [p.x - Math.sin(a) * 0.26, 0.7, p.z + Math.cos(a) * 0.26], [0, -a, -0.055]);
    }
    return { doors: b.build(), ribbon: ribbon.build() };
  }, [key]);
  useEffect(() => () => { geometry.doors.dispose(); geometry.ribbon.dispose(); }, [geometry]);
  const ribbonMat = signMaterial("COMING SOON\nもうすぐ オープン！", "#ffcf3f", "#3b2a00", 900, 220);
  return <group><mesh geometry={geometry.doors} material={smoothMat} raycast={() => undefined} /><mesh geometry={geometry.ribbon} material={ribbonMat} raycast={() => undefined} /></group>;
}
