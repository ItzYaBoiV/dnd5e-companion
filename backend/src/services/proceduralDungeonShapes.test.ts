import test from "node:test";
import assert from "node:assert/strict";
import { cavernMask, masksOverlap, rasterEllipse, shapeMask } from "./proceduralDungeonShapes";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("rect mask fills bbox", () => {
  const m = shapeMask("rect", 4, 3, rng(1));
  assert.equal(m.length, 3);
  assert.equal(m[0]!.length, 4);
  assert(m.every((row) => row.every(Boolean)));
});

test("oval mask is subset of rect", () => {
  const m = rasterEllipse(5, 5);
  const cells = m.flat().filter(Boolean).length;
  assert(cells < 25 && cells > 8);
});

test("masksOverlap detects shared true cell", () => {
  const a = [
    [true, true],
    [true, false],
  ];
  const b = [
    [false, true],
    [false, false],
  ];
  assert(masksOverlap(0, 0, a, 1, 0, b));
  assert(!masksOverlap(0, 0, a, 2, 0, b));
});

test("cavern mask keeps some cells after cleanup", () => {
  const m = cavernMask(8, 8, rng(42));
  const n = m.flat().filter(Boolean).length;
  assert(n > 4);
});
