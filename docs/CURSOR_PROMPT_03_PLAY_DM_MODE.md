# Cursor Agent Prompt — Play (DM) Mode Bug Fixes
> **Scope:** `frontend/src/pages/PlayPage.tsx`, `frontend/src/pages/PlayMonsterPage.tsx`, `backend/src/services/sessionService.ts`, `backend/src/controllers/combatController.ts`, `frontend/src/store/sessionStore.ts`
> **Goal:** DM mode must enforce D&D 5e rules correctly enough that a child DM can run a full encounter using only this tool without making rules errors.

---

## Critical Priority Fixes

### FIX-DM-001 — Monster initiative never adds DEX modifier
**File:** `frontend/src/pages/PlayPage.tsx` ~lines 556, 3009
**PHB rule (p.189):** Initiative = d20 + DEX modifier.

**Fix:** In `buildForgeMonsterCombatants` and `StartCombatPanel.addMonster`, replace:
```ts
initiative: Math.floor(Math.random() * 20) + 1,
```
With:
```ts
initiative: Math.floor(Math.random() * 20) + 1 + Math.floor(((mon.dexterity ?? 10) - 10) / 2),
```
If the monster list endpoint (`/api/monsters?search=`) doesn't already return `dexterity`, add `dexterity: true` to the select in `backend/src/services/monsterService.ts` `listMonsters`.

---

### FIX-DM-002 — Critical hit doubles the modifier (should double only the dice)
**File:** `backend/src/controllers/combatController.ts` ~line 67
**PHB rule (p.196):** On a critical hit, roll the weapon's damage dice **twice**, then add the modifier **once**. For `1d8+3`, a crit is `2d8+3` (not `1d8+3+1d8+3`).

**Fix:** Create and export a helper in `frontend/src/lib/quickDiceRoll.ts`:
```ts
export function doubleDiceOnly(notation: string): string {
  // Doubles only the NdM parts, not flat bonuses
  // "1d8+3" → "2d8+3"   |   "2d6" → "4d6"
  return notation.replace(/(\d+)(d\d+)/gi, (_, n, d) => `${Number(n) * 2}${d}`);
}
```
Then in `combatController.ts`:
```ts
damageDice: isCrit ? doubleDiceOnly(result.damageDice) : result.damageDice,
```

---

### FIX-DM-003 — No per-turn tracking within a round; "TURN" badge always shows on highest-initiative creature
**Files:** `backend/src/services/sessionService.ts`, `frontend/src/store/sessionStore.ts`, `frontend/src/pages/PlayPage.tsx`
**PHB rule (p.189):** Each combatant takes one turn per round in initiative order. The tool must advance turn by turn.

**Fix (3 parts):**

**Part A — Schema:** Add `currentTurnIndex Int @default(0)` to the `Combat` model in `prisma/schema.prisma`. Run migration: `npx prisma migrate dev --name add_currentTurnIndex`.

**Part B — Backend:** In `sessionService.ts`, add a `nextTurn` export:
```ts
export async function nextTurn(combatId: string) {
  const c = await prisma.combat.findUnique({
    where: { id: combatId },
    include: { combatants: true },
  });
  if (!c) throw new NotFoundError("Combat");
  const alive = [...c.combatants]
    .filter((x) => x.isAlive)
    .sort((a, b) => b.initiative - a.initiative);
  const next = ((c.currentTurnIndex ?? 0) + 1) % Math.max(1, alive.length);
  const newRound = next === 0;
  await prisma.combat.update({
    where: { id: combatId },
    data: {
      currentTurnIndex: next,
      round: newRound ? { increment: 1 } : undefined,
    },
  });
  return getCombat(combatId);
}
```
Register in `sessionController.ts` and routes: `POST /sessions/:id/combats/:combatId/next-turn`.

**Part C — Frontend:** In `PlayPage.tsx` `InlineCombatPanel`:
- Replace `const current = sorted[0] ?? null` with:
  ```ts
  const currentIdx = activeCombat.currentTurnIndex ?? 0;
  const current = alive[currentIdx] ?? alive[0] ?? null;
  ```
- Replace `isFirst` with `c.id === current?.id` for the TURN badge.
- Replace the "Next Round" button with "Next Turn ▶" that calls `nextTurn()`.
- Remap the `N` keyboard shortcut to call `nextTurn()` (not `nextRound()`).

---

### FIX-DM-004 — Downed PCs (0 HP) are immediately removed from initiative instead of entering dying state
**Files:** `backend/src/services/sessionService.ts` ~lines 174–191, `frontend/src/pages/PlayPage.tsx`
**PHB rule (p.197):** A character at 0 HP is **unconscious and dying**, not dead. They remain in initiative, roll death saves on their turn (3 failures = dead, 3 successes = stabilized, nat 20 = regain 1 HP).

**Fix:**
1. In `damageCombatant`, do NOT set `isAlive: false` when HP reaches 0. Only set it on explicit DM death-confirmation.
2. In `getCombat` turn-order filter, keep `isAlive: true` (default) for downed PCs — they remain in the list.
3. In `PlayPage.tsx` `CombatantRow`, show a DYING indicator when `c.currentHp === 0 && c.isAlive && c.type === "player"`:
```tsx
{c.currentHp === 0 && c.type === "player" && (
  <span className="rounded border border-red-700 bg-red-950 px-1.5 py-0.5 text-[10px] font-display text-red-300 animate-pulse">
    DYING — roll death saves on their turn
  </span>
)}
```
4. Add a "Confirm Death (3 failures)" button visible only when `currentHp === 0` for the DM to mark a PC as truly dead — this sets `isAlive: false`.

---

### FIX-DM-005 — No concentration check prompt when a concentrating combatant takes damage
**File:** `frontend/src/pages/PlayPage.tsx`
**PHB rule (p.203):** When a concentrating creature takes damage, it must succeed on a CON save (DC = max(10, half damage received, rounded down)) or lose concentration.

**Fix:** After any damage is applied to a combatant with `isConcentrating: true`, show a prompt:
```tsx
if (c.isConcentrating && amount > 0) {
  const dc = Math.max(10, Math.floor(amount / 2));
  setConcentrationAlert({
    name: c.label,
    dc,
    message: `${c.label} is concentrating! CON save DC ${dc} needed (d20 + CON mod). Failure = concentration ends.`,
  });
}
```
Display this as a sticky banner or modal the DM must dismiss. Include the character's CON save modifier if available from `rollSummary`.

---

### FIX-DM-006 — Attack roll always displays "HIT" without comparing to target's AC
**File:** `frontend/src/pages/PlayPage.tsx`, `DmMonsterActionRow`
**PHB rule (p.194):** An attack hits if the attack roll total ≥ target's AC.

**Fix:**
1. Move the target selector ABOVE the roll buttons so the DM picks a target first.
2. After rolling, compare `attack.total` to the selected target's `armorClass` (from `activeCombat.combatants`):
```ts
const hit = targetAc !== null ? attack.total >= targetAc : null;
```
3. Display result:
```tsx
<span className={hit === true ? "text-green-300" : hit === false ? "text-gray-500" : "text-dnd-gold"}>
  {hit === true ? "HIT" : hit === false ? "MISS" : "ROLLED"} {attack.total}
</span>
```
4. When `attack.crit` is true, auto-label as "CRITICAL HIT" regardless of AC.
5. When `attack.critFail` (natural 1) is true, label "AUTO-MISS".

---

### FIX-DM-007 — Missing 5 standard conditions (deafened, exhaustion, invisible, petrified, unconscious)
**File:** `frontend/src/pages/PlayPage.tsx` ~line 3354
**PHB rule (Appendix A):** 15 official conditions total.

**Fix:** Replace the `CONDITIONS` array:
```ts
const CONDITIONS = [
  "blinded", "charmed", "deafened", "exhaustion",
  "frightened", "grappled", "incapacitated", "invisible",
  "paralyzed", "petrified", "poisoned", "prone",
  "restrained", "stunned", "unconscious",
];
```
For "exhaustion", add a small number input (1–6) next to the badge so the DM tracks exhaustion level, since each level has different mechanical effects (PHB p.291).

---

### FIX-DM-008 — Player TV screen shows monster CR (DM-only information)
**File:** `frontend/src/pages/PlayMonsterPage.tsx` ~line 62
**Convention:** CR is meta DM-only info. Players should not see it.

**Fix:**
```tsx
// BEFORE (wrong):
<p>AC ? · HP ? · CR {m.challengeRating}</p>
// AFTER (correct):
<p>AC ? · HP ? · CR ?</p>
```
The full DM stat block (including CR) remains on the DM screen only.

---

### FIX-DM-009 — Roll summary missing Intelligence and Charisma saving throws
**File:** `backend/src/services/sessionService.ts` ~lines 273–280
**PHB rule:** There are 6 saving throws — one per ability score.

**Fix:** Add INT and CHA to the `saves` object:
```ts
saves: {
  strength:     { bonus: saves.strength.bonus,     proficient: saves.strength.proficient },
  dexterity:    { bonus: saves.dexterity.bonus,    proficient: saves.dexterity.proficient },
  constitution: { bonus: saves.constitution.bonus, proficient: saves.constitution.proficient },
  intelligence: { bonus: saves.intelligence.bonus, proficient: saves.intelligence.proficient },
  wisdom:       { bonus: saves.wisdom.bonus,       proficient: saves.wisdom.proficient },
  charisma:     { bonus: saves.charisma.bonus,     proficient: saves.charisma.proficient },
},
```
Update the `PlayerRollInfo` TypeScript interface in `frontend/src/store/sessionStore.ts` to include all 6.

---

### FIX-DM-010 — Legendary actions are silently displayed as regular monster actions
**File:** `backend/src/services/sessionService.ts` ~lines 348–352
**PHB rule:** Legendary actions are taken at the END of OTHER creatures' turns, using a limited point budget (usually 3/round). They are entirely different from regular actions.

**Fix:**
1. Remove the fallback that uses `legendaryActions` as regular actions.
2. Return `legendaryActions` as a **separate field** on the dm roll info:
```ts
return {
  ...existingFields,
  actions,             // regular actions
  legendaryActions: monster.legendaryActions ? actionsFromJson(monster.legendaryActions) : [],
  legendaryActionPoints: 3, // default; parse from data if available
};
```
3. In `DmRollCard` in `PlayPage.tsx`, show legendary actions in a clearly labeled separate section: **"Legendary Actions (3 pts/round — taken at end of others' turns)"**.

---

### FIX-DM-011 — Half-damage on successful saves is never shown or automated
**Files:** `frontend/src/pages/PlayPage.tsx` (DmMonsterActionRow, trap menus)
**PHB rule (p.197):** Most area/breath attacks deal half damage on a successful save.

**Fix:** When a monster action has a `saveDc` value, add a reminder note below the damage roll:
```tsx
{action.saveDc != null && (
  <p className="text-[10px] text-amber-200/70 mt-1">
    {action.saveType} save DC {action.saveDc} — half damage on success. Roll damage once, halve it for saves.
  </p>
)}
```
Add the same note in both trap menus (encounter popup and trap modal).

---

### FIX-DM-012 — Default initiative of 10 applied silently when DM doesn't enter a value
**File:** `frontend/src/pages/PlayPage.tsx` ~line 3029
**Fix:** Validate before starting combat:
```ts
const missing = partyCharacters.filter(c => !initiatives[c.id]);
if (missing.length > 0) {
  alert(`Please enter initiative for: ${missing.map(c => c.name).join(', ')}`);
  return;
}
```
Change the fallback from `?? 10` to `?? 0` so any default is obviously wrong, not silently plausible.

---

### FIX-DM-013 — Vision radius uses Chebyshev (square) distance instead of circular
**File:** `frontend/src/lib/dungeonForgeFog.ts` ~line 197–207
**PHB convention:** Vision radius is circular (or at most "every other diagonal = 2").

**Fix:** Change:
```ts
// BEFORE (Chebyshev — square):
if (Math.max(Math.abs(dx), Math.abs(dy)) > R) continue;
// AFTER (Euclidean — circular):
if (dx * dx + dy * dy > R * R) continue;
```

---

### FIX-DM-014 — Melee attack bonus always uses STR; finesse weapons should allow STR or DEX
**File:** `backend/src/services/sessionService.ts` ~lines 263–265
**PHB rule (p.147):** Finesse weapons let the attacker choose STR or DEX.

**Fix (heuristic approach):** Use the higher of STR or DEX for the melee attack bonus and label it accordingly:
```ts
const meleeMod = Math.max(mods.strength, mods.dexterity);
const meleeLabel = mods.dexterity > mods.strength ? "DEX/finesse melee" : "STR melee";
attacks: {
  melee: { bonus: meleeMod + profB, label: meleeLabel },
  ranged: { bonus: mods.dexterity + profB, label: "DEX ranged" },
}
```

---

## Verification Steps

After applying all fixes:

1. Add a **Stone Golem** (DEX 9, −1 mod) and a **Rogue** monster (DEX 18, +4 mod) to combat. Start initiative. Confirm the Golem's init centers around 9.5 and the Rogue's centers around 14.5, not both around 10.5.
2. Roll a critical hit. Confirm the dice are doubled and the modifier is NOT doubled (e.g., `2d8+3` not `1d8+3+1d8+3`).
3. Click "Next Turn" button. Confirm the TURN badge moves to the next combatant in initiative order. After the last combatant, confirm Round increments by 1.
4. Bring a player character to 0 HP. Confirm they remain in the initiative list with a "DYING — roll death saves" indicator.
5. Apply damage to a concentrating combatant. Confirm a CON save DC popup/banner appears.
6. Select a target with AC 18. Roll a monster attack that totals 15. Confirm "MISS" is shown. Roll one that totals 20. Confirm "HIT" is shown.
7. Add the "deafened", "exhaustion", "invisible", "petrified", "unconscious" conditions to a combatant. Confirm they appear without errors.
8. Open the Player TV (PlayMonsterPage). Confirm CR shows as "CR ?" not the actual number.
9. Open the roll summary panel for a character. Confirm all 6 saving throws are listed (STR, DEX, CON, INT, WIS, CHA).
10. Load a monster with legendary actions (e.g., Adult Dragon). Confirm legendary actions appear in a **separate section** from regular actions in the DM roll card.
