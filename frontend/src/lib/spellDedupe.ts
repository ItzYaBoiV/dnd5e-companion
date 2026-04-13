import type { Spell } from "@/types/dnd";

/** Prefer the row that lists more classes (canonical shared spell vs class-specific duplicate slug). */
export function pickRicherSpellRow(a: Spell, b: Spell): Spell {
  if (b.classes.length !== a.classes.length) return b.classes.length > a.classes.length ? b : a;
  return a.slug.localeCompare(b.slug) <= 0 ? a : b;
}

const nameLevelKey = (sp: Spell) => `${sp.level}\0${sp.name.trim().toLowerCase()}`;

/**
 * Merge spell arrays (e.g. one fetch per class when multiclass). Collapses same name+level to one row,
 * keeping the spell with the longest `classes` list.
 */
export function mergeSpellListsPreferringRichestClasses(spellArrays: Spell[][]): Spell[] {
  const map = new Map<string, Spell>();
  for (const arr of spellArrays) {
    for (const sp of arr) {
      const key = nameLevelKey(sp);
      const prev = map.get(key);
      if (!prev) map.set(key, sp);
      else map.set(key, pickRicherSpellRow(prev, sp));
    }
  }
  return [...map.values()].sort((a, b) =>
    a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name),
  );
}
