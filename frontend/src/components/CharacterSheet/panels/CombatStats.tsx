import { useState } from "react";
import type { Character } from "@/types/dnd";
import { formatModifier } from "@/components/common";
import { Shield, Zap, Wind, Star, Dices, HelpCircle } from "lucide-react";
import { useSheetRoll } from "@/context/SheetRollContext";
import { combatApi } from "@/services/api";
import { buildInitiativeHintLines } from "@/lib/rollExplain";
import { SheetRollHintModal } from "./SheetRollModals";

interface Props {
  character: Character;
}

export default function CombatStats({ character }: Props) {
  const { computed } = character;
  const { runAppRoll } = useSheetRoll();
  const [hint, setHint] = useState<{ title: string; lines: string[] } | null>(null);
  const [iniRolling, setIniRolling] = useState(false);

  const armorHint = (() => {
    const src = computed.armorSource ?? null;
    const sh = computed.shieldEquipped ?? false;
    if (!src && !sh) return "10 + Dex (no armor)";
    return [src, sh ? "+ shield" : null].filter(Boolean).join(" · ");
  })();

  const stats = [
    {
      icon: <Shield size={16} />,
      label: "Armor Class",
      value: String(computed.armorClass),
      sub: armorHint,
    },
    {
      icon: <Zap size={16} />,
      label: "Initiative",
      value: formatModifier(computed.initiative),
      sub: null,
    },
    {
      icon: <Wind size={16} />,
      label: "Speed",
      value: `${character.speed}`,
      sub: "ft.",
    },
    {
      icon: <Star size={16} />,
      label: "Proficiency",
      value: formatModifier(computed.proficiencyBonus),
      sub: null,
    },
  ];

  const openInitHint = () => {
    const dex = computed.modifiers.dexterity;
    const lines = buildInitiativeHintLines({
      initiativeBonus: computed.initiative,
      dexMod: dex,
      extraBonus: character.initiativeBonus,
    });
    setHint({ title: "Initiative", lines });
  };

  const rollInitiative = async () => {
    setIniRolling(true);
    try {
      await runAppRoll("Initiative", "init", (_adv) =>
        combatApi.rollInitiative(character.id) as Promise<Record<string, unknown>>,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setIniRolling(false);
    }
  };

  return (
    <div>
      <p className="text-[0.65rem] font-display uppercase tracking-widest text-stone-500 mb-2 border-b border-dnd-border/70 pb-1">
        Combat stats
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {stats.map(({ icon, label, value, sub }) => (
          <div
            key={label}
            className="border border-dnd-border/70 rounded-sm bg-dnd-panel/50 flex flex-col items-center gap-0.5 py-2 px-1"
          >
            <div className="text-stone-500 scale-90">{icon}</div>
            <span className="text-xl font-display font-bold text-parchment leading-none">{value}</span>
            {label === "Armor Class" && sub ? (
              <span className="text-[0.6rem] text-stone-500 text-center px-0.5 leading-tight line-clamp-2">{sub}</span>
            ) : sub ? (
              <span className="text-[0.65rem] text-stone-500">{sub}</span>
            ) : null}
            <span className="text-[0.55rem] font-display uppercase tracking-wider text-stone-500">{label}</span>
            {label === "Initiative" && (
              <div className="flex gap-0.5 mt-1">
                <button
                  type="button"
                  title="What to roll"
                  onClick={openInitHint}
                  className="p-0.5 rounded text-stone-500 hover:text-dnd-gold hover:bg-dnd-dark"
                  aria-label="What to roll for initiative"
                >
                  <HelpCircle size={12} />
                </button>
                <button
                  type="button"
                  title="Roll initiative"
                  disabled={iniRolling}
                  onClick={() => void rollInitiative()}
                  className="p-0.5 rounded text-stone-500 hover:text-dnd-gold hover:bg-dnd-red/25 disabled:opacity-40"
                  aria-label="Roll initiative"
                >
                  <Dices size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Passive scores */}
      <div className="mt-2 border border-dnd-border/70 rounded-sm divide-y divide-dnd-border/50 overflow-hidden">
        {[
          { label: "Passive Perception", value: computed.passivePerception },
          { label: "Passive Insight", value: computed.passiveInsight },
          { label: "Passive Investigation", value: computed.passiveInvestigation },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-1.5 px-2 bg-dnd-panel/40">
            <span className="text-[0.6rem] font-display uppercase tracking-wide text-stone-500 leading-tight">
              {label}
            </span>
            <span className="text-lg font-display font-bold text-parchment tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      {/* Spellcasting (if applicable) */}
      {computed.spellSaveDc !== null && (
        <div className="mt-2 border border-dnd-border/70 rounded-sm divide-x divide-dnd-border/50 grid grid-cols-2 bg-dnd-panel/50">
          <div className="flex flex-col items-center py-2 px-1">
            <span className="text-2xl font-display font-bold text-parchment">{computed.spellSaveDc}</span>
            <span className="text-[0.55rem] font-display uppercase tracking-wider text-stone-500 text-center">
              Spell save DC
            </span>
          </div>
          <div className="flex flex-col items-center py-2 px-1">
            <span className="text-2xl font-display font-bold text-parchment">
              {formatModifier(computed.spellAttackBonus!)}
            </span>
            <span className="text-[0.55rem] font-display uppercase tracking-wider text-stone-500 text-center">
              Spell attack
            </span>
          </div>
        </div>
      )}
      {computed.isMulticlass && computed.multiclassSpellcasterLevel > 0 && (
        <p className="text-[0.6rem] text-stone-600 text-center mt-1 px-1">
          Multiclass spell slots (combined caster level {computed.multiclassSpellcasterLevel})
        </p>
      )}

      <SheetRollHintModal
        open={!!hint}
        title={hint?.title ?? ""}
        lines={hint?.lines ?? []}
        onClose={() => setHint(null)}
      />
    </div>
  );
}
