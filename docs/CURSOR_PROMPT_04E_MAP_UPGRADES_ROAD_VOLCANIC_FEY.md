# Cursor Agent Prompt — Road (Wilderness), Volcanic Lair & Fey Forest Map Upgrades (10+ each)
> **Scope:** `DungeonForgeImpl.jsx`, `dungeonTilePalettes.ts`, `dungeonTileRenderer.ts`, `forgeWallLights.ts`
> **Goal:** These three location types currently share the same cave generator with different palettes. They need distinct generation logic AND at least 10 meaningful D&D upgrades each.

---

# ROAD (Wilderness) — 10+ Upgrades

### UPGRADE-RD-01 — Road type selector: Dirt Trail / King's Highway / Mountain Pass
**Current:** One road type — generic linear spine.
**Fix:** Add a road-type selector with 3 variants that affect generation:
- **Dirt Trail**: 1-tile-wide path, winding (non-straight), flanked by trees/brush scatter
- **King's Highway**: 2-tile-wide cobbled road (straight or gently curved), with guard posts and inns every 12 tiles
- **Mountain Pass**: narrow (1-tile wide) with cliff walls on both sides, switchbacks, and rope-bridge crossings

---

### UPGRADE-RD-02 — Ambush site markers: 2–3 per map at constriction points
**Current:** No tactical terrain markers.
**Fix:** At points where the road narrows (1 tile wide, flanked by walls/trees), auto-place an `AMBUSH_SITE` marker on the DM map:
- Rendered as an eye icon `👁` on the DM layer only
- Tooltip: "This choke point offers half-cover from flanking terrain. Attackers here have Advantage on Stealth checks before the party approaches."
- Ideal encounter trigger point — clicking it asks the DM "Trigger ambush here?"

---

### UPGRADE-RD-03 — Waypoint structures: milestone, shrine, inn, and guard post
**Current:** Road has roadside buildings but no typed purpose.
**Fix:** Place 3–5 distinct roadside structures:
- **Milestone** (every 6 tiles): carved stone marker with distance to nearest town. Click to name the towns.
- **Wayside Shrine**: small 2×2 structure. Praying: DC 5 Religion for Inspiration (DM's choice)
- **Roadside Inn**: 4×5 building with stable, bar, and 2 rooms. NPC innkeeper.
- **Guard Post**: small 2×3 watchtower with 2 guard entities

---

### UPGRADE-RD-04 — Terrain flanking the road: trees, boulders, cliffs
**Current:** Road is flanked by featureless empty tiles.
**Fix:** Based on road type:
- Dirt Trail: scatter `TREE` entities (impassable, half-cover) on both sides, density 40%
- King's Highway: alternating `TREE` and `BOULDER` scatter, density 20%
- Mountain Pass: `CLIFF_WALL` tiles on both sides (impassable, full cover), with occasional `LEDGE` tiles above (elevated position) 
Tree entities: render as `♠` in green. Boulders: `◙` in gray. Cliffs: `▉▉` in dark gray.

---

### UPGRADE-RD-05 — River crossing: ford or bridge at midpoint
**Current:** No water crossing on the road.
**Fix:** At the road midpoint, 60% chance of a water crossing:
- **Ford**: a 3-tile-wide `T.STREAM` crossing. DC 10 Athletics to cross without being slowed by the current.
- **Bridge**: a 2-tile-wide `T.BRIDGE` spanning the river, with `BRIDGE_TROLLEY` (rope guide) entity at each end.
Both are highlighted on the DM map as "Possible Ambush / Toll Point."

---

### UPGRADE-RD-06 — Random encounter spawn zones: marked with encounter rating
**Current:** No encounter rating on map areas.
**Fix:** Color-code the road sections on the DM map:
- Green = Safe (near town, guard post)
- Yellow = Uncommon encounters (1 in 6 chance every 30 min)
- Red = Dangerous (1 in 4 chance every 15 min)
DM can click any zone to trigger a random encounter draw from a biome-appropriate table.

---

### UPGRADE-RD-07 — Fallen tree / rock slide obstacle: 1–2 per map
**Current:** No road blockages.
**Fix:** 1–2 `OBSTACLE` entities on the road:
- **Fallen Tree**: 2 tiles wide across the road. DC 12 Athletics to push aside (10 minutes) or DC 14 to squeeze through (Difficult Terrain).
- **Rock Slide Debris**: 3-tile debris field. Difficult Terrain, chance of still-rolling rocks: DC 12 DEX save or 1d6 bludgeoning.

---

### UPGRADE-RD-08 — Bandit camp visible from the road as a side-path
**Current:** No off-road locations.
**Fix:** At one ambush site, a 1-tile-wide `SIDE_PATH` branches off the main road (winding, 6–8 tiles) leading to a `BANDIT_CAMP` clearing:
- 3×4 tile open area
- `CAMPFIRE` entity (10 ft bright light, 20 ft dim), `TENT` entities, `WANTED_POSTER` on a tree
- 3–6 bandit entities
- Loot: 2d10 gp + stolen goods table

---

### UPGRADE-RD-09 — Weather overlay for wilderness travel
**Current:** No weather in road maps.
**Fix:** Same as UPGRADE-GY-08 — Day/Rain/Storm toggle:
- Storm adds disadvantage on all ranged weapon attacks (wind)
- Lightning storm: 1% chance per 10-minute segment that lightning strikes near the party (DEX DC 13, 4d10 lightning)
- Show animated rain/storm canvas overlay

---

### UPGRADE-RD-010 — Travel time estimate in the DM panel
**Current:** No travel time information.
**Fix:** The DM panel shows:
- Total road length in tiles and feet (1 tile = 5 ft)
- Normal pace travel time: `[length / 300 ft per hour] hours`
- Fast pace: `[length / 400 ft per hour] hours` (no Passive Perception bonus)
- Slow pace: `[length / 200 ft per hour] hours` (+5 Passive Perception)
These numbers follow PHB travel pace rules (p.181).

---

---

# VOLCANIC LAIR — 10+ Upgrades

### UPGRADE-VL-01 — Lava river: flowing lava channel through the map (not just floor tiles)
**Current:** Volcanic lair uses the cave generator with a red/orange palette only. No actual lava mechanics.
**Fix:** Carve a 1–2-tile-wide `T.LAVA` channel from a "lava source" room to a "lava sink" room. Lava tiles:
- Shed 20 ft bright light, 40 ft dim light (per PHB fire giant lair rules)
- Entering lava: 10d10 fire damage immediately; 5d10 on subsequent turns if submerged
- Impassable without a Fly speed or a lava-crossing structure

---

### UPGRADE-VL-02 — Obsidian pillar scatter in large rooms
**Current:** Large volcanic rooms are empty.
**Fix:** Place `OBSIDIAN_PILLAR` entities (2×2 tile footprint) in rooms > 6×6 tiles:
- Impassable, full cover from one direction
- Render as black `█▐` with a glowing red edge tone
- DM tooltip: "Obsidian is razor-sharp. Moving through a pillar's space (pushed/shoved) deals 1d4 slashing."

---

### UPGRADE-VL-03 — Fire geyser traps on floor tiles
**Current:** No environmental hazards beyond lava.
**Fix:** Place 3–5 `FIRE_GEYSER` entities on floor tiles near lava channels:
- Trigger: once per 1d4 rounds, auto-activates
- DEX save DC 14 or 3d8 fire damage and shoved 5 ft away from the geyser
- DM "Activate Geyser" button triggers the roll prompt
- Rendered as a floor crack with an orange `⇑` when active

---

### UPGRADE-VL-04 — Heat exhaustion mechanic
**Current:** No heat damage from environment.
**Fix:** Add a "Heat Exhaustion" tracker in the DM panel for volcanic lair sessions. After 1 hour without cold resistance or an endure elements effect:
- CON save DC 10 or gain 1 level of exhaustion (per DMG extreme heat rules, p.110)
- DM panel shows a 10-minute timer and prompts the roll at interval

---

### UPGRADE-VL-05 — Forge room: fire giant or duergar forge entity
**Current:** No thematic crafting area.
**Fix:** The deepest large room is tagged `FORGE_ROOM`:
- `FORGE` entity (2×1 tile): a massive anvil and bellows. Can be used to craft weapons with fire-attunement (DM-ruled, 8 hours work).
- `METAL_RACK` entity: 1d4 ingots of mithral or adamantine
- `LAVA_CHANNEL_MINI` tile: 1-tile-wide lava run used as the forge heat source
- 2–4 enemy entities (fire giants, salamanders, or duergar based on DM choice)

---

### UPGRADE-VL-06 — Volcanic tremors: random room collapses during combat
**Current:** Static map — no dynamic events.
**Fix:** Add a "Volcanic Activity" slider: Dormant / Active / Erupting.
- **Active**: every 2 combat rounds, roll d6. On 1: one random room gets `FALLING_ROCKS` event — DEX DC 13 for all creatures in the room or 2d6 bludgeoning.
- **Erupting**: every round, one random corridor section is blocked by a new `RUBBLE` tile.
DM gets a "Trigger Tremor" manual button to activate this at will.

---

### UPGRADE-VL-07 — Salamander/fire creature lair pools
**Current:** No thematic creature habitat.
**Fix:** 1–2 rooms are tagged `SALAMANDER_POOL`:
- `LAVA_POOL` tiles fill the room interior (impassable, like UPGRADE-VL-01)
- `SALAMANDER` entities (3–4) are initially submerged (hidden on player layer, shown on DM layer)
- DM tooltip: "Salamanders surface and attack when the party enters within 10 ft of the pool edge."

---

### UPGRADE-VL-08 — Prisoner cage hanging over lava
**Current:** No dramatic set pieces.
**Fix:** In the forge room or a chamber adjacent to lava, place a `HANGING_CAGE` entity:
- Suspended over a lava pit by an iron chain
- Chain has AC 19, HP 5 — if destroyed, cage falls (occupant takes 10d10 fire damage)
- DM can set cage contents: empty / NPC prisoner / trapped monster
- Chain-lowering mechanism: `WINCH` entity in an adjacent room (DC 10 STR to operate)

---

### UPGRADE-VL-09 — Treasure vault buried under cooled lava
**Current:** Treasure generation doesn't account for volcanic lair themes.
**Fix:** The boss room's loot is buried under a `COOLED_LAVA` tile (gray floor with a crack pattern). DM tooltip: "The treasure is encased in hardened lava. Requires a pick (1 hour) or a Disintegrate spell to reveal. Contains: [scaled treasure]."

---

### UPGRADE-VL-010 — Escape route: eruption timer creates urgency
**Current:** No time-pressure mechanic.
**Fix:** Add an optional "Eruption Timer" in the DM panel (countdown: 10/15/20 rounds, DM configurable). When enabled:
- A visible round counter appears on all screens (DM + player TV)
- At 0: the map exits flood with lava — all `T.F` and `T.C` tiles adjacent to any lava tile become lava the following round, spreading outward
- Strongly encourages dramatic escape

---

---

# FEY FOREST — 10+ Upgrades

### UPGRADE-FF-01 — Fey circle: 1 fairy ring per map as a planar portal
**Current:** Fey forest is a cave with blue-teal palette. No fey-specific features.
**Fix:** Place 1 `FEY_CIRCLE` entity in the most open room:
- Renders as a ring of mushrooms/flowers (8 tiles in a circle pattern)
- DM tooltip: "A creature that enters the fey circle must make DC 15 WIS save or be transported to the Feywild for 1d4 hours."
- "Close Circle" DM toggle (requires a DC 20 Arcana check or dispel magic)

---

### UPGRADE-FF-02 — Enchanted trees: impassable but can be communicated with (Speak with Plants)
**Current:** No tree entities in fey forest.
**Fix:** Scatter 6–12 `ANCIENT_TREE` entities throughout the map:
- Rendered as large `♠♠` in a deep green/teal
- Impassable (3-tile radius)
- DM tooltip: "This ancient oak has observed this glade for 400 years. Speak with Plants allows a DC 12 History question."

---

### UPGRADE-FF-03 — Shifting paths: corridors randomly relocate each long rest
**Current:** Static layout.
**Fix:** Add a "Shifting Paths" toggle. When enabled, 1–2 corridor connections change endpoints each time the party takes a long rest (or when the DM clicks "Shift Paths"):
- Old connection becomes a wall
- New connection opens between a different pair of rooms
- DM map shows the current layout; player map reflects the same
- DM tooltip appears: "The forest has shifted. Old paths are gone. New ones appear."

---

### UPGRADE-FF-04 — Glamoured objects: treasure chests that are actually mimics
**Current:** Loot is always genuine.
**Fix:** 1 loot chest in the fey forest is a `GLAMOUR_CHEST` on the DM layer (labeled with a shimmer effect). Player layer shows a normal chest:
- When opened, DC 14 Insight to sense something is wrong before it attacks
- If Insight fails: Mimic attacks with surprise
- If passed: player may choose not to open it

---

### UPGRADE-FF-05 — Fey light sources: wisp-lights and bioluminescent floor
**Current:** Same cave lighting — dark or uniformly lit.
**Fix:** Fey forest always uses "Bioluminescent" lighting variant (UPGRADE-CV-04 applied). Additionally:
- Place 3–5 `WISP_LIGHT` entities (like UPGRADE-SW-06 but stationary and always visible)
- The overall canvas has a very subtle teal ambient glow (CSS filter or canvas overlay)
- Wall tiles emit faint glow (5 ft dim light) where moss grows

---

### UPGRADE-FF-06 — Pixie/sprite NPC entities in clearings
**Current:** No NPC entities in fey forest.
**Fix:** In 1–2 open rooms (clearings), place 2–4 `PIXIE` or `SPRITE` NPC tokens:
- Neutral by default, hostile if the party attacks trees or disturbs the fey circle
- DM click: "They offer to guide the party to the exit… for a price: a secret the party has never told anyone."
- Sprite has a DC 10 Dexterity (Stealth) to hide in a flower if threatened

---

### UPGRADE-FF-07 — Illusory wall tiles: 1–2 fake dead-ends that are actually passages
**Current:** Dead ends are always genuine.
**Fix:** 1–2 dead-end corridors end in an `ILLUSORY_WALL` tile (DM layer: shown with `?` marker; player layer: shown as normal wall):
- A creature that walks into the tile passes through with DC 13 Investigation to notice it first
- Beyond the illusion is a hidden room with fey treasure

---

### UPGRADE-FF-08 — Time dilation zone: 1 room where time passes differently
**Current:** No unique planar hazards.
**Fix:** One room is tagged `TIME_DILATION`:
- DM tooltip: "Each turn spent in this room equals 1 hour of game time outside. A short rest here is instant outside, but the party ages 8 hours."
- Spell durations tick down at 60× the normal rate while inside (concentration breaks on exit if duration elapsed)

---

### UPGRADE-FF-09 — Archfey court: deepest room is a miniature court with a quest giver
**Current:** No story hook built into the map.
**Fix:** The deepest room is tagged `ARCHFEY_COURT`:
- Minimum 6×6 tiles
- Auto-placed: throne entity, 2 dryad NPC tokens, 1 `ARCHFEY` boss token (CR based on party level)
- DM click on archfey: shows a randomly generated request/bargain: "The Archfey offers the party a boon in exchange for [Quest Task]. Accepting is binding — the Geas spell applies."

---

### UPGRADE-FF-010 — Thorn wall hazard tiles ringing clearings
**Current:** No hazardous terrain type for fey forest.
**Fix:** Ring each clearing (room perimeter) with 1–2 rows of `THORN_WALL` tiles:
- Impassable except via `THORN_GATE` at 1 point per clearing
- A creature that forces through (no gate): DC 12 DEX save or take 1d4 piercing per 5 ft of thorn wall
- Renders as dark green `▓▓` with a vine texture tone

---

### UPGRADE-FF-011 — Reversed compass: player navigation is confusing
**Current:** Standard map orientation.
**Fix:** Add a "Disoriented" toggle for the player TV map. When enabled:
- The player map rotates 90° and has no compass rose
- DM map is always normal orientation
- DM tooltip in the panel: "The fey forest has disoriented the party. North feels like West. No navigation spells function (per fey wild rules)."
