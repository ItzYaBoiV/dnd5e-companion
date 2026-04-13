/**
 * Maps Open5e `/v1/classes` payloads to Prisma `Class` skill/save/hit-die fields.
 * Open5e often uses string fields (`prof_skills`, `prof_saving_throws`, `hit_dice`) instead of arrays.
 */

const ABILITY_NAMES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

const WORD_TO_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function normalizeAbilityToken(s: string): string {
  const t = s.replace(/\.$/, "").trim().toLowerCase();
  if (!t) return "";
  for (const a of ABILITY_NAMES) {
    if (t === a || t.startsWith(`${a} `)) return a;
  }
  return "";
}

export function parseHitDie(c: Record<string, unknown>): number {
  const legacy = c.hit_die;
  if (typeof legacy === "number" && Number.isFinite(legacy) && legacy > 0) return legacy;

  const raw = String(c.hit_dice ?? legacy ?? "");
  const m = raw.match(/d\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 8;
}

export function parseSavingThrows(c: Record<string, unknown>): string[] {
  const st = c.saving_throws ?? c.prof_saving_throws;
  if (Array.isArray(st)) {
    return st
      .map((item: unknown) => {
        if (item && typeof item === "object" && "name" in item) {
          return normalizeAbilityToken(String((item as { name: string }).name));
        }
        return normalizeAbilityToken(String(item));
      })
      .filter(Boolean);
  }
  if (typeof st === "string" && st.trim()) {
    return st
      .split(/\s*,\s*|\s+and\s+/i)
      .map((x) => normalizeAbilityToken(x))
      .filter(Boolean);
  }
  return [];
}

/** Map common prose skill names to SRD slug form (hyphenated). */
const PHRASE_TO_SKILL_SLUG: Record<string, string> = {
  acrobatics: "acrobatics",
  "animal handling": "animal-handling",
  arcana: "arcana",
  athletics: "athletics",
  deception: "deception",
  history: "history",
  insight: "insight",
  intimidation: "intimidation",
  investigation: "investigation",
  medicine: "medicine",
  nature: "nature",
  perception: "perception",
  performance: "performance",
  persuasion: "persuasion",
  religion: "religion",
  "sleight of hand": "sleight-of-hand",
  stealth: "stealth",
  survival: "survival",
};

function phraseToSkillSlug(phrase: string): string | null {
  const k = phrase.toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ").trim();
  if (!k) return null;
  if (PHRASE_TO_SKILL_SLUG[k]) return PHRASE_TO_SKILL_SLUG[k];
  const hyphen = k.replace(/\s+/g, "-");
  if (/^[a-z]+(-[a-z]+)*$/.test(hyphen)) return hyphen;
  return null;
}

export function parseProfSkills(raw: unknown): { skillChoices: string[]; skillChoiceCount: number } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { skillChoices: [], skillChoiceCount: 0 };
  }
  const s = raw.trim();
  const lower = s.toLowerCase();
  let count = 2;
  const mNum = lower.match(/\bchoose\s+(\d+)\s+from\b/);
  if (mNum) {
    const n = parseInt(mNum[1], 10);
    if (Number.isFinite(n) && n > 0) count = n;
  } else {
    const mAny = lower.match(
      /\bchoose\s+any\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/,
    );
    if (mAny && WORD_TO_NUM[mAny[1]]) {
      count = WORD_TO_NUM[mAny[1]];
    } else {
      const mWord = lower.match(
        /\bchoose\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+from\b/,
      );
      if (mWord && WORD_TO_NUM[mWord[1]]) count = WORD_TO_NUM[mWord[1]];
    }
  }

  let afterFrom = s.replace(/^[\s\S]*?\bfrom\b/i, "").trim();
  if (/^(among\b|the\s+following)/i.test(afterFrom)) {
    const idx = s.lastIndexOf(":");
    if (idx !== -1) afterFrom = s.slice(idx + 1).trim();
  }
  if (!afterFrom) {
    const mOf = lower.match(/\b(?:of|in)\s+the\s+following[^:]*:\s*([\s\S]+)/i);
    if (mOf) afterFrom = mOf[1].trim();
  }
  if (!afterFrom) return { skillChoices: [], skillChoiceCount: 0 };

  const normalized = afterFrom.replace(/\.$/, "").replace(/\s+and\s+/gi, ", ");
  const parts = normalized
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const skillChoices = parts.map(phraseToSkillSlug).filter((x): x is string => x !== null);

  const skillChoiceCount =
    skillChoices.length > 0 ? Math.min(Math.max(count, 1), skillChoices.length) : 0;

  return { skillChoices, skillChoiceCount };
}

export function normalizeSpellcastingAbility(c: Record<string, unknown>): string | null {
  const v = c.spellcasting_ability ?? c.spellcastingAbility;
  if (v == null) return null;
  const token = normalizeAbilityToken(String(v));
  return token || null;
}

export function classFieldsFromOpen5e(c: Record<string, unknown>) {
  const { skillChoices, skillChoiceCount } = parseProfSkills(c.prof_skills);
  return {
    hitDie: parseHitDie(c),
    primaryAbility: typeof c.prof_abilities === "string" ? c.prof_abilities : String(c.prof_abilities ?? ""),
    savingThrows: parseSavingThrows(c),
    skillChoices,
    skillChoiceCount,
    spellcastingAbility: normalizeSpellcastingAbility(c),
  };
}
