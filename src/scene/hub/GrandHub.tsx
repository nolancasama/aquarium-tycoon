import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, useGame } from "../../game/store";
import { rt } from "../../game/runtime";
import { HUB_HALL } from "../../game/data/rooms";
import {
  bayOf, DOOR_OPENING, FUTURE_DOORS, HUB_BAYS, HUB_CENTRE, HUB_FRONT, HUB_R, HUB_TANK, HUB_WALL_H, onRing,
  type HubDestination
} from "../../game/data/hub";
import { hubGroups, memberWorld, stepHubVisitors } from "../../game/hub/hubVisitors";
import { openMap, openTrophies, tapHubDoor } from "../../game/flow/hub";
import { PartBuilder } from "../partBuilder";
import { padIconTexture, signMaterial, smoothMat } from "../materials";
import { useAreaGate } from "../tunnel/wing";
import { newPose, TunnelFigure } from "../tunnel/TunnelFigure";
import { tunnelPersonModel } from "../models/people";
import { directoryTexture, doorArtTexture, hubFloorTexture, hubWindowTexture } from "./hubArt";
import { wallPlaquePose, WALL_PLAQUE_DEPTH, WALL_PLAQUE_FACE_Z } from "./hubSignMount";

/**
 * The Grand Aquarium Hub: a sunlit half rotunda with the wing doorways round
 * its wall, a display tank in the middle, the trophy shelves, an information
 * desk and the directory kiosk on the plaza. Drawn only while the hub is shown.
 */

export const hubShown = () => { const g = getGame(); return g.screen === "game" && g.hall === HUB_HALL; };

const C = HUB_CENTRE;
const BAY = Math.PI / 8;
const tangent = (a: number) => ({ x: Math.cos(a), z: Math.sin(a) });
/** Mount plaques tangent to the curved rotunda wall, never angled toward the camera.
 * The shallow backing intersects the curved plaster slightly at the outer corners
 * so it reads as physically attached, with its printed face just proud of the frame. */
const plaqueFrameMat = new THREE.MeshLambertMaterial({ color: "#d4b16b" });
function WallPlaque({ angle, y, width, height, material, onClick }: {
  angle: number; y: number; width: number; height: number;
  material: THREE.Material;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const pose = wallPlaquePose(angle, y);
  return (
    <group position={pose.position} rotation={pose.rotation}>
      <mesh material={plaqueFrameMat} raycast={() => undefined}>
        <boxGeometry args={[width + 0.22, height + 0.16, WALL_PLAQUE_DEPTH]} />
      </mesh>
      <mesh position={[0, 0, WALL_PLAQUE_FACE_Z]} material={material} onClick={onClick}>
        <planeGeometry args={[width, height]} />
      </mesh>
    </group>
  );
}

const wallMats = {
  wainscot: new THREE.MeshLambertMaterial({ color: "#2f8f9d", side: THREE.DoubleSide }),
  upper: new THREE.MeshLambertMaterial({ color: "#f4ecdc", side: THREE.DoubleSide }),
  frieze: new THREE.MeshLambertMaterial({ color: "#164f6b", side: THREE.DoubleSide })
};

function Walls() {
  // Cylinder theta runs from +z toward +x; the arc from the far right (a = +90°) round the back to the far left.
  const band = (y0: number, y1: number) => new THREE.CylinderGeometry(HUB_R, HUB_R, y1 - y0, 72, 1, true, Math.PI / 2, Math.PI);
  const geos = useMemo(() => ({ low: band(0, 1.1), up: band(1.1, 6.3), top: band(6.3, HUB_WALL_H) }), []);
  const trim = useMemo(() => {
    const b = new PartBuilder(0);
    for (let k = 0; k <= 8; k++) {
      const a = -Math.PI / 2 + k * BAY, p = onRing(a, HUB_R - 0.2);
      b.boxAt(0.6, HUB_WALL_H + 0.2, 0.5, [p.x, (HUB_WALL_H + 0.2) / 2, p.z], [0, -a, 0], "#efe2c8");
      b.boxAt(0.8, 0.3, 0.62, [p.x, HUB_WALL_H + 0.15, p.z], [0, -a, 0], "#d9a441");
      b.boxAt(0.78, 0.25, 0.6, [p.x, 0.12, p.z], [0, -a, 0], "#2a7380");
    }
    for (const bay of HUB_BAYS) {
      const a = bay.angle, t = tangent(a);
      if (bay.kind === "window") {
        // Mullions over the window picture.
        const p = onRing(a, HUB_R - 0.12);
        b.boxAt(3.5, 0.16, 0.14, [p.x, 0.75, p.z], [0, -a, 0], "#e8dcc4");
        b.boxAt(3.5, 0.16, 0.14, [p.x, 3.2, p.z], [0, -a, 0], "#e8dcc4");
        b.boxAt(3.5, 0.2, 0.14, [p.x, 5.7, p.z], [0, -a, 0], "#e8dcc4");
        for (const s of [-1.7, 0, 1.7]) b.boxAt(0.14, 5, 0.14, [p.x + t.x * s, 3.2, p.z + t.z * s], [0, -a, 0], "#e8dcc4");
        continue;
      }
      if (bay.kind === "trophies") continue;
      // Doorway frame: two jambs, a lintel and a gold keystone.
      const p = onRing(a, HUB_R - 0.2), half = DOOR_OPENING.w / 2 + 0.18;
      for (const s of [-1, 1]) b.boxAt(0.36, DOOR_OPENING.h + 0.25, 0.42, [p.x + t.x * s * half, (DOOR_OPENING.h + 0.25) / 2, p.z + t.z * s * half], [0, -a, 0], "#e2d2b4");
      b.boxAt(DOOR_OPENING.w + 0.75, 0.45, 0.46, [p.x, DOOR_OPENING.h + 0.42, p.z], [0, -a, 0], "#e2d2b4");
      b.boxAt(0.42, 0.55, 0.5, [p.x, DOOR_OPENING.h + 0.45, p.z], [0, -a, 0], "#d9a441");
    }
    return b.build();
  }, []);
  return (
    <group position={[C.x, 0, C.z]}>
      <mesh geometry={geos.low} material={wallMats.wainscot} position={[0, 0.55, 0]} raycast={() => undefined} />
      <mesh geometry={geos.up} material={wallMats.upper} position={[0, 1.1 + 2.6, 0]} raycast={() => undefined} />
      <mesh geometry={geos.top} material={wallMats.frieze} position={[0, 6.3 + (HUB_WALL_H - 6.3) / 2, 0]} raycast={() => undefined} />
      <mesh geometry={trim} material={smoothMat} position={[-C.x, 0, -C.z]} raycast={() => undefined} />
    </group>
  );
}

function Floor() {
  const w = (HUB_R + 0.6) * 2, d = HUB_R + 0.6 + HUB_FRONT;
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: hubFloorTexture(w, d, 0.5, (HUB_R + 0.6) / d, HUB_R) }), [w, d]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[C.x, 0, C.z - (HUB_R + 0.6) + d / 2]} material={mat} raycast={() => undefined}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}

function tap(fn: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    fn();
  };
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function Door({ kind }: { kind: HubDestination }) {
  const bay = bayOf(kind);
  const open = useGame((s) => kind === "indoor" || (kind === "sharks" && Boolean(s.model.progress.tunnelOpen)) || (kind === "coast" && Boolean(s.model.progress.coastOpen)));
  const future = FUTURE_DOORS.includes(kind);
  const lock = useRef<THREE.Sprite>(null);
  const a = bay.angle, p = onRing(a, HUB_R - 0.08), lk = onRing(a, HUB_R - 0.8);
  const art = useMemo(() => new THREE.MeshBasicMaterial({ map: doorArtTexture(kind, open || future), toneMapped: false }), [kind, open, future]);
  const label = `${bay.en.toUpperCase()}\n${bay.ja}`;
  const sign = signMaterial(label, future ? "#7a6a52" : "#14506a", future ? "#fff4d6" : "#e8fbff", 900, 280);
  const locked = !open && !future;
  useFrame(() => {
    if (lock.current) lock.current.position.y = 1.7 + Math.sin(rt.time * 2) * 0.06;
  });
  const onClick = tap(() => tapHubDoor(kind));
  return (
    <group>
      <mesh position={[p.x, DOOR_OPENING.h / 2, p.z]} rotation={[0, -a, 0]} material={art} onClick={onClick} name={`hub-door-${kind}`}>
        <planeGeometry args={[DOOR_OPENING.w, DOOR_OPENING.h]} />
      </mesh>
      <WallPlaque angle={a} y={DOOR_OPENING.h + 1.25} width={3.0} height={0.94} material={sign} onClick={onClick} />
      {/* A generous tap zone: the whole doorway and its sign, a little proud of the wall. */}
      <mesh position={[lk.x, 2.4, lk.z]} rotation={[0, -a, 0]} material={hitMat} onClick={onClick} name={`hub-door-hit-${kind}`}>
        <planeGeometry args={[3.4, 4.8]} />
      </mesh>
      {locked && (
        <sprite ref={lock} position={[lk.x, 1.7, lk.z]} scale={[0.75, 0.75, 1]} raycast={() => undefined}>
          <spriteMaterial map={padIconTexture("lock")} depthTest={false} />
        </sprite>
      )}
    </group>
  );
}

/** Rope barriers in front of the closed future attractions. */
function Barriers() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0.3);
    for (const kind of FUTURE_DOORS) {
      const a = bayOf(kind).angle, t = tangent(a), p = onRing(a, HUB_R - 1.15);
      for (const s of [-1, 1]) {
        b.cyl(0.05, 0.05, 0.95, p.x + t.x * s * 1.05, 0, p.z + t.z * s * 1.05, "#c9a24a", 8);
        b.cyl(0.18, 0.2, 0.06, p.x + t.x * s * 1.05, 0, p.z + t.z * s * 1.05, "#9c7a2e", 10);
      }
      b.add(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), "#c0392b", [p.x, 0.82, p.z], [0, -a, Math.PI / 2]);
    }
    return b.build();
  }, []);
  return <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />;
}

function Windows() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: hubWindowTexture(), toneMapped: false }), []);
  const big = signMaterial("GRAND AQUARIUM\nグランド すいぞくかん", "#14506a", "#fff6da", 1024, 300);
  const centre = onRing(0, HUB_R - 0.6);
  return (
    <group>
      {HUB_BAYS.filter((b) => b.kind === "window").map((b) => {
        const p = onRing(b.angle, HUB_R - 0.05);
        return <mesh key={b.id} position={[p.x, 3.2, p.z]} rotation={[0, -b.angle, 0]} material={mat} raycast={() => undefined}><planeGeometry args={[3.5, 5]} /></mesh>;
      })}
      <mesh position={[centre.x, 5.45, centre.z]} material={big} raycast={() => undefined}><planeGeometry args={[5.4, 1.58]} /></mesh>
    </group>
  );
}

/** The trophy shelves: the existing achievements, earned ones bright, the rest as grey shapes. */
function Trophies() {
  const p = useGame((s) => s.model.progress);
  const best = useGame((s) => s.model.rush?.stats.best ?? null);
  const bay = bayOf("trophies");
  const a = bay.angle, t = tangent(a);
  const geo = useMemo(() => {
    const b = new PartBuilder(0);
    const grey = "#9aa3ab";
    const shelf = (y: number) => {
      const q = onRing(a, HUB_R - 0.45);
      b.boxAt(3.4, 0.1, 0.6, [q.x, y, q.z], [0, -a, 0], "#7a5636");
    };
    // Back panel and two shelves.
    const back = onRing(a, HUB_R - 0.12);
    b.boxAt(3.7, 3.9, 0.12, [back.x, 2.2, back.z], [0, -a, 0], "#1d5c74");
    shelf(1.3);
    shelf(2.6);
    const spot = (s: number, y: number) => { const q = onRing(a, HUB_R - 0.45); return [q.x + t.x * s, y, q.z + t.z * s] as const; };
    const cup = (s: number, y: number, c: string, top: (x: number, y: number, z: number) => void) => {
      const [x, , z] = spot(s, y);
      b.cyl(0.16, 0.2, 0.08, x, y + 0.05, z, c, 12);
      b.cyl(0.05, 0.05, 0.22, x, y + 0.12, z, c, 8);
      b.cyl(0.26, 0.1, 0.34, x, y + 0.33, z, c, 14);
      top(x, y + 0.7, z);
    };
    const gold = "#f2c230";
    // Aquarium Star (Level 5) and Super Aquarium Star (Level 8).
    cup(-1.05, 1.36, p.star ? gold : grey, (x, y, z) => b.sphere(0.13, x, y + 0.02, z, p.star ? "#fff2a8" : grey, [1, 1, 0.5], 6));
    cup(0, 1.36, p.superStar ? gold : grey, (x, y, z) => { for (let k = -1; k <= 1; k++) b.cone(0.07, 0.2, x + k * 0.12, y - 0.05, z, p.superStar ? "#ffe066" : grey, 4); });
    // Shark Tunnel trophy.
    cup(1.05, 1.36, p.tunnel?.trophy ? "#4dabf7" : grey, (x, y, z) => b.add(new THREE.ConeGeometry(0.1, 0.28, 3), p.tunnel?.trophy ? "#1c6e9c" : grey, [x, y, z], [0, -a, 0], [1, 1, 0.35]));
    // Rush Hour best medal, and the coastal trophy still to come.
    const medal = best === "gold" ? "#f2c230" : best === "silver" ? "#cfd8dc" : best === "bronze" ? "#c8834a" : grey;
    const [mx, , mz] = spot(-0.6, 2.66);
    b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 18), medal, [mx, 2.66 + 0.4, mz], [Math.PI / 2, -a, 0]);
    b.boxAt(0.08, 0.3, 0.04, [mx, 2.66 + 0.18, mz], [0, -a, 0], "#c0392b");
    const coastGot = Boolean(p.coast?.trophy);
    cup(0.6, 2.66, coastGot ? "#63e6be" : grey, (x, y, z) => b.sphere(0.12, x, y, z, coastGot ? "#f4f6f8" : grey, [1, 0.7, 1], 8));
    return b.build();
  }, [p.star, p.superStar, p.tunnel?.trophy, p.coast?.trophy, best, a, t.x, t.z]);
  const sign = signMaterial("TROPHIES\nトロフィー", "#d9a441", "#3b2a00", 640, 220);
  const hit = onRing(a, HUB_R - 0.9);
  return (
    <group>
      <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />
      <WallPlaque angle={a} y={4.75} width={2.4} height={0.83} material={sign} onClick={tap(openTrophies)} />
      <mesh position={[hit.x, 2.3, hit.z]} rotation={[0, -a, 0]} material={hitMat} onClick={tap(openTrophies)} name="hub-trophies"><planeGeometry args={[3.6, 4.4]} /></mesh>
    </group>
  );
}

/** The display tank: a glass cylinder of reef fish over a stone plinth. No care, no purchase. */
function DisplayTank() {
  const T = HUB_TANK, base = T.plinth;
  const statics = useMemo(() => {
    const b = new PartBuilder(0.5);
    b.cyl(T.plinthR, T.plinthR + 0.1, base, T.x, 0, T.z, "#d8c8a8", 40);
    b.cyl(T.plinthR + 0.05, T.plinthR + 0.05, 0.08, T.x, base - 0.08, T.z, "#d9a441", 40);
    b.cyl(T.r - 0.02, T.r - 0.02, 0.14, T.x, base, T.z, "#f0dfb5", 36);
    // Rocks, corals and kelp inside.
    const rock = (dx: number, dz: number, r: number, c: string) => b.add(new THREE.DodecahedronGeometry(r, 0), c, [T.x + dx, base + 0.1 + r * 0.5, T.z + dz], [dx, dz, 0], [1, 0.75, 1]);
    rock(-0.6, -0.4, 0.55, "#8b8178");
    rock(0.5, 0.55, 0.42, "#9a8e80");
    rock(0.75, -0.6, 0.35, "#7d746b");
    const coral = (dx: number, dz: number, c: string, h: number) => {
      for (let k = 0; k < 4; k++) b.cone(0.07, h * (0.7 + k * 0.12), T.x + dx + Math.cos(k * 1.7) * 0.12, base + 0.12, T.z + dz + Math.sin(k * 1.7) * 0.12, c, 6);
    };
    coral(-0.15, 0.8, "#ff6b8a", 0.5);
    coral(-1.0, 0.35, "#ffa94d", 0.45);
    coral(1.1, 0.0, "#b197fc", 0.55);
    coral(0.1, -0.95, "#ff8787", 0.4);
    for (const [dx, dz, h] of [[-1.25, -0.55, 2.1], [1.2, 0.8, 1.8], [0.3, 1.25, 1.6], [-0.4, -1.3, 2.3]]) b.cyl(0.04, 0.06, h, T.x + dx, base + 0.1, T.z + dz, "#3c9a52", 5);
    // Open rim (the camera looks down into the water), and a bottom band.
    b.add(new THREE.TorusGeometry(T.r + 0.04, 0.09, 6, 48), "#1d5c74", [T.x, base + T.h, T.z], [Math.PI / 2, 0, 0], [1, 1, 1], { vary: false });
    b.add(new THREE.TorusGeometry(T.r + 0.04, 0.07, 6, 48), "#d9a441", [T.x, base + 0.16, T.z], [Math.PI / 2, 0, 0], [1, 1, 1], { vary: false });
    return b.build();
  }, [T.x, T.z, T.r, T.h, T.plinthR, base]);
  const water = useMemo(() => new THREE.MeshLambertMaterial({ color: "#5cc8e6", transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }), []);
  const surface = useMemo(() => new THREE.MeshBasicMaterial({ color: "#a8ecff", transparent: true, opacity: 0.4, depthWrite: false }), []);
  return (
    <group>
      <mesh geometry={statics} material={smoothMat} raycast={() => undefined} />
      <TankFish />
      <Bubbles />
      <mesh position={[T.x, base + T.h / 2, T.z]} material={water} raycast={() => undefined} renderOrder={2}>
        <cylinderGeometry args={[T.r, T.r, T.h - 0.02, 40, 1, true]} />
      </mesh>
      <mesh position={[T.x, base + T.h - 0.08, T.z]} rotation={[-Math.PI / 2, 0, 0]} material={surface} raycast={() => undefined} renderOrder={3}>
        <circleGeometry args={[T.r - 0.01, 40]} />
      </mesh>
    </group>
  );
}

const FISH_N = 22;
const FISH_COLORS = ["#ff8a2a", "#ffd43b", "#4dabf7", "#ff6b6b", "#63e6be", "#f783ac", "#ffffff", "#845ef7"];
function fishGeometry() {
  const body = new THREE.SphereGeometry(0.1, 8, 6).scale(0.55, 0.8, 1.6);
  const tail = new THREE.ConeGeometry(0.08, 0.14, 4).rotateX(-Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, -0.2);
  const b = new PartBuilder(0);
  b.add(body, "#ffffff", [0, 0, 0], [0, 0, 0], [1, 1, 1], { vary: false });
  b.add(tail, "#ffffff", [0, 0, 0], [0, 0, 0], [1, 1, 1], { vary: false });
  return b.build();
}

function TankFish() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(fishGeometry, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  const fish = useMemo(() => Array.from({ length: FISH_N }, (_, i) => ({
    r: 0.55 + ((i * 37) % 100) / 100 * 1.15, y: 0.55 + ((i * 53) % 100) / 100 * 2.3,
    w: (0.28 + ((i * 17) % 10) / 30) * (i % 3 === 0 ? -1 : 1), p: i * 1.3, s: 0.8 + ((i * 29) % 10) / 20
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const ready = useRef(false);
  useFrame(() => {
    const m = ref.current;
    if (!m || !hubShown()) return;
    if (!ready.current) {
      const c = new THREE.Color();
      fish.forEach((_, i) => m.setColorAt(i, c.set(FISH_COLORS[i % FISH_COLORS.length])));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      ready.current = true;
    }
    const t = rt.time;
    fish.forEach((f, i) => {
      const a = f.p + t * f.w;
      const r = f.r + Math.sin(t * 0.4 + f.p) * 0.12;
      dummy.position.set(HUB_TANK.x + Math.sin(a) * r, HUB_TANK.plinth + f.y + Math.sin(t * 0.7 + f.p) * 0.12, HUB_TANK.z - Math.cos(a) * r);
      // Heading along the circle (tangent), with a small tail-beat wiggle.
      const dir = Math.sign(f.w);
      dummy.rotation.set(0, Math.atan2(Math.cos(a) * dir, Math.sin(a) * dir) + Math.sin(t * 9 + f.p) * 0.12, 0);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, FISH_N]} raycast={() => undefined} frustumCulled={false} />;
}

const BUBBLES = 14;
function Bubbles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#e8fbff", transparent: true, opacity: 0.7 }), []);
  useFrame(() => {
    const m = ref.current;
    if (!m || !hubShown()) return;
    for (let i = 0; i < BUBBLES; i++) {
      const src = i % 2 ? { x: -0.6, z: -0.4 } : { x: 0.5, z: 0.55 };
      const h = ((rt.time * 0.55 + i * 0.37) % 1) * (HUB_TANK.h - 0.35);
      dummy.position.set(HUB_TANK.x + src.x + Math.sin(rt.time * 3 + i) * 0.05, HUB_TANK.plinth + 0.5 + h, HUB_TANK.z + src.z);
      dummy.scale.setScalar(0.5 + (i % 3) * 0.25);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[new THREE.SphereGeometry(0.04, 6, 4), mat, BUBBLES]} raycast={() => undefined} frustumCulled={false} />;
}

/** Plaza furniture: the information desk (left), the directory kiosk (right), potted palms. */
function Plaza() {
  const geo = useMemo(() => {
    const b = new PartBuilder(0.4);
    const ix = C.x - 7.3, iz = C.z + 5.2;
    b.box(2.8, 1.0, 0.8, ix, 0, iz, "#2a7380");
    b.box(3.0, 0.08, 0.95, ix, 1.0, iz, "#f2e6cc");
    b.box(0.08, 1.2, 0.08, ix - 0.9, 1.08, iz - 0.3, "#c9a24a");
    b.box(0.08, 1.2, 0.08, ix + 0.9, 1.08, iz - 0.3, "#c9a24a");
    const kx = C.x + 7.3, kz = C.z + 5.2;
    b.cyl(0.09, 0.11, 1.25, kx, 0, kz, "#164f6b", 10);
    b.cyl(0.45, 0.5, 0.08, kx, 0, kz, "#164f6b", 16);
    for (const [px, pz] of [[C.x - 10, C.z + 2.5], [C.x + 10, C.z + 2.5], [C.x - 4.2, C.z + 7.4], [C.x + 4.2, C.z + 7.4]]) {
      b.cyl(0.32, 0.25, 0.55, px, 0, pz, "#c8834a", 12);
      b.cyl(0.05, 0.07, 1.3, px, 0.5, pz, "#7a5a36", 6);
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        b.add(new THREE.ConeGeometry(0.12, 0.9, 4), "#3e9e5a", [px + Math.cos(ang) * 0.35, 1.75, pz + Math.sin(ang) * 0.35], [Math.sin(ang) * 1.1, 0, -Math.cos(ang) * 1.1]);
      }
    }
    return b.build();
  }, []);
  const info = signMaterial("INFORMATION\nインフォメーション", "#164f6b", "#e8fbff", 700, 220);
  const board = useMemo(() => new THREE.MeshBasicMaterial({ map: directoryTexture(), toneMapped: false, transparent: true, alphaTest: 0.01 }), []);
  const kx = C.x + 7.3, kz = C.z + 5.2;
  const kYaw = Math.atan2(HUB_CAMERA.pos.x - kx, HUB_CAMERA.pos.z - kz);
  return (
    <group>
      <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />
      <mesh position={[C.x - 7.3, 2.55, C.z + 4.9]} material={info} raycast={() => undefined}><planeGeometry args={[2.2, 0.7]} /></mesh>
      <group position={[kx, 1.75, kz]} rotation={[0, kYaw, 0]}>
        <mesh rotation={[-0.35, 0, 0]} material={board} onClick={tap(openMap)} name="hub-directory"><planeGeometry args={[1.7, 1.28]} /></mesh>
      </group>
    </group>
  );
}

function HubPerson({ groupId, memberId }: { groupId: string; memberId: string }) {
  const g0 = hubGroups.find((g) => g.id === groupId)!;
  const m0 = g0.members.find((m) => m.id === memberId)!;
  const model = useMemo(() => tunnelPersonModel(m0.type, m0.variant), [m0.type, m0.variant]);
  const pose = useRef(newPose());
  useFrame((_, dt) => {
    const g = hubGroups.find((x) => x.id === groupId);
    const m = g?.members.find((x) => x.id === memberId);
    const q = pose.current;
    if (!g || !m || !g.visible) { q.visible = false; return; }
    const w = memberWorld(g, m);
    q.visible = true;
    q.x = w.x; q.z = w.z; q.yaw = g.heading;
    q.moving = g.speed > 0.12;
    q.step = g.phase;
    const arm = g.activity === "point" ? 0.95 : g.activity === "photo" ? 0.75 : 0;
    q.arm += (arm - q.arm) * Math.min(1, dt * 4);
    q.photo = g.activity === "photo";
    q.lookUp += ((g.activity === "look" ? 0.45 : 0) - q.lookUp) * Math.min(1, dt * 3);
    q.hop = 0;
  });
  return <TunnelFigure model={model} pose={pose} name={`hub-visitor-${memberId}`} />;
}

function HubVisitors() {
  const [ids, setIds] = useState<{ g: string; m: string }[]>([]);
  const last = useRef("");
  useFrame((_, dt) => {
    stepHubVisitors(Math.min(dt, 0.1), hubShown());
    const list = hubGroups.flatMap((g) => g.members.map((m) => ({ g: g.id, m: m.id })));
    const key = list.map((x) => x.m).join(",");
    if (key !== last.current) {
      last.current = key;
      setIds(list);
    }
  });
  return <>{ids.map((x) => <HubPerson key={x.m} groupId={x.g} memberId={x.m} />)}</>;
}

export function GrandHub() {
  const ref = useAreaGate(hubShown);
  return (
    <group ref={ref} name="grand-hub">
      <Floor />
      <Walls />
      <Windows />
      {(["indoor", "lagoon", "sanctuary", "sharks", "coast"] as HubDestination[]).map((k) => <Door key={k} kind={k} />)}
      <Barriers />
      <Trophies />
      <DisplayTank />
      <Plaza />
      <HubVisitors />
    </group>
  );
}
