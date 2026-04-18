export type SessionTemplate =
  | "linear_town_to_dungeon"
  | "linear_town_to_castle"
  | "hub_and_spoke"
  | "custom";

export type SessionMapSlot = {
  locationType: string;
  seedOffset: number;
};

/**
 * Session-scale multi-map (shared seed lineage). Full exit linking is future work.
 */
export function planSessionMaps(template: SessionTemplate, _baseSeed: number, custom?: SessionMapSlot[]): SessionMapSlot[] {
  if (template === "custom" && custom?.length) return custom;
  if (template === "linear_town_to_dungeon") {
    return [
      { locationType: "town", seedOffset: 0 },
      { locationType: "road", seedOffset: 100_003 },
      { locationType: "dungeon", seedOffset: 200_007 },
    ];
  }
  if (template === "linear_town_to_castle") {
    return [
      { locationType: "town", seedOffset: 0 },
      { locationType: "road", seedOffset: 100_003 },
      { locationType: "castle", seedOffset: 200_007 },
    ];
  }
  if (template === "hub_and_spoke") {
    return [
      { locationType: "town", seedOffset: 0 },
      { locationType: "road", seedOffset: 50_001 },
      { locationType: "dungeon", seedOffset: 100_002 },
      { locationType: "road", seedOffset: 150_003 },
      { locationType: "cave", seedOffset: 200_004 },
    ];
  }
  return [{ locationType: "dungeon", seedOffset: 0 }];
}

export function sessionSeedForIndex(baseSeed: number, index: number, slot: SessionMapSlot): number {
  return (baseSeed ^ slot.seedOffset ^ index * 7919) >>> 0;
}

/** Placeholder: theme tint hint for cross-map continuity */
export function sessionHueShift(baseSeed: number): number {
  return (baseSeed % 360) / 360;
}
