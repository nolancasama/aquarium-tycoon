import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, useGame } from "../../game/store";
import { rt } from "../../game/runtime";
import { SANCTUARY_HALL } from "../../game/data/rooms";
import {
  BOAT, BUOY_LINE, CARE, COVE_DOMAIN, COVE_ICE, ISLAND, ISLET, LOOKOUT, LOOKOUT_SPOTS, PIER_PATH, RESEARCH, SANCTUARY_DOMAIN, SANCTUARY_ORIGIN, SANCTUARY_SHOTS, STATION, STATION_SPOTS
} from "../../game/data/sanctuary";
import { LAND_Y, pointInPolygon } from "../../game/marine/domain";
import { sanctRt } from "../../game/sanctuary/sanctuaryRuntime";
import { sanctFocus, sanctuaryTick, STICKER_TEXT, tapLitter, tapOrca, tapSanctLook } from "../../game/flow/sanctuary";
import { BELUGAS, ORCAS } from "../../game/logic/sanctuary";
import { PartBuilder } from "../partBuilder";
import { shaderTime, signMaterial, smoothMat } from "../materials";
import { useAreaGate } from "../tunnel/wing";
import { newPose, TunnelFigure } from "../tunnel/TunnelFigure";
import { tunnelPersonModel } from "../models/people";
import { cetaceanGeometry, type FinStyle } from "../marine/cetaceans";
import { createCetaceanMaterial, type CetaceanMaterial } from "../marine/cetaceanMaterial";
import {
  FishSchool, Gulls, LightShafts, LookSprite, MarineFx, numberMaterial, SkyDome, seaMaterial, terrainMaterial, useAtmosphere, type AirLook, type FxPool, type WaterLook
} from "../marine/outdoor";
import type { Swimmer } from "../../game/marine/pod";

/**
 * The Grand Ocean Sanctuary scene: a vast bay between cliff-topped headlands,
 * open to the ocean beyond a line of buoys; an island and an islet, the
 * research boat, the underwater observation station at the end of its pier,
 * the research station and its dock, the care platform, the observation point
 * on the west clifftop, and Beluga Cove behind its breakwater. Orcas (one draw
 * each), belugas, floating litter for the cleanup, the chosen habitat
 * improvement, visitors and staff. Drawn and stepped only while shown.
 */

export const sanctuaryShown = () => { const g = getGame(); return g.screen === "game" && g.hall === SANCTUARY_HALL; };
const O = SANCTUARY_ORIGIN;

export const SANCT_AIR: AirLook = {
  zenith: "#4a8fcc", horizon: "#dbe9f0",
  sun: { dir: [0.35, 0.5, -0.8], color: "#fff0d8", intensity: 1.75 },
  hemi: { sky: "#e3f0f7", ground: "#8b9a7c", intensity: 1.35 },
  fog: { color: "#dbe9f0", near: 260, far: 1500 }, far: 1900
};
const SANCT_WATER: WaterLook = { color: "#1f5f7c", near: 3, far: 46 };
const underwaterNow = () => sanctuaryShown() && rt.camera.pos.y < -0.1;

function tap(fn: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    fn();
  };
}

// ------------------------------------------------------------------ ground

const smooth = (e0: number, e1: number, v: number) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const noise2 = (x: number, z: number) => Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09 - Math.sin(x * 0.05) * 1.7);

function islandY(x: number, z: number): number {
  let h = -Infinity;
  for (const I of [ISLAND, ISLET]) {
    const d = Math.hypot(x - I.x, z - I.z) / I.r;
    if (d < 1) h = Math.max(h, 0.35 + (I.top - 0.35) * (1 - Math.pow(d, 1.7)) + 0.4 * noise2(x * 3, z * 3) * (1 - d));
    else if (d < 1.7) h = Math.max(h, 0.35 - (d - 1) * 7);
  }
  return h;
}

/** One height function for the bay floor, the islands, the cove, the open ocean, the cliffs and the shore. */
export function sanctGround(x: number, z: number): number {
  if (pointInPolygon(SANCTUARY_DOMAIN.outline, x, z)) return Math.max(SANCTUARY_DOMAIN.floor(x, z), islandY(x, z));
  if (pointInPolygon(COVE_DOMAIN.outline, x, z)) return COVE_DOMAIN.floor(x, z);
  if (z < -84 && x > -112 && x < 96) return -18 + noise2(x, z) * 1.5;
  const n = noise2(x, z);
  if (x < -96) {
    // The west headland: a cliff at the bay, rising gently inland, sloping into the sea at its tip.
    const tip = smooth(-114, -88, z);
    const cliff = 15 * smooth(-100, -113, x) + Math.max(0, -113 - x) * 0.22;
    return LAND_Y + (cliff + n * 1.2) * tip - (1 - tip) * 7;
  }
  if (x > 98 && z < 9) {
    const tip = smooth(-110, -90, z);
    const cliff = 11 * smooth(98, 110, x) + Math.max(0, x - 110) * 0.2;
    return LAND_Y + (cliff + n) * tip - (1 - tip) * 7;
  }
  if (x > 98 && x < 120 && z >= 9 && z < 66) return 2.0 + n * 0.5;
  return LAND_Y + 0.25 * n + Math.max(0, z - 72) * 0.16 + Math.max(0, x - 166) * 0.3 + Math.max(0, -60 - x) * Math.max(0, z - 50) * 0.01;
}

function groundColor(x: number, z: number, y: number, c: THREE.Color) {
  const n = noise2(x * 2.3, z * 2.3);
  const cove = pointInPolygon(COVE_DOMAIN.outline, x, z);
  if (y < -0.2) {
    if (cove) c.set(n > 0 ? "#9fb2b8" : "#8aa0a8");
    else if (y < -10) c.set("#4d6a72");
    else if (n > 0.5 && y > -9) c.set("#5f7f63");
    else c.set(n < -0.4 ? "#8b8c84" : "#b9ab88");
    return;
  }
  if (y < 1.0) { c.set(cove ? "#c9cfcf" : "#dccb9f"); return; }
  // Cliffs grey, their tops green; the shore grassy; the cove's rim pale and rocky.
  const steep = Math.abs(sanctGround(x + 1.5, z) - sanctGround(x - 1.5, z)) + Math.abs(sanctGround(x, z + 1.5) - sanctGround(x, z - 1.5));
  if (steep > 1.9) c.set(n > 0 ? "#7d7f7b" : "#6e716d");
  else if (x > 98 && z > 9 && z < 66) c.set("#8e9595");
  else c.set(y > 12 ? (n > 0 ? "#6c9a55" : "#5f8d4c") : n > 0.2 ? "#7fae5c" : "#73a352");
}

function Terrain() {
  const geo = useMemo(() => {
    const step = 3, xs: number[] = [], zs: number[] = [];
    for (let x = -204; x <= 213; x += step) xs.push(x);
    for (let z = -150; z <= 156; z += step) zs.push(z);
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    for (const z of zs) for (const x of xs) {
      const y = sanctGround(x, z);
      pos.push(x, y, z);
      groundColor(x, z, y, c);
      col.push(c.r, c.g, c.b);
    }
    const W = xs.length;
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
      const a = j * W + i;
      idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => terrainMaterial(SANCT_WATER.color), []);
  return <mesh geometry={geo} material={mat} raycast={() => undefined} />;
}

function Sea() {
  const mat = useMemo(() => {
    const box = { minX: -130, minZ: -100, w: 300, d: 175 };
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
    g.filter = "blur(5px)";
    g.fillStyle = "#fff";
    for (const poly of [SANCTUARY_DOMAIN.outline, COVE_DOMAIN.outline]) {
      g.beginPath();
      poly.forEach((p, i) => { const x = ((p.x - box.minX) / box.w) * 256, y = ((p.z - box.minZ) / box.d) * 256; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.closePath();
      g.fill();
    }
    const mask = new THREE.CanvasTexture(c);
    mask.flipY = false;
    return seaMaterial({
      deep: "#1b557a", shallow: "#2b86a3", sky: "#dceaf2", sunDir: SANCT_AIR.sun.dir, mask, maskBox: [box.minX, box.minZ, box.w, box.d],
      origin: { x: O.x, z: O.z }, clearNear: 0.6, waveScale: 1.25
    });
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={4} raycast={() => undefined}>
      <planeGeometry args={[4000, 4000, 1, 1]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ built things

function pine(b: PartBuilder, x: number, z: number, h: number) {
  const y = sanctGround(x, z);
  b.cyl(0.16, 0.22, h * 0.3, x, y, z, "#6b4a2a", 6);
  for (let k = 0; k < 3; k++) b.cone(h * (0.32 - k * 0.07), h * 0.42, x, y + h * (0.22 + k * 0.2), z, k % 2 ? "#2f6b43" : "#3a7a4c", 7);
}

function Structures() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0.4);
    // The research station: a white two-storey lab with a teal roof, a radar dome and antennas, and its dock.
    const R = RESEARCH;
    const ry = sanctGround(R.x, R.z);
    b.box(16, 6, 9, R.x, ry, R.z, "#f2f1ec");
    b.box(16.6, 0.5, 9.6, R.x, ry + 6, R.z, "#2f8f9d");
    b.box(7, 3, 6, R.x - 3, ry + 6.5, R.z + 1, "#f2f1ec");
    b.box(7.4, 0.4, 6.4, R.x - 3, ry + 9.5, R.z + 1, "#2f8f9d");
    for (let k = 0; k < 6; k++) b.box(1.6, 1.4, 0.1, R.x - 6.2 + k * 2.5, ry + 3.6, R.z - 4.55, "#3d6680");
    for (let k = 0; k < 4; k++) b.box(1.6, 1.4, 0.1, R.x - 6.2 + k * 2.5, ry + 1.2, R.z - 4.55, "#3d6680");
    b.box(2, 2.6, 0.1, R.x + 5.5, ry, R.z - 4.55, "#14394d");
    b.sphere(1.6, R.x + 4, ry + 7.6, R.z + 2, "#f4f4f0", [1, 1, 1], 14);
    b.cyl(0.08, 0.08, 6, R.x - 1, ry + 9.9, R.z - 1, "#c9ccd0", 6);
    b.cyl(0.06, 0.06, 4, R.x - 5, ry + 9.9, R.z + 3, "#c9ccd0", 6);
    // The dock out from the station, with bollards.
    b.box(5, 0.3, R.z - R.dock.z, R.dock.x, LAND_Y + 0.4, (R.z + R.dock.z) / 2 - 2, "#9c7a52");
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) b.cyl(0.2, 0.2, 3, R.dock.x + s * 2.3, -2, R.dock.z + k * 4, "#6b4f34", 8);
    for (const s of [-1, 1]) b.cyl(0.18, 0.22, 0.5, R.dock.x + s * 2, LAND_Y + 0.7, R.dock.z + 1, "#2b3a40", 8);
    // The pier out to the underwater station, on pillars.
    const S = STATION;
    b.box(3, 0.3, S.pierFrom.z - S.z - S.r + 0.5, S.x, 1.6, (S.pierFrom.z + S.z + S.r) / 2, "#a7855a");
    for (let z = S.z + S.r + 2; z < S.pierFrom.z; z += 6) for (const s of [-1, 1]) b.cyl(0.25, 0.25, 9, S.x + s * 1.3, -7.3, z, "#6b4f34", 8);
    for (const s of [-1, 1]) b.box(0.08, 1, S.pierFrom.z - S.z - S.r, S.x + s * 1.45, 1.9, (S.pierFrom.z + S.z + S.r) / 2, "#f2f6f7");
    // The station: a round room half under the sea, glass all round its lower half, a deck and a dome on top.
    b.cyl(S.r + 0.3, S.r + 0.3, 0.6, S.x, S.floor - 0.6, S.z, "#3d5566", 24);
    b.cyl(S.r + 0.25, S.r + 0.25, 0.7, S.x, -0.8, S.z, "#e8e4da", 24);
    b.cyl(S.r, S.r, S.roof - (-0.1), S.x, -0.1, S.z, "#f0ede4", 24);
    b.cyl(S.r + 0.4, S.r + 0.4, 0.3, S.x, S.roof, S.z, "#2f8f9d", 24);
    b.sphere(S.r * 0.7, S.x, S.roof + 0.3, S.z, "#bfe7f2", [1, 0.45, 1], 18);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      b.boxAt(0.22, -0.8 - S.floor, 0.3, [S.x + Math.sin(a) * S.r, (S.floor - 0.8) / 2 - 0.0, S.z + Math.cos(a) * S.r], [0, a, 0], "#2f4f66");
    }
    // Inside: floor, a ring bench, and the solid south-east wall (behind the viewers) where the stairs come down.
    b.cyl(S.r - 0.2, S.r - 0.2, 0.1, S.x, S.floor, S.z, "#1f3646", 24);
    b.add(new THREE.CylinderGeometry(S.r - 0.2, S.r - 0.2, -0.8 - S.floor, 24, 1, true, -0.35, 2.2), "#26445b", [S.x, (S.floor - 0.8) / 2, S.z]);
    b.add(new THREE.TorusGeometry(S.r - 1.4, 0.3, 6, 24, Math.PI), "#3d6680", [S.x, S.floor + 0.45, S.z], [Math.PI / 2, 0, 1.0]);
    // The care platform: floats, deck, rails, crates.
    const C = CARE;
    for (const [dx, dz] of [[-3, -1.8], [3, -1.8], [-3, 1.8], [3, 1.8]]) b.cylAt(0.5, C.d - 1, [C.x + dx, -0.1, C.z + dz], [Math.PI / 2, 0, 0], "#f2f2ee", 10);
    b.box(C.w, 0.3, C.d, C.x, C.top - 0.3, C.z, "#d6c7a8");
    b.box(C.w, 0.06, 0.06, C.x, C.top + 0.95, C.z + C.d / 2, "#e8590c");
    b.box(1.2, 0.8, 0.8, C.x + 2.5, C.top, C.z + 1.2, "#2f7fd1");
    b.box(1, 0.6, 0.7, C.x - 2.8, C.top, C.z + 1.4, "#ffb347");
    // The observation point on the clifftop: a round platform, rails, telescopes.
    const L = LOOKOUT;
    b.cyl(5.2, 5.4, 0.4, L.x, L.y - 0.3, L.z, "#a7855a", 20);
    for (let k = 0; k < 14; k++) {
      const a = -1.4 + (k / 13) * 2.8;
      b.box(0.08, 1.05, 0.08, L.x + Math.sin(a + Math.PI / 2) * 5, L.y, L.z - Math.cos(a + Math.PI / 2) * 5, "#f2f6f7");
    }
    b.add(new THREE.TorusGeometry(5, 0.05, 4, 24, 2.8), "#f2f6f7", [L.x, L.y + 1.05, L.z], [Math.PI / 2, 0, -0.17 - 1.4]);
    for (const a of [0.2, 0.9]) { b.cyl(0.07, 0.12, 1.0, L.x + Math.cos(a) * 4.3, L.y, L.z - Math.sin(a) * 4.3, "#2f4f66", 8); b.add(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 10), "#e0b030", [L.x + Math.cos(a) * 4.3, L.y + 1.15, L.z - Math.sin(a) * 4.3], [Math.PI / 2 - 0.2, a + Math.PI / 2, 0]); }
    // The research boat at anchor.
    const B = BOAT;
    const hull = new THREE.CylinderGeometry(2.1, 1.6, 11, 10, 1).rotateZ(Math.PI / 2).scale(1, 0.55, 1);
    b.add(hull, "#f4f4f0", [B.x, 0.2, B.z], [0, B.yaw, 0]);
    b.add(new THREE.BoxGeometry(11.2, 0.35, 3.4), "#e8590c", [B.x, 0.9, B.z], [0, B.yaw, 0]);
    b.add(new THREE.BoxGeometry(4, 2.2, 2.6), "#f4f4f0", [B.x - Math.cos(B.yaw) * 1.2, 2.1, B.z + Math.sin(B.yaw) * 1.2], [0, B.yaw, 0]);
    b.add(new THREE.BoxGeometry(4.1, 0.25, 2.7), "#2f8f9d", [B.x - Math.cos(B.yaw) * 1.2, 3.3, B.z + Math.sin(B.yaw) * 1.2], [0, B.yaw, 0]);
    b.cyl(0.08, 0.08, 5, B.x - Math.cos(B.yaw) * 1.2, 3.4, B.z + Math.sin(B.yaw) * 1.2, "#c9ccd0", 6);
    // The islands: rocks and pines.
    for (const [dx, dz, h] of [[-4, -3, 5.5], [2, 1, 6], [-1, 5, 4.6], [5, -4, 5], [-7, 3, 4.2]] as const) pine(b, ISLAND.x + dx, ISLAND.z + dz, h);
    for (const [dx, dz, r] of [[9, 4, 1.4], [-10, -6, 1.7], [3, -10, 1.2], [-3, 10, 1.1]] as const) b.add(new THREE.DodecahedronGeometry(r, 0), "#7d7f7b", [ISLAND.x + dx, islandY(ISLAND.x + dx, ISLAND.z + dz) + r * 0.3, ISLAND.z + dz], [dx, dz, 0], [1, 0.7, 1]);
    pine(b, ISLET.x, ISLET.z, 3.6);
    // The cove's breakwater: boulders between the bay and Beluga Cove.
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let z = 8; z < 64; z += 2.4) for (const x of [106, 111]) {
      const r = 1.1 + rnd() * 0.9;
      b.add(new THREE.DodecahedronGeometry(r, 0), rnd() > 0.5 ? "#8a8d89" : "#777b78", [x + rnd(), 1.6 + rnd() * 0.6, z + rnd()], [rnd() * 3, rnd() * 3, 0], [1, 0.75, 1]);
    }
    // The cove's little viewing platform.
    b.box(14, 0.3, 4, 136, LAND_Y + 0.2, 66, "#a7855a");
    b.box(14, 0.06, 0.06, 136, LAND_Y + 1.4, 64.1, "#f2f6f7");
    for (let k = 0; k <= 7; k++) b.box(0.07, 1.2, 0.07, 129 + k * 2, LAND_Y + 0.2, 64.1, "#f2f6f7");
    // Pines along the shore and on the headlands.
    for (const [x, z, h] of [[-70, 66, 7], [-62, 72, 8], [-40, 70, 6.5], [60, 72, 7.5], [86, 66, 6], [-130, 60, 8], [-142, 20, 9], [-150, -20, 8.5], [-138, -60, 7], [124, -20, 8], [130, -60, 7.5], [150, 70, 7], [172, 40, 8]] as const) pine(b, x, z, h);
    return b.build();
  }, []);
  const glass = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d9f6ff", transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }), []);
  return (
    <group>
      <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />
      <mesh position={[STATION.x, (STATION.floor - 0.8) / 2, STATION.z]} material={glass} renderOrder={5} raycast={() => undefined}>
        <cylinderGeometry args={[STATION.r - 0.05, STATION.r - 0.05, -0.8 - STATION.floor, 24, 1, true]} />
      </mesh>
    </group>
  );
}

/** Far mountains and islands on the ocean, and a ship on the horizon. */
function Scenery() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    const hill = (x: number, z: number, r: number, h: number, c: string, seg = 8) => b.add(new THREE.ConeGeometry(r, h, seg, 1), c, [x, h / 2 - 2, z], [0, x * 0.05, 0], [1, 1, 0.75]);
    for (const [x, z, r] of [[-260, -520, 40], [140, -640, 60], [380, -480, 34], [-480, -700, 70]] as const) hill(x, z, r, r * 0.45, "#6f9a68", 10);
    // Far ranges: broad and low, fading into the haze.
    for (const [x, z, r, h] of [[-700, -1100, 340, 110], [-260, -1250, 300, 90], [300, -1200, 380, 120], [780, -1050, 300, 95], [-1050, -800, 260, 85], [40, -1300, 260, 70]] as const) hill(x, z, r, h, "#a8bccb", 9);
    // A cargo ship far out.
    b.box(46, 7, 8, 260, -2, -820, "#5b6770");
    b.box(14, 9, 7, 275, 4, -820, "#e8e4da");
    return b.build();
  }, []);
  return <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />;
}

/** The yellow buoys marking the sanctuary's edge (one instanced draw, bobbing). */
function Buoys() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const pts = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < BUOY_LINE.length - 1; i++) {
      const a = BUOY_LINE[i], c = BUOY_LINE[i + 1], n = Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 7);
      for (let k = 0; k < n; k++) out.push({ x: a.x + (c.x - a.x) * k / n, z: a.z + (c.z - a.z) * k / n });
    }
    return out;
  }, []);
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    b.sphere(0.55, 0, 0.1, 0, "#ffd43b", [1, 0.8, 1], 10);
    b.cyl(0.06, 0.06, 1.2, 0, 0.4, 0, "#3b3b3b", 6);
    return b.build();
  }, []);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m || !sanctuaryShown()) return;
    const t = shaderTime.value;
    pts.forEach((p, i) => {
      o.position.set(p.x, Math.sin(t * 1.3 + i) * 0.12, p.z);
      o.rotation.set(Math.sin(t + i) * 0.1, 0, Math.cos(t * 0.8 + i) * 0.1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, smoothMat, pts.length]} frustumCulled={false} raycast={() => undefined} />;
}

function Signs() {
  const belugas = useGame((s) => Boolean(s.model.progress.sanctuary?.belugas));
  const research = signMaterial("OCEAN RESEARCH STATION\nうみの けんきゅうじょ", "#14506a", "#e8fbff", 1000, 260);
  const station = signMaterial("UNDERWATER STATION\nすいちゅう かんそくじょ", "#2f8f9d", "#ffffff", 900, 260);
  const lookout = signMaterial("OBSERVATION POINT\nてんぼうだい", "#7a5636", "#fff4d6", 800, 240);
  const cove = signMaterial(belugas ? "BELUGA COVE\nシロイルカの いりえ" : "BELUGA COVE\nCOMING SOON", belugas ? "#5b8fb0" : "#7a6a52", belugas ? "#ffffff" : "#fff4d6", 800, 240);
  const welcome = signMaterial("GRAND OCEAN SANCTUARY\nうみの サンクチュアリ", "#173f5c", "#ffffff", 1100, 260);
  const ry = sanctGround(RESEARCH.x, RESEARCH.z);
  return (
    <group>
      <mesh position={[RESEARCH.x, ry + 4.9, RESEARCH.z - 4.62]} rotation={[0, Math.PI, 0]} material={research} raycast={() => undefined}><planeGeometry args={[9, 2.35]} /></mesh>
      <mesh position={[STATION.x, STATION.roof - 0.4, STATION.z + STATION.r + 0.05]} material={station} raycast={() => undefined}><planeGeometry args={[6, 1.73]} /></mesh>
      <mesh position={[LOOKOUT.x - 4.5, LOOKOUT.y + 1.6, LOOKOUT.z + 3.5]} rotation={[0, -0.9, 0]} material={lookout} raycast={() => undefined}><planeGeometry args={[3.4, 1.02]} /></mesh>
      <mesh position={[136, LAND_Y + 2.4, 66.2]} rotation={[0, Math.PI, 0]} material={cove} raycast={() => undefined}><planeGeometry args={[4.4, 1.32]} /></mesh>
      <mesh position={[-20, 4.2, 66]} rotation={[0, Math.PI, 0]} material={welcome} raycast={() => undefined}><planeGeometry args={[9.6, 2.27]} /></mesh>
    </group>
  );
}

/** Rewards and the chosen habitat improvement, all visible in the bay. */
function Improvements() {
  const p = useGame((s) => s.model.progress.sanctuary);
  const key = `${p?.decor.join(",") ?? ""}|${p?.improvement ?? ""}`;
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    const [decor, imp] = key.split("|");
    const has = (k: string) => decor.split(",").includes(k);
    if (has("flags")) for (let k = 0; k < 5; k++) {
      const x = STATION.x - 1.5, z = STATION.pierFrom.z - 4 - k * 5.5;
      b.cyl(0.05, 0.05, 3.2, x, 1.7, z, "#e8e1d2", 6);
      b.add(new THREE.BoxGeometry(1.1, 0.7, 0.03), ["#ff5c8a", "#ffd23f", "#4cd27a", "#4aa3ff", "#ff8a3d"][k], [x + 0.55, 4.5, z], [0, Math.PI / 2, 0]);
    }
    if (has("guardianFlag")) {
      const ry = sanctGround(RESEARCH.x, RESEARCH.z);
      b.cyl(0.08, 0.08, 8, RESEARCH.x + 7, ry + 6, RESEARCH.z - 3, "#e8e1d2", 6);
      b.add(new THREE.BoxGeometry(2.6, 1.6, 0.04), "#2f9e44", [RESEARCH.x + 8.3, ry + 13, RESEARCH.z - 3], [0, 0, 0]);
      b.sphere(0.45, RESEARCH.x + 8.3, ry + 13, RESEARCH.z - 2.97, "#ffffff", [1, 1, 0.1], 10);
    }
    if (imp === "kelp") {
      // A kelp forest round the island: tall strands from the floor to the surface.
      for (let k = 0; k < 26; k++) {
        const a = k * 2.4, r = ISLAND.r + 4 + (k % 5) * 1.6, x = ISLAND.x + Math.cos(a) * r, z = ISLAND.z + Math.sin(a) * r;
        const f = SANCTUARY_DOMAIN.floor(x, z);
        if (f > -2) continue;
        b.add(new THREE.CylinderGeometry(0.08, 0.14, -f - 0.3, 5), k % 2 ? "#4f7f3a" : "#6a9a46", [x, f + (-f - 0.3) / 2, z], [Math.sin(k) * 0.08, 0, Math.cos(k) * 0.08]);
        b.add(new THREE.BoxGeometry(0.6, 0.03, 1.4), "#7aa84f", [x, -0.05, z], [0, k, 0]);
      }
    } else if (imp === "quiet") {
      // Blue buoys round a quiet zone, with a sign: no boats here.
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        b.sphere(0.5, -10 + Math.cos(a) * 26, 0.1, -38 + Math.sin(a) * 20, "#4dabf7", [1, 0.8, 1], 8);
      }
    } else if (imp === "ice") {
      for (const [dx, dz, s] of [[-6, -6, 1.2], [-2, -8, 0.9], [3, -7, 1.1]] as const) b.add(new THREE.DodecahedronGeometry(s, 0), "#e6f7ff", [CARE.x + dx, 0.15, CARE.z + dz], [dx, dz, 0], [1, 0.55, 1]);
    }
    return b.build();
  }, [key]);
  const board = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fffbea"; g.fillRect(0, 0, 512, 256);
    // The title shrinks until it fits the board (Japanese glyphs are wide).
    const title = "HOW BIG IS AN ORCA?  シャチの おおきさ";
    let size = 30;
    g.font = `900 ${size}px system-ui, sans-serif`;
    while (size > 16 && g.measureText(title).width > 488) g.font = `900 ${--size}px system-ui, sans-serif`;
    g.fillStyle = "#14506a"; g.textAlign = "center"; g.fillText(title, 256, 34);
    g.fillStyle = "#151c24";
    g.beginPath(); g.ellipse(170, 150, 140, 36, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(150, 116); g.lineTo(165, 40); g.lineTo(190, 116); g.fill();
    g.fillStyle = "#f4f6f8"; g.beginPath(); g.ellipse(250, 140, 16, 7, -0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffcf3f"; g.fillRect(340, 120, 120, 56);
    g.fillStyle = "#2b3a40"; g.font = "800 22px system-ui, sans-serif"; g.fillText("8 m", 170, 222); g.fillText("bus 10 m", 400, 222);
    g.fillStyle = "#e8590c"; g.fillRect(476, 152, 10, 24); g.beginPath(); g.arc(481, 146, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2b3a40"; g.fillText("you", 481, 196);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  }, []);
  const quietSign = signMaterial("QUIET ZONE\nしずかな エリア", "#4dabf7", "#ffffff", 640, 220);
  return (
    <group>
      <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />
      {p?.decor.includes("sizeBoard") && <SizeBoard material={board} />}
      {p?.improvement === "quiet" && <mesh position={[-10, 2.4, -17]} material={quietSign} raycast={() => undefined}><planeGeometry args={[4, 1.37]} /></mesh>}
    </group>
  );
}

/** The size board: an information panel on the lookout's rail, right of the view, low, facing the viewer. */
function SizeBoard({ material }: { material: THREE.Material }) {
  const { pos, target } = SANCTUARY_SHOTS.overview;
  const yaw = Math.atan2(target.x - pos.x, target.z - pos.z) - 0.22;
  const x = pos.x + Math.sin(yaw) * 7, z = pos.z + Math.cos(yaw) * 7;
  return (
    <group position={[x, LOOKOUT.y, z]} rotation={[0, Math.atan2(pos.x - x, pos.z - z), 0]}>
      <mesh position={[0, 1.0, 0]} rotation={[-0.35, 0, 0]} material={material} raycast={() => undefined}><planeGeometry args={[1.3, 0.65]} /></mesh>
      <mesh position={[0, 0.45, -0.05]} raycast={() => undefined}><boxGeometry args={[0.1, 0.9, 0.1]} /><meshLambertMaterial color="#7a5636" /></mesh>
    </group>
  );
}

// ------------------------------------------------------------------ orcas and belugas

const FIN_OF: Record<string, FinStyle> = { kuro: "tall", yuki: "curved", umi: "nicked", chibi: "small" };
const ringMat = new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.9, depthTest: false });
const ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 32);

function Cetacean({ id, kind, length, fin, get, index }: { id: string; kind: "orca" | "beluga"; length: number; fin: FinStyle; get: () => Swimmer | undefined; index: number }) {
  const geo = useMemo(() => cetaceanGeometry({ kind, length, fin }), [kind, length, fin]);
  const mat = useMemo<CetaceanMaterial>(() => createCetaceanMaterial(kind, length), [kind, length]);
  const root = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null), tag = useRef<THREE.Sprite>(null);
  const look = useRef({ yaw: 0, pitch: 0 });
  useFrame(({ camera }, dt) => {
    const m = get(), r = root.current;
    if (!m || !r) { if (r) r.visible = false; return; }
    r.visible = true;
    r.position.set(m.x, m.y, m.z);
    r.rotation.set(-m.pitch, m.yaw, m.roll, "YXZ");
    r.scale.setScalar(m.len / length);
    const u = mat.uniforms;
    u.uPhase.value = m.phase;
    u.uAmp.value = m.amp;
    u.uTurn.value = THREE.MathUtils.clamp(m.turn, -0.6, 0.6);
    u.uArch.value = m.arch;
    u.uFlap.value = 0.2 + (1 - Math.min(1, m.speed / 2)) * 0.4;
    u.uWater.value = underwaterNow() ? 0.45 : 0.55;
    if (kind === "beluga") {
      // A beluga's flexible neck: it looks about as it swims, and turns its head into a turn.
      const l = look.current, t = shaderTime.value + index * 3;
      l.yaw += ((Math.sin(t * 0.45) * 0.45 + m.turn * 0.5) - l.yaw) * Math.min(1, dt * 2);
      l.pitch += (Math.sin(t * 0.33 + 1) * 0.22 - l.pitch) * Math.min(1, dt * 2);
      u.uHead.value.set(l.yaw, l.pitch);
    }
    if (ring.current) {
      ring.current.visible = sanctFocus.id === id;
      ring.current.position.set(m.x, Math.max(m.y, -0.3) + m.len * 0.22, m.z);
      ring.current.scale.setScalar(m.len * 0.38 * (1 + Math.sin(rt.time * 4) * 0.05));
    }
    if (tag.current) {
      tag.current.visible = sanctFocus.numbers && kind === "orca";
      if (tag.current.visible) {
        tag.current.material = numberMaterial(index + 1);
        tag.current.position.set(m.x, Math.max(1.2, m.y + m.len * 0.4), m.z);
        const d = camera.position.distanceTo(new THREE.Vector3(O.x + m.x, m.y, O.z + m.z));
        tag.current.scale.setScalar(Math.max(1.6, d * 0.06));
      }
    }
  });
  return (
    <>
      <group ref={root} name={`sanct-${kind}-${id}`}><mesh geometry={geo} material={mat} onClick={tap(() => tapOrca(id))} /></group>
      <mesh ref={ring} geometry={ringGeo} material={ringMat} rotation={[Math.PI / 2, 0, 0]} visible={false} renderOrder={12} raycast={() => undefined} />
      <sprite ref={tag} visible={false} renderOrder={13} raycast={() => undefined} />
    </>
  );
}

function Animals() {
  const belugas = useGame((s) => Boolean(s.model.progress.sanctuary?.belugas));
  return (
    <>
      {ORCAS.map((o, i) => <Cetacean key={o.id} id={o.id} kind="orca" length={7} fin={FIN_OF[o.id]} index={i} get={() => sanctRt.orcas?.byId(o.id)} />)}
      {belugas && BELUGAS.map((b, i) => <Cetacean key={b.id} id={b.id} kind="beluga" length={4.2} fin="none" index={i} get={() => sanctRt.belugas?.byId(b.id)} />)}
    </>
  );
}

function Ice() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    for (const [k, p] of COVE_ICE.entries()) b.add(new THREE.DodecahedronGeometry(1 + k * 0.25, 0), "#eef9ff", [p.x, 0.1, p.z], [k, k * 2, 0], [1.3, 0.45, 1]);
    return b.build();
  }, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.position.y = Math.sin(shaderTime.value * 0.9) * 0.08; });
  return <mesh ref={ref} geometry={geo} material={smoothMat} raycast={() => undefined} />;
}

// ------------------------------------------------------------------ the cleanup's litter

const LITTER_GEO = (() => {
  const make = (kind: string) => {
    const b = new PartBuilder(0);
    if (kind === "bottle") { b.cyl(0.14, 0.14, 0.55, 0, -0.2, 0, "#7fd0a8", 10); b.cyl(0.06, 0.1, 0.18, 0, 0.35, 0, "#7fd0a8", 8); b.cyl(0.065, 0.065, 0.06, 0, 0.53, 0, "#2f7fd1", 8); }
    else if (kind === "bag") b.add(new THREE.DodecahedronGeometry(0.4, 0), "#f4f6f8", [0, 0, 0], [0.4, 0.2, 0], [1.3, 0.35, 1]);
    else if (kind === "can") b.cyl(0.13, 0.13, 0.38, 0, -0.19, 0, "#e03131", 10);
    else if (kind === "cup") b.cyl(0.18, 0.12, 0.32, 0, -0.16, 0, "#ffd8a8", 10);
    else for (let k = 0; k < 5; k++) b.add(new THREE.TorusGeometry(0.22 + k * 0.05, 0.02, 4, 10), "#2f9e44", [0, 0, 0], [Math.PI / 2 + k * 0.3, k, 0]);
    return b.build();
  };
  return { bottle: make("bottle"), bag: make("bag"), can: make("can"), cup: make("cup"), net: make("net") } as Record<string, THREE.BufferGeometry>;
})();
const glowMat = new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.75, depthWrite: false });
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function Litter() {
  const [, setN] = useState(0);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const last = useRef("");
  useFrame(() => {
    const key = sanctRt.litter.map((l) => `${l.i}:${l.picked >= 0 ? 1 : 0}`).join(",") + (sanctRt.cleanupOn ? "on" : "");
    if (key !== last.current) { last.current = key; setN((n) => n + 1); }
    const t = shaderTime.value;
    sanctRt.litter.forEach((l, k) => {
      const g = refs.current[k];
      if (!g) return;
      const gone = l.picked >= 0 ? Math.min(1, (sanctRt.time - l.picked) / 0.5) : 0;
      g.visible = gone < 1;
      g.position.set(l.x + Math.sin(t * 0.4 + k) * 0.6, Math.sin(t * 1.4 + k) * 0.08 + gone * 1.5, l.z + Math.cos(t * 0.3 + k) * 0.6);
      g.rotation.y = t * 0.3 + k;
      g.scale.setScalar(2.3 * (1 - gone));
    });
  });
  return (
    <>
      {sanctRt.litter.map((l, k) => (
        <group key={l.i} ref={(el) => { refs.current[k] = el; }}>
          <mesh geometry={LITTER_GEO[l.kind]} material={smoothMat} raycast={() => undefined} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={glowMat} raycast={() => undefined}><ringGeometry args={[0.55, 0.7, 20]} /></mesh>
          {/* A generous tap zone (a child's finger on a small far object). */}
          <mesh material={hitMat} onClick={tap(() => tapLitter(l.i))} name={`sanct-litter-${l.i}`}><sphereGeometry args={[1.3, 8, 6]} /></mesh>
        </group>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ people

function Person({ id, type, variant, x, z, y, yaw, act, show }: { id: string; type: "child" | "adult" | "fan" | "grandma" | "explorer"; variant: number; x: number; z: number; y: number; yaw: number; act: "look" | "photo" | "point"; show: () => boolean }) {
  const model = useMemo(() => tunnelPersonModel(type, variant), [type, variant]);
  const pose = useRef(newPose());
  useFrame((_, dt) => {
    const q = pose.current;
    q.visible = show();
    if (!q.visible) return;
    q.x = x; q.z = z; q.yaw = yaw; q.moving = false;
    const want = act === "point" ? 0.95 * (0.5 + 0.5 * Math.sin(rt.time * 0.35 + x)) : act === "photo" ? 0.75 : 0;
    q.arm += (want - q.arm) * Math.min(1, dt * 4);
    q.photo = act === "photo";
    q.lookUp = act === "look" ? 0.2 : 0;
  });
  return <group position={[0, y, 0]}><TunnelFigure model={model} pose={pose} name={`sanct-person-${id}`} /></group>;
}

function Walker({ path, y, show }: { path: { x: number; z: number }[]; y: number; show: () => boolean }) {
  const model = useMemo(() => tunnelPersonModel("adult", 3), []);
  const pose = useRef(newPose());
  const t = useRef(0.2), dir = useRef(1);
  useFrame((_, dt) => {
    const q = pose.current;
    q.visible = show();
    if (!q.visible) return;
    t.current += dir.current * dt * 0.025;
    if (t.current > 1 || t.current < 0) { dir.current *= -1; t.current = Math.max(0, Math.min(1, t.current)); }
    const a = path[0], b = path[1];
    q.x = a.x + (b.x - a.x) * t.current; q.z = a.z + (b.z - a.z) * t.current;
    q.yaw = Math.atan2((b.x - a.x) * dir.current, (b.z - a.z) * dir.current);
    q.moving = true;
    q.step += dt * 6;
  });
  return <group position={[0, y, 0]}><TunnelFigure model={model} pose={pose} name="sanct-walker" /></group>;
}

const view = () => getGame().sanctuaryView;
const atLookout = () => sanctuaryShown() && view() === "overview";
const inStation = () => sanctuaryShown() && view() === "underwater";
const onPier = () => sanctuaryShown() && (view() === "research" || view() === "orcas");

function People() {
  return (
    <>
      <Person id="l1" type="grandma" variant={2} x={LOOKOUT_SPOTS[0].x} z={LOOKOUT_SPOTS[0].z} y={LOOKOUT.y} yaw={2.0} act="look" show={atLookout} />
      <Person id="l2" type="child" variant={5} x={LOOKOUT_SPOTS[1].x} z={LOOKOUT_SPOTS[1].z} y={LOOKOUT.y} yaw={2.3} act="point" show={atLookout} />
      <Person id="s1" type="child" variant={2} x={STATION_SPOTS[0].x} z={STATION_SPOTS[0].z} y={STATION.floor} yaw={-2.6} act="point" show={inStation} />
      <Person id="s2" type="adult" variant={1} x={STATION_SPOTS[1].x} z={STATION_SPOTS[1].z} y={STATION.floor} yaw={-2.4} act="photo" show={inStation} />
      <Person id="c1" type="explorer" variant={2} x={CARE.x + 1} z={CARE.z} y={CARE.top} yaw={Math.PI} act="look" show={onPier} />
      <Walker path={PIER_PATH} y={1.9} show={onPier} />
    </>
  );
}

// ------------------------------------------------------------------ the area

const fxPool: { current: FxPool | null } = { current: null };
/** Sun shafts around the station (seen from inside it). */
const SHAFTS = [{ x: 58, z: 12, w: 3 }, { x: 52, z: 2, w: 4 }, { x: 62, z: 0, w: 2.6 }, { x: 46, z: 14, w: 3.4 }];

function Tick() {
  useFrame((_, dt) => {
    if (!sanctuaryShown()) return;
    sanctuaryTick(Math.min(dt, 0.1));
    const fx = fxPool.current;
    for (const e of sanctRt.fx.splice(0, sanctRt.fx.length)) {
      if (!fx) continue;
      const k = e.len / 7;
      if (e.kind === "breathe") fx.spout(O.x + e.x, 0.25, O.z + e.z, (e.cove ? 1.3 : 2.6) * Math.max(0.5, k));
      else if (e.kind === "splash") fx.splash(O.x + e.x, 0, O.z + e.z, 2.4 * Math.max(0.5, k));
      else if (e.kind === "dive") fx.splash(O.x + e.x, 0, O.z + e.z, 1.2 * Math.max(0.5, k));
    }
  });
  return null;
}

function SanctLook() {
  return (
    <LookSprite name="sanct-look" origin={O} onTap={tapSanctLook} scale={0.06} get={() => {
      const g = getGame();
      const l = sanctRt.look;
      if (!l || g.prompt || g.areaActivity || g.line) return null;
      const pod = l.cove ? sanctRt.belugas : sanctRt.orcas;
      const ms = l.ids.map((id) => pod?.byId(id)).filter((m): m is Swimmer => Boolean(m));
      const x = ms.length ? ms.reduce((a, m) => a + m.x, 0) / ms.length : l.x;
      const z = ms.length ? ms.reduce((a, m) => a + m.z, 0) / ms.length : l.z;
      const under = underwaterNow();
      const y = under ? Math.min(-1, (ms[0]?.y ?? -3) + 2) : 4 + (ms[0]?.len ?? 6) * 0.3;
      const t = STICKER_TEXT[l.kind];
      return { label: t.en, ja: t.ja, x, y, z };
    }} />
  );
}

export function OceanSanctuary() {
  const ref = useAreaGate(sanctuaryShown);
  useAtmosphere(sanctuaryShown, SANCT_AIR, SANCT_WATER, underwaterNow);
  const gulls = useMemo(() => ({ x: O.x - 30, z: O.z + 10 }), []);
  return (
    <group ref={ref} name="ocean-sanctuary">
      <Tick />
      <SkyDome look={SANCT_AIR} hidden={underwaterNow} />
      <group position={[O.x, 0, O.z]}>
        <Terrain />
        <Structures />
        <Scenery />
        <Buoys />
        <Signs />
        <Improvements />
        <Ice />
        <Animals />
        <Litter />
        <People />
        <SanctLook />
        <LightShafts spots={SHAFTS} depth={12} active={underwaterNow} />
        <FishSchool centre={{ x: 56, z: 10 }} radius={7} depth={-4.5} n={30} active={underwaterNow} />
        <Sea />
      </group>
      <MarineFx pool={fxPool} active={sanctuaryShown} />
      <Gulls centre={gulls} n={8} height={30} radius={60} active={() => sanctuaryShown() && !underwaterNow()} />
    </group>
  );
}

