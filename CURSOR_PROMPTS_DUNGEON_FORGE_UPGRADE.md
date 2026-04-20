# Dungeon Forge Upgrade — Cursor Prompts
> All prompts are ordered by phase. Run each one completely before starting the next.
> Every prompt references exact files in your project.

---

## PHASE 1 — SVG Token Art Expansion (100–150 new SVGs)

---

### PROMPT 1-A — Monster Token SVGs (Batch 1: Humanoids & Undead)

Create 30 new pixel-art SVG token files in `frontend/public/tokens/pixel/`. Each file must follow the exact same format as the existing tokens: `viewBox="0 0 32 32"`, `shape-rendering="crispEdges"`, dark circular background `#1a1520`, built with `<rect>` elements only (no paths, no circles). Each token should be immediately recognizable by silhouette and color.

Create these files:
- `monster-kobold.svg` — small, orange-brown, crouched, wide eyes
- `monster-gnoll.svg` — hyena-faced, spotted tan/brown, hunched
- `monster-lizardfolk.svg` — teal-green scales, upright, tail hint
- `monster-cultist.svg` — dark robe, hood shadow, red symbol on chest
- `monster-bandit.svg` — leather-brown, bandana, dagger silhouette
- `monster-bandit-captain.svg` — same as bandit but with a shoulder cape and helmet
- `monster-berserker.svg` — muscular, fur-shoulder, axe raised high
- `monster-guard.svg` — grey armor, spear tip above head
- `monster-knight.svg` — full plate silver, visor down, shield on left
- `monster-spy.svg` — dark grey, slim, cowl, daggers at belt
- `monster-thug.svg` — large, brown leather, clubs
- `monster-tribal-warrior.svg` — skin tones, feather headdress, spear
- `monster-wight.svg` — glowing red eyes, dark armored undead, green glow fringe
- `monster-wraith.svg` — wispy, translucent purple/dark, no legs, tendrils
- `monster-specter.svg` — similar to wraith but lighter, blue-white tones
- `monster-ghoul.svg` — gaunt grey-green, claws, hunched, yellow eyes
- `monster-ghast.svg` — like ghoul but purple-tinted, more decayed
- `monster-revenant.svg` — skeletal knight, glowing orange eyes, tattered armor
- `monster-lich.svg` — robed skeleton, glowing crown, orb floating to side, purple tones
- `monster-vampire.svg` — elegant dark cape, pale skin, red eyes, collar upturned
- `monster-vampire-spawn.svg` — simpler vampire silhouette, less regal, tattered
- `monster-mummy.svg` — bandaged tan-beige humanoid, glowing green eyes
- `monster-mummy-lord.svg` — mummy with golden crown, ornate wrappings
- `monster-death-knight.svg` — black plate, skull helm, green necrotic aura edge
- `monster-demilich.svg` — glowing skull floating, gemstone eyes, no body
- `monster-shadow.svg` — pure black wispy humanoid silhouette, dark purple glow edge
- `monster-banshee.svg` — screaming ghostly woman shape, white/blue spectral
- `monster-flameskull.svg` — floating skull, flame orange halo top
- `monster-crawling-claw.svg` — single severed hand, grey-green, claw tips
- `monster-skeleton-warrior.svg` — sword-and-shield skeleton distinct from plain skeleton

After creating all SVG files, update `frontend/src/lib/tokenSprites.ts`. In the `MONSTER_TOKEN_SPRITES` record, add entries for every new slug using lowercase hyphenated keys matching the filenames (without the `monster-` prefix and `.svg` extension where appropriate). Example: `"kobold": "/tokens/pixel/monster-kobold.svg"`. Do NOT remove any existing entries.

---

### PROMPT 1-B — Monster Token SVGs (Batch 2: Beasts, Fey & Aberrations)

Create 30 more pixel-art SVG token files in `frontend/public/tokens/pixel/`. Same rules: 32x32, `crispEdges`, dark bg `#1a1520`, rects only.

Create these files:
- `monster-wolf.svg` — grey four-legged shape, ears up, tail low
- `monster-dire-wolf.svg` — like wolf but larger/blockier, darker grey, red eyes
- `monster-giant-spider.svg` — 8 legs radiating, dark brown body, 8 white eye dots
- `monster-giant-rat.svg` — brown oval body, pointy snout, long tail, 4 legs
- `monster-swarm-rats.svg` — multiple overlapping small brown rat shapes on base
- `monster-giant-bat.svg` — wings spread wide, dark brown, upside-down head
- `monster-giant-centipede.svg` — segmented brown body, many tiny legs, curled
- `monster-giant-toad.svg` — squat dark green, wide eyes, tongue hint
- `monster-giant-eagle.svg` — brown wings spread, white head, yellow beak
- `monster-owlbear.svg` — bear body + owl head (white face disk, tufted ears), brown body
- `monster-displacer-beast.svg` — panther-shaped, tentacles from shoulders, purple tint
- `monster-basilisk.svg` — lizard, 4 stocky legs, stone-grey, red compound eyes
- `monster-cockatrice.svg` — chicken body + bat wings + snake tail, brown/yellow
- `monster-manticore.svg` — lion body, bat wings, spike tail tip, human face shape
- `monster-griffon.svg` — eagle head+wings front, lion rear, golden/brown
- `monster-hippogriff.svg` — eagle front half, horse rear half, tan
- `monster-worg.svg` — large wolf-like, dark grey, intelligent red eyes, scruff mane
- `monster-phase-spider.svg` — spider shape, blue shimmer/phase edges, dark
- `monster-stirge.svg` — tiny winged form, needle nose, red-pink, bat-like wings
- `monster-beholder.svg` — floating sphere, large central eye, 10 eyestalks radiating, green/brown
- `monster-mind-flayer.svg` — robed figure, purple tentacle-face (4 tentacles), glowing white eyes
- `monster-aboleth.svg` — large fish-eel, 3 eyes on top, tentacles, slime-green/grey
- `monster-gibbering-mouther.svg` — blob of mouths and eyes, pink/grey, chaotic
- `monster-intellect-devourer.svg` — walking brain with 4 legs, pink, electrical arcs
- `monster-nothic.svg` — hunched, one giant eye, claws, sickly green
- `monster-otyugh.svg` — tentacle blob, large central mouth, grey-brown
- `monster-rust-monster.svg` — insect-like, rust-orange, antennae, 4 legs, flat head
- `monster-will-o-wisp.svg` — glowing orb, no body, electric blue-white, light rays
- `monster-pixie.svg` — tiny winged humanoid, white/gold, sparkle ring
- `monster-dryad.svg` — feminine shape, bark-textured brown limbs, green leaf hair

After creating all files, add entries to `MONSTER_TOKEN_SPRITES` in `frontend/src/lib/tokenSprites.ts` for each new slug.

---

### PROMPT 1-C — Monster Token SVGs (Batch 3: Giants, Dragons & Demons)

Create 30 more pixel-art SVG token files in `frontend/public/tokens/pixel/`. Same rules.

Create these files:
- `monster-ogre.svg` — massive, brown-tan, club raised, small eyes, hunched
- `monster-troll.svg` — tall lanky green, large hands, claws, slouched
- `monster-hill-giant.svg` — huge humanoid, brown rags, boulder in hand
- `monster-stone-giant.svg` — grey rock-textured, streamlined, javelin in hand
- `monster-frost-giant.svg` — blue-white skin, ice armor, axe, white beard/hair
- `monster-fire-giant.svg` — red-orange skin, black iron armor, greatsword, flame hair
- `monster-cloud-giant.svg` — pale blue-white, elegant, morningstar, cloud wisps
- `monster-storm-giant.svg` — deep blue-purple, lightning bolt in hand, tall
- `monster-cyclops.svg` — large one-eyed humanoid, brown, club, single eye center
- `monster-ettin.svg` — two heads side by side on one large body, brown, clubs
- `monster-dragon-white.svg` — white/ice scales, wings spread, sharp horns, icy breath hint
- `monster-dragon-black.svg` — black scales, wide flat horns, acid drip from jaws
- `monster-dragon-green.svg` — dark green, curving horns swept back, forest-toned
- `monster-dragon-blue.svg` — electric blue scales, lightning-crested head
- `monster-dragon-red.svg` — crimson scales, large wings, flame-filled mouth
- `monster-dragon-silver.svg` — silver-white scales, elegant, cold vapor breath
- `monster-dragon-gold.svg` — brilliant gold, regal horns, fire-sunburst aura
- `monster-dragon-copper.svg` — copper-brown, mischievous slant, acid tinge
- `monster-dragon-bronze.svg` — bronze scales, lightning frills, sea-toned
- `monster-dragon-brass.svg` — warm brass-gold, talkative open-mouthed, fire hint
- `monster-wyvern.svg` — two legs only, large wings, barbed tail, dark grey-green
- `monster-pseudodragon.svg` — tiny, red-brown, bat wings, scorpion tail tip
- `monster-imp.svg` — tiny red devil, small horns, pitchfork, bat wings
- `monster-quasit.svg` — like imp but green, no pitchfork, chaotic look
- `monster-incubus.svg` — winged humanoid, dark purple, horn, alluring pose
- `monster-succubus.svg` — winged humanoid, dark red, horn, alluring pose
- `monster-barbed-devil.svg` — humanoid covered in spines, red, spear
- `monster-horned-devil.svg` — large winged devil, two curved horns, pitchfork
- `monster-balor.svg` — enormous winged demon, fire-whip, sword, black-red flame
- `monster-pit-fiend.svg` — armored devil lord, huge wings, mace, crown of horns

Add all new slugs to `MONSTER_TOKEN_SPRITES` in `frontend/src/lib/tokenSprites.ts`.

---

### PROMPT 1-D — Item & Trap Token SVGs (30 new SVGs)

Create 30 item/trap/loot SVG tokens in `frontend/public/tokens/pixel/items/` (new folder). Same 32x32 crispEdges format but use transparent or very dark background and keep designs centered. These are used as map overlay tokens for loot chests, traps, and special objects.

Create these files:
- `item-chest.svg` — wooden chest, iron lock, brown/gold
- `item-chest-gold.svg` — gold chest, ornate, bright
- `item-chest-mimic.svg` — chest with teeth/eyes showing, monster brown
- `item-potion-red.svg` — round flask, red liquid, cork
- `item-potion-blue.svg` — flask, blue liquid, glowing edges
- `item-potion-green.svg` — flask, green liquid, bubbles
- `item-scroll.svg` — tied scroll, parchment tan, red ribbon
- `item-tome.svg` — open book, arcane symbol on page
- `item-sword.svg` — longsword, silver blade, gold cross-guard
- `item-axe.svg` — battle axe, steel head, wooden haft
- `item-bow.svg` — shortbow curved, wood tone, arrow nocked
- `item-staff.svg` — gnarled staff, glowing orb top, wood
- `item-wand.svg` — thin wand, star at tip, silver
- `item-shield.svg` — round shield, heraldic stripe, silver rim
- `item-armor.svg` — breastplate front view, steel, shoulder guards
- `item-helmet.svg` — great helm, steel, front view
- `item-ring.svg` — gold ring, gemstone center, magic sparkle
- `item-amulet.svg` — teardrop pendant, chain, glowing stone
- `item-gem.svg` — faceted diamond shape, rainbow glint
- `item-gold-pile.svg` — heap of gold coins, shiny
- `item-key.svg` — ornate iron key, large bow
- `item-lantern.svg` — hanging lantern, warm glow, iron frame
- `item-torch.svg` — torch, flame top, wrapped handle
- `item-rope.svg` — coiled rope, tan
- `item-trap-spike.svg` — floor pit with spikes visible, danger red
- `item-trap-net.svg` — green net outline on floor tile
- `item-trap-arrow.svg` — wall hole with arrow protruding
- `item-trap-alarm.svg` — tripwire line, bell at end
- `item-barrel.svg` — wooden barrel, iron bands
- `item-altar.svg` — stone altar block, rune carved top, dark grey

Then create `frontend/src/lib/itemTokenSprites.ts` with:
```typescript
export const ITEM_TOKEN_SPRITES: Record<string, string> = {
  chest: "/tokens/pixel/items/item-chest.svg",
  // ... all entries ...
};

export function itemTokenSprite(key: string): string {
  return ITEM_TOKEN_SPRITES[key] ?? "/tokens/pixel/items/item-chest.svg";
}
```

---

### PROMPT 1-E — Environment / Deco SVGs (15 new SVGs)

Create 15 decorative environment SVG tiles in `frontend/public/tokens/pixel/deco/`. These are larger ambient decorations placed on map cells (pillars, altars, trees, wells, etc.).

Create:
- `deco-pillar.svg` — stone column, cross-section top view, grey, shadow edge
- `deco-well.svg` — stone well ring, top view, dark water center
- `deco-campfire.svg` — fire pit, orange flame, stone ring, top view
- `deco-throne.svg` — grand throne, top-down, red cushion, gold frame
- `deco-fountain.svg` — octagonal pool, water ripple, top view
- `deco-bookshelf.svg` — top-down shelving unit, brown/multi-color spines
- `deco-table.svg` — wooden table top-down, rectangular, dark wood
- `deco-bed.svg` — bed top-down, pillow, white sheets, wooden frame
- `deco-barrel-rack.svg` — 2x2 barrel arrangement, top-down
- `deco-sarcophagus.svg` — stone coffin top-down, carved face lid, grey
- `deco-statue.svg` — stone pedestal top-down, figure silhouette
- `deco-tree.svg` — top-down tree canopy, green circle, trunk dot center
- `deco-mushroom-cluster.svg` — top-down glowing mushrooms, purple/teal
- `deco-magic-circle.svg` — arcane rune circle, glowing, purple/gold
- `deco-rubble.svg` — scattered rock pile top-down, grey fragments

---

## PHASE 2 — Lighting System Upgrade

---

### PROMPT 2-A — Upgrade Light Occlusion to Shadow-Casting Ray March

File to edit: `frontend/src/lib/dungeonLightOcclusion.ts`

The current `computeOccludedLightDarkness` function uses 4-way flood fill, which produces blocky, non-directional darkness. Replace the lighting computation with a **radial ray-march shadow casting** approach:

1. Keep all existing type exports (`LightKind`, `SceneLightInput`, `cellBlocksLightPropagation`) unchanged so callers aren't broken.

2. Rewrite `computeOccludedLightDarkness` (or add a new `computeRaycastLightDarkness` that the renderer can call instead) using this algorithm:
   - For each light source in `sceneLights` plus the optional `lighting` param, cast rays outward in 360 degrees (use ~180–360 ray angles with angular step = 1/radiusCells for performance)
   - For each ray, step cell by cell outward; stop when hitting a wall/door that blocks light (`cellBlocksLightPropagation`)
   - Each cell the ray passes through receives that light's contribution: `contribution = intensity * (1 - distance/radiusCells)^1.5`
   - Accumulate contributions per cell; cap at 1.0
   - Return a `Float32Array` of per-cell darkness values (0 = full light, 1 = full dark) indexed `gy * cols + gx`

3. Add soft penumbra: cells adjacent to a lit cell that are in shadow receive 15% bleed so there are no harsh hard edges between lit and unlit.

4. Export a helper `buildLightMap(grid, cols, rows, lights, doorOpen, doorStates): Float32Array` that the renderer calls once per frame instead of computing per-cell inside the draw loop.

5. Keep the existing flood-fill function in the file (renamed to `computeFloodFillLightDarkness`) as a fallback for very large maps (>100×100 cells).

---

### PROMPT 2-B — Colored Light Support & Light Kinds

Files: `frontend/src/lib/playerMapBroadcast.ts`, `frontend/src/lib/dungeonLightOcclusion.ts`, `frontend/src/lib/dungeonTileRenderer.ts`

Extend the `SceneLight` type in `playerMapBroadcast.ts` to support colored lighting:

```typescript
export type SceneLight = {
  gx: number;
  gy: number;
  radiusCells: number;
  intensity?: number;
  kind?: "torch" | "lantern" | "magic" | "fire" | "cold" | "necrotic" | "divine" | "fey" | "lava" | "wisp";
  /** Optional hex color override — supersedes kind-based color. */
  color?: string;
  /** Flicker: if true, renderer applies ±5% intensity pulse each animPhase tick. */
  flicker?: boolean;
};
```

In `dungeonTileRenderer.ts`, extend the per-cell light blend pass to:
1. Look up the dominant light color for each lit cell based on the light `kind`:
   - `torch` → `#ff9040` warm amber
   - `lantern` → `#ffe0a0` cool yellow
   - `magic` → `#a060ff` purple
   - `fire` → `#ff4400` red-orange
   - `cold` → `#80c0ff` icy blue
   - `necrotic` → `#40ff80` sickly green
   - `divine` → `#ffffc0` holy white-gold
   - `fey` → `#40ffcc` teal
   - `lava` → `#ff2200` deep red
   - `wisp` → `#c0ffff` cyan
2. After drawing a cell's base tile, apply a `globalCompositeOperation = "multiply"` color tint pass using the blended light color at that cell's brightness level.
3. Apply flicker via `animPhase`: `effectiveIntensity = intensity * (1 + 0.05 * Math.sin(animPhase * 3.14 + gx + gy))`

---

### PROMPT 2-C — Dynamic Wall Shadow Casting

File: `frontend/src/lib/dungeonTileRenderer.ts`

Add a **wall shadow pass** that draws directional drop-shadows on the south and east face of wall tiles to give the map a feeling of top-down depth. This should happen after tiles are drawn but before entities/tokens are drawn.

Implementation:
1. After the main tile render loop completes, iterate every cell.
2. For any `T_WALL` or `T_PILLAR` cell, check if the cell directly **south** (gy+1) is a floor/corridor. If yes, draw a 3px shadow strip along the bottom edge of that southern floor cell using `rgba(0,0,0,0.45)`.
3. For any `T_WALL` or `T_PILLAR` cell, check if the cell directly **east** (gx+1) is a floor/corridor. If yes, draw a 2px shadow strip along the left edge of that eastern floor cell using `rgba(0,0,0,0.35)`.
4. For `T_DOOR` cells, also apply a subtle 2px south shadow to give doors depth.
5. Wall shadow intensity should scale with `dungeonLighting` setting: full at `"dark"`, 60% at `"dim"`, 30% at `"lit"`.
6. This pass must be skipped when `inkSaver` is true.

---

### PROMPT 2-D — Ambient Occlusion on Floor Cells

File: `frontend/src/lib/dungeonTileRenderer.ts`

Add an **ambient occlusion (AO)** micro-pass that darkens floor cells in corners where walls meet. This is a common technique in pixel-art dungeon renderers to give perceived depth without 3D geometry.

For every `T_FLOOR` or `T_CORRIDOR` cell:
1. Count how many of its 4 cardinal neighbors are wall/void tiles. Call this `wallCount` (0–4).
2. Count how many of its 4 diagonal neighbors are wall/void tiles. Call this `diagWallCount`.
3. Compute `aoStrength = (wallCount * 0.08) + (diagWallCount * 0.04)`, capped at 0.32.
4. Draw a `rgba(0, 0, 0, aoStrength)` overlay rect on the full cell after the base floor tile is painted.
5. For cells adjacent to `T_WALL` on exactly one side, also draw a gradient from that wall edge (dark) to the far edge (transparent) to simulate wall-bounce occlusion.

This pass must be consistent across `dungeonLighting` modes and must run before the entity/token layer.

---

### PROMPT 2-E — Upgrade `forgeWallLights.ts` — Biome-Aware Light Placement

File: `frontend/src/lib/forgeWallLights.ts`

Expand `collectTorchFixtureLights` (or create a new `collectBiomeLights`) to return biome-appropriate light types instead of always returning `kind: "torch"`.

Add a new exported function:
```typescript
export function collectBiomeLights(
  grid: number[][],
  rooms: Array<{ x: number; y: number; w: number; h: number }>,
  locationType: string,
  seed: number,
): SceneLight[]
```

This function should:
- `"dungeon"` → torch sconces (`kind: "torch"`, amber, flicker: true), radius 4–5
- `"cave"` → bioluminescent fungi if `caveBioluminescent` set (`kind: "fey"`, teal, radius 3), else dim torch radius 3
- `"temple"` → divine candelabras near altars (`kind: "divine"`, radius 5, no flicker) + rare magic circles (`kind: "magic"`, radius 2)
- `"graveyard"` → cold spectral wisps (`kind: "cold"`, radius 2, flicker: true)
- `"volcanic_lair"` → lava glow from lava cells (`kind: "lava"`, radius 6, flicker: true) + fire braziers near rooms
- `"fey_forest"` → wisp lights (`kind: "wisp"`, radius 3, flicker: false), teal
- `"sewer"` → very dim lanterns (`kind: "lantern"`, radius 3, intensity 0.08)
- `"castle"` → wall-mounted torches in rooms (`kind: "torch"`, radius 5), braziers near throne
- `"swamp"` → will-o-wisps (`kind: "wisp"`, radius 2, flicker: true, color: "#80ffff"`)
- All others → default to existing torch placement logic

Place lights only at wall-adjacent floor cells (use existing `pickWallAdjacentFloorCells`), using seeded RNG for determinism. Return max 20 lights per map to maintain render performance.

---

## PHASE 3 — Map Depth & Visual Effects

---

### PROMPT 3-A — Tile Detail Upgrade: Textured Floors & Walls

File: `frontend/src/lib/dungeonTileRenderer.ts`

Upgrade the floor and wall tile rendering to use **procedural micro-detail patterns** instead of flat color fills. The patterns must be generated using the cell's grid coordinates as a seed (so they are stable across renders and don't require texture files).

For `T_FLOOR` cells:
1. Draw the base `floorBg` color as a full rect.
2. Add 3–4 sub-pixel `floorDetail` colored rects at deterministic positions using `(gx * 7 + gy * 13) % cellPx` to derive offsets. Each rect is 1–2px, giving a cobblestone/flagstone feel.
3. For `dungeon` palette: draw a subtle 1px mortar line grid (every 4 cells, draw a thin `rgba(0,0,0,0.2)` line on the bottom and right edge of the cell).
4. For `cave` palette: draw irregular 1-2px dark speckle dots.
5. For `temple` palette: alternate light/dark diagonal checker at sub-cell level.

For `T_WALL` cells:
1. Draw `wallBg` base rect.
2. Draw `wallFg` top 60% of cell (brickwork face).
3. Add 2–3 horizontal mortar lines as 1px `wallShadow` rects at deterministic y offsets.
4. Add vertical joint lines every ~4px using `wallShadow`.
5. Add 1px `wallFg` highlight on top edge for 3D ledge effect.
6. Draw `wallShadow` gradient on the bottom 20% of cell (underside depth).

For `T_WATER` / `T_LAVA` animated cells:
1. Use `animPhase` to shift the wave rect positions using `sin(animPhase * TAU + gx * 0.5)` for ripple.
2. Add a specular highlight dot that moves per `animPhase` for each cell.

---

### PROMPT 3-B — Tile Height / Extrusion Suggestion Pass

File: `frontend/src/lib/dungeonTileRenderer.ts`

Add a **2.5D height suggestion pass** that draws simple isometric-style side faces on wall tiles to make them look like they have physical height. This is an overlay pass that runs after the main tile render.

For every `T_WALL` cell where the cell directly south (`gy+1`) is NOT a wall (is floor/corridor/void/etc.):
1. Draw a **south face** — a rect spanning the full cell width, 4px tall, positioned just BELOW the current cell (top 4px of the next row down). Color: a dark variant of `wallBg` (`rgba(0,0,0,0.7)` multiply over whatever is there, or a darkened `wallBg` hex).
2. Apply this only when the south neighbor cell is within grid bounds.

For every `T_WALL` cell where the cell directly east (`gx+1`) is NOT a wall:
1. Draw an **east face** — a rect 3px wide, full cell height, positioned at the left edge of the eastern cell. Color: slightly less dark than the south face.

For `T_PILLAR` cells:
1. Always draw both south and east faces (pillars are always isolated).
2. Make the faces slightly lighter than wall faces to distinguish pillar material.

This gives the map a subtle but effective "dungeon blocks are cubes" perspective without a full isometric transform. This pass is gated on a new `RenderTileOpts` boolean flag: `depthPass?: boolean` (default `false` so existing behavior is preserved until DM enables it).

---

### PROMPT 3-C — Scene Depth Composite: Fog Gradient & Vignette

File: `frontend/src/lib/dungeonTileRenderer.ts`

After all tile and entity rendering is complete, add two **post-process overlay passes** controlled by new `RenderTileOpts` flags:

**Pass 1 — Radial Vignette** (`vignettePass?: boolean`):
1. Create a radial gradient from the canvas center outward.
2. Center: `rgba(0,0,0,0)` (transparent).
3. Outer edge (radius = canvas diagonal/2): `rgba(0,0,0,0.45)`.
4. Draw this gradient over the entire canvas using `globalCompositeOperation = "multiply"`.
5. This simulates the edge-of-vision darkening that makes maps feel like they're lit from a central point.

**Pass 2 — Depth Fog** (`depthFog?: boolean`):
1. For each cell, compute a "depth value" based on distance from the nearest scene light or player token.
2. Cells beyond 12 grid cells from any light source get a `rgba(0,0,0, depthAlpha)` overlay where `depthAlpha` ramps from 0 to 0.6 as distance goes from 8 to 16 cells.
3. This is in addition to the regular `fogCells`-based fog of war — it applies atmospheric depth even in visible areas.

Both passes must skip when `inkSaver` is true.

---

## PHASE 4 — Isometric / 3D Camera Mode

---

### PROMPT 4-A — Isometric Tile Renderer Core

Create a new file `frontend/src/lib/isometricTileRenderer.ts`.

This renderer converts the existing flat `RenderCell[][]` grid into an isometric (2:1 diamond) view inspired by Chrono Trigger's top-oblique perspective. It renders to an HTML Canvas using Canvas 2D API (no WebGL required for the base version).

Implement:

```typescript
export type IsometricRenderOpts = {
  grid: RenderCell[][];
  palette: TilePalette;
  entities: EntityPalette;
  tileW: number;        // width of one iso diamond in px (default 64)
  tileH: number;        // height of one iso diamond in px (default 32)
  wallH: number;        // pixel height of wall extrusion (default 32)
  animPhase?: number;
  showEnts?: boolean;
  fogCells?: Set<string> | null;
  sceneLights?: SceneLight[] | null;
  lightMap?: Float32Array | null;
  cols: number;
  rows: number;
};

export function renderIsometricToCanvas(
  canvas: HTMLCanvasElement,
  opts: IsometricRenderOpts,
): void
```

The rendering algorithm:
1. **Coordinate transform**: Convert grid `(gx, gy)` to screen `(sx, sy)` using:
   - `sx = (gx - gy) * (tileW / 2) + canvasWidth / 2`
   - `sy = (gx + gy) * (tileH / 2) + wallH`
2. **Painter's algorithm**: Render cells in order from back-left to front-right (iterate `gy` from 0 to rows, then `gx` from 0 to cols within each row).
3. **Floor tiles**: Draw a filled diamond (parallelogram) using 4-point polygon for each non-void, non-wall cell. Use the same palette colors as the flat renderer.
4. **Wall tiles**: Draw the floor diamond on top PLUS two visible side faces (south-west and south-east trapezoids) of height `wallH` using darkened palette colors. Left face = `wallBg` at 80% brightness, right face = `wallBg` at 60% brightness.
5. **Water/Lava**: Animate using `animPhase` — shift the tile top surface color between two palette values.
6. **Entities**: After all tiles, draw entity tokens (M/^/!) as sprites centered on the iso tile top face. Scale to `tileW * 0.7` wide.
7. **Lighting**: Apply the `lightMap` Float32Array darkness overlay per cell — darken iso diamond faces proportionally.
8. **Void cells**: Skip entirely (transparent).
9. **Canvas sizing**: Auto-size the canvas to `(cols + rows) * tileW/2` wide × `(cols + rows) * tileH/2 + wallH` tall.

---

### PROMPT 4-B — Isometric Map Canvas React Component

Create `frontend/src/components/dungeon-forge/IsometricMapCanvas.tsx`.

This is a React component that wraps `renderIsometricToCanvas` from `isometricTileRenderer.ts` with the same props interface as `DungeonMapCanvas` (import the `DungeonMapCanvasProps` type from `DungeonMapCanvas.tsx` and use `Omit<DungeonMapCanvasProps, 'cellPx'>` extended with iso-specific props):

```typescript
export type IsometricMapCanvasProps = Omit<DungeonMapCanvasProps, 'cellPx'> & {
  tileW?: number;   // default 64
  tileH?: number;   // default 32
  wallH?: number;   // default 30
};
```

The component should:
1. Use `useRef<HTMLCanvasElement>` and call `renderIsometricToCanvas` in a `useEffect` that watches all grid/palette/entity/anim props (mirror the dependency array in `DungeonMapCanvas.tsx`).
2. Build a `lightMap` by calling `buildLightMap` from `dungeonLightOcclusion.ts` whenever `sceneLights` or `lighting` changes.
3. Handle click events by converting screen coordinates back to grid coordinates using the inverse iso transform:
   - `gx = Math.round((sx - canvasWidth/2) / tileW + sy / tileH) / 2`
   - `gy = Math.round(sy / tileH - (sx - canvasWidth/2) / tileW) / 2`
   Then call `onCellClick?.(gx, gy, cell)`.
4. Export as `memo`-wrapped default export matching the pattern in `DungeonMapCanvas.tsx`.
5. Include a `data-iso-canvas` attribute on the canvas element for testing.

---

### PROMPT 4-C — View Mode Toggle in DungeonForge

Files: `frontend/src/components/dungeon-forge/DungeonForge.tsx`, `frontend/src/components/dungeon-forge/DungeonForgeImpl.jsx`

Add a **view mode toggle** to the Dungeon Forge UI that switches between three rendering modes:

1. **Flat** (current default) — uses `DungeonMapCanvas`
2. **Depth** — uses `DungeonMapCanvas` with `depthPass={true}`, `vignettePass={true}`, `depthFog={true}`
3. **Isometric** — uses `IsometricMapCanvas` with `tileW={64}` `tileH={32}` `wallH={30}`

Implementation:
1. Add a `viewMode: "flat" | "depth" | "iso"` state to the DungeonForge component (default: `"flat"`).
2. Add a toggle button group in the map toolbar (near the existing zoom/export controls). Use three icon-buttons: a flat grid icon, a shaded grid icon, and a cube/iso icon. Style with the existing `dnd-border` / `dnd-darker` Tailwind classes.
3. Pass `viewMode` down to the map rendering section. Conditionally render:
   - `viewMode === "flat"` → existing `<DungeonMapCanvas .../>` unchanged
   - `viewMode === "depth"` → `<DungeonMapCanvas ... depthPass vignettePass depthFog />`
   - `viewMode === "iso"` → `<IsometricMapCanvas ... tileW={64} tileH={32} wallH={30} />`
4. Persist the chosen `viewMode` to `localStorage` key `"dungeon-forge-view-mode"` so it survives page refresh.
5. In isometric mode, disable the cell-click editing tools that rely on flat grid coordinates (show a `"Switch to Flat mode to edit"` tooltip on those tools). Read-only/DM view in iso mode is fine.
6. Add a smooth CSS transition on the map container div when switching modes: `transition: opacity 0.2s ease`.

---

### PROMPT 4-D — Isometric Camera Controls

File: `frontend/src/components/dungeon-forge/IsometricMapCanvas.tsx`

Add **camera pan and zoom** to the isometric canvas:

1. Add `cameraOffset: { x: number; y: number }` and `cameraZoom: number` state (default zoom 1.0, range 0.4–2.0).
2. **Pan**: Click-drag on the canvas (when not over a token) pans the camera. Track `mousedown` start position and delta, update `cameraOffset`.
3. **Zoom**: Mouse wheel zooms. `cameraZoom += event.deltaY * -0.001`, clamped to 0.4–2.0. Zoom is centered on mouse position.
4. Apply camera transform in `renderIsometricToCanvas` using `ctx.setTransform(zoom, 0, 0, zoom, offsetX, offsetY)` before drawing, reset after.
5. Add a mini-map overlay in the top-right corner of the canvas: a 120×80px box that draws a flat top-down representation of the grid at very small scale (2px per cell), with a white rectangle showing the current viewport. This uses a second off-screen canvas drawn into the main canvas via `ctx.drawImage`.
6. Add keyboard support: arrow keys pan by 32px per press, `+`/`-` zoom by 0.1.
7. Export a `resetCamera()` imperative handle via `useImperativeHandle` so the parent can add a "Reset View" button.

---

### PROMPT 4-E — Three.js Enhanced 3D Mode (Advanced)

Create `frontend/src/components/dungeon-forge/DungeonForge3D.tsx`.

This is an **optional enhanced 3D renderer** using Three.js (r128, already available in the project). It renders the dungeon as actual 3D geometry with a Chrono Trigger-style oblique camera angle (perspective camera at ~60° pitch, panning enabled).

Implementation plan:
1. Import Three.js: `import * as THREE from 'three'`
2. **Scene setup**: `PerspectiveCamera` with `fov: 50`, positioned at `(gridCols/2, gridRows * 0.8, gridRows * 0.9)` looking at grid center. This gives the CT-style top-oblique angle.
3. **Geometry per tile type**:
   - `T_FLOOR` / `T_CORRIDOR`: Flat `PlaneGeometry(1, 1)` at y=0, textured with palette floor color + procedural noise texture (create from `DataTexture`)
   - `T_WALL`: `BoxGeometry(1, 1.5, 1)` with y=0.75, textured with wall palette — gives visible top + two front faces from camera angle
   - `T_WATER`: Animated flat plane with vertex shader shimmer (use built-in Three.js `MeshStandardMaterial` with `color` animated in `animPhase` update loop)
   - `T_DOOR`: Thin box (`BoxGeometry(0.8, 1.2, 0.1)`) with door color
   - `T_PILLAR`: `CylinderGeometry(0.25, 0.3, 1.8, 8)` (8-sided, no CapsuleGeometry — that's r142+)
   - `T_STAIRS_DOWN`/`T_STAIRS_UP`: Stepped `BoxGeometry` arrangement (3 stair steps)
4. **Lighting**:
   - Add one `AmbientLight` at low intensity (0.3)
   - For each `SceneLight`, add a `PointLight` at `(gx, 1, gy)` with color matching the light `kind` and distance `radiusCells`
5. **Entities**: Render monster/item/trap markers as `Sprite` with the SVG token as a `SpriteMaterial` texture (loaded via `TextureLoader`)
6. **Camera controls**: Implement a simple orbit-pan (no OrbitControls import — it's not on cdnjs r128). Mouse drag rotates around the Y axis (limited ±45° from default), scroll wheel zooms.
7. **Fog**: Use `THREE.FogExp2` with density matching `dungeonLighting` mode.
8. **Resize handling**: ResizeObserver on the container div, call `renderer.setSize` and `camera.updateProjectionMatrix`.
9. Accept the same prop interface as `IsometricMapCanvas` so it can be swapped in as `viewMode === "3d"`.
10. Add `"3d"` as a fourth option to the view mode toggle in `DungeonForge.tsx` (from Prompt 4-C). Gate it behind a `Suspense` boundary since Three.js is heavy — use `React.lazy`.

---

## PHASE 5 — Wire Everything Together & Polish

---

### PROMPT 5-A — Connect New Lights to DungeonForgeImpl

File: `frontend/src/components/dungeon-forge/DungeonForgeImpl.jsx`

The main Forge component currently calls `collectTorchFixtureLights` from `forgeWallLights.ts` to populate `sceneLights`. Replace this with the new `collectBiomeLights` from Prompt 2-E.

1. Import `collectBiomeLights` from `@/lib/forgeWallLights`.
2. Find where `sceneLights` is computed (search for `collectTorchFixtureLights` in this file).
3. Replace the call with: `collectBiomeLights(rawGrid, rooms, locationType, mapSeed)` where `mapSeed` is derived from the map name string: `mapSeed = mapName.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0)`.
4. Pass the result to `DungeonMapCanvas` as `sceneLights`.
5. Also pass `dungeonLighting` through to the canvas if not already — find where `dungeonLighting` is set and ensure it flows to `<DungeonMapCanvas dungeonLighting={dungeonLighting} />`.

---

### PROMPT 5-B — Token Registry: Wire New Monster Slugs to Renderer

File: `frontend/src/lib/tokenSprites.ts` + `frontend/src/lib/useMapEntityTokenImages.ts`

After all the new SVG tokens from Phase 1 have been created:

1. In `tokenSprites.ts`, verify the `MONSTER_TOKEN_SPRITES` record has entries for all slugs from Prompts 1-A, 1-B, 1-C. Add any that are missing. The key should be the monster name in lowercase with spaces replaced by hyphens (e.g., `"mind flayer"` → `"mind-flayer"`).

2. In `useMapEntityTokenImages.ts`, find where it resolves a monster's image URL. Ensure it calls `monsterTokenSprite(cell.extra?.slug ?? cell.eName)` so the new sprites are loaded. The `cell.extra` field may have a `slug` property — prefer that over `eName` for lookup.

3. Add a fallback resolution: if no exact slug match, try matching on partial name. For example, if slug is `"young red dragon"`, try keys: `"young-red-dragon"`, `"red-dragon"`, `"dragon-red"`, `"dragon"` in that order.

4. Add a new exported function `monsterTokenSpriteWithFallback(slug: string): string` implementing this waterfall.

---

### PROMPT 5-C — DM Hints: Depth Pass Toggle in DM Toolbar

File: `frontend/src/components/dungeon-forge/DungeonForge.tsx` (or wherever the DM toolbar lives — search for `forgeDmHints`)

Add three new DM-only toggle controls in the map controls toolbar:

1. **"Wall Depth"** toggle (checkbox or icon button) — when on, passes `depthPass={true}` to `DungeonMapCanvas`. Persists in state.
2. **"Ambient Occlusion"** toggle — when on, passes `aoPass={true}` to `DungeonMapCanvas`. Add `aoPass?: boolean` to `RenderTileOpts` and implement the AO logic from Prompt 2-D gated on this flag.
3. **"Vignette"** toggle — when on, passes `vignettePass={true}`. Gated flag from Prompt 3-C.

All three default to `false`. Group them under a collapsible "Visual FX" section in the DM toolbar. These settings are DM-only and do NOT need to be broadcast to the player TV view.

---

### PROMPT 5-D — Player TV View: Isometric Mode Broadcast

Files: `frontend/src/lib/playerMapBroadcast.ts`, `frontend/src/pages/DungeonsPlayerPage.tsx`

The DM's view mode should optionally broadcast to the player TV screen:

1. Add `viewMode?: "flat" | "depth" | "iso"` to `PlayerDungeonData` in `playerMapBroadcast.ts`.
2. In the DM's broadcast logic (search for `BroadcastChannel("dnd5e-player-map")`), include the current `viewMode` in the payload when it is `"iso"` or `"depth"` (flat is the default and doesn't need to be included).
3. In `DungeonsPlayerPage.tsx`, read `viewMode` from the received broadcast and:
   - If `"iso"`: render `<IsometricMapCanvas>` instead of `<DungeonMapCanvas>`
   - If `"depth"`: render `<DungeonMapCanvas depthPass vignettePass />`
   - Otherwise: existing flat render
4. The player TV always gets read-only mode — no click handlers needed on the iso canvas in this context.

---

## Summary: File Creation Checklist

**New SVG files (create in batches per prompt above):**
- `frontend/public/tokens/pixel/monster-*.svg` (x60 new monster tokens)
- `frontend/public/tokens/pixel/items/item-*.svg` (x30 item/trap tokens)
- `frontend/public/tokens/pixel/deco/deco-*.svg` (x15 deco tokens)

**New TypeScript/TSX files:**
- `frontend/src/lib/itemTokenSprites.ts`
- `frontend/src/lib/isometricTileRenderer.ts`
- `frontend/src/components/dungeon-forge/IsometricMapCanvas.tsx`
- `frontend/src/components/dungeon-forge/DungeonForge3D.tsx`

**Modified files:**
- `frontend/src/lib/tokenSprites.ts` — expand MONSTER_TOKEN_SPRITES
- `frontend/src/lib/dungeonLightOcclusion.ts` — ray-march shadow casting
- `frontend/src/lib/dungeonTileRenderer.ts` — wall shadows, AO, depth pass, vignette, colored lights, tile textures
- `frontend/src/lib/playerMapBroadcast.ts` — colored lights + viewMode broadcast
- `frontend/src/lib/forgeWallLights.ts` — biome-aware light placement
- `frontend/src/lib/useMapEntityTokenImages.ts` — improved slug resolution
- `frontend/src/components/dungeon-forge/DungeonForge.tsx` — view mode toggle, FX toggles
- `frontend/src/components/dungeon-forge/DungeonForgeImpl.jsx` — wire collectBiomeLights
- `frontend/src/pages/DungeonsPlayerPage.tsx` — viewMode from broadcast

---

## Recommended Execution Order

1. **1-A** → **1-B** → **1-C** → **1-D** → **1-E** (all SVG art first — no deps)
2. **2-A** (light occlusion) → **2-B** (colored lights) → **2-C** (wall shadows) → **2-D** (AO) → **2-E** (biome lights)
3. **3-A** (tile textures) → **3-B** (height extrusion) → **3-C** (vignette/fog)
4. **4-A** (iso renderer core) → **4-B** (iso canvas component) → **4-C** (view toggle) → **4-D** (iso camera) → **4-E** (Three.js 3D — optional/last)
5. **5-A** → **5-B** → **5-C** → **5-D** (wiring everything together)

> Run phases 1–3 independently of each other — they don't touch the same files. Phase 4 depends on Phase 3 types. Phase 5 depends on all prior phases.
