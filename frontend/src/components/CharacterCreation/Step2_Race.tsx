import { useEffect } from "react";
import type { CharacterDraft, Race } from "@/types/dnd";
import { walkingSpeedAfterSubrace } from "@/lib/suggestedAbilityScores";
import { useReferenceStore } from "@/store/referenceStore";
import { LoadingSpinner } from "@/components/common";
import { clsx } from "clsx";
import { CharacterCreationStepNext } from "./CharacterCreationStepNext";

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

export default function Step2_Race({ draft, updateDraft, onNext }: Props) {
  const { races, loadRaces, loading } = useReferenceStore();

  useEffect(() => { loadRaces(); }, [loadRaces]);

  const selectedRace = races.find((r: Race) => r.slug === draft.raceSlug);

  if (loading["races"]) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Choose your character&apos;s race. Bonuses listed here are added automatically when you finish
        the wizard (you assign base ability scores on a later step, before those bonuses).
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:max-h-64 sm:overflow-auto sm:pr-1">
        {races.map((race: Race) => (
          <button
            key={race.slug}
            type="button"
            onClick={() => updateDraft({ raceSlug: race.slug, subraceSlug: "" })}
            className={clsx(
              "dnd-card text-left transition-all touch-manipulation min-h-[3.25rem] py-3 active:opacity-90",
              draft.raceSlug === race.slug
                ? "border-dnd-red bg-red-950/20"
                : "hover:border-gray-500"
            )}
          >
            <p className="font-display font-bold text-sm text-white">{race.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">Speed {race.speed} ft · {race.size}</p>
            {race.abilityBonuses.length > 0 && (
              <p className="text-xs text-dnd-gold mt-1">
                {race.abilityBonuses.map((b: any) => `+${b.bonus} ${b.ability.slice(0,3).toUpperCase()}`).join(", ")}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Subraces */}
      {selectedRace && selectedRace.subraces.length > 0 && (
        <div>
          <p className="dnd-label mb-2">Subrace</p>
          <div className="grid grid-cols-2 gap-2">
            {selectedRace.subraces.map((sub: any) => (
              <button
                key={sub.slug}
                type="button"
                onClick={() => updateDraft({ subraceSlug: sub.slug })}
                className={clsx(
                  "dnd-card text-left touch-manipulation min-h-[3rem] py-2.5 active:opacity-90",
                  draft.subraceSlug === sub.slug ? "border-dnd-red bg-red-950/20" : "hover:border-gray-500"
                )}
              >
                <p className="font-display font-bold text-sm">{sub.name}</p>
                {sub.abilityBonuses.length > 0 && (
                  <p className="text-xs text-dnd-gold">
                    {sub.abilityBonuses.map((b: any) => `+${b.bonus} ${b.ability.slice(0,3).toUpperCase()}`).join(", ")}
                  </p>
                )}
                {selectedRace && walkingSpeedAfterSubrace(selectedRace, sub.slug) !== selectedRace.speed && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Speed {walkingSpeedAfterSubrace(selectedRace, sub.slug)} ft
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Traits preview */}
      {selectedRace && selectedRace.traits.length > 0 && (
        <div className="dnd-card">
          <p className="dnd-label mb-2">Racial Traits</p>
          <div className="space-y-2 max-h-40 overflow-auto">
            {selectedRace.traits.map((t: any) => (
              <div key={t.id}>
                <p className="font-display font-semibold text-xs text-white">{t.name}</p>
                <p className="text-xs text-gray-500 line-clamp-2">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <CharacterCreationStepNext
        label="Next: Choose Class"
        onClick={onNext}
        disabled={!draft.raceSlug}
      />
    </div>
  );
}
