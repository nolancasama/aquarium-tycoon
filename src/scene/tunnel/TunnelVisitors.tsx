import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../../game/runtime";
import { getGame } from "../../game/store";
import { personWorld, tunnelPeople } from "../../game/tunnel/tunnelVisitors";
import { tapTunnelVisitor } from "../../game/tunnel/activities";
import { tunnelPersonModel } from "../models/people";
import { newPose, TunnelFigure } from "./TunnelFigure";

const hitGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.8, 8).translate(0, 0.9, 0);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function Person({ id }: { id: string }) {
  const p0 = tunnelPeople.find((p) => p.id === id);
  const model = useMemo(() => p0 ? tunnelPersonModel(p0.type, p0.variant) : null, [p0?.type, p0?.variant]);
  const pose = useRef(newPose());
  const hit = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const p = tunnelPeople.find((x) => x.id === id);
    const q = pose.current;
    if (!p) { q.visible = false; return; }
    const w = personWorld(p);
    // Someone right beside the exploring camera would fill the screen: hide them for that moment.
    const c = rt.explore.cam;
    q.visible = !rt.explore.active || Math.hypot(w.x - c.x, w.z - c.z) > 1.15;
    q.x = w.x; q.z = w.z; q.yaw = p.heading;
    q.moving = p.speed > 0.12;
    q.step = p.phase;
    const up = p.activity === "look" || p.activity === "point" || p.activity === "photo" ? 1 : 0;
    q.lookUp += (up * (p.activity === "look" ? 1 : 0.6) - q.lookUp) * Math.min(1, dt * 3);
    const armWant = p.activity === "point" ? 0.95 : p.activity === "photo" ? 0.75 : 0;
    q.arm += (armWant - q.arm) * Math.min(1, dt * 4);
    q.photo = p.activity === "photo";
    // A visitor with a question bounces gently.
    q.hop = p.request ? Math.abs(Math.sin(rt.time * 4)) * 0.05 : 0;
    if (hit.current) hit.current.position.set(w.x, 0, w.z);
  });
  // Continue can clear the runtime crowd before the cached ID list updates.
  if (!model) return null;
  return (
    <>
      <TunnelFigure model={model} pose={pose} name={`tunnel-visitor-${id}`} />
      <mesh ref={hit} geometry={hitGeo} material={hitMat} name={`tunnel-visitor-hit-${id}`} onClick={(e) => {
        if (e.delta > 8 || getGame().mode !== "play") return;
        const p = tunnelPeople.find((x) => x.id === id);
        if (!p?.request) return;
        e.stopPropagation();
        tapTunnelVisitor(id);
      }} />
    </>
  );
}

/** The tunnel crowd (mounted with the wing; the simulation runs in the game tick). */
export function TunnelVisitors() {
  const [ids, setIds] = useState<string[]>([]);
  const last = useRef("");
  useFrame(() => {
    const key = tunnelPeople.map((p) => p.id).join(",");
    if (key !== last.current) {
      last.current = key;
      setIds(tunnelPeople.map((p) => p.id));
    }
  });
  return <>{ids.map((id) => <Person key={id} id={id} />)}</>;
}
