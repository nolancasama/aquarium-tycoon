import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
});
