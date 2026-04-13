import type { CharacterDraft, ClassLevelDraftRow } from "@/types/dnd";

/** Target levels per class slug from the multiclass draft rows. */
export function targetLevelsBySlug(rows: ClassLevelDraftRow[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const s = r.classSlug.trim();
    if (!s) continue;
    m[s] = (m[s] ?? 0) + r.levels;
  }
  return m;
}

/**
 * Build a default level-up order: after `firstSlug` takes 1st character level, assign remaining
 * levels in row order (round-robin filling needs).
 */
export function defaultMulticlassLevelOrder(
  rows: ClassLevelDraftRow[],
  firstSlug: string,
  characterLevel: number,
): string[] {
  const need: Record<string, number> = {};
  for (const r of rows) {
    const s = r.classSlug.trim();
    if (!s) continue;
    need[s] = r.levels - (s === firstSlug ? 1 : 0);
  }
  const order: string[] = [];
  const cap = Math.max(0, characterLevel - 1);
  while (order.length < cap) {
    let progressed = false;
    for (const r of rows) {
      const s = r.classSlug.trim();
      if (!s || need[s] <= 0) continue;
      order.push(s);
      need[s]--;
      progressed = true;
      if (order.length >= cap) break;
    }
    if (!progressed) break;
  }
  return order;
}

/** After simulating character level `afterCharLevel` (1 = after create only). */
export function classLevelsAfterCharLevel(
  draft: CharacterDraft,
  afterCharLevel: number,
): Record<string, number> {
  const rows = draft.classLevels ?? [];
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const s = r.classSlug.trim();
    if (s) counts[s] = 0;
  }
  const first = (draft.multiclassFirstClassSlug ?? "").trim();
  if (first && counts[first] !== undefined) counts[first] = 1;

  const plan = draft.multiclassLevelOrder ?? [];
  const steps = Math.min(plan.length, Math.max(0, afterCharLevel - 1));
  for (let i = 0; i < steps; i++) {
    const slug = (plan[i] ?? "").trim();
    if (slug && counts[slug] !== undefined) counts[slug]++;
  }
  return counts;
}

/** Every slot for levels 2…L must exist (no sparse array) after guided creation. */
export function validateCreationLevelUpsChain(draft: CharacterDraft): string | null {
  if (draft.level <= 1) return null;
  const need = draft.level - 1;
  const ups = draft.creationLevelUps ?? [];
  if (ups.length !== need) {
    return `Level progression incomplete: need ${need} step(s) for levels 2–${draft.level}, but ${ups.length} recorded. Go back through each level-up step.`;
  }
  for (let i = 0; i < need; i++) {
    const p = ups[i];
    if (p == null || typeof p !== "object") {
      return `Missing progression data for character level ${i + 2}. Re-open that level step and continue.`;
    }
  }
  return null;
}

export function validateMulticlassSteppedDraft(draft: CharacterDraft): string | null {
  if (!draft.useMulticlass || draft.level <= 1) return null;
  const rows = draft.classLevels.filter((r) => r.classSlug.trim());
  if (rows.length < 2) return "Multiclass requires at least two classes.";
  const sum = rows.reduce((s, r) => s + r.levels, 0);
  if (sum !== draft.level) return "Class levels must sum to your character level.";
  const first = (draft.multiclassFirstClassSlug ?? "").trim();
  if (!first) return "Choose which class you took at 1st character level.";
  const targets = targetLevelsBySlug(rows);
  if ((targets[first] ?? 0) < 1) return "Your first-level class must have at least one level in that class.";
  const need = draft.level - 1;
  const plan = draft.multiclassLevelOrder ?? [];
  if (plan.length !== need) return `Set your level-up path (${need} choices for levels 2–${draft.level}).`;
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i]?.trim();
    if (!s) return `Choose a class for character level ${i + 2}.`;
    if (targets[s] === undefined) return `Invalid class in level path: ${s}.`;
  }
  const sim = classLevelsAfterCharLevel(draft, draft.level);
  for (const r of rows) {
    const s = r.classSlug.trim();
    if ((sim[s] ?? 0) !== r.levels) {
      return `Level path does not match your class breakdown — check each level 2–${draft.level} class choice.`;
    }
  }
  return null;
}

/** Sort rows so the 1st-level class row comes first (max HP on correct hit die). */
export function sortClassRowsForInitialCreate(
  rows: ClassLevelDraftRow[],
  firstSlug: string,
): ClassLevelDraftRow[] {
  const tagged = rows.map((r, i) => ({ r, i }));
  tagged.sort((a, b) => {
    const af = a.r.classSlug.trim() === firstSlug ? 0 : 1;
    const bf = b.r.classSlug.trim() === firstSlug ? 0 : 1;
    return af - bf || a.i - b.i;
  });
  return tagged.map((x) => x.r);
}
