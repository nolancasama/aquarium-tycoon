import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rt } from "../runtime";
import { keys } from "../../input/keyboard";
import { TUNNEL_SECTIONS, walkHalfWidth, walkwayFrame } from "../data/sharkTunnel";
import { cameraTubeCheck, snapCamera, stepExplore, stepExploreCamera, stepTransition, TRANSITION, WALK_SPEED } from "./explore";

/** Walk with a key held for `seconds`, the camera following as in the game. */
function walk(code: string | null, seconds: number) {
  if (code) keys.add(code);
  const trace: Array<{ s: number; lateral: number; look: number }> = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const c = rt.explore.cam;
    stepExplore(1 / 60, Math.atan2(-(c.tx - c.x), -(c.tz - c.z)));
    stepExploreCamera(1 / 60);
    trace.push({ s: rt.explore.s, lateral: rt.explore.lateral, look: Math.hypot(c.tx - c.x, c.ty - c.y, c.tz - c.z) });
    const tube = cameraTubeCheck();
    expect(Math.abs(tube.lateral)).toBeLessThanOrEqual(tube.maxLateral + 0.05);
    expect(tube.y).toBeLessThanOrEqual(tube.maxY + 0.05);
  }
  if (code) keys.delete(code);
  return trace;
}

describe("walking the Shark Tunnel", () => {
  beforeEach(() => {
    keys.clear();
    rt.explore.active = false;
    rt.explore.input = { x: 0, y: 0 };
    // Enter through the normal transition so each test also resets the held-input
    // reference and camera travel direction, which live outside rt.explore.
    rt.explore.transition = { kind: "enter", t0: rt.time - TRANSITION };
    stepTransition();
  });
  afterEach(() => { keys.clear(); rt.explore.input = { x: 0, y: 0 }; rt.explore.active = false; });

  it.each(["ArrowUp", "KeyW", null])("follows mainCurve at walking speed with forward input %s", (code) => {
    const section = TUNNEL_SECTIONS.mainCurve;
    const start = section.from + 0.2;
    const seconds = (section.to - start) / WALK_SPEED;
    Object.assign(rt.explore, { s: start, lateral: 0, speed: 0, walkTo: null, frame: null, spot: null });
    snapCamera();
    stepExploreCamera(1 / 60);
    if (!code) rt.explore.input.y = 1;
    const trace = walk(code, seconds);
    // Allow the short acceleration ramp, but not lost forward motion on the bend.
    expect(rt.explore.s - start).toBeCloseTo(WALK_SPEED * Math.round(seconds * 60) / 60, 0);
    for (const p of trace) expect(Math.abs(p.lateral)).toBeLessThan(1e-6);
    const f = walkwayFrame(rt.explore.s);
    expect(Math.sin(rt.explore.heading) * f.dx + Math.cos(rt.explore.heading) * f.dz).toBeGreaterThan(0.98);
  });

  it.each(["ArrowLeft", "KeyA", null])("reaches the left walkway edge without crossing it with input %s", (code) => {
    Object.assign(rt.explore, { s: TUNNEL_SECTIONS.firstView.from + 2, lateral: 0, speed: 0, walkTo: null, frame: null, spot: null });
    snapCamera();
    stepExploreCamera(1 / 60);
    if (!code) rt.explore.input.x = -1;
    const trace = walk(code, 3);
    for (const p of trace) expect(Math.abs(p.lateral)).toBeLessThanOrEqual(walkHalfWidth(p.s) + 1e-6);
    expect(rt.explore.lateral).toBeCloseTo(-walkHalfWidth(rt.explore.s), 6);
  });

  it("walks backwards steadily, and the camera swings round behind without spinning", () => {
    Object.assign(rt.explore, { active: true, s: TUNNEL_SECTIONS.returnLeg.from + 4, lateral: 0, speed: 0, walkTo: null, frame: null, spot: null });
    snapCamera();
    walk("ArrowUp", 1.5);
    const back = walk("ArrowDown", 4);
    // Monotonic: the old feedback loop made the player jitter back and forth.
    for (let i = 20; i < back.length; i++) expect(back[i].s).toBeLessThanOrEqual(back[i - 1].s + 1e-6);
    expect(back[0].s - back[back.length - 1].s).toBeGreaterThan(4);
    // Settled behind the player, looking down the tube (not straight at itself).
    expect(back[back.length - 1].look).toBeGreaterThan(3);
    const c = rt.explore.cam, f = walkwayFrame(rt.explore.s);
    expect((c.tx - c.x) * f.dx + (c.tz - c.z) * f.dz).toBeLessThan(0);
    // Releasing input lets the next gesture follow the new travel direction.
    stepExplore(0, 0);
    const start = rt.explore.s;
    walk("ArrowUp", 1);
    expect(rt.explore.s).toBeLessThan(start - 1);
  });
});
