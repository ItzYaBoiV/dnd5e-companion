/**
 * Run: npx tsx --test src/services/multiclass.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  multiclassSpellcasterLevel,
  spellSlotsForMulticlass,
  spellSlotsForClass,
  maxHpMulticlass,
  totalWarlockLevels,
} from "./calculationService";

test("spellSlotsForClass: base Fighter / Rogue have no spell slots; EK / AT do", () => {
  assert.deepEqual(spellSlotsForClass("fighter", 6), []);
  assert.deepEqual(spellSlotsForClass("rogue", 6), []);
  assert.ok(spellSlotsForClass("fighter", 6, "eldritch-knight").length > 0);
  assert.ok(spellSlotsForClass("rogue", 6, "arcane-trickster").length > 0);
});

test("multiclass spellcaster level: wizard 5 / warlock 3 = 5 (warlock excluded)", () => {
  assert.equal(
    multiclassSpellcasterLevel([
      { classSlug: "wizard", levels: 5 },
      { classSlug: "warlock", levels: 3 },
    ]),
    5,
  );
  assert.equal(totalWarlockLevels([{ classSlug: "wizard", levels: 5 }, { classSlug: "warlock", levels: 3 }]), 3);
});

test("Wizard 5 / Warlock 3: pact slots and spellcasting slots are separate pools", () => {
  const slots = spellSlotsForMulticlass([
    { classSlug: "wizard", levels: 5 },
    { classSlug: "warlock", levels: 3 },
  ]);
  const stdSecond = slots.find((s) => s.level === 2 && s.source === "spellcasting");
  assert.ok(stdSecond);
  assert.equal(stdSecond!.total, 3);
  const pactSecond = slots.find((s) => s.level === 2 && s.source === "pact");
  assert.ok(pactSecond);
  assert.equal(pactSecond!.total, 2);
  const merged = slots.find((s) => s.level === 2 && s.total === 5);
  assert.equal(merged, undefined, "Pact and spellcasting slots must NOT be merged");
});

test("paladin 2 / wizard 3 → caster level 1 + 3 = 4", () => {
  assert.equal(
    multiclassSpellcasterLevel([
      { classSlug: "paladin", levels: 2 },
      { classSlug: "wizard", levels: 3 },
    ]),
    4,
  );
});

test("fighter 6 eldritch knight / wizard 2 → 2 + 2 = 4", () => {
  assert.equal(
    multiclassSpellcasterLevel([
      { classSlug: "fighter", subclassSlug: "eldritch-knight", levels: 6 },
      { classSlug: "wizard", levels: 2 },
    ]),
    4,
  );
});

test("barbarian 5 / druid 5 → druid only = 5", () => {
  assert.equal(
    multiclassSpellcasterLevel([
      { classSlug: "barbarian", levels: 5 },
      { classSlug: "druid", levels: 5 },
    ]),
    5,
  );
});

test("maxHpMulticlass: fighter 2 then wizard 1 uses d10 first then d6 avg", () => {
  const hp = maxHpMulticlass(
    [
      { classSlug: "fighter", levels: 2 },
      { classSlug: "wizard", levels: 1 },
    ],
    { fighter: 10, wizard: 6 },
    2,
  );
  // 10+2 + (5+1+2) + (3+1+2) = 12 + 8 + 6 = 26
  assert.equal(hp, 26);
});

test("only warlock: pact slots only", () => {
  const slots = spellSlotsForMulticlass([{ classSlug: "warlock", levels: 5 }]);
  assert.deepEqual(slots, [{ level: 3, total: 2, source: "pact" }]);
});
