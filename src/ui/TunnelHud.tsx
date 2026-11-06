import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getGame, setGame, updateModel, useGame } from "../game/store";
import { rt } from "../game/runtime";
import { SHARKS_HALL } from "../game/data/rooms";
import { TANKS } from "../game/data/tanks";
import { happiness, tankAt, usedSpace } from "../game/logic/model";
import { cleanTank, enterExplore, feedTank, leaveExplore, openAnimalShop, openDecorate, openDecorShop, setTunnelView } from "../game/flow/actions";
import { tunnelRuntime } from "../game/tunnel/contract";
import { countTags, findTargetId, startFinalTour, tapForFind, tapTunnelVisitor } from "../game/tunnel/activities";
import { personWorld, tunnelPeople } from "../game/tunnel/tunnelVisitors";
import { TUNNEL_VIEWING_SPOTS, type TunnelView } from "../game/data/sharkTunnel";
import { cameraRef } from "../scene/CameraRig";
import { Big } from "./Hud";
import { Icon } from "./icons";
import { PersonFace, PicoFace } from "./Portraits";
import { Ja } from "./Talk";
import "./TunnelHud.css";

/** The milestone names and rewards (English + Japanese). */
export const TUNNEL_MILESTONES = [
  { en: "Grand Opening", ja: "グランド オープン", todo: { en: "Open the Shark Tunnel", ja: "サメの トンネルを ひらこう" }, reward: { en: "A blacktip shark", ja: "ブラックチップ・シャーク" } },
  { en: "First Tunnel Tour", ja: "はじめての ツアー", todo: { en: "Walk the tunnel and answer 3 questions", ja: "トンネルを あるいて 3つ こたえよう" }, reward: { en: "A big rock arch", ja: "おおきな いわの アーチ" } },
  { en: "Help Visitors", ja: "おきゃくさんを たすけよう", todo: { en: "Help 3 visitors in the tunnel", ja: "トンネルで 3にん たすけよう" }, reward: { en: "An eagle ray", ja: "マダラトビエイ" } },
  { en: "Improve the Habitat", ja: "すみかを よくしよう", todo: { en: "Make it happy with 3 structures", ja: "かざりを 3つ おいて ハッピーに しよう" }, reward: { en: "A zebra shark", ja: "トラフザメ" } },
  { en: "Shark Tunnel Celebration", ja: "おいわい", todo: { en: "Take the final tour", ja: "さいごの ツアーを しよう" }, reward: { en: "The Shark Tunnel trophy", ja: "サメの トンネル トロフィー" } }
] as const;

function SharkIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M4 27c8-6 18-9 28-7l3-9 4 10c3 1 5 2 6 4-2 1-4 2-6 2l2 7-6-5c-9 3-20 2-31-2z" fill="#9fb6bb" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="11" cy="25" r="1.6" fill="currentColor" />
    </svg>
  );
}
function WalkIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="26" cy="8" r="4.5" fill="#fff0cf" stroke="currentColor" strokeWidth="2.5" />
      <path d="M25 14l-5 12 6 5-3 12M21 26l-7 13M24 18l8 6M23 18l-8 4" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ------------------------------------------------------------------ milestones card (upper left)

export function TunnelGoals() {
  const t = useGame((s) => s.model.progress.tunnel);
  const exploring = useGame((s) => s.exploring);
  const [open, setOpen] = useState(false);
  const done = t?.milestone ?? 0;
  const cur = TUNNEL_MILESTONES[Math.min(4, done)];
  const count = done === 1 ? `${Math.min(3, t?.observed ?? 0)}/3` : done === 2 ? `${Math.min(3, t?.helped ?? 0)}/3` : null;
  return (
    <div className={`panel goals tunnel-goals ui ${open ? "expanded" : ""} ${exploring ? "compact" : ""}`} data-testid="tunnel-goals" data-milestone={done}>
      <header>
        <SharkIcon size={22} /> Shark Tunnel <Ja>サメの トンネル</Ja>
      </header>
      {done >= 5 ? (
        <div className="guide-next"><b>All done! Explore freely.</b> <Ja>ぜんぶ できた！ じゆうに あそぼう</Ja></div>
      ) : (
        <div className="guide-next" data-testid="tunnel-next">
          <b>{done + 1}. {cur.en}{count ? ` ${count}` : ""}</b> <Ja>{cur.ja}</Ja>
          <small>{cur.todo.en}</small><Ja>{cur.todo.ja}</Ja>
        </div>
      )}
      <button className="objectives-toggle" data-testid="btn-tunnel-goals" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span> Goals <Ja>もくひょう</Ja>
      </button>
      {open && (
        <ol className="tunnel-milestones">
          {TUNNEL_MILESTONES.map((m, i) => (
            <li key={m.en} className={i < done ? "done" : i === done ? "current" : ""} data-testid={`tunnel-milestone-${i + 1}`}>
              <span className="tick">{i < done ? <Icon id="check" size={16} /> : i + 1}</span>
              <span>{m.en}<Ja>{m.ja}</Ja><small>🎁 {m.reward.en}</small></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ management of the wing

function WingStatus() {
  const tank = useGame((s) => tankAt(s.model, "L"));
  if (!tank || tank.type !== "sharks") return null;
  const used = usedSpace(tank), cap = TANKS.sharks.capacity, h = happiness(tank);
  const bar = (v: number, icon: "food" | "sponge" | "happy", id: string) => (
    <div className={`bar ${v >= 70 ? "good" : v >= 40 ? "ok" : "low"}`} data-testid={id} data-value={Math.round(v)}>
      <Icon id={icon} size={24} />
      <div className="track"><div className="fill" style={{ width: `${Math.max(4, v)}%` }} /></div>
    </div>
  );
  return (
    <div className="panel wing-status ui" data-testid="wing-status">
      <header>
        <span>Habitat <Ja>すみか</Ja></span>
        <span className="fishcount" data-testid="habitat-capacity" aria-label={`${used} of ${cap} habitat spaces used`}><SharkIcon size={20} /> {used}/{cap}</span>
      </header>
      <small className="capacity-detail" lang="ja">サメは 3つ、エイは 2つ つかうよ</small>
      {bar(tank.fish.length ? tank.food : 100, "food", "habitat-food")}
      {bar(tank.clean, "sponge", "habitat-clean")}
      {bar(h ?? 0, "happy", "habitat-happy")}
    </div>
  );
}

const VIEWS: Array<{ id: TunnelView; en: string; ja: string }> = [
  { id: "whole", en: "All", ja: "ぜんたい" },
  { id: "left", en: "Left", ja: "ひだり" },
  { id: "right", en: "Right", ja: "みぎ" },
  { id: "entrance", en: "Entrance", ja: "いりぐち" }
];

function ViewButtons() {
  const view = useGame((s) => s.tunnelView);
  return (
    <div className="wing-views ui" role="group" aria-label="Viewpoints" data-testid="wing-views">
      {VIEWS.map((v) => (
        <button key={v.id} className={view === v.id ? "on" : ""} aria-pressed={view === v.id} data-testid={`view-${v.id}`} onClick={() => setTunnelView(v.id)}>
          {v.en}<Ja>{v.ja}</Ja>
        </button>
      ))}
    </div>
  );
}

/** The wing's management bar: animals, structures, care, and the big Explore button. */
export function WingHud() {
  const free = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.stageCard && !s.panel && !s.placing);
  const decorating = useGame((s) => s.panel === "decorate");
  const tunnelArrival = useGame((s) => s.tunnelArrival);
  if (tunnelArrival) return null;
  return (
    <>
      {!decorating && <WingStatus />}
      {free && <ViewButtons />}
      {free && (
        <div className="bottombar room-bar wing-bar">
          <div className="chips-left" />
          <div className="bar-main">
            <Big id="btn-animal-shop" icon="turtle" label="Animals" ja="いきもの" onClick={openAnimalShop} />
            <Big id="btn-decor-shop" icon="decor" label="Rocks" ja="いわ" onClick={openDecorShop} />
            <Big id="btn-decorate" icon="hand" label="Place" ja="おく" onClick={openDecorate} />
            <Big id="btn-feed" icon="food" label="" ja="えさ" onClick={() => void feedTank()} />
            <Big id="btn-clean" icon="sponge" label="" ja="そうじ" onClick={() => void cleanTank()} />
          </div>
          <div className="chips-right">
            <button className="explore-btn ui" data-testid="btn-explore" onClick={enterExplore}>
              <WalkIcon size={46} />
              <span>Explore Tunnel<Ja>トンネルを あるく</Ja></span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ exploring

/** Touch / mouse joystick (bottom left). Writes rt.explore.input directly (no React per move). */
function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    const b = base.current?.getBoundingClientRect();
    if (!b || active.current !== e.pointerId) return;
    const r = b.width / 2;
    let dx = (e.clientX - (b.left + r)) / r, dy = (e.clientY - (b.top + r)) / r;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    rt.explore.input.x = Math.abs(dx) < 0.12 ? 0 : dx;
    rt.explore.input.y = Math.abs(dy) < 0.12 ? 0 : -dy;
    if (knob.current) knob.current.style.transform = `translate(${dx * r * 0.55}px, ${dy * r * 0.55}px)`;
  };
  const end = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    rt.explore.input.x = 0;
    rt.explore.input.y = 0;
    if (knob.current) knob.current.style.transform = "";
  };
  useEffect(() => () => { rt.explore.input.x = 0; rt.explore.input.y = 0; }, []);
  return (
    <div className="joystick ui" ref={base} data-testid="joystick" aria-label="Walk"
      onPointerDown={(e) => { active.current = e.pointerId; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); move(e); }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="joystick-knob" ref={knob} />
      <span className="joystick-label">Walk <Ja>あるく</Ja></span>
    </div>
  );
}

function ActivityCard() {
  const a = useGame((s) => s.tunnelActivity);
  const prompt = useGame((s) => Boolean(s.prompt));
  if (!a || (prompt && a.status === "ask")) return null;
  return (
    <div className="panel tunnel-activity ui" data-testid="tunnel-activity" data-kind={a.kind} data-tier={a.tier} data-status={a.status}>
      <span className="who">{a.by === "pico" ? <PicoFace size={52} /> : <PersonFace type={a.by} size={52} />}</span>
      <div>
        <b className="q">{a.question.en}</b>
        <Ja>{a.question.ja}</Ja>
        <div className="todo"><Icon id={a.status === "wait" ? "eye" : "hand"} size={22} /> {a.todo.en} <Ja>{a.todo.ja}</Ja></div>
        {a.clue && <div className="clue" data-testid="tunnel-clue">{a.clue.en} <Ja>{a.clue.ja}</Ja></div>}
      </div>
    </div>
  );
}

function WaitingVisitor() {
  const w = useGame((s) => s.tunnelWaiting);
  const busy = useGame((s) => Boolean(s.tunnelActivity || s.prompt || s.line));
  if (!w || busy) return null;
  return (
    <button className="chip-btn visitor tunnel-waiting ui" data-testid="tunnel-waiting" onClick={() => tapTunnelVisitor(w.id)}>
      <PersonFace type={w.type} size={52} />
      <span className="excl">!</span>
      <span className="waiting-label">Help!<Ja>たすけて</Ja></span>
    </button>
  );
}

function SpotLabel() {
  const [spot, setSpot] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const s = rt.explore.spot;
      setSpot((old) => (old === s ? old : s));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const v = TUNNEL_VIEWING_SPOTS.find((x) => x.id === spot);
  if (!v) return null;
  return <div className="spot-label ui" data-testid="spot-label"><Icon id="eye" size={22} /> {v.en} <Ja>{v.ja}</Ja></div>;
}

/** Number tags on sharks (count), the arrow and ring on a find target (help tiers 3-4), speech bubbles. */
function ScreenOverlays() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = root.current, cam = cameraRef.current;
      if (!el || !cam) return;
      const canvas = document.querySelector("canvas");
      const r = canvas?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const toScreen = (x: number, y: number, z: number) => {
        v.set(x, y, z).project(cam);
        if (v.z > 1 || v.z < -1) return null;
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      };
      const g = getGame();
      const items: string[] = [];
      const poses = tunnelRuntime.swim?.poses() ?? [];
      if (countTags.on) {
        let n = 0;
        for (const a of poses) {
          if (a.species === "eagleray") continue;
          n++;
          const p = toScreen(a.x, a.y - (a.restDrop ?? 0) + 0.7, a.z);
          if (p) items.push(`<div class="count-tag" data-testid="shark-number" style="left:${p.x}px;top:${p.y}px">${n}</div>`);
        }
      }
      const target = findTargetId();
      const tier = g.tunnelActivity?.tier ?? 0;
      if (target && tier >= 3) {
        const a = poses.find((x) => x.id === target);
        const p = a && toScreen(a.x, a.y - (a.restDrop ?? 0), a.z);
        if (p) {
          items.push(`<div class="find-ring ${tier >= 4 ? "big" : ""}" data-testid="find-ring" style="left:${p.x}px;top:${p.y}px"></div>`);
          items.push(`<div class="find-arrow" style="left:${p.x}px;top:${p.y - 70}px">▼</div>`);
          if (tier >= 4) items.push(`<div class="find-hand" style="left:${p.x + 18}px;top:${p.y + 10}px">👆</div>`);
        }
      }
      for (const person of tunnelPeople) {
        const w = personWorld(person);
        if (person.bubble || person.request) {
          const p = toScreen(w.x, person.type === "child" ? 1.55 : 2.0, w.z);
          if (!p) continue;
          const text = person.bubble ? `${person.bubble.en}<small lang="ja">${person.bubble.ja}</small>` : `<b>!</b>`;
          items.push(`<div class="tunnel-bubble ${person.request && !person.bubble ? "ask" : ""}" style="left:${p.x}px;top:${p.y}px">${text}</div>`);
        }
      }
      const html = items.join("");
      if (el.innerHTML !== html) el.innerHTML = html;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="tunnel-overlays" ref={root} aria-hidden="true" />;
}

/** While a find is open, a tap on the 3D view is checked against the animals on screen (generous radius). */
function FindTaps() {
  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const v = new THREE.Vector3();
    const up = (e: PointerEvent) => {
      const g = getGame();
      if (!g.tunnelActivity || (g.tunnelActivity.kind !== "find" && g.tunnelActivity.kind !== "show") || g.tunnelActivity.status !== "seek") return;
      const cam = cameraRef.current;
      if (!cam) return;
      const r = canvas.getBoundingClientRect();
      let best: { id: string; species: "blacktip" | "zebrashark" | "eagleray"; d: number } | null = null;
      for (const a of tunnelRuntime.swim?.poses() ?? []) {
        v.set(a.x, a.y - (a.restDrop ?? 0), a.z).project(cam);
        if (v.z > 1) continue;
        const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
        // Radius: the animal's projected size, never less than a child's fingertip area.
        const dist = cam.position.distanceTo(new THREE.Vector3(a.x, a.y, a.z));
        const px = (a.radius / Math.max(0.5, dist)) * (r.height / (2 * Math.tan((cam.fov * Math.PI) / 360)));
        const reach = Math.max(80, px * 1.4);
        const d = Math.hypot(e.clientX - sx, e.clientY - sy);
        if (d < reach && (!best || d < best.d)) best = { id: a.id, species: a.species, d };
      }
      tapForFind(best);
    };
    canvas.addEventListener("pointerup", up);
    return () => canvas.removeEventListener("pointerup", up);
  }, []);
  return null;
}

export function ExploreHud() {
  const free = useGame((s) => s.mode === "play" && !s.prompt && !s.line && !s.stageCard);
  const milestone = useGame((s) => s.model.progress.tunnel?.milestone ?? 0);
  const activity = useGame((s) => Boolean(s.tunnelActivity));
  return (
    <>
      <button className="back-aquarium ui" data-testid="btn-back-aquarium" onClick={leaveExplore}>
        <Icon id="back" size={30} /> Back to Aquarium <Ja>すいぞくかんに もどる</Ja>
      </button>
      {free && <Joystick />}
      <ActivityCard />
      {free && <WaitingVisitor />}
      {free && !activity && milestone === 4 && (
        <button className="tour-btn ui" data-testid="btn-final-tour" onClick={() => void startFinalTour()}>
          <Icon id="trophy" size={34} /> Final Tour <Ja>さいごの ツアー</Ja>
        </button>
      )}
      <SpotLabel />
      <FindTaps />
    </>
  );
}

/** Overlays shared by both modes (bubbles over visitors, number tags, find arrows). */
export function TunnelOverlays() {
  const shown = useGame((s) => s.screen === "game" && (s.hall === SHARKS_HALL || s.exploring));
  return shown ? <ScreenOverlays /> : null;
}

// ------------------------------------------------------------------ cards

export function TunnelCelebration() {
  const c = useGame((s) => s.tunnelCelebration);
  if (!c) return null;
  const m = TUNNEL_MILESTONES[c.milestone - 1];
  if (!m) return null;
  return (
    <div className="tunnel-celebration ui" data-testid="tunnel-celebration" data-milestone={c.milestone} role="dialog">
      <div className="panel">
        <Icon id={c.milestone >= 5 ? "trophy" : "star"} size={64} />
        <h2>{c.milestone >= 5 ? "Shark Tunnel Trophy!" : "Goal complete!"}<Ja>{c.milestone >= 5 ? "サメの トンネル トロフィー！" : "もくひょう たっせい！"}</Ja></h2>
        <p><b>{c.milestone}. {m.en}</b><Ja>{m.ja}</Ja></p>
        <p className="reward">🎁 {m.reward.en}<Ja>{m.reward.ja}</Ja></p>
        <button className="primary" data-testid="btn-celebration-ok" onClick={() => setGame({ tunnelCelebration: null })}>Continue<Ja>つづける</Ja></button>
      </div>
    </div>
  );
}

/** First visit: a camera sweep over the habitat and a bilingual card (like the Atrium's). */
export function TunnelArrival() {
  const visible = useGame((s) => s.tunnelArrival);
  useEffect(() => {
    let timer: number | undefined;
    const finish = () => {
      if (!rt.tunnelReveal) return;
      rt.tunnelReveal = null;
      rt.camera.shot = null;
      updateModel((m) => ({ ...m, progress: { ...m.progress, tunnelIntroSeen: true } }));
      setGame({ tunnelArrival: false, mode: "play" });
      window.clearTimeout(timer);
    };
    const check = () => {
      const g = getGame();
      if (rt.tunnelReveal) {
        if (g.screen !== "game" || g.hall !== SHARKS_HALL) {
          rt.tunnelReveal = null;
          rt.camera.shot = null;
          window.clearTimeout(timer);
          setGame({ tunnelArrival: false, ...(g.screen === "game" && g.mode === "busy" ? { mode: "play" as const } : {}) });
        }
        return;
      }
      if (g.screen !== "game" || g.hall !== SHARKS_HALL || g.view !== "room" || g.exploring || !g.model.progress.tunnelOpen || g.model.progress.tunnelIntroSeen || g.mode !== "play" || g.panel || g.placing || g.prompt || g.line) return;
      rt.tunnelReveal = { t0: rt.time, reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false };
      rt.camera.shot = { pos: { x: 35.5, y: 10, z: 1.5 }, target: { x: 35.5, y: 0.6, z: -14 } };
      setGame({ tunnelArrival: true, mode: "busy", nudge: null });
      timer = window.setTimeout(finish, 4800);
    };
    const key = (e: KeyboardEvent) => {
      if (rt.tunnelReveal && ["Escape", "Space", "Enter"].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); finish(); }
    };
    const unsubscribe = useGame.subscribe(check);
    window.addEventListener("keydown", key, true);
    window.addEventListener("tunnel-skip", finish);
    check();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("tunnel-skip", finish);
    };
  }, []);
  if (!visible) return null;
  return (
    <div className="atrium-arrival tunnel-arrival ui" data-testid="tunnel-arrival">
      <b>Shark Tunnel</b>
      <span lang="ja">サメの トンネル</span>
      <button onClick={() => window.dispatchEvent(new Event("tunnel-skip"))}>Skip <span lang="ja">スキップ</span></button>
    </div>
  );
}
