import { useState } from "react";
import type { Character } from "@/types/dnd";
import { ABILITY_NAMES, ABILITY_LABELS, type AbilityName } from "@/types/dnd";
import { ProficiencyDot, formatModifier } from "@/components/common";
import { useSheetRoll } from "@/context/SheetRollContext";
import { combatApi } from "@/services/api";
import { buildSaveRollHintLines } from "@/lib/rollExplain";
import { SheetRollHintModal } from "./SheetRollModals";
import { Dices, HelpCircle } from "lucide-react";

interface Props {
  character: Character;
}

export default function SavingThrows({ character }: Props) {
  const { computed } = character;
  const { advantage, runAppRoll } = useSheetRoll();
  const [hint, setHint] = useState<{ title: string; lines: string[] } | null>(null);
  const [rolling, setRolling] = useState<AbilityName | null>(null);

  const openHint = (ability: AbilityName) => {
    const save = computed.savingThrows[ability];
    const lines = buildSaveRollHintLines({
      saveLabel: ABILITY_LABELS[ability].full,
      abilityKey: ability,
      abilityMod: computed.modifiers[ability],
      saveBonus: save.bonus,
      proficiencyBonus: computed.proficiencyBonus,
      proficient: save.proficient,
      advantage,
    });
    setHint({ title: `${ABILITY_LABELS[ability].full} saving throw`, lines });
  };

  const rollApp = async (ability: AbilityName) => {
    setRolling(ability);
    try {
      await runAppRoll(`${ABILITY_LABELS[ability].full} save`, "save", (adv, opts) =>
        combatApi.rollSave(character.id, ability, adv, opts) as Promise<Record<string, unknown>>,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRolling(null);
    }
  };

  return (
    <div>
      <p className="text-[0.65rem] font-display uppercase tracking-widest text-stone-500 mb-2 border-b border-dnd-border/70 pb-1">
        Saving throws
      </p>
      <div className="space-y-0">
        {ABILITY_NAMES.map((ability) => {
          const save = computed.savingThrows[ability];
          return (
            <div
              key={ability}
              className="flex items-center gap-1 py-0.5 px-0.5 border-b border-dnd-border/40 last:border-0 hover:bg-black/25"
            >
              <ProficiencyDot proficient={save.proficient} />
              <span
                className={`text-[0.7rem] font-mono w-7 flex-shrink-0 tabular-nums ${
                  save.bonus >= 0 ? "text-emerald-400/90" : "text-red-400/90"
                }`}
              >
                {formatModifier(save.bonus)}
              </span>
              <span className="text-xs text-stone-200 flex-1">{ABILITY_LABELS[ability].full}</span>
              <button
                type="button"
                title="What to roll"
                onClick={() => openHint(ability)}
                className="p-1 rounded text-stone-500 hover:text-dnd-gold hover:bg-dnd-dark shrink-0"
                aria-label={`What to roll for ${ABILITY_LABELS[ability].full} save`}
              >
                <HelpCircle size={14} />
              </button>
              <button
                type="button"
                title="Roll"
                disabled={rolling === ability}
                onClick={() => void rollApp(ability)}
                className="p-1 rounded text-stone-500 hover:text-dnd-gold hover:bg-dnd-red/25 shrink-0 disabled:opacity-40"
                aria-label={`Roll ${ABILITY_LABELS[ability].full} save`}
              >
                <Dices size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <SheetRollHintModal
        open={!!hint}
        title={hint?.title ?? ""}
        lines={hint?.lines ?? []}
        onClose={() => setHint(null)}
      />
    </div>
  );
}
