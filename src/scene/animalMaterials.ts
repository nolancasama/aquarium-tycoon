import * as THREE from "three";
import type { SpeciesId } from "../game/types";
import { SPECIES } from "../game/data/fish";
import { shaderTime } from "./materials";

export interface AnimalMaterial extends THREE.MeshLambertMaterial {
  userData: {
    uPhase: { value: number };
    /** Zero at rest, one at cruising speed. */
    uMotion: { value: number };
    /** A slow phase supplied by the crawling behaviour. */
    uColour: { value: number };
  };
}

const codes: Partial<Record<SpeciesId, number>> = {
  angelfish: 0, goby: 1, chromis: 2, eel: 3, octopus: 4,
  crab: 5, stingray: 6, moonjelly: 7, spottedjelly: 8, seanettle: 9
};

/** Each animal owns uniforms; geometry and the compiled shader are shared.
 * Standard Lambert chunks retain instancing, lighting, fog and hint emissive. */
export function animalMaterial(species: SpeciesId): AnimalMaterial {
  const jelly = SPECIES[species].body === "jelly";
  const m = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: jelly,
    opacity: jelly ? (species === "moonjelly" ? 0.67 : 0.82) : 1,
    depthWrite: !jelly
  }) as AnimalMaterial;
  // A bell is one translucent surface; drawing its rear separately doubles the
  // work and makes the merged fringe unnecessarily dark on integrated GPUs.
  m.forceSinglePass = true;
  m.userData = { uPhase: { value: 0 }, uMotion: { value: 1 }, uColour: { value: 0 } };
  m.onBeforeCompile = shader => {
    shader.uniforms.uPhase = m.userData.uPhase;
    shader.uniforms.uMotion = m.userData.uMotion;
    shader.uniforms.uColour = m.userData.uColour;
    shader.uniforms.uTime = shaderTime;
    shader.uniforms.uAnimal = { value: codes[species] ?? -1 };
    shader.uniforms.uLength = { value: SPECIES[species].length };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute vec4 wave;
uniform float uPhase;
uniform float uMotion;
uniform float uLength;
varying vec3 vAnimalPos;
varying float vAnimalPart;`).replace("#include <begin_vertex>", `#include <begin_vertex>
vAnimalPos = position / uLength;
vAnimalPart = wave.x;
float part = wave.x;
float w = wave.y;
float ph = uPhase + wave.z;
float motion = clamp(uMotion, 0.0, 1.8);
if (part == 1.0) {
  transformed.z += sin(uPhase - w * 4.2) * w * w * uLength * 0.14 * (0.15 + 0.85 * motion);
} else if (part == 2.0) {
  float back = clamp(-vAnimalPos.x - 0.05, 0.0, 1.0);
  transformed.z += sin(uPhase - back * 9.0) * back * uLength * 0.075 * (0.3 + 0.7 * motion);
} else if (part == 3.0) {
  // Relaxed arms spread on the sand; crawling draws them in and curls the tips.
  float curl = w * w;
  transformed.x -= cos(wave.z) * w * uLength * 0.07 * motion;
  transformed.z -= sin(wave.z) * w * uLength * 0.07 * motion;
  transformed.y += (sin(ph - w * 5.0) * curl * 0.035 + curl * w * motion * 0.065) * uLength;
  transformed.x += sin(ph - w * 5.0) * curl * uLength * 0.025;
} else if (part == 4.0) {
  transformed.y += max(0.0, sin(ph)) * w * uLength * 0.07 * motion;
  transformed.x += cos(ph) * w * uLength * 0.035 * motion;
} else if (part == 5.0) {
  transformed.y += wave.z * (0.5 + 0.5 * sin(uPhase * 0.65)) * uLength * 0.035;
} else if (part == 6.0) {
  transformed.y += sin(uPhase - w * 4.0 - vAnimalPos.x * 2.0) * w * w * uLength * 0.11;
} else if (part == 7.0) {
  float pulse = sin(uPhase);
  transformed.xz *= 1.0 + pulse * 0.12 * w;
  transformed.y += pulse * uLength * 0.025 * (1.0 - w * 0.6);
} else if (part == 8.0) {
  transformed.x += sin(ph - w * 4.0) * w * uLength * 0.045;
  transformed.z += cos(ph - w * 3.5) * w * uLength * 0.04;
  transformed.y += sin(uPhase - 0.6) * w * uLength * 0.035;
}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
uniform float uAnimal;
uniform float uColour;
uniform float uTime;
varying vec3 vAnimalPos;
varying float vAnimalPart;`).replace("#include <color_fragment>", `#include <color_fragment>
vec3 ap = vAnimalPos;
float chroma = max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b));
float painted = smoothstep(0.04, 0.16, chroma);
float part = vAnimalPart;
if (uAnimal == 0.0 && part == 1.0) {
  // Yellow stripes hug the disc and continue into the triangular fins.
  float stripe = 1.0 - smoothstep(0.11, 0.17, abs(sin((ap.x + ap.y * 0.11) * 18.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.08), stripe * 0.95);
} else if (uAnimal == 1.0 && part == 1.0) {
  float red = 1.0 - smoothstep(-0.22, 0.25, ap.x);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.055, 0.09), red * 0.94);
} else if (uAnimal == 2.0 && part == 1.0) {
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.48, 0.8), smoothstep(0.02, 0.16, ap.y) * 0.4);
} else if (uAnimal == 3.0 && painted > 0.5) {
  vec2 cells = ap.xz * vec2(28.0, 72.0);
  cells.y += sin(floor(cells.x) * 4.7) * 0.8;
  float spot = 1.0 - smoothstep(0.15, 0.25, length(fract(cells) - 0.5));
  diffuseColor.rgb *= 1.0 - spot * 0.72;
} else if (uAnimal == 4.0) {
  // Warm orange colour changes preserve the eyes and pale suckers.
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.77, 0.88), (0.5 + 0.5 * sin(uColour)) * painted * 0.42);
} else if (uAnimal == 6.0 && part == 6.0) {
  vec2 cells = ap.xz * 12.0;
  cells.x += sin(floor(cells.y) * 2.8) * 0.45;
  float spots = 1.0 - smoothstep(0.15, 0.24, length(fract(cells) - 0.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.66, 1.0), spots * smoothstep(-0.01, 0.025, ap.y));
} else if (uAnimal == 8.0) {
  if (part == 7.0) {
    vec2 cells = ap.xz * 13.0;
    cells.x += sin(floor(cells.y) * 3.1) * 0.6;
    float spots = 1.0 - smoothstep(0.16, 0.23, length(fract(cells) - 0.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.98, 1.0), spots * 0.9);
  } else if (part == 8.0) {
    float frill = 0.5 + 0.5 * sin(ap.y * 105.0 + atan(ap.z, ap.x) * 4.0);
    diffuseColor.rgb *= 0.78 + frill * 0.22;
  }
} else if (uAnimal == 9.0 && part == 7.0) {
  float radial = pow(0.5 + 0.5 * cos(atan(ap.z, ap.x) * 12.0), 5.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.12, 0.085), radial * 0.75);
}
// Keep see-through bells pearly, with a quiet living glow inside.
if (uAnimal >= 7.0 && part == 7.0) diffuseColor.rgb += vec3(0.025, 0.035, 0.05) * (0.8 + 0.2 * sin(uTime));
`);
  };
  m.customProgramCacheKey = () => "expansion-animals-v1";
  return m;
}
