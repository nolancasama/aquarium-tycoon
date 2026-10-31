# Current State

## First-minute polish (2026-10-31)

- Sound check answers unlock after Play Sound; sound and mic success show the
  game's check + pop + SFX, then a short Next cue (pulses + hand).
- Goals panel hidden until the first fish is placed.
- The tutorial visitor glows, gets the hand, and is tappable while walking;
  other early taps during a line are acknowledged and queued with revalidation.
- Close-up celebrations fade the status panel in place (celebration token set).
- Codex stopped on quota mid-run; Claude finished it (router: no worker
  available). Evidence: `.tmp/firstminute-review/` at 1366×768 and 1024×768.

## Tapping and sentence teaching (2026-10-31)

- Added a reusable, limited tapping demonstration for first interactions and
  existing exact guidance, with reduced-motion and click-through behavior.
- Visitor clues follow request tiers: English keyword and colour swatch from
  tier 2, exact target hand at tier 3, immediate clearing on success.
- Japanese sentence meanings blank the tested word and fade to optional Hint
  controls after the first pattern encounter. Optional progress fields preserve
  old saves and the existing save version.
- Typecheck, all 349 unit tests and production build pass. The build retains
  its bundle-size warning.
- Focused SwiftShader frames in `.tmp/teach-review/` cover the first Fish hand,
  room clues, exact tank/fish hands and close-ups at 1366×768, 1280×720 and
  1024×768. A real click through the first Fish hand opens its order and clears
  the hand. Reviewed by eye by Claude. Full Playwright suite 43/43 on the
  production preview (11.8 min, incl. new `audio.spec.ts` and `teach.spec.ts`);
  loop budget unchanged at 62 draw calls / 40.1k triangles.
- Still untested: real microphones/AGC levels, real TTS voices, and children's
  response to the hand and blanked meanings on school Chromebooks.

## Optional classroom audio (2026-10-31)

- First New Game offers skippable speaker/mic checks; Settings reopens either
  check and “How to speak”. Device settings remember setup and the one-time
  clear/normal-voice lesson; aquarium saves are unchanged.
- Recognition has an optional local RMS/clipping meter with DOM-only updates.
  Failed attempts give conservative quiet/clipping/neutral feedback. The mic
  check separates permission, sound activity and recognised English, and all
  streams close when attempts or checks end. Missing capabilities remain optional.
- Teacher answers now include Say + Tap (spoken practice followed by the existing
  tap answers, without a mic). Existing Speak/Tap settings and hard-error tap
  fallback remain compatible; mode changes apply on the next prompt.
- Added classifier, settings migration/mode and meter lifecycle unit coverage,
  plus classroom audio Playwright cases and capability/track-cleanup stubs.
  Browser acceptance and real Chromebook audio review have not been run for
  this change; validation results are reported with the implementation.
- Verified: `npm run typecheck`, `npm test` (340 tests), `npm run build` pass.
  Build reports a bundle-size warning; no browser/visual evidence was produced.

## Explicit action guidance (2026-10-31)

- Shared SAY/TAP/LOOK tags identify speaking, tapping and looking in prompts,
  Pico nudges and visitor cards. Quizzes use SAY THE ANSWER; mic fallback uses
  TAP AN ANSWER. Listening has a gentle pulse and a larger bilingual status.
- Onboarding introduces the aquarium boss and tapping, then waits for a tap on
  the highlighted Fish button. Tutorial visitor and decoration steps use the
  same state-derived guide/nudge system, with 20-second idle reminders.
- Visitor cards follow visitor → tank → fish/animal/decoration; existing miss
  counters and a runtime idle clue escalate tank and exact-object highlights.
  The existing marker pool now also points at visitors, doors and free rings.
  Arrow/WASD reminders explain mouse/touch tapping with cooldown and session cap.
- Read-only acceptance surfaces: `window.__at.state()` now exposes `guide`,
  `nudge` and semantic `requestStep` (step/tier/target IDs), alongside existing
  tutorial/view/request state. Cards expose `data-request-step` and
  `data-request-tier`. E2E helpers handle the interactive Fish and visitor taps.
- Expansion 1 / Jellyfish Gallery already exists (third room, display tanks and
  additional animals). The Gallery sign fix from commit 8e69be5 is untouched.
- Gallery signs: the door reads JELLYFISH, the gallery wall JELLYFISH /
  GALLERY; `signTexture()` takes "
" lines and shrinks text to fit.
- Verified 2026-10-31: typecheck, `npm test` (321), build; tutorial review
  screenshots (title → Tap Fish → arrow reminder → SAY ONE / listening /
  misses → place → SAY THIS → visitor → TAP A TANK / TAP A FISH → decorate)
  at 1366×768, 1280×720 and 1024×768 checked by eye (SwiftShader).
  Playwright 30/30 on the production preview (10.2 min); loop budget
  62 draw calls / 40.1k triangles (was 60 / 40.1k).

## Happiness-based tips made visible (2026-10-27)

- Leaving visitors show "+N" tags above each tank they tipped (face = mood) and
  a gold total, drawn from `tipBreakdown()` in `src/game/logic/model.ts` and
  `payTips()` in `src/game/flow/visitors.ts`. Amounts are unchanged.
- `src/game/flow/cheer.ts` watches happiness rises: badge bounce, close-up bar
  pulse, sparkle at okay, hearts at happy, and "Happy fish earn more coins!"
  once per tank per session via Pico's nudge.
- Pico's one-time tips lesson (`progress.tipsTaught`, saved; old saves default
  to false). The coin-shortfall Help tiers point at the least happy tank.
- Tests: `src/game/flow/tips.test.ts`. It was shown to fail when tags played
  without payment. A save test covers the flag. Unit 148/148 (run with
  `--testTimeout=60000` while other sessions loaded the machine); Playwright
  28/28 (10.4 min); loop budget unchanged at 60 draw calls / 40.1k triangles.
- Evidence: `node scripts/tips-review.mjs <preview-url>` writes
  `.tmp/tips-review/`: tags and lesson at 1366×768 and 1024×768 (the paid
  amount matched the tags, +4), close-up and room rises, and the hint tiers.

## Sitting, door lock, sand rings and close-up stats (2026-10-27)

- Visitors sit back over planted feet in one motion (lean, hips back and down,
  legs settle on contact) onto a lower 0.32 m seat, and stand up by reversing
  it. `benchPose()` in `src/game/world.ts`; sampled clearance, planted-feet and
  seated-contact tests live in `src/scene/models/people.test.ts`.
- The Ocean Hall lock is the pad-lock sprite with the same bob, floating clear
  of the door; it is tappable and disappears when the hall is bought.
- Decoration rings follow the sand surface vertex by vertex at every pulse
  size, with no pebbles under them. `tankLayout.test.ts` raycasts the rendered
  sand: rings stay 2–14 mm above it. The test was shown to fail with pebbles
  allowed back under the rings and with a floating lift.
- The close-up status panel sits right of the glass, top level with the tank,
  placed by `besideTank()` in `CameraRig.tsx` (lens shift plus a direct DOM
  transform). `layout.spec.ts` asserts the gap and alignment.
- Unit 141/141, build, and Playwright 28/28 (10.2 min) pass; loop budget
  60 draw calls / 40.1k triangles.
- Evidence: `node scripts/sit-review.mjs <preview-url> [stats|markers|sit|stand]`
  writes `.tmp/sit-review/`. The 48-case layout matrix (1366×768, 1280×720,
  1024×768, 844×390; four tanks; plain, request and prompt) shows no overlap
  of glass, request or prompt. Sit, stand, ring and lock frames were reviewed
  by eye (SwiftShader).

## UI layout, collision and visual polish (2026-10-26)

- Compact, collapsible objectives at the upper left; independently centered
  coins/level/hearts; Help and Settings on the right. Requests replace the
  objectives in room views. Narrow/short layouts preserve happiness faces,
  hall arrows, inventory, keyboard expansion and checklist scrolling.
- Title answer mode selection moved entirely to Settings. Stage and trophy
  screens use Continue / つづける; returning to title remains in Settings.
  Existing Levels 1–8 transitions, hints, saves, rewards and input defaults remain.
- Articulated shins and pelvis clearance keep all six visitor models outside
  the seat and backrest (motion superseded 2026-10-27, above).
- Sand-aware decor heights preserve normal depth testing and slot IDs;
  fish clearance follows the same decoration heights. Upper wall caps no
  longer share exposed planes. All rounded
  signs use a shared alpha-aware material.

Visual evidence: `node scripts/polish-review.mjs <preview-url>` writes
`.tmp/polish-review/final/`: 80 frames, no browser errors or recorded face
occlusions at 1366×768, 1280×720, 1024×768 and 844×390. Includes both halls,
collapsed/expanded objectives, requests with clues, every tank's marker rings
at two pulse phases, signs/walls/door angles, transition screens and the actual
first New Game visitor's approach and seated pose. SwiftShader evidence;
Claude retains final aesthetic review. Real Chromebook GPU testing is outstanding.

Unit tests: 132 pass, including sampled body/leg triangles through all bench
poses, continuous tutorial movement, full marker-footprint sand/edge clearance
and raycasts of wall caps. Production build passes. The complete production
Playwright suite passes 28/28 (10.3 min), including the new face-visibility,
objective expansion/keyboard and viewport-centering checks, existing touch
layouts, saves, mic fallback, both spoken/tapped playthroughs and Levels 6–8.
The full-loop performance check measures 60 draw calls / 39.7k triangles.

On this Windows host, Playwright's automatic preview-server shutdown can stall.
Run the production preview separately and set `BASE_URL` for the browser suite.

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
- Playtime (~20–30 min to the trophy) is an estimate, not measured with children.
- Visual polish judged from SwiftShader screenshots only; fps on a real
  Chromebook after the pass is unmeasured. Rocks and coral are still faceted
  low-poly (by design, toned not remodelled); Ocean Hall walls are on the dark
  side; Ocean Hall stands are the same wood as Hall 1's.
- E2E under heavy CPU load (another Playwright/Codex run on the machine) times
  out in clicks and timed waits; run the suite on an idle machine. Two specs
  (`guide` wrong-shop tiers, `layout` 1366 decor click) each failed once on an
  idle run and passed 3/3 on repeat — watch for a real intermittent hang there.
- Bench movement is verified with sampled geometry and 100 ms rendered frames;
  real-time movement and visual performance on school hardware remain unmeasured.

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
