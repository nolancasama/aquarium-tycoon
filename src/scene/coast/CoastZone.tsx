import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, updateModel, useGame } from "../../game/store";
import { effect, rt } from "../../game/runtime";
import { COAST_HALL } from "../../game/data/rooms";
import { COAST_HABITATS, EX_D, EX_W, EXHIBITS, GLASS_TOP, WALKWAY_D, WINDOW_Z, type CoastHabitat, type ExhibitDef } from "../../game/data/coast";
import { COAST_HABITATS_SHOWN, coastHabitatShown } from "../../game/data/release";
import { HABITAT_PAD, habitatOpen } from "../../game/logic/coast";
import { coastRt, drainSights, stepCoast } from "../../game/coast/coastRuntime";
import { checkCoastNow, coastFocus, coastKeeperTick, coastVisitorTick, setCoastView, tapCoastSign } from "../../game/flow/coast";
import { tapSlot } from "../../game/flow/actions";
import { tankAt } from "../../game/logic/model";
import { ITEM_ON } from "../../game/data/coast";
import type { CoastDecorKind } from "../../game/types";
import { PartBuilder } from "../partBuilder";
import { signMaterial, smoothMat, surfaceMaterial } from "../materials";
import { useAreaGate } from "../tunnel/wing";
import { newPose, TunnelFigure } from "../tunnel/TunnelFigure";
import { tunnelPersonModel } from "../models/people";
import { itemGeometry, otterParts, penguinBodyPitch, penguinFishGeometry, penguinParts, penguinRampGeometry, sealParts } from "./coastModels";
import type { Mover } from "../../game/coast/motion";
import { createPenguin, loadPenguin, type PenguinInstance } from "./penguinAsset";
import { CoastKeepers, cutStaffOpening } from "./CoastKeepers";
import { CoastGallery } from "./GalleryStructure";
import { PENGUIN_GALLERY } from "./coastGallery";
import { CoastCamera } from "./CoastCamera";
import { selectAnimal } from "../../game/flow/animalNames";
import { keeperRt } from "../../game/coast/keeper";

/**
 * The Coastal & Polar Zone: three cutaway exhibits behind one walkway. Each has
 * a rocky land shelf, a pool whose underwater part shows through the viewing
 * window, a ramp, islands, the player's items and the animals. Only drawn
 * while the zone is shown; the animals only move while it is.
 */

export const coastShown = () => { const g = getGame(); return g.screen === "game" && g.hall === COAST_HALL; };

function tap(fn: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    fn();
  };
}
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/** The expanded coast owns its frame; the neighbouring authored bays retain theirs. */
function exhibitFrame(ex: ExhibitDef) {
  return ex.id === "penguins"
    ? { width: ex.pool.maxX - ex.pool.minX + 0.4, back: ex.land.minZ - 0.4, front: ex.pool.maxZ + 0.15, bottom: ex.pool.floor }
    : { width: EX_W, back: -EX_D / 2, front: WINDOW_Z, bottom: 0 };
}

/** A solid ramp: its top follows the slope from the land edge down to the waterline; under it is rock. */
function rampGeometry(ex: ExhibitDef, i: number): THREE.BufferGeometry {
  const r = ex.ramps[i];
  const floor = ex.pool.floor, top = ex.land.y, water = ex.pool.surface - 0.05;
  // Solid right to its end, matching rampRect() in game/coast/motion.ts (swimmers keep out of it).
  const z0 = Math.min(r.top.z, ex.land.maxZ) - 0.4;
  const shape = new THREE.Shape();
  shape.moveTo(z0, floor);
  shape.lineTo(r.bottom.z, floor);
  shape.lineTo(r.bottom.z, water);
  shape.lineTo(r.top.z, top);
  shape.lineTo(z0, top);
  shape.closePath();
  const width = r.width ?? 1.5;
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // Shape (u, v) and extrusion w -> world (x = -w + centre + half width, y = v, z = u).
  const m = new THREE.Matrix4().set(0, 0, -1, r.top.x + width / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  g.applyMatrix4(m);
  return g;
}

/** Angular, flat-topped strata. All vertices stay inside the authored footprint. */
function coastStratum(rx: number, rz: number, height: number, phase = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 9; i++) {
    const a = i / 8 * Math.PI * 2;
    const r = 0.91 + Math.sin(i * 2.7 + phase) * 0.07;
    const x = Math.cos(a) * rx * r, z = Math.sin(a) * rz * r;
    if (!i) shape.moveTo(x, z); else shape.lineTo(x, z);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  // Shape xy becomes world xz, with extrusion up along y.
  g.rotateX(Math.PI / 2);
  g.translate(0, height, 0);
  return g;
}

/** Broken cliff slabs have sloping rims and uneven faces, rather than level bands. */
function cliffSlab(rx: number, rz: number, height: number, phase: number, snowDepth = 0): THREE.BufferGeometry {
  const outline = [[-0.96, -0.42], [-0.67, -0.96], [0.38, -1], [0.94, -0.66], [0.98, 0.31], [0.59, 0.91], [-0.12, 0.72], [-0.78, 0.96], [-1, 0.35]];
  const rim = outline.map(([x, z], i) => ({ x: x * rx, z: z * rz, y: height + Math.sin(i * 1.91 + phase) * 0.105 + x * Math.sin(phase) * 0.11 }));
  const vertices: number[] = [];
  const triangle = (a: number[], b: number[], c: number[]) => vertices.push(...a, ...b, ...c);
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i], c = rim[(i + 1) % rim.length];
    const aTop = [a.x, a.y, a.z], cTop = [c.x, c.y, c.z];
    const aBottom = [a.x, snowDepth ? a.y - snowDepth * (0.7 + (i % 3) * 0.2) : 0, a.z];
    const cBottom = [c.x, snowDepth ? c.y - snowDepth * (0.7 + ((i + 1) % 3) * 0.2) : 0, c.z];
    triangle([0, height, 0], cTop, aTop);
    triangle(aBottom, aTop, cTop);
    triangle(aBottom, cTop, cBottom);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Faceted ice with an uneven, broad underside, bounded by its swim obstacle. */
function iceKeel(radius: number, depth: number, phase: number): THREE.BufferGeometry {
  const vertices: number[] = [], count = 9;
  const ring = (i: number, lower: boolean) => {
    const a = i * Math.PI * 2 / count;
    const r = radius * (lower ? 0.58 + 0.12 * Math.sin(i * 2.3 + phase) : 0.94);
    return [Math.cos(a) * r, lower ? -depth * (0.65 + 0.2 * Math.sin(i * 1.7 + phase)) : 0, Math.sin(a) * r];
  };
  for (let i = 0; i < count; i++) {
    const a = ring(i, false), b = ring((i + 1) % count, false);
    const c = ring(i, true), d = ring((i + 1) % count, true);
    vertices.push(...a, ...c, ...b, ...b, ...c, ...d, ...c, 0, -depth * 0.8, 0, ...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Penguin-only Antarctic scenery, merged into the exhibit's one static draw. */
function penguinScenery(ex: ExhibitDef): THREE.BufferGeometry {
  const b = new PartBuilder(0.45), { land: l, pool: p } = ex;
  const frame = exhibitFrame(ex), depth = frame.front - frame.back;
  const rock = "#667d89", dark = "#425d68", snow = "#e7f0f1", ice = "#a1d3df";
  // Exposed shelf remains continuous and level; snow is thin, irregular ground cover.
  b.box(frame.width, l.y - p.floor, l.maxZ - frame.back, 0, p.floor, (l.maxZ + frame.back) / 2, rock);
  // The old 25 mm cover ended at exactly l.y, coplanar with the shelf's
  // entire top. Keep one ground surface; the separated snow patches supply relief.
  for (const [x, z, rx, rz] of [[-4.6, -3.85, 1.55, 0.52], [-2.5, -4.25, 2, 0.4], [0.4, -3.55, 1.25, 0.38], [4.75, -3.85, 1.35, 0.6], [1.7, -1.05, 1.35, 0.22]]) {
    b.add(coastStratum(rx * 1.55, rz * 1.4, 0.018, x), snow, [x * 1.55, l.y, z * 1.5]);
  }
  // Layered cliffs sit wholly behind the walkable shelf. Lower toward Seal Cove.
  const cliffs = [
    { x: -5.4, rx: 1.05, h: 4.05, cuts: [0, 0.52, 1] },
    { x: -3.6, rx: 1.6, h: 5.35, cuts: [0, 0.32, 0.73, 1] },
    { x: -1.0, rx: 1.7, h: 5.55, cuts: [0, 0.46, 0.68, 1] },
    { x: 1.55, rx: 1.75, h: 4.85, cuts: [0, 0.57, 1] },
    { x: 3.9, rx: 1.3, h: 4.35, cuts: [0, 0.3, 0.81, 1] },
    { x: 5.4, rx: 0.98, h: 3.9, cuts: [0, 0.61, 1] }
  ];
  for (let i = 0; i < cliffs.length; i++) {
    const cliff = cliffs[i];
    for (let k = 0; k < cliff.cuts.length - 1; k++) {
      const y = l.y + (cliff.h - l.y) * cliff.cuts[k] - (k ? 0.12 : 0);
      const height = (cliff.h - l.y) * (cliff.cuts[k + 1] - cliff.cuts[k]) + (k ? 0.12 : 0);
      const phase = i * 1.34 + k * 2.1;
      const x = cliff.x * 1.55 + Math.sin(phase) * 0.14;
      const rx = cliff.rx * 1.55 * (1 - k * 0.055), rz = 0.43 - (i + k) % 3 * 0.035;
      const z = frame.back - 0.13 + (k % 2) * 0.025;
      b.add(cutStaffOpening(cliffSlab(rx, rz, height, phase), x, y), (i + k) % 3 === 1 ? "#7d939f" : rock, [x, y, z]);
      if (k === cliff.cuts.length - 2 || (i + k) % 3 === 0) {
        // A slight overhang keeps snow drapes clear of the rock's coplanar faces.
        b.add(cutStaffOpening(cliffSlab(rx + 0.012, rz + 0.012, height + 0.018, phase, 0.15 + (i + k) % 3 * 0.065), x, y), snow, [x, y, z]);
      }
      if (k === 1 && i % 2 === 0) b.add(new THREE.ConeGeometry(0.045, 0.32, 4), ice, [x + 0.4, y + height - 0.23, frame.back + 0.28], [0, 0, Math.PI]);
    }
  }
  // Back and side faces continue below the water. Their relief stays outside the swim bounds.
  for (const side of [-1, 1]) {
    b.box(0.4, GLASS_TOP - p.floor, depth, side * (frame.width / 2 + 0.15), p.floor, (frame.back + frame.front) / 2, rock);
    for (let i = 0; i < 5; i++) {
      const z = p.minZ + 0.8 + i * 2.4;
      b.add(new THREE.SphereGeometry(0.6, 10, 7), i % 2 ? "#587781" : dark, [side * (p.maxX + 0.03), p.floor + 0.35 + i % 3 * 0.55, z], [0, i * 0.7, 0], [0.45, 0.65 + i % 2 * 0.25, 1.5]);
    }
  }
  for (let i = 0; i < 10; i++) {
    b.add(new THREE.SphereGeometry(0.65, 10, 7), i % 2 ? rock : dark, [-9.1 + i * 2.02, p.floor + 0.4 + i % 3 * 0.6, p.minZ - 0.35], [0, i * 0.65, 0], [1.6, 0.7, 0.5]);
  }
  // A low, uneven rocky floor and broad colour changes suggest depth without fog.
  b.box(frame.width, 0.2, p.maxZ - p.minZ + 0.2, 0, p.floor - 0.2, (p.minZ + p.maxZ) / 2, "#60848a");
  for (let i = 0; i < 15; i++) {
    const x = -8.3 + i % 5 * 4.15, z = p.minZ + 1.5 + Math.floor(i / 5) * 4.2;
    b.add(coastStratum(1.7, 1.35, 0.025 + i % 3 * 0.018, i), i % 3 === 0 ? "#779a9c" : i % 3 === 1 ? "#527780" : "#67888a", [x, p.floor, z]);
  }
  // Shelf rocks are the same footprints avoided by land movement.
  for (const o of ex.boulders) b.add(new THREE.DodecahedronGeometry(o.r, 0), rock, [o.x, l.y + o.h * 0.35, o.z], [o.x, o.z, 0], [1, o.h / o.r * 0.7, 1]);
  // Low resting shelves: sloped sides and flat snow caps match ledge climb data.
  for (const ledge of ex.ledges ?? []) {
    const h = ledge.top - l.y;
    // The snow is the only top cap (both solid cylinders previously ended at ledge.top).
    b.add(new THREE.CylinderGeometry(ledge.r * 0.55, ledge.r, h, 8, 1, true), rock, [ledge.x, l.y + h / 2, ledge.z]);
    b.add(new THREE.CylinderGeometry(ledge.r * 0.55, ledge.r * 0.55, 0.035, 8), snow, [ledge.x, ledge.top - 0.0175, ledge.z]);
  }
  // A rocky undercut tapers below the island, leaving open water above the floor.
  for (const isl of ex.islands) {
    const topRadius = isl.topRadius ?? isl.r * 0.55;
    b.add(iceKeel(isl.r, 2.15, isl.x), rock, [isl.x, p.surface, isl.z]);
    b.add(new THREE.CylinderGeometry(topRadius, isl.r, isl.top - p.surface, 8, 1, true), ice, [isl.x, (isl.top + p.surface) / 2, isl.z]);
    b.add(new THREE.CylinderGeometry(topRadius, topRadius, 0.035, 8), snow, [isl.x, isl.top - 0.0175, isl.z]);
  }
  // Low rounded boulders and submerged ledges are bounded by the swim footprints.
  for (const o of ex.swimObstacles ?? []) {
    if (o.kind === "ice") {
      b.add(iceKeel(o.r, 0.5, o.x), "#83bdce", [o.x, o.top, o.z]);
      b.add(coastStratum(o.r * 0.93, o.r * 0.9, 0.08, o.x), ice, [o.x, o.top - 0.08, o.z]);
    } else {
      const shelf = o.z - o.r < l.maxZ + 0.2;
      b.add(new THREE.SphereGeometry(1, 12, 8), dark, [o.x, p.floor + (o.top - p.floor) * (shelf ? 0.28 : 0.35), o.z], [0, o.x, 0], [o.r * 0.94, (o.top - p.floor) * (shelf ? 0.55 : 0.65), o.r * 0.88]);
      if (shelf) b.add(coastStratum(o.r * 0.96, o.r * 0.94, 0.32, o.x), rock, [o.x, o.top - 0.32, o.z]);
    }
  }
  // The shore is the centrepiece: one broad, shallow continuous slope, with gravel and upper snow.
  for (let i = 0; i < ex.ramps.length; i++) {
    const r = ex.ramps[i], width = r.width ?? 1.5;
    b.add(penguinRampGeometry(ex, i), rock, [0, 0, 0]);
    b.add(penguinRampGeometry(ex, i, true), "#cbdfe2", [0, 0, 0]);
    const drop = l.y - (p.surface - 0.05), dz = r.bottom.z - r.top.z;
    for (let j = 0; j < 80; j++) {
      const t = 0.14 + (j % 7) / 7 * 0.77, x = r.top.x + (Math.sin(j * 7.1) * 0.43) * width;
      const y = l.y - drop * t, z = r.top.z + dz * t;
      b.add(new THREE.DodecahedronGeometry(0.035 + j % 3 * 0.015, 0), j % 4 ? "#92998f" : "#b4b7ad", [x, y + 0.012, z], [j, j, 0], [1, 0.25, 0.8]);
    }
    for (let j = 0; j < 9; j++) {
      const x = r.top.x - width * 0.44 + j * width * 0.11;
      b.add(new THREE.DodecahedronGeometry(0.16 + j % 3 * 0.035, 0), j % 2 ? rock : "#899a99", [x, p.surface - 0.13, r.bottom.z - 0.25 - (j % 3) * 0.09], [0, j, 0], [1, 0.4, 0.7]);
    }
    b.add(coastStratum(width * 0.25, 0.14, 0.035, i), snow, [r.top.x - width * 0.24, l.y, r.top.z - 0.08]);
  }
  // Small relief along the shelf face, outside the shore and walking surface.
  for (const [x, scale] of [[-8.3, 0.65], [-6.7, 0.5], [1.75, 0.55], [4, 0.65], [7.5, 0.6]]) {
    b.add(new THREE.DodecahedronGeometry(scale, 0), rock, [x, l.y - 0.27, l.maxZ - 0.08], [0.2, x, 0], [1, 0.55, 0.45]);
    b.add(coastStratum(scale * 0.85, 0.16, 0.025, x), snow, [x, l.y + 0.005, l.maxZ - 0.12]);
  }
  // The full-depth window exposes every dive level above the lower gallery.
  b.box(frame.width + 0.6, 0.18, 0.3, 0, GLASS_TOP, frame.front + 0.05, "#3d5566");
  b.box(frame.width + 0.6, 0.22, 0.32, 0, p.floor - 0.12, frame.front + 0.05, "#3d5566");
  for (const s of [-1, 1]) b.box(0.16, GLASS_TOP - p.floor, 0.2, s * (frame.width / 2 + 0.05), p.floor, frame.front + 0.05, "#3d5566");
  return b.build();
}

function ExhibitStatic({ ex }: { ex: ExhibitDef }) {
  const geo = useMemo(() => {
    if (ex.id === "penguins") return penguinScenery(ex);
    const b = new PartBuilder(0.6);
    const { land, pool, colors } = ex;
    const halfW = EX_W / 2;
    // Back cliff and the land shelf (its front face is the pool's back wall).
    b.box(EX_W + 0.4, 4.6, 0.6, 0, 0, -EX_D / 2 - 0.3, colors.rock);
    b.box(EX_W, land.y, land.maxZ - (-EX_D / 2), 0, 0, (land.maxZ + -EX_D / 2) / 2, colors.rock);
    b.box(EX_W - 0.1, 0.06, land.maxZ - (-EX_D / 2) - 0.05, 0, land.y - 0.03, (land.maxZ + -EX_D / 2) / 2, colors.top);
    // Side walls (rock), lower toward the window so the camera sees in.
    for (const s of [-1, 1]) {
      b.box(0.5, 3.4, EX_D * 0.55, s * (halfW + 0.25), 0, -EX_D * 0.22, colors.rock);
      b.box(0.5, GLASS_TOP, EX_D * 0.5, s * (halfW + 0.25), 0, EX_D * 0.25, colors.rock);
    }
    // Pool floor (gravel) and a strip of pebbles along the cliff foot.
    b.box(EX_W, pool.floor, pool.maxZ - pool.minZ + 0.2, 0, 0, (pool.maxZ + pool.minZ) / 2, ex.id === "otters" ? "#8c8466" : "#9aa0a3");
    for (let k = 0; k < 9; k++) {
      const x = -halfW + 0.8 + k * ((EX_W - 1.6) / 8);
      b.add(new THREE.DodecahedronGeometry(0.22 + (k % 3) * 0.08, 0), colors.rock, [x, pool.floor + 0.12, pool.minZ + 0.35], [k, k * 1.3, 0], [1, 0.7, 1]);
    }
    // Boulders on the shelf.
    for (const o of ex.boulders) b.add(new THREE.DodecahedronGeometry(o.r, 0), colors.rock, [o.x, land.y + o.h * 0.35, o.z], [o.x, o.z, 0], [1, o.h / o.r * 0.7, 1]);
    // Islands: a wide base from the floor to the waterline, then a narrower top (data/coast frustum).
    for (const isl of ex.islands) {
      b.add(new THREE.CylinderGeometry(isl.r, isl.r * 1.18, pool.surface - pool.floor, 9), colors.rock, [isl.x, (pool.surface + pool.floor) / 2, isl.z]);
      b.add(new THREE.CylinderGeometry(isl.r * 0.55, isl.r, isl.top - pool.surface, 9), colors.rock, [isl.x, (isl.top + pool.surface) / 2, isl.z]);
      b.add(new THREE.CylinderGeometry(isl.r * 0.55, isl.r * 0.55, 0.04, 9), colors.top, [isl.x, isl.top - 0.01, isl.z]);
    }
    for (let i = 0; i < ex.ramps.length; i++) {
      b.add(rampGeometry(ex, i), colors.rock, [0, 0, 0]);
      // A paler walking surface along the slope.
      const r = ex.ramps[i], len = Math.hypot(r.bottom.z - r.top.z, land.y - pool.surface), mid = { y: (land.y + pool.surface) / 2 + 0.03, z: (r.top.z + r.bottom.z) / 2 };
      b.add(new THREE.BoxGeometry(1.3, 0.04, len), colors.top, [r.top.x, mid.y, mid.z], [Math.atan2(land.y - pool.surface, r.bottom.z - r.top.z), 0, 0]);
    }
    // Window frame and the rail along the walkway.
    b.box(EX_W + 0.6, 0.18, 0.3, 0, GLASS_TOP, WINDOW_Z + 0.05, "#3d5566");
    b.box(EX_W + 0.6, 0.22, 0.32, 0, -0.02, WINDOW_Z + 0.05, "#3d5566");
    for (const s of [-1, 0, 1]) b.box(0.16, GLASS_TOP, 0.2, s * (halfW + 0.05), 0, WINDOW_Z + 0.05, "#3d5566");
    // Species touches: kelp for otters, a little greenery on the shelf, pale stones for penguins.
    if (ex.id === "otters") {
      for (const [x, z] of [[-5.2, 3.6], [-4.4, 2.1], [5.4, 0.6], [2.6, 4.2]]) b.cyl(0.04, 0.06, pool.surface - pool.floor - 0.2, x, pool.floor, z, "#3c7a3e", 5);
      for (const [x, z] of [[-1.5, -3.8], [2.2, -4.1], [-5.3, -2.6]]) b.cone(0.3, 0.55, x, land.y, z, ex.colors.accent, 6);
    }
    if (ex.id === "seals") for (const [x, z] of [[-4.6, -3.0], [4.8, -3.6]]) b.cone(0.25, 0.4, x, land.y, z, "#7f9a5a", 5);
    return b.build();
  }, [ex]);
  return <mesh geometry={geo} material={smoothMat} position={[ex.x, 0, ex.z]} raycast={() => undefined} />;
}

function Water({ ex, h }: { ex: ExhibitDef; h: CoastHabitat }) {
  const p = ex.pool;
  const frame = exhibitFrame(ex);
  const surf = useMemo(() => surfaceMaterial(), []);
  const vol = useMemo(() => new THREE.MeshLambertMaterial({ color: ex.colors.water, transparent: true, opacity: ex.id === "penguins" ? 0.13 : 0.32, depthWrite: false }), [ex]);
  const glass = useMemo(() => new THREE.MeshBasicMaterial({ color: "#dff6ff", transparent: true, opacity: 0.08, depthWrite: false }), []);
  const dirt = useRef(0);
  useFrame(() => {
    if (!coastShown()) return;
    const t = tankAt(getGame().model, HABITAT_PAD[h]);
    const want = t && t.fish.length ? Math.max(0, Math.min(1, (70 - t.clean) / 60)) : 0;
    dirt.current += (want - dirt.current) * 0.05;
    surf.uniforms.uDirt.value = dirt.current;
    vol.color.set(ex.colors.water).lerp(new THREE.Color("#7f8f4f"), dirt.current * 0.6);
  });
  const w = p.maxX - p.minX, d = p.maxZ - p.minZ, hgt = p.surface - p.floor;
  return (
    <group position={[ex.x, 0, ex.z]}>
      <mesh position={[(p.minX + p.maxX) / 2, p.floor + hgt / 2, (p.minZ + p.maxZ) / 2]} material={vol} raycast={() => undefined} renderOrder={2}>
        <boxGeometry args={[w, hgt, d]} />
      </mesh>
      <mesh position={[(p.minX + p.maxX) / 2, p.surface, (p.minZ + p.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={surf} raycast={() => undefined} renderOrder={3}>
        <planeGeometry args={[w, d]} />
      </mesh>
      <mesh position={[0, (GLASS_TOP + frame.bottom) / 2, frame.front + 0.02]} material={glass} raycast={() => undefined} renderOrder={4}>
        <planeGeometry args={[frame.width, GLASS_TOP - frame.bottom]} />
      </mesh>
    </group>
  );
}

/** A few quiet bubble trails: one instanced draw, no extra water layers or lights. */
function PenguinBubbles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const ex = EXHIBITS.penguins;
  useFrame(() => {
    if (!coastShown() || !ref.current) return;
    for (let i = 0; i < 12; i++) {
      const trail = Math.floor(i / 4), phase = (coastRt.time * 0.13 + i * 0.247) % 1;
      const x = [-8.8, 8.7, 2.3][trail], z = [5.6, 5.3, 8.6][trail];
      dummy.position.set(x + Math.sin(phase * 8 + i) * 0.055, ex.pool.floor + 0.2 + phase * (ex.pool.surface - ex.pool.floor - 0.3), z);
      dummy.scale.setScalar(0.65 + i % 3 * 0.22);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 12]} position={[ex.x, 0, ex.z]} raycast={() => undefined} frustumCulled={false}>
      <sphereGeometry args={[0.035, 6, 4]} />
      <meshBasicMaterial color="#b8e0e3" transparent opacity={0.42} depthWrite={false} />
    </instancedMesh>
  );
}

/**
 * Bubbles shed behind a penguin swimming a fast burst: a fixed ring of 56
 * instances (one draw). Faster birds shed more; each bubble rises, wobbles,
 * shrinks away within ~1.4 s and never passes the surface.
 */
const TRAIL_N = 56, TRAIL_LIFE = 1.4;
function PenguinTrails() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const ex = EXHIBITS.penguins;
  const s = useMemo(() => ({ x: new Float32Array(TRAIL_N), y: new Float32Array(TRAIL_N), z: new Float32Array(TRAIL_N), born: new Float32Array(TRAIL_N).fill(-100), size: new Float32Array(TRAIL_N), next: 0, owed: new Map<string, number>() }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, frameDt) => {
    const mesh = ref.current;
    if (!coastShown() || !mesh) return;
    const dt = Math.min(frameDt, 0.1), now = coastRt.time, top = ex.pool.surface - 0.08;
    for (const a of coastRt.animals.values()) {
      const m = a.m;
      if (a.habitat !== "penguins" || m.mode !== "swim" || m.speed < 2.1) { s.owed.delete(m.id); continue; }
      // ~5 bubbles a second at 2.2 m/s, ~13 at 3.3 m/s, from just behind the feet.
      let owed = (s.owed.get(m.id) ?? 0) + dt * (m.speed - 1.7) * 8;
      while (owed >= 1) {
        owed -= 1;
        const i = s.next; s.next = (s.next + 1) % TRAIL_N;
        const back = 0.32 + Math.random() * 0.12, cp = Math.cos(m.pitch);
        s.x[i] = m.x - Math.sin(m.heading) * cp * back + (Math.random() - 0.5) * 0.08;
        s.y[i] = Math.min(top, m.y - Math.sin(m.pitch) * back + (Math.random() - 0.5) * 0.06);
        s.z[i] = m.z - Math.cos(m.heading) * cp * back + (Math.random() - 0.5) * 0.08;
        s.born[i] = now - Math.random() * dt; s.size[i] = 0.55 + Math.random() * 0.7;
      }
      s.owed.set(m.id, owed);
    }
    for (let i = 0; i < TRAIL_N; i++) {
      const age = now - s.born[i];
      const y = s.y[i] + age * (0.35 + s.size[i] * 0.25);
      const alive = age >= 0 && age < TRAIL_LIFE && y < top;
      dummy.position.set(s.x[i] + Math.sin(age * 9 + i) * 0.03, Math.min(y, top), s.z[i]);
      dummy.scale.setScalar(alive ? s.size[i] * (1 - age / TRAIL_LIFE) * (0.6 + Math.min(1, age * 6) * 0.4) : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, TRAIL_N]} position={[ex.x, 0, ex.z]} name="coast-penguin-trails" raycast={() => undefined} frustumCulled={false}>
      <sphereGeometry args={[0.032, 6, 4]} />
      <meshBasicMaterial color="#d6f3f5" transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  );
}

const slotY = (ex: ExhibitDef, on: "land" | "water" | "floor") => on === "land" ? ex.land.y : on === "water" ? ex.pool.surface - 0.04 : ex.pool.floor;

function Items({ ex, h }: { ex: ExhibitDef; h: CoastHabitat }) {
  const decor = useGame((s) => tankAt(s.model, HABITAT_PAD[h])?.decor);
  return (
    <group position={[ex.x, 0, ex.z]}>
      {(decor ?? []).map((d) => {
        const s = ex.slots[d.slot];
        if (!s) return null;
        return <mesh key={d.id} geometry={itemGeometry(d.kind as CoastDecorKind)} material={smoothMat} position={[s.x, slotY(ex, s.on), s.z]} raycast={() => undefined} />;
      })}
    </group>
  );
}

/** Runtime food is separate from the station: one draw for the whole fresh pile. */
function PenguinStationFish() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geo = useMemo(penguinFishGeometry, []);
  const colour = useMemo(() => new THREE.Color(), []);
  const capacity = 48;
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !coastShown()) return;
    const food = coastRt.stationFood;
    const tank = tankAt(getGame().model, HABITAT_PAD.penguins);
    const feeder = food && tank?.decor.find((d) => d.kind === "penguinFeeder" && d.slot === food.slot);
    const slot = feeder && EXHIBITS.penguins.slots[feeder.slot];
    mesh.count = food && slot ? Math.min(capacity, food.fish) : 0;
    if (!slot) return;
    mesh.position.set(EXHIBITS.penguins.x + slot.x, EXHIBITS.penguins.land.y, EXHIBITS.penguins.z + slot.z);
    for (let i = 0; i < mesh.count; i++) {
      // Keep the bucket clear on the left; a few crossed fish make the pile legible.
      dummy.position.set(0.08 + (i % 3) * 0.1, 0.115 + Math.floor(i / 6) * 0.045, -0.12 + Math.floor(i % 6 / 3) * 0.22);
      dummy.rotation.set(0, Math.sin(i * 4.7) * 0.7, (i % 2 ? 1 : -1) * 0.15);
      dummy.scale.setScalar(0.9 + i % 3 * 0.08);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      colour.set(["#ffffff", "#c1e0ee", "#9bbdd5"][i % 3]);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, smoothMat, capacity]} count={0} name="coast-station-fish" frustumCulled={false} raycast={() => undefined} />;
}

const ringGeo = new THREE.RingGeometry(0.42, 0.56, 28).rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.9, depthTest: false });
const ringBusy = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthTest: false });

/** Decorate mode: rings on the slots where the picked item can go (or every slot when moving one). */
function SlotRings({ ex, h }: { ex: ExhibitDef; h: CoastHabitat }) {
  const show = useGame((s) => s.hall === COAST_HALL && s.coastView === h && s.panel === "decorate");
  const placing = useGame((s) => s.placing);
  const tank = useGame((s) => tankAt(s.model, HABITAT_PAD[h]));
  const picked = useGame((s) => s.placing?.kind === "decor" ? s.model.inv.decor.find((d) => d.id === (s.placing as { decorId: string }).decorId)?.kind : s.placing?.kind === "move" ? tankAt(s.model, HABITAT_PAD[h])?.decor.find((d) => d.slot === (s.placing as { slot: number }).slot)?.kind : null);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) ref.current.scale.setScalar(1 + Math.sin(rt.time * 4) * 0.06); });
  if (!show || !tank) return null;
  const on = picked ? ITEM_ON[picked as CoastDecorKind] : null;
  return (
    <group position={[ex.x, 0, ex.z]}>
      {ex.slots.map((s, i) => {
        if (on && s.on !== on) return null;
        const busy = tank.decor.some((d) => d.slot === i);
        if (!placing && !busy) return null;
        return (
          <group key={i} position={[s.x, slotY(ex, s.on) + 0.05, s.z]}>
            <group ref={i === 0 ? ref : undefined}>
              <mesh geometry={ringGeo} material={busy ? ringBusy : ringMat} renderOrder={6} raycast={() => undefined} />
            </group>
            <mesh material={hitMat} onClick={tap(() => tapSlot(tank.id, i))} name={`coast-slot-${h}-${i}`}>
              <cylinderGeometry args={[0.6, 0.6, 0.5, 10]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Signs({ ex, h }: { ex: ExhibitDef; h: CoastHabitat }) {
  const open = useGame((s) => habitatOpen(s.model, h));
  const frame = exhibitFrame(ex);
  const word = h === "penguins" ? "PENGUINS\nペンギン" : h === "seals" ? "SEALS\nアザラシ" : "SEA OTTERS\nラッコ";
  const sign = signMaterial(open ? word : `${word.split("\n")[0]}\nCOMING SOON`, open ? "#14506a" : "#7a6a52", open ? "#e8fbff" : "#fff4d6", 640, 220);
  return (
    <group position={[ex.x, 0, ex.z]}>
      <mesh position={[frame.width / 2 - 1.35, GLASS_TOP + 0.5, frame.front + 0.2]} material={sign} onClick={tap(() => { if (open) tapCoastSign(h); })} name={`coast-sign-${h}`}>
        <planeGeometry args={[2.1, 0.73]} />
      </mesh>
    </group>
  );
}

/** The overview: tap anywhere on an exhibit to manage it. */
function ExhibitHit({ ex, h }: { ex: ExhibitDef; h: CoastHabitat }) {
  const all = useGame((s) => s.coastView === "all");
  const frame = exhibitFrame(ex);
  if (!all) return null;
  return (
    <mesh position={[ex.x, 1.4, ex.z + (ex.id === "penguins" ? (frame.front + frame.back) / 2 : 0.5)]} material={hitMat} onClick={tap(() => setCoastView(h))} name={`coast-exhibit-${h}`}>
      <boxGeometry args={[frame.width - 0.4, 3, frame.front - frame.back - 1]} />
    </mesh>
  );
}

// ------------------------------------------------------------------ animals

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
const focusMat = new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.85, depthTest: false });
const focusGeo = new THREE.TorusGeometry(0.5, 0.05, 6, 24);

/** Smoothly blended pose state per animal (0 land/upright .. 1 swimming). */
interface Blend { swim: number; float: number; splashSeen: number }

function useAnimal(id: string) {
  return () => coastRt.animals.get(id);
}

/** Drawn a little larger than life so children can read them from the walkway. */
const PENGUIN_SCALE = 1.3;

function Penguin({ id, index }: { id: string; index: number }) {
  const get = useAnimal(id);
  const parts = useMemo(penguinParts, []);
  const [asset, setAsset] = useState<PenguinInstance | null>(null);
  useEffect(() => {
    let live = true;
    let instance: PenguinInstance | null = null;
    // Match the procedural silhouette's measured height, including its 1.3 scale.
    void loadPenguin().then((source) => {
      if (!live || !source) return;
      instance = createPenguin(source, parts.height * PENGUIN_SCALE);
      setAsset(instance);
    }).catch(() => { /* Keep the procedural fallback if decoding/instantiation fails. */ });
    return () => { live = false; instance?.dispose(); };
  }, [parts]);
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null), fl = useRef<THREE.Group>(null), fr = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  const tag = useRef<THREE.Sprite>(null), ring = useRef<THREE.Mesh>(null);
  const blend = useRef<Blend>({ swim: 0, float: 0, splashSeen: -100 });
  const posed = useRef(false);
  useFrame((_, dt) => {
    if (!coastShown()) return;
    const a = get();
    const r = root.current, b = body.current;
    if (!a || !r || !b) return;
    const m = a.m, ex = EXHIBITS.penguins;
    const swimming = m.area === "water" && m.mode !== "rampUp" && m.mode !== "rampDown";
    const restingAtSurface = m.mode === "breathe" && m.speed < 0.05 && m.y > ex.pool.surface - 0.18;
    const swimTarget = swimming && !restingAtSurface ? 1 : 0;
    const k = blend.current;
    if (!posed.current) { k.swim = swimTarget; posed.current = true; }
    k.swim += (swimTarget - k.swim) * Math.min(1, dt * 6);
    if (!swimming && (m.mode === "rampUp" || m.mode === "rampDown") && m.y >= ex.pool.surface) k.swim = 0;
    r.position.set(ex.x + m.x, m.y, ex.z + m.z);
    r.rotation.y = m.heading;
    // Upright on land (feet at the root), lying along +z in the water (body centre at the root).
    const centre = asset?.centre ?? parts.centre * PENGUIN_SCALE;
    const support = swimming ? 0 : 1 - k.swim;
    b.position.set(0, centre * support, 0);
    const walking = !swimming && m.speed > 0.05;
    const eating = !swimming && m.feeding?.stage === "eating";
    const eatLean = eating ? 0.4 + Math.sin(coastRt.time * 8 + index) * 0.1 : 0;
    const waddle = walking ? Math.sin(m.phase) * 0.14 : m.action === "look" ? Math.sin(rt.time * 1.3 + index) * 0.05 : 0;
    b.rotation.set(penguinBodyPitch(m.pitch, k.swim) + eatLean, 0, waddle * (1 - k.swim));
    if (eating) b.position.set(0, centre, 0).applyQuaternion(b.quaternion);
    if (asset) {
      // The shore's support plane tilts the feet, about the mover's ground contact.
      // Climb/hop heights and all movement still come solely from coastRt.
      const ramp = ex.ramps[0];
      const onSlope = !swimming && (m.mode === "rampDown" || m.mode === "rampUp") && m.z >= ramp.top.z && m.z <= ramp.bottom.z;
      const gradient = onSlope ? (ex.pool.surface - 0.05 - ex.land.y) / (ramp.bottom.z - ramp.top.z) : 0;
      b.rotation.set(
        penguinBodyPitch(m.pitch, k.swim) - Math.atan(gradient * Math.cos(m.heading)) * (1 - k.swim) + eatLean,
        0,
        Math.atan(-gradient * Math.sin(m.heading)) * (1 - k.swim)
      );
      b.position.set(0, centre, 0).applyQuaternion(b.quaternion).multiplyScalar(support);
      asset.update(m, Math.min(dt, 0.1), k.swim, coastRt.time);
    }
    if (head.current) head.current.rotation.x = -Math.PI / 2 * k.swim;
    const flap = swimming ? Math.sin(m.phase * 1.6) * 0.9 : walking ? 0.35 + Math.sin(m.phase) * 0.15 : m.action === "groom" ? 0.2 + Math.abs(Math.sin(rt.time * 6)) * 0.3 : 0.12;
    if (fl.current) fl.current.rotation.z = -flap;
    if (fr.current) fr.current.rotation.z = flap;
    splash(m, k, ex);
    if (tag.current) {
      tag.current.visible = coastFocus.numbers;
      if (coastFocus.numbers) tag.current.material = numberMat(index + 1);
    }
    if (ring.current) ring.current.visible = coastFocus.id === id;
  });
  return (
    <group ref={root} name={`coast-animal-${id}`}>
      <mesh position={[0, 0.5, 0]} material={hitMat} onClick={tap(() => selectAnimal("coast", id))} name={`penguin-hit-${id}`}>
        <sphereGeometry args={[0.85, 8, 6]} />
      </mesh>
      <group ref={body}>
        {asset ? <primitive object={asset.scene} dispose={null} /> : <group position={[0, -parts.centre * PENGUIN_SCALE, 0]} scale={PENGUIN_SCALE}>
          <mesh geometry={parts.body} material={smoothMat} raycast={() => undefined} />
          <group ref={head} position={[0, 0.6, 0.01]}><mesh geometry={parts.head} material={smoothMat} raycast={() => undefined} /></group>
          <group ref={fl} position={[0.19, 0.48, 0]}><mesh geometry={parts.flipper} material={smoothMat} raycast={() => undefined} /></group>
          <group ref={fr} position={[-0.19, 0.48, 0]}><mesh geometry={parts.flipper} material={smoothMat} raycast={() => undefined} /></group>
        </group>}
      </group>
      <sprite ref={tag} position={[0, 1.15, 0]} scale={[0.8, 0.8, 1]} visible={false} raycast={() => undefined} renderOrder={8} />
      <mesh ref={ring} geometry={focusGeo} material={focusMat} position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false} renderOrder={7} raycast={() => undefined} />
    </group>
  );
}

function splash(m: Mover, k: Blend, ex: ExhibitDef) {
  if (m.splashT !== k.splashSeen && coastRt.time - m.splashT < 0.5) {
    k.splashSeen = m.splashT;
    effect("splash", ex.x + m.x, ex.pool.surface, ex.z + m.z, 6);
  }
}

function Seal({ id }: { id: string }) {
  const get = useAnimal(id);
  const parts = useMemo(sealParts, []);
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null), rear = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  const fl = useRef<THREE.Group>(null), fr = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null);
  const blend = useRef<Blend>({ swim: 0, float: 0, splashSeen: -100 });
  useFrame((_, dt) => {
    const a = get();
    const r = root.current, b = body.current;
    if (!a || !r || !b) return;
    const m = a.m, ex = EXHIBITS.seals;
    const swimming = m.area === "water";
    const k = blend.current;
    k.swim += ((swimming ? 1 : 0) - k.swim) * Math.min(1, dt * 5);
    r.position.set(ex.x + m.x, m.y, ex.z + m.z);
    r.rotation.y = m.heading;
    // On land the body lies on the ground (lifted by its half height); in the water it is centred.
    const moving = m.speed > 0.05;
    const galumph = !swimming && moving ? Math.abs(Math.sin(m.phase * 0.8)) * 0.08 : 0;
    b.position.y = parts.lift * (1 - k.swim) + galumph;
    b.rotation.x = -m.pitch * k.swim + (!swimming && moving ? Math.sin(m.phase * 0.8) * 0.12 : 0);
    // Swimming: the rear sweeps side to side; resting: an occasional slow stretch.
    if (rear.current) rear.current.rotation.y = swimming ? Math.sin(m.phase * 0.9) * 0.35 * Math.min(1, m.speed + 0.2) : Math.sin(rt.time * 0.4) * 0.05;
    if (head.current) {
      const up = !swimming && (m.action === "look" || m.mode === "rest") ? 0.45 + (m.action === "look" ? Math.sin(rt.time * 0.8) * 0.15 : 0) : 0;
      head.current.rotation.x = -up;
      head.current.rotation.y = m.action === "look" ? Math.sin(rt.time * 0.7) * 0.4 : 0;
    }
    const paddle = swimming ? Math.sin(m.phase * 0.9) * 0.3 : moving ? Math.sin(m.phase * 0.8) * 0.5 : 0;
    if (fl.current) fl.current.rotation.x = paddle;
    if (fr.current) fr.current.rotation.x = -paddle;
    splash(m, k, ex);
    if (ring.current) ring.current.visible = coastFocus.id === id;
  });
  return (
    <group ref={root} name={`coast-animal-${id}`}>
      <group ref={body}>
        <mesh geometry={parts.front} material={smoothMat} raycast={() => undefined} />
        <group ref={rear} position={[0, 0, -0.1]}><mesh geometry={parts.rear} material={smoothMat} position={[0, 0, 0.1]} raycast={() => undefined} /></group>
        <group ref={head} position={[0, 0.12, 0.62]}><mesh geometry={parts.head} material={smoothMat} raycast={() => undefined} /></group>
        <group ref={fl} position={[0.27, -0.16, 0.32]} rotation={[0, 0.3, 0]}><mesh geometry={parts.foreFlipper} material={smoothMat} raycast={() => undefined} /></group>
        <group ref={fr} position={[-0.27, -0.16, 0.32]} rotation={[0, -0.3, 0]}><mesh geometry={parts.foreFlipper} material={smoothMat} raycast={() => undefined} /></group>
      </group>
      <mesh ref={ring} geometry={focusGeo} material={focusMat} position={[0, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={1.6} visible={false} renderOrder={7} raycast={() => undefined} />
    </group>
  );
}

function Otter({ id }: { id: string }) {
  const get = useAnimal(id);
  const parts = useMemo(otterParts, []);
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null), head = useRef<THREE.Group>(null);
  const pl = useRef<THREE.Group>(null), pr = useRef<THREE.Group>(null), tail = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null);
  const blend = useRef<Blend>({ swim: 0, float: 0, splashSeen: -100 });
  useFrame((_, dt) => {
    const a = get();
    const r = root.current, b = body.current;
    if (!a || !r || !b) return;
    const m = a.m, ex = EXHIBITS.otters;
    const water = m.area === "water";
    const floating = m.mode === "float" && m.y > ex.pool.surface - 0.1;
    const k = blend.current;
    k.swim += ((water ? 1 : 0) - k.swim) * Math.min(1, dt * 5);
    k.float += ((floating ? 1 : 0) - k.float) * Math.min(1, dt * 3);
    r.position.set(ex.x + m.x, m.y, ex.z + m.z);
    r.rotation.y = m.heading;
    // Floating: rolled onto the back (belly and paws up), head lifted, body just under the surface.
    b.position.y = parts.lift * (1 - k.swim) + k.float * 0.04;
    b.rotation.set(-m.pitch * k.swim * (1 - k.float), 0, Math.PI * k.float);
    if (head.current) head.current.rotation.x = k.float * 0.9 - (m.action === "look" ? 0.3 : 0);
    const groom = m.action === "groom" || m.action === "play";
    const paw = floating && groom ? Math.sin(rt.time * 9) * 0.5 : water ? Math.sin(m.phase) * 0.4 : m.speed > 0.05 ? Math.sin(m.phase) * 0.6 : 0;
    if (pl.current) pl.current.rotation.x = paw;
    if (pr.current) pr.current.rotation.x = floating && groom ? -paw : -paw;
    if (tail.current) tail.current.rotation.x = water && !floating ? Math.sin(m.phase * 1.3) * 0.4 : floating ? Math.sin(rt.time * 1.5) * 0.15 : 0;
    splash(m, k, ex);
    if (ring.current) ring.current.visible = coastFocus.id === id;
  });
  return (
    <group ref={root} name={`coast-animal-${id}`}>
      <group ref={body}>
        <mesh geometry={parts.body} material={smoothMat} raycast={() => undefined} />
        <group ref={head} position={[0, 0.06, 0.42]}><mesh geometry={parts.head} material={smoothMat} raycast={() => undefined} /></group>
        <group ref={pl} position={[0.1, -0.1, 0.24]}><mesh geometry={parts.paw} material={smoothMat} raycast={() => undefined} /></group>
        <group ref={pr} position={[-0.1, -0.1, 0.24]}><mesh geometry={parts.paw} material={smoothMat} raycast={() => undefined} /></group>
        <group ref={tail} position={[0, -0.02, -0.36]}><mesh geometry={parts.tail} material={smoothMat} raycast={() => undefined} /></group>
      </group>
      <mesh ref={ring} geometry={focusGeo} material={focusMat} position={[0, 0.55, 0]} rotation={[Math.PI / 2, 0, 0]} scale={1.3} visible={false} renderOrder={7} raycast={() => undefined} />
    </group>
  );
}

function Animals() {
  const [list, setList] = useState<{ id: string; h: CoastHabitat }[]>([]);
  const last = useRef("");
  useFrame(() => {
    const key = [...coastRt.animals.keys()].join(",");
    if (key !== last.current) {
      last.current = key;
      setList([...coastRt.animals.entries()].map(([id, a]) => ({ id, h: a.habitat })));
    }
  });
  let pi = 0;
  return <>{list.filter(({ h }) => coastHabitatShown(h)).map(({ id, h }) => h === "penguins" ? <Penguin key={id} id={id} index={pi++} /> : h === "seals" ? <Seal key={id} id={id} /> : <Otter key={id} id={id} />)}</>;
}

// ------------------------------------------------------------------ walkway and visitors

function Walkway() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0.3);
    const shown = COAST_HABITATS.filter(coastHabitatShown).map((h) => EXHIBITS[h]);
    const x0 = Math.min(...shown.map((ex) => ex.x - exhibitFrame(ex).width / 2)) - 1.5;
    const x1 = Math.max(...shown.map((ex) => ex.x + exhibitFrame(ex).width / 2)) + 1.5;
    const z0 = Math.max(...shown.map((ex) => ex.z + exhibitFrame(ex).front)) + 0.2;
    // Other bays retain their authored deck; Penguin Coast's visitors use the
    // lower window gallery, so there is no upper slab or terrace stripe here.
    if (shown.some((ex) => ex.id !== "penguins")) {
      b.box(x1 - x0, 0.18, WALKWAY_D, (x0 + x1) / 2, -0.18, z0 + WALKWAY_D / 2, "#cdbfa6");
      b.box(x1 - x0, 0.03, 0.4, (x0 + x1) / 2, 0, z0 + WALKWAY_D - 0.3, "#2f8f9d");
    }
    // Rock dividers between exhibits and at the ends.
    const edges = new Set<number>();
    for (const ex of shown) {
      const frame = exhibitFrame(ex);
      for (const side of [-1, 1]) {
        const expanded = ex.id === "penguins";
        const x = ex.x + side * (frame.width / 2 + (expanded ? 0.65 : 1));
        if (edges.has(x)) continue;
        edges.add(x);
        b.box(expanded ? 1 : 2, 3.6 - frame.bottom, frame.front - frame.back + 0.6, x, frame.bottom, ex.z + (expanded ? (frame.front + frame.back) / 2 : -0.3), "#6e7b80");
        b.add(new THREE.DodecahedronGeometry(0.9, 0), "#7c8a8f", [x, 3.7, ex.z + (expanded ? frame.back + 3 : -1)], [side, 1, 0], [1, 0.6, 1]);
        if (!expanded && x > x0 + 1 && x < x1 - 1) b.cone(0.35, 1, x, 0, z0 + 0.7, "#3e8f5a", 6);
      }
    }
    if (!shown.some((ex) => ex.id === "penguins") && shown.length < COAST_HABITATS.length) {
      // End the visitor terrace beside the last shown exhibit, with solid rock
      // returns rather than a walkway continuing into absent neighbouring bays.
      for (const x of [x0 + 0.5, x1 - 0.5]) {
        b.box(1, 1.15, WALKWAY_D, x, 0, z0 + WALKWAY_D / 2, "#6e7b80");
        b.box(1.08, 0.12, WALKWAY_D, x, 1.15, z0 + WALKWAY_D / 2, "#b5cbd0");
      }
    }
    return b.build();
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <>
    <mesh name="coast-exhibit-dividers" geometry={geo} material={smoothMat} raycast={() => undefined} />
    {coastHabitatShown("penguins") && <CoastGallery />}
  </>;
}

interface Stroller { id: string; type: "child" | "adult" | "fan" | "grandma" | "explorer"; variant: number; x: number; dir: number; stopUntil: number; act: "walk" | "look" | "photo" | "point"; nextStop: number }
const STROLLERS: Stroller[] = [
  { id: "c1", type: "adult", variant: 1, x: -150, dir: 1, stopUntil: 0, act: "walk", nextStop: -145 },
  { id: "c2", type: "child", variant: 2, x: -149.3, dir: 1, stopUntil: 0, act: "walk", nextStop: -145.6 },
  { id: "c3", type: "grandma", variant: 0, x: -112, dir: -1, stopUntil: 0, act: "walk", nextStop: -116 },
  { id: "c4", type: "explorer", variant: 1, x: -127, dir: 1, stopUntil: 0, act: "walk", nextStop: -129 + 15 }
];

function Strollers() {
  const root = useRef<THREE.Group>(null);
  const underwater = useGame((s) => s.coastUnderwater);
  const lowerOnly = COAST_HABITATS_SHOWN.length === 1 && COAST_HABITATS_SHOWN[0] === "penguins";
  const count = Math.max(1, Math.floor(STROLLERS.length * COAST_HABITATS.filter(coastHabitatShown).length / COAST_HABITATS.length));
  // Hide the enclosing group in the same frame as Clean starts, including
  // before the nested figure has consumed its next pose.
  useFrame(() => { if (root.current) root.current.visible = keeperRt.clean.phase === "idle"; });
  if (!lowerOnly && underwater) return null;
  return <group ref={root} position={[0, lowerOnly ? PENGUIN_GALLERY.lower.top : 0, 0]}>{STROLLERS.slice(0, count).map((s) => <StrollerFigure key={s.id} s={s} />)}</group>;
}

function StrollerFigure({ s }: { s: Stroller }) {
  const model = useMemo(() => tunnelPersonModel(s.type, s.variant), [s.type, s.variant]);
  const [minX, maxX] = useMemo(() => {
    const shown = COAST_HABITATS.filter(coastHabitatShown).map((h) => EXHIBITS[h]);
    return [Math.min(...shown.map((ex) => ex.x - exhibitFrame(ex).width / 2)) + 0.5, Math.max(...shown.map((ex) => ex.x + exhibitFrame(ex).width / 2)) - 0.5];
  }, []);
  const terraceZ = useMemo(() => Math.max(...COAST_HABITATS.filter(coastHabitatShown).map((h) => EXHIBITS[h].z + exhibitFrame(EXHIBITS[h]).front)), []);
  const pose = useRef(newPose());
  const step = useRef(0);
  useFrame((_, dt) => {
    if (!coastShown()) return;
    const q = pose.current;
    // Old three-bay stroller starts must not leave visitors in a hidden habitat.
    if (s.x < minX || s.x > maxX) {
      s.x = minX + (Number(s.id.slice(1)) - 1) * (maxX - minX) / 4;
      s.nextStop = s.x + s.dir * 3;
    }
    const z = terraceZ + 1.4 + (s.id === "c2" ? 0.6 : s.id === "c4" ? 0.9 : 0);
    if (rt.time < s.stopUntil) {
      q.moving = false;
      q.yaw = Math.PI; // facing the window (-z)
      q.arm += ((s.act === "point" ? 0.95 : s.act === "photo" ? 0.75 : 0) - q.arm) * Math.min(1, dt * 4);
      q.photo = s.act === "photo";
    } else {
      s.x += s.dir * 0.75 * Math.min(dt, 0.1);
      step.current += dt * 6;
      if (s.x >= maxX || s.x <= minX) {
        s.x = Math.max(minX, Math.min(maxX, s.x));
        s.dir = s.x >= maxX ? -1 : 1;
        s.nextStop = s.x + s.dir * Math.min(5, (maxX - minX) / 2);
      }
      if ((s.dir > 0 && s.x >= s.nextStop) || (s.dir < 0 && s.x <= s.nextStop)) {
        s.stopUntil = rt.time + 4 + ((s.x * 13) % 5 + 5) % 5;
        s.act = (["look", "photo", "point"] as const)[Math.abs(Math.round(s.x)) % 3];
        s.nextStop = s.x + s.dir * (9 + Math.abs(Math.round(s.x * 7)) % 7);
      }
      q.moving = true;
      q.yaw = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      q.arm += (0 - q.arm) * Math.min(1, dt * 4);
      q.photo = false;
    }
    q.x = s.x; q.z = z; q.step = step.current; q.visible = true;
  });
  return <TunnelFigure model={model} pose={pose} name={`coast-visitor-${s.id}`} />;
}

// ------------------------------------------------------------------ the zone

function Tick() {
  useFrame((_, dt) => {
    const shown = coastShown();
    const g = getGame();
    stepCoast(g.model, Math.min(dt, 0.1), shown);
    coastKeeperTick();
    if (!shown) return;
    if (coastRt.sights.length) {
      updateModel(drainSights);
      checkCoastNow();
    }
    coastVisitorTick();
  });
  return null;
}

export function CoastZone() {
  const ref = useAreaGate(coastShown);
  return (
    <group ref={ref} name="coast-zone">
      <CoastCamera />
      <Tick />
      <Walkway />
      {COAST_HABITATS.filter(coastHabitatShown).map((h) => (
        <group key={h}>
          <ExhibitStatic ex={EXHIBITS[h]} />
          <Water ex={EXHIBITS[h]} h={h} />
          <Items ex={EXHIBITS[h]} h={h} />
          <SlotRings ex={EXHIBITS[h]} h={h} />
          <Signs ex={EXHIBITS[h]} h={h} />
          <ExhibitHit ex={EXHIBITS[h]} h={h} />
        </group>
      ))}
      {coastHabitatShown("penguins") && <PenguinBubbles />}
      {coastHabitatShown("penguins") && <PenguinTrails />}
      {coastHabitatShown("penguins") && <PenguinStationFish />}
      {coastHabitatShown("penguins") && <CoastKeepers shown={coastShown} />}
      <Animals />
      <Strollers />
    </group>
  );
}
