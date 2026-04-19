/**
 * Build "features gained this level" rows from reference class + subclass data.
 * Open5e often stores a generic table row (e.g. "Divine Domain Feature") with no body;
 * the real text lives on the subclass. We also resolve subclass slugs loosely (case, segments).
 */

import type { DndClass } from "@/types/dnd";
import { classLevelHasPhbStyleAsi, isAsiFeatureName } from "@/lib/levelUpGuide";
import { resolveSubclassOnClass } from "@/lib/levelUpSubclassResolve";

export { resolveSubclassOnClass } from "@/lib/levelUpSubclassResolve";

/** Generic PHB-style table rows that duplicate subclass entries and often have no description. */
const REDUNDANT_EMPTY_CLASS_FEATURE =
  /^(divine domain feature|sacred oath feature|druid circle|bard college feature|martial archetype feature|monastic tradition feature|ranger archetype feature|roguish archetype feature|sorcerous origin feature|primal path feature|otherworldly patron feature|arcane tradition feature)$/i;

export type LevelUpGrantRow = {
  key: string;
  name: string;
  description: string;
  source: string;
  kind: "class" | "sub";
};

export function buildGrantCandidatesForClassLevel(
  classRef: DndClass,
  newClassLevel: number,
  subclassSlug: string,
): LevelUpGrantRow[] {
  const sub = resolveSubclassOnClass(classRef, subclassSlug);
  const classFeats = (classRef.features ?? []).filter((f) => f.level === newClassLevel);
  const subFeats =
    sub?.features?.filter((f: { level: number }) => f.level === newClassLevel) ?? [];

  const filteredClass = classFeats.filter((f) => {
    const empty = !String(f.description ?? "").trim();
    if (!empty) return true;
    if (subFeats.length === 0) return true;
    return !REDUNDANT_EMPTY_CLASS_FEATURE.test(String(f.name ?? "").trim());
  });

  const out: LevelUpGrantRow[] = [];
  for (const f of filteredClass) {
    out.push({
      key: `c:${f.name}`,
      name: f.name,
      description: f.description,
      source: "class",
      kind: "class",
    });
  }
  for (const f of subFeats) {
    out.push({
      key: `s:${f.name}`,
      name: f.name,
      description: f.description,
      source: "subclass",
      kind: "sub",
    });
  }

  const seen = new Set<string>();
  const uniq: LevelUpGrantRow[] = [];
  for (const g of out) {
    const k = `${g.kind}:${g.name.trim().toLowerCase()}:${g.description.trim().toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(g);
  }

  const expanded: LevelUpGrantRow[] = [];
  for (const g of uniq) {
    const n = g.name.trim().toLowerCase();
    if (
      classRef.slug === "wizard" &&
      newClassLevel >= 18 &&
      n.includes("spell mastery") &&
      !n.includes("1st-level") &&
      !n.includes("2nd-level")
    ) {
      expanded.push({
        ...g,
        key: `${g.key}::spell-mastery-1`,
        name: "Spell Mastery (1st-level wizard spell)",
        description: g.description,
      });
      expanded.push({
        ...g,
        key: `${g.key}::spell-mastery-2`,
        name: "Spell Mastery (2nd-level wizard spell)",
        description: g.description,
      });
    } else {
      expanded.push(g);
    }
  }

  if (
    classRef.slug &&
    classLevelHasPhbStyleAsi(classRef.slug, newClassLevel) &&
    !expanded.some((g) => isAsiFeatureName(g.name))
  ) {
    expanded.push({
      key: "synthetic:asi-phb",
      name: "Ability Score Improvement",
      description:
        "Increase one ability score by 2, or two ability scores by 1 each (normally cannot exceed 20 unless another rule allows). If your group uses optional feats, you may take a feat instead (DM’s choice).",
      source: "class",
      kind: "class",
    });
  }

  return expanded;
}
