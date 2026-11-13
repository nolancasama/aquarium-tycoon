import { afterEach, describe, expect, it, vi } from "vitest";
import { LAGOON_DOMAIN } from "../data/lagoon";
import { BALL_FETCH_TIMEOUT, BALL_HELD, BALL_LANDING, BALL_RETURN_TIMEOUT, ballCatchPaused, ballCatchSnapshot, canHoldBall, clearLagoonRt, dropToy, holdBall, lagoonPod, lagoonRt, stepLagoonRt, throwBall } from "./lagoonRuntime";

afterEach(() => { vi.restoreAllMocks(); clearLagoonRt(); });

/** Freeze the swimmers to exercise the recovery path without an available fetcher. */
function noFetcher() {
  const pod = lagoonPod(3);
  vi.spyOn(pod, "step").mockImplementation(() => {});
  vi.spyOn(pod, "trick").mockReturnValue(false);
  return pod;
}

function advance(seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 30) stepLagoonRt(1 / 30);
}

describe("player ball catch", () => {
  it("keeps an untouched ball available, and recovers automatic play that is out of reach", () => {
    noFetcher(); dropToy("ball");
    const ball = lagoonRt.toy!;
    advance(80);
    expect(lagoonRt.toy).toBe(ball);
    expect(canHoldBall()).toBe(true);
    ball.x = 0; ball.z = 0;
    advance(BALL_FETCH_TIMEOUT + 15);
    expect(lagoonRt.toy).toBe(ball);
    expect(ball.returned).toBe(true);
    expect(canHoldBall()).toBe(true);
  });

  it("uses the same single ball through held, thrown, fetch, recovery and held again", () => {
    noFetcher();
    dropToy("ball");
    const ball = lagoonRt.toy!;
    expect(canHoldBall()).toBe(true);
    expect(holdBall()).toBe(true);
    expect(ball.state).toBe("held");
    expect([ball.x, ball.y, ball.z]).toEqual([BALL_HELD.x, BALL_HELD.y, BALL_HELD.z]);
    expect(holdBall()).toBe(false);
    expect(ball.vx).toBe(0);
    expect(throwBall()).toBe(true);
    expect(throwBall()).toBe(false);
    expect(ball.state).toBe("thrown");
    advance(0.4);
    expect(ball.y).toBeGreaterThan(BALL_HELD.y);
    expect(canHoldBall()).toBe(false);
    expect(lagoonRt.toy).toBe(ball);
    advance(1.5);
    expect(ball.state).toBe("dolphin-play");
    expect(ball.y).toBe(0);
    advance(BALL_FETCH_TIMEOUT + BALL_RETURN_TIMEOUT + 15);
    expect(ball.state).toBe("floating");
    expect(ball.returned).toBe(true);
    expect(Math.hypot(ball.x - BALL_LANDING.x, ball.z - BALL_LANDING.z)).toBeLessThan(1);
    expect(holdBall()).toBe(true);
    advance(85);
    expect(lagoonRt.toy).toBe(ball);
    expect(ball.state).toBe("held");
    expect(ball.y).toBe(BALL_HELD.y);
  });

  it("keeps unattended recovery automatic while player catch input is paused", () => {
    const pod = noFetcher(); dropToy("ball");
    const ball = lagoonRt.toy!;
    ball.x = 0; ball.z = 0;
    lagoonRt.catchInputPaused = true; // gallery viewing or a visitor question
    advance(BALL_FETCH_TIMEOUT + 15);
    expect(lagoonRt.toy).toBe(ball);
    expect(ball.catchRound).toBe(false);
    expect(ball.state).toBe("floating");
    expect(ball.returned).toBe(true);
    advance(15);
    expect(pod.members.some((m) => m.attract?.kind === "toy")).toBe(true);
    expect(holdBall()).toBe(false);
    lagoonRt.catchInputPaused = false;
    expect(holdBall()).toBe(true);
  });

  it("clamps a water target, and lands the ballistic throw on that target", () => {
    noFetcher(); dropToy("ball"); holdBall();
    expect(throwBall(300, -300)).toBe(true);
    const ball = lagoonRt.toy!;
    expect(LAGOON_DOMAIN.inside(ball.landX, ball.landZ)).toBeGreaterThanOrEqual(2);
    const x = ball.landX, z = ball.landZ;
    advance(2);
    expect(ball.x).toBeCloseTo(x, 6);
    expect(ball.z).toBeCloseTo(z, 6);
    expect(ball.y).toBe(0);
    expect(ballCatchSnapshot().state).toBe("dolphin-play");
  });

  it("a dolphin swims to the landed ball and starts its return with a snout nudge", () => {
    const pod = lagoonPod(7);
    vi.spyOn(pod, "trick").mockReturnValue(false);
    dropToy("ball"); holdBall(); throwBall(0, -2);
    const ball = lagoonRt.toy!;
    let approaching = false, nudged = false;
    const previous = pod.members.map((m) => ({ x: m.x, y: m.y, z: m.z }));
    for (let t = 0; t < 22 && !nudged; t += 1 / 30) {
      stepLagoonRt(1 / 30);
      approaching ||= pod.members.some((m) => m.attract?.kind === "toy");
      nudged = ball.state === "returning" && ball.lastBy !== null;
      for (let i = 0; i < pod.members.length; i++) {
        const m = pod.members[i], p = previous[i];
        expect(Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z)).toBeLessThan(0.4);
        p.x = m.x; p.y = m.y; p.z = m.z;
      }
    }
    expect(approaching).toBe(true);
    expect(nudged).toBe(true);
    expect(ball.vx * (BALL_LANDING.x - ball.x) + ball.vz * (BALL_LANDING.z - ball.z)).toBeGreaterThan(0);
  });

  it("recovers a stuck ball from outside accessible water within a bounded time", () => {
    noFetcher(); dropToy("ball"); holdBall(); throwBall(); advance(2);
    const ball = lagoonRt.toy!;
    ball.x = 27; ball.z = 4;
    advance(BALL_FETCH_TIMEOUT + BALL_RETURN_TIMEOUT + 30);
    expect(ball.state).toBe("floating");
    expect(ball.returned).toBe(true);
    // Once returned, the child can retrieve it even if automatic play moved it away.
    ball.x = 0; ball.z = 0;
    expect(canHoldBall()).toBe(true);
    expect(holdBall()).toBe(true);
  });

  it("ignores hold and throw during feeding, questions and trick demonstrations", () => {
    const pod = noFetcher(); dropToy("ball");
    for (const phase of ["gathering", "ready", "throwing", "catching"] as const) {
      lagoonRt.feeding.phase = phase;
      expect(ballCatchPaused()).toBe(true);
      expect(holdBall()).toBe(false);
    }
    lagoonRt.feeding.phase = "finished";
    expect(holdBall()).toBe(true);
    lagoonRt.tricksPaused = true;
    expect(throwBall()).toBe(false);
    lagoonRt.tricksPaused = false;
    lagoonRt.catchInputPaused = true;
    expect(throwBall()).toBe(false);
    lagoonRt.catchInputPaused = false;
    pod.hold(pod.members[0].id, 3, -1); // counting/where question's actual animal hold
    expect(throwBall()).toBe(false);
    pod.release(pod.members[0].id);
    pod.members[0].mode = "charge";
    expect(throwBall()).toBe(false);
    pod.members[0].mode = "swim";
    expect(throwBall()).toBe(true);
    const ball = lagoonRt.toy!, x = ball.x, y = ball.y, z = ball.z;
    lagoonRt.catchInputPaused = true;
    advance(2);
    expect([ball.x, ball.y, ball.z]).toEqual([x, y, z]);
    expect(ball.stateTime).toBe(0);
  });
});
