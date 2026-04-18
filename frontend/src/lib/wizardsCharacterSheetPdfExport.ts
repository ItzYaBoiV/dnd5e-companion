/**
 * Fills WoTC’s official 2016 fillable character sheet PDF for personal / table use (same license as the blank sheet).
 */
import { PDFDocument, PDFCheckBox, PDFTextField, StandardFonts } from "pdf-lib";
import type { Character } from "@/types/dnd";
import { ALIGNMENT_LABELS, ABILITY_NAMES, SKILL_NAMES, type AbilityName } from "@/types/dnd";
import type { WeaponAttackSummary } from "@/types/dnd";
import { formatModifier } from "@/components/common";
import { referenceApi } from "@/services/api";

const TEMPLATE_FILE = "wizards-5E_CharacterSheet_Fillable.pdf";

export type WizardsSheetExportOptions = {
  /** Player / player name from the active or a past play session. */
  playerName?: string;
};

/** Official WoTC fillable sheet (2016) — field names from community mappings (e.g. drogoganor/dndcharactermaker-react). */
const SAVE_PROF_CHECKBOX: Record<AbilityName, string> = {
  strength: "Check Box 11",
  dexterity: "Check Box 18",
  constitution: "Check Box 19",
  intelligence: "Check Box 20",
  wisdom: "Check Box 21",
  charisma: "Check Box 22",
};

/** Skill proficiency dots: Acrobatics … Survival (same order as SKILL_NAMES). */
const SKILL_PROF_CHECKBOXES = [
  "Check Box 23",
  "Check Box 24",
  "Check Box 25",
  "Check Box 26",
  "Check Box 27",
  "Check Box 28",
  "Check Box 29",
  "Check Box 30",
  "Check Box 31",
  "Check Box 32",
  "Check Box 33",
  "Check Box 34",
  "Check Box 35",
  "Check Box 36",
  "Check Box 37",
  "Check Box 38",
  "Check Box 39",
  "Check Box 40",
] as const;

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function raceLine(c: Character): string {
  return c.subraceSlug
    ? `${humanizeSlug(c.subraceSlug)} (${humanizeSlug(c.raceSlug)})`
    : humanizeSlug(c.raceSlug);
}

function classLevelLine(c: Character): string {
  const raw = c.computed?.classSummary || `${c.classSlug} ${c.level}`;
  return raw.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function hitDiceTotalLine(c: Character): string {
  const rows = c.computed?.classLevelsDetailed ?? [];
  if (rows.length === 0) return `${c.level}d${c.hitDieType}`;
  return rows.map((r) => `${r.levels}d${r.hitDie}`).join(" + ");
}

function hitDiceRemainingLine(c: Character): string {
  const rows = c.computed?.classLevelsDetailed ?? [];
  if (rows.length === 0) {
    const left = Math.max(0, c.hitDiceMax - c.hitDiceUsed);
    return left ? `${left}d${c.hitDieType}` : "";
  }
  return rows
    .filter((r) => r.hitDiceAvailable > 0)
    .map((r) => `${r.hitDiceAvailable}d${r.hitDie}`)
    .join(" + ");
}

function profLangBlock(c: Character): string {
  const lines: string[] = [];
  if (c.weaponProficiencies?.length) {
    lines.push(`Weapons: ${c.weaponProficiencies.map(humanizeSlug).join(", ")}`);
  }
  if (c.armorProficiencies?.length) {
    lines.push(`Armor: ${c.armorProficiencies.map(humanizeSlug).join(", ")}`);
  }
  if (c.toolProficiencies?.length) {
    lines.push(`Tools: ${c.toolProficiencies.map(humanizeSlug).join(", ")}`);
  }
  if (c.languages?.length) {
    lines.push(`Languages: ${c.languages.map(humanizeSlug).join(", ")}`);
  }
  return lines.join("\n");
}

function equipmentBlock(c: Character): string {
  return c.inventory
    .map((i) => {
      const name = (i.customName || i.itemSlug || "Item").trim();
      const label = humanizeSlug(name.replace(/_/g, "-"));
      return i.quantity !== 1 ? `${label} ×${i.quantity}` : label;
    })
    .join("\n");
}

function treasureLine(c: Character): string {
  const p: string[] = [];
  if (c.platinum) p.push(`${c.platinum} pp`);
  if (c.gold) p.push(`${c.gold} gp`);
  if (c.electrum) p.push(`${c.electrum} ep`);
  if (c.silver) p.push(`${c.silver} sp`);
  if (c.copper) p.push(`${c.copper} cp`);
  return p.join(", ");
}

function featuresBlock(c: Character): string {
  return c.features
    .map((f) => {
      const src = f.source ? ` (${humanizeSlug(f.source)})` : "";
      return `${f.name}${src}${f.description ? `\n${f.description}` : ""}`;
    })
    .join("\n\n");
}

function weaponDamageLine(w: WeaponAttackSummary): string {
  const modPart = w.damageBonus !== 0 ? ` ${formatModifier(w.damageBonus)}` : "";
  return `${w.damageDice}${modPart} ${w.damageType}`.trim();
}

function trySetText(form: ReturnType<PDFDocument["getForm"]>, name: string, value: string): void {
  try {
    const field = form.getField(name);
    if (field instanceof PDFTextField) field.setText(value);
  } catch {
    /* missing or wrong widget type */
  }
}

function trySetTextFirst(form: ReturnType<PDFDocument["getForm"]>, names: string[], value: string): void {
  for (const name of names) {
    try {
      const field = form.getField(name);
      if (field instanceof PDFTextField) {
        field.setText(value);
        return;
      }
    } catch {
      /* try next */
    }
  }
}

function trySetCheck(form: ReturnType<PDFDocument["getForm"]>, name: string, on: boolean): void {
  try {
    const field = form.getField(name);
    if (field instanceof PDFCheckBox) {
      if (on) field.check();
      else field.uncheck();
    }
  } catch {
    /* */
  }
}

/** Fill fields whose names match regex (first match per pattern group). */
function fillTextByPatterns(
  form: ReturnType<PDFDocument["getForm"]>,
  rules: { pattern: RegExp; value: string }[],
): void {
  const done = new Set<string>();
  for (const { pattern, value } of rules) {
    for (const field of form.getFields()) {
      if (!(field instanceof PDFTextField)) continue;
      const n = field.getName();
      if (done.has(n)) continue;
      if (pattern.test(n)) {
        field.setText(value);
        done.add(n);
        break;
      }
    }
  }
}

/** Text fields that hold individual spell / cantrip lines on page 3 (AcroForm names vary; we match by pattern). */
function collectSpellRowTextFieldNames(form: ReturnType<PDFDocument["getForm"]>): string[] {
  const names: string[] = [];
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField)) continue;
    const n = field.getName();
    const lower = n.toLowerCase();
    if (lower.includes("spell save") || lower.includes("spell attack")) continue;
    if (lower.includes("spellcasting ability") || lower.includes("spellcasting class")) continue;
    if (lower === "spell save dc" || lower === "spells known") continue;

    const looksSpellRow =
      (lower.includes("spell") && lower.includes("name")) ||
      /^cantrip/i.test(lower) ||
      /^spells\d+$/i.test(lower.trim());

    if (looksSpellRow) names.push(n);
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Prepared-marker widgets (WoTC PDF sometimes misspells “Prepared” as “Repared”). */
function collectPreparedWidgets(form: ReturnType<PDFDocument["getForm"]>): string[] {
  const out: string[] = [];
  for (const field of form.getFields()) {
    if (!(field instanceof PDFCheckBox)) continue;
    const n = field.getName();
    if (/repared|prepared/i.test(n)) out.push(n);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function loadSpellsForExport(c: Character): Promise<{ name: string; level: number; prepared: boolean }[]> {
  const rows: { name: string; level: number; prepared: boolean }[] = [];
  for (const cs of c.spells) {
    try {
      const sp = await referenceApi.spell(cs.spellSlug);
      if (sp) {
        rows.push({
          name: sp.name,
          level: sp.level ?? 0,
          prepared: cs.prepared || cs.alwaysPrepared,
        });
      } else {
        rows.push({
          name: humanizeSlug(cs.spellSlug),
          level: 0,
          prepared: cs.prepared || cs.alwaysPrepared,
        });
      }
    } catch {
      rows.push({
        name: humanizeSlug(cs.spellSlug),
        level: 0,
        prepared: cs.prepared || cs.alwaysPrepared,
      });
    }
  }
  rows.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return rows;
}

function fillSpellSlotTotalsBestEffort(
  form: ReturnType<PDFDocument["getForm"]>,
  c: Character,
): void {
  for (const s of c.spellSlots) {
    let filledTotal = false;
    let filledExp = false;
    for (const field of form.getFields()) {
      if (!(field instanceof PDFTextField)) continue;
      const n = field.getName();
      const low = n.toLowerCase();
      if (!low.includes("slot")) continue;
      if (!new RegExp(`(^|[^0-9])${s.level}([^0-9]|$)`).test(n)) continue;
      if (!filledTotal && /total/i.test(n)) {
        field.setText(String(s.total));
        filledTotal = true;
      } else if (!filledExp && /(expend|spent)/i.test(n)) {
        field.setText(String(s.used));
        filledExp = true;
      }
    }
  }
}

function fillSpellSection(
  form: ReturnType<PDFDocument["getForm"]>,
  spells: { name: string; level: number; prepared: boolean }[],
): void {
  const fieldNames = collectSpellRowTextFieldNames(form);
  const n = Math.min(spells.length, fieldNames.length);
  for (let i = 0; i < n; i++) {
    trySetText(form, fieldNames[i], spells[i].name);
  }

  const prepWidgets = collectPreparedWidgets(form);
  if (prepWidgets.length > 0 && prepWidgets.length === n) {
    for (let i = 0; i < n; i++) {
      trySetCheck(form, prepWidgets[i], spells[i].prepared);
    }
  }
}

async function loadTemplateBytes(): Promise<Uint8Array> {
  const base = import.meta.env.BASE_URL || "/";
  const url = new URL(TEMPLATE_FILE, window.location.origin + base).toString();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Could not load ${TEMPLATE_FILE} (${res.status}). Run npm install in frontend/ or download ` +
        `https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf ` +
        `to frontend/public/${TEMPLATE_FILE}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Fills the official Wizards 2016 fillable PDF and triggers a browser download.
 */
export async function downloadWizardsCharacterSheetPdf(
  c: Character,
  options?: WizardsSheetExportOptions,
): Promise<void> {
  const bytes = await loadTemplateBytes();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  const mods = c.computed?.modifiers;
  if (!mods) throw new Error("Character is missing computed stats — refresh the sheet and try again.");

  const comp = c.computed;
  const pb = comp.proficiencyBonus;

  const playerName = (options?.playerName ?? "").trim();
  trySetText(form, "PlayerName", playerName);
  trySetText(form, "CharacterName", c.name);
  trySetText(form, "CharacterName 2", c.name);
  trySetText(form, "ClassLevel", classLevelLine(c));
  trySetText(form, "Race ", raceLine(c));
  trySetText(form, "Background", humanizeSlug(c.backgroundSlug));
  trySetText(form, "Alignment", ALIGNMENT_LABELS[c.alignment]);
  trySetText(form, "XP", String(c.experiencePoints));

  trySetText(form, "Age", c.age || "");
  trySetText(form, "Height", c.height || "");
  trySetText(form, "Weight", c.weight || "");
  trySetText(form, "Eyes", c.eyes || "");
  trySetText(form, "Skin", c.skin || "");
  trySetText(form, "Hair", c.hair || "");
  trySetText(form, "Allies", c.allies || "");
  trySetText(form, "FactionName", "");

  trySetText(form, "PersonalityTraits ", c.personalityTraits || "");
  trySetText(form, "Ideals", c.ideals || "");
  trySetText(form, "Bonds", c.bonds || "");
  trySetText(form, "Flaws", c.flaws || "");

  trySetText(form, "Backstory", c.backstory || "");
  trySetText(form, "Treasure", treasureLine(c));
  trySetText(form, "Feat+Traits", "");
  trySetText(form, "Features and Traits", featuresBlock(c));

  trySetText(form, "STR", formatModifier(mods.strength));
  trySetText(form, "DEX", formatModifier(mods.dexterity));
  trySetText(form, "CON", formatModifier(mods.constitution));
  trySetText(form, "INT", formatModifier(mods.intelligence));
  trySetText(form, "WIS", formatModifier(mods.wisdom));
  trySetText(form, "CHA", formatModifier(mods.charisma));

  trySetText(form, "STRmod", String(c.strength));
  trySetText(form, "DEXmod ", String(c.dexterity));
  trySetText(form, "CONmod", String(c.constitution));
  trySetText(form, "INTmod", String(c.intelligence));
  trySetText(form, "WISmod", String(c.wisdom));
  trySetText(form, "CHamod", String(c.charisma));

  trySetText(form, "AC", String(comp.armorClass));
  trySetText(form, "Initiative", formatModifier(comp.initiative));
  trySetText(form, "Speed", String(c.speed));
  trySetText(form, "ProfBonus", formatModifier(pb));
  trySetText(form, "Passive", String(comp.passivePerception));

  trySetText(form, "HPMax", String(c.maxHp));
  trySetTextFirst(form, ["HPCurrent", "Current HP", "Current Hit Points", "CHP"], String(c.currentHp));
  trySetText(form, "HDTotal", hitDiceTotalLine(c));
  trySetText(form, "HD", hitDiceRemainingLine(c));

  trySetTextFirst(form, ["Temporary HP", "TempHP", "THP"], c.temporaryHp ? String(c.temporaryHp) : "");

  trySetText(form, "ProficienciesLang", profLangBlock(c));
  trySetText(form, "Equipment", equipmentBlock(c));

  trySetText(form, "CP", String(c.copper));
  trySetText(form, "SP", String(c.silver));
  trySetText(form, "EP", String(c.electrum));
  trySetText(form, "GP", String(c.gold));
  trySetText(form, "PP", String(c.platinum));

  trySetText(form, "ST Strength", formatModifier(comp.savingThrows.strength.bonus));
  trySetText(form, "ST Dexterity", formatModifier(comp.savingThrows.dexterity.bonus));
  trySetText(form, "ST Constitution", formatModifier(comp.savingThrows.constitution.bonus));
  trySetText(form, "ST Intelligence", formatModifier(comp.savingThrows.intelligence.bonus));
  trySetText(form, "ST Wisdom", formatModifier(comp.savingThrows.wisdom.bonus));
  trySetText(form, "ST Charisma", formatModifier(comp.savingThrows.charisma.bonus));

  for (const ability of ABILITY_NAMES) {
    const prof = c.savingThrowProficiencies?.includes(ability) ?? false;
    trySetCheck(form, SAVE_PROF_CHECKBOX[ability], prof);
  }

  const skillBonus = (slug: (typeof SKILL_NAMES)[number]) => comp.skills[slug].bonus;

  trySetText(form, "Acrobatics", formatModifier(skillBonus("acrobatics")));
  trySetText(form, "Animal", formatModifier(skillBonus("animal-handling")));
  trySetText(form, "Arcana", formatModifier(skillBonus("arcana")));
  trySetText(form, "Athletics", formatModifier(skillBonus("athletics")));
  trySetText(form, "Deception ", formatModifier(skillBonus("deception")));
  trySetText(form, "History ", formatModifier(skillBonus("history")));
  trySetText(form, "Insight", formatModifier(skillBonus("insight")));
  trySetText(form, "Intimidation", formatModifier(skillBonus("intimidation")));
  trySetText(form, "Investigation ", formatModifier(skillBonus("investigation")));
  trySetText(form, "Medicine", formatModifier(skillBonus("medicine")));
  trySetText(form, "Nature", formatModifier(skillBonus("nature")));
  trySetText(form, "Perception ", formatModifier(skillBonus("perception")));
  trySetText(form, "Performance", formatModifier(skillBonus("performance")));
  trySetText(form, "Persuasion", formatModifier(skillBonus("persuasion")));
  trySetText(form, "Religion", formatModifier(skillBonus("religion")));
  trySetText(form, "SleightofHand", formatModifier(skillBonus("sleight-of-hand")));
  trySetText(form, "Stealth ", formatModifier(skillBonus("stealth")));
  trySetText(form, "Survival", formatModifier(skillBonus("survival")));

  SKILL_NAMES.forEach((slug, i) => {
    const prof =
      (c.skillProficiencies?.includes(slug) || c.skillExpertise?.includes(slug)) ?? false;
    trySetCheck(form, SKILL_PROF_CHECKBOXES[i], prof);
  });

  const attacks = comp.weaponAttacks.slice(0, 3);
  if (attacks[0]) {
    trySetText(form, "Wpn Name", attacks[0].name);
    trySetText(form, "Wpn1 AtkBonus", formatModifier(attacks[0].attackBonus));
    trySetText(form, "Wpn1 Damage", weaponDamageLine(attacks[0]));
  }
  if (attacks[1]) {
    trySetText(form, "Wpn Name 2", attacks[1].name);
    trySetText(form, "Wpn2 AtkBonus ", formatModifier(attacks[1].attackBonus));
    trySetText(form, "Wpn2 Damage ", weaponDamageLine(attacks[1]));
  }
  if (attacks[2]) {
    trySetText(form, "Wpn Name 3", attacks[2].name);
    trySetText(form, "Wpn3 AtkBonus ", formatModifier(attacks[2].attackBonus));
    trySetText(form, "Wpn3 Damage ", weaponDamageLine(attacks[2]));
  }

  trySetCheck(form, "Inspiration", c.inspiration);

  if (c.spellcastingAbility && comp.spellSaveDc != null && comp.spellAttackBonus != null) {
    const abbr = c.spellcastingAbility.slice(0, 3).toUpperCase();
    const spellClassLine =
      classLevelLine(c)
        .split("/")
        .map((s) => s.trim())
        .find((s) => s.length > 0) ?? humanizeSlug(c.classSlug);
    fillTextByPatterns(form, [
      { pattern: /spell\s*save\s*dc/i, value: String(comp.spellSaveDc) },
      { pattern: /spell\s*attack\s*bonus/i, value: formatModifier(comp.spellAttackBonus) },
      { pattern: /^spellcasting\s*ability$/i, value: abbr },
      { pattern: /spellcasting\s*class/i, value: spellClassLine },
    ]);
  }

  if (c.spells.length > 0) {
    const spellRows = await loadSpellsForExport(c);
    fillSpellSection(form, spellRows);
  }
  if (c.spellSlots.length > 0) {
    fillSpellSlotTotalsBestEffort(form, c);
  }

  trySetTextFirst(form, ["Appearance", "Character Appearance", "CHARACTER APPEARANCE"], c.appearance || "");

  try {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(font);
  } catch {
    /* some viewers still render without this */
  }

  const out = await pdfDoc.save();
  const safe = c.name.replace(/[^\w\- ]+/g, "").trim().slice(0, 72) || "character";
  // Copy so BlobPart matches DOM typings (pdf-lib can yield Uint8Array<ArrayBufferLike>).
  const pdfBytes = new Uint8Array(out.byteLength);
  pdfBytes.set(out);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}-wotc-5e.pdf`;
  a.click();
  URL.revokeObjectURL(a.href);
}
