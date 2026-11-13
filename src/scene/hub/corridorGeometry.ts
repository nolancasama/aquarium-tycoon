import * as THREE from "three";
import { DOOR_OPENING, HUB_CORRIDOR } from "../../game/data/hub";

type Triple = [number, number, number];
export interface CorridorBox {
  min: Triple;
  max: Triple;
  color: string;
  shell?: boolean;
}
export interface CorridorFace {
  axis: number;
  sign: number;
  plane: number;
  u: [number, number];
  v: [number, number];
  box: CorridorBox;
  outline: Triple[];
}
/** Bury wall/threshold undersides 2 cm below the unchanged hub floor. */
export const HUB_STRUCTURE_BASE_Y = -0.02;
/** Conceal the curved wall cut edge inside the solid reveal, rather than
 * meeting its independently transformed triangles on the jamb's inner face. */
export const HUB_JAMB_REVEAL_OVERLAP = 0.015;
const EPS = 1e-8;

/** Only emit the outside boundary of the joined solids. Subtracting covered
 * rectangles removes both internal contact faces and overlapping slab tops. */
export function corridorBoundary(boxes: readonly CorridorBox[]): CorridorFace[] {
  const faces: CorridorFace[] = [];
  boxes.forEach((box, index) => {
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const plane = sign < 0 ? box.min[axis] : box.max[axis];
      let rectangles = [[box.min[u], box.max[u], box.min[v], box.max[v]]];
      boxes.forEach((other, otherIndex) => {
        if (otherIndex === index || plane < other.min[axis] - EPS || plane > other.max[axis] + EPS) return;
        const beyond = sign < 0 ? other.min[axis] < plane - EPS : other.max[axis] > plane + EPS;
        if (!beyond && otherIndex > index) return;
        rectangles = rectangles.flatMap(([a, b, c, d]) => {
          const l = Math.max(a, other.min[u]), r = Math.min(b, other.max[u]);
          const lo = Math.max(c, other.min[v]), hi = Math.min(d, other.max[v]);
          if (r - l < EPS || hi - lo < EPS) return [[a, b, c, d]];
          return [[a, l, c, d], [r, b, c, d], [l, r, c, lo], [l, r, hi, d]]
            .filter(([x0, x1, y0, y1]) => x1 - x0 > EPS && y1 - y0 > EPS);
        });
      });
      for (const [a, b, c, d] of rectangles) faces.push({ axis, sign, plane, u: [a, b], v: [c, d], box, outline: [] });
    }
  });
  const point = (face: CorridorFace, u: number, v: number): Triple => {
    const p: Triple = [0, 0, 0];
    p[face.axis] = face.plane; p[(face.axis + 1) % 3] = u; p[(face.axis + 2) % 3] = v;
    return p;
  };
  const corners = (face: CorridorFace) => [point(face, face.u[0], face.v[0]), point(face, face.u[1], face.v[0]), point(face, face.u[1], face.v[1]), point(face, face.u[0], face.v[1])];
  const vertices = [...new Map(faces.flatMap(corners).map(p => [p.map(v => v.toFixed(8)).join(","), p])).values()];
  for (const face of faces) {
    const edgeCorners = corners(face);
    for (let edge = 0; edge < 4; edge++) {
      const a = edgeCorners[edge], b = edgeCorners[(edge + 1) % 4];
      const along = a.findIndex((value, axis) => Math.abs(value - b[axis]) > EPS);
      // Include every neighboring face's corner on this edge. Without these
      // shared edge vertices, a long jamb edge meets shorter corridor edges at
      // T junctions and can expose a dashed, subpixel crack on Chromebooks.
      const points = vertices.filter(p => p.every((value, axis) => axis === along || Math.abs(value - a[axis]) < EPS)
        && p[along] >= Math.min(a[along], b[along]) - EPS && p[along] <= Math.max(a[along], b[along]) + EPS);
      points.sort((p, q) => (p[along] - q[along]) * Math.sign(b[along] - a[along]));
      face.outline.push(...points.slice(0, -1));
    }
  }
  return faces;
}

export function corridorFaceGeometry(face: CorridorFace): THREE.BufferGeometry {
  const u = (face.axis + 1) % 3, v = (face.axis + 2) % 3;
  const point = (a: number, b: number) => {
    const p = [0, 0, 0]; p[face.axis] = face.plane; p[u] = a; p[v] = b;
    // Geometry's +z points into the hub; corridor depth points outwards.
    p[2] = -p[2];
    return p;
  };
  const outline = face.outline.map(p => [p[0], p[1], -p[2]]);
  const positions: number[] = [];
  const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...(face.sign > 0 ? c : b), ...(face.sign > 0 ? b : c));
  if (outline.length === 4) {
    triangle(outline[0], outline[1], outline[2]);
    triangle(outline[0], outline[2], outline[3]);
  } else {
    const centre = point((face.u[0] + face.u[1]) / 2, (face.v[0] + face.v[1]) / 2);
    for (let i = 0; i < outline.length; i++) triangle(centre, outline[i], outline[(i + 1) % outline.length]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Local (side, height, depth) solids, including the doorway reveal. */
export function corridorStructure(theme: { wall: string; floor: string; trim: string; glow: string }): CorridorBox[] {
  const result: CorridorBox[] = [], w = DOOR_OPENING.w, h = DOOR_OPENING.h, D = HUB_CORRIDOR.depth;
  const add = (side: number, depth: number, y: number, width: number, height: number, length: number, color: string, shell = false) => {
    const bottom = y - height / 2;
    result.push({ min: [side - width / 2, Math.abs(bottom) < EPS ? HUB_STRUCTURE_BASE_Y : bottom, depth - length / 2], max: [side + width / 2, y + height / 2, depth + length / 2], color, shell });
  };
  for (const side of [-1, 1]) add(side * (w / 2 + 0.14 - HUB_JAMB_REVEAL_OVERLAP / 2), 0.05, h / 2, 0.28 + HUB_JAMB_REVEAL_OVERLAP, h + 0.1, 0.8, "#e2d2b4", true);
  // The lintel underside sits 2 cm below the curved wall's underside (h),
  // rather than placing both faces on the same plane through the wall.
  add(0, 0.05, h + 0.21, w + 0.7, 0.46, 0.8, "#e2d2b4", true);
  add(0, -0.03, 0.045, w, 0.09, 0.95, "#d9c195", true);
  add(0, 0, h + 0.25, 0.42, 0.55, 0.87, "#d9a441", true);
  add(0, D / 2, -0.047, w + 0.44, 0.13, D + 0.4, theme.floor);
  add(-w / 2 - 0.11, D / 2, h / 2, 0.22, h, D, theme.wall);
  add(w / 2 + 0.11, 1.225, h / 2, 0.22, h, 2.45, theme.wall);
  add(0, D + 0.11, h / 2, w + 0.44, h, 0.22, theme.wall);
  add(0, D / 2, h + 0.08, w + 0.44, 0.16, D + 0.4, theme.trim);
  const branchEnd = HUB_CORRIDOR.endSide + 0.65, branchWidth = branchEnd - w / 2;
  add(w / 2 + branchWidth / 2, 3.475, -0.047, branchWidth, 0.13, 2.05, theme.floor);
  add(w / 2 + branchWidth / 2, 3.475, h + 0.08, branchWidth, 0.16, 2.05, theme.trim);
  for (const depth of [2.34, D + 0.11]) add(w / 2 + branchWidth / 2, depth, h / 2, branchWidth, h, 0.22, theme.wall);
  add(branchEnd + 0.11, 3.475, h / 2, 0.22, h, 2.05, theme.wall);
  // Rails, reliefs and the end portal also join the wall solid: their backs
  // otherwise duplicate the wall's inside face exactly.
  for (const depth of [0.6, 1.5, 2.5, 3.5]) add(-w / 2 + 0.035, depth, 1.1, 0.07, 0.09, 0.75, theme.trim);
  add(0, D - 0.035, 1.55, 1.4, 2.7, 0.07, theme.trim);
  for (let i = 0; i < 3; i++) add(-w / 2 + 0.09, 1.1 + i * 0.65, 1.9 + (i % 2) * 0.2, 0.12, 0.22, 0.35, theme.glow);
  return result;
}
