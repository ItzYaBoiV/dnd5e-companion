/**
 * Reads WoTC’s 2016 fillable character sheet PDF (same template as `wizardsCharacterSheetPdfExport.ts`).
 * Maps AcroForm fields → `CharacterDraft` patches + warnings for anything ambiguous.
 */
import { distance } from "fastest-levenshtein";
import { PDFDocument } from "pdf-lib";
import { isPdfCheckBox, isPdfTextField } from "@/lib/pdfLibFormFieldGuards";
import type {
  AbilityName,
  AbilityScores,
  Alignment,
  Background,
  CharacterDraft,
  ClassLevelDraftRow,
  DndClass,
  PdfImportReviewIssue,
  Race,
  SkillName,
} from "@/types/dnd";
import {
  ABILITY_NAMES,
  ALIGNMENT_LABELS,
  DEFAULT_DRAFT,
  PDF_IMPORT_REVIEW_STEP,
  SKILL_NAMES,
} from "@/types/dnd";
import { scoresBaseBeforeRace } from "@/lib/suggestedAbilityScores";
import { defaultMulticlassLevelOrder } from "@/lib/multiclassLevelPlan";
import { draftSavingThrows, draftSkillConfig } from "@/lib/multiclassDraftSkills";
import { getCreationSpellProfile, validateStartingSpellPicks, type StartingSpellPick } from "@/lib/creationSpellGuide";
import { referenceApi } from "@/services/api";

const SAVE_PROF_CHECKBOX: Record<AbilityName, string> = {
  strength: "Check Box 11",
  dexterity: "Check Box 18",
  constitution: "Check Box 19",
  intelligence: "Check Box 20",
  wisdom: "Check Box 21",
  charisma: "Check Box 22",
};

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

/**
 * Official 2016 Wizards PDF uses confusing names: `STRmod` holds the **ability score** (digits),
 * `STR` holds the **modifier** (+/-) when filled by our export — see `wizardsCharacterSheetPdfExport.ts`.
 * Many PDF tools put the modifier in the score box; `parseIntSafe("+3")` became `3`, which looked like STR 3.
 */
const ABILITY_PAIR_FIELD_NAMES: Record<AbilityName, { scoreBox: string[]; modCircle: string[] }> = {
  strength: { scoreBox: ["STRmod"], modCircle: ["STR"] },
  dexterity: { scoreBox: ["DEXmod ", "DEXmod"], modCircle: ["DEX"] },
  constitution: { scoreBox: ["CONmod"], modCircle: ["CON"] },
  intelligence: { scoreBox: ["INTmod"], modCircle: ["INT"] },
  wisdom: { scoreBox: ["WISmod"], modCircle: ["WIS"] },
  charisma: { scoreBox: ["CHamod", "CHAmod"], modCircle: ["CHA"] },
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function tryGetTextField(
  form: ReturnType<PDFDocument["getForm"]>,
  name: string,
): string {
  try {
    const f = form.getField(name);
    if (isPdfTextField(f)) return (f.getText() ?? "").trim();
  } catch {
    /* */
  }
  return "";
}

function tryGetTextFirst(form: ReturnType<PDFDocument["getForm"]>, names: string[]): string {
  for (const n of names) {
    const v = tryGetTextField(form, n);
    if (v) return v;
  }
  return "";
}

function tryCheckboxChecked(form: ReturnType<PDFDocument["getForm"]>, name: string): boolean {
  try {
    const f = form.getField(name);
    if (isPdfCheckBox(f)) return f.isChecked();
  } catch {
    /* */
  }
  return false;
}

function parseIntSafe(raw: string): number | null {
  const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) && !Number.isNaN(n) ? n : null;
}

function clampScore(n: number): number {
  return Math.min(30, Math.max(1, n));
}

/** Plain digits only (no +/−) — distinguishes "16" from "+3". */
function parsePlainDigitsScore(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/** Signed modifier text like "+3", "-1", "−2" (unicode minus). */
function parseSignedModifier(raw: string): number | null {
  const t = raw.replace(/\u2212/g, "-").trim();
  if (!t) return null;
  const m = t.match(/^([+\-]?)(\d+)$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const n = parseInt(m[2], 10);
  if (!Number.isFinite(n)) return null;
  return sign * n;
}

/**
 * Derive ability score from the score box + modifier circle. Handles modifiers mistaken for scores.
 * @public exported for tests
 */
export function inferAbilityScoreFromWizardsFields(
  scoreBoxRaw: string,
  modCircleRaw: string,
): { score: number; usedModifierHeuristic: boolean } | null {
  const sb = scoreBoxRaw.trim();
  const mc = modCircleRaw.trim();

  const plain = parsePlainDigitsScore(sb);
  if (plain != null && plain >= 8 && plain <= 20) {
    return { score: clampScore(plain), usedModifierHeuristic: false };
  }

  const signedInBox = parseSignedModifier(sb);
  if (signedInBox != null && signedInBox >= -5 && signedInBox <= 5) {
    return { score: clampScore(2 * signedInBox + 10), usedModifierHeuristic: true };
  }

  const modCircle = parseSignedModifier(mc);
  const digitsLow = parsePlainDigitsScore(sb);
  if (
    digitsLow != null &&
    digitsLow >= 1 &&
    digitsLow <= 6 &&
    modCircle != null &&
    modCircle >= -5 &&
    modCircle <= 5 &&
    (digitsLow === Math.abs(modCircle) || digitsLow === modCircle)
  ) {
    return { score: clampScore(2 * modCircle + 10), usedModifierHeuristic: true };
  }

  const scoreMaybeInCircle = parsePlainDigitsScore(mc);
  if (scoreMaybeInCircle != null && scoreMaybeInCircle >= 8 && scoreMaybeInCircle <= 20) {
    const sbEmpty = !sb;
    const sbSmall = parseIntSafe(sb);
    if (sbEmpty || (sbSmall != null && sbSmall < 8)) {
      return { score: clampScore(scoreMaybeInCircle), usedModifierHeuristic: true };
    }
  }

  const fallback = parseIntSafe(sb);
  if (fallback != null) {
    if (fallback >= 8 && fallback <= 30) return { score: clampScore(fallback), usedModifierHeuristic: false };
    if (fallback >= -5 && fallback <= 5) {
      return { score: clampScore(2 * fallback + 10), usedModifierHeuristic: true };
    }
    return { score: clampScore(fallback), usedModifierHeuristic: false };
  }

  if (modCircle != null && modCircle >= -5 && modCircle <= 5 && !sb) {
    return { score: clampScore(2 * modCircle + 10), usedModifierHeuristic: true };
  }

  return null;
}

/** Split "Fighter 5 / Wizard 2" or "Champion Fighter 5" into label + level segments (best-effort). */
export function parseClassLevelSegments(line: string): { label: string; levels: number }[] {
  const out: { label: string; levels: number }[] = [];
  const parts = line
    .split(/\s*[\/,•]\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    let m = p.match(/^(.+?)\s+(\d+)\s*$/);
    if (!m) m = p.match(/^(.+?)(\d+)\s*$/);
    if (!m) continue;
    const lv = parseInt(m[2], 10);
    if (!Number.isFinite(lv) || lv < 1 || lv > 20) continue;
    out.push({ label: m[1].trim(), levels: lv });
  }
  return out;
}

function dedupePdfImportIssues(issues: PdfImportReviewIssue[]): PdfImportReviewIssue[] {
  const seen = new Set<string>();
  const out: PdfImportReviewIssue[] = [];
  for (const i of issues) {
    const k = `${i.step}\0${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

export function mergePdfImportIssues(...groups: PdfImportReviewIssue[][]): PdfImportReviewIssue[] {
  return dedupePdfImportIssues(groups.flat());
}

function labelLooksLikeSubclassHint(label: string): boolean {
  const t = label.trim();
  if (/\([^)]+\)/.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length >= 2;
}

function matchSubclassSlug(classSlug: string, hint: string, classes: DndClass[]): string {
  const h = norm(hint);
  if (!h) return "";
  const cls = classes.find((c) => c.slug === classSlug);
  if (!cls?.subclasses?.length) return "";
  let bestSlug = "";
  let bestD = Infinity;
  for (const sub of cls.subclasses) {
    const d = distance(norm(sub.name), h);
    if (d < bestD) {
      bestD = d;
      bestSlug = sub.slug;
    }
  }
  const maxD = Math.max(2, Math.floor(h.length / 3));
  return bestD <= maxD ? bestSlug : "";
}

/**
 * Resolve one class / level segment label to SRD class + optional subclass
 * (supports "Fighter (Champion)", "Champion Fighter", "Fighter").
 */
export function resolveClassSubclassFromLabel(
  label: string,
  classes: DndClass[],
): { slug: string; subclassSlug: string } {
  const cand = classes.map((c) => ({ key: c.name, cls: c }));
  const tryPair = (classPart: string, subPart: string): { slug: string; subclassSlug: string } | null => {
    const ch = bestStringMatch(classPart, cand, 6);
    if (!ch) return null;
    const slug = ch.cls.slug;
    const subclassSlug = matchSubclassSlug(slug, subPart, classes);
    return { slug, subclassSlug };
  };

  const t = label.trim();
  const paren = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const a = paren[1].trim();
    const b = paren[2].trim();
    return tryPair(a, b) ?? tryPair(b, a) ?? { slug: "", subclassSlug: "" };
  }

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const last = words[words.length - 1]!;
    const rest = words.slice(0, -1).join(" ");
    return tryPair(last, rest) ?? tryPair(rest, last) ?? { slug: "", subclassSlug: "" };
  }

  const only = bestStringMatch(t, cand, 6);
  return { slug: only?.cls.slug ?? "", subclassSlug: "" };
}

function parseRaceHints(raw: string): { subraceHint: string; raceHint: string } {
  const t = raw.trim();
  const paren = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) return { subraceHint: paren[1].trim(), raceHint: paren[2].trim() };
  return { subraceHint: "", raceHint: t };
}

function parseAlignment(raw: string): Alignment | null {
  const t = norm(raw);
  if (!t) return null;
  for (const [key, label] of Object.entries(ALIGNMENT_LABELS) as [Alignment, string][]) {
    if (norm(label) === t) return key;
  }
  return null;
}

function bestStringMatch<R extends { key: string }>(
  query: string,
  candidates: R[],
  maxDistance: number,
): R | null {
  const q = norm(query);
  if (!q) return null;
  let best: R | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const k = norm(c.key);
    if (!k) continue;
    if (k === q) return c;
    const d = distance(q, k);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best && bestD <= maxDistance) return best;
  return null;
}

function collectSpellRowTextFieldNames(form: ReturnType<PDFDocument["getForm"]>): string[] {
  const names: string[] = [];
  for (const field of form.getFields()) {
    if (!isPdfTextField(field)) continue;
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

function collectPreparedWidgets(form: ReturnType<PDFDocument["getForm"]>): string[] {
  const out: string[] = [];
  for (const field of form.getFields()) {
    if (!isPdfCheckBox(field)) continue;
    const n = field.getName();
    if (/repared|prepared/i.test(n)) out.push(n);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export type ParsedWizardsCharacterSheet = {
  characterName: string;
  classLevelRaw: string;
  raceRaw: string;
  backgroundRaw: string;
  alignmentRaw: string;
  xpRaw: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  age: string;
  height: string;
  weight: string;
  eyes: string;
  skin: string;
  hair: string;
  allies: string;
  appearance: string;
  speedRaw: string;
  /** Totals as printed (including racial bonuses). */
  abilityFinal: Partial<AbilityScores>;
  savingThrowProfFromSheet: AbilityName[];
  skillProfFromSheet: SkillName[];
  spellLines: string[];
  spellPreparedFlags: boolean[];
  equipmentLines: string[];
  copper: number;
  silver: number;
  electrum: number;
  gold: number;
  platinum: number;
  /** Ability keys where we inferred score from modifier text (PDF had mod in score box). */
  abilityScoreModifierHeuristicUsed?: AbilityName[];
};

export function isLikelyWizards2016CharacterPdf(form: ReturnType<PDFDocument["getForm"]>): boolean {
  const need = ["CharacterName", "ClassLevel"];
  return need.every((n) => {
    try {
      form.getField(n);
      return true;
    } catch {
      return false;
    }
  });
}

export async function parseWizardsCharacterSheetPdf(bytes: Uint8Array): Promise<ParsedWizardsCharacterSheet> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  if (!isLikelyWizards2016CharacterPdf(form)) {
    throw new Error(
      "This PDF does not look like WoTC’s 2016 fillable 5e character sheet. " +
        "Export uses the same template as frontend/public/wizards-5E_CharacterSheet_Fillable.pdf.",
    );
  }

  const abilityFinal: Partial<AbilityScores> = {};
  const abilityScoreModifierHeuristicUsed: AbilityName[] = [];
  for (const a of ABILITY_NAMES) {
    const names = ABILITY_PAIR_FIELD_NAMES[a];
    const rawScore = tryGetTextFirst(form, names.scoreBox);
    const rawMod = tryGetTextFirst(form, names.modCircle);
    const inf = inferAbilityScoreFromWizardsFields(rawScore, rawMod);
    if (inf) {
      abilityFinal[a] = inf.score;
      if (inf.usedModifierHeuristic) abilityScoreModifierHeuristicUsed.push(a);
    }
  }

  const savingThrowProfFromSheet: AbilityName[] = [];
  for (const a of ABILITY_NAMES) {
    if (tryCheckboxChecked(form, SAVE_PROF_CHECKBOX[a])) savingThrowProfFromSheet.push(a);
  }

  const skillProfFromSheet: SkillName[] = [];
  SKILL_NAMES.forEach((slug, i) => {
    if (tryCheckboxChecked(form, SKILL_PROF_CHECKBOXES[i])) skillProfFromSheet.push(slug);
  });

  const spellFieldNames = collectSpellRowTextFieldNames(form);
  const prepWidgets = collectPreparedWidgets(form);
  const spellLines: string[] = [];
  const spellPreparedFlags: boolean[] = [];
  for (let i = 0; i < spellFieldNames.length; i++) {
    const line = tryGetTextField(form, spellFieldNames[i]);
    spellLines.push(line);
    spellPreparedFlags.push(prepWidgets[i] ? tryCheckboxChecked(form, prepWidgets[i]) : false);
  }

  const equipmentBlock = tryGetTextField(form, "Equipment");
  const equipmentLines = equipmentBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    characterName: tryGetTextFirst(form, ["CharacterName", "CharacterName 2"]),
    classLevelRaw: tryGetTextField(form, "ClassLevel"),
    raceRaw: tryGetTextFirst(form, ["Race ", "Race"]),
    backgroundRaw: tryGetTextField(form, "Background"),
    alignmentRaw: tryGetTextField(form, "Alignment"),
    xpRaw: tryGetTextField(form, "XP"),
    personalityTraits: tryGetTextFirst(form, ["PersonalityTraits ", "PersonalityTraits"]),
    ideals: tryGetTextField(form, "Ideals"),
    bonds: tryGetTextField(form, "Bonds"),
    flaws: tryGetTextField(form, "Flaws"),
    backstory: tryGetTextField(form, "Backstory"),
    age: tryGetTextField(form, "Age"),
    height: tryGetTextField(form, "Height"),
    weight: tryGetTextField(form, "Weight"),
    eyes: tryGetTextField(form, "Eyes"),
    skin: tryGetTextField(form, "Skin"),
    hair: tryGetTextField(form, "Hair"),
    allies: tryGetTextField(form, "Allies"),
    appearance: tryGetTextFirst(form, ["Appearance", "Character Appearance", "CHARACTER APPEARANCE"]),
    speedRaw: tryGetTextField(form, "Speed"),
    abilityFinal,
    savingThrowProfFromSheet,
    skillProfFromSheet,
    spellLines,
    spellPreparedFlags,
    equipmentLines,
    copper: parseIntSafe(tryGetTextField(form, "CP")) ?? 0,
    silver: parseIntSafe(tryGetTextField(form, "SP")) ?? 0,
    electrum: parseIntSafe(tryGetTextField(form, "EP")) ?? 0,
    gold: parseIntSafe(tryGetTextField(form, "GP")) ?? 0,
    platinum: parseIntSafe(tryGetTextField(form, "PP")) ?? 0,
    abilityScoreModifierHeuristicUsed:
      abilityScoreModifierHeuristicUsed.length > 0 ? abilityScoreModifierHeuristicUsed : undefined,
  };
}

export type WizardsPdfImportResult = {
  patch: Partial<CharacterDraft>;
  issues: PdfImportReviewIssue[];
};

/**
 * Turn parsed PDF values into a `CharacterDraft` patch (starting inventory is filled separately with SRD matching).
 */
export function wizardsPdfParsedToDraftPatch(
  parsed: ParsedWizardsCharacterSheet,
  races: Race[],
  classes: DndClass[],
  backgrounds: Background[],
): WizardsPdfImportResult {
  const issues: PdfImportReviewIssue[] = [];
  const S = PDF_IMPORT_REVIEW_STEP;
  const add = (step: number, message: string) => issues.push({ step, message });

  const name = parsed.characterName.trim() || "";
  if (!name) add(S.basicInfo, "Character name was empty in the PDF — enter a name on this step.");

  const alignment = parseAlignment(parsed.alignmentRaw);
  if (parsed.alignmentRaw.trim() && !alignment) {
    add(S.basicInfo, `Alignment “${parsed.alignmentRaw.trim()}” was not recognized — pick alignment here.`);
  }

  const xp = parseIntSafe(parsed.xpRaw) ?? 0;

  const raceCandidates: { key: string; raceSlug: string; subraceSlug: string }[] = [];
  for (const r of races) {
    raceCandidates.push({ key: r.name, raceSlug: r.slug, subraceSlug: "" });
    for (const sub of r.subraces ?? []) {
      raceCandidates.push({ key: sub.name, raceSlug: r.slug, subraceSlug: sub.slug });
    }
  }

  const { subraceHint, raceHint } = parseRaceHints(parsed.raceRaw);
  let raceSlug = "";
  let subraceSlug = "";
  let raceHit =
    (subraceHint && bestStringMatch(subraceHint, raceCandidates, 4)) ||
    (raceHint && bestStringMatch(raceHint, raceCandidates, 4)) ||
    bestStringMatch(parsed.raceRaw, raceCandidates, 5);
  if (raceHit) {
    raceSlug = raceHit.raceSlug;
    subraceSlug = raceHit.subraceSlug;
  } else if (parsed.raceRaw.trim()) {
    add(S.race, `Race line “${parsed.raceRaw.trim()}” did not match SRD races — choose race and subrace here.`);
  }

  const selectedRace = races.find((r) => r.slug === raceSlug);

  const bgHit = bestStringMatch(
    parsed.backgroundRaw,
    backgrounds.map((b) => ({ key: b.name, slug: b.slug })),
    5,
  );
  const backgroundSlug = bgHit?.slug ?? "";
  if (parsed.backgroundRaw.trim() && !backgroundSlug) {
    add(S.background, `Background “${parsed.backgroundRaw.trim()}” did not match SRD backgrounds — pick one here.`);
  }
  const bgObj = backgrounds.find((b) => b.slug === backgroundSlug);

  const parsedSegs = parseClassLevelSegments(parsed.classLevelRaw);
  if (parsedSegs.length === 0 && parsed.classLevelRaw.trim()) {
    add(S.class, `Class & level line “${parsed.classLevelRaw.trim()}” could not be split — set class (and multiclass) here.`);
  }

  const resolvedSegs: { slug: string; subclassSlug: string; levels: number; label: string }[] = [];
  for (const s of parsedSegs) {
    const r = resolveClassSubclassFromLabel(s.label, classes);
    if (r.slug) {
      const cls = classes.find((c) => c.slug === r.slug);
      const hinted = labelLooksLikeSubclassHint(s.label);
      if (hinted && !r.subclassSlug && (cls?.subclasses?.length ?? 0) > 0) {
        add(
          S.class,
          `Subclass from “${s.label}” was not matched to SRD — pick your subclass on the Class step.`,
        );
      }
      resolvedSegs.push({ slug: r.slug, subclassSlug: r.subclassSlug, levels: s.levels, label: s.label });
    } else {
      add(S.class, `Could not match class in “${s.label}” — choose class here.`);
    }
  }

  const totalLevel = resolvedSegs.reduce((a, s) => a + s.levels, 0);
  const level = totalLevel > 0 ? Math.min(20, totalLevel) : 1;
  if (totalLevel > 20) add(S.class, "Total class levels exceeded 20; clamped to 20 — verify on the Class step.");

  const useMulticlass = resolvedSegs.length > 1;
  let classSlug = "";
  let subclassSlug = "";
  let classLevels: ClassLevelDraftRow[] = [];
  let multiclassFirstClassSlug = "";
  let multiclassLevelOrder: string[] = [];

  if (!useMulticlass && resolvedSegs[0]) {
    classSlug = resolvedSegs[0].slug;
    subclassSlug = resolvedSegs[0].subclassSlug;
  } else if (useMulticlass) {
    classLevels = resolvedSegs.map((r) => ({
      classSlug: r.slug,
      subclassSlug: r.subclassSlug,
      levels: r.levels,
    }));
    multiclassFirstClassSlug = resolvedSegs[0]?.slug ?? "";
    classSlug = multiclassFirstClassSlug;
    subclassSlug = resolvedSegs[0]?.subclassSlug ?? "";
    if (level > 1 && multiclassFirstClassSlug) {
      multiclassLevelOrder = defaultMulticlassLevelOrder(classLevels, multiclassFirstClassSlug, level);
      if (multiclassLevelOrder.length !== level - 1) {
        add(S.class, "Multiclass level-up path could not be inferred — set level order on the Class step.");
        multiclassLevelOrder = Array.from({ length: Math.max(0, level - 1) }, () => "");
      }
    }
  }

  const primaryClass = classes.find((c) => c.slug === classSlug);

  const pseudoForSaves: CharacterDraft = {
    ...DEFAULT_DRAFT,
    useMulticlass,
    classSlug,
    classLevels,
    multiclassFirstClassSlug,
    level,
  };
  const savingThrows = draftSavingThrows(pseudoForSaves, classes);

  if (parsed.savingThrowProfFromSheet.length > 0 && savingThrows.length > 0) {
    const sheetSet = new Set(parsed.savingThrowProfFromSheet);
    const classSet = new Set(savingThrows);
    const mismatch = [...sheetSet].filter((a) => !classSet.has(a));
    if (mismatch.length) {
      add(
        S.class,
        "Saving throw marks on the PDF do not match the resolved class(es) — confirm class(es) and saves here.",
      );
    }
  }

  const finalScoresFull: AbilityScores = {
    strength: parsed.abilityFinal.strength ?? 10,
    dexterity: parsed.abilityFinal.dexterity ?? 10,
    constitution: parsed.abilityFinal.constitution ?? 10,
    intelligence: parsed.abilityFinal.intelligence ?? 10,
    wisdom: parsed.abilityFinal.wisdom ?? 10,
    charisma: parsed.abilityFinal.charisma ?? 10,
  };
  const missingAbilities = ABILITY_NAMES.filter((a) => parsed.abilityFinal[a] == null);
  if (missingAbilities.length) {
    add(
      S.abilityScores,
      `Some ability scores were missing (${missingAbilities.join(", ")}) — set real scores on this step.`,
    );
  }

  if (parsed.abilityScoreModifierHeuristicUsed?.length) {
    add(
      S.abilityScores,
      `Some PDF fields looked like modifiers in the score boxes (${parsed.abilityScoreModifierHeuristicUsed.join(", ")}) — scores were estimated (ability ≈ 10 + 2×modifier). Confirm on this step.`,
    );
  }

  const scores =
    raceSlug && selectedRace
      ? scoresBaseBeforeRace(finalScoresFull, selectedRace, subraceSlug)
      : { ...finalScoresFull };

  const bgSkills = new Set(bgObj?.skillProficiencies ?? []);
  const pseudoForSkills: CharacterDraft = {
    ...DEFAULT_DRAFT,
    useMulticlass,
    classSlug,
    classLevels,
    multiclassFirstClassSlug,
    level,
    raceSlug,
    subraceSlug,
  };
  const { pool: skillPool, count: skillNeed } = draftSkillConfig(pseudoForSkills, classes);
  let chosenSkills: string[] = [];
  if (skillPool.length > 0 && skillNeed > 0) {
    const pool = parsed.skillProfFromSheet.filter((s) => skillPool.includes(s) && !bgSkills.has(s));
    chosenSkills = pool.slice(0, skillNeed);
    if (pool.length < skillNeed) {
      add(
        S.class,
        `Only ${pool.length} class skill(s) could be inferred from the PDF (need ${skillNeed}) — finish skill choices here.`,
      );
    }
  } else if (parsed.skillProfFromSheet.length > 0 && !classSlug) {
    add(S.class, "Skill marks were read from the PDF but no class was resolved — set class, then skills here.");
  }

  const levelUpLen = Math.max(0, level - 1);
  const creationLevelUps = Array.from({ length: levelUpLen }, () => ({}));

  const spellcastingAbility = primaryClass?.spellcastingAbility ?? undefined;

  const patch: Partial<CharacterDraft> = {
    step: 1,
    name,
    alignment: alignment ?? "TRUE_NEUTRAL",
    experiencePoints: xp,
    raceSlug,
    subraceSlug,
    classSlug,
    subclassSlug,
    useMulticlass,
    classLevels,
    multiclassFirstClassSlug,
    multiclassLevelOrder,
    backgroundSlug,
    level,
    abilityMethod: "manual",
    scores,
    chosenSkills,
    savingThrows,
    personalityTraits: parsed.personalityTraits,
    ideals: parsed.ideals,
    bonds: parsed.bonds,
    flaws: parsed.flaws,
    backstory: parsed.backstory,
    age: parsed.age,
    height: parsed.height,
    weight: parsed.weight,
    eyes: parsed.eyes,
    skin: parsed.skin,
    hair: parsed.hair,
    allies: parsed.allies,
    appearance: parsed.appearance,
    copper: parsed.copper,
    silver: parsed.silver,
    electrum: parsed.electrum,
    gold: parsed.gold,
    platinum: parsed.platinum,
    creationLevelUps,
    startingCantripSlugs: [],
    startingLeveledSlugs: [],
    startingWizardPreparedSlugs: [],
    multiclassSpellSegments: {},
    ...(spellcastingAbility ? { spellcastingAbility } : {}),
  };

  if (useMulticlass) {
    add(
      S.class,
      "Multiclass build — verify levels, prerequisites, subclass per class, and level-up path on the Class step.",
    );
  }

  return { patch, issues: dedupePdfImportIssues(issues) };
}

function spellNameDistance(a: string, b: string): number {
  return distance(norm(a), norm(b));
}

/**
 * Best-effort: map spell name lines to SRD slugs for the Starting Spells step (single-class only).
 */
export async function resolveSpellsFromWizardsPdf(
  parsed: ParsedWizardsCharacterSheet,
  draft: CharacterDraft,
  race: Race | undefined,
): Promise<{
  startingCantripSlugs: string[];
  startingLeveledSlugs: string[];
  startingWizardPreparedSlugs: string[];
  issues: PdfImportReviewIssue[];
}> {
  const issues: PdfImportReviewIssue[] = [];
  const S = PDF_IMPORT_REVIEW_STEP;
  const lines = parsed.spellLines.map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { startingCantripSlugs: [], startingLeveledSlugs: [], startingWizardPreparedSlugs: [], issues };
  }
  if (draft.useMulticlass) {
    issues.push({
      step: S.startingSpells,
      message: "Spell lines on the PDF were not imported for multiclass — choose spells per class on this step.",
    });
    return { startingCantripSlugs: [], startingLeveledSlugs: [], startingWizardPreparedSlugs: [], issues };
  }

  const draftAtLevel1 = draft.level > 1 ? { ...draft, level: 1 } : draft;
  const profile = getCreationSpellProfile(draftAtLevel1, race);
  if (!profile) {
    issues.push({
      step: S.startingSpells,
      message: "This class has no guided starting spells here — ignore PDF spell lines or pick spells with your DM.",
    });
    return { startingCantripSlugs: [], startingLeveledSlugs: [], startingWizardPreparedSlugs: [], issues };
  }

  const catalog = await referenceApi.spells({ class: profile.spellListSlug });
  if (!catalog.length) {
    issues.push({ step: S.startingSpells, message: "Spells could not be loaded — pick starting spells on this step." });
    return { startingCantripSlugs: [], startingLeveledSlugs: [], startingWizardPreparedSlugs: [], issues };
  }

  type Matched = { slug: string; name: string; level: number; prepared: boolean };
  const matched: Matched[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let best = catalog[0];
    let bestD = Infinity;
    for (const sp of catalog) {
      const d = spellNameDistance(sp.name, line);
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    const threshold = Math.max(2, Math.floor(line.length / 4));
    if (bestD > threshold) {
      issues.push({
        step: S.startingSpells,
        message: `No confident SRD match for spell line “${line}” — add it manually on this step.`,
      });
      continue;
    }
    matched.push({
      slug: best.slug,
      name: best.name,
      level: best.level ?? 0,
      prepared: parsed.spellPreparedFlags[i] ?? false,
    });
  }

  const cantripOrder = matched.filter((m) => m.level === 0).map((m) => m.slug);
  const leveledOrder = matched.filter((m) => m.level > 0).map((m) => m.slug);
  const cantrips = [...new Set(cantripOrder)].slice(0, profile.cantrips);
  const leveledSlugs = [...new Set(leveledOrder)].slice(0, profile.leveledSpells);

  let leveledPicks: StartingSpellPick[] = [];
  if (profile.mode === "prepared") {
    leveledPicks = leveledSlugs.map((spellSlug) => ({ spellSlug, prepared: true }));
  } else if (profile.mode === "known") {
    leveledPicks = leveledSlugs.map((spellSlug) => ({ spellSlug, prepared: false }));
  } else {
    const prefPrep = new Set(
      matched.filter((m) => m.level > 0 && m.prepared && leveledSlugs.includes(m.slug)).map((m) => m.slug),
    );
    const ordered = [...leveledSlugs].sort((a, b) => Number(prefPrep.has(b)) - Number(prefPrep.has(a)));
    const preparedSet = new Set(ordered.slice(0, profile.preparedFromLeveled));
    leveledPicks = leveledSlugs.map((spellSlug) => ({
      spellSlug,
      prepared: preparedSet.has(spellSlug),
    }));
  }

  const val = validateStartingSpellPicks(profile, cantrips, leveledPicks);
  if (!val.ok) {
    issues.push({
      step: S.startingSpells,
      message: `Starting spells from the PDF did not fit PHB counts (${val.message}) — fix picks on this step.`,
    });
    return { startingCantripSlugs: [], startingLeveledSlugs: [], startingWizardPreparedSlugs: [], issues };
  }

  const startingWizardPreparedSlugs =
    profile.mode === "wizard" ? leveledPicks.filter((x) => x.prepared).map((x) => x.spellSlug) : [];

  return {
    startingCantripSlugs: cantrips,
    startingLeveledSlugs: leveledSlugs,
    startingWizardPreparedSlugs,
    issues: dedupePdfImportIssues(issues),
  };
}
