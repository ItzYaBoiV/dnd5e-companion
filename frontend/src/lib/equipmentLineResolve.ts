import { distance } from "fastest-levenshtein";
import type { Item, StartingInventoryDraftRow } from "@/types/dnd";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip leading bullets / numbering; split "Name × 3" quantity (best-effort). */
export function parseEquipmentLineParts(raw: string): { namePart: string; quantity: number } {
  let s = raw.replace(/^[\s•\-–—*]+/, "").trim();
  let qty = 1;
  const mul = s.match(/^(.+?)\s*[×x]\s*(\d+)\s*$/i);
  if (mul) {
    s = mul[1].trim();
    const n = parseInt(mul[2], 10);
    if (Number.isFinite(n) && n >= 1) qty = Math.min(99, n);
  }
  const leadNum = s.match(/^(\d+)\s*[×x]\s*(.+)$/i);
  if (leadNum) {
    const n = parseInt(leadNum[1], 10);
    if (Number.isFinite(n) && n >= 1) {
      qty = Math.min(99, n);
      s = leadNum[2].trim();
    }
  }
  return { namePart: s, quantity: qty };
}

/**
 * Map one equipment line to a draft row: SRD `itemSlug` when a catalog match is confident, otherwise `customName` only.
 */
export function resolveEquipmentLineToDraftRow(line: string, catalog: Item[]): StartingInventoryDraftRow {
  const { namePart, quantity } = parseEquipmentLineParts(line);
  const qn = norm(namePart);
  if (!qn) {
    return { itemSlug: "", customName: line.trim() || "Item", quantity: 1, equipped: false };
  }

  let best: Item | null = null;
  let bestScore = Infinity;
  for (const it of catalog) {
    const n = norm(it.name);
    const slugWords = norm(it.slug.replace(/-/g, " "));
    let s: number;
    if (qn === n || qn === slugWords) s = 0;
    else if (n.includes(qn) || qn.includes(n)) s = 1;
    else s = distance(qn, n);
    if (s < bestScore) {
      bestScore = s;
      best = it;
    }
  }

  const maxD = namePart.length <= 4 ? 2 : namePart.length <= 10 ? 4 : 6;
  if (best && bestScore <= maxD) {
    return {
      itemSlug: best.slug,
      customName: best.name,
      displayName: best.name,
      quantity,
      equipped: false,
    };
  }

  return { itemSlug: "", customName: namePart, quantity, equipped: false };
}

export function resolveEquipmentLinesToDraftRows(lines: string[], catalog: Item[]): StartingInventoryDraftRow[] {
  return lines.map((line) => resolveEquipmentLineToDraftRow(line, catalog));
}

export type EquipmentImportResolve = {
  rows: StartingInventoryDraftRow[];
  /** Original lines that did not map to a confident SRD item slug. */
  unmatchedLines: string[];
};

export function resolveEquipmentLinesForImport(lines: string[], catalog: Item[]): EquipmentImportResolve {
  const rows: StartingInventoryDraftRow[] = [];
  const unmatchedLines: string[] = [];
  for (const line of lines) {
    const row = resolveEquipmentLineToDraftRow(line, catalog);
    rows.push(row);
    if (!row.itemSlug?.trim()) unmatchedLines.push(line.trim());
  }
  return { rows, unmatchedLines };
}
