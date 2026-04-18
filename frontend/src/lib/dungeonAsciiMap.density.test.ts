import { describe, expect, it } from "vitest";
import { buildAsciiDungeonMap } from "./dungeonAsciiMap";
import type { DungeonMapRoom } from "./dungeonMapCanvas";

const rooms: DungeonMapRoom[] = [
  {
    layoutId: "1",
    id: "1",
    name: "Hall",
    x: 0,
    y: 0,
    width: 3,
    height: 2,
    exits: { north: null, south: null, east: null, west: null },
  },
];

describe("buildAsciiDungeonMap density", () => {
  it("density 1 returns non-empty map", () => {
    const a = buildAsciiDungeonMap(rooms, { mode: "dm", density: 1 });
    expect(a.mapOnly.length).toBeGreaterThan(0);
    expect(a.height).toBeGreaterThan(0);
  });

  it("density 2 shortens vertical size vs density 1", () => {
    const a1 = buildAsciiDungeonMap(rooms, { mode: "dm", density: 1 });
    const a2 = buildAsciiDungeonMap(rooms, { mode: "dm", density: 2 });
    expect(a2.height).toBeLessThanOrEqual(a1.height);
  });
});
