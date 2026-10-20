import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, useGame } from "../game/store";
import { rt } from "../game/runtime";
import { DOOR, HALL2, HALL_DOOR, PEDESTAL, ROOM } from "../game/world";
import { PAD_TYPES, SLOT_ORDER, SLOT_POS, STAND_H, TANKS } from "../game/data/tanks";
import type { SlotId, TankType } from "../game/types";
import { tapHallDoor, tapPad } from "../game/flow/actions";
import { PartBuilder } from "./partBuilder";
import { hall2Geometry, roomGeometry, ropeGeometry, tankShellGeometry } from "./models/room";
import { flatMat, floor2Texture, floorTexture, muralTexture, oceanMuralTexture, padIconTexture, posterTexture, signTexture, smoothMat } from "./materials";

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
      <HallDoor />
      <OceanHall />
      {SLOT_ORDER.map((s) => (
        <Pad key={s} slot={s} />
      ))}
    </group>
  );
}

/** The Ocean Hall (Phase 2): drawn once it is open. */
function OceanHall() {
  const open = useGame((s) => s.model.progress.hallOpen);
  const shell = useMemo(() => (open ? hall2Geometry() : null), [open]);
  if (!open || !shell) return null;
  const w = HALL2.maxX - HALL2.minX;
  const d = HALL2.maxZ - HALL2.minZ;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(HALL2.minX + HALL2.maxX) / 2, 0, (HALL2.minZ + HALL2.maxZ) / 2]}>
        <planeGeometry args={[w, d]} />
        <meshLambertMaterial map={floor2Texture()} />
      </mesh>
      <mesh geometry={shell} material={flatMat} />
      <mesh position={[(HALL2.minX + HALL2.maxX) / 2, 1.55, HALL2.minZ + 0.005]}>
        <planeGeometry args={[w - 0.6, 2.7]} />
        <meshBasicMaterial map={oceanMuralTexture()} toneMapped={false} />
      </mesh>
      <mesh position={[(HALL2.minX + HALL2.maxX) / 2, 2.86, HALL2.minZ + 0.02]}>
        <planeGeometry args={[3.4, 0.62]} />
        <meshBasicMaterial map={signTexture("OCEAN HALL", "#0f5c8f", "#ffffff", 768, 140)} transparent />
      </mesh>
    </group>
  );
}

/** The door between the halls: locked with a sign until the Ocean Hall is bought, then it swings open. */
function HallDoor() {
  const open = useGame((s) => s.model.progress.hallOpen);
  const leaf = useRef<THREE.Group>(null);
  const angle = useRef(open ? 1 : 0);
  useFrame((_, dt) => {
    angle.current += ((open ? 1 : 0) - angle.current) * Math.min(1, dt * 2);
    if (leaf.current) leaf.current.rotation.y = -angle.current * 1.75;
  });
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8 || open) return;
    e.stopPropagation();
    tapHallDoor();
  };
  const z0 = HALL_DOOR.z - HALL_DOOR.w / 2;
  return (
    <group position={[HALL_DOOR.x - 0.02, 0, z0]}>
      <group ref={leaf}>
        <mesh position={[0, 1.15, HALL_DOOR.w / 2]} onClick={onClick}>
          <boxGeometry args={[0.08, 2.3, HALL_DOOR.w]} />
          <meshLambertMaterial color="#2f8fc4" />
        </mesh>
        <mesh position={[-0.05, 1.45, HALL_DOOR.w / 2]} rotation={[0, -Math.PI / 2, 0]}>
          <circleGeometry args={[0.32, 20]} />
          <meshBasicMaterial color="#9fe3ff" />
        </mesh>
        {!open && (
          <>
            <mesh position={[-0.05, 2.0, HALL_DOOR.w / 2]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[1.5, 0.36]} />
              <meshBasicMaterial map={signTexture("OCEAN HALL", "#0f5c8f", "#ffffff", 512, 128)} />
            </mesh>
            <sprite position={[-0.25, 0.9, HALL_DOOR.w / 2]} scale={[0.5, 0.5, 1]}>
              <spriteMaterial map={padIconTexture("lock")} transparent depthWrite={false} />
            </sprite>
          </>
        )}
      </group>
    </group>
  );
}

function Sign() {
  const star = useGame((s) => s.model.progress.star);
  // Hidden in close-ups, where it showed cut off above the tank.
  const closeUp = useGame((s) => s.view === "tank");
  return (
    <mesh position={[0, 2.86, ROOM.minZ + 0.02]} visible={!closeUp}>
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
  const hallOpen = useGame((s) => s.model.progress.hallOpen);
  const placing = useGame((s) => (s.placing?.kind === "tank" ? s.placing : null));
  const p = SLOT_POS[slot];
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, depthWrite: false }), []);
  useFrame(() => {
    const pl = getGame().placing;
    // Only pads that take the carried tank light up.
    const on = pl?.kind === "tank" && PAD_TYPES[slot].includes(pl.type);
    ringMat.color.set(on ? "#7dffb0" : "#ffffff");
    ringMat.opacity = on ? 0.6 + Math.sin(rt.time * 5) * 0.3 : 0.55;
  });
  // The Ocean tank's pad (C) is never empty once the hall is open; D and E only exist then.
  if (taken || slot === "C" || (slot !== "A" && slot !== "B" && !hallOpen)) return null;
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
