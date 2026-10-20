import { useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { PICO } from "../game/world";
import { tapPico } from "../game/flow/actions";
import { picoModel } from "./models/people";
import { shadowMaterial, smoothMat } from "./materials";

/** Pico the penguin, in front of the shop counter: bobs, waves when talking. */
export function Pico() {
  const m = useMemo(() => picoModel(), []);
  const body = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const shadow = useMemo(() => shadowMaterial(0.28), []);
  useFrame(() => {
    const t = rt.time;
    const talking = rt.pico.talking;
    const wave = t - rt.pico.waveT0 < 1.6 || talking;
    if (body.current) {
      body.current.position.y = Math.abs(Math.sin(t * (talking ? 6 : 1.6))) * (talking ? 0.04 : 0.015);
      body.current.rotation.z = Math.sin(t * 1.2) * 0.04;
    }
    if (right.current) right.current.rotation.z = wave ? 2.2 + Math.sin(t * 12) * 0.35 : 0.25 + Math.sin(t * 1.6) * 0.05;
    if (left.current) left.current.rotation.z = -0.25 - Math.sin(t * 1.6) * 0.05;
  });
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 8) return;
    e.stopPropagation();
    tapPico();
  };
  return (
    <group position={[PICO.x, 0, PICO.z + 0.48]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={shadow}>
        <planeGeometry args={[0.8, 0.8]} />
      </mesh>
      <group ref={body}>
        <mesh geometry={m.body} material={smoothMat} />
        <group ref={right} position={[0.29, 0.62, 0]}>
          <mesh geometry={m.flipper} material={smoothMat} />
        </group>
        <group ref={left} position={[-0.29, 0.62, 0]}>
          <mesh geometry={m.flipper} material={smoothMat} />
        </group>
      </group>
      <mesh position={[0, 0.6, 0]} onClick={onClick}>
        <boxGeometry args={[0.7, 1.2, 0.6]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}
