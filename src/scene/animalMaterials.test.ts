import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { animalMaterial } from "./animalMaterials";
import { animalGeometry } from "./models/animals";

describe("merged moray shader rig", () => {
  it("transforms Lambert normals before lighting and shares the position frame", () => {
    const material = animalMaterial("eel");
    const shader = {
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      uniforms: { ...THREE.ShaderLib.lambert.uniforms }
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const normal = shader.vertexShader.indexOf("objectNormal = normalize(et * n.x + eu * n.y + es * n.z)");
    const lighting = shader.vertexShader.indexOf("#include <defaultnormal_vertex>");
    const position = shader.vertexShader.indexOf("transformed = ep + et *");
    expect(normal).toBeGreaterThan(0);
    expect(normal).toBeLessThan(lighting);
    expect(position).toBeGreaterThan(lighting);
    expect(shader.vertexShader).toContain("uniform vec4 uRig[16]");
    expect(shader.uniforms.uRig.value).toBe(material.userData.uRig.value);
    expect(shader.uniforms.uEat.value).toBe(0);
    // Skin markings use the rest vertex; feeding only hinges the lower jaw.
    expect(shader.vertexShader).toContain("vAnimalPos = position / uLength");
    expect(shader.vertexShader).toContain("wave.z > 0.5 ? eelJaw(position, false) : position");
    material.dispose();
  });

  it("keeps the complete loft and face in one modest merged mesh", () => {
    const geometry = animalGeometry("eel"), wave = geometry.getAttribute("wave");
    expect(geometry.groups).toHaveLength(0);
    expect(geometry.userData.triangles).toBeLessThanOrEqual(1700);
    let jaw = 0, dorsal = 0;
    for (let i = 0; i < wave.count; i++) {
      expect(wave.getX(i)).toBe(12);
      expect(wave.getY(i)).toBeGreaterThanOrEqual(0);
      expect(wave.getY(i)).toBeLessThanOrEqual(1);
      if (wave.getZ(i) > 0.5) jaw++;
      if (wave.getW(i) > 0) dorsal++;
    }
    expect(jaw).toBeGreaterThan(0);
    expect(dorsal).toBeGreaterThan(0);
  });
});
