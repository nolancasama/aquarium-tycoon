import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getGame, useGame } from "../../game/store";
import { rt } from "../../game/runtime";
import { HUB_HALL } from "../../game/data/rooms";
import {
  bayOf, doorLocal, DOOR_OPENING, HUB_CAMERA, HUB_CENTRE, HUB_DOORS, HUB_FRONT, HUB_R, HUB_TANK, hubDoorOpen, onRing, RELEASE_DOORS,
  type HubDestination
} from "../../game/data/hub";
import { areaAvailable } from "../../game/data/release";
import { hubGroups, memberHeading, memberWorld, stepHubVisitors } from "../../game/hub/hubVisitors";
import { openMap, openTrophies, tapHubDoor } from "../../game/flow/hub";
import { PartBuilder } from "../partBuilder";
import { padIconTexture, signMaterial, smoothMat } from "../materials";
import { useAreaGate } from "../tunnel/wing";
import { newPose, TunnelFigure } from "../tunnel/TunnelFigure";
import { tunnelPersonModel } from "../models/people";
import { directoryTexture, hubFloorTexture } from "./hubArt";
import { smallFishMaterial, smallFishMesh, smallFishTime, type SmallFishKind, type SmallFishLook } from "../marine/smallFish";
import { HubShell, HubDoorClosures } from "./HubArchitecture";
import { HubCoastWindow } from "./HubCoastWindow";
import { HubReview } from "./HubReview";
import { clipToHubPortal } from "./hubPortalClip";
import { wallPlaquePose, WALL_PLAQUE_DEPTH, WALL_PLAQUE_FACE_Z } from "./hubSignMount";
import { createHubReef, REEF_FLOOR } from "./hubReef";
import { createReefFishPath, sampleReefFishPath } from "./reefFishPaths";

/**
 * The Grand Aquarium Hub: a sunlit half rotunda with the wing doorways round
 * its wall, a display tank in the middle, the trophy shelves, an information
 * desk and the directory kiosk on the plaza. Drawn only while the hub is shown.
 */

export const hubShown = () => { const g = getGame(); return g.screen === "game" && g.hall === HUB_HALL; };

const C = HUB_CENTRE;
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

/** Held back by a release lock (not a price or a milestone): shown as Coming soon. */
const doorSoon = (kind: HubDestination) => Boolean(RELEASE_DOORS[kind]) && !areaAvailable(RELEASE_DOORS[kind]!);

function Door({ kind }: { kind: HubDestination }) {
  const bay = bayOf(kind);
  // previewAreas is read so a session preview re-renders the doorway.
  const open = useGame((s) => (void s.previewAreas, hubDoorOpen(kind, s.model.progress)));
  const soon = useGame((s) => (void s.previewAreas, doorSoon(kind)));
  const lock = useRef<THREE.Sprite>(null);
  const a = bay.angle, lk = onRing(a, HUB_R - 0.8);
  const label = `${bay.en.toUpperCase()}\n${bay.ja}`;
  const sign = signMaterial(label, soon ? "#7a6a52" : "#14506a", soon ? "#fff4d6" : "#e8fbff", 900, 280);
  const locked = !open;
  useFrame(() => {
    if (lock.current) lock.current.position.y = 1.7 + Math.sin(rt.time * 2) * 0.06;
  });
  const onClick = tap(() => tapHubDoor(kind));
  return (
    <group>
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

/** Rope barriers in front of every currently closed doorway. */
function Barriers() {
  const key = useGame((s) => (void s.previewAreas, HUB_DOORS.filter(kind => !hubDoorOpen(kind, s.model.progress)).join(",")));
  const geo = useMemo(() => {
    const b = new PartBuilder(0.3);
    for (const kind of key.split(",").filter(Boolean) as HubDestination[]) {
      const a = bayOf(kind).angle, t = tangent(a), p = onRing(a, HUB_R - 1.15);
      for (const s of [-1, 1]) {
        b.cyl(0.05, 0.05, 0.95, p.x + t.x * s * 1.05, 0, p.z + t.z * s * 1.05, "#c9a24a", 8);
        b.cyl(0.18, 0.2, 0.06, p.x + t.x * s * 1.05, 0, p.z + t.z * s * 1.05, "#9c7a2e", 10);
      }
      b.add(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 6), "#c0392b", [p.x, 0.82, p.z], [0, -a, Math.PI / 2]);
    }
    return b.build();
  }, [key]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />;
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
    // The outdoor expansions' trophies to come: a leaping dolphin, an orca's tall fin.
    const lagoonGot = Boolean(p.lagoon?.trophy), sanctGot = Boolean(p.sanctuary?.trophy);
    cup(-1.3, 2.66, lagoonGot ? "#4dd4e8" : grey, (x, y, z) => b.add(new THREE.TorusGeometry(0.1, 0.035, 5, 10, Math.PI), lagoonGot ? "#7f98a8" : grey, [x, y - 0.05, z], [0, -a, 0]));
    cup(1.3, 2.66, sanctGot ? "#1f2a36" : grey, (x, y, z) => b.add(new THREE.ConeGeometry(0.06, 0.3, 3), sanctGot ? "#f4f6f8" : grey, [x, y + 0.02, z], [0, -a, 0], [1, 1, 0.4]));
    return b.build();
  }, [p.star, p.superStar, p.tunnel?.trophy, p.coast?.trophy, p.lagoon?.trophy, p.sanctuary?.trophy, best, a, t.x, t.z]);
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
  const reef = useMemo(() => createHubReef(), []);
  const statics = useMemo(() => {
    const b = new PartBuilder(0.5);
    b.cyl(T.plinthR, T.plinthR + 0.1, base, T.x, 0, T.z, "#d8c8a8", 40);
    b.cyl(T.plinthR + 0.05, T.plinthR + 0.05, 0.08, T.x, base - 0.08, T.z, "#d9a441", 40);
    b.cyl(T.r - 0.02, T.r - 0.02, 0.14, T.x, base, T.z, "#f0dfb5", 36);
    // Open rim (the camera looks down into the water), and a bottom band.
    b.add(new THREE.TorusGeometry(T.r + 0.04, 0.09, 6, 48), "#1d5c74", [T.x, base + T.h, T.z], [Math.PI / 2, 0, 0], [1, 1, 1], { vary: false });
    b.add(new THREE.TorusGeometry(T.r + 0.04, 0.07, 6, 48), "#d9a441", [T.x, base + 0.16, T.z], [Math.PI / 2, 0, 0], [1, 1, 1], { vary: false });
    const frame = b.build();
    const decor = reef.geometry.clone().translate(T.x, base + REEF_FLOOR, T.z);
    const merged = mergeGeometries([frame, decor], false);
    frame.dispose(); decor.dispose();
    return merged;
  }, [T.x, T.z, T.r, T.h, T.plinthR, base, reef]);
  useEffect(() => () => {
    statics.dispose(); reef.geometry.dispose(); reef.elements.forEach(e => e.geometry.dispose());
  }, [statics, reef]);
  const water = useMemo(() => new THREE.MeshLambertMaterial({ color: "#8fe0ee", transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }), []);
  const surface = useMemo(() => new THREE.MeshBasicMaterial({ color: "#b8f0f8", transparent: true, opacity: 0.2, depthWrite: false }), []);
  return (
    <group>
      <mesh geometry={statics} material={smoothMat} raycast={() => undefined} />
      <TankFish obstacles={reef.obstacles} />
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

/**
 * The display tank as a miniature reef: a few of each of five small-fish kinds
 * (smallFish.ts), one instanced draw per kind. Each kind keeps its own height
 * band and pace; colours are reef-bright but natural.
 */
const REEF: { kind: SmallFishKind; size: number; band: [number, number]; pace: number; looks: SmallFishLook[] }[] = [
  { kind: "tang", size: 0.43, band: [0.6, 2.5], pace: 0.24, looks: [
    { color: "#2f6fd6", accent: "#ffd23f" }, { color: "#3474dc", accent: "#ffcf3a" }, { color: "#f4c430", accent: "#f7d75a" }, { color: "#f2c12e", accent: "#f5d54f" }] },
  { kind: "chromis", size: 0.28, band: [0.65, 2.6], pace: 0.32, looks: [
    { color: "#5fc6d8", accent: "#7fd6e2" }, { color: "#55bfd3", accent: "#7ad3df" }, { color: "#62cadb", accent: "#86dae4" },
    { color: "#ffb21f", accent: "#ffd166" }, { color: "#f7a51b", accent: "#ffcc5c" }, { color: "#5b4bc4", accent: "#f4d03f" }] },
  { kind: "wrasse", size: 0.36, band: [0.35, 1.5], pace: 0.28, looks: [
    { color: "#3fa66b", accent: "#ff8fb1" }, { color: "#44a872", accent: "#f78fb3" }, { color: "#e5674d", accent: "#3fb2c9" }, { color: "#3c9e68", accent: "#ff9cba" }] },
  { kind: "snapper", size: 0.38, band: [0.7, 2.35], pace: 0.26, looks: [
    { color: "#e05a47", accent: "#f2a03d" }, { color: "#d9543f", accent: "#efa040" }, { color: "#f0d05a", accent: "#4f8fd6" }, { color: "#e2604a", accent: "#f0a542" }] },
  { kind: "sardine", size: 0.29, band: [1.6, 2.75], pace: 0.4, looks: [
    { color: "#6f8fa6", accent: "#9fb3c2" }, { color: "#6a8aa1", accent: "#9cb1c0" }, { color: "#7394aa", accent: "#a3b6c5" }, { color: "#6c8ca3", accent: "#9db2c1" }] }
];

function TankFish({ obstacles }: { obstacles: readonly THREE.Box3[] }) {
  const schools = useMemo(() => {
    const mat = smallFishMaterial(0.45);
    let seed = 0;
    return REEF.map((r) => {
      const m = smallFishMesh(r.kind, r.looks, mat);
      const fish = r.looks.map(() => {
        const i = seed++;
        const size = r.size * (0.88 + ((i * 29) % 10) / 60);
        return { path: createReefFishPath(i + 1, r.band, size, obstacles), pace: r.pace, phase: i * 7.13, s: size };
      });
      return { ...m, fish, mat };
    });
  }, [obstacles]);
  useEffect(() => () => { schools.forEach((s) => s.dispose()); schools[0]?.mat.dispose(); }, [schools]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (!hubShown()) return;
    const t = rt.time;
    smallFishTime.value = t;
    for (const s of schools) {
      s.fish.forEach((f, i) => {
        const { position, velocity } = sampleReefFishPath(f.path, t + f.phase, f.pace);
        dummy.position.set(HUB_TANK.x + position.x, HUB_TANK.plinth + REEF_FLOOR + position.y, HUB_TANK.z + position.z);
        // The existing fish models point +z; pitch and yaw both follow velocity.
        dummy.rotation.set(-Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z)), Math.atan2(velocity.x, velocity.z), 0, "YXZ");
        dummy.scale.setScalar(f.s);
        dummy.updateMatrix();
        s.mesh.setMatrixAt(i, dummy.matrix);
      });
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  });
  return <group>{schools.map((s, i) => <primitive key={i} object={s.mesh} />)}</group>;
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
  const person = useRef<THREE.Group>(null);
  const portal = useMemo(() => ({ active: { value: 0 }, portal: { value: new THREE.Vector3() } }), []);
  useEffect(() => {
    const materials = new Map<THREE.Material, THREE.Material>();
    const originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
    person.current?.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      originals.push({ mesh: object, material: object.material });
      const clone = (source: THREE.Material) => {
        if (!materials.has(source)) materials.set(source, clipToHubPortal(source.clone(), portal));
        return materials.get(source)!;
      };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    });
    return () => {
      originals.forEach(({ mesh, material }) => { mesh.material = material; });
      materials.forEach(material => material.dispose());
    };
  }, [portal]);
  useFrame((_, dt) => {
    const g = hubGroups.find((x) => x.id === groupId);
    const m = g?.members.find((x) => x.id === memberId);
    const q = pose.current;
    if (!g || !m || !g.visible) { q.visible = false; return; }
    const w = memberWorld(g, m);
    portal.active.value = g.door ? 1 : 0;
    if (g.door) {
      const origin = doorLocal(g.door, 0, 0);
      portal.portal.value.set(origin.x, origin.z, bayOf(g.door).angle);
    }
    q.visible = true;
    q.x = w.x; q.z = w.z; q.yaw = memberHeading(g, m);
    q.moving = g.speed > 0.12;
    q.step = g.phase;
    const arm = g.activity === "point" ? 0.95 : g.activity === "photo" ? 0.75 : 0;
    q.arm += (arm - q.arm) * Math.min(1, dt * 4);
    q.photo = g.activity === "photo";
    q.lookUp += ((g.activity === "look" ? 0.45 : 0) - q.lookUp) * Math.min(1, dt * 3);
    q.hop = 0;
  });
  return <group ref={person}><TunnelFigure model={model} pose={pose} name={`hub-visitor-${memberId}`} /></group>;
}

function HubVisitors() {
  const [ids, setIds] = useState<{ g: string; m: string }[]>([]);
  const last = useRef("");
  useFrame((_, dt) => {
    stepHubVisitors(Math.min(dt, 0.1), hubShown(), getGame().model.progress);
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
      <HubShell />
      <HubCoastWindow />
      {(["indoor", "lagoon", "sanctuary", "sharks", "coast"] as HubDestination[]).map((k) => <Door key={k} kind={k} />)}
      <Barriers />
      <HubDoorClosures />
      <Trophies />
      <DisplayTank />
      <Plaza />
      <HubVisitors />
      <HubReview />
    </group>
  );
}
