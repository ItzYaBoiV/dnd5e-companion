import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCharacterStore } from "@/store/characterStore";
import type { CharacterDraft } from "@/types/dnd";
import Step1_BasicInfo from "./Step1_BasicInfo";
import Step2_Race from "./Step2_Race";
import Step3_Class from "./Step3_Class";
import Step4_AbilityScores from "./Step4_AbilityScores";
import Step5_Background from "./Step5_Background";
import Step6_StartingEquipment from "./Step6_StartingEquipment";
import Step7_StartingSpells from "./Step7_StartingSpells";
import Step8_Review from "./Step8_Review";
import CreationLevelUpStep from "./CreationLevelUpStep";
import QuickCharacterCreation from "./QuickCharacterCreation";
import PdfCharacterSheetImport from "./PdfCharacterSheetImport";
import PdfImportReviewBanner from "./PdfImportReviewBanner";
import PdfImportStepHints from "./PdfImportStepHints";
import { ChevronLeft } from "lucide-react";
import { clsx } from "clsx";

function PdfImportPreviewAside({ url }: { url: string }) {
  return (
    <aside className="hidden min-w-0 flex-col gap-2 border border-stone-700 bg-stone-950/85 shadow-lg lg:sticky lg:top-4 lg:flex lg:max-h-[min(88vh,920px)] lg:w-full lg:rounded-lg lg:overflow-hidden">
      <p className="shrink-0 px-3 pt-3 font-display text-[11px] text-stone-500">Imported PDF (reference)</p>
      <iframe
        title="Imported character sheet PDF"
        src={`${url}#view=FitH`}
        className="min-h-[min(480px,50vh)] w-full flex-1 border-0 bg-stone-900 lg:min-h-[520px]"
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 px-3 pb-3 text-xs text-dnd-gold hover:underline"
      >
        Open in new tab
      </a>
    </aside>
  );
}

const BASE_STEPS = [
  { num: 1, label: "Basic Info" },
  { num: 2, label: "Race" },
  { num: 3, label: "Class" },
  { num: 4, label: "Ability Scores" },
  { num: 5, label: "Background" },
  { num: 6, label: "Starting Equipment" },
  { num: 7, label: "Starting Spells" },
] as const;

function levelUpSlotCount(draft: CharacterDraft): number {
  return draft.level > 1 ? draft.level - 1 : 0;
}

function reviewStepNumber(draft: CharacterDraft): number {
  return 7 + levelUpSlotCount(draft) + 1;
}

function getStepLabel(draft: CharacterDraft, step: number): string {
  const review = reviewStepNumber(draft);
  if (step <= 7) return BASE_STEPS[step - 1]?.label ?? "";
  if (step < review) return `Level ${step - 6} progression`;
  return "Review";
}

export default function CharacterCreation() {
  const navigate = useNavigate();
  const { draft, updateDraft, resetDraft, submitDraft } = useCharacterStore();
  const [mode, setMode] = useState<"full" | "quick">("full");

  const lc = levelUpSlotCount(draft);
  const review = reviewStepNumber(draft);
  const totalSteps = review;

  const goNext = () => {
    if (draft.step >= review) return;
    updateDraft({ step: draft.step + 1 });
  };

  const goPrev = () => {
    if (draft.step === 1) {
      resetDraft();
      navigate("/characters");
    } else {
      updateDraft({ step: Math.max(1, draft.step - 1) });
    }
  };

  const handleSubmit = async () => {
    const char = await submitDraft();
    navigate(`/characters/${char.id}`);
  };

  const stepProps = { draft, updateDraft, onNext: goNext };

  return (
    <div
      className={clsx(
        "min-h-full mx-auto px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pb-6",
        draft.pdfImportPreviewUrl
          ? "max-w-7xl lg:grid lg:grid-cols-[minmax(0,1fr)_min(38%,420px)] lg:items-start lg:gap-6"
          : "max-w-3xl",
      )}
    >
      <div className="min-w-0">
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <button
          type="button"
          onClick={goPrev}
          className="btn-ghost shrink-0 -ml-1 !min-w-0 px-2 sm:px-3"
          aria-label={draft.step === 1 ? "Cancel and leave character creation" : "Go to previous step"}
        >
          <ChevronLeft size={20} className="shrink-0" aria-hidden />
          <span className="truncate max-w-[4.5rem] sm:max-w-none">{draft.step === 1 ? "Cancel" : "Back"}</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-xl sm:text-2xl text-dnd-gold truncate">Create Character</h1>
          <p className="text-sm text-stone-500 truncate">{getStepLabel(draft, draft.step)}</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="inline-flex gap-1 p-1 bg-gray-900 rounded">
          <button
            type="button"
            onClick={() => setMode("quick")}
            className={`px-3 py-1.5 rounded text-xs font-display font-semibold ${mode === "quick" ? "bg-dnd-red text-white" : "text-gray-300 hover:text-white"}`}
          >
            Quick Create
          </button>
          <button
            type="button"
            onClick={() => setMode("full")}
            className={`px-3 py-1.5 rounded text-xs font-display font-semibold ${mode === "full" ? "bg-dnd-red text-white" : "text-gray-300 hover:text-white"}`}
          >
            Full Builder
          </button>
        </div>
      </div>

      {mode === "full" && (
        <p className="text-center text-xs font-display text-stone-500 mb-2 sm:hidden" aria-live="polite">
          Step {draft.step} of {totalSteps}
        </p>
      )}

      {mode === "full" && (
        <div className="flex gap-1 mb-6 sm:mb-8" role="progressbar" aria-valuenow={draft.step} aria-valuemin={1} aria-valuemax={totalSteps} aria-label="Character creation progress">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((num) => (
            <div
              key={num}
              className={`flex-1 h-1.5 rounded-full transition-colors min-w-[3px] ${
                num <= draft.step ? "bg-dnd-red" : "bg-stone-800"
              }`}
            />
          ))}
        </div>
      )}

      {mode === "full" ? (
        <>
          <PdfCharacterSheetImport />
          {draft.pdfImportPreviewUrl && (
            <p className="mb-4 lg:hidden">
              <a
                href={draft.pdfImportPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-dnd-gold underline"
              >
                Open imported PDF in a new tab
              </a>
            </p>
          )}
          <PdfImportReviewBanner />
          <p className="text-xs text-stone-600 mb-6 leading-relaxed">
            Rules follow the D&amp;D 5e SRD (Open5e). Starting above 1st level runs guided steps for each level (HP,
            features, spells, ASI) before review — for both single-class and multiclass (multiclass also sets 1st-level
            class and level order on the Class step).
          </p>
        </>
      ) : (
        <p className="text-xs text-stone-600 mb-6 leading-relaxed">
          Quick Create keeps the full builder untouched and auto-fills the remaining choices from your race/class/playstyle selections.
        </p>
      )}

      {mode === "quick" ? (
        <QuickCharacterCreation />
      ) : (
        <>
          {draft.step === 1 && (
            <>
              <PdfImportStepHints step={1} />
              <Step1_BasicInfo {...stepProps} />
            </>
          )}
          {draft.step === 2 && (
            <>
              <PdfImportStepHints step={2} />
              <Step2_Race {...stepProps} />
            </>
          )}
          {draft.step === 3 && (
            <>
              <PdfImportStepHints step={3} />
              <Step3_Class {...stepProps} />
            </>
          )}
          {draft.step === 4 && (
            <>
              <PdfImportStepHints step={4} />
              <Step4_AbilityScores {...stepProps} />
            </>
          )}
          {draft.step === 5 && (
            <>
              <PdfImportStepHints step={5} />
              <Step5_Background {...stepProps} />
            </>
          )}
          {draft.step === 6 && (
            <>
              <PdfImportStepHints step={6} />
              <Step6_StartingEquipment {...stepProps} />
            </>
          )}
          {draft.step === 7 && (
            <>
              <PdfImportStepHints step={7} />
              <Step7_StartingSpells {...stepProps} />
            </>
          )}
          {lc > 0 && draft.step >= 8 && draft.step < review && (
            <CreationLevelUpStep {...stepProps} slotIndex={draft.step - 8} />
          )}
          {draft.step === review && (
            <Step8_Review draft={draft} onBack={goPrev} onSubmit={handleSubmit} />
          )}
        </>
      )}
      </div>
      {mode === "full" && draft.pdfImportPreviewUrl && (
        <PdfImportPreviewAside url={draft.pdfImportPreviewUrl} />
      )}
    </div>
  );
}
