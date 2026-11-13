import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EXHIBITS, PENGUIN_STAFF_DOOR } from "../../game/data/coast";
import { keeperRt } from "../../game/coast/keeper";
import { personModel } from "../models/people";
import { PartBuilder } from "../partBuilder";
import { smoothMat } from "../materials";

/** Shared, scene-lifetime staff rig and merged tools; no geometry is made while stepping. */
function keeperAssets() {
  const model = personModel("adult", 0, { shirt: "#139aa0", pants: "#24476b", hair: "#2a1d14", skin: "#f3cfae", extra: "#0b6f8a" }, true);
  const cap = new PartBuilder(0);
  cap.sphere(0.185, 0, 1.75, 0, "#0b6f8a", [1, 0.5, 1], 12);
  cap.box(0.27, 0.025, 0.16, 0, 1.75, 0.14, "#139aa0");
  cap.box(0.095, 0.065, 0.018, 0, 1.76, 0.175, "#f4e6ac");
  const bucket = new PartBuilder(0);
  bucket.add(new THREE.CylinderGeometry(0.18, 0.135, 0.3, 10, 1, true), "#c6d9df", [0, -0.19, 0]);
  bucket.add(new THREE.CylinderGeometry(0.135, 0.135, 0.025, 10), "#7c9aa5", [0, -0.34, 0]);
  bucket.add(new THREE.CylinderGeometry(0.165, 0.165, 0.015, 10), "#334c5c", [0, -0.08, 0]);
  bucket.add(new THREE.TorusGeometry(0.18, 0.014, 4, 12), "#e4eef0", [0, -0.04, 0], [Math.PI / 2, 0, 0]);
  bucket.add(new THREE.TorusGeometry(0.17, 0.014, 4, 12, Math.PI), "#546f7f", [0, -0.04, 0]);
  const brush = new PartBuilder(0);
  brush.cyl(0.025, 0.025, 0.82, 0, -0.78, 0, "#bb925d", 6);
  brush.box(0.34, 0.09, 0.16, 0, -0.86, 0.025, "#14999d");
  for (let i = 0; i < 5; i++) brush.box(0.04, 0.07, 0.14, -0.13 + i * 0.065, -0.93, 0.025, "#e4d7af");
  const sponge = new PartBuilder(0);
  sponge.box(0.18, 0.12, 0.09, 0.025, -0.04, 0.035, "#ffe18b");
  sponge.box(0.18, 0.025, 0.09, 0.025, -0.065, 0.035, "#62b692");
  const sparkle = new PartBuilder(0);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.48, y = 0.35 + i * 0.35, z = 0.55 - i * 0.17;
    sparkle.box(0.035, 0.27, 0.035, x, y, z, "#e3ffff");
    sparkle.box(0.2, 0.035, 0.035, x, y + 0.12, z, "#e3ffff");
  }
  return { model, cap: cap.build(), bucket: bucket.build(), brush: brush.build(), sponge: sponge.build(), sparkle: sparkle.build() };
}
let shared: ReturnType<typeof keeperAssets> | undefined;
const assets = () => shared ??= keeperAssets();
const noHit = () => undefined;
const darkMat = new THREE.MeshLambertMaterial({ color: "#152630" });

/** Clip the actual cliff triangles into the three solid regions around the doorway.
 * This happens once at scenery construction; the opening goes through every slab,
 * including lower snow ledges, rather than hiding intact rock behind a dark card.
 */
export function cutStaffOpening(geometry: THREE.BufferGeometry, x: number, y: number): THREE.BufferGeometry {
  const d = PENGUIN_STAFF_DOOR, left = d.x - d.width / 2 - x, right = d.x + d.width / 2 - x;
  const top = EXHIBITS.penguins.land.y + d.height - y;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  if (bounds.max.x <= left || bounds.min.x >= right || bounds.min.y >= top) return geometry;
  type Point = [number, number, number];
  const clip = (polygon: Point[], axis: 0 | 1, edge: number, greater: boolean): Point[] => {
    const result: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const aInside = greater ? a[axis] >= edge : a[axis] <= edge;
      const bInside = greater ? b[axis] >= edge : b[axis] <= edge;
      if (aInside) result.push(a);
      if (aInside !== bInside) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return result;
  };
  const vertices: number[] = [];
  const emit = (polygon: Point[]) => {
    for (let j = 1; j < polygon.length - 1; j++) vertices.push(...polygon[0], ...polygon[j], ...polygon[j + 1]);
  };
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 3) {
    const triangle: Point[] = [];
    for (let j = 0; j < 3; j++) triangle.push([position.getX(i + j), position.getY(i + j), position.getZ(i + j)]);
    emit(clip(triangle, 0, left, false));
    emit(clip(triangle, 0, right, true));
    emit(clip(clip(clip(triangle, 0, left, true), 0, right, false), 1, top, true));
  }
  const cut = new THREE.BufferGeometry();
  cut.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  cut.computeVertexNormals();
  geometry.dispose();
  return cut;
}

/** A real, shallow room behind the clipped cliff opening, and one inward swinging leaf. */
function StaffDoor({ shown }: { shown: () => boolean }) {
  const door = useRef<THREE.Group>(null);
  const d = PENGUIN_STAFF_DOOR, ex = EXHIBITS.penguins;
  const frame = useMemo(() => {
    const b = new PartBuilder(0.1);
    const depth = d.depth + 0.45;
    for (const side of [-1, 1]) {
      b.box(0.22, d.height + 0.18, depth, side * (d.width / 2 + 0.11), 0, -depth / 2, "#566d78");
      b.box(0.105, d.height + 0.06, 0.17, side * (d.width / 2 + 0.015), 0, 0.025, "#b3c7c9");
    }
    b.box(d.width + 0.44, 0.24, depth, 0, d.height, -depth / 2, "#657e88");
    b.box(d.width + 0.2, 0.105, 0.17, 0, d.height, 0.025, "#b3c7c9");
    b.box(d.width, 0.05, depth, 0, -0.025, -depth / 2, "#50616a");
    return b.build();
  }, [d]);
  const leaf = useMemo(() => {
    const b = new PartBuilder(0);
    b.box(d.width - 0.06, d.height - 0.07, 0.085, d.width / 2, 0.025, 0, "#227e87");
    b.box(d.width - 0.2, 0.08, 0.015, d.width / 2, 0.22, 0.05, "#96bbc1");
    b.box(0.055, 0.2, 0.09, d.width - 0.15, 0.94, 0.07, "#f1d491");
    b.box(0.24, 0.1, 0.015, d.width / 2, 1.65, 0.052, "#e0f0e9");
    return b.build();
  }, [d]);
  useFrame(() => { if (door.current) door.current.rotation.y = (shown() ? keeperRt.feed.door : 0) * Math.PI * 0.49; });
  return <group position={[ex.x + d.x, ex.land.y, ex.z + d.z]} name="penguin-staff-door">
    <mesh geometry={frame} material={smoothMat} raycast={noHit} />
    <mesh material={darkMat} position={[0, d.height / 2, -d.depth - 0.4]} raycast={noHit}><boxGeometry args={[d.width, d.height, 0.08]} /></mesh>
    <mesh material={darkMat} position={[0, d.height + 0.025, -d.depth / 2]} raycast={noHit}><boxGeometry args={[d.width, 0.05, d.depth]} /></mesh>
    <group ref={door} position={[-d.width / 2, 0, 0]}><mesh geometry={leaf} material={smoothMat} raycast={noHit} /></group>
  </group>;
}

/** The shared visitor body bends at its hips; the split arm actually carries its tool. */
function Keeper({ role, shown }: { role: "feed" | "glass" | "shore" | "debris"; shown: () => boolean }) {
  const a = useMemo(assets, []), m = a.model, ex = EXHIBITS.penguins;
  const root = useRef<THREE.Group>(null), torso = useRef<THREE.Group>(null), arm = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null), wrist = useRef<THREE.Group>(null), spark = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const r = root.current;
    if (!r) return;
    const f = keeperRt.feed, c = keeperRt.clean;
    r.visible = shown() && (role === "feed" ? f.phase === "walkOut" || f.phase === "tip" || f.phase === "watch" || f.phase === "walkBack" : c.phase === "montage");
    if (!r.visible) return;
    let bend = 0, armPitch = -0.18, swing = 0, tilt = 0;
    if (role === "feed") {
      r.position.set(ex.x + f.x, ex.land.y, ex.z + f.z);
      r.rotation.y = f.heading;
      swing = f.walking ? Math.sin(f.elapsed * 8) * 0.42 : 0;
      if (f.phase === "tip") {
        const pose = Math.min(1, f.tip / 0.23, (1 - f.tip) / 0.2);
        bend = Math.max(0, pose) * 0.66;
        armPitch = -0.18 - Math.max(0, pose) * 0.9;
        tilt = -Math.max(0, Math.min(1, (f.tip - 0.2) / 0.2, (0.9 - f.tip) / 0.15)) * 1.85;
      }
    } else {
      const step = c.frame % 2, shift = step ? 0.22 : -0.22;
      if (role === "glass") {
        r.position.set(ex.x - 5.6 + shift, 0, ex.z + ex.pool.maxZ + 0.6);
        r.rotation.y = Math.PI;
        armPitch = step ? -2.15 : -1.4;
        bend = 0.05;
      } else if (role === "shore") {
        r.position.set(ex.x - 5.1 + shift, ex.land.y, ex.z - 5.85);
        r.rotation.y = 0.4 + shift;
        bend = step ? 0.7 : 0.42;
        armPitch = step ? -0.5 : -0.9;
      } else {
        r.position.set(ex.x + 3.3 + shift, ex.land.y, ex.z - 4.6);
        r.rotation.y = -0.65 + shift;
        bend = step ? 0.75 : 0.08;
        armPitch = step ? -0.65 : -0.25;
      }
      if (spark.current) {
        spark.current.visible = c.frame % 3 !== 1;
        spark.current.rotation.y = c.frame * 0.7;
        spark.current.scale.setScalar(c.frame % 2 ? 0.65 : 1);
      }
    }
    if (torso.current) torso.current.rotation.x = bend;
    if (arm.current) arm.current.rotation.x = armPitch;
    if (left.current) left.current.rotation.x = swing;
    if (right.current) right.current.rotation.x = -swing;
    if (wrist.current) wrist.current.rotation.x = role === "glass" ? 0 : -armPitch - bend + tilt;
  });
  const tool = role === "glass" ? a.sponge : role === "shore" ? a.brush : a.bucket;
  return <group ref={root} visible={false} name={`penguin-keeper-${role}`} dispose={null}>
    <group ref={torso} position={[0, m.hip, 0]}>
      <mesh geometry={m.body} material={smoothMat} position={[0, -m.hip, 0]} raycast={noHit} />
      <mesh geometry={a.cap} material={smoothMat} position={[0, -m.hip, 0]} raycast={noHit} />
      <group ref={arm} position={[m.armPivot![0], m.armPivot![1] - m.hip, 0]}>
        <mesh geometry={m.arm} material={smoothMat} raycast={noHit} />
        <group ref={wrist} position={[0.03, -0.53, 0.01]}><mesh geometry={tool} material={smoothMat} raycast={noHit} /></group>
      </group>
    </group>
    {[-1, 1].map((side) => <group key={side} ref={side < 0 ? left : right} position={[side * m.legX, m.hip, 0]}>
      <mesh geometry={m.leg} material={smoothMat} raycast={noHit} />
      <mesh geometry={m.shin} material={smoothMat} position={[0, -m.thigh, 0]} raycast={noHit} />
    </group>)}
    {role !== "feed" && <mesh ref={spark} geometry={a.sparkle} material={smoothMat} raycast={noHit} />}
  </group>;
}

export function CoastKeepers({ shown }: { shown: () => boolean }) {
  return <><StaffDoor shown={shown} /><Keeper role="feed" shown={shown} /><Keeper role="glass" shown={shown} /><Keeper role="shore" shown={shown} /><Keeper role="debris" shown={shown} /></>;
}
