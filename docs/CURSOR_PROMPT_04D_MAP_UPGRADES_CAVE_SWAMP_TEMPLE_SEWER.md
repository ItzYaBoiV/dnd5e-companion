# Cursor Agent Prompt — Cave, Swamp, Temple & Sewer Map Upgrades (10+ each)
> **Scope:** `DungeonForgeImpl.jsx`, `dungeonTilePalettes.ts`, `dungeonTileRenderer.ts`, `forgeWallLights.ts`
> **Goal:** Each location type must be thematically immersive, D&D-rules-correct, and readable by a child DM at a glance.

---

# CAVE — 10+ Upgrades

### UPGRADE-CV-01 — Stalactite/stalagmite scatter objects in cave rooms
**Current:** Cave rooms are organic blobs with nothing inside.
**Fix:** In cave rooms (area ≥ 3×3 tiles), scatter 2–8 `STALACTITE` entities (impassable, half-cover from the directions they face). Render as `▲` (stalagmite from floor) or `▽` (stalactite from ceiling) in a gray-brown tone. DM tooltip: "Difficult terrain to move through. Provides half-cover."

---

### UPGRADE-CV-02 — Underground stream / river crossing
**Current:** No water features in caves.
**Fix:** 30% chance per cave to carve a 1–2-tile-wide `T.STREAM` path (similar to swamp water but flowing direction indicated by `→` tiles). Stream tiles:
- Require a DC 10 Athletics check to cross without falling prone
- Flow from a "source" room to an "outlet" on the map edge
- Render as animated blue `≈≈` tiles

---

### UPGRADE-CV-03 — Cave mushroom clusters: 1–3 per map, some edible/poisonous
**Current:** No flora in caves.
**Fix:** Place 1–3 `MUSHROOM_CLUSTER` entities in organic room corners. Each has a randomly assigned property:
- Edible (1d4 HP regained if eaten, one serving)
- Poisonous (DC 12 CON save or 1d6 poison + poisoned condition for 1 hour)
- Glowing (sheds 10 ft dim light — useful for dark caves)
DM tooltip shows the property; player layer shows just the mushroom icon.

---

### UPGRADE-CV-04 — Bioluminescent lighting variant
**Current:** Cave lighting is all-or-nothing.
**Fix:** Add a "Lighting: Bioluminescent" option for cave generation. When enabled:
- Wall tiles adjacent to mushroom clusters shed 10 ft of dim light
- `T.GLOWING_MOSS` tiles appear along corridors (every 5–8 tiles) providing 5 ft dim light
- The map renders with a deep teal ambient glow rather than full darkness

---

### UPGRADE-CV-05 — Underground lake: 1 open water body per large cave
**Current:** No large water features.
**Fix:** The largest room in the cave is 30% likely to become an underground lake: fill its interior with `T.WA` water tiles, leaving only a 1-tile-wide ledge around the edge. DM tooltip: "The water is 40 ft deep. A creature that falls in must make DC 12 Athletics or begin drowning. Something moves beneath the surface..."

---

### UPGRADE-CV-06 — Cave-in rubble: random collapsed passages create obstacles
**Current:** All corridors are fully open.
**Fix:** 1–2 corridors per cave map are partially blocked by `T.RUBBLE` tiles (impassable, 1–3 tiles wide):
- Rubble can be cleared in 1 hour of work (DM note in tooltip)
- OR a DC 15 Athletics check to squeeze through (Disadvantage on attacks for 1 round after)
- Renders as `░░` in a dark gray

---

### UPGRADE-CV-07 — Goblin/Kobold lair: themed version of cave with furniture entities
**Current:** All caves look identical regardless of inhabitant.
**Fix:** Add a "Cave Variant" selector: Natural Cave / Goblin Lair / Kobold Lair / Dragon Cave.
- Goblin Lair: adds crude table/bench entities in large rooms, a cooking pot entity, and bone pile decorations
- Kobold Lair: adds trap entities (per UPGRADE-D-03), a mine cart entity on a 2-tile track, cramped 1-tile-wide passages
- Dragon Cave: adds a hoard pile entity in the deepest room with scaled loot value

---

### UPGRADE-CV-08 — Gas vent tiles in volcanic/volcanic_lair caves
**Current:** No environmental hazard tiles in volcanic cave variant.
**Fix:** In `volcanic_lair` caves (uses cave generator), place 3–5 `GAS_VENT` tiles on floor cells. DM tooltip: "Any creature starting its turn adjacent to the vent must make DC 13 CON save or take 1d6 poison damage." Renders as `♨` in orange.

---

### UPGRADE-CV-09 — Cave entrance with a rope descent indicator
**Current:** Cave entrance looks the same as dungeon entrance.
**Fix:** The cave entrance room always has a `ROPE_DESCENT` entity:
- Renders as a coil of rope icon with an arrow pointing up
- DM tooltip: "DC 10 Athletics to climb down/up. Difficult terrain on the ramp."
- Indicates the party cannot simply walk in — they must descend, adding tension

---

### UPGRADE-CV-010 — Echo effect: rooms label "ECHOES" giving disadvantage on Stealth
**Current:** No acoustic flavor.
**Fix:** 30% of cave rooms are tagged "ECHOING" (shown as a small `))) ` label on DM map).
- Any loud action (shouting, non-silenced combat, metal-on-stone) in this room alerts creatures in all adjacent rooms
- DM tooltip: "Noise travels far. Stealth checks have disadvantage within 2 rooms of any combat here."

---

---

# SWAMP — 10+ Upgrades

### UPGRADE-SW-01 — Quicksand tiles: 1–3 per swamp
**Current:** Swamp only has water and bridges. No deceptive terrain.
**Fix:** Place 1–3 `QUICKSAND` entities on floor tiles near water edges. Quicksand looks identical to normal ground on the player layer. On the DM layer, render with a subtle ✖ pattern.
- A creature that steps on quicksand must make DC 12 STR save or become restrained (can repeat each turn)
- DM tooltip explains the save and escape mechanics

---

### UPGRADE-SW-02 — Fog of war is thicker over water tiles (visibility limited to 2 cells over water)
**Current:** Fog clears uniformly regardless of tile type.
**Fix:** In `expandFogWithPlayerTokenVision`, apply a reduced range (R/2) when the BFS traverses `T.WA` water tiles. This represents mist and murk over the water surface limiting sight.

---

### UPGRADE-SW-03 — Fallen log bridges (breakable)
**Current:** Bridges are permanent and indestructible.
**Fix:** 1–2 bridges per swamp are `LOG_BRIDGE` variants (render as brown `=` instead of gray `=`):
- AC 15, HP 10
- If destroyed, the crossing becomes impassable until a DC 12 Athletics check creates an improvised crossing
- DM can toggle broken/intact

---

### UPGRADE-SW-04 — Hunting blind / hidden camp entity
**Current:** No interactive entities in swamp.
**Fix:** Place 1 `HUNTING_BLIND` entity on an island near the water edge:
- Grants half-cover to creatures inside
- DM tooltip: "A crude hide built from reeds and branches. Contains a bedroll, a week of rations, and a crude map of the swamp."

---

### UPGRADE-SW-05 — Hag hut on the deepest island
**Current:** No special landmark for the deepest point.
**Fix:** The deepest island (furthest from entrance) always has a `HAG_HUT` building entity:
- Interior is one room, 4×4 tiles, with a cauldron and shelf entities
- Cauldron is clickable: "A green potion bubbles inside. What does the party do?"
- Connects to a witch-themed loot table

---

### UPGRADE-SW-06 — Will-o-wisp light effect: random light source that moves each round
**Current:** No moving light sources.
**Fix:** Place 1–2 `WILL_O_WISP` light entities that start at a random water tile. Each time "Next Turn" is pressed, they move 1d4 tiles in a random direction (DM's choice or random). They shed 10 ft dim light but are deceptive:
- DM tooltip: "Following a will-o-wisp leads the party away from the safe path. It cannot be caught by normal means."

---

### UPGRADE-SW-07 — Crocodile/Swamp creature lurk zones in deep water
**Current:** No hidden creature indication.
**Fix:** Deep water tiles (water areas ≥ 3×3 tiles) are marked as `LURK_ZONE` on the DM layer (dim red tint). DM tooltip: "1d4 crocodiles may be lurking. DC 15 Perception to spot them before they attack."

---

### UPGRADE-SW-08 — Disease track: swamp exposure disease mechanic in DM panel
**Current:** No environmental disease tracking.
**Fix:** Add a "Swamp Fever" tracker in the DM panel. After 1 hour of travel in the swamp, each PC makes DC 11 CON save or contracts Swamp Fever (per DMG disease table). The DM tracker shows which PCs have failed and their fever progression.

---

### UPGRADE-SW-09 — Ruins of a sunken structure visible in the deepest water area
**Current:** Water is featureless.
**Fix:** In the largest water area, place 3–5 `RUIN_TILE` entities partially submerged (rendered as broken wall-top tiles in a darker tone). DM tooltip: "The crumbling top of a sunken tower. A DC 14 Athletics check lets a creature dive down to explore (treat as a dungeon entrance)."

---

### UPGRADE-SW-010 — Biting insects: disadvantage on Concentration saves in the swamp
**Current:** No ambient environmental effect.
**Fix:** Add a persistent "Swamp Insects" note that appears in the DM panel when a concentration spell is cast outdoors in the swamp: "Biting insects swarm the caster. DC is raised by 2 for all Concentration saves in this environment." This is a small DM reminder, not an automated mechanic.

---

---

# TEMPLE — 10+ Upgrades

### UPGRADE-TP-01 — Temple has a deity pantheon assignment at generation
**Current:** Temple is a generic rect-scatter dungeon with a purple palette.
**Fix:** At generation, randomly assign one of 8 deity archetypes (Sun, Moon, War, Death, Nature, Knowledge, Trickery, Life) and store it as `temple.deity`. This drives all downstream flavor:
- Tile flavor text uses deity-appropriate language
- Monster spawn recommendations match deity type (Death = undead, War = cultists, Nature = plant-creatures)

---

### UPGRADE-TP-02 — Altar room: the largest room always has an altar entity
**Current:** No mandatory altar placement.
**Fix:** The largest room in the temple is tagged `SANCTUM`. It gets:
- A `ALTAR` entity in the center (impassable 2×1 tile, rendered as `╬`)
- 2 `CANDELABRA` entities flanking it (each provides 10 ft bright light, 20 ft dim)
- DM tooltip: "The altar to [deity]. Profaning it may trigger a divine effect."

---

### UPGRADE-TP-03 — Trapped floor tiles in the sanctum approach corridor
**Current:** No traps auto-placed.
**Fix:** The corridor leading to the sanctum gets 2–3 `GLYPH_OF_WARDING` floor trap tiles (per PHB spell). Render as a barely visible rune mark `ᚱ` on floor tiles (player layer shows nothing; DM layer shows faint orange glyph):
- Trigger: any non-worshipper steps on the glyph
- Effect: DC 13 DEX save or 5d8 damage of deity's type (fire for war god, cold for death god, etc.)

---

### UPGRADE-TP-04 — Pew/bench rows in the main hall
**Current:** The nave/main hall is empty.
**Fix:** The largest room (before the sanctum) is the "nave." Place 4–8 rows of `PEW` entities (2×1 tiles, impassable) in parallel rows facing the sanctum. Pews:
- Provide half-cover when kneeling behind them
- Can be overturned as a bonus action to create difficult terrain (DM note)

---

### UPGRADE-TP-05 — Vestry/sacristy room with priestly equipment loot
**Current:** No thematic loot differentiation.
**Fix:** The room adjacent to the sanctum is tagged `VESTRY`. It gets:
- `WARDROBE` entity: contains ceremonial robes (no AC bonus but disguise potential)
- `CHEST` entity: contains 2d6 gold, incense, holy water (2 vials), and a spell scroll matching the deity's domain

---

### UPGRADE-TP-06 — Bell tower staircase and bell entity
**Current:** No vertical features.
**Fix:** One of the temple's corner rooms is a `BELL_TOWER`:
- Contains a `STAIR_UP` entity
- The top level (mini-map: 3×3 tiles) has a `BELL` entity
- Ringing the bell: DC 12 STR check; alerts all creatures within 300 ft (1/4 mile), can be heard as far as the nearest town

---

### UPGRADE-TP-07 — Confession booth or prayer cell: 1×2 tiny room with a single occupant
**Current:** No tiny rooms.
**Fix:** 1–2 `PRAYER_CELL` rooms (1×2 tiles, curtain-door) are carved into corridor walls. Each contains a kneeling NPC entity (cultist, monk, or prisoner) who may:
- Attack the party if interrupted
- Provide information if the party is disguised as worshippers
- Ignore the party entirely

---

### UPGRADE-TP-08 — Holy water font at the temple entrance
**Current:** Nothing marks the entrance as sacred.
**Fix:** At the temple entrance room, place a `FONT` entity (1×1 tile, blue):
- Clicking the font: "This holy water font provides 1 vial of holy water per PC (recharges at dawn)"
- Undead that step within 5 ft of the font take 1d6 radiant damage (DM note)

---

### UPGRADE-TP-09 — Desecrated vs. consecrated variant
**Current:** All temples look active and maintained.
**Fix:** Add a "Temple Condition" selector: Active (maintained) / Abandoned / Desecrated.
- Active: Clean tile colors, NPCs present, holy water font works
- Abandoned: Cracked walls (rubble entities), dead candles, dust overlay
- Desecrated: Dark palette shift, demonic glyphs on walls, undead/demons as recommended spawn, holy water font is polluted (poisons instead of heals)

---

### UPGRADE-TP-010 — Deity symbol engraved on the temple floor of the nave
**Current:** Floor has no markings.
**Fix:** In the center of the nave floor, place a large `SYMBOL` tile (5×5 region rendered as a faint glyph pattern on the floor). The symbol matches the deity's domain visually. DM tooltip: "Standing in the center of this symbol while praying grants Inspiration (DM's discretion)."

---

---

# SEWER — 10+ Upgrades

### UPGRADE-SE-01 — Main channel + side-channel hierarchy (T-junction layout)
**Current:** Sewer corridors are randomly placed without a logical drainage hierarchy.
**Fix:** Enforce a hierarchical layout:
- One `MAIN_CHANNEL` (2-tile-wide water corridor) runs north-south or east-west across the full map
- Side rooms connect via `SIDE_CHANNEL` (1-tile-wide) perpendicular branches
- The flow direction is indicated by subtle arrow marks `→` on the water tile tooltip: "Water flows toward the outfall (south edge)"

---

### UPGRADE-SE-02 — Sluice gates: DM-controllable water level changes
**Current:** Water level is static.
**Fix:** Place 1–2 `SLUICE_GATE` entities in the main channel. DM toggle: Open / Closed.
- Open: water flows normally, main channel is waist-deep (Difficult Terrain for Small/Medium creatures)
- Closed: water level rises over 1 round — all downstream tiles flood (+2-tile flood radius per turn until draining)
- Flooded tiles: creatures in them must swim (DC 10 Athletics per turn to avoid being swept)

---

### UPGRADE-SE-03 — Poison cloud zones near waste chambers
**Current:** No hazardous gas areas.
**Fix:** 1–2 rooms tagged `WASTE_CHAMBER` (smallest rooms) emit a `POISON_CLOUD` that fills the room:
- Any creature entering must make DC 12 CON save or take 1d4 poison damage and gain the Poisoned condition until they leave and take a breath of fresh air
- Render the room with a faint green fog overlay on the DM map

---

### UPGRADE-SE-04 — Rat swarm entity auto-placed in junction rooms
**Current:** No thematic enemy placement.
**Fix:** In each junction room (rooms where 3+ corridors meet), auto-place a `RAT_SWARM` entity (CR 1/4 stat block shown in tooltip). The rat swarm:
- Does not attack unless the party lingers more than 2 rounds (DM trigger note)
- Can be driven off with fire or noise (DC 8 Animal Handling)

---

### UPGRADE-SE-05 — Ladder/manhole tiles: 2–3 exits to the surface
**Current:** No way out of the sewer except the entrance.
**Fix:** Place 2–3 `MANHOLE` entities on the map (placed near map edges or specific junction rooms). DM tooltip: "Iron rungs lead up to a street-level manhole cover in [District Name]. DC 10 STR check to push it open from below."

---

### UPGRADE-SE-06 — Sewer gang hideout: 1 room tagged as "Thieves' Den"
**Current:** No faction presence.
**Fix:** The largest room away from the entrance is tagged `THIEVES_DEN` with:
- A `TABLE` and `CRATE` entity (can be used as cover)
- A `WANTED_POSTER` on the wall (flavor: "The city guard is looking for someone important")
- 2–4 `BANDIT` entity tokens
- A locked chest (DC 14 Thieves' Tools) with 3d10 gp and a coded note

---

### UPGRADE-SE-07 — Slippery floor tiles near water channels
**Current:** All floor tiles have identical movement costs.
**Fix:** Tiles adjacent to `T.WA` water channels are tagged as `SLIPPERY`:
- Entering a slippery tile: DC 12 DEX save or fall prone
- Render as slightly darker floor with a `∿` waterline mark at the edge

---

### UPGRADE-SE-08 — Smell intensity: 5 tiles from sewage = disadvantage on Perception (smell-based)
**Current:** No sensory environmental effect.
**Fix:** Add a "Smell Zone" indicator in the DM panel whenever a PC token is within 5 tiles of a `T.WA` tile. DM sees a small banner: "Perception (smell-based) at disadvantage. Creatures with Keen Smell are immune to this penalty."

---

### UPGRADE-SE-09 — Escape route: marked "Outfall" on map edge
**Current:** No landmark for navigating out.
**Fix:** The `MAIN_CHANNEL` terminates at one map edge with an `OUTFALL` entity:
- A 2-tile-wide opening that leads outside the city (sewer grate)
- DC 14 STR to break the grate open; DC 16 to open quietly
- DM tooltip: "The outfall empties into the river 100 ft below the city wall. A creature pushed through the opening takes 10d6 fall damage OR makes DC 14 Athletics to catch a rope."

---

### UPGRADE-SE-010 — Underground black market: rare variant room
**Current:** No unique special room type.
**Fix:** 20% chance per sewer map for a `BLACK_MARKET` room to generate in the thieves' den area:
- Contains 4–6 `MERCHANT_STALL` mini-entities each with a randomly generated illegal good (poisons, stolen art, forbidden scrolls)
- Prices are 50% above PHB value
- DM toggle: "Market is open / abandoned / hostile"
