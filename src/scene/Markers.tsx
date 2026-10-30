import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getGame } from "../game/store";
import { rt } from "../game/runtime";
import { SLOT_POS, STAND_H, TANKS } from "../game/data/tanks";
import { canLive, hasSpace, remodelPlan } from "../game/logic/model";
import { HALL_OF } from "../game/data/tanks";
import { DOOR_Z, doorX, roomAtX } from "../game/data/rooms";
import { nextStep } from "../game/logic/guide";

/**
 * One shared pool of at most three golden arrows for guide/nudge targets and
 * the request ladder. Markers never add a render pass or intercept a tap.
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
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(() => {
    const g = getGame();
    const spots: { x: number; y: number; z: number }[] = [];
    if (g.screen === "game" && g.view === "room" && !rt.camera.shot) {
      const tanks = g.model.tanks;
      const guide = g.guide ?? g.nudge?.target ?? null;
      const add = (id: string) => {
        const t = tanks.find((x) => x.id === id);
        if (!t || HALL_OF[t.slot] !== g.hall || spots.length >= MAX || spots.some((p) => p.x === SLOT_POS[t.slot].x && p.z === SLOT_POS[t.slot].z)) return;
        const p = SLOT_POS[t.slot];
        spots.push({ x: p.x, y: STAND_H + TANKS[t.type].h + 0.95, z: p.z });
      };
      if (g.view === "room") {
        if (g.placing?.kind === "fish") {
          // Only tanks the carried animal can live in.
          const fishId = g.placing.fishId;
          const carried = g.model.inv.fish.find((f) => f.id === fishId);
          for (const t of tanks) if (hasSpace(t, carried?.species) && (!carried || canLive(carried.species, t))) add(t.id);
        }
        if (g.placing?.kind === "remodel") {
          for (const t of tanks) {
            const p = remodelPlan(g.model, t.id, g.placing.type);
            if (!p.reason || p.reason === "habitat" || p.reason === "full") add(t.id);
          }
        }
        for (const id of rt.glow.tanks) add(id);
        if (guide?.startsWith("tank-")) {
          const slot = guide.slice(5);
          const t = tanks.find((x) => x.slot === slot);
          if (t && !spots.length) add(t.id);
        }
        if (guide === "chip-visitor" || guide?.startsWith("visitor-")) {
          const id = guide === "chip-visitor" ? g.waiting?.id : guide.slice(8);
          const visitor = rt.visitors.find((v) => v.id === id);
          if (visitor && roomAtX(visitor.x) === g.hall && spots.length < MAX) spots.push({ x: visitor.x, y: 2.35 - visitor.seat * 0.25, z: visitor.z });
        }
        const roomGoal = guide === "btn-tank-shop" && nextStep(g.model)?.goal === "openHall";
        const door = guide === "door-gallery" || guide === "gallery-door" ? 2 : guide === "door-hall" || guide === "hall-door" || roomGoal || g.nudge?.shopItem === "hall" ? 1 : null;
        if (door && g.hall === door - 1 && spots.length < MAX) spots.push({ x: doorX(door) - 0.35, y: 2.7, z: DOOR_Z });
      }
      // In the close-up the free decoration rings pulse gold themselves (Tank.tsx); room-sized arrows would hide the fish.
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
          <mesh geometry={geo} material={mat} raycast={() => {}} />
        </group>
      ))}
    </>
  );
}
