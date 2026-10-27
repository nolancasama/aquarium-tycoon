import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame } from "../game/store";
import { rt, type VisitorRt } from "../game/runtime";
import { SLOT_POS, TANKS } from "../game/data/tanks";
import { benchPose, requestEligible } from "../game/world";
import { tapVisitor } from "../game/flow/actions";
import { paletteCount, personModel } from "./models/people";
import { bubbleTexture, shadowMaterial, smoothMat } from "./materials";

/** The visitors in rt.visitors (the list is re-read when someone arrives or leaves). */
export function Visitors() {
  const [ids, setIds] = useState<string[]>([]);
  useFrame(() => {
    if (rt.visitors.length !== ids.length || rt.visitors.some((v, i) => v.id !== ids[i])) setIds(rt.visitors.map((v) => v.id));
  });
  return (
    <>
      {ids.map((id) => (
        <Visitor key={id} id={id} />
      ))}
    </>
  );
}

/** Hide a visitor standing between the close-up camera and the tank. */
function blocksCloseUp(v: VisitorRt): boolean {
  const g = getGame();
  if (g.view !== "tank" || !g.tankId || rt.camera.shot) return false;
  const t = g.model.tanks.find((x) => x.id === g.tankId);
  if (!t) return false;
  const p = SLOT_POS[t.slot];
  const def = TANKS[t.type];
  return Math.abs(v.x - p.x) < def.w / 2 + 0.45 && v.z > p.z + def.d / 2 && v.z < rt.camera.pos.z;
}

function Visitor({ id }: { id: string }) {
  const v0 = rt.visitors.find((v) => v.id === id);
  const variant = useMemo(() => {
    const n = Number(id.replace(/\D/g, "")) || 0;
    return v0 ? n % paletteCount(v0.type) : 0;
  }, [id, v0]);
  const model = useMemo(() => (v0 ? personModel(v0.type, variant) : null), [v0, variant]);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const bubbleMat = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }), []);
  const shadow = useMemo(() => shadowMaterial(0.28), []);
  useFrame(() => {
    const v = rt.visitors.find((x) => x.id === id);
    const r = root.current;
    if (!v || !r || !model) return;
    const t = rt.time;
    r.position.set(v.x, 0, v.z);
    r.rotation.y = v.yaw;
    r.visible = !blocksCloseUp(v) && t - v.bornT > 0.05;
    let y = 0;
    let lean = 0;
    let tilt = 0;
    let swing = 0;
    if (v.moving) {
      swing = Math.sin(v.step) * 0.55;
      y = Math.abs(Math.cos(v.step)) * 0.03;
    }
    if (v.state === "look") lean = 0.12;
    const a = v.anim;
    if (a) {
      const k = t - a.t0;
      if (a.kind === "jump" && k < 1.2) y += Math.abs(Math.sin((k / 1.2) * Math.PI * 2)) * 0.22;
      else if (a.kind === "clap" && k < 1) y += Math.abs(Math.sin(k * Math.PI * 4)) * 0.06;
      else if (a.kind === "hmm" && k < 1.4) tilt = Math.sin((k / 1.4) * Math.PI) * 0.18;
      else if (a.kind === "photo" && k < 1.4) lean = -0.1;
      else if (a.kind === "wave" && k < 1.2) y += Math.abs(Math.sin(k * Math.PI * 3)) * 0.04;
      else if (k > 1.5) v.anim = null;
    }
    const pose = benchPose(v.seat, model.hip);
    if (v.seat > 0) {
      y = pose.bodyY;
      lean = 0;
      tilt = 0;
      swing = 0;
    }
    const legs = swing + pose.thigh;
    if (body.current) {
      body.current.position.y = y;
      body.current.rotation.x = lean;
      body.current.rotation.z = tilt;
    }
    if (torso.current) torso.current.rotation.x = v.seat > 0 ? pose.lean : 0;
    if (legL.current && legR.current) {
      legL.current.rotation.x = legs;
      legR.current.rotation.x = legs - 2 * swing;
    }
    if (kneeL.current && kneeR.current) {
      kneeL.current.rotation.x = pose.knee;
      kneeR.current.rotation.x = pose.knee;
    }
    const b = bubble.current;
    if (b) {
      b.visible = Boolean(v.bubble) && r.visible && (v.bubble !== "!" || v.scripted || requestEligible(v));
      if (v.bubble) {
        const tex = bubbleTexture(v.bubble);
        if (bubbleMat.map !== tex) {
          bubbleMat.map = tex;
          bubbleMat.needsUpdate = true;
        }
        const pulse = v.bubble === "!" ? 1 + Math.sin(t * 5) * 0.08 : Math.min(1, (t - v.bubbleT0) * 4);
        b.scale.set(0.55 * pulse, 0.55 * pulse, 1);
        b.position.y = model.height + 0.38 + y + Math.sin(t * 3) * 0.03;
      }
    }
  });
  if (!v0 || !model) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // Eligible requests take the tap while walking as well as on the bench.
    const v = rt.visitors.find((x) => x.id === id);
    const waiting = Boolean(v && requestEligible(v));
    if (e.delta > 8 || !waiting || !root.current?.visible || getGame().view !== "room") return;
    e.stopPropagation();
    tapVisitor(id);
  };
  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} material={shadow}>
        <planeGeometry args={[0.8, 0.8]} />
      </mesh>
      <group ref={body}>
        {/* The torso bends at the hips when sitting and standing; the legs do not. */}
        <group ref={torso} position={[0, model.hip, 0]}>
          <mesh geometry={model.body} material={smoothMat} position={[0, -model.hip, 0]} />
        </group>
        <group ref={legL} position={[-model.legX, model.hip, 0]}>
          <mesh geometry={model.leg} material={smoothMat} />
          <group ref={kneeL} position={[0, -model.thigh, 0]}>
            <mesh geometry={model.shin} material={smoothMat} />
          </group>
        </group>
        <group ref={legR} position={[model.legX, model.hip, 0]}>
          <mesh geometry={model.leg} material={smoothMat} />
          <group ref={kneeR} position={[0, -model.thigh, 0]}>
            <mesh geometry={model.shin} material={smoothMat} />
          </group>
        </group>
      </group>
      <sprite ref={bubble} material={bubbleMat} visible={false} renderOrder={12} onClick={onClick} />
      <mesh position={[0, model.height / 2 + 0.1, 0]} onClick={onClick}>
        <boxGeometry args={[0.9, model.height + 0.5, 0.9]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
