import { expect, type Page } from "@playwright/test";
import { answer, click3d, hook, playing, precondition, settle, shot, stageOk, state, tapFirstFish, waitFor, type AtState } from "./helpers";

/**
 * The whole Phase 1 loop through the real UI: buttons are clicked, 3D things
 * are clicked at their projected screen positions, English is tapped (Tap
 * mode) or spoken into the stub recogniser (Speak mode). The test hook only
 * reads state, freezes fish for clicking, and seats request visitors on the
 * bench (instead of waiting for random arrivals).
 */

export type AnswerMode = "tap" | "speak";

const SPOKEN: Record<string, string> = {
  orangePlease: "orange please",
  turtlePlease: "a turtle, please",
  jellyfishPlease: "jellyfish please",
  itsTurtle: "it's a turtle",
  itsJellyfish: "it's a jellyfish",
  bluePlease: "Blue, please!",
  yellowPlease: "yellow please",
  redPlease: "red please",
  bigPlease: "big please",
  smallPlease: "small please",
  feedFish: "feed the fish",
  cleanPlease: "clean please",
  n1: "one",
  n2: "two fish",
  n3: "three fish",
  n4: "four",
  n5: "five fish",
  yesIDo: "yes I do",
  noIDont: "no I don't",
  likeBlue: "I like blue"
};

export const reply = (page: Page, id: string) => answer(page, id, SPOKEN[id] ?? id);

export async function toRoom(page: Page) {
  const s = await state(page);
  if (s.view === "tank") {
    // The game may already be on its way back to the room (a scripted moment).
    await page.getByTestId("btn-back").click({ timeout: 5_000 }).catch(() => undefined);
    await waitFor(page, (x) => x.view === "room", 5_000, "room view");
    await settle(page, 700);
  }
}

export async function openTank(page: Page, tankId: string) {
  const s = await state(page);
  if (s.view === "tank" && s.tankId === tankId) return;
  await toRoom(page);
  // Tanks on pads C–E are in the Ocean Hall.
  const slot = (await state(page)).tanks.find((t) => t.id === tankId)!.slot;
  const hall = ["C", "D", "E"].includes(slot) ? 1 : 0;
  if ((await state(page)).hall !== hall) {
    // The arrows hide while a scripted moment (the judge) runs: fail, don't hang.
    await page.getByTestId(hall ? "btn-hall-next" : "btn-hall-prev").click({ timeout: 5_000 });
    await waitFor(page, (x) => x.hall === hall, 5_000, `hall ${hall}`);
    await settle(page, 1200);
  }
  await click3d(page, "tank", tankId);
  await waitFor(page, (x) => x.view === "tank" && x.tankId === tankId, 5_000, `close-up of ${tankId}`);
  await settle(page, 1100);
}

/** Tap a fish of this species in the tank (fish frozen so the click lands). */
export async function tapFishOf(page: Page, tankId: string, species: string) {
  await openTank(page, tankId);
  await hook(page, "freezeFish", true);
  await settle(page, 300);
  const s = await state(page);
  const t = s.tanks.find((x) => x.id === tankId)!;
  const i = t.fish.indexOf(species);
  expect(i).toBeGreaterThanOrEqual(0);
  await click3d(page, "fish", t.fishIds[i]);
  await hook(page, "freezeFish", false);
}

async function helpVisitor(page: Page, req: Record<string, unknown>, type = "adult") {
  await playing(page);
  await toRoom(page);
  const before = (await state(page)).progress.hearts;
  await hook(page, "requestVisitor", type, req);
  await page.getByTestId("chip-visitor").click();
  return before;
}

export async function helpChat(page: Page) {
  const before = await helpVisitor(page, { kind: "chatLike" }, "child");
  await reply(page, "yesIDo");
  await waitFor(page, (s) => s.progress.hearts === before + 1, 15_000, "chat helped");
}

export async function helpCount(page: Page, tankId: string) {
  const before = await helpVisitor(page, { kind: "count", tankId }, "child");
  const s = await waitFor(page, (x) => x.prompt?.question === "How many fish?", 10_000, "count prompt");
  const n = s.tanks.find((t) => t.id === tankId)!.fish.length;
  await shot(page, "count-request");
  await reply(page, `n${n}`);
  await waitFor(page, (x) => x.progress.hearts === before + 1, 15_000, "count helped");
}

export async function helpShow(page: Page, color: string, tankId: string, species: string) {
  const before = await helpVisitor(page, { kind: "show", color, fishOnly: true }, "adult");
  await waitFor(page, (s) => s.request?.kind === "show", 10_000, "show request");
  await tapFishOf(page, tankId, species);
  await waitFor(page, (s) => s.progress.hearts === before + 1, 15_000, "show helped");
}

async function buyFish(page: Page, phrase: string, tankId: string) {
  await playing(page);
  await toRoom(page);
  await page.getByTestId("btn-fish-shop").click();
  await reply(page, phrase);
  await waitFor(page, (s) => s.placing?.kind === "fish", 5_000, "carrying the fish");
  await settle(page, 600);
  const count = (await state(page)).tanks.find((t) => t.id === tankId)!.fish.length;
  await click3d(page, "tank", tankId);
  await waitFor(page, (s) => s.tanks.find((t) => t.id === tankId)!.fish.length === count + 1, 5_000, "fish poured in");
}

export async function earnTo(page: Page, coins: number) {
  while ((await state(page)).coins < coins) await helpChat(page);
}

const judgeComing = (s: AtState) => s.progress.allHappy || s.mode !== "play" || Boolean(s.line);

/**
 * Stage 5: feed and clean every tank, and add a coral where the fish are not
 * happy yet (decorations are what make fish happy). The judge comes the
 * moment every tank is happy, so every step first checks that it has not.
 */
export async function makeHappy(page: Page, ids: string[]) {
  await page.waitForTimeout(1500);
  for (let round = 0; round < 3 && !judgeComing(await state(page)); round++) {
    for (const id of ids) {
      if (judgeComing(await state(page))) break;
      const opened = await openTank(page, id).then(
        () => true,
        () => false
      );
      if (!opened) break;
      for (const btn of ["btn-feed", "btn-clean"]) {
        const b = page.getByTestId(btn);
        if (await b.isVisible()) await b.click({ timeout: 3_000 }).catch(() => undefined);
      }
      await page.waitForTimeout(400);
      const now = await state(page);
      const t = now.tanks.find((x) => x.id === id)!;
      if (judgeComing(now) || (t.happy ?? 0) >= 72) continue;
      // Not happy enough: a coral in a free slot.
      const used = new Set(t.decor.map((d) => d.slot));
      const slots = { small: 3, big: 5, tall: 2, ocean: 6 }[t.type as "small" | "big" | "tall" | "ocean"];
      const free = [0, 1, 2, 3, 4, 5].find((i) => !used.has(i) && i < slots);
      if (free === undefined) continue;
      await earnTo(page, 10);
      if (judgeComing(await state(page))) break;
      await openTank(page, id);
      await page.getByTestId("btn-decorate").click();
      await page.getByTestId("tray-shop").click();
      await page.locator("[data-testid=decor-card][data-kind=coral]").click();
      await reply(page, "redPlease");
      await waitFor(page, (x) => x.placing?.kind === "decor", 5_000, "placing a coral");
      await click3d(page, "slot", `${id}:${free}`);
      await waitFor(page, (x) => x.tanks.find((tt) => tt.id === id)!.decor.length === t.decor.length + 1, 5_000, "coral placed");
      const done = page.getByTestId("btn-done-decor");
      if (await done.isVisible()) await done.click({ timeout: 3_000 }).catch(() => undefined);
    }
  }
  await waitFor(page, (x) => x.progress.allHappy, 20_000, "all happy");
}

/** Stage 1: Pico's tutorial. */
export async function tutorial(page: Page) {
  if (!(await state(page)).prompt) await tapFirstFish(page);
  await waitFor(page, (s) => s.prompt?.question === "Blue or orange?", 20_000, "fish shop");
  await shot(page, "shop");
  await reply(page, "orangePlease");
  let s = await waitFor(page, (x) => x.placing?.kind === "fish", 5_000, "fish in a bag");
  expect(s.coins).toBe(80);
  await settle(page, 700);
  await shot(page, "carry-fish");
  await click3d(page, "tank", "t1");
  s = await waitFor(page, (x) => x.view === "tank" && x.tanks[0].fish.length === 1, 8_000, "fish in the tank");
  await waitFor(page, (x) => x.tutorial === "feed", 8_000, "feed step");
  await settle(page, 1200);
  await shot(page, "tank-closeup");
  await page.getByTestId("btn-feed").click();
  await shot(page, "feed-prompt");
  await reply(page, "feedFish");
  s = await waitFor(page, (x) => x.pellets > 0, 5_000, "pellets");
  expect(s.tanks[0].food).toBeGreaterThan(90);
  await shot(page, "feeding");
  // The tutorial visitor asks for the colour that was bought.
  await precondition(page, (x) => x.tutorial === "visitor" && x.mode === "play" && Boolean(x.waiting) && !x.line, "tutorial visitor waiting", 40_000);
  await page.getByTestId("chip-visitor").click();
  s = await waitFor(page, (x) => x.request?.kind === "show", 10_000, "tutorial visitor request");
  expect(s.request!.color).toBe("orange");
  await settle(page, 800);
  await shot(page, "visitor-request");
  await tapFishOf(page, "t1", "clownfish");
  await waitFor(page, (x) => x.progress.hearts === 1, 10_000, "visitor helped");
  await shot(page, "visitor-happy");
  await stageOk(page, 1);
  s = await waitFor(page, (x) => x.panel === "decorate" && x.mode === "play", 20_000, "decorate step");
  expect(s.inv.decor.map((d) => d.kind).sort()).toEqual(["plant", "shell"]);
  await settle(page, 900);
  await page.locator("[data-testid=tray-item][data-kind=plant]").click();
  await shot(page, "decorate");
  await click3d(page, "slot", "t1:0");
  await waitFor(page, (x) => x.tanks[0].decor.length === 1, 5_000, "plant placed");
  s = await waitFor(page, (x) => x.tutorial === "done" && x.mode === "play" && !x.line, 20_000, "tutorial done");
  expect(s.stage).toBe(2);
}

/** Stages 2–5, the judge, the trophy and free play. */
export async function stagesTwoToFive(page: Page) {
  await hook(page, "visitors", false);
  // ---- Stage 2: a second fish, Pico's count, a clean.
  await buyFish(page, "bluePlease", "t1");
  let s = await waitFor(page, (x) => x.prompt?.question === "How many fish?", 15_000, "Pico counts");
  await shot(page, "pico-count");
  await reply(page, "n2");
  s = await waitFor(page, (x) => x.progress.counted, 10_000, "counted");
  await playing(page);
  await openTank(page, "t1");
  await page.getByTestId("btn-clean").click();
  await reply(page, "cleanPlease");
  await stageOk(page, 2);
  await playing(page);
  s = await state(page);
  expect(s.stage).toBe(3);
  // ---- Stage 3: three visitors.
  await helpShow(page, "blue", "t1", "bluetang");
  await shot(page, "show-helped");
  await helpCount(page, "t1");
  await helpChat(page);
  await stageOk(page, 3);
  await playing(page);
  // ---- Stage 4: the big tank.
  await earnTo(page, 80);
  await toRoom(page);
  await page.getByTestId("btn-tank-shop").click();
  await shot(page, "tank-shop");
  const coins = (await state(page)).coins;
  await page.getByTestId("btn-buy-tank").click();
  await waitFor(page, (x) => x.placing?.kind === "tank" && x.coins === coins - 80, 5_000, "carrying the tank");
  await settle(page, 600);
  await click3d(page, "pad", "B");
  await waitFor(page, (x) => x.placing?.slot === "B", 5_000, "preview on pad B");
  await shot(page, "tank-preview");
  await page.getByTestId("btn-confirm-tank").click();
  s = await waitFor(page, (x) => x.tanks.length === 2, 5_000, "big tank placed");
  const big = s.tanks.find((t) => t.type === "big")!.id;
  await earnTo(page, 20);
  await buyFish(page, "orangePlease", big);
  // Decorate it: the free shell from the tray, and a bought coral.
  await earnTo(page, 10);
  await openTank(page, big);
  await page.getByTestId("btn-decorate").click();
  await page.locator("[data-testid=tray-item][data-kind=shell]").click();
  await click3d(page, "slot", `${big}:0`);
  await waitFor(page, (x) => x.tanks.find((t) => t.id === big)!.decor.length === 1, 5_000, "shell placed");
  await page.getByTestId("tray-shop").click();
  await page.locator("[data-testid=decor-card][data-kind=coral]").click();
  await shot(page, "coral-prompt");
  await reply(page, "redPlease");
  await waitFor(page, (x) => x.placing?.kind === "decor", 5_000, "placing the coral");
  await click3d(page, "slot", `${big}:4`);
  await stageOk(page, 4);
  // The fish fan's photo day.
  s = await waitFor(page, (x) => x.progress.photo, 60_000, "photo day");
  await shot(page, "photo-day");
  await playing(page);
  expect(s.stage).toBe(5);
  // ---- Stage 5: three visitors and happy fish everywhere, then the judge.
  await helpChat(page);
  await helpCount(page, "t1");
  await helpChat(page);
  await makeHappy(page, ["t1", big]);
  // The judge.
  s = await waitFor(page, (x) => x.request?.kind === "show" && x.request.by === "judge", 60_000, "judge's show request");
  await shot(page, "judge-request");
  const color = s.request!.color!;
  const target = s.tanks.find((t) => t.fish.some((f) => (color === "orange" ? f === "clownfish" : color === "blue" ? f === "bluetang" : f === "yellowfish")))!;
  await tapFishOf(page, target.id, color === "orange" ? "clownfish" : color === "blue" ? "bluetang" : "yellowfish");
  s = await waitFor(page, (x) => x.prompt?.question === "How many fish?", 40_000, "judge counts");
  const counted = s.tanks.filter((t) => t.fish.length >= 2 && t.fish.length <= 5);
  await reply(page, `n${counted[0].fish.length}`);
  await waitFor(page, (x) => x.prompt?.question === "Do you like your aquarium?", 40_000, "judge asks");
  await reply(page, "yesIDo");
  s = await waitFor(page, (x) => x.screen === "results", 40_000, "results");
  expect(s.progress.star).toBe(true);
  await shot(page, "results");
  await expect(page.getByTestId("results-said")).toContainText("Feed the fish!");
  await expect(page.getByTestId("btn-keep-playing")).toContainText("Continue");
  await expect(page.getByTestId("btn-results-title")).toHaveCount(0);
  const beforeContinue = s;
  await page.getByTestId("btn-keep-playing").click();
  s = await waitFor(page, (x) => x.screen === "game" && x.mode === "play", 10_000, "free play");
  expect(s.stage).toBe(6);
  expect(s.tanks.map(({ id, type, slot, fishIds, decor }) => ({ id, type, slot, fishIds, decor })))
    .toEqual(beforeContinue.tanks.map(({ id, type, slot, fishIds, decor }) => ({ id, type, slot, fishIds, decor })));
  expect(s.coins).toBeGreaterThanOrEqual(beforeContinue.coins);
  expect(s.progress.hearts).toBe(beforeContinue.progress.hearts);
  expect(s.progress.freePlay).toBe(true);
  await shot(page, "free-play");
}

export function fishOf(s: AtState, tankId: string) {
  return s.tanks.find((t) => t.id === tankId)?.fish ?? [];
}
