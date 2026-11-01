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
import { COUNT_BEAT, COUNT_LABEL_SIZE, countLabelPosition } from "../game/logic/counting";
import { SAND_H, STAND_H, TANKS } from "../game/data/tanks";
import { tankOrigin } from "../game/world";
import { sandDune } from "../game/logic/tankLayout";
import { containEel, createGroundPose, groundAnimal } from "./grounding";

/** Every animal's mesh and its per-frame pose (positions come from rt.fish, set by the sim). */

function tankFor(tankId: string): TankRec | undefined {
  for (const tank of getGame().model.tanks) if (tank.id === tankId) return tank;
  return undefined;
}

// ------------------------------------------------------------------ fish

/** Whole-body counting clue (one at a time); request hints use a rim to preserve colour. */
function glowFor(id: string, tank: TankRec | undefined, t: number): number {
  let want = 0;
  const cg = rt.countGlow;
  if (cg && tank && cg.tankId === tank.id) {
    const i = cg.numbers.findIndex((x) => x.fishId === id);
    const k = t - cg.t0 - i * COUNT_BEAT;
    if (i >= 0 && k >= 0 && k < COUNT_BEAT) want = 0.9;
  }
  return want;
}

const countTextures = new Map<number, THREE.CanvasTexture>();
function countTexture(n: number) {
  const cached = countTextures.get(n);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fillStyle = "#fff8cc";
  ctx.fill();
  ctx.strokeStyle = "#184653";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = "#184653";
  ctx.font = "bold 84px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  countTextures.set(n, texture);
  return texture;
}

/** Fixed eight-sprite pool: no React updates or texture creation during animation. */
export function CountNumbers() {
  const group = useRef<THREE.Group>(null);
  const labels = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const material = new THREE.SpriteMaterial({ map: countTexture(i + 1), depthTest: false, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 100;
    sprite.raycast = () => undefined;
    return sprite;
  }), []);
  const projected = useMemo(() => labels.map(() => new THREE.Vector3()), [labels]);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useEffect(() => () => labels.forEach((s) => s.material.dispose()), [labels]);
  useFrame(({ camera, size }) => {
    const g = getGame();
    const sequence = rt.countGlow;
    const tank = sequence && g.view === "tank" && g.tankId === sequence.tankId
      ? g.model.tanks.find((t) => t.id === sequence.tankId) : undefined;
    labels.forEach((sprite) => { sprite.visible = false; });
    if (!sequence || !tank || !group.current) return;
    const origin = tankOrigin(tank.slot);
    const def = TANKS[tank.type];
    for (let i = 0; i < Math.min(labels.length, sequence.numbers.length); i++) {
      const fish = rt.fish.get(sequence.numbers[i].fishId);
      const age = rt.time - sequence.t0 - i * COUNT_BEAT;
      if (!fish || age < 0) continue;
      const sprite = labels[i];
      sprite.visible = true;
      const baseY = fish.s.y + SPECIES[fish.species].radius * 0.65 + COUNT_LABEL_SIZE / 2 + 0.015;
      const baseX = baseY > def.h - COUNT_LABEL_SIZE / 2 - 0.15
        ? fish.s.x + (fish.s.x < 0 ? -1 : 1) * (SPECIES[fish.species].radius + COUNT_LABEL_SIZE / 2 + 0.02)
        : fish.s.x;
      // Try nearby positions in camera space, keeping every candidate within the water.
      const offsets = [[0, 0], [0, 0.22], [0.22, 0], [-0.22, 0], [0.22, -0.22], [-0.22, -0.22], [0, -0.22], [0, -0.44]];
      for (const [dx, dy] of offsets) {
        const pos = countLabelPosition(baseX + dx, baseY + dy, def);
        sprite.position.set(origin.x + pos.x, origin.y + pos.y, origin.z + fish.s.z);
        projected[i].copy(sprite.position).project(camera);
        let overlaps = false;
        for (let j = 0; j < i; j++) {
          if (labels[j].visible && Math.abs(projected[i].x - projected[j].x) * size.width / 2 < 42 &&
            Math.abs(projected[i].y - projected[j].y) * size.height / 2 < 42) overlaps = true;
        }
        if (!overlaps) break;
      }
      projected[i].copy(sprite.position).project(camera);
      const p = Math.min(1, age / 0.28);
      const pop = reduced ? 1 : 1 + 2.3 * (p - 1) ** 3 + 1.3 * (p - 1) ** 2;
      sprite.scale.setScalar(COUNT_LABEL_SIZE * Math.max(0.01, pop));
    }
  });
  return <group ref={group}>{labels.map((sprite, i) => <primitive key={i} object={sprite} dispose={null} />)}</group>;
}

function hintRim(id: string): number {
  return rt.glow.fish.has(id) ? 0.6 + Math.sin(rt.time * Math.PI * 2 * 1.15) * 0.12 : 0;
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
  const support = useMemo(createGroundPose, [species]);
  const travel = useRef({ phase: 0, x: NaN, z: NaN });
  const turn = useRef(0);
  const terrain = useRef({ tank: "", slot: "" });
  useFrame((_, dt) => {
    const f = rt.fish.get(id);
    const mesh = ref.current;
    if (!f || !mesh) return;
    const t = rt.time;
    const ht = t - f.happyT0;
    const tt = t - f.tapT0;
    const et = t - f.eatT0;
    const ground = def.body === "crab" || def.body === "octopus" || def.movement === "perch";
    const happy = ht >= 0 && ht < 1.2 ? Math.sin(ht / 1.2 * Math.PI) : 0;
    const tap = tt >= 0 && tt < 0.6 ? Math.sin(tt / 0.6 * Math.PI) : 0;
    const eat = et >= 0 && et < 0.35 ? Math.sin(et / 0.35 * Math.PI) : 0;
    const motion = Math.min(1.5, Math.hypot(f.s.vx, f.s.vy, f.s.vz) / def.speed);
    const tank = tankFor(tankId);
    if (!tank) return;
    const tankDef = TANKS[tank.type];
    if (Number.isFinite(travel.current.x)) {
      const distance = Math.hypot(f.s.x - travel.current.x, f.s.z - travel.current.z);
      travel.current.phase += Math.min(distance, 0.08) / (def.length * (species === "crab" ? 0.28 : 0.45)) * Math.PI * 2;
    }
    travel.current.x = f.s.x; travel.current.z = f.s.z;
    const phase = species === "crab" || species === "octopus" ? travel.current.phase : def.movement === "drift" ? f.pulsePhase ?? f.phase : f.phase;
    const reaction = Math.max(tap, eat * 0.5);
    mesh.position.set(f.s.x, f.s.y + (ground ? 0 : happy * 0.035 + tap * 0.025), f.s.z);
    // Ground animals acknowledge taps by rocking their shell/mantle above planted feet.
    const roll = ground ? 0 : f.bank + happy * 0.18;
    const pitch = ground ? (happy + tap) * 0.08 : f.pitch * 0.7;
    mesh.rotation.set(roll, f.yaw, pitch, "YZX");
    mesh.scale.setScalar(ground ? 1 : 1 + eat * 0.07);
    mat.userData.uGroundEnabled.value = ground ? 1 : 0;
    if (ground) {
      const elevated = Math.max(0, f.s.y - (SAND_H + def.radius + 0.03));
      groundAnimal(support, species, tankDef, f.s.x, f.s.z, f.yaw, phase, motion, reaction, t, dt, elevated);
      mesh.position.set(support.x, support.y, support.z);
      mesh.rotation.copy(support.euler);
      mat.userData.uFeet.value.set(support.feet);
      if (terrain.current.tank !== tank.type || terrain.current.slot !== tank.slot) {
        const dune = sandDune(tankDef), origin = tankOrigin(tank.slot);
        mat.userData.uSand.value.set(origin.x + dune.x, origin.z + dune.z, dune.radius, STAND_H + SAND_H);
        terrain.current.tank = tank.type; terrain.current.slot = tank.slot;
      }
    } else if (species === "eel") {
      containEel(support.point, tankDef, f.s.x, f.s.y, f.s.z, f.yaw);
      mesh.position.copy(support.point);
      mesh.rotation.set(0, f.yaw, 0, "YZX");
      mesh.scale.setScalar(1);
    }
    mat.userData.uPhase.value = phase;
    mat.userData.uMotion.value = motion;
    mat.userData.uColour.value = f.colourPhase ?? 0;
    mat.userData.uReaction.value = reaction;
    turn.current += (THREE.MathUtils.clamp(f.bank * 2.5, -1, 1) - turn.current) * Math.min(1, dt * 3);
    mat.userData.uTurn.value = turn.current;
    glow.current += (glowFor(id, tank, t) - glow.current) * Math.min(1, dt * 10);
    mat.userData.uHintGlow.value = hintRim(id);
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
    mat.userData.uReaction.value = response;
    mat.userData.uTurn.value = THREE.MathUtils.clamp(f.bank * 2.5, -1, 1);
    const tank = tankFor(tankId);
    glow.current += (glowFor(id, tank, rt.time) - glow.current) * Math.min(1, dt * 10);
    mat.userData.uHintGlow.value = hintRim(id);
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
    const reaction = Math.max(tt >= 0 && tt < 0.6 ? Math.sin(tt / 0.6 * Math.PI) : 0, et >= 0 && et < 0.35 ? Math.sin(et / 0.35 * Math.PI) : 0);
    mat.userData.uMotion.value = Math.min(1.8, Math.hypot(f.s.vx, f.s.vy, f.s.vz) / def.speed);
    mat.userData.uTurn.value = THREE.MathUtils.clamp(f.bank * 2.5, -1, 1);
    mat.userData.uReaction.value = reaction;
    mat.userData.uAmp.value = upright ? 0 : def.tailAmp * (hungry ? 0.75 : 1) * (1 - puff.current * 0.7);
    glow.current += (glowFor(id, tank, t) - glow.current) * Math.min(1, dt * 10);
    mat.userData.uHintGlow.value = hintRim(id);
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
    m.position.set(f.s.x, f.s.y, f.s.z);
    m.rotation.set(Math.sin(t * 0.7 + f.phase * 0.01) * 0.1, f.yaw * 0.3, Math.cos(t * 0.6) * 0.08);
    m.scale.setScalar(1);
    mat.userData.uPhase.value = f.pulsePhase ?? f.phase;
    mat.userData.uMotion.value = Math.min(1.8, Math.hypot(f.s.vx, f.s.vy, f.s.vz) / SPECIES.jellyfish.speed);
    mat.userData.uTurn.value = THREE.MathUtils.clamp(f.bank * 2.5, -1, 1);
    const tank = getGame().model.tanks.find((x) => x.id === tankId);
    glow.current += (glowFor(id, tank, t) - glow.current) * Math.min(1, dt * 10);
    mat.userData.uHintGlow.value = hintRim(id);
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
    mat.userData.uHintGlow.value = hintRim(id);
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
