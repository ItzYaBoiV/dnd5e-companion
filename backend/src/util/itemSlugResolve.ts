import type { Item, PrismaClient } from "@prisma/client";

/** Try Open5e-style slug variants (v1 short slug, v2 srd-*, srd-2024-*). */
export function itemSlugLookupAttempts(slug: string): string[] {
  const t = slug.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const x = s.trim().toLowerCase();
    if (x && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  };
  push(t);
  if (!/^srd-\d{4}-/i.test(t)) push(`srd-2024-${t}`);
  if (!/^srd-/i.test(t)) push(`srd-${t}`);
  if (t === "leather-armor") {
    push("leather");
    push("srd-leather");
    push("srd-2024-leather");
  }
  return out;
}

/**
 * Map each inventory itemSlug (any Open5e variant) to its DB Item row.
 * Keys include the raw slug from inventory, lowercase, and the canonical row slug.
 */
export async function buildItemMapForInventorySlugs(
  prisma: PrismaClient,
  inventorySlugs: (string | null | undefined)[],
): Promise<Record<string, Item>> {
  const rawSlugs = inventorySlugs.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  if (rawSlugs.length === 0) return {};

  const attemptSet = new Set<string>();
  const rowsToResolve: { raw: string; attempts: string[] }[] = [];
  for (const raw of rawSlugs) {
    const attempts = itemSlugLookupAttempts(raw);
    rowsToResolve.push({ raw, attempts });
    for (const a of attempts) attemptSet.add(a);
  }

  const dbRows = await prisma.item.findMany({
    where: { slug: { in: [...attemptSet] } },
  });
  const foundBySlug = new Map(dbRows.map((r) => [r.slug, r]));

  const out: Record<string, Item> = {};
  for (const { raw, attempts } of rowsToResolve) {
    for (const a of attempts) {
      const row = foundBySlug.get(a);
      if (row) {
        out[raw] = row;
        out[raw.trim().toLowerCase()] = row;
        out[row.slug] = row;
        break;
      }
    }
  }
  return out;
}
