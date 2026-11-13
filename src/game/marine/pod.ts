import { makeRng } from "../logic/rng";
import { randomPoint, type Pt, type WaterDomain } from "./domain";

/**
 * A lightweight social swimming simulation for the outdoor areas' cetaceans
 * (bottlenose dolphins, orcas, belugas). Pure and deterministic for a seed:
 * no rendering, no store. Each animal steers toward a target (a waypoint, a
 * formation slot beside a companion, a toy, the feeding platform) and looks
 * ahead so it never swims into the shore, an obstacle or the floor. On top of
 * that sit the behaviours the player watches: breathing at the surface,
 * shallow and deep (fluke-up) dives, a rare leap, a spy-hop, resting,
 * a calf swimming in echelon beside its mother, pairs and whole-group swims,
 * and surfacing together. What happens is reported as events.
 *
 * Coordinates: area-local metres; the water surface is y = 0. Heading `yaw`
 * faces (sin yaw, cos yaw) in x/z (three.js rotation.y); `pitch` > 0 is nose up.
 */

export type Cetacean = "dolphin" | "orca" | "beluga";

export interface SpeciesParams {
  /** Adult length (m); each animal scales by its size. */
  length: number;
  cruise: number;
  fast: number;
  slow: number;
  turnRate: number;
  accel: number;
  /** Vertical speed limit (m/s). */
  vMax: number;
  /** Seconds between breaths. */
  breath: readonly [number, number];
  /** Preferred cruising depth range (m below the surface). */
  depth: readonly [number, number];
  /** Chances, per surfacing, of ending in a deep dive, being a leap, being a spy-hop; per plan, of resting. */
  deepDive: number;
  leap: number;
  spyhop: number;
  rest: number;
  /** Body centre keeps this far inside the shore, and above the floor. */
  margin: number;
  clearance: number;
  /** "Swimming together" distance. */
  pairDist: number;
  /** Waypoints are this far ahead. */
  roam: readonly [number, number];
}

export const SPECIES_PARAMS: Record<Cetacean, SpeciesParams> = {
  dolphin: { length: 2.6, cruise: 2.1, fast: 4.8, slow: 0.6, turnRate: 1.05, accel: 1.4, vMax: 1.0, breath: [15, 28], depth: [1.1, 2.8], deepDive: 0.4, leap: 0.18, spyhop: 0, rest: 0.12, margin: 2.3, clearance: 0.75, pairDist: 3.2, roam: [9, 24] },
  orca: { length: 7.0, cruise: 2.5, fast: 4.4, slow: 0.8, turnRate: 0.4, accel: 0.7, vMax: 0.95, breath: [20, 36], depth: [2.8, 6], deepDive: 0.4, leap: 0, spyhop: 0.08, rest: 0.08, margin: 7, clearance: 1.6, pairDist: 8.5, roam: [30, 90] },
  beluga: { length: 4.2, cruise: 1.15, fast: 2.4, slow: 0.4, turnRate: 0.7, accel: 0.7, vMax: 0.7, breath: [16, 30], depth: [1.2, 3.4], deepDive: 0.25, leap: 0, spyhop: 0.14, rest: 0.15, margin: 3.2, clearance: 1.0, pairDist: 4.8, roam: [8, 22] }
};

export type SwimMode = "swim" | "rise" | "surface" | "dive" | "deep" | "leap" | "spyhop" | "rest" | "charge";

/**
 * Lagoon dolphin tricks (only with PodOptions.tricks): a run-up under water
 * ("charge": down a little, then fast and up through the surface) and one
 * airborne figure. A calf only does a small hop beside its mother.
 */
export type TrickKind = "high" | "arc" | "frontflip" | "backflip" | "spin" | "hop";
export const TRICK_KINDS: TrickKind[] = ["high", "arc", "frontflip", "backflip", "spin"];
/** Take-off: vertical and horizontal speed (m/s), whole somersaults (- forward, + backward) and whole twists. */
export const TRICK_LAUNCH: Record<TrickKind, { vy: number; hv: number; flip: number; spin: number }> = {
  high: { vy: 7.0, hv: 1.5, flip: 0, spin: 0 },
  arc: { vy: 5.1, hv: 5.0, flip: 0, spin: 0 },
  frontflip: { vy: 6.3, hv: 3.0, flip: -1, spin: 0 },
  backflip: { vy: 6.5, hv: 2.6, flip: 1, spin: 0 },
  spin: { vy: 6.1, hv: 2.8, flip: 0, spin: 2 },
  hop: { vy: 3.2, hv: 3.0, flip: 0, spin: 0 }
};
/** Seconds in the air from a take-off at y ≈ -0.2 to the re-entry at y = -0.25. */
export const trickAirtime = (k: TrickKind) => (2 * TRICK_LAUNCH[k].vy) / 9.8 + 0.01;
export type AttractKind = "feed" | "toy" | "bubbles" | "point";

export interface MemberDef {
  id: string;
  species: Cetacean;
  /** Body scale (1 = an adult of SPECIES_PARAMS length). */
  size: number;
  /** A calf swims beside this animal. */
  mother?: string | null;
}

export interface Swimmer {
  id: string;
  species: Cetacean;
  size: number;
  len: number;
  p: SpeciesParams;
  mother: string | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  vy: number;
  /** Fluke beat phase and amplitude (0 glide .. ~1.2 sprint), smoothed yaw rate and vertical bend (rendering). */
  phase: number;
  amp: number;
  turn: number;
  arch: number;
  mode: SwimMode;
  modeT: number;
  modeLen: number;
  breathAt: number;
  depthPref: number;
  target: Pt;
  follow: { id: string; side: number; back: number; down: number } | null;
  attract: { x: number; y: number; z: number; until: number; kind: AttractKind; facing?: number } | null;
  /** Hold still (a question is about this animal) until this time, at this depth. */
  hold: number;
  holdY: number | null;
  air: { vx: number; vz: number; above?: boolean; entered?: boolean } | null;
  /** A trick under way (run-up or airborne), with the take-off time once launched. */
  trick: { kind: TrickKind; t0: number; airtime: number } | null;
  diveEmitted: boolean;
  deepY: number;
  /** Shore margin for this body (a calf keeps closer than an adult: it can follow its mother anywhere she goes). */
  margin: number;
}

export interface PodEvent {
  kind: "breathe" | "dive" | "leap" | "splash" | "pair" | "family" | "spyhop" | "touch" | "ring";
  ids: string[];
  x: number;
  y: number;
  z: number;
  /** Body length of the (first) animal, to scale effects. */
  len: number;
  /** Dolphin water entry only: impact speed relative to 5 m/s, and sub-frame effect age. */
  strength?: number;
  age?: number;
  entry?: boolean;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const between = (r: () => number, range: readonly [number, number]) => range[0] + r() * (range[1] - range[0]);

/** Height of the body centre when the back just breaks the surface. */
export const surfaceY = (s: Swimmer) => -s.len * 0.045;
/** Body half-height (rendering scale). */
export const bodyR = (s: Swimmer) => s.len * (s.species === "orca" ? 0.12 : s.species === "beluga" ? 0.13 : 0.1);

export interface PodOptions {
  /** Chance per plan that the whole group swims together behind one leader. */
  groupChance: number;
  /** Chance an adult without a partner picks one. */
  pairChance: number;
  /** Seconds between social plans. */
  planEvery: readonly [number, number];
  /** The usual leader (else the first adult). */
  leader?: string;
  /** Favourite places on the patrol (a window, an island): a share of new waypoints go near one. */
  hotspots?: { x: number; z: number; r: number; w: number }[];
  /** Lagoon dolphins only: tricks on request (Pod.trick). */
  tricks?: boolean;
  /** Extra air-space rule for tricks (a footbridge, a gate): may a body fly over this point? */
  airClear?: (x: number, z: number) => boolean;
}

export class Pod {
  time = 0;
  readonly members: Swimmer[] = [];
  readonly events: PodEvent[] = [];
  private readonly rand: () => number;
  private planAt = 0;
  private pairT = new Map<string, number>();
  private pairLast = new Map<string, number>();

  constructor(readonly domain: WaterDomain, defs: MemberDef[], seed: number, readonly opts: PodOptions) {
    this.rand = makeRng(seed);
    const r = this.rand;
    defs.forEach((d, i) => {
      const p = SPECIES_PARAMS[d.species];
      const len = p.length * d.size;
      const spot = randomPoint(domain, r, p.margin + 1, p.depth[1] + 1) ?? domain.centre;
      const s: Swimmer = {
        id: d.id, species: d.species, size: d.size, len, p, mother: d.mother ?? null,
        x: spot.x, y: -between(r, p.depth), z: spot.z, yaw: r() * TAU, pitch: 0, roll: 0,
        speed: p.cruise * 0.6, vy: 0, phase: r() * TAU, amp: 0.4, turn: 0, arch: 0,
        mode: "swim", modeT: 0, modeLen: 0, breathAt: 3 + i * 4 + r() * 6, depthPref: between(r, p.depth),
        target: spot, follow: null, attract: null, hold: 0, holdY: null, air: null, trick: null, diveEmitted: false, deepY: -2,
        margin: p.margin * Math.min(1.15, Math.max(0.5, d.size))
      };
      this.members.push(s);
    });
    // Calves start beside their mothers.
    for (const s of this.members) {
      const m = this.byId(s.mother);
      if (m) { s.x = m.x + 0.8; s.z = m.z; s.y = m.y; s.yaw = m.yaw; }
    }
    this.plan();
  }

  byId(id: string | null | undefined): Swimmer | undefined {
    return id ? this.members.find((m) => m.id === id) : undefined;
  }

  /** Who swims with whom for the next while: calves with mothers, then a group swim, pairs or free swimming. */
  plan() {
    const r = this.rand;
    this.planAt = this.time + between(r, this.opts.planEvery);
    const adults = this.members.filter((m) => !m.mother);
    for (const s of this.members) {
      s.follow = null;
      s.depthPref = between(r, s.p.depth);
      if (!s.mother && r() < s.p.rest * 0.5 && s.mode === "swim") this.setMode(s, "rest", 9 + r() * 8);
    }
    const leader = this.byId(this.opts.leader) ?? adults[0];
    if (leader && r() < this.opts.groupChance) {
      // A group swim: everyone in loose slots behind and beside the leader.
      let k = 0;
      for (const s of adults) {
        if (s === leader) continue;
        const side = (k % 2 === 0 ? 1 : -1) * (s.p.pairDist * (0.55 + 0.2 * Math.floor(k / 2)));
        s.follow = { id: leader.id, side, back: s.len * (0.35 + 0.45 * Math.floor(k / 2)), down: (r() - 0.5) * 0.6 };
        k++;
      }
    } else {
      const free = [...adults].sort(() => r() - 0.5);
      while (free.length >= 2) {
        const a = free.pop()!, b = free.pop()!;
        if (r() < this.opts.pairChance) b.follow = { id: a.id, side: (r() < 0.5 ? 1 : -1) * a.p.pairDist * 0.55, back: a.len * (0.1 + r() * 0.35), down: (r() - 0.5) * 0.5 };
      }
    }
    // A calf swims in echelon: close beside its mother's flank, a little below and behind.
    for (const s of this.members) {
      const m = this.byId(s.mother);
      if (m) s.follow = { id: m.id, side: (bodyR(m) + bodyR(s)) * 1.25, back: m.len * 0.12, down: 0.15 };
    }
  }

  /** Swim to a point (feeding, a toy, a question); `y` is the depth to come to. */
  attract(id: string, pt: { x: number; y: number; z: number; facing?: number }, seconds: number, kind: AttractKind) {
    const s = this.byId(id);
    if (s) s.attract = { ...pt, until: this.time + seconds, kind };
  }

  /** Hold still and keep (or go to) this depth while a question is about it. */
  hold(id: string, seconds: number, y: number | null = null) {
    const s = this.byId(id);
    if (!s) return;
    s.hold = this.time + seconds;
    s.holdY = y;
  }

  release(id: string) {
    const s = this.byId(id);
    if (s) { s.hold = 0; s.holdY = null; }
  }

  /** How far it could run and fly straight along this heading (open, deep water with room overhead). */
  private runRoom(s: Swimmer, yaw: number, max: number): number {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), d = this.domain, air = this.opts.airClear;
    for (let k = 1; k <= max; k += 0.5) {
      const x = s.x + fx * k, z = s.z + fz * k;
      if (d.inside(x, z) < s.margin * 0.75 || d.floor(x, z) > -2.4 || (air && !air(x, z))) return k - 0.5;
    }
    return max;
  }

  /** Is the whole airborne arc (body length included) over open water from here, along the current heading? */
  arcClear(s: Swimmer, kind: TrickKind): boolean {
    const L = TRICK_LAUNCH[kind], span = L.hv * trickAirtime(kind) + s.len * 0.7;
    // The flukes at take-off are behind the body centre: that air space must be clear too.
    const air = this.opts.airClear, d = this.domain, bx = Math.sin(s.yaw), bz = Math.cos(s.yaw);
    for (let k = 0; k <= s.len * 0.6; k += 0.3) {
      const x = s.x - bx * k, z = s.z - bz * k;
      if (d.inside(x, z) < 0.5 || (air && !air(x, z))) return false;
    }
    return this.runRoom(s, s.yaw, span + 1.5) >= span + 1.5;
  }

  /**
   * Start a trick (lagoon dolphins only): the run-up heads along the most open
   * lane nearby; the figure is flown only if the arc is still clear at the surface.
   * Returns false (nothing changes) when it cannot start now.
   */
  trick(id: string, kind: TrickKind): boolean {
    const s = this.byId(id);
    if (!s || !this.opts.tricks || s.species !== "dolphin" || s.mode !== "swim" || s.attract || this.time < s.hold) return false;
    if ((kind === "hop") !== Boolean(s.mother)) return false;
    let best = -1, bestYaw = s.yaw;
    for (let k = 0; k < 16; k++) {
      const yaw = wrap(s.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8));
      const room = this.runRoom(s, yaw, 24) - Math.abs(wrap(yaw - s.yaw)) * 2;
      if (room > best) { best = room; bestYaw = yaw; }
    }
    const need = 9 + TRICK_LAUNCH[kind].hv * trickAirtime(kind) + s.len;
    if (!s.mother && best < need) return false;
    s.target = { x: s.x + Math.sin(bestYaw) * 20, z: s.z + Math.cos(bestYaw) * 20 };
    this.setMode(s, "charge");
    s.trick = { kind, t0: -1, airtime: trickAirtime(kind) };
    return true;
  }

  step(dt: number) {
    let left = Math.max(0, Math.min(dt, 0.25));
    while (left > 1e-6) {
      const h = Math.min(left, 0.05);
      this.tick(h);
      left -= h;
    }
  }

  private emit(kind: PodEvent["kind"], s: Swimmer, extra: Partial<PodEvent> = {}) {
    this.events.push({ kind, ids: [s.id], x: s.x, y: s.y, z: s.z, len: s.len, ...extra });
    if (this.events.length > 64) this.events.shift();
  }

  private setMode(s: Swimmer, mode: SwimMode, len = 0) {
    s.mode = mode;
    s.modeT = 0;
    s.modeLen = len;
    s.diveEmitted = false;
  }

  /** Can it swim this way for a little while (shore, obstacles and floor)? */
  private clear(s: Swimmer, yaw: number, dist: number, margin: number): boolean {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const k of [0.5, 1]) {
      const px = s.x + fx * dist * k, pz = s.z + fz * dist * k;
      if (this.domain.inside(px, pz) < margin) return false;
      // Deep enough to swim there at all (the depth clamp lifts it over a rising floor).
      if (this.domain.floor(px, pz) > -(s.p.depth[0] + 0.5)) return false;
    }
    return true;
  }

  private newTarget(s: Swimmer) {
    const r = this.rand, d = this.domain;
    // Now and then, a favourite place on the patrol.
    let pick = r();
    for (const h of this.opts.hotspots ?? []) {
      pick -= h.w;
      if (pick >= 0) continue;
      for (let i = 0; i < 8; i++) {
        const a = r() * Math.PI * 2, rr = r() * h.r, x = h.x + Math.cos(a) * rr, z = h.z + Math.sin(a) * rr;
        if (d.inside(x, z) >= s.margin + 1 && d.floor(x, z) <= -(s.p.depth[0] + 1.2)) { s.target = { x, z }; return; }
      }
      break;
    }
    let best: Pt | null = null, score = -Infinity;
    for (let i = 0; i < 18; i++) {
      const a = s.yaw + (r() - 0.5) * 2.6, dist = between(r, s.p.roam);
      const x = s.x + Math.sin(a) * dist, z = s.z + Math.cos(a) * dist;
      if (d.inside(x, z) < s.margin + 1 || d.floor(x, z) > -(s.p.depth[0] + 1.2)) continue;
      const sc = -Math.abs(wrap(a - s.yaw)) + r() * 0.8;
      if (sc > score) { score = sc; best = { x, z }; }
    }
    s.target = best ?? randomPoint(d, r, s.margin + 1, s.p.depth[0] + 1) ?? d.centre;
  }

  private tick(dt: number) {
    this.time += dt;
    // A step can contain several integration slices; preserve the actual entry
    // time when the scene receives the event at the end of the whole step.
    for (const e of this.events) if (e.entry) e.age = (e.age ?? 0) + dt;
    const now = this.time;
    if (now >= this.planAt) this.plan();
    for (const s of this.members) this.move(s, dt, now);
    this.together(dt, now);
  }

  private move(s: Swimmer, dt: number, now: number) {
    const p = s.p, r = this.rand, d = this.domain;
    s.modeT += dt;
    if (s.attract && now > s.attract.until) s.attract = null;
    const holding = now < s.hold;
    // Only authored dolphin feeding slots opt into arrival-and-face steering.
    // Ordinary attractions (including sanctuary animals) retain their patrol behaviour.
    const feeding = s.species === "dolphin" && s.attract?.kind === "feed" && s.attract.facing !== undefined;
    const feedDistance = feeding ? Math.hypot(s.attract!.x - s.x, s.attract!.z - s.z) : Infinity;
    if (feeding && s.mode !== "leap" && s.mode !== "swim") this.setMode(s, "swim");
    // A run-up gives way to feeding or a question (the figure itself, once airborne, always lands).
    if (s.mode === "charge" && (s.attract || holding)) this.setMode(s, "swim");
    if (s.mode !== "charge" && s.mode !== "leap") s.trick = null;
    const leader = this.byId(s.follow?.id);
    const surf = surfaceY(s);

    // --------------------------------------------------- where to, how fast
    let gx = s.target.x, gz = s.target.z, want = p.cruise, desiredYaw: number | null = null;
    if (s.mode === "leap" || s.mode === "spyhop") {
      want = s.speed;
    } else if (holding) {
      want = p.slow * 0.25;
    } else if (s.attract) {
      gx = s.attract.x; gz = s.attract.z;
      const dist = Math.hypot(gx - s.x, gz - s.z);
      // Far away: hurry over (a big animal crossing a whole bay); close: ease in.
      want = dist < 2 ? p.slow * 0.5 : dist > s.len * 4 ? p.fast * 0.85 : Math.min(p.cruise * 1.25, 0.7 + dist * 0.35);
      if (feeding) {
        want = dist < 0.85 ? 0 : Math.min(p.fast, Math.max(0.3, (dist - 0.65) * 1.6));
        if (dist < 1.15) desiredYaw = s.attract.facing!;
      }
      if ((s.attract.kind === "toy" || s.attract.kind === "bubbles") && dist < s.len * 0.6) {
        this.emit("touch", s);
        s.attract = null;
      }
    } else if (leader) {
      const f = s.follow!;
      const lfx = Math.sin(leader.yaw), lfz = Math.cos(leader.yaw);
      // A slow drift in the slot so pairs never look rigid (small for a calf tucked beside its mother).
      const sway = Math.sin(now * 0.21 + s.len) * Math.min(0.25, Math.abs(f.side) * 0.15);
      gx = leader.x + lfz * (f.side + sway) - lfx * f.back;
      gz = leader.z - lfx * (f.side + sway) - lfz * f.back;
      const ahead = (gx - s.x) * lfx + (gz - s.z) * lfz;
      const off = Math.hypot(gx - s.x, gz - s.z);
      want = clamp(leader.speed + ahead * 0.7, p.slow, p.fast);
      // Close to the slot: match the leader's heading (parallel swimming), else head for the slot.
      desiredYaw = off < s.len * 0.8 ? leader.yaw + clamp(Math.atan2(gx - s.x, gz - s.z) - leader.yaw, -0.4, 0.4) : null;
    } else if (Math.hypot(gx - s.x, gz - s.z) < Math.max(3, s.len)) {
      this.newTarget(s);
      gx = s.target.x; gz = s.target.z;
    }
    if (s.mode === "rest") want = p.slow * 0.45;
    if (s.mode === "rise" || s.mode === "surface") want = Math.min(want, p.cruise);
    // The run-up: settle a little deeper, then a sprint up to the surface.
    if (s.mode === "charge") want = s.modeT < 1.1 ? p.cruise * 1.1 : p.fast;

    // --------------------------------------------------- steering (look ahead, never into the shore)
    if (s.mode !== "leap") {
      let yawWant = desiredYaw ?? Math.atan2(gx - s.x, gz - s.z);
      const margin = s.attract ? s.margin * 0.6 : s.margin;
      const look = feeding ? s.len * 0.5 + Math.min(feedDistance, Math.max(s.speed, 0.3)) * 0.35 : s.len * 0.6 + Math.max(s.speed, 0.5) * 2.2 + 1;
      if (!this.clear(s, yawWant, look, margin)) {
        let found: number | null = null;
        for (let k = 1; k <= 9 && found === null; k++) {
          for (const sign of [1, -1]) {
            const a = yawWant + sign * k * 0.33 * (wrap(yawWant - s.yaw) >= 0 ? 1 : -1);
            if (this.clear(s, a, look, margin)) { found = a; break; }
          }
        }
        if (found === null) {
          yawWant = this.openWater(s.x, s.z);
          want = Math.min(want, p.slow);
        } else yawWant = found;
        if (!s.attract && !leader) this.newTarget(s);
      }
      const rate = p.turnRate * (s.mode === "spyhop" ? 0.3 : 1) * (holding ? 0.4 : 1) * (s.size < 0.8 ? 1.25 : 1);
      const dy = clamp(wrap(yawWant - s.yaw), -rate * dt, rate * dt);
      s.yaw = wrap(s.yaw + dy);
      s.turn += (dy / dt - s.turn) * Math.min(1, dt * 3);
    }
    const accel = p.accel * (feeding ? 2 : 1);
    s.speed += clamp(want - s.speed, -accel * dt, accel * dt);

    // --------------------------------------------------- the vertical life: breathing, diving, leaps
    const floor = d.floor(s.x, s.z);
    const lowest = floor + p.clearance + bodyR(s);
    let yWant = leader && !s.attract ? leader.y + (s.follow?.down ?? 0) : -s.depthPref;
    if (s.attract) yWant = s.attract.y;
    let pitchWant: number | null = null;
    switch (s.mode) {
      case "swim":
        if (now >= s.breathAt && !holding && !feeding) this.setMode(s, "rise");
        break;
      case "rest":
        yWant = surf;
        if (s.modeT > s.modeLen) { this.setMode(s, "swim"); s.breathAt = now + between(r, p.breath); }
        else if (now >= s.breathAt) { this.emit("breathe", s, this.blowhole(s)); s.breathAt = now + between(r, [7, 11]); }
        break;
      case "rise":
        yWant = surf;
        if (s.y > surf - 0.15) {
          // With an air-space rule (the lagoon), the whole flight must also be over open water and clear of structures.
          const room = this.clear(s, s.yaw, 7, s.margin) && floor < -2.4 && (!this.opts.airClear || this.arcClear(s, "arc"));
          if (p.leap > 0 && s.speed > p.cruise * 0.75 && room && r() < p.leap) this.launch(s);
          else if (p.spyhop > 0 && floor < -s.len * 0.6 && r() < p.spyhop) this.setMode(s, "spyhop", 2.4 + r() * 1.4);
          else {
            this.setMode(s, "surface", (s.species === "orca" ? 1.7 : 1.15) + r() * 0.7);
            this.emit("breathe", s, this.blowhole(s));
          }
          s.breathAt = now + between(r, p.breath);
          // Companions due to breathe come up together.
          for (const o of this.members) if (o !== s && o.follow?.id === s.id && o.mode === "swim" && o.breathAt - now < 14) o.breathAt = now + 0.4 + r() * 1.4;
        }
        break;
      case "surface": {
        yWant = surf;
        const k = s.modeT / Math.max(0.1, s.modeLen);
        // Rolling over the surface: nose up as it rises, then tipping down.
        pitchWant = 0.16 - 0.5 * k;
        if (k >= 1) {
          if (r() < p.deepDive && floor < -3.5) {
            this.setMode(s, "dive", 1.3);
            s.deepY = Math.max(lowest + 0.2, floor + p.clearance + bodyR(s) + 0.3);
          } else this.setMode(s, "swim");
        }
        break;
      }
      case "dive":
        // A fluke-up dive: steeply down at first, so the tail lifts clear of the water.
        pitchWant = -1.0;
        yWant = s.deepY;
        if (!s.diveEmitted && s.modeT > 0.35) { s.diveEmitted = true; this.emit("dive", s); }
        if (s.modeT > s.modeLen) this.setMode(s, "deep", 3 + r() * 4);
        break;
      case "deep":
        yWant = Math.max(s.deepY, lowest);
        if (s.modeT > s.modeLen) this.setMode(s, "swim");
        break;
      case "leap":
        break;
      case "charge": {
        const t = s.modeT;
        yWant = t < 1.1 ? Math.max(lowest, -2.2) : surf;
        pitchWant = t < 1.1 ? -0.2 : 0.5;
        if (t > 1.1 && s.y > surf - 0.25 && s.speed > p.cruise * 1.2) {
          const kind = s.trick?.kind ?? "arc";
          if (this.arcClear(s, kind)) this.launchTrick(s, kind);
          else if (kind !== "high" && kind !== "hop" && this.arcClear(s, "high")) this.launchTrick(s, "high");
          else {
            // No room after all: just a breath at the surface.
            s.trick = null;
            this.setMode(s, "surface", 1.2);
            this.emit("breathe", s, this.blowhole(s));
          }
          s.breathAt = now + between(r, p.breath);
        } else if (t > 6) { s.trick = null; this.setMode(s, "swim"); }
        break;
      }
      case "spyhop": {
        const k = s.modeT / s.modeLen;
        const up = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1;
        pitchWant = 1.32 * up;
        yWant = -s.len * (0.42 - 0.2 * up);
        s.speed = Math.min(s.speed, 0.15);
        s.yaw = wrap(s.yaw + Math.sin(s.modeT * 1.4) * 0.25 * dt);
        if (!s.diveEmitted && k > 0.35) { s.diveEmitted = true; this.emit("spyhop", s); }
        if (k >= 1) { this.setMode(s, "swim"); this.emit("splash", s, { y: 0, len: s.len * 0.6 }); }
        break;
      }
    }
    if (holding && s.holdY !== null) yWant = s.holdY;
    if (feeding && feedDistance < 1.2) pitchWant = 0;

    if (s.mode === "leap") {
      // Ballistic through the air, nose following the arc.
      const air = s.air!;
      const px = s.x, py = s.y, pz = s.z, pitch = s.pitch, vy = s.vy;
      s.x += air.vx * dt;
      s.z += air.vz * dt;
      s.vy -= 9.8 * dt;
      s.y += s.vy * dt;
      const along = Math.atan2(s.vy, Math.hypot(air.vx, air.vz));
      s.pitch = along;
      if (s.trick) {
        // Somersaults and twists are whole turns, finished just before re-entry (nose first).
        const L = TRICK_LAUNCH[s.trick.kind];
        const k = clamp((now - s.trick.t0) / (s.trick.airtime * 0.9), 0, 1), e = k * k * (3 - 2 * k);
        s.pitch = along + L.flip * TAU * e;
        s.roll = L.spin * TAU * e;
      }
      if (s.species === "dolphin" && !air.entered) {
        // The mesh's snout is +L/2 along its pitched forward axis. Detect its
        // downward crossing, rather than waiting for the body centre to sink.
        const reach = s.len * 0.5;
        const before = py + Math.sin(pitch) * reach, after = s.y + Math.sin(s.pitch) * reach;
        if (before > 0 || after > 0) air.above = true;
        if (air.above && before >= 0 && after <= 0 && s.vy < 0) {
          const f = clamp(before / (before - after), 0, 1);
          const oldReach = Math.cos(pitch) * reach, newReach = Math.cos(s.pitch) * reach;
          const horizontal = oldReach + (newReach - oldReach) * f;
          this.emit("splash", s, {
            x: px + (s.x - px) * f + Math.sin(s.yaw) * horizontal,
            y: 0,
            z: pz + (s.z - pz) * f + Math.cos(s.yaw) * horizontal,
            strength: Math.abs(vy + (s.vy - vy) * f) / 5,
            age: dt * (1 - f), entry: true
          });
          air.entered = true;
        }
      }
      if (s.y < -0.25 && s.vy < 0) {
        const big = s.trick && s.trick.kind !== "hop" ? 1.35 : 1;
        if (s.species !== "dolphin") this.emit("splash", s, { y: 0, len: s.len * big });
        s.air = null;
        s.vy *= 0.25;
        s.pitch = wrap(s.pitch);
        s.roll = wrap(s.roll);
        s.trick = null;
        this.setMode(s, "swim");
      }
    } else {
      yWant = clamp(yWant, lowest, s.mode === "spyhop" ? 2 : surf);
      const vMax = s.mode === "dive" ? p.vMax * 1.8 : s.mode === "charge" ? p.vMax * 2.2 : p.vMax;
      const vyWant = clamp((yWant - s.y) * (s.mode === "charge" ? 3 : 1.1), -vMax, vMax);
      const vyAcc = s.mode === "charge" ? 4 : 2;
      s.vy += clamp(vyWant - s.vy, -vyAcc * dt, vyAcc * dt);
      s.y += s.vy * dt;
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      const nx = s.x + fx * s.speed * dt, nz = s.z + fz * s.speed * dt;
      // The last guard: the body stays off the shore, the snout out of it, and the water deep enough.
      // A step that improves things is always allowed, so an animal can never be pinned.
      const reach = s.len * 0.5;
      const inNow = d.inside(s.x, s.z), inNext = d.inside(nx, nz);
      const snNow = d.inside(s.x + fx * reach, s.z + fz * reach), snNext = d.inside(nx + fx * reach, nz + fz * reach);
      const flNow = d.floor(s.x, s.z), flNext = d.floor(nx, nz);
      const ok = (inNext >= s.margin * 0.45 || inNext > inNow) && (snNext >= 0.25 || snNext > snNow) && (flNext <= -(p.depth[0] * 0.7) || flNext < flNow);
      if (ok) { s.x = nx; s.z = nz; }
      else {
        const away = this.openWater(s.x, s.z);
        s.yaw = wrap(s.yaw + clamp(wrap(away - s.yaw), -6 * dt, 6 * dt));
        s.speed = Math.max(p.slow * 0.5, s.speed * 0.8);
      }
      const pw = pitchWant ?? clamp(Math.atan2(s.vy, Math.max(0.6, s.speed)), -0.55, 0.55);
      s.pitch += (pw - s.pitch) * Math.min(1, dt * (s.mode === "dive" || s.mode === "spyhop" ? 3 : 2));
      // Never into the floor, never (except leaps and spy-hops) above the surface roll.
      const lo = d.floor(s.x, s.z) + p.clearance * 0.6 + bodyR(s) * 0.5;
      if (s.y < lo) { s.y = lo; s.vy = Math.max(0, s.vy); }
      if (s.mode !== "spyhop" && s.y > surf + 0.02) { s.y = surf + 0.02; s.vy = Math.min(0, s.vy); }
    }

    // --------------------------------------------------- body motion for drawing
    if (!(s.mode === "leap" && s.trick)) s.roll += (clamp(-s.turn * 0.9, -0.55, 0.55) - s.roll) * Math.min(1, dt * 3);
    const archWant = s.mode === "dive" ? -0.7 : s.mode === "surface" ? 0.25 : s.mode === "leap" ? -s.vy * 0.06 : 0;
    s.arch += (archWant - s.arch) * Math.min(1, dt * 3);
    const effort = s.mode === "leap" ? 0 : s.mode === "spyhop" ? 0.25 : clamp(0.18 + (s.speed / p.cruise) * 0.55 + Math.abs(s.vy) * 0.25, 0.12, 1.25);
    s.amp += (effort - s.amp) * Math.min(1, dt * 2.5);
    const freq = s.mode === "leap" ? 0 : (0.35 + s.speed / (s.len * 0.75)) * (s.species === "orca" ? 0.8 : 1);
    s.phase = (s.phase + TAU * freq * dt) % (TAU * 1000);
  }

  /** The heading toward more room: away from the nearest shore or obstacle and toward deeper water. */
  private openWater(x: number, z: number): number {
    const d = this.domain, e = 0.6;
    const gx = d.inside(x + e, z) - d.inside(x - e, z) - 0.5 * (d.floor(x + e, z) - d.floor(x - e, z));
    const gz = d.inside(x, z + e) - d.inside(x, z - e) - 0.5 * (d.floor(x, z + e) - d.floor(x, z - e));
    return Math.hypot(gx, gz) < 1e-6 ? Math.atan2(d.centre.x - x, d.centre.z - z) : Math.atan2(gx, gz);
  }

  private blowhole(s: Swimmer): Partial<PodEvent> {
    return { x: s.x + Math.sin(s.yaw) * s.len * 0.32, y: 0.05, z: s.z + Math.cos(s.yaw) * s.len * 0.32 };
  }

  private launch(s: Swimmer) {
    const r = this.rand;
    this.setMode(s, "leap");
    const v = s.p.fast * (0.85 + r() * 0.2);
    s.speed = v;
    s.air = { vx: Math.sin(s.yaw) * v, vz: Math.cos(s.yaw) * v };
    s.vy = 4.3 + r() * 0.9;
    s.y = Math.max(s.y, -0.2);
    this.emit("leap", s);
    if (s.species !== "dolphin") this.emit("splash", s, { y: 0 });
  }

  /** Take off into a trick figure (the run-up has reached the surface at speed). */
  private launchTrick(s: Swimmer, kind: TrickKind) {
    const L = TRICK_LAUNCH[kind];
    this.setMode(s, "leap");
    s.speed = L.hv;
    s.air = { vx: Math.sin(s.yaw) * L.hv, vz: Math.cos(s.yaw) * L.hv };
    s.vy = L.vy;
    s.trick = { kind, t0: this.time, airtime: trickAirtime(kind) };
    this.emit("leap", s);
    if (s.species !== "dolphin") this.emit("splash", s, { y: 0 });
  }

  /** Two animals swimming side by side, heading the same way, for a few seconds. */
  private together(dt: number, now: number) {
    const ms = this.members;
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j];
        const key = `${a.id}|${b.id}`;
        const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        const swimming = (m: Swimmer) => m.mode !== "leap" && m.mode !== "spyhop" && m.mode !== "rest" && m.speed > m.p.slow * 1.3;
        const ok = dist < Math.max(a.p.pairDist, b.p.pairDist) && Math.cos(a.yaw - b.yaw) > 0.88 && swimming(a) && swimming(b);
        const t = ok ? (this.pairT.get(key) ?? 0) + dt : Math.max(0, (this.pairT.get(key) ?? 0) - dt * 2);
        this.pairT.set(key, t);
        if (t > 3 && now - (this.pairLast.get(key) ?? -1e9) > 25) {
          this.pairLast.set(key, now);
          this.pairT.set(key, 0);
          const ev = { ids: [a.id, b.id], x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, len: Math.max(a.len, b.len) };
          this.events.push({ kind: "pair", ...ev });
          if (a.mother === b.id || b.mother === a.id) this.events.push({ kind: "family", ...ev });
        }
      }
    }
  }

  /** Take the events since the last call. */
  drain(): PodEvent[] {
    return this.events.splice(0, this.events.length);
  }
}
