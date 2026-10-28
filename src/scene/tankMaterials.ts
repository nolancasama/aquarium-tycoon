import * as THREE from "three";
import type { ColorId } from "../game/types";
import { shaderTime, waterMaterial } from "./materials";

/** Display colours are shared by the luminous rings, water glow and current. */
export const LIGHT_HEX: Record<ColorId, string> = {
  red: "#ff606b", blue: "#65acff", yellow: "#ffe779", green: "#80efb0",
  orange: "#ffb36b", pink: "#ff9bda", purple: "#c29aff", white: "#eef8ff"
};

const ringMaterials = new Map<ColorId, THREE.MeshBasicMaterial>();
export function displayRingMaterial(light: ColorId | null) {
  const id = light ?? "white";
  let mat = ringMaterials.get(id);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: LIGHT_HEX[id] });
    ringMaterials.set(id, mat);
  }
  return mat;
}

/** A continuous world-space pattern avoids the box shader's abrupt axis switch on curved walls. */
export function shapedWaterMaterial(h: number) {
  const mat = waterMaterial(h);
  mat.fragmentShader = mat.fragmentShader.replace(
    "vec2 p = abs(vN.z) > 0.5 ? vPos.xy : vPos.zy;",
    "vec2 p = vec2(vPos.x + vPos.z * 0.7, vPos.y);"
  );
  return mat;
}

const glowMaterials = new Map<ColorId, THREE.ShaderMaterial>();
/** Two intersecting, interior planes share this soft additive gradient. No light objects. */
export function displayGlowMaterial(light: ColorId | null) {
  const id = light ?? "white";
  let mat = glowMaterials.get(id);
  if (!mat) {
    mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(LIGHT_HEX[id]) } },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float edge = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 2.0);
          float ends = pow(abs(vUv.y * 2.0 - 1.0), 2.0);
          float fade = smoothstep(0.0, 0.10, vUv.y) * smoothstep(0.0, 0.10, 1.0 - vUv.y);
          gl_FragColor = vec4(uColor, edge * fade * (0.035 + ends * 0.16));
        }`
    });
    glowMaterials.set(id, mat);
  }
  return mat;
}

/** GPU-driven rising helices: seeds and point positions are allocated only at creation. */
export function currentMaterial(h: number, current: number, light: ColorId | null, scale: { value: number }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: shaderTime, uH: { value: h }, uCurrent: { value: current },
      uColor: { value: new THREE.Color(LIGHT_HEX[light ?? "white"]) }, uScale: scale
    },
    vertexShader: `attribute vec3 aSeed;
      uniform float uTime; uniform float uH; uniform float uCurrent; uniform float uScale;
      varying float vAlpha;
      void main() {
        float t = fract(aSeed.y + uTime * uCurrent / uH);
        float a = aSeed.x + uTime * uCurrent * 2.5 + t * 6.283185;
        vec3 p = vec3(cos(a) * aSeed.z, 0.10 + t * (uH - 0.18), sin(a) * aSeed.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(0.013 * uScale / -mv.z, 1.0, 5.0);
        vAlpha = smoothstep(0.0, 0.12, t) * smoothstep(0.0, 0.12, 1.0 - t);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.2, 1.0, r)) * vAlpha * 0.6);
      }`
  });
}
