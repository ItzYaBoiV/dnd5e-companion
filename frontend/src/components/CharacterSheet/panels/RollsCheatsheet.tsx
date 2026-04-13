import type { Character } from "@/types/dnd";
import { ABILITY_LABELS, ABILITY_NAMES } from "@/types/dnd";
import { formatModifier, SectionHeader } from "@/components/common";
import { Swords } from "lucide-react";

interface Props {
  character: Character;
}

export default function RollsCheatsheet({ character }: Props) {
  const c = character.computed;
  const weapons = c.weaponAttacks ?? [];
  const armorSource = c.armorSource ?? null;
  const shield = c.shieldEquipped ?? false;

  const acParts = [
    armorSource ? armorSource : "Unarmored",
    shield ? "shield +2" : null,
  ].filter(Boolean);

  return (
    <div className="dnd-card space-y-3">
      <SectionHeader title="What to roll" />
      <p className="text-xs text-gray-500">
        Equip armor and weapons on the Inventory tab. AC uses your best equipped body armor plus shield; each equipped
        weapon gets its own attack line.
      </p>

      <div className="rounded-lg border border-gray-700 bg-gray-900/50 divide-y divide-gray-800">
        <RollRow label="Initiative" formula={`d20 ${formatModifier(c.initiative)}`} />
        <RollRow
          label="Armor Class"
          formula={`${c.armorClass}`}
          hint={`${acParts.join(" · ")}${character.acBonus ? ` · misc +${character.acBonus}` : ""}`}
        />
        {weapons.length === 0 ? (
          <div className="px-3 py-3 text-sm text-gray-500">
            No equipped SRD weapons. Equip a weapon from inventory (with an item link) to see attack and damage here.
          </div>
        ) : (
          weapons.map((w) => (
            <div key={w.inventoryItemId} className="px-3 py-2.5">
              <div className="flex items-center gap-2 text-dnd-gold font-display font-semibold text-sm">
                <Swords size={14} className="text-gray-500 shrink-0" />
                {w.name}
                {!w.isProficient && (
                  <span className="text-xs font-normal text-amber-600 normal-case">(not proficient)</span>
                )}
              </div>
              <p className="text-sm text-gray-200 mt-1 font-mono">
                Attack{" "}
                <span className="text-white">
                  d20 {formatModifier(w.attackBonus)}
                </span>
                {" · "}
                Hit{" "}
                <span className="text-white">
                  {w.damageFormula} {w.damageType}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {ABILITY_LABELS[w.abilityUsed].abbr} · {w.rangeLabel}
                {w.notes ? ` · ${w.notes}` : ""}
              </p>
            </div>
          ))
        )}
        {c.spellAttackBonus !== null && (
          <RollRow
            label="Spell attack"
            formula={`d20 ${formatModifier(c.spellAttackBonus)}`}
            hint={`Spell save DC ${c.spellSaveDc}`}
          />
        )}
        <ProficientSaves character={character} />
      </div>
    </div>
  );
}

function ProficientSaves({ character }: { character: Character }) {
  const saves = ABILITY_NAMES.map((ab) => ({
    ab,
    st: character.computed.savingThrows[ab],
  })).filter((x) => x.st?.proficient);
  if (saves.length === 0) return null;
  return (
    <div className="px-3 py-2.5">
      <p className="dnd-label text-[0.65rem]">Saving throws (proficient)</p>
      <p className="text-xs text-gray-300 font-mono leading-relaxed">
        {saves.map(({ ab, st }) => (
          <span key={ab} className="mr-3 inline-block">
            {ABILITY_LABELS[ab].abbr} d20{formatModifier(st!.bonus)}
          </span>
        ))}
      </p>
    </div>
  );
}

function RollRow({ label, formula, hint }: { label: string; formula: string; hint?: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="dnd-label text-[0.65rem]">{label}</p>
      <p className="font-mono text-sm text-white">{formula}</p>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}
