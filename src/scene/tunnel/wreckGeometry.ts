import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WRECK_SITE } from "../../game/data/sharkTunnel";

/** A low-poly, partially broken shipwreck visible from the U-shaped tunnel.
 * Static vertex colours, no textures, no animation, no additional draw calls.
 * Its broad hull and mast are represented by swim collision solids separately. */
export function wreckGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const cx = WRECK_SITE.x, cz = WRECK_SITE.z, y = WRECK_SITE.y;
  const WOOD = "#846449", DARK = "#574637", EDGE = "#a7835b";
  const IRON = "#384e57", GOLD = "#e1ae55", CORAL = ["#dc806c", "#67b5a4", "#e2af71", "#c07ca5"];

  const colored = (g: THREE.BufferGeometry, hex: string) => {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.computeVertexNormals();
    const count = geo.getAttribute("position").count;
    const tint = new THREE.Color(hex);
    const rgb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { rgb[3 * i] = tint.r; rgb[3 * i + 1] = tint.g; rgb[3 * i + 2] = tint.b; }
    geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    if (!geo.hasAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    pieces.push(geo);
  };
  const box = (w: number, h: number, d: number, x: number, yy: number, z: number, hex: string, yaw = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (yaw) g.rotateY(yaw);
    g.translate(cx + x, y + yy, cz + z);
    colored(g, hex);
  };
  const beam = (a: [number,number,number], b: [number,number,number], radius: number, hex: string) => {
    const start = new THREE.Vector3(cx + a[0], y + a[1], cz + a[2]);
    const end = new THREE.Vector3(cx + b[0], y + b[1], cz + b[2]);
    const g = new THREE.CylinderGeometry(radius * 0.85, radius, start.distanceTo(end), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
    g.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    colored(g, hex);
  };

  // The keel, incomplete deck and sides visibly read as a wreck, not a solid box.
  box(3.7, 0.21, 0.28, 0, 0.16, 0, DARK);
  for (const side of [-1, 1]) {
    box(3.45, 0.18, 0.15, -0.05, 0.38, side * 0.68, WOOD);
    box(2.75, 0.14, 0.11, -0.2, 0.64, side * 0.79, EDGE);
    for (const x of [-1.55, -0.7, 0.2, 1.12]) {
      beam([x, 0.22, side * 0.59], [x + 0.09, 0.85, side * 0.75], 0.09, DARK);
    }
  }
  for (const [i, x] of [-1.52, -1.05, -0.56, 0.38, 0.9, 1.4].entries()) {
    box(0.38, 0.09, i === 2 ? 1.15 : 1.42, x, 0.52 + (i % 2) * 0.025, 0, i % 3 === 0 ? EDGE : WOOD, (i % 2 ? 1 : -1) * 0.025);
  }
  // Broken bow, slanted railings and a tilted, snapped mast.
  beam([1.45, 0.22, -0.65], [1.95, 0.56, 0], 0.12, EDGE);
  beam([1.45, 0.22, 0.65], [1.95, 0.56, 0], 0.12, EDGE);
  beam([-0.35, 0.55, 0.1], [-0.09, 2.5, 0.06], 0.15, DARK);
  beam([-1.3, 1.95, 0.06], [0.85, 2.08, 0.06], 0.085, EDGE);
  beam([-0.09, 2.5, 0.06], [0.12, 2.78, -0.08], 0.11, WOOD);
  box(0.45, 0.24, 0.35, 0.68, 0.78, -0.15, DARK);
  box(0.43, 0.085, 0.36, 0.68, 0.94, -0.15, GOLD);
  box(0.06, 0.14, 0.04, 0.7, 0.76, -0.34, GOLD);
  // Small coral colonies reclaim the hull and make the silhouette colorful.
  const clusters: Array<[number,number,number]> = [[-1.6,0.36,-0.84],[-0.9,0.62,-0.85],[1.32,0.34,-0.82],[1.55,0.22,0.78],[-1.35,0.31,0.81],[0.85,0.28,0.84]];
  for (let i = 0; i < clusters.length; i++) {
    const [x, yy, z] = clusters[i];
    const g = i % 2 ? new THREE.IcosahedronGeometry(0.19, 0) : new THREE.ConeGeometry(0.2, 0.5, 5);
    g.translate(cx + x, y + yy, cz + z);
    colored(g, CORAL[i % CORAL.length]);
  }
  // A small iron anchor outside the near side, on the sand.
  beam([1.7, 0.12, -1.04], [1.76, 0.62, -1.04], 0.06, IRON);
  beam([1.47, 0.16, -1.04], [2.02, 0.16, -1.04], 0.06, IRON);

  const geometry = mergeGeometries(pieces, false);
  pieces.forEach(g => g.dispose());
  if (!geometry) throw new Error("Could not build Shark Tunnel shipwreck");
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
