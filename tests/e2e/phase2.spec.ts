import { expect, test, type Page } from "@playwright/test";
import { boot, click3d, hook, playing, settle, shot, stageOk, state, waitFor } from "./helpers";
import { earnTo, helpChat, makeHappy, openTank, reply, tapFishOf, toRoom } from "./flows";

/** A starred aquarium at Level 6: the small tank (clownfish, blue tang, a plant) and the big tank (a clownfish, a shell, a coral). */
const STARRED = {
  v: 2,
  model: {
    coins: 400,
    tanks: [
      { id: "t1", type: "small", slot: "A", fish: [{ id: "f2", species: "clownfish" }, { id: "f3", species: "bluetang" }], decor: [{ id: "d4", kind: "plant", variant: "small", slot: 0 }], food: 100, clean: 100 },
      { id: "t5", type: "big", slot: "B", fish: [{ id: "f6", species: "clownfish" }], decor: [{ id: "d7", kind: "shell", variant: null, slot: 0 }, { id: "d8", kind: "coral", variant: "red", slot: 4 }], food: 100, clean: 100 }
    ],
    inv: { fish: [], decor: [], tanks: [] },
    progress: { stage: 6, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true, hearts: 10, photo: true, star: true, freePlay: true, said: ["orangePlease", "feedFish"] },
    stats: { coinsEarned: 300, helped: 10, fishBought: 3, seconds: 1500 },
    nextId: 9,
    paid: []
  }
};

async function continueStarred(page: Page, mic: boolean) {
  await page.addInitScript(
    ([save, m]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("at.save.v1", JSON.stringify(save));
      localStorage.setItem("at.settings.v1", JSON.stringify({ mic: m, music: 0, sfx: 0, japanese: true, slowVoice: false }));
    },
    [STARRED, mic] as const
  );
  const errors = await boot(page);
  await page.getByTestId("btn-continue").click();
  await playing(page);
  await hook(page, "visitors", false);
  return errors;
}

async function buyAnimal(page: Page, phrase: string) {
  await playing(page);
  await toRoom(page);
  await page.getByTestId("btn-animal-shop").click();
  await waitFor(page, (s) => s.prompt?.question === "What do you want?", 10_000, "animal counter");
  await shot(page, "animal-counter");
  await reply(page, phrase);
  await waitFor(page, (s) => s.placing?.kind === "fish", 5_000, "carrying the animal");
  await settle(page, 600);
}

async function helpRequest(page: Page, req: Record<string, unknown>, type = "explorer") {
  await playing(page);
  await toRoom(page);
  const before = (await state(page)).progress.hearts;
  await hook(page, "requestVisitor", type, req);
  await page.getByTestId("chip-visitor").click();
  return before;
}

test("Phase 2: the Ocean Hall, a turtle, a tall tank of jellyfish, upgrades, the crown", async ({ page }) => {
  // Three levels and a judge: longer than the default limit under a loaded suite.
  test.setTimeout(420_000);
  const errors = await continueStarred(page, false);
  let s = await state(page);
  expect(s.stage).toBe(6);
  expect(s.goals.map((g) => g.id)).toEqual(["openHall", "turtle", "help"]);
  await shot(page, "level6-room");

  // ---- Level 6: the Ocean Hall.
  await page.getByTestId("btn-tank-shop").click();
  await expect(page.getByTestId("btn-buy-tall")).toBeDisabled();
  await shot(page, "tank-shop-hall-offer");
  await page.getByTestId("btn-buy-hall").click();
  s = await waitFor(page, (x) => x.progress.hallOpen && x.tanks.some((t) => t.type === "ocean"), 5_000, "hall open");
  expect(s.coins).toBe(300);
  await settle(page, 1500);
  await shot(page, "ocean-hall");
  const ocean = s.tanks.find((t) => t.type === "ocean")!.id;

  // A turtle, ordered by name. It cannot live in the small tank.
  await buyAnimal(page, "turtlePlease");
  await page.getByTestId("btn-hall-prev").click();
  await settle(page, 1200);
  await click3d(page, "tank", "t1");
  await page.waitForTimeout(500);
  s = await state(page);
  expect(s.placing?.kind).toBe("fish");
  expect(s.tanks.find((t) => t.id === "t1")!.fish).toHaveLength(2);
  await expect(page.getByTestId("toast").last()).toContainText("Not here");
  await page.getByTestId("btn-hall-next").click();
  await settle(page, 1200);
  await click3d(page, "tank", ocean);
  s = await waitFor(page, (x) => x.tanks.find((t) => t.id === ocean)!.fish.includes("turtle"), 5_000, "turtle home");
  await settle(page, 1500);
  await shot(page, "turtle-closeup");

  // "I like turtles!" and a chat.
  await helpRequest(page, { kind: "showAnimal", species: "turtle" });
  await expect(page.getByTestId("request-line")).toHaveText("I like turtles!");
  await tapFishOf(page, ocean, "turtle");
  await waitFor(page, (x) => x.progress.helpedInStage === 1, 10_000, "turtle shown");
  await helpChat(page);
  await stageOk(page, 6);
  s = await waitFor(page, (x) => x.stage === 7 && x.mode === "play" && !x.line, 20_000, "Level 7");

  // ---- Level 7: a tall tank of jellyfish, and two "What's this?".
  await toRoom(page);
  await page.getByTestId("btn-tank-shop").click();
  await page.getByTestId("btn-buy-tall").click();
  await waitFor(page, (x) => x.placing?.kind === "tank", 5_000, "carrying the tall tank");
  await settle(page, 800);
  await click3d(page, "pad", "D");
  await waitFor(page, (x) => x.placing?.slot === "D", 5_000, "preview on D");
  await page.getByTestId("btn-confirm-tank").click();
  s = await waitFor(page, (x) => x.tanks.some((t) => t.type === "tall"), 5_000, "tall tank placed");
  const tall = s.tanks.find((t) => t.type === "tall")!.id;
  await buyAnimal(page, "jellyfishPlease");
  await click3d(page, "tank", tall);
  s = await waitFor(page, (x) => x.tanks.find((t) => t.id === tall)!.fish.includes("jellyfish"), 5_000, "jellyfish home");
  await settle(page, 1500);
  await shot(page, "jellyfish-closeup");
  const turtleId = s.tanks.find((t) => t.id === ocean)!.fishIds[0];
  const jellyId = s.tanks.find((t) => t.id === tall)!.fishIds[0];
  await helpRequest(page, { kind: "whatsThis", tankId: ocean, fishId: turtleId }, "grandma");
  s = await waitFor(page, (x) => x.prompt?.question === "What's this?", 10_000, "what's this (turtle)");
  expect(s.glowFish).toBe(1);
  await shot(page, "whats-this");
  await reply(page, "itsTurtle");
  await waitFor(page, (x) => x.progress.namedInStage === 1, 10_000, "named the turtle");
  await helpRequest(page, { kind: "whatsThis", tankId: tall, fishId: jellyId }, "child");
  await waitFor(page, (x) => x.prompt?.question === "What's this?", 10_000, "what's this (jellyfish)");
  await reply(page, "itsJellyfish");
  await stageOk(page, 7);
  s = await waitFor(page, (x) => x.stage === 8 && x.mode === "play" && !x.line, 20_000, "Level 8");

  // ---- Level 8: an upgrade (the jellyfish love the lamp), visitors, happy animals, the judge.
  await openTank(page, tall);
  await page.getByTestId("btn-upgrade").click();
  await shot(page, "upgrades");
  await page.getByTestId("btn-up-lamp").click();
  await expect(page.getByTestId("up-owned-lamp")).toBeVisible();
  await page.getByTestId("upgrade-close").click();
  await earnTo(page, 40);
  await helpChat(page);
  await helpChat(page);
  await helpChat(page);
  await makeHappy(page, ["t1", "t5", ocean, tall]);
  s = await waitFor(page, (x) => x.prompt?.question === "What's this?", 60_000, "the judge asks");
  await reply(page, s.prompt!.choices.includes("itsTurtle") ? "itsTurtle" : "itsJellyfish");
  s = await waitFor(page, (x) => x.prompt?.question === "How many fish?", 40_000, "the judge counts");
  const counted = s.tanks.filter((t) => t.fish.length >= 2 && t.fish.length <= 8 && t.fish.every((f) => ["clownfish", "bluetang", "yellowfish", "pufferfish"].includes(f)));
  await reply(page, `n${counted[0].fish.length}`);
  await waitFor(page, (x) => x.prompt?.question === "Do you like sea animals?", 40_000, "the last question");
  await reply(page, "yesIDo");
  s = await waitFor(page, (x) => x.screen === "results", 40_000, "results");
  expect(s.progress.superStar).toBe(true);
  await expect(page.getByTestId("results")).toContainText("Super Aquarium Star");
  await shot(page, "super-results");
  await expect(page.getByTestId("btn-keep-playing")).toContainText("Continue");
  await expect(page.getByTestId("btn-results-title")).toHaveCount(0);
  const beforeContinue = s;
  await page.getByTestId("btn-keep-playing").click();
  s = await waitFor(page, (x) => x.screen === "game" && x.mode === "play", 10_000, "free play");
  expect(s.stage).toBe(8);
  expect(s.progress.superStar).toBe(true);
  expect(s.tanks.map(({ id, type, slot, fishIds, decor }) => ({ id, type, slot, fishIds, decor })))
    .toEqual(beforeContinue.tanks.map(({ id, type, slot, fishIds, decor }) => ({ id, type, slot, fishIds, decor })));
  expect(s.coins).toBeGreaterThanOrEqual(beforeContinue.coins);
  expect(s.progress.hearts).toBe(beforeContinue.progress.hearts);
  expect(s.goals).toEqual([]);
  expect(errors).toEqual([]);
});

test("Phase 2 by voice: animal names, numbers past five, 'It's a ___.'", async ({ page }) => {
  await continueStarred(page, true);
  await page.getByTestId("btn-tank-shop").click();
  await page.getByTestId("btn-buy-hall").click();
  let s = await waitFor(page, (x) => x.progress.hallOpen, 5_000, "hall open");
  const ocean = s.tanks.find((t) => t.type === "ocean")!.id;
  await buyAnimal(page, "turtlePlease");
  await click3d(page, "tank", ocean);
  await waitFor(page, (x) => x.tanks.find((t) => t.id === ocean)!.fish.length === 1, 5_000, "turtle placed");
  // "It's a fish." is not an answer about the turtle; "turtle" is.
  s = await state(page);
  await helpRequest(page, { kind: "whatsThis", tankId: ocean, fishId: s.tanks.find((t) => t.id === ocean)!.fishIds[0] });
  await waitFor(page, (x) => x.prompt?.question === "What's this?", 10_000, "what's this");
  await page.evaluate(() => {
    (window as never as { __speech: { say: string } }).__speech.say = "it's a fish";
  });
  await page.keyboard.press("Space");
  s = await waitFor(page, (x) => x.prompt?.misses === 1, 10_000, "a fish is wrong");
  expect(s.progress.namedInStage).toBe(0);
  await page.evaluate(() => {
    (window as never as { __speech: { say: string } }).__speech.say = "it's a tattle";
  });
  await page.keyboard.press("Space");
  await waitFor(page, (x) => x.progress.hearts === 11, 10_000, "an accented turtle counts");
});
