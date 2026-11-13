import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EXHIBITS, PENGUIN_STAFF_DOOR } from "../../game/data/coast";
import { cleanShotAt, keeperRt, type CleanTool } from "../../game/coast/keeper";
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
  const spray = new PartBuilder(0);
  spray.box(0.13, 0.22, 0.1, 0, -0.12, 0.025, "#b5e5ea");
  spray.box(0.08, 0.1, 0.08, 0, 0.04, 0.025, "#f4f7dd");
  spray.box(0.08, 0.045, 0.18, 0, 0.1, 0.09, "#ecb74e");
  spray.box(0.025, 0.095, 0.025, 0, 0.04, 0.135, "#ecb74e");
  for (let i = 0; i < 3; i++) spray.sphere(0.025, (i - 1) * 0.07, 0.1, 0.28 + i * 0.09, "#d6ffff", [1, 1, 1], 6);
  const cloth = new PartBuilder(0);
  cloth.box(0.3, 0.035, 0.23, 0.03, -0.04, 0.07, "#fff0b3");
  cloth.box(0.07, 0.18, 0.23, 0.145, -0.11, 0.07, "#e7ce84");
  // The cleaning focus travels with the photograph, never with an animated person.
  // These small shore-ice faces / litter / rock use the habitat's existing palette.
  const ice = new PartBuilder(0.3);
  ice.box(0.75, 1.28, 0.2, 0.12, 0, 0.76, "#c6e4e9");
  ice.box(0.92, 0.14, 0.42, 0.12, 0, 0.76, "#e8f2ed");
  const debris = new PartBuilder(0);
  for (let i = 0; i < 3; i++) debris.box(0.1, 0.06, 0.13, -0.12 + i * 0.15, 0.015, 0.52 + i * 0.1, "#7d8a85", i * 0.6);
  const rock = new PartBuilder(0.3);
  rock.sphere(0.38, 0.05, 0.1, 0.78, "#697f8e", [1.35, 0.38, 1], 9);
  const sparkle = new PartBuilder(0);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.48, y = 0.35 + i * 0.35, z = 0.55 - i * 0.17;
    sparkle.box(0.035, 0.27, 0.035, x, y, z, "#e3ffff");
    sparkle.box(0.2, 0.035, 0.035, x, y + 0.12, z, "#e3ffff");
  }
  const iceFace = ice.build(), litter = debris.build(), scrubRock = rock.build();
  return { model, cap: cap.build(), bucket: bucket.build(), brush: brush.build(), sponge: sponge.build(), spray: spray.build(), cloth: cloth.build(), sparkle: sparkle.build(),
    focus: { sponge: iceFace, bucket: litter, spray: iceFace, brush: scrubRock, cloth: iceFace } };
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
function Keeper({ role, shown }: { role: "feed" | "clean"; shown: () => boolean }) {
  const a = useMemo(assets, []), m = a.model, ex = EXHIBITS.penguins;
  const root = useRef<THREE.Group>(null), torso = useRef<THREE.Group>(null), arm = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null), wrist = useRef<THREE.Group>(null), spark = useRef<THREE.Mesh>(null);
  const leftKnee = useRef<THREE.Group>(null), rightKnee = useRef<THREE.Group>(null);
  const tools = useRef<THREE.Group>(null);
  const focuses = useRef<THREE.Group>(null);
  useFrame(() => {
    const r = root.current;
    if (!r) return;
    const f = keeperRt.feed, c = keeperRt.clean;
    const shot = role === "clean" && c.phase === "montage" ? cleanShotAt(c.elapsed) : null;
    r.visible = shown() && (role === "feed" ? f.phase === "walkOut" || f.phase === "tip" || f.phase === "watch" || f.phase === "walkBack" : shot !== null);
    if (!r.visible) return;
    let bend = 0, armPitch = -0.18, swing = 0, tilt = 0, drop = 0, leftThigh = 0, rightThigh = 0, leftShin = 0, rightShin = 0;
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
    } else if (shot) {
      // A held photograph: all body/tool transforms change only at the five cuts.
      r.position.set(ex.x + shot.x, ex.land.y, ex.z + shot.z);
      r.rotation.y = shot.heading;
      switch (shot.pose) {
        case "glassScrub": bend = 0.08; armPitch = -1.75; break;
        case "crouchCollect":
          drop = 0.275; bend = 0.78; armPitch = -0.65;
          leftThigh = rightThigh = -1.15; leftShin = rightShin = 1.7;
          break;
        case "sprayWipe": bend = -0.08; armPitch = -1.2; break;
        case "kneelBrush":
          drop = 0.3; bend = 0.65; armPitch = -0.5;
          leftThigh = -1.35; rightThigh = -0.3; leftShin = 1.65; rightShin = 1.85;
          break;
        case "finalWipe": bend = 0.35; armPitch = -2.3; break;
      }
      if (tools.current) for (const tool of tools.current.children) tool.visible = tool.name === `penguin-clean-tool-${shot.tool}`;
      if (focuses.current) for (const focus of focuses.current.children) focus.visible = focus.name === `penguin-clean-focus-${shot.tool}`;
      if (spark.current) {
        spark.current.visible = true;
        spark.current.rotation.y = c.frame * 0.7;
        spark.current.scale.setScalar(0.85);
      }
    }
    if (torso.current) { torso.current.rotation.x = bend; torso.current.position.y = m.hip - drop; }
    if (arm.current) arm.current.rotation.x = armPitch;
    if (left.current) { left.current.rotation.x = leftThigh + swing; left.current.position.y = m.hip - drop; }
    if (right.current) { right.current.rotation.x = rightThigh - swing; right.current.position.y = m.hip - drop; }
    if (leftKnee.current) leftKnee.current.rotation.x = leftShin;
    if (rightKnee.current) rightKnee.current.rotation.x = rightShin;
    if (wrist.current) wrist.current.rotation.x = role === "clean" && (shot?.tool === "sponge" || shot?.tool === "cloth") ? 0 :
      role === "clean" && shot?.tool === "brush" ? -1.35 - armPitch - bend : -armPitch - bend + tilt;
  });
  return <group ref={root} visible={false} name={`penguin-keeper-${role}`} dispose={null}>
    <group ref={torso} position={[0, m.hip, 0]}>
      <mesh geometry={m.body} material={smoothMat} position={[0, -m.hip, 0]} raycast={noHit} />
      <mesh geometry={a.cap} material={smoothMat} position={[0, -m.hip, 0]} raycast={noHit} />
      <group ref={arm} position={[m.armPivot![0], m.armPivot![1] - m.hip, 0]}>
        <mesh geometry={m.arm} material={smoothMat} raycast={noHit} />
        <group ref={wrist} position={[0.03, -0.53, 0.01]}>
          {role === "feed" ? <mesh geometry={a.bucket} material={smoothMat} raycast={noHit} /> :
            <group ref={tools}>{(["sponge", "bucket", "spray", "brush", "cloth"] as const satisfies readonly CleanTool[]).map((tool) =>
              <mesh key={tool} name={`penguin-clean-tool-${tool}`} position={[0, tool === "bucket" ? 0.18 : 0, 0]} geometry={a[tool]} material={smoothMat} raycast={noHit} />)}</group>}
        </group>
      </group>
    </group>
    {[-1, 1].map((side) => <group key={side} ref={side < 0 ? left : right} position={[side * m.legX, m.hip, 0]}>
      <mesh geometry={m.leg} material={smoothMat} raycast={noHit} />
      <group ref={side < 0 ? leftKnee : rightKnee} position={[0, -m.thigh, 0]}><mesh geometry={m.shin} material={smoothMat} raycast={noHit} /></group>
    </group>)}
    {role !== "feed" && <mesh ref={spark} geometry={a.sparkle} material={smoothMat} raycast={noHit} />}
    {role === "clean" && <group ref={focuses}>{(["sponge", "bucket", "spray", "brush", "cloth"] as const).map((tool) =>
      <mesh key={tool} name={`penguin-clean-focus-${tool}`} geometry={a.focus[tool]} material={smoothMat} raycast={noHit} />)}</group>}
  </group>;
}

export function CoastKeepers({ shown }: { shown: () => boolean }) {
  return <><StaffDoor shown={shown} /><Keeper role="feed" shown={shown} /><Keeper role="clean" shown={shown} /></>;
}
