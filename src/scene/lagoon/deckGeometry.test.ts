import { describe, expect, it } from "vitest";
import { DECK } from "../../game/data/lagoon";
import { PartBuilder } from "../partBuilder";
import { addBoardwalk, addObservationDeck, BOARDWALK, boardwalkLayout, coplanarWalkingSurfaces, deckLayout, DECK_STAIRS, GALLERY_COVER_TOP } from "./deckGeometry";

describe("lagoon pavilion boardwalk construction", () => {
  it("separates every board and clears the gallery roof and wall tops below it", () => {
    const boards = boardwalkLayout();
    expect(boards[0].minX).toBe(BOARDWALK.minX);
    expect(boards.at(-1)!.maxX).toBe(BOARDWALK.maxX);
    expect(BOARDWALK.top - BOARDWALK.thickness - GALLERY_COVER_TOP).toBeCloseTo(0.02, 9);
    for (let i = 0; i < boards.length; i++) for (let j = i + 1; j < boards.length; j++) {
      expect(coplanarWalkingSurfaces(boards[i], boards[j]), `${boards[i].name} / ${boards[j].name}`).toBe(false);
    }
    for (let i = 1; i < boards.length; i++) expect(boards[i].minX - boards[i - 1].maxX).toBeCloseTo(0.018, 9);
  });

  it("renders exactly the board area, without an overlapping slab or seam faces", () => {
    const builder = new PartBuilder(0.4);
    addBoardwalk(builder);
    const geometry = builder.build(), positions = geometry.getAttribute("position");
    const seen = new Set<string>();
    let topArea = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const vertices = [0, 1, 2].map(k => [positions.getX(i + k), positions.getY(i + k), positions.getZ(i + k)]);
      const key = vertices.map(v => v.map(n => n.toFixed(5)).join(",")).sort().join("|");
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      if (vertices.every(v => Math.abs(v[1] - BOARDWALK.top) < 0.00001)) {
        const [a, b, c] = vertices;
        topArea += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2;
      }
    }
    const expected = boardwalkLayout().reduce((sum, p) => sum + (p.maxX - p.minX) * (p.maxZ - p.minZ), 0);
    expect(topArea).toBeCloseTo(expected, 3);
    geometry.dispose();
  });
});

describe("lagoon observation deck construction", () => {
  it("joins the existing boardwalk landing to the deck at a consistent incline", () => {
    const { treads, rise } = deckLayout();
    expect(treads[0].top).toBeCloseTo(DECK_STAIRS.ground, 9);
    expect(treads.at(-1)!.top).toBeCloseTo(DECK.top, 9);
    expect(treads.at(-1)!.minX).toBeCloseTo(DECK_STAIRS.deckEdge, 9);
    // The landing is fully inside the existing 34 by 5.6 m boardwalk.
    expect(treads[0].minX).toBeGreaterThan(-11.5);
    expect(treads[0].minZ).toBeGreaterThan(10.2);
    expect(treads[0].maxZ).toBeLessThan(15.8);
    for (let i = 1; i < treads.length; i++) {
      expect(treads[i].top - treads[i - 1].top).toBeCloseTo(rise, 9);
      expect(treads[i].maxX).toBeCloseTo(treads[i - 1].minX, 9);
      expect(treads[i].top).toBeGreaterThan(treads[i - 1].top);
    }
  });

  it("has no overlapping coplanar walking surfaces, including the boardwalk underneath", () => {
    const { treads, planks } = deckLayout();
    // The first tread is this existing landing, and is deliberately not rendered twice.
    const surfaces = [...planks, ...treads.slice(1), {
      name: "existing-boardwalk", minX: -11.5, maxX: 22.5, minZ: 10.2, maxZ: 15.8, top: DECK_STAIRS.ground
    }];
    for (let i = 0; i < surfaces.length; i++) for (let j = i + 1; j < surfaces.length; j++) {
      expect(coplanarWalkingSurfaces(surfaces[i], surfaces[j]), `${surfaces[i].name} / ${surfaces[j].name}`).toBe(false);
    }
  });

  it("merges finite deck, stringer, riser and railing geometry without duplicate triangles", () => {
    const builder = new PartBuilder(0.4);
    addObservationDeck(builder, () => 0.8);
    const geometry = builder.build();
    const positions = geometry.getAttribute("position"), seen = new Set<string>();
    let deckTopArea = 0, invalidVertices = 0, duplicateTriangles = 0;
    expect(positions.count).toBeGreaterThan(1000);
    for (let i = 0; i < positions.count; i += 3) {
      const vertices: string[] = [];
      for (let k = 0; k < 3; k++) {
        const values = [positions.getX(i + k), positions.getY(i + k), positions.getZ(i + k)];
        if (values.some(value => !Number.isFinite(value))) invalidVertices++;
        vertices.push(values.map((value) => value.toFixed(5)).join(","));
      }
      const key = vertices.sort().join("|");
      if (seen.has(key)) duplicateTriangles++;
      seen.add(key);
      if ([0, 1, 2].every((k) => Math.abs(positions.getY(i + k) - DECK.top) < 0.00001)) {
        const dx1 = positions.getX(i + 1) - positions.getX(i), dz1 = positions.getZ(i + 1) - positions.getZ(i);
        const dx2 = positions.getX(i + 2) - positions.getX(i), dz2 = positions.getZ(i + 2) - positions.getZ(i);
        deckTopArea += Math.max(0, (dz1 * dx2 - dx1 * dz2) / 2);
      }
    }
    expect(invalidVertices).toBe(0);
    expect(duplicateTriangles).toBe(0);
    // Detect support-post tops accidentally reaching the walking surface again:
    // those overlap the planks without necessarily having identical triangles.
    const { planks, treads } = deckLayout();
    const expectedArea = [...planks, treads.at(-1)!].reduce((sum, p) => sum + (p.maxX - p.minX) * (p.maxZ - p.minZ), 0);
    expect(deckTopArea).toBeCloseTo(expectedArea, 3);
    geometry.dispose();
  });
});
