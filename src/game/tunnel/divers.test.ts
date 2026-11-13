import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIVER_RADIUS, DIVER_SECONDS, DIVER_SHOTS, DIVER_WORK_SPOTS, diverRt, diverShotAt, diversBusy, resetDivers, startDivers, stepDivers } from "./divers";
import { Euler, Vector3 } from "three";
import { sharkSwimVolume, TUNNEL_STRUCTURES, TUNNEL_ZONES } from "../data/sharkTunnel";
import { tunnelClearance } from "./swim3d";
import { clean, newModel, newTank } from "../logic/model";
import { getGame, model, setGame } from "../store";
import { SHARKS_HALL } from "../data/rooms";
import { cleanTank } from "../flow/actions";
import { resetRuntime } from "../runtime";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("../sim", () => ({ dropPellets: vi.fn(), dropPinch: vi.fn() }));
vi.mock("../flow/visitors", () => ({ answerShow: vi.fn(), inspectRequestTank: vi.fn(), openRequest: vi.fn() }));
vi.mock("../flow/ask", () => ({ ask: vi.fn(), say: vi.fn(async () => undefined), speak: vi.fn(async () => undefined) }));

beforeEach(() => {
  resetDivers(); resetRuntime();
  vi.stubGlobal("window", { setTimeout: vi.fn(), clearTimeout: vi.fn() });
  const m = newModel(), tank = newTank("shark-home", "sharks", "L");
  tank.clean = 20; tank.fish = [{ id: "shark", species: "blacktip" }]; m.tanks = [tank];
  m.progress.tutorial = "done"; m.progress.freePlay = true; m.progress.tunnelOpen = true;
  setGame({ model: m, screen: "game", mode: "play", hall: SHARKS_HALL, view: "room", tankId: null,
    settingsOpen: false, stageCard: null, prompt: null, line: null, panel: null, placing: null, toasts: [] });
});
afterEach(() => { resetDivers(); resetRuntime(); vi.unstubAllGlobals(); });

describe("tunnel diver montage", () => {
  it("cuts through five distinct positions and poses exactly once in five seconds", () => {
    expect(DIVER_SECONDS).toBe(5);
    expect(new Set(DIVER_SHOTS.map(s => `${s.x},${s.y},${s.z}`)).size).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(diverShotAt(i)).toBe(DIVER_SHOTS[i]);
      expect(diverShotAt(i + 0.999)).toBe(DIVER_SHOTS[i]);
      if (i) {
        expect(DIVER_SHOTS[i].arm).not.toBe(DIVER_SHOTS[i - 1].arm);
        expect(DIVER_SHOTS[i].tilt).not.toBe(DIVER_SHOTS[i - 1].tilt);
      }
    }
    for (const t of [-1, 5, 6, 50, NaN, Infinity]) expect(diverShotAt(t)).toBeNull();
    startDivers(); stepDivers(4.99); expect(diversBusy()).toBe(true);
    stepDivers(0.01); expect(diversBusy()).toBe(false);
    stepDivers(100); expect(diversBusy()).toBe(false);
  });
  it("keeps the complete rig outside glass/walkway, rocks and every possible structure", () => {
    const kinds = Object.keys(TUNNEL_STRUCTURES) as Array<keyof typeof TUNNEL_STRUCTURES>;
    const volume = sharkSwimVolume(TUNNEL_ZONES.flatMap((_, zone) => kinds.map(kind => ({ zone, kind }))));
    for (const shot of DIVER_SHOTS) {
      expect(tunnelClearance(volume, shot.x, shot.y, shot.z), shot.name).toBeGreaterThan(DIVER_RADIUS + 0.02);
    }
    // Extended cleaning tools approach the glass without penetrating it or a
    // placed rock. Check the entire handle from the posed wrist to the head.
    for (const index of [0, 1, 4]) {
      const shot = DIVER_SHOTS[index], spot = DIVER_WORK_SPOTS[index];
      const hand = new Vector3(0, -0.51, 0).applyEuler(new Euler(shot.arm, 0, 0))
        .add(new Vector3(0.22, 0.24, 0)).applyEuler(new Euler(shot.tilt, 0, 0))
        .applyEuler(new Euler(0, shot.yaw, 0)).add(new Vector3(shot.x, shot.y, shot.z));
      for (let i = 0; i <= 40; i++) {
        const p = hand.clone().lerp(new Vector3(spot.x, spot.y, spot.z), i / 40);
        expect(tunnelClearance(volume, p.x, p.y, p.z), `${shot.name} handle ${i}`).toBeGreaterThan(0.025);
      }
      expect(tunnelClearance(volume, spot.x, spot.y, spot.z)).toBeCloseTo(0.12, 3);
    }
  });
  it("applies today's care once even with two direct Clean calls and clears on departure", async () => {
    const before = model(), expected = clean(before, "shark-home");
    if (!expected.ok) throw new Error(expected.reason);
    await Promise.all([cleanTank(), cleanTank()]);
    expect(diversBusy()).toBe(true);
    expect(model()).toEqual(expected.m);
    // Avoid a false positive from Clean's full-meter clamp: an action that
    // accidentally runs twice must not restore a changed meter mid-montage.
    setGame({ model: { ...model(), tanks: model().tanks.map(t => ({ ...t, clean: 35 })) } });
    await cleanTank();
    expect(model().tanks[0].clean).toBe(35);
    const applied = model();
    stepDivers(2); setGame({ hall: 0 });
    expect(diversBusy()).toBe(false); expect(diverRt.elapsed).toBe(0);
    expect(model()).toBe(applied);
    setGame({ hall: SHARKS_HALL }); stepDivers(10);
    expect(getGame().model).toBe(applied); expect(diversBusy()).toBe(false);
  });
});
