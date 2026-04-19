# Cursor Agent Prompt — Dungeon Forge Map System Bug Fixes
> **Scope:** `frontend/src/components/dungeon-forge/`, `frontend/src/lib/dungeon*`, `frontend/src/lib/forge*`, `backend/src/services/proceduralDungeon*.ts`
> **Goal:** Fix all bugs in the map generation and rendering pipeline so maps are functionally correct and child-DM friendly.

---

## System Overview
The Dungeon Forge supports **11 location types**: dungeon, town, castle, graveyard, swamp, cave, temple, sewer, road (wilderness), volcanic_lair, fey_forest.

---

## Bug Fixes

### FIX-MAP-001 — `seededRNG` breaks permanently when seed = 0
**File:** `frontend/src/components/dungeon-forge/DungeonForgeImpl.jsx` ~line 28
**Bug:** Park-Miller LCG requires `seed >= 1`. With `seed = 0`, `0 * 16807 % 2147483647 = 0` — the RNG stays at 0 forever. All `rng()` calls return a negative value, causing `Math.floor(rng() * array.length) = -1` and all array picks return `undefined`.

**Fix:**
```js
function seededRNG(seed) {
  let s = Math.max(1, Math.abs(Math.round(seed)) || 1); // guard: never 0
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
```
Also: when the user submits seed = 0 in the UI, display a warning: "Seed 0 is not valid — using seed 1 instead."

---

### FIX-MAP-002 — Corridor carving overwrites existing floor tiles, cutting dark strips through room interiors
**File:** `DungeonForgeImpl.jsx` ~line 1621
**Bug:** `canCarve = (t) => t === T.V || t === T.W || t === T.F` — this overwrites `T.F` room floor tiles with `T.C` corridor tiles, causing room interiors to visually fragment.

**Fix:** Remove `T.F` from the carvable set. Corridors should carve through void and walls only, and stop (not overwrite) when they reach an existing room floor:
```js
const canCarve = (t) => t === T.V || t === T.W;
```
Where a corridor meets an existing `T.F` floor, the path is considered connected — stop carving.

---

### FIX-MAP-003 — Room depth calculation uses `id === 1` as the entrance, which may not be correct
**File:** `DungeonForgeImpl.jsx` ~lines 1595–1600
**Bug:** `const r0 = rooms.find(r => r.id === 1) ?? rooms[0]` — for caves, graveyards, swamps, and road maps, `id === 1` may be a random island far from the intended entrance. Depth values are inverted.

**Fix:** For each layout type, tag the intended entrance room explicitly:
```js
// For each layout generator, mark the first-placed room or the room closest to (0, H/2) as the entrance
const entranceRoom = rooms.reduce((best, r) => {
  const d = Math.abs(r.cx - 0) + Math.abs(r.cy - H / 2);
  return d < (Math.abs(best.cx - 0) + Math.abs(best.cy - H / 2)) ? r : best;
}, rooms[0]);
```
Use `entranceRoom` instead of `rooms.find(r => r.id === 1)` for BFS depth calculations.

---

### FIX-MAP-004 — Graveyard door placement can fail to create accessible doors
**File:** `DungeonForgeImpl.jsx` ~lines 969–973
**Bug:** Door placement at `ry-1` can fail if a previously placed room's floor tile occupies that cell (it's `T.F`, not `T.W`), leaving mausolea with no entry point.

**Fix:** When placing a door, check that the target cell is actually `T.W`. If it is `T.F` (already open floor from an adjacent structure), the door is not needed — treat the boundary as already passable. If the cell is `T.V` (void), first place a wall tile then a door, or simply open the floor:
```js
function tryPlaceDoor(grid, y, x) {
  const t = grid[y]?.[x];
  if (t === T.W) { grid[y][x] = T.D; return true; }
  if (t === T.F || t === T.C) return true; // already open, no door needed
  return false; // can't place
}
```

---

### FIX-MAP-005 — Swamp bridge construction can seal off islands when bridge paths cross
**File:** `DungeonForgeImpl.jsx` ~lines 1217–1222
**Bug:** Wall-flanking of bridge tiles converts adjacent `T.WA` (water) to `T.W` (wall), blocking parallel bridge BFS paths.

**Fix:** Separate the "place bridge tile" step from the "flank with walls" step. Only add wall flanking AFTER all bridge paths are fully computed — do not mutate water tiles during path construction:
```js
// Phase 1: compute all bridge paths (BFS), collect all bridge cells
// Phase 2: place T.BRIDGE for all cells in all paths
// Phase 3: for each bridge cell, add T.W flanks only on cells that are still T.WA (never T.BRIDGE or T.F)
```

---

### FIX-MAP-006 — Cave/volcanic_lair/fey_forest corridors are 3 cells wide, destroying wall detail
**File:** `DungeonForgeImpl.jsx` ~line 903
**Bug:** `carveWindingCorridor(grid, rooms[ba], rooms[bb], W, H, rng, 2)` uses `widthTiles=2` which produces a 3×3 brush radius, merging adjacent rooms into open blobs.

**Fix:** Use narrower corridors for organic map types:
```js
const corridorWidth = ["volcanic_lair", "fey_forest", "cave"].includes(locationType) ? 1 : 2;
carveWindingCorridor(grid, rooms[ba], rooms[bb], W, H, rng, corridorWidth);
```

---

### FIX-MAP-007 — Sewer map: water tiles placed in corridors make paths impassable to BFS/fog
**File:** `DungeonForgeImpl.jsx` ~lines 213–218; `dungeonForgeFog.ts` ~line 163
**Bug:** ~25% of corridor tiles are converted to `T.WA` (water), but `isDungeonGridWalkable` does not include `T.WA`. BFS cannot cross water in sewers, splitting the map's traversable graph.

**Fix:**
```ts
// In isDungeonGridWalkable (dungeonForgeFog.ts or dungeonGridMovement.ts):
// Add T.WA for maps where water is walkable (sewer, swamp bridges)
export function isDungeonGridWalkable(tile: number, locationType?: string): boolean {
  const alwaysWalkable = [T.F, T.C, T.D, T.ROAD, T.BRIDGE, T.LAVA];
  const waterWalkable = ["sewer", "swamp"].includes(locationType ?? "");
  return alwaysWalkable.includes(tile) || (waterWalkable && tile === T.WA);
}
```
Pass `locationType` through to all BFS / fog-expansion calls.

---

### FIX-MAP-008 — Monsters can be placed on wall or void tiles in cave/fey_forest layouts
**File:** `DungeonForgeImpl.jsx` ~lines 1488–1491
**Bug:** Monster placement loop exits after 15 tries without checking the tile type. In organic rooms, the bounding box contains void tiles where monsters can be placed.

**Fix:** Add a tile check inside the loop:
```js
do {
  mx = rI(room.x + 1, room.x + room.w - 2, rng);
  my = rI(room.y + 1, room.y + room.h - 2, rng);
  tries++;
} while (tries < 15 && (usedCells.has(`${mx},${my}`) || !isFloor(grid[my]?.[mx])));

function isFloor(tile) {
  return [T.F, T.C, T.ROAD, T.BRIDGE].includes(tile);
}
```
If no valid cell is found after 15 tries, skip placing that monster (don't add to entities).

---

### FIX-MAP-009 — `DungeonLegend` shows wrong symbols for most location types
**File:** `frontend/src/components/dungeon-forge/DungeonLegend.tsx`
**Bug:** The legend always shows `▓=Wall`, `·=Floor`, etc., but each palette uses different characters. Players in a graveyard see `▓` in the legend but `†` on the map.

**Fix:** Make the legend dynamic based on `locationType`:
```tsx
const legendByType: Record<string, Array<{ symbol: string; label: string }>> = {
  graveyard: [
    { symbol: "†", label: "Wall / Fence" },
    { symbol: "·", label: "Ground" },
    { symbol: "▣", label: "Gate / Door" },
    // ...
  ],
  swamp: [
    { symbol: "≈", label: "Wall / Thicket" },
    { symbol: "~", label: "Water" },
    // ...
  ],
  // etc.
};
const items = legendByType[locationType] ?? defaultLegend;
```

---

### FIX-MAP-010 — Water tiles (`T.WA`) are invisible to fog BFS — revealed rooms with water pools have dark holes
**File:** `dungeonForgeFog.ts` ~line 141
**Bug:** `T.WA` is not in the BFS traversal tile list, so water tiles within revealed rooms are never added to the visible cell set. Players see black holes in the middle of rooms.

**Fix:**
```ts
// In computeVisibleCellsForPlayer BFS:
const traversable = [T.F, T.C, T.D, T.ROAD, T.BRIDGE, T.LAVA, T.WA]; // add T.WA
```

---

### FIX-MAP-011 — Castle courtyard floor tiles are overwritten by corridor tiles (`T.F` → `T.C`)
**File:** `DungeonForgeImpl.jsx` ~lines 1058, 1621
**Bug:** `carvePath` is called with `isRoad=false` between rooms; it converts the courtyard's `T.F` floor tiles to `T.C` corridor tiles, making the courtyard render with dark corridor coloring.

**Fix:** Apply FIX-MAP-002 (remove `T.F` from carvable set). Additionally, for the Castle layout, after all corridors are carved, restore any `T.C` tiles inside the courtyard bounding box back to `T.F`:
```js
// After corridor carving for castle:
const courtyardY1 = keepY + keepH, courtyardY2 = keepY + keepH + courtyardH;
const courtyardX1 = keepX, courtyardX2 = keepX + keepW;
for (let y = courtyardY1; y < courtyardY2; y++) {
  for (let x = courtyardX1; x < courtyardX2; x++) {
    if (grid[y][x] === T.C) grid[y][x] = T.F;
  }
}
```

---

### FIX-MAP-012 — Stairs can be placed on water, lava, or bridge tiles
**File:** `DungeonForgeImpl.jsx` ~line 631
**Bug:** `placeStairsOnGrid` accepts `T.WA`, `T.BRIDGE`, and `T.LAVA` as valid cells.

**Fix:** Restrict to floor/corridor only:
```js
const ok = (t) => t === T.F || t === T.C;
```

---

### FIX-MAP-013 — Monster killed in combat doesn't decrement map entity count when entity was placed by name (not slug)
**File:** `frontend/src/lib/dungeonEntityUpdates.ts` ~lines 16–43
**Bug:** `decrementForgeMonsterBySlug` matches by `e.slug` — entities placed by name (when slug resolution fails) have an empty slug, so the map never removes them.

**Fix:** Add a fallback match by `name`:
```ts
export function decrementForgeMonsterBySlug(entities, slug: string, name?: string) {
  return entities.map(e => {
    const matchBySlug = e.slug && String(e.slug) === slug;
    const matchByName = name && e.name?.toLowerCase() === name.toLowerCase();
    if ((matchBySlug || matchByName) && e.count > 0) {
      return { ...e, count: e.count - 1 };
    }
    return e;
  }).filter(e => e.count > 0);
}
```

---

## Verification Steps

After applying all fixes:
1. Generate a map with seed=0. Confirm a valid map is produced (no infinite blank maps or crashes).
2. Generate a Dungeon. Confirm corridors do not create dark strips through room interiors.
3. Generate a Graveyard. Confirm all mausolea have at least one accessible door/gate.
4. Generate a Swamp. Confirm all islands are reachable via bridges (no isolated islands).
5. Generate a Cave. Confirm corridors are 1 tile wide (not 3).
6. Generate a Sewer. Confirm player tokens can move through water channels in the walkable grid.
7. Generate a Cave / Fey Forest. Place monsters. Confirm no monsters appear inside walls.
8. Open the legend in a Graveyard. Confirm it shows the graveyard-specific symbols.
9. Generate any map with water pools. Move a token to reveal the room. Confirm water tiles are revealed (not black holes).
10. Kill a monster in combat that was placed from the map. Confirm the entity count on the map updates immediately.
