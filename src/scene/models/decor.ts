import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import type { DecorKind, DecorVariant } from "../../game/types";
import { flatMat, smoothMat, swayMat } from "../materials";
import { DECOR } from "../../game/data/decor";

/**
 * Decorations, built for a 1 m tall tank with the base at y = 0 (the scene
 * scales them by the tank's water height). Heights follow data/decor.ts so the
 * fish clearance columns match what is drawn.
 */

export interface DecorModel {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  /** The chest's lid (hinged at the back edge, y = hinge height). */
  lid?: { geo: THREE.BufferGeometry; hinge: [number, number, number] };
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type DecorFinish = "plant" | "coral" | "rock" | "shell" | "chest" | "starfish" | "castle" | "anemone" | "shipwreck";

const finishMaterials = new Map<DecorFinish, THREE.MeshLambertMaterial>();

/** Fragment detail survives the large, sparsely tessellated chest and castle faces. */
function finishMaterial(finish: DecorFinish): THREE.MeshLambertMaterial {
  let material = finishMaterials.get(finish);
  if (material) return material;
  material = smoothMat.clone();
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDecorPosition;\nvarying vec2 vDecorUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDecorPosition = position;\nvDecorUv = uv;");
    const detail: Partial<Record<DecorFinish, string>> = {
      rock: `
        vec3 cell = floor(vDecorPosition * 160.0);
        float grain = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
        float fleck = smoothstep(0.92, 0.99, grain);
        diffuseColor.rgb *= 0.94 + 0.10 * grain;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.69, 0.79, 0.86), fleck * 0.16);`,
      chest: `
        if (diffuseColor.r > diffuseColor.g * 1.9 && diffuseColor.g > diffuseColor.b * 1.5) {
          float plank = abs(fract(vDecorPosition.y * 24.0 + 0.15) - 0.5);
          float seam = smoothstep(0.405, 0.465, plank);
          float grain = sin(vDecorPosition.x * 64.0 + sin(vDecorPosition.y * 81.0) * 2.0);
          diffuseColor.rgb *= (1.13 + grain * 0.12) * (1.0 - seam * 0.64);
        }`,
      shipwreck: `
        if (diffuseColor.r > diffuseColor.g * 1.35 && diffuseColor.g > diffuseColor.b * 1.3) {
          float plank = floor((vDecorPosition.z + vDecorPosition.y * 0.35) * 36.0);
          float wear = 0.5 + 0.5 * sin(plank * 2.7);
          float seam = smoothstep(0.40, 0.48, abs(fract((vDecorPosition.z + vDecorPosition.y * 0.35) * 36.0) - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.60, 0.43, 0.26), wear * 0.38);
          diffuseColor.rgb *= 1.0 - seam * 0.48;
        }`,
      shell: `
        float ridge = pow(0.5 + 0.5 * cos(vDecorUv.x * 37.699), 3.0);
        diffuseColor.rgb *= 0.70 + ridge * 0.45;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.91, 0.76), ridge * 0.28);`,
      castle: `
        float weather = sin(dot(vDecorPosition, vec3(51.0, 35.0, 29.0))) * sin(dot(vDecorPosition, vec3(31.0, -47.0, 59.0)));
        diffuseColor.rgb *= 0.92 + weather * 0.20;`
    };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDecorPosition;\nvarying vec2 vDecorUv;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${detail[finish] ?? ""}`);
  };
  material.customProgramCacheKey = () => `decor-finish-${finish}-v2`;
  finishMaterials.set(finish, material);
  return material;
}

/** Paint broad gradients into the existing vertices, without adding geometry. */
function painted(geo: THREE.BufferGeometry, finish: DecorFinish): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bounds = geo.boundingBox!;
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const positions = geo.getAttribute("position");
  const normals = geo.getAttribute("normal");
  const colors = geo.getAttribute("color");
  const uv = geo.getAttribute("uv");
  const c = new THREE.Color();
  const cream = new THREE.Color("#fff0d4");
  const leafTip = new THREE.Color("#a8ee91");
  const mineral = new THREE.Color("#d7e6ee");
  const lilac = new THREE.Color("#f3cfff");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const t = THREE.MathUtils.clamp((y - bounds.min.y) / height, 0, 1);
    const up = Math.max(0, normals.getY(i));
    const front = Math.max(0, normals.getZ(i));
    c.fromBufferAttribute(colors, i);
    const green = c.g > c.r * 1.12 && c.g > c.b * 1.05;
    const gold = c.r > c.g * 1.12 && c.g > c.r * 0.45 && c.g > c.b * 2.1;
    c.multiplyScalar(0.85 + up * 0.24 + front * 0.06);
    switch (finish) {
      case "plant":
        if (green) {
          const vein = Math.pow(Math.max(0, 1 - Math.abs(uv.getX(i) - 0.5) * 2), 3);
          c.multiplyScalar(0.78 + t * 0.30).lerp(leafTip, 0.55 * t * t + vein * 0.09);
        }
        break;
      case "coral": {
        const saturated = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 0.16;
        if (saturated) {
          const tip = c.r > c.b ? cream : mineral;
          c.multiplyScalar(0.67 + t * 0.40).lerp(tip, 0.52 * t * t + up * 0.07);
        }
        break;
      }
      case "rock":
        if (!green) {
          // Low-frequency mineral patches, continuous across repeated face vertices.
          const vein = Math.sin(x * 34 + y * 22 + z * 29) * Math.sin(z * 19 - y * 25);
          c.multiplyScalar(0.62 + t * 0.40 + vein * 0.12).lerp(mineral, up * 0.32 + t * 0.11);
        } else c.lerp(leafTip, up * 0.28);
        break;
      case "shell": {
        const ridge = 0.5 + 0.5 * Math.cos(uv.getX(i) * Math.PI * 12);
        c.multiplyScalar(0.85 + ridge * 0.20).lerp(cream, up * 0.30 + t * 0.12);
        break;
      }
      case "chest":
      case "shipwreck": {
        const wood = c.r > c.g * 1.25 && c.g > c.b * 1.35;
        if (gold && finish === "chest") {
          c.multiplyScalar(1.35).lerp(cream, up * 0.30 + front * 0.15);
        } else if (wood) {
          // The existing hull facets and lid arcs supply the plank boundaries.
          const grain = Math.sin(y * 88 + z * 21 + x * 9);
          c.multiplyScalar(0.90 + grain * 0.15);
          c.lerp(cream, (finish === "shipwreck" ? 0.19 : 0.06) + up * 0.15);
        }
        break;
      }
      case "starfish":
        if (c.r > c.b * 1.12 || c.r > c.g * 1.5) {
          c.lerp(cream, t * 0.18 + front * 0.15);
        }
        break;
      case "castle": {
        const weather = 0.5 + 0.5 * Math.sin(x * 43 + z * 27 + y * 18);
        c.multiplyScalar(0.78 + weather * 0.22).lerp(cream, up * 0.30 + t * 0.12);
        break;
      }
      case "anemone":
        c.lerp(lilac, t * t * 0.50 + up * 0.10);
        break;
    }
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  return geo;
}

function pebbles(b: PartBuilder, r: number, n: number, rand: () => number) {
  const colors = ["#c9b48a", "#a89cc8", "#e8d7b0", "#9fb8a8"];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * (0.3 + rand() * 0.7);
    b.add(new THREE.IcosahedronGeometry(0.018 + rand() * 0.014, 0), colors[i % colors.length], [Math.cos(a) * d, 0.01, Math.sin(a) * d], [rand(), rand(), rand()], [1, 0.6, 1]);
  }
}

function plant(big: boolean): DecorModel {
  const b = new PartBuilder(0.25);
  const rand = seeded(big ? 11 : 5);
  const h = big ? 0.6 : 0.3;
  const n = big ? 8 : 5;
  const greens = ["#2fbf5a", "#43d46c", "#25a34b", "#5fe07f"];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.5;
    const tilt = 0.15 + rand() * 0.3;
    const len = h * (0.6 + rand() * 0.4);
    const leaf = new THREE.SphereGeometry(1, 8, 6);
    // A long leaf leaning out from the centre, its base at the sand.
    const dx = Math.cos(a) * Math.sin(tilt) * len * 0.5;
    const dz = Math.sin(a) * Math.sin(tilt) * len * 0.5;
    b.add(leaf, greens[i % greens.length], [dx, len * 0.5 * Math.cos(tilt), dz], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], [0.035 + rand() * 0.015, len * 0.5, 0.012]);
  }
  pebbles(b, big ? 0.12 : 0.09, big ? 6 : 4, rand);
  return { geo: painted(b.build(), "plant"), mat: swayMat };
}

function coral(color: "red" | "blue"): DecorModel {
  const b = new PartBuilder(0.2);
  const rand = seeded(color === "red" ? 21 : 33);
  const main = color === "red" ? "#ff4a5c" : "#3d8bff";
  const tip = color === "red" ? "#ffa3ae" : "#a9d8ff";
  // A trunk with branches that split and end in round tips.
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (x: number, y: number, z: number, len: number, tilt: number, phi: number, depth: number) => {
    const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(phi), Math.cos(tilt), Math.sin(tilt) * Math.sin(phi));
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    const ex = x + dir.x * len;
    const ey = y + dir.y * len;
    const ez = z + dir.z * len;
    const r = 0.014 * (depth + 1);
    b.add(new THREE.CylinderGeometry(r * 0.8, r, len, 7), main, [(x + ex) / 2, (y + ey) / 2, (z + ez) / 2], [e.x, e.y, e.z]);
    b.sphere(r * 0.85, ex, ey, ez, depth <= 0 ? tip : main, [1, 1, 1], 7);
    if (depth <= 0) {
      b.sphere(0.028, ex, ey, ez, tip, [1, 1, 1], 8);
      return;
    }
    const n = 2 + (rand() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const childTilt = Math.min(1.0, tilt * 0.5 + 0.35 + rand() * 0.25);
      const childPhi = tilt === 0 ? (i / n) * Math.PI * 2 + rand() * 0.6 : phi + (i - (n - 1) / 2) * 1.3 + (rand() - 0.5) * 0.5;
      branch(ex, ey, ez, len * (0.7 + rand() * 0.2), childTilt, childPhi, depth - 1);
    }
  };
  branch(0, 0, 0, 0.12, 0, 0, 2);
  b.sphere(0.07, 0, 0.02, 0, main, [1, 0.5, 1], 10);
  pebbles(b, 0.1, 4, rand);
  return { geo: painted(b.build(), "coral"), mat: smoothMat };
}

function softenedStone(radius: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const positions = geo.getAttribute("position");
  const normals = geo.getAttribute("normal");
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    normal.fromBufferAttribute(positions, i).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return geo;
}

function rock(big: boolean): DecorModel {
  const b = new PartBuilder(0.3);
  const greys = ["#8d99a6", "#7a8794", "#a3adb8"];
  if (big) {
    b.add(softenedStone(0.15), greys[0], [0, 0.12, 0], [0.3, 0.6, 0.1], [1.15, 0.85, 0.95]);
    b.add(softenedStone(0.1), greys[1], [0.1, 0.25, 0.03], [0.8, 0.2, 0.4], [1, 0.9, 1]);
    b.add(softenedStone(0.07), greys[2], [-0.13, 0.06, 0.06], [0.1, 0.9, 0.3]);
  } else {
    b.add(softenedStone(0.09), greys[0], [0, 0.07, 0], [0.4, 0.3, 0.2], [1.2, 0.8, 1]);
    b.add(softenedStone(0.05), greys[2], [0.08, 0.04, 0.05], [0.9, 0.1, 0.5]);
  }
  // A little moss.
  b.sphere(0.03, big ? -0.05 : 0.02, big ? 0.2 : 0.12, 0.05, "#5fbf6a", [1.4, 0.4, 1], 8);
  return { geo: painted(b.build(), "rock"), mat: finishMaterial("rock") };
}

function shell(): DecorModel {
  const b = new PartBuilder(0.05);
  // A spiral conch lying on the sand: whorls shrinking along a rising spiral.
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = 0.055 * (1 - t * 0.75);
    const a = t * Math.PI * 2.2;
    b.sphere(r, -0.05 + t * 0.1 + Math.cos(a) * 0.012, r * 0.9 + t * 0.03, Math.sin(a) * 0.012, i % 2 ? "#ffd2c4" : "#ffb3be", [1, 0.9, 1], 12);
  }
  // The pink opening toward the front.
  b.sphere(0.04, -0.07, 0.04, 0.03, "#ff8fa3", [0.6, 0.9, 0.5], 10);
  return { geo: painted(b.build(), "shell"), mat: finishMaterial("shell") };
}

function chest(): DecorModel {
  const b = new PartBuilder(0.2);
  const w = 0.3;
  const d = 0.2;
  const h = 0.14;
  b.box(w, h, d, 0, 0, 0, "#8a5326");
  b.box(w * 0.92, 0.02, d * 0.9, 0, h - 0.02, 0, "#5c3412");
  for (const x of [-w * 0.32, w * 0.32]) b.box(0.03, h + 0.005, d + 0.01, x, 0, 0, "#ffc935");
  // Gold coins visible when the lid opens.
  for (let i = 0; i < 6; i++) b.sphere(0.03, -0.09 + i * 0.036, h - 0.005, (i % 2) * 0.03 - 0.015, "#ffd84a", [1, 0.45, 1], 8);
  const lid = new PartBuilder(0.05);
  // The lid's hinge is its back-bottom edge, at the origin.
  lid.add(new THREE.CylinderGeometry(d / 2, d / 2, w, 14, 1, false, 0, Math.PI), "#9a5d2b", [0, 0, d / 2], [0, 0, Math.PI / 2]);
  for (const x of [-w * 0.32, w * 0.32]) lid.add(new THREE.CylinderGeometry(d / 2 + 0.006, d / 2 + 0.006, 0.03, 14, 1, false, 0, Math.PI), "#ffc935", [x, 0, d / 2], [0, 0, Math.PI / 2]);
  lid.box(0.05, 0.05, 0.02, 0, -0.03, d + 0.002, "#ffc935");
  return { geo: painted(b.build(), "chest"), mat: finishMaterial("chest"), lid: { geo: painted(lid.build(), "chest"), hinge: [0, h, -d / 2] } };
}

function bubbler(): DecorModel {
  const b = new PartBuilder(0.1);
  b.add(new THREE.IcosahedronGeometry(0.07, 0), "#7d8a99", [0, 0.04, 0], [0.2, 0.4, 0], [1.3, 0.7, 1.1]);
  b.cyl(0.018, 0.024, 0.07, 0.02, 0.05, 0, "#c99a3a", 10);
  b.sphere(0.024, 0.02, 0.125, 0, "#e8c060", [1, 0.7, 1], 10);
  return { geo: b.build(), mat: flatMat };
}

function starfish(color: "pink" | "yellow"): DecorModel {
  const b = new PartBuilder(0.05);
  const main = color === "pink" ? "#ff7fae" : "#ffd23f";
  const dots = color === "pink" ? "#ffd0e2" : "#fff3b0";
  // Five arms lying on a little rock so it shows from the front.
  b.add(new THREE.IcosahedronGeometry(0.05, 0), "#9aa5b1", [0, 0.025, 0], [0.3, 0.2, 0.1], [1.4, 0.6, 1.1]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
    b.add(new THREE.ConeGeometry(0.022, 0.075, 6), main, [Math.cos(a) * 0.034, 0.075 + Math.sin(a) * 0.034, 0.025], [0, 0, a - Math.PI / 2], [1, 1, 0.5]);
    b.sphere(0.010, Math.cos(a) * 0.045, 0.075 + Math.sin(a) * 0.045, 0.034, dots, [1, 1, 1], 5);
  }
  b.sphere(0.026, 0, 0.075, 0.025, main, [1, 1, 0.55], 10);
  return { geo: painted(b.build(), "starfish"), mat: smoothMat };
}

function castle(big: boolean): DecorModel {
  const b = new PartBuilder(0.2);
  const s = big ? 1 : 0.68;
  const sand = "#e9cf8f";
  b.box(0.22 * s, 0.14 * s, 0.14 * s, 0, 0, 0, sand);
  for (const x of [-0.13, 0.13]) {
    b.cyl(0.045 * s, 0.05 * s, 0.24 * s, x * s, 0, 0, sand, 10);
    b.cone(0.06 * s, 0.09 * s, x * s, 0.24 * s, 0, "#ff8a5f", 10);
  }
  b.cyl(0.05 * s, 0.055 * s, 0.3 * s, 0, 0.06 * s, -0.02 * s, sand, 10);
  b.cone(0.065 * s, 0.1 * s, 0, 0.36 * s, -0.02 * s, "#ff8a5f", 10);
  // The door and battlements.
  b.box(0.06 * s, 0.08 * s, 0.01, 0, 0, 0.071 * s, "#8a5a33");
  for (let i = -2; i <= 2; i++) b.box(0.03 * s, 0.03 * s, 0.03 * s, i * 0.045 * s, 0.14 * s, 0.055 * s, sand);
  return { geo: painted(b.build(), "castle"), mat: finishMaterial("castle") };
}

function anemone(): DecorModel {
  const b = new PartBuilder(0.05);
  b.cyl(0.07, 0.09, 0.08, 0, 0, 0, "#7b3fbf", 12);
  // Wavy tentacles (the plant sway makes them move).
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const ring = i % 2 ? 0.045 : 0.065;
    b.add(new THREE.CylinderGeometry(0.008, 0.013, 0.15, 5), i % 3 ? "#b57bff" : "#d9b3ff", [Math.cos(a) * ring, 0.15, Math.sin(a) * ring], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]);
    b.sphere(0.012, Math.cos(a) * (ring + 0.025), 0.225, Math.sin(a) * (ring + 0.025), "#f0dcff", [1, 1, 1], 5);
  }
  return { geo: painted(b.build(), "anemone"), mat: swayMat };
}

function shipwreck(): DecorModel {
  const b = new PartBuilder(0.2);
  const wood = "#7a4f2a";
  // A tilted hull half in the sand, a broken mast and a little flag.
  b.add(new THREE.CylinderGeometry(0.11, 0.07, 0.42, 10, 1, false, 0, Math.PI), wood, [0, 0.08, 0], [0, 0, Math.PI / 2 + 0.15], [1, 1, 0.75]);
  b.boxAt(0.4, 0.02, 0.15, [0, 0.08, 0], [0, 0, 0.15], "#9b6a3c");
  for (let i = 0; i < 3; i++) b.cylAt(0.015, 0.012, [-0.12 + i * 0.1, 0.105 + i * 0.014, 0.08], [Math.PI / 2, 0, 0], "#3b2a1a", 8);
  b.cylAt(0.016, 0.26, [0.04, 0.22, 0], [0, 0, 0.35], wood, 8);
  b.boxAt(0.08, 0.05, 0.005, [0.0, 0.32, 0], [0, 0, 0.35], "#f4f1e8");
  b.cylAt(0.008, 0.06, [0.08, 0.36, 0], [0, 0, 0.35], wood, 6);
  b.sphere(0.04, 0.2, 0.03, 0.06, "#c9b48a", [1.4, 0.5, 1], 8);
  return { geo: painted(b.build(), "shipwreck"), mat: finishMaterial("shipwreck") };
}

type HabitatDecor = "kelp" | "arch" | "cave" | "driftwood";

/** New models use the exact clearance height and put their lowest vertex on sand. */
function habitatModel(b: PartBuilder, kind: HabitatDecor, finish: DecorFinish, mat: THREE.Material): DecorModel {
  const geo = b.build();
  geo.computeBoundingBox();
  const bounds = geo.boundingBox!;
  const height = bounds.max.y - bounds.min.y;
  geo.translate(0, -bounds.min.y, 0);
  geo.scale(1, DECOR[kind].versions[0].height / height, 1);
  return { geo: painted(geo, finish), mat };
}

// Kelp's long blades need less displacement than the short, broad classic plants.
// At the tallest fitting tank (1.5 m), blades including sway stay inside 0.12 m.
const kelpMaterial = (() => {
  const mat = swayMat.clone();
  mat.side = THREE.DoubleSide;
  mat.onBeforeCompile = (shader, renderer) => {
    swayMat.onBeforeCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("* 0.18 * sw * sw", "* 0.014 * sw * sw")
      .replace("* 0.08 * sw * sw", "* 0.009 * sw * sw");
  };
  mat.customProgramCacheKey = () => "kelp-sway-v1";
  return mat;
})();

function kelp(): DecorModel {
  const b = new PartBuilder(0.1);
  const greens = ["#297b4a", "#43ad57", "#74c65b", "#3b9450", "#8bc86b"];
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * Math.PI * 2 / 5;
    const height = blade === 0 ? 0.85 : 0.57 + blade * 0.055;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const spread = 0.012 + 0.026 * Math.sin(t * Math.PI * 0.8 + blade * 0.5);
      const x = Math.cos(angle) * spread + Math.sin(t * Math.PI * 2.5 + blade) * 0.009 * t;
      const z = Math.sin(angle) * spread;
      const width = 0.014 * Math.sin(Math.PI * (0.08 + t * 0.92));
      for (const side of [-1, 1]) vertices.push(x + Math.cos(angle + Math.PI / 2) * width * side, height * t, z + Math.sin(angle + Math.PI / 2) * width * side);
      if (i < 8) {
        const p = i * 2;
        indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    b.add(geo, greens[blade], [0, 0, 0]);
  }
  b.add(new THREE.IcosahedronGeometry(0.035, 0), "#887953", [0, 0.012, 0], [0, 0.3, 0], [1, 0.4, 1]);
  return habitatModel(b, "kelp", "plant", kelpMaterial);
}

function coralArch(): DecorModel {
  const b = new PartBuilder(0.1);
  const pink = "#eb779b";
  // Two planted legs and a continuous open arch, rather than a solid pink slab.
  for (const x of [-0.13, 0.13]) {
    b.cyl(0.025, 0.035, 0.245, x, 0, 0, pink, 7);
    b.add(new THREE.IcosahedronGeometry(0.034, 0), "#d05b87", [x, 0.023, 0], [0.2, 0, 0.1], [1, 0.7, 1]);
  }
  b.add(new THREE.TorusGeometry(0.13, 0.026, 6, 12, Math.PI), pink, [0, 0.245, 0]);
  // Short coral fingers and pale polyps follow the bridge's upper surface.
  for (let i = 1; i <= 5; i++) {
    const a = i * Math.PI / 6;
    const x = Math.cos(a) * 0.13;
    const y = 0.245 + Math.sin(a) * 0.13;
    b.cyl(0.007, 0.012, 0.018, x, y, 0, "#f59bb6", 5);
    b.sphere(0.01, x, y + 0.018, 0, "#ffd4d5", [1, 1, 1], 5);
  }
  return habitatModel(b, "arch", "coral", smoothMat);
}

function rockCave(): DecorModel {
  const b = new PartBuilder(0.16);
  // A recessed charcoal back is visible through the open, stone-lined mouth.
  const opening = new THREE.Shape();
  opening.moveTo(-0.073, 0);
  opening.lineTo(0.073, 0);
  opening.lineTo(0.073, 0.19);
  opening.absellipse(0, 0.19, 0.073, 0.078, 0, Math.PI, false, 0);
  opening.closePath();
  b.add(new THREE.ShapeGeometry(opening, 7), "#17232b", [0, 0, -0.045], [0, 0, 0], [1, 1, 1], { vary: false, flatAo: true });
  const greys = ["#657780", "#84918e", "#75858d", "#9b9e8e"];
  for (const side of [-1, 1]) {
    for (let layer = 0; layer < 3; layer++) {
      b.add(new THREE.IcosahedronGeometry(1, 0), greys[(layer + (side > 0 ? 1 : 0)) % 4], [side * (0.105 - layer * 0.008), 0.064 + layer * 0.101, 0], [0, side * 0.2, 0], [0.047, 0.073, 0.075]);
    }
  }
  b.add(new THREE.IcosahedronGeometry(1, 0), greys[2], [0, 0.337, -0.005], [0, 0.1, 0], [0.15, 0.083, 0.08]);
  b.add(new THREE.IcosahedronGeometry(1, 0), greys[3], [-0.025, 0.388, -0.018], [0, 0.25, 0], [0.087, 0.034, 0.058]);
  return habitatModel(b, "cave", "rock", finishMaterial("rock"));
}

function driftwood(): DecorModel {
  const b = new PartBuilder(0.08);
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (from: [number, number, number], to: [number, number, number], radius: number, color: string) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize()));
    const middle = start.add(end).multiplyScalar(0.5);
    b.add(new THREE.CylinderGeometry(radius * 0.65, radius, direction.length(), 7), color, [middle.x, middle.y, middle.z], [e.x, e.y, e.z]);
    b.sphere(radius * 0.68, ...to, "#c2a77c", [1, 0.8, 1], 6);
  };
  branch([-0.095, 0.024, -0.006], [0.095, 0.04, 0.014], 0.025, "#8d795d");
  branch([-0.035, 0.03, 0], [-0.085, 0.115, 0.045], 0.014, "#ab9472");
  branch([0.018, 0.034, 0], [0.078, 0.18, -0.033], 0.012, "#9a8264");
  branch([0.055, 0.038, 0.01], [0.105, 0.08, 0.035], 0.012, "#b09b79");
  // Splintered roots and a dark knot make the branching log read as old wood.
  branch([-0.065, 0.026, 0], [-0.103, 0.025, -0.044], 0.009, "#77674e");
  b.sphere(0.013, -0.032, 0.045, 0.015, "#5a4e3b", [1.4, 0.7, 0.5], 6);
  return habitatModel(b, "driftwood", "shipwreck", finishMaterial("shipwreck"));
}

const cache = new Map<string, DecorModel>();

export function decorModel(kind: DecorKind, variant: DecorVariant): DecorModel {
  const key = `${kind}:${variant}`;
  let m = cache.get(key);
  if (!m) {
    switch (kind) {
      case "plant":
        m = plant(variant === "big");
        break;
      case "coral":
        m = coral(variant === "blue" ? "blue" : "red");
        break;
      case "rock":
        m = rock(variant === "big");
        break;
      case "shell":
        m = shell();
        break;
      case "chest":
        m = chest();
        break;
      case "starfish":
        m = starfish(variant === "yellow" ? "yellow" : "pink");
        break;
      case "castle":
        m = castle(variant === "big");
        break;
      case "anemone":
        m = anemone();
        break;
      case "shipwreck":
        m = shipwreck();
        break;
      case "kelp":
        m = kelp();
        break;
      case "arch":
        m = coralArch();
        break;
      case "cave":
        m = rockCave();
        break;
      case "driftwood":
        m = driftwood();
        break;
      default:
        m = bubbler();
    }
    cache.set(key, m);
  }
  return m;
}
