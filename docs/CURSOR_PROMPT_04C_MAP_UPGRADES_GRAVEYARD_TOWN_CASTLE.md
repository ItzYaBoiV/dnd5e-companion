# Cursor Agent Prompt — Graveyard, Town & Castle Map Upgrades (10+ each)
> **Scope:** `DungeonForgeImpl.jsx`, `dungeonTilePalettes.ts`, `dungeonTileRenderer.ts`
> **Goal:** Each location type must feel thematically correct, have D&D-relevant features, and be understandable to a child DM without explanation.

---

# GRAVEYARD — 10+ Upgrades

### UPGRADE-GY-01 — Headstones auto-placed between mausolea as scatter objects
**Current:** The graveyard has mausolea structures but nothing between them — open empty green space.
**Fix:** Scatter 8–20 `HEADSTONE` entities across non-structure floor tiles. Headstones:
- Are impassable (block movement)
- Render as `✝` or `t` in a gray tone
- Can be clicked to show a randomly generated inscription: "Here lies [Name], [Year]. [Short epitaph]"
- Count as half-cover for hiding creatures behind them (AC +2 note in tooltip)

---

### UPGRADE-GY-02 — Central mass grave pit: 1 large sunken area per graveyard
**Current:** No pit, no raised/sunken terrain.
**Fix:** Place one rectangular `T.PIT` region (3×3 to 5×5 tiles) near the graveyard center. Pit tiles:
- Render with a darker ground color and `▿▿▿` hatching
- Are traversable but trigger a "Difficult Terrain" note on the DM overlay
- Serve as the likely spawn point for Undead (skeleton/zombie) on the encounter table

---

### UPGRADE-GY-03 — Night/day lighting toggle with moonlight vs. darkness
**Current:** No lighting variation for graveyards.
**Fix:** Add a "Time of Day" toggle in the DM panel for graveyards: Day / Dusk / Night.
- Day: normal sight, no special rules
- Dusk: Dim light everywhere, −5 ft vision range, all Perception checks at disadvantage
- Night: Darkness, requires darkvision or a light source. Show a full fog overlay that only clears around light sources.

---

### UPGRADE-GY-04 — Crypt entrance stairs: every mausoleum has an optional lower-level staircase
**Current:** Mausolea are single-level structures.
**Fix:** For each mausoleum with area ≥ 4×4 tiles, 50% chance to place a staircase tile (`T.STAIR_DOWN`) inside. DM tooltip says: "These stairs lead to a burial crypt below — use a second Dungeon map as the crypt floor."

---

### UPGRADE-GY-05 — Spawn zones: undead marked in 3 default locations at generation
**Current:** No recommended monster placement — DMs must manually add entities.
**Fix:** Auto-place `zombie` or `skeleton` entity markers (1–3 creatures) in:
- The mass grave pit (FIX-GY-02)
- One mausoleum interior
- Near the graveyard perimeter wall
These are shown as ghosted/transparent icons on the DM map. The DM can enable/remove them before sharing with players.

---

### UPGRADE-GY-06 — Perimeter wall with a single iron gate entrance
**Current:** The graveyard layout has walls but no designated entrance gate.
**Fix:** Place one `T.GATE` tile (rendered as `⬚` or `Ⅱ`) on the south-facing perimeter wall. The gate is the canonical entrance — shown with an arrow marker on the DM map. No other openings in the perimeter wall except deliberate breaks for secret exits.

---

### UPGRADE-GY-07 — Fog of war: mausoleum interiors are hidden until entered (not just until adjacent)
**Current:** Fog fills outward from the player token's cell — mausoleum interiors reveal as soon as the player is adjacent through the door.
**Fix:** Treat mausoleum walls as light-blocking. Interior fog clears only when a token is INSIDE the room (not just adjacent to the door). This is achievable by ensuring `dungeonLightOcclusion.ts` treats mausoleum walls as opaque.

---

### UPGRADE-GY-08 — Weather effects: rain overlay option with difficult-terrain note
**Current:** No environmental hazards.
**Fix:** Add a "Weather" toggle: Clear / Rain / Heavy Rain.
- Rain: A subtle animated rain overlay (CSS or canvas `drawImage` pattern). Constitution saving throw DC 10 each hour or gain 1 level of exhaustion (DM tooltip reminder).
- Heavy Rain: Difficult terrain everywhere outdoors, Perception checks at disadvantage, ranged attacks at disadvantage. DM overlay notes these automatically.

---

### UPGRADE-GY-09 — Graveyard riddle: one mausoleum gets an epitaph puzzle
**Current:** `forgeRiddles.ts` exists but is not called for graveyard generation.
**Fix:** Call `pickRiddle()` once per graveyard and assign it to the largest mausoleum. The riddle text is displayed as an inscription on the mausoleum door tile tooltip: "Answer the riddle to open the vault." The vault's loot tier is upgraded by 1 step if the DM marks it as "solved."

---

### UPGRADE-GY-010 — Print export includes DM notes per structure
**Current:** `forgePrintPacket.ts` exports the map image but no text overlay.
**Fix:** In the print export for graveyards, include a table beneath the map with one row per mausoleum:
| # | Dimensions | Contains | Notes |
|---|-----------|---------|-------|
| 1 | 4×5 | 2 skeletons, silver locket | Secret staircase inside |
| 2 | 3×3 | Empty coffin | Locked iron door (DC 14) |

---

### UPGRADE-GY-011 — Consecrated/desecrated ground zones
**Current:** All ground is identical — no magical terrain variation.
**Fix:** Mark 1–2 tile areas as "Consecrated" (glowing faint gold outline) or "Desecrated" (dark red outline):
- Consecrated: Undead have disadvantage on saves and attacks here. Display as tooltip.
- Desecrated: Turn Undead fails here. Undead that die in this zone rise again next round (1 time).

---

# TOWN — 10+ Upgrades

### UPGRADE-TN-01 — Building type labels on DM map (Tavern, Blacksmith, Temple, etc.)
**Current:** Buildings are generic rectangles labeled by number.
**Fix:** Assign one of 12 building archetypes to each building based on size and position:
- **Tavern**: large building near the center with a `🍺` icon
- **Blacksmith**: near the edge, medium, with `⚒` icon
- **Temple/Shrine**: medium, placed near the center or a plaza, with `†` icon
- **Market Stall**: small buildings along the main road
- **Inn**: large building with a bed icon
- **Guard Post**: small buildings at road entry points
- **Residence**: small/medium filler buildings

Display building type as an overlay label on the DM map layer only.

---

### UPGRADE-TN-02 — Town well or fountain as a central landmark
**Current:** No interactive landmark in town centers.
**Fix:** Place a `WELL` or `FOUNTAIN` special tile entity in the largest open plaza/road intersection. The well is:
- A circular tile with a blue highlight
- Clickable for flavor: "The well is 20 ft deep. A bucket hangs from a rope."
- Doubles as a resting point (DM can award a "short rest sip" bonus, optional)

---

### UPGRADE-TN-03 — NPC placement: 2–4 named NPCs auto-assigned to buildings at generation
**Current:** No NPCs in town maps.
**Fix:** At generation time, assign 2–4 named NPC entities to specific buildings:
- The Tavern gets an innkeeper NPC with a randomly generated name
- The Blacksmith gets a smith NPC
- NPCs are shown as `@` tokens on the DM map
- Each NPC has a one-line hook: "Marta the innkeeper looks worried — she hasn't seen her husband in two days."
NPC hooks are drawn from a town hook table in `DungeonForgeImpl.jsx`.

---

### UPGRADE-TN-04 — Guard patrol routes shown as dotted lines on DM map
**Current:** No patrol indication.
**Fix:** Place 2–3 guard entities with a simple patrol path overlay (a dotted line connecting 2–3 waypoints on the main road). Waypoints are shown as small circles. DM tooltip: "Guards patrol this route every 10 minutes."

---

### UPGRADE-TN-05 — Town notice board near the market/tavern with 3 random quest hooks
**Current:** No quest hook system.
**Fix:** Place a `NOTICE_BOARD` entity near the tavern/market. Clicking it shows 3 randomly generated quest hooks:
- Monster bounty: "50 gp reward for the head of the wolf terrorizing the northern farms."
- Missing person: "Have you seen Aldric the Merchant? Last seen 3 days ago on the south road."
- Item wanted: "The alchemist seeks 5 bundles of moonmoss. Pays 10 gp each."

---

### UPGRADE-TN-06 — Town walls with a gatehouse for walled towns
**Current:** Towns have roads and buildings but no perimeter walls.
**Fix:** For the "fortified town" variant (selectable at generation), add an outer stone wall perimeter with:
- One main gatehouse on the south wall (wide T.GATE tile with a guard post building)
- One postern gate on the north wall
- 2–4 corner tower structures
- Walls render as `▓` in a contrasting color

---

### UPGRADE-TN-07 — Street name labels on main roads on the DM map
**Current:** Roads are visual but have no labels.
**Fix:** Auto-generate 3–5 street names (e.g., "Mill Road", "King's Way", "Market Lane") and display them as rotated text overlays along the main road segments on the DM map. Helps the DM narrate: "You turn onto King's Way..."

---

### UPGRADE-TN-08 — Alley system: narrow 1-tile-wide paths between building blocks
**Current:** All paths are wide roads. No alleys.
**Fix:** Between building clusters, add 1-tile-wide alley paths. Alleys:
- Connect to the main road at both ends
- Are marked as "Difficult Terrain (narrow)" on the DM overlay
- Serve as ambush/chase route options
- Render slightly darker than the main road

---

### UPGRADE-TN-09 — Market day event flag: increases NPC density and adds stalls
**Current:** Static town population.
**Fix:** Add a "Market Day" toggle in the DM panel. When enabled:
- 8–12 market stall entities appear along the main road
- NPC count increases by 4–6 generic "townsfolk" tokens
- A small Perception check note appears: "DC 10 to spot a pickpocket in the crowd."

---

### UPGRADE-TN-010 — Building interiors: each building has a one-click floor plan link
**Current:** Buildings are shown as exterior footprints only.
**Fix:** Add a "Generate Interior" button that appears when the DM clicks a building. This generates a small single-room mini-map (using the dungeon generator in miniature, 6×8 tiles max) representing the building's ground floor:
- Tavern: bar counter, tables, stairs up, kitchen in back
- Blacksmith: forge pit, workbench, weapon rack, locked strongbox
The mini-map opens in a panel overlay on top of the town map.

---

### UPGRADE-TN-011 — Chase rules overlay: road length measured in tiles/feet for pursuit
**Current:** No chase support.
**Fix:** Add a "Chase Mode" toggle in the DM panel. When enabled, road segments display their length in feet. A HUD shows each participant's speed, and clicking "Next Round" moves tokens one speed-worth of tiles along the road automatically.

---

# CASTLE — 10+ Upgrades

### UPGRADE-CA-01 — Room type labels: Great Hall, Throne Room, Barracks, Dungeon, Chapel, etc.
**Current:** Castle rooms are generic.
**Fix:** Assign archetypes based on size and position:
- Corner towers → "Guard Tower" (auto-labeled)
- Largest central room → "Great Hall" or "Throne Room"
- Rooms adjacent to the keep south wall → "Barracks"
- Smallest sub-basement room (if any) → "Dungeon / Oubliette"
- Room with an altar entity → "Chapel"

Display labels on DM map layer.

---

### UPGRADE-CA-02 — Drawbridge at the castle entrance with a portcullis mechanic
**Current:** The castle entrance is a plain doorway.
**Fix:** At the south gatehouse:
- Place a `T.DRAWBRIDGE` tile (2 tiles wide) between the gatehouse towers
- A DM toggle: "Drawbridge UP/DOWN". When UP, the tile is impassable and renders as `||`. When DOWN, it is passable.
- Add a `PORTCULLIS` entity on the inner side with a "Lower/Raise" toggle

---

### UPGRADE-CA-03 — Battlements: castle wall tops are accessible (walkable outer edge tiles)
**Current:** Castle walls are single-tile walls with no differentiation.
**Fix:** Add a second "upper level" layer flag for wall-top tiles. Wall-top tiles:
- Are accessible via staircase entities inside the towers
- Render as lighter gray with crenellation marks `∩∩∩` on the DM map
- Provide half-cover (+2 AC) to creatures on the battlements
- Archers on the battlements have advantage on attacks against creatures below (elevated position note)

---

### UPGRADE-CA-04 — Murder holes in gatehouse ceilings
**Current:** No defensive architecture features.
**Fix:** In the gatehouse entrance corridor, place 4 `MURDER_HOLE` tiles. DM tooltip: "Defenders above can pour boiling oil — DEX save DC 14 or take 3d6 fire damage." Shown as `⬡` tiles on the DM map in the gatehouse passage.

---

### UPGRADE-CA-05 — Keep interior: second floor via staircase with a bedchamber/study
**Current:** The keep is a single open floor.
**Fix:** Place 1–2 staircase entities inside the keep. The second floor is represented as a separate mini-map (same mechanism as UPGRADE-TN-010):
- Large bedchamber with a chest (treasure) and desk (clues/documents)
- A small anteroom with a guard or advisor NPC

---

### UPGRADE-CA-06 — Flag / banner entity on keep towers shows faction
**Current:** No faction/allegiance visual.
**Fix:** Place banner entities on the highest tower. Banner color/pattern is randomly selected at generation from a list of 8 heraldic styles. DM tooltip: "The banner of House [Generated Name] — [Color] with [Charge]." Clicking the banner lets the DM type in the actual faction name.

---

### UPGRADE-CA-07 — Well in the courtyard with "under siege" note
**Current:** Castle courtyard is empty.
**Fix:** Place a `WELL` entity in the courtyard (same as UPGRADE-TN-02). DM note: "The well is crucial during a siege. If destroyed or poisoned, the castle can hold out only 1d4 days before surrender."

---

### UPGRADE-CA-08 — Arrow slit tiles on outer walls for defenders
**Current:** Walls have no firing positions.
**Fix:** Every 4 tiles along the outer walls, place an `ARROW_SLIT` tile (rendered as a narrow vertical gap `|` in the wall). DM tooltip: "A defender in this slit has three-quarters cover (AC +5) while attacking through it."

---

### UPGRADE-CA-09 — Dungeon/oubliette beneath the castle as a linked second map
**Current:** No underground area.
**Fix:** Place 1 `T.STAIR_DOWN` entity in the castle dungeon room (small room near castle base). Clicking it generates or links to a separate dungeon map of "castle dungeon" flavor:
- Contains prison cells (`T.CELL` tiles, rendered with iron bars)
- 1–2 prisoners with quest hooks
- A torture room (optional, for mature DMs only — hide-able toggle)

---

### UPGRADE-CA-010 — Siege equipment entities: catapult, ballista at the walls
**Current:** No siege/war equipment.
**Fix:** Place 1–2 siege weapon entities (ballista or catapult) on the castle battlements or courtyard. Entity click shows:
- Range: 120/480 ft (ballista), 300/1200 ft (catapult) — per DMG siege weapon rules
- Damage: 3d10 piercing (ballista), 8d10 bludgeoning (catapult)
- Reload: 1 action (ballista), 2 actions (catapult)

---

### UPGRADE-CA-011 — Secret passage from the throne room to outside the walls
**Current:** No escape route.
**Fix:** Place 1 secret door (`T.SECRET_DOOR`) behind the throne that connects to a tunnel exiting outside the castle walls (shown as a dotted path on the DM map). DM tooltip: "Only the lord of the castle knows about this escape tunnel. DC 20 Investigation to find without a map."
