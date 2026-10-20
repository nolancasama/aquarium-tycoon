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

- **Speak / Tap** (title screen and Settings): Speak uses the microphone; Tap
  shows two or three English buttons instead. Both complete the whole game. If
  the microphone is blocked, the game switches to buttons by itself.
- After three missed tries, the buttons appear anyway as a rescue.
- **Japanese help** (hiragana) explains what to do; the English answers are
  never translated. Settings also has a slow voice and music/sound volumes.
- Progress saves automatically on the device. **Continue** resumes; **New game**
  asks first. Settings are kept separately and survive a new game.
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
```

E2E specs: `loop` (whole game, Tap mode), `speech` (whole game spoken; wrong
speech, hint ladder, interim results, accents and digits), `fallback` (blocked
or missing microphone, silence, mode switch), `save` (autosave, continue,
restored tanks/unlocks/settings, new game, corrupted save), `requests` ("show
me" ladder, rewards once, waiting without a timer, counting clue), `layout`
(HUD fits at 1366×768, 1280×800 touch and 1024×600 touch; touch shopping).

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

## Deploying

`.github/workflows/deploy-pages.yml` runs the tests and the build on every push
to `main` and deploys `dist/` to GitHub Pages once the repository is public with
Pages set to "GitHub Actions".
