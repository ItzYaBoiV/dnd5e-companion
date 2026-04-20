import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useCharacterStore } from "@/store/characterStore";
import { useReferenceStore } from "@/store/referenceStore";
import { referenceApi } from "@/services/api";
import { DEFAULT_DRAFT, PDF_IMPORT_REVIEW_STEP, type CharacterDraft } from "@/types/dnd";
import { resolveEquipmentLinesForImport } from "@/lib/equipmentLineResolve";
import {
  mergePdfImportIssues,
  parseWizardsCharacterSheetPdf,
  resolveSpellsFromWizardsPdf,
  wizardsPdfParsedToDraftPatch,
} from "@/lib/wizardsCharacterSheetPdfImport";

export default function PdfCharacterSheetImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDraft = useCharacterStore((s) => s.updateDraft);
  const loadRaces = useReferenceStore((s) => s.loadRaces);
  const loadClasses = useReferenceStore((s) => s.loadClasses);
  const loadBackgrounds = useReferenceStore((s) => s.loadBackgrounds);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await Promise.all([loadRaces(), loadClasses(), loadBackgrounds()]);
      const items = await referenceApi.items({});
      const { races, classes, backgrounds } = useReferenceStore.getState();
      const buf = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseWizardsCharacterSheetPdf(buf);
      const { patch, issues: patchIssues } = wizardsPdfParsedToDraftPatch(parsed, races, classes, backgrounds);

      const merged: CharacterDraft = { ...DEFAULT_DRAFT, ...useCharacterStore.getState().draft, ...patch };
      const race = races.find((r) => r.slug === merged.raceSlug);
      const spellRes = await resolveSpellsFromWizardsPdf(parsed, merged, race);
      const { issues: spellIssues, ...spellPatch } = spellRes;

      const { rows: equipRows, unmatchedLines } = resolveEquipmentLinesForImport(parsed.equipmentLines, items);
      const equipIssues =
        unmatchedLines.length > 0
          ? [
              {
                step: PDF_IMPORT_REVIEW_STEP.startingEquipment,
                message: `${unmatchedLines.length} equipment line(s) were not matched to SRD items — edit or link them on Starting Equipment (${unmatchedLines.slice(0, 3).join("; ")}${unmatchedLines.length > 3 ? "…" : ""}).`,
              },
            ]
          : [];

      const allIssues = mergePdfImportIssues(patchIssues, spellIssues, equipIssues);
      const firstReviewStep =
        allIssues.length > 0 ? Math.min(...allIssues.map((i) => i.step)) : (patch.step ?? PDF_IMPORT_REVIEW_STEP.basicInfo);

      updateDraft({
        ...patch,
        ...spellPatch,
        startingInventoryDraft: equipRows,
        pdfImportReviewIssues: allIssues.length > 0 ? allIssues : undefined,
        step: firstReviewStep,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/40 p-3 sm:p-4 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-display font-semibold text-dnd-gold">Import filled PDF</h2>
          <p className="text-xs text-stone-500 mt-0.5 leading-snug">
            WoTC 2016 fillable sheet (same as{" "}
            <code className="text-stone-400">wizards-5E_CharacterSheet_Fillable.pdf</code>). We map fields to the
            builder, match SRD equipment when possible, and infer subclasses from the class line when readable. If
            anything is uncertain, you are taken to the first step that needs confirmation — use the usual questions on
            each step to finish.
          </p>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="btn-ghost inline-flex items-center gap-2 text-sm border border-stone-600"
          >
            <FileUp size={16} aria-hidden />
            {busy ? "Reading…" : "Choose PDF"}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-300 bg-red-950/30 border border-red-900/60 rounded px-2 py-1.5">{error}</p>
      )}
    </div>
  );
}
