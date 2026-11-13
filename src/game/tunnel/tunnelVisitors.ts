import { rt, effect } from "../runtime";
import { getGame, model, updateModel } from "../store";
import { award, tipBreakdown } from "../logic/model";
import { audio } from "../../audio/audio";
import {
  CHAMBER_S, EXPLORE_START_S, sectionAt, TUNNEL_SECTIONS, TUNNEL_VIEWING_SPOTS, walkHalfWidth, walkwayFrame, walkwayLength
} from "../data/sharkTunnel";
import type { VisitorType } from "../types";
import { tunnelRuntime } from "./contract";
import { SHARKS_HALL } from "../data/rooms";
import { loopDelta, playerWorld, tunnelBodies } from "./explore";

/**
 * People walking through the Shark Tunnel: a separate, lightweight crowd on the
 * walkway loop (lanes, viewing stops, looking up, pointing, photos, small
 * groups). They make room for the player and never block for long. Reactions
 * to sharks overhead are rare and rate-limited. Leaving visitors tip for the
 * habitat. Runtime only; nothing is saved.
 */

export type TunnelActivity = "look" | "point" | "photo";

export interface TunnelPerson {
  id: string;
  type: VisitorType;
  variant: number;
  s: number;
  lateral: number;
  lane: number;
  speed: number;
  cruise: number;
  state: "walk" | "stop";
  stopUntil: number;
  activity: TunnelActivity | null;
  /** Spot ids already visited (each stop once). */
  visited: string[];
  /** Pair members share a group id and keep together. */
  group: number;
  heading: number;
  phase: number;
  /** When the player has been in the way (for stepping aside). */
  blockedT: number;
  bornT: number;
  /** A short speech bubble (reactions, requests). */
  bubble: { en: string; ja: string; until: number } | null;
  /** Set by the English activities: this visitor has a question for the player. */
  request: string | null;
  /** Look target while stopped (world), for facing. */
  face: { x: number; z: number } | null;
}

export const tunnelPeople: TunnelPerson[] = [];
let nextId = 1, nextGroup = 1, spawnAt = 0, reactionAt = 0, tick = 0;

const ADULTS: VisitorType[] = ["adult", "fan", "grandma", "explorer"];
const VARIANTS: Record<VisitorType, number> = { child: 6, adult: 3, fan: 3, grandma: 2, explorer: 2, judge: 1 };

/** How many people walk the tunnel: more as the habitat matures (3..6). */
export function crowdTarget(): number {
  const t = model().tanks.find((x) => x.type === "sharks");
  if (!t) return 0;
  const animals = t.fish.length, structures = t.decor.length;
  return Math.max(3, Math.min(6, 2 + Math.floor(animals * 0.6 + structures * 0.4)));
}

function rand(): number {
  return Math.random();
}

function spawn(type: VisitorType, lane: number, group: number, s: number): TunnelPerson {
  const p: TunnelPerson = {
    id: `tv${nextId++}`, type, variant: Math.floor(rand() * VARIANTS[type]), s, lateral: lane, lane,
    speed: 0, cruise: type === "child" ? 0.85 + rand() * 0.25 : type === "grandma" ? 0.55 + rand() * 0.1 : 0.7 + rand() * 0.25,
    state: "walk", stopUntil: 0, activity: null, visited: [], group, heading: 0, phase: rand() * 6,
    blockedT: 0, bornT: rt.time, bubble: null, request: null, face: null
  };
  tunnelPeople.push(p);
  return p;
}

function spawnArrival() {
  const g = nextGroup++;
  if (rand() < 0.35) {
    // A grown-up with a child, side by side.
    const a = spawn(ADULTS[Math.floor(rand() * ADULTS.length)], -0.45, g, EXPLORE_START_S);
    const c = spawn("child", 0.45, g, EXPLORE_START_S - 0.3);
    c.cruise = a.cruise;
  } else {
    spawn(rand() < 0.45 ? "child" : ADULTS[Math.floor(rand() * ADULTS.length)], (rand() - 0.5) * 1.4, g, EXPLORE_START_S);
  }
}

/** Fill the tunnel with people at once (when it is first shown), spread along the loop. */
export function seedTunnelVisitors() {
  if (tunnelPeople.length) return;
  const n = crowdTarget();
  for (let i = 0; i < n; i++) {
    const s = TUNNEL_SECTIONS.entrance.from + 4 + (i / n) * (TUNNEL_SECTIONS.exit.from - TUNNEL_SECTIONS.entrance.from - 6);
    spawn(rand() < 0.45 ? "child" : ADULTS[Math.floor(rand() * ADULTS.length)], (rand() - 0.5) * 1.4, nextGroup++, s);
  }
}

export function clearTunnelVisitors() {
  tunnelPeople.length = 0;
  tunnelBodies.length = 0;
}

/** Leave at the exit: pay the habitat's tip (only while the wing is open). */
function leave(p: TunnelPerson) {
  const m = model();
  const habitat = m.tanks.find((t) => t.type === "sharks");
  if (habitat) {
    const parts = tipBreakdown(m, [habitat.id]);
    const tip = parts.reduce((n, x) => n + x.tip, 0);
    if (tip > 0) {
      const before = m.coins;
      updateModel((mm) => award(mm, tip, `tip:${p.id}`));
      if (model().coins > before && getGame().hall >= 0) {
        const f = walkwayFrame(p.s);
        effect("coins", f.x, 2.1, f.z, tip);
        if (rt.explore.active || getGame().hall === SHARKS_HALL) audio.play("coin");
      }
    }
  }
  const i = tunnelPeople.indexOf(p);
  if (i >= 0) tunnelPeople.splice(i, 1);
}

export function personWorld(p: TunnelPerson) {
  const f = walkwayFrame(p.s);
  return { x: f.x - f.dz * p.lateral, z: f.z + f.dx * p.lateral };
}

const REACTIONS = [
  { en: "Wow! A shark!", ja: "わあ！ サメだ！" },
  { en: "Look! It's above us!", ja: "みて！ うえに いるよ！" },
  { en: "It's so big!", ja: "とても おおきい！" }
];
const RAY_REACTIONS = [{ en: "Look! A ray!", ja: "みて！ エイだ！" }];

/** A shark gliding over someone: a short, rare reaction (one at a time, at most every 18 s). */
function maybeReact(p: TunnelPerson): boolean {
  if (rt.time < reactionAt || p.bubble || p.request) return false;
  const swim = tunnelRuntime.swim;
  if (!swim) return false;
  const w = personWorld(p), f = walkwayFrame(p.s);
  for (const a of swim.poses()) {
    if (a.y < f.height + 0.2 || Math.hypot(a.x - w.x, a.z - w.z) > 3.2) continue;
    const pool = a.species === "eagleray" ? RAY_REACTIONS : REACTIONS;
    p.bubble = { ...pool[Math.floor(rand() * pool.length)], until: rt.time + 3.2 };
    p.state = "stop";
    p.stopUntil = rt.time + 3;
    p.activity = rand() < 0.6 ? "point" : "look";
    p.face = { x: a.x, z: a.z };
    reactionAt = rt.time + 18 + rand() * 10;
    return true;
  }
  return false;
}

/** Test hook only: an empty tunnel with no arrivals (so no tips), for exact coin checks. */
export const tunnelCrowd = { paused: false };

/** One step of the tunnel crowd. */
export function stepTunnelVisitors(dt: number) {
  const g = getGame();
  if (g.screen !== "game" || !g.model.progress.tunnelOpen || tunnelCrowd.paused) {
    if (tunnelPeople.length) clearTunnelVisitors();
    return;
  }
  if (!tunnelPeople.length) seedTunnelVisitors();
  if (rt.time > spawnAt && tunnelPeople.length < crowdTarget()) {
    spawnArrival();
    spawnAt = rt.time + 7 + rand() * 7;
  }
  const player = rt.explore.active ? playerWorld() : null;
  tick += dt;
  for (const p of [...tunnelPeople]) {
    const f = walkwayFrame(p.s);
    // Stops at viewing spots (each once, most of the time), and the odd reaction.
    if (p.state === "walk" && !p.request) {
      for (const v of TUNNEL_VIEWING_SPOTS) {
        if (p.visited.includes(v.id)) continue;
        const d = loopDelta(p.s, v.s);
        if (d > 0 && d < 0.6) {
          p.visited.push(v.id);
          if (rand() < 0.7) {
            p.state = "stop";
            p.stopUntil = rt.time + 4 + rand() * 5;
            const r = rand();
            p.activity = v.side === 0 ? (r < 0.5 ? "look" : r < 0.8 ? "point" : "photo") : (r < 0.35 ? "look" : r < 0.7 ? "point" : "photo");
            p.face = v.side === 0 ? { x: f.x, z: f.z } : { x: f.x - f.dz * v.side * 6, z: f.z + f.dx * v.side * 6 };
            // Stand toward the window side, leaving the middle free.
            p.lane = v.side === 0 ? p.lane : v.side * (0.5 + rand() * 0.4);
          }
        }
      }
      if (sectionAt(p.s) !== "lobby" && maybeReact(p)) { /* reacting */ }
    }
    if (p.bubble && rt.time > p.bubble.until) p.bubble = null;
    if (p.state === "stop" && rt.time > p.stopUntil && !p.request) {
      p.state = "walk";
      p.activity = null;
      p.face = null;
      p.lane = Math.max(-0.9, Math.min(0.9, (rand() - 0.5) * 1.6));
    }
    // Speed: cruise, slow behind someone in the same lane, make way for the player.
    let want = p.state === "walk" ? p.cruise : 0;
    for (const o of tunnelPeople) {
      if (o === p || o.group === p.group) continue;
      const d = loopDelta(p.s, o.s);
      if (d > 0 && d < 1.2 && Math.abs(o.lateral - p.lateral) < 0.6) {
        want = Math.min(want, o.state === "stop" ? 0 : o.speed * 0.9);
        // Overtake a stopped person by switching lanes.
        if (o.state === "stop") p.lane = o.lateral > 0 ? -0.75 : 0.75;
      }
    }
    if (player) {
      const w = personWorld(p);
      const d = Math.hypot(player.x - w.x, player.z - w.z);
      if (d < 1.3) {
        // Step aside, away from the player's side.
        const side = (player.x - f.x) * -f.dz + (player.z - f.z) * f.dx;
        p.lane = side > 0 ? -1 : 1;
        p.blockedT += dt;
        // Someone standing in the way moves on after a moment.
        if (p.state === "stop" && p.blockedT > 2.5 && !p.request) { p.stopUntil = 0; }
      } else p.blockedT = Math.max(0, p.blockedT - dt);
      const ahead = (player.x - w.x) * f.dx + (player.z - w.z) * f.dz;
      if (d < 0.9 && ahead > 0) want = Math.min(want, 0.2);
    }
    p.speed += (want - p.speed) * Math.min(1, dt * 3);
    const lim = walkHalfWidth(p.s) - 0.15;
    p.lane = Math.max(-lim, Math.min(lim, p.lane));
    p.lateral += (p.lane - p.lateral) * Math.min(1, dt * 1.6);
    p.s = (p.s + p.speed * dt) % walkwayLength;
    p.phase += p.speed * dt * 3.2;
    // Heading: walking direction, or toward what they look at.
    const walkYaw = Math.atan2(f.dx, f.dz);
    const target = p.face && p.state === "stop" ? (() => { const w = personWorld(p); return Math.atan2(p.face.x - w.x, p.face.z - w.z); })() : walkYaw;
    p.heading += Math.atan2(Math.sin(target - p.heading), Math.cos(target - p.heading)) * Math.min(1, dt * 4);
    // Out through the exit and back in the lobby: leave.
    if (sectionAt(p.s) === "lobby" && rt.time - p.bornT > 5 && !p.request) leave(p);
  }
  // Bodies for the player's collision.
  tunnelBodies.length = 0;
  for (const p of tunnelPeople) {
    const w = personWorld(p);
    tunnelBodies.push({ x: w.x, z: w.z, r: p.type === "child" ? 0.22 : 0.27 });
  }
  void CHAMBER_S;
}
