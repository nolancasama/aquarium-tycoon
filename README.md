# Aquarium Tycoon

A 3D aquarium management game for Japanese grade 3 beginners learning English.
Choose fish, put them in tanks, decorate, feed and clean, help visitors, earn
coins, buy a big tank and become an **Aquarium Star**. English is how you shop,
care for the fish and help visitors: "Blue, please!", "Feed the fish!",
"Clean, please!", "Three fish!", "Yes, I do.", "I like blue." — and visitors'
requests like "I like orange fish!" and "How many fish?".

Runs in Chrome on Chromebooks, desktops and Android. No server, no downloads:
all models, textures and sounds are generated in the browser.

## For teachers

- **Speak / Tap** (Settings): Speak uses the microphone; Tap
  shows two or three English buttons instead. Both complete the whole game. If
  the microphone is blocked, the game switches to buttons by itself.
- After three missed tries, the buttons appear anyway as a rescue.
- **Japanese help** (hiragana) explains what to do; the English answers are
  never translated. Settings also has a slow voice and music/sound volumes.
- Progress saves automatically on the device. **Continue** resumes; **New game**
  asks first. Settings are kept separately and survive a new game.
- Objectives start collapsed at the upper left: read **Next**, then expand
  **Objectives / もくひょう** for the checklist and location hint. Coins, level
  and hearts stay centered. Tap the level to see Levels 1–8; **Help / ヒント**
  still provides the progressive hints.
- Level and trophy celebrations have one **Continue / つづける** button.
  Settings keeps the save-and-return-to-title option.
- A first playthrough (tutorial to Aquarium Star) should take roughly 20–30
  minutes (an estimate from the visitor timings, not yet timed with a class);
  afterwards free play continues.

## The game

| Level | Goal | Reward |
|---|---|---|
| 1 My First Fish | Tutorial: buy a fish, feed it, help a visitor | Decorations |
| 2 More Fish | Two fish, count them, clean a tank | The Yellow Fish |
| 3 First Visitors | Help 3 visitors | The big tank |
| 4 Aquarium Designer | Place the big tank, a fish and 2 decorations in it | The fish fan's photo day |
| 5 Aquarium Star | Help 3 visitors, make every tank happy | The judge, the trophy, free play |

Levels 6–8 add the Ocean Hall, sea animals, the tall tank, upgrades and the
second judge. From Level 8 (Expansion 1) the shops also sell special tanks
(hexagon, panorama, jelly column, rocky cave), ten more animals (angelfish,
goby, a chromis school, moray eel, octopus, crab, stingray, three jellyfish),
habitat decorations, remodelling of placed tanks, and the Jellyfish Gallery.

Fish never die and nothing is lost; there are no timers. Happiness comes from
food, clean water and decorations (each fish has a favourite decoration).

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (rules, economy simulation, speech matching, save)
npm run typecheck
npm run build        # dist/ (relative paths: any GitHub Pages sub-path)
npm run e2e          # build + Playwright (SwiftShader, 1366x768 Chromebook profile)
```

Faster e2e against a running dev server, with screenshots for review:

```sh
npx vite --port 5320
BASE_URL=http://127.0.0.1:5320 SHOTS=1 SHOTS_DIR=tap npx playwright test loop.spec.ts   # .tmp/shots/tap/
node scripts/shots.mjs   # real-speed scenes (feeding, dirt, cleaning, celebration) -> .tmp/scenes/
node scripts/peek.mjs    # Speak-mode prompt states -> .tmp/peek/
node scripts/polish-review.mjs # title, HUD sizes, bench frames, markers, signs -> .tmp/polish-review/
```

E2E specs: `loop` (whole game, Tap mode), `speech` (whole game spoken; wrong
speech, hint ladder, interim results, accents and digits), `fallback` (blocked
or missing microphone, silence, mode switch), `save` (autosave, continue,
restored tanks/unlocks/settings, new game, corrupted save), `requests` ("show
me" ladder, rewards once, waiting without a timer, counting clue; the card
persists across tanks, halls and touch layouts), `guide` (Level 6 "Next" line
and Help tiers, labelled Ocean Hall offer, carried turtle, level overview),
`visitors` (tapping a request visitor while walking and after sitting, paid
once), `layout`
(viewport-centered status and collapsible objectives at 1366×768, 1280×720,
1024×768 and 844×390; existing touch shopping layouts),
`phase2` (Levels 6–8 from a starred save: Ocean Hall, habitats, tall tank,
"What's this?", upgrades, the second judge; animal names by voice).

Test hook: `?e2e=1` exposes `window.__at` (state, screen positions, frozen
fish, time, visitors); `?fast=1` shortens waits; `?seed=N` fixes randomness.

### Code map

- `src/game/logic/` — pure rules with unit tests (model, swim, requests, english, speechMatch, save)
- `src/game/data/` — fish, decorations, tanks
- `src/game/flow/` — prompts (`ask.ts`), actions, visitors, story (tutorial, stages, judge, save)
- `src/game/sim.ts`, `runtime.ts`, `store.ts` — per-frame step, per-frame state, zustand
- `src/scene/` — React Three Fiber scene and procedural models
- `src/ui/` — HUD, prompts, shops, screens, settings
- `DESIGN_DECISIONS.md` — what was decided and why; `CURRENT_STATE.md` — where things stand

### Adding a room, tank shape or animal

The aquarium is data-driven; most additions are one entry plus their art.

**A room.** Add a `RoomDef` to `ROOMS` in `src/game/data/rooms.ts`. Rooms sit
in a row along +x, 12 m wide, and each shares a doorway (z = `DOOR_Z`) with the
room before it. Give the room its pads (new `SlotId` letters in
`src/game/types.ts`, positions in `SLOT_POS`, accepted types in `PAD_TYPES`,
built-in tanks in `BUILT_IN_PADS`) and an unlock flag. The flag is a new
boolean in `Progress` (`model.ts`), read by `roomOpen()`, defaulted and
validated in `save.ts`. An open-room action (like `openGallery`) adds any
built-in tank. Routes (`world.ts route()`), the hall arrows, camera framing
and "which room is this pad in" (`HALL_OF`) follow automatically. Then draw
the room: a geometry function in `src/scene/models/room.ts` and a component in
`src/scene/Room.tsx` shown when the room is open, plus a door leaf in the
previous room's doorway. Keep the visitor lane (z ≈ 0–2.5) and the doorway
clear; `src/scene/rooms.test.ts` checks the doorways.

**A tank shape.** Add a `TankType` and a `TANKS` entry in
`src/game/data/tanks.ts`: size, `shape` (box, hex, round, bow; a genuinely new
shape also needs a case in `tankFishBounds()` in `logic/swim.ts`), capacity,
decoration slots and `decorSize`, plus optional `bulge`, `backRock`, `dens`,
`rocks`, `lights`, `current`. Add it to the pads that take it (`PAD_TYPES`)
and to the species habitats that should live in it. Draw it in
`src/scene/models/tankShell.ts` (`tankShellGeometry`, `waterGeometry`) and the
shape cases in `src/scene/Tank.tsx` (glass, overlays, surface). Add a shop
picture and offer in `src/ui/Shop.tsx`. `tankLayout.test.ts` and
`tankShapes.test.ts` check slots, sand and footprints for every entry.

**An animal.** Add a `SpeciesId` and a `SPECIES` entry in
`src/game/data/fish.ts`: `kind` (fish or animal), `counter` (fish by colour,
animal by name, jelly by name then colour), `habitat` and `needs` (the "Needs a
___!" hint), `movement` (swim, perch, school, glide, walk, crawl, den, drift;
see `logic/behavior.ts`), `body`, size, speed and favourite decoration. Add
its English: a "please" phrase if ordered by name (`ANIMAL_PHRASE`), its
"What's this?" answer (`ITS_PHRASE`; check the article: "an eel"), recogniser
variants, and `NOT_FISH` if its name could be heard as "fish". Then give it a
model and animation in `src/scene/Animals.tsx` and `src/scene/models/`, and a
shop picture in `src/ui/Portraits.tsx`. `expansion.test.ts` checks that every
species has an answer and that every counter-animal has a name to order by.

## Deploying

`.github/workflows/deploy-pages.yml` runs the tests and the build on every push
to `main` and deploys `dist/` to GitHub Pages once the repository is public with
Pages set to "GitHub Actions".
