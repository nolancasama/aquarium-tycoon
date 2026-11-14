import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EXHIBITS, PENGUIN_STAFF_DOOR } from "../../game/data/coast";
import { cleanShotAt, HOSE_CLEANER, HOSE_TAP, hoseGroundPath, keeperRt, staffDoorOpen, type CleanPose, type CleanTool, type CleanWorker } from "../../game/coast/keeper";
import { coastRt } from "../../game/coast/coastRuntime";
import { personModel } from "../models/people";
import { PartBuilder } from "../partBuilder";
import { smoothMat } from "../materials";
import { PENGUIN_GALLERY } from "./coastGallery";

const TOOLS = ["sponge", "bucket", "brush", "cloth", "hose", "pole"] as const satisfies readonly CleanTool[];
/** Tool tip in wrist space (the wiping face, the nozzle mouth, the pole's sponge head). */
const TIP: Record<CleanTool, [number, number, number]> = {
  sponge: [0.025, -0.07, 0.035], bucket: [0, -0.3, 0], brush: [0, -0.34, 0.025], cloth: [0.02, -0.06, 0.055],
  hose: [0, -0.33, 0], pole: [0, -1.62, 0.02]
};

/** Shared, scene-lifetime staff rig and merged tools; no geometry is made while stepping. */
function keeperAssets() {
  const model = personModel("adult", 0, { shirt: "#139aa0", pants: "#24476b", hair: "#2a1d14", skin: "#f3cfae", extra: "#0b6f8a" }, true);
  // Cleaning alone articulates both arms. Remove the fixed left sleeve/hand from
  // this copy; feeding retains the original body and its existing bucket rig.
  const cleanBody = model.body.clone(), positions = cleanBody.getAttribute("position"), kept: number[] = [];
  for (let i = 0; i < positions.count; i += 3) {
    let fixedArm = true;
    for (let j = 0; j < 3; j++) fixedArm &&= positions.getX(i + j) < -0.235 && positions.getY(i + j) < 1.4;
    if (!fixedArm) kept.push(i, i + 1, i + 2);
  }
  cleanBody.setIndex(kept);
  const cap = new PartBuilder(0);
  cap.sphere(0.185, 0, 1.75, 0, "#0b6f8a", [1, 0.5, 1], 12);
  cap.box(0.27, 0.025, 0.16, 0, 1.75, 0.14, "#139aa0");
  cap.box(0.095, 0.065, 0.018, 0, 1.76, 0.175, "#f4e6ac");
  const bucketParts = (b: PartBuilder, water: string) => {
    b.add(new THREE.CylinderGeometry(0.18, 0.135, 0.3, 10, 1, true), "#c6d9df", [0, -0.19, 0]);
    b.add(new THREE.CylinderGeometry(0.135, 0.135, 0.025, 10), "#7c9aa5", [0, -0.34, 0]);
    b.add(new THREE.CylinderGeometry(0.165, 0.165, 0.015, 10), water, [0, -0.08, 0]);
    b.add(new THREE.TorusGeometry(0.18, 0.014, 4, 12), "#e4eef0", [0, -0.04, 0], [Math.PI / 2, 0, 0]);
  };
  const bucket = new PartBuilder(0);
  bucketParts(bucket, "#334c5c");
  bucket.add(new THREE.TorusGeometry(0.17, 0.014, 4, 12, Math.PI), "#546f7f", [0, -0.04, 0]);
  // A water bucket standing on the gallery floor: handle folded down, soapy water.
  const floorBucket = new PartBuilder(0);
  bucketParts(floorBucket, "#7fcbe0");
  floorBucket.add(new THREE.TorusGeometry(0.17, 0.014, 4, 12, Math.PI), "#546f7f", [0, -0.05, 0.03], [Math.PI / 2 - 0.25, 0, 0]);
  for (let i = 0; i < 4; i++) floorBucket.sphere(0.035, -0.07 + i * 0.05, -0.065, (i % 2) * 0.05 - 0.02, "#f2fbff", [1, 0.55, 1], 6);
  const brush = new PartBuilder(0);
  brush.cyl(0.022, 0.022, 0.3, 0, -0.24, 0, "#bb925d", 6);
  brush.box(0.22, 0.055, 0.12, 0, -0.29, 0.025, "#14999d");
  for (let i = 0; i < 4; i++) brush.box(0.035, 0.05, 0.1, -0.08 + i * 0.055, -0.34, 0.025, "#e4d7af");
  const sponge = new PartBuilder(0);
  sponge.box(0.18, 0.12, 0.09, 0.025, -0.04, 0.035, "#ffe18b");
  sponge.box(0.18, 0.025, 0.09, 0.025, -0.065, 0.035, "#62b692");
  const cloth = new PartBuilder(0);
  cloth.box(0.22, 0.025, 0.17, 0.02, -0.04, 0.055, "#fff0b3");
  cloth.box(0.05, 0.12, 0.17, 0.1, -0.11, 0.055, "#e7ce84");
  // Pistol-grip nozzle continuing the forearm; the hose leaves from its heel.
  const hose = new PartBuilder(0);
  hose.box(0.05, 0.11, 0.06, 0, -0.06, 0.035, "#2f3b44");
  hose.cyl(0.03, 0.03, 0.25, 0, -0.25, 0, "#e9b13d", 8);
  hose.cyl(0.02, 0.036, 0.06, 0, -0.31, 0, "#c48922", 8);
  hose.cyl(0.028, 0.028, 0.1, 0, 0, 0, "#2f6b45", 6);
  // Telescopic pole: two visible sections and a sponge head across its end.
  const pole = new PartBuilder(0);
  pole.cyl(0.02, 0.02, 0.72, 0, -0.44, 0, "#9fb1b8", 6);
  pole.cyl(0.014, 0.014, 1.1, 0, -1.52, 0, "#d7e1e4", 6);
  pole.box(0.05, 0.06, 0.05, 0, -0.47, 0, "#2f6b75");
  pole.box(0.3, 0.08, 0.08, 0, -1.6, 0.02, "#ffe18b");
  pole.box(0.3, 0.02, 0.08, 0, -1.62, 0.02, "#62b692");
  // The cleaning focus travels with the photograph, never with an animated person.
  // Small marks only: no tall slab that can read as something held in a hand.
  const smudge = new PartBuilder(0);
  for (let i = 0; i < 3; i++) smudge.sphere(0.06, (i - 1) * 0.075, (i - 1) * 0.035, 0, "#9ccfd2", [1.3, 0.6, 0.08], 7);
  const debris = new PartBuilder(0);
  for (let i = 0; i < 3; i++) debris.box(0.1, 0.06, 0.13, -0.12 + i * 0.15, 0.015, 0.52 + i * 0.1, "#7d8a85", i * 0.6);
  const rock = new PartBuilder(0.3);
  rock.sphere(0.22, 0.05, 0.08, 0.55, "#697f8e", [1.2, 0.38, 1], 9);
  const sparkle = new PartBuilder(0);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.2, y = 0.95 + i * 0.18;
    sparkle.box(0.025, 0.16, 0.025, x, y, 0, "#f0ffff");
    sparkle.box(0.14, 0.025, 0.025, x, y + 0.07, 0, "#f0ffff");
  }
  // A single small star for clean glass (centred, no offset).
  const star = new PartBuilder(0);
  star.boxAt(0.02, 0.13, 0.02, [0, 0, 0], [0, 0, 0], "#f6ffff");
  star.boxAt(0.13, 0.02, 0.02, [0, 0, 0], [0, 0, 0], "#f6ffff");
  star.boxAt(0.05, 0.05, 0.02, [0, 0, 0], [0, 0, Math.PI / 4], "#ffffff");
  const mist = new PartBuilder(0);
  for (let i = 0; i < 7; i++) mist.sphere(0.03 + (i % 3) * 0.01, -0.12 + (i % 3) * 0.09, -0.1 + Math.floor(i / 3) * 0.1, 0.02, "#d9ffff", [1, 0.8, 0.45], 6);
  // A small tap with a reel on the cliff foot beside the staff door.
  const tap = new PartBuilder(0);
  tap.box(0.22, 0.3, 0.08, 0, 0.35, -0.04, "#5b6e76");
  tap.cylAt(0.03, 0.14, [0, 0.42, 0.05], [Math.PI / 2, 0, 0], "#c7d3d6", 6);
  tap.add(new THREE.TorusGeometry(0.15, 0.04, 6, 14), "#2f6b45", [0, 0.62, 0.05]);
  const mark = smudge.build(), litter = debris.build(), scrubRock = rock.build();
  return { model, cleanBody, cap: cap.build(), bucket: bucket.build(), floorBucket: floorBucket.build(), brush: brush.build(), sponge: sponge.build(),
    cloth: cloth.build(), hose: hose.build(), pole: pole.build(), sparkle: sparkle.build(), star: star.build(), mist: mist.build(), mark, tap: tap.build(),
    focus: { sponge: scrubRock, bucket: litter, brush: scrubRock, cloth: null, hose: null, pole: null } as Record<CleanTool, THREE.BufferGeometry | null> };
}
let shared: ReturnType<typeof keeperAssets> | undefined;
const assets = () => shared ??= keeperAssets();
const noHit = () => undefined;
const darkMat = new THREE.MeshLambertMaterial({ color: "#152630" });
const hoseMat = new THREE.MeshLambertMaterial({ color: "#2f6b45" });
const dropMat = new THREE.MeshBasicMaterial({ color: "#dff7ff", transparent: true, opacity: 0.8, depthWrite: false });

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
  // Shared by the feeding keeper and a bought penguin walking out.
  useFrame(() => { if (door.current) door.current.rotation.y = (shown() ? staffDoorOpen() : 0) * Math.PI * 0.49; });
  return <group position={[ex.x + d.x, ex.land.y, ex.z + d.z]} name="penguin-staff-door">
    <mesh geometry={frame} material={smoothMat} raycast={noHit} />
    <mesh material={darkMat} position={[0, d.height / 2, -d.depth - 0.4]} raycast={noHit}><boxGeometry args={[d.width, d.height, 0.08]} /></mesh>
    <mesh material={darkMat} position={[0, d.height + 0.025, -d.depth / 2]} raycast={noHit}><boxGeometry args={[d.width, 0.05, d.depth]} /></mesh>
    <group ref={door} position={[-d.width / 2, 0, 0]}><mesh geometry={leaf} material={smoothMat} raycast={noHit} /></group>
  </group>;
}

/** Body angles for each cleaning pose: torso bend, tool arm, other arm, hip drop, thighs and shins. */
function cleanPose(w: CleanWorker) {
  const p = { bend: 0, arm: -0.18, other: -0.25, drop: 0, lt: 0, rt: 0, ls: 0, rs: 0 };
  const kneel = () => Object.assign(p, { drop: 0.3, lt: -1.35, rt: -0.3, ls: 1.65, rs: 1.85 });
  const crouch = () => Object.assign(p, { drop: 0.21, lt: -1.15, rt: -1.15, ls: 1.7, rs: 1.7 });
  switch (w.pose as CleanPose) {
    case "kneelBrush": kneel(); p.bend = 0.65; p.arm = -0.5; break;
    case "crouchCollect": crouch(); p.bend = 0.58; p.arm = -0.65; break;
    case "standWipe": p.bend = 0.12; p.arm = -1.35; p.other = -0.3; break;
    // The forearm and nozzle point exactly along the aim: elevation above level.
    case "hoseSpray": p.bend = 0.04; p.arm = -(Math.PI / 2 + (w.aim ?? 0)) - p.bend; p.other = -0.85; break;
    case "inspect": p.bend = -0.04; p.arm = -0.12; p.other = -0.12; break;
    case "poleReach": p.bend = -0.1; p.arm = -2.7; p.other = -2.35; break;
    case "leanWipe": p.bend = 0.22; p.arm = -1.75; p.other = -0.4; break;
    case "crouchRinse": crouch(); p.bend = 0.62; p.arm = -0.8; p.other = -0.3; break;
    case "scrubLow": kneel(); p.bend = 0.35; p.arm = -1.25; p.other = -0.3; break;
  }
  return p;
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion();
/** Place a unit-height cylinder mesh between two world points (no allocation). */
function span(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  tmpA.subVectors(b, a);
  const length = tmpA.length();
  mesh.visible = length > 1e-4;
  if (!mesh.visible) return;
  mesh.position.copy(a).addScaledVector(tmpA, 0.5);
  mesh.quaternion.copy(tmpQ.setFromUnitVectors(up, tmpA.divideScalar(length)));
  mesh.scale.set(1, length, 1);
}

const DROPS = 30, HOSE_SEGS = 6, PREV_MARKS = 4;

/** The shared visitor body bends at its hips; the split arm actually carries its tool. */
function Keeper({ role, worker = 0, shown }: { role: "feed" | "clean"; worker?: number; shown: () => boolean }) {
  const a = useMemo(assets, []), m = a.model, ex = EXHIBITS.penguins;
  const lower = role === "clean" && worker >= 3, hoser = role === "clean" && worker === HOSE_CLEANER;
  const root = useRef<THREE.Group>(null), torso = useRef<THREE.Group>(null), arm = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null), wrist = useRef<THREE.Group>(null), spark = useRef<THREE.Mesh>(null);
  const leftKnee = useRef<THREE.Group>(null), rightKnee = useRef<THREE.Group>(null);
  const tools = useRef<THREE.Group>(null), focuses = useRef<THREE.Group>(null), otherArm = useRef<THREE.Group>(null);
  // World-space extras: glass marks and the floor bucket (lower), hose line and spray (hose worker).
  const extras = useRef<THREE.Group>(null), bucket = useRef<THREE.Mesh>(null);
  const smudge = useRef<THREE.Group>(null), stars = useRef<THREE.Group>(null);
  const hoseSegs = useRef<THREE.Group>(null), drops = useRef<THREE.InstancedMesh>(null), splash = useRef<THREE.Mesh>(null);
  const state = useMemo(() => ({
    shot: -1, tip: new THREE.Vector3(), dir: new THREE.Vector3(), reach: 0, marks: [] as THREE.Vector3[],
    points: Array.from({ length: HOSE_SEGS + 1 }, () => new THREE.Vector3()), count: 0, dummy: new THREE.Object3D()
  }), []);
  useFrame(() => {
    const r = root.current;
    if (!r) return;
    const f = keeperRt.feed, c = keeperRt.clean;
    const shotNow = role === "clean" && c.phase === "montage" ? cleanShotAt(c.elapsed) : null;
    const shot: CleanWorker | null = shotNow ? shotNow.workers[worker] : null;
    r.visible = shown() && (role === "feed" ? f.phase === "walkOut" || f.phase === "tip" || f.phase === "watch" || f.phase === "walkBack" : shot !== null);
    if (extras.current) extras.current.visible = r.visible;
    if (!r.visible) { state.shot = -1; state.marks.length = 0; return; }
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
    } else if (shot && shotNow) {
      // A held photograph: all body/tool transforms change only at the five cuts.
      r.position.set(ex.x + shot.x, shot.y, ex.z + shot.z);
      r.rotation.y = shot.heading;
      const p = cleanPose(shot);
      bend = p.bend; armPitch = p.arm; drop = p.drop; leftThigh = p.lt; rightThigh = p.rt; leftShin = p.ls; rightShin = p.rs;
      if (otherArm.current) otherArm.current.rotation.x = p.other;
      if (tools.current) for (const tool of tools.current.children) tool.visible = tool.name === `penguin-clean-tool-${shot.tool}`;
      if (focuses.current) {
        focuses.current.visible = !lower;
        for (const focus of focuses.current.children) focus.visible = focus.name === `penguin-clean-focus-${shot.tool}`;
      }
      if (spark.current) {
        spark.current.visible = !lower && !hoser;
        spark.current.position.set(0, -0.5, 0.6);
        spark.current.scale.setScalar(0.65);
      }
    }
    if (torso.current) { torso.current.rotation.x = bend; torso.current.position.y = m.hip - drop; }
    if (arm.current) arm.current.rotation.x = armPitch;
    if (left.current) { left.current.rotation.x = leftThigh + swing; left.current.position.y = m.hip - drop; }
    if (right.current) { right.current.rotation.x = rightThigh - swing; right.current.position.y = m.hip - drop; }
    if (leftKnee.current) leftKnee.current.rotation.x = leftShin;
    if (rightKnee.current) rightKnee.current.rotation.x = rightShin;
    if (wrist.current) wrist.current.rotation.x = role === "clean" && (shot?.tool === "sponge" || shot?.tool === "cloth" || shot?.tool === "hose" || shot?.tool === "pole") ? 0 :
      role === "clean" && shot?.tool === "brush" ? -1.35 - armPitch - bend : -armPitch - bend + tilt;
    if (!shot || !shotNow) return;
    // Once per photograph: where the tool really is, for marks and the hose.
    if (state.shot !== shotNow.start && wrist.current) {
      if (lower && state.shot >= 0 && state.marks.length < PREV_MARKS && smudge.current?.visible) state.marks.push(smudge.current.position.clone());
      state.shot = shotNow.start;
      r.updateMatrixWorld(true);
      state.tip.set(...TIP[shot.tool]);
      wrist.current.localToWorld(state.tip);
      if (lower) {
        // Lower team: the wiped patch is on the visitor face of the pane, at the sponge.
        const wiping = shot.pose !== "crouchRinse";
        if (smudge.current) {
          smudge.current.visible = wiping;
          smudge.current.position.set(state.tip.x, state.tip.y, ex.z + PENGUIN_GALLERY.window.paneZ + 0.02);
        }
        if (stars.current) stars.current.children.forEach((star, i) => {
          star.visible = i < state.marks.length;
          if (star.visible) star.position.copy(state.marks[i]).add(tmpB.set(0.08 * (i % 2 ? 1 : -1), 0.06, 0.005));
        });
        if (bucket.current && shot.bucket) bucket.current.position.set(ex.x + shot.bucket.x, shot.y + 0.355, ex.z + shot.bucket.z);
      }
      if (hoser) {
        // Spray leaves the nozzle along the forearm and stops at the ground or the back cliff.
        tmpA.set(0, 0.3, 0); wrist.current.localToWorld(tmpA);
        state.dir.subVectors(state.tip, tmpA).normalize();
        let reach = 2.3;
        const floor = ex.land.y + 0.05;
        if (state.dir.y < -1e-3) reach = Math.min(reach, (state.tip.y - floor) / -state.dir.y);
        const cliff = ex.z + ex.land.minZ - 0.05;
        if (state.dir.z < -1e-3) reach = Math.min(reach, (state.tip.z - cliff) / -state.dir.z);
        state.reach = Math.max(0.6, reach);
        if (splash.current) splash.current.position.copy(state.tip).addScaledVector(state.dir, state.reach);
        // The line: nozzle heel -> drop beside the worker -> via points -> tap foot -> tap.
        const heel = tmpA.set(0, 0.1, 0); wrist.current.localToWorld(heel);
        const ground = hoseGroundPath(shot), y = ex.land.y + 0.03;
        state.points[0].copy(heel);
        ground.forEach((g, i) => state.points[i + 1].set(ex.x + g.x, y, ex.z + g.z));
        state.points[ground.length + 1].set(ex.x + HOSE_TAP.x, ex.land.y + 0.55, ex.z + HOSE_TAP.z + 0.05);
        state.count = ground.length + 2;
        if (hoseSegs.current) hoseSegs.current.children.forEach((seg, i) => {
          if (i + 1 < state.count) span(seg, state.points[i], state.points[i + 1]);
          else seg.visible = false;
        });
      }
    }
    if (hoser && drops.current) {
      // Never at a penguin: if one is in the spray's path, the worker lets go of the trigger.
      let blocked = false;
      for (const animal of coastRt.animals.values()) {
        if (animal.habitat !== "penguins" || animal.m.area === "water") continue;
        const dx = ex.x + animal.m.x - state.tip.x, dz = ex.z + animal.m.z - state.tip.z;
        const h = Math.hypot(state.dir.x, state.dir.z) || 1, along = (dx * state.dir.x + dz * state.dir.z) / h;
        const across = Math.abs(dx * state.dir.z - dz * state.dir.x) / h;
        if (along > -0.2 && along < state.reach * h + 0.9 && across < 0.55 + Math.max(0, along) * 0.25) { blocked = true; break; }
      }
      const mesh = drops.current, d = state.dummy, t0 = keeperRt.clean.elapsed;
      for (let i = 0; i < DROPS; i++) {
        const k = (t0 * 2.6 + i / DROPS) % 1, s = k * state.reach;
        d.position.copy(state.tip).addScaledVector(state.dir, s);
        d.position.y -= 0.35 * k * k;
        // A fine fan: droplets spread a little sideways and up/down as they fly.
        d.position.x += Math.sin(i * 12.9898) * 0.09 * k;
        d.position.z += Math.cos(i * 78.233) * 0.09 * k;
        d.position.y += Math.sin(i * 4.1) * 0.05 * k;
        d.scale.setScalar(blocked ? 0 : 0.6 + k * 0.9);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (splash.current) splash.current.visible = !blocked;
    }
  });
  return <>
    <group ref={root} visible={false} name={role === "clean" ? `penguin-keeper-clean-${worker}` : "penguin-keeper-feed"} dispose={null}>
      <group ref={torso} position={[0, m.hip, 0]}>
        <mesh geometry={role === "clean" ? a.cleanBody : m.body} material={smoothMat} position={[0, -m.hip, 0]} raycast={noHit} />
        <mesh geometry={a.cap} material={smoothMat} position={[0, -m.hip, 0]} raycast={noHit} />
        <group ref={arm} position={[m.armPivot![0], m.armPivot![1] - m.hip, 0]}>
          <mesh geometry={m.arm} material={smoothMat} raycast={noHit} />
          <group ref={wrist} position={[0.03, -0.53, 0.01]}>
            {role === "feed" ? <mesh geometry={a.bucket} material={smoothMat} raycast={noHit} /> :
              <group ref={tools}>{TOOLS.map((tool) =>
                <mesh key={tool} name={`penguin-clean-tool-${tool}`} position={[0, tool === "bucket" ? 0.18 : 0, 0]} geometry={a[tool]} material={smoothMat} raycast={noHit} />)}</group>}
          </group>
        </group>
        {role === "clean" && <group ref={otherArm} position={[-m.armPivot![0], m.armPivot![1] - m.hip, 0]}>
          <mesh geometry={m.arm} material={smoothMat} scale={[-1, 1, 1]} raycast={noHit} />
        </group>}
      </group>
      {[-1, 1].map((side) => <group key={side} ref={side < 0 ? left : right} position={[side * m.legX, m.hip, 0]}>
        <mesh geometry={m.leg} material={smoothMat} raycast={noHit} />
        <group ref={side < 0 ? leftKnee : rightKnee} position={[0, -m.thigh, 0]}><mesh geometry={m.shin} material={smoothMat} raycast={noHit} /></group>
      </group>)}
      {role !== "feed" && <mesh ref={spark} geometry={a.sparkle} material={smoothMat} raycast={noHit} />}
      {role === "clean" && <group ref={focuses}>{TOOLS.map((tool) => a.focus[tool] &&
        <mesh key={tool} name={`penguin-clean-focus-${tool}`} geometry={a.focus[tool]!} material={smoothMat} raycast={noHit} />)}</group>}
    </group>
    {lower && <group ref={extras} visible={false} name={`penguin-clean-glass-${worker}`}>
      <mesh ref={bucket} name="penguin-clean-floor-bucket" geometry={a.floorBucket} material={smoothMat} raycast={noHit} />
      <group ref={smudge} name="penguin-clean-glass-marks">
        <mesh name="penguin-clean-glass-smudge" geometry={a.mark} material={smoothMat} raycast={noHit} />
        <mesh name="penguin-clean-glass-mist" geometry={a.mist} material={smoothMat} position={[0.05, -0.04, 0.01]} raycast={noHit} />
      </group>
      <group ref={stars} name="penguin-clean-glass-sparkles">{Array.from({ length: PREV_MARKS }, (_, i) =>
        <mesh key={i} geometry={a.star} material={smoothMat} visible={false} raycast={noHit} />)}</group>
    </group>}
    {hoser && <group ref={extras} visible={false} name="penguin-clean-hose">
      <group ref={hoseSegs} name="penguin-clean-hose-line">{Array.from({ length: HOSE_SEGS }, (_, i) =>
        <mesh key={i} material={hoseMat} raycast={noHit}><cylinderGeometry args={[0.022, 0.022, 1, 6, 1]} /></mesh>)}</group>
      <instancedMesh ref={drops} args={[undefined, undefined, DROPS]} name="penguin-clean-hose-spray" frustumCulled={false} raycast={noHit}>
        <sphereGeometry args={[0.022, 5, 4]} />
        <primitive object={dropMat} attach="material" />
      </instancedMesh>
      <mesh ref={splash} geometry={a.mist} material={smoothMat} name="penguin-clean-hose-splash" scale={2.2} raycast={noHit} />
    </group>}
  </>;
}

/** The hose's wall tap and reel beside the staff door (always there, small). */
function HoseTap() {
  const a = useMemo(assets, []), ex = EXHIBITS.penguins;
  return <mesh geometry={a.tap} material={smoothMat} position={[ex.x + HOSE_TAP.x, ex.land.y, ex.z + HOSE_TAP.z]} name="penguin-hose-tap" raycast={noHit} />;
}

export function CoastKeepers({ shown }: { shown: () => boolean }) {
  return <>
    <StaffDoor shown={shown} /><HoseTap />
    <Keeper role="feed" shown={shown} />
    {[0, 1, 2, 3, 4].map((worker) => <Keeper key={worker} role="clean" worker={worker} shown={shown} />)}
  </>;
}
