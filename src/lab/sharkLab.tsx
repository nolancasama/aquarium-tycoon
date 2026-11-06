import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { tunnelRuntime, type P3, type SwimAnimal, type SwimVolume, type TunnelSpecies } from "../game/tunnel/contract";
import { TunnelAnimals } from "../scene/tunnel/TunnelAnimals";
import { shaderTime } from "../scene/materials";
import { tunnelAnimationTime } from "../scene/tunnel/sharkMaterials";

// Development-only fixture. This module is reachable through lab/sharks.html,
// never the production entry point or Vite's build inputs.
export const SHARK_LAB_VOLUME: SwimVolume = {
  min: { x: -16, y: -.5, z: -15 }, max: { x: 16, y: 8, z: 15 }, floorY: () => -.5,
  tunnel: { closed: true, points: [
    [-6, 10], [-6, 0], [-6, -7], [0, -9], [6, -7], [6, 0], [6, 10], [0, 10],
  ].map(([x, z]) => ({ x, y: 0, z, halfWidth: x === 0 && z === -9 ? 4.5 : 2, height: x === 0 && z === -9 ? 4.5 : 2.9 })) },
  obstacles: [
    { kind: "capsule", a: { x: -11, y: 0, z: -3 }, b: { x: -11, y: 5, z: -3 }, r: 1 },
    { kind: "capsule", a: { x: 11, y: 0, z: -5 }, b: { x: 11, y: 4, z: -5 }, r: 1 },
    { kind: "capsule", a: { x: -2, y: 0, z: 1 }, b: { x: -2, y: 4, z: 1 }, r: .55 },
    { kind: "capsule", a: { x: 2, y: 0, z: 1 }, b: { x: 2, y: 4, z: 1 }, r: .55 },
    { kind: "capsule", a: { x: -2, y: 4, z: 1 }, b: { x: 2, y: 4, z: 1 }, r: .55 },
    { kind: "box", c: { x: -11, y: 0, z: 6 }, half: { x: 2, y: .5, z: 1.5 }, yaw: .25 },
  ],
  gates: [{ c: { x: 0, y: 2, z: 1 }, axis: { x: 0, y: 0, z: 1 }, r: 1.4 }],
  restSpots: [{ x: -11, y: .5, z: 6 }, { x: 11, y: -.5, z: 7 }],
};

type Shot = "above" | "tunnel" | "side" | "close" | "management";
type Angle = "side" | "top" | "below" | "front";
const params = new URLSearchParams(location.search);
tunnelAnimationTime.value = 0;
const speciesList: TunnelSpecies[] = ["blacktip", "zebrashark", "eagleray"];
const requested = params.get("species") as TunnelSpecies | null;
const animals: SwimAnimal[] = (requested && speciesList.includes(requested) ? [requested] : [
  "blacktip", "blacktip", "blacktip", "blacktip", "blacktip", "zebrashark", "zebrashark", "zebrashark", "eagleray", "eagleray", "eagleray", "eagleray",
] as TunnelSpecies[]).map((species, i) => ({ id: `${species}-${i}`, species }));

interface LabState { ready: boolean; elapsed: number; paused: boolean; shot: Shot; focus: string | null; poses: ReturnType<typeof snapshot> }
interface LabHooks {
  state(): LabState;
  advance(seconds: number): LabState;
  camera(shot: Shot, angle?: Angle): void;
  focus(species: TunnelSpecies, angle?: Angle): void;
  pause(value: boolean): void;
  attract(id: string, point: P3, seconds: number): void;
  hold(id: string, seconds: number): void;
}
declare global { interface Window { __sharkLab?: LabHooks } }
const snapshot = () => tunnelRuntime.swim?.poses().map(p => ({ ...p })) ?? [];

function Segment({ a, b, radius, colour, glass = false }: { a: P3; b: P3; radius: number; colour: string; glass?: boolean }) {
  const transform = useMemo(() => {
    const start = new THREE.Vector3(a.x, a.y, a.z), end = new THREE.Vector3(b.x, b.y, b.z);
    return { centre: start.clone().add(end).multiplyScalar(.5), length: start.distanceTo(end), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize()) };
  }, [a, b]);
  return <mesh position={transform.centre} quaternion={transform.q}>
    <cylinderGeometry args={[radius, radius, transform.length, glass ? 18 : 9, 1, glass]} />
    <meshLambertMaterial color={colour} transparent={glass} opacity={glass ? .085 : 1} side={glass ? THREE.DoubleSide : THREE.FrontSide} depthWrite={!glass} />
  </mesh>;
}

function Habitat() {
  const tube = useMemo(() => SHARK_LAB_VOLUME.tunnel.points.map((a, i, points) => {
    const b = points[(i + 1) % points.length];
    // A low-poly half-ellipse shares the exact floor-to-crown cross section
    // with the collision volume, including the enlarged chamber segment.
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const vertices: number[] = [], indices: number[] = [];
    for (let j = 0; j <= 1; j++) for (let k = 0; k <= 18; k++) {
      const p = j ? b : a, angle = k / 18 * Math.PI;
      vertices.push(p.x - dz / len * Math.cos(angle) * p.halfWidth, p.y + Math.sin(angle) * p.height, p.z + dx / len * Math.cos(angle) * p.halfWidth);
    }
    for (let k = 0; k < 18; k++) indices.push(k, k + 19, k + 1, k + 1, k + 19, k + 20);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
    return g;
  }), []);
  useEffect(() => () => tube.forEach(g => g.dispose()), [tube]);
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -.5, 0]}><planeGeometry args={[32, 30]} /><meshLambertMaterial color="#d5c28c" /></mesh>
    <mesh position={[0, 3.75, -15]}><boxGeometry args={[32, 8.5, .2]} /><meshLambertMaterial color="#30566b" /></mesh>
    <mesh position={[-16, 3.75, 0]}><boxGeometry args={[.2, 8.5, 30]} /><meshLambertMaterial color="#30566b" /></mesh>
    {tube.map((g, i) => <mesh key={i} geometry={g}><meshLambertMaterial color="#a6edee" transparent opacity={.12} side={THREE.DoubleSide} depthWrite={false} /></mesh>)}
    {SHARK_LAB_VOLUME.obstacles.map((o, i) => o.kind === "capsule" ? <Segment key={i} a={o.a} b={o.b} radius={o.r} colour="#708991" /> : o.kind === "box" ? <mesh key={i} position={[o.c.x, o.c.y, o.c.z]} rotation-y={o.yaw ?? 0}><boxGeometry args={[o.half.x * 2, o.half.y * 2, o.half.z * 2]} /><meshLambertMaterial color="#9d9980" /></mesh> : null)}
    {SHARK_LAB_VOLUME.tunnel.points.map((p, i) => <mesh key={i} position={[p.x, -.12, p.z]}><boxGeometry args={[p.halfWidth * 1.8, .2, 1]} /><meshLambertMaterial color="#547d88" /></mesh>)}
  </group>;
}

function Laboratory() {
  const { camera, gl } = useThree();
  const [paused, setPaused] = useState(params.get("paused") === "1");
  const control = useRef({ elapsed: 0, shot: (params.get("cam") ?? "above") as Shot, angle: "side" as Angle, focus: requested ? animals[0].id : null as string | null, ready: false });
  const target = useMemo(() => new THREE.Vector3(), []);
  const habitat = useRef<THREE.Group>(null);
  useEffect(() => {
    const c = control.current;
    const state = (): LabState => ({ ready: c.ready, elapsed: c.elapsed, paused, shot: c.shot, focus: c.focus, poses: snapshot() });
    window.__sharkLab = {
      state,
      advance(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 600) throw Error("advance expects 0..600 seconds");
        if (!tunnelRuntime.swim || !c.ready) throw Error("HARNESS_PRECONDITION_FAILED: swim not ready");
        const count = Math.floor(seconds * 60);
        for (let i = 0; i < count; i++) tunnelRuntime.swim.step(1 / 60);
        if (seconds - count / 60 > 1e-9) tunnelRuntime.swim.step(seconds - count / 60);
        c.elapsed += seconds; shaderTime.value = c.elapsed; tunnelAnimationTime.value = c.elapsed;
        return state();
      },
      camera(shot, angle = "side") { c.shot = shot; c.angle = angle; if (shot !== "close") c.focus = null; },
      focus(species, angle = "side") { c.focus = animals.find(a => a.species === species)?.id ?? null; c.shot = "close"; c.angle = angle; },
      pause: setPaused,
      attract(id, point, seconds) { tunnelRuntime.swim?.attract(id, point, seconds); },
      hold(id, seconds) { tunnelRuntime.swim?.hold(id, seconds); },
    };
    return () => { delete window.__sharkLab; };
  }, [paused]);
  useFrame((_, dt) => {
    const c = control.current;
    if (!c.ready && tunnelRuntime.swim?.poses().length === animals.length) {
      c.ready = true;
      const initial = Math.min(600, Math.max(0, Number(params.get("t")) || 0));
      for (let i = 0; i < Math.round(initial * 60); i++) tunnelRuntime.swim.step(1 / 60);
      c.elapsed = initial;
    }
    if (!paused) c.elapsed += Math.min(dt, .05);
    shaderTime.value = c.elapsed; tunnelAnimationTime.value = c.elapsed;
    const pose = c.focus ? tunnelRuntime.swim?.poses().find(p => p.id === c.focus) : undefined;
    if (habitat.current) habitat.current.visible = c.shot !== "close";
    if (pose && c.shot === "close") {
      const distance = pose.species === "blacktip" ? 3.5 : 4.5;
      target.set(pose.x, pose.y, pose.z);
      const sideX = -pose.hz, sideZ = pose.hx;
      if (c.angle === "top") camera.position.set(pose.x + .01, pose.y + distance, pose.z);
      else if (c.angle === "below") camera.position.set(pose.x + sideX * .25, pose.y - distance, pose.z + sideZ * .25);
      else if (c.angle === "front") camera.position.set(pose.x + pose.hx * distance, pose.y + .15, pose.z + pose.hz * distance);
      else camera.position.set(pose.x + sideX * distance, pose.y + .35, pose.z + sideZ * distance);
    } else {
      if (c.shot === "tunnel") { camera.position.set(-6, 1.2, 7); target.set(-5, 5.7, -2); }
      else if (c.shot === "side") { camera.position.set(22, 5.5, 20); target.set(0, 3, 0); }
      else if (c.shot === "management") { camera.position.set(36, 29, 43); target.set(0, 2, 0); }
      else { camera.position.set(16, 25, 29); target.set(0, 2, 0); }
    }
    camera.lookAt(target); camera.updateMatrixWorld();
    gl.domElement.dataset.ready = String(c.ready);
  });
  return <>
    <color attach="background" args={["#2d6a7e"]} /><fog attach="fog" args={["#3c8190", 18, 65]} />
    <ambientLight intensity={1.25} /><hemisphereLight args={["#c4f5ff", "#766a57", 1.5]} /><directionalLight position={[3, 15, 8]} intensity={2.2} />
    <group ref={habitat}><Habitat /></group><TunnelAnimals animals={animals} volume={SHARK_LAB_VOLUME} detail={control.current.shot === "management" ? "management" : "close"} paused={paused} />
  </>;
}

createRoot(document.getElementById("root")!).render(<div style={{ width: "100vw", height: "100vh" }}>
  <Canvas dpr={1} camera={{ position: [16, 25, 29], fov: 43, near: .03, far: 140 }}><Laboratory /></Canvas>
  <div style={{ position: "absolute", top: 16, left: 20, font: "14px system-ui", color: "#e6fcff", pointerEvents: "none" }}>SHARK TUNNEL · DEVELOPMENT LAB<br /><small>{requested ?? "All species"} · {params.get("cam") ?? "above"}</small></div>
</div>);
