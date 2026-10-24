# Current State

## Status
**Phase 1 (the vertical slice) is complete and tested.** A new player can start,
buy a fish with English, place it, feed and clean, decorate, help visitors,
earn coins, buy and place the big tank, pass the judge's inspection (Aquarium
Star), and keep playing; progress saves and resumes; everything works in Tap
mode and with a blocked or missing microphone.

Verified 2026-10-20: typecheck, `npm test` (56 unit tests), build, and
`npm run e2e` on the production preview: 15 Playwright specs passed (4.3 min).
Every new e2e spec was shown to fail on an injected bug (autosave off, hard mic
errors ignored, double reward, HUD pushed off-screen, interim results ignored)
and pass again after reverting. Unit tests were shown to fail on a too-expensive
big tank and on removed fish clamping.

Visuals checked by eye at 1366×768 (`.tmp/shots/tap/`, `.tmp/scenes/`,
`.tmp/peek/`) and at 844×390 touch (`.tmp/peek/844x390-touch/`). Layout at
1366×768, 1280×800 touch and 1024×600 touch is asserted by `layout.spec.ts`.
Budget measured: 48 draw calls, ~38k triangles with two tanks and visitors.

## Phase 2 (built and tested, 2026-10-22)
Design in DESIGN_DECISIONS.md "Phase 2 design: Aquarium Expansion" (plus
"Decided while testing Phase 2"). Levels 6–8: the Ocean Hall (second room,
arrows to switch), turtle / seahorse / jellyfish with habitats, tall and ocean
tanks, upgrades, ticket gate, "I like turtles!", "What's this? — It's a ___.",
numbers to ten, the second judge and Super Aquarium Star. Save v2 migrates v1.

Verified 2026-10-22: typecheck, `npm test` (93 unit tests), build, and the
full e2e suite on the production preview: 17 specs passed (8.1 min).
`phase2.spec.ts` plays Levels 6–8 from a starred save (Tap) and checks
animal answers by voice; both specs were shown to fail on an injected bug
(turtle allowed in the small tank; "It's a fish." accepted for the turtle) and
pass after reverting. Screenshots checked by eye at 1366×768
(`.tmp/shots/phase2/`, `.tmp/shots/final/`).
Fixed while testing: goal card said "Free play" over the Level 6–8 goals; the
leaving judge blocked the trophy on both results screens; test helpers now
switch halls.

## Visual polish (2026-10-24)
Purely visual pass; no gameplay, save or input change. Design in
DESIGN_DECISIONS.md "Tank and animal visual polish (part 1)" and "Hall visual
polish (part 2)". Fish shader: belly gradients, wet rims, crisp markings;
procedural sand with caustics; decoration finishes; richer water and glass
edges; Hall 1 cream/teal wainscot and tiles; Ocean Hall deep-blue walls, wave
floor with caustic shimmer; blob shadows under furniture and stands.

Verified 2026-10-24: typecheck, `npm test` (93), build, `npm run e2e` (17/17,
6.2 min). Before/after by eye at 1366×768 with `node scripts/visual.mjs <label>`
(server on 5320): `.tmp/visual/before/` (HEAD before the pass), `after2/` (final).
Perf (seeded Phase-2 save, hall views): Hall 1 69 → 77 draw calls, 60.4k →
64.6k triangles; Ocean Hall 67 → 76, 47.9k → 52.1k. Loop spec: 57 calls, 38.7k tris.

## Guidance, visitor and polish pass (2026-10-24)
Design in DESIGN_DECISIONS.md: "A state-derived guide and visible progression",
"Persistent visitor requests and visible help", "Guidance layout, early visitor
taps, bench, wall and trophy". `src/game/logic/guide.ts` `nextStep(model)` derives
the next action (title / where / exact) from goals, inventory, habitats and real
prices for every goal of Levels 1–8; the HUD shows "Next:", Help / ヒント (top
right) and idle or wrong-panel nudges climb the same ladder. Tank offers are
named with Japanese, the Ocean Hall is marked NEW ROOM, disabled offers say why.
Stage cards and the Level 5 results name the next level; the level chip opens a
Levels 1–8 list. Request cards stay visible across views with a bilingual action
line and the existing hint ladder. Request visitors can be tapped while walking;
visitors approach the bench from the front and glide into the seat. Fixed the
hall-join wall z-fighting and rebuilt the trophy as a closed lathe cup.

Verified 2026-10-24: typecheck, `npm test` (120 unit tests, incl. `guide.test.ts`
for every Level 1–8 goal and the Level 6 hall/turtle cases, `world.test.ts` for
bench paths), build, and `npm run e2e` on an idle machine: 24/24 passed (9.4 min).
Loop spec budget 57 draw calls, 39.4k triangles (unchanged). Checked by eye at
1366×768 (`.tmp/review/`): Level 6 Next line, Help tiers B and C, labelled Tank
shop with NEW ROOM and disabled reasons, coin shortfall, level overview, bench
approach frames, the trophy from front/side/rear.

## What Exists
- **Design:** DESIGN_DECISIONS.md — brief changes, the frozen Phase 1 design,
  and decisions made while building.
- **Rules (pure, tested):** `src/game/logic/` — `model.ts` (economy, care,
  happiness, rewards, stage goals), `guide.ts` (next-action hints), `swim.ts`, `requests.ts`, `english.ts`,
  `speechMatch.ts`, `save.ts` (`at.save.v1`), `economy.test.ts` (simulated
  student through all five stages).
- **Flow:** `src/game/flow/` — `ask.ts` (speech/tap prompts, hint ladder),
  `actions.ts`, `visitors.ts`, `story.ts` (tutorial, stage cards, Pico's count,
  photo day, judge, autosave, nudges), `input.ts`; `sim.ts`, `runtime.ts`,
  `store.ts`.
- **Scene / UI:** `src/scene/` (room, tanks with water/fish/decor shaders,
  visitors, Pico, effects, markers, camera), `src/ui/` (HUD, prompts, shops,
  screens, settings).
- **Tests:** `tests/e2e/` — `loop`, `speech`, `fallback`, `save`, `requests`,
  `layout`, `phase2`, `guide`, `visitors` (+ `flows.ts`, `helpers.ts`, `stubs.ts`). README lists what each covers.
- **Scripts:** `scripts/shots.mjs` (real-speed scenes), `scripts/peek.mjs`
  (Speak-mode prompt states), `scripts/visual.mjs` (deterministic before/after
  art captures + perf.json). All need a server on 5320 (`npx vite --port 5320`).
- **Deploy:** public repo github.com/nolancasama/aquarium-tycoon; every push to
  `main` runs tests + build and deploys to https://nolancasama.github.io/aquarium-tycoon/
  (`.github/workflows/deploy-pages.yml`). Live since 2026-10-22.

## Known Issues
- Real speech recognition, TTS voices, audio levels and real Chromebook GPU
  performance are untested (stubs and SwiftShader only).
- `THREE.Clock` deprecation warning from R3F (harmless).
- In the big tank's close-up the back-wall sign shows, cut off, at the top left.
- Playtime (~20–30 min to the trophy) is an estimate, not measured with children.
- Visual polish judged from SwiftShader screenshots only; fps on a real
  Chromebook after the pass is unmeasured. Rocks and coral are still faceted
  low-poly (by design, toned not remodelled); Ocean Hall walls are on the dark
  side; Ocean Hall stands are the same wood as Hall 1's.
- E2E under heavy CPU load (another Playwright/Codex run on the machine) times
  out in clicks and timed waits; run the suite on an idle machine. Two specs
  (`guide` wrong-shop tiers, `layout` 1366 decor click) each failed once on an
  idle run and passed 3/3 on repeat — watch for a real intermittent hang there.
- The bench glide and early visitor taps were checked in 0.8 s screenshot steps,
  not by eye in real time.

## Next Steps
1. Play it on a real school Chromebook with a class: speech acceptance, whether
   children find the visitor chip and the Decorate button, Stage 3–5 pacing.
2. Phase 2 by eye in real time (not just screenshots): the animals' movement,
   hall switching, and Level 6–8 pacing with children.
3. Watch with children whether the "Next:" line and Help / ヒント are noticed and
   enough to get through Level 6 (Ocean Hall → turtle) without adult help.

## Codex / Delegated Work
None pending. The 2026-10-24 guidance pass was split into four Codex runs
(guide + shop + level cards; visitors + bench; wall + trophy; request card),
all reviewed and accepted; layout fixes, the bench glide and test repairs were
done by Claude.
