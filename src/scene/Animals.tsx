import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getGame } from "../game/store";
import { rt } from "../game/runtime";
import { SPECIES } from "../game/data/fish";
import { isHungry, type TankRec } from "../game/logic/model";
import type { SpeciesId } from "../game/types";
import { fishGeometry, turtleModel } from "./models/fish";
import { fishMaterial } from "./materials";
import { animalGeometry } from "./models/animals";
import { animalMaterial } from "./animalMaterials";

/** Every animal's mesh and its per-frame pose (positions come from rt.fish, set by the sim). */

function tankFor(tankId: string): TankRec | undefined {
  for (const tank of getGame().model.tanks) if (tank.id === tankId) return tank;
  return undefined;
}

// ------------------------------------------------------------------ fish

/** Hint glow wanted for an animal: the "show me" rescue, "What's this?", or the counting clue (one at a time). */
function glowFor(id: string, tank: TankRec | undefined, t: number): number {
  let want = rt.glow.fish.has(id) ? 0.6 + Math.sin(t * 6) * 0.3 : 0;
  const cg = rt.countGlow;
  if (cg && tank && cg.tankId === tank.id) {
    const i = tank.fish.findIndex((x) => x.id === id);
    const k = ((t - cg.t0) % (tank.fish.length * 0.9 + 1.2)) - i * 0.9;
    if (k >= 0 && k < 0.8) want = 0.9;
  }
  return want;
}

/** Every animal: fish (and the pufferfish and seahorse) bend; the jellyfish pulses; the turtle paddles. */
export function FishMesh({ id, species, tankId }: { id: string; species: SpeciesId; tankId: string }) {
  const body = SPECIES[species].body;
  if (body === "turtle") return <TurtleMesh id={id} tankId={tankId} />;
  if (body === "jelly" && species === "jellyfish") return <JellyMesh id={id} tankId={tankId} />;
  if (body === "school") return <SchoolMesh id={id} species={species} tankId={tankId} />;
  if (body === "eel" || body === "octopus" || body === "crab" || body === "ray" || body === "jelly" || species === "angelfish" || species === "goby") {
    return <ExpansionMesh id={id} species={species} tankId={tankId} />;
  }
  return <BendingFish id={id} species={species} tankId={tankId} />;
}

/** A merged, vertex-animated animal: one draw call including eyes and markings. */
function ExpansionMesh({ id, species, tankId }: { id: string; species: SpeciesId; tankId: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const def = SPECIES[species];
  const mat = useMemo(() => animalMaterial(species), [species]);
  useEffect(() => () => mat.dispose(), [mat]);
  const glow = useRef(0);
  useFrame((_, dt) => {
    const f = rt.fish.get(id);
    const mesh = ref.current;
    if (!f || !mesh) return;
    const t = rt.time;
    const ht = t - f.happyT0;
    const tt = t - f.tapT0;
    const et = t - f.eatT0;
    const ground = def.body === "crab" || def.body === "octopus" || (def.movement === "perch" && f.mode === "rest");
    const happy = ht >= 0 && ht < 1.2 ? Math.sin(ht / 1.2 * Math.PI) : 0;
    const tap = tt >= 0 && tt < 0.6 ? Math.sin(tt / 0.6 * Math.PI) : 0;
    const eat = et >= 0 && et < 0.35 ? Math.sin(et / 0.35 * Math.PI) : 0;
    const motion = Math.min(1.5, Math.hypot(f.s.vx, f.s.vy, f.s.vz) / def.speed);
    mesh.position.set(f.s.x, f.s.y + (ground ? 0 : happy * 0.035 + tap * 0.025), f.s.z);
    // Ground animals acknowledge taps by rocking their shell/mantle above planted feet.
    const roll = ground ? 0 : f.bank + happy * 0.18;
    const pitch = ground ? (happy + tap) * 0.08 : f.pitch * 0.7;
    mesh.rotation.set(roll, f.yaw, pitch, "YZX");
    mesh.scale.setScalar(1 + eat * 0.07);
    mat.userData.uPhase.value = def.movement === "drift" ? f.pulsePhase ?? f.phase : f.phase;
    mat.userData.uMotion.value = motion + happy * 0.5 + tap * 0.5;
    mat.userData.uColour.value = f.colourPhase ?? 0;
    const tank = tankFor(tankId);
    glow.current += (glowFor(id, tank, t) - glow.current) * Math.min(1, dt * 10);
    mat.emissive.setRGB(glow.current * 0.6, glow.current * 0.5, glow.current * 0.12);
  });
  return <mesh ref={ref} geometry={animalGeometry(species)} material={mat} renderOrder={def.body === "jelly" ? 1 : 0} dispose={null} />;
}

/** Six chromis share geometry, material and one instanced draw call. */
function SchoolMesh({ id, species, tankId }: { id: string; species: SpeciesId; tankId: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const def = SPECIES[species];
  const geometry = animalGeometry(species);
  const mat = useMemo(() => animalMaterial(species), [species]);
  const pose = useMemo(() => new THREE.Object3D(), []);
  const glow = useRef(0);
  useEffect(() => {
    ref.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return () => mat.dispose();
  }, [mat]);
  useFrame((_, dt) => {
    const f = rt.fish.get(id);
    const mesh = ref.current;
    if (!f || !mesh) return;
    const ht = rt.time - f.happyT0;
    const tt = rt.time - f.tapT0;
    const response = Math.max(ht >= 0 && ht < 1 ? Math.sin(ht * Math.PI) : 0, tt >= 0 && tt < 0.6 ? Math.sin(tt / 0.6 * Math.PI) : 0);
    for (let i = 0; i < (def.school ?? 1); i++) {
      const s = i === 0 ? f.s : f.members?.[i - 1] ?? f.s;
      const heading = Math.hypot(s.vx, s.vz) > 0.01 ? Math.atan2(-s.vz, s.vx) : f.yaw;
      pose.position.set(s.x, s.y + response * 0.02, s.z);
      pose.rotation.set(f.bank + response * 0.15, heading, f.pitch * 0.5, "YZX");
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mat.userData.uPhase.value = f.phase;
    mat.userData.uMotion.value = 1 + response;
    const tank = tankFor(tankId);
    glow.current += (glowFor(id, tank, rt.time) - glow.current) * Math.min(1, dt * 10);
    mat.emissive.setRGB(glow.current * 0.6, glow.current * 0.5, glow.current * 0.12);
  });
  return <instancedMesh ref={ref} args={[geometry, mat, def.school ?? 1]} frustumCulled={false} dispose={null} />;
}

function BendingFish({ id, species, tankId }: { id: string; species: SpeciesId; tankId: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const def = SPECIES[species];
  const mat = useMemo(() => fishMaterial(def.length, species), [def.length, species]);
  useEffect(() => () => mat.dispose(), [mat]);
  const glow = useRef(0);
  const puff = useRef(0);
  useFrame((_, dt) => {
    const f = rt.fish.get(id);
    const m = ref.current;
    if (!f || !m) return;
    const t = rt.time;
    const upright = def.body === "upright";
    let roll = upright ? 0 : f.bank;
    let pitch = upright ? Math.sin(t * 1.3 + f.phase * 0.05) * 0.08 : f.pitch;
    let lift = 0;
    let scale = 1;
    const ht = t - f.happyT0;
    const tt = t - f.tapT0;
    if (def.body === "puffer") {
      // Puffs up round when tapped or happy, then slowly lets go.
      const since = Math.min(ht, tt);
      const want = since >= 0 && since < 2.4 ? 1 : 0;
      puff.current += (want - puff.current) * Math.min(1, dt * (want ? 7 : 1.5));
      scale = 1 + puff.current * 0.5;
    } else if (upright) {
      if (ht >= 0 && ht < 0.9) lift = Math.sin((ht / 0.9) * Math.PI) * 0.08;
    } else if (ht >= 0 && ht < 0.9) {
      roll += THREE.MathUtils.smootherstep(ht / 0.9, 0, 1) * Math.PI * 2;
    }
    if (tt >= 0 && tt < 0.5) lift += Math.sin((tt / 0.5) * Math.PI) * 0.06;
    const et = t - f.eatT0;
    if (et >= 0 && et < 0.35) scale *= 1 + Math.sin((et / 0.35) * Math.PI) * 0.14;
    const tank = getGame().model.tanks.find((x) => x.id === tankId);
    const hungry = tank ? isHungry(tank) : false;
    if (hungry && !upright) pitch -= 0.12;
    // Idle bob so a resting animal still looks alive.
    const bob = Math.sin(t * 2 + f.phase * 0.1) * (upright ? 0.015 : 0.006);
    m.position.set(f.s.x, f.s.y + lift + bob, f.s.z);
    m.rotation.set(roll, f.yaw, pitch, "YZX");
    m.scale.setScalar(scale);
    mat.userData.uPhase.value = f.phase;
    mat.userData.uAmp.value = upright ? 0 : def.tailAmp * (hungry ? 0.75 : 1) * (1 - puff.current * 0.7);
    glow.current += (glowFor(id, tank, t) - glow.current) * Math.min(1, dt * 10);
    mat.emissive.setRGB(glow.current * 0.6, glow.current * 0.5, glow.current * 0.12);
  });
  return <mesh ref={ref} geometry={fishGeometry(species)} material={mat} />;
}

/** The jellyfish: a see-through bell that pulses as it drifts. */
function JellyMesh({ id, tankId }: { id: string; tankId: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const m = fishMaterial(SPECIES.jellyfish.length, "jellyfish");
    m.userData.uAmp.value = 0;
    m.transparent = true;
    m.opacity = 0.78;
    m.depthWrite = false;
    m.emissive.setRGB(0.12, 0.04, 0.2);
    return m;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  const glow = useRef(0);
  useFrame((_, dt) => {
    const f = rt.fish.get(id);
    const m = ref.current;
    if (!f || !m) return;
    const t = rt.time;
    const p = Math.sin(f.pulsePhase ?? f.phase);
    const happy = t - f.happyT0 < 1.2 || t - f.tapT0 < 1.2;
    m.position.set(f.s.x, f.s.y + p * 0.02, f.s.z);
    m.rotation.set(Math.sin(t * 0.7 + f.phase * 0.01) * 0.1, f.yaw * 0.3, Math.cos(t * 0.6) * 0.08);
    const k = happy ? 0.2 : 0.12;
    m.scale.set(1 + p * k, 1 - p * k * 0.8, 1 + p * k);
    const tank = getGame().model.tanks.find((x) => x.id === tankId);
    glow.current += (glowFor(id, tank, t) - glow.current) * Math.min(1, dt * 10);
    mat.emissive.setRGB(0.12 + glow.current * 0.6, 0.04 + glow.current * 0.5, 0.2 + glow.current * 0.1);
  });
  return <mesh ref={ref} geometry={fishGeometry("jellyfish")} material={mat} renderOrder={1} />;
}

/** The sea turtle: a rigid shell with four paddling flippers. */
function TurtleMesh({ id, tankId }: { id: string; tankId: string }) {
  const model = turtleModel();
  const group = useRef<THREE.Group>(null);
  const flippers = useRef<(THREE.Mesh | null)[]>([]);
  const mat = useMemo(() => {
    const m = fishMaterial(SPECIES.turtle.length, "turtle");
    m.userData.uAmp.value = 0;
    return m;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  const glow = useRef(0);
  const a = SPECIES.turtle.length * 0.42;
  useFrame((_, dt) => {
    const f = rt.fish.get(id);
    const g = group.current;
    if (!f || !g) return;
    const t = rt.time;
    const ht = t - f.happyT0;
    const roll = ht >= 0 && ht < 1.4 ? Math.sin((ht / 1.4) * Math.PI * 2) * 0.35 : f.bank * 0.6;
    g.position.set(f.s.x, f.s.y + Math.sin(t * 0.9 + f.phase * 0.1) * 0.01, f.s.z);
    g.rotation.set(roll, f.yaw, f.pitch * 0.6, "YZX");
    // Front flippers sweep together; back flippers steer a little.
    const sweep = Math.sin(f.phase);
    flippers.current.forEach((m, i) => {
      if (!m) return;
      const front = i < 2;
      const side = i % 2 ? -1 : 1;
      m.rotation.x = side * (front ? sweep * 0.55 : sweep * 0.2);
      m.rotation.y = front ? sweep * 0.25 * side : 0;
    });
    const tank = getGame().model.tanks.find((x) => x.id === tankId);
    glow.current += (glowFor(id, tank, t) - glow.current) * Math.min(1, dt * 10);
    mat.emissive.setRGB(glow.current * 0.6, glow.current * 0.5, glow.current * 0.12);
  });
  const spots: [number, number, number, number, THREE.BufferGeometry][] = [
    [a * 0.4, -0.01, a * 0.62, 1, model.front],
    [a * 0.4, -0.01, -a * 0.62, -1, model.front],
    [-a * 0.62, -0.03, a * 0.5, 1, model.back],
    [-a * 0.62, -0.03, -a * 0.5, -1, model.back]
  ];
  return (
    <group ref={group}>
      <mesh geometry={model.body} material={mat} />
      {spots.map(([x, y, z, side, geo], i) => (
        <mesh key={i} ref={(m) => void (flippers.current[i] = m)} geometry={geo} material={mat} position={[x, y, z]} scale={[1, 1, side]} />
      ))}
    </group>
  );
}
