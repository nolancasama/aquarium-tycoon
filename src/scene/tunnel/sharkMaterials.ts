import * as THREE from "three";
import type { TunnelSpecies } from "../../game/tunnel/contract";

export const TUNNEL_SPINE_SAMPLES = 16;

/** The isolated lab can supply simulated seconds; null uses the frame delta. */
export const tunnelAnimationTime: { value: number | null } = { value: null };

export interface TunnelAnimalUniforms {
  spine: Float32Array;
  length: number;
  phase: number;
  time: number;
  speed: number;
  bank: number;
  resting: boolean;
}

/** Lambert's normal/light/fog chunks are retained, including the scene's fog.
 * ShaderMaterial permits per-draw uniform uploads while sharing one material
 * between every animal of a species (MeshLambertMaterial caches those uploads).
 */
export function createSharkMaterial(species: TunnelSpecies): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.lambert.uniforms);
  Object.assign(uniforms, {
    uSpine: { value: new Float32Array(TUNNEL_SPINE_SAMPLES * 3) },
    uLength: { value: 1 }, uPhase: { value: 0 }, uTime: { value: 0 },
    uSpeed: { value: 0 }, uBank: { value: 0 }, uResting: { value: 0 },
    uSpecies: { value: species === "eagleray" ? 2 : species === "zebrashark" ? 1 : 0 }
  });
  const vertexShader = THREE.ShaderLib.lambert.vertexShader
    .replace("#include <common>", `#include <common>
attribute float bodyS;
attribute float partId;
attribute float side;
uniform vec3 uSpine[16];
uniform float uLength;
uniform float uPhase;
uniform float uTime;
uniform float uSpeed;
uniform float uBank;
uniform float uSpecies;
uniform float uResting;
varying vec3 vSkinPosition;
varying float vSkinPart;

// A C1 path interpolation makes the turn arrive at successive body stations.
// The forward-facing x axis is opposite to the head-to-tail path derivative.
void tunnelFrame(float s, out vec3 p, out vec3 forward, out vec3 up, out vec3 lateral) {
  float q = clamp(s, 0.0, 1.0) * 15.0;
  int i = int(min(floor(q), 14.0));
  float f = q - float(i);
  vec3 b = uSpine[i], c = uSpine[i + 1];
  vec3 a = i > 0 ? uSpine[i - 1] : b * 2.0 - c;
  vec3 d = i < 14 ? uSpine[i + 2] : c * 2.0 - b;
  vec3 v = c - a, w = 2.0*a - 5.0*b + 4.0*c - d;
  vec3 z = -a + 3.0*b - 3.0*c + d;
  p = 0.5 * (2.0*b + v*f + w*f*f + z*f*f*f);
  vec3 deriv = -0.5 * (v + 2.0*w*f + 3.0*z*f*f);
  forward = dot(deriv, deriv) > 0.00000001 ? normalize(deriv) : vec3(1.0, 0.0, 0.0);
  vec3 reference = abs(forward.y) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  lateral = normalize(cross(forward, reference));
  up = cross(lateral, forward);
  vec3 bankUp = cos(uBank)*up + sin(uBank)*lateral;
  lateral = cos(uBank)*lateral - sin(uBank)*up;
  up = bankUp;
}

vec3 tunnelSkin(vec3 skin, float s) {
  vec3 centre, forward, up, lateral;
  tunnelFrame(s, centre, forward, up, lateral);
  float motion = clamp(uSpeed, 0.0, 1.8) * (1.0 - uResting);
  float tail = smoothstep(0.16, 1.0, s);
  float lateralBeat = sin(uPhase - s * 5.4) * tail * tail
    * uLength * (0.004 + 0.040 * motion) * (1.0 - uResting);
  float lift = 0.0;
  if (uSpecies > 1.5) {
    lateralBeat *= 0.40;
    if (partId > 2.5 && partId < 3.5) {
      float wing = smoothstep(0.12, 0.90, abs(skin.z));
      // Broad powered strokes alternate with long glides; the rear edge lags.
      float glide = 0.13 + 0.87 * smoothstep(-0.35, 0.55, sin(uTime * 0.48));
      lift = sin(uPhase - abs(skin.z) * 1.8 + skin.x * 3.8)
        * wing * wing * 0.20 * glide * (0.35 + 0.65 * motion);
    }
  }
  return centre + forward * (skin.x + clamp(s, 0.0, 1.0) * uLength)
    + up * (skin.y + lift) + lateral * (skin.z + lateralBeat);
}`)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
// Inverse transpose of the deformation Jacobian. This follows both the path
// curvature and the wing slope, rather than lighting a bent animal as rigid.
float eps = uLength * 0.001;
vec3 jx = (tunnelSkin(position + vec3(eps,0.0,0.0), bodyS-eps/uLength)
         - tunnelSkin(position - vec3(eps,0.0,0.0), bodyS+eps/uLength)) / (2.0*eps);
vec3 jy = (tunnelSkin(position + vec3(0.0,eps,0.0), bodyS)
         - tunnelSkin(position - vec3(0.0,eps,0.0), bodyS)) / (2.0*eps);
vec3 jz = (tunnelSkin(position + vec3(0.0,0.0,eps), bodyS)
         - tunnelSkin(position - vec3(0.0,0.0,eps), bodyS)) / (2.0*eps);
objectNormal = normalize(cross(jy,jz)*normal.x + cross(jz,jx)*normal.y + cross(jx,jy)*normal.z);`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
vSkinPosition = position;
vSkinPart = partId;
transformed = tunnelSkin(position, bodyS);`);

  const fragmentShader = THREE.ShaderLib.lambert.fragmentShader
    .replace("#include <common>", `#include <common>
uniform float uSpecies;
varying vec3 vSkinPosition;
varying float vSkinPart;
float skinSpots(vec2 cells) {
  vec2 cell = floor(cells);
  vec2 jitter = vec2(sin(dot(cell, vec2(17.1,31.7))), sin(dot(cell, vec2(29.9,11.3)))) * 0.16;
  float d = length(fract(cells) - 0.5 + jitter);
  float edge = max(0.015, fwidth(d));
  return 1.0 - smoothstep(0.20-edge, 0.20+edge, d);
}`)
    .replace("#include <color_fragment>", `#include <color_fragment>
if (vSkinPart < 3.5) {
  if (uSpecies > 1.5) {
    float spots = skinSpots(vSkinPosition.xz * vec2(11.0, 12.0));
    float back = smoothstep(0.0, 0.018, vSkinPosition.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93,0.91,0.81), spots * back);
  } else if (uSpecies > 0.5 && vSkinPart < 0.5) {
    // Cylindrical coordinates carry the adult pattern around the broad back.
    vec2 cells = vec2(-vSkinPosition.x * 9.0, atan(vSkinPosition.z, vSkinPosition.y) * 3.3);
    float spots = skinSpots(cells);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.065,0.045,0.018), spots * smoothstep(-0.06,0.01,vSkinPosition.y));
  }
}`);

  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    lights: true, fog: true, vertexColors: true, side: THREE.DoubleSide
  });
  material.name = `tunnel-${species}`;
  material.forceSinglePass = true;
  return material;
}

/** Called immediately before this mesh draws, so shared materials remain safe. */
export function bindSharkUniforms(material: THREE.ShaderMaterial, animal: TunnelAnimalUniforms): void {
  const u = material.uniforms;
  u.uSpine.value = animal.spine;
  u.uLength.value = animal.length;
  u.uPhase.value = animal.phase;
  u.uTime.value = animal.time;
  u.uSpeed.value = animal.speed;
  u.uBank.value = animal.bank;
  u.uResting.value = animal.resting ? 1 : 0;
  material.uniformsNeedUpdate = true;
}
