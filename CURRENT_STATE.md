# Current State

## Tappable hint audio; Shark Tunnel shipwreck removed (2026-11-07)

- General Pico hint bubbles play their visible English instruction aloud when tapped, with a separate dismissal control. The Shark Tunnel's animal-finding clue is also tap-to-hear. Both use shared TTS and avoid overlapping ongoing speech; no answer choices are revealed.
- Removed the U-bend shipwreck model, its swim-collision solids, geometry test and associated files at the user's request. The central area is open again, retaining its original low reef rocks. Replacement centerpiece is undecided.
- No camera choreography, player progression, coin economy or saves were altered.

## Rush Hour event (2026-11-07)

Design: DESIGN_DECISIONS.md "Rush Hour event (design freeze)" + "decided while building".

- **What:** a recurring free-play event (unlock: free play, Ocean Hall, an occupied
  tank). Every 8–12 min (first) / 12–18 min of active play, a "Rush Hour soon!"
  banner (Start Now / Skip, auto-start after 20 s) → preparation (120/150/210 s by
  tank count) with an amber widget and a checklist that navigates to each tank →
  90 s visitor crowd → results (medal, `floor(min(40, 10+3n) × fraction)` coins) →
  awards panel. Tanks latch "prepared" once food and clean are both ≥75.
- **Code:** rules `src/game/rush/` (config.ts numbers, types.ts state, logic.ts pure
  state machine, decode.ts save reading, flow.ts sim/UI glue, bridge.ts), UI
  `src/ui/RushHour.tsx` + `.css` + `rushNavigation.ts`, crowd in `flow/visitors.ts`
  (cosmetic visitors never tip), cabinet and rewards `src/scene/rush/` with fixed
  positions/footprints in `src/game/data/rushDecor.ts`. State is `Model.rush`
  (optional; old saves get defaults, save version unchanged at 3).
- **Clock:** the care-decay gate in `sim.ts` (`decayRunning`/`advanceCare`); now also
  paused for prompts, dialogue and the results screen (normal decay too).
- **Tests:** `rush/logic.test.ts`, `rush/clock.test.ts`, save and visitor additions,
  `rushDecor.test.ts`; e2e `tests/e2e/rush.spec.ts` (flow, reload no double pay, skip,
  layout at 1366×768 / 1280×720 / 1024×768; shown to fail on an injected double
  payment) and `rush-visual.spec.ts` (screenshots only, `SHOTS=1`).
- **Unverified:** real Chromebook fps with the crowd (CROWD_CAP 14); whether 120 s
  is enough for children with 4 tanks across rooms; English rush questions observed
  only through unit tests; first-unlock Pico intro seen only in tests.
- **Known:** at the default room camera the cabinet sits at the left screen edge
  (medals visible, the golden sign on its crown cropped); the ⭐ HUD button also opens
  the awards. Follow-up: reframe or move the cabinet. A free-play save shows Pico's
  one-time Rush intro shortly after loading, so e2e seeds set `rush.introSeen`.
- **Verified 2026-11-07:** typecheck, 631 unit tests, build; full e2e 70/73 on one
  loaded 18-min run — rush and tunnel failures passed on rerun, the layout failure was
  the intro (fixed in the seed; layout 7/7 twice; baseline 7742574 passed it too).

## Shark Tunnel lower-wall seam polish (2026-11-06)

- Corrected a 15 cm lateral offset between the walkway kerb's outer foot and the vertical plinth walls on both sides. The previously separate surfaces now meet at the same swept cross-section along the tunnel's curves.
- Added a targeted geometry regression check for common-edge vertices. This addresses a plausible source of the disconnected lower-right wall during walking; a matching in-game screenshot would be needed to confirm the precise visual symptom.
- 2026-11-07: route reworked (circular main-curve arc, straight mouths through the lobby wall). Walking is now tunnel-relative (see DESIGN_DECISIONS). Unit tests 564/564 and tunnel e2e 3/3 runs passed. Pushed to main in 1a830c3 (deploys via Pages).
- The user confirmed on the live build (2026-11-07) that the lower-right wall gap is gone. The full Playwright suite passed 67/67.

## Shark Tunnel expansion (2026-11-06)

Design: DESIGN_DECISIONS.md "Shark Tunnel expansion (design freeze)" and its
"Decided while building" list.

- **Wing:** the fifth area, entered through a doorway in the Coral Reef Atrium's
  back wall (x 32.55), not a sixth room on the +x row. A `RoomDef` with
  `wing: "atrium"`, at index `SHARKS_HALL`. Unlock: free play, Atrium open, giant
  reef with ≥4 animals, then 300 coins. Hall arrows go Atrium ↔ Shark Tunnel, with
  a short fade. Only the active area is drawn and tappable (`scene/tunnel/wing.ts`).
- **Habitat:** a built-in `sharks` tank on pad L (capacity 16; sharks 3 places,
  eagle ray 2), shown as occupied/total. Geometry and collision live in
  `game/data/sharkTunnel.ts`: a closed walkway loop through a 32 × 29.5 m habitat,
  a 4.2 × 3.2 m tube, the Grand Viewing Chamber dome, six placement zones and five
  structures (arch, pinnacle, reef shelf, resting ledge, sand bank). The scene is
  `scene/tunnel/` (SharkTunnel, habitatGeometry, tunnelMaterials).
- **Animals:** blacktip shark, zebra shark (after milestone 4) and eagle ray. Their
  3D swim is `game/tunnel/swim3d.ts`: head-led spine, look-ahead avoidance of the
  tube, rocks, structures and each other, rests, attract/hold for activities. The
  models are `scene/models/sharks.ts`, with vertex-shader bend, tail beat and wing
  wave. The contract is `game/tunnel/contract.ts`.
- **Management:** viewpoints (All/Left/Right/Entrance), Animals and Rocks with
  English buying, Place (rings on the zones), Feed (food falls from the surface;
  the animals come up), Clean, a habitat status card, and a first-visit reveal.
- **Exploration:** "Explore Tunnel" → camera move and fade → the player (a child in
  a teal staff cap) walks the loop. Input is the joystick, arrows or WASD; tapping
  a glowing viewing spot walks there. Authored per-section cameras stay inside the
  tube and tilt up for sharks overhead; they reframe at viewing spots. "Back to
  Aquarium" (or Escape) returns. Code: `game/tunnel/explore.ts`,
  `scene/tunnel/ExplorePlayer.tsx`, `ui/TunnelHud.tsx`.
- **Tunnel visitors:** 3–6 people (more as the habitat matures) in lanes. They stop
  at viewing spots to look up, point or take photos, come in parent-and-child
  pairs, make way for the player, react rarely to a shark overhead ("Wow! A
  shark!") and tip on leaving. Code: `game/tunnel/tunnelVisitors.ts`.
- **English:** in `game/tunnel/activities.ts`.
  - Find / show: "Where is the shark?", "Find a ray!" and "Look at the big shark!"
    are answered by tapping the animal. Help climbs from a clue to the camera
    turning, then an arrow and ring, then a hand.
  - Where: "It's above me!" or "It's by me!", asked once a shark is clearly placed
    and held there.
  - Can: "Yes, it can!" or "No, it can't!".
  - Count: "One shark!" to "Six sharks!", with the sharks gathered and numbered first.
  - All are mic-free through the usual ask() prompt.
- **Milestones:** shown in the goals card while in the wing.
  1. Grand Opening: a blacktip.
  2. First Tunnel Tour: answer 3 questions; reward, the big arch.
  3. Help Visitors (3): an eagle ray.
  4. Habitat happy with 3 structures: the zebra shark.
  5. Final Tour (find, where, count in a row): the trophy, shown in the lobby.

  Everything stays open afterwards.
- **Saves:** optional `tunnelOpen`, `tunnelIntroSeen` and `tunnel`; the save version
  is unchanged and old saves load with the wing closed.
- Verified: typecheck, `npm test` 551/551 (incl. `sharkTunnel.test.ts`,
  `swim3d.test.ts` with the real habitat, `sharks.test.ts`, `tunnel.test.ts` and
  the price regression), build, and the full Playwright suite 67/67 on the production
  preview (17.2 min). `tests/e2e/tunnel.spec.ts` (2 tests) passes on the
  dev server and fails on a known-bad save (tunnel not restored).
  `node scripts/tunnel-review.mjs <url> [manage|explore]` writes
  `.tmp/tunnel-review/`. Frames were checked by eye at 1366×768, 1280×720 and
  1024×768 (management) and 1366×768 (exploration), on SwiftShader.
- Known limits:
  - Real Chromebook fps in the wing is unmeasured.
  - Motion was judged from frames, not watched live.
  - The zebra shark's fins carry no spots.
  - Rest drops assume open water below a rest spot (true for the current spots).
  - The resting ledge and reef shelf are slab-like.
  - Visitors' reactions are text bubbles; the voice is only used for questions.
  - "Under" is reserved for a future glass-floor section.

## Compact tank capacity panel (2026-11-06)

- Tank status shows the correct occupied-space count (e.g. 8/8) on the same header line as the tank name, without a separate "Spaces / ばしょ" row.
- When a ray or Chromis school makes the space count differ from the animal count, a short Japanese-only hint explains that rays and schools take two places. The redundant "N animals" line is removed.
- The existing fish-count test ID remains on the numeric counter; core capacity and placement rules are unchanged.

## Correct capacity displays and two-place animal eligibility (2026-11-06)

- Tank close-up now shows **occupied spaces / capacity** rather than mistakenly comparing the raw animal count with space-based capacity. Where they differ, show the actual animal count and explain that rays and schools take two spaces.
- Shop previews label two-space species and tank shop capacity as spaces; the 'full' hint says not enough space.
- Fixed large-animal shop eligibility when available spaces are split between separate tanks: a two-space animal needs two contiguous spaces in one compatible tank.
- Added a regression case for six animals occupying eight Ocean tank spaces, and for split spaces in separate tanks.
- GitHub Actions tests/build and deployment must be checked after push; real classroom verification is still recommended.

## Eel, octopus, multi-bench seating, species feeding (2026-11-01)

- **Moray eel**: head-led spine rig (`logic/eelBody.ts`, part 12 in
  `animalMaterials.ts`). The body follows the head's path, turns reach the tail
  last, length is constant, the dorsal fin shares the body's spine parameters.
  Collision: head corridor plus soft per-point correction against glass, rock,
  sand and columns. The eel really enters its den through the round apertures;
  the body behind the dark mouth disc runs in a hidden rail inside the rock.
- **Octopus**: the rebuilt eight-arm rig was reverted at the owner's request. The
  previous model and motion are back (part 3 arms, `groundAnimal` placement, tap burst).
  The rig is in git at 841807a if it is wanted again.
- **Seating**: `SEATS` in `world.ts` (Hall 1 side seats, three on each atrium bench;
  the request seat is unchanged). Reservations are derived from live visitors'
  `seatId`. About a third of ordinary visitors rest once per visit, 6-14 s.
- **Food**: `data/food.ts` has five foods and a diet per species. Feed stays one tap
  and brings every resident's food; a small strip then names the foods for 4 s of
  game time (tap: says the word, adds a free pinch). Each food has its own shape and
  fall. Feeding motion differs by species: eel jaw snap, crab claws, grazers nibble, ray settles, jelly tentacles gather, turtle nods.
- Verified: typecheck, `npm test` 517/517, build, Playwright 65/65 on the production
  build (16 min, incl. new `feeding.spec.ts`; its layout check was shown to fail on
  the off-screen strip bug, then pass). Loop budget 62 draw calls / 40.1k triangles.
  Frames checked by eye at 1366x768, plus the strip at 1280x720 and 1024x768 (software
  renderer): `.tmp/eel-review/`, `.tmp/octopus-review/`, `.tmp/seating-review/`,
  `.tmp/feeding-review/`.
- Known limits: motion was judged from frame strips, not watched in real time, and
  real Chromebook fps is unmeasured. Eels live only in the cave tank, so that is the
  only tank tested for them. The shrimp and parrotfish feeding motions passed tests
  but were not individually viewed. Eels beyond the third den
  rest on open sand. Visitor faces and arms are one mesh, so no smile or gesture.
- Tests running against an old preview: a leftover `vite preview` on port 4177 is
  reused by Playwright, silently testing a stale build. Set `BASE_URL` or stop it.

## Small polish fixes (2026-11-01)

- Ocean Hall's Jellyfish Gallery door opens nearer its wall, reducing obstruction of the adjacent tank.
- Atrium bench components no longer have touching seat/back/armrest surfaces; palm fronds shorten near room walls.
- Upgraded tank lights sit clear of their built-in rims/bars to avoid overlapping-depth flicker.
- Child visitor models now include six outfits/hairstyles and slight height variation; existing visitor mechanics are unchanged.
- Food particles get lightweight resident-informed visual varieties (pellet, algae/seaweed, seafood, plankton) using instanced colors/scales. **This is visual only**; per-species dietary requirements and feeding rules remain future work.
- Visual inspection on real Chromebooks and full local Playwright validation remain outstanding; review deployment workflow results before treating this as fully verified.

## Coral Reef Atrium, animal motion, shop name previews (2026-11-01)

- **Coral Reef Atrium** (room 4, after the Gallery, 260 coins): 16×11 m, 5.5 m
  sunlit room with skylights, palms, benches, floor mosaic, and a freestanding
  giant reef (pad I, built in, 14 places, 10 decor rings, rock bank + organic
  arch over a column-free swim lane). Pads J/K take hex/panorama/cave tanks.
  New coral decor (staghorn, brain, fan, table). Arrival reveal + bilingual card
  on first entry. `atriumOpen` / `atriumIntroSeen` are optional save fields.
  Rooms may now carry their own pad layout (`padLayout` in `data/rooms.ts`).
- **New animals**: parrotfish and (cleaner) shrimp, named animals at the animal
  counter; shrimp walks on the crab's leg/grounding path. Reef affinity makes
  clownfish, parrotfish, butterflyfish, angelfish (and tang, weakly) hover beside
  reef formations in the giant reef only.
- **Animals**: crab/octopus/goby grounded on the visible sand incl. dunes;
  richer procedural motion for crab, octopus, eel, ray, seahorse, jellies, fish.
- **Shop**: tapping an animal picture says its name (visual name always shown;
  never buys or answers; visual-only while listening or while the game talks).
- **Hex tank**: straight back lamp beam replaced by a six-sided light strip;
  the lamp upgrade on a hex is a six-sided ring.
- Verified: typecheck, `npm test` 451/451, build, Playwright 59/59 on the
  production preview (14.8 min, incl. new `name-preview.spec.ts`, shown to fail
  with its handler disabled). Loop budget 61 draw calls / 40.1k triangles.
  Atrium view ~53 calls / 53k triangles (SwiftShader). Frames checked by eye:
  `.tmp/visual/atrium/` (room at 1366/1280/1024, reef close-up, Gallery door,
  arrival), `.tmp/motion-review/after/`, `.tmp/name-preview/`.
- Known limits: no parrotfish grazing peck or shrimp-cleaning interaction yet;
  no reef lighting choice; the room sign is partly hidden behind the reef top in
  the reef close-up; the left "Coral Reef" board is half behind the reef in the
  management view. Real Chromebook fps for the atrium is unmeasured.
- Codex built the three slices in parallel worktrees, then hit its usage limit
  (until 2026-11-05) during the reef visual correction; Claude rebuilt the reef
  scenery, fixed the Gallery-side door, added the floor mosaic, the two species,
  reef affinity and the hex ring, and reviewed/merged everything.

## Quieter prompts, counting numbers, decoration swap, debug overlay (2026-11-01)

- Counting questions number each fish (sprites over fish ids, clamped inside
  the tank); Japanese sits under its English with in-place Hint; SAY/TAP tags
  only on first encounter; temporary dialogue is opaque and below the HUD;
  tray decorations swap directly with occupied circles (`swapDecor`).
- Ctrl+Alt+D opens the debug overlay (`src/ui/DebugPanel.tsx`), always on.
- Verified: typecheck, `npm test` 367/367, build; Playwright 52/52 on the
  production preview (13.4 min) incl. new `count.spec.ts` and
  `decor-swap.spec.ts` (these two have not yet been shown to fail on a
  known-bad build). Count frames at 1366×768 and 1024×768, swap frame and
  prompt/dialogue/request frames at 1366/1280/1024/844 checked by eye
  (SwiftShader).
- Done by three parallel Codex runs plus one label-placement correction;
  reviewed and accepted by Claude.

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
4. Atrium on a real Chromebook: fps in the atrium view, whether 260 coins feels
   reachable, and whether children notice the reef animals' names.
5. Optional reef follow-ups: parrotfish grazing peck, shrimp cleaning a fish,
   a reef lighting choice; move the atrium sign/left board clear of the reef.
6. Shark Tunnel on a real Chromebook: fps while exploring with 6 visitors and a
   full habitat; whether children find the joystick, the "!" visitors and the
   Final Tour. Is 300 coins / about 13 minutes right?
7. Shark Tunnel follow-ups: spots on the zebra shark's fins, rockier ledge and
8. Rush Hour with children: is 2 min enough for 1–4 tanks across rooms, do they
   find the checklist, do medals motivate; fps of the crowd on a Chromebook.
   shelf shapes, a glass-floor section for "under", spoken visitor reactions.

## Codex / Delegated Work
None pending. The Shark Tunnel's two Codex slices (worktrees aq-st1 and aq-st2) stopped
on a usage limit on 2026-11-06; Claude finished and integrated all of it on branch
st1-habitat. The 2026-10-24 guidance pass was split into four Codex runs
(guide + shop + level cards; visitors + bench; wall + trophy; request card),
all reviewed and accepted; layout fixes, the bench glide and test repairs were
done by Claude.
