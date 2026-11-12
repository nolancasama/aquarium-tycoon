import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PartBuilder } from "../partBuilder";

/** Tank-local metres, measured above the sand bed, not above the plinth. */
export const REEF_FLOOR = 0.14;
export const REEF_INTERIOR_RADIUS = 1.88;
export type ReefElement = {
  kind: string; geometry: THREE.BufferGeometry; bounds: THREE.Box3; obstacle: boolean;
  attachment?: { rock: number; point: THREE.Vector3 };
};

function rod(b: PartBuilder, from: THREE.Vector3, to: THREE.Vector3, r: number, color: string) {
  const direction = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(r * 0.65, r, direction.length(), 7);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  b.add(g, color, from.clone().add(to).multiplyScalar(0.5).toArray());
}

/** Layered live rock and attached colonies, merged into one vertex-coloured draw. */
export function createHubReef() {
  const elements: ReefElement[] = [];
  const element = (kind: string, x: number, z: number, obstacle: boolean, draw: (b: PartBuilder) => void, y = 0, attachment?: ReefElement["attachment"]) => {
    const b = new PartBuilder(0);
    draw(b);
    const geometry = b.build();
    geometry.computeBoundingBox();
    // Substrate rests on sand; stacked slabs and colonies have explicit seats.
    geometry.translate(x, y - geometry.boundingBox!.min.y, z);
    geometry.computeBoundingBox();
    const p = geometry.getAttribute("position"), c = geometry.getAttribute("color");
    // Coherent mineral/mottled tissue variation, not random colours per vertex.
    for (let i = 0; i < p.count; i++) {
      const grain = Math.sin(p.getX(i) * 27 + p.getZ(i) * 19) * Math.sin(p.getY(i) * 23 + p.getZ(i) * 13);
      const k = 0.91 + grain * 0.065 + Math.min(1, p.getY(i) * 5) * 0.09;
      c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
      if (kind === "rock") {
        const patch = Math.sin(p.getX(i) * 11 + p.getY(i) * 7) + Math.cos(p.getZ(i) * 14 - p.getY(i) * 9);
        const mineral = new THREE.Color(patch > 1.3 ? "#b87896" : patch < -0.9 ? "#a89771" : "#aaa398");
        const mixed = new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).lerp(mineral, patch > 1.3 ? 0.45 : 0.28);
        c.setXYZ(i, mixed.r, mixed.g, mixed.b);
      }
    }
    elements.push({ kind, geometry, bounds: geometry.boundingBox!.clone(), obstacle, attachment });
  };

  // Small footings carry overlapping limestone shelves. The middle lintel leaves
  // an actual cave beneath it; individual bounds preserve that open volume.
  const rocks = [
    // x, z, bottom, half-width, height, half-depth, yaw
    [-0.88, -0.3, 0, 0.36, 0.28, 0.38, 0.2],
    [-0.48, -0.38, 0, 0.23, 0.46, 0.28, -0.3],
    [0.43, -0.34, 0, 0.24, 0.45, 0.3, 0.25],
    [0.87, -0.17, 0, 0.32, 0.26, 0.37, -0.4],
    [-0.77, 0.22, 0, 0.32, 0.24, 0.3, -0.1],
    [0.65, 0.37, 0, 0.34, 0.23, 0.28, 0.25],
    [-0.76, -0.24, 0.22, 0.51, 0.19, 0.4, -0.15],
    [0.73, -0.12, 0.21, 0.46, 0.19, 0.39, 0.3],
    [-0.06, -0.37, 0.39, 0.68, 0.17, 0.29, 0.04],
    [-0.69, -0.3, 0.37, 0.32, 0.25, 0.3, 0.2],
    [-0.62, -0.28, 0.56, 0.43, 0.14, 0.32, -0.1],
    [0.62, 0.02, 0.36, 0.35, 0.17, 0.31, -0.25],
    [-0.99, 0.5, 0, 0.19, 0.15, 0.19, 0.3],
    [0.26, 0.48, 0, 0.22, 0.14, 0.18, -0.2]
  ];
  rocks.forEach(([x, z, y, w, h, d, angle], n) => element("rock", x, z, true, b => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const k = 1 + 0.11 * Math.sin(px * 7 + py * 3 + n) * Math.cos(pz * 8 - py * 4);
      p.setXYZ(i, px * w * k, py * h * 0.5 * k, pz * d * k);
    }
    g.computeVertexNormals();
    b.add(g, n % 2 ? "#a99a80" : "#99968d", [0, 0, 0], [0.04 * Math.sin(n), angle, 0.035 * Math.cos(n)]);
  }, y));

  // Ray-test the real slab triangles, so each colony grows from a rock surface
  // rather than an estimated height or an invisible floor pedestal.
  const colony = (kind: string, x: number, z: number, draw: (b: PartBuilder) => void) => {
    const ray = new THREE.Ray(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
    let seat: ReefElement["attachment"];
    elements.forEach((e, rock) => {
      if (e.kind !== "rock") return;
      const p = e.geometry.getAttribute("position");
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
        if (ray.intersectTriangle(a, b, c, false, hit) && (!seat || hit.y > seat.point.y)) seat = { rock, point: hit.clone() };
      }
    });
    if (!seat) throw new Error(`Reef ${kind} has no supporting live rock`);
    element(kind, x, z, true, draw, seat.point.y - 0.035, seat);
  };

  for (const [x, z, h, color, tipColor] of [[-0.69, -0.33, 0.82, "#bc78c5", "#f2b5da"], [-0.98, 0.05, 0.55, "#edb957", "#ffe0a0"], [0.66, -0.2, 0.68, "#dd858d", "#ffc0ae"]] as const) {
    colony("branching", x, z, b => {
      b.sphere(0.1, 0, 0.025, 0, color, [1, 0.35, 1], 8);
      const root = new THREE.Vector3(0, 0, 0);
      const fork = new THREE.Vector3(0.02, h * 0.48, 0);
      rod(b, root, fork, 0.043, color);
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4, reach = 0.19 + (k % 2) * 0.09;
        const tip = new THREE.Vector3(Math.cos(a) * reach, h * (0.72 + k * 0.06), Math.sin(a) * reach);
        const joint = fork.clone().lerp(tip, 0.55);
        rod(b, fork, tip, 0.028, color);
        rod(b, joint, joint.clone().add(new THREE.Vector3(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12)), 0.018, color);
        for (const s of [-1, 1]) {
          const twig = tip.clone().add(new THREE.Vector3(s * 0.09, h * 0.12, 0.07 * Math.cos(a)));
          rod(b, tip, twig, 0.016, color);
          rod(b, twig, twig.clone().add(new THREE.Vector3(0, 0.055, 0)), 0.011, tipColor);
        }
      }
    });
  }

  for (const [x, z, radius, color] of [[0.83, 0.14, 0.36, "#d88752"], [-0.77, 0.29, 0.32, "#66b3a2"], [0.08, -0.34, 0.28, "#c593b4"]] as const) {
    colony("plate", x, z, b => {
      for (let j = 0; j < 3; j++) {
        const r = radius * (1 - j * 0.18);
        const g = new THREE.CylinderGeometry(r, r * 0.97, 0.023, 32, 2);
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          const a = Math.atan2(p.getZ(i), p.getX(i));
          const ripple = 1 + 0.065 * Math.sin(a * 7 + j);
          p.setX(i, p.getX(i) * ripple); p.setZ(i, p.getZ(i) * ripple);
          p.setY(i, p.getY(i) + Math.sin(a * 5 + j) * 0.012 + Math.hypot(p.getX(i), p.getZ(i)) * 0.05);
        }
        g.computeVertexNormals();
        b.add(g, j === 2 ? new THREE.Color(color).lerp(new THREE.Color("#ffe4be"), 0.22) : color, [j * -0.055, j * 0.095, j * -0.045]);
      }
    });
  }

  for (const [x, z, color, yaw] of [[0.35, -0.44, "#cc6c85", -0.3], [-1.03, -0.3, "#dd9a53", 0.4]] as const) {
    colony("fan", x, z, b => {
      const root = new THREE.Vector3(0, 0.02, 0);
      rod(b, root, new THREE.Vector3(0, 0.24, 0), 0.023, color);
      // Closed, gently pleated membrane (both faces), with quiet radial veins.
      const vertices: number[] = [];
      const edge = (a: number) => new THREE.Vector3(Math.sin(a) * 0.39, 0.23 + Math.cos(a) * 0.55, 0.035 * Math.sin(a * 7))
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const centre = new THREE.Vector3(0, 0.15, 0);
      for (let i = 0; i < 24; i++) {
        const a = -1.28 + i * 2.56 / 24, p = edge(a), q = edge(a + 2.56 / 24);
        vertices.push(...centre.toArray(), ...p.toArray(), ...q.toArray(), ...centre.toArray(), ...q.toArray(), ...p.toArray());
        if (i % 3 === 0) rod(b, centre, p, 0.006, "#edb7a5");
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      g.computeVertexNormals();
      b.add(g, color, [0, 0, 0]);
    });
  }

  for (const [x, z, r, color] of [[-0.48, 0.09, 0.19, "#c7ae60"], [0.61, 0.4, 0.2, "#7db5a0"], [-0.98, 0.47, 0.14, "#dc967e"]] as const) {
    colony("rounded", x, z, b => {
      const g = new THREE.SphereGeometry(r, 40, 28);
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i)), latitude = p.getY(i) / r;
        const groove = Math.pow(0.5 + 0.5 * Math.sin(a * 12 + Math.sin(latitude * 11) * 1.8), 8);
        const k = 1 - groove * 0.045;
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.72, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      b.add(g, color, [0, 0, 0]);
    });
  }

  for (const [x, z, color] of [[-0.37, -0.33, "#bd9bc8"], [0.85, 0.28, "#82ba9b"]] as const) {
    colony("anemone", x, z, b => {
      b.sphere(0.12, 0, 0.025, 0, color, [1, 0.4, 1], 12);
      for (let j = 0; j < 25; j++) {
        const a = j * 2.39996, r = 0.12 * Math.sqrt((j + 1) / 25);
        const from = new THREE.Vector3(Math.cos(a) * r, 0.03, Math.sin(a) * r);
        const bend = from.clone().add(new THREE.Vector3(Math.cos(a) * 0.035, 0.1 + (j % 4) * 0.015, Math.sin(a) * 0.035));
        const tip = bend.clone().add(new THREE.Vector3(-0.015, 0.055, 0.02));
        rod(b, from, bend, 0.012, color); rod(b, bend, tip, 0.009, color);
        b.sphere(0.014, tip.x, tip.y, tip.z, "#e7d6b1", [1, 1, 1], 6);
      }
    });
  }
  for (const [x, z] of [[0.4, 0.1], [-0.85, -0.48]]) {
    colony("soft", x, z, b => {
      for (let j = 0; j < 7; j++) {
        const a = j * 2.4, x = Math.cos(a) * 0.09, z = Math.sin(a) * 0.09, h = 0.15 + j % 3 * 0.04;
        rod(b, new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 1.3, h, z * 1.3), 0.026, "#c9959e");
        b.sphere(0.08, x * 1.3, h, z * 1.3, j % 2 ? "#d8acb8" : "#b68cbd", [1, 0.38, 1], 10);
      }
    });
  }

  // Gravel skirts trace the islands, leaving the centre/front as open sand.
  for (let i = 0; i < 85; i++) {
    const a = i * 2.39996, radius = 0.85 + (i % 9) * 0.078;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    if (Math.abs(x - z * 0.22) < 0.34) continue;
    element("gravel", x, z, false, b => {
      const r = 0.021 + (i % 5) * 0.009;
      b.add(new THREE.DodecahedronGeometry(r), i % 2 ? "#c7bca0" : "#a89f87", [0, 0, 0], [a, 0, a], [1.3, 0.65, 1]);
    });
  }
  for (const [x, z, a] of [[0.1, 1.36, 0.5], [-0.5, 1.19, -0.6], [1.25, 0.85, 1.3], [-0.13, -0.4, 0.1]]) {
    element("shell", x, z, false, b => {
      b.add(new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#e5d9bf", [0, 0, 0], [0, a, 0], [1, 0.4, 0.8]);
      for (let k = 0; k < 5; k++) rod(b, new THREE.Vector3(-0.06 + k * 0.03, 0.01, -0.03), new THREE.Vector3(-0.04 + k * 0.02, 0.026, 0.045), 0.004, "#bcae92");
    });
  }
  for (const [x, z] of [[-1.3, -0.8], [1.1, -0.95], [1.38, 0.43]]) {
    element("vegetation", x, z, true, b => {
      for (let j = 0; j < 5; j++) {
        const h = 0.17 + (j % 3) * 0.065;
        rod(b, new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.sin(j * 2) * 0.08, h, Math.cos(j * 2) * 0.08), 0.014, j % 2 ? "#738c62" : "#8b9b6b");
      }
    });
  }
  const geometry = mergeGeometries(elements.map(e => e.geometry), false);
  return { geometry, elements, obstacles: elements.filter(e => e.obstacle).map(e => e.bounds.clone()) };
}
