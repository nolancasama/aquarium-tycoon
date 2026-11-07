import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PersonModel } from "../models/people";
import { smoothMat, shadowMaterial } from "../materials";
import { phonePitchForArm } from "./phonePose";

/** What a tunnel figure is doing this frame (written by the owner, read here). */
export interface FigurePose {
  x: number;
  z: number;
  /** rotation.y (the model faces +z). */
  yaw: number;
  /** Walk cycle phase and whether the legs move. */
  step: number;
  moving: boolean;
  /** 0 standing upright .. 1 leaning back to look up. */
  lookUp: number;
  /** 0 arm down .. 1 arm raised forward (pointing / holding up a phone). */
  arm: number;
  /** Shows the phone in the raised hand. */
  photo: boolean;
  visible: boolean;
  /** Small hop (celebration). */
  hop: number;
}

export const newPose = (): FigurePose => ({ x: 0, z: 0, yaw: 0, step: 0, moving: false, lookUp: 0, arm: 0, photo: false, visible: true, hop: 0 });

const shadow = shadowMaterial(0.32);
const phoneGeo = new THREE.BoxGeometry(0.08, 0.13, 0.015);
const phoneMat = new THREE.MeshLambertMaterial({ color: "#2b2f3a" });
const shadowGeo = new THREE.PlaneGeometry(0.75, 0.6).rotateX(-Math.PI / 2);


/** A walking person built from the shared visitor rig (body, two legs with knees, a free right arm). */
export function TunnelFigure({ model, pose, name }: { model: PersonModel; pose: { current: FigurePose }; name?: string }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const phone = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const p = pose.current, r = root.current;
    if (!r) return;
    r.visible = p.visible;
    if (!p.visible) return;
    r.position.set(p.x, 0, p.z);
    r.rotation.y = p.yaw;
    const swing = p.moving ? Math.sin(p.step) * 0.5 : 0;
    const bob = p.moving ? Math.abs(Math.cos(p.step)) * 0.025 : 0;
    if (body.current) {
      body.current.position.y = bob + p.hop;

    }
    if (torso.current) {
      // Leaning back a little to look up (pivot at the hips).
      torso.current.rotation.x = -p.lookUp * 0.22;
    }
    if (legL.current && legR.current) {
      legL.current.rotation.x = swing;
      legR.current.rotation.x = -swing;
    }
    if (kneeL.current && kneeR.current) {
      kneeL.current.rotation.x = Math.max(0, -swing) * 0.6;
      kneeR.current.rotation.x = Math.max(0, swing) * 0.6;
    }
    const armPitch = p.moving ? -swing * 0.5 - p.arm * 2.3 : -p.arm * 2.3;
    if (arm.current) arm.current.rotation.x = armPitch;
    if (phone.current) {
      phone.current.visible = p.photo && p.arm > 0.6;
      // The phone is carried by the forearm, but its screen stays upright
      // instead of pointing in the same direction as the raised arm.
      // Counter-rotate at the wrist; pointing still uses the unaltered arm pose.
      phone.current.rotation.x = phonePitchForArm(armPitch);
    }
  });
  const legX = model.legX, hip = model.hip;
  return (
    <group ref={root} name={name} dispose={null}>
      <mesh geometry={shadowGeo} material={shadow} position={[0, 0.012, 0]} raycast={() => undefined} />
      <group ref={body}>
        {/* The torso pivots at the hips (leaning back to look up); the legs stay planted. */}
        <group ref={torso} position={[0, hip, 0]}>
          <mesh geometry={model.body} material={smoothMat} position={[0, -hip, 0]} raycast={() => undefined} />
          {model.arm && model.armPivot && (
            <group ref={arm} position={[model.armPivot[0], model.armPivot[1] - hip, model.armPivot[2]]}>
              <mesh geometry={model.arm} material={smoothMat} raycast={() => undefined} />
              <mesh ref={phone} geometry={phoneGeo} material={phoneMat} position={[0.03, -0.6 * (hip / 0.74), 0.06]} raycast={() => undefined} />
            </group>
          )}
        </group>
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? legL : legR} position={[side * legX, hip, 0]}>
            <mesh geometry={model.leg} material={smoothMat} raycast={() => undefined} />
            <group ref={side < 0 ? kneeL : kneeR} position={[0, -model.thigh, 0]}>
              <mesh geometry={model.shin} material={smoothMat} raycast={() => undefined} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
