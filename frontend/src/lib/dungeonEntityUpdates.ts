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
 * scripted entity (same slug; prefers the selected room). Falls back to display name when
 * the entity was placed without a resolved slug.
 */
export function decrementForgeMonsterBySlug(
  dungeon: unknown,
  monsterSlug: string,
  roomId: number | null,
  nameHint?: string | null,
): unknown | null {
  const d = dungeon as { entities?: unknown[] };
  const entities = [...(d.entities ?? [])] as any[];
  const slug = String(monsterSlug ?? "").trim();
  const nameLower = nameHint?.trim().toLowerCase() ?? "";

  const matches = (e: any) => {
    if (e?.type !== "monster") return false;
    const es = String(e.slug ?? "").trim();
    if (slug && es === slug) return true;
    if (nameLower && e?.name && String(e.name).toLowerCase() === nameLower) return true;
    return false;
  };

  let idx = entities.findIndex((e) => matches(e) && (roomId == null || e.roomId === roomId));
  if (idx < 0) {
    idx = entities.findIndex(matches);
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
