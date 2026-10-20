import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, useGame } from "../game/store";
import { rt } from "../game/runtime";
import { DOOR, PEDESTAL, ROOM } from "../game/world";
import { SLOT_ORDER, SLOT_POS, STAND_H, TANKS } from "../game/data/tanks";
import type { SlotId, TankType } from "../game/types";
import { tapPad } from "../game/flow/actions";
import { PartBuilder } from "./partBuilder";
import { roomGeometry, ropeGeometry, tankShellGeometry } from "./models/room";
import { flatMat, floorTexture, muralTexture, padIconTexture, posterTexture, signTexture, smoothMat } from "./materials";

export function Room() {
  const shell = useMemo(() => roomGeometry(), []);
  const rope = useMemo(() => ropeGeometry(), []);
  const w = ROOM.maxX - ROOM.minX;
  const d = ROOM.maxZ - ROOM.minZ;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (ROOM.minZ + ROOM.maxZ) / 2]}>
        <planeGeometry args={[w, d]} />
        <meshLambertMaterial map={floorTexture()} />
      </mesh>
      {/* Outside the door: bright daylight. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM.minX - 1.6, 0.001, DOOR.z]}>
        <planeGeometry args={[3, 3]} />
        <meshBasicMaterial color="#fff6d6" />
      </mesh>
      <mesh position={[ROOM.minX - 2.4, 1.6, DOOR.z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[4, 3.2]} />
        <meshBasicMaterial color="#e9fbff" />
      </mesh>
      <mesh geometry={shell} material={flatMat} />
      <mesh geometry={rope} material={smoothMat} />
      {/* The mural on the back wall, and the aquarium's name. */}
      <mesh position={[0, 1.55, ROOM.minZ + 0.005]}>
        <planeGeometry args={[w - 0.6, 2.7]} />
        <meshBasicMaterial map={muralTexture()} toneMapped={false} />
      </mesh>
      <Sign />
      <mesh position={[ROOM.minX + 0.12, 1.6, -2.3]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.0, 0.75]} />
        <meshBasicMaterial map={posterTexture("clown")} />
      </mesh>
      <mesh position={[ROOM.maxX - 0.12, 1.6, -1.0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.0, 0.75]} />
        <meshBasicMaterial map={posterTexture("tang")} />
      </mesh>
      <mesh position={[ROOM.minX + 0.13, 2.62, DOOR.z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.5, 0.38]} />
        <meshBasicMaterial map={signTexture("WELCOME", "#ff8a3d", "#ffffff", 512, 128)} />
      </mesh>
      <Photo />
      <Trophy />
      {SLOT_ORDER.map((s) => (
        <Pad key={s} slot={s} />
      ))}
    </group>
  );
}

function Sign() {
  const star = useGame((s) => s.model.progress.star);
  return (
    <mesh position={[0, 2.86, ROOM.minZ + 0.02]}>
      <planeGeometry args={[3.4, 0.62]} />
      <meshBasicMaterial map={signTexture(star ? "★ MY AQUARIUM ★" : "MY AQUARIUM", "#1f7ae0", "#ffffff", 768, 140)} transparent />
    </mesh>
  );
}

/** The fish fan's framed photo (Stage 4 reward). */
function Photo() {
  const photo = useGame((s) => s.model.progress.photo);
  if (!photo) return null;
  return (
    <group position={[0, 1.9, ROOM.minZ + 0.03]}>
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[1.25, 0.98]} />
        <meshLambertMaterial color="#ffcc33" />
      </mesh>
      <mesh>
        <planeGeometry args={[1.1, 0.83]} />
        <meshBasicMaterial map={posterTexture("photo")} />
      </mesh>
    </group>
  );
}

function trophyGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const gold = "#ffc933";
  b.cyl(0.18, 0.22, 0.08, 0, 0, 0, "#8a5a2b", 14);
  b.cyl(0.05, 0.1, 0.2, 0, 0.08, 0, gold, 12);
  b.add(new THREE.CylinderGeometry(0.2, 0.08, 0.3, 16, 1, true), gold, [0, 0.43, 0]);
  b.add(new THREE.SphereGeometry(0.08, 10, 8), gold, [0, 0.29, 0]);
  for (const s of [-1, 1]) b.torus(0.08, 0.02, [s * 0.22, 0.45, 0], [0, 0, 0], gold);
  // The star on top.
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.05 : 0.12;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  b.add(new THREE.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: false }), "#fff07a", [0, 0.72, -0.015]);
  return b.build();
}

function Trophy() {
  const star = useGame((s) => s.model.progress.star);
  const geo = useMemo(() => trophyGeometry(), []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = rt.time * 0.8;
  });
  if (!star) return null;
  return <mesh ref={ref} geometry={geo} material={smoothMat} position={[PEDESTAL.x, 0.98, PEDESTAL.z]} />;
}

/** An empty tank pad: dashed outline, a lock or a "+", and the placement preview. */
function Pad({ slot }: { slot: SlotId }) {
  const taken = useGame((s) => s.model.tanks.some((t) => t.slot === slot));
  const unlocked = useGame((s) => s.model.progress.stage >= 4);
  const placing = useGame((s) => (s.placing?.kind === "tank" ? s.placing : null));
  const p = SLOT_POS[slot];
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }), []);
  useFrame(() => {
    const on = Boolean(getGame().placing?.kind === "tank");
    ringMat.color.set(on ? "#7dffb0" : "#ffffff");
    ringMat.opacity = on ? 0.6 + Math.sin(rt.time * 5) * 0.3 : 0.55;
  });
  if (taken) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    tapPad(slot);
  };
  const type: TankType = placing?.type ?? "big";
  const def = TANKS[type];
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} material={ringMat}>
        <ringGeometry args={[1.25, 1.4, 4, 1, Math.PI / 4]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <planeGeometry args={[2.4, 1.6]} />
        <meshBasicMaterial color="#9fd8e8" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <PadIcon locked={!unlocked} />
      {placing?.slot === slot && <Preview type={def.type} />}
      <mesh position={[0, 0.6, 0]} onClick={onClick}>
        <boxGeometry args={[2.6, 1.2, 1.8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

function PadIcon({ locked }: { locked: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) {
      ref.current.position.y = 0.55 + Math.sin(rt.time * 2) * 0.05;
      ref.current.visible = !getGame().placing;
    }
  });
  return (
    <group ref={ref}>
      <sprite scale={[0.7, 0.7, 1]}>
        <spriteMaterial map={padIconTexture(locked ? "lock" : "plus")} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

/** A see-through tank showing where the new one will stand. */
function Preview({ type }: { type: TankType }) {
  const geo = useMemo(() => tankShellGeometry(type), [type]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }), []);
  const def = TANKS[type];
  return (
    <group>
      <mesh geometry={geo} material={mat} />
      <mesh position={[0, STAND_H + def.h / 2, 0]}>
        <boxGeometry args={[def.w, def.h, def.d]} />
        <meshBasicMaterial color="#7fe0ff" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}
