import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyFish, newModel, placeFish } from "../logic/model";
import { requestReward, type Request } from "../logic/requests";
import { resetRuntime, rt } from "../runtime";
import { getGame, model, setGame } from "../store";
import { BENCH_FACING, BENCH_SEAT, ENTRY } from "../world";
import { answerShow, cancelShow, helped, openRequest, resetVisitors, scripted, spawnVisitor, stepVisitors } from "./visitors";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("./actions", () => ({ openTank: vi.fn() }));
vi.mock("./ask", () => ({
  ask: vi.fn(),
  fastMode: () => false,
  say: vi.fn(async () => undefined),
  speak: vi.fn(async () => undefined),
  wait: vi.fn(async () => undefined)
}));

const request: Request = { kind: "show", color: "orange", fishOnly: true };
const answer = { type: "fish", species: "clownfish" } as const;

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: vi.fn() });
  resetRuntime();
  resetVisitors();
  scripted.busy = false;
  const bought = buyFish(newModel(), "clownfish");
  if (!bought.ok) throw new Error(bought.reason);
  const placed = placeFish(bought.m, bought.m.inv.fish[0].id, "t1");
  if (!placed.ok) throw new Error(placed.reason);
  setGame({ model: placed.m, mode: "play", screen: "game", view: "room", request: null, prompt: null, placing: null, stageCard: null });
});

afterEach(() => {
  resetRuntime();
  resetVisitors();
  vi.unstubAllGlobals();
});

function walkingVisitor(req: Request | null = request, scriptedVisitor = false) {
  const v = spawnVisitor("child", req, { scripted: scriptedVisitor });
  v.x = ENTRY.x;
  v.z = ENTRY.z;
  stepVisitors(0);
  return v;
}

describe("walking visitor request lifecycle", () => {
  it("stops an eligible walker, keeps it facing the player, and pays once despite repeated taps", async () => {
    const v = walkingVisitor();
    const other = walkingVisitor();
    const coins = model().coins;
    const reward = requestReward(request, model().tanks[0]);
    expect(getGame().waiting?.id).toBe(v.id);

    const conversation = openRequest(v.id);
    const stopped = { x: v.x, z: v.z };
    expect(v.state).toBe("help");
    expect(v.path).toEqual([]);
    expect(v.moving).toBe(false);
    expect(v.yaw).toBeCloseTo(Math.atan2(rt.camera.pos.x - v.x, rt.camera.pos.z - v.z));
    expect(getGame().waiting).toBeNull();

    await openRequest(v.id);
    await openRequest(other.id);
    stepVisitors(100);
    expect({ x: v.x, z: v.z }).toEqual(stopped);
    expect(v.state).toBe("help");
    expect(getGame().request?.visitorId).toBe(v.id);
    expect(answerShow(answer, "t1", {})).toBe(true);
    expect(answerShow(answer, "t1", {})).toBe(false);
    await conversation;

    expect(v.state).toBe("leave");
    expect(v.helped).toBe(true);
    expect(model().coins).toBe(coins + reward);
    expect(model().stats.helped).toBe(1);
    await openRequest(v.id);
    await helped(v, request, "t1");
    expect(model().coins).toBe(coins + reward);
    expect(model().paid.filter((key) => key === `help:${v.id}`)).toHaveLength(1);
  });

  it("resumes a cancelled walking request to a correctly aligned seat and can complete it there", async () => {
    const v = walkingVisitor();
    const coins = model().coins;
    const conversation = openRequest(v.id);
    cancelShow();
    await conversation;
    expect(v.state).toBe("walk");
    expect(v.path.length).toBeGreaterThan(0);
    expect(model().coins).toBe(coins);
    for (let i = 0; i < 1000 && v.state === "walk"; i++) stepVisitors(0.05);
    expect(v.state).toBe("sit");
    expect(v.x).toBe(BENCH_SEAT.x);
    expect(v.z).toBe(BENCH_SEAT.z);
    expect(v.yaw).toBe(BENCH_FACING);
    expect(getGame().waiting?.id).toBe(v.id);

    const seatedConversation = openRequest(v.id);
    expect(answerShow(answer, "t1", {})).toBe(true);
    await seatedConversation;
    expect(v.state).toBe("leave");
    expect(model().stats.helped).toBe(1);
    expect(model().coins).toBe(coins + requestReward(request, model().tanks[0]));
  });

  it("ignores outside, ordinary, and scripted visitors", async () => {
    const outside = spawnVisitor("child", request);
    const ordinary = walkingVisitor(null);
    const scriptedVisitor = walkingVisitor(request, true);
    for (const v of [outside, ordinary, scriptedVisitor]) {
      const path = [...v.path];
      await openRequest(v.id);
      expect(v.state).toBe("walk");
      expect(v.path).toEqual(path);
    }
    expect(getGame().request).toBeNull();
    expect(getGame().waiting).toBeNull();
    expect(model().stats.helped).toBe(0);
  });
});
