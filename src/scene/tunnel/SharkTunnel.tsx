import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame, useGame } from "../../game/store";
import { rt } from "../../game/runtime";
import { HABITAT, MOUTHS, SHARK_DOOR, sharkSwimVolume, TUNNEL_LOBBY, TUNNEL_ZONES } from "../../game/data/sharkTunnel";
import { isTunnelDecor } from "../../game/data/decor";
import { SPECIES } from "../../game/data/fish";
import { tapSharkTunnelDoor, tapSlot, tapTank } from "../../game/flow/actions";
import type { SwimAnimal, TunnelSpecies } from "../../game/tunnel/contract";
import type { TunnelDecorKind } from "../../game/types";
import { padIconTexture, signMaterial, smoothMat } from "../materials";
import { PartBuilder } from "../partBuilder";
import { TunnelAnimals } from "./TunnelAnimals";
import { habitatStaticGeometry, lobbyGeometry, shaftGeometry, structureGeometry, tunnelGlassGeometry, zoneRingGeometry } from "./habitatGeometry";
import { habitatRock, habitatSand, lobbyMat, moteMat, shaftMat, tunnelGlass, tunnelStruct, waterSection, waterSurface, zoneRingBusyMat, zoneRingMat } from "./tunnelMaterials";
import { useAreaGate, wingShown } from "./wing";
import { ExplorePlayer } from "./ExplorePlayer";
import { TunnelVisitors } from "./TunnelVisitors";

/** The four original rooms: hidden (and untappable) while the wing is shown. */
export function MainRooms({ children }: { children: ReactNode }) {
  const ref = useAreaGate(() => !wingShown());
  return <group ref={ref}>{children}</group>;
}

const TUNNEL_SPECIES = new Set<string>(["blacktip", "zebrashark", "eagleray"]);

/** Scene background and underwater fog: dark around the diorama, blue-green inside the tunnel. */
function Environment() {
  const { scene } = useThree();
  const original = useRef<{ bg: THREE.Color | THREE.Texture | null } | null>(null);
  const fog = useMemo(() => new THREE.FogExp2("#1f7a8f", 0.052), []);
  const wingBg = useMemo(() => new THREE.Color("#0e3344"), []);
  const exploreBg = useMemo(() => new THREE.Color("#1c6f84"), []);
  useEffect(() => () => {
    if (original.current) scene.background = original.current.bg;
    scene.fog = null;
  }, [scene]);
  useFrame(() => {
    if (!original.current && !(scene.background === wingBg || scene.background === exploreBg)) original.current = { bg: scene.background as THREE.Color | null };
    const wing = wingShown(), explore = rt.explore.active;
    const bg = explore ? exploreBg : wing ? wingBg : original.current?.bg ?? null;
    if (scene.background !== bg) scene.background = bg;
    const f = explore ? fog : null;
    if (scene.fog !== f) scene.fog = f;
  }, -6);
  return null;
}

/** The atrium's back-wall doorway into the wing: a deep-blue portal, a sign, a lock until bought. */
export function SharkDoor() {
  const open = useGame((s) => Boolean(s.model.progress.tunnelOpen));
  const lock = useRef<THREE.Sprite>(null);
  useFrame(() => {
    if (lock.current) lock.current.position.y = 1.25 + Math.sin(rt.time * 2) * 0.05;
  });
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    tapSharkTunnelDoor();
  };
  const { x, z, w, h } = SHARK_DOOR;
  return (
    <group>
      {/* The doorway shows the blue lobby beyond (a glowing panel, not the real wing). */}
      <mesh position={[x, h / 2, z - 0.06]} onClick={onClick}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={open ? "#2d8fae" : "#1d5a73"} toneMapped={false} />
      </mesh>
      <mesh position={[x, h / 2 + 0.25, z - 0.05]} raycast={() => undefined}>
        <planeGeometry args={[w * 0.82, h * 0.55]} />
        <meshBasicMaterial color="#64d2e8" transparent opacity={open ? 0.55 : 0.25} toneMapped={false} />
      </mesh>
      <mesh position={[x, h + 0.42, z + 0.12]} onClick={onClick}>
        <planeGeometry args={[2.1, 0.62]} />
        <primitive object={signMaterial("SHARK TUNNEL\nサメの トンネル", "#14506a", "#e8fbff", 768, 224)} attach="material" />
      </mesh>
      {!open && (
        <sprite ref={lock} position={[x, 1.25, z + 0.45]} scale={[0.7, 0.7, 1]} onClick={onClick}>
          <spriteMaterial map={padIconTexture("lock")} transparent depthWrite={false} />
        </sprite>
      )}
    </group>
  );
}

/** Placed structures, from the habitat tank's decorations (one merged mesh). */
function usePlaced() {
  const decor = useGame((s) => s.model.tanks.find((t) => t.type === "sharks")?.decor);
  const key = (decor ?? []).filter((d) => isTunnelDecor(d.kind)).map((d) => `${d.slot}:${d.kind}`).sort().join(",");
  return useMemo(() => key ? key.split(",").map((p) => { const [zone, kind] = p.split(":"); return { zone: Number(zone), kind: kind as TunnelDecorKind }; }) : [], [key]);
}

function Structures({ placed }: { placed: Array<{ zone: number; kind: TunnelDecorKind }> }) {
  const decorating = useGame((s) => s.panel === "decorate");
  const habitatId = useGame((s) => s.model.tanks.find((t) => t.type === "sharks")?.id ?? null);
  const geos = useMemo(() => placed.map((p) => ({ ...p, geo: structureGeometry(p.kind, p.zone) })), [placed]);
  useEffect(() => () => geos.forEach((g) => g.geo.dispose()), [geos]);
  return <>{geos.map((p) => (
    <mesh key={`${p.zone}-${p.kind}`} geometry={p.geo} material={habitatRock} name={`structure-${p.zone}`}
      onClick={(e) => {
        if (!decorating || !habitatId || e.delta > 8) return;
        e.stopPropagation();
        tapSlot(habitatId, p.zone);
      }} />
  ))}</>;
}

/** Big pulsing rings on the six zones while decorating. */
function ZoneRings({ placed }: { placed: Array<{ zone: number }> }) {
  const decorating = useGame((s) => s.panel === "decorate" && s.hall >= 0);
  const habitatId = useGame((s) => s.model.tanks.find((t) => t.type === "sharks")?.id ?? null);
  const geo = useMemo(() => zoneRingGeometry(), []);
  const refs = useRef<Array<THREE.Mesh | null>>([]);
  useFrame(() => {
    const k = 1 + Math.sin(rt.time * 3.2) * 0.05;
    for (const m of refs.current) m?.scale.set(k, 1, k);
  });
  if (!decorating || !habitatId) return null;
  const busy = new Set(placed.map((p) => p.zone));
  return <>{TUNNEL_ZONES.map((z, i) => (
    <group key={i} position={[z.x, z.y + 0.08, z.z]}>
      <mesh ref={(m) => void (refs.current[i] = m)} geometry={geo} material={busy.has(i) ? zoneRingBusyMat : zoneRingMat}
        renderOrder={3} name={`zone-${i}`} raycast={() => undefined} />
      {/* The whole disc answers a tap (children tap the middle of a ring). */}
      <mesh geometry={zoneHitGeo} material={zoneHitMat} name={`zone-hit-${i}`}
        onClick={(e) => {
          if (e.delta > 8) return;
          e.stopPropagation();
          tapSlot(habitatId, i);
        }} />
    </group>
  ))}</>;
}

/** The water surface doubles as the habitat's tap target (placing an animal, opening the habitat). */
function Surface() {
  const habitatId = useGame((s) => s.model.tanks.find((t) => t.type === "sharks")?.id ?? null);
  const w = HABITAT.max.x - HABITAT.min.x, d = HABITAT.max.z - HABITAT.min.z;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(HABITAT.min.x + HABITAT.max.x) / 2, HABITAT.max.y, (HABITAT.min.z + HABITAT.max.z) / 2]}
      material={waterSurface} renderOrder={2} name="habitat-surface"
      onClick={(e) => {
        const g = getGame();
        if (!habitatId || e.delta > 8 || rt.explore.active || g.placing?.kind !== "fish") return;
        e.stopPropagation();
        tapTank(habitatId);
      }}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}

/** Drifting motes around the camera, and bubble columns (one Points draw). */
function Motes() {
  const COUNT = 260;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      p[i * 3] = HABITAT.min.x + Math.random() * (HABITAT.max.x - HABITAT.min.x);
      p[i * 3 + 1] = Math.random() * HABITAT.max.y;
      p[i * 3 + 2] = HABITAT.min.z + Math.random() * (HABITAT.max.z - HABITAT.min.z);
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    if (!rt.explore.active) return;
    const p = geo.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      // Every eighth one is a bubble: it rises; the rest drift slowly.
      const bubble = i % 8 === 0;
      a[i * 3 + 1] += dt * (bubble ? 0.6 : 0.03);
      a[i * 3] += dt * 0.05 * Math.sin(rt.time * 0.3 + i);
      if (a[i * 3 + 1] > HABITAT.max.y - 0.1) a[i * 3 + 1] = HABITAT.min.y + 0.3;
    }
    p.needsUpdate = true;
  });
  return <points geometry={geo} material={moteMat} raycast={() => undefined} />;
}

/** Food chunks falling from the surface for a few seconds after Feed (instanced, 24 pieces). */
function FeedChunks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.07, 0), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#e48a5a" }), []);
  const seeds = useMemo(() => Array.from({ length: 24 }, (_, i) => ({ x: 26 + (i * 7.3) % 20, z: -14 - (i * 5.9) % 22, d: (i % 5) * 0.4 })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = rt.time - rt.tunnelFeedT;
    mesh.visible = t >= 0 && t < 7;
    if (!mesh.visible) return;
    seeds.forEach((s, i) => {
      const y = HABITAT.max.y - Math.max(0, t - s.d) * 1.4;
      m.makeTranslation(s.x + Math.sin(t + i) * 0.2, Math.max(0.2, y), s.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, seeds.length]} frustumCulled={false} raycast={() => undefined} />;
}

function Animals({ placed }: { placed: Array<{ zone: number; kind: TunnelDecorKind }> }) {
  const fish = useGame((s) => s.model.tanks.find((t) => t.type === "sharks")?.fish);
  const key = (fish ?? []).filter((f) => TUNNEL_SPECIES.has(f.species)).map((f) => `${f.id}:${f.species}`).join(",");
  const animals = useMemo<SwimAnimal[]>(() => key ? key.split(",").map((p) => { const [id, species] = p.split(":"); return { id, species: species as TunnelSpecies }; }) : [], [key]);
  const volume = useMemo(() => sharkSwimVolume(placed), [placed]);
  const exploring = useRef(false);
  useFrame(() => { exploring.current = rt.explore.active; });
  return <TunnelAnimals animals={animals} volume={volume} detail="close" />;
}

/** The whole Shark Tunnel wing (mounted once it is open). */
export function SharkTunnel() {
  const open = useGame((s) => Boolean(s.model.progress.tunnelOpen));
  const ref = useAreaGate(wingShown);
  const statics = useMemo(() => (open ? habitatStaticGeometry() : null), [open]);
  const lobby = useMemo(() => (open ? lobbyGeometry() : null), [open]);
  const glass = useMemo(() => (open ? tunnelGlassGeometry() : null), [open]);
  const shafts = useMemo(() => (open ? shaftGeometry() : null), [open]);
  const placed = usePlaced();
  if (!open || !statics || !lobby || !glass || !shafts) return <Environment />;
  const frontW = HABITAT.max.x - HABITAT.min.x;
  return (
    <>
      <Environment />
      <group ref={ref} name="shark-tunnel">
        <mesh geometry={statics.sand} material={habitatSand} raycast={() => undefined} />
        <mesh geometry={statics.rock} material={habitatRock} raycast={() => undefined} />
        <mesh geometry={statics.struct} material={tunnelStruct} raycast={() => undefined} />
        <mesh geometry={lobby} material={lobbyMat} raycast={() => undefined} />
        <Structures placed={placed} />
        <ZoneRings placed={placed} />
        <Animals placed={placed} />
        <FeedChunks />
        <TunnelTrophy />
        <TunnelVisitors />
        <ExplorePlayer />
        {/* Transparent parts last: glass, front water section, surface, shafts, motes. */}
        <mesh geometry={glass} material={tunnelGlass} renderOrder={4} raycast={() => undefined} />
        <mesh position={[(HABITAT.min.x + HABITAT.max.x) / 2, (HABITAT.max.y + 0.6) / 2, HABITAT.max.z + 0.02]} material={waterSection} renderOrder={1} raycast={() => undefined}>
          <planeGeometry args={[frontW, HABITAT.max.y - 0.6]} />
        </mesh>
        <Surface />
        <Shafts geometry={shafts} />
        <Motes />
        <mesh position={[MOUTHS.entrance, 3.7, TUNNEL_LOBBY.minZ + 0.04]} raycast={() => undefined}>
          <planeGeometry args={[2.6, 0.62]} />
          <primitive object={signMaterial("SHARK TUNNEL\nサメの トンネル", "#0f4c66", "#e8fbff", 768, 184)} attach="material" />
        </mesh>
        <mesh position={[MOUTHS.exit, 3.7, TUNNEL_LOBBY.minZ + 0.04]} raycast={() => undefined}>
          <planeGeometry args={[1.7, 0.5]} />
          <primitive object={signMaterial("EXIT  でぐち", "#2b7a3c", "#ffffff", 512, 150)} attach="material" />
        </mesh>
      </group>
    </>
  );
}

export { SPECIES };

/** Light shafts read as flat sheets from above: only drawn inside the tunnel. */
function Shafts({ geometry }: { geometry: THREE.BufferGeometry }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.visible = rt.explore.active; });
  return <mesh ref={ref} geometry={geometry} material={shaftMat} renderOrder={5} raycast={() => undefined} />;
}

const zoneHitGeo = new THREE.CircleGeometry(2.7, 24).rotateX(-Math.PI / 2);
const zoneHitMat = new THREE.MeshBasicMaterial({ visible: false });

/** The Shark Tunnel trophy (milestone 5): a gold cup with a little shark, on a pedestal in the lobby. */
export function TunnelTrophy() {
  const won = useGame((s) => Boolean(s.model.progress.tunnel?.trophy));
  const geo = useMemo(() => {
    const b = new PartBuilder(0.2);
    b.cyl(0.42, 0.5, 0.9, 0, 0, 0, "#e8ecf2", 16);
    b.cyl(0.36, 0.42, 0.08, 0, 0.9, 0, "#c9a227", 16);
    b.cyl(0.07, 0.16, 0.32, 0, 0.98, 0, "#f2c641", 12);
    b.add(new THREE.CylinderGeometry(0.3, 0.12, 0.42, 16, 1, true), "#f2c641", [0, 1.5, 0]);
    b.sphere(0.12, 0, 1.3, 0, "#f2c641", [1.6, 0.5, 1.6], 12);
    // The shark on the rim.
    b.sphere(0.16, 0, 1.86, 0, "#9fb6bb", [1.9, 0.62, 0.7], 12);
    b.add(new THREE.ConeGeometry(0.07, 0.17, 4), "#7f969b", [0.02, 2.0, 0], [0, 0, -0.25]);
    b.add(new THREE.ConeGeometry(0.08, 0.16, 4), "#7f969b", [-0.33, 1.88, 0], [0, 0, Math.PI / 2.3]);
    return b.build();
  }, []);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.y = rt.time * 0.4; });
  if (!won) return null;
  return (
    <group position={[42.0, 0, -6.1]} name="tunnel-trophy">
      <group ref={ref}>
        <mesh geometry={geo} material={smoothMat} raycast={() => undefined} />
      </group>
    </group>
  );
}
