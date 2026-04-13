import { distance } from "fastest-levenshtein";

export type SpellIssue = {
  start: number;
  end: number;
  word: string;
  suggestions: string[];
};

/** RPG / D&D terms often missing from general word lists */
const EXTRA_WORDS = [
  "acolyte",
  "aoe",
  "bard",
  "cantrip",
  "charisma",
  "cleric",
  "d20",
  "d6",
  "d8",
  "dexterity",
  "druid",
  "dungeon",
  "dwarven",
  "elven",
  "fighter",
  "halfling",
  "hp",
  "initiative",
  "intelligence",
  "lore",
  "multiclass",
  "npc",
  "paladin",
  "perception",
  "ranger",
  "rogue",
  "sorcerer",
  "sorcerous",
  "statblock",
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
  "tiefling",
  "warlock",
  "wizard",
  "wisdom",
  "xp",
];

/** Collapse runs of 3+ identical letters (e.g. mispellllll → mispell) without touching normal doubles like "ll". */
export function collapseRepeatedLetters(word: string): string {
  return word.replace(/(.)\1{2,}/g, "$1");
}

type DictState = {
  words: Set<string>;
  /** first letter → length → list of dictionary words */
  byFirstAndLen: Map<string, Map<number, string[]>>;
};

let dictLoadPromise: Promise<DictState> | null = null;

function buildDict(raw: string[]): DictState {
  const words = new Set<string>();
  const byFirstAndLen = new Map<string, Map<number, string[]>>();

  const add = (low: string) => {
    if (low.length < 2 || !/^[a-z]/.test(low)) return;
    words.add(low);
    const c0 = low[0];
    let lenMap = byFirstAndLen.get(c0);
    if (!lenMap) {
      lenMap = new Map();
      byFirstAndLen.set(c0, lenMap);
    }
    const len = low.length;
    let arr = lenMap.get(len);
    if (!arr) {
      arr = [];
      lenMap.set(len, arr);
    }
    arr.push(low);
  };

  for (const w of raw) add(w.toLowerCase());
  for (const w of EXTRA_WORDS) add(w.toLowerCase());

  return { words, byFirstAndLen };
}

export function loadEnglishSpellDict(): Promise<DictState> {
  if (!dictLoadPromise) {
    dictLoadPromise = import("an-array-of-english-words").then((m) => {
      const raw = m.default;
      if (!Array.isArray(raw)) {
        throw new Error("an-array-of-english-words: expected default array export");
      }
      return buildDict(raw);
    });
  }
  return dictLoadPromise;
}

function collectCandidates(
  dict: DictState,
  first: string,
  lenLo: number,
  lenHi: number
): string[] {
  const lenMap = dict.byFirstAndLen.get(first);
  if (!lenMap) return [];
  const out: string[] = [];
  for (let L = lenLo; L <= lenHi; L++) {
    const chunk = lenMap.get(L);
    if (chunk) out.push(...chunk);
  }
  return out;
}

const MAX_DIST = 3;
const LEN_PAD = 2;

function suggestionsForWord(dict: DictState, raw: string): string[] {
  const lower = raw.toLowerCase();
  if (lower.length < 2) return [];
  if (!/^[a-z]/.test(lower)) return [];
  if (dict.words.has(lower)) return [];

  const collapsed = collapseRepeatedLetters(lower);
  const lengths = new Set<number>([lower.length, collapsed.length]);
  let lenMin = Math.min(...lengths);
  let lenMax = Math.max(...lengths);
  lenMin = Math.max(2, lenMin - LEN_PAD);
  lenMax = lenMax + LEN_PAD;

  const first = lower[0];
  const candidates = collectCandidates(dict, first, lenMin, lenMax);
  if (candidates.length === 0) return [];

  const scored: { w: string; d: number }[] = [];
  for (const w of candidates) {
    const d = Math.min(distance(lower, w), distance(collapsed, w));
    if (d <= MAX_DIST && d > 0) scored.push({ w, d });
  }
  scored.sort((a, b) => a.d - b.d || a.w.localeCompare(b.w));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const { w } of scored) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 6) break;
  }
  return out;
}

const WORD_RE = /\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b/g;

export function findSpellIssues(text: string, dict: DictState): SpellIssue[] {
  const issues: SpellIssue[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) {
    const word = m[0];
    const start = m.index;
    const end = start + word.length;
    if (word.length < 2) continue;
    const lower = word.toLowerCase();
    if (dict.words.has(lower)) continue;
    const suggestions = suggestionsForWord(dict, word);
    if (suggestions.length === 0) continue;
    issues.push({ start, end, word, suggestions });
  }
  return issues;
}
