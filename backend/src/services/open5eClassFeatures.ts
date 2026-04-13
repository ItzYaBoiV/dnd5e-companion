/**
 * Open5e /v1/classes/ payloads do not expose a `features` array.
 * Level-granted features live in a markdown `table` string; full text is in `desc` under ### headings.
 */

export type ClassFeatureSeedRow = { name: string; level: number; description: string };

function splitPipeRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith("|") ? t.slice(1) : t;
  const core = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  return core.split("|").map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^[-:\s|]+$/.test(c));
}

function parseLevelCell(raw: string): number | null {
  const s = raw.trim();
  const ord = s.match(/^(\d{1,2})(st|nd|rd|th)\b/i);
  if (ord) {
    const n = parseInt(ord[1], 10);
    return n >= 1 && n <= 20 ? n : null;
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
}

function splitFeatureNames(cell: string): string[] {
  const noBold = cell.replace(/\*{1,3}/g, "").trim();
  if (!noBold || noBold === "—" || noBold === "-" || /^none$/i.test(noBold)) return [];
  return noBold
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull ### Name … block from class desc (SRD-style markdown). */
function extractFeatureDesc(desc: string, featureName: string): string {
  if (!desc || !featureName) return "";
  const esc = escapeRegExp(featureName.trim());
  const re = new RegExp(
    `#{2,3}\\s*${esc}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n#{2,3}\\s|\\r?\\n#{2,3}$|$)`,
    "i",
  );
  const m = desc.match(re);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}

function featuresFromApiArray(raw: unknown): ClassFeatureSeedRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f: any) => ({
    name:        String(f.name ?? "Feature"),
    level:       Number(f.level) >= 1 ? Number(f.level) : 1,
    description: String(f.desc ?? f.description ?? ""),
  }));
}

/**
 * Parse Open5e class `table` markdown: header row must include Level + Features columns.
 */
export function parseFeaturesFromOpen5eTable(table: string, desc: string): ClassFeatureSeedRow[] {
  const lines = table
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("|"));

  let headerIndex = -1;
  let levelCol = -1;
  let featuresCol = -1;

  for (let i = 0; i < lines.length; i++) {
    const cells = splitPipeRow(lines[i]);
    if (cells.length < 2) continue;
    const lower = cells.map((c) => c.toLowerCase());
    const lc = lower.findIndex((c) => c === "level");
    const fc = lower.findIndex((c) => c.includes("feature"));
    if (lc >= 0 && fc >= 0) {
      headerIndex = i;
      levelCol = lc;
      featuresCol = fc;
      break;
    }
  }

  if (headerIndex < 0) return [];

  const out: ClassFeatureSeedRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitPipeRow(lines[i]);
    if (cells.length <= Math.max(levelCol, featuresCol)) continue;
    if (isSeparatorRow(cells)) continue;

    const level = parseLevelCell(cells[levelCol] ?? "");
    if (level == null) continue;

    const featCell = cells[featuresCol] ?? "";
    for (const name of splitFeatureNames(featCell)) {
      const baseName = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const description =
        extractFeatureDesc(desc, name) ||
        (baseName !== name ? extractFeatureDesc(desc, baseName) : "");
      out.push({ name, level, description });
    }
  }
  return out;
}

/**
 * Prefer a real `features` array when Open5e adds it; otherwise derive from `table` + `desc`.
 */
export function classFeatureCreatesFromOpen5e(
  listRow: Record<string, unknown>,
  detail: Record<string, unknown> | null,
): ClassFeatureSeedRow[] {
  const merged: Record<string, unknown> = { ...listRow, ...(detail ?? {}) };
  const fromArray = featuresFromApiArray(merged.features);
  if (fromArray.length > 0) return fromArray;

  const table = String(merged.table ?? "").trim();
  const desc = String(merged.desc ?? "").trim();
  return parseFeaturesFromOpen5eTable(table, desc);
}
