import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyFish, newModel, newTank, placeFish } from "../logic/model";
import { requestReward, type Request } from "../logic/requests";
import { resetRuntime, rt } from "../runtime";
import { getGame, model, setGame } from "../store";
import { BENCH_FACING, BENCH_FRONT, BENCH_SEAT, ENTRY, SEATS, seatApproach, seatExit } from "../world";
import { answerShow, cancelShow, helped, openRequest, leave, resetVisitors, sampleVisitorCrowdFrame, scripted, seedVisitors, spawnVisitor, stepVisitors, visitorCrowdStats, visitorsTick, walkTo } from "./visitors";
import { CROWD_CAP, CROWD_EXTRA, RUSH_QUESTIONS, RUSH_SECONDS } from "../rush/config";
import { newRushState } from "../rush/types";

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

function rushAt(remaining = RUSH_SECONDS, id = "rush-1") {
  const m = model();
  const rush = m.rush ?? newRushState();
  setGame({
    model: {
      ...m,
      progress: { ...m.progress, tutorial: "done", freePlay: true, hallOpen: true },
      rush: {
        ...rush, unlocked: true, introSeen: true, phase: "rush",
        event: {
          id, tankIds: ["t1"], ready: ["t1"], prepTotal: 120, remaining,
          result: { ready: 1, eligible: 1, medal: "gold", bonus: 13, newRewards: [] }
        }
      }
    },
    mode: "play", line: null, settingsOpen: false, fade: 0
  });
}

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

describe("Rush Hour visitors", () => {
  it("brings adult and child groups up to the cosmetic limit and leaves naturally without tipping", () => {
    seedVisitors(777);
    rushAt();
    for (let i = 0; i < 3; i++) spawnVisitor("adult", null);
    visitorsTick(0);
    const firstGroup = rt.visitors.filter((v) => v.cosmetic);
    expect(firstGroup.length).toBeGreaterThanOrEqual(3);
    expect(firstGroup.length).toBeLessThanOrEqual(4);
    expect(firstGroup.map((v) => v.type)).toContain("adult");
    expect(firstGroup.map((v) => v.type)).toContain("child");
    for (const remaining of [75, 60, 45, 30, 15, 1]) { rushAt(remaining); visitorsTick(0); }
    const crowd = rt.visitors.filter((v) => v.cosmetic);
    expect(crowd.length).toBeLessThanOrEqual(CROWD_EXTRA);
    expect(rt.visitors).toHaveLength(CROWD_CAP);
    expect(crowd.every((v) => !v.request)).toBe(true);
    const coins = model().coins;
    for (const v of crowd) v.seen.push("t1");
    setGame({ model: { ...model(), rush: { ...model().rush!, phase: "results" } } });
    visitorsTick(0);
    expect(crowd.every((v) => v.state === "leave" && v.path.length > 0)).toBe(true);
    expect(model().coins).toBe(coins);
    expect(model().paid.some((key) => key.startsWith("tip:"))).toBe(false);
  });

  it("honours the hard hall cap when other visitors already fill the room", () => {
    rushAt();
    for (let i = 0; i < CROWD_CAP; i++) spawnVisitor("adult", null);
    visitorsTick(0);
    expect(rt.visitors).toHaveLength(CROWD_CAP);
    expect(rt.visitors.some((v) => v.cosmetic)).toBe(false);
  });

  it("builds to 18 by 40 seconds, stays full and replaces departed cosmetics", () => {
    seedVisitors(777);
    rushAt();
    for (let i = 0; i < 3; i++) spawnVisitor("adult", null);
    // Sample real walking, looking and ordinary spawning, with a capable frame rate.
    for (let frame = 0; frame <= 70 * 30; frame++) {
      const elapsed = frame / 30;
      rt.time += 1 / 30;
      if (frame % 30 === 0) rushAt(RUSH_SECONDS - elapsed);
      sampleVisitorCrowdFrame(1 / 60, true);
      stepVisitors(1 / 30);
      visitorsTick(1 / 30);
      if (elapsed >= 40) {
        expect(visitorCrowdStats().active).toBeGreaterThanOrEqual(CROWD_CAP - 2);
        expect(visitorCrowdStats().active).toBeLessThanOrEqual(CROWD_CAP);
        expect(visitorCrowdStats().cosmetic).toBe(CROWD_EXTRA);
      }
    }
    const leavers = rt.visitors.filter((v) => v.cosmetic).slice(0, 3);
    for (const v of leavers) leave(v);
    for (let frame = 0; frame < 18 * 30; frame++) {
      rt.time += 1 / 30;
      if (frame % 30 === 0) rushAt(20 - frame / 30);
      stepVisitors(1 / 30);
      visitorsTick(1 / 30);
      expect(visitorCrowdStats().active).toBeLessThanOrEqual(CROWD_CAP);
    }
    expect(leavers.every((v) => !rt.visitors.includes(v))).toBe(true);
    expect(visitorCrowdStats().cosmetic).toBe(CROWD_EXTRA);
    expect(visitorCrowdStats().active).toBeGreaterThanOrEqual(CROWD_CAP - 2);
  });

  it("spreads groups over different exhibits and staggers their walking", () => {
    const second = newTank("other-rush", "small", "C");
    second.fish = [{ id: "other-fish", species: "clownfish" }];
    setGame({ model: { ...model(), tanks: [...model().tanks, second] } });
    rushAt();
    visitorsTick(0);
    const first = rt.visitors.filter((v) => v.cosmetic);
    const target = first[0].plan[0];
    expect(first.every((v) => v.plan[0] === target)).toBe(true);
    rushAt(82);
    visitorsTick(0);
    const secondGroup = rt.visitors.filter((v) => v.cosmetic && !first.includes(v));
    expect(secondGroup.length).toBeGreaterThanOrEqual(3);
    expect(secondGroup.every((v) => v.plan[0] !== target)).toBe(true);
    expect(new Set(first.map((v) => v.step)).size).toBe(first.length);
    const positions = first.map((v) => ({ x: v.x, z: v.z }));
    rt.time += 0.2;
    stepVisitors(0.1);
    expect(first[0].moving).toBe(true);
    expect(first[first.length - 1].moving).toBe(false);
    rt.time += 1;
    stepVisitors(0.1);
    const distances = first.map((v, i) => Math.hypot(v.x - positions[i].x, v.z - positions[i].z));
    expect(new Set(distances).size).toBeGreaterThan(1);
  });

  it("reduces cosmetics only after their look, preserving requests and scripts", () => {
    rushAt();
    const ordinary = spawnVisitor("adult", request, { atBench: true });
    const character = spawnVisitor("judge", null, { scripted: true });
    spawnVisitor("adult", null, { scripted: true });
    for (let i = 0; i < CROWD_EXTRA; i++) {
      const v = spawnVisitor("child", null, { cosmetic: true });
      Object.assign(v, { state: "look", at: "t1", path: [], until: 100 });
    }
    for (let frame = 0; frame < 268; frame++) sampleVisitorCrowdFrame(0.03, true);
    expect(visitorCrowdStats().tier).toBe("moderate");
    visitorsTick(0);
    expect(rt.visitors.filter((v) => v.cosmetic).every((v) => v.state === "look" && v.until === 100)).toBe(true);
    expect(ordinary.request).toBe(request);
    expect(character.scripted).toBe(true);
    rt.time = 101;
    stepVisitors(0);
    expect(rt.visitors.filter((v) => v.cosmetic && v.state === "leave")).toHaveLength(4);
    expect(ordinary.state).toBe("sit");
    expect(ordinary.request).toBe(request);
    expect(character.state).toBe("walk");
    visitorsTick(0);
    expect(rt.visitors).toHaveLength(18); // Visible leavers are still counted, never deleted.
  });

  it("cleans up visitors and runtime tracking across several consecutive rushes", () => {
    for (let event = 0; event < 3; event++) {
      const ordinary = rt.visitors.filter((v) => !v.cosmetic).length;
      for (let i = ordinary; i < 3; i++) spawnVisitor("adult", null);
      for (const elapsed of [0, 8, 16, 24, 32, 40]) {
        rushAt(RUSH_SECONDS - elapsed, `repeat-${event}`);
        visitorsTick(0);
      }
      expect(visitorCrowdStats().active).toBe(CROWD_CAP);
      for (let frame = 0; frame < 20 * 30; frame++) {
        rt.time += 1 / 30;
        stepVisitors(1 / 30);
      }
      expect(visitorCrowdStats().reactionTimers).toBeGreaterThan(0);
      setGame({ model: { ...model(), rush: { ...model().rush!, phase: "waiting", event: null } } });
      visitorsTick(0);
      for (let frame = 0; frame < 45 * 30; frame++) {
        rt.time += 1 / 30;
        stepVisitors(1 / 30);
      }
      expect(visitorCrowdStats()).toMatchObject({ cosmetic: 0, reactionTimers: 0, trackedCosmetics: 0 });
    }
  });

  it("reserves normal arrival and English-question capacity even with a full cosmetic crowd", () => {
    rushAt();
    for (let i = 0; i < CROWD_EXTRA; i++) spawnVisitor("child", null, { cosmetic: true });
    rt.spawnClock = rt.nextSpawn;
    visitorsTick(0);
    expect(rt.visitors.filter((v) => !v.cosmetic)).toHaveLength(1);
    rushAt(60);
    visitorsTick(0);
    expect(rt.visitors.some((v) => !v.cosmetic && v.request)).toBe(true);
    expect(rt.visitors.length).toBeLessThanOrEqual(CROWD_CAP);
  });

  it("tours the open Gallery and Atrium as well as the halls, excluding closed rooms and the tunnel", () => {
    const m = model();
    const gallery = newTank("gallery-rush", "cylinder", "F");
    const atrium = newTank("atrium-rush", "reef", "I");
    const tunnel = newTank("tunnel-rush", "sharks", "L");
    gallery.fish = [{ id: "jelly-rush", species: "moonjelly" }];
    atrium.fish = [{ id: "reef-rush", species: "clownfish" }];
    tunnel.fish = [{ id: "shark-rush", species: "blacktip" }];
    setGame({ model: { ...m, tanks: [...m.tanks, gallery, atrium, tunnel], progress: { ...m.progress, galleryOpen: true, atriumOpen: true, tunnelOpen: true } } });
    rushAt();
    visitorsTick(0);
    const v = rt.visitors.find((visitor) => visitor.cosmetic)!;
    expect(v.plan).toEqual(expect.arrayContaining(["t1", gallery.id, atrium.id]));
    expect(v.plan).not.toContain(tunnel.id);
    resetRuntime();
    resetVisitors();
    setGame({ model: { ...model(), progress: { ...model().progress, galleryOpen: false, atriumOpen: false } } });
    visitorsTick(0);
    expect(rt.visitors.find((visitor) => visitor.cosmetic)!.plan).toEqual(["t1"]);
  });

  it("defensively prevents cosmetic requests and help rewards while ordinary tips still pay", async () => {
    const cosmetic = spawnVisitor("adult", request, { cosmetic: true });
    expect(cosmetic.request).toBeNull();
    cosmetic.seen.push("t1");
    const coins = model().coins;
    await helped(cosmetic, request, "t1");
    leave(cosmetic);
    expect(model().coins).toBe(coins);
    expect(model().stats.helped).toBe(0);
    const ordinary = spawnVisitor("adult", null);
    ordinary.seen.push("t1");
    leave(ordinary);
    expect(model().coins).toBeGreaterThan(coins);
  });

  it("persists the short-question offer budget across runtime reloads without awarding coins", () => {
    const coins = model().coins;
    rushAt(60);
    visitorsTick(0);
    let offered = rt.visitors.find((v) => v.request);
    expect(offered).toBeDefined();
    expect(offered!.cosmetic).toBe(false);
    expect(offered!.request!.kind).toBe("chatLike");
    leave(offered!);
    rushAt(30);
    visitorsTick(0);
    offered = rt.visitors.find((v) => v.request);
    expect(offered).toBeDefined();
    expect(model().paid.filter((key) => key.startsWith("rush-1:question:"))).toHaveLength(RUSH_QUESTIONS);
    expect(model().coins).toBe(coins);
    resetRuntime();
    resetVisitors();
    rushAt(1);
    visitorsTick(0);
    expect(rt.visitors.some((v) => v.request)).toBe(false);
    expect(model().coins).toBe(coins);
  });
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


describe("first tutorial visitor bench movement", () => {
  it("walks in, turns, and sits back in one continuous motion; stands forward before leaving", () => {
    // New-game model and the tutorial's exact child/show-request spawn path.
    const v = spawnVisitor("child", request);
    let previous = { x: v.x, z: v.z };
    let sitFrames = 0;
    for (let i = 0; i < 2000 && v.state !== "sit"; i++) {
      const seatBefore = v.seat;
      stepVisitors(1 / 60);
      expect(Math.hypot(v.x - previous.x, v.z - previous.z)).toBeLessThan(0.04);
      if (v.seat > 0 && v.seat < 1) {
        // Already facing away from the seat, and the hips move back from the first frame.
        expect(Math.abs(v.yaw - BENCH_FACING)).toBeLessThan(0.04);
        expect(v.z).toBe(BENCH_FRONT.z);
        if (seatBefore > 0) expect(v.x).toBeGreaterThanOrEqual(previous.x);
        if (seatBefore > 0 && v.seat < 0.6) expect(v.x).toBeGreaterThan(previous.x);
        sitFrames++;
      }
      previous = { x: v.x, z: v.z };
    }
    expect(sitFrames).toBeGreaterThan(30);
    expect(v.state).toBe("sit");
    expect(v.seat).toBe(1);
    expect(v.x).toBe(BENCH_SEAT.x);
    expect(v.request).toEqual(request);
    leave(v);
    // Setting up departure also preserves the actual seated position.
    expect(v.x).toBe(BENCH_SEAT.x);
    while (v.seat > 0) {
      stepVisitors(1 / 60);
      expect(Math.hypot(v.x - previous.x, v.z - previous.z)).toBeLessThan(0.04);
      previous = { x: v.x, z: v.z };
    }
    expect(v.x).toBe(BENCH_FRONT.x);
    expect(v.z).toBe(BENCH_FRONT.z);
  });
});

describe("ordinary seating lifecycle", () => {
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) { rt.time += 1 / 60; stepVisitors(1 / 60); }
  };

  it("spreads rest opportunities across the tour, so later-room benches get visitors too", () => {
    const m = model();
    m.tanks.push(newTank("reef", "reef", "I"));
    m.tanks[1].fish = [{ id: "reef-fish", species: "clownfish" }];
    let hallRests = 0, atriumRests = 0, skipped = 0;
    for (let seed = 1; seed <= 80; seed++) {
      rt.visitors = [];
      seedVisitors(seed);
      const v = spawnVisitor("adult", null);
      Object.assign(v, { x: 0, z: 0.9, path: [], state: "look", at: "t1", seen: ["t1"], plan: ["reef"], until: -1 });
      stepVisitors(0);
      if (v.seatId) { hallRests++; continue; }
      Object.assign(v, { x: 38, z: 1.25, path: [], state: "look", at: "reef", seen: ["t1", "reef"], plan: [], until: -1 });
      stepVisitors(0);
      if (v.seatId) atriumRests++;
      else skipped++;
    }
    expect(hallRests).toBeGreaterThan(0);
    expect(atriumRests).toBeGreaterThan(0);
    expect(skipped).toBeGreaterThan(hallRests + atriumRests);
  });

  it("sometimes rests after a tank, resumes sightseeing, and pays the same tips once", async () => {
    seedVisitors(1);
    // A deterministic sweep demonstrates both decisions through the real controller.
    let sat = 0, skipped = 0;
    for (let seed = 1; seed <= 12; seed++) {
      rt.visitors = [];
      seedVisitors(seed);
      const v = spawnVisitor("adult", null);
      Object.assign(v, { x: 0, z: 0.9, path: [], state: "look", at: "t1", seen: ["t1"], plan: ["t1"], until: -1 });
      stepVisitors(0);
      if (!v.seatId) { skipped++; continue; }
      sat++;
      const seat = SEATS.find((s) => s.id === v.seatId)!;
      const before = model().coins;
      advance(8);
      expect(v.state).toBe("sit");
      expect(v.until - rt.time).toBeGreaterThan(0);
      expect(v.until - rt.time).toBeLessThanOrEqual(14);
      expect(v.x).toBe(seat.x);
      expect(v.yaw).toBe(seat.facing);
      await openRequest(v.id);
      expect(getGame().request).toBeNull();
      expect(v.state).toBe("sit");
      rt.time = v.until + 0.01;
      stepVisitors(0);
      expect(v.seatId).toBeUndefined();
      advance(8);
      expect(v.seat).toBe(0);
      expect(v.restDecided).toBe(true);
      leave(v);
      const paid = model().coins;
      expect(paid).toBeGreaterThan(before);
      leave(v);
      expect(model().coins).toBe(paid);
    }
    expect(sat).toBeGreaterThan(0);
    expect(skipped).toBeGreaterThan(0);
  });

  it("carries on when every ordinary seat is already reserved", () => {
    for (const seat of SEATS.filter((s) => s.room === 0 && !s.requestOnly)) {
      const occupied = spawnVisitor("child", null);
      occupied.seatId = seat.id;
    }
    seedVisitors(1);
    const v = spawnVisitor("adult", null);
    Object.assign(v, { x: 0, z: 0.9, path: [], state: "look", at: "t1", seen: ["t1"], plan: ["t1"], until: -1 });
    stepVisitors(0);
    expect(v.seatId).toBeUndefined();
    expect(v.state).toBe("walk");
    expect(v.at).toBe("t1");
    expect(v.path.length).toBeGreaterThan(0);
  });

  for (const seat of SEATS.filter((s) => s.room === 3)) {
    it(`${seat.id}: sits and stands continuously, releasing on leave or reroute`, () => {
      const v = spawnVisitor("child", null);
      Object.assign(v, { ...seat.approach, yaw: seat.facing, seatId: seat.id, path: seatApproach(seat.approach, seat), plan: [], restDecided: true });
      let previous = { x: v.x, z: v.z };
      for (let i = 0; i < 240; i++) {
        advance(1 / 60);
        expect(Math.hypot(v.x - previous.x, v.z - previous.z)).toBeLessThan(0.04);
        previous = { x: v.x, z: v.z };
      }
      expect(v.state).toBe("sit");
      expect(v.seat).toBe(1);
      expect(v.yaw).toBe(seat.facing);
      leave(v);
      expect(v.seatId).toBeUndefined();
      expect(v.path.slice(0, -1)).toEqual(seatExit(v, ENTRY, seat, true));
      advance(1.4);
      expect(v.seat).toBe(0);
      expect(v.state).toBe("leave");

      const walker = spawnVisitor("adult", null);
      Object.assign(walker, { x: seat.front.x, z: (seat.front.z + seat.approach.z) / 2, seatId: seat.id });
      leave(walker);
      expect(walker.seatId).toBeUndefined();
      expect(walker.path[0]).toEqual(seat.approach);
      const rerouted = spawnVisitor("adult", null);
      Object.assign(rerouted, { ...seat.front, seatId: seat.id });
      void walkTo(rerouted, [ENTRY]);
      expect(rerouted.seatId).toBeUndefined();
      expect(rerouted.path[0]).toEqual(seat.approach);
    });
  }
});
