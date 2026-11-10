import { BELUGAS, ORCAS, type Sticker } from "../logic/sanctuary";
import { Pod, type MemberDef, type PodEvent, type PodOptions } from "../marine/pod";
import { BY_BOAT, BY_ISLAND, COVE_DOMAIN, COVE_ICE, LITTER_SPOTS, SANCTUARY_DOMAIN, STATION_PASS } from "../data/sanctuary";

/**
 * The sanctuary's live state (runtime only, never saved): the orca pod in the
 * bay, the belugas in their cove (a separate pod and water: never mixed), the
 * "Look!" moment, the cleanup's floating litter and the curious passes by the
 * observation station. Stepped only while the sanctuary is shown.
 */

const ORCA_SIZE: Record<(typeof ORCAS)[number]["variant"], number> = { male: 1.15, female: 0.9, female2: 0.87, calf: 0.42 };
export const ORCA_POD: MemberDef[] = ORCAS.map((o) => ({ id: o.id, species: "orca" as const, size: ORCA_SIZE[o.variant], mother: o.mother }));
// Orcas travel as a family led by the eldest female, patrolling past the station's windows, the island and the boat.
export const ORCA_POD_OPTIONS: PodOptions = {
  groupChance: 0.6, pairChance: 0.6, planEvery: [35, 60], leader: "yuki",
  hotspots: [{ x: 54, z: 6, r: 10, w: 0.3 }, { x: BY_ISLAND.x, z: BY_ISLAND.z, r: 10, w: 0.15 }, { x: BY_BOAT.x, z: BY_BOAT.z, r: 10, w: 0.15 }]
};
export const BELUGA_POD: MemberDef[] = BELUGAS.map((b, i) => ({ id: b.id, species: "beluga" as const, size: [1, 0.92, 0.8][i], mother: null }));
export const BELUGA_POD_OPTIONS: PodOptions = { groupChance: 0.35, pairChance: 0.7, planEvery: [25, 40], leader: "shiro" };

export type LitterKind = (typeof LITTER_SPOTS)[number]["kind"];
export interface SanctLook { kind: Sticker; ids: string[]; x: number; y: number; z: number; until: number; cove: boolean }

export const sanctRt = {
  orcas: null as Pod | null,
  belugas: null as Pod | null,
  time: 0,
  look: null as SanctLook | null,
  lookReadyAt: 6,
  /** Effects for the scene (blows, splashes): drained each frame. */
  fx: [] as (PodEvent & { cove: boolean })[],
  /** The cleanup in progress: which pieces still float. */
  litter: [] as { i: number; kind: LitterKind; x: number; z: number; picked: number }[],
  cleanupOn: false,
  /** The station view is open: curious orcas come past its windows. */
  watchStation: false,
  lastSpyhop: -100
};

export function orcaPod(seed = 11): Pod {
  if (!sanctRt.orcas) sanctRt.orcas = new Pod(SANCTUARY_DOMAIN, ORCA_POD, seed, ORCA_POD_OPTIONS);
  return sanctRt.orcas;
}
export function belugaPod(seed = 23): Pod {
  if (!sanctRt.belugas) sanctRt.belugas = new Pod(COVE_DOMAIN, BELUGA_POD, seed, BELUGA_POD_OPTIONS);
  return sanctRt.belugas;
}

/** Litter floats in for a cleanup (the five pieces, a little apart). */
export function startLitter() {
  sanctRt.cleanupOn = true;
  sanctRt.litter = LITTER_SPOTS.map((s, i) => ({ i, kind: s.kind, x: s.x, z: s.z, picked: -1 }));
}
export function pickLitterAt(i: number): boolean {
  const piece = sanctRt.litter.find((l) => l.i === i && l.picked < 0);
  if (!piece) return false;
  piece.picked = sanctRt.time;
  if (sanctRt.litter.every((l) => l.picked >= 0)) sanctRt.cleanupOn = false;
  return true;
}

let pass: { id: string; pts: { x: number; y: number; z: number }[] } | null = null;
let nextPass = 0;

/** How far the orca on its way to the station's windows still is (null: none coming). */
export function passDistance(): number | null {
  if (!pass || !sanctRt.orcas) return null;
  const m = sanctRt.orcas.byId(pass.id);
  return m ? Math.hypot(m.x - pass.pts[0].x, m.z - pass.pts[0].z) : null;
}
/** While the station view is open, one orca at a time cruises past its windows (there and back). */
function stationPasses() {
  const pod = sanctRt.orcas!;
  if (pass) {
    const m = pod.byId(pass.id);
    if (!m || !m.attract) { pass = null; return; }
    const p = pass.pts[0];
    if (Math.hypot(m.x - p.x, m.z - p.z) < 5) {
      pass.pts.shift();
      if (!pass.pts.length) { m.attract = null; pass = null; return; }
      pod.attract(m.id, pass.pts[0], 20, "point");
    }
    return;
  }
  if (!sanctRt.watchStation || sanctRt.time < nextPass) return;
  nextPass = sanctRt.time + 3;
  // The matriarch leads the family past the windows (the others follow her); else the nearest free orca.
  const can = pod.members.filter((m) => !m.attract && !m.mother && m.mode !== "spyhop");
  if (!can.length) return;
  const dist = (m: (typeof can)[number]) => Math.hypot(m.x - STATION_PASS[0].x, m.z - STATION_PASS[0].z);
  const nearest = [...can].sort((a, b) => dist(a) - dist(b))[0];
  const yuki = can.find((x) => x.id === "yuki");
  const m = yuki && dist(yuki) < dist(nearest) + 40 ? yuki : nearest;
  // Start at the nearer end of the line.
  const near0 = Math.hypot(m.x - STATION_PASS[0].x, m.z - STATION_PASS[0].z) < Math.hypot(m.x - STATION_PASS[1].x, m.z - STATION_PASS[1].z);
  pass = { id: m.id, pts: near0 ? [STATION_PASS[0], STATION_PASS[1], STATION_PASS[2]] : [STATION_PASS[1], STATION_PASS[0], STATION_PASS[2]] };
  pod.attract(m.id, pass.pts[0], 60, "point");
}

/** Advance both pods (the cove only once the belugas live there). */
export function stepSanctRt(dt: number, belugas: boolean): { orca: PodEvent[]; beluga: PodEvent[] } {
  sanctRt.time += dt;
  const o = orcaPod();
  o.step(dt);
  stationPasses();
  const orca = o.drain();
  let beluga: PodEvent[] = [];
  if (belugas) {
    const b = belugaPod();
    // Belugas nose the floating ice now and then.
    if (Math.random() < dt * 0.08) {
      const m = b.members[Math.floor(Math.random() * b.members.length)];
      const ice = COVE_ICE[Math.floor(Math.random() * COVE_ICE.length)];
      if (!m.attract) b.attract(m.id, { x: ice.x, y: -0.5, z: ice.z }, 8, "point");
    }
    b.step(dt);
    beluga = b.drain();
  }
  for (const e of orca) {
    if (e.kind === "spyhop") sanctRt.lastSpyhop = sanctRt.time;
    if (e.kind === "breathe" || e.kind === "splash" || e.kind === "dive") sanctRt.fx.push({ ...e, cove: false });
  }
  for (const e of beluga) if (e.kind === "breathe" || e.kind === "splash") sanctRt.fx.push({ ...e, cove: true });
  if (sanctRt.fx.length > 24) sanctRt.fx.splice(0, sanctRt.fx.length - 24);
  if (sanctRt.look && sanctRt.time > sanctRt.look.until) sanctRt.look = null;
  return { orca, beluga };
}

export function clearSanctRt() {
  sanctRt.orcas = null;
  sanctRt.belugas = null;
  sanctRt.time = 0;
  sanctRt.look = null;
  sanctRt.lookReadyAt = 6;
  sanctRt.fx = [];
  sanctRt.litter = [];
  sanctRt.cleanupOn = false;
  sanctRt.watchStation = false;
  sanctRt.lastSpyhop = -100;
  pass = null;
  nextPass = 0;
}
