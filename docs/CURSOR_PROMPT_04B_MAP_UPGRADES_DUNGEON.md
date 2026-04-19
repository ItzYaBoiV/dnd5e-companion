# Cursor Agent Prompt — Dungeon Map Upgrades (10+ Improvements)
> **Scope:** `DungeonForgeImpl.jsx` (dungeon layout), `dungeonTilePalettes.ts`, `dungeonTileRenderer.ts`, `proceduralDungeonLayout.ts`, `forgeLootFromReference.ts`, `forgeRiddles.ts`
> **Location Type:** `dungeon`
> **Goal:** Dungeon maps should make immediate D&D sense — correct room variety, navigable layout, thematic loot/traps, and clear visual language that a child DM can read at a glance.

---

## Upgrade List

### UPGRADE-D-01 — Room type variety: add distinct room categories with correct D&D purpose labels
**Current:** All rooms are generic rectangles labeled by depth (entrance/boss/corridor).
**Fix:** Assign one of 8 room archetypes based on depth and size, and store a `roomType` field on each room:
- `entrance` — the first room (closest to map edge)
- `corridor_junction` — small rooms (< 24 tiles) connecting corridors
- `guard_post` — near-entrance medium rooms
- `storage` — medium rooms with extra loot rolls
- `barracks` — medium-large rooms with 2–4 enemy placements
- `throne_room` — single large room (largest room by area) with boss entity
- `shrine` — medium room tagged for puzzle/riddle placement
- `secret_vault` — a room with no direct corridor connection (access via secret door)

Display the `roomType` as a small label on the DM map (hidden on the player map).

---

### UPGRADE-D-02 — Secret doors: 1–2 secret doors per map between non-adjacent rooms
**Current:** All connections are open doorways or corridors — no secret passages.
**Fix:** After corridor carving, select 1–2 pairs of rooms that are not already connected. Place a `T.SECRET_DOOR` tile on a shared wall (or near-wall). Secret doors are:
- Visible on the DM layer (renders as `?` symbol with a distinct color)
- Hidden on the player fog-of-war layer until a PC passes adjacent and a DC 15 Perception check is called by the DM

---

### UPGRADE-D-03 — Trap placement: 1 trap per 4 rooms (average), placed on corridor tiles
**Current:** Traps exist in the entity system but are never auto-placed in dungeon generation.
**Fix:** During `applyLocationSpecialFeatures` for `dungeon`, place trap entities on corridor `T.C` tiles at a rate of 1 per ~4 rooms:
- Trap types: `pit` (10 ft, 1d6 fall), `dart` (DEX save DC 13, 1d4 piercing), `pressure_plate` (alarm), `poison_gas` (CON save DC 14, 1d6 poison)
- Show trap icon on DM map layer, hidden on player layer
- When DM clicks a trap entity, show the save DC, damage, and a "Triggered?" toggle

---

### UPGRADE-D-04 — Loot quality scales with room depth (easy/medium/hard/deadly)
**Current:** `forgeLootFromReference.ts` generates loot but does not weight by dungeon depth.
**Fix:** Pass a `dungeonDepth` parameter (0.0–1.0, computed from BFS depth ÷ max depth) to loot generation:
- Depth 0–0.25: common items + copper/silver only
- Depth 0.25–0.5: uncommon items + silver/gold
- Depth 0.5–0.75: rare items + gold
- Depth 0.75–1.0: rare/very rare items + gold/electrum + art objects

---

### UPGRADE-D-05 — Boss room gets a distinct visual treatment on the DM map
**Current:** The boss room (deepest/largest room) looks the same as all others.
**Fix:** In the tile renderer, when `room.roomType === "throne_room"`, draw a red/gold border around the room walls on the DM layer, and place a `★` symbol at the room centroid. Label the room "BOSS ROOM" in a small overlay text.

---

### UPGRADE-D-06 — Pillars auto-placed in rooms larger than 6×6 tiles
**Current:** Large rooms are empty open spaces with no interior features.
**Fix:** For dungeon rooms wider or taller than 6 tiles, place pillar tiles (`T.PILLAR` or a designated wall tile) in a 2×2 pattern at symmetric positions inside the room. Pillars:
- Block line of sight (added to the occlusion mask)
- Are impassable (not walkable)
- Render as `█` blocks with a lighter color than walls

---

### UPGRADE-D-07 — Wandering monster indicator: 1 per level per 10 minutes of real time
**Current:** Monster encounters are only placed as static map entities.
**Fix:** Add a "Wandering Monster Check" timer in the DM panel that counts up. Every 10 minutes (configurable 5/10/15), a subtle pulse badge appears on the map sidebar:
"Roll d20 — on 17+, a wandering encounter approaches!"
Include a random monster suggestion from the dungeon's CR range. The DM dismisses it manually.

---

### UPGRADE-D-08 — Dungeon entrance always faces a map edge with a clear "Enter Here" marker
**Current:** The entrance room is determined by BFS from `id===1` which may be anywhere.
**Fix:** After FIX-MAP-003, explicitly place the entrance room touching or near the west map edge. Add a `→ ENTER` arrow tile or overlay on the DM map at the entrance doorway.

---

### UPGRADE-D-09 — Torch/light source placement: torches on walls every 30 ft in lit dungeons
**Current:** Wall lights (`forgeWallLights.ts`) exist but are placed uniformly without considering dungeon type.
**Fix:** For lit dungeons, place wall sconce light sources every 6 grid cells (30 ft) along corridor walls. For dark dungeons, place no sconces and force all vision to rely on PC darkvision/carried light. The DM UI should have a "Dungeon Lighting" toggle: Lit / Dim / Dark.

---

### UPGRADE-D-010 — Room descriptions auto-generated per room type with D&D flavor
**Current:** Rooms have no description text — DMs must improvise all details.
**Fix:** Generate a 1-sentence room description at map creation time for each room, stored in `room.description`. Use a weighted table based on `roomType`:
```js
const descriptions = {
  entrance: ["The air smells of damp stone and old torch smoke.", "Crude markings warn trespassers in Goblin."],
  barracks: ["Crude sleeping mats line the walls. A fire pit smolders in the corner.", "Weapon racks hold rusty spears and shortbows."],
  shrine:   ["A stone idol stares from the far wall. Something glitters at its feet.", "Incense burns on a cracked altar."],
  throne_room: ["A massive throne of bone dominates the far wall. The floor is sticky with old blood."],
  // etc.
};
```
Display the description as a tooltip when the DM hovers over a room, and include it in print exports.

---

### UPGRADE-D-011 — Connecting corridors show distance in feet between rooms
**Current:** Corridors are drawn but have no distance indication.
**Fix:** After all corridors are placed, compute the path length in tiles and display a small label at the corridor midpoint on the DM map: e.g., `──30 ft──`. (Each tile = 5 ft.) This helps the DM describe travel time and manage Dash/movement.

---

## Verification Steps
1. Generate a Dungeon. Confirm each room has a `roomType` assigned and is labeled on the DM layer.
2. Confirm 1–2 secret doors appear (shown as `?` on DM layer, invisible on player layer).
3. Confirm at least 1 trap entity appears in the corridor tiles, clickable with save DC info.
4. Confirm the boss room (deepest large room) has a red/gold border and `★` marker.
5. Confirm rooms > 6×6 tiles have interior pillar tiles.
6. Confirm the entrance room is near the map edge with an arrow marker.
7. Confirm room hover tooltips show the auto-generated 1-sentence description.
