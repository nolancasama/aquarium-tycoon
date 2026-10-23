import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getGame, useGame } from "../game/store";
import { rt } from "../game/runtime";
import { SPECIES } from "../game/data/fish";
import { decorVersion } from "../game/data/decor";
import { SAND_H, SLOT_POS, STAND_H, TANKS } from "../game/data/tanks";
import { happiness, isDirty, isHungry, mood, type PlacedDecor, type TankRec } from "../game/logic/model";
import type { SpeciesId } from "../game/types";
import { tapDecor, tapFish, tapSlot, tapTank } from "../game/flow/actions";
import { tankShellGeometry } from "./models/room";
import { fishGeometry, turtleModel } from "./models/fish";
import { decorModel } from "./models/decor";
import { additiveSprite, algaeTexture, badgeTexture, flatMat, fishMaterial, glassTexture, glowTexture, shaderTime, shadowMaterial, surfaceMaterial, tankShellMaterial, waterMaterial } from "./materials";
import { project, FOV } from "./CameraRig";

/** Every placed tank. */
export function Tanks() {
  const tanks = useGame((s) => s.model.tanks);
  return (
    <>
      {tanks.map((t) => (
        <Tank key={t.id} tank={t} />
      ))}
    </>
  );
}

const dirtOf = (clean: number) => THREE.MathUtils.clamp((60 - clean) / 60, 0, 1);

/** Forgiving taps in a close-up: the nearest fish, decoration or slot on screen. */
function pickInTank(tank: TankRec, sx: number, sy: number) {
  const g = getGame();
  const o = SLOT_POS[tank.slot];
  const def = TANKS[tank.type];
  const near = (x: number, y: number, z: number) => {
    const p = project(o.x + x, y, o.z + z);
    return p ? Math.hypot(p.x - sx, p.y - sy) : Infinity;
  };
  if (g.panel === "decorate") {
    let best = -1;
    let bd = 120;
    def.slots.forEach((s, i) => {
      const d = near(s.x, STAND_H + SAND_H + 0.1, s.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) tapSlot(tank.id, best);
    return;
  }
  let fishId: string | null = null;
  let fd = 75;
  for (const f of rt.fish.values()) {
    if (f.tankId !== tank.id) continue;
    const d = near(f.s.x, STAND_H + f.s.y, f.s.z);
    if (d < fd) {
      fd = d;
      fishId = f.id;
    }
  }
  let slot = -1;
  let dd = 80;
  for (const d of tank.decor) {
    const s = def.slots[d.slot];
    const top = decorVersion(d.kind, d.variant).height * def.h;
    const dist = Math.min(near(s.x, STAND_H + SAND_H + top * 0.5, s.z), near(s.x, STAND_H + SAND_H + top * 0.85, s.z));
    if (dist < dd) {
      dd = dist;
      slot = d.slot;
    }
  }
  // A fish wins when it is about as close as the decoration (fish are the usual target).
  if (fishId && (slot < 0 || fd <= dd + 15)) tapFish(fishId);
  else if (slot >= 0) tapDecor(tank.id, slot);
}

function Tank({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const o = SLOT_POS[tank.slot];
  const shell = useMemo(() => tankShellGeometry(tank.type), [tank.type]);
  const water = useMemo(() => waterMaterial(def.h), [def.h]);
  const surface = useMemo(() => surfaceMaterial(), []);
  const dirt = useRef(dirtOf(tank.clean));
  const cleanRef = useRef(tank.clean);
  cleanRef.current = tank.clean;
  const murk = useRef<THREE.MeshBasicMaterial>(null);
  const algae = useRef<THREE.MeshBasicMaterial>(null);
  useEffect(() => () => {
    water.dispose();
    surface.dispose();
  }, [water, surface]);

  useFrame((_, dt) => {
    const target = dirtOf(cleanRef.current);
    const cleaning = rt.time - (rt.cleaning.get(tank.id) ?? -10) < 1.6;
    dirt.current += (target - dirt.current) * Math.min(1, dt * (cleaning ? 1.6 : 0.6));
    water.uniforms.uDirt.value = dirt.current;
    surface.uniforms.uDirt.value = dirt.current;
    if (murk.current) murk.current.opacity = dirt.current * 0.38;
    if (algae.current) algae.current.opacity = THREE.MathUtils.clamp((dirt.current - 0.2) * 1.4, 0, 0.9);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    const g = getGame();
    if (g.screen !== "game") return;
    if (g.view === "room") {
      tapTank(tank.id);
      return;
    }
    if (g.tankId === tank.id) pickInTank(tank, e.nativeEvent.clientX, e.nativeEvent.clientY);
  };

  const yMid = STAND_H + def.h / 2;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh geometry={shell} material={tankShellMaterial} />
      <ContactShadows tank={tank} />
      <mesh position={[0, yMid, 0]} material={water}>
        <boxGeometry args={[def.w, def.h, def.d]} />
      </mesh>
      <Decorations tank={tank} />
      <group position={[0, STAND_H, 0]}>
        {tank.fish.map((f) => (
          <FishMesh key={f.id} id={f.id} species={f.species} tankId={tank.id} />
        ))}
        <Pellets tankId={tank.id} />
        <Bubbles tank={tank} />
        <Particles tankId={tank.id} w={def.w} d={def.d} h={def.h} dirt={dirt} />
        <Sponge tankId={tank.id} w={def.w} d={def.d} h={def.h} />
      </group>
      {/* Cloudy water and algae (in front of everything inside). */}
      <mesh position={[0, yMid, def.d / 2 - 0.012]} renderOrder={2}>
        <planeGeometry args={[def.w - 0.01, def.h - 0.01]} />
        <meshBasicMaterial ref={murk} color="#74864a" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, yMid, def.d / 2 - 0.004]} renderOrder={3}>
        <planeGeometry args={[def.w - 0.01, def.h - 0.01]} />
        <meshBasicMaterial ref={algae} map={algaeTexture()} transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* The surface, seen from above. */}
      <mesh position={[0, STAND_H + def.h - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={surface} renderOrder={4}>
        <planeGeometry args={[def.w - 0.01, def.d - 0.01]} />
      </mesh>
      <Glass w={def.w} d={def.d} h={def.h} />
      <Upgrades tank={tank} />
      <Badge tank={tank} />
      <TankGlow tankId={tank.id} w={def.w} d={def.d} />
      {/* Tap target: the whole tank and stand. */}
      <mesh position={[0, (STAND_H + def.h + 0.1) / 2, 0.02]} onClick={onClick}>
        <boxGeometry args={[def.w + 0.2, STAND_H + def.h + 0.1, def.d + 0.16]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <SlotMarkers tank={tank} />
    </group>
  );
}

function Glass({ w, d, h }: { w: number; d: number; h: number }) {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: glassTexture(),
        color: "#e8fbff",
        transparent: true,
        opacity: 0.34,
        depthWrite: false
      }),
    []
  );
  const side = useMemo(() => new THREE.MeshBasicMaterial({ map: glassTexture(), color: "#d9f6ff", transparent: true, opacity: 0.22, depthWrite: false }), []);
  const y = STAND_H + h / 2;
  return (
    <group renderOrder={5}>
      <mesh position={[0, y, d / 2 + 0.003]} material={mat} renderOrder={5}>
        <planeGeometry args={[w, h]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 2 + s * 0.003, y, 0]} rotation={[0, (s * Math.PI) / 2, 0]} material={side} renderOrder={5}>
          <planeGeometry args={[d, h]} />
        </mesh>
      ))}
    </group>
  );
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
function FishMesh({ id, species, tankId }: { id: string; species: SpeciesId; tankId: string }) {
  const body = SPECIES[species].body;
  if (body === "turtle") return <TurtleMesh id={id} tankId={tankId} />;
  if (body === "jelly") return <JellyMesh id={id} tankId={tankId} />;
  return <BendingFish id={id} species={species} tankId={tankId} />;
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
    const p = Math.sin(f.phase);
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

// ------------------------------------------------------------------ decorations

const contactMat = shadowMaterial(0.24);

/** One merged blob batch per tank, fitted to the existing sand/dune surface. */
function ContactShadows({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const geo = useMemo(() => {
    const parts = tank.decor.map((d) => {
      const slot = def.slots[d.slot];
      const width = ({ plant: 0.3, coral: 0.28, rock: d.variant === "big" ? 0.46 : 0.3, shell: 0.22, chest: 0.4, bubbler: 0.24, starfish: 0.25, castle: 0.4, anemone: 0.3, shipwreck: 0.52 })[d.kind] * def.h;
      const g = new THREE.PlaneGeometry(width, width * 0.72, 8, 8);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = slot.x + p.getX(i), z = slot.z + p.getZ(i);
        const radius = def.w * 0.32;
        const k = 1 - ((x + def.w * 0.18) / radius) ** 2 - ((z + def.d * 0.18) / (radius * 0.55)) ** 2;
        const dune = STAND_H + SAND_H - 0.01 + radius * 0.09 * Math.sqrt(Math.max(0, k));
        p.setXYZ(i, x, Math.max(STAND_H + SAND_H, dune) + 0.002, z);
      }
      return g;
    });
    if (!parts.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    return g;
  }, [tank.decor, def]);
  useEffect(() => () => geo.dispose(), [geo]);
  return tank.decor.length ? <mesh geometry={geo} material={contactMat} /> : null;
}

function Decorations({ tank }: { tank: TankRec }) {
  return (
    <>
      {tank.decor.map((d) => (
        <DecorMesh key={d.id} tank={tank} d={d} />
      ))}
    </>
  );
}

function DecorMesh({ tank, d }: { tank: TankRec; d: PlacedDecor }) {
  const def = TANKS[tank.type];
  const s = def.slots[d.slot];
  const model = decorModel(d.kind, d.variant);
  const group = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Sprite>(null);
  const born = useRef(rt.time);
  const glowMat = useMemo(() => additiveSprite("#fff19a", 0), []);
  const key = `${tank.id}:${d.slot}`;
  const scale = def.h;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const st = getGame();
    const lifted = st.placing?.kind === "move" && st.placing.tankId === tank.id && st.placing.slot === d.slot;
    const age = rt.time - born.current;
    const pop = age < 0.35 ? 0.6 + 0.4 * Math.sin((age / 0.35) * Math.PI * 0.5) + Math.sin((age / 0.35) * Math.PI) * 0.15 : 1;
    g.position.set(s.x, STAND_H + SAND_H - 0.004 + (lifted ? 0.06 + Math.sin(rt.time * 5) * 0.015 : 0), s.z);
    g.scale.setScalar(scale * pop);
    if (lid.current) {
      // The chest opens now and then and lets a few bubbles out.
      const c = (rt.time + d.slot * 1.7) % 7;
      const open = c < 1.6 ? Math.sin((c / 1.6) * Math.PI) : 0;
      lid.current.rotation.x = -open * 0.9;
    }
    if (glow.current) {
      const on = rt.glow.decor.has(key);
      glowMat.opacity = on ? 0.55 + Math.sin(rt.time * 6) * 0.25 : 0;
      glow.current.visible = on;
    }
  });
  const top = decorVersion(d.kind, d.variant).height;
  return (
    <group ref={group}>
      <mesh geometry={model.geo} material={model.mat} />
      {model.lid && (
        <group ref={lid} position={model.lid.hinge}>
          <mesh geometry={model.lid.geo} material={flatMat} />
        </group>
      )}
      <sprite ref={glow} material={glowMat} position={[0, top * 0.5, 0.02]} scale={[0.5, Math.max(0.35, top * 1.3), 1]} visible={false} />
    </group>
  );
}

/** Decorate mode: rings on the sand for every slot. */
function SlotMarkers({ tank }: { tank: TankRec }) {
  const on = useGame((s) => s.panel === "decorate" && s.tankId === tank.id);
  const def = TANKS[tank.type];
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => def.slots.map(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false })), [def.slots]);
  useFrame(() => {
    if (!on) return;
    const g = getGame();
    const p = g.placing;
    def.slots.forEach((_, i) => {
      const m = refs.current[i];
      const mat = mats[i];
      if (!m) return;
      const taken = tank.decor.some((d) => d.slot === i);
      const picked = p?.kind === "move" && p.tankId === tank.id && p.slot === i;
      const active = (p?.kind === "decor" && !taken) || (p?.kind === "move" && !picked);
      const pulse = 1 + Math.sin(rt.time * 5 + i) * 0.12;
      m.scale.setScalar(active ? pulse : 0.85);
      mat.color.set(picked ? "#ff9f1c" : active ? "#7dffb0" : taken ? "#ffffff" : "#bff3ff");
      mat.opacity = active ? 0.95 : taken ? 0.35 : 0.6;
    });
  });
  if (!on) return null;
  return (
    <>
      {def.slots.map((s, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} position={[s.x, STAND_H + SAND_H + 0.008, s.z]} rotation={[-Math.PI / 2, 0, 0]} material={mats[i]} renderOrder={6}>
          <ringGeometry args={[0.1, 0.15, 24]} />
        </mesh>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ pellets, bubbles, dirt, sponge

const pelletGeo = new THREE.SphereGeometry(0.012, 6, 5);
const pelletMat = new THREE.MeshLambertMaterial({ color: "#c8692b" });

function Pellets({ tankId }: { tankId: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let n = 0;
    for (const p of rt.pellets) {
      if (p.tankId !== tankId || p.eaten || n >= 40) continue;
      m4.makeTranslation(p.x, p.y, p.z);
      mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[pelletGeo, pelletMat, 40]} frustumCulled={false} />;
}

const bubbleMat = (scale: { value: number }, h: number) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: shaderTime, uScale: scale, uTop: { value: h - 0.04 }, uSand: { value: SAND_H + 0.02 } },
    vertexShader: `
      attribute vec4 aB;
      uniform float uTime;
      uniform float uScale;
      uniform float uTop;
      uniform float uSand;
      varying float vA;
      void main() {
        float span = uTop - uSand;
        float y = uSand + mod(uTime * aB.w + aB.z * 13.0, span);
        vec3 p = vec3(aB.x + sin(uTime * 3.1 + aB.z * 20.0) * 0.012, y, aB.y + cos(uTime * 2.3 + aB.z * 9.0) * 0.008);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.014 + fract(aB.z * 7.3) * 0.016) * uScale / -mv.z;
        vA = smoothstep(0.0, 0.05, y - uSand) * (1.0 - smoothstep(span - 0.06, span, y - uSand));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        float rim = smoothstep(0.55, 0.95, r) + 0.25 * (1.0 - smoothstep(0.0, 0.35, length(c + vec2(0.15, 0.15)) * 2.0));
        gl_FragColor = vec4(vec3(0.92, 0.98, 1.0), rim * 0.85 * vA);
      }`
  });

function Bubbles({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const { size } = useThree();
  const scale = useMemo(() => ({ value: 600 }), []);
  scale.value = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  const mat = useMemo(() => bubbleMat(scale, def.h), [scale, def.h]);
  const sources = tank.decor.filter((d) => d.kind === "bubbler" || d.kind === "chest").map((d) => ({ x: def.slots[d.slot].x, z: def.slots[d.slot].z, strong: d.kind === "bubbler" }));
  const key = sources.map((s) => `${s.x},${s.z},${s.strong}`).join("|");
  const geo = useMemo(() => {
    const list = [{ x: def.w / 2 - 0.07, z: -def.d / 2 + 0.05, strong: true }, ...sources];
    const n = 14 + sources.length * 14;
    const arr = new Float32Array(n * 4);
    let seed = 3;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < n; i++) {
      const s = list[i % list.length];
      arr[i * 4] = s.x + (r() - 0.5) * 0.04;
      arr[i * 4 + 1] = s.z + (r() - 0.5) * 0.04;
      arr[i * 4 + 2] = r();
      arr[i * 4 + 3] = (s.strong ? 0.22 : 0.12) + r() * 0.1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("aB", new THREE.BufferAttribute(arr, 4));
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, def.h / 2, 0), def.w);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, def.w, def.d, def.h]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <points geometry={geo} material={mat} renderOrder={1} />;
}

function Particles({ tankId, w, d, h, dirt }: { tankId: string; w: number; d: number; h: number; dirt: React.MutableRefObject<number> }) {
  const mat = useMemo(() => new THREE.PointsMaterial({ color: "#8f9a5a", size: 0.018, transparent: true, opacity: 0, depthWrite: false }), []);
  const geo = useMemo(() => {
    const n = 50;
    const arr = new Float32Array(n * 3);
    let seed = tankId.length * 31 + 7;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (r() - 0.5) * (w - 0.1);
      arr[i * 3 + 1] = SAND_H + 0.05 + r() * (h - 0.15);
      arr[i * 3 + 2] = (r() - 0.5) * (d - 0.1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [tankId, w, d, h]);
  const ref = useRef<THREE.Points>(null);
  useFrame(() => {
    mat.opacity = THREE.MathUtils.clamp(dirt.current * 1.6, 0, 0.85);
    if (ref.current) {
      ref.current.visible = mat.opacity > 0.02;
      ref.current.position.y = Math.sin(rt.time * 0.4) * 0.02;
      ref.current.position.x = Math.sin(rt.time * 0.23) * 0.02;
    }
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}

/** The cleaning sponge sweeping the inside of the front glass. */
function Sponge({ tankId, w, d, h }: { tankId: string; w: number; d: number; h: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = rt.time - (rt.cleaning.get(tankId) ?? -10);
    const on = t >= 0 && t < 1.6;
    m.visible = on;
    if (!on) return;
    const u = t / 1.6;
    m.position.set(-w / 2 + 0.12 + (w - 0.24) * u, SAND_H + 0.15 + Math.abs(Math.sin(u * Math.PI * 5)) * (h - 0.4), d / 2 - 0.05);
    m.rotation.z = Math.sin(t * 20) * 0.2;
  });
  return (
    <mesh ref={ref} visible={false}>
      <boxGeometry args={[0.16, 0.1, 0.05]} />
      <meshLambertMaterial color="#ffe14a" />
    </mesh>
  );
}

/** What an upgrade looks like: a warm lamp glow over the water, a filter canister beside the tank. */
function Upgrades({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const glowMat = useMemo(() => additiveSprite("#fff1b0", 0.5), []);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(() => {
    if (ref.current) glowMat.opacity = 0.35 + Math.sin(rt.time * 1.5) * 0.08;
  });
  return (
    <>
      {tank.upgrades.lamp && (
        <>
          <mesh position={[0, STAND_H + def.h + 0.085, -def.d / 2 + 0.07]}>
            <boxGeometry args={[def.w * 0.86, 0.03, 0.09]} />
            <meshBasicMaterial color="#fff6c8" />
          </mesh>
          <sprite ref={ref} material={glowMat} position={[0, STAND_H + def.h * 0.75, 0]} scale={[def.w * 1.1, def.h * 0.8, 1]} renderOrder={3} />
        </>
      )}
      {tank.upgrades.filter && (
        <group position={[def.w / 2 + 0.16, STAND_H, -def.d / 2 + 0.12]}>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.07, 0.08, 0.44, 12]} />
            <meshLambertMaterial color="#4aa3ff" />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.05, 12]} />
            <meshLambertMaterial color="#1f4a66" />
          </mesh>
          <mesh position={[-0.08, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
            <meshLambertMaterial color="#1f4a66" />
          </mesh>
        </group>
      )}
    </>
  );
}

// ------------------------------------------------------------------ status

function Badge({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const h = happiness(tank);
  const md = mood(h);
  const hungry = isHungry(tank);
  const dirty = isDirty(tank);
  const tex = badgeTexture(md, hungry, dirty);
  const icons = 1 + (hungry ? 1 : 0) + (dirty ? 1 : 0);
  const ref = useRef<THREE.Sprite>(null);
  const mat = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }), []);
  mat.map = tex;
  mat.needsUpdate = true;
  useFrame(() => {
    const s = ref.current;
    if (!s) return;
    const g = getGame();
    s.visible = tank.fish.length > 0 && g.view === "room" && !rt.camera.shot;
    const urgent = hungry || dirty;
    s.position.y = STAND_H + def.h + 0.5 + Math.sin(rt.time * (urgent ? 5 : 2)) * (urgent ? 0.05 : 0.02);
  });
  // The texture is 256x96 with the pill centred; scale so the pill keeps its proportions.
  const w = 1.2;
  void icons;
  return <sprite ref={ref} material={mat} scale={[w, w * (96 / 256), 1]} renderOrder={10} />;
}

/** The "show me" rescue in the room view: a golden glow behind the tank. */
function TankGlow({ tankId, w, d }: { tankId: string; w: number; d: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#ffd84a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useFrame(() => {
    const on = rt.glow.tanks.has(tankId) && getGame().view === "room";
    mat.opacity = on ? 0.55 + Math.sin(rt.time * 5) * 0.25 : 0;
    if (ref.current) ref.current.visible = on;
  });
  return (
    <mesh ref={ref} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat} visible={false}>
      <planeGeometry args={[w + 1.6, d + 1.6]} />
    </mesh>
  );
}
