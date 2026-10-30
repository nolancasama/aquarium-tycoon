import { describe, expect, it } from "vitest";
import { newTapReminder, tapReminder } from "./tapReminder";

describe("movement-key tap reminders", () => {
  it("recognises arrows and physical WASD without changing other keys", () => {
    for (const code of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]) {
      expect(tapReminder(newTapReminder(), code, "buy", 1, 0)).not.toBeNull();
    }
    for (const code of ["Space", "Enter", "Escape", "Digit1", "KeyQ"]) {
      expect(tapReminder(newTapReminder(), code, "buy", 1, 0)).toBeNull();
    }
  });

  it("waits twenty seconds between reminders, including across tutorial completion", () => {
    const first = tapReminder(newTapReminder(), "KeyW", "buy", 1, 0)!;
    expect(tapReminder(first, "ArrowRight", "done", 1, 19.99)).toBeNull();
    expect(tapReminder(first, "ArrowRight", "done", 1, 20)).toEqual({ lastAt: 20, afterTutorial: 1 });
  });

  it("allows only three post-tutorial reminders in early levels", () => {
    let state = newTapReminder();
    for (const now of [0, 20, 40, 60]) state = tapReminder(state, "KeyW", "feed", 1, now)!;
    expect(state.afterTutorial).toBe(0);
    for (const now of [80, 100, 120]) state = tapReminder(state, "KeyW", "done", 2, now)!;
    expect(state.afterTutorial).toBe(3);
    expect(tapReminder(state, "KeyW", "done", 2, 140)).toBeNull();
    expect(tapReminder(newTapReminder(), "ArrowUp", "done", 3, 0)).toBeNull();
  });
});
