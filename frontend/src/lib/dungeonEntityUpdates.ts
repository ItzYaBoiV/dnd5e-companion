/** Pure helpers for mutating a session dungeon snapshot (forge grid JSON). */

export function removeEntityAtXY(dungeon: unknown, x: number, y: number): unknown | null {
  const d = dungeon as { entities?: unknown[] };
  const entities = [...(d.entities ?? [])];
  const idx = entities.findIndex((e: any) => e?.x === x && e?.y === y);
  if (idx < 0) return null;
  entities.splice(idx, 1);
  return { ...d, entities };
}

/**
 * When a forge monster stack is killed in combat, drop `count` by 1 for the matching
 * scripted entity (same slug; prefers the selected room).
 */
export function decrementForgeMonsterBySlug(
  dungeon: unknown,
  monsterSlug: string,
  roomId: number | null,
): unknown | null {
  const d = dungeon as { entities?: unknown[] };
  const entities = [...(d.entities ?? [])] as any[];
  const slug = String(monsterSlug);
  let idx = entities.findIndex(
    (e) =>
      e?.type === "monster" &&
      String(e.slug ?? "") === slug &&
      (roomId == null || e.roomId === roomId),
  );
  if (idx < 0) {
    idx = entities.findIndex((e) => e?.type === "monster" && String(e.slug ?? "") === slug);
  }
  if (idx < 0) return null;
  const ent = { ...entities[idx] };
  const cnt = Math.max(1, Number(ent.count) || 1);
  if (cnt <= 1) {
    entities.splice(idx, 1);
  } else {
    ent.count = cnt - 1;
    entities[idx] = ent;
  }
  return { ...d, entities };
}
