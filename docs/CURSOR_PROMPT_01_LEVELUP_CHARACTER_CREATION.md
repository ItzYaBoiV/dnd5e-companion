# Cursor Agent Prompt — Level-Up & Character Creation Bug Fixes
> **Scope:** `frontend/src/lib/levelUp*`, `frontend/src/components/CharacterCreation/`, `frontend/src/components/CharacterSheet/panels/LevelUpPanel.tsx`, `backend/src/services/calculationService.ts`, `backend/src/lib/classProgression.ts`
> **Goal:** Every one of the 12 base D&D 5e classes must level up correctly, show the right picks, and enforce the right rules so even a child DM can trust the output.

---

## Bug List (fix all of these)

### FIX-001 — Warlock: Eldritch Invocations pick count is always 1 (should be 2 at level 2)
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 456–459
**PHB rule (p.107–110):** Invocations Known: 2 at warlock level 2, then +1 at levels 5, 7, 9, 12, 15, 18.
The delta between the old count and the new count is the correct `pickCount` for that level-up.

**Fix:** Replace the hardcoded `pickCount: 1` with a computed delta:
```ts
const WARLOCK_INVOCATIONS_BY_LEVEL: Record<number, number> = {
  2: 2, 5: 3, 7: 4, 9: 5, 12: 6, 15: 7, 18: 8,
};
// In the invocation pick block:
const prev = WARLOCK_INVOCATIONS_BY_LEVEL[L - 1] ?? (L <= 2 ? 0 : WARLOCK_INVOCATIONS_BY_LEVEL[L]);
const curr = WARLOCK_INVOCATIONS_BY_LEVEL[L] ?? prev;
const pickCount = curr - prev;
if (pickCount < 1) return null;
return { ...spec, pickCount };
```

---

### FIX-002 — Warlock: No prompt to replace an invocation on level-up
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts`, `frontend/src/lib/levelUpGuide.ts`
**PHB rule (p.107):** "When you gain a level in this class, you can replace one of the eldritch invocations you know with another invocation that you could learn at that level."

**Fix:** In `buildLevelUpChecklist` (levelUpGuide.ts), after the invocation pick step, add an optional replacement note for Warlocks at levels 3+ (any level beyond 2 where invocations are already known):
```ts
if (slug === "warlock" && classCtx.classTierAfter >= 3) {
  steps.push({
    kind: "info",
    label: "You may replace one known Eldritch Invocation with another you qualify for at your current Warlock level. This is optional.",
  });
}
```

---

### FIX-003 — Warlock: Invocation level-prerequisites not enforced
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts`, `SRD_ELDRITCH_INVOCATIONS` constant (~line 107–133)
**PHB rule (p.110–111):** Many invocations require a minimum warlock level (e.g., Ascendant Step ≥ 9, Lifedrinker ≥ 12, Witch Sight ≥ 15).

**Fix:** Add a `minLevel` field to each invocation in `SRD_ELDRITCH_INVOCATIONS`. When building the pick options for a Warlock, filter out invocations where `minLevel > currentWarlockClassLevel`:
```ts
const available = SRD_ELDRITCH_INVOCATIONS.filter(
  (inv) => (inv.minLevel ?? 1) <= warlockClassLevel
);
```
Invocations without a minimum level requirement default to `minLevel: 1`.

---

### FIX-004 — Bard: Magical Secrets missing at level 14 for all Bards
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 363–377
**PHB rule (p.54):** All Bards get Magical Secrets (pick 2 spells from any class) at levels **10, 14, and 18**. College of Lore gets an early Magical Secrets at level 6.

**Fix:** Change the condition:
```ts
// BEFORE (wrong):
if (L === 10 || L === 18 || isLoreSix) { ... }
// AFTER (correct):
if (L === 10 || L === 14 || L === 18 || isLoreSix) { ... }
```

---

### FIX-005 — Sorcerer: No prompt to replace a Metamagic option on level-up
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts`, `frontend/src/lib/levelUpGuide.ts`
**PHB rule (p.102):** "When you gain a level in this class, you can replace one metamagic option you know with another one."

**Fix:** In `buildLevelUpChecklist`, add an info step for Sorcerers at class level ≥ 4 (i.e., after they have at least some metamagics):
```ts
if (slug === "sorcerer" && classCtx.classTierAfter >= 4) {
  steps.push({
    kind: "info",
    label: "You may replace one known Metamagic option with another. This is optional.",
  });
}
```

---

### FIX-006 — Fighter (Battle Master): Maneuver pick regex is too strict
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts`, `battleMasterManeuverPicks` function (~line 302–319)
**PHB rule (p.74):** Battle Master learns 2 additional maneuvers at levels 7, 10, and 15.

**Fix:** Rather than relying purely on regex matching of the feature description, hard-code the level-based pick count for Battle Master:
```ts
function battleMasterManeuverPicks(slug: string, sub: string, L: number): number {
  if (slug !== "fighter" || !sub.includes("battle")) return 0;
  if ([7, 10, 15].includes(L)) return 2;
  if (L === 3) return 3; // initial 3 maneuvers at level 3
  return 0;
}
```
Use this function as the primary decision-maker and fall back to description parsing only if the above returns 0.

---

### FIX-007 — Monk (Way of the Four Elements): Level-3 picks 1 discipline instead of 2
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 384–387
**PHB rule (p.81):** "You know 2 disciplines at 3rd level, 1 additional discipline at 6th, 11th, and 17th level."

**Fix:**
```ts
function fourElementsDisciplinePicks(L: number): number {
  if (L === 3) return 2;
  if ([6, 11, 17].includes(L)) return 1;
  return 0;
}
```
Replace the constant `pickCount: 1` with `fourElementsDisciplinePicks(L)` for Four Elements monks.

---

### FIX-008 — Wizard: Spell Mastery pick allows 3rd-level spells; cap must be 2nd-level
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 338–348
**PHB rule (p.115):** Spell Mastery chooses one 1st-level AND one 2nd-level wizard spell. Maximum level is 2nd.

**Fix:** Split into two separate picks:
```ts
// Pick 1: one 1st-level spell
{ pickCount: 1, minSpellLevel: 1, maxSpellLevel: 1, fromKnownSpellbookOnly: true }
// Pick 2: one 2nd-level spell
{ pickCount: 1, minSpellLevel: 2, maxSpellLevel: 2, fromKnownSpellbookOnly: true }
```
The two picks are distinct grants and should appear as two separate `GrantPickSpec` entries.

---

### FIX-009 — Wizard: Signature Spells has contradictory `addToSpellbook: true` flag
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 351–361
**PHB rule (p.115):** Signature Spells designates two spells **already in your spellbook** as always prepared. They are not new spells — they are just always available.

**Fix:** Set `addToSpellbook: false` (the spells are already known; this just marks them as signature). Add a UI note: "Choose 2 wizard spells (3rd level or lower) from your spellbook. They are always prepared and count as 1 spell slot each to cast for free once per short rest."

---

### FIX-010 — Druid Circle of the Land: Wrong terrain list (shows climate types instead of PHB biomes)
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts`, `CIRCLE_LAND_TERRAIN` constant (~line 171–176)
**PHB rule (p.68):** Valid terrains: Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp, Underdark.

**Fix:** Replace the `CIRCLE_LAND_TERRAIN` array:
```ts
const CIRCLE_LAND_TERRAIN = [
  "arctic", "coast", "desert", "forest", "grassland", "mountain", "swamp", "underdark"
];
```

---

### FIX-011 — Barbarian (Totem Warrior): Shows Elk & Tiger at level 3 (should be Bear/Eagle/Wolf only)
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 99–105
**PHB rule (p.50):** Level 3 Totem Spirit = Bear, Eagle, Wolf. Level 6 Aspect of the Beast = Bear, Eagle, Elk, Tiger, Wolf.

**Fix:** Create two separate constants:
```ts
const SRD_TOTEM_SPIRIT = ["bear", "eagle", "wolf"]; // level 3 only
const SRD_ASPECT_BEASTS = ["bear", "eagle", "elk", "tiger", "wolf"]; // level 6 only
```
Use `SRD_TOTEM_SPIRIT` for the L=3 trigger and `SRD_ASPECT_BEASTS` for the L=6 trigger.

---

### FIX-012 — Barbarian (Totem Warrior): "Spirit Seeker" feature incorrectly triggers a Totem pick
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 447–454
**PHB rule (p.50):** Spirit Seeker (level 3) grants ritual spells — no choice required. Totem Spirit (level 3) requires choosing Bear, Eagle, or Wolf.

**Fix:** Tighten the feature name check:
```ts
// Only fire the totem pick for "Totem Spirit", not "Spirit Seeker"
if (n.includes("totem spirit") && !n.includes("spirit seeker")) {
  // fire totem pick
}
```

---

### FIX-013 — Bard: Expertise at level 10 is missing
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 424–431
**PHB rule (p.54):** Bard gains Expertise at levels 3 AND 10.

**Fix:**
```ts
// BEFORE:
if (slug === "bard" && L === 3) pick = 2;
// AFTER:
if (slug === "bard" && (L === 3 || L === 10)) pick = 2;
```

---

### FIX-014 — LevelUpPanel: maxSpellLevelGuess uses total character level instead of class level for third-casters
**File:** `frontend/src/components/CharacterSheet/panels/LevelUpPanel.tsx` ~line 112
**PHB rule (p.75, p.97):** Eldritch Knight / Arcane Trickster spell slot max level = based on `floor(classLevel / 3)`.

**Fix:** When the character's active class has the `thirdCaster` flag, use `Math.floor(classLevel / 3)` instead of `Math.ceil(nextCharLevel / 2)`:
```ts
const maxSpellLevelGuess = isThirdCaster
  ? Math.min(4, Math.max(1, Math.floor(classLevel / 3)))  // EK/AT cap at 4th level
  : isHalfCaster
    ? Math.min(5, Math.max(1, Math.floor(classLevel / 2)))
    : Math.min(9, Math.max(1, Math.ceil(classLevel / 2)));
```

---

### FIX-015 — ASI cap: Scores above 20 are silently allowed without a warning
**File:** `frontend/src/components/CharacterSheet/panels/LevelUpPanel.tsx` ~line 743; `backend/src/services/characterService.ts` ~line 477
**PHB rule (p.173):** ASI normally caps at 20 unless a specific class feature explicitly raises it.

**Fix:** In the ASI increase validator, warn when a score would exceed 20:
```ts
if (newScore > 20) {
  return { valid: false, message: `Ability scores cannot exceed 20 without a special class feature. Current: ${cur}, Attempted: ${newScore}.` };
}
```
In the backend, change the limit from 30 to 20 for normal ASI updates. For features that explicitly raise the cap (e.g., Barbarian Primal Champion), pass a `capOverride` parameter.

---

### FIX-016 — Ranger (Hunter): Multiattack feature-name detection may miss "Volley/Whirlwind"
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 413–415
**PHB rule (p.93):** Hunter level 11 picks between Volley and Whirlwind Attack.

**Fix:** Hard-code the Hunter level-11 pick alongside the regex fallback:
```ts
if (slug === "ranger" && sub.includes("hunter") && L === 11) {
  return { pickCount: 1, options: ["volley", "whirlwind-attack"], kind: "subclassFeature" };
}
```

---

### FIX-017 — Cleric (War Domain): Level-6 feature "War God's Blessing" is shown at level 2
**File:** `frontend/src/lib/levelUpFeatureChoiceCatalog.ts` ~line 379–381
**PHB rule (p.63):** War Cleric gets Guided Strike at level 2 and War God's Blessing at level 6 — separate features granted at different levels.

**Fix:** Gate each domain Channel Divinity feature to its correct class level. For War Domain, only include "Guided Strike" in the level-2 options list and "War God's Blessing" in the level-6 options list. Filter channel divinity opts by comparing `minClassLevel` metadata on each option.

---

## Verification Steps

After applying all fixes:

1. Create a Warlock and level from 1→2. Confirm 2 invocation picks appear, all invocations without level prerequisites are shown, and level-locked invocations (e.g., Lifedrinker) are hidden.
2. Level Warlock from 2→3. Confirm an optional invocation-replacement info message appears.
3. Create a Bard and level to 10, 14, 18. Confirm Magical Secrets (2 spells from any class list) appears at all three levels.
4. Create a College of Lore Bard and level to 6. Confirm Magical Secrets appears.
5. Create a Battle Master Fighter. Level to 7, 10, 15. Confirm 2 maneuver picks at each.
6. Create a Circle of the Land Druid at level 2. Confirm terrain options are: Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp, Underdark.
7. Create a Totem Warrior Barbarian at level 3. Confirm only Bear, Eagle, Wolf are shown for Totem Spirit. Level to 6. Confirm all 5 beasts appear for Aspect of the Beast.
8. Create a Bard and level to 10. Confirm 2 Expertise picks appear.
9. Create a Wizard and level to 18. Confirm Spell Mastery shows as two separate picks: one 1st-level and one 2nd-level spell.
10. Try to raise an ability score above 20 via ASI. Confirm a clear error message appears.
