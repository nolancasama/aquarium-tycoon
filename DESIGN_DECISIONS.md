# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-10-20 — Brief accepted, with these changes

The brief "Aquarium Tycoon" (3D aquarium management + fish care, Japanese grade 3
beginners) is the product definition. Its phase plan is kept: a fully playable
Phase 1 vertical slice first, tested, before anything from Phases 2–4.

**Accepted as written:** the core loop (choose fish → place → decorate → care →
visitors → coins → expand), the two camera modes (fixed isometric management
view + front tank close-up), fixed tank placement slots, the three MVP species,
food / cleanliness / happiness with no death or permanent loss, the five
progression stages, the Speak / Tap teacher setting with automatic Tap fallback,
the progressive hint ladder, hiragana instruction hints that never translate the
target English, versioned LocalStorage saves with Continue / New Game,
procedural low-poly art, procedural sound, the stack (React, TS, Vite, R3F,
Zustand), GitHub Pages, and the testing list.

**Changed:**

- **The tutorial visitor asks for the colour the student chose.** The brief has
  the student pick "Blue or orange?" and then a visitor say "I like orange
  fish!"; a student who picked blue would have no orange fish. The tutorial
  visitor says "I like <chosen> fish!".
- **"Three fish, please!" becomes "How many fish?".** As a request it was
  ambiguous (show a tank with three fish? buy three?). Counting is now a visitor
  question about a tank the visitor is looking at; the student says the number
  ("Three fish!" / "Three!"). This is where numbers are produced.
- **Every fish purchase uses the shop's English, not only the first.** The shop
  counter asks "What color?" and the student says "Blue, please!". It is the
  natural shop sentence, both answers are valid, and the answer decides what
  they get, so it is a choice rather than a quiz. Decorations that come in two
  versions ask "Red or blue?" / "Big or small?" the same way; decorations with
  one version are bought with one tap (the brief: not every decoration decision
  is a quiz).
- **Shop cards show the fish picture and price, never the name or a colour
  word.** "Blue Tang" on the card would let a student tap the word that matches
  the card. The student sees a blue fish and has to say or pick "Blue".
- **Care buttons are icons with hiragana labels, not English words.** In Tap
  mode, "Feed the fish!" next to a button labelled "Feed" is matching, not
  reading. The English is spoken and shown in the prompt only.
- **Visitors with a request wait on a bench until helped.** No patience timer
  (the brief forbids stressful countdowns). Only one request visitor at a time,
  so an ignored one blocks nothing; ordinary visitors keep coming.
- **Every visitor tips a little (1–3 coins per tank viewed, more when fish are
  happy).** This is the guarantee against a financial dead end and makes care
  pay off visibly. Requests pay more (10–15).
- **Care English is required the first time only** (brief): "Feed the fish!" on
  the first feed of a save, "Clean, please!" on the first clean. After that the
  buttons act at once.
- **Upgrades (filtration, capacity, visitor capacity), a larger room, more tank
  types and the turtle request move to Phase 2.** The MVP's expansion is the
  second (big) tank.

**Rejected:**

- Drag-and-drop decoration placement: tap an item, then tap a slot. Dragging is
  unreliable for 8-year-olds on touchscreens and for automated tests.
- Offline decay: stats do not change while the game is closed. Coming back to
  hungry, dirty fish after a weekend would be punishment.
- A free camera: the management view rotates ±30° and zooms a little; nothing
  else.
- A per-prompt "tap instead" button (esl-verbs lesson: most students take a
  voluntary opt-out). Buttons are a rescue after three misses, or the teacher's
  Tap setting.

**Added:**

- **Pico the penguin**, the aquarium keeper (cap, bow tie), is the assistant:
  greets, runs the tutorial, announces stage rewards and gives one-line nudges
  when a student stalls.
- **Tapping a fish (no request open) makes it say what it likes** ("I like
  coral!") with a picture of the liked decoration. It is the visible hint for the
  happiness bonus and extra "I like ___" listening, never assessed.
- **"Show me" requests accept anything of that colour.** "I like blue!" accepts
  the blue tang or the blue coral. "I like blue fish!" accepts only fish.

## 2026-10-20 — Engineering inherited from monster-island / haunted-hotel

- Speech: one press of Space / 🎤 = one bounded session (7 s cap); a valid
  interim result is accepted at once; only the top hypothesis judges (later
  alternatives may only rescue a result that matched nothing); one success =
  one action. Only permission/hardware errors (not-allowed,
  service-not-allowed, audio-capture) switch to Tap for the session; silence or
  a network error is an ordinary miss. Music and ambience go silent while the mic
  is open (speaker bleed) and duck under spoken English. The microphone is
  requested once when the game starts in Speak mode, with an 8 s timeout.
- Matching is key-word based with accent/recogniser variant tables (esl-likes:
  a false rejection is worse than a false acceptance). Digits count for numbers
  ("3"), and esl-counting's variants are used (three: free, tree, sri; four:
  for, fore; two: to, too; one: won; five: fife). Two different numbers in one
  utterance is unclear, not correct.
- `src/audio/recognition.ts`, `tts.ts`, `audio.ts`, `logic/speechMatch.ts`,
  `logic/english.ts`, `logic/save.ts`, `flow/ask.ts`, `scene/partBuilder.ts`,
  `tests/e2e/stubs.ts` / `helpers.ts` and `scripts/shots.mjs` were copied from
  monster-island as starting points and are adapted, not rewritten.
- Everything procedural: merged vertex-coloured primitives (`PartBuilder`), Web
  Audio synthesis, inline SVG icons/portraits, system fonts. No asset files,
  webfonts or CDNs (school networks block them).
- Chromebook budget: fixed light set, no real-time shadows (blob shadows),
  dpr ≤ 1.5 with a one-way drop to 1× after ~4 s under ~28 fps, target ≤ ~120
  draw calls. No graphics setting.
- Per-frame state (fish positions, pellets, visitor walking) lives in
  `runtime.ts` outside React; zustand holds game and UI state; pure rules live in
  `game/logic/` with unit tests; scripted flow is async (`await say(...)`,
  `await ask(...)`).
- Test hook `window.__at` only with `?e2e=1`; `?fast=1` skips pauses; `?seed=N`
  fixes randomness. Playwright drives the real UI with TTS/recognition stubs.

## 2026-10-20 — Phase 1 design (frozen)

### World and views

- **One room** (about 14 × 10 m): entrance on the front-left, a walkway across
  the front, a waiting bench front-right, two tank pads along the back (slot A
  left, slot B right), posters and windows on the back wall, an empty pedestal
  by the entrance (the trophy goes there).
- **Management view:** elevated three-quarter perspective of the whole room
  (fov ~35°). Drag rotates ±30° around the room centre; wheel/pinch zooms within
  a small range. Tap a tank → close-up. Each tank shows a floating status badge:
  a face (happy / okay / sad) plus a food icon when hungry and a sponge icon when
  dirty.
- **Close-up:** an eased (~0.8 s) move to a front view where the tank fills
  ~70% of the width above the action bar. Back returns to the management view.
  While a prompt panel is open the view slides up by half the panel height,
  capped at 30% of the screen (haunted-hotel lens shift), so the tank stays
  visible.

### Tanks

| Tank  | Price         | Fish capacity | Decoration slots | Water size (w × d × h) |
|-------|---------------|---------------|------------------|------------------------|
| Small | starter, free | 3             | 3                | ~1.6 × 0.8 × 0.9 m     |
| Big   | 80            | 5             | 5                | ~2.4 × 0.9 × 1.1 m     |

- Slot A holds the starter Small tank from the start. Slot B is an empty pad
  (faint outline, padlock until the Stage 3 reward).
- Buying the Big tank puts it in a box (HUD chip). Placement mode: empty slots
  glow, a transparent preview shows at the tapped slot, ✔ places, ✖ cancels
  with no penalty (the box stays in the HUD to place later).
- Water: a back panel with a blue-green gradient and cheap animated caustics,
  a gently moving surface, sand floor, a single faint glass box (no refraction,
  no fluid simulation). Bubbles are instanced (one draw call per tank).

### Fish

| Species     | Colour word | Price | Unlocked      | Size   | Swimming                                   | Likes |
|-------------|-------------|-------|---------------|--------|--------------------------------------------|-------|
| Clownfish   | orange      | 20    | start         | small  | wiggly, darts, stays low near decorations  | coral |
| Blue Tang   | blue        | 30    | start         | medium | smooth gliding loops, mid-water            | plant |
| Yellow Fish | yellow      | 40    | Stage 2 reward| small  | energetic zigzags and bursts, upper water  | rock  |

- Silhouettes: clownfish a rounded torpedo with three white bands; blue tang a
  flat oval with a yellow tail; yellow fish a tall disc with a pointed snout and
  long dorsal fin. Big eyes with highlights, small mouths, readable at small
  sizes. One shared geometry and material set per species.
- Animation: idle swim (tail and body wave), banked turns, feeding (dart to a
  pellet, gulp, small bounce), happy reaction (loop or spin with sparkles),
  hungry behaviour (slower, drifts up toward the feeding spot, droopy fins),
  occasional playful moves (a loop, a bubble). Speed ×0.7 when sad (happiness
  < 40), ×1.25 when happy (≥ 70).
- Movement is pure steering in `game/logic/` (wander targets inside the tank's
  inner bounds, inset by the fish's radius, max turn rate, soft separation from
  other fish, staying above decoration heights). Fish never leave the inner
  bounds; this is unit-tested over long random runs.
- While a "show me" request is waiting for a tap, fish slow to ~30% speed and
  have generous tap targets, so a child can tap a moving fish.

### Decorations

| Decoration    | Versions               | Price      | Colour word for requests | Joy     |
|---------------|------------------------|------------|--------------------------|---------|
| Plant         | big / small            | 8 / 5      | green                    | 8 / 5   |
| Coral         | red / blue             | 10 / 10    | red / blue               | 8 / 8   |
| Rock          | big / small            | 8 / 5      | — (grey)                 | 6 / 4   |
| Seashell      | —                      | 5          | —                        | 4       |
| Treasure chest| —                      | 20         | —                        | 12      |
| Bubbles       | —                      | 15         | —                        | 10      |

- The chest opens now and then and lets out bubbles; the bubbler is a bubble
  column. Big versions are visibly taller (plant ~60% of the water height, small
  ~30%).
- Placement in the close-up: Decorate → a tray of owned, unplaced decorations
  (plus the shop) → tap an item → empty slots pulse → tap a slot → it appears
  with a pop. Tap a placed decoration to pick it up, then tap another slot
  (swap if taken) or Put away (back to the tray). Cancel any time. Slots sit on
  the sand inside the glass, so nothing can be placed outside or clip it.
- Decorations can be moved between tanks (put away, then place in the other).

### Care

- Each tank has food and clean (0–100). Decay runs only during play (not on the
  title screen, in Settings, or during the scripted tutorial): food −1 every
  3 s (full to empty in 5 min), clean −1 every 5 s (~8 min). Never below 0, no
  harm at 0.
- **Feed:** +60 food (max 100). 6–10 pellets fall from the feeding spot, fish
  steer to them and eat, the bar fills. At food ≥ 90 nothing is dropped and a
  "full" bubble shows (おなか いっぱい).
- **Clean:** a sponge sweeps the glass and the dirt fades (~1.5 s); clean → 100.
- **Dirty visuals:** below 70 floating particles appear and thicken; below 40 the
  water turns cloudy green with algae spots on the glass.
- **Happiness** (tanks with fish only):
  `happy = round(0.35·food + 0.25·clean + min(30, Σ joy) + likesBonus)` where
  `likesBonus = 10 × (fish whose liked decoration kind is in the tank) / (fish
  count)`. Thresholds: ≥ 70 happy, 40–69 okay, < 40 sad.
  A fed, clean tank with no decorations is 60 ("okay"): decorations are what
  make fish happy, which gives them a real purpose.

### Economy

- Start: 100 coins, one Small tank, Pico's fish shop.
- Visitor tip, paid when the visitor leaves, per tank they looked at:
  1, +1 if that tank is ≥ 40 happy, +1 more if ≥ 70 (1–3 coins).
- Request success 10, +5 if the tank involved is ≥ 70 happy. Chat answers 8.
  Tutorial visitor 10. Stage 4 special visitor 30. Aquarium Star inspection 50.
- Every reward is granted once per visitor id (idempotent).
- Coins never go negative; purchases are atomic; prices never change.
- Dead-end guard: if no tank holds a fish, no fish is waiting in a bag, and
  coins are below the cheapest unlocked fish, Pico gives a free clownfish.
- Visitors come only while at least one fish is in a tank.
- Affordability: a student following the goals must reach the Stage 4 goals
  with the Big tank affordable after at most ~6 helped visitors in Stage 3–4
  (checked by a simulation test, which is how prices get rebalanced).

### Visitors

- Types: child (small, cap, backpack), adult (tall, shoulder bag), fish fan
  (fish hat, camera). Simple low-poly people with a walk cycle, lean-to-look,
  happy jump with hearts, and a "hmm" for sad tanks.
- A visitor arrives every 18–28 s (seeded); at most 3 on screen; walk:
  entrance → the viewing spot in front of each tank (4–6 s, react to its
  happiness) → exit, dropping coins that fly to the counter.
- **Request visitors** carry a "!" bubble, sit on the bench and wait (no timer);
  a HUD chip also shows them. At most one at a time. Chance: none during the
  tutorial, 1 in 3 visitors in Stages 2 and 4 and free play, 1 in 2 in Stages 3
  and 5, and the next visitor is guaranteed to have one if 45 s have passed
  without one while a goal needs visitors. The same request type never comes
  twice in a row. Tapping the visitor (or the chip) opens the request.
- Request types (generated only when valid for the current aquarium):
  1. **Show me (listening → tap):** "I like blue fish!" (fish colours present)
     or, from Stage 4, "I like red!" (any fish or decoration of that colour).
     Preferred only when at least two different target colours exist, so it is a
     real choice. The request shrinks to a banner (sentence + 🔊); the student
     opens a tank and taps a matching fish/decoration. Right: the visitor comes
     to that tank, the fish loops at the glass, hearts, coins (the celebrating
     visitor and the fish are visible in the same shot). Wrong: the hint ladder
     below.
  2. **How many fish? (speaking):** needs a tank with 2–5 fish; the camera goes
     to that tank; the student says the number. Tap choices are number words
     (right, ±1), never digits or pictures.
  3. **Chat (speaking, free choice):** "Do you like fish?" → "Yes, I do." /
     "No, I don't." (different friendly replies), or "What color do you like?"
     → "I like red / blue / yellow / green / orange." (a fish of that colour, if
     any, swims to the glass). Both are always valid.
- Helping a request visitor adds one heart to the aquarium (reputation, shown in
  the HUD and counted by Stages 3 and 5).

### English (what is produced vs. understood)

- **Said / chosen by the student:** "Orange / Blue / Yellow, please!" (fish
  shop), "Red / Blue, please!", "Big / Small, please!" (decoration shop),
  "Feed the fish!", "Clean, please!" (first time), "One … Five (fish)!",
  "Yes, I do." / "No, I don't.", "I like <colour>.".
- **Heard and acted on:** "Blue or orange?", "What color?", "Big or small?",
  "I like blue fish!", "I like red!", "How many fish?", "Do you like fish?",
  "What color do you like?".
- Judged on key words: the colour, size or number word; "feed" + "fish";
  "clean"; yes / no. "Please", articles and "I like" are not required. Colour
  variants: monster-island's (green includes clean/glean only in colour
  prompts), plus red (red, read, led, rad, wred), yellow (yellow, yello, yelo,
  iero, jello). The clean command does not accept "green".
- Words not taught (filtration, ecosystem…) may appear only in optional
  Japanese info text, never assessed.

### Prompts and the hint ladder

- Prompt panel at the bottom (≤ 30% of a 1366×768 screen): the question or the
  sentence(s) to say, a large 🎤 (Space), 🔊 replay, the heard text, a listening
  animation with rings. In Speak mode the possible answers are visible but inert
  (a child cannot say a word they have not seen); command sentences are read
  aloud when the prompt opens.
- Miss 1: "Try again!" and the target (or question) is replayed slowly.
  Miss 2: the key word is highlighted with a visual clue (colour swatch, size
  icon, for counting the fish glow one by one). Miss 3: the choices become
  tappable. "Show me" requests use the same ladder on wrong taps, and the third
  step makes the right tank/fish glow.
- Tap mode (teacher setting, title and Settings): two or three short English
  word buttons appear at once; distractors are real alternatives (other colours,
  other numbers). Both modes complete the whole game.
- Japanese hints (default on) are hiragana instructions under the prompt
  ("いろを えいごで いおう!"); target English is never translated.

### Progression (each stage's goals can be done in any order)

| Stage | Name (HUD)          | Goals                                                                                   | Reward |
|-------|---------------------|-----------------------------------------------------------------------------------------|--------|
| 1     | My First Fish       | Tutorial: buy a fish ("Blue or orange?"), put it in the tank, "Feed the fish!", help the tutorial visitor | Decorations unlocked + a free small plant and seashell, placed with Pico's help |
| 2     | More Fish           | Own 2 fish; answer Pico's "How many fish?"; clean a tank once                          | Yellow Fish unlocked |
| 3     | First Visitors      | Help 3 request visitors                                                                 | Big tank unlocked (Tank shop, slot B opens) |
| 4     | Aquarium Designer   | Place the Big tank; put a fish in it; 2 decorations in it                               | Special visitor: the fish fan's photo day (30 coins, a framed photo on the wall) |
| 5     | Aquarium Star       | Help 3 more request visitors; every tank with fish happy (≥ 70) at once → the judge visits | Aquarium Star trophy on the pedestal, results card, Free Play |

- **Tutorial (3–5 min, linear, skippable lines):** Pico: "Hello!" → "Let's get a
  fish!" → shop shows clownfish and blue tang → "Blue or orange?" → the fish
  goes into a bag → "Tap the tank!" → splash, close-up → "Feed the fish!" →
  feeding → back to the room → a child visitor: "I like <chosen> fish!" → tap
  the tank, tap the fish → hearts, 10 coins → Stage 1 reward. The tutorial step
  is saved, so Continue resumes it.
- **The judge (Stage 5):** an adult with a clipboard and rosette inspects
  three things: a "show me" request at one tank, "How many fish?" at another,
  then "Do you like your aquarium?" (both answers valid). It cannot be failed;
  misses use the ladder. Then the trophy celebration (confetti, fanfare), the
  results card (fish, visitors helped, coins earned, sentences said), and Keep
  playing → Free Play (goal card shows "Free play ★"; everything stays open).
- Pico nudges once a student has made no goal progress for ~45 s (one line,
  pointing at the relevant button), never more often.

### Interface

- **Management HUD:** coins (top-left, animates), level chip "Lv 1–5" (★ after
  the trophy), hearts, the goal card (top-centre, icons and checkboxes,
  hiragana sub-labels), Settings (top-right); bottom bar: Fish shop, Decoration
  shop (locked until Stage 1 reward), Tank shop (locked until Stage 3 reward),
  chips for bagged fish / boxed tank / waiting visitor.
- **Tank HUD:** tank name and fish count (🐟 2/3), three icon bars (food, clean,
  happy; no numbers), action bar: Feed, Clean, Decorate, Back.
- Unaffordable prices are greyed with a coin-shortfall cue (もっと コインが
  ひつよう); full tanks show いっぱい. Buttons ≥ 64 px, mouse and touch.
- **Settings modal:** Speak / Tap, music volume (default low), SFX volume,
  Japanese hints, speech speed (slow / normal). New game lives on the title
  (with a confirmation).
- **Title:** AQUARIUM TYCOON with a hiragana subtitle, Continue (if a save
  exists), New Game, Settings.

### Save

- `at.save.v1` (game) and `at.settings.v1` (teacher settings survive New Game).
  Saved: coins, tanks (slot, type, fish, decorations with slot and version,
  food, clean), inventory (bagged fish, unplaced decorations, boxed tank),
  progress (stage, goal flags, first-time phrase flags, tutorial step, hearts,
  trophy, free play), stats. Visitors in flight are not saved.
- Saved on every meaningful change (debounced ~1 s) and on `pagehide`. A
  corrupted or unknown-version save is discarded with a short message, never a
  crash.

### Sound

- Procedural: quiet aquarium ambience, a gentle music loop (low by default),
  bubbles, feed sprinkle, gulp, coin, purchase, happy chirp, visitor reactions,
  splash, unlock fanfare, mic on/off, correct, gentle error. Music and ambience
  silent while listening.

## 2026-10-20 — Phase 1 decisions made while building

- **Built directly by Claude** at the user's request ("do yourself, no router").
- **Room:** 12 × 8 m, entrance in the left wall (in view of the management
  camera), Pico's counter between the two pads, the bench at the front right
  (request visitors sit facing the room centre, so they are seen in profile),
  the trophy pedestal by the door. One short rope in front of each pad, so its
  posts stay outside the close-up frame.
- **Taps in a close-up pick the nearest thing on screen** (fish within 75 px,
  decorations 80 px, decorating slots 120 px; a fish wins a near-tie). Moving
  fish are hard targets for 8-year-olds; mesh-exact picking was rejected.
- **Only a visitor waiting with a request takes a tap.** Anyone walking past,
  or hidden because they stand between the close-up camera and the tank, lets
  the tap through to the tank behind (a walking visitor used to swallow taps on
  the big tank).
- **The celebration is a three-quarter shot from the front-left**: the fish at
  the glass and the visitor at the tank's right corner, turned to cheer toward
  the player. Rejected: the first version shot over the visitor's shoulder
  (a big back of a head).
- **Stage cards may interrupt the decorating tray** (the goal was just met
  there), never a carried fish, decoration or tank. Waiting for the tray to
  close left children who never press OK without their reward.
- **The judge comes the moment every tank is happy** (the latch); ordinary
  visitors leave, a waiting request is dropped without penalty.
- **The shop offers only colours the student can afford**; greyed cards show
  the shortfall. Saying an unaffordable colour gets "Sorry! You need more
  coins." and the question again.
- **"Red or blue?" / "Big or small?" show both versions as pictures** (no
  words) above the prompt, like the fish cards: the choice is meaningful and
  the English still has to be produced or read.
- **Interim acceptance has a known edge:** "blue orange" said in one breath is
  accepted as blue if the recogniser first reports "blue" as an interim result.
  This is the inherited rule (a valid interim result is accepted at once); a
  two-colour utterance is judged unclear only when it arrives whole.
- **The tutorial fish arrives hungry** (food 45), so the feeding lesson has a
  visible reason; care time does not run during the tutorial or scripted
  moments.
- **Measured budget:** 48 draw calls, ~38k triangles with both tanks,
  decorations and visitors (SwiftShader). Adaptive pixel ratio inherited.
- **Short screens (phone landscape) are a fallback:** prompts take the whole
  height (the goal card steps aside) and shop cards are compact. Chromebook
  1366×768 is the tuned target; 1280×800 and 1024×600 touch are checked.
- **Results:** the trophy stands left of the results card (camera view
  offset) instead of hidden behind it.
