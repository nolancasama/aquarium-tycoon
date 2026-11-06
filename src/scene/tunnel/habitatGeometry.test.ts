import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { HABITAT, WALKWAY_SAMPLES } from "../../game/data/sharkTunnel";
import { habitatStaticGeometry, tunnelGlassGeometry } from "./habitatGeometry";

/** The kerb's outer foot and the lower plinth are separate swept surfaces.
 * They must meet exactly, or a thin disconnected wall appears while walking. */
describe("Shark Tunnel lower wall seams", () => {
  it("joins the lower walls to both kerbs throughout the curved walkway", () => {
    const { rock, sand, struct } = habitatStaticGeometry();
    try {
      const xyz = struct.getAttribute("position");
      const samples = WALKWAY_SAMPLES;
      const count = samples.length;
      // Distinct sections of the path, including the main curve and return leg.
      const check = samples.map((s, i) => ({ s, i }))
        // The two tunnel mouths intentionally have no joining side faces.
        // Check only samples with a complete underwater section on both sides.
        .filter(({ s, i }) => !s.inside && !samples[(i - 1 + count) % count].inside && !samples[(i + 1) % count].inside && i > 2 && i < count - 3)
        .filter((_, i) => i % 19 === 0);
      expect(check.length).toBeGreaterThan(3);
      for (const { s, i } of check) {
        const a = samples[(i - 1 + count) % count], b = samples[(i + 1) % count];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        for (const side of [-1, 1]) {
          const l = (s.halfWidth - 0.05) * side;
          const px = s.x + nx * l, pz = s.z + nz * l;
          let hits = 0;
          for (let v = 0; v < xyz.count; v++) {
            if (Math.abs(xyz.getX(v) - px) < 0.001 &&
                Math.abs(xyz.getY(v) + 0.05) < 0.001 &&
                Math.abs(xyz.getZ(v) - pz) < 0.001) hits++;
          }
          // Both independently generated surfaces share this coordinate;
          // a kerb alone has fewer coincident vertices at its outer foot.
          expect(hits, `seam at sample ${i}, side ${side}`).toBeGreaterThanOrEqual(5);
        }
      }
    } finally {
      struct.dispose();
      rock.dispose();
      sand.dispose();
    }
  });
});

/** Nearest loop sample to a point, with its +lateral direction. */
function frameNear(x: number, z: number) {
  const S = WALKWAY_SAMPLES, N = S.length;
  let best = 0, bd = Infinity;
  for (let k = 0; k < N; k++) { const d = (S[k].x - x) ** 2 + (S[k].z - z) ** 2; if (d < bd) { bd = d; best = k; } }
  const a = S[(best - 1 + N) % N], b = S[(best + 1) % N], s = S[best];
  const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = -(b.z - a.z) / tl, nz = (b.x - a.x) / tl;
  return { s, lat: (x - s.x) * nx + (z - s.z) * nz, nx, nz };
}

/**
 * The tube's structure uses a single-sided material. Every face must point out of
 * the solid: when they were wound inside-out, the walkway floor and the kerbs were
 * invisible from inside and the player saw the sand below and the back of the outer
 * wall, a lower wall that looked detached from the floor while walking.
 */
describe("Shark Tunnel walkway faces", () => {
  it("floor and kerb tops face up, kerb faces face the walkway, outer walls face out (both sides)", () => {
    const { rock, sand, struct } = habitatStaticGeometry();
    const p = struct.getAttribute("position");
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    const seen: Record<string, number> = {};
    try {
      for (let i = 0; i < p.count; i += 3) {
        A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1); Cc.fromBufferAttribute(p, i + 2);
        n.subVectors(Cc, B).cross(e.subVectors(A, B)).normalize();
        const cx = (A.x + B.x + Cc.x) / 3, cy = (A.y + B.y + Cc.y) / 3, cz = (A.z + B.z + Cc.z) / 3;
        const { s, lat, nx, nz } = frameNear(cx, cz);
        if (s.inside) continue;
        const hw = s.halfWidth, away = (n.x * nx + n.z * nz) * Math.sign(lat), side = lat > 0 ? "+" : "-";
        const check = (name: string, ok: boolean) => {
          seen[name] = (seen[name] ?? 0) + 1;
          expect(ok, `${name} at (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)})`).toBe(true);
        };
        if (Math.abs(cy) < 0.01 && Math.abs(lat) < hw - 0.43) check("floor", n.y > 0.99);
        else if (Math.abs(Math.abs(lat) - (hw - 0.42)) < 0.02 && cy > 0.01 && cy < 0.49) check(`kerb inner ${side}`, away < -0.9);
        else if (Math.abs(cy - 0.5) < 0.01 && Math.abs(lat) > hw - 0.42 && Math.abs(lat) < hw - 0.05) check(`kerb top ${side}`, n.y > 0.99);
        else if (Math.abs(Math.abs(lat) - (hw - 0.05)) < 0.02 && cy < 0.49) check(`outer wall ${side}`, away > 0.9);
      }
      for (const name of ["floor", "kerb inner +", "kerb inner -", "kerb top +", "kerb top -", "outer wall +", "outer wall -"]) expect(seen[name] ?? 0, name).toBeGreaterThan(100);
    } finally {
      struct.dispose(); rock.dispose(); sand.dispose();
    }
  });

  it("never bends tighter than the tube is wide (the dome's inner side cannot fold)", () => {
    const S = WALKWAY_SAMPLES, N = S.length;
    for (let i = 0; i < N; i++) {
      if (S[i].inside) continue;
      const a = S[(i - 2 + N) % N], b = S[i], c = S[(i + 2) % N];
      const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
      const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
      const r = area2 > 1e-9 ? (ab * bc * ca) / (2 * area2) : Infinity;
      expect(r, `curve radius at sample ${i}`).toBeGreaterThan(b.halfWidth + 0.6);
    }
  });

  it("stands the glass on the kerb top (no flat glass at kerb height) and starts it inside the lobby wall", () => {
    const g = tunnelGlassGeometry();
    const p = g.getAttribute("position"), idx = g.getIndex()!;
    try {
      let lowest = Infinity, atMouth = 0;
      for (let v = 0; v < p.count; v++) {
        lowest = Math.min(lowest, p.getY(v));
        // A ring in the wall plane (the walls are 0.3 m thick; the ring must sit within it).
        if (Math.abs(p.getZ(v) - HABITAT.max.z) < 0.1) atMouth++;
        if (Math.abs(p.getY(v) - 0.5) < 1e-4) {
          // Its foot is on the kerb top, inside the kerb's outer edge.
          const { s, lat } = frameNear(p.getX(v), p.getZ(v));
          expect(Math.abs(lat)).toBeLessThan(s.halfWidth - 0.05 + 0.02);
          expect(Math.abs(lat)).toBeGreaterThan(s.halfWidth - 0.42);
        }
      }
      expect(lowest).toBeGreaterThan(0.499);
      // Both mouths: a full glass ring exactly in the lobby wall.
      expect(atMouth).toBeGreaterThanOrEqual(2 * 17);
      for (let t = 0; t < idx.count; t += 3) {
        const ys = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)].map((k) => p.getY(k));
        expect(ys.every((y) => Math.abs(y - 0.5) < 1e-3), "a glass triangle lying flat on the kerb").toBe(false);
      }
    } finally {
      g.dispose();
    }
  });
});
