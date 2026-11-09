import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, updateModel, useGame } from "../../game/store";
import { effect, rt } from "../../game/runtime";
import { COAST_HALL } from "../../game/data/rooms";
import { COAST_HABITATS, COAST_ORIGIN, EX_D, EX_W, EXHIBITS, GLASS_TOP, WALKWAY_D, WINDOW_Z, type CoastHabitat, type ExhibitDef } from "../../game/data/coast";
import { HABITAT_PAD, habitatOpen } from "../../game/logic/coast";
import { coastRt, drainSights, stepCoast } from "../../game/coast/coastRuntime";
import { checkCoastNow, coastFocus, coastVisitorTick, setCoastView, tapCoastSign } from "../../game/flow/coast";
import { tapSlot } from "../../game/flow/actions";
import { tankAt } from "../../game/logic/model";
import { ITEM_ON } from "../../game/data/coast";
import type { CoastDecorKind } from "../../game/types";
import { PartBuilder } from "../partBuilder";
import { signMaterial, smoothMat, surfaceMaterial } from "../materials";
import { useAreaGate } from "../tunnel/wing";
import { newPose, TunnelFigure } from "../tunnel/TunnelFigure";
import { tunnelPersonModel } from "../models/people";
import { itemGeometry, otterParts, penguinParts, sealParts } from "./coastModels";
import type { Mover } from "../../game/coast/motion";

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
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false });
  // Shape (u, v) and extrusion w -> world (x = -w + centre + 0.75, y = v, z = u): a proper rotation.
  const m = new THREE.Matrix4().set(0, 0, -1, r.top.x + 0.75, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  g.applyMatrix4(m);
  return g;
}

function ExhibitStatic({ ex }: { ex: ExhibitDef }) {
  const geo = useMemo(() => {
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
    if (ex.id === "penguins") for (const [x, z] of [[-2.6, -1.6], [3.0, -3.8], [-4.6, -1.3], [0.2, -1.5]]) b.add(new THREE.DodecahedronGeometry(0.16, 0), "#e3e8ec", [x, land.y + 0.05, z], [x, z, 0], [1, 0.5, 1]);
    if (ex.id === "seals") for (const [x, z] of [[-4.6, -3.0], [4.8, -3.6]]) b.cone(0.25, 0.4, x, land.y, z, "#7f9a5a", 5);
    return b.build();
  }, [ex]);
  return <mesh geometry={geo} material={smoothMat} position={[ex.x, 0, ex.z]} raycast={() => undefined} />;
}

function Water({ ex, h }: { ex: ExhibitDef; h: CoastHabitat }) {
  const p = ex.pool;
  const surf = useMemo(() => surfaceMaterial(), []);
  const vol = useMemo(() => new THREE.MeshLambertMaterial({ color: ex.colors.water, transparent: true, opacity: 0.32, depthWrite: false }), [ex]);
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
      <mesh position={[0, GLASS_TOP / 2, WINDOW_Z + 0.02]} material={glass} raycast={() => undefined} renderOrder={4}>
        <planeGeometry args={[EX_W, GLASS_TOP]} />
      </mesh>
    </group>
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
  const word = h === "penguins" ? "PENGUINS\nペンギン" : h === "seals" ? "SEALS\nアザラシ" : "SEA OTTERS\nラッコ";
  const sign = signMaterial(open ? word : `${word.split("\n")[0]}\nCOMING SOON`, open ? "#14506a" : "#7a6a52", open ? "#e8fbff" : "#fff4d6", 640, 220);
  return (
    <group position={[ex.x, 0, ex.z]}>
      <mesh position={[EX_W / 2 - 1.35, GLASS_TOP + 0.5, WINDOW_Z + 0.2]} material={sign} onClick={tap(() => { if (open) tapCoastSign(h); })} name={`coast-sign-${h}`}>
        <planeGeometry args={[2.1, 0.73]} />
      </mesh>
    </group>
  );
}

/** The overview: tap anywhere on an exhibit to manage it. */
function ExhibitHit({ ex, h }: { ex: ExhibitDef; h: CoastHabitat }) {
  const all = useGame((s) => s.coastView === "all");
  if (!all) return null;
  return (
    <mesh position={[ex.x, 1.4, ex.z + 0.5]} material={hitMat} onClick={tap(() => setCoastView(h))} name={`coast-exhibit-${h}`}>
      <boxGeometry args={[EX_W - 0.4, 3, EX_D - 1]} />
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
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null), fl = useRef<THREE.Group>(null), fr = useRef<THREE.Group>(null);
  const tag = useRef<THREE.Sprite>(null), ring = useRef<THREE.Mesh>(null);
  const blend = useRef<Blend>({ swim: 0, float: 0, splashSeen: -100 });
  useFrame((_, dt) => {
    const a = get();
    const r = root.current, b = body.current;
    if (!a || !r || !b) return;
    const m = a.m, ex = EXHIBITS.penguins;
    const swimming = m.area === "water";
    const k = blend.current;
    k.swim += ((swimming ? 1 : 0) - k.swim) * Math.min(1, dt * 6);
    r.position.set(ex.x + m.x, m.y, ex.z + m.z);
    r.rotation.y = m.heading;
    // Upright on land (feet at the root), lying along +z in the water (body centre at the root).
    b.position.y = parts.centre * PENGUIN_SCALE * (1 - k.swim);
    const walking = !swimming && m.speed > 0.05;
    const waddle = walking ? Math.sin(m.phase) * 0.14 : m.action === "look" ? Math.sin(rt.time * 1.3 + index) * 0.05 : 0;
    b.rotation.set((Math.PI / 2 - m.pitch) * k.swim, 0, waddle * (1 - k.swim));
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
      <group ref={body}>
        <group position={[0, -parts.centre * PENGUIN_SCALE, 0]} scale={PENGUIN_SCALE}>
          <mesh geometry={parts.body} material={smoothMat} raycast={() => undefined} />
          <group ref={fl} position={[0.19, 0.48, 0]}><mesh geometry={parts.flipper} material={smoothMat} raycast={() => undefined} /></group>
          <group ref={fr} position={[-0.19, 0.48, 0]}><mesh geometry={parts.flipper} material={smoothMat} raycast={() => undefined} /></group>
        </group>
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
  return <>{list.map(({ id, h }) => h === "penguins" ? <Penguin key={id} id={id} index={pi++} /> : h === "seals" ? <Seal key={id} id={id} /> : <Otter key={id} id={id} />)}</>;
}

// ------------------------------------------------------------------ walkway and visitors

function Walkway() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0.3);
    const x0 = COAST_ORIGIN.x - 23, x1 = COAST_ORIGIN.x + 23, z0 = COAST_ORIGIN.z + WINDOW_Z + 0.2;
    b.box(x1 - x0, 0.06, WALKWAY_D, (x0 + x1) / 2, -0.06, z0 + WALKWAY_D / 2, "#cdbfa6");
    b.box(x1 - x0, 0.03, 0.4, (x0 + x1) / 2, 0, z0 + WALKWAY_D - 0.3, "#2f8f9d");
    // Rock dividers between exhibits and at the ends.
    for (const dx of [-22.5, -7.5, 7.5, 22.5]) b.box(2, 3.6, EX_D + 0.6, COAST_ORIGIN.x + dx, 0, COAST_ORIGIN.z - 0.3, "#6e7b80");
    for (const dx of [-7.5, 7.5]) {
      b.add(new THREE.DodecahedronGeometry(0.9, 0), "#7c8a8f", [COAST_ORIGIN.x + dx, 3.7, COAST_ORIGIN.z - 1], [dx, 1, 0], [1, 0.6, 1]);
      b.cone(0.35, 1.0, COAST_ORIGIN.x + dx, 0, z0 + 0.7, "#3e8f5a", 6);
    }
    return b.build();
  }, []);
  return <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />;
}

interface Stroller { id: string; type: "child" | "adult" | "fan" | "grandma" | "explorer"; variant: number; x: number; dir: number; stopUntil: number; act: "walk" | "look" | "photo" | "point"; nextStop: number }
const STROLLERS: Stroller[] = [
  { id: "c1", type: "adult", variant: 1, x: -150, dir: 1, stopUntil: 0, act: "walk", nextStop: -145 },
  { id: "c2", type: "child", variant: 2, x: -149.3, dir: 1, stopUntil: 0, act: "walk", nextStop: -145.6 },
  { id: "c3", type: "grandma", variant: 0, x: -112, dir: -1, stopUntil: 0, act: "walk", nextStop: -116 },
  { id: "c4", type: "explorer", variant: 1, x: -127, dir: 1, stopUntil: 0, act: "walk", nextStop: -129 + 15 }
];

function Strollers() {
  return <>{STROLLERS.map((s) => <StrollerFigure key={s.id} s={s} />)}</>;
}

function StrollerFigure({ s }: { s: Stroller }) {
  const model = useMemo(() => tunnelPersonModel(s.type, s.variant), [s.type, s.variant]);
  const pose = useRef(newPose());
  const step = useRef(0);
  useFrame((_, dt) => {
    if (!coastShown()) return;
    const q = pose.current;
    const z = COAST_ORIGIN.z + WINDOW_Z + 1.4 + (s.id === "c2" ? 0.6 : s.id === "c4" ? 0.9 : 0);
    if (rt.time < s.stopUntil) {
      q.moving = false;
      q.yaw = Math.PI; // facing the window (-z)
      q.arm += ((s.act === "point" ? 0.95 : s.act === "photo" ? 0.75 : 0) - q.arm) * Math.min(1, dt * 4);
      q.photo = s.act === "photo";
    } else {
      s.x += s.dir * 0.75 * Math.min(dt, 0.1);
      step.current += dt * 6;
      if (s.x > COAST_ORIGIN.x + 21) s.dir = -1;
      if (s.x < COAST_ORIGIN.x - 21) s.dir = 1;
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
    if (!shown) return;
    const g = getGame();
    stepCoast(g.model, Math.min(dt, 0.1), true);
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
      <Tick />
      <Walkway />
      {COAST_HABITATS.map((h) => (
        <group key={h}>
          <ExhibitStatic ex={EXHIBITS[h]} />
          <Water ex={EXHIBITS[h]} h={h} />
          <Items ex={EXHIBITS[h]} h={h} />
          <SlotRings ex={EXHIBITS[h]} h={h} />
          <Signs ex={EXHIBITS[h]} h={h} />
          <ExhibitHit ex={EXHIBITS[h]} h={h} />
        </group>
      ))}
      <Animals />
      <Strollers />
    </group>
  );
}
