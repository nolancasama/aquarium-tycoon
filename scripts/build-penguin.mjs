/** Build the one shipped penguin GLB directly from the owner's Unity package. */
import './lib/dom-shim.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnimationClip, Box3, MeshStandardMaterial, PropertyBinding, Vector3 } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chromium } from '@playwright/test';
import { readUnityPackage } from './lib/archives.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(homedir(), 'Downloads', '3D & Game Assets', 'Unity_2021_Animals_FREE_v2.3.unitypackage');
const output = path.join(root, 'src/assets/models/penguin.glb');
const assets = readUnityPackage(readFileSync(source));
function requireAsset(name) {
  const result = assets.get(`Assets/ithappy/Animals_FREE/${name}`);
  if (!result) throw new Error(`Required owner-supplied asset missing: ${name}`);
  return result;
}
const fbx = requireAsset('Meshes/Pinguin_001.fbx');
const texture = requireAsset('Textures/Texture.png');
const model = new FBXLoader().parse(fbx.buffer.slice(fbx.byteOffset, fbx.byteOffset + fbx.byteLength), '');
model.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(model, true);
let triangles = 0;
model.traverse((node) => {
  // FBXLoader already sanitizes these; explicitly enforce the GLTFLoader rule.
  node.name = PropertyBinding.sanitizeNodeName(node.name);
  if (node.isMesh) {
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    node.material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    node.geometry = mergeVertices(node.geometry, 1e-6);
  }
});

// As in the sibling project's pipeline, constants retain their pose at one key.
function compactTrack(track) {
  const copy = track.clone();
  const stride = copy.getValueSize();
  let constant = true;
  for (let i = stride; i < copy.values.length; i++) {
    if (Math.abs(copy.values[i] - copy.values[i % stride]) > 1e-5) { constant = false; break; }
  }
  if (constant) {
    copy.times = copy.times.slice(0, 1);
    copy.times[0] = 0;
    copy.values = copy.values.slice(0, stride);
  }
  return copy;
}
const clips = ['idle', 'walk', 'run'].map((name) => {
  const original = model.animations.find((clip) => clip.name === `Pinguin_001_${name}`);
  if (!original) throw new Error(`Missing embedded FBX take: ${name}`);
  const rootMotion = original.tracks.filter((track) => PropertyBinding.parseTrackName(track.name).nodeName.endsWith('_rig'));
  console.log(`${name}: ${original.duration.toFixed(3)}s, wrapper tracks ${JSON.stringify(rootMotion.map((track) => ({ name: track.name, first: Array.from(track.values.slice(0, track.getValueSize())), last: Array.from(track.values.slice(-track.getValueSize())) })))}`);
  return new AnimationClip(name, original.duration, original.tracks.filter((track) => {
    const target = PropertyBinding.parseTrackName(track.name).nodeName;
    return !target.endsWith('_rig') && !target.endsWith('_end');
  }).map(compactTrack));
});
model.animations = clips;

// A browser canvas decodes/downscales the original palette, with no new deps.
// Flip vertically exactly as GLTFExporter does for FBX's flipY=true textures.
const browser = await chromium.launch({ headless: true });
let png;
try {
  const page = await browser.newPage();
  const encoded = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.translate(0, 128);
    context.scale(1, -1);
    context.drawImage(img, 0, 0, 128, 128);
    return canvas.toDataURL('image/png').split(',')[1];
  }, texture.toString('base64'));
  png = Buffer.from(encoded, 'base64');
} finally { await browser.close(); }

// Export geometry/skin/clips using Three, then embed the real PNG in that GLB.
// This avoids pretending Node's inert FBX image shim can encode a texture.
const exported = Buffer.from(await new GLTFExporter().parseAsync(model, { binary: true, animations: clips }));
const jsonLength = exported.readUInt32LE(12);
const json = JSON.parse(exported.toString('utf8', 20, 20 + jsonLength));
const binStart = 20 + jsonLength + 8;
const bin = exported.subarray(binStart, binStart + json.buffers[0].byteLength);
const pad = (buffer, byte = 0) => Buffer.concat([buffer, Buffer.alloc((4 - buffer.length % 4) % 4, byte)]);
// The exporter repeats identical constant accessors and keyframe timelines.
// Deduplicate their byte views/accessors without changing any animation keys.
const viewMap = new Map();
const views = [];
const parts = [];
let byteOffset = 0;
const oldViews = json.bufferViews;
const remappedViews = oldViews.map((view) => {
  const data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const key = `${view.target ?? ''}:${view.byteStride ?? ''}:${data.toString('base64')}`;
  if (viewMap.has(key)) return viewMap.get(key);
  const index = views.length;
  viewMap.set(key, index);
  views.push({ ...view, byteOffset });
  const padded = pad(data);
  parts.push(padded);
  byteOffset += padded.length;
  return index;
});
const accessorMap = new Map();
const accessors = [];
const remappedAccessors = json.accessors.map((accessor) => {
  const value = { ...accessor, bufferView: remappedViews[accessor.bufferView] };
  const key = JSON.stringify(value);
  if (accessorMap.has(key)) return accessorMap.get(key);
  const index = accessors.length;
  accessorMap.set(key, index);
  accessors.push(value);
  return index;
});
for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
  for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = remappedAccessors[primitive.attributes[key]];
  if (primitive.indices !== undefined) primitive.indices = remappedAccessors[primitive.indices];
}
for (const skin of json.skins) skin.inverseBindMatrices = remappedAccessors[skin.inverseBindMatrices];
for (const animation of json.animations) for (const sampler of animation.samplers) {
  sampler.input = remappedAccessors[sampler.input];
  sampler.output = remappedAccessors[sampler.output];
}
json.bufferViews = views;
json.accessors = accessors;
const paddedBin = Buffer.concat(parts);
json.bufferViews ??= [];
json.images = [{ bufferView: json.bufferViews.length, mimeType: 'image/png', name: 'ithappy-palette-128' }];
json.bufferViews.push({ buffer: 0, byteOffset: paddedBin.length, byteLength: png.length });
json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
json.textures = [{ sampler: 0, source: 0 }];
for (const material of json.materials) material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
const binary = pad(Buffer.concat([paddedBin, png]));
json.buffers[0].byteLength = binary.length;
const jsonBuffer = pad(Buffer.from(JSON.stringify(json)), 0x20);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + binary.length, 8);
const chunk = (data, type) => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(data.length, 0);
  head.writeUInt32LE(type, 4);
  return Buffer.concat([head, data]);
};
const glb = Buffer.concat([header, chunk(jsonBuffer, 0x4e4f534a), chunk(binary, 0x004e4942)]);
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, glb);
console.log(JSON.stringify({ output: path.relative(root, output), bytes: glb.length, triangles, texture: '128x128 PNG', bindPoseBounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new Vector3()).toArray() } }, null, 2));
