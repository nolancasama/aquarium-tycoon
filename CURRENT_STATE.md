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

## What Exists
- **Design:** DESIGN_DECISIONS.md — brief changes, the frozen Phase 1 design,
  and decisions made while building.
- **Rules (pure, tested):** `src/game/logic/` — `model.ts` (economy, care,
  happiness, rewards, stage goals), `swim.ts`, `requests.ts`, `english.ts`,
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
  `layout` (+ `flows.ts`, `helpers.ts`, `stubs.ts`). README lists what each covers.
- **Scripts:** `scripts/shots.mjs` (real-speed scenes), `scripts/peek.mjs`
  (Speak-mode prompt states). Both need a server on 5320 (`npx vite --port 5320`).
- **Deploy:** `.github/workflows/deploy-pages.yml` (tests + build + Pages once
  public). The repository is local only (no GitHub remote yet).

## Known Issues
- Real speech recognition, TTS voices, audio levels and real Chromebook GPU
  performance are untested (stubs and SwiftShader only).
- `THREE.Clock` deprecation warning from R3F (harmless).
- In the big tank's close-up the back-wall sign shows, cut off, at the top left.
- Playtime (~20–30 min to the trophy) is an estimate, not measured with children.

## Next Steps
1. Play it on a real school Chromebook with a class: speech acceptance, whether
   children find the visitor chip and the Decorate button, Stage 3–5 pacing.
2. If wanted, publish: create the GitHub repo, push, make it public, enable
   Pages (Actions).
3. Phase 2 (per the brief): a larger room, more tank types and species,
   upgrades, more visitors and decorations. Freeze its design first.

## Codex / Delegated Work
None. The user asked Claude to implement directly ("do yourself, no router").
Nothing is pending review.
