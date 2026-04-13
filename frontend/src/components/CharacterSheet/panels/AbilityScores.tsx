import type { Character } from "@/types/dnd";
import { ABILITY_NAMES, ABILITY_LABELS } from "@/types/dnd";
import { formatModifier } from "@/components/common";

interface Props {
  character: Character;
}

/** PHB-style ability column: ability name, modifier, score in a box. */
export default function AbilityScores({ character }: Props) {
  const { computed } = character;

  return (
    <div className="flex flex-row sm:flex-col gap-1 sm:gap-1.5 justify-between sm:justify-start">
      {ABILITY_NAMES.map((ability) => {
        const score = character[ability];
        const mod = computed.modifiers[ability];
        const label = ABILITY_LABELS[ability];

        return (
          <div
            key={ability}
            className="flex-1 sm:flex-none min-w-0 border border-gray-600 rounded-sm bg-black/25 px-1.5 py-1.5 sm:px-2 sm:py-2"
          >
            <p className="text-[0.6rem] sm:text-[0.65rem] font-display font-bold uppercase tracking-widest text-gray-500 text-center sm:text-left mb-0.5 sm:mb-1">
              {label.abbr}
            </p>
            <div className="flex items-center justify-center sm:justify-between gap-1">
              <span
                className={`text-xl sm:text-2xl font-display font-bold leading-none ${
                  mod > 0 ? "text-emerald-400" : mod < 0 ? "text-red-400" : "text-white"
                }`}
              >
                {formatModifier(mod)}
              </span>
              <div className="w-8 h-8 rounded border-2 border-gray-500 bg-[#0c0b09] flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-gray-100 tabular-nums">{score}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
