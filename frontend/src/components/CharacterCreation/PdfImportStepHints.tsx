import { useCharacterStore } from "@/store/characterStore";

/** Shows PDF-import reminders that apply to the current wizard step (above the normal step UI). */
export default function PdfImportStepHints({ step }: { step: number }) {
  const issues = useCharacterStore((s) => s.draft.pdfImportReviewIssues)?.filter((i) => i.step === step) ?? [];
  if (issues.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/25 px-3 py-2.5 text-xs text-amber-50/95">
      <p className="font-display font-semibold text-amber-200/95 mb-1.5">PDF import — please confirm here</p>
      <ul className="list-disc list-inside space-y-0.5 text-amber-100/88 leading-relaxed">
        {issues.map((i, idx) => (
          <li key={idx}>{i.message}</li>
        ))}
      </ul>
    </div>
  );
}
