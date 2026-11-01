# Aquarium Tycoon — Expansion Roadmap

**Planning date:** 2026-11-01  
**Status:** Proposed direction; **not implemented** unless explicitly marked as existing.  
**Purpose:** Preserve the vision for growing the current small indoor aquarium into a much larger, varied public aquarium and, ultimately, an expansive outdoor marine complex. This is a design guide, **not** a locked level-by-level schedule or a promise that every species or feature will be implemented.

## North star

The game should grow from the student's **first clownfish** into a thriving aquarium with dramatically different exhibits, animal behaviors, and visitor experiences. The visual and gameplay finale should be an **enormous outdoor coastal marine complex**, with dolphin habitats and a separate, much larger orca sanctuary. **The Coral Reef Atrium (built 2026-11-01) is the newest room, not the final planned attraction.**

Maintain the original audience: Japanese Grade 3 beginner EFL students on touch Chromebooks. New English tasks should fit naturally into aquarium management, remain understandable without reliable audio/STT, and use concise Japanese assistance as appropriate.

## Current baseline (implemented)

- **First Hall:** starter fish, care, decorations, visitors and small tanks.
- **Ocean Hall:** bigger tanks, sea turtle, additional animals, upgrades.
- **Jellyfish Gallery:** third room, glowing displays, specialized tank types.
- **Coral Reef Atrium (2026-11-01):** fourth, taller sunlit room with a freestanding giant reef habitat, coral decorations, parrotfish and (cleaner) shrimp, and two open pads for secondary exhibits.
- Existing special tanks: hexagonal, panoramic, jellyfish cylinder, rocky cave.
- Existing expansion animals include angelfish, goby, chromis school, moray eel, octopus, crab, stingray and distinct jellyfish species.
- **Animals and visitors (2026-11-01):** head-led moray eel that really enters its den, octopus that crawls on eight independent arms, visitors resting on different benches, and species-appropriate food with one-tap feeding (no food chooser, by design: see `DESIGN_DECISIONS.md`).
- The four existing rooms are declared in `src/game/data/rooms.ts` (pads may now carry their own layout) and still connect in a straight line; future large areas should not be forced into an endless row of identical rooms.

See `CURRENT_STATE.md` for actual implemented/tested status and `DESIGN_DECISIONS.md` for established design decisions. Do not mistake this roadmap for completed work.

## Immediate polish and fixes — done 2026-11-01 (kept for reference)

### 1. Crab sinks into the sand

**Observed issue:** the crab's body/legs appear partially buried. Its `walk` behavior uses ground positions, but rendered sand includes raised dunes. Inspect the relationship among `src/game/logic/behavior.ts`, `logic/swim.ts`, `logic/tankLayout.ts`, `scene/models/animals.ts` and `scene/Animals.tsx`.

**Desired result:**
- Crab's underside is above the actual *rendered* sand surface; legs touch it rather than sinking or floating, including on dune slopes.
- Crab walks convincingly sideways, with alternating leg motion and separate claw animation.
- Handle the model's feet/bounds and terrain correctly rather than adding a universal arbitrary Y offset.
- Check octopus, goby and any future bottom dwellers for the same grounding issue.
- Validate visually in every compatible tank, especially the cave tank.

### 2. Tap an animal's shop picture to hear its English name

- In Fish and Animals shops, tapping an animal **picture** plays its English name using the existing speech/TTS infrastructure and gives a brief visual name label.
- This is a **preview/listening action**, not a purchase. Keep it separate from the established English ordering flow (`What color?`, `What do you want?`, etc.).
- For a sea turtle, say **"turtle"** or **"sea turtle"** consistently with the instructional vocabulary; for the octopus, say **"octopus"**. Use each animal's canonical student-facing name.
- Replay on repeated taps; don't stack or overlap speech excessively.
- With sound muted or unavailable, the temporary English name must still be visible. Support touch and mouse, use accessible controls, and don't require STT.
- Consider whether revealing the species or color label is appropriate for that specific assessed task; **do not automatically reveal a tested answer as a permanent shop label**. The preview should provide useful optional listening practice without changing the buying logic.
- No coins deducted for preview taps and no accidental orders.

### 3. Make other animals as expressive as the turtle

The existing turtle has visible independent flipper motion. Bring that level of character and biological plausibility to other sea creatures, **without turning all animals into identical cartoon fish**:

| Animal | Animation direction |
|---|---|
| Crab | Sideways gait with alternating jointed legs, claw opening/closing, sand contact |
| Octopus | Individually curling arms, crawling, exploring rocks and caves, subtle color change |
| Moray eel | Continuous body undulation, emerging from a den, occasional mouth opening |
| Stingray | Smooth wave along both broad fins, graceful gliding, trailing tail |
| Seahorse | Tiny fluttering fins, upright movement, gently curling tail |
| Jellyfish | More distinct bell pulsation and natural tentacle motion by species |
| Other fish | Distinct silhouettes, tail rhythm, schooling/hiding/grazing where appropriate |

Prefer shared lightweight rig/part animation or targeted shader animation. Keep low draw calls and sensible animation budgets for Chromebooks; avoid expensive skeletons if simpler methods work well. Verify behavior at actual gameplay camera distance, not only in a model viewer.

### 4. Hexagonal tank: unexplained rear upper horizontal bar

**Code finding:** `specialShellGeometry()` in `src/scene/models/tankShell.ts` intentionally draws a rear overhead lamp as a dark horizontal support with a light strip. The user reports it looks like an odd bar.

**Preferred polish:** integrate the light into the hexagonal tank's top rim, or redesign the fixture as a clearly intentional compact luminaire. A straight beam spanning the top rear of a six-sided tank looks out of place. Keep lighting readable and avoid z-fighting, protrusions, and collisions. Inspect in management and close-up views.

## Long-term physical expansion — suggested destinations

These are **distinct types of experiences**, not merely additional copies of the current rectangular tanks. The order below suggests a satisfying increase in spectacle, but **do not enforce fixed linear unlocks, stage numbers, prices or branching rules yet**. Those are separate design decisions.

### A. Coral Reef Atrium — implemented 2026-11-01

**Status:** built (see `DESIGN_DECISIONS.md`, 2026-11-01 entries, and `CURRENT_STATE.md`). Not yet built: parrotfish grazing animation, shrimp cleaning interaction, a reef lighting choice.


**Visual identity:** bright, airy, large panoramic reef, layers of coral, expansive viewing windows.

**Animals:** varied reef fish, schooling species, suitably sized rays and other compatible reef life.

**What changes:** build a genuine multi-species habitat, choose coral and rock formations, design niches and viewing angles, and observe different animals interact with the environment. Compatibility and habitat layout matter more than simply filling tank slots.

**English opportunities:** colors, quantities, likes, simple descriptions, identifying animals; keep controls distinct from assessed words.

### B. Shark Tunnel

**Visual identity:** a huge underwater habitat with visitors walking through a transparent tunnel, water and animals above and beside them.

**Animals:** appropriate shark species and rays with visibly different swimming patterns.

**What changes:** space, tunnel construction, habitat layout, larger-scale visitor movement and immersive viewpoints. Sharks should cruise through a genuinely large volume, not share the ordinary small tank animation.

**English opportunities:** animal names, location words (above/under), simple questions and observation requests.

### C. Coastal & Polar Zone

**Visual identity:** rocky shoreline and cold-water displays with both above-water and underwater viewing.

**Animals:** suitable seals, penguins, sea otters and other compatible species in *separate appropriate habitats*.

**What changes:** land/water split, climbing/resting/swimming, group behaviors, temperature-specific habitat design and viewing areas. The exhibits should not feel like glass boxes with new skins.

**English opportunities:** actions such as swim, dive, eat, sit, jump; simple animal observation tasks.

### D. Outdoor Dolphin Lagoon

**Visual identity:** exiting the indoor aquarium into sunlight, open sky, spacious lagoon-like connected habitats, bridges, underwater windows and observation decks.

**Animals:** dolphins in appropriate social groups.

**What changes:** a much larger scale, surface breathing, diving, social play, enrichment, care teams and habitat planning. The camera should give a memorable reveal of the outdoor setting.

**Gameplay:** focus on observing, caring for and enriching animals, **not forced performance shows**. Do not make the main mechanic endlessly tapping Feed/Clean.

### E. Grand Ocean Sanctuary — proposed ultimate centerpiece

**Visual identity:** an enormous coastal bay or seaside sanctuary with islands/headlands, naturalistic water boundaries, viewing decks and underwater observation areas; it should dwarf the original halls.

**Animals:** orcas as the major aspirational animal; belugas, if included, need **a separate cold-water habitat**, not mixed into an orca tank. Potentially use a rescue/rehabilitation and sanctuary theme rather than a conventional entertainment exhibit.

**What changes:** complex animal social relationships, enrichment, expert staff, environmental management, rescue/research stories and large-scale visitor education. Treat animal welfare and habitat suitability as part of the design. No endless repetitive maintenance grind.

**Presentation:** make the opening of the outdoor complex a big, memorable visual milestone, with an expansive reveal and varied animal motion. Avoid claiming a compact artificial pool realistically represents a suitable orca environment.

## How gameplay should evolve with the aquarium

- **At first:** direct care — buy fish, place decorations, feed, clean, help a visitor.
- **At larger indoor exhibits:** habitat design, animal compatibility, distinct behaviors, visitor sightlines and exhibit customization.
- **At the outdoor complex:** specialist staff, welfare/enrichment programs, research/rescue and meaningful management choices.
- **Across all sizes:** retain English-learning opportunities and approachable child-friendly actions. Bigger should mean different *kinds* of interactions, not merely more chores.
- Gradually delegate routine maintenance to staff or simple automation. Keep the player focused on fun decisions and animal discovery.
- Preserve a creative option to revisit and remodel earlier habitats after later areas open.

## Architecture and performance direction

- The present `ROOMS` design is data-driven but arranged along +x. Before the aquarium becomes a large campus, evaluate **branching wings, a campus overview/map, and distinct outdoor zones**, while retaining simple door-by-door navigation where helpful.
- Support different exhibit families: **classic tank**, **large indoor habitat**, **walk-through tunnel**, **land-and-water environment**, and **outdoor lagoon/sanctuary**. Their care, camera, geometry and animal navigation need not be identical.
- Render the active area in full detail and keep distant/unseen sections lightweight; simulate relevant economy/care across areas without rendering all animals at once.
- Preserve reliable touch input, fixed/easy-to-understand management camera, offline-safe saves, existing animals and coins, and no destructive save migration.
- Use low-poly/procedural geometry, efficient material reuse and controlled draw calls; test on real school Chromebooks, not only desktop/SwiftShader.
- Use a readable world map or wing selector when the number of destinations makes repeated room switching cumbersome; do not add it prematurely.

## Decisions explicitly left open

- Which new wing comes first after Jellyfish Gallery.
- Exact level/unlock sequence, costs, rewards and game duration.
- The final shape of the world map or branching routes.
- Which large animals/habitats are practical and appropriate for the game's scope.
- How elaborate staff management, visitor facilities, and rescue/research systems should become.

**Next design discussion:** decide what makes each future wing *mechanically unique*, then design one expansion at a time. Keep this document updated as ideas become accepted, implemented or rejected; record final decisions in `DESIGN_DECISIONS.md` and implementation status in `CURRENT_STATE.md`.
