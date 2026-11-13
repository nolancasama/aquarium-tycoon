# Design Decisions

## 2026-11-13 — Penguin Coast keeper care

- Feeding uses a runtime state machine: doorOpening → walkOut → tip → watch →
  walkBack → doorClosing → idle. The framed doorway is an actual cut through
  the back cliff, with a short dark corridor and an inward swinging leaf.
- Apply the existing feeding benefit once on entering tip. Apply the existing
  cleaning benefit once after the five-second montage. Leaving early settles
  the outstanding benefit immediately, then clears the workers, door and meal.
  Ending a development preview restores its original snapshot and discards
  all temporary preview care, including any pending benefit; it never changes
  the restored aquarium. Nothing new is saved.
- Feed and Clean share one runtime guard, including shared keyboard/action
  entry points. Both buttons stay disabled while either sequence is active;
  the active button reads Feeding... / えさやりちゅう or Cleaning... / そうじちゅう.
- Keepers use the existing articulated adult people model, teal shirt/cap,
  navy trousers and simple merged hand tools. Keeper walks use the land
  visibility graph and swept collision checks; penguins avoid the staff
  threshold, working spot and moving keeper. Obstructed staff yield and
  reroute, rather than moving through an animal.
- Without a station, the keeper walks to an open shore spot and tips there;
  penguins retain the existing no-station feeding attraction. With a station,
  the pile grows during the tip and penguins approach when tipping finishes.
- Cleaning lasts five seconds with three keepers: glass wiping, shore
  brushing and debris pickup into a bucket. Poses change twice per second,
  with small sparkles and light ticks, followed by the existing cleaning
  refresh and workers disappearing. Shared meshes and scalar frame updates
  keep steady animation allocation-free; route planning occurs at sequence
  transitions or exceptional obstructions.

## 2026-11-01 — Animal picture vocabulary previews

- Fish/Animals pictures are independent, keyboard-accessible preview buttons,
  including locked offers. They briefly pulse (300 ms) and show the existing
  English display name with optional Japanese directly underneath (1.8 s).
  A subtle speaker icon adds no new instruction tags. This allows deliberate
  vocabulary exploration in Speak, Say + Tap and Tap modes without answering,
  selecting, ordering or buying anything. Names are sentence case, with spaces
  preserved (for example, “Sea turtle!”), spoken slightly slower than normal.
- Live recognition (`prompt.status === "listening"`) and ongoing game TTS
  make previews visual-only. We reject queuing behind a prompt: delayed audio
  could start during the child's next microphone attempt. Repeated taps cancel
  only preview-owned speech, and only when no game utterance is active or queued.
  Missing TTS and zero SFX volume also use visual-only feedback; hardware mute
  cannot be detected, so the visible name always appears. Existing prompt audio
  and the microphone's TTS guard retain their behavior.

## 2026-10-31 — Tapping hand, sentence clues and pattern meanings

- A single DOM hand demonstrates an exact tap with a short glide, press and
  ripple, at most twice per showing. First encounters with the Fish button,
  animal placement, visitor, decoration ring and room arrow are remembered in
  optional save progress. Later demonstrations follow the existing exact Help,
  request and hesitation guidance. Reduced motion uses a static pointer.
  Positions follow DOM targets or the active camera's projection without React
  updates each frame; disappearing targets and completed steps clear the hand.
- The existing request card keeps the English sentence across visitor, tank
  and close-up steps. Tier 1 gives only the action; tier 2 highlights the
  request data's English keyword and adds a swatch for colours. Tier 3 adds
  the exact hand alongside the existing target glow. Success clears clues.
  Arrows direct travel, glows identify tappable objects, and the hand shows an
  exact tap; a hand suppresses an arrow pointing to the same object.
- Japanese meaning help follows stable sentence pattern IDs, with the tested
  slot always blank. The first encounter shows the meaning when Japanese help
  is enabled; later encounters offer a small Hint / ヒント control. Optional
  seen-pattern progress defaults to empty for old saves, without a version bump.
  Full request translations were rejected because they disclose the tested
  colour or animal; exact sentence matching was rejected because changing the
  vocabulary should still count as the same learned pattern.
- Scene clues use gentle additive soft glows without post-processing or input
  interception. Fish use a shader rim instead of a whole-body gold emissive
  wash, which obscured the tested colour in the first review frames. The tank
  billboard replaces its floor halo, and neither change adds draw calls.
  A permanent animated pointer and new independent idle timers
  were rejected to keep the classroom screen quiet and reuse the hint ladder.

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

## 2026-10-31 — First-minute polish: gated sound check, Next cue, hidden goals, early visitor taps, celebration clears gauges

- **Sound check is gated.** "I can hear!" / "Can't hear" stay disabled until
  Play Sound has been pressed once, so nobody passes without trying. Hearing it
  shows the game's own correct-answer check, pop and SFX ("OK！ / I can hear
  Pico!"); Can't hear shows only the volume tip and keeps Play Sound and Next.
- **Mic check success** is the existing recognition match only ("マイク OK！");
  the press and the level meter never count.
- **Next cue.** After a success, ~400 ms later the blue Next button pulses three
  times with the existing TapHand pointing at it, for at most ~6 s; reduced
  motion gets a static gold outline and a static hand.
- **Goals panel waits** until the first fish is placed (tutorial past `place`),
  then fades in once. Derived from tutorial progress, so saves need no flag and
  it never hides again. Rejected: showing it from frame one (competes with
  "tap things to play").
- **Early visitor taps.** Root cause of "tap does nothing until they sit": the
  tutorial held `mode: "busy"` until the first visitor sat. The visitor is now
  tappable once inside the room and opens the request at once. Elsewhere, a tap
  on an eligible visitor that arrives during a brief blocker (a line, busy mode,
  camera shot) gets an immediate squash-pop + tick and is queued (one at most);
  before opening it is revalidated (visitor still eligible, same screen/hall,
  no other request/prompt/placing/card, < 10 s) or dropped. Taps while another
  request or English prompt is open are still ignored — the child is mid-task.
  Rejected: ignoring early taps silently.
- **First visitor cue.** Only the tutorial visitor gets a soft halo sprite and
  the hand while walking; both clear on tap. Later visitors rely on the hint
  ladder.
- **Celebration clears gauges.** The close-up celebration puts the visitor at
  the tank's right corner, where the status panel sits. While any celebration
  token is held (a Set of tokens, so overlaps never flash it back) the panel
  fades out (150 ms) and back (200 ms) in place; its transform never changes.
  Tokens reset on new game and title. Rejected: permanently moving the gauges.
  Fast test mode shortens a celebration below one frame, so e2e holds tokens
  through a `holdCelebration` hook.

## Quieter prompts, counting numbers, decoration swapping (2026-11-01)

- **Counting is shown, not told.** "How many fish?" (Level 2 Pico and the
  visitor/judge count requests) numbers the counted fish 1..n above each fish,
  one every 0.65 s, bound to fish ids, with the counted fish slowed to 18 %.
  Labels sit just above their fish and are clamped inside the tank's water so
  they never cross the frame or the HUD. Replay (🔊) and the clue ladder
  restart the sequence; numbers clear when the question ends. Built on
  `rt.countGlow` (`logic/counting.ts`), cached digit sprites, no React per
  frame. The student still answers; numbers never answer for them. Replaces
  the "LOOK AT THE FISH!" cue.
- **Japanese sits directly under its English** in prompts, dialogue, animal
  speech and request cards. Where meanings are hidden after a pattern's first
  encounter, the Hint button takes that spot and is replaced in place by the
  meaning. Answer blanking is unchanged.
- **Instruction tags only on first encounter.** The generic "SAY THE ANSWER!"
  heading and the "LOOK" cue are gone; a short SAY/TAP tag and the status line
  ("Choose one.") remain only the first time a prompt pattern appears, and on
  mic fallback. Partly reverses 2026-10-31 "Explicit action guidance": the
  tags on every prompt made obvious tasks noisy. Rejected: removing them
  entirely (first-time players still need to learn that they speak or tap).
- **Temporary dialogue never covers coins/level/hearts.** Animal speech, Pico
  lines and requests are opaque and placed below the fixed HUD. Rejected:
  fading the HUD as the default (kept only as a narrow-screen fallback).
- **Tray decorations swap directly.** With a tray item selected, tapping an
  occupied circle (or the decoration on it) swaps atomically (`swapDecor`):
  the displaced piece returns to the tray and becomes the selection, so
  repeated taps alternate. Empty circles place and clear the selection as
  before; with no tray selection the old select-and-move stays. Fit rules
  apply to the incoming piece only; no coins. Rejected: the previous "tap a
  taken circle to pick it up" (it switched modes unexpectedly).
- **Debug overlay** (Ctrl+Alt+D, always on, by request): jump to any level,
  unlock everything, open halls through the real open rules (with their
  tanks), coins, finish tutorial, fill care, crown. Not hidden from students
  by decision of the teacher.

## 2026-11-01 — Animal grounding and procedural motion

- **Contact follows visible sand.** The old radius-plus-3-cm model translation
  assumed a flat floor and buried the crab on dunes. Ground models now retain
  their real geometry. A cached lower hull and each terminal leg/arm ring sample
  `sandSurfaceY` (subtracting stand height once). The body follows a filtered,
  limited slope; eight independent distal corrections keep stance feet on the
  dune while swing feet rise. Re-sampling corrected toes handles the horizontal
  shift caused by body tilt. A final vertex projection prevents penetration
  between support samples. Body clearance and the glass inset derive from the
  actual geometry plus its shader displacement envelope. Goby and octopus use
  the same support path. Existing elevated rock/back-face behavior is retained.
  Rejected: another global crab offset, flat-floor tests, lifting every foot to
  the highest point under the animal, and a rigid body that follows every toe.
- **Merged animation remains the budget.** Crab leg phase follows travelled
  distance, with opposite tetrapods, independent raised claws and timed pincers.
  Octopus arms have continuous base/middle/tip bending, reach/pull and tip curl;
  slow warm colour changes preserve eyes and suckers. Existing tap timestamps
  trigger one short jet, arm gathering and a brief pale flash. Crawling explores
  real den lips and rock edges. No new input route or saved state is needed.
- **Morays and rays.** Eels have a continuous travelling body wave and occasional
  jaw opening, peek from their assigned den and return after exploration. Resting
  heads face along the rock face, trailing toward the tank centre. The renderer
  confines the complete waving body to accessible water in front of backRock,
  rather than letting a head-only bound hide the tail in solid rock. The full
  body envelope also begins climbing before it reaches a freestanding rock,
  so a trailing tail cannot cross a stone missed by the head's column test. Rays use a
  spanwise fin wave with delayed rear edges, smoothed turn banking and a tail
  that bends behind changes of direction. Rejected: rigid airplane flapping.
- **Legacy animals.** Seahorses stay upright with a masked dorsal flutter and
  gradual lower-tail curl. Other fish use species-specific swim/glide/hover
  rhythms, speed-sensitive tail strokes, body bend and bounded heading changes.
  Food interrupts hovering; the existing tap event adds a short startle burst.
- **Jellyfish.** All four species use a fast contraction and slow recovery;
  contraction fractions and pulse strengths are shared with movement logic.
  Thrust acts during the power stroke, while tentacle/oral-arm delay grows toward
  the tips and tank current carries the animal. The original purple jelly keeps
  its existing face/model, with subdivided tentacles (+480 triangles, zero added
  draws). Rejected: whole-animal scale pulsing and rigid tentacle rods.
- **Cost and verification.** No skeletons or extra animal draws; geometry and
  shader programs remain shared, with per-animal scalar uniforms and eight limb
  corrections. Terrain/support data are cached; frame work reuses vectors and
  arrays. Geometry regression tests cover every crab, octopus and goby habitat,
  dune centres/lips, headings, gait phases, glass and the moray body envelope.
  Gameplay-camera SwiftShader evidence and matching all-animal fixture metrics
  are in `.tmp/motion-review/` via `scripts/motion-review.mjs`. The normal loop
  budget is unchanged; the all-animal fixture is a separate, heavier scene.
  Matching fixture before → after: Hall 1 66 → 66 draws / 53,545 → 53,545
  triangles; Ocean Hall 79 → 79 / 42,005 → 42,005; Gallery 70 → 69 /
  34,260 → 30,236 (rendered counts depend on visibility). No loop budget was
  raised and the loop e2e was not rerun. All 388 unit tests, typecheck and build
  pass; build retains the existing large-bundle warning. Twenty-nine gameplay
  frames were inspected, including three phases per tank and a real octopus tap.
  Real Chromebook GPU performance and Claude's final aesthetic judgment remain
  outside this SwiftShader evidence.

## 2026-11-01 — Coral Reef Atrium

- The fourth room follows the Gallery along +x: x 30–46, z −5.5–5.5,
  walls 5.5 m. Its 176 m² floor is 1.83 times the original 96 m² hall, with a clearly
  taller public-aquarium scale. Room bounds and explicit optional `padLayout`
  positions/facing replace the assumption that every exhibit sits at the back.
  The Gallery owns the lower shared wall; the Atrium owns the taller step and
  deeper returns, with separate exposed faces. No map or branching wing.
- Opening costs 260 coins and requires the Gallery. It includes permanent pad I's
  reef; there is no separate purchase, removal or remodel. The existing simulated
  student continues from the crown, buys the Gallery, stocks its jelly column,
  then earns through ordinary 45-second help/tip cycles. A regression measures
  the 8–12-minute target from Gallery purchase, including stocking. This price
  gives saving a short free-play goal without adding a campaign level.
- I is freestanding at (38, −1). J at (33, 3) is a secondary foreground exhibit;
  K at (43.6, −3.7) is a rear corner exhibit. Both accept existing hex, panorama
  and cave tanks. Moving K farther right preserves a body-width corridor even
  with the panorama installed. Visitor routes reserve maximum footprints and
  use obstacle corners, tour all reef faces, and pause beside either front bench.
- The 5.2×2.3×2 m reef holds 14 places and ten decoration rings. An eight-pane
  island shell, sandstone plinth and all-sided glass replace a stretched box.
  Nine column formations bound solid rock, layered shelves, branches and
  crevices, including two low platforms with actual shelf-top slots (`slot.y`).
  Eight slots sit on sand; all rings, picking, shadows and animal clearance
  follow their respective surface. Adjacent sand rings stay clear of shelf edges.
  Two tall supports frame a genuine open swim passage; its thin bridge
  cap sits above animals' upper swim clearance, keeping the passage column-free.
  Small clipped glass corners remain outside existing conservative swim bounds.
  Open sand and upper water preserve room for animals and purchased corals.
- Branch coral, brain coral, sea fan and table coral use simple bilingual names,
  existing variant orders and direct swapping. Their declared footprints feed
  animal clearance. Existing species gain only the reef habitat; no new species.
- Warm sand, coral and turquoise architecture uses merged baked colours,
  clerestories, a cutaway glazed skylight and additive textured daylight shafts.
  Palms, benches and short information boards make the extra floor purposeful.
  Existing halls retain their light rig. A full opaque ceiling, real volumetrics,
  shadows and post-processing were rejected for visibility and Chromebook cost.
- A 3.6-second skippable reef sweep and bilingual arrival card play on first
  entry; reduced motion holds the reveal camera. Optional `atriumOpen` and
  `atriumIntroSeen` flags preserve the existing save version and old purchases.
  Separate later expansions and the hex lamp fixture are outside this change.
- Reef rebuilt after review (Claude): the first pass read as grey post-and-lintel
  "Stonehenge" pillars with corals standing apart on bare sand. The fixed reef is
  now jittered warm-tan boulders stacked into a continuous back bank and two
  towers, with coralline tint, colour patches, crevices, branching coral on each
  mound and table corals, all inside their avoidance columns (12 columns). The
  arch is a thin curved bridge whose underside stays at or above h − 0.07 over the
  column-free lane and dips only inside the towers, because swim avoidance knows
  only vertical columns; a low overhanging arch was rejected (fish would clip it).
  The reef alone has a 12k-triangle budget (other tanks keep 6k): it is one
  fixed centrepiece. Front-corner ledges are capped at 0.22 m so their rings and
  the neighbouring sand ring both stay supported.
- The atrium door swings into the atrium, not into the previous room like the
  older doors: an open bright-teal leaf in the dark Gallery read as a stray slab.
- Floor detail (mosaic rays from the reef ring, wave border, starfish medallion
  at the entrance) is painted into the single floor texture rather than geometry.

## 2026-11-01 — Reef animals, reef behaviour and the hex lamp ring

- **Parrotfish and shrimp are named animals**, ordered at the animal counter
  ("A parrotfish, please!", "It's a shrimp."). Every fish colour already belongs
  to one fish at the colour counter, and naming them teaches "What's this? It's a
  parrotfish." The cleaner shrimp is simply "Shrimp / エビ": no scientific names
  for Grade 3. Parrotfish live in the reef and panorama; shrimp in the reef and
  the cave tank (the atrium's invertebrate exhibit on pad K). Both are optional
  purchases (70 / 35 coins); nothing is auto-stocked.
- **The shrimp reuses the crab's body path**: crab shader code, leg tags and
  per-foot sand support, so it inherits grounding on dunes and the alternating
  gait. Only the crab walks sideways (`def.id === "crab"`). The parrotfish is a
  bending fish with a pale fused beak. Rejected for now: a parrotfish grazing
  peck animation and a shrimp-cleans-fish interaction (both need new renderer
  states; reef affinity already keeps the parrotfish working the coral).
- **Reef affinity**: in the giant reef only, clownfish, parrotfish, butterflyfish,
  angelfish and (weakly) blue tang pick many wander targets just outside a
  formation, on its visitor side, around its upper half; gobies stay perched on
  sand and chromis school in open water as before. Targets that land inside an
  overlapping neighbour formation are retried, falling back to open water.
  Other tanks are unchanged (same RNG sequence). Rejected: per-decoration homes
  in every tank (would change long-tested behaviour everywhere).
- **Hex lamp**: the straight lamp beam across the back of the hex top is
  replaced by a light strip set into the six-sided frame; the lamp upgrade on a
  hex is a brighter six-sided ring (one flat mesh) instead of a straight bar.
- **Reef English reuses existing requests**: visitors' "I like parrotfish!",
  "Do you like shrimp?" and show-me requests already draw on any owned named
  animal; counting stays capped at eight animals, so the busy reef is not
  counted. No new tutorial: the atrium's short arrival reveal is the introduction.

## 2026-11-01 — Eel, octopus, multi-bench seating and species feeding (design freeze)

Frozen before implementation. Review of the supplied plan: its goals are kept;
the changes below are deliberate.

### Changes to the plan

- **Feed stays one tap; no food-selection panel.** Rejected: a chooser in mixed
  tanks. Per-species diets make a blue tang + clownfish tank "mixed", so the panel
  would appear around Level 2 on the most repeated action, and it breaks the
  guide's `btn-feed` steps. Its options could also never be wrong (it lists only
  needed foods), so the plan's "inappropriate food" hint has no trigger and is
  dropped. Instead one tap always equals Feed All. A small, non-blocking food strip
  (picture, English word, small Japanese) appears for about 4 s after feeding, and
  tapping a word says it and drops a small free pinch of that food (no meter effect).
- **Smile and arm gestures are not added.** Visitor faces and arms are merged into
  one body mesh. Seated life uses torso turns toward a tank, slow posture shifts and
  an occasional existing heart bubble.
- **Seat reservations are derived, not stored.** A seat is taken when a live visitor
  has `seatId`, so leaving, rerouting or disappearing cannot leak a reservation.
- **The moray's den is a hidden tunnel.** Rejected: a body-length cave that fits in
  0.28 m of rock. The opaque rock and dark mouth disc hide the part of the body
  behind the hole, so the whole eel can really go in through the aperture.

### Shared rig (one merged mesh, one draw call, no skeletons)

`animalMaterial` gains one `uniform vec4 uRig[16]` for both rigs, plus `uEat`
(0..1 feeding response). Normals must be deformed in `beginnormal_vertex`, before
Lambert uses them, with the same frame as the positions. Pure rig maths lives in
`src/game/logic/` with no three.js scene dependency, allocates nothing per frame and
has a CPU mirror of the shader's vertex mapping for tests.

### Moray eel (part 12)

- **Head first, body on the path.** `stepDen` drives only the head, as a bicycle
  model: a heading with a limited turn rate and a minimum turn radius of about 0.1 m,
  so it can never reverse on the spot. A ring buffer of distance-sampled head
  positions gives 16 arc-length control points (`uRig[i].xyz`), so body length is
  constant and turns reach the tail only as it arrives there. The lateral swim wave
  is added to the control points on the CPU and fades to nothing inside a den.
- **Mesh.** Rest pose lies along -x. Every vertex stores a spine parameter
  `s = clamp(-x / L, 0, 1)`; shader position is
  `P(s) + T*(x + s*L) + U*y + S*z`, with Catmull-Rom `P`, `T`. Body, head, eyes,
  jaw and fins all use it, so the dorsal fin is one lofted strip sharing body `s`
  values and cannot detach. Jaw vertices rotate about a hinge by a gape uniform.
- **Collision.** The head steers ahead of solids using a corridor of body radius
  plus wave amplitude, so a body on its path inherits clearance. Then each control
  point gets a soft continuous correction against glass, rock face, sand and dunes,
  and columns (rocks and decorations placed while the eel is near). Never teleport.
  The eel no longer uses `tankFishBounds`' length inset, which squeezed it into a
  plane at z = 0.11 in the cave tank. `containEel` is removed.
- **Den.** Each mouth gets a rail: out along +z through the hole, and behind it a
  hidden curve inside the rock long enough for the whole body. Return lines up on the
  mouth axis in open water, then enters within the 0.12 x 0.085 m hole. Once the tail
  is hidden the rail is reversed unseen and the eel rests with head and neck out,
  peeking and pumping its jaw. Eels beyond the third den rest on open sand instead.

### Octopus (part 13 arms, part 14 mantle/head)

- **Arms.** `uRig[i]` = control point (w: curl), `uRig[i+8]` = tip (w unused), in body
  space. Each arm is a quadratic Bezier from a fixed root, with arch computed to
  preserve arm length, a curled tip region, a tapered tube and fragment-shader suckers
  on the underside. Eight independent arm controllers: stance, swing, reach, curl.
- **Gait.** Stance tips stay fixed in water space. Arms step in alternating groups
  with variation, at most about half lifted, and `stepCrawl` speed follows the gait so
  the body is pulled toward planted tips rather than sliding.
- **Contacts.** Tips land on sand (`sandSurfaceY`), rock columns or the rock face while
  climbing. Idle arms reach into den lips, curl round rocks or rest. Tap picks one of:
  raise an arm, colour change, curl, look toward the player.

### Seating

`Seat { id, benchId, room, x, z, facing, front, approach, requestOnly }` in
`world.ts`. Hall 1 keeps its centre request seat with the exact existing constants;
side seats at z ±0.52 are for ordinary visitors. Each atrium bench seats three. Paths
go `approach → front`, and exit `front → approach → route(...)`, because atrium fronts
lie inside the walking obstacle boxes. `benchPose` gains a seat argument with the
request seat as default. `ATRIUM_REST_SPOTS` standing rests are replaced by sitting.

### Food

`FoodId = flakes | seaweed | shrimp | seafood | plankton`; `DIET` per species in
data. Animals target only pieces their diet accepts. Each food has its own fall
behaviour and instanced shape (a mesh draws only while that food exists). The food
meter, happiness, saves and the first-time "Feed the fish!" are unchanged.

### Changes made while building

- **The eel's chain solver was replaced.** A 32-pass length-and-bend solver collapsed
  the body by up to 34% and cost too much per frame. Each point now slews a limited
  offset toward one clear pass, smoothed with its neighbours, and does nothing when
  clear. The head corridor gives clearance normally.
- **Den holes are round.** Three curve segments drew the 0.12 x 0.085 m ellipses as
  hexagons, with less clearance than the code assumed.
- **The octopus's first look was rejected by eye.** It passed its tests but read as a
  spider: thin legs arching high. Arms are now longer (0.85 body lengths) and thicker,
  planted arms are capped at a low arch so they drape along the sand, and each has a
  slow sideways bend. Rejected: strict constant arm length, which is what forced the
  high arch; planted arms may now be up to about a quarter shorter than free ones.
- **The rig owns the octopus's body pose.** Tips are stored relative to the body, so
  `groundAnimal` placing it separately would make planted tips drift.
- **The food strip runs on game time.** A wall-clock timer could expire before a slow
  machine had drawn much. It also sits outside `.top-panels`, whose transform turned
  its `position: fixed` into an off-screen position.

### Octopus rebuild reverted (2026-11-01)

The owner asked for the previous octopus back after seeing the rebuilt one live. Its
model, part 3 arm shader, `groundAnimal` placement and tap burst are restored, and the
freeze's Octopus section no longer describes the game. It eats by reaching food on the
sand like other bottom animals, with no arm carrying food. The frozen-eel pose fix from
that work stays, for the eel only. The rig remains in git at 841807a.

## 2026-11-06 — Shark Tunnel expansion (design freeze)

The fifth area: one enormous shark habitat with a walk-through glass tunnel, run in
two modes on the same state. **Management** (elevated camera, buy, decorate, care)
and **Exploration** (walk the tunnel as your own character, visitors, English
activities). The owner's brief of 2026-11-06 is accepted with the changes below.

### Changes to the brief

- **A branching wing, not a sixth tile on the +x row.** The Shark Tunnel is entered
  through a new doorway in the Atrium's **back wall** (left bay, about x 32.6; the
  builder may slide it within that bay to clear windows and columns). The wing lies
  behind the Atrium (−z): a short indoor lobby, then the habitat. It is a `RoomDef`
  marked as a wing of the Atrium and excluded from every x-tiling helper (`roomAtX`,
  `doorX`, ordinary visitor routes). Hall arrows treat it as the room after the
  Atrium. No world map.
- **Only the active area is drawn.** While the wing is shown the four rooms are
  hidden, and the habitat is hidden everywhere else (the high management camera
  would otherwise see over the Atrium's back wall).
- **The habitat is a built-in tank.** Opening the wing creates a permanent tank of
  type `sharks` on new pad `L`, exactly like the Atrium's reef on pad I. It reuses
  feeding, cleaning, happiness, capacity, tips, saves and the animal counter. It has
  its own renderer and its own animal simulation; the small-tank `behavior.ts`,
  `swim.ts` and `Tank.tsx` never handle it.
- **Roster.** Blacktip reef shark (`blacktip`, 1.6 m, active midwater cruiser),
  zebra shark (`zebrashark`, 2.4 m including its long tail, slow, low, rests on the
  sand), spotted eagle ray (`eagleray`, 1.8 m span, midwater gliding, broad banks).
  Student words: "shark", "ray"; names "blacktip shark", "zebra shark", "eagle ray".
  These three live only in `sharks`, and nothing else lives there (no small fish to be
  eaten; no stingray, whose model is tank scale). No great whites, no feeding
  frenzies, no attacks.
- **Capacity 16 places.** Sharks take 3 places, the eagle ray 2. Shown with the
  existing occupied/total convention ("6/16").
- **Prepositions: "above" and "by" only.** "Near" and "by" are near-synonyms, an
  unfair choice for Grade 3; "under" needs a glass-floor section, reserved for later.
  "Above": the animal is over the tunnel crown, horizontally within the tube's
  width. "By": beside the glass at roughly walking height, within 4 m. The question
  is only asked when one animal is unambiguously in one of those zones. The answer
  is graded against that snapshot, and the animal is held (slowed, kept in its zone)
  for about 6 s so the picture does not contradict the question.
- **Abilities: "Can it swim?" (Yes, it can!) and "Can it walk?" (No, it can't!)**
  and nothing else: some sharks "walk" and eagle rays "fly", so no trick questions.
- **Counting counts every shark in the habitat.** It is one open water volume, so
  "visible" is not a rule a child can check. Numbered tags (the existing counting
  sprites) appear on each shark, and the camera widens to the Grand Viewing Chamber
  shot while the question is up. Answers 1–6.
- **Find and show requests attract the animal.** When a visitor asks "Where is the
  shark?" or "Find a ray!", that animal's wander targets are biased toward the
  player's stretch of tunnel, so it arrives within about 10–15 s by ordinary
  swimming. Tapping is generous: the animal itself, or within a large screen radius
  of it, counts. Help climbs the existing ladder: written and spoken clue, then a
  highlight on the right window, then an arrow or glow on the animal, then the tap
  demonstration (existing tap hand). "Look at the big shark!" is only asked when both
  shark species are present (the zebra shark is the big one).
- **Player character.** The game has no avatar, so the player is "the aquarium
  boss": a child visitor model with a distinct teal staff cap and vest. Pico does not
  follow (cost and clutter); Pico's voice still gives help.
- **Movement is constrained to the visitor path.** The walkway is a closed loop
  (lobby, entrance mouth, First Viewing, Main Curve, Grand Viewing Chamber, return
  leg, exit mouth, lobby). Position is (distance along the loop, lateral offset), with
  the offset clamped inside the walkway, so the player can never leave the path or
  touch the glass. Joystick (bottom left, touch or mouse drag), arrows and WASD, all
  relative to the camera's view. Tapping a viewing-spot marker walks there.
- **Camera: authored shots, never free.** Shots are keyed by position along the
  loop and blended smoothly. The camera always stays inside the tube's cross-section
  (no wall clipping by construction), keeps the horizon level, and tilts gently up
  when a shark passes overhead near the player.
- **Shark Tunnel goals instead of new Levels.** Levels 1–8 are untouched. Five
  milestones show in the objectives panel while in the wing:
  1 Grand Opening (open it; reward: a free blacktip);
  2 First Tunnel Tour (enter the tunnel and complete 3 observation activities;
  reward: the big rock arch);
  3 Help Visitors (help 3 tunnel visitors; reward: a free eagle ray);
  4 Improve the Habitat (habitat happy and 3 structures placed; reward: zebra shark
  unlocked plus a free one);
  5 Shark Tunnel Celebration (a guided final tour: one find, one where, one count in
  a row; reward: Shark Tunnel trophy and a celebration).
  Everything stays open and playable afterwards.
- **Unlock.** Free play, the Atrium open and its giant reef holding at least 4
  animals, then coins. Target price 400, tuned by the simulated student (as the
  Atrium's was) to be reachable about 8–12 minutes after opening the Atrium; move it
  within 300–450 if the simulation says so, and record the number.

### Habitat and tunnel

- World placement behind the Atrium: lobby about x 29–39, z −5.5 to −9.5; habitat
  about x 20–52, z −10 to −40, seabed about y −0.5, water surface about y 8. The
  habitat walls are dark rock and blue-grey concrete, far enough to fade into the
  water fog from inside; distant rock silhouettes and tall arches give depth.
- Walkway tube: about 4 m wide and 2.9 m high, a gentle U-shaped curve. The Grand
  Viewing Chamber is a wider dome (about 9 m across, 4.5 m high) deep in the habitat,
  with the broadest overhead swimming space above it. Glass ribs every few metres
  (opaque frames make the glass legible and hide seams).
- Glass: one shared fresnel-edged transparent material, single-sided, no refraction.
  Underwater look: fog, a procedural caustic floor, a few additive low-opacity light
  shafts, one pooled particle system (motes and bubbles), instanced rocks and coral.
  No volumetrics, ray marching or fluid simulation.
- Management view: an elevated, fixed-angle diorama from the lobby side, with four
  automatic viewpoints (Whole, Left, Right, Entrance) as large buttons. No lid over
  the water (a faint surface sheet at most), so animals stay readable from above.
- Six large placement zones on the seabed around the tunnel, each a big touch ring,
  clear of the tube, the windows and the main swim lanes. Five habitat structures:
  big rock arch (sharks swim through it), tall rock pinnacle, reef rock shelf,
  resting ledge (zebra sharks rest under it), sand bank. Each structure's collision
  shape is defined once, beside its zone data, and used by both the renderer and the
  swim simulation.

### Animals

- One 3D steering simulation for the habitat (not `swim.ts`): wander targets in the
  volume, look-ahead avoidance of the tube, the habitat box, the seabed, rock and
  decoration shapes and other large animals, with clearance for the whole body.
  Turn rate and bank are limited per species so turns are wide; speed eases. Each
  animal keeps a path history so the body follows the head (the eel's head-led idea,
  but a stiff shark body: curvature grows toward the tail, the tail beats, the head
  barely yaws).
- Sharks: one merged low-poly mesh per species with a vertex-shader body bend and
  tail beat; markings in vertex colours. Rays: a pectoral wave in the vertex shader.
  Lower detail for distant animals.
- Pose data is shared state: the exploration camera, visitor reactions and the
  English activities read it.

### Visitors in the tunnel

- A separate lightweight visitor set for the wing (about 6 at once, adults and
  children, existing models) walks the same loop in lanes, stops at viewing spots,
  looks up, points, takes photos, gathers in twos and threes. They sidestep for the
  player and never stand in the player's way for more than a few seconds. Reactions
  ("Wow! A shark!", "Look! It's above us!", "It's so big!", with Japanese) are
  triggered by a shark passing near and are rate-limited.
- Leaving visitors pay the habitat's tip through the existing tip breakdown.

### Saving

- New optional fields only (save version unchanged): `progress.tunnelOpen`,
  `progress.tunnelIntroSeen` and `progress.tunnel` (milestone index, activity
  counters, visitors helped, trophy). The habitat tank is an ordinary tank record.
  Old saves load with the wing closed. Exploration itself is not saved: a reload
  returns to the management view.

### How it is built

Four slices: (1) data, rules, save, wing, habitat scene and management mode;
(2) shark and ray models and the 3D swim simulation, built in parallel with (1)
against a frozen geometry contract (`src/game/tunnel/contract.ts`); (3) integration,
exploration mode and tunnel visitors; (4) English activities, milestones, reactions
and the celebration.

### Decided while building (2026-11-06)

- **Who built it.** Both Codex slices stopped on a usage limit a few minutes in.
  The owner chose to have Claude build it instead of waiting. Claude kept the
  drafts' sound parts (data, rules, save fields, swim simulation, models) and wrote
  the rest. The four slices were not dispatched separately.
- **Price 300, not 400.** The simulated student (`economy.test.ts`) needed 15.75
  minutes at 400 coins after opening the Atrium, including the four reef animals the
  unlock asks for. 300 is the bottom of the frozen range and still above the
  Atrium's 260 for a bigger attraction. It takes about 13 minutes, so the
  regression band is 9–14 minutes, not 8–12.
- **"Help Visitors" counts only after the First Tunnel Tour.** Otherwise visitor
  questions counted for milestones 2 and 3 at once and both completed together.
  Pico also asks an observation question when the player lingers at a viewing spot
  (at most every 40 s), so milestone 2 does not depend on visitors.
- **Geometry.** The walkway is a closed centripetal Catmull-Rom loop sampled every
  0.5 m. The tube is 4.2 m wide and 3.2 m high: at 2.9 m an adult at the walking
  edge was under 1.85 m of glass. People may walk 1.25 m either side of the centre
  (3.35 m in the dome). Zones carry a yaw: every structure stands parallel to the
  side walls, and an arch's opening faces the tube. The Atrium's left "Coral Reef"
  board moved from x 32.7 to 34.5; it stood in front of the new doorway.
- **Rocks are drawn from their collision solids,** inset 5–34% and never outward.
  The swim avoidance and the picture cannot disagree.
- **Resting zebra sharks.** Their dive angle is limited, so they stop up to about
  1.2 m above a rest spot. The simulation then reports a `restDrop` (optional
  contract field) and the renderer eases the body down onto the surface below,
  which is open water by construction.
- **Only the active area is drawn, and only it can be tapped.** react-three-fiber
  raycasts invisible objects, so hidden areas are also moved off layer 0
  (`scene/tunnel/wing.ts`). Moving into or out of the wing is a short fade and a cut.
- **No front rim in the management view.** The habitat's front edge is open (a low
  base and faint glass). A rim hid the two front placement zones from the elevated
  camera. Light shafts only show inside the tunnel; from above they read as flat
  sheets.
- **Zone taps hit a filled disc.** The visible ring is hollow; children tap the
  middle of rings.
- **Exploration camera.** It lives on the loop behind the player, 3.2–4.4 m back
  depending on the section. A final projection keeps it inside the tube's cross-section
  even while smoothing cuts a corner. At a viewing spot it turns only part-way (35%)
  toward the window, so the player stays in frame. Visitors within 1.15 m of the
  camera are hidden for that moment. Fog FogExp2 0.052 makes the habitat walls fade
  into blue water from inside.
- **Count questions wait for the sharks.** Every shark is called to a point just
  ahead of the player and held there. The question opens when they have all arrived
  (or after 25 s), with a numbered tag on each.
- **Tunnel visitors run in the game tick** (not only when the wing is shown), so the
  habitat earns tips while the player is elsewhere, like other exhibits.
- **The player model.** Visitor models gained an optional separate right arm
  (`tunnelPersonModel`, `bossModel`) so tunnel visitors can point and hold up a
  phone. Ordinary visitors are unchanged.
- **Tunnel walking controls are tunnel-relative (2026-11-07).** Up/W walks along the
  loop in the current travel direction, Down/S against it, Left/Right/A/D across the
  walkway; the joystick maps the same way. The travel reference is held while any
  direction is held and only changes after a metre walked the other way. Why:
  camera-relative input made "back" swing the camera, which reversed "back" (jitter),
  and freezing the camera yaw instead pushed the player into the walkway edge on
  curves. Rejected: camera-relative input with a locked yaw.

## 2026-11-07 — Rush Hour event (design freeze)

A recurring free-play event: warning → timed preparation (feed + clean every
occupied tank) → a 90-second visitor crowd → medal, small coin bonus, permanent
cosmetic trophies. Brief accepted with the changes below. Numbers live in
`src/game/rush/config.ts`; the shared state shape is `src/game/rush/types.ts`
(`Model.rush`, optional; old saves get `newRushState()`).

**Accepted as briefed:** unlock = free play + Ocean Hall open + ≥1 occupied tank,
never during the tutorial; Pico intro once; first event 8–12 min, later 12–18 min
of active play, the rolled delay persisted; preparation 120 / 150 / 210 s by
1–4 / 5–9 / 10+ eligible tanks (fixed at start); rush 90 s; ready = food ≥75 and
clean ≥75; medal thresholds on the exact fraction (≥0.5 bronze, ≥0.75 silver,
1 gold); bonus `floor(min(40, 10 + 3n) × fraction)`; no penalties ever; skip
without penalty schedules the next normal delay; eligible tank ids captured at
start (sold or emptied tanks stay in the denominator as unready; a remodel keeps
its id); results screen with one Continue; trophy cabinet and stats persisted.

**Changed:**
1. **Readiness latches.** Food decays 1 pt / 3 s and dirt 1 pt / 5 s, so a tank
   fed to 100 falls below 75 within 75 s. Snapshotting live state at the deadline
   would make early work vanish and turn the event into plate-spinning — the
   opposite of "not stressful". A tracked tank counts as prepared once food and
   clean are both ≥75 at the same moment during preparation, and stays prepared
   for that event (checkmark and chime play once). Decay is unchanged. Rejected:
   live-state snapshot (as briefed); freezing decay during prep (hides the normal
   care loop).
2. **One clock.** Rush Hour time advances only inside the existing care-decay gate
   (`decayRunning()` in sim.ts: game screen, no Settings, no stage card, not
   `busy` — which covers English prompts and scripted moments — tutorial done),
   in the same 1-s accumulator, and is stored in `Model.rush` so reloads resume
   it. Hidden tabs stop requestAnimationFrame; a resumed frame's dt is clamped so
   nothing jumps. No wall-clock time, no offline time.
3. **Cooldown = waiting** with a freshly rolled delay; one fewer phase to get wrong.
   Phases: waiting → pending → prep → rush → results → waiting.
4. **Pending banner.** When due at a calm moment (idle mode, no celebration, not
   exploring the Shark Tunnel), a small banner offers Start Now / Skip and starts
   by itself after 20 active seconds. If due while exploring the tunnel, it stays
   pending and shows on return. Start Now exists only for a due event (no farming).
5. **"Perfect preparations" = gold count**; not stored twice.
6. **Rewards are fixed-position cosmetics in Hall 1's entrance area**, not
   placeable inventory: no placement UI, no clutter, nothing collides with the
   player's decorations, nothing touches income/food/clean/happiness. The cabinet
   appears at unlock with empty slots; the first bronze-or-better fills the bronze
   display (the brief's "first bronze → cabinet" and "cabinet at unlock" conflict;
   resolved this way). The reward bench is decorative, not a seat.
7. **Results-screen medals are 2D** (SVG/CSS, fish / ray / shark motifs); the 3D
   medals live in the cabinet. A second WebGL canvas on a Chromebook for a
   results card is not worth it.
8. **Once-only commit.** Medal, stats, rewards and coins are applied in a single
   model update at the rush → results transition, guarded by
   `rush.lastCommitted === event.id` (the general `paid` list keeps only 60 keys,
   too short to be the guard). Results only display.
9. **Crowd.** Up to `CROWD_EXTRA` extra visitors, all cosmetic (never tip, never
   requests), hall total capped at `CROWD_CAP`; ordinary visitors tip as normal.
   At most `RUSH_QUESTIONS` short English visitor questions per rush through the
   normal ask() flow (which pauses the clock); their usual rewards only.

**Future variants** (Field Trip, VIP, Discovery Day) are not built; the event
record and config are shaped so a `kind` can be added later.

### Rush Hour — decided while building (2026-11-07)

- **The shared clock gate widened.** Prompts are mode `ask` and dialogue lines mode
  `talk`, not `busy` as the freeze assumed. `decayRunning()` now requires
  `mode === "play"`, no prompt and no line, and not the Rush results screen. So
  ordinary care decay also pauses while a child answers an English question or
  reads Pico. Accepted: it is fairer, and one clock is the point. Rejected: a second
  Rush-only gate (two clocks drifting apart).
- **Announcements are non-blocking** (a timed card, `rushAnnouncement`), so they
  never take preparation time. Rush questions are budgeted per event and the
  budget is persisted, so a reload cannot reopen the question budget.
- **Cabinet turned 35° toward the room camera.** Flat against the left wall, only
  its side showed and the medals could not be seen. The golden sign stands on the
  cabinet's crown, facing with it, instead of on the wall (it read as a dark plaque).
- **The top reward stays visible.** The golden shark statue stands left of the
  bottom toolbar. The low decorative bench sits behind the toolbar, where the
  statue first was. The front-right floor is a visitor destination, so it is not free.
- **Reveals only play live.** A reward's sparkle and scale-in play only at the
  results screen (where rewards are granted), and the cabinet's before Pico's
  intro. The Room mounts behind the title screen, so loading a save would
  otherwise replay every reveal.
- **Results must fit without scrolling** at 1366×768: smaller medal on the card,
  new rewards inline. Children do not find a scrolled reward list.

### Rush Hour bigger crowd (2026-11-07)

- **Regular halls target 18 people total**, ordinary plus cosmetic; `CROWD_EXTRA`
  is now an active cosmetic ceiling of 15, with replacements throughout the 90 s
  rush. Groups of 3–4 arrive every 6–8 active seconds (the last group can be
  smaller to fit), filling the halls in roughly 30–40 s. Mostly one adult and
  children, sometimes two adults; starts, speeds and animation phases vary.
  The existing 3 ordinary visitor places (4 with tickets) stay reserved, including
  at reduced budgets, so cosmetics cannot block normal arrivals or questions.
  Groups choose the least-crowded occupied exhibit across open rooms, then tour
  using the existing viewing spots and routes. Shark Tunnel limits stay separate.
- **Runtime governor: good 18 / moderate 14 / low 12.** Four-second frame-time
  windows; two consecutive windows averaging over 34 ms (under ~29 fps, the 30 fps
  target) lower one tier. Recovery needs at least 12 s below 24 ms (~42 fps) and a
  20 s active-play cooldown after the last tier change, one tier at a time. Hidden
  tabs, paused/non-play frames and gaps ≥ 0.5 s (a resumed tab, a hitch) discard
  partial evidence. *Revised while reviewing:* the first cut was 25/19 ms and
  discarded every frame ≥ 100 ms as a resume spike, so a live software-rendered rush
  at 9 fps never stepped down, and a steady 35 fps Chromebook (meeting the target)
  would have lost its crowd. No saved state or
  per-frame React updates. Excess cosmetics finish their current look and walk
  out; request visitors, scripts and English activities keep their normal flow.
- **Renderer resources are shared**, including limb geometry, shadows and picking
  meshes, with automatic disposal disabled for shared people resources. Distant
  background limbs update at 12 Hz; nearby and interactive animation stays smooth.
  Cosmetics still never request or tip; ordinary tips and the two-question budget
  are unchanged. Rejected: raising only the cap (the lifetime spawn budget stayed
  sparse), a single arrival burst, deleting visible people on slow frames, a
  per-frame FPS switch without hysteresis, and an instancing rewrite of the rig.

### Rush Hour HUD in the objective slot (2026-11-07)

- **The upper-left corner is the player's current objective.** While Rush Hour is
  pending, preparing or rushing, its card *replaces* the Free Play / Goals card in
  the same slot (`GoalCard` renders either `RushObjective` or the goals; never
  both, no z-index layering). Results stay the centred dialog; afterwards, or on
  キャンセル, the goals return at once. The goals' expanded state is held by the
  slot, so it survives the swap. Rejected: keeping the bottom-left widget (it
  competed with the toolbar and moved to the bottom-right whenever goals opened).
- **Goals stay reachable.** A "≡ もくひょう" control swaps the slot to the goals
  (or the Shark Tunnel milestones), led by a "RUSH HOUR 01:23" return button.
- **Card layout.** Title and a 38–46 px tabular `MM:SS` countdown share the top
  row (a stacked title would push the card into the hall arrow at 1280×720); a
  continuous time bar under it; 「じゅんび しよう！」; "n / m tanks ready" with one
  pip per tank (segmented green, deliberately unlike the amber time bar); a
  full-width Checklist; キャンセル and もくひょう share a quieter second row (three
  buttons in one row wrapped キャンセル one character per line at 1024 px).
- **Urgency is tied to real clock ticks.** > 60 s amber and calm; 60–30 s orange
  with one nudge on entry; 30–10 s orange-red with a small pulse per tick; last 10 s
  a larger bounce per tick and a glow. Animations are keyed to the displayed second,
  so a paused clock is visibly still. No tick sound: a classroom game must not
  compete with English speech. Screen readers hear 60/30/10 s only.
- **Paused** (an English question, Pico talking): the card stays but goes grey,
  says "Paused / とけいは ストップ ちゅう", and hides the bar and buttons.
- **Compact variant** in tank close-up, the tunnel walk, and while paused: timer,
  ready count and Checklist only. The close-up status card steps below it.
- **Visitor rush:** aqua card, same timer, a plain family silhouette (the visitor
  icon's "!" means a request), the secured medal; no Checklist or キャンセル.
- **Pending visibility uses stable store state**, not `rushCalm()`, whose per-frame
  runtime flags flicker and would swap card and goals for a frame. `startRush()`
  still checks `rushCalm()`.

## 2026-11-10 — Grand Aquarium Hub + Coastal & Polar Zone (plan review)

The owner handed over a full expansion brief (hub, coastal wing with penguins,
seals and sea otters, habitat items, ESL observation activities, five
milestones). They asked Claude to accept, reject or modify it at its own
discretion and build it alone, without the worker router. This entry is the
review. Decisions made while building are appended below it.

**Accepted as briefed:** a hub as an extra navigation layer. The four halls,
their arrows and the Atrium → Shark Tunnel door stay exactly as they are. The
hub opens free in Free Play once the Shark Tunnel is open. It has two future
entrances (Dolphin Lagoon, Grand Ocean Sanctuary), shown as attractive but
closed. Its centrepiece is a display tank with no care. Its visitors are
decorative and never tip. Habitats are separate, not one shared pool. The coast
gets its own five milestones (Levels 1–8 untouched), species-specific habitat
items with visible effects, child-friendly needs (no death, a bilingual "needs a
rock!" message), mic-free English, debug actions, and optional save fields only.

**Changed:**
1. **Habitats are tanks.** Each coastal exhibit is an ordinary `TankRec` on a
   built-in pad (M penguins, N seals, O otters), like the Shark Tunnel's habitat
   on pad L. Food, cleaning, decay, happiness, tips, save validation and Rush
   Hour readiness then work with no parallel system. Rejected: a separate
   habitat-state model, which would double the care rules and break Rush
   integration.
2. **Needs cap happiness.** The brief's "suitable resting area / enrichment"
   needs become one required item per species (penguins: a resting rock, seals:
   a haul-out rock, otters: a floating toy). Without it, happiness is capped at
   60, below "happy", and the status card names the missing item. The existing
   formula (food, clean, decorations) is otherwise unchanged. Rejected: a
   multi-factor welfare score that children cannot read.
3. **One Map control.** The brief asks for a Hub control *and* a Back to Hub
   control. A single "Map / マップ" chip (top right) opens the Aquarium Map, and
   its first and largest card is the Grand Hub. At 1366×768 the top bar has no
   room for two new chips beside Rush awards, Help and Settings. The hub's
   doorways also travel. The chip is hidden while a prompt, line, purchase,
   placement or celebration is open. The Shark Tunnel walk keeps its own Back to
   Aquarium button (the map is hidden while exploring).
4. **Opening the other two habitats is free.** Seal Cove opens (with its first
   seal) as the Penguin Paradise reward, and Otter Bay opens (with its first
   otter) as the Seal Cove reward. Only the zone itself costs coins. Rejected:
   three separate purchases, which add coin-farming between milestones.
5. **The penguins arrive as a group of three.** The brief's Milestone 1 reward
   is "first penguin". Penguins are colony birds: one alone looks wrong, and
   "How many penguins?" needs more than one. Milestone 2 adds a fourth.
6. **Movement is authored, not physics.** Each habitat is data: land
   platforms with heights, a water volume (surface, floor), and shore ramps that
   join land to water. Animals follow a state machine (rest → walk → enter ramp →
   swim/dive → surface → exit ramp). Land travel stays on the platform graph and
   water travel inside the volume, so clipping is impossible by construction.
   Unit tests check it: never under ground, never walking below the surface, no
   step longer than the speed allows. Rejected: free steering with collision
   (expensive, and the shark swim showed how much tuning it needs).
7. **Scope and order.** Built in order: A the Hub, B the coastal environment,
   C a complete penguin slice, then D seals and otters, E milestones, F polish.
   Each phase is committed and deployed only when verified. Whatever is not
   finished this session is listed in CURRENT_STATE.md and is not hidden as
   placeholders.

**Rejected:**
- "Test on real Chromebooks / stable 30 fps": not possible from here. Frame
  budgets are measured with SwiftShader (draw calls, triangles) and the
  existing adaptive DPR stays. This is reported as unverified.
- "Information counter" as a working feature: it is scenery only. It has
  nothing to sell.
- A second achievement store: the hub's trophy wall reads the existing flags
  (`star`, `superStar`, `tunnel.trophy`, `rush.trophies`, and the coastal trophy).

### Hub and coast: decided while building (2026-11-10)

- **The hub is a rotunda with eight bays.** From left to right: Indoor Aquarium,
  Trophies, Dolphin Lagoon (future), two tall windows under the GRAND AQUARIUM
  sign, Ocean Sanctuary (future), Shark Tunnel, Coastal & Polar Zone. Each
  doorway is painted with a view of its wing, so the picture says where it goes.
  The door signs turn partly toward the camera so the outer ones stay readable.
  The fixed camera steps back on narrow screens, like the Shark Tunnel's views.
- **The indoor doorway returns to the hall the player came from** (Hall 1 by
  default). The map lists all four halls separately.
- **The hub crowd is groups of 1–3** (families: an adult or grandma with
  children). They arrive from the plaza front or out of a wing, stop on the
  viewing ring round the tank to look, point or take a photo, sometimes pause
  on the plaza, and leave by another doorway. Routes go round the tank, never
  across it (tested). They are stepped only while the hub is shown and never
  tip.
- **Map chip at narrow widths:** below 1180 px only the glyph shows, so the
  centred coins, level and hearts keep their room at 1024.
- **Pico's hub line is followed by a "Tap Map!" nudge** that points at the chip
  (the state-derived guide resets `guide` every tick, so a nudge is used).
- **Coastal species:** a Humboldt penguin (rocky temperate coast, so no snow
  is needed), a harbor seal and a sea otter. They are not sold at the counters.
  They arrive as milestone rewards (penguins 3 + 1, seals 1 + 1, otters 2).
- **Coastal items are bought by tapping, not with English.** The zone's English
  is in its observation questions. Each item has a place kind (land, floating,
  pool floor) and only fits slots of that kind (`coastSlotFits`, also checked
  in saves). Every habitat has more slots than items, so placement is a choice.
- **Ramps are solid to their end.** Animals slide off the end into open water
  (`RAMP_STEP`) and come back the same way, so the drawn block and the area
  swimmers avoid are the same shape.
- **The questions at the windows:** "How many penguins?" (the penguins hold
  still and show number tags), "Where is the seal?" (one seal is held and
  ringed; "On the rock!" or "In the water!" from where it really is), and "Can
  it swim?" / "Can it fly?" about a ringed otter. A visitor chip with "!"
  appears every 22–36 s while the zone is shown. Each answer pays 3 coins.
- **Behaviours count only when watched:** a penguin entering the water, a seal
  diving and an otter floating are recorded only while the zone is on screen.
  Animals do not move while the zone is hidden; their care keeps decaying as
  usual.
- **Price 320 coins**, close to the Shark Tunnel's 300. Players reach it after
  the tunnel's five milestones, when they already have more tanks paying tips.

## 2026-11-10 — Dolphin Lagoon + Grand Ocean Sanctuary, release locks (plan review)

The owner handed over a brief for two outdoor expansions, built now but kept
locked, plus a temporary lock on the Coastal & Polar Zone. They asked Claude to
accept, reject or modify it and build it alone, without the worker router.

**Accepted as briefed:** the hub and the map keep all three destinations
visible with a lock, a Coming Soon mark and bilingual labels ("GRAND OCEAN
SANCTUARY / うみの サンクチュアリ"). A locked doorway or map card says "Coming
soon! / もうすぐ オープン！ おたのしみに！" and never travels, charges or
offers. The coast's normal unlock is switched off without touching coastal
saves. Debug previews (Ctrl+Alt+D) for all three areas, milestone jumps, and a
return to the hub. Outdoor lagoon with a main lagoon, underwater gallery,
observation deck, care area and walkways, seen through curated viewpoints.
Bottlenose dolphins and orcas with the listed anatomy, vertical fluke motion,
social swimming, enrichment instead of shows. Five milestones for each area.
Belugas in their own cold-water cove. Mic-free English about what is visible.
Built / released / unlocked are separate; nothing auto-unlocks; no prices.

**Changed:**
1. **The release lock is not ownership.** `data/release.ts` holds one table
   (built, released) per area. Travel (`roomOpen`) needs released + owned, or a
   preview; save validation uses ownership only (`roomOwned`). Why: `save.ts`
   checked tanks with `roomOpen`, so a lock there would have deleted every saved
   coastal habitat on the next load. Rejected: putting the lock inside
   `roomOpen` alone.
2. **Owned habitats in a locked area are stored, not played.** At load they move
   to `model.stored` (tanks, bagged animals, unplaced items) and are written
   back unchanged on every save. Why: Rush Hour takes every occupied tank (gold
   would become impossible), the Level 8 judge needs every occupied tank happy
   (it could block the Super Star), and care decay would make unreachable
   animals sad. Rejected: filtering each of those rules (too many to miss).
3. **A preview is a sandbox.** Any preview first flushes the save, then stops
   autosave for the session; "End preview" puts the saved model back, and a
   reload simply never sees the preview. The old coast debug actions (unlock,
   all habitats, Coast 1–5) now run inside it. Why: milestone jumps change
   coins, items and habitats; a sandbox guarantees none of it persists.
   Rejected: stripping individual fields on save.
4. **The lagoon and the sanctuary are not tanks.** Their state is their own
   (`progress.lagoon`, `progress.sanctuary`), so care decay, Rush Hour, tips,
   visitor requests and the judge never see them, locked or not. Unreleased
   areas' saved fields are dropped on load. Rejected: coast-style `TankRec`
   habitats, which would have pulled them into every global rule.
5. **Dolphin welfare is three visible needs, not a formula:** Food (ごはん),
   Play (あそび) and Together (なかま), each a bar; happiness is their average.
   They only change while the lagoon is shown (the care team looks after the
   dolphins otherwise). Feeding is one tap from the care platform; enrichment
   is a toy chosen from a few (ball, bubble curtain, kelp). No tricks or jumps
   on command; a leap happens only by itself.
6. **Observations are "Look!" moments.** When something worth seeing happens on
   screen (two swimming together, a breath, a deep dive, a leap), a tappable
   Look! bubble appears at the animal for a few seconds; tapping it records it.
   Why: the child has to actually watch. A missed moment comes round again.
7. **Questions only about what is visible.** "Where is the dolphin?" is "It's
   on the water!" / "It's under the water!" from the ringed dolphin's real depth
   (it holds that depth while asked). "Can it jump?" only right after a leap.
   "Where is the orca?" is "It's by the island!" / "It's by the boat!" after the
   orca is brought next to one of them.
8. **The sanctuary's management is research and conservation:** a Research
   Notebook of stickers (breathing, swimming together, a deep dive, size, a
   calf with its mother, a spy-hop, the belugas, a clean ocean), an Ocean
   Cleanup (tap the floating litter), and a Habitat Improvement choice with a
   Japanese reason. No feeding, cleaning or decorating there.
9. **Belugas open as the sanctuary's milestone 3 reward** in a separate cove
   behind a rock breakwater, so the orca waters stay the main sight first.
10. **Coast owners keep seeing their progress.** The map card shows the saved
    milestone count under the lock; the trophy card keeps an earned coastal
    trophy; "how to earn" lines for locked areas say "Coming soon".

**Rejected:**
- "Measure Chromebook performance / stable 30 fps": not possible from here.
  Draw calls and triangles are measured with SwiftShader; reported as
  unverified.
- Unlimited flying cameras: curated viewpoints only (as briefed).
- Coins from decorative visitors: they never tip. Answered questions pay 3
  coins like the coast's.

### Lagoon and sanctuary: decided while building (2026-11-10)

- **Shared marine kit.** Both areas use one swimming simulation
  (`game/marine/pod.ts`) over an authored polygon of water
  (`game/marine/domain.ts`: beach edges shelve, wall edges such as a quay, a
  viewing window or the buoy line stay deep). Steering looks ahead and a last
  guard always allows a step that gains room, so no animal can strand or be
  pinned; shore margins scale with body size so a calf can follow its mother
  anywhere she goes. One shader (`scene/marine/cetaceanMaterial.ts`) does the
  vertical fluke beat, turn bend, surfacing arch, the beluga's neck and the
  markings per pixel. Rejected: skeletal rigs (draw calls) and per-species
  shaders.
- **Each area sets its own atmosphere** (sky dome, haze, far plane, sun,
  underwater look) only while shown. The Shark Tunnel's environment used to
  rewrite the scene's fog and background every frame even when hidden; it now
  only does so while the wing is shown.
- **Underwater windows are entered with a fade** (the gallery, the station):
  the camera never passes through walls, rock or glass. Other viewpoint
  changes glide.
- **Curious animals.** Dolphins regularly cruise past the viewpoint the
  visitors are using (the gallery window, below the deck, beside the
  pontoon). Orcas patrol favourite places (past the station windows, beside the
  island, by the boat) and the matriarch leads the family past the station
  when its view opens; if they are far, a line says "The orcas are coming!".
  Why: a big bay should not look like a tank, but a child must see animals.
- **The pod.** Dolphins: Sora with her calf Mimi (echelon swimming), Kai, Nami.
  Orcas: Yuki (the matriarch, leader) with her calf Chibi, Kuro (an adult male,
  tall straight fin) and Umi (a nicked fin). Belugas: Shiro, Mochi, Kumo, in
  their own cove and water (they never meet the orcas).
- **Counting gathers the pod** loosely in open water, then the camera frames
  their actual spread (no number hidden under the HUD).
- **"Where is the orca?"** brings one orca beside the island or the boat and
  holds it there before asking; the camera frames both.
- **Look! moments pay no coins** (they repeat): they fill milestones and the
  notebook. Answered visitor questions pay 3 coins, as at the coast; Pico's
  tours pay 10 and 15 once.
- **Cleanup litter is big and easy to tap** (a wide hit area) because it
  floats far from the camera.
- **Viewpoint buttons sit bottom-left** above the bottom bar: the goals card
  grows with wrapped text at 1280 and 1024 wide (an e2e layout test caught it
  covering the first button).
- **A preview badge** ("PREVIEW · not saved") shows whenever the sandbox is on.

## Outdoor areas stay debug-only (2026-11-10, owner decision)

- **What:** Coastal & Polar Zone, Dolphin Lagoon and Grand Ocean Sanctuary are
  reachable only through the development preview (Ctrl+Alt+D). No price,
  prerequisite or ordinary-play unlock is added; every `released` flag in
  `data/release.ts` stays `false`.
- **Why:** the owner wants them unlockable only in debug mode for now.
- **Rejected:** choosing an unlock order and coin prices for release.

## 2026-11-10 — Penguin Coast Antarctic habitat redesign (preview only)

- **Habitat:** Penguin Coast now uses an Antarctic palette of exposed blue-grey
  rock, irregular snow-capped cliff strata and blue ice. The cliffs stay behind
  the walkable shelf and fall in height toward Seal Cove. A broad shallow
  stone-and-gravel shoreline joins the shelf to the pool; underwater rock
  faces, low uneven floor patches, three submerged boulders and quiet bubble
  trails give the glass view depth without fog or heavy tint. The procedural
  penguin model and English exercise word "penguin" are retained; this
  supersedes the earlier Humboldt/temperate-coast scenery decision.
  The shore uses broken, sloping rock and scattered gravel, while submerged boulders are rounded and ice floes have uneven, broad keels.
- **Walkable versus solid:** the existing shelf and the widened 3.5 m shore
  ramp remain traversable. Two low snowy resting ledges (+0.33 m and +0.43 m)
  have authored approach points and bounded step/hop paths; penguins pause,
  groom and look toward the water there. The broad flat floe is an island,
  reached and left only through its exposed left climb point. Two small ice
  pieces, one mostly submerged ice formation and three underwater boulders
  are conservative swim obstacles at every depth. Cliffs are outside the land
  bounds; underwater wall relief stays outside navigable margins. Penguins
  sometimes walk to a quiet spot beside a placed nest. All four land item
  slots retain their indices and kinds on clear, reachable shelf ground.
- **Motion:** optional ledges, ramp widths and swim obstacles engage only for
  exhibits defining them; Seal Cove and Otter Bay data and random decision
  paths are unchanged. Invariants cover ledge heights and clearance, floe
  climb points, solid-water avoidance, maximum step speed, nest-side resting
  and water/land returns with all item slots occupied. A route diagnostic
  caught an inaccessible rear floe approach; the final left approach connects
  directly to the shore and the glass swimming lane.
- **Views and arrival:** the Penguins view frames the cliffs, land, shore and
  glass together. Its extra "Underwater / みずのなか" button selects a fixed low
  window view; tapping Penguins restores the land view. All, Seals, Otters and
  the counting camera remain available. The first visit has a 7.2 s sweep from
  cliffs to land companions, a real shore entry, a glass-side swimmer and the
  normal view. Initial arrival positions use valid movement paths before the
  first frame. Any tap or key skips; reduced-motion skips automatically. The
  existing optional `coastIntroSeen` flag is used inside the preview sandbox.
- **Rendering:** static scenery remains one merged vertex-coloured
  `PartBuilder` geometry with shared materials; twelve instanced bubbles add
  one draw. No textures, new shadows, reflections or render targets. Production
  SwiftShader captures and performance snapshots are in `.tmp/coast-review/`
  at 1366×768 and 1024×768, including 1 s shoreline and arrival sequences.
  At 1366×768, milestone 5: All changed from 80 calls / 21,128 triangles to
  82 / 24,542 (+2 calls, within the roughly +15 overview allowance); Penguins
  changed from 25 / 7,464 to 43 / 14,880. The new land camera shows the complete
  exhibit and more surrounding geometry than the old close shot; visibility
  and animal pose affect these frame snapshots. Underwater is 21 / 9,384.
  These are fresh before/after measurements, distinct from the earlier 31 /
  9.6k penguin budget note. Hardware Chromebook frame rate remains unmeasured.
- **Rejected:** third-party Arctic/winter asset packs clash with the game's
  procedural style, and the considered paid pack was unavailable. Growing the
  exhibit footprint would move Seal Cove/Otter Bay. Replacing the penguin model
  was cancelled by the owner. The exhibit centres, window, walkway, release
  locks, save format and progression are unchanged; outdoor access remains
  through Ctrl+Alt+D preview only.

## 2026-11-10 — Owner-supplied rigged penguin (debug preview only)

- **Source and pipeline:** the generic stylized penguin is `Pinguin_001.fbx`
  from the owner's own ithappy **Animals FREE** v2.3 Unity package. Run
  `npm run build:penguin` to read the original gzip/tar `.unitypackage` in
  Downloads, extract the FBX and palette in memory, and generate the single
  self-contained `src/assets/models/penguin.glb`. The original pack stays
  outside the repository. Its embedded idle/walk/run takes are retained;
  armature `_rig` root-motion and `_end` leaf tracks are removed, constant
  tracks keep one key, and the shared colour palette is reduced to 128 px.
  Vite's `?url` import preserves GitHub Pages sub-path support.
- **Runtime:** one cached load, cloned skeletons and one mixer per penguin.
  Idle, walk and run weights crossfade with mover speed; planted-foot motion
  in the source supplies speed-scaled gait timing. Bounding-box normalization
  matches the old procedural model's 1.3-scale height and places the feet at
  the mover's land contact. Animated sole vertices correct small source-gait
  foot dips; the shore tilts the visual support plane only.
- **Swimming and actions:** there is no swim clip. The visual body blends to
  the existing horizontal `(PI/2 - pitch)` convention about its centre,
  fades walking away, then applies strokes to the inspected `finL`/`finR`
  bones after mixer evaluation and tucks the legs. The actual head bone is
  `scull`; it supplies a small look/groom motion. Mixers advance only in the
  existing coast frame callback while the coast is shown.
- **Fallback and scope:** the existing procedural penguin remains during
  loading or failure. Root names, count tags, focus rings, splashes and all
  movement, care, questions, saves and progression remain in their existing
  paths. Scenery and other animals are untouched. All outdoor release flags
  remain false; this model is visible through debug preview only. Generic
  "penguin" supersedes the old Humboldt identification; exercises are unchanged.
- **Rejected:** importing into Unity and re-exporting adds an unnecessary
  tool round-trip when the original FBX already contains the rig and takes.
  Keeping the procedural model as the primary visual was rejected for this
  owner-requested asset replacement; it remains the resilient fallback.

## 2026-11-11 — Penguin Coast only: preserved habitats, stable ground and visible feeding

- **One content switch:** `COAST_HABITATS_SHOWN` in `game/data/release.ts` is
  `["penguins"]`. Scenery, animals, signs, placement hits, views, questions and
  debug milestone choices follow it. Seal/otter species, models, exhibit data
  and full progression paths remain; widening this one list restores them.
  Hidden habitat tanks, placed items, bag animals and unplaced items stay in
  the existing `model.stored` mechanism, unchanged and outside care decay,
  happiness aggregation, Rush Hour and the judge. Later saved progress is kept.
  Release flags, ordinary unlock prerequisites/price and save version remain
  unchanged: entry still requires the Ctrl+Alt+D preview sandbox.
- **A coherent exhibit:** entry focuses on Penguins; `all` also frames the
  penguin exhibit while it is the only habitat shown. The walkway ends beside
  its existing footprint, with rock returns rather than empty neighbouring
  bays. Visitor population scales with the shown habitats; foreground walkers
  are omitted in the Underwater view so they do not obscure the glass.
- **Progression ends at Penguin Paradise:** only milestones 1–2 appear.
  Milestone 2 grants its fourth penguin without opening Seal Cove or adding a
  seal. Completion reads “More coming soon! / つづきは もうすぐ！” instead of
  requesting a seal action. Later milestones remain implemented and saved
  later milestones are never reduced. The pre-existing save decoder's missing
  habitat repair is retained; any reconstructed empty hidden tank is stored
  immediately on preview entry.
- **Flashing cause and source fix:** the land shelf top and the 25 mm thin
  ground-cover box both ended at **y = 2.350 m: 0 mm separation** across almost
  the whole shelf. Rock cylinders and their thin snow cylinders also shared
  exact top planes on resting ledges and ice floes. These duplicated opaque
  faces fought for depth during the arrival sweep. Removed the duplicate
  shelf cover and made the rock/ice cylinders open at their snow-covered tops,
  retaining one surface at each authored movement height. Cliff drapes already
  clear rock by 18 mm vertically and 12 mm at their rims; floor relief tops
  clear the floor by 25–61 mm. Water layers retain explicit transparent order
  with depthWrite disabled; glass stands 170 mm ahead of the pool end. No
  global depth offset or CameraRig change was needed. The camera retains its
  0.1 m near / 120 m far planes throughout the reveal; exhibit surfaces remain
  well inside that range.
- **Feeding:** the station starts empty. A successful Feed replenishes a small
  silver-blue fish pile, drawn in one instanced call separately from the tray.
  Penguins notice it, use checked land routes and valid shore/ramp exits from
  water, stand at distinct clear spots, lean and peck, consume individual fish,
  then resume normal behaviour. The ITHappy head offsets layer over idle; the
  procedural fallback also leans. Refeeding replenishes the pile; removing the
  station clears the pending meal. With no station the existing feeding fallback
  remains. Food, coin and reward rules still run once through the existing flow.
- **Evidence:** production-preview captures at 1366×768 and 1024×768 live in
  `.tmp/coast-review/final/`, with default/Penguins/Underwater views, a 150 ms
  arrival sequence and 700 ms feeding sequences. The review script retains
  `--ledges` for the previous optional natural ledge/floe review. Unit coverage
  includes hidden-save round trips, frozen care/Rush/judge state, filtered
  questions, widening the switch, station trips/bites and motion invariants.
- **Measured rendering (1366×768, production SwiftShader, `__at.state().perf`):**
  fresh baseline All 74 calls / 26,301 triangles → single-exhibit All 19 / 12,167
  (default Penguins entry 20 / 12,179); Penguins 36 / 16,651 → 19 / 12,167;
  Underwater 13 / 11,143 → 12 / 10,261. Pose/splash visibility affects snapshots.
  The pile is exactly one InstancedMesh draw: review data records 0 → 12 → 11
  → 0 fish alongside the actual eating poses. Real Chromebook fps remains
  unmeasured; the review clock deliberately advances at 100 ms steps.
- **Validation:** `npm run typecheck` and `npm run build` pass. Final `npm test`
  result is 716/726 passing, including all coast rules, motion and runtime
  tests. One existing release-preview assertion still expects every habitat
  unstored; updating that assertion is outside the requested file allowlist.
  Nine unchanged marine/fish simulation tests hit their 5 s timeouts. No E2E
  suite was run; the production review script completed without browser errors
  at both resolutions.
- **Rejected:** deleting seal/otter data would lose existing saves; leaving
  empty bays beside Penguin Coast would make the exhibit incoherent. Teleports
  to the station would bypass safe shore routes; permanently modelled fish
  would not communicate replenishment and consumption.

## 2026-11-11 — Lagoon framing, articulated mouths and coordinated feeding

- **Overview:** the Lagoon shot now looks down into the water from (0, 23, 30)
  toward (0, -1, 1). The breakwater sits near the top, dolphins occupy more of
  the screen, and the boardwalk remains visible below them. Other viewpoints
  and counting retain their shots; the first-visit reveal smoothly ends at
  this framing. Narrow screens retain the existing aspect compensation.
- **Mouth:** dolphin lower-rostrum triangles have a jaw PART, rotated about
  the mouth corner by a per-animal shader uniform (about 23 degrees open).
  Two dark interior surfaces share the merged geometry and disappear when
  closed. Rest vertices, normals and skin coordinates are preserved; each
  dolphin remains one mesh and one draw call. Orca and beluga geometry stays
  byte-identical, guarded by attribute snapshots; new shader paths are
  dolphin-only.
- **Feed:** idle → gathering → ready → throwing → catching → finished. The
  keeper prepares and waits while dolphins approach separate surface slots
  facing the keeper, including an adjacent mother/calf pair. Each ready
  dolphin gets one fish (smaller for Mimi) on a short ballistic arc to its
  predicted mouth. Head lift and jaw opening lead contact; contact hides the
  fish, followed by closing, a swallow bob and a happy flipper reaction.
  Dolphins then resume their normal swimming. Feed keeps its existing care
  gain, cooldown and progression; repeated taps during a sequence do nothing.
  Leaving the lagoon cancels transient fish, attractions and mouth poses.
- **Timeout:** gathering is bounded at nine seconds. Proceed with whichever
  dolphins are ready; if none are ready, toss one fish onto reachable water
  beside the pontoon and attract the pod there at the surface. No arrival or
  catch animation can leave the sequence waiting indefinitely.
- **Rejected:** a separate skinned dolphin model adds draw calls and an asset
  pipeline; throwing immediately sends fish to dolphins still far away.
  Release locks, saves, questions, Look! moments, milestones, toys and rare
  spontaneous leaps retain their existing rules.

## 2026-11-11 — Navigation, hub, tricks and small fish (plan review and build)

Owner's plan "Navigation, Grand Hub, Penguin Coast and Dolphin Lagoon
improvements", reviewed by Claude; built by Codex (hub, coast, lagoon
feeding) and Claude (navigation, tricks, fish; Codex hit its usage limit).

- **Side arrows of the branching areas** (`AREA_LINKS` in `data/rooms.ts`):
  Shark Tunnel → Grand Hub; Penguin Coast ← Grand Hub / → Dolphin Lagoon;
  Dolphin Lagoon ← Penguin Coast / → Grand Ocean Sanctuary (tour order
  Atrium → Tunnel → Hub → Coast → Lagoon → Sanctuary). An arrow travels
  through the same entry as the matching doorway (`arrowTravel` →
  `travelTo` / `tapCoastDoor` / `tapOutdoorDoor`), so `canTravel`, release
  locks, previews, first-visit reveals and the coast offer all apply. A
  release-locked neighbour is still shown (so the tour reads) but greyed with
  a lock and もうすぐ オープン; a tap only says "Coming soon!". An area not
  yet open for the player (no hub yet) shows no arrow. Hidden while walking
  the tunnel. The hub keeps its doorways and gets no arrows.
  Placement: the Shark Tunnel's right arrow and the coast's left arrow sit
  low (bottom 124 px) because those areas have viewpoint buttons at mid-edge.
  Rejected: neighbours by ROOMS index (the wings branch); arrows that open
  locked areas in a preview's neighbours (a preview opens one area only).
- **Grand Hub window:** one continuous curved opening (no central pier) cut
  through the rotunda wall, with a sill, head and jambs; behind it opaque
  curved cards (sky, sea, headland, lighthouse, boats) and three alpha-tested
  cloud layers scrolling at different speeds (UV offset in one useFrame).
  Rejected: a painted window on the wall (reads as a picture).
- **Grand Hub doorways:** real openings in the wall with jambs, lintel,
  threshold and a short L-shaped corridor per destination (floor, walls,
  ceiling trim, lights, themed colours); the corridor is drawn only through
  its own doorway (fragment portal clip), so its bend never shows outside
  the rotunda. Closed destinations (release-locked outside a preview, the
  tunnel before it is bought) get door leaves plus the existing lock, rope
  and COMING SOON ribbon (`hubDoorOpen` is the same rule as travel).
  Visitors leave through open doorways only, file through the opening, walk
  round the bend out of sight and are removed there; arrivals start round
  the bend. Draw calls are unchanged in practice (the count follows the
  number of visitors: 48–86 with the new hub, 72–92 before, same save).
  Rejected: rendering the real destination through each door.
- **Penguin-only coast:** with one habitat the "All" view is the same
  picture as "Penguins", so only Penguins / Underwater are offered (the
  "All" button returns automatically if habitats are shown again).
- **Dolphin tricks** (`pod.ts`, only with `PodOptions.tricks`, so orcas and
  belugas are unchanged): a run-up (`charge`: a little deeper, then a sprint
  up through the surface) and one of five figures — high jump (≈2 m), arcing
  leap, forward flip, back flip, twisting spin; a calf only hops beside its
  mother; a close partner sometimes jumps in sync. Somersaults and twists
  are whole turns finished just before a nose-first re-entry (splash). The
  run-up heads down the most open lane; the whole flight (flukes behind the
  take-off included) must be over open water and clear of the footbridge,
  sea gate, pontoon and deck (`lagoonAirClear`), else the dolphin just
  breathes. The old rare surfacing leap now passes the same air check.
  Rhythm: one spontaneous trick every 13–22 s pod-wide (seeded), never during
  feeding or a question about the dolphins; tests hold 4–7 leaps a minute at
  most and no gap over 75 s. Jumps count as the existing "A jump!" Look!
  sight, whose bubble now floats above the arc. Ball passes and ring passes
  are not new sights (no new English); they feed the Play need.
- **Ball play:** a dolphin's snout nudges the floating ball (only when the
  ball is on the water and at the rostrum tip); the ball flies a ballistic
  lob (0.7–1.25 s) to just ahead of a partner, who swims to where it comes
  down and returns it; a quarter of passes miss, the ball lands with a small
  bounce, drifts and is fetched. It is never carried, never hovers and stays
  in the water (wide passes are pulled toward open water).
- **Bubble ring:** the bubble-curtain toy is now an upright ring of 46
  animated bubbles (one instanced draw) in front of the underwater gallery
  window (x 9, z 3, 2.6 m deep), its opening along a clear diagonal lane.
  Dolphins line up (far point, near point on the axis) and swim straight
  through; a pass counts only when the body centre crosses the ring's plane
  inside the inner radius (minus the body radius) with the nose along the
  axis, then a burst of bubbles. A second dolphin often follows.
- **Small fish** (`scene/marine/smallFish.ts`): five procedural shapes
  (sardine, snapper, chromis, tang, wrasse; ~150–400 triangles) with tapered
  bodies, forked / crescent / round tails, dorsal, anal and pectoral fins
  and eyes with a pale ring; countershading and accent fins in the shader;
  the tail beat is a vertex bend. One instanced draw per kind: the hub tank
  is a small reef (tangs, chromis, wrasse, snappers, a few sardines; 5
  draws), the lagoon/sanctuary school is silver sardines with a few grey
  snappers (2 draws), each fish facing its real direction of travel. The
  main aquarium's English-task fish (`models/fish.ts`) are unchanged.
  Rejected: reusing the task fish (heavier, tied to English tasks);
  imported fish assets (style clash).

## 2026-11-12 — Save safety, one arrow layout, hub reef, Lagoon deck, bigger Penguin Coast

- **Save: quarantine, never delete.** Records the decoder rejects go into
  `model.quarantine` (≤200 entries / 512 KiB) inside the save instead of
  being dropped, so an autosave can never shrink a save. A rejected record
  that other records depend on blocks loading with a recovery prompt instead.
  Why: a player lost bought optional tanks on another PC; one real
  silent-loss path was found (bought-but-unplaced tanks dropped when every
  pad was full). Rejected: silent repair on load.
- **Save backups.** A 5-entry ring (`at.save.backups.v1`); a last-known-good
  copy (`at.save.lastgood.v1`) updated only at session start from a cleanly
  decoded save, never by autosave; up to 3 pinned pre-repair copies
  (`at.save.prerepair.v1`). Rotation never evicts last-known-good or pinned
  copies. New Game backs up first. Previews never write.
- **Save Recovery** is a teacher-facing screen (Settings and the title
  screen, small issue badge). Export is `{exportedAt, key, raw}` with the
  exact raw text; restore and import replace one complete snapshot, never
  merge.
- **Navigation: one arrow layout everywhere.** Arrows sit at the midpoint of
  each side edge at one fixed size (`--room-nav-width`) in every room; the
  per-room arrow overrides are removed. Other controls (viewpoints, care
  buttons, Explore Tunnel) move instead of the arrows. Goal and request
  panels cap their height and scroll above the arrow lane. Why: arrows
  jumped between rooms and overlapped HUD cards. Rejected: per-room tuning.
- **Arrows are icon-only below 1024 px.** The destination name stays in the
  markup (visually hidden) for screen readers. Why: the labelled arrow is
  about 210 px wide; below 1024 px it covers the scene and collides with the
  goals card, and a slim fixed width is what lets every room share one
  layout. The classroom target (1366×768 Chromebooks) keeps the names.
  Accepted cost: on narrow fallback screens children lose the English room
  name on the arrow. Alternatives offered and not chosen yet: a short label
  under the icon, the name on tap, a 900 px cut-off.
- **Short screens (height < 700 px) also get icon-only arrows**, and the
  room-view visitor request card stands just right of the arrow lane at its
  full height. Why: at 1024×600 the card was squeezed into a 176 px scroll
  box above the arrow, so its speaker and close buttons needed scrolling
  (`requests.spec` 1024×600 caught it). Rejected: moving the arrow down when
  a request shows (the old per-state override the one-layout rule removed).
- **Grand Hub reef tank.** Layered live-rock ridge with caves, corals grown
  from the rock (staghorn, plates, brain, solid fans), anemones, soft corals,
  gravel, shells and seagrass on the sand, merged into one geometry. Fish
  roam collision-checked curves around the rock volumes. Water is a light
  aqua tint (#8fe0ee at 0.13, surface #b8f0f8 at 0.2): the previous strong
  blue hid the colours and a near-invisible tint made the tank read as an
  empty glass case. Rejected: circular fish orbits; floating standalone
  decor.
- **Lagoon deck.** Overlapping surfaces are removed geometrically (no depth
  offsets); the stairs are rebuilt with stringers, posts and railings; the
  DOLPHIN LAGOON / UNDERWATER GALLERY signs are removed.
- **Penguin Coast enlarged.** The extra space goes into deep open water
  (rejected: uniform scaling); swim orientation comes from the GLB's real
  axes (rejected: per-direction offsets); lightweight steering keeps
  penguins apart (no physics engine). Ramps are natural sloped rock-and-ice
  ramps whose footprints match the visible geometry; opposing ramp traffic
  yields at a clear spot. The underwater terrain is rounded boulders,
  shelves and wall ledges (no floor-standing crystal shards); the island has
  a tapering rocky base. The Underwater view has no structural bar across
  the middle. The shore is deeper, with a clear route from the back cliff
  (future staff door) to the feeding station.

## 2026-11-13 — Owner decisions after the save-safety release

- **Small-screen arrows get a short label under the icon** (chosen by the
  owner from the options offered on 2026-11-12). Wherever arrows are
  icon-only today (below 1024 px wide or 700 px tall), a short English room
  name sits under the icon, keeping the one fixed arrow width. Rejected:
  icon-only (children lose the English room name); name on tap.
- **Penguin Coast shore ramps are accepted as they are.** The owner judged
  them fine; no reframing or re-shaping planned.
- **Chromebook frame rates are accepted.** The owner reports the newer areas
  run fine on the classroom Chromebooks; no performance pass planned.
- **Coastal & Polar Zone, Dolphin Lagoon and Grand Ocean Sanctuary stay
  release-locked.** No unlock rule or price is to be designed for now.
