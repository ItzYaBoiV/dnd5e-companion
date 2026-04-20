import { useMemo } from "react";
import { useCharacterStore } from "@/store/characterStore";
import { PDF_IMPORT_REVIEW_STEP, type PdfImportReviewIssue } from "@/types/dnd";
import { X } from "lucide-react";

const STEP_LABEL: Record<number, string> = {
  [PDF_IMPORT_REVIEW_STEP.basicInfo]: "Basic info",
  [PDF_IMPORT_REVIEW_STEP.race]: "Race",
  [PDF_IMPORT_REVIEW_STEP.class]: "Class",
  [PDF_IMPORT_REVIEW_STEP.abilityScores]: "Ability scores",
  [PDF_IMPORT_REVIEW_STEP.background]: "Background",
  [PDF_IMPORT_REVIEW_STEP.startingEquipment]: "Starting equipment",
  [PDF_IMPORT_REVIEW_STEP.startingSpells]: "Starting spells",
};

function groupByStep(issues: PdfImportReviewIssue[]): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const i of issues) {
    const arr = m.get(i.step) ?? [];
    arr.push(i.message);
    m.set(i.step, arr);
  }
  return m;
}

export default function PdfImportReviewBanner() {
  const draft = useCharacterStore((s) => s.draft);
  const updateDraft = useCharacterStore((s) => s.updateDraft);

  const issues = draft.pdfImportReviewIssues ?? [];
  const grouped = useMemo(() => groupByStep(issues), [issues]);
  const steps = useMemo(() => [...grouped.keys()].sort((a, b) => a - b), [grouped]);

  if (issues.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-800/70 bg-amber-950/35 px-3 py-3 sm:px-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-display font-semibold text-amber-100">PDF import — please confirm</h2>
        <button
          type="button"
          className="shrink-0 p-1 rounded text-amber-200/80 hover:bg-amber-900/50 hover:text-amber-50"
          aria-label="Dismiss import reminders"
          onClick={() => updateDraft({ pdfImportReviewIssues: undefined })}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <p className="text-xs text-amber-100/80 leading-relaxed">
        Open each step below and use the normal builder questions to fix anything the sheet could not map cleanly.
      </p>
      <ul className="space-y-3">
        {steps.map((step) => (
          <li key={step} className="text-xs text-amber-50/95">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-display font-semibold text-amber-200">
                Step {step}: {STEP_LABEL[step] ?? `Step ${step}`}
              </span>
              <button
                type="button"
                className="px-2 py-0.5 rounded border border-amber-700 bg-amber-900/40 text-amber-100 hover:bg-amber-900/70 text-[11px] font-display"
                onClick={() => updateDraft({ step })}
              >
                Go to step
              </button>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-amber-100/85 pl-1">
              {(grouped.get(step) ?? []).map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
