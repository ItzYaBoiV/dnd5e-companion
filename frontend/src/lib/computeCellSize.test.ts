import { describe, expect, it } from "vitest";
import { computeCellSize } from "./computeCellSize";

const base = {
  gridW: 80,
  gridH: 52,
  cellPx: 18,
  pad: 12,
};

describe("computeCellSize", () => {
  it("returns cellPx when viewport is invalid", () => {
    expect(computeCellSize({ ...base, vpW: 0, vpH: 640 })).toBe(18);
    expect(computeCellSize({ ...base, vpW: 360, vpH: 0 })).toBe(18);
    expect(computeCellSize({ ...base, vpW: -1, vpH: -1 })).toBe(18);
  });

  it("never goes below 4px", () => {
    expect(
      computeCellSize({
        ...base,
        cellPx: 8,
        vpW: 100,
        vpH: 100,
      }),
    ).toBeGreaterThanOrEqual(4);
  });

  it("does not exceed requested cellPx when viewport is huge", () => {
    const cs = computeCellSize({
      ...base,
      cellPx: 24,
      vpW: 3840,
      vpH: 2160,
    });
    expect(cs).toBe(24);
  });

  it("shrinks below cellPx when the grid cannot fit at full size", () => {
    const cs = computeCellSize({
      gridW: 80,
      gridH: 52,
      cellPx: 48,
      vpW: 400,
      vpH: 400,
      pad: 12,
    });
    expect(cs).toBeLessThan(48);
    expect(cs).toBeGreaterThanOrEqual(4);
  });

  const viewports = [
    [320, 568],
    [360, 640],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ] as const;

  it.each(viewports)("viewport %s×%s stays within [4, cellPx]", (vpW, vpH) => {
    const cs = computeCellSize({ ...base, vpW, vpH });
    expect(cs).toBeGreaterThanOrEqual(4);
    expect(cs).toBeLessThanOrEqual(18);
  });
});
