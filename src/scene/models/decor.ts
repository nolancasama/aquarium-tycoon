import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import type { DecorKind, DecorVariant } from "../../game/types";
import { flatMat, smoothMat, swayMat } from "../materials";

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
  return { geo: b.build(), mat: swayMat };
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
  return { geo: b.build(), mat: flatMat };
}

function rock(big: boolean): DecorModel {
  const b = new PartBuilder(0.3);
  const rand = seeded(big ? 41 : 43);
  const greys = ["#8d99a6", "#7a8794", "#a3adb8"];
  if (big) {
    b.add(new THREE.IcosahedronGeometry(0.15, 0), greys[0], [0, 0.12, 0], [0.3, 0.6, 0.1], [1.15, 0.85, 0.95]);
    b.add(new THREE.IcosahedronGeometry(0.1, 0), greys[1], [0.1, 0.25, 0.03], [0.8, 0.2, 0.4], [1, 0.9, 1]);
    b.add(new THREE.IcosahedronGeometry(0.07, 0), greys[2], [-0.13, 0.06, 0.06], [0.1, 0.9, 0.3]);
  } else {
    b.add(new THREE.IcosahedronGeometry(0.09, 0), greys[0], [0, 0.07, 0], [0.4, 0.3, 0.2], [1.2, 0.8, 1]);
    b.add(new THREE.IcosahedronGeometry(0.05, 0), greys[2], [0.08, 0.04, 0.05], [0.9, 0.1, 0.5]);
  }
  // A little moss.
  b.sphere(0.03, big ? -0.05 : 0.02, big ? 0.2 : 0.12, 0.05, "#5fbf6a", [1.4, 0.4, 1], 8);
  void rand;
  return { geo: b.build(), mat: flatMat };
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
  return { geo: b.build(), mat: smoothMat };
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
  return { geo: b.build(), mat: flatMat, lid: { geo: lid.build(), hinge: [0, h, -d / 2] } };
}

function bubbler(): DecorModel {
  const b = new PartBuilder(0.1);
  b.add(new THREE.IcosahedronGeometry(0.07, 0), "#7d8a99", [0, 0.04, 0], [0.2, 0.4, 0], [1.3, 0.7, 1.1]);
  b.cyl(0.018, 0.024, 0.07, 0.02, 0.05, 0, "#c99a3a", 10);
  b.sphere(0.024, 0.02, 0.125, 0, "#e8c060", [1, 0.7, 1], 10);
  return { geo: b.build(), mat: flatMat };
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
      default:
        m = bubbler();
    }
    cache.set(key, m);
  }
  return m;
}
