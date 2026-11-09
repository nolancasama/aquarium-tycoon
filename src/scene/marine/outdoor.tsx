import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { shaderTime } from "../materials";
import { sceneLights } from "../GameScene";
import type { Pt } from "../../game/marine/domain";

/**
 * The outdoor areas' shared kit: the atmosphere (sky colour, haze, the far
 * plane, the sun; or the underwater look in a viewing gallery), a sky dome
 * with procedural clouds, the sea surface (a translucent lagoon, the deep sea
 * beyond, waves, sun glints; a bright rippled ceiling from below), a terrain
 * material with caustics under water, a single-draw particle pool for blows
 * and splashes, and gulls. Everything is cheap enough for a school Chromebook:
 * no extra lights (the scene's are retuned), no render targets, no shadows.
 */

export interface AirLook {
  zenith: string;
  horizon: string;
  sun: { dir: [number, number, number]; color: string; intensity: number };
  hemi: { sky: string; ground: string; intensity: number };
  fog: { color: string; near: number; far: number };
  far: number;
}
export interface WaterLook { color: string; near: number; far: number }

const DEFAULT = { background: new THREE.Color("#bfe8f3"), far: 120, near: 0.1 };

/** What the atmosphere is doing now (tests and the review scripts read it). */
export const atmosphere = { mode: "off" as "off" | "air" | "water", scene: null as THREE.Scene | null, camera: null as THREE.PerspectiveCamera | null };

/**
 * While `active()`, apply the outdoor look (or, when `underwater()`, the water
 * look); restore the game's defaults when it stops. Only one area is active.
 */
export function useAtmosphere(active: () => boolean, air: AirLook, water: WaterLook, underwater: () => boolean) {
  const { scene, camera } = useThree();
  const state = useRef<{ on: boolean; under: boolean | null }>({ on: false, under: null });
  const saved = useRef<null | { hemi: [THREE.Color, THREE.Color, number]; sun: [THREE.Vector3, THREE.Color, number]; fill: number }>(null);
  useFrame(() => {
    const on = active();
    const s = state.current;
    const cam = camera as THREE.PerspectiveCamera;
    atmosphere.scene = scene;
    atmosphere.camera = cam;
    if (on && !s.on) {
      const h = sceneLights.hemi, sun = sceneLights.sun, fill = sceneLights.fill;
      saved.current = h && sun && fill ? { hemi: [h.color.clone(), h.groundColor.clone(), h.intensity], sun: [sun.position.clone(), sun.color.clone(), sun.intensity], fill: fill.intensity } : null;
      if (h) { h.color.set(air.hemi.sky); h.groundColor.set(air.hemi.ground); h.intensity = air.hemi.intensity; }
      if (sun) { sun.position.set(...air.sun.dir).multiplyScalar(20); sun.color.set(air.sun.color); sun.intensity = air.sun.intensity; }
      if (fill) fill.intensity = 0.25;
      s.on = true;
      s.under = null;
    }
    if (!on && s.on) {
      const v = saved.current, h = sceneLights.hemi, sun = sceneLights.sun, fill = sceneLights.fill;
      if (v && h && sun && fill) {
        h.color.copy(v.hemi[0]); h.groundColor.copy(v.hemi[1]); h.intensity = v.hemi[2];
        sun.position.copy(v.sun[0]); sun.color.copy(v.sun[1]); sun.intensity = v.sun[2]; fill.intensity = v.fill;
      }
      scene.fog = null;
      scene.background = DEFAULT.background;
      cam.far = DEFAULT.far;
      cam.near = DEFAULT.near;
      cam.updateProjectionMatrix();
      s.on = false;
      s.under = null;
      atmosphere.mode = "off";
      return;
    }
    if (!on) return;
    const under = underwater();
    if (under !== s.under) {
      s.under = under;
      atmosphere.mode = under ? "water" : "air";
      const look = under ? { color: water.color, near: water.near, far: water.far } : air.fog;
      scene.fog = new THREE.Fog(look.color, look.near, look.far);
      scene.background = new THREE.Color(under ? water.color : air.horizon);
      cam.far = under ? Math.max(60, water.far * 1.5) : air.far;
      cam.near = under ? 0.1 : 0.3;
      cam.updateProjectionMatrix();
    }
  }, -6);
}

// ------------------------------------------------------------------ sky

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.03 + 3.1) + 0.15 * noise(p * 4.1 + 7.7); }
`;

/** A dome that follows the camera: horizon-to-zenith gradient, the sun with its glow, slow clouds. */
export function SkyDome({ look, clouds = 1, hidden }: { look: AirLook; clouds?: number; hidden?: () => boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(look.zenith) }, uHorizon: { value: new THREE.Color(look.horizon) },
      uSunDir: { value: new THREE.Vector3(...look.sun.dir).normalize() }, uSun: { value: new THREE.Color(look.sun.color) },
      uTime: shaderTime, uClouds: { value: clouds }
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uSunDir, uSun; uniform float uTime, uClouds; varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.5));
        float s = max(dot(d, uSunDir), 0.0);
        c += uSun * (pow(s, 700.0) * 1.6 + pow(s, 20.0) * 0.22);
        if (d.y > 0.0 && uClouds > 0.0) {
          vec2 p = d.xz / (d.y + 0.18) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(p);
          float cl = smoothstep(0.5, 0.75, n) * smoothstep(0.0, 0.18, d.y) * uClouds;
          vec3 cloud = mix(vec3(1.0), uHorizon, 0.25) + uSun * pow(s, 6.0) * 0.25;
          c = mix(c, cloud, cl * 0.9);
        }
        gl_FragColor = vec4(c, 1.0);
      }`
  }), [look, clouds]);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    m.position.copy(camera.position);
    m.visible = !hidden?.();
  });
  return <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false} raycast={() => undefined}><sphereGeometry args={[400, 24, 12]} /></mesh>;
}

// ------------------------------------------------------------------ sea surface

/** A soft mask of the swimmable outline (1 inside), so the lagoon is turquoise and the sea deep blue. */
export function outlineMask(outline: Pt[], box: { minX: number; minZ: number; w: number; d: number }, size = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  g.filter = "blur(4px)";
  g.fillStyle = "#fff";
  g.beginPath();
  outline.forEach((p, i) => {
    const x = ((p.x - box.minX) / box.w) * size, y = ((p.z - box.minZ) / box.d) * size;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export interface SeaOptions {
  deep: string;
  shallow: string;
  sky: string;
  sunDir: [number, number, number];
  mask: THREE.Texture | null;
  /** The mask's area in local coordinates (minX, minZ, width, depth). */
  maskBox: [number, number, number, number];
  /** Local origin of this plane (world x, z) so the mask lines up. */
  origin: { x: number; z: number };
  /** Opacity over the lagoon (lets the animals show), and how fast it closes with distance. */
  clearNear: number;
  waveScale?: number;
}

export function seaMaterial(o: SeaOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: shaderTime, uMask: { value: o.mask }, uMaskBox: { value: new THREE.Vector4(...o.maskBox) },
      uOrigin: { value: new THREE.Vector2(o.origin.x, o.origin.z) }, uDeep: { value: new THREE.Color(o.deep) }, uShallow: { value: new THREE.Color(o.shallow) },
      uSky: { value: new THREE.Color(o.sky) }, uSunDir: { value: new THREE.Vector3(...o.sunDir).normalize() },
      uClear: { value: o.clearNear }, uWave: { value: o.waveScale ?? 1 }, uHasMask: { value: o.mask ? 1 : 0 }
    }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime, uClear, uWave, uHasMask; uniform sampler2D uMask; uniform vec4 uMaskBox; uniform vec2 uOrigin;
      uniform vec3 uDeep, uShallow, uSky, uSunDir;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        vec2 g = vec2(cos(p.x * 0.31 + t * 0.8) + 0.6 * cos((p.x + p.y) * 0.53 + t * 1.25), cos(p.y * 0.27 - t * 0.65) + 0.6 * cos((p.x - p.y) * 0.61 - t * 1.1)) * 0.055 * uWave;
        g += vec2(cos(p.x * 1.7 + p.y * 0.4 + t * 2.1), cos(p.y * 1.9 - p.x * 0.3 - t * 1.8)) * 0.018 * uWave;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        vec2 mp = (p - uOrigin - uMaskBox.xy) / uMaskBox.zw;
        float mask = uHasMask > 0.5 && mp.x > 0.0 && mp.y > 0.0 && mp.x < 1.0 && mp.y < 1.0 ? texture2D(uMask, mp).r : 0.0;
        vec4 col;
        if (gl_FrontFacing) {
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 base = mix(uDeep, uShallow, mask);
          vec3 c = mix(base, uSky, fres * 0.55);
          vec3 r = reflect(-v, n);
          c += vec3(1.0, 0.96, 0.86) * pow(max(dot(r, uSunDir), 0.0), 140.0) * 1.3;
          float alpha = mix(0.95, uClear, mask * (1.0 - smoothstep(60.0, 180.0, dist)));
          col = vec4(c, clamp(max(alpha, fres * 0.85), 0.0, 1.0));
        } else {
          // From below: the surface's bright, rippled underside.
          float k = smoothstep(-0.06, 0.08, g.x + g.y);
          col = vec4(mix(vec3(0.42, 0.78, 0.88), vec3(0.86, 0.98, 1.0), k), 0.92);
        }
        gl_FragColor = col;
        #include <fog_fragment>
      }`
  });
}

// ------------------------------------------------------------------ terrain

/** Vertex-coloured Lambert ground with a blue depth tint and moving caustics under the water. */
export function terrainMaterial(waterColor: string): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shaderTime;
    shader.uniforms.uWaterTint = { value: new THREE.Color(waterColor) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTerrainPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uTime; uniform vec3 uWaterTint; varying vec3 vTerrainPos;
float causticLines(vec2 p, float t) {
  float a = sin(p.x * 1.3 + t * 0.9 + sin(p.y * 1.7 + t * 0.6) * 1.4);
  float b = sin(p.y * 1.5 - t * 0.7 + sin(p.x * 1.1 - t * 0.8) * 1.3);
  return pow(max(0.0, 1.0 - abs(a + b) * 0.6), 6.0);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
if (vTerrainPos.y < -0.02) {
  float depth = -vTerrainPos.y;
  diffuseColor.rgb = mix(diffuseColor.rgb, uWaterTint, clamp(depth * 0.075, 0.0, 0.55));
  diffuseColor.rgb += vec3(0.55, 0.75, 0.8) * causticLines(vTerrainPos.xz * 0.9, uTime) * 0.32 * smoothstep(0.1, 1.2, depth) * (1.0 - smoothstep(6.0, 14.0, depth));
}`);
  };
  return m;
}

// ------------------------------------------------------------------ blows and splashes

const FX_N = 220;

export interface FxPool {
  spout(x: number, y: number, z: number, size: number): void;
  splash(x: number, y: number, z: number, size: number): void;
  bubbles(x: number, y: number, z: number, n: number): void;
}

/** One instanced draw for every blow, splash and bubble in an area (world coordinates). */
export function MarineFx({ pool, active }: { pool: { current: FxPool | null }; active: () => boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const parts = useMemo(() => Array.from({ length: FX_N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 1, size: 0.2, drag: 1, grav: 0, kind: 0 })), []);
  const next = useRef(0);
  const geo = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.setIndex(quad.getIndex());
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(new Float32Array(FX_N * 3), 3));
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(FX_N * 2), 2));
    g.instanceCount = FX_N;
    return g;
  }, []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `attribute vec3 aPos; attribute vec2 aSize; varying float vA; varying vec2 vUv;
      void main() { vUv = uv; vA = aSize.y; vec4 mv = viewMatrix * vec4(aPos, 1.0); mv.xy += position.xy * aSize.x; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `varying float vA; varying vec2 vUv;
      void main() { float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.55, 1.0, d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(0.96, 0.99, 1.0, a); }`
  }), []);
  const emit = (n: number, f: (p: (typeof parts)[number], i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const p = parts[next.current];
      next.current = (next.current + 1) % FX_N;
      p.age = 0;
      f(p, i);
    }
  };
  pool.current = useMemo<FxPool>(() => ({
    spout: (x, y, z, size) => emit(Math.round(10 + size * 3), (p) => {
      p.x = x; p.y = y; p.z = z;
      p.vx = (Math.random() - 0.5) * 0.35 * size; p.vz = (Math.random() - 0.5) * 0.35 * size; p.vy = (1.6 + Math.random() * 1.6) * Math.sqrt(size);
      p.life = 1.3 + Math.random() * 0.7; p.size = 0.18 * size + Math.random() * 0.2 * size; p.drag = 1.6; p.grav = -1.2; p.kind = 0;
    }),
    splash: (x, y, z, size) => emit(Math.round(12 + size * 4), (p, i) => {
      const a = (i / 12) * Math.PI * 2 + Math.random();
      p.x = x; p.y = y + 0.05; p.z = z;
      const sp = (0.8 + Math.random() * 1.4) * Math.sqrt(size);
      p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = (1.5 + Math.random() * 2.4) * Math.sqrt(size);
      p.life = 0.8 + Math.random() * 0.5; p.size = 0.12 * size + Math.random() * 0.12 * size; p.drag = 0.6; p.grav = 9.8; p.kind = 1;
    }),
    bubbles: (x, y, z, n) => emit(n, (p) => {
      p.x = x + (Math.random() - 0.5) * 0.8; p.y = y; p.z = z + (Math.random() - 0.5) * 0.8;
      p.vx = 0; p.vz = 0; p.vy = 0.9 + Math.random() * 0.6;
      p.life = Math.max(0.5, (-y) / 1.1); p.size = 0.07 + Math.random() * 0.09; p.drag = 0; p.grav = 0; p.kind = 2;
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  useFrame((_, rawDt) => {
    const m = ref.current;
    if (!m) return;
    m.visible = active();
    if (!m.visible) return;
    const dt = Math.min(rawDt, 0.1);
    const pos = geo.getAttribute("aPos") as THREE.InstancedBufferAttribute, sz = geo.getAttribute("aSize") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < FX_N; i++) {
      const p = parts[i];
      if (p.age >= p.life) { sz.setXY(i, 0, 0); continue; }
      p.age += dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * (p.kind === 0 ? drag : 1) - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 1 && p.y < 0) p.age = p.life;
      if (p.kind === 2 && p.y > -0.05) p.age = p.life;
      const k = p.age / p.life;
      pos.setXYZ(i, p.x, p.y, p.z);
      sz.setXY(i, p.size * (p.kind === 0 ? 1 + k * 2.2 : 1), (p.kind === 2 ? 0.55 : 0.85) * (1 - k));
    }
    pos.needsUpdate = true;
    sz.needsUpdate = true;
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={9} raycast={() => undefined} />;
}

// ------------------------------------------------------------------ light shafts (under water)

/** Soft sun shafts slanting down from the surface, seen only from under water. One draw each, additive. */
export function LightShafts({ spots, depth, active }: { spots: { x: number; z: number; w: number }[]; depth: number; active: () => boolean }) {
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: shaderTime },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float fall = pow(vUv.y, 1.6);
        float flicker = 0.75 + 0.25 * sin(uTime * 0.9 + vUv.x * 7.0);
        gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * edge * fall * flicker * 0.16, 1.0);
      }`
  }), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    g.visible = active();
    if (!g.visible) return;
    // Each shaft turns about its own vertical axis to face the camera.
    for (const c of g.children) c.rotation.y = Math.atan2(camera.position.x - (c.position.x + g.parent!.position.x), camera.position.z - (c.position.z + g.parent!.position.z));
  });
  return (
    <group ref={group}>
      {spots.map((s, i) => (
        <mesh key={i} position={[s.x, -depth / 2, s.z]} material={mat} renderOrder={8} raycast={() => undefined}>
          <planeGeometry args={[s.w, depth]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ gulls

/** A few gulls wheeling overhead (one instanced draw; the wing beat is a scale). */
export function Gulls({ centre, n = 6, height = 22, radius = 30, active }: { centre: { x: number; z: number }; n?: number; height?: number; radius?: number; active: () => boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // A shallow "M": two swept wings from the body.
    const v = [0, 0, 0.18, -0.55, 0.12, -0.1, 0, 0, -0.12, 0, 0, 0.18, 0.55, 0.12, -0.1, 0, 0, -0.12, -0.55, 0.12, -0.1, -0.95, 0.02, -0.3, 0, 0, -0.12, 0.55, 0.12, -0.1, 0.95, 0.02, -0.3, 0, 0, -0.12];
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f4f6f8", side: THREE.DoubleSide }), []);
  const birds = useMemo(() => Array.from({ length: n }, (_, i) => ({ r: radius * (0.6 + (i % 3) * 0.25), h: height + (i % 4) * 3, w: 0.08 + (i % 5) * 0.02, p: i * 1.7, flap: 2.2 + (i % 3) * 0.6 })), [n, radius, height]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.visible = active();
    if (!m.visible) return;
    const t = shaderTime.value;
    birds.forEach((b, i) => {
      const a = b.p + t * b.w;
      o.position.set(centre.x + Math.cos(a) * b.r, b.h + Math.sin(t * 0.3 + i) * 1.5, centre.z + Math.sin(a) * b.r);
      o.rotation.set(0, -a, Math.sin(t * 0.5 + i) * 0.25);
      const beat = Math.sin(t * b.flap + i);
      o.scale.set(1.2, 1 + beat * 0.9, 1.2);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, mat, n]} frustumCulled={false} raycast={() => undefined} />;
}
