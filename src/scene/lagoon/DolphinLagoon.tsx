import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, useGame } from "../../game/store";
import { rt } from "../../game/runtime";
import { LAGOON_HALL } from "../../game/data/rooms";
import {
  BRIDGE, CRANE, CRANE_REACH, DECK, DECK_SPOTS, BOARDWALK_PATH, GALLERY, GALLERY_SPOTS, LAGOON_DOMAIN, LAGOON_ORIGIN, PLATFORM, SEA_GATE
} from "../../game/data/lagoon";
import { buoyPoint, jibYaw, jumpRt, trolleyPoint } from "../../game/lagoon/highJump";
import { LAND_Y, pointInPolygon } from "../../game/marine/domain";
import { BALL_HELD, feedingPose, lagoonRt, leaveHighJump, resetFeeding, RING } from "../../game/lagoon/lagoonRuntime";
import { holdLagoonBall, throwLagoonBall, lagoonFocus, lagoonTick, lookText, tapDolphin, tapLook } from "../../game/flow/lagoon";
import { audio } from "../../audio/audio";
import { DOLPHINS } from "../../game/logic/lagoon";
import { PartBuilder } from "../partBuilder";
import { addBoardwalk, addObservationDeck, GALLERY_COVER_TOP } from "./deckGeometry";
import { shaderTime, signMaterial, smoothMat } from "../materials";
import { useAreaGate } from "../tunnel/wing";
import { newPose, TunnelFigure } from "../tunnel/TunnelFigure";
import { tunnelPersonModel } from "../models/people";
import { cetaceanGeometry } from "../marine/cetaceans";
import { createCetaceanMaterial, type CetaceanMaterial } from "../marine/cetaceanMaterial";
import { FishSchool, Gulls, LightShafts, MarineFx, outlineMask, SkyDome, seaMaterial, terrainMaterial, useAtmosphere, type AirLook, type FxPool, type WaterLook } from "../marine/outdoor";

/**
 * The Dolphin Lagoon scene: open sky, the lagoon and its bay pool, the
 * breakwater and the sea beyond with headlands and a lighthouse, the quay and
 * boardwalk, the underwater gallery (a room behind a big window), the
 * observation deck, the care pontoon, the footbridge, palms and a beach, four
 * bottlenose dolphins, their toys, visitors and the keeper. Drawn and stepped
 * only while the lagoon is shown. Area-local coordinates under one group.
 */

/** Boardwalk lamp posts (x, at z 15.4). The one at x = 8 stood in the pavilion doorway and was removed (2026-11-14). */
export const BOARDWALK_LAMPS = [-8, 0, 16] as const;

export const lagoonShown = () => { const g = getGame(); return g.screen === "game" && g.hall === LAGOON_HALL; };
const O = LAGOON_ORIGIN;

export const LAGOON_AIR: AirLook = {
  zenith: "#3b8fd6", horizon: "#cfe9f6",
  sun: { dir: [-0.45, 0.62, -0.64], color: "#fff1d6", intensity: 1.9 },
  hemi: { sky: "#dff3ff", ground: "#9fb48a", intensity: 1.45 },
  fog: { color: "#cfe9f6", near: 140, far: 900 }, far: 1100
};
const LAGOON_WATER: WaterLook = { color: "#1d7894", near: 2, far: 34 };
const underwaterNow = () => lagoonShown() && rt.camera.pos.y < -0.1;

function tap(fn: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    fn();
  };
}

// ------------------------------------------------------------------ ground and water

const TB = { minX: -64, maxX: 58, minZ: -30, maxZ: 46 };

function noise2(x: number, z: number) {
  return Math.sin(x * 0.37 + Math.sin(z * 0.23) * 2) * Math.cos(z * 0.31 - Math.sin(x * 0.19) * 1.7);
}

/** One height function for the land, the beach, the lagoon floor and the sea floor. */
export function lagoonGround(x: number, z: number): number {
  if (pointInPolygon(LAGOON_DOMAIN.outline, x, z)) return LAGOON_DOMAIN.floor(x, z);
  if (x > SEA_GATE.minX && x < SEA_GATE.maxX && z < -13 && z > -18.6) return -3.2;
  if (z < -17.5) return Math.max(-16, -2.2 - (-17.5 - z) * 0.9);
  const far = Math.min(1, Math.max(0, (-LAGOON_DOMAIN.inside(x, z) - 2) / 4));
  let y = LAND_Y + 0.14 * noise2(x, z) * far;
  if (z < -13.4) y += 0.3 * far;
  y += Math.max(0, Math.abs(x + 3) - 46) * 0.5 + Math.max(0, z - 36) * 0.3;
  return y;
}

function groundColor(x: number, z: number, y: number, wet: boolean, c: THREE.Color) {
  const n = noise2(x * 1.7, z * 1.7);
  if (wet) {
    // The rubble slope under the breakwater, then sand, seagrass and the odd stone.
    if (z < -8.5 && x > -15.5 && x < 20 && LAGOON_DOMAIN.inside(x, z) < 4.5) c.set(n > 0 ? "#7f7b70" : "#6d6b63");
    else if (y > -0.25) c.set("#d2bf90");
    else if (n > 0.45 && y < -1.2 && y > -5) c.set("#5f8f5f");
    else c.set(n < -0.55 ? "#a79d86" : "#d9cba0");
    return;
  }
  if (z < -17.5) { c.set("#4a6a6a"); return; }
  const dist = -LAGOON_DOMAIN.inside(x, z);
  if (z < -13.2 && x > -15.5 && x < 19.5) c.set(n > 0 ? "#8e908b" : "#7b7e7a");
  else if (x < -8 && x > -30 && z > -2 && dist < 8) c.set(dist < 1.2 ? "#d8c393" : "#efdcae");
  else if (dist < 1.1) c.set("#e0cd9c");
  else c.set(y > LAND_Y + 1.2 ? "#5e9a4c" : n > 0.2 ? "#86ba62" : "#76ad57");
}

function Terrain() {
  const geo = useMemo(() => {
    const xs: number[] = [], zs: number[] = [];
    for (let x = TB.minX; x <= TB.maxX; x += 1) xs.push(x);
    for (let z = TB.minZ; z <= TB.maxZ; z += 1) if (z !== 10) zs.push(z);
    zs.push(9.98, 10.04);
    zs.sort((a, b) => a - b);
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    for (const z of zs) for (const x of xs) {
      const wet = pointInPolygon(LAGOON_DOMAIN.outline, x, z);
      const y = lagoonGround(x, z);
      pos.push(x, y, z);
      groundColor(x, z, y, wet, c);
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
  const mat = useMemo(() => terrainMaterial(LAGOON_WATER.color), []);
  return <mesh geometry={geo} material={mat} raycast={() => undefined} />;
}

function Sea() {
  const mat = useMemo(() => {
    const box = { minX: LAGOON_DOMAIN.box.minX - 4, minZ: LAGOON_DOMAIN.box.minZ - 4, w: LAGOON_DOMAIN.box.maxX - LAGOON_DOMAIN.box.minX + 8, d: LAGOON_DOMAIN.box.maxZ - LAGOON_DOMAIN.box.minZ + 8 };
    return seaMaterial({
      deep: "#1f6f99", shallow: "#38c3d3", sky: "#d4eefb", sunDir: LAGOON_AIR.sun.dir, mask: outlineMask(LAGOON_DOMAIN.outline, box),
      maskBox: [box.minX, box.minZ, box.w, box.d], origin: { x: O.x, z: O.z }, clearNear: 0.34
    });
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={4} raycast={() => undefined}>
      <planeGeometry args={[1600, 1600, 1, 1]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ built things

/** Outward normal (toward the land) of an outline edge. */
function edgeNormal(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  let nx = dz / l, nz = -dx / l;
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  if (pointInPolygon(LAGOON_DOMAIN.outline, mx + nx * 0.3, mz + nz * 0.3)) { nx = -nx; nz = -nz; }
  return { nx, nz, l, ang: Math.atan2(dx, dz) };
}

function palm(b: PartBuilder, x: number, z: number, h: number, lean: number) {
  const y0 = lagoonGround(x, z);
  let px = x, py = y0, pz = z;
  for (let k = 0; k < 5; k++) {
    const seg = h / 5, nx = px + lean * seg * 0.22 * (k + 1) / 5;
    b.add(new THREE.CylinderGeometry(0.13 - k * 0.015, 0.16 - k * 0.015, seg + 0.05, 7), k % 2 ? "#9a7046" : "#8a6440", [(px + nx) / 2, py + seg / 2, pz], [0, 0, -lean * 0.12 * (k + 1) / 5]);
    px = nx; py += seg;
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.28, 2.4, 4), k % 2 ? "#3f9a55" : "#4fae5f", [px + Math.cos(a) * 1.0, py - 0.25, pz + Math.sin(a) * 1.0], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], [1, 1, 0.25]);
  }
  for (let k = 0; k < 3; k++) b.sphere(0.13, px + Math.cos(k * 2.1) * 0.22, py - 0.25, pz + Math.sin(k * 2.1) * 0.22, "#6b4a2a", [1, 1, 1], 6);
}

function Structures() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0.4);
    const out = LAGOON_DOMAIN.outline;
    // Quay walls (front) and the gallery wall with its window opening.
    for (const i of [1, 3]) {
      const a = out[i], c = out[(i + 1) % out.length], n = edgeNormal(a, c);
      b.boxAt(n.l + 0.6, 7.45, 0.6, [(a.x + c.x) / 2 + n.nx * 0.3, -2.85, (a.z + c.z) / 2 + n.nz * 0.3], [0, n.ang + Math.PI / 2, 0], "#b9b2a4");
      b.boxAt(n.l + 0.7, 0.16, 0.8, [(a.x + c.x) / 2 + n.nx * 0.3, 0.9, (a.z + c.z) / 2 + n.nz * 0.3], [0, n.ang + Math.PI / 2, 0], "#e8e1d2");
    }
    const G = GALLERY, W = G.window, wz = G.z + 0.3;
    const wallC = "#b9b2a4";
    b.box(G.maxX - G.minX, W.bottom + 6.6, 0.6, (G.minX + G.maxX) / 2, -6.6, wz, wallC);
    b.box(G.maxX - G.minX, 0.85 - W.top, 0.6, (G.minX + G.maxX) / 2, W.top, wz, wallC);
    b.box(W.minX - G.minX, W.top - W.bottom, 0.6, (G.minX + W.minX) / 2, W.bottom, wz, wallC);
    b.box(G.maxX - W.maxX, W.top - W.bottom, 0.6, (W.maxX + G.maxX) / 2, W.bottom, wz, wallC);
    b.boxAt(G.maxX - G.minX + 0.7, 0.16, 0.8, [(G.minX + G.maxX) / 2, 0.9, wz], [0, 0, 0], "#e8e1d2");
    // Window frame and mullions.
    for (const x of G.mullions) b.box(0.11, W.top - W.bottom, 0.66, x, W.bottom, wz, "#5b7f96");
    b.box(W.maxX - W.minX + 0.2, 0.2, 0.7, (W.minX + W.maxX) / 2, W.top - 0.1, wz, "#2f4f66");
    b.box(W.maxX - W.minX + 0.2, 0.2, 0.7, (W.minX + W.maxX) / 2, W.bottom - 0.1, wz, "#2f4f66");
    // The gallery room behind it: floor, ceiling, walls, light strips (no benches since 2026-11-14).
    const z0 = G.z + 0.6, z1 = G.back;
    b.box(G.maxX - G.minX + 0.8, 0.3, z1 - z0 + 0.4, (G.minX + G.maxX) / 2, G.floor - 0.3, (z0 + z1) / 2, "#1c2f3d");
    b.box(G.maxX - G.minX + 0.8, GALLERY_COVER_TOP - G.ceiling, z1 - z0 + 0.4, (G.minX + G.maxX) / 2, G.ceiling, (z0 + z1) / 2, "#223a4d");
    b.box(G.maxX - G.minX + 0.8, GALLERY_COVER_TOP - G.floor + 0.3, 0.4, (G.minX + G.maxX) / 2, G.floor - 0.3, z1 + 0.2, "#26445b");
    for (const s of [-1, 1]) b.box(0.4, GALLERY_COVER_TOP - G.floor + 0.3, z1 - z0 + 0.6, s < 0 ? G.minX - 0.2 : G.maxX + 0.2, G.floor - 0.3, (z0 + z1) / 2, "#26445b");
    for (const x of [4.2, 9, 13.8]) for (const z of [z0 + 0.35, 13.5]) b.box(3.2, 0.06, 0.18, x, G.ceiling - 0.07, z, "#bff0ff");
    // A soft blue carpet runner and two dolphin posters on the side walls.
    b.box(3.4, 0.02, G.back - z0 - 1, 9, G.floor, (z0 + G.back) / 2 + 0.3, "#2a5d7a");
    // The boardwalk along the front, with planks, a rail at the quay and lamps.
    addBoardwalk(b);
    const railPts = [{ x: -4, z: 10.15 }, { x: 15.5, z: 10.15 }, { x: 19, z: 8.75 }];
    for (let k = 0; k < railPts.length - 1; k++) {
      const a = railPts[k], c = railPts[k + 1], l = Math.hypot(c.x - a.x, c.z - a.z), ang = Math.atan2(c.x - a.x, c.z - a.z) + Math.PI / 2;
      b.boxAt(l, 0.07, 0.07, [(a.x + c.x) / 2, LAND_Y + 1.15, (a.z + c.z) / 2], [0, ang, 0], "#f2f6f7");
      b.boxAt(l, 0.05, 0.05, [(a.x + c.x) / 2, LAND_Y + 0.65, (a.z + c.z) / 2], [0, ang, 0], "#2f8f9d");
      const posts = Math.ceil(l / 2.2);
      for (let p = 0; p <= posts; p++) { const t = p / posts; b.box(0.08, 1.15, 0.08, a.x + (c.x - a.x) * t, LAND_Y, a.z + (c.z - a.z) * t, "#f2f6f7"); }
    }
    // Lamps along the boardwalk; none in front of the gallery pavilion's doorway (x 7.4-10.6).
    for (const x of BOARDWALK_LAMPS) { b.cyl(0.06, 0.08, 3.2, x, LAND_Y, 15.4, "#2f4f66", 8); b.sphere(0.24, x, LAND_Y + 3.3, 15.4, "#fff6d8", [1, 1, 1], 8); }
    // Gallery entrance pavilion on the boardwalk.
    b.box(6.4, 2.6, 0.25, 9, LAND_Y, 19.3, "#e9e3d6");
    for (const s of [-1, 1]) b.box(0.25, 2.6, 3.8, 9 + s * 3.1, LAND_Y, 17.5, "#e9e3d6");
    b.box(7, 0.3, 4.4, 9, LAND_Y + 2.6, 17.4, "#2f8f9d");
    b.box(3.2, 2.2, 0.1, 9, LAND_Y, 15.65, "#14394d");
    for (const s of [-1, 1]) b.cyl(0.13, 0.13, 2.6, 9 + s * 2.9, LAND_Y, 15.75, "#e9e3d6", 10);
    // The observation deck: individual boards on joists, supported stairs and timber rails.
    const D = DECK;
    addObservationDeck(b, lagoonGround);
    // Flags on the deck's back corners (nothing over the viewers' heads).
    for (const [x, z, c] of [[D.minX + 0.3, D.maxZ - 0.3, "#ff8a5b"], [D.maxX - 0.3, D.maxZ - 0.3, "#4dabf7"]] as const) {
      b.cyl(0.05, 0.05, 3.4, x, D.top, z, "#e8e1d2", 6);
      b.add(new THREE.ConeGeometry(0.35, 1.0, 3), c, [x + 0.5, D.top + 3.0, z], [0, 0, -Math.PI / 2], [1, 1, 0.15]);
    }
    // The footbridge over the channel to the bay pool.
    const steps = 12;
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps, za = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * t0, zb = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * t1;
      const ya = LAND_Y + 0.15 + BRIDGE.rise * Math.sin(Math.PI * t0), yb = LAND_Y + 0.15 + BRIDGE.rise * Math.sin(Math.PI * t1);
      const l = Math.hypot(zb - za, yb - ya), pitch = Math.atan2(yb - ya, zb - za);
      b.boxAt(2.4, 0.14, l + 0.04, [BRIDGE.x, (ya + yb) / 2, (za + zb) / 2], [-pitch, 0, 0], "#b88a5a");
      for (const s of [-1, 1]) {
        b.boxAt(0.07, 0.07, l + 0.04, [BRIDGE.x + s * 1.15, (ya + yb) / 2 + 1, (za + zb) / 2], [-pitch, 0, 0], "#f2f6f7");
        b.box(0.07, 1, 0.07, BRIDGE.x + s * 1.15, ya, za, "#f2f6f7");
      }
    }
    // The breakwater: boulders along the back, the stone face into the lagoon, the sea gate and its net.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let x = -15.5; x <= 19.5; x += 1.7) {
      if (x > SEA_GATE.minX - 0.6 && x < SEA_GATE.maxX + 0.6) continue;
      for (const z of [-14.4, -16.2]) {
        const r = 0.9 + rnd() * 0.8;
        // The High Jump crane's pad stands here in the breakwater.
        // (Same five random draws as a placed boulder, so every other boulder keeps its shape.)
        if (Math.hypot(x - CRANE.base.x, z - CRANE.base.z) < 2.1) { for (let k = 0; k < 5; k++) rnd(); continue; }
        b.add(new THREE.DodecahedronGeometry(r, 0), rnd() > 0.5 ? "#8a8d89" : "#777b78", [x + rnd() * 0.6, LAND_Y + 0.1 + r * 0.35, z + rnd() * 0.6], [rnd() * 3, rnd() * 3, 0], [1, 0.72, 1]);
      }
    }
    // The breakwater meets the lagoon as a rubble slope: one row of boulders at the waterline.
    for (const i of [9, 10, 11]) {
      const a = out[i], c = out[(i + 1) % out.length], n = edgeNormal(a, c);
      for (let t = 0; t <= 1; t += 1.9 / n.l) {
        const px = a.x + (c.x - a.x) * t, pz = a.z + (c.z - a.z) * t, r = 0.8 + rnd() * 0.4;
        b.add(new THREE.DodecahedronGeometry(r, 0), "#7a7f7b", [px + n.nx * 0.2 + (rnd() - 0.5) * 0.4, 0.15 + rnd() * 0.25, pz + n.nz * 0.2 + (rnd() - 0.5) * 0.4], [rnd() * 3, rnd() * 3, 0], [1.1, 0.75, 1.1]);
      }
    }
    for (const x of [SEA_GATE.minX - 0.2, SEA_GATE.maxX + 0.2]) b.box(0.8, 5.4, 0.8, x, -3.2, -14.4, "#8a8d89");
    b.box(SEA_GATE.maxX - SEA_GATE.minX + 1.4, 0.4, 0.9, (SEA_GATE.minX + SEA_GATE.maxX) / 2, 2.2, -14.4, "#6f7471");
    for (let x = SEA_GATE.minX + 0.2; x < SEA_GATE.maxX; x += 0.42) b.box(0.03, 5.2, 0.03, x, -3.2, -14.4, "#2b3a40");
    for (let y = -3; y < 2; y += 0.5) b.box(SEA_GATE.maxX - SEA_GATE.minX, 0.03, 0.03, (SEA_GATE.minX + SEA_GATE.maxX) / 2, y, -14.4, "#2b3a40");
    // The care pontoon: floats, deck, a rail on its far sides, buckets, a cooler and a toy basket.
    const P = PLATFORM;
    for (const [dx, dz] of [[-1.8, -1.1], [1.8, -1.1], [-1.8, 1.1], [1.8, 1.1]]) b.cylAt(0.38, 1.4, [P.x + dx, -0.05, P.z + dz], [Math.PI / 2, 0, 0], "#f2f2ee", 10);
    b.box(P.w, 0.22, P.d, P.x, P.top - 0.22, P.z, "#d6c7a8");
    for (const [x0, z0, x1, z1] of [[P.x + P.w / 2, P.z - P.d / 2, P.x + P.w / 2, P.z + P.d / 2], [P.x - P.w / 2, P.z - P.d / 2, P.x + P.w / 2, P.z - P.d / 2]]) {
      const l = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      b.boxAt(l, 0.06, 0.06, [(x0 + x1) / 2, P.top + 0.95, (z0 + z1) / 2], [0, ang, 0], "#e8590c");
      for (let p = 0; p <= 3; p++) b.box(0.06, 0.95, 0.06, x0 + (x1 - x0) * p / 3, P.top, z0 + (z1 - z0) * p / 3, "#f2f6f7");
    }
    for (const [dx, dz] of [[1.2, 0.9], [1.6, 0.4]]) b.cyl(0.2, 0.17, 0.4, P.x + dx, P.top, P.z + dz, "#2f7fd1", 10);
    b.box(0.9, 0.5, 0.55, P.x + 1.6, P.top, P.z - 1.1, "#f4f6f8");
    b.box(0.8, 0.4, 0.6, P.x + 0.4, P.top, P.z - 1.2, "#ffb347");
    for (const [dx, c] of [[0.2, "#ff5c5c"], [0.5, "#4dabf7"], [0.7, "#ffd43b"]] as const) b.sphere(0.16, P.x + dx, P.top + 0.5, P.z - 1.2, c, [1, 1, 1], 8);
    // The beach: umbrellas, loungers, a lifebuoy post.
    for (const [x, z, c] of [[-26, 6, "#ff5c5c"], [-23.5, 2.5, "#4dabf7"]] as const) {
      const y = lagoonGround(x, z);
      b.cyl(0.04, 0.04, 2.4, x, y, z, "#f4f4f4", 6);
      b.add(new THREE.ConeGeometry(1.4, 0.55, 8, 1, true), c, [x, y + 2.45, z]);
      b.box(0.7, 0.18, 1.8, x + 1.4, y, z + 0.6, "#f4f4f4");
    }
    b.cyl(0.05, 0.05, 1.6, -12, lagoonGround(-12, 11.5), 11.5, "#c0392b", 6);
    b.add(new THREE.TorusGeometry(0.32, 0.09, 6, 14), "#ff8a3d", [-12, lagoonGround(-12, 11.5) + 1.3, 11.6]);
    // Palms and bushes round the lagoon.
    for (const [x, z, h, lean] of [[-27, 9.5, 6, 1], [-29, 1, 6.5, -1], [-9.5, 17.5, 5.5, 1], [21.5, 14, 6.2, -1], [26, 6.5, 6.8, 1], [27, -3, 6, -1], [25, -12, 6.6, 1], [-41, 1.5, 6.3, 1], [-42, -12, 6, -1], [-18, -15.5, 5.6, 1], [31, -16, 6, -1], [-33, 12, 6.2, -1]] as const) palm(b, x, z, h, lean);
    for (const [x, z, r] of [[-36, 8, 1.1], [-31, 14, 1.3], [24, 17, 1.2], [29, 10, 1.4], [-24, -16, 1], [33, 1, 1.2], [-14, 18, 0.9], [14, 21, 1.1]] as const) b.add(new THREE.DodecahedronGeometry(r, 0), "#4f8f45", [x, lagoonGround(x, z) + r * 0.5, z], [x, z, 0], [1, 0.75, 1]);
    return b.build();
  }, []);
  const glass = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d9f6ff", transparent: true, opacity: 0.1, depthWrite: false }), []);
  const W = GALLERY.window;
  return (
    <group>
      <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />
      <mesh position={[(W.minX + W.maxX) / 2, (W.top + W.bottom) / 2, GALLERY.z + 0.3]} material={glass} renderOrder={5} raycast={() => undefined}>
        <planeGeometry args={[W.maxX - W.minX, W.top - W.bottom]} />
      </mesh>
    </group>
  );
}

/** Headlands, a lighthouse, islands and far mountains (fogged into the haze). */
function Scenery() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    const hill = (x: number, z: number, r: number, h: number, c: string, seg = 9) => b.add(new THREE.ConeGeometry(r, h, seg, 1), c, [x, h / 2 - 1.5, z], [0, x * 0.1, 0], [1, 1, 0.8]);
    for (const [x, z, r, h] of [[-150, -120, 60, 46], [-95, -170, 55, 34], [-200, -60, 70, 58], [-120, -60, 32, 22]] as const) hill(x, z, r, h, "#5b8d55");
    for (const [x, z, r, h] of [[-130, -100, 30, 30], [-88, -140, 24, 20]] as const) hill(x, z, r, h, "#7d847c", 6);
    for (const [x, z, r, h] of [[140, -150, 50, 34], [190, -90, 62, 44], [100, -190, 30, 18]] as const) hill(x, z, r, h, "#678f58");
    hill(125, -160, 22, 30, "#878c84", 6);
    // The lighthouse on the right headland.
    b.cyl(2.2, 2.8, 16, 128, 26, -158, "#f4f4f0", 12);
    for (const y of [30, 36]) b.cyl(2.25, 2.35, 2, 128, y, -158, "#d63a3a", 12);
    b.cyl(1.6, 1.6, 2.4, 128, 42, -158, "#ffe9a8", 10);
    b.cone(2.2, 2.2, 128, 44.4, -158, "#d63a3a", 10);
    for (const [x, z, r] of [[-40, -330, 34], [60, -420, 46], [230, -360, 30], [-260, -380, 40]] as const) { hill(x, z, r, r * 0.35, "#6f9a68", 10); }
    for (const [x, z, r, h] of [[-420, -760, 160, 120], [-150, -820, 130, 90], [180, -800, 170, 110], [460, -720, 150, 100]] as const) hill(x, z, r, h, "#9fb7c6", 7);
    // Small far sailboats are separate (they move).
    return b.build();
  }, []);
  return <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />;
}

function Boats() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    b.box(4.6, 0.9, 1.6, 0, -0.3, 0, "#f4f4f0");
    b.box(4.8, 0.18, 1.7, 0, 0.5, 0, "#2f8f9d");
    b.cyl(0.07, 0.07, 6.5, 0.3, 0.6, 0, "#d9d2c4", 6);
    b.add(new THREE.ConeGeometry(2, 5.8, 3), "#ffffff", [-0.7, 3.6, 0], [0, Math.PI / 2, 0], [0.9, 1, 0.08]);
    return b.build();
  }, []);
  const a = useRef<THREE.Mesh>(null), c = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!lagoonShown()) return;
    const t = shaderTime.value;
    if (a.current) { a.current.position.set(((t * 1.1) % 600) - 300, Math.sin(t * 0.8) * 0.15, -170); a.current.rotation.z = Math.sin(t * 0.6) * 0.04; }
    if (c.current) { c.current.position.set(260 - ((t * 0.8) % 560), Math.sin(t * 0.7 + 1) * 0.15, -265); c.current.rotation.set(0, Math.PI, Math.sin(t * 0.5) * 0.04); }
  });
  return (
    <>
      <mesh ref={a} geometry={geo} material={smoothMat} scale={1.4} raycast={() => undefined} />
      <mesh ref={c} geometry={geo} material={smoothMat} scale={1.1} raycast={() => undefined} />
    </>
  );
}

// ------------------------------------------------------------------ signs and rewards

function Signs() {
  const deck = signMaterial("OBSERVATION DECK\nてんぼう デッキ", "#7a5636", "#fff4d6", 800, 240);
  const care = signMaterial("CARE TEAM\nケア チーム", "#e8590c", "#ffffff", 640, 220);
  const inside = signMaterial("BOTTLENOSE DOLPHINS\nハンドウイルカ", "#10324a", "#bff0ff", 900, 240);
  return (
    <group>
      <mesh position={[-18.5, DECK.top + 1.55, DECK.minZ - 0.05]} rotation={[0, Math.PI, 0]} material={deck} raycast={() => undefined}><planeGeometry args={[3.4, 1.02]} /></mesh>
      <mesh position={[PLATFORM.x + PLATFORM.w / 2 + 0.05, PLATFORM.top + 1.3, PLATFORM.z]} rotation={[0, Math.PI / 2, 0]} material={care} raycast={() => undefined}><planeGeometry args={[1.9, 0.65]} /></mesh>
      <mesh position={[9, GALLERY.ceiling - 0.35, GALLERY.back - 0.02]} rotation={[0, Math.PI, 0]} material={inside} raycast={() => undefined}><planeGeometry args={[4.2, 1.12]} /></mesh>
    </group>
  );
}

/** A stable empty list (a selector must not return a new array each call). */
const NO_DECOR: string[] = [];

function Rewards() {
  const decor = useGame((s) => s.model.progress.lagoon?.decor ?? NO_DECOR);
  const key = decor.join(",");
  const geo = useMemo(() => {
    const b = new PartBuilder(0.3);
    const has = (k: string) => key.split(",").includes(k);
    if (has("arch")) {
      // The opening decoration: a white arch over the boardwalk with bunting and balloons.
      const ax = -2.5, az = 18.6, span = 3.3;
      for (const s of [-1, 1]) { b.box(0.45, 4.4, 0.45, ax + s * span, LAND_Y, az, "#f4f4f0"); b.box(0.7, 0.3, 0.7, ax + s * span, LAND_Y, az, "#2f8f9d"); }
      b.add(new THREE.TorusGeometry(span, 0.22, 8, 24, Math.PI), "#2f8f9d", [ax, LAND_Y + 4.4, az], [0, 0, 0]);
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (k + 0.5) / 9, x = ax + Math.cos(a) * span * 0.98, y = LAND_Y + 4.4 + Math.sin(a) * span * 0.98;
        b.add(new THREE.ConeGeometry(0.2, 0.45, 3), ["#ff5c8a", "#ffd23f", "#4cd27a", "#4aa3ff"][k % 4], [x, y - 0.42, az + 0.25], [Math.PI, 0, 0], [1, 1, 0.2]);
      }
      for (const [x, c] of [[ax - span - 0.5, "#ff5c8a"], [ax - span - 0.1, "#ffd23f"], [ax + span + 0.1, "#4aa3ff"], [ax + span + 0.5, "#4cd27a"]] as const) {
        b.sphere(0.34, x, LAND_Y + 5.3, az - 0.1, c, [1, 1.18, 1], 10);
        b.box(0.02, 1.0, 0.02, x, LAND_Y + 4.3, az - 0.1, "#f4f4f4");
      }
    }
    if (has("telescopes")) {
      for (const x of [-21, -18.5, -16]) {
        b.cyl(0.07, 0.12, 1.0, x, DECK.top, DECK.minZ + 0.5, "#2f4f66", 8);
        b.add(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 10), "#e0b030", [x, DECK.top + 1.15, DECK.minZ + 0.42], [Math.PI / 2 - 0.25, 0, 0]);
      }
    }
    return b.build();
  }, [key]);
  const fountain = decor.includes("fountain");
  return (
    <group>
      <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />
      {fountain && <Fountain />}
    </group>
  );
}

/** The fourth milestone's reward: two stone dolphins leaping over a basin of jets. */
function Fountain() {
  const stone = useMemo(() => cetaceanGeometry({ kind: "dolphin", length: 1.8, fin: "dolphin" }), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#cfd8dc" }), []);
  const basin = useMemo(() => {
    const b = new PartBuilder(0);
    b.cyl(2.2, 2.4, 0.6, 0, 0, 0, "#d8cfc0", 24);
    b.cyl(1.95, 1.95, 0.05, 0, 0.56, 0, "#5cc8e6", 24);
    b.cyl(0.35, 0.5, 1.2, 0, 0.5, 0, "#d8cfc0", 12);
    return b.build();
  }, []);
  const jets = useRef<THREE.Mesh>(null);
  useFrame(() => { if (jets.current) jets.current.scale.y = 0.9 + Math.sin(shaderTime.value * 6) * 0.1; });
  const at: [number, number, number] = [-8.5, LAND_Y + 0.15, 17.4];
  return (
    <group position={at}>
      <mesh geometry={basin} material={smoothMat} raycast={() => undefined} />
      <mesh geometry={stone} material={mat} position={[-0.7, 2.1, 0]} rotation={[0, Math.PI / 2, 0.9]} raycast={() => undefined} />
      <mesh geometry={stone} material={mat} position={[0.7, 2.1, 0]} rotation={[0, -Math.PI / 2, 0.9]} raycast={() => undefined} />
      <mesh ref={jets} position={[0, 1.8, 0]} raycast={() => undefined}>
        <coneGeometry args={[0.32, 1.4, 10, 1, true]} />
        <meshBasicMaterial color="#d6f6ff" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ dolphins, toys, feeding

const DOLPHIN_LEN = 2.6;
const ringMat = new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.9, depthTest: false });
const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 28);

function Dolphin({ id, index }: { id: string; index: number }) {
  const geo = useMemo(() => cetaceanGeometry({ kind: "dolphin", length: DOLPHIN_LEN, fin: "dolphin" }), []);
  const mat = useMemo<CetaceanMaterial>(() => createCetaceanMaterial("dolphin", DOLPHIN_LEN), []);
  const root = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null), tag = useRef<THREE.Sprite>(null);
  const def = DOLPHINS.find((d) => d.id === id)!;
  useFrame(() => {
    const pod = lagoonRt.pod, r = root.current;
    const m = pod?.byId(id);
    if (!m || !r) return;
    const feeding = feedingPose(id);
    r.position.set(m.x, m.y, m.z);
    r.rotation.set(-m.pitch - feeding.pitch, m.yaw, m.roll, "YXZ");
    r.scale.setScalar(m.size);
    const u = mat.uniforms;
    u.uPhase.value = m.phase;
    u.uAmp.value = m.amp + feeding.happy * 0.12;
    u.uTurn.value = THREE.MathUtils.clamp(m.turn, -0.9, 0.9);
    u.uArch.value = m.arch;
    u.uJaw.value = feeding.jaw;
    u.uFlap.value = 0.25 + (1 - Math.min(1, m.speed / 2)) * 0.5 + feeding.happy * 0.35;
    // From above the water surface already tints them; keep them readable.
    u.uWater.value = underwaterNow() ? 0.45 : 0.55;
    if (ring.current) {
      ring.current.visible = lagoonFocus.id === id;
      ring.current.position.set(m.x, Math.max(m.y, -0.3) + 0.9, m.z);
      ring.current.scale.setScalar(0.9 + Math.sin(rt.time * 4) * 0.06);
    }
    if (tag.current) {
      tag.current.visible = lagoonFocus.numbers;
      tag.current.position.set(m.x, Math.max(0.6, m.y + 1.6), m.z);
      if (lagoonFocus.numbers) tag.current.material = numberMat(index + 1);
    }
  });
  return (
    <>
      <group ref={root} name={`lagoon-dolphin-${id}`}>
        <mesh geometry={geo} material={mat} onClick={tap(() => tapDolphin(id))} />
      </group>
      <mesh ref={ring} geometry={ringGeo} material={ringMat} rotation={[Math.PI / 2, 0, 0]} visible={false} renderOrder={12} raycast={() => undefined} />
      <sprite ref={tag} scale={[1.5, 1.5, 1]} visible={false} renderOrder={13} raycast={() => undefined} name={`lagoon-tag-${def.id}`} />
    </>
  );
}

const numberTex = new Map<number, THREE.SpriteMaterial>();
function numberMat(n: number) {
  let m = numberTex.get(n);
  if (!m) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffcf3f"; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = "#ffffff"; g.stroke();
    g.fillStyle = "#3b2a00"; g.font = "900 78px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: t, depthTest: false });
    numberTex.set(n, m);
  }
  return m;
}

function Toys() {
  const ball = useRef<THREE.Mesh>(null), kelp = useRef<THREE.Group>(null), ringRef = useRef<THREE.InstancedMesh>(null);
  const hands = useRef<THREE.Mesh>(null);
  const handGeo = useMemo(() => {
    const b = new PartBuilder(0);
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(1, 10, 6), "#f2be91", [side * 0.25, -0.24, 0.05], [0, 0, side * 0.3], [0.19, 0.12, 0.24]);
      b.add(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 8), "#47a7bb", [side * 0.29, -0.47, 0.13], [0.3, 0, side * 0.18]);
    }
    return b.build();
  }, []);
  const ballGeo = useMemo(() => {
    const b = new PartBuilder(0);
    const cols = ["#ff5c5c", "#ffffff", "#4dabf7", "#ffd43b", "#ffffff", "#4cd27a"];
    for (let k = 0; k < 6; k++) b.add(new THREE.SphereGeometry(0.34, 12, 8, (k / 6) * Math.PI * 2, Math.PI / 3), cols[k], [0, 0, 0], [0, 0, 0], [1, 1, 1], { vary: false });
    return b.build();
  }, []);
  const kelpGeo = useMemo(() => {
    const b = new PartBuilder(0);
    for (let k = 0; k < 5; k++) b.add(new THREE.BoxGeometry(0.16, 0.025, 1.6 + k * 0.15), k % 2 ? "#4f8a3a" : "#6aa84f", [(k - 2) * 0.12, 0, Math.sin(k) * 0.2], [0, (k - 2) * 0.25, 0]);
    return b.build();
  }, []);
  const fx = useFx();
  const acc = useRef(0);
  useFrame((_, dt) => {
    const toy = lagoonRt.toy;
    if (hands.current) hands.current.visible = toy?.kind === "ball" && toy.state === "held";
    if (ball.current) {
      ball.current.visible = Boolean(toy && toy.kind === "ball");
      if (toy && toy.kind === "ball") {
        // Floating: half in the water with a gentle bob; in the air: its true height, spinning with travel.
        const bob = toy.y === 0 ? Math.sin(rt.time * 2) * 0.03 : 0;
        ball.current.position.set(toy.x, toy.y + 0.12 + bob, toy.z);
        ball.current.rotation.set(toy.z * 0.9, 0, -toy.x * 0.9);
        ball.current.scale.setScalar(toy.state === "held" ? 1.2 : 1);
      }
    }
    if (kelp.current) {
      kelp.current.visible = Boolean(toy && toy.kind === "kelp");
      if (toy && toy.kind === "kelp") { kelp.current.position.set(toy.x, toy.y + 0.03, toy.z); kelp.current.rotation.y = Math.sin(rt.time * 0.8) * 0.3 + (toy.carriedBy ? lagoonRt.pod?.byId(toy.carriedBy)?.yaw ?? 0 : 0); }
    }
    const bubbling = lagoonRt.time < lagoonRt.bubblesUntil;
    const ring = ringRef.current;
    if (ring) {
      ring.visible = bubbling;
      if (bubbling) {
        // The ring of bubbles shimmers, turns slowly and keeps re-forming (each bubble drifts up a little and resets).
        const t = rt.time;
        for (let i = 0; i < RING_BUBBLES; i++) {
          const a = (i / RING_BUBBLES) * Math.PI * 2 + t * 0.22 + Math.sin(i * 7.1) * 0.05;
          const cycle = (t * 0.35 + i * 0.137) % 1;
          const rr = RING.r + Math.sin(t * 3 + i * 1.7) * 0.05;
          ringDummy.position.set(Math.cos(a) * rr, Math.sin(a) * rr + cycle * 0.12, Math.sin(t * 2.3 + i) * 0.05);
          ringDummy.scale.setScalar((0.06 + ((i * 37) % 10) / 160) * (1 - cycle * 0.35));
          ringDummy.updateMatrix();
          ring.setMatrixAt(i, ringDummy.matrix);
        }
        ring.instanceMatrix.needsUpdate = true;
      }
    }
    if (bubbling && fx.current) {
      acc.current += dt;
      // A few bubbles rise from the top of the ring.
      if (acc.current > 0.25) { acc.current = 0; fx.current.bubbles(O.x + RING.x, RING.y + RING.r, O.z + RING.z, 2); }
    }
  });
  return (
    <group>
      <mesh ref={ball} geometry={ballGeo} material={smoothMat} visible={false} onClick={tap(holdLagoonBall)} />
      <mesh ref={hands} geometry={handGeo} material={smoothMat} visible={false} position={[BALL_HELD.x, BALL_HELD.y + 0.12, BALL_HELD.z]} raycast={() => undefined} />
      {/* Raycast-only water target, with no rendered draw call. Runtime clamps to the lagoon outline. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => {
        if (e.delta > 8 || lagoonRt.toy?.state !== "held") return;
        const x = e.point.x - O.x, z = e.point.z - O.z;
        if (!pointInPolygon(LAGOON_DOMAIN.outline, x, z)) return;
        // A paused catch must let the existing dolphin/question handlers receive
        // the tap underneath this invisible water target.
        if (throwLagoonBall(x, z)) e.stopPropagation();
      }}>
        <planeGeometry args={[110, 80]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
      <group ref={kelp} visible={false}><mesh geometry={kelpGeo} material={smoothMat} raycast={() => undefined} /></group>
      {/* The ring stands upright, its opening facing along RING.yaw (local z). */}
      <group position={[RING.x, RING.y, RING.z]} rotation={[0, RING.yaw, 0]}>
        <instancedMesh ref={ringRef} args={[ringBubbleGeo, ringBubbleMat, RING_BUBBLES]} visible={false} frustumCulled={false} renderOrder={6} raycast={() => undefined} />
      </group>
    </group>
  );
}

const RING_BUBBLES = 46;
const ringBubbleGeo = new THREE.SphereGeometry(1, 8, 6);
const ringBubbleMat = new THREE.MeshBasicMaterial({ color: "#e9fbff", transparent: true, opacity: 0.8, depthWrite: false });
const ringDummy = new THREE.Object3D();

/** Exactly one fish in flight, aimed at the waiting dolphin's mouth. */
function FeedFish() {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    b.add(new THREE.SphereGeometry(1, 8, 5), "#d2e3e8", [0, 0, 0], [0, 0, 0], [0.07, 0.055, 0.19], { vary: false });
    b.add(new THREE.ConeGeometry(0.09, 0.12, 3), "#9aaebc", [0, 0, -0.2], [-Math.PI / 2, 0, 0], [1, 0.7, 1], { vary: false });
    return b.build();
  }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const feed = lagoonRt.feeding, fish = feed.fish;
    m.visible = feed.phase === "throwing" && Boolean(fish && !fish.caught);
    if (!m.visible || !fish) return;
    const t = THREE.MathUtils.clamp((lagoonRt.time - fish.start) / fish.duration, 0, 1);
    const { from, to } = fish;
    m.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + 4 * t * (1 - t) * fish.arc, from.z + (to.z - from.z) * t);
    direction.set(to.x - from.x, to.y - from.y + 4 * (1 - 2 * t) * fish.arc, to.z - from.z).normalize();
    m.quaternion.setFromUnitVectors(forward, direction);
    m.scale.setScalar(fish.id === "mimi" ? 0.7 : 1);
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} visible={false} raycast={() => undefined} name="lagoon-feed-fish" />;
}

// ------------------------------------------------------------------ the High Jump crane

const cranePaint = { white: "#f2f6f7", teal: "#2f8f9d", dark: "#2f4f66", concrete: "#b9b2a4", orange: "#ff8a3d" };

/** A thin straight member between two points (local metres). */
function strut(b: PartBuilder, a: THREE.Vector3, c: THREE.Vector3, w: number, color: string) {
  const d = c.clone().sub(a), l = d.length();
  const g = new THREE.BoxGeometry(w, l, w);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  b.add(g, color, a.clone().add(c).multiplyScalar(0.5).toArray() as [number, number, number]);
}

/**
 * A slim lattice jib crane on a concrete pad in the breakwater. Its jib slews
 * out over the water and lowers a soft, striped buoy for the High Jump, then
 * swings back along the breakwater with the buoy reeled up (jumpRt drives it).
 * Four draws: the tower, the slewing jib, the cable and the buoy.
 */
function Crane() {
  const C = CRANE, top = C.jibY;
  const tower = useMemo(() => {
    const b = new PartBuilder(0.3);
    const ground = lagoonGround(C.base.x, C.base.z);
    b.box(2.6, C.padTop - ground + 0.5, 2.6, C.base.x, ground - 0.5, C.base.z, cranePaint.concrete);
    b.box(2.8, 0.12, 2.8, C.base.x, C.padTop - 0.06, C.base.z, "#cfc8b9");
    // Lattice mast: corner posts, rings and cross braces, white with teal bands.
    const h0 = C.padTop, h1 = top - 0.55, half = 0.3;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) b.box(0.08, h1 - h0, 0.08, C.base.x + sx * half, h0, C.base.z + sz * half, cranePaint.white);
    const rings = 7;
    for (let k = 0; k <= rings; k++) {
      const y = h0 + (h1 - h0) * k / rings;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [cx, cz] = corners[(i + 1) % 4];
        strut(b, new THREE.Vector3(C.base.x + ax * half, y, C.base.z + az * half), new THREE.Vector3(C.base.x + cx * half, y, C.base.z + cz * half), 0.05, k % 2 ? cranePaint.teal : cranePaint.white);
        if (k < rings) {
          const y2 = h0 + (h1 - h0) * (k + 1) / rings;
          strut(b, new THREE.Vector3(C.base.x + ax * half, y, C.base.z + az * half), new THREE.Vector3(C.base.x + cx * half, y2, C.base.z + cz * half), 0.035, cranePaint.white);
        }
      }
    }
    b.cyl(0.5, 0.5, 0.2, C.base.x, h1, C.base.z, cranePaint.dark, 16);
    return b.build();
  }, [C, top]);
  const jib = useMemo(() => {
    // Built along local +z from the mast axis; the group turns it (jibYaw).
    const b = new PartBuilder(0);
    const y = top - 0.25, L = C.jibLength;
    b.cyl(0.45, 0.45, 0.18, 0, top - 0.37, 0, cranePaint.teal, 16);
    b.box(0.9, 0.85, 1.0, -0.75, top - 0.2, -0.1, cranePaint.white);
    b.box(0.92, 0.32, 0.6, -0.75, top + 0.15, 0.2, "#9fd3e0");
    // Triangular jib: two lower chords and a top chord with zig-zag lacing.
    const lo = [new THREE.Vector3(-0.22, y, 0), new THREE.Vector3(0.22, y, 0)];
    const hi = (z: number) => new THREE.Vector3(0, y + 0.42 * (1 - z / (L + 0.6)), z);
    for (const p of lo) strut(b, p, new THREE.Vector3(p.x, y, L), 0.07, cranePaint.white);
    strut(b, hi(0), hi(L), 0.06, cranePaint.white);
    for (let z = 0; z < L - 0.2; z += 0.8) for (const p of lo) {
      strut(b, new THREE.Vector3(p.x, y, z), hi(z + 0.4), 0.035, cranePaint.teal);
      strut(b, hi(z + 0.4), new THREE.Vector3(p.x, y, z + 0.8), 0.035, cranePaint.teal);
    }
    // Counter-jib, its weights, a short tower top and the pendant lines to the jib.
    strut(b, new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y, -3.2), 0.12, cranePaint.white);
    b.box(0.9, 0.7, 0.9, 0, y - 0.45, -3.05, "#7d8a91");
    const peak = new THREE.Vector3(0, top + 1.5, 0);
    strut(b, new THREE.Vector3(0, top - 0.3, 0), peak, 0.09, cranePaint.white);
    strut(b, peak, hi(L * 0.72), 0.022, cranePaint.dark);
    strut(b, peak, new THREE.Vector3(0, y, -3.05), 0.022, cranePaint.dark);
    // Trolley over the buoy, and a tip lamp so the jib end reads at a distance.
    b.box(0.55, 0.22, 0.5, 0, y - 0.22, CRANE_REACH - 0.25, cranePaint.orange);
    b.sphere(0.1, 0, y + 0.1, L, cranePaint.orange, [1, 1, 1], 8);
    return b.build();
  }, [C, top]);
  const buoyGeo = useMemo(() => {
    const b = new PartBuilder(0);
    const cols = ["#ff8a3d", "#ffffff", "#2f9fd0", "#ffffff"];
    for (let k = 0; k < 8; k++) b.add(new THREE.SphereGeometry(C.buoy.r, 14, 10, (k / 8) * Math.PI * 2, Math.PI / 4), cols[k % 4], [0, 0, 0], [0, 0, 0], [1, 1, 1], { vary: false });
    b.add(new THREE.TorusGeometry(C.buoy.r * 1.01, 0.05, 6, 20), "#ffd43b", [0, 0, 0], [Math.PI / 2, 0, 0]);
    b.add(new THREE.TorusGeometry(0.07, 0.025, 6, 10), cranePaint.dark, [0, C.buoy.r + 0.05, 0]);
    return b.build();
  }, [C]);
  const jibRef = useRef<THREE.Group>(null), cable = useRef<THREE.Mesh>(null), buoy = useRef<THREE.Mesh>(null);
  const fx = useFx();
  const seen = useRef({ touchAt: -100, phase: "idle" as string });
  const at = useMemo(() => ({ trolley: { x: 0, y: 0, z: 0 }, buoy: { x: 0, y: 0, z: 0 }, d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    if (!lagoonShown()) return;
    if (jibRef.current) jibRef.current.rotation.y = jibYaw();
    trolleyPoint(at.trolley); buoyPoint(at.buoy);
    const b = buoy.current, c = cable.current;
    if (b) {
      b.position.set(at.buoy.x, at.buoy.y, at.buoy.z);
      // A soft squash and bounce when the snout touches it.
      const since = lagoonRt.time - jumpRt.touchAt;
      const pop = since >= 0 && since < 0.8 ? Math.sin(since * 14) * Math.exp(-since * 4) * 0.22 : 0;
      b.scale.set(1 + pop, 1 - pop, 1 + pop);
      b.rotation.y = lagoonRt.time * 0.2;
    }
    if (c) {
      // From the trolley to the buoy's top eye.
      const top = { x: at.buoy.x, y: at.buoy.y + C.buoy.r + 0.08, z: at.buoy.z };
      at.d.set(top.x - at.trolley.x, top.y - (at.trolley.y - 0.25), top.z - at.trolley.z);
      const len = at.d.length();
      c.position.set((top.x + at.trolley.x) / 2, (top.y + at.trolley.y - 0.25) / 2, (top.z + at.trolley.z) / 2);
      c.quaternion.setFromUnitVectors(at.up, at.d.normalize());
      c.scale.set(1, Math.max(0.05, len), 1);
    }
    // Effects at the touch (a burst of spray off the buoy) and the re-entry (a second, wider splash ring).
    const f = fx.current, s = seen.current;
    if (f && jumpRt.touchAt !== s.touchAt && jumpRt.touchAt > 0) { f.spout(O.x + at.buoy.x, at.buoy.y - C.buoy.r, O.z + at.buoy.z, 0.9); audio.play("bubble"); }
    if (f && jumpRt.phase === "splash" && s.phase === "air") {
      const m = jumpRt.id ? lagoonRt.pod?.byId(jumpRt.id) : undefined;
      if (m) f.splash(O.x + m.x, 0, O.z + m.z, 3.6, 0, true);
    }
    s.touchAt = jumpRt.touchAt; s.phase = jumpRt.phase;
  });
  return (
    <group name="lagoon-crane">
      <mesh geometry={tower} material={smoothMat} raycast={() => undefined} name="lagoon-crane-tower" />
      <group ref={jibRef} position={[C.base.x, 0, C.base.z]} rotation={[0, C.parkedYaw, 0]}>
        <mesh geometry={jib} material={smoothMat} raycast={() => undefined} name="lagoon-crane-jib" />
      </group>
      <mesh ref={cable} raycast={() => undefined} name="lagoon-crane-cable">
        <cylinderGeometry args={[0.025, 0.025, 1, 6, 1]} />
        <meshLambertMaterial color="#26343c" />
      </mesh>
      <mesh ref={buoy} geometry={buoyGeo} material={smoothMat} raycast={() => undefined} name="lagoon-crane-buoy" />
    </group>
  );
}

// ------------------------------------------------------------------ "Look!"

function lookTexture(label: string, ja: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.beginPath(); g.roundRect(14, 22, 488, 196, 60); g.fill();
  g.fillStyle = "#ffcf3f";
  g.beginPath(); g.roundRect(8, 10, 488, 196, 60); g.fill();
  g.lineWidth = 10; g.strokeStyle = "#ffffff"; g.stroke();
  g.beginPath(); g.moveTo(230, 206); g.lineTo(256, 250); g.lineTo(282, 206); g.fill();
  g.fillStyle = "#3b2a00"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "900 74px system-ui, sans-serif"; g.fillText("Look!", 252, 74);
  g.font = "800 38px system-ui, sans-serif"; g.fillText(label, 252, 140);
  g.font = "700 26px system-ui, sans-serif"; g.fillText(ja, 252, 180);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lookMats = new Map<string, THREE.SpriteMaterial>();

function LookBubble() {
  const ref = useRef<THREE.Sprite>(null);
  const [kind, setKind] = useState<string | null>(null);
  useFrame(() => {
    const s = ref.current;
    // Never over a question: one thing at a time.
    const g = getGame();
    const look = g.prompt || g.areaActivity || g.line ? null : lagoonRt.look;
    const k = look?.kind ?? null;
    if (k !== kind) setKind(k);
    if (!s || !look) return;
    const pod = lagoonRt.pod;
    // Follow the animal(s) it is about.
    const ms = look.ids.map((id) => pod?.byId(id)).filter(Boolean);
    const x = ms.length ? ms.reduce((a, m) => a + m!.x, 0) / ms.length : look.x;
    const z = ms.length ? ms.reduce((a, m) => a + m!.z, 0) / ms.length : look.z;
    const under = underwaterNow();
    const y = under ? Math.min(-0.8, (ms[0]?.y ?? -2) + 1.3) : 2.2;
    s.position.set(x, y + Math.sin(rt.time * 3) * 0.12, z);
    const d = Math.hypot(rt.camera.pos.x - (O.x + x), rt.camera.pos.y - y, rt.camera.pos.z - (O.z + z));
    const sc = THREE.MathUtils.clamp(d * 0.07, 1.4, 3.4);
    s.scale.set(sc * 2, sc, 1);
  });
  if (!kind) return null;
  let mat = lookMats.get(kind);
  if (!mat) {
    const t = lookText(kind as "pair");
    mat = new THREE.SpriteMaterial({ map: lookTexture(t.label, t.ja), depthTest: false });
    lookMats.set(kind, mat);
  }
  return <sprite ref={ref} material={mat} renderOrder={14} onClick={tap(tapLook)} name="lagoon-look" />;
}

// ------------------------------------------------------------------ people

interface Stroller { id: string; type: "child" | "adult" | "fan" | "grandma" | "explorer"; variant: number; t: number; dir: 1 | -1; stop: number; act: "look" | "photo" | "point"; nextStop: number }

function StrollFigure({ s, path, y, show }: { s: Stroller; path: { x: number; z: number }[]; y: number; show: () => boolean }) {
  const model = useMemo(() => tunnelPersonModel(s.type, s.variant), [s.type, s.variant]);
  const pose = useRef(newPose());
  const step = useRef(0);
  useFrame((_, dt) => {
    const q = pose.current;
    q.visible = show();
    if (!lagoonShown() || !q.visible) return;
    const seg = path.length - 1;
    const at = (t: number) => {
      const k = Math.min(seg - 1, Math.floor(t * seg)), f = t * seg - k;
      return { x: path[k].x + (path[k + 1].x - path[k].x) * f, z: path[k].z + (path[k + 1].z - path[k].z) * f };
    };
    if (rt.time < s.stop) {
      q.moving = false;
      q.yaw = Math.PI;
      q.arm += ((s.act === "point" ? 0.95 : s.act === "photo" ? 0.75 : 0) - q.arm) * Math.min(1, dt * 4);
      q.photo = s.act === "photo";
    } else {
      s.t += s.dir * dt * 0.022;
      if (s.t > 1) { s.t = 1; s.dir = -1; }
      if (s.t < 0) { s.t = 0; s.dir = 1; }
      if ((s.dir > 0 && s.t >= s.nextStop) || (s.dir < 0 && s.t <= s.nextStop)) {
        s.stop = rt.time + 4 + ((s.t * 97) % 4);
        s.act = (["look", "photo", "point"] as const)[Math.floor(s.t * 31) % 3];
        s.nextStop = Math.min(1, Math.max(0, s.t + s.dir * (0.25 + ((s.t * 13) % 0.2))));
      }
      const a = at(s.t), b = at(Math.min(1, Math.max(0, s.t + s.dir * 0.01)));
      q.moving = true;
      q.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      q.arm += (0 - q.arm) * Math.min(1, dt * 4);
      q.photo = false;
      step.current += dt * 6;
    }
    const p = at(s.t);
    q.x = p.x; q.z = p.z; q.step = step.current;
  });
  return <group position={[0, y, 0]}><TunnelFigure model={model} pose={pose} name={`lagoon-visitor-${s.id}`} /></group>;
}

function StandFigure({ id, type, variant, x, z, y, yaw, act, show }: { id: string; type: Stroller["type"]; variant: number; x: number; z: number; y: number; yaw: number; act: "look" | "photo" | "point" | "keeper"; show: () => boolean }) {
  const model = useMemo(() => tunnelPersonModel(type, variant), [type, variant]);
  const pose = useRef(newPose());
  useFrame((_, dt) => {
    const q = pose.current;
    q.visible = show();
    if (!q.visible) return;
    q.x = x; q.z = z; q.yaw = yaw; q.moving = false;
    const feed = lagoonRt.feeding;
    const age = lagoonRt.time - feed.phaseAt;
    // Reach down to prepare the bucket, wait with it, then make one clear
    // forward arm stroke per fish. The runtime owns all timing and contact.
    const keeperArm = feed.phase === "gathering" ? 0.22 + Math.sin(Math.min(1, age / 1.4) * Math.PI) * 0.3
      : feed.phase === "ready" ? 0.62
      : feed.phase === "throwing" ? 0.95 * Math.max(0, 1 - age / 0.5)
      : feed.phase === "catching" ? 0.18 : 0;
    const want = act === "keeper" ? keeperArm : act === "point" ? 0.95 * (0.5 + 0.5 * Math.sin(rt.time * 0.4 + x)) : act === "photo" ? 0.75 : 0;
    q.arm += (want - q.arm) * Math.min(1, dt * 4);
    q.photo = act === "photo";
    q.lookUp = act === "look" ? 0.3 : 0;
  });
  return <group position={[0, y, 0]}><TunnelFigure model={model} pose={pose} name={`lagoon-person-${id}`} /></group>;
}

const inGallery = () => lagoonShown() && getGame().lagoonView === "gallery";
const outside = () => lagoonShown() && getGame().lagoonView !== "gallery";

function People() {
  const strollers = useMemo<Stroller[]>(() => [
    { id: "b1", type: "adult", variant: 2, t: 0.15, dir: 1, stop: 0, act: "look", nextStop: 0.4 },
    { id: "b2", type: "child", variant: 3, t: 0.7, dir: -1, stop: 0, act: "point", nextStop: 0.45 }
  ], []);
  return (
    <>
      {strollers.map((s) => <StrollFigure key={s.id} s={s} path={BOARDWALK_PATH} y={LAND_Y + 0.15} show={outside} />)}
      <StandFigure id="d1" type="grandma" variant={1} x={DECK_SPOTS[0].x} z={DECK_SPOTS[0].z} y={DECK.top} yaw={Math.PI * 0.85} act="look" show={outside} />
      <StandFigure id="d2" type="child" variant={4} x={DECK_SPOTS[1].x} z={DECK_SPOTS[1].z} y={DECK.top} yaw={Math.PI * 0.8} act="point" show={outside} />
      <StandFigure id="g1" type="child" variant={1} x={GALLERY_SPOTS[0].x} z={GALLERY_SPOTS[0].z} y={GALLERY.floor} yaw={Math.PI} act="point" show={inGallery} />
      <StandFigure id="g2" type="adult" variant={0} x={GALLERY_SPOTS[1].x} z={GALLERY_SPOTS[1].z} y={GALLERY.floor} yaw={Math.PI} act="photo" show={inGallery} />
      <StandFigure id="keeper" type="explorer" variant={2} x={PLATFORM.x - 1.2} z={PLATFORM.z + 0.3} y={PLATFORM.top} yaw={-Math.PI / 2} act="keeper" show={outside} />
    </>
  );
}

// ------------------------------------------------------------------ the area

const fxPool: { current: FxPool | null } = { current: null };
/** Sun shafts in front of the gallery window (seen from under water). */
const SHAFTS = [{ x: 5, z: 4, w: 1.6 }, { x: 8.2, z: 1.5, w: 2.2 }, { x: 11.5, z: 5.2, w: 1.4 }, { x: 14, z: 0.5, w: 2 }, { x: 2, z: -1, w: 1.8 }];
const useFx = () => fxPool;

function Tick() {
  useFrame((_, dt) => {
    if (!lagoonShown()) { resetFeeding(); leaveHighJump(); return; }
    lagoonTick(Math.min(dt, 0.1));
    const fx = fxPool.current;
    for (let i = 0; i < lagoonRt.fx.length; i++) {
      const e = lagoonRt.fx[i];
      if (!fx) continue;
      const k = e.len / 2.6;
      if (e.kind === "breathe") fx.spout(O.x + e.x, 0.15, O.z + e.z, 1.1 * k);
      else if (e.kind === "splash") {
        const strength = e.strength ?? 0;
        fx.splash(O.x + e.x, 0, O.z + e.z, e.entry ? (0.9 + 2 * strength) * k : 1.4 * k, e.age, e.entry);
        if (e.entry) {
          audio.play("splash");
          // Existing audio layers: larger impacts add a low body hit and a spray tail.
          if (strength > 0.3) audio.play("gulp");
          if (strength > 0.55) audio.play("sprinkle");
        }
      }
      else if (e.kind === "dive") fx.splash(O.x + e.x, 0, O.z + e.z, 0.6 * k);
      // Through the bubble ring: a little burst of bubbles from the ring.
      else if (e.kind === "ring") fx.bubbles(O.x + e.x, e.y, O.z + e.z, 18);
    }
    lagoonRt.fx.length = 0;
  });
  return null;
}

export function DolphinLagoon() {
  const ref = useAreaGate(lagoonShown);
  useAtmosphere(lagoonShown, LAGOON_AIR, LAGOON_WATER, underwaterNow);
  const gulls = useMemo(() => ({ x: O.x - 4, z: O.z - 20 }), []);
  return (
    <group ref={ref} name="dolphin-lagoon">
      <Tick />
      <SkyDome look={LAGOON_AIR} hidden={underwaterNow} />
      <group position={[O.x, 0, O.z]}>
        <Terrain />
        <Structures />
        <Scenery />
        <Boats />
        <Signs />
        <Rewards />
        {DOLPHINS.map((d, i) => <Dolphin key={d.id} id={d.id} index={i} />)}
        <Toys />
        <Crane />
        <FeedFish />
        <People />
        <LookBubble />
        <LightShafts spots={SHAFTS} depth={6.5} active={underwaterNow} />
        <FishSchool centre={{ x: 9, z: 4.5 }} radius={4} depth={-4.6} n={22} active={underwaterNow} />
        <Sea />
      </group>
      <MarineFx pool={fxPool} active={lagoonShown} />
      <Gulls centre={gulls} active={() => lagoonShown() && !underwaterNow()} />
    </group>
  );
}
