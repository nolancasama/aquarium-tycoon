import * as THREE from "three";
import { shaderTime } from "../materials";
import { HABITAT } from "../../game/data/sharkTunnel";

/**
 * Shark Tunnel materials. Everything is cheap: Lambert with a few lines of
 * shader for the underwater tint and caustics, one fresnel glass, an additive
 * shaft and a rippling surface. No refraction, no render targets.
 */

/** Shared clock uniform: three.js reads `.value` at every draw. */
const time = { get value() { return shaderTime.value; } };

const WATER = new THREE.Color("#3fb0c4");
const DEEP = new THREE.Color("#257f9c");

/**
 * Habitat surfaces (sand, rock, concrete under water): vertex colours, then a
 * blend toward the water colour that grows with depth, plus soft moving
 * caustics on upward-facing surfaces. The blend is baked into the material so
 * the habitat reads as "under water" from the management view without fog.
 */
function underwater(flat: boolean, tint = 1): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uWater = { value: WATER };
    shader.uniforms.uDeep = { value: DEEP };
    shader.uniforms.uSurface = { value: HABITAT.max.y };
    shader.uniforms.uTint = { value: tint };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nvarying float vUp;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvUp = normalize(mat3(modelMatrix) * objectNormal).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vWorldPos;
varying float vUp;
uniform float uTime;
uniform vec3 uWater;
uniform vec3 uDeep;
uniform float uSurface;
uniform float uTint;
float causticLine(vec2 p) {
  vec2 q = p + vec2(sin(p.y * 1.7 + uTime * 0.6), cos(p.x * 1.3 - uTime * 0.5)) * 0.55;
  float a = abs(sin(q.x * 2.1 + uTime * 0.35) + sin(q.y * 1.9 - uTime * 0.42));
  return pow(clamp(1.0 - a * 0.85, 0.0, 1.0), 4.0);
}`)
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
{
  float depth = clamp((uSurface - vWorldPos.y) / (uSurface + 1.0), 0.0, 1.0);
  float caust = causticLine(vWorldPos.xz * 0.55) * smoothstep(0.25, 0.8, vUp) * (1.0 - depth * 0.5);
  vec3 water = mix(uWater, uDeep, depth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, water, uTint * (0.12 + 0.22 * depth));
  gl_FragColor.rgb += vec3(0.6, 0.9, 0.95) * caust * 0.3 * uTint;
}`);
  };
  m.customProgramCacheKey = () => `tunnel-underwater-${flat}-${tint}`;
  return m;
}

/** Sand and rock under water. */
export const habitatRock = underwater(true);
habitatRock.side = THREE.DoubleSide;
export const habitatSand = underwater(false);
/** The walkway, kerbs and ribs: in the water but lit by the tunnel's own lamps (lighter tint). */
export const tunnelStruct = underwater(false, 0.25);
/** The dry lobby building. */
export const lobbyMat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** One shared glass: almost clear face-on, brighter at grazing angles. */
export const tunnelGlass = new THREE.ShaderMaterial({
  uniforms: { uTime: time, uColor: { value: new THREE.Color("#bff4ff") } },
  vertexShader: `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`,
  fragmentShader: `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
  float fres = pow(f, 3.0);
  // A faint moving sheen keeps the curved surface legible without refraction.
  float sheen = smoothstep(0.92, 1.0, sin(vWorld.x * 0.35 + vWorld.z * 0.25 + uTime * 0.25)) * 0.05;
  gl_FragColor = vec4(uColor, 0.05 + fres * 0.42 + sheen);
}`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide
});

/** The water surface: rippled light from below, a translucent sheet from above. */
export const waterSurface = new THREE.ShaderMaterial({
  uniforms: { uTime: time },
  vertexShader: `
varying vec2 vXZ;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vXZ = world.xz;
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`,
  fragmentShader: `
uniform float uTime;
varying vec2 vXZ;
varying vec3 vView;
void main() {
  vec2 p = vXZ * 0.32;
  float r = sin(p.x * 2.3 + uTime * 0.7) * sin(p.y * 2.1 - uTime * 0.55) + 0.5 * sin((p.x + p.y) * 3.7 + uTime);
  float bright = smoothstep(0.3, 1.2, r);
  if (vView.y < 0.0) {
    // Looking up from inside the tunnel: a bright rippling ceiling of light.
    gl_FragColor = vec4(mix(vec3(0.33, 0.72, 0.8), vec3(0.85, 1.0, 1.0), bright), 0.85);
  } else {
    // From the management view: a light sheet that leaves the animals readable.
    gl_FragColor = vec4(mix(vec3(0.16, 0.55, 0.66), vec3(0.75, 0.95, 1.0), bright), 0.16 + bright * 0.12);
  }
}`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide
});

/** Front glass of the habitat seen from the management camera: a tinted water section. */
export const waterSection = new THREE.MeshBasicMaterial({ color: "#5cc8ea", transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });

/** Soft light shafts from the surface (additive, vertical gradient in uv). */
export const shaftMat = new THREE.ShaderMaterial({
  uniforms: { uTime: time },
  vertexShader: `
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 toCam = cameraPosition - world.xyz;
  vFade = clamp(length(toCam) / 6.0, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}`,
  fragmentShader: `
uniform float uTime;
varying vec2 vUv;
varying float vFade;
void main() {
  float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
  float fall = smoothstep(0.0, 0.85, vUv.y);
  float flicker = 0.75 + 0.25 * sin(uTime * 0.6 + vUv.x * 5.0);
  gl_FragColor = vec4(vec3(0.62, 0.92, 0.95) * edge * fall * flicker * 0.08 * vFade, 1.0);
}`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide
});

/** Drifting motes and bubbles (one Points draw). */
export const moteMat = new THREE.PointsMaterial({ color: "#d9fbff", size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true });

/** Placement zone ring: bright, pulsing in the scene component. */
export const zoneRingMat = new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
export const zoneRingBusyMat = new THREE.MeshBasicMaterial({ color: "#8ff0ff", transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
