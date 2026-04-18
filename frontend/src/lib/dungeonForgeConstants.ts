/** Tile types — must stay in sync with Dungeon Forge generator. */
export const DUNGEON_T = {
  V: 0,
  F: 1,
  W: 2,
  D: 3,
  C: 4,
  SD: 5,
  SU: 6,
  WA: 7,
  P: 8,
  ROAD: 9,
  BRIDGE: 10,
  LAVA: 11,
} as const;

export type DungeonTileId = (typeof DUNGEON_T)[keyof typeof DUNGEON_T];
