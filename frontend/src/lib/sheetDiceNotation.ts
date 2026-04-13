/**
 * Build dice-box-threejs notation with predetermined faces (Teal-style `@` suffix).
 * @see https://github.com/3d-dice/dice-box-threejs#predetermined-outcomes
 */
export function sheetRollToDiceNotation(res: Record<string, unknown>): string {
  const roll = typeof res.roll === "number" ? res.roll : null;
  if (roll == null) throw new Error("sheet roll result missing numeric roll");

  const adv = res.advantage;
  const d1 = typeof res.d1 === "number" ? res.d1 : null;
  const d2 = typeof res.d2 === "number" ? res.d2 : null;

  if ((adv === "advantage" || adv === "disadvantage") && d1 != null && d2 != null) {
    return `2d20@${d1},${d2}`;
  }
  return `1d20@${roll}`;
}
