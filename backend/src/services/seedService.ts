/**
 * seedService.ts
 * Seeds D&D 5e data from Open5e (mostly v1; general equipment comes from v2 /items).
 * Each seeder is isolated: if one fails, the rest continue.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { classFieldsFromOpen5e } from "./open5eClassFields";
import { classFeatureCreatesFromOpen5e } from "./open5eClassFeatures";

const BASE_URL = "https://api.open5e.com/v1";
const BASE_URL_V2 = "https://api.open5e.com/v2";
const DELAY_MS = 250;

async function fetchOpen5eClassDetail(slug: string): Promise<Record<string, unknown> | null> {
  const url = `${BASE_URL}/classes/${encodeURIComponent(slug)}/?format=json`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "dnd5e-companion/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json() as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchAll(endpoint: string): Promise<any[]> {
  const results: any[] = [];
  let url: string | null = `${BASE_URL}/${endpoint}/?limit=100&format=json`;

  while (url) {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "dnd5e-companion/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const data = await res.json() as { results?: any[]; next?: string | null };
    results.push(...(data.results ?? []));
    url = data.next ?? null;
    if (url) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`  Fetched ${results.length} from /${endpoint}`);
  return results;
}

async function fetchAllV2(endpoint: string, query: Record<string, string> = {}): Promise<any[]> {
  const results: any[] = [];
  const params = new URLSearchParams({ limit: "100", format: "json", ...query });
  let url: string | null = `${BASE_URL_V2}/${endpoint}/?${params.toString()}`;

  while (url) {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "dnd5e-companion/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const data = await res.json() as { results?: any[]; next?: string | null };
    results.push(...(data.results ?? []));
    url = data.next ?? null;
    if (url) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const qNote = Object.keys(query).length ? ` (${Object.entries(query).map(([k, v]) => `${k}=${v}`).join(", ")})` : "";
  console.log(`  Fetched ${results.length} from v2/${endpoint}${qNote}`);
  return results;
}

/** Subclass feature rows from an Open5e v2 class document (base class or subclass row). */
function open5eSubclassFeaturesFromRow(r: any): { name: string; level: number; description: string }[] {
  const featuresRaw = Array.isArray(r?.features) ? r.features : [];
  const createFeatures: { name: string; level: number; description: string }[] = [];
  const seen = new Set<string>();
  for (const f of featuresRaw) {
    const featureType = String(f?.feature_type ?? "").toUpperCase();
    if (featureType && featureType !== "CLASS_LEVEL_FEATURE") continue;
    const name = String(f?.name ?? "").trim();
    if (!name) continue;
    const desc = String(f?.desc ?? "").trim();
    const gained = Array.isArray(f?.gained_at) ? f.gained_at : [];
    for (const g of gained) {
      const lv = Number(g?.level);
      if (!Number.isFinite(lv) || lv < 1 || lv > 20) continue;
      const k = `${name.toLowerCase()}::${lv}`;
      if (seen.has(k)) continue;
      seen.add(k);
      createFeatures.push({ name, level: lv, description: desc });
    }
  }
  return createFeatures;
}

async function fetchOpen5eJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "dnd5e-companion/1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch {
    return null;
  }
}

/**
 * Pull v2 class rows that represent subclasses. Prefer explicit SRD documents (reliable) then
 * merge any SRD-tagged subclass rows from a full scan so we do not miss entries when the API
 * omits document filters or uses mixed keys (srd-2014 vs srd-2024).
 */
async function fetchOpen5eV2SubclassClassRows(): Promise<any[]> {
  const byKey = new Map<string, any>();
  const absorb = (rows: any[]) => {
    for (const r of rows) {
      const k = String(r?.key ?? "");
      if (!k || !r?.subclass_of?.key) continue;
      byKey.set(k, r);
    }
  };

  for (const dk of ["srd-2014", "srd-2024", "srd"]) {
    try {
      absorb(await fetchAllV2("classes", { document__key: dk }));
    } catch (e) {
      console.log(`  [subclasses] document__key=${dk} skipped: ${e}`);
    }
  }

  if (byKey.size === 0) {
    console.log("  [subclasses] no rows from document__key pulls; using full v2/classes list (SRD only)");
    const full = await fetchAllV2("classes");
    for (const r of full) {
      if (!r?.subclass_of?.key) continue;
      const dk = String(r?.document?.key ?? "").toLowerCase();
      if (!dk.startsWith("srd")) continue;
      byKey.set(String(r.key), r);
    }
  } else {
    const full = await fetchAllV2("classes");
    for (const r of full) {
      const k = String(r?.key ?? "");
      if (!r?.subclass_of?.key || !k || byKey.has(k)) continue;
      const docKey = String(r?.document?.key ?? "").toLowerCase();
      if (docKey.startsWith("srd")) byKey.set(k, r);
    }
  }

  return [...byKey.values()];
}

/** v1 /equipment was removed; v2 /items holds adventuring gear, tools, mounts, etc. */
async function fetchEquipmentFromV2Items(): Promise<any[]> {
  const rows = await fetchAllV2("items");
  const filtered = rows.filter((i: any) => {
    const k = i.category?.key;
    if (!k) return false;
    if (k === "weapon" || k === "armor") return false;
    if (i.is_magic_item === true) return false;
    return true;
  });
  console.log(`  Mapped ${filtered.length} v2 items as equipment (non-weapon, non-armor, non-magic)`);
  return filtered.map(v2ItemRowToLegacyEquipmentShape);
}

function v2ItemRowToLegacyEquipmentShape(i: any) {
  const itemSlug = String(i.key ?? slug(i.name))
    .toLowerCase()
    .replace(/_/g, "-");
  const costNum = parseFloat(String(i.cost ?? "0"));
  const wtRaw = i.weight != null && i.weight !== "" ? parseFloat(String(i.weight)) : NaN;
  const doc = i.document;
  const source =
    typeof doc?.display_name === "string"
      ? doc.display_name
      : typeof doc?.name === "string"
        ? doc.name
        : "SRD";

  return {
    slug: itemSlug,
    name: i.name,
    _cat: "gear",
    category: i.category?.key ?? i.category?.name ?? null,
    desc: i.desc ?? "",
    damage_dice: undefined,
    damage: undefined,
    damage_type: undefined,
    range: undefined,
    properties: [],
    armor_class: null,
    stealth_disadvantage: false,
    str_minimum: null,
    weight: Number.isFinite(wtRaw) ? wtRaw : null,
    cost: costNum > 0 ? { quantity: costNum, unit: "gp" } : undefined,
    requires_attunement: "",
    document__title: source,
  };
}

function normalizeItemProperties(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: any) => (typeof p === "string" ? p : p?.name ?? String(p))).filter(Boolean);
}

/** v1 /armor uses `base_ac`; some payloads use `armor_class` (number or { base }). */
function parseOpen5eBaseAc(item: Record<string, unknown>): number | null {
  const baseAc = item.base_ac;
  if (typeof baseAc === "number" && Number.isFinite(baseAc)) return Math.trunc(baseAc);
  const legacy = item.armor_class;
  if (typeof legacy === "number" && Number.isFinite(legacy)) return Math.trunc(legacy);
  if (legacy && typeof legacy === "object") {
    const b = (legacy as { base?: unknown }).base;
    if (typeof b === "number" && Number.isFinite(b)) return Math.trunc(b);
    if (typeof b === "string") {
      const n = parseInt(b, 10);
      return Number.isFinite(n) ? n : null;
    }
  }
  if (typeof legacy === "string") {
    const n = parseInt(legacy.replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Open5e often sends cost as "10 gp" instead of { quantity, unit }. */
function parseOpen5eItemCost(raw: unknown): { quantity: number; unit: string } | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "object" && raw !== null && "quantity" in raw) {
    const o = raw as { quantity?: unknown; unit?: unknown };
    const q = Number(o.quantity);
    const u = String(o.unit ?? "gp").toLowerCase();
    if (Number.isFinite(q)) return { quantity: q, unit: u };
    return undefined;
  }
  if (typeof raw === "string") {
    const m = raw.trim().match(/^([\d.,]+)\s*([a-zA-Z]+)$/);
    if (m) {
      const q = parseFloat(m[1].replace(/,/g, ""));
      const u = m[2].toLowerCase();
      if (Number.isFinite(q)) return { quantity: q, unit: u };
    }
  }
  return undefined;
}

function parseOpen5eStrengthReq(item: Record<string, unknown>): number | null {
  const v = item.str_minimum ?? item.strength_requirement;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.trunc(v);
  return null;
}

function parseOpen5eItemWeight(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const w = parseFloat(String(raw));
  return Number.isFinite(w) ? w : null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeOpen5eKey(key: string): string {
  return String(key).trim().toLowerCase().replace(/_/g, "-");
}

/** Map Open5e v2 class/subclass keys (srd_ranger, srd-2024_ranger) -> local class slug (ranger). */
function normalizeClassSlugFromOpen5eKey(key: string): string {
  const k = normalizeOpen5eKey(key);
  return k
    .replace(/^srd-2024-/, "")
    .replace(/^srd-/, "");
}

/** Open5e returns booleans or strings like "yes" / "no" for some fields */
function coerceOpen5eBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null) return false;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "true" || t === "yes" || t === "1" || t === "y";
  }
  return false;
}

function asOpen5eArray<T = unknown>(v: unknown): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Open5e may return languages as PHB prose, a list string, objects, or an array */
function normalizeRaceLanguages(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const s = raw.replace(/\*{1,3}/g, "").replace(/\s+/g, " ").trim();
    if (!s) return [];
    if (s.length > 90 || /\b(you can speak|read, and write)\b/i.test(s)) return [s];
    return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .map((l: any) =>
        typeof l === "string" ? l.trim() : (l?.name != null ? String(l.name) : l != null ? String(l) : "")
      )
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (typeof raw === "object" && raw !== null && "name" in raw) {
    const n = String((raw as { name: unknown }).name ?? "").trim();
    return n ? [n] : [];
  }
  return [];
}

function normalizeRaceSpeed(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object" && "walk" in (raw as object)) {
    const w = (raw as { walk?: unknown }).walk;
    if (typeof w === "number" && Number.isFinite(w)) return w;
  }
  return 30;
}

/** Legacy `ability_bonuses` or newer `asi`: [{ attributes: ["Dex"], value: 2 }] */
function normalizeAbilityBonusesFromApi(r: Record<string, unknown>): { ability: string; bonus: number }[] {
  const legacy = asOpen5eArray((r as any).ability_bonuses).map((b: any) => ({
    ability: String(b.ability_score?.name ?? b.ability_score ?? "").toLowerCase().trim(),
    bonus:   Number(b.bonus) || 0,
  })).filter((x) => x.ability);
  if (legacy.length > 0) return legacy;

  return asOpen5eArray((r as any).asi).flatMap((block: any) => {
    const value = Number(block.value) || 0;
    return asOpen5eArray(block.attributes).map((a: any) => ({
      ability: String(a).toLowerCase().trim(),
      bonus:   value,
    })).filter((x: { ability: string }) => x.ability);
  });
}

function normalizeRaceSize(r: Record<string, unknown>): string {
  const raw = (r as any).size_raw;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const sz = (r as any).size;
  if (typeof sz === "string") {
    const m = sz.match(/\b(Small|Medium|Large|Tiny|Huge|Gargantuan)\b/i);
    if (m) return m[1];
  }
  return "Medium";
}

/** Legacy trait objects or markdown blocks like `**_Name._** description` */
function normalizeRaceTraits(raw: unknown): { name: string; description: string }[] {
  if (Array.isArray(raw)) {
    return asOpen5eArray(raw).map((t: any) => ({
      name:        String(t.name ?? "Trait"),
      description: String(t.desc ?? ""),
    }));
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    return t
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => {
        const m = b.match(/^\*{2,3}_([^._\n]+)(?:\.?)_?\*{2,3}\s*(.*)$/s);
        if (m) return { name: m[1].trim(), description: m[2].trim() || m[1].trim() };
        const m2 = b.match(/^\*{2,3}([^*\n]+)\*{2,3}\s*(.*)$/s);
        if (m2) return { name: m2[1].trim(), description: m2[2].trim() };
        return { name: "Trait", description: b };
      });
  }
  return [];
}

function raceSource(r: Record<string, unknown>): string {
  const t = (r as any).document__title;
  return typeof t === "string" && t.trim() ? t.trim() : "SRD";
}

// ── Races ─────────────────────────────────────────────────────────
async function seedRaces() {
  console.log("Seeding races...");
  const races = await fetchAll("races");
  for (const r of races) {
    const row = r as Record<string, unknown>;
    const raceSlug = (row.slug as string) ?? slug(String(row.name));
    const abilityBonuses = normalizeAbilityBonusesFromApi(row);
    const traitsRaw = (row as any).traits ?? (row as any).racial_traits;
    const subList = asOpen5eArray((row as any).subraces);

    await prisma.race.upsert({
      where:  { slug: raceSlug },
      create: {
        slug:   raceSlug,
        name:   String(row.name),
        speed:  normalizeRaceSpeed(row.speed),
        size:   normalizeRaceSize(row),
        abilityBonuses,
        languages: normalizeRaceLanguages(row.languages),
        source: raceSource(row),
        traits: {
          create: normalizeRaceTraits(traitsRaw),
        },
        subraces: {
          create: subList.map((sub: any) => ({
            slug: sub.slug ?? slug(sub.name),
            name: sub.name,
            abilityBonuses: normalizeAbilityBonusesFromApi(sub as Record<string, unknown>),
            traits: {
              create: normalizeRaceTraits(sub.racial_traits ?? sub.traits),
            },
          })),
        },
      },
      update: { name: String(row.name), source: raceSource(row) },
    });
  }
}

/** PHB-adjacent races not always present in the Open5e SRD pull. */
async function seedSupplementalRaces() {
  console.log("Seeding supplemental races (kobold, aasimar)...");
  const koboldTraits = [
    {
      name: "Darkvision",
      description:
        "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.",
    },
    {
      name: "Grovel, Cower, and Beg",
      description:
        "As an action on your turn, you can cower to distract foes. Until the end of your next turn, your allies gain advantage on attack rolls against enemies within 10 feet of you that can see you. Once you use this trait, you can't use it again until you finish a short or long rest.",
    },
    {
      name: "Pack Tactics",
      description:
        "You have advantage on an attack roll against a creature if at least one ally is within 5 feet of the creature and that ally isn't incapacitated.",
    },
    {
      name: "Sunlight Sensitivity",
      description:
        "You have disadvantage on attack rolls and on Wisdom (Perception) checks that rely on sight when you, the target, or what you perceive is in direct sunlight.",
    },
  ];

  await prisma.race.upsert({
    where: { slug: "kobold" },
    create: {
      slug: "kobold",
      name: "Kobold",
      speed: 30,
      size: "Small",
      abilityBonuses: [{ ability: "dexterity", bonus: 2 }],
      languages: ["common", "draconic"],
      source: "VGtM-style (app)",
      traits: { create: koboldTraits },
    },
    update: {
      name: "Kobold",
      speed: 30,
      size: "Small",
      abilityBonuses: [{ ability: "dexterity", bonus: 2 }],
      languages: ["common", "draconic"],
      source: "VGtM-style (app)",
      traits: { deleteMany: {}, create: koboldTraits },
      subraces: { deleteMany: {} },
    },
  });

  const aasimarTraits = [
    {
      name: "Darkvision",
      description:
        "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.",
    },
    {
      name: "Celestial Resistance",
      description: "You have resistance to necrotic damage and radiant damage.",
    },
    {
      name: "Healing Hands",
      description:
        "As an action, you can touch a creature and restore hit points equal to your level. Once you use this trait, you can't use it again until you finish a long rest.",
    },
    {
      name: "Light Bearer",
      description: "You know the light cantrip. Charisma is your spellcasting ability for it.",
    },
  ];

  const aasimarSubcreates = [
    {
      slug: "protector-aasimar",
      name: "Protector Aasimar",
      abilityBonuses: [{ ability: "wisdom", bonus: 1 }],
      traits: {
        create: [
          {
            name: "Radiant Soul",
            description:
              "From 3rd level, you can use a bonus action to unleash divine energy for 1 minute (once per long rest). During it, you have a fly speed of 30 feet, and once per turn you can deal extra radiant damage when you hit with an attack or spell.",
          },
        ],
      },
    },
    {
      slug: "scourge-aasimar",
      name: "Scourge Aasimar",
      abilityBonuses: [{ ability: "constitution", bonus: 1 }],
      traits: {
        create: [
          {
            name: "Radiant Consumption",
            description:
              "From 3rd level, you can use a bonus action to radiate searing light for 1 minute (once per long rest). You and creatures within 10 feet take radiant damage at the start of each of your turns, and once per turn you can deal extra radiant damage when you hit.",
          },
        ],
      },
    },
    {
      slug: "fallen-aasimar",
      name: "Fallen Aasimar",
      abilityBonuses: [{ ability: "strength", bonus: 1 }],
      traits: {
        create: [
          {
            name: "Necrotic Shroud",
            description:
              "From 3rd level, you can use a bonus action to transform for 1 minute (once per long rest). Your eyes turn red, flightless wings appear, and once per turn you can deal extra necrotic damage when you hit with an attack or spell.",
          },
        ],
      },
    },
  ];

  await prisma.race.upsert({
    where: { slug: "aasimar" },
    create: {
      slug: "aasimar",
      name: "Aasimar",
      speed: 30,
      size: "Medium",
      abilityBonuses: [{ ability: "charisma", bonus: 2 }],
      languages: ["common", "celestial"],
      source: "VGtM-style (app)",
      traits: { create: aasimarTraits },
      subraces: { create: aasimarSubcreates },
    },
    update: {
      name: "Aasimar",
      speed: 30,
      size: "Medium",
      abilityBonuses: [{ ability: "charisma", bonus: 2 }],
      languages: ["common", "celestial"],
      source: "VGtM-style (app)",
      traits: { deleteMany: {}, create: aasimarTraits },
      subraces: { deleteMany: {}, create: aasimarSubcreates },
    },
  });
}

/**
 * PHB-style subraces missing from the Open5e SRD race JSON (Elf only lists High Elf there).
 * Inserts by slug; skips if the slug belongs to another race or the same display name already exists under the parent.
 */
async function seedSupplementalSubraces() {
  console.log("Seeding supplemental subraces (PHB-style, non-SRD)...");

  type SubDef = {
    slug: string;
    raceSlug: string;
    name: string;
    abilityBonuses: { ability: string; bonus: number }[];
    traits: { name: string; description: string }[];
  };

  const defs: SubDef[] = [
    {
      slug: "wood-elf",
      raceSlug: "elf",
      name: "Wood Elf",
      abilityBonuses: [{ ability: "wisdom", bonus: 1 }],
      traits: [
        {
          name: "Mask of the Wild",
          description:
            "You can attempt to hide when you are only lightly obscured by foliage, heavy rain, snow, mist, and similar natural phenomena.",
        },
        {
          name: "Fleet of Foot",
          description: "Your base walking speed is 35 feet (instead of the 30 feet typical for elves).",
        },
      ],
    },
  ];

  let added = 0;
  let skipped = 0;

  for (const def of defs) {
    const parent = await prisma.race.findUnique({ where: { slug: def.raceSlug } });
    if (!parent) {
      console.log(`  [supplemental subraces] skip ${def.slug} — parent race '${def.raceSlug}' not found`);
      skipped++;
      continue;
    }

    const owned = await prisma.subrace.findUnique({ where: { slug: def.slug } });
    if (owned && owned.raceSlug !== def.raceSlug) {
      console.log(`  [supplemental subraces] skip ${def.slug} — slug already used by race '${owned.raceSlug}'`);
      skipped++;
      continue;
    }

    const sameName = await prisma.subrace.findFirst({
      where: {
        raceSlug: def.raceSlug,
        name: { equals: def.name, mode: "insensitive" },
        NOT: { slug: def.slug },
      },
    });
    if (sameName) {
      console.log(`  [supplemental subraces] skip ${def.slug} — '${def.name}' already exists as ${sameName.slug}`);
      skipped++;
      continue;
    }

    await prisma.subrace.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        raceSlug: def.raceSlug,
        name: def.name,
        abilityBonuses: def.abilityBonuses,
        traits: { create: def.traits },
      },
      update: {
        raceSlug: def.raceSlug,
        name: def.name,
        abilityBonuses: def.abilityBonuses,
        traits: { deleteMany: {}, create: def.traits },
      },
    });
    added++;
  }

  console.log(`  [supplemental subraces] upserted ${added}, skipped ${skipped}`);
}

// ── Classes ───────────────────────────────────────────────────────
async function seedClasses() {
  console.log("Seeding classes...");
  const classes = await fetchAll("classes");
  for (const c of classes) {
    const classSlug = c.slug ?? slug(c.name);
    const cf = classFieldsFromOpen5e(c as Record<string, unknown>);

    let detail: Record<string, unknown> | null = null;
    let featureCreates = classFeatureCreatesFromOpen5e(c as Record<string, unknown>, null);
    if (featureCreates.length === 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      detail = await fetchOpen5eClassDetail(classSlug);
      featureCreates = classFeatureCreatesFromOpen5e(c as Record<string, unknown>, detail);
    }

    await prisma.class.upsert({
      where:  { slug: classSlug },
      create: {
        slug: classSlug, name: c.name,
        hitDie:              cf.hitDie,
        primaryAbility:      cf.primaryAbility,
        savingThrows:        cf.savingThrows,
        armorProficiencies:  c.prof_armor   ? [c.prof_armor]   : [],
        weaponProficiencies: c.prof_weapons ? [c.prof_weapons] : [],
        toolProficiencies:   c.prof_tools   ? [c.prof_tools]   : [],
        startingEquipment:   String(c.equipment ?? ""),
        skillChoices:        cf.skillChoices,
        skillChoiceCount:    cf.skillChoiceCount,
        spellcastingAbility: cf.spellcastingAbility,
        spellcastingType:    null,
        spellSlotsPerLevel:  {},
        cantripsKnown:       undefined,
        spellsKnown:         undefined,
        features:            { create: featureCreates },
      },
      update: {
        name:                c.name,
        hitDie:              cf.hitDie,
        primaryAbility:      cf.primaryAbility,
        savingThrows:        cf.savingThrows,
        armorProficiencies:  c.prof_armor   ? [c.prof_armor]   : [],
        weaponProficiencies: c.prof_weapons ? [c.prof_weapons] : [],
        toolProficiencies:   c.prof_tools   ? [c.prof_tools]   : [],
        startingEquipment:   String(c.equipment ?? ""),
        skillChoices:        cf.skillChoices,
        skillChoiceCount:    cf.skillChoiceCount,
        spellcastingAbility: cf.spellcastingAbility,
        features:            { deleteMany: {}, create: featureCreates },
      },
    });
  }
}

// ── Subclasses (from Open5e v2 classes with `subclass_of`) ──────────
async function seedSubclasses() {
  console.log("Seeding subclasses...");
  const rows = await fetchOpen5eV2SubclassClassRows();
  const subclassRows = rows.filter((r: any) => r?.subclass_of?.key);
  if (subclassRows.length === 0) {
    console.log("  [subclasses] none found from v2/classes");
    return;
  }

  const knownClasses = await prisma.class.findMany({ select: { slug: true } });
  const known = new Set(knownClasses.map((c) => c.slug));
  let saved = 0;
  let skipped = 0;
  let enriched = 0;

  const candidates: Array<{
    classSlug: string;
    subclassSlug: string;
    subclassName: string;
    docKey: string;
    createFeatures: { name: string; level: number; description: string }[];
  }> = [];

  for (const r of subclassRows) {
    const docKey = String(r?.document?.key ?? "").toLowerCase();
    // Keep SRD subclasses only (avoid pulling 3rd-party books by default).
    if (!docKey.startsWith("srd")) {
      skipped++;
      continue;
    }

    const parentKey = String(r?.subclass_of?.key ?? "");
    const classSlug = normalizeClassSlugFromOpen5eKey(parentKey);
    if (!known.has(classSlug)) {
      skipped++;
      continue;
    }

    const subclassSlug = normalizeOpen5eKey(String(r.key ?? slug(String(r.name ?? "subclass"))));
    const subclassName = String(r.name ?? subclassSlug);
    let createFeatures = open5eSubclassFeaturesFromRow(r);

    if (createFeatures.length === 0 && typeof r.url === "string" && r.url.includes("/v2/classes/")) {
      await new Promise((x) => setTimeout(x, 80));
      const detail = await fetchOpen5eJson(r.url);
      if (detail) {
        const fromDetail = open5eSubclassFeaturesFromRow(detail);
        if (fromDetail.length > 0) {
          createFeatures = fromDetail;
          enriched++;
        }
      }
    }

    candidates.push({ classSlug, subclassSlug, subclassName, docKey, createFeatures });
  }

  if (enriched > 0) console.log(`  [subclasses] enriched ${enriched} rows from detail URLs`);

  // Deduplicate same class + display name across SRD 2014/2024.
  // Preference: srd-2024 > srd > anything else.
  const rankDoc = (k: string) => (k.startsWith("srd-2024") ? 3 : k.startsWith("srd") ? 2 : 1);
  const chosen = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    const key = `${c.classSlug}::${c.subclassName.trim().toLowerCase()}`;
    const prev = chosen.get(key);
    if (!prev || rankDoc(c.docKey) > rankDoc(prev.docKey)) {
      chosen.set(key, c);
    }
  }

  for (const c of chosen.values()) {
    await prisma.subclass.upsert({
      where: { slug: c.subclassSlug },
      create: {
        slug: c.subclassSlug,
        classSlug: c.classSlug,
        name: c.subclassName,
        features: { create: c.createFeatures },
      },
      update: {
        classSlug: c.classSlug,
        name: c.subclassName,
        features: { deleteMany: {}, create: c.createFeatures },
      },
    });
    // Remove prior SRD duplicate rows with same visible name for this class.
    await prisma.subclass.deleteMany({
      where: {
        classSlug: c.classSlug,
        name: c.subclassName,
        slug: { not: c.subclassSlug },
      },
    });
    saved++;
  }

  console.log(`  [subclasses] saved ${saved}, skipped ${skipped}`);
}

/** Short reminder text for app-authored subclass stubs (not a substitute for the PHB / DM). */
const SUBCLASS_STUB_NOTE =
  "This line is a compact reminder from the companion app. Use your Player's Handbook, another licensed reference, or your DM for full rules, DCs, and limits.";

type SupplementalSubclassDef = {
  classSlug: string;
  slug: string;
  name: string;
  features: { name: string; level: number; description: string }[];
};

/**
 * PHB (and a few common adjacent) subclasses that are not part of the Wizards SRD — so they never
 * appear in the Open5e `srd*` document stream we ingest in seedSubclasses. Same pattern as
 * seedSupplementalRaces: add selectable rows with original summary blurbs only.
 */
const SUPPLEMENTAL_SUBCLASSES: SupplementalSubclassDef[] = [
  {
    classSlug: "barbarian",
    slug: "path-of-the-totem-warrior",
    name: "Path of the Totem Warrior",
    features: [
      {
        name: "Spirit Seeker",
        level: 3,
        description: `Beast spells and ritual flavor tied to your totem. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Totem Spirit",
        level: 3,
        description: `Choose a totem animal (such as bear, eagle, or wolf) for a themed benefit while raging or exploring. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Aspect of the Beast",
        level: 6,
        description: `A passive benefit echoing your totem (often exploration or resilience themed). ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Spirit Walker",
        level: 10,
        description: `Consult spirits in a brief trance for guidance. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Totemic Attunement",
        level: 14,
        description: `Stronger totem-themed combat or utility while raging. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "bard",
    slug: "college-of-valor",
    name: "College of Valor",
    features: [
      {
        name: "Bonus Proficiencies",
        level: 3,
        description: `Training with armor, shields, and martial weapons to support a skirmisher bard. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Combat Inspiration",
        level: 3,
        description: `Allies can spend Bardic Inspiration for damage or AC in addition to the usual save/check boost. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Extra Attack",
        level: 6,
        description: `You can attack twice when you take the Attack action on your turn. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Battle Magic",
        level: 14,
        description: `Weave weapon strikes together with bard spells on the same turn. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "cleric",
    slug: "knowledge-domain",
    name: "Knowledge Domain",
    features: [
      {
        name: "Blessings of Knowledge",
        level: 1,
        description: `Extra skills and languages reflecting scholarly devotion. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Channel Divinity: Knowledge of the Ancients",
        level: 2,
        description: `Channel Divinity option: briefly add a bonus to an Intelligence check about lore or objects. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Read Thoughts",
        level: 6,
        description: `Probe surface thoughts and potentially impose a stunned-like pause on a creature. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Potent Spellcasting",
        level: 8,
        description: `Add your Wisdom modifier to cantrip damage where applicable. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Visions of the Past",
        level: 17,
        description: `Sense echoes of a place or object’s history. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "cleric",
    slug: "death-domain",
    name: "Death Domain",
    features: [
      {
        name: "Reaper",
        level: 1,
        description: `Necromancy cantrip synergy for closer-ranged spell attacks. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Touch of Death",
        level: 1,
        description: `When you reduce a creature to 0 HP, gain temporary vitality from the release of life energy. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Channel Divinity: Touch of Death",
        level: 2,
        description: `As above, tied to your Channel Divinity uses. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Inescapable Destruction",
        level: 6,
        description: `Your necrotic damage ignores some resistances. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Divine Strike",
        level: 8,
        description: `Once per turn, add necrotic damage to a weapon attack. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Improved Reaper",
        level: 17,
        description: `Spread low-level necromancy spells more efficiently in combat. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "cleric",
    slug: "arcana-domain",
    name: "Arcana Domain",
    features: [
      {
        name: "Arcane Initiate",
        level: 1,
        description: `Extra cantrips and arcane spells woven into cleric preparation. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Channel Divinity: Arcane Abjuration",
        level: 2,
        description: `Turn or banish otherworldly creatures with a Channel Divinity option. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Spell Breaker",
        level: 6,
        description: `Help allies shake hostile magic when you heal them. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Potent Spellcasting",
        level: 8,
        description: `Add Wisdom to eligible cleric cantrip damage. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Arcane Mastery",
        level: 17,
        description: `Choose resistances when you cast potent spells. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "druid",
    slug: "circle-of-the-moon",
    name: "Circle of the Moon",
    features: [
      {
        name: "Combat Wild Shape",
        level: 2,
        description: `Wild Shape as a bonus action and short-rest healing while in beast form (with limits). ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Circle Forms",
        level: 2,
        description: `Access stronger beast shapes earlier than other circles. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Primal Strike",
        level: 6,
        description: `Beast attacks count as magical for overcoming resistance. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Elemental Wild Shape",
        level: 10,
        description: `Assume elemental beast forms for a short time. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Thousand Forms",
        level: 14,
        description: `Cast alter self at will for disguise and minor adaptation. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "monk",
    slug: "way-of-shadow",
    name: "Way of Shadow",
    features: [
      {
        name: "Shadow Arts",
        level: 3,
        description: `Spend ki on darkness, darkvision, silence, or a bonus-action teleport between dim areas. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Shadow Step",
        level: 6,
        description: `Bonus-action teleport from one dim light or darkness to another, then gain attack advantage. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Cloak of Shadows",
        level: 11,
        description: `Become invisible in dim light or darkness. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Opportunist",
        level: 17,
        description: `Exploit distracted foes near shadows with a reaction attack. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "monk",
    slug: "way-of-the-four-elements",
    name: "Way of the Four Elements",
    features: [
      {
        name: "Disciple of the Elements",
        level: 3,
        description: `Learn elemental disciplines powered by ki (often mimicking spells). ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Elemental Disciplines",
        level: 3,
        description: `Pick additional disciplines as you advance, expanding your elemental toolkit. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Discipline breadth",
        level: 6,
        description: `Access more elemental disciplines and combine them in skirmishes. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Refined disciplines",
        level: 11,
        description: `Stronger disciplines and more efficient ki spending on larger elemental effects. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Perfected elements",
        level: 17,
        description: `Capstone-style access to devastating or versatile elemental options. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  ...(
    [
      "Conjuration",
      "Divination",
      "Enchantment",
      "Illusion",
      "Necromancy",
      "Transmutation",
    ] as const
  ).map((school) => {
    const slug = `school-of-${school.toLowerCase()}`;
    return {
      classSlug: "wizard",
      slug,
      name: `School of ${school}`,
      features: [
        {
          name: `${school} Savant`,
          level: 2,
          description: `Halve time/gold to copy spells of your school into a spellbook. ${SUBCLASS_STUB_NOTE}`,
        },
        {
          name: `${school} tradition feature`,
          level: 2,
          description: `A signature trick tied to manipulating ${school.toLowerCase()} magic. ${SUBCLASS_STUB_NOTE}`,
        },
        {
          name: `Potent ${school}`,
          level: 6,
          description: `Mid-tier school benefit—often damage, control, or economy on spells of your school. ${SUBCLASS_STUB_NOTE}`,
        },
        {
          name: `${school} expertise`,
          level: 10,
          description: `Stronger manipulation of your school’s spells or targets. ${SUBCLASS_STUB_NOTE}`,
        },
        {
          name: `${school} capstone band`,
          level: 14,
          description: `A powerful capstone-style benefit for specialists of this school. ${SUBCLASS_STUB_NOTE}`,
        },
      ],
    } satisfies SupplementalSubclassDef;
  }),
  {
    classSlug: "sorcerer",
    slug: "storm-sorcery",
    name: "Storm Sorcery",
    features: [
      {
        name: "Tempestuous Magic",
        level: 1,
        description: `After you cast a leveled spell, you can fly a short distance without provoking opportunity attacks. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Heart of the Storm",
        level: 6,
        description: `While storming, you gain resistance to an energy type and can share minor protection with allies. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Storm Guide",
        level: 6,
        description: `Subtly control wind and rain in a small radius—often flavor with light combat utility. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Storm's Fury",
        level: 14,
        description: `When a melee attacker hits you in storm form, you can punish them with lightning. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Wind Soul",
        level: 18,
        description: `Gain a fly speed and share a burst of flight with the party once per rest. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
  {
    classSlug: "wizard",
    slug: "bladesinging",
    name: "Bladesinging",
    features: [
      {
        name: "Training in War and Song",
        level: 2,
        description: `Gain proficiency with light armor and a one-handed melee weapon; use Intelligence for a key performance skill. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Bladesong",
        level: 2,
        description: `Bonus action: enter a dance that boosts AC, concentration, and mobility for a short duration (uses per rest). ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Extra Attack",
        level: 6,
        description: `You can attack twice when you take the Attack action on your turn. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Song of Defense",
        level: 10,
        description: `Spend a spell slot to reduce damage while your bladesong is active. ${SUBCLASS_STUB_NOTE}`,
      },
      {
        name: "Song of Victory",
        level: 14,
        description: `While bladesinging, add Intelligence to melee weapon damage. ${SUBCLASS_STUB_NOTE}`,
      },
    ],
  },
];

async function seedSupplementalSubclasses() {
  console.log("Seeding supplemental subclasses (PHB-style, non-SRD)...");
  let added = 0;
  let skipped = 0;

  const classSlugs = new Set(
    (await prisma.class.findMany({ select: { slug: true } })).map((c) => c.slug),
  );

  for (const def of SUPPLEMENTAL_SUBCLASSES) {
    if (!classSlugs.has(def.classSlug)) {
      console.log(`  [supplemental subclasses] skip ${def.slug} — class '${def.classSlug}' not in DB`);
      skipped++;
      continue;
    }

    const bySlug = await prisma.subclass.findUnique({ where: { slug: def.slug } });
    if (bySlug) {
      skipped++;
      continue;
    }

    const byName = await prisma.subclass.findFirst({
      where: {
        classSlug: def.classSlug,
        name: { equals: def.name, mode: "insensitive" },
      },
    });
    if (byName) {
      console.log(`  [supplemental subclasses] skip ${def.slug} — '${def.name}' already exists as ${byName.slug}`);
      skipped++;
      continue;
    }

    await prisma.subclass.create({
      data: {
        slug: def.slug,
        classSlug: def.classSlug,
        name: def.name,
        features: { create: def.features },
      },
    });
    added++;
  }

  console.log(`  [supplemental subclasses] added ${added}, skipped ${skipped}`);
}

// ── Backgrounds ───────────────────────────────────────────────────
async function seedBackgrounds() {
  console.log("Seeding backgrounds...");
  const backgrounds = await fetchAll("backgrounds");
  for (const b of backgrounds) {
    const bgSlug = b.slug ?? slug(b.name);
    await prisma.background.upsert({
      where:  { slug: bgSlug },
      create: {
        slug: bgSlug, name: b.name,
        skillProficiencies: (b.skill_proficiencies ?? "").split(",").map((s: string) => slug(s.trim())).filter(Boolean),
        toolProficiencies:  [],
        languages:          0,
        equipment:          b.equipment ?? "",
        feature: { name: b.feature ?? "Feature", description: b.feature_desc ?? "" },
        suggestedTraits: [],
        suggestedIdeals: [],
        suggestedBonds:  [],
        suggestedFlaws:  [],
      },
      update: { name: b.name },
    });
  }
}

// ── Spells ────────────────────────────────────────────────────────
async function seedSpells() {
  console.log("Seeding spells...");
  const spells = await fetchAll("spells");
  const CHUNK = 50;
  for (let i = 0; i < spells.length; i += CHUNK) {
    await Promise.all(spells.slice(i, i + CHUNK).map((s: any) => {
      const spellSlug = s.slug ?? slug(s.name);
      return prisma.spell.upsert({
        where:  { slug: spellSlug },
        create: {
          slug:          spellSlug,
          name:          s.name,
          level:         s.spell_level  ?? 0,
          school:        s.school ?? "Unknown",
          castingTime:   s.casting_time ?? "1 action",
          range:         s.range        ?? "Self",
          components: {
            verbal:    (s.components ?? "").includes("V"),
            somatic:   (s.components ?? "").includes("S"),
            material:  (s.components ?? "").includes("M"),
            materials: s.material ?? "",
          },
          duration:      s.duration      ?? "Instantaneous",
          concentration: coerceOpen5eBool(s.concentration),
          ritual:        coerceOpen5eBool(s.ritual),
          description:   s.desc          ?? "",
          higherLevels:  s.higher_level  || null,
          classes:       (s.dnd_class ?? "").split(",").map((c: string) => slug(c.trim())).filter(Boolean),
        },
        update: { name: s.name },
      });
    }));
    console.log(`  [spells] ${Math.min(i + CHUNK, spells.length)}/${spells.length} saved...`);
  }
}

// ── Items ─────────────────────────────────────────────────────────
async function seedItems() {
  console.log("Seeding items...");
  const [weapons, armor, gear, magic] = await Promise.all([
    fetchAll("weapons").catch(() => { console.log("  weapons endpoint unavailable, skipping"); return []; }),
    fetchAll("armor").catch(()   => { console.log("  armor endpoint unavailable, skipping");   return []; }),
    fetchEquipmentFromV2Items().catch(() => {
      console.log("  v2/items (equipment) unavailable, skipping");
      return [];
    }),
    fetchAll("magicitems").catch(()=> { console.log("  magicitems unavailable, skipping");      return []; }),
  ]);

  const all = [
    ...weapons.map((i: any) => ({ ...i, _cat: "weapon" })),
    ...armor.map((i: any)   => ({ ...i, _cat: "armor" })),
    ...gear,
    ...magic.map((i: any)   => ({ ...i, _cat: "magic" })),
  ];

  const CHUNK = 50;
  for (let i = 0; i < all.length; i += CHUNK) {
    await Promise.all(all.slice(i, i + CHUNK).map((item: any) => {
      const itemSlug = item.slug ?? slug(item.name);
      const row = item as Record<string, unknown>;
      const armorClassVal = parseOpen5eBaseAc(row);
      const costVal =
        parseOpen5eItemCost(item.cost) ??
        (item.cost &&
        typeof item.cost === "object" &&
        item.cost.quantity != null &&
        item.cost.unit != null
          ? { quantity: Number(item.cost.quantity), unit: String(item.cost.unit) }
          : undefined);
      const strReq = parseOpen5eStrengthReq(row);
      const weightVal = parseOpen5eItemWeight(item.weight);
      return prisma.item.upsert({
        where:  { slug: itemSlug },
        create: {
          slug:        itemSlug,
          name:        item.name,
          category:    item._cat,
          subcategory: item.category ?? item.weapon_category ?? null,
          description: item.desc ?? "",
          damageDice:  item.damage?.damage_dice ?? item.damage_dice ?? null,
          damageType:  item.damage?.damage_type?.name ?? item.damage_type ?? null,
          weaponRange: item.range ? { normal: item.range.normal ?? 0, long: item.range.long ?? 0 } : undefined,
          properties:  normalizeItemProperties(item.properties),
          armorClass:  armorClassVal,
          stealthDis:  coerceOpen5eBool(item.stealth_disadvantage),
          strengthReq: strReq,
          weight:      weightVal,
          cost:        costVal,
          magical:              item._cat === "magic",
          requiresAttunement:   (item.requires_attunement ?? "") === "requires attunement",
          attunementRequirement: null,
          source:      String(item.document__title ?? item._source ?? "SRD"),
        },
        update: {
          name:        item.name,
          source:      String(item.document__title ?? item._source ?? "SRD"),
          subcategory: item.category ?? item.weapon_category ?? null,
          description: item.desc ?? "",
          damageDice:  item.damage?.damage_dice ?? item.damage_dice ?? null,
          damageType:  item.damage?.damage_type?.name ?? item.damage_type ?? null,
          weaponRange: item.range
            ? { normal: item.range.normal ?? 0, long: item.range.long ?? 0 }
            : Prisma.DbNull,
          properties:  normalizeItemProperties(item.properties),
          armorClass:  armorClassVal,
          stealthDis:  coerceOpen5eBool(item.stealth_disadvantage),
          strengthReq: strReq,
          weight:      weightVal,
          cost:        costVal ?? Prisma.DbNull,
          magical:     item._cat === "magic",
          requiresAttunement: (item.requires_attunement ?? "") === "requires attunement",
        },
      });
    }));
  }
  console.log(`  [items] ${all.length} total saved`);
}

// ── Feats ─────────────────────────────────────────────────────────
async function seedFeats() {
  console.log("Seeding feats...");
  const feats = await fetchAll("feats");
  for (const f of feats) {
    const featSlug = f.slug ?? slug(f.name);
    await prisma.feat.upsert({
      where:  { slug: featSlug },
      create: { slug: featSlug, name: f.name, prerequisite: f.prerequisite || null, description: f.desc ?? "" },
      update: { name: f.name },
    });
  }
}

// ── Conditions ────────────────────────────────────────────────────
async function seedConditions() {
  console.log("Seeding conditions (hardcoded from PHB)...");
  const conditions = [
    { slug: "blinded",       name: "Blinded",       description: "A blinded creature can't see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage." },
    { slug: "charmed",       name: "Charmed",       description: "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects. The charmer has advantage on any ability check to interact socially with the creature." },
    { slug: "deafened",      name: "Deafened",      description: "A deafened creature can't hear and automatically fails any ability check that requires hearing." },
    { slug: "exhaustion",    name: "Exhaustion",    description: "Exhaustion is measured in six levels. Effects are cumulative." },
    { slug: "frightened",    name: "Frightened",    description: "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight." },
    { slug: "grappled",      name: "Grappled",      description: "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed." },
    { slug: "incapacitated", name: "Incapacitated", description: "An incapacitated creature can't take actions or reactions." },
    { slug: "invisible",     name: "Invisible",     description: "An invisible creature is impossible to see without the aid of magic or a special sense." },
    { slug: "paralyzed",     name: "Paralyzed",     description: "A paralyzed creature is incapacitated and can't move or speak. The creature automatically fails Strength and Dexterity saving throws." },
    { slug: "petrified",     name: "Petrified",     description: "A petrified creature is transformed into a solid inanimate substance. It is incapacitated, can't move or speak, and is unaware of its surroundings." },
    { slug: "poisoned",      name: "Poisoned",      description: "A poisoned creature has disadvantage on attack rolls and ability checks." },
    { slug: "prone",         name: "Prone",         description: "A prone creature's only movement option is to crawl. The creature has disadvantage on attack rolls. Attack rolls against it have advantage if the attacker is within 5 feet." },
    { slug: "restrained",    name: "Restrained",    description: "A restrained creature's speed becomes 0. Attack rolls against it have advantage, and its attack rolls have disadvantage." },
    { slug: "stunned",       name: "Stunned",       description: "A stunned creature is incapacitated, can't move, and can speak only falteringly. Attack rolls against it have advantage." },
    { slug: "unconscious",   name: "Unconscious",   description: "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings. Attack rolls against it have advantage and any hit within 5 feet is a critical hit." },
  ];
  for (const c of conditions) {
    await prisma.condition.upsert({ where: { slug: c.slug }, create: c, update: c });
  }
}

// ── Monsters ──────────────────────────────────────────────────────
export async function seedMonsters() {
  console.log("Seeding monsters...");
  const monsters = await fetchAll("monsters");
  const CHUNK = 30;
  for (let i = 0; i < monsters.length; i += CHUNK) {
    await Promise.all(monsters.slice(i, i + CHUNK).map((m: any) => {
      const monsterSlug = m.slug ?? slug(m.name);
      return prisma.monster.upsert({
        where:  { slug: monsterSlug },
        create: {
          slug:                monsterSlug,
          name:                m.name,
          size:                m.size        ?? "Medium",
          type:                m.type        ?? "beast",
          subtype:             m.subtype     || null,
          alignment:           m.alignment   ?? "unaligned",
          armorClass:          m.armor_class ?? 10,
          armorDesc:           m.armor_desc  || null,
          hitPoints:           m.hit_points  ?? 1,
          hitDice:             m.hit_dice    ?? "1d8",
          speed:               m.speed       ?? { walk: 30 },
          strength:            m.strength    ?? 10,
          dexterity:           m.dexterity   ?? 10,
          constitution:        m.constitution ?? 10,
          intelligence:        m.intelligence ?? 10,
          wisdom:              m.wisdom      ?? 10,
          charisma:            m.charisma    ?? 10,
          strengthSave:        m.strength_save    ?? null,
          dexteritySave:       m.dexterity_save   ?? null,
          constitutionSave:    m.constitution_save ?? null,
          intelligenceSave:    m.intelligence_save ?? null,
          wisdomSave:          m.wisdom_save      ?? null,
          charismaSave:        m.charisma_save    ?? null,
          skills:              m.skills    ?? {},
          damageResistances:   m.damage_resistances   || null,
          damageImmunities:    m.damage_immunities    || null,
          conditionImmunities: m.condition_immunities || null,
          senses:              m.senses    ?? "",
          languages:           m.languages ?? "",
          challengeRating:     String(m.challenge_rating ?? "0"),
          xp:                  m.xp        ?? 0,
          specialAbilities:    m.special_abilities ?? undefined,
          actions:             m.actions   ?? [],
          reactions:           m.reactions ?? undefined,
          legendaryActions:    m.legendary_actions ?? undefined,
        },
        update: { name: m.name },
      });
    }));
    console.log(`  [monsters] ${Math.min(i + CHUNK, monsters.length)}/${monsters.length} saved...`);
  }
}

// ── Main ──────────────────────────────────────────────────────────
export async function runSeed() {
  console.log("Starting D&D 5e SRD seed (Open5e v1)...");
  const start = Date.now();
  const errors: string[] = [];

  const run = async (name: string, fn: () => Promise<void>) => {
    const t = Date.now();
    process.stdout.write(`\n[${name}] Starting...`);
    try {
      await fn();
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      console.log(`\n[${name}] ✓ Done in ${secs}s`);
    } catch (e) {
      console.log(`\n[${name}] ✗ Skipped: ${e}`);
      errors.push(name);
    }
  };

  await run("races",       seedRaces);
  await run("races-extra", seedSupplementalRaces);
  await run("races-subraces-extra", seedSupplementalSubraces);
  await run("classes",     seedClasses);
  await run("subclasses",  seedSubclasses);
  await run("subclasses-extra", seedSupplementalSubclasses);
  await run("backgrounds", seedBackgrounds);
  await run("spells",      seedSpells);
  await run("items",       seedItems);
  await run("feats",       seedFeats);
  await run("conditions",  seedConditions);
  await run("monsters",    seedMonsters);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (errors.length > 0) {
    console.log(`Seed finished in ${elapsed}s with skipped sections: ${errors.join(", ")}`);
  } else {
    console.log(`Seed complete in ${elapsed}s`);
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  runSeed().catch(console.error);
}
