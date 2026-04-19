/**
 * Tiny procedural “ground floor” maps for town/castle buildings (TN-010 / keep interior).
 * Max footprint 10×8 — DM overlay, not linked to main map topology.
 */

import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

export type InteriorSnapshot = {
  grid: number[][];
  width: number;
  height: number;
  entities: Array<Record<string, unknown> & { x: number; y: number; type: string; name?: string; mapGlyph?: string }>;
  decoOverlay: Array<{ x: number; y: number; ch: string; fg?: string; name?: string; decoKey?: string }>;
  title: string;
  featureLines: string[];
  locationType: "dungeon";
};

/** Stamp a hollow rectangle: interior F, ring W, void outside. */
function stampRoom(
  grid: number[][],
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  W: number,
  H: number,
): void {
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = T.F;
    }
  }
  for (let y = ry - 1; y <= ry + rh; y++) {
    for (let x = rx - 1; x <= rx + rw; x++) {
      if (y >= 0 && y < H && x >= 0 && x < W && grid[y][x] === T.F) grid[y][x] = T.W;
    }
  }
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = T.F;
    }
  }
}

/**
 * @param archetype — town `buildingArchetype` or castle label keyword
 */
export function generateBuildingInteriorSnapshot(archetype: string, _seed: number): InteriorSnapshot {
  const W = 10;
  const H = 8;
  const grid: number[][] = Array.from({ length: H }, () => Array(W).fill(T.V));
  const entities: InteriorSnapshot["entities"] = [];
  const decoOverlay: InteriorSnapshot["decoOverlay"] = [];
  const a = archetype.toLowerCase();
  const featureLines: string[] = [];

  stampRoom(grid, 1, 1, W - 2, H - 2, W, H);
  const doorX = Math.floor(W / 2);
  grid[H - 2][doorX] = T.D;
  featureLines.push("Main entrance (south).");

  if (/tavern|inn/.test(a)) {
    featureLines.push("Bar along the north wall; common room tables.");
    for (let i = 0; i < 3; i++) {
      decoOverlay.push({
        x: 3 + i * 2,
        y: H - 4,
        ch: "▭",
        fg: "#8a6a40",
        name: "Table",
        decoKey: "int_table",
      });
    }
    decoOverlay.push({ x: 2, y: 2, ch: "═", fg: "#a08050", name: "Bar", decoKey: "int_bar" });
    grid[2][7] = T.SU;
    featureLines.push("Stairs up (east) to guest rooms.");
  } else if (/blacksmith|stable/.test(a)) {
    featureLines.push("Forge pit center; tool racks along walls.");
    decoOverlay.push({ x: 5, y: 4, ch: "◎", fg: "#c40", name: "Forge", decoKey: "int_forge" });
    decoOverlay.push({ x: 7, y: 3, ch: "†", fg: "#666", name: "Weapon rack", decoKey: "int_rack" });
  } else if (/temple|chapel|shrine/.test(a)) {
    featureLines.push("Open nave; altar on the far end.");
    decoOverlay.push({ x: 5, y: 2, ch: "⊕", fg: "#cc8", name: "Altar", decoKey: "int_altar" });
  } else if (/market|stall|general|store|apothecary/.test(a)) {
    featureLines.push("Counter and shelves; back store room.");
    decoOverlay.push({ x: 2, y: 4, ch: "▤", fg: "#888", name: "Counter", decoKey: "int_counter" });
  } else if (/barrack|guard/.test(a)) {
    featureLines.push("Bunk beds along walls; weapon rack.");
    decoOverlay.push({ x: 3, y: 3, ch: "▭", fg: "#666", name: "Bunk", decoKey: "int_bunk" });
    entities.push({ type: "landmark", x: 7, y: 4, name: "Locker", mapGlyph: "▣" });
  } else if (/great|throne|keep|hall|castle|chamber/.test(a)) {
    featureLines.push("Great chamber: dais north, side doors.");
    decoOverlay.push({ x: 5, y: 2, ch: "♔", fg: "#cb8", name: "Dais", decoKey: "int_dais" });
    grid[4][2] = T.SD;
    featureLines.push("Stair down to stores (west bay).");
  } else {
    featureLines.push("Simple hall; partition and hearth.");
    decoOverlay.push({ x: 5, y: 5, ch: "¤", fg: "#a62", name: "Hearth", decoKey: "int_hearth" });
  }

  const title = `Interior — ${archetype.replace(/_/g, " ")}`;
  return {
    grid,
    width: W,
    height: H,
    entities,
    decoOverlay,
    title,
    featureLines,
    locationType: "dungeon",
  };
}
