import type { Spell } from "@/types/dnd";

export type FeatureOption = {
  key: string;
  title: string;
  detail: string;
};

/** True when prose looks like the player must pick among listed alternatives. */
function descriptionSuggestsPickOne(description: string): boolean {
  if (!description) return false;
  return (
    /one of the following|following options|choose one(\s+of)?|choose (an? |your )?(option|type|style|terrain|kind)|\bpick one\b|\bselect one\b/i.test(
      description,
    ) || /\bchoose\b.*\b(following|option|style|type|terrain|pact|circle)\b/i.test(description)
  );
}

function parsePeriodBoldOptions(description: string): FeatureOption[] {
  const options: FeatureOption[] = [];
  const re = /\*\*([^*]+)\.\*\*\s*([\s\S]*?)(?=\n\s*\*\*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) != null) {
    const title = (m[1] ?? "").trim();
    const detail = (m[2] ?? "").replace(/\s+/g, " ").trim();
    if (!title || title.length > 80) continue;
    options.push({
      key: slugifyOptionKey(title),
      title,
      detail,
    });
  }
  return options;
}

/** Open5e sometimes uses **Title** without a period before the body text. */
function parsePlainBoldOptions(description: string): FeatureOption[] {
  const options: FeatureOption[] = [];
  const re = /(?:^|\n)\s*\*\*([^*\n]+)\*\*\s*(?:[.:]\s*)?([\s\S]*?)(?=\n\s*\*\*[^*]|\n#{1,3}\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) != null) {
    const title = (m[1] ?? "").trim();
    const detail = (m[2] ?? "").replace(/\s+/g, " ").trim();
    if (!title || title.length > 80) continue;
    if (!detail || detail.length < 8) continue;
    options.push({
      key: slugifyOptionKey(title),
      title,
      detail,
    });
  }
  return options;
}

function dedupeOptions(opts: FeatureOption[]): FeatureOption[] {
  const seen = new Set<string>();
  const out: FeatureOption[] = [];
  for (const o of opts) {
    const k = o.key;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

/**
 * Parse SRD/Open5e-style “choose one” blocks (**Name.** description).
 * Table-only features (e.g. Circle of the Land terrain) are handled in {@link resolveGrantPickSpecWithFallback}.
 */
export function extractFeatureOptions(description: string, featureName = ""): FeatureOption[] {
  void featureName;
  const cue = descriptionSuggestsPickOne(description);

  const period = parsePeriodBoldOptions(description);
  if (period.length >= 2 && cue) return dedupeOptions(period);

  const plain = parsePlainBoldOptions(description);
  if (plain.length >= 2 && cue) return dedupeOptions(plain);

  return [];
}

export function slugifyOptionKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function withSelectedFeatureOptions(
  originalDescription: string,
  options: FeatureOption[] | undefined,
  selectedKeys: string[],
): string {
  if (!options?.length || !selectedKeys.length) return originalDescription;
  const parts = selectedKeys
    .map((k) => options.find((o) => o.key === k))
    .filter((x): x is FeatureOption => x != null);
  if (!parts.length) return originalDescription;
  const summary = parts.map((p) => `${p.title} — ${p.detail}`).join("\n");
  return `${originalDescription}\n\nSelected option(s):\n${summary}`;
}

export function withSelectedFeatureOption(
  originalDescription: string,
  options: FeatureOption[] | undefined,
  selectedKey: string | undefined,
): string {
  if (!selectedKey) return originalDescription;
  return withSelectedFeatureOptions(originalDescription, options, [selectedKey]);
}

export function appendSpellChoicesToDescription(
  originalDescription: string,
  spells: Spell[],
  heading: string,
): string {
  if (!spells.length) return originalDescription;
  const lines = spells
    .map((s) => `• ${s.name}${s.level === 0 ? " (cantrip)" : ` (level ${s.level})`}`)
    .join("\n");
  return `${originalDescription}\n\n${heading}:\n${lines}`;
}

export function appendBeastCompanionNote(
  originalDescription: string,
  monsterName: string,
  monsterSlug: string,
  crLabel: string,
): string {
  return `${originalDescription}\n\nRanger’s Companion: ${monsterName} (${monsterSlug}, CR ${crLabel}). Use the beast’s stat block from the Monster Manual / SRD; it obeys the Beast Master companion rules.`;
}
