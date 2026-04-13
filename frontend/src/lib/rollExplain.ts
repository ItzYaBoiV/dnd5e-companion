import type { AbilityName, AdvantageType } from "@/types/dnd";
import { ABILITY_LABELS } from "@/types/dnd";
import { formatModifier } from "@/components/common";

export function advantageInstruction(adv: AdvantageType): string {
  if (adv === "advantage") return "Roll two d20s and use the higher result.";
  if (adv === "disadvantage") return "Roll two d20s and use the lower result.";
  return "Roll one twenty-sided die (d20).";
}

export function buildSkillRollHintLines(opts: {
  skillLabel: string;
  abilityKey: AbilityName;
  abilityMod: number;
  skillBonus: number;
  proficiencyBonus: number;
  proficient: boolean;
  expertise: boolean;
  advantage: AdvantageType;
  stealthArmorDisadv?: boolean;
}): string[] {
  const abilName = ABILITY_LABELS[opts.abilityKey].full;
  const lines: string[] = [];

  lines.push(advantageInstruction(opts.advantage));
  lines.push(
    `Add ${formatModifier(opts.skillBonus)} — that is your total for ${opts.skillLabel} (${abilName}${opts.expertise ? ", expertise" : opts.proficient ? ", proficient" : ""}).`,
  );
  lines.push(
    `${abilName} modifier is ${formatModifier(opts.abilityMod)}; your proficiency bonus is +${opts.proficiencyBonus}.`,
  );
  if (opts.expertise) {
    lines.push(
      `Expertise means you add double proficiency (${formatModifier(opts.proficiencyBonus * 2)}) on top of your ability modifier.`,
    );
  } else if (opts.proficient) {
    lines.push(`Proficiency adds +${opts.proficiencyBonus} to this skill.`);
  } else {
    lines.push("You are not proficient in this skill, so only the ability modifier applies.");
  }
  if (opts.stealthArmorDisadv) {
    lines.push(
      "Stealth: heavy armor may impose disadvantage on Dexterity (Stealth) checks — your DM decides when it applies.",
    );
  }
  lines.push("Compare the total to a DC set by the DM (or an opposed check).");
  return lines;
}

export function buildSaveRollHintLines(opts: {
  saveLabel: string;
  abilityKey: AbilityName;
  abilityMod: number;
  saveBonus: number;
  proficiencyBonus: number;
  proficient: boolean;
  advantage: AdvantageType;
}): string[] {
  const abilName = ABILITY_LABELS[opts.abilityKey].full;
  const lines: string[] = [];
  lines.push(advantageInstruction(opts.advantage));
  lines.push(
    `Add ${formatModifier(opts.saveBonus)} — that is your ${opts.saveLabel} saving throw total.`,
  );
  lines.push(`${abilName} modifier is ${formatModifier(opts.abilityMod)}.`);
  if (opts.proficient) {
    lines.push(`You are proficient in this save, so you also add +${opts.proficiencyBonus} proficiency.`);
  } else {
    lines.push("You are not proficient in this save — only the ability modifier is included.");
  }
  lines.push("The DM compares your total to the spell or effect’s save DC.");
  return lines;
}

export function buildInitiativeHintLines(opts: {
  initiativeBonus: number;
  dexMod: number;
  extraBonus: number;
}): string[] {
  const lines: string[] = [];
  lines.push("Roll a d20 for initiative at the start of combat.");
  lines.push(`Add ${formatModifier(opts.initiativeBonus)} to the roll.`);
  lines.push(
    `That is usually your Dexterity modifier (${formatModifier(opts.dexMod)})${opts.extraBonus !== 0 ? ` plus other bonuses (${formatModifier(opts.extraBonus)})` : ""}.`,
  );
  lines.push("Highest results act first unless the DM says otherwise.");
  return lines;
}

function isAbilityName(v: unknown): v is AbilityName {
  return typeof v === "string" && v in ABILITY_LABELS;
}

/** Short teaching copy for the sheet roll overlay (before and after the API result). */
export function buildSheetRollLearningLines(opts: {
  variant: "check" | "save" | "init";
  title: string;
  advantage: AdvantageType;
  /** `null` during the “rolling” phase before the server responds. */
  result: Record<string, unknown> | null;
}): string[] {
  const { variant, title, advantage, result } = opts;
  const advLine = advantageInstruction(advantage);

  if (!result) {
    if (variant === "check") {
      return [advLine, `Add your ${title} skill modifier to the d20 you keep, then compare to a DC or opposed roll.`];
    }
    if (variant === "save") {
      return [advLine, `Add your ${title} bonus to the d20 you keep; the DM compares the total to the effect’s DC.`];
    }
    return [
      "Roll one d20 for initiative and add your initiative modifier (usually Dex plus other bonuses on your sheet).",
    ];
  }

  const bonus = typeof result.bonus === "number" ? result.bonus : null;
  const bonusStr = bonus != null ? formatModifier(bonus) : "your modifier";
  const adv = result.advantage;
  const d1 = typeof result.d1 === "number" ? result.d1 : null;
  const d2 = typeof result.d2 === "number" ? result.d2 : null;
  const rollVal = typeof result.roll === "number" ? result.roll : null;

  const advDiceLine =
    (adv === "advantage" || adv === "disadvantage") && d1 != null && d2 != null && rollVal != null
      ? adv === "advantage"
        ? `You rolled ${d1} and ${d2} on the two d20s; advantage keeps the higher, so the d20 result is ${rollVal}.`
        : `You rolled ${d1} and ${d2} on the two d20s; disadvantage keeps the lower, so the d20 result is ${rollVal}.`
      : null;

  if (variant === "check") {
    const abilityKey = isAbilityName(result.ability) ? result.ability : null;
    const abilLabel = abilityKey ? ABILITY_LABELS[abilityKey].full : "its key ability";
    const profNote =
      result.expertise === true
        ? "Expertise doubles proficiency on this skill."
        : result.proficient === true
          ? "Proficiency is included in the modifier."
          : "Only the ability-based part is included (no proficiency).";
    const lines: string[] = [];
    if (advDiceLine) lines.push(advDiceLine);
    lines.push(
      `${title} (${abilLabel}): d20 + skill modifier ${bonusStr}. ${profNote} Compare the total to a DC or opposed roll.`,
    );
    return lines;
  }

  if (variant === "save") {
    const abilityKey = isAbilityName(result.ability) ? result.ability : null;
    const abilLabel = abilityKey ? ABILITY_LABELS[abilityKey].full : title.replace(/\s+save$/i, "");
    const lines: string[] = [];
    if (advDiceLine) lines.push(advDiceLine);
    lines.push(
      `${abilLabel} save: d20 + save bonus ${bonusStr}. ${result.proficient === true ? "Proficiency is included." : "No proficiency on this save."} Meet or beat the effect’s DC.`,
    );
    return lines;
  }

  return [
    `Initiative: d20 + initiative modifier ${bonusStr}. Higher totals usually act first when the DM calls for initiative.`,
  ];
}
