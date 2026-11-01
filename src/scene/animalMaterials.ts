import * as THREE from "three";
import type { SpeciesId } from "../game/types";
import { SPECIES } from "../game/data/fish";
import { shaderTime } from "./materials";
import { jellyPulseStyle } from "../game/logic/motion";

export interface AnimalMaterial extends THREE.MeshLambertMaterial {
  userData: {
    uPhase: { value: number };
    /** Zero at rest, one at cruising speed. */
    uMotion: { value: number };
    /** A slow phase supplied by the crawling behaviour. */
    uColour: { value: number };
    /** Decaying tap response, also used by the octopus to gather its arms. */
    uReaction: { value: number };
    /** Smoothed turn rate; trailing parts bend against a change of heading. */
    uTurn: { value: number };
    /** Shared rig: moray arc-length spine or eight octopus controls and tips. */
    uRig: { value: Float32Array };
    /** Jaw gape, including the timed feeding snap. */
    uEat: { value: number };
    /** Eight limb support corrections, blended toward each arm/leg tip. */
    uFeet: { value: Float32Array };
    uGroundEnabled: { value: number };
    /** World dune centre x/z, dune radius, and flat visible sand height. */
    uSand: { value: THREE.Vector4 };
    /** Golden request edge; never a whole-body colour wash. */
    uHintGlow: { value: number };
  };
}

const codes: Partial<Record<SpeciesId, number>> = {
  angelfish: 0, goby: 1, chromis: 2, eel: 3, octopus: 4,
  crab: 5, shrimp: 5, stingray: 6, moonjelly: 7, spottedjelly: 8, seanettle: 9, jellyfish: 10
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
  m.userData = {
    uPhase: { value: 0 }, uMotion: { value: 1 }, uColour: { value: 0 },
    uReaction: { value: 0 }, uTurn: { value: 0 }, uHintGlow: { value: 0 },
    uRig: { value: new Float32Array(16 * 4) }, uEat: { value: 0 },
    uFeet: { value: new Float32Array(8) }, uGroundEnabled: { value: 0 },
    uSand: { value: new THREE.Vector4(0, 0, 1, 0) }
  };
  m.onBeforeCompile = shader => {
    shader.uniforms.uPhase = m.userData.uPhase;
    shader.uniforms.uMotion = m.userData.uMotion;
    shader.uniforms.uColour = m.userData.uColour;
    shader.uniforms.uReaction = m.userData.uReaction;
    shader.uniforms.uTurn = m.userData.uTurn;
    shader.uniforms.uRig = m.userData.uRig;
    shader.uniforms.uEat = m.userData.uEat;
    shader.uniforms.uFeet = m.userData.uFeet;
    shader.uniforms.uGroundEnabled = m.userData.uGroundEnabled;
    shader.uniforms.uSand = m.userData.uSand;
    shader.uniforms.uHintGlow = m.userData.uHintGlow;
    shader.uniforms.uTime = shaderTime;
    shader.uniforms.uAnimal = { value: codes[species] ?? -1 };
    shader.uniforms.uLength = { value: SPECIES[species].length };
    shader.uniforms.uContract = { value: jellyPulseStyle(species).contract };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
attribute vec4 wave;
uniform float uPhase;
uniform float uMotion;
uniform float uLength;
uniform float uTime;
uniform float uAnimal;
uniform float uReaction;
uniform float uContract;
uniform float uTurn;
uniform float uFeet[8];
uniform float uGroundEnabled;
uniform vec4 uSand;
uniform vec4 uRig[16];
uniform float uEat;
varying vec3 vAnimalPos;
varying float vAnimalPart;
varying vec2 vArmSurface;
// The pure octopusRig module mirrors this Bezier, curl derivative and frame.
void octopusFrame(float index, float t, out vec3 p, out vec3 tangent, out vec3 up, out vec3 side) {
  int i = int(clamp(index, 0.0, 7.0));
  float a = float(i) * 0.7853981633974483;
  vec3 root = vec3(cos(a) * 0.16, -0.28, sin(a) * 0.16) * uLength;
  vec3 control = uRig[i].xyz;
  vec3 tip = uRig[i + 8].xyz;
  float f = 1.0 - t;
  p = f * f * root + 2.0 * f * t * control + t * t * tip;
  vec3 derivative = 2.0 * (f * (control - root) + t * (tip - control));
  float q = clamp((t - 0.65) / 0.35, 0.0, 1.0);
  float curl = uRig[i].w * uLength * 0.14;
  p.y += curl * pow(sin(3.141592653589793 * q), 2.0);
  if (t > 0.65 && t < 1.0) derivative.y += curl * (3.141592653589793 / 0.35) * sin(6.283185307179586 * q);
  tangent = length(derivative) > 0.000001 ? normalize(derivative) : vec3(1.0, 0.0, 0.0);
  vec3 reference = abs(tangent.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  side = normalize(cross(tangent, reference));
  up = cross(side, tangent);
}
// P runs head-to-tail. T points forwards, retaining the rest pose's +x axis.
void eelFrame(float s, out vec3 p, out vec3 t, out vec3 up, out vec3 side) {
  float q = clamp(s, 0.0, 1.0) * 15.0;
  int i = int(min(floor(q), 14.0));
  float f = q - float(i);
  vec3 b = uRig[i].xyz;
  vec3 c = uRig[i + 1].xyz;
  vec3 a = i > 0 ? uRig[i - 1].xyz : 2.0 * b - c;
  vec3 d = i < 14 ? uRig[i + 2].xyz : 2.0 * c - b;
  vec3 v = c - a;
  vec3 w = 2.0 * a - 5.0 * b + 4.0 * c - d;
  vec3 z = -a + 3.0 * b - 3.0 * c + d;
  p = 0.5 * (2.0 * b + v * f + w * f * f + z * f * f * f);
  vec3 deriv = -0.5 * (v + 2.0 * w * f + 3.0 * z * f * f);
  t = length(deriv) > 0.000001 ? normalize(deriv) : vec3(1.0, 0.0, 0.0);
  vec3 reference = abs(t.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  side = normalize(cross(t, reference));
  up = cross(side, t);
}
vec3 eelJaw(vec3 p, bool direction) {
  float a = -clamp(uEat, 0.0, 1.0) * 0.62;
  vec3 hinge = vec3(-0.11, -0.026, 0.0) * uLength;
  if (!direction) p -= hinge;
  p.xy = mat2(cos(a), sin(a), -sin(a), cos(a)) * p.xy;
  if (!direction) p += hinge;
  return p;
}`).replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
if (wave.x == 12.0) {
  vec3 ep, et, eu, es;
  eelFrame(wave.y, ep, et, eu, es);
  vec3 n = wave.z > 0.5 ? eelJaw(objectNormal, true) : objectNormal;
  objectNormal = normalize(et * n.x + eu * n.y + es * n.z);
} else if (wave.x == 13.0) {
  vec3 p, tangent, up, side;
  octopusFrame(wave.z, wave.y, p, tangent, up, side);
  objectNormal = normalize(tangent * objectNormal.x + up * objectNormal.y + side * objectNormal.z);
} else if (wave.x == 14.0 && wave.y > 0.5) {
  float breath = sin(uTime * 1.45) * 0.018;
  float sx = 1.0 + breath, sy = 1.0 - breath * 0.65;
  float lean = clamp(uMotion, 0.0, 1.8) * 0.075;
  objectNormal = normalize(vec3(objectNormal.x / sx, objectNormal.y / sy + lean * objectNormal.x / sx, objectNormal.z / sx));
}`).replace("#include <begin_vertex>", `#include <begin_vertex>
vAnimalPos = position / uLength;
vAnimalPart = wave.x;
vArmSurface = wave.yw;
float part = wave.x;
float w = wave.y;
float ph = uPhase + wave.z;
float motion = clamp(uMotion, 0.0, 1.8);
if (part == 1.0) {
  transformed.z += (sin(uPhase - w * 4.2) * 0.14 * (0.15 + 0.85 * motion) - uTurn * 0.11) * w * w * uLength;
} else if (part == 2.0) {
  float back = clamp(-vAnimalPos.x - 0.05, 0.0, 1.0);
  transformed.z += (sin(uPhase - back * 9.0) * (0.036 + 0.045 * motion) - uTurn * back * 0.09) * back * uLength;
  transformed.y += sin(uPhase * 0.63 - back * 7.0) * back * back * uLength * 0.012;
} else if (part == 4.0) {
  // Opposite tetrapods share a half-cycle offset; stance feet stay planted.
  float swing = max(0.0, sin(ph));
  transformed.y += swing * swing * w * w * uLength * 0.13 * motion;
  transformed.z += cos(ph) * w * w * uLength * 0.075 * motion;
} else if (part == 5.0) {
  float lift = (0.5 + 0.5 * sin(uTime * 1.3 + wave.w * 2.2)) * 0.055;
  float opening = pow(max(0.0, sin(uTime * 0.9 + wave.w * 2.7)), 5.0);
  transformed.y += (lift + wave.z * opening * 0.05) * uLength;
  transformed.x += sin(uTime * 1.1 + wave.w * 2.0) * uLength * 0.025;
  // Feeding: the claws take turns carrying food up to the mouth.
  float feeding = uEat * (0.5 + 0.5 * sin(uTime * 9.0 + wave.w * 1.57));
  transformed.y += feeding * uLength * 0.12;
  transformed.x -= feeding * uLength * 0.18;
  transformed.z *= 1.0 - feeding * 0.45;
} else if (part == 6.0) {
  // Spanwise travelling wave, with a delayed rear edge; centre stays stable.
  transformed.y += (sin(uPhase - w * 4.5 - vAnimalPos.x * 3.5) * 0.10 + sin(uPhase * 0.7 - w * 6.0) * 0.018) * w * w * uLength;
} else if (part == 7.0) {
  // Fast power stroke (first fifth), long elastic relaxation. Each species
  // supplies its own rhythm through uPhase and has its own bell strength.
  float cycle = fract(uPhase / 6.28318530718);
  float squeeze = cycle < uContract ? smoothstep(0.0, uContract, cycle) : 1.0 - smoothstep(uContract, 1.0, cycle);
  float strength = uAnimal == 7.0 ? 0.15 : uAnimal == 8.0 ? 0.24 : uAnimal == 9.0 ? 0.28 : 0.22;
  transformed.xz *= 1.0 - squeeze * strength * (0.35 + w * 0.65);
  transformed.y += squeeze * uLength * (0.035 + w * 0.075);
} else if (part == 8.0) {
  // Delay increases down the tentacle; broad oral arms trail as one ribbon.
  float lag = uPhase - w * 2.8;
  float cycle = fract(lag / 6.28318530718);
  float squeeze = cycle < uContract ? smoothstep(0.0, uContract, cycle) : 1.0 - smoothstep(uContract, 1.0, cycle);
  float bellCycle = fract(uPhase / 6.28318530718);
  float bellSqueeze = bellCycle < uContract ? smoothstep(0.0, uContract, bellCycle) : 1.0 - smoothstep(uContract, 1.0, bellCycle);
  float strength = uAnimal == 7.0 ? 0.15 : uAnimal == 8.0 ? 0.24 : uAnimal == 9.0 ? 0.28 : 0.22;
  float attached = (1.0 - w) * (1.0 - w);
  transformed.xz *= 1.0 - bellSqueeze * strength * attached;
  transformed.y += bellSqueeze * uLength * 0.11 * attached;
  transformed.x += (sin(lag + wave.z) * 0.035 + sin(uTime * 0.65 + wave.z) * 0.022 - uTurn * w * 0.055) * w * uLength;
  transformed.z += cos(lag * 0.85 + wave.z) * w * w * uLength * 0.055;
  transformed.y -= squeeze * w * uLength * 0.065;
  // Feeding: tentacles gather food in toward the bell's centre.
  transformed.xz *= 1.0 - uEat * 0.3 * w;
  transformed.y += uEat * w * uLength * 0.14;
} else if (part == 9.0) {
  // Independent claw arms and palms use time, so pauses retain expression.
  transformed.y += (0.5 + 0.5 * sin(uTime * 1.3 + wave.z * 2.2)) * w * uLength * 0.055;
  transformed.x += sin(uTime * 1.1 + wave.z * 2.0) * w * uLength * 0.025;
  float feeding = uEat * (0.5 + 0.5 * sin(uTime * 9.0 + wave.z * 1.57));
  transformed.y += feeding * w * uLength * 0.12;
  transformed.x -= feeding * w * uLength * 0.18;
  transformed.z *= 1.0 - feeding * w * 0.45;
} else if (part == 10.0) {
  // Morays pump water with their jaws even when resting at a den entrance.
  float gape = pow(0.5 + 0.5 * sin(uTime * 0.9), 4.0);
  float jaw = clamp((vAnimalPos.x + 0.08) / 0.15, 0.0, 1.0);
  transformed.y -= gape * jaw * uLength * 0.036;
} else if (part == 11.0) {
  transformed.z += (-uTurn * w * w * 0.19 + sin(uPhase - w * 5.0) * w * w * 0.025) * uLength;
  transformed.y += sin(uPhase - w * 3.5) * w * w * uLength * 0.018;
} else if (part == 12.0) {
  vec3 ep, et, eu, es;
  eelFrame(wave.y, ep, et, eu, es);
  vec3 local = wave.z > 0.5 ? eelJaw(position, false) : position;
  transformed = ep + et * (local.x + wave.y * uLength) + eu * local.y + es * local.z;
} else if (part == 13.0) {
  vec3 p, tangent, up, side;
  octopusFrame(wave.z, wave.y, p, tangent, up, side);
  transformed = p + up * position.y + side * position.z;
} else if (part == 14.0 && wave.y > 0.5) {
  float breath = sin(uTime * 1.45) * 0.018;
  float sx = 1.0 + breath, sy = 1.0 - breath * 0.65;
  float lean = motion * 0.075;
  float h = (position.y + uLength * 0.25) * sy;
  transformed = vec3(position.x * sx - h * lean, h - uLength * 0.25, position.z * sx);
}
if (uGroundEnabled > 0.5) {
  if (part == 4.0) transformed.y += uFeet[int(clamp(wave.w, 0.0, 7.0))] * w * w * w;
  vec3 worldGround = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vec2 dunePos = (worldGround.xz - uSand.xy) / vec2(uSand.z, uSand.z * 0.55);
  float duneSurface = uSand.w - 0.01 + uSand.z * 0.09 * sqrt(max(0.0, 1.0 - dot(dunePos, dunePos)));
  float sand = max(uSand.w, duneSurface);
  transformed += vec3(modelMatrix[0][1], modelMatrix[1][1], modelMatrix[2][1]) * max(0.0, sand + 0.001 - worldGround.y);
}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
uniform float uAnimal;
uniform float uHintGlow;
uniform float uColour;
uniform float uTime;
uniform float uReaction;
varying vec3 vAnimalPos;
varying float vAnimalPart;
varying vec2 vArmSurface;`).replace("#include <color_fragment>", `#include <color_fragment>
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
  // Rest-pose coordinates travel with each skin vertex, never through the water.
  // Warped cells make irregular olive reticulation rather than a dotted grid.
  vec2 cells = vec2(ap.x * 31.0, atan(ap.z, ap.y) * 2.6);
  cells += vec2(sin(cells.y * 2.3 + cells.x * 0.6), sin(cells.x * 1.8)) * 0.24;
  vec2 cell = floor(cells);
  vec2 offset = vec2(sin(dot(cell, vec2(17.3, 9.2))), cos(dot(cell, vec2(7.8, 21.7)))) * 0.12;
  float fleck = 1.0 - smoothstep(0.19, 0.34, length(fract(cells) - 0.5 + offset));
  diffuseColor.rgb *= 1.0 - fleck * 0.48;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.04, 1.0, 0.8), (1.0 - smoothstep(-0.055, -0.01, ap.y)) * 0.32);
} else if (uAnimal == 4.0) {
  // Warm orange colour changes preserve the eyes and pale suckers.
  float mottling = sin(ap.x * 43.0 + sin(ap.z * 31.0)) * sin(ap.y * 36.0 - ap.z * 19.0);
  diffuseColor.rgb *= 1.0 + mottling * painted * 0.055;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.77, 0.88), (0.5 + 0.5 * sin(uColour)) * painted * 0.42);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.86, 0.60), painted * uReaction * 0.8);
  if (part == 13.0) {
    // Two rows follow the underside through bends and tip curls. An annulus and
    // darker cup centre read as suckers without any extra triangles.
    float angle = vArmSurface.y - 3.141592653589793;
    vec2 cups = vec2(vArmSurface.x * 11.0, (angle + 0.6) / 0.6);
    vec2 cell = vec2(fract(cups.x) - 0.5, fract(cups.y) - 0.5);
    float d = length(cell * vec2(1.0, 1.35));
    float underside = 1.0 - smoothstep(1.05, 1.3, abs(angle));
    float cup = (1.0 - smoothstep(0.27, 0.36, d)) * underside * smoothstep(0.04, 0.13, vArmSurface.x);
    vec3 cupColour = mix(vec3(0.76, 0.39, 0.21), vec3(1.0, 0.80, 0.56), smoothstep(0.10, 0.21, d));
    diffuseColor.rgb = mix(diffuseColor.rgb, cupColour, cup * 0.94);
  }
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
`).replace("#include <opaque_fragment>", `
float hintRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
outgoingLight += vec3(1.0, 0.65, 0.08) * hintRim * uHintGlow;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "expansion-animals-v6-species-feeding";
  return m;
}
