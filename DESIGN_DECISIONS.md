# Design Decisions

## 2026-10-26 — Compact objectives and uninterrupted progression

- Objectives start collapsed in the upper-left corner, showing the current
  level and the existing state-derived Next action. A keyboard/touch toggle
  reveals the checklist, counts and location hint; scripted interactions
  collapse it and active visitor requests temporarily replace it. On narrow
  screens it moves below the status row. This keeps tank happiness faces clear
  while retaining the existing Help ladder and level overview.
- Room requests use the same left column, with their replay/later controls
  beneath the sentence. The Hall 1 arrow moves below an expanded checklist or
  request, and beside it on short displays, clear of the inventory bag.
- Coins, level and hearts are positioned at the viewport's horizontal centre,
  independently of objective width and right-side controls. The tank care
  panel sits on the right in close-ups to leave the objectives accessible.
- Speak/Tap remains a persistent teacher setting in Settings; the title only
  offers starting/resuming and Settings. Completion cards use one Continue
  action; returning to title stays in Settings. Existing transitions, rewards,
  save schema and input defaults are unchanged.

## 2026-10-24 — Persistent visitor requests and visible help

- Keep the existing request state and hint ladder. Show requests stay in one
  card across tanks, room views and halls, in the space freed by the hidden goal
  card, clear of Help, the left HUD/status and the close-up fish area.
- Always show the English request and a short bilingual action. The first wrong
  pick emphasises its existing key word while speech replays; the second adds a
  swatch or animal picture with a tiny English label; the third keeps the existing
  world highlight. Visual clues and answer highlights retain their thresholds.
  Japanese explains the action and never translates the target answer.
- Counting and “What's this?” keep their existing question/prompt and ladder,
  with a short action under the question. No second hint engine or saved state.

## 2026-10-24 — A state-derived guide and visible progression

- **What:** The first unfinished goal supplies a short bilingual “Next” action,
  followed by a location hint (B) and exact instructions (C). Pico offers B after
  45 quiet seconds and C after another 45; opening irrelevant panels twice also
  advances a tier. A large Help / ヒント button advances the same ladder on
  demand. Each tier animates once per goal; later Help presses reopen the exact
  hint without replaying its animation. Runtime guidance is not saved.
- **Why:** Beginners need a readable next action without sound. Deriving it from
  existing goals, inventory, tank habitats and real prices prevents contradictory
  instructions, including buying a turtle again when it is already in a bag.
  Goals remain completable in any order. Rejected: a new linear tutorial or
  independent progression flags, which could disagree with the goal card.
- **What:** Tank offers show English and Japanese names and prices. The blue
  Ocean Hall illustration has a NEW ROOM badge and explains that its Ocean tank
  is included. Disabled offers give written reasons, and the relevant offer is
  highlighted. The locked Animals control explains the hall prerequisite.
- **Why:** A room purchase must be distinguishable from a tank purchase. Text
  reasons explain the next practical action. Rejected: pictures and grey colour
  alone. Fish and animal order activities still require the existing English.
- **What:** Completion cards name the completed level, its reward, the next
  level and its activity. The gold trophy explicitly unlocks Level 6. The level
  chip opens a dismissable, keyboard-accessible list of all eight levels, with
  icons and Done / Current / Locked text plus short previews.
- **Why:** Children should see the path beyond the first trophy and understand
  where they are. Rejected: “Free play” as the Level 5 destination and a separate
  full-screen level menu, which hides ongoing progression or interrupts play.

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

## 2026-10-20 — Phase 2 design: Aquarium Expansion (frozen)

Started after Phase 1 was complete and tested (the brief's condition). The
brief lists six Phase 2 items (larger room, more tank types, more species,
more visitors, more decorations, tank upgrades); this is how they become play.

### Progression continues after the star

Free play stays free (everything open, no pressure); the goal card carries on
with three more levels. Phase 1 saves migrate (a starred save starts Level 6).

| Level | Name | Goals | Reward |
|---|---|---|---|
| 6 | Ocean Hall | Open the Ocean Hall (100 coins, comes with the Ocean tank); a sea turtle in it; help 2 visitors | Tall tank, seahorse, jellyfish |
| 7 | Sea Friends | Place a tall tank; a seahorse or jellyfish in it; answer 2 "What's this?" visitors | New decorations, tank upgrades |
| 8 | Super Aquarium | Buy an upgrade; help 3 visitors; every tank happy at once → the judge returns | Crown on the trophy (Super Star), 80 coins |

### Halls and tanks

- **The Ocean Hall** is a second room to the right of the first (x 6–18),
  joined by a doorway in the shared wall. Until it is bought the doorway is a
  locked door with an "OCEAN HALL" sign (tapping it opens the offer). The
  management view shows one hall at a time; arrows at the screen edges switch
  halls. Visitors walk through the doorway and visit tanks in both halls; the
  bench and Pico stay in the first hall.
- **Pads:** A, B (first hall); C (the Ocean tank, middle of the second hall),
  D, E (second hall, any tank but the Ocean tank).
- **Tank types:** Small (3 animals, starter), Big (5, 80 coins), **Tall** (4
  animals, 2 decoration slots, 70 coins, from Level 7), **Ocean** (8 animals,
  6 slots, only on pad C, comes with the hall).

### Sea animals (habitat rules)

| Animal | Word | Price | Lives in | Likes | Unlocked |
|---|---|---|---|---|---|
| Pufferfish | white (a fish) | 35 | any tank (not with jellyfish) | rock | Level 6 |
| Sea turtle | turtle (green) | 60 | Ocean tank only | plant | Ocean Hall open |
| Seahorse | seahorse (pink) | 40 | Tall tank only | plant | Level 7 |
| Jellyfish | jellyfish (purple) | 45 | Tall tank, only with other jellyfish | the lamp upgrade | Level 7 |

- Placing an animal where it cannot live is refused with Pico's hint (Japanese:
  why, and which tank). The shop only offers animals with a free home.
- **Fish are still bought by colour** ("White, please!"). **Sea animals are
  bought by name** at a second counter: Pico asks "What do you want?" →
  "A turtle, please!". Colours for fish, names for animals: both natural
  English, and the animal names are the Let's Try! 1 "What's this?" unit.
- Each animal moves its own way: the turtle glides and paddles, the jellyfish
  pulses and drifts, the seahorse swims upright and slowly, the pufferfish
  puffs up round when tapped or happy.

### English added

- **Said:** "White, please!", "A turtle / seahorse / jellyfish, please!",
  numbers six to ten, "It's a turtle / jellyfish / seahorse / fish.",
  "I like pink / purple / white.", "Pink, please!" / "Yellow, please!"
  (starfish), "Big / Small, please!" (castle).
- **Heard:** "What do you want?", "What's this?", "I like turtles!",
  "Look! A turtle!" (visitors say it when they see one: ambient English).
- **"What's this?" requests:** a visitor stands at a tank, one animal glows, and
  the student names it. Tap choices are three animal sentences.
- **Counting** goes up to 8 (the Ocean tank), and only asks about tanks whose
  animals are all fish ("How many fish?" with a turtle in the tank has no clear
  answer).
- Colour requests use the new colours ("I like purple!" → the jellyfish or
  the anemone); animal requests ask by name ("I like turtles!").

### Decorations, upgrades, visitors

- **New decorations (Level 7):** starfish (pink / yellow, 6), sand castle
  (big / small, 14 / 9), purple anemone (12), shipwreck (30, too big for small
  and tall tanks).
- **Tank upgrades (Level 7, tap to buy in the close-up):** Filter (40, the water
  gets dirty half as fast), Lamp (30, +5 happiness; jellyfish love it), Bigger
  tank (60, a small tank becomes a big one, keeping its animals and
  decorations). **Ticket gate** (50, in the tank shop): up to 4 visitors at
  once, arriving more often. Upgrades are bought with a tap (no English); their
  Japanese info text is optional and never assessed.
- **New visitors (Level 6):** grandma (glasses, cardigan) and an explorer
  (safari hat, binoculars).

### Saving

`at.save.v1` saves are migrated to version 2 on load (new fields get
defaults); unknown versions are still discarded. Rejected: discarding Phase 1
saves (classes would lose their aquariums on update).

### Decided while testing Phase 2 (2026-10-22)

- **Goal card header:** once the player has the star, it says "Free play" only
  when no goals are left; during Levels 6–8 it shows "Lv N" and the level name.
  Rejected: "Free play" over the Level 6–8 goals (it hid that a new level had
  started).
- **The judge leaves the results screen at once.** After both inspections the
  judge disappears as the results card appears instead of walking out.
  Walking, they crossed the trophy shot and filled half the screen. Rejected:
  moving the results camera (the trophy orbit is the point of that shot).

## 2026-10-24 — Tank and animal visual polish (part 1)

- Keep the bright, warm cartoon direction: readable silhouettes, soft gradients,
  gentle wet highlights and clean species colours at 1366×768. Detail belongs on
  the animals and inside the tanks. Hall geometry, room lighting and room art
  remain a separate pass.
- Use shared procedural CanvasTextures (256–512 px), existing vertex colours and
  small shader patches, with no asset files. School networks can block external
  assets. Sand has seeded painted patches, fine grain and sparse pebbles; its
  existing merged surface and dune receive cheap scrolling caustics. Decorations
  use vertex colour finishes; animals retain their geometry and animation with
  species detail, belly gradients, soft rims and highlights in the fish shader.
- Keep water saturated cyan at the surface and deep blue below, preserving the
  original display-space palette and readable animated light patches. Applying
  an extra sRGB conversion washed the blue into mint and was rejected. Glass
  uses soft bright side edges and one faint diagonal streak on existing panes.
  Animal gradients, wet rims and decoration markings use broad contrast that
  remains visible at normal 1366×768 gameplay scale. Dirty water
  keeps its distinct green murk and algae. Contact blobs reuse the existing
  radial shadow texture, merged into one batch per tank, following the sand.
- Reject external textures (network reliability and inconsistent art), real
  shadows/reflections/refraction (extra passes and Chromebook cost), and extra
  animal/decoration geometry for surface detail (cost without useful silhouette
  improvement). No postprocessing or shadow maps.
- `scripts/visual.mjs` uses the speech stubs, seeded Phase-2 save, test hook and
  fixed virtual frames to capture both halls, every species, decorations, puff,
  care states and pellets. Its mixed Ocean trio is explicitly a review tableau;
  normal saved habitats still separate turtles, seahorses and jellyfish.

## 2026-10-24 — Hall visual polish (part 2)

- Hall 1 stays warm and welcoming: cream walls with a teal wainscot, white rail
  and dark-teal baseboard; pale tiles with a quiet per-tile tone shift, a soft
  sheen and small sand-coloured corner insets. Stands gain brass trim strips.
- The Ocean Hall is the earned expansion and must look different at a glance:
  deep-blue walls, a light wave band with bubble dots, mid-blue tiles with a
  pale wave mosaic, and a slow caustic shimmer on the floor near the tanks
  (one shader term on the floor's Lambert material, driven by `shaderTime`).
  The tanks stay the brightest, most saturated thing in either hall.
- Wall dressing is one-sided (`dressWall` in `models/room.ts`), so the wall the
  halls share is cream/teal on the Hall 1 side and deep blue on the Ocean side.
- Grounding: one merged blob-shadow mesh per hall (counter, bench, pedestal,
  plants) and one shared blob plane under each stand. +8–9 draw calls per hall
  over the pre-polish baseline; no shadow maps.
- The fish shader's wet/rim highlight is gated by the painted colour, not the
  vertex colour, so dark markings (tang palette, clownfish band outlines) stay
  dark. The tang's palette is solid; an inner blue loop read as a grey ring.
- Lights unchanged: the fixed hemisphere + two directionals already separate
  objects well once walls and floors had their own values. Rejected: per-hall
  light rigs, postprocessing, image textures, navy stands in the Ocean Hall
  (stands are per tank type, not per hall; brass-trimmed wood reads well in both).

## 2026-10-24 — Guidance layout, early visitor taps, bench, wall and trophy

- **Help beside Settings, one-line Next.** Help / ヒント is a chip at the top
  right, next to the gear, and the goal card gains only a single "Next:" line.
  Why: a Help button inside the goal card made it tall enough to cover the big
  tank (taps on tank B hit the card), and in the top-left row it covered the
  close-up's care card. The goal card still hides while a request is active (the
  request card uses that space). Rejected: pinning the goal card to the side
  during requests. Tank offers show the price once (the coin chip), not also in
  the title.
- **Request visitors can be tapped while walking**, once 0.4 m inside a room.
  They stop, face the camera and the existing request runs; if put off they walk
  on to the bench. One conversation at a time, and `helped()` pays once.
  Rejected: requiring the bench (felt unresponsive).
- **Bench approach from the front.** Visitors walk to a point 0.95 m in front of
  the seat, then glide onto it while the sitting pose blends in (and back out
  when they stand). Why: the old path ended at the seat itself and crossed the
  bench and backrest. The glide is render-only, faster than any walk, so the
  drawn visitor never lags the simulated one. Rejected: pathfinding.
- **Wall flicker** came from the Ocean Hall back wall, baseboard and top trim
  running across the join into Hall 1's back wall (coplanar faces at x≈5.9–6.2);
  they now start at the shared wall. Mural, signs and the photo sit a little
  further off the wall. Rejected: render-order or polygon-offset hacks.
- **Trophy** is one lathe profile (closed underside, outer bowl, rounded lip,
  inner bowl, closed floor) with two mirrored tube handles that end inside the
  bowl wall and a finial holding the star; about 1.4k triangles.

## 2026-10-27 — Natural sitting, floating door lock, draped slot rings, stats beside the tank

- **Sitting over planted feet, on a lower bench.** The old pose fully bent the
  knees 0.77 m in front of the seat, then slid the body back, so visitors looked
  seated in midair. Visitors now turn 0.38 m in front of the seat and, in one
  1.3 s timeline, lean forward about the hips while the hips travel back and
  down. Two-bone IK keeps the feet planted, and the legs settle level just as
  the hips touch. Standing replays it in reverse. The seat top drops from
  0.50 m to 0.32 m because the models' shins (half the 0.74 m hip height) can't
  reach the floor from a 0.5 m seat with level thighs. Children, whose feet
  can't stay planted, lift their legs during the move. Rejected: keeping the
  0.5 m seat and fudging the leg angles (that's what produced the float), and a
  hop or teleport onto the seat.
- **Ocean Hall lock uses the pad-lock sprite and bob** (0.7 scale, 2 rad/s,
  ±0.05 m, shared `iconBob`). Its centre floats 0.4 m in front of the door
  leaf, more than half the sprite's width, so the sprite can't cross the door
  from any orbit angle. That crossing was the reason for the earlier flat
  plaque, which read as a sliver from the room camera. The lock is tappable
  and unmounts when the hall opens.
- **Slot rings drape on the sand.** Each ring's vertices sit 5 mm above the
  analytic sand surface at their own x/z and are re-draped as the pulse changes
  the radius. Pebbles are no longer placed under a ring footprint; the same
  random draws are still taken, so every other pebble keeps its place. The
  dune sphere goes from 16 to 24 segments so its facets stay within a few mm
  of the analytic surface. Rejected: a level ring at the dune's peak height
  (floated up to ~4 cm) and lowering the level ring (buried it again).
- **Close-up status panel beside the glass.** The camera rig projects the
  tank's front-glass corners in the final close-up framing and applies a
  horizontal lens shift just large enough for the panel to fit 18 px right of
  the glass. It then writes the panel's transform directly to the DOM (no
  React state per frame), with its top level with the tank top, below any
  request card, and above the prompt stack. Rejected: shrinking the close-up
  (the shift alone fits every tank at 1024–1366 px wide), and the old fixed
  top-right spot.

## 2026-10-27 — Making happiness-based tips visible

Economy unchanged: `tipFor()` still pays 1 / 2 / 3 coins (below 40, 40–69,
70+) for each tank a visitor looked at, once per visitor (`tip:<id>`).

- **One tag per tank, one total.** `tipBreakdown()` lists each tank's own tip
  and mood. Each tank gets a "+N" pill with its face, and a visitor who tipped
  more than one tank also gets a gold "+total" at the visitor. The tags play
  only if the balance rose by exactly that total, so a repeated payment shows
  nothing. Tags above one tank queue 0.8 s apart when visitors leave together.
  Rejected: a toast per visitor (ordinary visitors leave every few seconds,
  which would be clutter) and showing the full total at every tank.
- **Pico's tips lesson, once per save** (`progress.tipsTaught`; older saves
  load it as false and see it once). The line "Happy fish earn more coins!"
  shows sad → 1, okay → 2 and happy → 3 coins. It plays after the first
  ordinary tips of a session, once their tags have finished, and only when no
  level event is pending. Rejected: putting it in the opening tutorial.
- **Rises are celebrated, never paid.** Care is the only thing that raises
  happiness, and time only lowers it. Any rise bounces the room badge and
  pulses the close-up's happiness bar. Reaching okay sparkles; reaching happy
  shows hearts. First sight of a tank (a load or its first animal) is silent.
  "Happy fish earn more coins!" plays once per tank per session in Pico's
  bottom-left bubble, which never replaces a showing hint. A toast was
  rejected because it covered the very badge that was celebrating.
- **Sad-tank coaching** ("Sad fish: only 1 coin. Make them happy!") only after
  the lesson, at most every two minutes, in the same bubble.
- **Coin-shortfall hints follow happiness.** The title stays "Need N more
  coins!" with the visitor chip as its target. The Help tiers name the least
  happy tank and say a happy tank earns 3 coins a visitor, or that the fish
  are already happy and visitors are the way forward.

## 2026-10-29 — Expansion 1: special tanks, new animals, Jellyfish Gallery (frozen)

Brief: "Aquarium Expansion, New Tank Designs, and Animal Variety". Accepted with
these changes and decisions.

- **Everything new opens at Level 8** (`EXPANSION_FROM`): special tanks, the new
  animals and decorations, remodelling and the Gallery. Levels 1–7 keep their
  shops, goals, prices and request mix unchanged. Rejected: unlocking special
  tanks earlier. At Level 4 a hexagon tank on pad B would take the pad that the
  "place the big tank" goal needs, and the guide assumes classic tanks.
- **Rooms are data** (`data/rooms.ts`): bounds, pads and the progress flag that
  opens each room. Rooms tile +x, and each shares a doorway at z = 1.5 with the
  room before it. Routes, hall arrows, camera framing and `HALL_OF` all read the
  list. `GameState.hall` is now a room index. Rejected: a graph of rooms with
  arbitrary doors (not needed yet; the row keeps routes trivial).
- **Tank shapes are data** (`TankDef.shape`: box, hex, round, bow) plus
  `decorSize`, `bulge`, `backRock`, `dens`, built-in `rocks`, `lights` and
  `current`. Swim bounds (`tankFishBounds`) honour the inscribed circle of
  round and six-sided glass, a bowed front and the cave rockwork.
- **Four special tanks.** Hexagon (4 places, freestanding, smaller reef fish
  and seahorses). Panorama (7 places, bowed front, schools and rays; Ocean
  Hall pads only). Jelly column (round, jellyfish only, a colour display light,
  a circulating current). Rocky cave (rockwork with three dens, for eels,
  octopuses, crabs and gobies; reef fish are "not safe" there).
- **Pads.** Hall 1 (A, B) takes small, big, tall, hex and cave, which keeps its
  small-aquarium feel. Ocean Hall D/E also take the panorama and the jelly
  column. Gallery F/G/H take jelly columns, tall and hex tanks; G comes with a
  jelly column (like C with the Ocean tank).
- **Animals.** Angelfish (purple) and goby (red, perches on the sand) are sold
  at the fish counter by colour. Green chromis replace the brief's sardines:
  a reef schooling fish, and green keeps the counter's "What color?" English.
  One chromis purchase is a school of six and takes two places, so "How many
  fish?" never asks about a tank with a school. Moray eel, octopus, crab and
  stingray are ordered by name ("An eel, please!", "An octopus, please!"). The
  stingray takes two places. Moon, spotted and sea nettle jellyfish are
  ordered as "A jellyfish, please!" and then "What color?" (white, blue,
  orange; the original jellyfish is purple), so one name covers every
  jellyfish, as in English.
- **The butterflyfish already exists.** The Yellow Fish is drawn as a longnose
  butterflyfish, so it is now named "Butterflyfish" (id `yellowfish`
  unchanged) instead of adding a duplicate.
- **Habitat reasons.** `homeReason()` gives "Needs a bigger tank!", "Needs a
  rocky home!", "Needs a jellyfish tank!", "Needs the Ocean tank!", "Needs a
  tall tank!", "Jellyfish only!", "Not safe here!", "Jellyfish live alone!"
  and "Full!", each with Japanese. Jellyfish of different kinds may share a
  tank; nothing else may share with jellyfish. Every old habitat is kept.
- **Remodel, never replace.** A placed tank can become another type its pad
  takes. Animals, care levels and upgrades stay. Decorations keep their slot
  where they fit, else take the next free slot, else go to the tray. Half the
  old tank's price comes back (a trade-in shown before paying). Animals that
  could not live in the new tank block the remodel by name, and each can be
  put back in the bag (`bagAnimal`). The Ocean tank is never remodelled. A
  tank shop offer with no free pad offers "Remodel" instead of being
  unplaceable. Rejected: keeping the old tank in the box (all pads are full,
  so it could never be placed).
- **Display light.** A jelly column's light is chosen with "What color?" →
  "Pink, please!", is free, and counts as a 15-joy decoration plus the
  jellyfish's favourite thing (lamp). It has only two small slots.
- **New decorations** (Level 8): kelp, coral arch, rock cave, driftwood.
  `bigOnly` became size classes (small, medium, large).
- **English.** "What's this?" adds "It's an eel. / an octopus. / a crab. / a
  stingray." (articles checked by test). Distractors before Level 8 stay among
  the four Phase 2 answers. Level 8 adds "What color is it?" → "It's blue."
  about a glowing animal, and "Do you like octopuses?" style chat. "I like
  jellyfish!" is answered by any jellyfish.
- **Save v3.** Adds only pads F–H, the new types, `galleryOpen` and
  `tank.light`. Version 2 saves read unchanged (ids, pads, animals, decor;
  test `save.test.ts` "migrates a version 2 save without changing anything").

## 2026-10-31 — Make the next action explicit

- SAY, TAP and LOOK share one reusable instruction tag, icon and fixed accent
  everywhere: SAY microphone/purple (#6d3ab4), TAP pointing hand/amber
  (#865400), LOOK eye/teal (#147878). Japanese uses the existing setting.
  A prompt has one primary action; its LOOK cue is a smaller secondary line.
- Model sentences say SAY THIS; free choices say SAY ONE. Quizzes say SAY THE
  ANSWER because only one answer is correct. Unusable microphones say TAP AN
  ANSWER; the existing third-miss spoken-or-tapped rescue remains available.
  Listening gets a gentle CSS glow and a larger bilingual status. Matching,
  answer sets, miss thresholds, speech timing and automatic acceptance stay intact.
- Pico introduces the player as the aquarium boss and explains tapping. The
  first Fish purchase starts with an interactive, highlighted Fish button,
  including resumed buy-step saves. Tutorial nudges follow current state and
  can repeat after 20 quiet seconds using the existing guide/nudge mechanism.
- Arrow/WASD reminders use a pointing hand and distinguish touch Japanese
  (ゆびで タップしよう！) from mouse Japanese (マウスで クリックしよう！).
  Many school Chromebooks use a mouse. Reminders have a 20-second cooldown,
  are limited to three after the tutorial, and stop after Level 2.
- Visitor instructions derive from the current request, view, carried state
  and existing wrong-tap count rather than a stored instruction string:
  unopened visitor → tap visitor; room → tap tank; close-up → tap fish,
  animal or decoration. One wrong pick or 20 quiet seconds reveals matching
  tanks; three wrong picks reveal exact targets. Success/cancel clears the
  active instruction and highlights immediately. Runtime idle clues are not saved.
- World highlights reuse the existing three bobbing gold cones (room view only)
  for visitors, room doors and tanks. In the tank close-up the free decoration
  rings pulse gold themselves: room-sized cones there covered the fish. They ignore
  raycasts and hide during camera shots. Post-processing outlines and extra
  render passes were rejected for the Chromebook budget; the cone pool remains
  capped at three draw calls.
- One instruction at a time: Pico's nudge hides when the fish-placing banner
  or the decoration tray already says the same thing. A waiting visitor's
  "Tap the visitor!" card replaces the objectives card only in the tutorial;
  in free play visitors wait often, and hiding the objectives (and their
  toggle) would undo the HUD layout. There the visitor chip and the 3D marker
  carry the cue when the guide points at visitors.
- Opening a tank that cannot answer an open request counts as a wrong pick on
  the existing ladder (no reward change), so hints escalate after exploring.

## 2026-10-31 — Classroom audio checks and Say + Tap

- A first New Game offers optional speaker and microphone checks before the
  tutorial. Both can be skipped; Settings reopens either check and the speaking
  lesson. Unsupported recognition skips the setup mic step with a short note.
  Setup and lesson flags live in device settings, never the aquarium save.
- The speaker check repeats Pico's “Hello! Welcome!” with visible text and a
  Chromebook volume tip. It does not change system volume. The mic check reports
  permission/availability, local sound activity and recognised words separately;
  only a matching recognition result says “Great! I heard you!” No signal alone
  proves that a child's words were understood or identifies whose voice it was.
- The shared local meter uses one microphone stream, a 1024-sample analyser
  frame and a 15 Hz loop. It stores only numeric session summaries and closes
  tracks, nodes and context on completion/cancellation. Samples are never
  recorded, uploaded or persisted. Audio frames update DOM/CSS, not React state.
- Gameplay starts recognition first, then opens the meter only with already
  granted permission (or a previously working mic when Permissions is missing).
  Meter failures hide the meter and leave recognition alone. An explicit check
  may request permission once; its short permission stream closes before the
  recognition/meter attempt. Denial uses the existing blocked-mic tap fallback.
- Failed attempts get conservative feedback after listening ends: near silence
  can suggest moving closer; over 2% clipped samples for at least 400 ms can
  suggest a softer voice. Attempts under 3 seconds and ambiguous/noisy signals
  stay neutral. Rejected: “speak louder”, identifying a speaker, or treating high
  RMS as shouting; Chromebook automatic gain can make normal speech loud.
- The one-time speaking card teaches clear, normal speech and can be dismissed
  without blocking answers. Settings retains a “How to speak” entry.
- Teacher answer choices are Speak, Say + Tap and Tap. Say + Tap uses the same
  answer buttons with SAY/TAP tags and a practice instruction, opens no mic, and
  makes no recognition claim. Existing model playback remains available. Mode
  changes take effect at the next prompt; an existing listening session releases
  its meter when the teacher changes modes. Old mic=true/false settings retain
  Speak/Tap, using only optional new settings fields. No title mode selector,
  speech matching, hint thresholds, rewards or save schema changes were needed.
