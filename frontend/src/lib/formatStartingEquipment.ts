/**
 * Make Open5e / SRD starting-equipment prose easier to scan: (a)/(b) branches and semicolons on new lines.
 */
export function formatStartingEquipmentText(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return t
    .replace(/\(\s*([a-z])\s*\)/gi, "\n\n($1) ")
    .replace(/\s*;\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
