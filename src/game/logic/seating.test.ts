import { describe, expect, it } from "vitest";
import { chooseSeat, REQUEST_SEAT, SEATS } from "../world";
import { planRest, restDuration } from "./seating";

const ordinary = { type: "adult" as const, request: null, scripted: false };

describe("derived seat reservations", () => {
  it("excludes the request seat and chooses only in the requested room", () => {
    for (const room of [0, 3]) {
      for (const random of [0, 0.2, 0.5, 0.999]) {
        const seat = chooseSeat(room, [], () => random);
        expect(seat?.room).toBe(room);
        expect(seat?.requestOnly).toBe(false);
        expect(seat?.id).not.toBe(REQUEST_SEAT.id);
      }
    }
    expect(chooseSeat(1, [], () => 0)).toBeNull();
  });

  it("reserves a seat as soon as a live visitor approaches and prevents duplicates", () => {
    const visitors: { state: string; seatId?: string }[] = [];
    const available = SEATS.filter((seat) => seat.room === 3);
    for (let i = 0; i < available.length; i++) {
      const seat = chooseSeat(3, visitors, () => 0);
      expect(seat).not.toBeNull();
      expect(visitors.some((visitor) => visitor.seatId === seat!.id)).toBe(false);
      visitors.push({ state: i % 2 ? "sit" : "walk", seatId: seat!.id });
    }
    expect(chooseSeat(3, visitors, () => 0)).toBeNull();
  });

  it("automatically frees gone visitors and cleared seat assignments", () => {
    const first = chooseSeat(0, [], () => 0)!;
    expect(chooseSeat(0, [{ state: "gone", seatId: first.id }], () => 0)).toEqual(first);
    expect(chooseSeat(0, [{ state: "leave" }], () => 0)).toEqual(first);
    expect(chooseSeat(0, [{ state: "walk" }], () => 0)).toEqual(first);
  });

  it("carries on when all ordinary seats are full even though the request seat is free", () => {
    const visitors = SEATS.filter((seat) => seat.room === 0 && !seat.requestOnly).map((seat) => ({ state: "walk", seatId: seat.id }));
    expect(chooseSeat(0, visitors, () => 0)).toBeNull();
    expect(planRest(ordinary, 0, false, visitors, () => 0)).toEqual({ decided: true, seat: null });
  });
});

describe("ordinary resting decisions", () => {
  it("uses injected randomness to skip or select a seat", () => {
    expect(planRest(ordinary, 0, false, [], () => 0.9)).toEqual({ decided: true, seat: null });
    const rolls = [0.1, 0.999];
    const plan = planRest(ordinary, 0, false, [], () => rolls.shift()!);
    expect(plan.decided).toBe(true);
    expect(plan.seat).toEqual(SEATS.filter((seat) => seat.room === 0 && !seat.requestOnly).at(-1));
    expect(rolls).toHaveLength(0);
  });

  it("varies chance around a third by visitor type", () => {
    expect(planRest({ ...ordinary, type: "child" }, 0, false, [], () => 0.3).seat).toBeNull();
    expect(planRest(ordinary, 0, false, [], () => 0.3).seat).not.toBeNull();
    expect(planRest(ordinary, 0, false, [], () => 0.36).seat).toBeNull();
    expect(planRest({ ...ordinary, type: "grandma" }, 0, false, [], () => 0.36).seat).not.toBeNull();
  });

  it("never rests requests or scripted visitors and decides at most once per visit", () => {
    const random = () => { throw new Error("ineligible visitors must not roll"); };
    for (const visitor of [{ ...ordinary, request: {} }, { ...ordinary, scripted: true }, { ...ordinary, restDecided: true }]) {
      expect(planRest(visitor, 0, false, [], random)).toEqual({ decided: false, seat: null });
    }
  });

  it("uses the current room, or Hall 1 when leaving a room without seats", () => {
    expect(planRest(ordinary, 3, false, [], () => 0).seat?.room).toBe(3);
    expect(planRest(ordinary, 0, false, [], () => 0).seat?.room).toBe(0);
    expect(planRest(ordinary, 1, false, [], () => 0)).toEqual({ decided: false, seat: null });
    expect(planRest(ordinary, 2, true, [], () => 0).seat?.room).toBe(0);
  });

  it("rests for 6–14 seconds with shorter fast-mode durations", () => {
    expect(restDuration(false, () => 0)).toBe(6);
    expect(restDuration(false, () => 1)).toBe(14);
    expect(restDuration(true, () => 0)).toBeCloseTo(0.8);
    expect(restDuration(true, () => 1)).toBeCloseTo(1.4);
  });
});
