import { useRef } from "react";
import type * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { rt } from "../game/runtime";
import { decayRunning, tick } from "../game/sim";
import { sampleVisitorCrowdFrame } from "../game/flow/visitors";
import { shaderTime } from "./materials";
import { CameraRig, FOV } from "./CameraRig";
import { Room } from "./Room";
import { Tanks } from "./Tank";
import { Visitors } from "./Visitors";
import { Pico } from "./Pico";
import { Effects } from "./Effects";
import { Markers } from "./Markers";
import { CountNumbers } from "./Animals";
import { MainRooms, SharkTunnel } from "./tunnel/SharkTunnel";
import { GrandHub } from "./hub/GrandHub";
import { CoastZone } from "./coast/CoastZone";
import { DolphinLagoon } from "./lagoon/DolphinLagoon";

/** Renderer stats for the test hook (draw calls / triangles per frame). */
export const perf = { calls: 0, triangles: 0, fps: 0 };

function Clock() {
  const frames = useRef({ n: 0, t: 0 });
  // Runs before everything else each frame.
  useFrame((state, dt) => {
    sampleVisitorCrowdFrame(dt, !document.hidden && decayRunning());
    const d = Math.min(dt, 0.1);
    rt.time += d;
    shaderTime.value = rt.time;
    tick(d);
    perf.calls = state.gl.info.render.calls;
    perf.triangles = state.gl.info.render.triangles;
    const f = frames.current;
    f.n++;
    f.t += dt;
    if (f.t > 1) {
      perf.fps = Math.round(f.n / f.t);
      f.n = 0;
      f.t = 0;
    }
  }, -10);
  return null;
}

/**
 * School Chromebooks: start sharp (up to 1.5x), and if frames stay under
 * ~28 fps for 4 s, drop to 1x once and never flip back (flipping would
 * stutter). Teachers never need a graphics setting.
 */
export const dprState = { dpr: 0, dropped: false };

function AdaptiveDpr() {
  const { setDpr, gl } = useThree();
  const slow = useRef(0);
  useFrame((_, dt) => {
    dprState.dpr = gl.getPixelRatio();
    if (dprState.dropped || dt > 0.5) return;
    if (gl.getPixelRatio() <= 1) return;
    slow.current = dt > 1 / 28 ? slow.current + dt : Math.max(0, slow.current - dt * 0.5);
    if (slow.current > 4) {
      dprState.dropped = true;
      setDpr(1);
    }
  });
  return null;
}

/** The scene's three lights; an outdoor area retunes them while it is shown (no new lights, so no shader recompiles). */
export const sceneLights: { hemi: THREE.HemisphereLight | null; sun: THREE.DirectionalLight | null; fill: THREE.DirectionalLight | null } = { hemi: null, sun: null, fill: null };

function Lights() {
  return (
    <>
      <hemisphereLight ref={(l) => void (sceneLights.hemi = l)} args={["#e6f7ff", "#c9b89a", 1.7]} />
      <directionalLight ref={(l) => void (sceneLights.sun = l)} position={[-4, 10, 7]} intensity={1.5} color="#fff4e2" />
      <directionalLight ref={(l) => void (sceneLights.fill = l)} position={[6, 5, -3]} intensity={0.35} color="#bfe6ff" />
    </>
  );
}

export function GameScene() {
  return (
    <Canvas
      className="scene"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 0.1, far: 120, position: [0, 8, 13] }}
      flat
      onPointerMissed={() => undefined}
    >
      <color attach="background" args={["#bfe8f3"]} />
      <Clock />
      <AdaptiveDpr />
      <Lights />
      <MainRooms>
        <Room />
        <Tanks />
        <Pico />
        <Visitors />
      </MainRooms>
      <SharkTunnel />
      <GrandHub />
      <CoastZone />
      <DolphinLagoon />
      <Effects />
      <Markers />
      <CountNumbers />
      <CameraRig />
    </Canvas>
  );
}
