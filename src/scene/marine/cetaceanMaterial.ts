import * as THREE from "three";
import type { CetaceanKind } from "./cetaceans";

/**
 * One shader for every cetacean: Phong lighting (a wet sheen) and the scene's
 * fog, plus
 * - the swim: a vertical wave travelling back along the body, growing toward
 *   the flukes (cetaceans beat up and down, never side to side like a fish);
 * - a bend into turns, an arch for surfacing and diving, a beluga's flexible
 *   neck, a little flipper stroke;
 * - the markings, computed per pixel from the skin coordinates so the edges
 *   stay crisp on a low-poly body: a bottlenose's countershading, an orca's eye
 *   patch, white chin and belly with its flank lobe, the grey saddle and white
 *   fluke undersides, a beluga's white;
 * - a blue depth tint below the surface.
 * Each animal has its own clone (its own uniforms); they share one program.
 */

export interface CetaceanUniforms {
  uLen: { value: number };
  uPhase: { value: number };
  uAmp: { value: number };
  uTurn: { value: number };
  uArch: { value: number };
  uFlap: { value: number };
  uHead: { value: THREE.Vector2 };
  uWater: { value: number };
  uWaterColor: { value: THREE.Color };
  uShade: { value: number };
}

export type CetaceanMaterial = THREE.ShaderMaterial & { uniforms: CetaceanUniforms & Record<string, THREE.IUniform> };

const SPECIES_ID: Record<CetaceanKind, number> = { dolphin: 0, orca: 1, beluga: 2 };

const VERT_HEAD = /* glsl */ `
attribute vec3 skin;
attribute float part;
uniform float uLen;
uniform float uPhase;
uniform float uAmp;
uniform float uTurn;
uniform float uArch;
uniform float uFlap;
uniform vec2 uHead;
uniform float uSpecies;
varying vec3 vSkin;
varying float vPart;
varying float vWorldY;

// Displacement of a body station s (0 snout .. 1 tail) in model space (x across, y up).
vec2 bendAt(float s) {
  float w = smoothstep(0.3, 1.0, s);
  float wave = sin(uPhase - s * 4.3);
  float dy = uAmp * uLen * 0.052 * w * w * wave;
  float m = s - 0.42;
  dy += uArch * uLen * 0.11 * (m * m - 0.05);
  float dx = -uTurn * uLen * 0.13 * m * m;
  return vec2(dx, dy);
}

vec3 cetaceanPos(vec3 p, float s) {
  // A beluga turns and nods its head on its flexible neck.
  if (uSpecies > 1.5) {
    float k = 1.0 - smoothstep(0.08, 0.24, s);
    float pivot = uLen * (0.5 - 0.22);
    vec3 q = p - vec3(0.0, 0.0, pivot);
    float cy = cos(uHead.x * k), sy = sin(uHead.x * k), cp = cos(uHead.y * k), sp = sin(uHead.y * k);
    q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
    q = vec3(q.x, cp * q.y + sp * q.z, -sp * q.y + cp * q.z);
    p = q + vec3(0.0, 0.0, pivot);
  }
  vec2 b = bendAt(s);
  p.xy += b;
  // Flippers scull a little (more as they slow and steer).
  if (part > 1.5 && part < 2.5) p.y += uFlap * (abs(skin.z) - 1.0) * uLen * 0.035 * sin(uPhase * 0.5 + skin.z);
  return p;
}
`;

const FRAG_HEAD = /* glsl */ `
uniform float uSpecies;
uniform float uWater;
uniform vec3 uWaterColor;
uniform float uShade;
varying vec3 vSkin;
varying float vPart;
varying float vWorldY;

vec3 cetaceanColor() {
  float s = vSkin.x, h = vSkin.y, w = vSkin.z;
  if (vPart > 3.5) return vec3(1.0);
  if (uSpecies < 0.5) {
    // Bottlenose: a dark grey cape, paler flanks, a white belly.
    vec3 cape = vec3(0.33, 0.39, 0.45), flank = vec3(0.55, 0.62, 0.68), belly = vec3(0.93, 0.95, 0.96);
    if (vPart > 2.5) return h > 0.0 ? cape : mix(flank, belly, 0.4);
    if (vPart > 1.5) return flank * 0.92;
    if (vPart > 0.5) return cape;
    vec3 c = mix(belly, flank, smoothstep(-0.5, -0.1, h + 0.06 * sin(s * 11.0)));
    c = mix(c, cape, smoothstep(0.2, 0.6, h + 0.14 * sin(s * 7.0 + 1.0) - 0.18 * smoothstep(0.7, 0.95, s)));
    // A slightly darker beak top, pale throat.
    c = mix(c, cape * 0.85, smoothstep(0.1, 0.05, s) * smoothstep(-0.2, 0.4, h));
    return c;
  }
  if (uSpecies < 1.5) {
    vec3 black = vec3(0.055, 0.065, 0.08), white = vec3(0.95, 0.96, 0.97), grey = vec3(0.6, 0.63, 0.67);
    if (vPart > 2.5) return h < 0.0 ? white : black;
    if (vPart > 0.5) return black;
    float aw = abs(w);
    // White chin and belly, narrowing between the flippers and the vent, then the flank lobe.
    float edge = -0.32 - 0.3 * smoothstep(0.32, 0.46, s) + 0.18 * smoothstep(0.78, 0.92, s);
    float belly = 1.0 - smoothstep(edge - 0.05, edge + 0.05, h);
    belly *= smoothstep(0.02, 0.05, s) * (1.0 - smoothstep(0.9, 0.94, s));
    float chin = (1.0 - smoothstep(0.09, 0.13, s)) * (1.0 - smoothstep(-0.25, -0.1, h));
    float lobe = smoothstep(0.5, 0.56, s) * (1.0 - smoothstep(0.7, 0.79, s)) * (1.0 - smoothstep(-0.02, 0.1, h + 0.25 * (s - 0.62))) * smoothstep(0.3, 0.5, aw);
    vec2 e = vec2((s - 0.165) / 0.058, (h - 0.27) / 0.13);
    float eye = (1.0 - smoothstep(0.75, 1.0, dot(e, e))) * smoothstep(0.55, 0.72, aw);
    vec2 sd = vec2((s - 0.53) / 0.075, (h - 1.0) / 0.32);
    float saddle = 1.0 - smoothstep(0.7, 1.0, dot(sd, sd));
    vec3 c = mix(black, white, clamp(max(max(belly, chin), max(lobe, eye)), 0.0, 1.0));
    return mix(c, grey, saddle * 0.85);
  }
  // Beluga: white, a touch of grey along the back.
  vec3 white = vec3(0.94, 0.955, 0.95), back = vec3(0.82, 0.86, 0.88);
  if (vPart > 0.5) return mix(white, back, 0.4);
  return mix(white, back, smoothstep(0.35, 0.95, h) * 0.55);
}
`;

export function createCetaceanMaterial(kind: CetaceanKind, length: number): CetaceanMaterial {
  const uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.phong.uniforms);
  uniforms.specular.value = new THREE.Color(kind === "orca" ? "#5a5a5a" : "#3c4044");
  uniforms.shininess.value = kind === "orca" ? 42 : 30;
  Object.assign(uniforms, {
    uLen: { value: length }, uPhase: { value: 0 }, uAmp: { value: 0.4 }, uTurn: { value: 0 }, uArch: { value: 0 },
    uFlap: { value: 0.3 }, uHead: { value: new THREE.Vector2() }, uSpecies: { value: SPECIES_ID[kind] },
    uWater: { value: 1 }, uWaterColor: { value: new THREE.Color("#1f7f9f") }, uShade: { value: 1 }
  });
  const vertexShader = THREE.ShaderLib.phong.vertexShader
    .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
    .replace("#include <beginnormal_vertex>", /* glsl */ `#include <beginnormal_vertex>
// The bend moves stations along y and x as a function of s only, so the normal is
// corrected with the slope of that displacement along z (ds/dz = -1/L).
float eps = 0.004;
vec2 b0 = bendAt(skin.x - eps), b1 = bendAt(skin.x + eps);
vec2 slope = (b1 - b0) / (2.0 * eps) * (-1.0 / uLen);
objectNormal = normalize(vec3(objectNormal.x, objectNormal.y, objectNormal.z - slope.x * objectNormal.x - slope.y * objectNormal.y));`)
    .replace("#include <begin_vertex>", /* glsl */ `#include <begin_vertex>
vSkin = skin;
vPart = part;
transformed = cetaceanPos(position, skin.x);
vWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`);
  const fragmentShader = THREE.ShaderLib.phong.fragmentShader
    .replace("#include <common>", `#include <common>\n${FRAG_HEAD}`)
    .replace("#include <color_fragment>", `#include <color_fragment>\ndiffuseColor.rgb *= cetaceanColor() * uShade;`)
    .replace("#include <fog_fragment>", /* glsl */ `// Under the surface the body takes the water's colour with depth.
float under = clamp(-vWorldY * 0.1, 0.0, 0.62) * uWater;
gl_FragColor.rgb = mix(gl_FragColor.rgb, uWaterColor, under);
#include <fog_fragment>`);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, lights: true, fog: true, vertexColors: true, side: THREE.DoubleSide });
  material.name = `cetacean-${kind}`;
  return material as CetaceanMaterial;
}
