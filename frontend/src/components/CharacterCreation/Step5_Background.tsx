import { useEffect } from "react";
import type { CharacterDraft, Background } from "@/types/dnd";
import { useReferenceStore } from "@/store/referenceStore";
import { LoadingSpinner } from "@/components/common";
import { clsx } from "clsx";

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export default function Step5_Background({ draft, updateDraft, onNext }: Props) {
  const { backgrounds, loadBackgrounds, loading } = useReferenceStore();

  useEffect(() => { loadBackgrounds(); }, [loadBackgrounds]);

  const selectedBg = backgrounds.find((b: Background) => b.slug === draft.backgroundSlug);

  if (loading["backgrounds"]) return <LoadingSpinner />;

  const handleSelect = (bg: Background) => {
    updateDraft({ backgroundSlug: bg.slug });
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Your background reflects where your character came from, their original occupation, and their
        place in the world. It provides skill proficiencies and a special feature.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:max-h-72 sm:overflow-auto sm:pr-1">
        {backgrounds.map((bg: Background) => (
          <button
            key={bg.slug}
            type="button"
            onClick={() => handleSelect(bg)}
            className={clsx(
              "dnd-card text-left transition-all touch-manipulation min-h-[3.25rem] py-3 active:opacity-90",
              draft.backgroundSlug === bg.slug ? "border-dnd-red bg-red-950/20" : "hover:border-gray-500"
            )}
          >
            <p className="font-display font-bold text-sm text-white">{bg.name}</p>
            <p className="text-xs text-dnd-gold mt-0.5">
              Skills: {bg.skillProficiencies.map(s => s.replace(/-/g," ")).join(", ")}
            </p>
            {bg.toolProficiencies.length > 0 && (
              <p className="text-xs text-gray-500">Tools: {bg.toolProficiencies.join(", ")}</p>
            )}
          </button>
        ))}
      </div>

      {selectedBg && (
        <div className="dnd-card space-y-3">
          <p className="font-display font-bold text-dnd-gold">{selectedBg.name}</p>

          {selectedBg.equipment?.trim() && (
            <div>
              <p className="dnd-label mb-1">Starting equipment (background)</p>
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                {selectedBg.equipment.trim()}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Combine with your class pack on the review step. If an option lists (a)/(b), pick one
                branch with your DM (SRD uses starting packs or rolled gold as alternatives).
              </p>
            </div>
          )}

          {/* Feature */}
          <div>
            <p className="dnd-label mb-1">Feature: {(selectedBg.feature as any).name}</p>
            <p className="text-xs text-gray-400">{(selectedBg.feature as any).description}</p>
          </div>

          {/* Personality traits */}
          {selectedBg.suggestedTraits.length > 0 && (
            <PersonalityPicker
              label="Personality Trait"
              suggestions={selectedBg.suggestedTraits}
              value={draft.personalityTraits}
              onChange={(v) => updateDraft({ personalityTraits: v })}
            />
          )}
          {selectedBg.suggestedIdeals.length > 0 && (
            <PersonalityPicker
              label="Ideal"
              suggestions={selectedBg.suggestedIdeals}
              value={draft.ideals}
              onChange={(v) => updateDraft({ ideals: v })}
            />
          )}
          {selectedBg.suggestedBonds.length > 0 && (
            <PersonalityPicker
              label="Bond"
              suggestions={selectedBg.suggestedBonds}
              value={draft.bonds}
              onChange={(v) => updateDraft({ bonds: v })}
            />
          )}
          {selectedBg.suggestedFlaws.length > 0 && (
            <PersonalityPicker
              label="Flaw"
              suggestions={selectedBg.suggestedFlaws}
              value={draft.flaws}
              onChange={(v) => updateDraft({ flaws: v })}
            />
          )}
        </div>
      )}

      <div className="flex justify-stretch sm:justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!draft.backgroundSlug}
          className="btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed px-8"
        >
          Next: Starting Equipment
        </button>
      </div>
    </div>
  );
}

function PersonalityPicker({
  label, suggestions, value, onChange,
}: {
  label: string; suggestions: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="dnd-label mb-1">{label}</p>
      <div className="flex gap-2">
        <select
          value=""
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          className="input-field text-sm flex-1 min-h-11"
        >
          <option value="">Pick a suggestion...</option>
          {suggestions.map((s, i) => (
            <option key={i} value={s}>{s.length > 60 ? s.slice(0, 60) + "…" : s}</option>
          ))}
        </select>
      </div>
      {value && (
        <p className="text-xs text-gray-400 mt-1 italic">"{value}"</p>
      )}
    </div>
  );
}
