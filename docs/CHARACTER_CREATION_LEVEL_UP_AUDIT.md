# Character creation & level-up audit (PHB-aligned)

This document is the **master checklist** for verifying D&D 5e-style progression in this app. Rules follow the **SRD / Open5e** data we seed; the [Player’s Handbook](https://universitypark.newdesignscharter.com/accnt_606843/site_606946/Documents/DD-Player-Handbook.pdf) is the player-facing reference when wording differs.

**What the app does**

- **Starting above 1st level:** guided steps per character level (HP, features, spells where applicable, ASI).
- **Multiclass:** class breakdown + **level order** for levels 2–N; each step advances **one class** by one level (PHB-style).
- **Spells:** “Pick spells here” applies to **spells known** (bard, sorcerer, warlock, ranger ≥2, EK/AT) and **wizard spellbook** (+2 spells per wizard level). **Prepared** casters (cleric, druid, wizard preparation count, paladin ≥2) see **reminder copy** instead of forced picks—update the sheet / Spells tab.
- **Subclass:** choice at the class level in `SUBCLASS_CHOICE_LEVEL` (`frontend/src/lib/levelUpGuide.ts`).
- **ASI:** PHB schedule in `ASI_LEVELS_BY_CLASS` (includes **fighter 6 & 14**, **rogue 10**). If Open5e omits the feature row, a **synthetic “Ability Score Improvement”** grant is injected (`levelUpGrantCandidates.ts`).
- **Empty table shells:** generic rows like “Divine Domain Feature” with no text are **dropped** when subclass features exist for that level; subclass slugs are **resolved loosely** (`levelUpSubclassResolve.ts`).

---

## 1. Subclass choice level (per class)

| Class     | Subclass at class level |
| --------- | ----------------------- |
| Barbarian | 3                       |
| Bard      | 3                       |
| Cleric    | 1                       |
| Druid     | 2                       |
| Fighter   | 3                       |
| Monk      | 3                       |
| Paladin   | 3                       |
| Ranger    | 3                       |
| Rogue     | 3                       |
| Sorcerer  | 1                       |
| Warlock   | 1                       |
| Wizard    | 2                       |

**Verify:** New character at high level → first time a class hits that row, **Choose subclass** appears with radio options. Multiclass: domain/oath/etc. stored on the **correct class row**.

---

## 2. Ability Score Improvement (PHB class levels)

Standard: **4, 8, 12, 16, 19** for most classes.

| Class     | Extra ASI levels |
| --------- | ---------------- |
| Fighter   | **6**, **14**    |
| Rogue     | **10**           |

**Verify:** At those **class** levels (not necessarily character level in multiclass), **Ability Score Improvement** appears under “Features you gain” and in the checklist. **Sheet level-up panel** checklist uses **class tier** for the class being leveled (multiclass fix).

---

## 3. Spell picks in the wizard (by class, class level)

| Class / archetype | Cantrips on level-up | Leveled “known” picks | Notes |
| ----------------- | -------------------- | -------------------- | ----- |
| Cleric            | Standard curve       | 0 (prepared)         | Reminder only |
| Druid             | Druid curve          | 0 (prepared)         | Reminder only |
| Wizard            | Standard curve       | 0 known; **+2 spellbook** | Pick 2 spells |
| Bard              | Bard/warlock curve   | Table delta          |       |
| Warlock           | Bard/warlock curve   | Table delta          |       |
| Sorcerer          | Sorcerer curve       | Table delta          |       |
| Ranger            | —                    | 0→2 at first ranger ≥2, then table |       |
| Paladin           | —                    | 0 (prepared ≥2)      | Reminder only |
| Fighter (EK)      | Third-caster curve   | Third-caster table   | Subclass name contains eldritch |
| Rogue (AT)        | Third-caster curve   | Third-caster table   | Subclass name contains arcane |

**Verify:** For each class, level **1→2→…→20** in isolation: cantrip/known counts match `getSpellLearnBudget` + Step 7 / level-up spell UI.

---

## 4. Multiclass combinations (sampling strategy)

Full Cartesian product of 12×11×… is huge. Use this **regression matrix**:

1. **Every pair** of distinct PHB classes (e.g. Cleric/Paladin, Wizard/Fighter EK, Bard/Rogue AT).
2. For each pair: **total level** 3, 5, 10, 20 with **different level orders** (at least two orders for N≥4).
3. For each step: correct **hit die**, **subclass only when due**, **ASI at fighter 6/14 and rogue 10** when that class hits those tiers, **prepared vs known** messaging.

**Automated expectation:** `validateMulticlassSteppedDraft` passes; `classLevelsAfterCharLevel` matches row totals.

---

## 5. Reference data risks (Open5e)

- Feature **names** may differ from PHB wording; **ASI** is backed by `ASI_LEVELS_BY_CLASS` when the name is missing.
- Some **generic table lines** have **no description**; we strip empties when subclass rows exist.
- If a **subclass slug** in the draft does not match API slugs, **resolveSubclassOnClass** tries segment/affix matches—if still wrong, user should re-pick subclass.

---

## 6. Manual QA script (high level start)

1. Create character **level 20**, single-class, each class once → complete all level steps → submit.
2. Create **level 20** **two-class** builds (e.g. Cleric 10 / Wizard 10) with **two different paths** through `multiclassLevelOrder`.
3. Spot-check **Fighter 6** and **Rogue 10** for ASI row.
4. Spot-check **Cleric 2** / **Druid 2** for **domain/circle** feature text (not empty shell).
5. Spot-check **Wizard** every level: **two spellbook** picks where applicable.

---

## 7. Key source files

| Area | File |
| ---- | ---- |
| Subclass level | `frontend/src/lib/levelUpGuide.ts` → `SUBCLASS_CHOICE_LEVEL` |
| PHB ASI levels (UI) | `frontend/src/lib/levelUpGuide.ts` → `ASI_LEVELS_BY_CLASS`, `classLevelHasPhbStyleAsi` |
| PHB ASI levels (API) | `backend/src/lib/classProgression.ts` → `ASI_CLASS_LEVELS_PHB`, `classTierHasPhbAbilityImprovement` — **server accepts ASI when Open5e omits the row** |
| Spell deltas | `frontend/src/lib/levelUpSpellBudget.ts` |
| Feature grants + synthetic ASI + empty shells | `frontend/src/lib/levelUpGrantCandidates.ts` |
| Subclass slug match | `frontend/src/lib/levelUpSubclassResolve.ts` |
| Creation level-up UI | `frontend/src/components/CharacterCreation/CreationLevelUpStep.tsx` |
| Sheet level-up UI | `frontend/src/components/CharacterSheet/panels/LevelUpPanel.tsx` |
| Multiclass path + level chain validation | `frontend/src/lib/multiclassLevelPlan.ts` → `validateMulticlassSteppedDraft`, `validateCreationLevelUpsChain` |

---

*Last updated: PHB ASI parity on backend `levelUp`, dense `creationLevelUps` validation on review/submit, synthetic ASI + multiclass checklist class tier + subclass placeholder stripping.*
