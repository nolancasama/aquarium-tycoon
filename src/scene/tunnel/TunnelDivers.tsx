import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "../../audio/audio";
import { diverRt, diverShotAt, diversBusy, DIVER_RADIUS, DIVER_WORK_SPOTS, resetDivers, stepDivers, subscribeDivers } from "../../game/tunnel/divers";
import { tunnelRuntime } from "../../game/tunnel/contract";
import { PartBuilder } from "../partBuilder";

const noHit = () => undefined;
/** One pooled articulated diver. Shared primitives/material; cuts never interpolate position. */
function makeRig() {
  const suit = "#f0aa32", dark = "#193e53", silver = "#d4e5df";
  const body = new PartBuilder(0);
  body.sphere(0.25, 0, 0.08, 0, suit, [1, 1.4, 0.65], 10);
  body.sphere(0.18, 0, 0.56, 0, suit, [1, 1.1, 1], 10);
  body.box(0.33, 0.17, 0.08, 0, 0.50, 0.15, dark);
  body.box(0.25, 0.10, 0.025, 0, 0.54, 0.20, "#91e4ee");
  body.cyl(0.12, 0.12, 0.57, 0, -0.17, -0.23, silver, 10);
  body.box(0.09, 0.04, 0.10, 0, 0.42, 0.18, dark); // regulator
  body.add(new THREE.TorusGeometry(0.19, 0.018, 4, 10, Math.PI), dark, [0.13, 0.32, 0]);
  for (const y of [-0.08, 0.22]) body.box(0.47, 0.055, 0.37, 0, y, -0.035, dark);
  const arm = new PartBuilder(0);
  arm.cyl(0.075, 0.065, 0.48, 0, -0.48, 0, suit, 7);
  arm.sphere(0.078, 0, -0.5, 0, dark, [1, 1, 1], 7);
  const leg = new PartBuilder(0);
  leg.cyl(0.09, 0.065, 0.54, 0, -0.54, 0, suit, 7);
  leg.box(0.19, 0.055, 0.34, 0, -0.59, 0.09, dark);
  const tools = ["squeegee", "brush", "torch", "bag", "pad"].map(kind => {
    const b = new PartBuilder(0);
    if (kind === "squeegee" || kind === "brush") {
      b.cyl(0.024, 0.024, 0.24, 0, 0, 0, silver, 6);
      b.box(0.35, 0.06, 0.10, 0, 0.24, 0, dark);
      b.box(0.35, 0.045, 0.11, 0, 0.30, 0, kind === "brush" ? "#aad56e" : "#e4f8fc");
    } else if (kind === "torch") {
      b.cyl(0.055, 0.045, 0.19, 0, 0, 0, dark, 8);
      b.sphere(0.065, 0, 0.20, 0, "#fff7b9", [1, 0.3, 1], 8);
    } else if (kind === "bag") {
      b.add(new THREE.TorusGeometry(0.17, 0.018, 4, 12), silver, [0, -0.02, 0]);
      // Open cage reads as a mesh collection bag, with sand-coloured debris inside.
      for (let i = -2; i <= 2; i++) {
        b.box(0.012, 0.30, 0.012, i * 0.065, -0.30, 0, silver);
        b.box(0.29, 0.012, 0.012, 0, -0.28 + (i + 2) * 0.06, 0, silver);
      }
      b.sphere(0.09, 0, -0.22, 0, "#b8a57c", [1.2, 0.6, 0.7], 6);
    } else b.box(0.22, 0.10, 0.14, 0, 0, 0, "#b9eaaa");
    return b.build();
  });
  return { body: body.build(), arm: arm.build(), leg: leg.build(), tools,
    material: new THREE.MeshLambertMaterial({ vertexColors: true }),
    handle: new THREE.CylinderGeometry(0.018, 0.018, 1, 6),
    handleMaterial: new THREE.MeshLambertMaterial({ color: silver }),
    beam: new THREE.ConeGeometry(0.16, 1, 10, 1, true).rotateX(Math.PI).translate(0, 0.5, 0),
    beamMaterial: new THREE.MeshBasicMaterial({ color: "#fff4b5", transparent: true, opacity: 0.12,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    particle: new THREE.SphereGeometry(0.035, 5, 4),
    bubble: new THREE.MeshBasicMaterial({ color: "#d5faff", transparent: true, opacity: 0.65, depthWrite: false }) };
}

function DiverPool() {
  const a = useMemo(makeRig, []);
  const root = useRef<THREE.Group>(null), pose = useRef<THREE.Group>(null);
  const limbs = useRef<Array<THREE.Group | null>>([]), tools = useRef<Array<THREE.Mesh | null>>([]);
  const particles = useRef<THREE.InstancedMesh>(null);
  const wrist = useRef<THREE.Group>(null), toolRoot = useRef<THREE.Group>(null), handle = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const scratch = useMemo(() => ({ matrix: new THREE.Matrix4(), point: new THREE.Vector3(), hand: new THREE.Vector3(),
    target: new THREE.Vector3(), direction: new THREE.Vector3(), worldHand: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0), last: -1, blocked: false }), []);
  useEffect(() => () => {
    a.body.dispose(); a.arm.dispose(); a.leg.dispose(); a.tools.forEach(g => g.dispose());
    a.material.dispose(); a.particle.dispose(); a.bubble.dispose();
    a.handle.dispose(); a.handleMaterial.dispose();
    a.beam.dispose(); a.beamMaterial.dispose();
  }, [a]);
  useFrame(() => {
    const shot = diverShotAt(diverRt.elapsed), g = root.current, p = pose.current;
    if (!g || !p) return;
    if (!diverRt.active || !shot) { g.visible = false; return; }
    const index = Math.floor(diverRt.elapsed);
    if (index !== scratch.last) {
      scratch.last = index; scratch.blocked = false;
      g.position.set(shot.x, shot.y, shot.z);
      g.rotation.set(0, shot.yaw, 0); p.rotation.set(shot.tilt, 0, index === 2 ? -0.25 : 0);
      limbs.current[0]!.rotation.x = shot.arm;
      limbs.current[1]!.rotation.set(-0.4 - index * 0.2, 0, -0.4);
      limbs.current[2]!.rotation.x = shot.knee;
      limbs.current[3]!.rotation.x = -shot.knee * 0.55;
      tools.current.forEach((tool, i) => { if (tool) tool.visible = i === index; });
      p.updateWorldMatrix(true, true);
      wrist.current!.getWorldPosition(scratch.hand); g.worldToLocal(scratch.hand);
      const extended = index === 0 || index === 1 || index === 4;
      handle.current!.visible = extended;
      beam.current!.visible = index === 2;
      if (extended) {
        const spot = DIVER_WORK_SPOTS[index];
        scratch.target.set(spot.x, spot.y, spot.z); g.worldToLocal(scratch.target);
        scratch.direction.copy(scratch.target).sub(scratch.hand).normalize();
        // The tool's forwardmost head, rather than its handle, meets the glass.
        scratch.target.addScaledVector(scratch.direction, index === 4 ? -0.10 : -0.345);
        toolRoot.current!.position.copy(scratch.target);
        toolRoot.current!.quaternion.setFromUnitVectors(scratch.up, scratch.direction);
        handle.current!.position.copy(scratch.hand).add(scratch.target).multiplyScalar(0.5);
        handle.current!.quaternion.copy(toolRoot.current!.quaternion);
        handle.current!.scale.y = scratch.hand.distanceTo(scratch.target);
      } else {
        toolRoot.current!.position.copy(scratch.hand);
        toolRoot.current!.rotation.set(shot.arm + shot.tilt + Math.PI, 0, 0);
        if (index === 2) {
          const spot = DIVER_WORK_SPOTS[index];
          scratch.target.set(spot.x, spot.y, spot.z); g.worldToLocal(scratch.target);
          scratch.direction.copy(scratch.target).sub(scratch.hand).normalize();
          toolRoot.current!.quaternion.setFromUnitVectors(scratch.up, scratch.direction);
          beam.current!.position.copy(scratch.hand).addScaledVector(scratch.direction, 0.23);
          beam.current!.quaternion.copy(toolRoot.current!.quaternion);
          beam.current!.scale.y = Math.max(0.01, scratch.hand.distanceTo(scratch.target) - 0.23);
        }
      }
      audio.play(index === 2 || index === 3 ? "bubble" : "scrub");
    }
    // A rare passing animal ends this snapshot early. Keep it cut until the next
    // shot, avoiding flicker and preserving ordinary animal motion entirely.
    for (const animal of tunnelRuntime.swim?.poses() ?? []) {
      if (Math.hypot(animal.x - shot.x, animal.y - (animal.restDrop ?? 0) - shot.y, animal.z - shot.z) < animal.radius + DIVER_RADIUS + 0.25) scratch.blocked = true;
      if (index === 0 || index === 1 || index === 4) {
        scratch.worldHand.copy(scratch.hand); g.localToWorld(scratch.worldHand);
        const end = DIVER_WORK_SPOTS[index], start = scratch.worldHand;
        const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
        const t = THREE.MathUtils.clamp(((animal.x - start.x) * dx +
          (animal.y - (animal.restDrop ?? 0) - start.y) * dy + (animal.z - start.z) * dz) /
          (dx * dx + dy * dy + dz * dz || 1), 0, 1);
        if (Math.hypot(animal.x - start.x - dx * t, animal.y - (animal.restDrop ?? 0) - start.y - dy * t,
          animal.z - start.z - dz * t) < animal.radius + 0.25) scratch.blocked = true;
      }
    }
    g.visible = !scratch.blocked;
    diverRt.visible = g.visible;
    if (!particles.current || !g.visible) return;
    p.updateWorldMatrix(true, false);
    for (let i = 0; i < 22; i++) {
      const t = (diverRt.elapsed * 0.85 + i * 0.137) % 1;
      // Regulator bubbles and a handful of work flecks; all from one pool/draw.
      if (i < 15) {
        scratch.point.set(0.03 + Math.sin(i * 7) * 0.07, 0.43, 0.27);
        scratch.point.applyMatrix4(p.matrixWorld); g.worldToLocal(scratch.point);
        scratch.point.y += t * 0.65;
      } else {
        toolRoot.current!.getWorldPosition(scratch.point); g.worldToLocal(scratch.point);
        scratch.point.x += Math.sin(i) * 0.16; scratch.point.y += t * 0.2;
      }
      scratch.matrix.makeScale(i < 15 ? 0.6 + t : 0.6, i < 15 ? 0.6 + t : 0.6, 0.8);
      scratch.matrix.setPosition(scratch.point); particles.current.setMatrixAt(i, scratch.matrix);
    }
    particles.current.instanceMatrix.needsUpdate = true;
  });
  return <group ref={root} name="tunnel-diver" raycast={noHit}>
    <group ref={pose}>
      <mesh geometry={a.body} material={a.material} raycast={noHit} />
      {[0, 1, 2, 3].map(i => <group key={i} ref={g => { limbs.current[i] = g; }} position={[i % 2 ? -0.22 : 0.22, i < 2 ? 0.24 : -0.24, 0]}>
        <mesh geometry={i < 2 ? a.arm : a.leg} material={a.material} raycast={noHit} />
        {i === 0 && <group ref={wrist} position={[0, -0.51, 0]} />}
      </group>)}
    </group>
    <group ref={toolRoot}>
      {a.tools.map((geo, k) => <mesh key={k} ref={m => { tools.current[k] = m; }} geometry={geo} material={a.material} raycast={noHit} />)}
    </group>
    <mesh ref={handle} geometry={a.handle} material={a.handleMaterial} raycast={noHit} />
    <mesh ref={beam} geometry={a.beam} material={a.beamMaterial} raycast={noHit} />
    <instancedMesh ref={particles} args={[a.particle, a.bubble, 22]} frustumCulled={false} raycast={noHit} />
  </group>;
}

export function TunnelDivers() {
  const active = useSyncExternalStore(subscribeDivers, diversBusy);
  useFrame((_, dt) => stepDivers(dt), -3);
  useEffect(() => () => resetDivers(), []);
  return active ? <DiverPool /> : null;
}
