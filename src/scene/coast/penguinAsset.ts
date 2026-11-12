import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import penguinUrl from "../../assets/models/penguin.glb?url";
import type { Mover } from "../../game/coast/motion";

let pending: Promise<GLTF | null> | undefined;

/** One request (including failures); the procedural bird remains available throughout. */
export function loadPenguin(): Promise<GLTF | null> {
  return pending ??= new GLTFLoader().loadAsync(penguinUrl).then((asset) => {
    asset.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      // Match the rest of the coast's inexpensive Lambert lighting; share materials.
      const convert = (source: THREE.Material) => {
        const material = source as THREE.MeshStandardMaterial;
        return new THREE.MeshLambertMaterial({ color: material.color, map: material.map });
      };
      node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
      node.raycast = () => undefined;
      node.frustumCulled = false; // Animated skin bounds must not cull swimmers at the window.
    });
    return asset;
  }).catch(() => null);
}

export interface PenguinInstance {
  scene: THREE.Group;
  centre: number;
  update: (m: Mover, dt: number, swim: number, time: number) => void;
  dispose: () => void;
}

/** Each bird owns its bones, mixer and gait weights, but shares geometry and texture. */
export function createPenguin(asset: GLTF, targetHeight: number): PenguinInstance {
  const model = clone(asset.scene);
  // Object3D.clone does not copy an instance's raycast function.
  model.traverse((node) => { if (node instanceof THREE.Mesh) node.raycast = () => undefined; });
  const mixer = new THREE.AnimationMixer(model);
  const action = (name: string) => {
    const clip = asset.animations.find((candidate) => candidate.name === name);
    if (!clip) throw new Error(`Missing penguin ${name} clip`);
    return mixer.clipAction(clip).play();
  };
  const idle = action("idle"), walk = action("walk"), run = action("run");
  walk.setEffectiveWeight(0); run.setEffectiveWeight(0);
  mixer.update(0);
  model.updateMatrixWorld(true);
  // Inspected FBX names, after GLTFLoader removes dots: fin.L -> finL;
  // the head is actually named "scull". Keep procedural offsets in the source
  // model's axes, converted through each bone's real parent orientation.
  const names = ["finL", "finR", "thighL", "thighR", "footL", "footR", "scull"];
  const bones = new Map(names.map((name) => {
    const bone = model.getObjectByName(name);
    if (!(bone instanceof THREE.Bone) || !bone.parent) throw new Error(`Missing penguin bone ${name}`);
    return [name, {
      bone,
      world: bone.getWorldQuaternion(new THREE.Quaternion()),
      animated: bone.quaternion.clone()
    }];
  }));
  const delta = new THREE.Quaternion(), target = new THREE.Quaternion(), parentInverse = new THREE.Quaternion(), sourceWorld = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const poseRotation = (name: string, rotation: THREE.Quaternion, weight: number) => {
    const state = bones.get(name)!;
    // Parent bones may themselves have a swim overlay. Convert through their
    // current orientation, so feet and head retain the intended source axes.
    state.bone.parent!.updateWorldMatrix(true, false);
    state.bone.parent!.getWorldQuaternion(parentInverse).invert();
    target.copy(parentInverse).multiply(sourceWorld).multiply(rotation).multiply(state.world);
    state.bone.quaternion.slerp(target, weight);
  };
  const pose = (name: string, axis: THREE.Vector3, angle: number, weight: number) => {
    delta.setFromAxisAngle(axis, angle);
    poseRotation(name, delta, weight);
  };
  // The shipped mesh has +Z beak-forward, +Y upright and a rotated armature
  // root. Recover its beak axis through the skin's actual inverse bind matrix;
  // extending the neck toward +Y makes the beak follow the streamlined body
  // after the one outer +PI/2 body rotation. Land keeps its authored idle/gait.
  const headSwim = new THREE.Quaternion();
  model.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const joint = node.skeleton.bones.indexOf(bones.get("scull")!.bone);
    if (joint < 0) return;
    const inverseBindRotation = new THREE.Quaternion().setFromRotationMatrix(node.skeleton.boneInverses[joint]);
    const beak = zAxis.clone().applyQuaternion(inverseBindRotation).applyQuaternion(bones.get("scull")!.world).normalize();
    headSwim.setFromUnitVectors(beak, yAxis);
  });
  const feet: { mesh: THREE.SkinnedMesh; vertices: number[] }[] = [];
  model.traverse((node) => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const joints = new Set(node.skeleton.bones.flatMap((bone, i) => /^foot[LR]$/.test(bone.name) ? [i] : []));
    const indices = node.geometry.getAttribute("skinIndex"), weights = node.geometry.getAttribute("skinWeight");
    const vertices: number[] = [];
    for (let i = 0; i < indices.count; i++) {
      for (let j = 0; j < 4; j++) {
        if (weights.getComponent(i, j) > 0.3 && joints.has(indices.getComponent(i, j))) { vertices.push(i); break; }
      }
    }
    feet.push({ mesh: node, vertices });
  });
  const inverseModel = new THREE.Matrix4(), vertex = new THREE.Vector3();
  const box = new THREE.Box3().setFromObject(model, true);
  const scale = targetHeight / (box.max.y - box.min.y);
  const centre = targetHeight / 2;
  const scene = new THREE.Group();
  scene.name = "penguin-asset";
  model.scale.multiplyScalar(scale);
  model.position.set(-(box.min.x + box.max.x) * scale / 2, -box.min.y * scale - centre, -(box.min.z + box.max.z) * scale / 2);
  scene.add(model);

  let walkWeight = 0, runWeight = 0;
  return {
    scene, centre,
    update(m, dt, swim, time) {
      // Remove last frame's overlays before the mixer evaluates the next pose.
      for (const state of bones.values()) state.bone.quaternion.copy(state.animated);
      // Rest actions can outlive a rest in the mover; speed still selects the gait.
      const moving = (m.area !== "water" || m.mode === "rampUp" || m.mode === "rampDown") && m.speed > 0.05;
      // Ordinary walking is 0.42 m/s; the authored hops/steps reach 0.588.
      const fast = moving && m.speed > 0.55;
      const fade = 1 - Math.exp(-dt * 10);
      walkWeight += ((moving && !fast ? 1 : 0) - walkWeight) * fade;
      runWeight += ((fast ? 1 : 0) - runWeight) * fade;
      walk.setEffectiveWeight(walkWeight * (1 - swim));
      run.setEffectiveWeight(runWeight * (1 - swim));
      idle.setEffectiveWeight(1 - (walkWeight + runWeight) * (1 - swim));
      // Reference stride speeds are measured from the source's planted-foot motion.
      walk.timeScale = Math.max(0.05, m.speed / (0.83 * scale));
      run.timeScale = Math.max(0.05, m.speed / (1.43 * scale));
      mixer.update(dt);
      for (const state of bones.values()) state.animated.copy(state.bone.quaternion);
      model.updateWorldMatrix(true, false);
      model.getWorldQuaternion(sourceWorld);
      const stroke = 0.8 + Math.sin(m.phase * 1.6) * 0.55;
      pose("finL", zAxis, stroke, swim);
      pose("finR", zAxis, -stroke, swim);
      pose("thighL", xAxis, 0.15, swim);
      pose("thighR", xAxis, 0.15, swim);
      pose("footL", xAxis, Math.PI / 2, swim);
      pose("footR", xAxis, Math.PI / 2, swim);
      poseRotation("scull", headSwim, swim);
      if (!moving && m.action === "eat" && m.area === "land") {
        // A short repeated beak dip, layered on the owner's idle animation.
        // Body lean is applied around the visual feet by the scene group.
        pose("scull", xAxis, 0.5 + Math.sin(time * 8) * 0.16, 1 - swim);
        pose("finL", zAxis, 0.18, 1 - swim);
        pose("finR", zAxis, -0.18, 1 - swim);
      } else if (!moving && m.action === "groom" && m.area !== "water") {
        pose("finL", zAxis, 0.3 + Math.abs(Math.sin(time * 6)) * 0.35, 1 - swim);
        pose("scull", xAxis, Math.sin(time * 6) * 0.12, 1 - swim);
      } else if (!moving && m.action === "look") {
        pose("scull", yAxis, Math.sin(time * 1.3) * 0.25, 1 - swim);
      }
      // The source gait dips its soles slightly below the idle bounding box.
      // Ground only the visual skin using its actual foot vertices; the raised
      // foot keeps its authored stride, and the mover's support point never moves.
      if (swim < 0.999) {
        model.updateWorldMatrix(true, true);
        inverseModel.copy(model.matrixWorld).invert();
        let sole = Infinity;
        for (const { mesh, vertices } of feet) for (const i of vertices) {
          mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseModel);
          sole = Math.min(sole, vertex.y);
        }
        scene.position.y = Number.isFinite(sole) ? (box.min.y - sole) * scale * (1 - swim) : 0;
      } else scene.position.y = 0;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      model.traverse((node) => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); });
    }
  };
}
