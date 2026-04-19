# Cursor Agent Prompt — Multiclass Bug Fixes
> **Scope:** `backend/src/lib/multiclassEntryProficiencies.ts`, `backend/src/services/calculationService.ts`, `backend/src/services/multiclass.test.ts`, `frontend/src/lib/multiclassDraftSkills.ts`, `frontend/src/lib/multiclassPrereqs.ts`, `frontend/src/lib/maxSpellSlotLevel.ts`, `frontend/src/types/dnd.ts`
> **Goal:** All multiclassing rules from D&D 5e PHB Chapter 6 (p.163–165) must be enforced correctly.

---

## Bug List (fix all of these)

### FIX-MC-001 — Fighter multiclass entry is missing "heavy armor"
**File:** `backend/src/lib/multiclassEntryProficiencies.ts` ~line 37–41
**PHB rule (p.164 Multiclass Proficiencies table):** Fighter entry grants: Light armor, medium armor, **heavy armor**, shields, simple weapons, martial weapons.

**Fix:**
```ts
fighter: {
  armor: ["light armor", "medium armor", "heavy armor", "shields"],
  weapons: ["simple weapons", "martial weapons"],
  tools: [],
  skills: [],
},
```

---

### FIX-MC-002 — Barbarian multiclass entry incorrectly grants light and medium armor
**File:** `backend/src/lib/multiclassEntryProficiencies.ts` ~line 15–19
**PHB rule (p.164):** Barbarian entry grants: **Shields, simple weapons, martial weapons. NO armor.**

**Fix:**
```ts
barbarian: {
  armor: ["shields"],
  weapons: ["simple weapons", "martial weapons"],
  tools: [],
  skills: [],
},
```

---

### FIX-MC-003 — Bard and Rogue multiclass entry are missing skill proficiency grants
**File:** `backend/src/lib/multiclassEntryProficiencies.ts`
**PHB rule (p.164):**
- Bard entry: "Light armor, one skill of your choice, one musical instrument of your choice"
- Rogue entry: "Light armor, one skill from the Rogue's skill list, thieves' tools"

**Fix:**
1. Add `skills: string[]` to the `ProficiencySet` type:
```ts
type ProficiencySet = {
  weapons: string[];
  armor: string[];
  tools: string[];
  skills: string[];  // multiclass entry skill grants (PHB p.164)
};
```

2. Update ALL class entries to include `skills: []`, then add skill grants for Bard and Rogue:
```ts
bard:  { ..., skills: ["one skill of your choice"] },
rogue: { ..., skills: ["one skill from the Rogue skill list"] },
```

3. In the `computeMulticlassEntryProficiencies` (or equivalent) function, collect skills similarly to weapons/armor/tools and return them.

---

### FIX-MC-004 — Warlock pact slots are merged into the multiclass spell slot pool (must be a separate pool)
**File:** `backend/src/services/calculationService.ts` ~line 615–637
**PHB rule (p.164–165):** Warlock Pact Magic slots and standard Spellcasting slots are **two separate pools**. They can be used interchangeably for casting, but they recharge differently (pact = short rest, standard = long rest). They must NOT be added together into a single slot count.

**Fix:**

1. Change the return type of `spellSlotsForMulticlass`:
```ts
// BEFORE:
{ level: number; total: number }[]
// AFTER:
{ level: number; total: number; source: "spellcasting" | "pact" }[]
```

2. Tag all multiclass table slots with `source: "spellcasting"`.

3. Return Warlock pact slots as a **separate entry** with `source: "pact"` — do NOT add them to `byLevel`:
```ts
// REMOVE this line:
byLevel.set(L, (byLevel.get(L) ?? 0) + pact.slots);

// REPLACE WITH:
const pactEntry = { level: pact.level, total: pact.slots, source: "pact" as const };
```

4. Return combined array:
```ts
return [
  ...Array.from(byLevel.entries()).map(([level, total]) => ({
    level, total, source: "spellcasting" as const
  })),
  pactEntry,
].sort((a, b) => a.level - b.level);
```

5. Update `SpellSlot` interface in `frontend/src/types/dnd.ts` to add:
```ts
source?: "spellcasting" | "pact";
```

6. On the character sheet Spells tab, display pact slots with a "Short Rest" badge to distinguish them from long-rest slots.

---

### FIX-MC-005 — multiclass.test.ts asserts incorrect warlock slot-merging behavior
**File:** `backend/src/services/multiclass.test.ts` ~line 24–33

**Fix:** Rewrite the Wizard/Warlock test to verify two **separate** pools:
```ts
test("Wizard 5 / Warlock 3: pact slots and spellcasting slots are separate pools", () => {
  const slots = spellSlotsForMulticlass([
    { classSlug: "wizard", levels: 5 },
    { classSlug: "warlock", levels: 3 },
  ]);
  // Standard multiclass: combined caster level = 5 (Wizard 5 full) → 4×1st, 3×2nd
  const stdSecond = slots.find(s => s.level === 2 && s.source === "spellcasting");
  assert.ok(stdSecond);
  assert.equal(stdSecond!.total, 3);
  // Pact magic: Warlock 3 → 2 slots at 2nd level
  const pactSecond = slots.find(s => s.level === 2 && s.source === "pact");
  assert.ok(pactSecond);
  assert.equal(pactSecond!.total, 2);
  // They must NOT be merged — no single slot row should have total=5
  const merged = slots.find(s => s.level === 2 && s.total === 5);
  assert.equal(merged, undefined, "Pact and spellcasting slots must NOT be merged");
});
```

---

### FIX-MC-006 — `spellSlotsForClass` cannot distinguish Eldritch Knight Fighter from base Fighter
**File:** `backend/src/services/calculationService.ts` ~line 534–567
**PHB rule (p.74, p.97):** Eldritch Knight and Arcane Trickster are third-casters. Base Fighter and Rogue have NO spell slots.

**Fix:** Add a `subclassSlug?: string` parameter to `spellSlotsForClass`. Without it, always return `[]` for `fighter` and `rogue`. With `subclassSlug`:
```ts
export function spellSlotsForClass(classSlug: string, level: number, subclassSlug?: string): SpellSlot[] {
  // Third casters — only if subclass is EK or AT
  if (classSlug === "fighter") {
    if (!subclassSlug?.includes("eldritch-knight")) return [];
    const casterLevel = Math.floor(level / 3);
    return casterLevel >= 1 ? slotRowToList(THIRD_CASTER_SLOTS[casterLevel - 1]) : [];
  }
  if (classSlug === "rogue") {
    if (!subclassSlug?.includes("arcane-trickster")) return [];
    const casterLevel = Math.floor(level / 3);
    return casterLevel >= 1 ? slotRowToList(THIRD_CASTER_SLOTS[casterLevel - 1]) : [];
  }
  // ... rest of function unchanged
}
```
Update all call sites in `calculationService.ts` and `multiclass*.ts` to pass `subclassSlug`.

---

### FIX-MC-007 — Ranger multiclass entry gives access to the full 18-skill pool instead of the restricted Ranger list
**File:** `frontend/src/lib/multiclassDraftSkills.ts` ~line 82–86
**PHB rule (p.164):** Ranger multiclass entry: "one skill from the Ranger's skill list" = Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth, Survival.

**Fix:** Add a restricted pool constant and use it for Ranger:
```ts
const MULTICLASS_ENTRY_SKILL_POOLS: Partial<Record<string, string[]>> = {
  ranger: [
    "animal-handling", "athletics", "insight", "investigation",
    "nature", "perception", "stealth", "survival"
  ],
  rogue: [
    "acrobatics", "athletics", "deception", "insight", "intimidation",
    "investigation", "perception", "performance", "persuasion",
    "sleight-of-hand", "stealth"
  ],
  // bard: no restriction (all skills)
};

// In the multiclass loop:
const restrictedPool = MULTICLASS_ENTRY_SKILL_POOLS[cls.slug];
if (restrictedPool) {
  restrictedPool.forEach((s) => pool.add(s));
} else {
  healed.pool.forEach((s) => pool.add(s));
}
```

---

### FIX-MC-008 — `maxSpellSlotLevel.ts` uses `Math.ceil(lv/2)` approximation — replace with PHB breakpoints
**File:** `frontend/src/lib/maxSpellSlotLevel.ts` ~line 17
**PHB rule (p.114 Full Caster Slot Table):**

| Character levels | Max slot level |
|-----------------|---------------|
| 1–2 | 1st |
| 3–4 | 2nd |
| 5–6 | 3rd |
| 7–8 | 4th |
| 9–10 | 5th |
| 11–12 | 6th |
| 13–14 | 7th |
| 15–16 | 8th |
| 17–20 | 9th |

**Fix:** Replace the heuristic with explicit breakpoints:
```ts
// Full caster max spell slot level (PHB p.114)
if (lv <= 2)  return 1;
if (lv <= 4)  return 2;
if (lv <= 6)  return 3;
if (lv <= 8)  return 4;
if (lv <= 10) return 5;
if (lv <= 12) return 6;
if (lv <= 14) return 7;
if (lv <= 16) return 8;
return 9;
```

---

### FIX-MC-009 — ASI timing defaults to total character level when `classCtx` is absent in multiclass builds
**File:** `frontend/src/lib/levelUpGuide.ts` ~line 329
**PHB rule (p.164):** ASIs are tracked per-class-level. Fighter gets extra ASIs at class levels 6 and 14. Using total character level instead of class level causes wrong ASI prompts.

**Fix:** Add a runtime warning when `isMulticlass` is true but `classCtx` is not provided:
```ts
if (character.computed?.isMulticlass && !classCtx) {
  console.warn(
    "[buildLevelUpChecklist] Multiclass character — no classCtx provided. " +
    "featureTier will default to total character level, which is wrong for ASI gating. " +
    "Pass classCtx.classTierAfter = the class level being gained."
  );
}
const featureTier = classCtx?.classTierAfter ?? newLevel;
```
Also: audit all call sites of `buildLevelUpChecklist` that handle multiclass characters and confirm `classCtx` is always passed.

---

## Verification Steps

After applying all fixes:

1. **Fighter into Wizard:** Create Fighter 1 then multiclass to Wizard. Confirm Fighter entry proficiencies include heavy armor.
2. **Barbarian multiclass:** Create Rogue 3 then multiclass to Barbarian. Confirm Barbarian entry grants shields + weapons but NO light or medium armor.
3. **Rogue multiclass entry skill:** Create Wizard 3 then multiclass to Rogue. Confirm a skill pick appears, restricted to the Rogue skill list only.
4. **Ranger multiclass skill pool:** Create Cleric 3 then multiclass to Ranger. Confirm only the 8 Ranger skills are available (not Arcana, History, etc.).
5. **Warlock/Wizard slots:** Create Wizard 5 / Warlock 3. On the Spells tab confirm two SEPARATE slot rows for 2nd level: 3 standard (long rest) and 2 pact (short rest), clearly labeled.
6. **Spell slot max level:** Create a Wizard at level 7. Confirm the spell picker allows 4th-level spells. Create a Wizard at level 11. Confirm 6th-level spells are available.
7. Run: `npx tsx --test backend/src/services/multiclass.test.ts` — all tests should pass.
