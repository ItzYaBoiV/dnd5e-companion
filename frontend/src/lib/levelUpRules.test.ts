import { describe, expect, it } from "vitest";
import { ASI_LEVELS_BY_CLASS, classLevelHasPhbStyleAsi, SUBCLASS_CHOICE_LEVEL } from "@/lib/levelUpGuide";
import { getSpellLearnBudget } from "@/lib/levelUpSpellBudget";

describe("PHB ASI class levels", () => {
  it("matches expected grid for standard classes (4/8/12/16/19)", () => {
    const standard = [4, 8, 12, 16, 19];
    for (const slug of [
      "barbarian",
      "bard",
      "cleric",
      "druid",
      "monk",
      "paladin",
      "ranger",
      "sorcerer",
      "warlock",
      "wizard",
    ] as const) {
      expect(ASI_LEVELS_BY_CLASS[slug], slug).toEqual(standard);
    }
  });

  it("fighter also gains ASI at 6 and 14", () => {
    expect(ASI_LEVELS_BY_CLASS.fighter).toEqual([4, 6, 8, 12, 14, 16, 19]);
    expect(classLevelHasPhbStyleAsi("fighter", 6)).toBe(true);
    expect(classLevelHasPhbStyleAsi("fighter", 5)).toBe(false);
    expect(classLevelHasPhbStyleAsi("fighter", 14)).toBe(true);
  });

  it("rogue also gains ASI at 10", () => {
    expect(ASI_LEVELS_BY_CLASS.rogue).toEqual([4, 8, 10, 12, 16, 19]);
    expect(classLevelHasPhbStyleAsi("rogue", 10)).toBe(true);
    expect(classLevelHasPhbStyleAsi("rogue", 9)).toBe(false);
  });

  it("clamps tier to 1–20", () => {
    expect(classLevelHasPhbStyleAsi("wizard", 0)).toBe(false);
    expect(classLevelHasPhbStyleAsi("wizard", 21)).toBe(false);
  });

  it("unknown class slug has no PHB ASI rows", () => {
    expect(classLevelHasPhbStyleAsi("artificer", 4)).toBe(false);
  });
});

describe("SUBCLASS_CHOICE_LEVEL (SRD/PHB milestones)", () => {
  it("cleric and sorcerer choose at 1; druid and wizard at 2; most others at 3", () => {
    expect(SUBCLASS_CHOICE_LEVEL.cleric).toBe(1);
    expect(SUBCLASS_CHOICE_LEVEL.sorcerer).toBe(1);
    expect(SUBCLASS_CHOICE_LEVEL.warlock).toBe(1);
    expect(SUBCLASS_CHOICE_LEVEL.druid).toBe(2);
    expect(SUBCLASS_CHOICE_LEVEL.wizard).toBe(2);
    expect(SUBCLASS_CHOICE_LEVEL.fighter).toBe(3);
    expect(SUBCLASS_CHOICE_LEVEL.rogue).toBe(3);
  });
});

describe("getSpellLearnBudget (per-class level step)", () => {
  it("cleric 1→2: no new cantrips; prepared caster", () => {
    const b = getSpellLearnBudget("cleric", "", 1, 2);
    expect(b).toEqual({
      cantrips: 0,
      knownSpells: 0,
      wizardSpellbook: 0,
      isPreparedCaster: true,
    });
  });

  it("wizard 1→2: +2 spellbook; no cantrip jump in 1–3 band", () => {
    const b = getSpellLearnBudget("wizard", "", 1, 2);
    expect(b.cantrips).toBe(0);
    expect(b.wizardSpellbook).toBe(2);
    expect(b.isPreparedCaster).toBe(true);
  });

  it("bard 1→2: +1 spell known; cantrips flat in tier 1–3", () => {
    const b = getSpellLearnBudget("bard", "", 1, 2);
    expect(b.cantrips).toBe(0);
    expect(b.knownSpells).toBe(1);
    expect(b.isPreparedCaster).toBe(false);
  });

  it("warlock 1→2: +1 spell known", () => {
    const b = getSpellLearnBudget("warlock", "", 1, 2);
    expect(b.knownSpells).toBe(1);
    expect(b.cantrips).toBe(0);
  });

  it("ranger 1→2: gains 2 known spells (spellcasting begins)", () => {
    const b = getSpellLearnBudget("ranger", "", 1, 2);
    expect(b.knownSpells).toBe(2);
    expect(b.cantrips).toBe(0);
  });

  it("ranger 2→3: +1 known", () => {
    const b = getSpellLearnBudget("ranger", "", 2, 3);
    expect(b.knownSpells).toBe(1);
  });

  it("paladin 1→2: prepared flag only (no forced picks in this helper)", () => {
    const b = getSpellLearnBudget("paladin", "", 1, 2);
    expect(b.isPreparedCaster).toBe(true);
    expect(b.cantrips + b.knownSpells + b.wizardSpellbook).toBe(0);
  });

  it("sorcerer 1→2: +1 leveled known; cantrips stay at 4 through level 3", () => {
    const b = getSpellLearnBudget("sorcerer", "", 1, 2);
    expect(b.cantrips).toBe(0);
    expect(b.knownSpells).toBe(1);
  });

  it("eldritch knight fighter 2→3: third-caster cantrips and spells kick in", () => {
    const b = getSpellLearnBudget("fighter", "eldritch-knight", 2, 3);
    expect(b.cantrips).toBe(2);
    expect(b.knownSpells).toBe(3);
    expect(b.isPreparedCaster).toBe(false);
  });

  it("non-EK fighter 2→3: no spell picks", () => {
    const b = getSpellLearnBudget("fighter", "champion", 2, 3);
    expect(b.cantrips + b.knownSpells + b.wizardSpellbook).toBe(0);
  });
});
