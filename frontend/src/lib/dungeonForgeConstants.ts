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
  /** Hidden passage — DM sees "?", players see plain wall until revealed. */
  SECRET_DOOR: 12,
  /** Mass grave / sunken ground — traversable, difficult terrain. */
  PIT: 13,
  /** Iron gate (perimeter entrance) — door-like passability. */
  GATE: 14,
  /** Castle drawbridge — passable when “open”, impassable when raised. */
  DRAWBRIDGE: 15,
  /** Headstone — blocks movement, half-cover note in UI. */
  HEADSTONE: 16,
  /** Narrow arrow slit in wall — DM marker. */
  ARROW_SLIT: 17,
  /** Murder hole / murder slot in ceiling — DM marker. */
  MURDER_HOLE: 18,
  /** Prison / oubliette bars — DM marker. */
  CELL_BARS: 19,
  /** Narrow alley (town) — road tile variant. */
  ALLEY: 20,
} as const;

export type DungeonTileId = (typeof DUNGEON_T)[keyof typeof DUNGEON_T];
