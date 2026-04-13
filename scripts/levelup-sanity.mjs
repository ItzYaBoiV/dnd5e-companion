import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseChoiceMap(filePath, constName) {
  const src = fs.readFileSync(filePath, "utf8");
  const re = new RegExp(`export const ${constName}: Record<string, number> = \\{([\\s\\S]*?)\\};`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not parse ${constName} in ${filePath}`);
  const body = m[1];
  const out = {};
  for (const line of body.split("\n")) {
    const mm = line.match(/^\s*([a-z-]+)\s*:\s*(\d+)\s*,?\s*$/i);
    if (!mm) continue;
    out[mm[1]] = Number(mm[2]);
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function cantripsStandard(level) {
  if (level <= 3) return 3;
  if (level <= 9) return 4;
  return 5;
}
function cantripsBardWarlock(level) {
  if (level <= 3) return 2;
  if (level <= 9) return 3;
  return 4;
}
function cantripsThirdCaster(level) {
  if (level < 3) return 0;
  if (level <= 6) return 2;
  if (level <= 12) return 3;
  if (level <= 18) return 4;
  return 5;
}
function cantripsDruid(level) {
  if (level <= 3) return 2;
  if (level <= 9) return 3;
  return 4;
}
function cantripsSorcerer(level) {
  if (level <= 3) return 4;
  if (level <= 9) return 5;
  return 6;
}

const BARD_SPELLS_KNOWN = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22];
const SORCERER_LEVELED_SPELLS_KNOWN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15];
const WARLOCK_SPELLS_KNOWN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
const RANGER_SPELLS_KNOWN = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11];
const THIRD_CASTER_SPELLS_KNOWN = [0, 0, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9];

function deltaKnown(table, oldLevel, newLevel) {
  return table[newLevel - 1] - table[oldLevel - 1];
}

function getSpellLearnBudget(classSlug, subclassSlugLower, oldClassLevel, newClassLevel) {
  const slug = classSlug;
  const subL = (subclassSlugLower || "").toLowerCase();
  const isEK = slug === "fighter" && subL.includes("eldritch");
  const isAT = slug === "rogue" && subL.includes("arcane");
  const isThirdSlug = slug === "eldritch-knight" || slug === "arcane-trickster";

  let cantrips = 0;
  let knownSpells = 0;
  let wizardSpellbook = 0;
  let isPreparedCaster = false;

  if (slug === "cleric") {
    isPreparedCaster = true;
    cantrips = cantripsStandard(newClassLevel) - cantripsStandard(oldClassLevel);
  } else if (slug === "druid") {
    isPreparedCaster = true;
    cantrips = cantripsDruid(newClassLevel) - cantripsDruid(oldClassLevel);
  } else if (slug === "wizard") {
    isPreparedCaster = true;
    cantrips = cantripsStandard(newClassLevel) - cantripsStandard(oldClassLevel);
    if (newClassLevel > oldClassLevel) wizardSpellbook = 2;
  } else if (slug === "bard" || slug === "warlock") {
    cantrips = cantripsBardWarlock(newClassLevel) - cantripsBardWarlock(oldClassLevel);
    knownSpells =
      slug === "bard"
        ? deltaKnown(BARD_SPELLS_KNOWN, oldClassLevel, newClassLevel)
        : deltaKnown(WARLOCK_SPELLS_KNOWN, oldClassLevel, newClassLevel);
  } else if (isEK || isAT || isThirdSlug) {
    cantrips = cantripsThirdCaster(newClassLevel) - cantripsThirdCaster(oldClassLevel);
    knownSpells = deltaKnown(THIRD_CASTER_SPELLS_KNOWN, oldClassLevel, newClassLevel);
  } else if (slug === "sorcerer") {
    cantrips = cantripsSorcerer(newClassLevel) - cantripsSorcerer(oldClassLevel);
    knownSpells = deltaKnown(SORCERER_LEVELED_SPELLS_KNOWN, oldClassLevel, newClassLevel);
  } else if (slug === "ranger" && newClassLevel >= 2) {
    if (oldClassLevel < 2 && newClassLevel >= 2) knownSpells = 2;
    else if (oldClassLevel >= 2) knownSpells = deltaKnown(RANGER_SPELLS_KNOWN, oldClassLevel, newClassLevel);
  } else if (slug === "paladin" && newClassLevel >= 2) {
    isPreparedCaster = true;
  }

  return { cantrips, knownSpells, wizardSpellbook, isPreparedCaster };
}

function asiLevelsForClass(slug) {
  const base = [4, 8, 12, 16, 19];
  if (slug === "fighter") return [4, 6, 8, 12, 14, 16, 19];
  if (slug === "rogue") return [4, 8, 10, 12, 16, 19];
  return base;
}

function run() {
  const backendMap = parseChoiceMap(path.join(root, "backend/src/lib/classProgression.ts"), "SUBCLASS_CHOICE_CLASS_LEVEL");
  const frontendMap = parseChoiceMap(path.join(root, "frontend/src/lib/levelUpGuide.ts"), "SUBCLASS_CHOICE_LEVEL");

  const classes = Object.keys(backendMap).sort();
  assert(classes.length === 12, `Expected 12 classes, found ${classes.length}`);
  assert(JSON.stringify(backendMap) === JSON.stringify(frontendMap), "Subclass choice maps differ between frontend and backend");

  // Spot checks for known bug-prone points.
  assert(backendMap.ranger === 3, "Ranger subclass level must be 3");
  assert(getSpellLearnBudget("ranger", "", 2, 3).knownSpells === 1, "Ranger 2->3 should learn 1 spell");
  assert(getSpellLearnBudget("wizard", "", 2, 3).wizardSpellbook === 2, "Wizard should add 2 spellbook spells per level");

  console.log("Level-up sanity matrix (class level 1->20 checkpoints)");
  console.log("class | level | subclass | asi | cantrips | known | wizbook | prepared");
  console.log("----- | ----- | -------- | --- | -------- | ----- | ------- | --------");

  for (const slug of classes) {
    const subLv = backendMap[slug];
    const asi = new Set(asiLevelsForClass(slug));
    let previousPrepared = false;

    for (let newLv = 2; newLv <= 20; newLv++) {
      const oldLv = newLv - 1;
      const budget = getSpellLearnBudget(slug, "", oldLv, newLv);
      const sub = newLv === subLv ? "yes" : "";
      const asiHit = asi.has(newLv) ? "yes" : "";
      const preparedBecame = !previousPrepared && budget.isPreparedCaster ? "yes" : "";
      previousPrepared = budget.isPreparedCaster;

      const checkpoint =
        sub ||
        asiHit ||
        budget.cantrips > 0 ||
        budget.knownSpells > 0 ||
        budget.wizardSpellbook > 0 ||
        preparedBecame;
      if (!checkpoint) continue;

      assert(budget.cantrips >= 0 && budget.knownSpells >= 0 && budget.wizardSpellbook >= 0, `${slug} ${oldLv}->${newLv} produced negative budget`);
      console.log(
        `${slug} | ${newLv} | ${sub} | ${asiHit} | ${budget.cantrips || ""} | ${budget.knownSpells || ""} | ${budget.wizardSpellbook || ""} | ${preparedBecame}`,
      );
    }
  }

  console.log("\nSanity check passed.");
}

run();
