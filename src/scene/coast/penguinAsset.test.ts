import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { newMover } from "../../game/coast/motion";
import { EXHIBITS } from "../../game/data/coast";
import { penguinBodyPitch, penguinParts } from "./coastModels";
import { createPenguin } from "./penguinAsset";

interface PenguinGltf {
  nodes: { name?: string; mesh?: number; skin?: number }[];
  skins: { joints: number[] }[];
  animations: {
    name: string;
    channels: { target: { node: number; path: string } }[];
    samplers: { input: number; output: number }[];
  }[];
  accessors: { count: number }[];
  buffers: { uri?: string }[];
  images: { uri?: string; bufferView?: number; mimeType?: string }[];
}

const glb = readFileSync(new URL("../../assets/models/penguin.glb", import.meta.url));
const jsonLength = glb.readUInt32LE(12);
const asset = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength)) as PenguinGltf;

/** Decode the shipping skin/animations without requiring a browser image decoder. */
async function skinAsset(): Promise<GLTF> {
  const source = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength)) as {
    images?: unknown; textures?: unknown;
    materials: { pbrMetallicRoughness: { baseColorTexture?: unknown } }[];
  };
  delete source.images; delete source.textures;
  for (const material of source.materials) delete material.pbrMetallicRoughness.baseColorTexture;
  const text = Buffer.from(JSON.stringify(source));
  const json = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const binary = glb.subarray(20 + jsonLength);
  const bytes = Buffer.alloc(20 + json.length + binary.length);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(json.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20); binary.copy(bytes, 20 + json.length);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
}

describe("shipped owner-supplied penguin", () => {
  it("contains a skinned penguin with only idle/walk/run and no root-motion or leaf tracks", () => {
    expect(glb.readUInt32LE(0)).toBe(0x46546c67);
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    expect(asset.nodes.some((node) => node.mesh !== undefined && node.skin !== undefined)).toBe(true);
    expect(asset.skins.some((skin) => skin.joints.length > 0)).toBe(true);
    expect(asset.animations.map((clip) => clip.name).sort()).toEqual(["idle", "run", "walk"]);
    for (const clip of asset.animations) {
      expect(clip.channels.length).toBeGreaterThan(0);
      for (const channel of clip.channels) {
        const target = asset.nodes[channel.target.node];
        expect(target, `${clip.name}: missing target`).toBeDefined();
        expect(target.name, `${clip.name}: forbidden armature or leaf motion`).not.toMatch(/_(rig|end)$/);
      }
      // A constant pose is retained as one key instead of discarded.
      expect(clip.samplers.some((sampler) => asset.accessors[sampler.input].count === 1)).toBe(true);
      expect(clip.samplers.some((sampler) => asset.accessors[sampler.input].count > 1)).toBe(true);
    }
  });

  it("embeds its palette and binary data within the shipping budget", () => {
    expect(glb.length).toBeLessThan(300 * 1024);
    expect(asset.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    expect(asset.images).toHaveLength(1);
    expect(asset.images[0].uri).toBeUndefined();
    expect(asset.images[0].bufferView).toBeTypeOf("number");
    expect(asset.images[0].mimeType).toBe("image/png");
  });

  it("extends the actual skinned beak along 3D swimming velocity in every direction", async () => {
    const source = await skinAsset();
    const penguin = createPenguin(source, penguinParts().height * 1.3);
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body); body.add(penguin.scene);
    let mesh: THREE.SkinnedMesh | undefined;
    penguin.scene.traverse((node) => { if (node instanceof THREE.SkinnedMesh) mesh = node; });
    expect(mesh).toBeDefined();
    const skin = mesh!;
    const position = skin.geometry.getAttribute("position");
    let tip = 0;
    for (let i = 1; i < position.count; i++) if (position.getZ(i) > position.getZ(tip)) tip = i;
    // The shipped beak points +Z near the top; its tail lies at -Z near the feet.
    expect(position.getY(tip)).toBeGreaterThan(1.1);
    expect(position.getZ(tip)).toBeGreaterThan(0.38);
    let base = -1;
    for (let i = 0; i < position.count; i++) {
      if (Math.abs(position.getX(i)) > 0.001 || Math.abs(position.getY(i) - position.getY(tip)) > 0.01) continue;
      if (position.getZ(i) < position.getZ(tip) - 0.03 && (base < 0 || position.getZ(i) > position.getZ(base))) base = i;
    }
    expect(base).toBeGreaterThanOrEqual(0);
    const mover = newMover("orientation", "penguin", EXHIBITS.penguins, 41);
    mover.area = "water"; mover.mode = "swim"; mover.speed = 1;
    const beak = new THREE.Vector3(), rear = new THREE.Vector3(), axis = new THREE.Vector3();
    for (const heading of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI / 4]) {
      for (const pitch of [-Math.PI / 2, -0.7, 0, 0.7, Math.PI / 2]) {
        mover.heading = heading; mover.pitch = pitch;
        root.rotation.y = heading; body.rotation.x = penguinBodyPitch(pitch, 1);
        for (let frame = 0; frame < 3; frame++) penguin.update(mover, 1 / 60, 1, frame / 60);
        root.updateMatrixWorld(true);
        skin.getVertexPosition(tip, beak).applyMatrix4(skin.matrixWorld);
        skin.getVertexPosition(base, rear).applyMatrix4(skin.matrixWorld);
        beak.sub(rear).normalize();
        const velocity = new THREE.Vector3(Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), Math.cos(heading) * Math.cos(pitch));
        axis.set(0, 1, 0).applyQuaternion(body.quaternion).applyQuaternion(root.quaternion);
        expect(axis.dot(velocity), `body ${heading}, ${pitch}`).toBeCloseTo(1, 7);
        expect(beak.dot(velocity), `beak ${heading}, ${pitch}`).toBeGreaterThan(0.98);
        for (const name of ["footL", "footR"]) {
          const joint = skin.skeleton.bones.findIndex((bone) => bone.name === name);
          const foot = skin.skeleton.bones[joint];
          const inverseBind = new THREE.Quaternion().setFromRotationMatrix(skin.skeleton.boneInverses[joint]);
          const toe = new THREE.Vector3(0, 0, 1).applyQuaternion(inverseBind).applyQuaternion(foot.getWorldQuaternion(new THREE.Quaternion()));
          expect(toe.dot(velocity), `${name} trails ${heading}, ${pitch}`).toBeLessThan(-0.95);
        }
      }
    }
    penguin.dispose();
  });

  it("preserves the authored standing pose and blends the swim body upright at the surface", async () => {
    const source = await skinAsset();
    const penguin = createPenguin(source, penguinParts().height * 1.3);
    const mover = newMover("standing", "penguin", EXHIBITS.penguins, 2);
    mover.mode = "rest"; mover.area = "land"; mover.speed = 0; mover.action = null;
    const head = penguin.scene.getObjectByName("scull")!;
    const reference = head.quaternion.clone();
    penguin.update(mover, 0, 0, 0);
    expect(head.quaternion.angleTo(reference)).toBeLessThan(1e-6);
    expect(penguinBodyPitch(0, 0)).toBe(0);
    expect(penguinBodyPitch(0, 0.5)).toBeCloseTo(Math.PI / 4);
    expect(penguinBodyPitch(0, 1)).toBeCloseTo(Math.PI / 2);
    penguin.dispose();
  });
});
