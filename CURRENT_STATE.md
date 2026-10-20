# Current State

## Status
Phase 1 vertical slice is implemented and plays end to end. Verified 2026-10-20:
`npm test` (56 unit tests), typecheck, build, and the Tap-mode Playwright
playthrough (`tests/e2e/loop.spec.ts`: tutorial → five stages → judge → results →
free play) pass. Visuals checked by eye in screenshots at 1366×768
(`.tmp/shots/tap/` from the e2e run with `SHOTS=1`, `.tmp/scenes/` from
`node scripts/shots.mjs` at real speed).

## What Exists
- **Design:** DESIGN_DECISIONS.md "Phase 1 design (frozen)" is the spec.
- **Rules (pure, tested):** `game/logic/model.ts` (economy, care, happiness,
  rewards, stage goals), `swim.ts` (bounded fish steering), `requests.ts`,
  `english.ts` + `speechMatch.ts`, `save.ts` (`at.save.v1`, validated),
  `economy.test.ts` (simulated student through all stages).
- **Flow:** `game/flow/ask.ts` (speech/tap prompts + hint ladder), `actions.ts`
  (every button / 3D tap), `visitors.ts` (spawning, walking, tips, requests,
  celebration shot), `story.ts` (tutorial, stage cards, Pico's count, photo
  day, judge, autosave, nudges), `input.ts`. `game/sim.ts` per-frame step;
  `runtime.ts` per-frame state; `store.ts` zustand.
- **Scene:** `scene/Room.tsx`, `Tank.tsx` (water shader, glass, fish with
  swim-bend shader, decorations, pellets, bubbles, dirt, sponge, badge,
  nearest-target tap picking), `Visitors.tsx`, `Pico.tsx`, `Effects.tsx`,
  `Markers.tsx`, `CameraRig.tsx`; models in `scene/models/`.
- **UI:** `ui/Hud.tsx`, `Talk.tsx` (prompt, dialogue, request banner),
  `Shop.tsx`, `Screens.tsx` (title, stage card, results), `Settings.tsx`.
- **Test hook:** `window.__at` with `?e2e=1` (`state`, `where`, `freezeFish`,
  `advance`, `setCare`, `visitors`, `requestVisitor`). `?fast=1` shortens waits.
- **Dev:** `npx vite --port 5320`; `BASE_URL=http://127.0.0.1:5320 npx playwright test`
  runs e2e against it (`SHOTS=1 SHOTS_DIR=name` saves screenshots).

## Current Work
Remaining Phase 1 checks: speech-mode playthrough (interim acceptance, wrong
speech), mic-blocked fallback, save/continue/new game, layout at Chromebook and
touch sizes, README, final full run on the built preview.

## Known Issues
- `THREE.Clock` deprecation warning from R3F (harmless).
- SwiftShader runs at ~5–20 fps; real Chromebook GPU performance untested.
- Real speech recognition and TTS voices untested (stubs only).

## Next Steps
1. Finish the remaining checks above.
2. Play on a real Chromebook with a class.

## Codex / Delegated Work
None. The user asked Claude to implement directly ("do yourself, no router").
