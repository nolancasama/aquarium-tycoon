# Current State

## Status
Phase 1 (vertical slice) design is frozen in DESIGN_DECISIONS.md (2026-10-20).
Implementation in progress.

## What Exists
- Scaffold: package.json (React 19, R3F 9, three 0.186, zustand 5, Vite 8,
  Vitest, Playwright 1.63), tsconfig, vite/playwright configs (preview port
  4177), GitHub Pages workflow. `npm install` done.
- Copied from monster-island as starting points (to be adapted):
  `src/audio/{recognition,tts,audio}.ts`, `src/game/logic/{rng,speechMatch,english,save}.ts`,
  `src/game/flow/ask.ts`, `src/scene/partBuilder.ts`, `tests/e2e/{stubs,helpers}.ts`,
  `scripts/shots.mjs`, `src/main.tsx`.

## Current Work
Building Phase 1 directly (no router, the user's instruction).

## Known Issues
None yet.

## Next Steps
1. Pure logic + data + unit tests (`src/game/data`, `src/game/logic`).
2. Store/runtime/sim, scene, UI, flow (tutorial, visitors, stages, judge).
3. Playwright: tap playthrough, speech playthrough, mic blocked, save/continue, layout.

## Codex / Delegated Work
None. The user asked Claude to implement directly ("do yourself, no router").
