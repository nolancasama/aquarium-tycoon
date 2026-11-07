import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { getGame } from "../game/store";
import { rt, type VisitorRt } from "../game/runtime";
import { SLOT_POS, TANKS } from "../game/data/tanks";
import { benchPose, seatById } from "../game/world";
import { tapVisitor } from "../game/flow/actions";
import { visitorRequestAvailable } from "../game/flow/visitors";
import { paletteCount, personModel, tunnelPersonModel } from "./models/people";
import { additiveSprite, bubbleTexture, shadowMaterial, smoothMat } from "./materials";

/** The visitors in rt.visitors (the list is re-read when someone arrives or leaves). */
export function Visitors() {
  const [ids, setIds] = useState<string[]>([]);
  useFrame(() => {
    let changed = rt.visitors.length !== ids.length;
    for (let i = 0; !changed && i < ids.length; i++) changed = rt.visitors[i].id !== ids[i];
    if (changed) setIds(rt.visitors.map((v) => v.id));
  });
  return (
    <>
      {ids.map((id) => (
        <Visitor key={id} id={id} />
      ))}
    </>
  );
}

const REDUCED_MOTION = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const phoneGeo = new THREE.BoxGeometry(0.08, 0.13, 0.015);
const phoneMat = new THREE.MeshLambertMaterial({ color: "#2b2f3a" });
const shadowGeo = new THREE.PlaneGeometry(0.8, 0.8);
const pickGeo = new THREE.BoxGeometry(1, 1, 1);
const pickMat = new THREE.MeshBasicMaterial({ visible: false });
let sharedShadow: THREE.MeshBasicMaterial | undefined;
// Canvas-backed shadow resources are created on first mount, then shared for the scene lifetime.
const visitorShadow = () => (sharedShadow ??= shadowMaterial(0.28));

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

const Visitor = memo(function Visitor({ id }: { id: string }) {
  const v0 = rt.visitors.find((v) => v.id === id);
  const variant = useMemo(() => {
    const n = Number(id.replace(/\D/g, "")) || 0;
    return v0 ? n % paletteCount(v0.type) : 0;
  }, [id, v0]);
  const model = useMemo(() => (v0 ? (v0.cosmetic ? tunnelPersonModel(v0.type, variant) : personModel(v0.type, variant)) : null), [v0, variant]);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const phone = useRef<THREE.Mesh>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const bubbleMat = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }), []);
  const shadow = visitorShadow();
  const limbElapsed = useRef(0);
  const poseCache = useRef<{ progress: number; seatId: string | undefined; pose: ReturnType<typeof benchPose> } | null>(null);
  // The first-visitor hint: a soft halo behind the body (only drawn while on).
  const glow = useRef<THREE.Sprite>(null);
  const glowMat = useMemo(() => additiveSprite("#fff19a", 0), []);
  useEffect(() => () => { glowMat.dispose(); bubbleMat.dispose(); }, [glowMat, bubbleMat]);
  useFrame(({ camera }, frameDt) => {
    // Runtime visitors mutate in place. Keep their reference instead of searching the crowd every frame.
    const v = v0;
    const r = root.current;
    if (!v || !r || !model) return;
    const t = rt.time;
    r.position.set(v.x, 0, v.z);
    r.rotation.y = v.yaw;
    if (glow.current) {
      const on = rt.glow.visitors.has(id);
      glow.current.visible = on;
      glowMat.opacity = on ? (REDUCED_MOTION ? 0.55 : 0.5 + Math.sin(t * 7) * 0.15) : 0;
    }
    // A tap that has to wait still answers at once with a short squash-pop.
    const ack = rt.visitorTapAck?.id === id ? t - rt.visitorTapAck.t0 : Infinity;
    const pop = ack < 0.35 ? 1 + Math.sin((ack / 0.35) * Math.PI) * (REDUCED_MOTION ? 0.04 : 0.12) : 1;
    r.scale.set(pop, pop, pop);
    r.visible = v.state !== "gone" && !blocksCloseUp(v) && t - v.bornT > 0.05;
    limbElapsed.current += frameDt;
    const dx = camera.position.x - v.x;
    const dz = camera.position.z - v.z;
    const distant = dx * dx + camera.position.y * camera.position.y + dz * dz > 20 * 20;
    // Positions remain smooth; distant background limbs update at 12 Hz. Requests,
    // reactions, tap feedback and sitting transitions retain their full animation cadence.
    if (distant && !v.request && !v.scripted && !v.anim && ack >= 0.35 && (v.seat === 0 || v.seat === 1) && limbElapsed.current < 1 / 12) return;
    const dt = limbElapsed.current;
    limbElapsed.current = 0;
    let y = 0;
    let lean = 0;
    let tilt = 0;
    let swing = 0;
    let armTarget = 0;
    let takingPhoto = false;
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
      else if (a.kind === "photo" && k < 1.4) { lean = -0.1; armTarget = 0.75; takingPhoto = true; }
      else if (a.kind === "point" && k < 1.4) armTarget = 0.95;
      else if (a.kind === "wave" && k < 1.2) y += Math.abs(Math.sin(k * Math.PI * 3)) * 0.04;
      else if (k > 1.5) v.anim = null;
    }
    const seatId = v.seatId ?? v.poseSeatId;
    if (!poseCache.current || poseCache.current.progress !== v.seat || poseCache.current.seatId !== seatId) {
      poseCache.current = { progress: v.seat, seatId, pose: benchPose(v.seat, model.hip, seatById(seatId)) };
    }
    const pose = poseCache.current.pose;
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
    if (torso.current) {
      const life = v.state === "sit" && !v.request && !v.scripted && !REDUCED_MOTION;
      let turn = v.face ? Math.atan2(v.face.x - v.x, v.face.z - v.z) - v.yaw : 0;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const target = life ? Math.max(-0.13, Math.min(0.13, turn)) * (0.75 + Math.sin(t * 0.43 + v.bornT) * 0.25) : 0;
      torso.current.rotation.y += (target - torso.current.rotation.y) * Math.min(1, dt * 2);
      torso.current.rotation.x = v.seat > 0 ? pose.lean + (life ? 0.012 * (1 + Math.sin(t * 0.62 + v.bornT)) : 0) : 0;
    }
    if (legL.current && legR.current) {
      legL.current.rotation.x = legs;
      legR.current.rotation.x = legs - 2 * swing;
    }
    if (kneeL.current && kneeR.current) {
      kneeL.current.rotation.x = pose.knee;
      kneeR.current.rotation.x = pose.knee;
    }
    if (arm.current) {
      const target = -armTarget * 2.3 - (v.moving ? swing * 0.5 : 0);
      arm.current.rotation.x += (target - arm.current.rotation.x) * Math.min(1, dt * 7);
    }
    if (phone.current) phone.current.visible = takingPhoto;
    const b = bubble.current;
    if (b) {
      b.visible = Boolean(v.bubble) && r.visible && (v.bubble !== "!" || v.scripted || visitorRequestAvailable(v));
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
    const waiting = Boolean(v && visitorRequestAvailable(v));
    if (e.delta > 8 || !waiting || !root.current?.visible || getGame().view !== "room") return;
    e.stopPropagation();
    tapVisitor(id);
  };
  return (
    // Geometry, picking material and blob shadows are shared. Only the mutable
    // per-person sprite materials are disposed by the effect above.
    <group ref={root} dispose={null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} geometry={shadowGeo} material={shadow} />
      <group ref={body}>
        {/* The torso bends at the hips when sitting and standing; the legs do not. */}
        <group ref={torso} position={[0, model.hip, 0]}>
          <mesh geometry={model.body} material={smoothMat} position={[0, -model.hip, 0]} />
          {model.arm && model.armPivot && (
            <group ref={arm} position={[model.armPivot[0], model.armPivot[1] - model.hip, model.armPivot[2]]}>
              <mesh geometry={model.arm} material={smoothMat} />
              <mesh ref={phone} geometry={phoneGeo} material={phoneMat} position={[0.03, -0.6 * (model.hip / 0.74), 0.06]} visible={false} />
            </group>
          )}
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
      <sprite ref={glow} material={glowMat} position={[0, model.height * 0.55, -0.05]} scale={[1.3, model.height * 1.35, 1]} visible={false} raycast={() => {}} />
      <sprite ref={bubble} material={bubbleMat} visible={false} renderOrder={12} onClick={onClick} />
      <mesh geometry={pickGeo} material={pickMat} scale={[0.9, model.height + 0.5, 0.9]} position={[0, model.height / 2 + 0.1, 0]} onClick={onClick} />
    </group>
  );
});
