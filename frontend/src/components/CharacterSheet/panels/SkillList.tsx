import { useState } from "react";
import type { Character } from "@/types/dnd";
import { SKILL_NAMES, SKILL_LABELS } from "@/types/dnd";
import { ProficiencyDot, formatModifier } from "@/components/common";
import { useSheetRoll } from "@/context/SheetRollContext";
import { combatApi } from "@/services/api";
import { buildSkillRollHintLines } from "@/lib/rollExplain";
import { SheetRollHintModal } from "./SheetRollModals";
import { Dices, HelpCircle } from "lucide-react";

interface Props {
  character: Character;
}

export default function SkillList({ character }: Props) {
  const { computed } = character;
  const { advantage, runAppRoll } = useSheetRoll();
  const [hint, setHint] = useState<{ title: string; lines: string[] } | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);

  const openHint = (slug: (typeof SKILL_NAMES)[number]) => {
    const skill = computed.skills[slug];
    if (!skill) return;
    const lines = buildSkillRollHintLines({
      skillLabel: SKILL_LABELS[slug],
      abilityKey: skill.ability,
      abilityMod: computed.modifiers[skill.ability],
      skillBonus: skill.bonus,
      proficiencyBonus: computed.proficiencyBonus,
      proficient: skill.proficient,
      expertise: skill.expertise,
      advantage,
      stealthArmorDisadv: slug === "stealth" && (computed.stealthDisadvantageFromArmor ?? false),
    });
    setHint({ title: `${SKILL_LABELS[slug]} check`, lines });
  };

  const rollApp = async (slug: (typeof SKILL_NAMES)[number]) => {
    const skill = computed.skills[slug];
    if (!skill) return;
    setRolling(slug);
    try {
      await runAppRoll(SKILL_LABELS[slug], "check", (adv) =>
        combatApi.rollCheck(character.id, slug, adv) as Promise<Record<string, unknown>>,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRolling(null);
    }
  };

  return (
    <div>
      <p className="text-[0.65rem] font-display uppercase tracking-widest text-gray-500 mb-2 border-b border-gray-700 pb-1">
        Skills
      </p>
      <div className="space-y-0">
        {SKILL_NAMES.map((slug) => {
          const skill = computed.skills[slug];
          if (!skill) return null;

          return (
            <div
              key={slug}
              className="flex items-center gap-1 py-0.5 px-0.5 border-b border-gray-800/80 last:border-0 hover:bg-black/20"
            >
              <ProficiencyDot proficient={skill.proficient} expertise={skill.expertise} />
              <span
                className={`text-[0.7rem] font-mono w-7 flex-shrink-0 tabular-nums ${
                  skill.bonus >= 0 ? "text-emerald-400/90" : "text-red-400/90"
                }`}
              >
                {formatModifier(skill.bonus)}
              </span>
              <span className="text-xs text-stone-200 flex-1 min-w-0 leading-tight">
                {SKILL_LABELS[slug]}
                {slug === "stealth" && (character.computed.stealthDisadvantageFromArmor ?? false) && (
                  <span className="text-amber-600/90 text-[0.65rem] font-normal normal-case ml-1">
                    (armor disadv.)
                  </span>
                )}
              </span>
              <span className="text-[0.6rem] text-stone-600 uppercase font-display w-7 text-right shrink-0">
                {skill.ability.slice(0, 3)}
              </span>
              <button
                type="button"
                title="What to roll"
                onClick={() => openHint(slug)}
                className="p-1 rounded text-stone-500 hover:text-dnd-gold hover:bg-dnd-dark shrink-0"
                aria-label={`What to roll for ${SKILL_LABELS[slug]}`}
              >
                <HelpCircle size={14} />
              </button>
              <button
                type="button"
                title="Roll"
                disabled={rolling === slug}
                onClick={() => void rollApp(slug)}
                className="p-1 rounded text-stone-500 hover:text-dnd-gold hover:bg-dnd-red/25 shrink-0 disabled:opacity-40"
                aria-label={`Roll ${SKILL_LABELS[slug]}`}
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
