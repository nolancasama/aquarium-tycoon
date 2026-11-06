import { expect, test, type Page } from "@playwright/test";
import { answer, boot, click3d, hook, state, waitFor } from "./helpers";

/**
 * Shark Tunnel: unlock and open it from the Atrium, the arrival, a structure
 * placed on a zone, an eagle ray bought at the animal counter (Tap mode) and
 * placed, feeding, viewpoints, leaving and returning, a reload. Then walking the
 * tunnel: keyboard movement, never leaving the walkway or the tube, a visitor's
 * question answered by tapping, Back to Aquarium, and a reload.
 */

let id = 200;
const tank = (type: string, slot: string, species: string[] = [], decor: Array<[string, string | null, number]> = []) => ({
  id: `t${id++}`, type, slot, food: 90, clean: 95,
  fish: species.map((s) => ({ id: `f${id++}`, species: s })),
  decor: decor.map(([kind, variant, slot]) => ({ id: `d${id++}`, kind, variant, slot })),
  upgrades: { filter: false, lamp: false }
});
function save(opts: { open: boolean; coins: number; milestone?: number }) {
  const tanks = [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]), tank("cylinder", "G", ["moonjelly"]),
    tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish"])];
  if (opts.open) tanks.push(tank("sharks", "L", ["blacktip", "blacktip", "eagleray"], [["tunnelArch", null, 0], ["tunnelShelf", null, 3]]));
  return {
    coins: opts.coins, tanks, inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
      hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true, atriumOpen: true,
      atriumIntroSeen: true, superStar: true, tipsTaught: true, tickets: true, said: [],
      ...(opts.open ? { tunnelOpen: true, tunnelIntroSeen: true, tunnel: { milestone: opts.milestone ?? 1, observed: 0, helped: 0, findDone: false, whereDone: false, countDone: false, trophy: false } } : {}) },
    stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
  };
}

async function load(page: Page, model: unknown) {
  await page.addInitScript((m) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model: m }));
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true, answerMode: "tap" }));
  }, model);
  const errors = await boot(page, "fast=1&seed=3");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (s) => s.screen === "game", 20_000, "game");
  for (let i = 0; i < 4 && (await page.getByTestId("next").count()); i++) await page.getByTestId("next").click();
  await hook(page, "visitors", false);
  return errors;
}

type Tunnel = { roomId: string; tunnelOpen: boolean; tunnelMilestone: number; tunnelObserved: number; habitatTankId: string | null; tunnelView: string };
const tstate = (page: Page) => state(page) as unknown as Promise<Awaited<ReturnType<typeof state>> & Tunnel>;
const tun = <T = unknown>(page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([n, a]) => (window as never as { __tunnel: Record<string, (...x: unknown[]) => unknown> }).__tunnel[n as string](...(a as unknown[])), [name, args] as const) as Promise<T>;

test("open, stock, decorate and care for the Shark Tunnel; everything survives a reload", async ({ page }) => {
  const errors = await load(page, save({ open: false, coins: 700 }));
  await hook(page, "set", { hall: 3, view: "room", tankId: null, panel: null });
  await page.waitForTimeout(1200);
  await click3d(page, "tunnel-door");
  await expect(page.getByTestId("btn-buy-shark-tunnel")).toBeVisible();
  await page.getByTestId("btn-buy-shark-tunnel").click();
  let s = await waitFor(page, (x) => (x as unknown as Tunnel).roomId === "sharks", 10_000, "in the wing");
  const t = s as unknown as Tunnel;
  expect(t.tunnelOpen).toBe(true);
  expect(t.tunnelMilestone).toBe(1);
  const habitat = s.tanks.find((x) => x.type === "sharks")!;
  expect(habitat.fish).toEqual(["blacktip"]);
  expect(s.coins).toBe(700 - 300);
  // The arrival reveal and its card, then skip.
  await expect(page.getByTestId("tunnel-arrival")).toBeVisible();
  await page.getByTestId("tunnel-arrival").getByRole("button").click();
  await expect(page.getByTestId("btn-explore")).toBeVisible();
  await expect(page.getByTestId("habitat-capacity")).toContainText("3/16");

  // A structure: buy it with English (Tap mode), then place it on zone 2.
  await page.getByTestId("btn-decor-shop").click();
  await page.locator("[data-testid=decor-card]").first().click();
  await answer(page, "archPlease");
  await waitFor(page, (x) => x.panel === "decorate" && x.placing?.kind === "decor", 10_000, "placing the arch");
  await page.waitForTimeout(900);
  await click3d(page, "slot", `${habitat.id}:2`);
  s = await waitFor(page, (x) => x.tanks.find((k) => k.id === habitat.id)!.decor.some((d) => d.kind === "tunnelArch" && d.slot === 2), 10_000, "arch on zone 2");
  await page.getByTestId("btn-done-decor").click();

  // An eagle ray from the animal counter (only tunnel animals are offered here).
  await page.getByTestId("btn-animal-shop").click();
  await answer(page, "eaglerayPlease");
  await waitFor(page, (x) => x.placing?.kind === "fish", 10_000, "carrying the ray");
  await page.waitForTimeout(600);
  await click3d(page, "tank", habitat.id);
  s = await waitFor(page, (x) => x.tanks.find((k) => k.id === habitat.id)!.fish.includes("eagleray"), 10_000, "ray placed");
  await expect(page.getByTestId("habitat-capacity")).toContainText("5/16");

  // Care, viewpoints, out and back.
  await hook(page, "setCare", habitat.id, 40, 50);
  await page.getByTestId("btn-feed").click();
  await waitFor(page, (x) => x.tanks.find((k) => k.id === habitat.id)!.food > 40, 5_000, "fed");
  await page.getByTestId("btn-clean").click();
  await waitFor(page, (x) => x.tanks.find((k) => k.id === habitat.id)!.clean === 100, 5_000, "cleaned");
  await page.getByTestId("view-left").click();
  expect((await tstate(page)).tunnelView).toBe("left");
  await page.getByTestId("view-whole").click();
  await page.getByTestId("btn-hall-prev").click();
  await waitFor(page, (x) => (x as unknown as Tunnel).roomId === "atrium", 5_000, "back in the Atrium");
  await page.waitForTimeout(500);
  await page.getByTestId("btn-hall-next").click();
  await waitFor(page, (x) => (x as unknown as Tunnel).roomId === "sharks", 5_000, "back in the wing");
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByTestId("btn-continue").click();
  s = await waitFor(page, (x) => x.screen === "game", 20_000, "reloaded");
  const after = s.tanks.find((x) => x.type === "sharks")!;
  expect(after.fish.sort()).toEqual(["blacktip", "eagleray"]);
  expect(after.decor.find((d) => d.slot === 2)?.kind).toBe("tunnelArch");
  expect((s as unknown as Tunnel).tunnelMilestone).toBe(1);
  expect(errors).toEqual([]);
});

test("walk the tunnel, stay on the walkway, help a visitor, come back; progress survives a reload", async ({ page }) => {
  const errors = await load(page, save({ open: true, coins: 300, milestone: 1 }));
  await hook(page, "visitors", false);
  await hook(page, "set", { hall: 4, view: "room", tankId: null, panel: null });
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-explore").click();
  let st = await page.waitForFunction(() => (window as never as { __tunnel: { state(): { active: boolean } } }).__tunnel.state().active, null, { timeout: 10_000 });
  void st;
  await expect(page.getByTestId("btn-back-aquarium")).toBeVisible();
  await expect(page.getByTestId("joystick")).toBeVisible();
  const s0 = await tun<{ s: number; section: string }>(page, "state");
  expect(s0.section).toBe("entrance");
  // Walk with the keyboard: forward goes along the loop.
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(2500);
  await page.keyboard.up("ArrowUp");
  const s1 = await tun<{ s: number }>(page, "state");
  expect(s1.s - s0.s).toBeGreaterThan(2);
  // Push sideways for a long time: the player never leaves the walkway; the camera stays in the tube.
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(2500);
  await page.keyboard.up("ArrowLeft");
  const s2 = await tun<{ lateral: number; tube: { lateral: number; y: number; maxLateral: number; maxY: number } }>(page, "state");
  expect(Math.abs(s2.lateral)).toBeLessThanOrEqual(1.26);
  for (const sec of ["mainCurve", "grandChamber", "returnLeg"]) {
    await tun(page, "goTo", (await tun<number>(page, "sectionStart", sec)) + 2, 0);
    await page.waitForTimeout(1500);
    const c = await tun<{ tube: { lateral: number; y: number; maxLateral: number; maxY: number } }>(page, "state");
    expect(Math.abs(c.tube.lateral), `${sec} camera inside`).toBeLessThanOrEqual(c.tube.maxLateral + 0.05);
    expect(c.tube.y, `${sec} camera under the glass`).toBeLessThanOrEqual(c.tube.maxY + 0.05);
  }
  // A visitor asks "Can it swim?": answered by tapping (no microphone).
  await tun(page, "activity", "can", "shark", true);
  const prompt = await waitFor(page, (x) => Boolean(x.prompt), 15_000, "can question");
  expect(prompt.prompt!.choices.sort()).toEqual(["noItCant", "yesItCan"]);
  const q = prompt.prompt!.question ?? "";
  await answer(page, q.includes("swim") ? "yesItCan" : "noItCant");
  for (let i = 0; i < 4 && (await page.getByTestId("next").count()); i++) await page.getByTestId("next").click();
  await page.waitForFunction(() => !(window as never as { __tunnel: { state(): { activity: unknown } } }).__tunnel.state().activity, null, { timeout: 10_000 });
  expect((await tstate(page)).tunnelObserved).toBe(1);
  await page.getByTestId("btn-back-aquarium").click();
  await page.waitForFunction(() => !(window as never as { __tunnel: { state(): { active: boolean } } }).__tunnel.state().active, null, { timeout: 10_000 });
  await expect(page.getByTestId("btn-explore")).toBeVisible();
  await page.reload();
  await page.getByTestId("btn-continue").click();
  const r = await waitFor(page, (x) => x.screen === "game", 20_000, "reloaded");
  expect((r as unknown as Tunnel).tunnelObserved).toBe(1);
  expect(errors).toEqual([]);
});
