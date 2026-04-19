/** Doubles only NdM segments in notation; flat bonuses stay once (PHB crit rules). */
export function doubleDiceOnly(notation: string): string {
  return notation.replace(/(\d+)(d\d+)/gi, (_, n: string, d: string) => `${Number(n) * 2}${d}`);
}
