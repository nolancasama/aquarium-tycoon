import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cetaceanGeometry, PART, type CetaceanSpec } from "../../scene/marine/cetaceans";

// SHA-256 of every named vertex attribute from the pre-jaw geometry. These
// fixtures cover all sanctuary fin profiles, including the calf and beluga.
const SANCTUARY: [CetaceanSpec, string][] = [
  [{ kind: "orca", length: 5.8, fin: "tall" }, "d625dc30ea377e71601f3f65e95ba97f8e64f1eb5455618db774d4f97301092d"],
  [{ kind: "orca", length: 5.2, fin: "curved" }, "7e3d5fb27228736fa4747ac48df8bd2d1465a419d1ec4378ec12ba76dfe7b5a6"],
  [{ kind: "orca", length: 4.8, fin: "nicked" }, "2706e4d4f1bdbabfe6a78977457822007f584d95469ad7962feffaa750b9e211"],
  [{ kind: "orca", length: 2.8, fin: "small" }, "f95c347aa2eaee2890eea87c6334a61b93c5e3cdae998f5d20dbbdbbc6bb2d54"],
  [{ kind: "beluga", length: 3.8, fin: "none" }, "ff0082576af4427561be3d53763a64f7b3e803422e3751e9486e064149cb9c14"]
];

describe("dolphin-only articulated jaw", () => {
  for (const [spec, expected] of SANCTUARY) {
    it(`preserves every ${spec.kind}/${spec.fin} geometry attribute`, () => {
      const geometry = cetaceanGeometry(spec), hash = createHash("sha256");
      for (const [name, attribute] of Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(name);
        hash.update(new Uint8Array(attribute.array.buffer));
      }
      expect(hash.digest("hex")).toBe(expected);
      expect(Array.from(geometry.getAttribute("part").array).every((part) => part <= PART.eye)).toBe(true);
      geometry.dispose();
    });
  }

  it("keeps every original closed-face vertex, normal and skin coordinate", () => {
    const geometry = cetaceanGeometry({ kind: "dolphin", length: 2.6, fin: "dolphin" });
    const part = geometry.getAttribute("part"), hash = createHash("sha256");
    const original = Array.from({ length: part.count }, (_, i) => i).filter((i) => part.getX(i) < PART.mouth);
    expect(original).toHaveLength(5028);
    for (const name of ["position", "normal", "skin", "color", "uv"]) {
      const attribute = geometry.getAttribute(name), values = new Float32Array(original.length * attribute.itemSize);
      original.forEach((source, target) => {
        for (let k = 0; k < attribute.itemSize; k++) values[target * attribute.itemSize + k] = attribute.array[source * attribute.itemSize + k];
      });
      hash.update(name);
      hash.update(new Uint8Array(values.buffer));
    }
    expect(hash.digest("hex")).toBe("d94b621ddf30ae791d68c38eb1b2a44ad5b3a874de3fad1c2d9daf1279081ae6");
    const parts = new Set(Array.from(part.array));
    expect(parts.has(PART.jaw)).toBe(true);
    expect(parts.has(PART.mouth)).toBe(true);
    expect(parts.has(PART.jawMouth)).toBe(true);
    expect(geometry.groups).toHaveLength(0); // Still one material / draw call.
    geometry.dispose();
  });
});
