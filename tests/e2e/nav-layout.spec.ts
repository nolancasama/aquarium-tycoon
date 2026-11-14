import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { boot, hook, precondition, state } from "./helpers";

// Preview setup uses the existing semantic harness; travel uses the real
// arrows without changing their release/travel rules.
function save() {
  let id = 700;
  const tank = (type: string, slot: string, species: string[]) => ({
    id: `t${id++}`, type, slot, food: 90, clean: 95, decor: [],
    fish: species.map((s) => ({ id: `f${id++}`, species: s })),
    upgrades: { filter: false, lamp: false }
  });
  const tanks = [tank("small", "A", ["clownfish"]), tank("ocean", "C", ["turtle"]),
    tank("cylinder", "G", ["moonjelly"]), tank("reef", "I", ["clownfish", "bluetang", "yellowfish", "angelfish"]),
    tank("sharks", "L", ["blacktip", "eagleray"])];
  return {
    coins: 600, inv: { fish: [], decor: [], tanks: [] }, tanks,
    progress: {
      stage: 8, tutorial: "done", firstFish: "clownfish", fedOnce: true, cleanedOnce: true, counted: true,
      hearts: 10, photo: true, star: true, freePlay: true, hallOpen: true, galleryOpen: true,
      atriumOpen: true, atriumIntroSeen: true, superStar: false, upgraded: false, helpedInStage: 0,
      tipsTaught: true, tickets: true, said: [],
      hubIntroSeen: true, tunnelOpen: true, tunnelIntroSeen: true,
      tunnel: { milestone: 3, observed: 6, helped: 3, findDone: false, whereDone: false, countDone: false, trophy: false }
    },
    rush: {
      unlocked: true, introSeen: true, phase: "waiting", untilNext: 900, pendingFor: 0, event: null, lastCommitted: null,
      stats: { events: 0, bronze: 0, silver: 0, gold: 0, successes: 0, best: null, bestReady: 0 }, rewards: []
    },
    stats: { coinsEarned: 1000, helped: 20, fishBought: 15, seconds: 2500 }, nextId: id + 50, paid: []
  };
}

/** Setup/action failures must never be mistaken for a layout result. */
async function setup(label: string, action: () => Promise<unknown>) {
  try { await action(); }
  catch (cause) { throw new Error(`HARNESS_PRECONDITION_FAILED: ${label}`, { cause }); }
}

type RoomState = { roomId: string; fade: number };

async function ready(page: Page, room: string) {
  await setup(`ordinary play in ${room}`, async () => {
    await expect.poll(async () => {
      const s = await state(page);
      if (s.line && await page.getByTestId("next").isVisible()) await page.getByTestId("next").click();
      const r = s as unknown as RoomState;
      return s.screen === "game" && s.view === "room" && r.roomId === room && r.fade === 0
        && s.mode === "play" && !s.line && !s.prompt && !s.stageCard && !s.panel;
    }, { timeout: 25_000 }).toBe(true);
  });
}

async function load(page: Page) {
  await setup("seeded free-play aquarium", async () => {
    await page.addInitScript((model) => {
      localStorage.setItem("at.save.v1", JSON.stringify({ v: 3, model }));
      localStorage.setItem("at.settings.v1", JSON.stringify({ mic: false, music: 0, sfx: 0, japanese: true, audioSetupDone: true }));
    }, save());
  });
  let errors: string[] = [];
  await setup("continue seeded aquarium", async () => {
    // Keep dialogue durable until ready() dismisses it: fast mode auto-skips
    // the opening line in 30 ms, before a state poll can reliably observe it.
    errors = await boot(page, "seed=11");
    await page.getByTestId("btn-continue").click();
    // Require the game screen before waiting for its opening dialogue.
    await precondition(page, (s) => s.screen === "game", "seeded game screen", 20_000);
  });
  await setup("disable incidental visitors", () => hook(page, "visitors", false));
  // This per-session introduction cannot be suppressed by the seed save.
  // Initial play can be sampled before storyTick starts it and hides arrows.
  await precondition(page, (s) => s.line?.en === "New tanks and animals!", "seeded expansion introduction");
  await ready(page, "hall");
  return errors;
}

async function nextRoom(page: Page, room: string) {
  await setup(`arrow travel to ${room}`, async () => {
    const next = page.getByTestId("btn-hall-next");
    await expect(next).toBeVisible();
    await expect(next).not.toHaveAttribute("data-locked", "true");
    await next.click();
  });
  await ready(page, room);
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5
  && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

async function appearance(arrow: Locator) {
  return arrow.evaluate((el) => {
    const s = getComputedStyle(el);
    const glyph = getComputedStyle(el.querySelector("b")!);
    const left = el.classList.contains("left");
    return {
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      gap: s.gap, padding: s.padding,
      // Compare the shared treatment after reflecting the left arrow: the
      // screen edge is borderless and the inward corners are rounded on both.
      borderWidths: [s.borderTopWidth, left ? s.borderRightWidth : s.borderLeftWidth,
        s.borderBottomWidth, left ? s.borderLeftWidth : s.borderRightWidth],
      borderStyles: [s.borderTopStyle, left ? s.borderRightStyle : s.borderLeftStyle,
        s.borderBottomStyle, left ? s.borderLeftStyle : s.borderRightStyle],
      borderRadii: left
        ? [s.borderTopRightRadius, s.borderTopLeftRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius]
        : [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius],
      glyphSize: glyph.fontSize, glyphWeight: glyph.fontWeight
    };
  });
}
type Appearance = Awaited<ReturnType<typeof appearance>>;
type Reference = { box: Box; appearance: Appearance };

async function arrowLayout(page: Page, label: string, reference?: Reference) {
  const viewport = page.viewportSize()!;
  const width = viewport.width < 1024 || viewport.height < 700 ? 64 : 216;
  let result = reference;
  const arrows: Box[] = [];
  for (const side of ["prev", "next"]) {
    const arrow = page.getByTestId(`btn-hall-${side}`);
    if (!await arrow.count()) continue;
    await expect(arrow).toBeVisible();
    const box = (await arrow.boundingBox())!;
    const style = await appearance(arrow);
    expect(box.width, `${label}: ${side} width`).toBeCloseTo(width, 1);
    expect(box.height, `${label}: ${side} height`).toBeCloseTo(72, 1);
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2), `${label}: ${side} midpoint`).toBeLessThanOrEqual(2);
    const edge = side === "prev" ? box.x : viewport.width - box.x - box.width;
    expect(Math.abs(edge), `${label}: ${side} edge offset`).toBeLessThanOrEqual(0.5);
    if (result) {
      expect(Math.abs(box.y + box.height / 2 - result.box.y - result.box.height / 2), `${label}: reference midpoint`).toBeLessThanOrEqual(2);
      expect(box.width).toBeCloseTo(result.box.width, 1);
      expect(box.height).toBeCloseTo(result.box.height, 1);
      expect(style, `${label}: shared typography, spacing and border treatment`).toEqual(result.appearance);
    } else result = { box, appearance: style };
    arrows.push(box);
  }
  expect(arrows.length, `${label}: navigation present`).toBeGreaterThan(0);

  // Include buttons without test IDs, status/care cards, goals, hints, temporary
  // notifications and the whole bottom toolbar. Clip scroll descendants to
  // their actual visible region so expanded scrollable goals are measured fairly.
  const controls = await page.locator("button:visible, .panel:visible, .wing-views:visible, .bottombar:visible, .nudge:visible, .toast:visible")
    .evaluateAll((elements) => elements.filter((el) => !el.classList.contains("hall-arrow")).map((el) => {
      const b = el.getBoundingClientRect();
      let left = b.left, top = b.top, right = b.right, bottom = b.bottom;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), r = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, r.left); right = Math.min(right, r.right); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
      }
      return { id: el.getAttribute("data-testid") ?? el.className, x: left, y: top, width: right - left, height: bottom - top };
    }).filter((b) => b.width > 0 && b.height > 0));
  for (const box of arrows) for (const control of controls) {
    expect(overlaps(box, control), `${label}: arrow overlaps ${control.id}`).toBe(false);
  }
  for (const el of await page.locator(".wing-views button:visible, .bottombar button:visible, .wing-status:visible").all()) {
    const box = (await el.boundingBox())!;
    expect(box.x, `${label}: control left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${label}: control right edge`).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y, `${label}: control top edge`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${label}: control bottom edge`).toBeLessThanOrEqual(viewport.height + 0.5);
    if (await el.evaluate((node) => Boolean(node.closest(".wing-views")))) {
      expect(Math.min(box.width, box.height), `${label}: viewpoint touch target`).toBeGreaterThanOrEqual(48);
    }
  }
  const status = page.getByTestId("lagoon-status");
  if (await status.isVisible()) {
    const card = (await status.boundingBox())!;
    for (const need of ["food", "play", "together"]) {
      const bar = page.getByTestId(`lagoon-${need}`);
      await expect(bar).toHaveAttribute("aria-label", new RegExp(`^${need[0].toUpperCase() + need.slice(1)} \\d+$`));
      const box = (await bar.boundingBox())!;
      expect(box.height, `${label}: ${need} readable`).toBeGreaterThanOrEqual(20);
      expect(box.x).toBeGreaterThanOrEqual(card.x);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(card.y);
      expect(box.y + box.height).toBeLessThanOrEqual(card.y + card.height + 0.5);
    }
  }
  return result!;
}

async function capture(page: Page, info: TestInfo, label: string) {
  const viewport = page.viewportSize()!;
  const directory = path.resolve("test-results/nav-layout");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${viewport.width}x${viewport.height}-${label}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  await info.attach(label, { path: file, contentType: "image/png" });
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 900, height: 768 }]) {
  test.describe(`consistent room navigation ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("arrows retain their reference geometry with goals collapsed and expanded", async ({ page }, info) => {
      const errors = await load(page);
      let reference: Reference | undefined;
      const checkGoals = async (room: string, toggleId: string) => {
        const toggle = page.getByTestId(toggleId);
        await setup(`${room} objectives available`, () => expect(toggle).toBeVisible());
        await expect(page.getByTestId("btn-hall-next")).toBeVisible();
        if (room !== "hall") await expect(page.getByTestId("btn-hall-prev")).toBeVisible();
        for (const expanded of [false, true]) {
          await setup(`${room} objectives ${expanded ? "expanded" : "collapsed"}`, async () => {
            if (await toggle.getAttribute("aria-expanded") !== String(expanded)) await toggle.click();
            await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
          });
          const label = `${room}-${expanded ? "expanded" : "collapsed"}`;
          reference = await arrowLayout(page, label, reference);
          await capture(page, info, label);
        }
      };
      await checkGoals("hall", "btn-objectives");
      for (const room of ["ocean", "gallery", "atrium", "sharks"]) {
        await nextRoom(page, room);
        if (room === "sharks") await setup("Shark Tunnel viewpoint and care controls", async () => {
          await expect(page.getByTestId("wing-views")).toBeVisible();
          await expect(page.getByTestId("wing-status")).toBeVisible();
          await expect(page.getByTestId("btn-feed")).toBeVisible();
          await expect(page.getByTestId("btn-clean")).toBeVisible();
        });
        await checkGoals(room, room === "sharks" ? "btn-tunnel-goals" : "btn-objectives");
      }
      await nextRoom(page, "hub");
      // The hub's existing travel surface is doorways, never side arrows.
      await expect(page.locator(".hall-arrow")).toHaveCount(0);
      await capture(page, info, "hub-doorways");

      await setup("Penguin Coast session preview", async () => {
        await hook(page, "coastTo", 2);
        const release = await hook<{ preview: string[] }>(page, "release");
        expect(release.preview).toContain("coast");
      });
      // The hub has no side arrows. Its map card uses the same coast entry.
      await setup("Penguin Coast map travel", async () => {
        await page.getByTestId("btn-map").click();
        await expect(page.getByTestId("aquarium-map")).toBeVisible();
        await page.getByTestId("map-coast").click();
      });
      await setup("Penguin Coast arrival completed", async () => {
        const arrival = page.getByTestId("coast-reveal");
        await expect(arrival).toBeVisible();
        await arrival.click();
        await expect(arrival).toBeHidden();
      });
      await ready(page, "coast");
      await setup("Penguin Coast habitat and care controls", async () => {
        await expect(page.getByTestId("coast-views")).toBeVisible();
        await page.getByTestId("coast-view-penguins").click();
        await expect.poll(async () => (await hook<{ view: string }>(page, "coast")).view).toBe("penguins");
        await expect(page.getByTestId("coast-status")).toBeVisible();
        await expect(page.getByTestId("btn-feed")).toBeVisible();
        await expect(page.getByTestId("btn-clean")).toBeVisible();
      });
      await checkGoals("coast", "btn-coast-goals");

      await setup("Dolphin Lagoon session preview and arrival", async () => {
        expect(await hook(page, "preview", "lagoon")).toBe(true);
        await hook(page, "outdoor", "lagoon");
        await expect(page.getByTestId("outdoor-arrival")).toBeVisible();
        await expect(page.getByTestId("outdoor-arrival")).toBeHidden({ timeout: 15_000 });
      });
      await ready(page, "lagoon");
      for (const view of ["lagoon", "gallery", "deck", "care"]) {
        await setup(`Lagoon ${view} viewpoint and needs`, async () => {
          const button = page.getByTestId(`lagoon-view-${view}`);
          await expect(button).toBeVisible();
          await button.click();
          await expect.poll(async () => (await hook<{ view: string }>(page, "lagoon")).view).toBe(view);
          await expect(page.getByTestId("lagoon-status")).toBeVisible();
          await expect(page.getByTestId("btn-lagoon-feed")).toBeVisible();
          await expect(page.getByTestId("btn-lagoon-toys")).toBeVisible();
          for (const need of ["food", "play", "together"]) await expect(page.getByTestId(`lagoon-${need}`)).toBeVisible();
        });
        await checkGoals(`lagoon-${view}`, "btn-lagoon-goals");
      }
      await setup("Lagoon temporary release-lock notification", async () => {
        const locked = page.getByTestId("btn-hall-next");
        await expect(locked).toHaveAttribute("data-locked", "true");
        await locked.click();
        await expect(page.getByTestId("toast").filter({ hasText: "Coming soon" }).first()).toBeVisible();
      });
      await arrowLayout(page, "lagoon-care-expanded-notification", reference);
      await capture(page, info, "lagoon-care-expanded-notification");
      expect(errors).toEqual([]);
    });
  });
}
