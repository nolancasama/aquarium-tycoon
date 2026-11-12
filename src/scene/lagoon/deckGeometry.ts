import * as THREE from "three";
import { DECK } from "../../game/data/lagoon";
import { LAND_Y } from "../../game/marine/domain";
import { PartBuilder } from "../partBuilder";

/** The lowest step is the existing boardwalk landing, so it adds no duplicate face. */
export const DECK_STAIRS = {
  count: 20, going: 0.31, width: 1.9, thickness: 0.14,
  z: DECK.maxZ - 1.2, deckEdge: DECK.maxX + 0.2, ground: LAND_Y + 0.15
};

export interface WalkingSurface {
  name: string;
  minX: number; maxX: number; minZ: number; maxZ: number; top: number;
}

export function deckLayout() {
  const s = DECK_STAIRS;
  const rise = (DECK.top - s.ground) / (s.count - 1);
  const treads = Array.from({ length: s.count }, (_, i) => ({
    name: i === 0 ? "boardwalk-landing" : `tread-${i}`,
    minX: s.deckEdge + (s.count - i - 1) * s.going,
    maxX: s.deckEdge + (s.count - i) * s.going,
    minZ: s.z - s.width / 2, maxZ: s.z + s.width / 2,
    top: s.ground + i * rise
  }));
  const plankCount = 19, depth = DECK.maxZ - DECK.minZ + 0.4;
  const planks: WalkingSurface[] = Array.from({ length: plankCount }, (_, i) => ({
    name: `deck-plank-${i}`, minX: DECK.minX - 0.2, maxX: s.deckEdge,
    minZ: DECK.minZ - 0.2 + i * depth / plankCount + 0.009,
    maxZ: DECK.minZ - 0.2 + (i + 1) * depth / plankCount - 0.009,
    top: DECK.top
  }));
  return { treads, planks, rise };
}

/** Only overlapping footprints can fight; adjoining or separated boards can share a height. */
export function coplanarWalkingSurfaces(a: WalkingSurface, b: WalkingSurface, epsilon = 0.001) {
  return Math.abs(a.top - b.top) < epsilon &&
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > epsilon &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > epsilon;
}

/** Appends the entire deck to the existing merged scenery mesh. No depth overrides. */
export function addObservationDeck(b: PartBuilder, ground: (x: number, z: number) => number) {
  const D = DECK, s = DECK_STAIRS, { treads, planks } = deckLayout();
  const wood = "#b88a5a", dark = "#7a5636", edge = "#a87c50";
  const plankBottom = D.top - 0.16, joistBottom = plankBottom - 0.28, beamBottom = joistBottom - 0.28;
  const surface = (p: WalkingSurface, thickness: number, color: string) =>
    b.box(p.maxX - p.minX, thickness, p.maxZ - p.minZ, (p.minX + p.maxX) / 2, p.top - thickness, (p.minZ + p.maxZ) / 2, color);
  // Separate real boards replace the solid top slab; the joists finish at their underside.
  planks.forEach((p, i) => surface(p, 0.16, i % 3 === 0 ? edge : wood));
  for (let x = D.minX; x <= D.maxX; x += 1.5) b.box(0.14, 0.28, D.maxZ - D.minZ + 0.2, x, joistBottom, (D.minZ + D.maxZ) / 2, dark);
  for (const z of [D.minZ + 0.3, D.maxZ - 0.3]) {
    b.box(D.maxX - D.minX + 0.1, 0.28, 0.24, (D.minX + D.maxX) / 2, beamBottom, z, dark);
    for (const x of [D.minX, (D.minX + D.maxX) / 2, D.maxX]) {
      const y = ground(x, z);
      b.box(0.28, beamBottom - y, 0.28, x, y, z, dark);
    }
  }

  const posts = new Set<string>();
  function post(x: number, z: number, y: number) {
    const key = `${x.toFixed(4)},${z.toFixed(4)},${y.toFixed(4)}`;
    if (posts.has(key)) return;
    posts.add(key);
    // Rails sit on the post tops, rather than overlapping their top faces.
    b.box(0.09, 1.05, 0.09, x, y, z, dark);
  }
  function rail(a: THREE.Vector3, c: THREE.Vector3, height: number, thickness: number) {
    const direction = c.clone().sub(a), midpoint = a.clone().add(c).multiplyScalar(0.5);
    midpoint.y += height;
    const geometry = new THREE.BoxGeometry(direction.length(), thickness, 0.085);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize()));
    b.add(geometry, wood, [midpoint.x, midpoint.y + thickness / 2, midpoint.z]);
  }
  function deckRail(x0: number, z0: number, x1: number, z1: number) {
    const a = new THREE.Vector3(x0, D.top, z0), c = new THREE.Vector3(x1, D.top, z1);
    rail(a, c, 1.05, 0.095);
    rail(a, c, 0.48, 0.055);
    const n = Math.ceil(a.distanceTo(c) / 1.5);
    for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, D.top);
  }
  deckRail(D.minX, D.minZ, D.maxX, D.minZ);
  deckRail(D.minX, D.minZ, D.minX, D.maxZ);
  deckRail(D.minX, D.maxZ, D.maxX, D.maxZ);
  deckRail(D.maxX, D.minZ, D.maxX, s.z - s.width / 2 + 0.04);
  deckRail(D.maxX, s.z + s.width / 2 - 0.04, D.maxX, D.maxZ);

  // The landing is already the boardwalk. Every later tread has a closed riser.
  treads.slice(1).forEach((p, i) => {
    surface(p, s.thickness, i % 3 === 0 ? wood : edge);
    const previous = treads[i];
    b.box(0.045, p.top - s.thickness - previous.top, s.width, p.maxX - 0.0225, previous.top, s.z, dark);
  });

  // Notched diagonal stringers have horizontal bearing faces touching each tread's underside.
  const first = treads[1], last = treads[treads.length - 1];
  const shape = new THREE.Shape();
  shape.moveTo(first.maxX, s.ground);
  shape.lineTo(first.maxX, first.top - s.thickness);
  treads.slice(1).forEach((p, i) => {
    if (i > 0) shape.lineTo(p.maxX, p.top - s.thickness);
    shape.lineTo(p.minX, p.top - s.thickness);
  });
  shape.lineTo(last.minX, last.top - s.thickness - 0.36);
  shape.closePath();
  for (const side of [-1, 1]) {
    const z = s.z + side * (s.width / 2 - 0.17);
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false, steps: 1 }), dark, [0, 0, z - 0.07]);
    // Foot and intermediate piers bear on the boardwalk or beach, and meet the stringer underside.
    for (const index of [2, 10, 19]) {
      const p = treads[index], x = (p.minX + p.maxX) / 2;
      const y = x >= -11.5 ? s.ground : ground(x, z);
      const supportTop = s.ground + (first.maxX - x) * (last.top - s.thickness - 0.36 - s.ground) / (first.maxX - last.minX);
      if (supportTop > y) b.box(0.14, supportTop - y, 0.14, x, y, z, dark);
    }
    const lower = new THREE.Vector3((treads[0].minX + treads[0].maxX) / 2, s.ground, s.z + side * (s.width / 2 - 0.04));
    // Carry the rail over the 20 cm deck overhang to join the deck perimeter rail.
    const upper = new THREE.Vector3(D.maxX, D.top, lower.z);
    rail(lower, upper, 1.05, 0.095);
    rail(lower, upper, 0.48, 0.055);
    for (const index of [0, 5, 10, 15, 19]) {
      const p = treads[index], x = index === 19 ? upper.x : (p.minX + p.maxX) / 2;
      // Posts follow the rail's continuous incline and attach to the outer tread edge.
      const railY = lower.y + (lower.x - x) / (lower.x - upper.x) * (upper.y - lower.y) + 1.05;
      if (index === 19) post(x, lower.z, p.top);
      else b.box(0.085, railY - p.top, 0.085, x, p.top, lower.z, dark);
    }
  }
}
