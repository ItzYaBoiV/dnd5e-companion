import { prisma } from "../config/database";
import { itemSlugLookupAttempts } from "../util/itemSlugResolve";

/**
 * Open5e / imports can yield multiple `Spell` rows for the same name and level with different slugs.
 * Collapse to one row: prefer the spell whose `classes` array is largest (full class list).
 * If `preferredClassSlug` is set (class filter), break ties by preferring rows that include it.
 */
function dedupeSpellsByNameAndLevel<T extends { slug: string; name: string; level: number; classes: string[] }>(
  spells: T[],
  preferredClassSlug?: string,
): T[] {
  const groups = new Map<string, T[]>();
  for (const s of spells) {
    const key = `${s.level}\0${s.name.trim().toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  const picked: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      picked.push(group[0]!);
      continue;
    }
    const best = [...group].sort((a, b) => {
      if (preferredClassSlug) {
        const inA = a.classes.includes(preferredClassSlug) ? 1 : 0;
        const inB = b.classes.includes(preferredClassSlug) ? 1 : 0;
        if (inB !== inA) return inB - inA;
      }
      if (b.classes.length !== a.classes.length) return b.classes.length - a.classes.length;
      return a.slug.localeCompare(b.slug);
    })[0]!;
    picked.push(best);
  }
  picked.sort((a, b) => (a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name)));
  return picked;
}

function dedupeSubclassRows<T extends { name: string; features?: unknown[] }>(subs: T[]): T[] {
  const picked = new Map<string, T>();
  for (const s of subs) {
    const key = s.name.trim().toLowerCase();
    const prev = picked.get(key);
    if (!prev) {
      picked.set(key, s);
      continue;
    }
    // Keep the richer row when duplicate names exist (e.g. SRD 2014/2024 "Hunter").
    const score = (x: T) => Array.isArray(x.features) ? x.features.length : 0;
    if (score(s) > score(prev)) picked.set(key, s);
  }
  return [...picked.values()];
}

export async function getRaces() {
  return prisma.race.findMany({
    include: { traits: true, subraces: { include: { traits: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getRace(slug: string) {
  return prisma.race.findUnique({
    where: { slug },
    include: { traits: true, subraces: { include: { traits: true } } },
  });
}

export async function getClasses() {
  const rows = await prisma.class.findMany({
    include: { features: { orderBy: { level: "asc" } }, subclasses: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, subclasses: dedupeSubclassRows(r.subclasses ?? []) }));
}

export async function getClass(slug: string) {
  const row = await prisma.class.findUnique({
    where: { slug },
    include: {
      features: { orderBy: { level: "asc" } },
      subclasses: { include: { features: { orderBy: { level: "asc" } } } },
    },
  });
  if (!row) return null;
  return { ...row, subclasses: dedupeSubclassRows(row.subclasses ?? []) };
}

export async function getBackgrounds() {
  return prisma.background.findMany({ orderBy: { name: "asc" } });
}

export async function getBackground(slug: string) {
  return prisma.background.findUnique({ where: { slug } });
}

export async function getSpells(filters: {
  classSlug?: string; level?: string; school?: string;
  search?: string; ritual?: string; concentration?: string;
}) {
  const where: Record<string, unknown> = {};
  if (filters.classSlug)      where["classes"] = { has: filters.classSlug };
  if (filters.level !== undefined) where["level"] = parseInt(filters.level, 10);
  if (filters.school)         where["school"] = { equals: filters.school, mode: "insensitive" };
  if (filters.search)         where["name"] = { contains: filters.search, mode: "insensitive" };
  if (filters.ritual !== undefined) where["ritual"] = filters.ritual === "true";
  if (filters.concentration !== undefined) where["concentration"] = filters.concentration === "true";
  const rows = await prisma.spell.findMany({ where, orderBy: [{ level: "asc" }, { name: "asc" }] });
  return dedupeSpellsByNameAndLevel(rows, filters.classSlug);
}

export async function getSpell(slug: string) {
  return prisma.spell.findUnique({ where: { slug } });
}

export async function getItems(filters: {
  category?: string; subcategory?: string; search?: string; magical?: string;
}) {
  const where: Record<string, unknown> = {};
  if (filters.category)    where["category"] = { equals: filters.category, mode: "insensitive" };
  if (filters.subcategory) where["subcategory"] = { contains: filters.subcategory, mode: "insensitive" };
  if (filters.search)      where["name"] = { contains: filters.search, mode: "insensitive" };
  if (filters.magical !== undefined) where["magical"] = filters.magical === "true";
  return prisma.item.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export async function getItem(slug: string) {
  for (const s of itemSlugLookupAttempts(slug)) {
    const row = await prisma.item.findUnique({ where: { slug: s } });
    if (row) return row;
  }
  return null;
}

export async function getFeats() {
  return prisma.feat.findMany({ orderBy: { name: "asc" } });
}

export async function getFeat(slug: string) {
  return prisma.feat.findUnique({ where: { slug } });
}

export async function getConditions() {
  return prisma.condition.findMany({ orderBy: { name: "asc" } });
}

export async function getCondition(slug: string) {
  return prisma.condition.findUnique({ where: { slug } });
}
