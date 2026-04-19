/**
 * SRD / PHB-style level-up guidance (cantrips known, spells known, prepared counts).
 * Class feature names come from reference API; numeric tables are fixed SRD baselines.
 */

import type { AbilityScores, Character, DndClass } from "@/types/dnd";
import { cantripsDruid, cantripsSorcerer } from "./creationSpellGuide";
import { resolveSubclassOnClass } from "./levelUpSubclassResolve";

export function proficiencyBonusAtLevel(level: number): number {
  const lv = Math.max(1, Math.min(20, level));
  return Math.ceil(lv / 4) + 1;
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** When most classes choose a subclass (SRD-style). */
export const SUBCLASS_CHOICE_LEVEL: Record<string, number> = {
  barbarian: 3,
  bard: 3,
  cleric: 1,
  druid: 2,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 1,
  warlock: 1,
  wizard: 2,
};

/** PHB Ability Score Improvement class levels (fighter +6/+14, rogue +10). */
export const ASI_LEVELS_BY_CLASS: Record<string, number[]> = {
  barbarian: [4, 8, 12, 16, 19],
  bard: [4, 8, 12, 16, 19],
  cleric: [4, 8, 12, 16, 19],
  druid: [4, 8, 12, 16, 19],
  fighter: [4, 6, 8, 12, 14, 16, 19],
  monk: [4, 8, 12, 16, 19],
  paladin: [4, 8, 12, 16, 19],
  ranger: [4, 8, 12, 16, 19],
  rogue: [4, 8, 10, 12, 16, 19],
  sorcerer: [4, 8, 12, 16, 19],
  warlock: [4, 8, 12, 16, 19],
  wizard: [4, 8, 12, 16, 19],
};

export function classLevelHasPhbStyleAsi(classSlug: string, classTierAfterLevelUp: number): boolean {
  const L = Math.max(1, Math.min(20, classTierAfterLevelUp));
  const arr = ASI_LEVELS_BY_CLASS[classSlug];
  return arr?.includes(L) ?? false;
}

// ── Cantrips known at end of level L (1–20), PHB-style ─────────────

function cantripsStandard(level: number): number {
  if (level <= 3) return 3;
  if (level <= 9) return 4;
  return 5;
}

function cantripsBardWarlock(level: number): number {
  if (level <= 3) return 2;
  if (level <= 9) return 3;
  return 4;
}

/** Eldritch Knight / Arcane Trickster (character level). */
function cantripsThirdCaster(level: number): number {
  if (level < 3) return 0;
  if (level <= 6) return 2;
  if (level <= 12) return 3;
  if (level <= 18) return 4;
  return 5;
}

// ── Spells known at end of level L (index level - 1) ──────────────

/** Bard, PHB */
const BARD_SPELLS_KNOWN = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22,
];

/** Sorcerer, PHB */
const SORCERER_LEVELED_SPELLS_KNOWN = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15,
];

/** Warlock, PHB */
const WARLOCK_SPELLS_KNOWN = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15,
];

/** Ranger, PHB (0 at 1st level). */
const RANGER_SPELLS_KNOWN = [
  0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
];

/** Eldritch Knight / Arcane Trickster non-cantrip spells known. */
const THIRD_CASTER_SPELLS_KNOWN = [
  0, 0, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9,
];

function deltaKnown(table: number[], oldLevel: number, newLevel: number): number {
  return table[newLevel - 1] - table[oldLevel - 1];
}

export type LevelUpSpellLine = { text: string; emphasis?: boolean };

export function getSpellcastingGuidance(
  character: Character,
  oldLevel: number,
  newLevel: number,
): LevelUpSpellLine[] {
  const slug = character.classSlug;
  const sub = character.subclassSlug ?? "";
  const abil = character.spellcastingAbility;
  if (!abil) return [];

  if (character.computed?.isMulticlass) {
    return [
      {
        text: "Multiclass: each class has its own spell rules (known vs prepared, which list to use). Read each class at this level in the rulebook, then add spells on the Spells tab.",
        emphasis: true,
      },
      {
        text: `Combined spellcasting level (for slots, excluding warlock pact math) is about ${character.computed.multiclassSpellcasterLevel} — the app already updated your spell slot totals.`,
      },
    ];
  }

  const scores: AbilityScores = {
    strength: character.strength,
    dexterity: character.dexterity,
    constitution: character.constitution,
    intelligence: character.intelligence,
    wisdom: character.wisdom,
    charisma: character.charisma,
  };
  const mod = abilityMod(scores[abil]);
  const lines: LevelUpSpellLine[] = [];

  const subL = sub.toLowerCase();
  const isEK = slug === "fighter" && subL.includes("eldritch");
  const isAT = slug === "rogue" && subL.includes("arcane");
  const isThirdSlug = slug === "eldritch-knight" || slug === "arcane-trickster";

  // Paladin / Ranger: gain spellcasting at 2
  if (slug === "paladin" && oldLevel < 2 && newLevel >= 2) {
    lines.push({
      text: "You gain divine spellcasting. You prepare Paladin spells after each long rest (see rulebook). At your level, you can usually prepare Charisma modifier + half your Paladin level (rounded down), minimum one spell — but your DM has the final say.",
      emphasis: true,
    });
  }
  if (slug === "ranger" && oldLevel < 2 && newLevel >= 2) {
    lines.push({
      text: "You gain spellcasting and learn two 1st-level Ranger spells. As you level up, you learn more (see your class table in the rulebook).",
      emphasis: true,
    });
  }

  // Cantrips (PHB curves differ by class)
  if (slug === "cleric" || slug === "wizard") {
    const d = cantripsStandard(newLevel) - cantripsStandard(oldLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new cantrip${d > 1 ? "s" : ""} from your class list. Open the Spells tab and tap Add Spell.`,
        emphasis: true,
      });
    }
  } else if (slug === "druid") {
    const d = cantripsDruid(newLevel) - cantripsDruid(oldLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new druid cantrip${d > 1 ? "s" : ""} (druids know fewer cantrips than clerics at low levels, then catch up — see your class table). Open the Spells tab and tap Add Spell.`,
        emphasis: true,
      });
    }
  } else if (slug === "sorcerer") {
    const d = cantripsSorcerer(newLevel) - cantripsSorcerer(oldLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new sorcerer cantrip${d > 1 ? "s" : ""}. Open the Spells tab and tap Add Spell.`,
        emphasis: true,
      });
    }
  } else if (slug === "bard" || slug === "warlock") {
    const d = cantripsBardWarlock(newLevel) - cantripsBardWarlock(oldLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new cantrip${d > 1 ? "s" : ""}. Add ${d > 1 ? "them" : "it"} on the Spells tab.`,
        emphasis: true,
      });
    }
  } else if (isEK || isAT || isThirdSlug) {
    const d = cantripsThirdCaster(newLevel) - cantripsThirdCaster(oldLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new wizard cantrip${d > 1 ? "s" : ""} (Arcane Trickster / Eldritch Knight). Add ${d > 1 ? "them" : "it"} on the Spells tab.`,
        emphasis: true,
      });
    }
  }

  // Prepared casters (full)
  if (slug === "cleric") {
    const prep = mod + newLevel;
    lines.push({
      text: `After a long rest you prepare Cleric spells: usually ${prep} spell${prep === 1 ? "" : "s"} of 1st level or higher (Wisdom modifier + Cleric level), plus cantrips and domain spells. Pick new spells if your number went up.`,
    });
  } else if (slug === "druid") {
    const prep = Math.max(1, mod + newLevel);
    lines.push({
      text: `After a long rest you prepare Druid spells: ${prep} spell${prep === 1 ? "" : "s"} of 1st level or higher (Wisdom modifier + Druid level, minimum 1), plus your cantrips and any bonus spells from your Druid Circle. Update the Spells tab after a rest.`,
    });
    lines.push({
      text: "When you gain a druid level, you may replace one druid spell you prepare with another druid spell of a level you can cast (PHB).",
    });
  } else if (slug === "wizard") {
    lines.push({
      text: "Add two new Wizard spells to your spellbook. They must be of a level you can cast, and at least one is often chosen from a spell scroll or two free picks from the rulebook — your DM decides if you find extras.",
      emphasis: true,
    });
    const prep = abilityMod(scores.intelligence) + newLevel;
    lines.push({
      text: `Each day you prepare spells from your book: usually ${prep} spell${prep === 1 ? "" : "s"} (Intelligence modifier + Wizard level).`,
    });
  }

  // Known casters
  if (slug === "bard") {
    const d = deltaKnown(BARD_SPELLS_KNOWN, oldLevel, newLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new Bard spell${d > 1 ? "s" : ""} from the Bard list (any spell level you can cast). Add ${d > 1 ? "them" : "it"} on the Spells tab.`,
        emphasis: true,
      });
    }
  } else if (slug === "sorcerer") {
    const d = deltaKnown(SORCERER_LEVELED_SPELLS_KNOWN, oldLevel, newLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new Sorcerer spell${d > 1 ? "s" : ""}. Add ${d > 1 ? "them" : "it"} on the Spells tab.`,
        emphasis: true,
      });
    }
  } else if (slug === "warlock") {
    const d = deltaKnown(WARLOCK_SPELLS_KNOWN, oldLevel, newLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new Warlock spell${d > 1 ? "s" : ""}. When you gain a level, you can also replace one spell you know with another from the list. Add spells on the Spells tab.`,
        emphasis: true,
      });
    }
    lines.push({
      text: "Warlock spell slots work differently (they all match one slot level and recharge on a short or long rest). This app already updated your slot numbers when you level up.",
    });
  } else if (slug === "ranger" && newLevel >= 2) {
    const d = deltaKnown(RANGER_SPELLS_KNOWN, oldLevel, newLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new Ranger spell${d > 1 ? "s" : ""} from the Ranger list. Add ${d > 1 ? "them" : "it"} on the Spells tab.`,
        emphasis: true,
      });
    }
  } else if (slug === "paladin" && newLevel >= 2) {
    const half = Math.floor(newLevel / 2);
    const prep = Math.max(1, mod + half);
    lines.push({
      text: `You can prepare ${prep} Paladin spell${prep === 1 ? "" : "s"} of 1st level or higher after a long rest (Charisma modifier + half your Paladin level, rounded down, minimum one).`,
    });
  }

  // Third-caster spells known (EK / AT)
  if (isEK || isAT || isThirdSlug) {
    const d = deltaKnown(THIRD_CASTER_SPELLS_KNOWN, oldLevel, newLevel);
    if (d > 0) {
      lines.push({
        text: `Learn ${d} new spell${d > 1 ? "s" : ""} from the Wizard list (must be enchantment or illusion for Arcane Trickster, or abjuration or evocation for Eldritch Knight, unless replacing at higher levels — see rulebook). Add on the Spells tab.`,
        emphasis: true,
      });
    }
  }

  if (lines.length === 0) {
    lines.push({
      text: "If your class gains spells this level, check your class chapter in the rulebook, then add them on the Spells tab.",
    });
  }

  return lines;
}

export function isAsiFeatureName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /ability score improvement/i.test(name) ||
    /ability score increase/i.test(name) ||
    /\basi\b/i.test(name) ||
    (n.includes("ability") && n.includes("score") && (n.includes("improvement") || n.includes("increase")))
  );
}

export type LevelUpChecklistBlock = {
  title: string;
  items: string[];
};

/** Multiclass: class gaining this level-up and its tier after the bump (defaults to single-class = `newLevel`). */
export type LevelUpChecklistClassContext = {
  classSlugGaining: string;
  classTierAfter: number;
  subclassSlugForClass: string | null | undefined;
};

export function buildLevelUpChecklist(
  character: Character,
  cls: DndClass | null,
  newLevel: number,
  classCtx?: LevelUpChecklistClassContext | null,
): LevelUpChecklistBlock[] {
  const oldLevel = character.level;
  const blocks: LevelUpChecklistBlock[] = [];

  const gainSlug = (classCtx?.classSlugGaining ?? character.classSlug).trim();
  if (character.computed?.isMulticlass && !classCtx) {
    console.warn(
      "[buildLevelUpChecklist] Multiclass character — no classCtx provided. " +
        "featureTier will default to total character level, which is wrong for ASI gating. " +
        "Pass classCtx.classTierAfter = the class level being gained.",
    );
  }
  const featureTier = classCtx?.classTierAfter ?? newLevel;
  const subForFeatures = (classCtx?.subclassSlugForClass ?? character.subclassSlug ?? "").trim();

  blocks.push({
    title: "Hit points",
    items: [
      `Roll your class Hit Die (d${character.hitDieType}) and add your Constitution modifier, or use the average shown below. Your HP and hit dice maximum go up when you tap Apply.`,
      `You also gain one more Hit Die to spend on short rests (the app tracks this for you).`,
    ],
  });

  if (character.computed?.isMulticlass) {
    blocks.splice(1, 0, {
      title: "Multiclass",
      items: [
        `Your build: ${character.computed.classSummary}. You are adding exactly one level to one class (pick which class below).`,
        "Spell slots use the PHB multiclass rules; this app recalculates them when you apply.",
        "Skills and features from other classes stay — use the Features tab to write down anything new.",
      ],
    });
  }

  const pbOld = proficiencyBonusAtLevel(oldLevel);
  const pbNew = proficiencyBonusAtLevel(newLevel);
  if (pbNew > pbOld) {
    blocks.push({
      title: "Proficiency bonus",
      items: [
        `Your proficiency bonus goes up from +${pbOld} to +${pbNew}. That raises attack rolls, saving throws, and skills where you are proficient (and many class features that use this number).`,
      ],
    });
  }

  const featLevel = SUBCLASS_CHOICE_LEVEL[gainSlug];
  if (featLevel != null && featureTier === featLevel && !subForFeatures) {
    blocks.push({
      title: "Subclass choice",
      items: [
        `At ${featureTier}${ordinalSuffix(featureTier)} level in this class, you usually choose a subclass. Pick one with your DM, then set it on your character (or ask a grown-up to help).`,
      ],
    });
  }

  const classFeatures = cls?.features?.filter((f) => f.level === featureTier) ?? [];
  let subFeatures: { name: string; description: string }[] = [];
  if (cls?.subclasses && subForFeatures) {
    const sub = resolveSubclassOnClass(cls, subForFeatures);
    subFeatures = (sub?.features ?? []).filter((f) => f.level === featureTier);
  }

  const featureLines: string[] = [];
  for (const f of classFeatures) {
    const short = trimDesc(f.description, 220);
    featureLines.push(short ? `${f.name}: ${short}` : f.name);
  }
  for (const f of subFeatures) {
    const short = trimDesc(f.description, 220);
    featureLines.push(`Subclass — ${f.name}: ${short || f.name}`);
  }

  const asiHit =
    classFeatures.some((f) => isAsiFeatureName(f.name)) ||
    subFeatures.some((f) => isAsiFeatureName(f.name)) ||
    classLevelHasPhbStyleAsi(gainSlug, featureTier);

  if (featureLines.length > 0) {
    blocks.push({
      title: "Class features at this level",
      items: featureLines,
    });
  } else if (!cls) {
    blocks.push({
      title: "Class features at this level",
      items: [
        "Open your class in the rulebook and read what you gain at this level. If the app could not load class data, check your internet connection and try again.",
      ],
    });
  } else {
    blocks.push({
      title: "Class features at this level",
      items: [
        "No extra named feature showed up in the SRD data for this level (sometimes the table only lists spells or a die increase). Still read your class level table in the rulebook so you do not miss anything.",
      ],
    });
  }

  if (asiHit) {
    blocks.push({
      title: "Ability scores or feat",
      items: [
        "You gain Ability Score Improvement: raise one ability by 2, or two abilities by 1 each, or take a feat if your DM allows feats (some feats have requirements).",
        "Use Edit on the ability scores on this sheet (or ask a grown-up) to update your scores, and note any new feat on the Features tab.",
      ],
    });
  }

  if (character.spellcastingAbility) {
    const spellLines = getSpellcastingGuidance(character, oldLevel, newLevel).map((l) => l.text);
    blocks.push({
      title: "Spells",
      items: spellLines,
    });
  }

  if (gainSlug === "warlock" && featureTier >= 3) {
    blocks.push({
      title: "Eldritch Invocations — optional replacement",
      items: [
        "You may replace one known Eldritch Invocation with another you qualify for at your current Warlock level. This is optional.",
      ],
    });
  }
  if (gainSlug === "sorcerer" && featureTier >= 4) {
    blocks.push({
      title: "Metamagic — optional replacement",
      items: ["You may replace one known Metamagic option with another. This is optional."],
    });
  }

  blocks.push({
    title: "Spell slots",
    items: [
      "Spell slot totals for your class are updated automatically when you level up (SRD-style). Use the Spells tab to use or recover slots.",
    ],
  });

  return blocks;
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function trimDesc(s: string, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
