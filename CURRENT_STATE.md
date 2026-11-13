# Current State

## Penguin Coast keeper care (2026-11-13)

- Feed now runs an explicit door / walk / bucket tip / watch / return state
  machine. The back cliff has a real opening, dark corridor and hinged leaf.
  Fish grow on the tray during tipping; keeper and penguin segments respect
  staff, door and station clearance. With no station the keeper tips at the
  shore and retains the existing no-station attraction.
- Clean runs a five-second montage with three teal staff figures, hand tools,
  discrete wiping/scrubbing/pickup poses, sparkles and light sounds. Both care
  actions share a runtime guard and bilingual disabled HUD buttons.
- Existing care maths is applied once at the tip / end of cleaning, or on
  early departure. Preview restoration discards temporary care along with the
  preview model. Runtime presentation resets on leaving. Saves, release locks,
  Seal Cove and Otter Bay are unchanged. Decisions: DESIGN_DECISIONS.md,
  "2026-11-13 — Penguin Coast keeper care".
- Verification: typecheck; unit 850/850 on an idle machine (18 new keeper
  tests in `coast/keeper.test.ts`, `flow/coastKeeper.test.ts`); build;
  `coast.spec` 7/7 (the feed step now asserts "Feeding..." disabled, fed,
  then re-enabled, through the no-station fallback). Frames reviewed by eye
  at 1366×768 (SwiftShader): door open with dark interior, keeper walking out
  with the bucket, tipping, returning, door closed; three-keeper montage; all
  keepers gone and bars full afterwards. A double tap on Feed fed once
  (40 → 98). Script: `node .tmp/keeper-review.mjs <url> 1366 768` (local).
- Known: in the montage the glass-wiping keeper stands partly behind the
  Penguins/Underwater view buttons; the feed sequence is ~19 s end to end.

## Save safety, one arrow layout, hub reef, Lagoon deck, bigger Penguin Coast (2026-11-13)

Merged into `main` and pushed to GitHub Pages on 2026-11-13. Design:
DESIGN_DECISIONS.md "2026-11-12 — Save safety, one arrow layout, hub reef,
Lagoon deck, bigger Penguin Coast". Built by Codex in four worktrees
(`../aq-save`, `../aq-visual`, `../aq-nav`, `../aq-penguin`, branches
`fix/*`), reviewed and accepted by Claude.

- **Save safety:** rejected records are quarantined in the save, not deleted;
  backup ring + last-known-good + pinned pre-repair copies; Save Recovery
  screen (Settings and title) with export/import of the exact raw save. The
  owner's real save is the regression fixture
  `src/game/logic/realSave.fixture.json` (byte-exact copy also in
  `../aquarium-tycoon-save-backup/`).
- **Arrows:** one layout in every room (midpoint of each edge, fixed size);
  below 1024 px wide **or 700 px tall** the arrow is 64 px wide with the icon
  and a short English room name under it (`SHORT_ROOM_NAMES` in
  `ui/Hud.tsx`, added 2026-11-13); on short screens the room-view request
  card stands right of the arrow lane at full height. Controls and goal
  panels move out of the arrow lane.
- **Grand Hub reef tank:** live-rock ridge, attached corals, anemones,
  seagrass; fish on collision-checked paths (`scene/hub/hubReef.ts`,
  `reefFishPaths.ts`). **Lagoon deck:** overlaps removed, supported stairs,
  signs removed (`scene/lagoon/deckGeometry.ts`).
- **Penguin Coast:** bigger, deeper pool; swim orientation from the GLB's
  axes; separation; natural ramps with yielding opposing traffic (soak test);
  rocky underwater terrain; no bar across the Underwater view.
- **Verified on merged main:** typecheck; unit 832/832; build; full
  Playwright 91/94 on the production preview (31 min). The 3 failures:
  `requests.spec` 1024×600 was a real regression (fixed by the short-screen
  rule above, then requests + nav-layout + layout + arrows 16/16 and frames
  checked by eye); `outdoor.spec` Lagoon/Sanctuary previews time out
  "waiting for in lagoon/sanctuary" (or an extra 2-coin tip) **on 290ada1
  too**, a pre-existing flake in the debug-only preview areas.
- **Known / not verified:** the other PC's lost tanks (once this release
  loads there, Settings → Save Recovery shows its save, backups and
  quarantined records; backups exist only from this release on). The owner
  accepted the shore ramps and Chromebook frame rates as they are, and keeps
  all three outdoor areas release-locked (DESIGN_DECISIONS 2026-11-13).

## Next steps

0. **12-item improvement plan.** Wave 1 DONE, merged and pushed live 2026-11-14
   (e9adffe): hub corridor + Lagoon boardwalk z-fighting and a
   solid chest lid; Penguin Coast time-lapse Clean montage, connected lower
   gallery with stairs, closer land camera; Lagoon re-entry splashes and
   player ball catch (held ball floats with two hands at a fixed waterside
   spot, no player body); Shark Tunnel diver cleaning montage. Verified on
   merged main: typecheck, unit 897/897, build, Playwright coast + outdoor +
   tunnel + hub 17/17 on a production preview; frames judged by eye.
   Wave 2 naming DONE and merged (65a893c): penguins/dolphins can be renamed
   from a small panel (stable ids, one sanitizer, preview-safe); unit 913/913,
   frames + reload checked at 1366/1024 (`.tmp/naming/review.mjs`). Claude
   dropped the selection toast (it covered the panel) and moved the panel
   left of the status card below 1100 px.
   **PARTIAL: wave 2 curriculum** in `../aq-curriculum` (`feat/curriculum`),
   Codex usage limit until 2026-11-14 04:07 JST. Done: activities rewritten
   across 24 files, unit tests pass. Left: typecheck errors in
   `visitors.test.ts` / `requests.test.ts` (test typings), docs/CURRICULUM.md,
   the DESIGN_DECISIONS entry, then requests/tunnel/outdoor/coast specs.
   Resume with a `partialWork` block in its `.ai/work-order.json`.
1. Keeper feeding and the cleaning montage are done (see the top section);
   the `../aq-keeper` worktree / `feat/keeper` branch is merged and can be
   removed. Optional polish: move the montage's glass keeper clear of the
   view buttons.
2. No open items from the owner. All old worktrees and merged branches were
   removed on 2026-11-13 (only `main` remains).

**`outdoor.spec` stabilised (2026-11-13):** three test-side causes, 25/25 on
`--repeat-each=5` afterwards (it failed 1/25 and 3/25 on the way):
- Area entry raced a line/request (travel is silently refused while busy):
  `enterArea()` retries the entry until the area is reached.
- Exact coin checks caught Shark Tunnel visitor tips (2 coins): the tunnel
  crowd runs whenever the tunnel is open. `__at.visitors(false, true)` now
  also clears hall visitors and pauses the tunnel crowd (`tunnelCrowd.paused`,
  test hook only; plain `visitors(false)` is unchanged).
- `click3d` (shared helper) waits up to 5 s for its target to project on
  screen, since the camera can still frame the previous area just after a switch.

**Environment notes:**
- Vitest fails in Git Bash here; run tests from **PowerShell**.
- Unit tests time out (5 s) only while other runs load the CPU; judge the
  suite on an idle machine.
- Playwright reuses any server on port 4177: serve a fresh build on its own
  port and set `BASE_URL`.

## Navigation, hub, Penguin Coast and Lagoon improvements (2026-11-11)

Merged into `main` and deployed to GitHub Pages (f1f11b1, 2026-11-11; CI tests + deploy passed).
Design: DESIGN_DECISIONS.md 2026-11-11 entries "Penguin Coast only…",
"Lagoon framing, articulated mouths and coordinated feeding" and
"Navigation, hub, tricks and small fish".

- **Arrows:** Shark Tunnel → Grand Hub; Penguin Coast ← Hub / → Lagoon;
  Lagoon ← Coast / → Sanctuary (`AREA_LINKS`, `arrowState`/`arrowTravel` in
  `flow/hub.ts`). Locked neighbours show greyed with a lock and only say
  "Coming soon!". Release locks unchanged; all three outdoor areas stay
  preview-only.
- **Grand Hub:** one panoramic window onto an animated coast; real doorway
  openings with short corridors (`scene/hub/HubArchitecture.tsx`,
  `HubCoastWindow.tsx`, `hubPortalClip.ts`); closed doors on unavailable
  destinations; visitors walk in and out through open corridors only.
  The hub's display tank is a small reef of `smallFish.ts` fish.
- **Penguin Coast:** `COAST_HABITATS_SHOWN = ["penguins"]` (`data/release.ts`)
  hides Seal Cove and Otter Bay (kept stored and frozen, saves unchanged);
  views Penguins / Underwater; goals end at milestone 2 with "More coming
  soon!". Ground flashing fixed (duplicate coplanar shelf tops). Feed puts a
  fish pile on the station; penguins walk over, peck and eat it.
- **Dolphin Lagoon:** closer overview; dolphin jaw (shader); feeding waits for
  the dolphins, then fish are tossed one by one and caught in open mouths
  (`game/lagoon/feeding.ts`); tricks (5 jumps/flips, calf hops), ball passes
  snout to snout, a bubble ring in front of the gallery window that dolphins
  swim through (`pod.ts` `charge`/`trick`, `lagoonRuntime.ts`). New small fish
  school (`scene/marine/smallFish.ts`, also in the sanctuary).
- **Verified:** typecheck; unit 763/763 (new: `flow/arrows.test.ts`,
  `lagoon/tricks.test.ts`, `marine/smallFish.test.ts`, hub routes, coast,
  feeding, cetacean geometry); build; new `tests/e2e/arrows.spec.ts` 1/1.
  Known-bad checks: arrows without the lock check, hub doors all open, ring
  passes outside the opening, and leaps crossing structures all fail their
  tests. Frames by eye (SwiftShader) at 1366×768 and 1024×768: `.tmp/fish-review/`,
  `.tmp/tricks-review/`, `.tmp/nav-review/`, `.tmp/worker-evidence/`
  (hub, coast, lagoon frames from the Codex runs).
- **Not verified / known:** motion judged from 100 ms frame strips, not
  watched live; real Chromebook fps; at 844×390 (phone fallback) the side
  arrows overlap the HUD cards; tricks are small on screen in the Lagoon
  overview (the Deck view is closer); the coast's Feed/Clean buttons show
  only Japanese (as before).

## Release locks: Coastal & Polar, Dolphin Lagoon, Grand Ocean Sanctuary (2026-11-10)

Design: DESIGN_DECISIONS.md "Dolphin Lagoon + Grand Ocean Sanctuary, release
locks (plan review)" and "Lagoon and sanctuary: decided while building".

- **All three are built and release-locked** (`src/game/data/release.ts`: one
  `{ built, released }` entry per area; all `released: false`). Travel needs a
  release and the save's ownership, or a development preview (`roomOpen`);
  save validation uses ownership only (`roomOwned`), so saved coastal habitats
  are kept. The coast's purchase rule (`openCoast`) also refuses while locked.
- **Hub and map:** the three doorways show closed doors (since 2026-11-11) with a lock, a rope
  and a bilingual COMING SOON ribbon; plaques read DOLPHIN LAGOON / イルカの
  ラグーン and GRAND OCEAN SANCTUARY / うみの サンクチュアリ. A tap says "Coming
  soon! / もうすぐ オープン！ おたのしみに！" (doorway: toast; map card: the card
  itself) and nothing else happens. A coast owner's map card shows "n/5 saved".
- **Saved coastal progress** (`coastOpen`, milestones, habitats, bagged animals,
  unplaced items) loads into `model.stored` (`logic/stored.ts`), out of every
  rule (care decay, Rush Hour checklists, the Level 8 judge), and is written
  back unchanged. Releasing the coast later brings it back as it was.
- **Lagoon and sanctuary state** (`progress.lagoon`, `progress.sanctuary`) is
  dropped on load while the area is unreleased; nothing in ordinary play
  creates it. No unlock rule or price exists yet (deliberately undecided).
- **Previews (Ctrl+Alt+D, "Release-locked areas · preview"):** Preview
  Coastal & Polar Zone / coast: all habitats / Dolphin Lagoon / Grand Ocean
  Sanctuary, milestone jumps 1–5 for each (through the real rules), Return to
  Grand Hub, End preview. A preview is a sandbox (`flow/preview.ts`): the save
  is flushed first, autosave stops, a "PREVIEW · not saved" badge shows; End
  preview restores the model; a reload, the title, New Game or Continue simply
  forget it. Test hooks: `__at.preview(area)`, `endPreview()`, `release()`,
  `outdoor(area)`, `lagoonTo(n)`, `sanctuaryTo(n)`, `coastTo(n)` (now in a preview).
- **To release an area:** set `released: true` in `data/release.ts`, decide
  its unlock rule (and price) and set `progress.lagoonOpen` / `sanctuaryOpen`
  through it; the coast already has its rule (Shark Tunnel trophy, 320 coins).

## Dolphin Lagoon (2026-11-10, preview only)

- **Where:** `ROOMS` id `lagoon` (wing of the hub), area origin (−320, 260).
  Layout data `game/data/lagoon.ts`; rules `logic/lagoon.ts`; live state
  `game/lagoon/lagoonRuntime.ts`; flow `game/flow/lagoon.ts`; scene
  `scene/lagoon/DolphinLagoon.tsx`; HUD `ui/LagoonHud.tsx`.
- **Scene:** open sky with clouds, the lagoon (44 × 24 m, 6.5 m deep) and a bay
  pool under a footbridge, a breakwater with a sea gate, headlands with a
  lighthouse, sailboats, gulls; the boardwalk on a quay; the underwater
  gallery (a room behind a 3-pane window; blue haze, light shafts, a fish
  school); the observation deck; the care pontoon and its keeper; beach,
  palms. First visit: a sweep out of the boardwalk into the open air and an
  arrival card.
- **Dolphins:** Sora and her calf Mimi (echelon), Kai, Nami: one mesh each,
  vertical fluke beat, turns, breaths with blows, fluke-up dives, rare leaps,
  pairs and group swims, curious passes by the viewpoint in use.
- **Play:** viewpoints Lagoon / Underwater (fade) / Deck / Care; three needs
  (Food, Play, Together) that change only while the lagoon is shown; Feed (the
  keeper throws fish, the pod comes up to the pontoon); Toys (ball, bubble
  curtain, kelp as a reward); Look! moments (swimming together, breathing, a
  deep dive, a jump) recorded by tapping; visitor questions every 22–36 s:
  How many dolphins? (pod gathered, numbered), Where is the dolphin? (on /
  under the water, held at that depth), Can it swim / fly / jump? (jump only
  after a leap), What's this?, Do you like dolphins?; Pico's Dolphin Discovery
  tour (4 questions). Milestones: Welcome (arch) → Dolphin Friends (kelp) →
  Deep Dive (deck telescopes) → Happy Dolphins (dolphin fountain) → Dolphin
  Discovery (trophy, also on the hub shelves and the trophy card).
- **Budget (SwiftShader, 1366×768):** 9–45 draw calls, 33–50k triangles
  depending on the view (halls: 62 / 40k).

## Grand Ocean Sanctuary (2026-11-10, preview only)

- **Where:** `ROOMS` id `sanctuary`, origin (420, 500). Data
  `game/data/sanctuary.ts`; rules `logic/sanctuary.ts`; live state
  `game/sanctuary/sanctuaryRuntime.ts`; flow `game/flow/sanctuary.ts`; scene
  `scene/sanctuary/OceanSanctuary.tsx`; HUD `ui/SanctuaryHud.tsx`.
- **Scene:** a 230 × 130 m bay (14 m deep) between cliff-topped headlands,
  open to the ocean beyond a buoy line; an island with pines and an islet; the
  research boat; the underwater observation station on its pier (a round room
  with windows, light shafts, fish); the research station and dock; the care
  platform; the observation point on the west clifftop (rail, telescopes,
  visitors); Beluga Cove behind its own breakwater (ice floes, a viewing
  platform). First visit: an aerial sweep in from the ocean.
- **Animals:** orcas Yuki (matriarch, leads), her calf Chibi, Kuro (male, tall
  fin), Umi (nicked fin), with eye patches, saddles and white bellies; they
  patrol past the station, the island and the boat, spy-hop now and then.
  Belugas Shiro, Mochi, Kumo (milestone 3), in their own water, nodding and
  turning their heads.
- **Play:** viewpoints Lookout / Orcas (follow camera low over the water) /
  Underwater (fade) / Research / Belugas; Research Notebook of 8 stickers
  (breathing, a deep dive, big, together, mother and baby, looking at us,
  belugas, a clean ocean) from Look! moments and answers; Ocean Cleanup (tap 5
  pieces of floating litter, each named aloud); Habitat Improvement (kelp
  forest / quiet zone / ice treats; loud music and a small pool are explained
  in Japanese, not applied); questions: What's this?, Is it big or small?, How
  many orcas?, Where is the orca? (by the island / by the boat), Do you like
  orcas?, beluga What's this? / What color is it?; Pico's final tour (5
  questions). Milestones: Welcome (flags) → Ocean Giants (size board) → Family
  and Friends (Beluga Cove) → Ocean Guardians (guardian flag) → Grand Sanctuary
  Celebration (trophy). No feeding, cleaning or decorating.
- **Budget (SwiftShader, 1366×768):** 11–39 draw calls, 44–58k triangles.

## Outdoor areas: how they were checked (2026-11-10)

- Unit: `logic/release.test.ts` (shown to fail with `roomOpen` in save
  validation and without storing), `logic/outdoor.test.ts` (shown to fail with
  milestone 2 missing its questions and with saved decorations trusted),
  `marine/pod.test.ts` (dolphins, orcas, belugas over minutes of simulated
  time against invariants; it caught beach stranding, a snout in the shore, a
  calf pinned by the pontoon and an orca calf left behind by adult margins).
- E2E: `tests/e2e/outdoor.spec.ts` (lagoon through the real Ctrl+Alt+D menu;
  sanctuary to its trophy with real taps on litter; HUD fit at 1366×768,
  1280×720, 1024×768: it caught the goals card covering the viewpoints).
  `coast.spec.ts` and `hub.spec.ts` now cover the locks.
- Frames by eye on SwiftShader: `node scripts/lagoon-review.mjs <url> <w> <h> <ms>`
  and `node scripts/sanctuary-review.mjs <url> <w> <h> <ms>` (serve a build:
  `npx vite build && npx vite preview --port 5341`; the dev server's watcher
  reloads mid-run on this Windows host).
- **Not verified:** real Chromebook frame rates in either area; motion judged
  from frames, not watched live; real microphones on the new phrases; children
  playing either area.

## Grand Hub wall-mounted signs (2026-11-10)

- All five doorway plaques and the Trophies plaque now follow each bay's actual wall tangent, instead of rotating part-way toward the camera. Thin framed backings sit at the curved plaster and the sign faces project slightly forward, so the labels appear physically mounted above their doorways.
- The camera, doors, map links, interactive sign hit areas, and saves are unchanged. A new mount-orientation test guards the alignment. Inspect side-door legibility and wall contact in the deployed hub.

## Penguin Coast redesign + ITHappy penguin (2026-11-10, preview only)

Design: DESIGN_DECISIONS.md 2026-11-10 entries on the Penguin Coast redesign and
the owner-supplied penguin model.

- **Scenery** (`scene/coast/CoastZone.tsx`, procedural, same footprint): layered
  snowy cliffs, a sloping stony shore, a deeper-looking pool (rocky floor,
  underwater cliffs, boulders, bubbles), a climbable ice floe (an island in
  `data/coast.ts`), small floes and boulders as swim obstacles, two low resting
  ledges, nest visits. Seal Cove and Otter Bay unchanged (hidden since 2026-11-11).
- **Views:** Penguins view re-framed; an Underwater / みずのなか button appears only
  in the Penguins view (`coastUnderwater` in the store). A 7.2 s skippable
  first-visit reveal (`coastReveal` in `flow/coast.ts`), debug preview only.
- **Penguin model:** `src/assets/models/penguin.glb` (232 KiB, 818 tris, idle /
  walk / run, root motion stripped) built by `npm run build:penguin` from the
  owner's `Downloads/3D & Game Assets/Unity_2021_Animals_FREE_v2.3.unitypackage`
  (the pack stays outside the repo; see `src/assets/models/README.md`). Runtime
  `scene/coast/penguinAsset.ts`: one cached load, cloned skeletons, a mixer per
  penguin, procedural horizontal swim with flipper strokes; the old procedural
  penguin is the loading/failure fallback. Named just "penguin" (no species).
- **Perf (SwiftShader 1366×768):** overview 67 calls / 24.6k tris; Penguins 35 /
  16.6k; Underwater 13 / 11.1k.
- **Fixed:** leaving the coast during the reveal recursed until the stack
  overflowed (`skipCoastReveal` updated the model before clearing its timer);
  `coast.spec.ts` "leaving the coast while its first-visit reveal plays" fails
  without the fix.
- **Not verified:** real Chromebook fps; motion watched live (frames only);
  the shore outline is still fairly square from the Penguins view.

## Coastal & Polar Zone (2026-11-10)

Design: DESIGN_DECISIONS.md "Grand Aquarium Hub + Coastal & Polar Zone (plan review)"
and "Hub and coast: decided while building".

- **Release-locked since 2026-11-10** (see "Release locks" above): nothing
  below is reachable in ordinary play; saved coastal progress is kept.
- **What:** a wing entered from the hub (`ROOMS` id `coast`, index 6, x −152..−108).
  When released, it unlocks when the Shark Tunnel trophy is won and costs 320 coins
  (`logic/coast.ts`), bought through an offer card from the hub doorway or the
  Map. Three cutaway exhibits behind one walkway: Penguin Coast (pad M,
  Humboldt penguins), Seal Cove (pad N, harbor seals) and Otter Bay (pad O, sea
  otters). Each is an ordinary `TankRec` (types `penguins`/`seals`/`otters`), so
  food, cleaning, decay, happiness and Rush Hour readiness are the usual rules.
  `isWingHabitat` keeps them out of hall visitors, requests and the fish
  simulation.
- **Layout and movement:** exhibit data (land shelf, pool, ramps, islands, item
  slots) is in `game/data/coast.ts`. Movement is `game/coast/motion.ts`: a mode
  machine (rest / walk / rampDown / rampUp / climb / hop / swim / breathe /
  float) that travels only along segments checked clear beforehand. The live
  movers are in `game/coast/coastRuntime.ts`; they are stepped only while the
  zone is shown. The scene is `scene/coast/CoastZone.tsx` (+ `coastModels.ts`),
  and the HUD is `ui/CoastHud.tsx` (goals, All/Penguins/Seals/Otters views,
  habitat card with the need line, Items / Place / Feed / Clean, the visitor
  chip, the celebration and the offer).
- **Gameplay:** nine items (3 per habitat), bought by tapping. Each item fits only
  slots of its kind: land, floating or pool floor (`coastSlotFits`, also checked
  on load). A habitat without its needed item (resting rocks / haul-out rock /
  kelp bed) is capped at 60 happiness, inside `happiness()`. Feeding draws
  penguins to the fish station if one is placed. Behaviours count only when seen
  on screen (penguin swim, seal dive, otter float). Visitor questions every
  22–36 s: "How many penguins?" (held, numbered, camera framed to fit them),
  "Where is the seal?" (On the rock! / In the water!) and "Can it swim / fly?"
  (otter). All are mic-free through `ask()`; each pays 3 coins. The flow is in
  `game/flow/coast.ts`.
- **Milestones:** 1 Open (3 penguins) → 2 Penguin Paradise (rocks, a swim seen, 2
  questions; reward: a penguin + Seal Cove with a seal) → 3 Seal Cove (haul-out
  rock, a dive, 2 visitors; reward: play ball + Otter Bay with 2 otters) → 4 Otter
  Bay (floating toy, a float seen, 1 question; reward: den + a seal) → 5
  Celebration (all three happy, one question each; trophy, also on the hub
  shelves and the trophy card).
- **Saves:** optional `coastOpen`, `coastIntroSeen` and `coast`. A save that
  claims the coast without the tunnel trophy is not trusted, and missing
  habitats are rebuilt for the milestone reached. Save version unchanged.
- **Debug (Ctrl+Alt+D):** "Preview Coastal & Polar Zone", "Preview coast: all
  habitats", and Coast 1–5 milestone jumps through the real rules, all inside
  the session-only preview sandbox (they used to change the save).
  `window.__at.coastTo(n)` (starts a preview) and `coast()` are the test hooks.
- **Budget (SwiftShader, milestone 5):** the overview is 80 draw calls / 21.1k triangles (above the halls' 62 calls; triangles well below); penguins 31 / 9.6k, seals 23 / 5.2k, otters 30 / 8.7k.
- **Verified (00b6ff5):** full Playwright suite 79/79 on the production preview (21.1 min); typecheck; unit tests 686/686, including `logic/coast.test.ts`
  and `coast/motion.test.ts`. The motion test runs all three species × 3 seeds ×
  240 s against invariants: on land at land height and off boulders; in water
  inside the pool, above the floor, clear of islands and ramp bases; on ramps
  between the land top and the waterline; no step longer than the top speed.
  It caught three real bugs while being written: seals stuck at a ramp foot,
  island exits never chosen, and an otter snapping from depth to the surface.
  `tests/e2e/coast.spec.ts` (2 tests) failed when watched swims were not
  recorded. Frames checked by eye at 1366×768 and 1024×768 (`node
  scripts/coast-review.mjs <url> <w> <h> <milestone>` writes
  `.tmp/coast-review/`).
- **Not verified / known limits:**
  - Motion was judged from still frames, not watched live.
  - Real Chromebook fps in the coast is unmeasured.
  - The 320-coin price is set by comparison with the tunnel, not simulated in
    `economy.test.ts`.
  - Seals rest beside their haul-out rock rather than on top of it.
  - Penguins visit the nest (rest beside it) since the 2026-11-10 redesign.
  - The exhibit-local item slots are fixed points.
  - Coastal visitors on the walkway are a simple stroll (4 people), separate
    from the hub crowd.
  - Real microphone answers to the coastal questions are untested (the phrase
    keys include common accent variants).

## Grand Aquarium Hub (2026-11-10)

Design: DESIGN_DECISIONS.md "Grand Aquarium Hub + Coastal & Polar Zone (plan review)"
and "Hub and coast: decided while building".

- **What:** a half-rotunda concourse (`ROOMS` id `hub`, index 5, `wing: "hub"`, at
  x −84..−56). It opens for free in Free Play once the Shark Tunnel is open (derived
  in `roomOpen`; only `progress.hubIntroSeen` is saved). Pico announces it once,
  then nudges the new **Map / マップ** chip (top right; just the glyph below 1180 px).
- **Navigation:** the Aquarium Map (`ui/AquariumMap.tsx`) offers Grand Hub,
  the four halls, the Shark Tunnel, the coast (locked) and two future
  attractions, with a "You are here" pin and milestone counts. The hub's
  doorways travel too: indoor (back to the last indoor hall), Shark Tunnel,
  coast, and Lagoon/Sanctuary ("Coming soon"). Hall arrows link the hall row
  and the Shark Tunnel (`inHallRow`), plus the branching areas' own links
  (`AREA_LINKS`, 2026-11-11). Any wing switch fades (`isWingHall`). Travel
  is blocked during prompts, lines, panels, placement, celebrations and the
  tunnel walk (`canTravel` in `game/flow/hub.ts`).
- **Scene:** `scene/hub/GrandHub.tsx` (+ painted canvases in `hubArt.ts`). It
  has a display tank (22 reef fish of 5 kinds, `smallFish.ts`, and bubbles, no care), trophy shelves
  that read the existing flags (tap opens a trophy card linking to the Rush
  awards), an information desk, a directory kiosk (tap opens the map) and potted
  palms. The layout data and walking routes are in `game/data/hub.ts`; the crowd
  is groups of 1–3 in `game/hub/hubVisitors.ts` (stepped only while shown, never
  tips).
- **Budget (SwiftShader):** 46 draw calls and 12.9k triangles in the hub (the
  halls are 62 / 40k).
- **Verified (4fe312b):** typecheck; unit tests 681/681 (`data/hub.test.ts`,
  shown to fail on routes cut across the tank); build. Full Playwright suite
  77/77 on the production preview (20.3 min), including `hub.spec.ts` (2 tests,
  shown to fail with the Shark Tunnel door sending to the wrong hall). Frames
  checked by eye at 1366×768, 1280×720 and 1024×768 (`node
  scripts/hub-review.mjs <url>` writes `.tmp/hub-review/`).
- **Known:** `layout.spec` "HUD, close-up and prompts fit" is intermittent. It
  failed 2 of 24 quiet runs on this build (status panel gap 50 px against a
  48 px limit), 0 of 9 on the previous commit, and it also passed in the full
  run. The test reads the panel 500 ms after a 350 ms CSS transition. No hub
  code touches the close-up.

## Debug Rush Hour trigger (2026-11-07)

- Added a "Start Rush Hour now" action in Ctrl+Alt+D Debug. It bypasses the semi-random wait but uses the real preparation countdown, visitor rush, medals, payouts, and existing save state. The debug action closes the panel when successful.
- Only starts in a calm playable state with an occupied tank and the normal Rush Hour eligibility (completed tutorial, Free Play, Ocean Hall); it cannot overwrite an ongoing event. Regular event timing and balancing remain unchanged.

## Tappable hint audio; Shark Tunnel shipwreck removed (2026-11-07)

- General Pico hint bubbles play their visible English instruction aloud when tapped, with a separate dismissal control. The Shark Tunnel's animal-finding clue is also tap-to-hear. Both use shared TTS and avoid overlapping ongoing speech; no answer choices are revealed.
- Removed the U-bend shipwreck model, its swim-collision solids, geometry test and associated files at the user's request. The central area is open again, retaining its original low reef rocks. Replacement centerpiece is undecided.
- No camera choreography, player progression, coin economy or saves were altered.

## Rush Hour event (2026-11-07)

Design: DESIGN_DECISIONS.md "Rush Hour event (design freeze)", "decided while
building", "bigger crowd" and "HUD in the objective slot".

- **What:** a recurring free-play event (unlock: free play, Ocean Hall, an occupied
  tank). Every 8–12 min (first) / 12–18 min of active play, a "Rush Hour soon!"
  card (Start Now / キャンセル, auto-start after 20 s) → preparation (120/150/210 s by
  tank count) with a checklist that navigates to each tank → 90 s visitor crowd →
  results (medal, `floor(min(40, 10+3n) × fraction)` coins) → awards panel. Tanks
  latch "prepared" once food and clean are both ≥75.
- **HUD:** the Rush card replaces the Free Play / Goals card in the upper-left slot
  for pending/prep/rush (`GoalCard` in `Hud.tsx` → `RushObjective` in
  `RushHour.tsx`, styles `RushObjective.css`). Large `MM:SS` timer, time bar,
  per-tank pips, urgency stages at 60/30/10 s keyed to clock ticks, grey paused
  state, compact variant in close-up / tunnel walk, "≡ もくひょう" peeks at goals.
- **Crowd:** target 18 in the regular halls (15 cosmetic + 3–4 reserved ordinary
  places), groups of 3–4 every 6–8 s to the least-crowded exhibit. Governor
  `src/game/rush/crowdBudget.ts` (18/14/12, 4 s windows, poor > 34 ms, good < 24 ms,
  cooldown) fed from `GameScene`'s frame clock; excess cosmetics leave after their
  current look. Shark Tunnel visitors unchanged. Visitor renderer shares geometry.
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
- **Crowd evidence (software renderer, headless, not a Chromebook):** a live rush
  filled in groups of 3–4 every ~5–10 s and never passed the cap; at ~9 fps the
  governor went good → moderate (~10 s) → low (~20 s) and settled at 9 cosmetics;
  everyone left after the event; no cosmetic tips. `tests/e2e/rush-crowd.spec.ts`.
- **Unverified:** real Chromebook fps with the 18-person crowd, and how often the
  governor steps down there; whether 120 s
  is enough for children with 4 tanks across rooms; English rush questions observed
  only through unit tests; first-unlock Pico intro seen only in tests.
- **Known:** at the default room camera the cabinet sits at the left screen edge
  (medals visible, the golden sign on its crown cropped); the ⭐ HUD button also opens
  the awards. Follow-up: reframe or move the cabinet. A free-play save shows Pico's
  one-time Rush intro shortly after loading, so e2e seeds set `rush.introSeen`.
- **Verified 2026-11-07 (HUD + crowd, 8bb83e0):** typecheck, build, 646 unit tests
  (geometry/swim tests time out only when e2e runs alongside); full e2e 73/75 on one
  loaded 22-min run, the two failures (requests "show me", rush reload) passed 2/2 on
  rerun; rush.spec 6/6 several times. CI deploy to Pages succeeded. The layout e2e
  waits out Pico's one-time "New tanks and animals!" line (`afterOpeningLine`).

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
   shelf shapes, a glass-floor section for "under", spoken visitor reactions.
8. Rush Hour with children: is 2 min enough for 1–4 tanks across rooms, do they
   find the checklist, do medals motivate; fps of the crowd on a Chromebook.
9. Hub and coast on a real Chromebook: fps in the hub (46 calls on SwiftShader)
   and the coast views; whether children find the Map chip and the "!" window
   visitors; watch the penguins/seals/otters move live (only frames were judged).
10. Coast follow-ups: simulate the 320-coin price in `economy.test.ts`; seals
   resting on top of their haul-out rock; penguins using the nest burrow; more
   coastal questions ("What's this? It's a seal."), a coast arrival camera
   sweep.
11. Decide whether `layout.spec` "HUD, close-up and prompts fit" needs to wait for
   the status panel's own transition (intermittent 50 px vs 48 px gap).
12. Decided 2026-11-10: the coast, the lagoon and the sanctuary stay
   debug-only (Ctrl+Alt+D preview); no release order or unlock rule for now.
13. Before releasing the outdoor areas: preview them on a real school
   Chromebook (fps in the lagoon overview and the sanctuary lookout, which draw
   the most), watch the dolphins and orcas move live, and try the new phrases
   with a real microphone (on / under, island / boat, big / small, the animal
   names).

## Codex / Delegated Work
**Pending (2026-11-13):** wave 2 in `../aq-curriculum` and `../aq-naming` (see
Next steps item 0). If a run stops PARTIAL, add a `partialWork` block to its
`.ai/work-order.json` and re-run `delegate.js`; never start it over.

Earlier work: none pending. The Shark Tunnel's two Codex slices (worktrees aq-st1 and aq-st2) stopped
on a usage limit on 2026-11-06; Claude finished and integrated all of it on branch
st1-habitat. The 2026-10-24 guidance pass was split into four Codex runs
(guide + shop + level cards; visitors + bench; wall + trophy; request card),
all reviewed and accepted; layout fixes, the bench glide and test repairs were
done by Claude.
