import { describe, expect, it } from "vitest";
import { computeCellSize } from "./computeCellSize";

const base = {
  gridW: 80,
  gridH: 52,
  hiRes: false,
  tinyMode: false,
  compactCells: false,
  style: "terminal",
  pad: 12,
};

describe("computeCellSize", () => {
  it("never returns 0 and uses mode min when viewport is invalid", () => {
    expect(computeCellSize({ ...base, vpW: 0, vpH: 640 })).toBe(10);
    expect(computeCellSize({ ...base, vpW: 360, vpH: 0 })).toBe(10);
    expect(computeCellSize({ ...base, vpW: -1, vpH: -1 })).toBe(10);
  });

  it("tiny mode clamps between 4 and 18", () => {
    expect(
      computeCellSize({
        ...base,
        tinyMode: true,
        vpW: 360,
        vpH: 640,
      }),
    ).toBeGreaterThanOrEqual(4);
    expect(
      computeCellSize({
        ...base,
        tinyMode: true,
        vpW: 4000,
        vpH: 2400,
      }),
    ).toBeLessThanOrEqual(18);
  });

  it("default mode caps at 36 on a very large viewport", () => {
    const cs = computeCellSize({
      ...base,
      vpW: 3840,
      vpH: 2160,
    });
    expect(cs).toBeLessThanOrEqual(36);
    expect(cs).toBeGreaterThanOrEqual(10);
  });

  it("hi-res mode uses higher min/max", () => {
    expect(
      computeCellSize({
        ...base,
        hiRes: true,
        vpW: 0,
        vpH: 0,
      }),
    ).toBe(14);
    const large = computeCellSize({
      ...base,
      hiRes: true,
      vpW: 5000,
      vpH: 3000,
    });
    expect(large).toBeLessThanOrEqual(56);
    expect(large).toBeGreaterThanOrEqual(14);
  });

  it("compact mode uses 6–24 band", () => {
    expect(
      computeCellSize({
        ...base,
        compactCells: true,
        vpW: 1,
        vpH: 1,
      }),
    ).toBe(6);
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

  it.each(viewports)("viewport %s×%s respects default bounds", (vpW, vpH) => {
    const cs = computeCellSize({ ...base, vpW, vpH });
    expect(cs).toBeGreaterThanOrEqual(10);
    expect(cs).toBeLessThanOrEqual(36);
  });
});
