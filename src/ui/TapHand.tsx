import { useEffect, useRef } from "react";
import { getGame, updateModel, useGame } from "../game/store";
import { rt } from "../game/runtime";
import { handCue, type HandCue, type HandTarget } from "../game/logic/tapHand";
import { HALL_OF, SLOT_POS, STAND_H, TANKS } from "../game/data/tanks";
import { DOOR_Z, doorX } from "../game/data/rooms";
import { decorVersion } from "../game/data/decor";
import { sandSurfaceY } from "../game/logic/tankLayout";
import { waterCentre } from "../game/world";
import type { Vec3 } from "../game/types";
import { project } from "../scene/CameraRig";

/** A custom world point can move every frame, just like the built-in fish target. */
export type TapHandTarget = HandTarget & { point?: () => Vec3 | null };

function screenPoint(target: TapHandTarget) {
  if (target.kind === "dom") {
    const el = document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(target.id)}"]`);
    if (!el || el.hidden || getComputedStyle(el).visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.left + r.width * 0.5, y: r.top + Math.min(22, r.height * 0.4) } : null;
  }
  let p: Vec3 | null = target.point?.() ?? null;
  const g = getGame();
  if (!target.point) {
    const [kind, ...parts] = target.id.split("-");
    const id = parts.join("-");
    if (kind === "visitor") {
      const visitor = rt.visitors.find((v) => v.id === id && v.state !== "gone" && v.state !== "leave");
      if (visitor && g.view === "room" && g.hall === 0) p = { x: visitor.x, y: 1.1 - visitor.seat * 0.25, z: visitor.z };
    } else if (kind === "door") {
      const hall = Number(id);
      if (g.view === "room" && hall === g.hall + 1) p = { x: doorX(hall) - 0.1, y: 1.3, z: DOOR_Z };
    } else if (kind === "pad") {
      const pad = SLOT_POS[id as keyof typeof SLOT_POS];
      if (pad && g.view === "room" && !g.model.tanks.some((t) => t.slot === id)) p = { ...pad, y: 0.15 };
    } else if (kind === "tank") {
      const tank = g.model.tanks.find((t) => t.id === id);
      if (tank && HALL_OF[tank.slot] === g.hall && (g.view === "room" || g.tankId === id)) p = waterCentre(tank.slot, tank.type);
    } else if (kind === "fish") {
      const fish = rt.fish.get(id);
      const tank = fish && g.model.tanks.find((t) => t.id === fish.tankId && t.fish.some((f) => f.id === id));
      if (fish && tank && g.view === "tank" && tank.id === g.tankId) {
        const o = SLOT_POS[tank.slot];
        p = { x: o.x + fish.s.x, y: STAND_H + fish.s.y, z: o.z + fish.s.z };
      }
    } else if (kind === "ring" || kind === "decor") {
      const colon = id.lastIndexOf(":");
      const tank = g.model.tanks.find((t) => t.id === id.slice(0, colon));
      const slot = Number(id.slice(colon + 1));
      const s = tank && TANKS[tank.type].slots[slot];
      const decor = tank?.decor.find((d) => d.slot === slot);
      if (tank && s && g.view === "tank" && g.tankId === tank.id && (kind === "decor" ? decor : g.panel === "decorate" && !decor)) {
        const o = SLOT_POS[tank.slot];
        const h = decor ? decorVersion(decor.kind, decor.variant).height * TANKS[tank.type].h * 0.5 : 0.01;
        p = { x: o.x + s.x, y: sandSurfaceY(TANKS[tank.type], s.x, s.z) + h, z: o.z + s.z };
      }
    }
  }
  return p ? project(p.x, p.y, p.z) : null;
}

/** Keep the fingertip on its target while pointing from a clear side of it. */
function clearAngle(p: { x: number; y: number }): number | null {
  const protectedRects = Array.from(document.querySelectorAll<HTMLElement>("[data-testid=status], [data-testid=request], [data-testid=goals], .player-status, .top-right"), (node) => node.getBoundingClientRect());
  const sides = [
    { angle: 0, left: -17, right: 32, top: -4, bottom: 56 },
    { angle: 90, left: -56, right: 4, top: -17, bottom: 32 },
    { angle: 180, left: -32, right: 17, top: -56, bottom: 4 },
    { angle: 270, left: -4, right: 56, top: -32, bottom: 17 }
  ];
  return sides.find((s) => p.x + s.left >= 6 && p.x + s.right <= innerWidth - 6 && p.y + s.top >= 6 && p.y + s.bottom <= innerHeight - 6 && !protectedRects.some((r) => r.width > 0 && r.height > 0 && p.x + s.right > r.left && p.x + s.left < r.right && p.y + s.bottom > r.top && p.y + s.top < r.bottom))?.angle ?? null;
}

/** One pointer-transparent overlay. Mutable transforms keep animation out of React. */
export function TapHand({ target }: { target?: TapHandTarget } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const finger = el.querySelector<SVGElement>("svg")!;
    const ripple = el.querySelector<HTMLElement>(".tap-hand-ripple")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cue: (HandCue & TapHandTarget) | null = null;
    let started = 0;
    let persisted = false;
    let frame = 0;
    const finished = new Set<string>();
    const hide = () => {
      el.style.visibility = "hidden";
      el.dataset.handTarget = "";
      rt.hand.targetId = null;
    };
    const refresh = () => {
      const next = target ? { ...target, showing: `external:${target.id}:${getGame().view}` } : handCue(getGame(), cue?.first);
      if (next?.showing === cue?.showing) return;
      hide();
      cue = next && !finished.has(next.showing) ? next : null;
      started = 0;
      persisted = false;
    };
    const unsubscribe = useGame.subscribe(refresh);
    refresh();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (!cue) return;
      const p = screenPoint(cue);
      if (!p || p.x < 12 || p.x > innerWidth - 12 || p.y < 72 || p.y > innerHeight - 12 || rt.camera.shot) {
        hide();
        // A lost object ends this demonstration; it cannot reappear continuously.
        if (started) { finished.add(cue.showing); cue = null; }
        return;
      }
      if (!started) started = now;
      const age = (now - started) / 1000;
      if (age >= 4.8) { finished.add(cue.showing); cue = null; hide(); return; }
      const phase = age % 2.4;
      const glide = reduced.matches ? 0 : Math.max(0, 1 - phase / 0.6);
      const drawnPoint = { x: p.x + glide * 32, y: p.y + glide * 38 };
      const angle = clearAngle(drawnPoint);
      if (angle === null) { hide(); return; }
      rt.hand.targetId = cue.id;
      el.dataset.handTarget = cue.id;
      el.style.visibility = "visible";
      if (cue.first && !persisted) {
        persisted = true;
        const key = cue.first;
        updateModel((m) => (m.progress.handShown ?? []).includes(key) ? m : { ...m, progress: { ...m.progress, handShown: [...(m.progress.handShown ?? []), key] } });
      }
      const press = !reduced.matches && phase >= 1 && phase < 1.22;
      const wave = !reduced.matches && phase >= 1.1 && phase < 1.7 ? (phase - 1.1) / 0.6 : -1;
      const fade = reduced.matches ? 1 : Math.min(1, phase / 0.18, (2.4 - phase) / 0.5);
      el.style.transform = `translate(${drawnPoint.x}px, ${drawnPoint.y}px)`;
      el.style.opacity = String(Math.max(0, fade));
      // Finger tip remains over the target; only its body compresses for the tap.
      finger.style.transform = `rotate(${angle}deg) scale(${press ? 0.86 : 1})`;
      ripple.style.opacity = wave < 0 ? "0" : String((1 - wave) * 0.7);
      ripple.style.transform = `translate(-50%, -50%) scale(${wave < 0 ? 0.5 : 0.5 + wave * 1.5})`;
    };
    frame = requestAnimationFrame(animate);
    return () => { unsubscribe(); cancelAnimationFrame(frame); hide(); };
  }, [target]);
  return <div ref={ref} className="tap-hand" data-testid="tap-hand" data-hand-target="" aria-hidden="true">
    <span className="tap-hand-ripple" />
    <svg viewBox="0 0 52 64" width="46" height="57" fill="none">
      <path d="M14 34V7C14 1 23 1 23 7V25L25 21C27 18 32 19 33 23C37 20 42 22 42 27C48 25 51 30 49 36L44 53C43 58 39 61 33 61H25C21 61 18 59 15 55L3 40C0 35 6 31 10 35L17 41" fill="#fff5df" stroke="#865400" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  </div>;
}
