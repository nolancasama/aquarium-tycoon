import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getGame, useGame } from "../game/store";
import { rt } from "../game/runtime";
import { decorVersion } from "../game/data/decor";
import { SAND_H, SLOT_POS, STAND_H, TANKS } from "../game/data/tanks";
import { happiness, isDirty, isHungry, mood, type PlacedDecor, type TankRec } from "../game/logic/model";
import { tapDecor, tapFish, tapSlot, tapTank } from "../game/flow/actions";
import { glassGeometry, surfaceGeometry, tankShellGeometry, waterGeometry } from "./models/tankShell";
import { FishMesh } from "./Animals";
import { decorModel } from "./models/decor";
import { additiveSprite, algaeTexture, badgeTexture, flatMat, glassTexture, glowTexture, shaderTime, shadowMaterial, surfaceMaterial, tankShellMaterial, waterMaterial } from "./materials";
import { project, FOV } from "./CameraRig";
import { footprintContains, sandSurfaceY, slotMarkerY, SLOT_MARKER_RADIUS } from "../game/logic/tankLayout";
import type { TankType } from "../game/types";
import { PartBuilder } from "./partBuilder";
import { currentMaterial, displayGlowMaterial, displayRingMaterial, shapedWaterMaterial } from "./tankMaterials";

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
  const o = SLOT_POS[tank.slot];
  const ref = useRef<THREE.Group>(null);
  const [visible, setVisible] = useState(() => Math.abs(o.x - rt.camera.target.x) <= 13);
  const showing = useRef(visible);
  useFrame(() => {
    const next = Math.abs(o.x - rt.camera.target.x) <= 13;
    if (ref.current) ref.current.visible = next;
    if (next !== showing.current) {
      showing.current = next;
      // Only a room-boundary change schedules React work. The model and sim live outside this tree.
      setVisible(next);
    }
  }, -1);
  return <group ref={ref} position={[o.x, 0, o.z]} visible={visible}>{visible && <TankContents tank={tank} />}</group>;
}

function TankContents({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const special = def.group === "special";
  const bulge = def.bulge ?? 0;
  const shell = useMemo(() => tankShellGeometry(tank.type), [tank.type]);
  const waterGeo = useMemo(() => waterGeometry(tank.type), [tank.type]);
  const overlayGeo = useMemo(() => special ? glassGeometry(tank.type, 0.012) : null, [tank.type, special]);
  const algaeGeo = useMemo(() => special ? glassGeometry(tank.type, 0.006) : null, [tank.type, special]);
  const surfaceGeo = useMemo(() => special ? surfaceGeometry(tank.type) : null, [tank.type, special]);
  useEffect(() => () => {
    shell.dispose(); waterGeo.dispose(); overlayGeo?.dispose(); algaeGeo?.dispose(); surfaceGeo?.dispose();
  }, [shell, waterGeo, overlayGeo, algaeGeo, surfaceGeo]);
  const water = useMemo(() => special ? shapedWaterMaterial(def.h) : waterMaterial(def.h), [def.h, special]);
  const surface = useMemo(() => surfaceMaterial(), []);
  const dirt = useRef(dirtOf(tank.clean));
  const cleanRef = useRef(tank.clean);
  cleanRef.current = tank.clean;
  const murk = useRef<THREE.MeshBasicMaterial>(null);
  const algae = useRef<THREE.MeshBasicMaterial>(null);
  useEffect(() => () => water.dispose(), [water]);
  useEffect(() => () => surface.dispose(), [surface]);

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
    <group>
      <mesh geometry={shell} material={tankShellMaterial} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.04 + bulge / 2]} scale={[def.w + 0.9, def.d + bulge + 0.7, 1]} geometry={unitPlane} material={standShadowMat} />
      <ContactShadows tank={tank} />
      <mesh position={[0, yMid, 0]} material={water} geometry={waterGeo} />
      <Decorations tank={tank} />
      <group position={[0, STAND_H, 0]}>
        {tank.fish.map((f) => (
          <FishMesh key={f.id} id={f.id} species={f.species} tankId={tank.id} />
        ))}
        <Pellets tankId={tank.id} />
        <Bubbles tank={tank} />
        <Particles tankId={tank.id} type={tank.type} dirt={dirt} />
        <Sponge tankId={tank.id} type={tank.type} />
        {def.lights && <JellyDisplay tank={tank} />}
      </group>
      {/* Cloudy water and algae (in front of everything inside). */}
      <mesh position={[0, yMid, special ? 0 : def.d / 2 - 0.012]} geometry={overlayGeo ?? undefined} renderOrder={2}>
        {!special && <planeGeometry args={[def.w - 0.01, def.h - 0.01]} />}
        <meshBasicMaterial ref={murk} color="#74864a" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, yMid, special ? 0 : def.d / 2 - 0.004]} geometry={algaeGeo ?? undefined} renderOrder={3}>
        {!special && <planeGeometry args={[def.w - 0.01, def.h - 0.01]} />}
        <meshBasicMaterial ref={algae} map={algaeTexture()} transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* The surface, seen from above. */}
      <mesh position={[0, STAND_H + def.h - 0.03, 0]} rotation={[special ? 0 : -Math.PI / 2, 0, 0]} geometry={surfaceGeo ?? undefined} material={surface} renderOrder={4}>
        {!special && <planeGeometry args={[def.w - 0.01, def.d - 0.01]} />}
      </mesh>
      {special ? <ShapedGlass type={tank.type} /> : <Glass w={def.w} d={def.d} h={def.h} />}
      <Upgrades tank={tank} />
      <Badge tank={tank} />
      <TankGlow tankId={tank.id} w={def.w} d={def.d + bulge} z={bulge / 2} />
      {/* Tap target: the whole tank and stand. */}
      <mesh position={[0, (STAND_H + def.h + 0.1) / 2, 0.02 + bulge / 2]} onClick={onClick}>
        <boxGeometry args={[def.w + 0.2, STAND_H + def.h + 0.1, def.d + bulge + 0.16]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <SlotMarkers tank={tank} />
    </group>
  );
}

let shapedGlassMat: THREE.MeshBasicMaterial | undefined;
function ShapedGlass({ type }: { type: TankType }) {
  const geo = useMemo(() => glassGeometry(type), [type]);
  useEffect(() => () => geo.dispose(), [geo]);
  // All six panes / the complete open tube share one draw call and the classic glass texture.
  shapedGlassMat ??= new THREE.MeshBasicMaterial({ map: glassTexture(), color: "#e8fbff", transparent: true, opacity: 0.34, depthWrite: false });
  return <mesh geometry={geo} material={shapedGlassMat} position={[0, STAND_H + TANKS[type].h / 2, 0]} renderOrder={5} />;
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
  useEffect(() => () => { mat.dispose(); side.dispose(); }, [mat, side]);
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

// ------------------------------------------------------------------ decorations

const contactMat = shadowMaterial(0.24);
/** The soft floor shadow under every stand (one shared plane and material). */
const standShadowMat = shadowMaterial(0.34);
const unitPlane = new THREE.PlaneGeometry(1, 1);

/** One merged blob batch per tank, fitted to the existing sand/dune surface. */
function ContactShadows({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const geo = useMemo(() => {
    const parts = tank.decor.map((d) => {
      const slot = def.slots[d.slot];
      const width = ({ plant: 0.3, coral: 0.28, rock: d.variant === "big" ? 0.46 : 0.3, shell: 0.22, chest: 0.4, bubbler: 0.24, starfish: 0.25, castle: 0.4, anemone: 0.3, shipwreck: 0.52, kelp: 0.26, arch: 0.5, cave: 0.5, driftwood: 0.4 })[d.kind] * def.h;
      const g = new THREE.PlaneGeometry(width, width * 0.72, 8, 8);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let dx = p.getX(i), dz = p.getZ(i);
        if (def.group === "special") {
          while (!footprintContains(def, slot.x + dx, slot.z + dz, 0.012)) { dx *= 0.9; dz *= 0.9; }
        }
        const x = slot.x + dx, z = slot.z + dz;
        p.setXYZ(i, x, sandSurfaceY(def, x, z) + 0.002, z);
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
  const grounded = useMemo(() => {
    if (d.kind !== "kelp" && d.kind !== "arch" && d.kind !== "cave" && d.kind !== "driftwood") return null;
    // Drape only the feet / roots over the actual dune. A wide arch must plant
    // both legs, even when the centre of its slot is higher than either foot.
    const geo = model.geo.clone();
    const p = geo.getAttribute("position");
    const floor = sandSurfaceY(def, s.x, s.z);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const dy = (sandSurfaceY(def, s.x + x * def.h, s.z + z * def.h) - floor) / def.h;
      p.setY(i, y + dy * (1 - THREE.MathUtils.smoothstep(y, 0, 0.1)));
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }, [d.kind, model.geo, def, s]);
  useEffect(() => () => grounded?.dispose(), [grounded]);
  const group = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Sprite>(null);
  const born = useRef(rt.time);
  const glowMat = useMemo(() => additiveSprite("#fff19a", 0), []);
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  const key = `${tank.id}:${d.slot}`;
  const scale = def.h;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const st = getGame();
    const lifted = st.placing?.kind === "move" && st.placing.tankId === tank.id && st.placing.slot === d.slot;
    const age = rt.time - born.current;
    const pop = age < 0.35 ? 0.6 + 0.4 * Math.sin((age / 0.35) * Math.PI * 0.5) + Math.sin((age / 0.35) * Math.PI) * 0.15 : 1;
    g.position.set(s.x, sandSurfaceY(def, s.x, s.z) - 0.004 + (lifted ? 0.06 + Math.sin(rt.time * 5) * 0.015 : 0), s.z);
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
      <mesh geometry={grounded ?? model.geo} material={model.mat} />
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
/** Flat ring template (x/z about the slot centre); each frame drapes a scaled copy over the sand. */
const ringTemplate = (() => {
  const g = new THREE.RingGeometry(0.1, SLOT_MARKER_RADIUS, 32, 2);
  g.rotateX(-Math.PI / 2);
  return g;
})();

function SlotMarkers({ tank }: { tank: TankRec }) {
  const on = useGame((s) => s.panel === "decorate" && s.tankId === tank.id);
  const def = TANKS[tank.type];
  const mats = useMemo(() => def.slots.map(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false })), [def.slots]);
  const geos = useMemo(() => def.slots.map(() => ringTemplate.clone()), [def.slots]);
  const scales = useRef<number[]>([]);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(() => {
    if (!on) return;
    const g = getGame();
    const p = g.placing;
    const base = ringTemplate.attributes.position;
    def.slots.forEach((s, i) => {
      const mat = mats[i];
      const taken = tank.decor.some((d) => d.slot === i);
      const picked = p?.kind === "move" && p.tankId === tank.id && p.slot === i;
      const active = (p?.kind === "decor" && !taken) || (p?.kind === "move" && !picked);
      const scale = active ? 1 + Math.sin(rt.time * 5 + i) * 0.12 : 0.85;
      mat.color.set(picked ? "#ff9f1c" : active ? "#7dffb0" : taken ? "#ffffff" : "#bff3ff");
      mat.opacity = active ? 0.95 : taken ? 0.35 : 0.6;
      if (scales.current[i] === scale) return;
      scales.current[i] = scale;
      // Pulse the radius and re-drape every vertex, so the ring hugs dunes at any size.
      const pos = geos[i].attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = base.getX(v) * scale;
        const z = base.getZ(v) * scale;
        pos.setXYZ(v, x, slotMarkerY(def, { x: s.x + x, z: s.z + z }), z);
      }
      pos.needsUpdate = true;
      geos[i].computeBoundingSphere();
    });
  });
  useEffect(() => {
    if (!on) scales.current = [];
  }, [on]);
  if (!on) return null;
  return (
    <>
      {def.slots.map((s, i) => (
        <mesh key={i} position={[s.x, 0, s.z]} geometry={geos[i]} material={mats[i]} />
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

/** The jelly column's bands, interior glow and slow current cost three draws. */
function JellyDisplay({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const { size } = useThree();
  const scale = useMemo(() => ({ value: 600 }), []);
  scale.value = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  const rings = useMemo(() => {
    const b = new PartBuilder(0);
    // Outside the rim so the opaque cap cannot hide the luminous band.
    for (const y of [0.025, def.h + 0.022]) {
      b.add(new THREE.TorusGeometry(def.w / 2 + 0.029, 0.018, 4, 32), "#ffffff", [0, y, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { vary: false });
    }
    return b.build();
  }, [def.w, def.h]);
  const glow = useMemo(() => {
    const b = new PartBuilder(0);
    for (const angle of [0, Math.PI / 2]) {
      b.add(new THREE.PlaneGeometry(def.w * 0.78, def.h - 0.12), "#ffffff", [0, def.h / 2 + 0.02, 0], [0, angle, 0]);
    }
    return b.build();
  }, [def.w, def.h]);
  const particles = useMemo(() => {
    const n = 40;
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = i * 2.39996;
      seeds[i * 3 + 1] = (i * 0.618034) % 1;
      seeds[i * 3 + 2] = def.w * (0.18 + (i % 7) * 0.034);
    }
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, def.h / 2, 0), def.h);
    return g;
  }, [def.w, def.h]);
  const current = useMemo(() => currentMaterial(def.h, def.current ?? 0.06, tank.light, scale), [def.h, def.current, tank.light, scale]);
  useEffect(() => () => { rings.dispose(); glow.dispose(); particles.dispose(); }, [rings, glow, particles]);
  useEffect(() => () => current.dispose(), [current]);
  return <>
    <mesh geometry={rings} material={displayRingMaterial(tank.light)} />
    <mesh geometry={glow} material={displayGlowMaterial(tank.light)} renderOrder={1} />
    <points geometry={particles} material={current} renderOrder={1} />
  </>;
}

function Bubbles({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const { size } = useThree();
  const scale = useMemo(() => ({ value: 600 }), []);
  scale.value = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  const mat = useMemo(() => bubbleMat(scale, def.h), [scale, def.h]);
  const sources = tank.decor.filter((d) => d.kind === "bubbler" || d.kind === "chest").map((d) => ({ x: def.slots[d.slot].x, z: def.slots[d.slot].z, strong: d.kind === "bubbler" }));
  const key = sources.map((s) => `${s.x},${s.z},${s.strong}`).join("|");
  const geo = useMemo(() => {
    const filter = def.shape === "round" || def.shape === "hex"
      ? { x: def.w * 0.20, z: -def.d * 0.24, strong: true }
      : { x: def.w / 2 - 0.07, z: -def.d / 2 + 0.05, strong: true };
    const list = [filter, ...sources];
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
  }, [key, def.w, def.d, def.h, def.shape]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <points geometry={geo} material={mat} renderOrder={1} />;
}

function Particles({ tankId, type, dirt }: { tankId: string; type: TankType; dirt: React.MutableRefObject<number> }) {
  const def = TANKS[type];
  const { w, d, h } = def;
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
      if (def.group === "special") {
        // Leave room for the slow 2 cm drift, including at slanted / curved glass.
        while (!footprintContains(def, arr[i * 3], arr[i * 3 + 2], 0.065)) {
          arr[i * 3] = (r() - 0.5) * (w - 0.13);
          arr[i * 3 + 2] = -d / 2 + 0.065 + r() * (d + (def.bulge ?? 0) - 0.13);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [tankId, w, d, h, def]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
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
function Sponge({ tankId, type }: { tankId: string; type: TankType }) {
  const def = TANKS[type];
  const { w, d, h } = def;
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
    m.rotation.y = 0;
    if (def.shape === "round") {
      const r = w / 2 - 0.085;
      const x = (u * 2 - 1) * r * 0.72;
      const z = Math.sqrt(r * r - x * x);
      m.position.x = x; m.position.z = z;
      m.rotation.y = Math.atan2(x, z);
    } else if (def.shape === "hex") {
      // The visitor-facing hex pane is flat, between the two front corners.
      m.position.x = (u * 2 - 1) * (w / 4 - 0.09);
    } else if (def.shape === "bow") {
      const x = m.position.x;
      m.position.z += (def.bulge ?? 0) * (1 - (2 * x / w) ** 2) - 0.02;
      m.rotation.y = Math.atan(8 * (def.bulge ?? 0) * x / (w * w));
    }
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
  const narrow = def.shape === "round" || def.shape === "hex";
  const lampW = def.w * (narrow ? 0.42 : 0.86);
  const lampZ = narrow ? -def.d * 0.22 : -def.d / 2 + 0.07;
  useEffect(() => () => glowMat.dispose(), [glowMat]);
  useFrame(() => {
    if (ref.current) glowMat.opacity = 0.35 + Math.sin(rt.time * 1.5) * 0.08;
  });
  return (
    <>
      {tank.upgrades.lamp && (
        <>
          <mesh position={[0, STAND_H + def.h + 0.085, lampZ]}>
            <boxGeometry args={[lampW, 0.03, 0.09]} />
            <meshBasicMaterial color="#fff6c8" />
          </mesh>
          <sprite ref={ref} material={glowMat} position={[0, STAND_H + def.h * 0.75, (def.bulge ?? 0) / 2]} scale={[def.w * (narrow ? 0.75 : 1.1), def.h * 0.8, 1]} renderOrder={3} />
        </>
      )}
      {tank.upgrades.filter && (
        <group position={[def.w / 2 + 0.16, STAND_H, narrow ? 0 : -def.d / 2 + 0.12]}>
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

// The badge texture is 256x96 with the pill centred; scale so the pill keeps its proportions.
const BADGE_W = 1.2;

function Badge({ tank }: { tank: TankRec }) {
  const def = TANKS[tank.type];
  const width = def.group === "special" ? Math.min(BADGE_W, def.w * 0.9) : BADGE_W;
  const h = happiness(tank);
  const md = mood(h);
  const hungry = isHungry(tank);
  const dirty = isDirty(tank);
  const tex = badgeTexture(md, hungry, dirty);
  const icons = 1 + (hungry ? 1 : 0) + (dirty ? 1 : 0);
  const ref = useRef<THREE.Sprite>(null);
  const mat = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  mat.map = tex;
  mat.needsUpdate = true;
  useFrame(() => {
    const s = ref.current;
    if (!s) return;
    const g = getGame();
    s.visible = tank.fish.length > 0 && g.view === "room" && !rt.camera.shot;
    const urgent = hungry || dirty;
    s.position.y = STAND_H + def.h + 0.5 + Math.sin(rt.time * (urgent ? 5 : 2)) * (urgent ? 0.05 : 0.02);
    // Happiness went up: a short bounce, bigger on reaching okay and biggest on happy.
    const c = rt.cheer.get(tank.id);
    const k = c ? (rt.time - c.t0) / 0.7 : 1;
    const amp = c ? (c.level === "happy" ? 0.35 : c.level === "okay" ? 0.22 : 0.1) : 0;
    const pop = k < 1 ? 1 + amp * Math.sin(k * Math.PI) * (1 - k * 0.5) : 1;
    s.scale.set(width * pop, width * (96 / 256) * pop, 1);
  });
  void icons;
  return <sprite ref={ref} material={mat} position={[0, 0, (def.bulge ?? 0) / 2]} scale={[width, width * (96 / 256), 1]} renderOrder={10} />;
}

/** The "show me" rescue in the room view: a golden glow behind the tank. */
function TankGlow({ tankId, w, d, z }: { tankId: string; w: number; d: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#ffd84a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const on = rt.glow.tanks.has(tankId) && getGame().view === "room";
    mat.opacity = on ? 0.55 + Math.sin(rt.time * 5) * 0.25 : 0;
    if (ref.current) ref.current.visible = on;
  });
  return (
    <mesh ref={ref} position={[0, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat} visible={false}>
      <planeGeometry args={[w + 1.6, d + 1.6]} />
    </mesh>
  );
}
