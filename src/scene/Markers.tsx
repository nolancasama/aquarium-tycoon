import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getGame } from "../game/store";
import { rt } from "../game/runtime";
import { SLOT_POS, STAND_H, TANKS } from "../game/data/tanks";
import { canLive, hasSpace } from "../game/logic/model";

/**
 * Bobbing golden arrows over what to tap in the room view: the tank to put a
 * new fish in, the tank the tutorial or a nudge points at, the right tank
 * after three wrong "show me" taps.
 */
const MAX = 3;

export function Markers() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.2, 0.36, 4);
    g.rotateX(Math.PI);
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ color: "#ffcc33", emissive: "#7a5200" }), []);
  useFrame(() => {
    const g = getGame();
    const spots: { x: number; y: number; z: number }[] = [];
    if (g.screen === "game" && g.view === "room" && !rt.camera.shot) {
      const tanks = g.model.tanks;
      const add = (id: string) => {
        const t = tanks.find((x) => x.id === id);
        if (!t || spots.length >= MAX) return;
        const p = SLOT_POS[t.slot];
        spots.push({ x: p.x, y: STAND_H + TANKS[t.type].h + 0.95, z: p.z });
      };
      if (g.placing?.kind === "fish") {
        // Only tanks the carried animal can live in.
        const fishId = g.placing.fishId;
        const carried = g.model.inv.fish.find((f) => f.id === fishId);
        for (const t of tanks) if (hasSpace(t) && (!carried || canLive(carried.species, t))) add(t.id);
      }
      for (const id of rt.glow.tanks) add(id);
      const guide = g.guide ?? g.nudge?.target ?? null;
      if (guide?.startsWith("tank-")) {
        const slot = guide.slice(5);
        const t = tanks.find((x) => x.slot === slot);
        if (t && !spots.length) add(t.id);
      }
    }
    for (let i = 0; i < MAX; i++) {
      const r = refs.current[i];
      if (!r) continue;
      const s = spots[i];
      r.visible = Boolean(s);
      if (s) {
        r.position.set(s.x, s.y + Math.sin(rt.time * 4 + i) * 0.1, s.z);
        r.rotation.y = rt.time * 1.5;
      }
    }
  });
  return (
    <>
      {Array.from({ length: MAX }, (_, i) => (
        <group key={i} ref={(r) => void (refs.current[i] = r)} visible={false}>
          <mesh geometry={geo} material={mat} />
        </group>
      ))}
    </>
  );
}
