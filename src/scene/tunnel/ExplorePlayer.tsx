import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getGame } from "../../game/store";
import { rt } from "../../game/runtime";
import { TUNNEL_VIEWING_SPOTS, walkwayFrame } from "../../game/data/sharkTunnel";
import { playerWorld, stepExplore, stepExploreCamera, walkToSpot } from "../../game/tunnel/explore";
import { bossModel } from "../models/people";
import { newPose, TunnelFigure } from "./TunnelFigure";

const spotMat = new THREE.MeshBasicMaterial({ color: "#8ff6ff", transparent: true, opacity: 0.55, depthWrite: false });
const spotGeo = new THREE.RingGeometry(0.42, 0.62, 32).rotateX(-Math.PI / 2);
const spotHit = new THREE.CircleGeometry(0.75, 16).rotateX(-Math.PI / 2);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/** Glowing floor rings at the viewing spots: walk up for a better view, or tap to walk there. */
function ViewingSpots() {
  const refs = useRef<Array<THREE.Group | null>>([]);
  const spots = useMemo(() => TUNNEL_VIEWING_SPOTS.map((v) => {
    const f = walkwayFrame(v.s);
    const l = v.side * 0.7;
    return { ...v, x: f.x - f.dz * l, z: f.z + f.dx * l };
  }), []);
  useFrame(() => {
    const on = rt.explore.active;
    refs.current.forEach((g, i) => {
      if (!g) return;
      g.visible = on;
      const here = rt.explore.spot === spots[i].id;
      const k = here ? 1.15 : 1 + Math.sin(rt.time * 2.4 + i) * 0.06;
      g.scale.set(k, 1, k);
    });
  });
  return <>{spots.map((s, i) => (
    <group key={s.id} ref={(g) => void (refs.current[i] = g)} position={[s.x, 0.02, s.z]} name={`spot-${s.id}`}>
      <mesh geometry={spotGeo} material={spotMat} renderOrder={3} raycast={() => undefined} />
      <mesh geometry={spotHit} material={hitMat} onClick={(e) => {
        if (e.delta > 8 || !rt.explore.active || getGame().mode !== "play") return;
        e.stopPropagation();
        walkToSpot(s.id);
      }} />
    </group>
  ))}</>;
}

/** The player while exploring: moves on the walkway, drives the exploration camera. */
export function ExplorePlayer() {
  const model = useMemo(() => bossModel(), []);
  const pose = useRef(newPose());
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const e = rt.explore, p = pose.current;
    p.visible = e.active;
    if (!e.active) return;
    const g = getGame();
    // Talking, asking or a card open: stand still (input is ignored, not queued).
    const blocked = g.mode !== "play" || Boolean(g.prompt || g.line || g.settingsOpen || g.stageCard);
    const c = e.cam;
    const camYaw = Math.atan2(-(c.tx - c.x), -(c.tz - c.z));
    stepExplore(dt, camYaw, blocked);
    stepExploreCamera(dt);
    const w = playerWorld();
    p.x = w.x; p.z = w.z;
    p.yaw = e.heading;
    p.moving = e.speed > 0.15;
    p.step = e.phase;
    p.lookUp += ((e.tilt > 0.3 || e.spot === "chamber" ? 1 : 0) - p.lookUp) * Math.min(1, dt * 3);
  }, -3);
  return (
    <>
      <TunnelFigure model={model} pose={pose} name="explore-player" />
      <ViewingSpots />
    </>
  );
}
