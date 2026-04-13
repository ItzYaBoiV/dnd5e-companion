/**
 * Match a stored subclass slug to reference rows (Open5e slug variants).
 */

import type { DndClass, Subclass } from "@/types/dnd";

export function resolveSubclassOnClass(classRef: DndClass, subclassSlug: string): Subclass | undefined {
  const raw = subclassSlug.trim().toLowerCase();
  if (!raw) return undefined;
  const subs = classRef.subclasses ?? [];

  const exact = subs.find((s) => s.slug.toLowerCase() === raw);
  if (exact) return exact;

  const byEnds = subs.find((s) => {
    const sl = s.slug.toLowerCase();
    return sl.endsWith(`-${raw}`) || raw.endsWith(`-${sl}`) || sl === raw;
  });
  if (byEnds) return byEnds;

  return subs.find((s) => {
    const parts = s.slug.toLowerCase().split("-").filter(Boolean);
    return parts.includes(raw) || parts.some((p) => raw === p || raw.endsWith(p) || p.endsWith(raw));
  });
}
