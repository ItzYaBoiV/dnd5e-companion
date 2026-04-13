/** Character range in the textarea `value` to replace with a suggestion. */
export type SpellIssue = { start: number; end: number };

/** Reserved for SRD spell names / custom word lists; empty keeps the assist UI inert. */
export const spellDict: readonly string[] = [];

/**
 * Optional spell-check helper for long text fields. Renders nothing until `dict` is populated.
 */
export function SpellAssist({
  dict,
  editing,
}: {
  text: string;
  dict: readonly string[];
  editing: boolean;
  onApply: (issue: SpellIssue, replacement: string) => void;
}) {
  if (!editing || dict.length === 0) return null;
  return null;
}
