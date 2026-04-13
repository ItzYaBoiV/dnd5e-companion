/**
 * PHB/SRD-style starting equipment presets for character creation.
 * Resolves item slugs against your DB (with alternates); falls back to custom names.
 */

import type { StartingInventoryDraftRow } from "@/types/dnd";

export type KitLine =
  | {
      itemSlug: string;
      alternates?: string[];
      quantity?: number;
    }
  | { customName: string; quantity?: number };

export type StartingEquipmentKit = {
  id: string;
  label: string;
  branches?: string;
  lines: KitLine[];
};

export function gear(slug: string, alternates?: string[], quantity = 1): KitLine {
  return alternates?.length ? { itemSlug: slug, alternates, quantity } : { itemSlug: slug, quantity };
}

export function named(name: string, quantity = 1): KitLine {
  return { customName: name, quantity };
}

function buildWizardKits(): StartingEquipmentKit[] {
  const weapons: { slug: string; label: string }[] = [
    { slug: "quarterstaff", label: "Staff" },
    { slug: "dagger", label: "Dagger" },
  ];
  const focusA: KitLine[] = [gear("component-pouch", ["component-pouch-srd"])];
  const focusB: KitLine[] = [gear("crystal", ["arcane-focus-crystal", "orb", "rod", "wand"])];
  const packA: KitLine[] = [gear("scholars-pack", ["scholar-s-pack", "scholar's-pack"])];
  const packB: KitLine[] = [gear("explorers-pack", ["explorer-s-pack", "explorer's-pack"])];

  const kits: StartingEquipmentKit[] = [];
  for (const w of weapons) {
    for (const f of [focusA, focusB]) {
      for (const p of [packA, packB]) {
        const fi = f === focusA ? "a" : "b";
        const pi = p === packA ? "a" : "b";
        const wi = w.slug === "quarterstaff" ? "a" : "b";
        kits.push({
          id: `wiz-${w.slug}-${fi === "a" ? "pouch" : "focus"}-${pi === "a" ? "scholar" : "explorer"}`,
          label: `${w.label} · ${f === focusA ? "component pouch" : "arcane focus"} · ${p === packA ? "scholar's pack" : "explorer's pack"}`,
          branches: `(${wi})(${fi})(${pi})`,
          lines: [named("Spellbook", 1), gear(w.slug), ...f, ...p],
        });
      }
    }
  }
  return kits;
}

const FIGHTER_KITS: StartingEquipmentKit[] = [
  {
    id: "fig-chain-sword-board-cross-explorer",
    label: "Chain mail · longsword & shield · light crossbow & bolts · explorer's pack",
    lines: [
      gear("chain-mail", ["chain-mail-armor", "chain-shirt"]),
      gear("longsword"),
      gear("shield", ["wooden-shield", "shield-wood"]),
      gear("light-crossbow", ["crossbow-light"]),
      gear("crossbow-bolt", ["bolt", "crossbow-bolts"], 20),
      gear("explorers-pack"),
    ],
  },
  {
    id: "fig-leather-two-longswords-handaxes-explorer",
    label: "Leather · 2 longswords · 2 handaxes · explorer's pack",
    lines: [
      gear("leather-armor", ["leather"]),
      gear("longsword"),
      gear("longsword"),
      gear("handaxe"),
      gear("handaxe"),
      gear("explorers-pack"),
    ],
  },
  {
    id: "fig-chain-great-cross-dungeon",
    label: "Chain mail · greatsword · light crossbow & bolts · dungeoneer's pack",
    lines: [
      gear("chain-mail", ["chain-shirt"]),
      gear("greatsword"),
      gear("light-crossbow", ["crossbow-light"]),
      gear("crossbow-bolt", ["bolt"], 20),
      gear("dungeoneers-pack", ["dungeoneer-s-pack"]),
    ],
  },
  {
    id: "fig-leather-longbow-handaxes-explorer",
    label: "Leather · longbow & arrows · 2 handaxes · explorer's pack",
    lines: [
      gear("leather-armor", ["leather"]),
      gear("longbow"),
      gear("arrow", ["arrows"], 20),
      gear("handaxe"),
      gear("handaxe"),
      gear("explorers-pack"),
    ],
  },
];

const ROGUE_KITS: StartingEquipmentKit[] = [
  {
    id: "rogue-rapier-shortbow-burglar",
    label: "Rapier · shortbow & arrows · burglar's pack · leather · 2 daggers · thieves' tools",
    lines: [
      gear("rapier"),
      gear("shortbow"),
      gear("arrow", ["arrows"], 20),
      gear("burglars-pack", ["burglar-s-pack"]),
      gear("leather-armor", ["leather"]),
      gear("dagger"),
      gear("dagger"),
      gear("thieves-tools"),
    ],
  },
  {
    id: "rogue-rapier-shortsword-dungeon",
    label: "Rapier · shortsword · dungeoneer's pack · leather · 2 daggers · thieves' tools",
    lines: [
      gear("rapier"),
      gear("shortsword"),
      gear("dungeoneers-pack"),
      gear("leather-armor"),
      gear("dagger"),
      gear("dagger"),
      gear("thieves-tools"),
    ],
  },
  {
    id: "rogue-shortsword-shortbow-explorer",
    label: "Shortsword · shortbow & arrows · explorer's pack · leather · 2 daggers · thieves' tools",
    lines: [
      gear("shortsword"),
      gear("shortbow"),
      gear("arrow", ["arrows"], 20),
      gear("explorers-pack"),
      gear("leather-armor"),
      gear("dagger"),
      gear("dagger"),
      gear("thieves-tools"),
    ],
  },
];

const CLERIC_KITS: StartingEquipmentKit[] = [
  {
    id: "cleric-mace-shield-scale-priest",
    label: "Mace · shield · scale mail · priest's pack · holy symbol",
    lines: [
      gear("mace"),
      gear("shield"),
      gear("scale-mail", ["scale-mail-armor"]),
      gear("priests-pack", ["priest-s-pack"]),
      gear("holy-symbol-amulet", ["holy-symbol"]),
    ],
  },
  {
    id: "cleric-warhammer-leather-explorer",
    label: "Warhammer · shield · leather · explorer's pack · holy symbol",
    lines: [
      gear("warhammer"),
      gear("shield"),
      gear("leather-armor"),
      gear("explorers-pack"),
      gear("holy-symbol-amulet", ["holy-symbol"]),
    ],
  },
];

const BARBARIAN_KITS: StartingEquipmentKit[] = [
  {
    id: "barb-greataxe-handaxes-explorer",
    label: "Greataxe · 2 handaxes · explorer's pack · 4 javelins",
    lines: [gear("greataxe"), gear("handaxe"), gear("handaxe"), gear("explorers-pack"), gear("javelin", undefined, 4)],
  },
  {
    id: "barb-flail-handaxes-explorer",
    label: "Flail · 2 handaxes · explorer's pack · 4 javelins",
    lines: [gear("flail"), gear("handaxe"), gear("handaxe"), gear("explorers-pack"), gear("javelin", undefined, 4)],
  },
  {
    id: "barb-greataxe-club-explorer",
    label: "Greataxe · club · explorer's pack · 4 javelins",
    lines: [gear("greataxe"), gear("club"), gear("explorers-pack"), gear("javelin", undefined, 4)],
  },
];

const BARD_KITS: StartingEquipmentKit[] = [
  {
    id: "bard-rapier-diplomat",
    label: "Rapier · diplomat's pack · lute · leather · dagger",
    lines: [gear("rapier"), gear("diplomats-pack", ["diplomat-s-pack"]), gear("lute"), gear("leather-armor"), gear("dagger")],
  },
  {
    id: "bard-longsword-entertainer",
    label: "Longsword · entertainer's pack · lute · leather · dagger",
    lines: [gear("longsword"), gear("entertainers-pack", ["entertainer-s-pack"]), gear("lute"), gear("leather-armor"), gear("dagger")],
  },
];

const DRUID_KITS: StartingEquipmentKit[] = [
  {
    id: "druid-scimitar-shield-explorer",
    label: "(a) Scimitar · (a) shield · leather · sprig · explorer's pack",
    branches: "(weapon a)(armor a)",
    lines: [
      gear("scimitar"),
      gear("shield", ["wooden-shield", "shield"]),
      gear("leather-armor", ["leather"]),
      gear("sprig-of-mistletoe", ["druidic-focus", "mistletoe", "totem"]),
      gear("explorers-pack", ["explorer-s-pack"]),
    ],
  },
  {
    id: "druid-club-shield-explorer",
    label: "(b) Club · (a) shield · leather · sprig · explorer's pack",
    branches: "(weapon b melee)(armor a)",
    lines: [
      gear("club"),
      gear("shield", ["wooden-shield"]),
      gear("leather-armor", ["leather"]),
      gear("sprig-of-mistletoe", ["druidic-focus", "mistletoe"]),
      gear("explorers-pack"),
    ],
  },
  {
    id: "druid-scimitar-shortbow-explorer",
    label: "(a) Scimitar · (b) shortbow & arrows · leather · sprig · explorer's pack",
    branches: "(weapon a)(armor b ranged)",
    lines: [
      gear("scimitar"),
      gear("shortbow"),
      gear("arrow", ["arrows"], 20),
      gear("leather-armor", ["leather"]),
      gear("sprig-of-mistletoe", ["druidic-focus", "mistletoe"]),
      gear("explorers-pack"),
    ],
  },
  {
    id: "druid-quarterstaff-shield-explorer",
    label: "(b) Quarterstaff · (a) shield · leather · sprig · explorer's pack",
    branches: "(weapon b melee)(armor a)",
    lines: [
      gear("quarterstaff"),
      gear("shield", ["wooden-shield"]),
      gear("leather-armor", ["leather"]),
      gear("sprig-of-mistletoe", ["druidic-focus", "mistletoe"]),
      gear("explorers-pack"),
    ],
  },
  {
    id: "druid-dagger-shield-explorer",
    label: "(b) Dagger · (a) shield · leather · sprig · explorer's pack",
    branches: "(weapon b melee)(armor a)",
    lines: [
      gear("dagger"),
      gear("shield", ["wooden-shield"]),
      gear("leather-armor", ["leather"]),
      gear("sprig-of-mistletoe", ["druidic-focus", "mistletoe"]),
      gear("explorers-pack"),
    ],
  },
  {
    id: "druid-quarterstaff-explorer",
    label: "(b) Quarterstaff only path · leather · sprig · explorer's pack (no shield / no scimitar branch)",
    lines: [
      gear("quarterstaff"),
      gear("leather-armor", ["leather"]),
      gear("sprig-of-mistletoe", ["druidic-focus", "mistletoe"]),
      gear("explorers-pack"),
    ],
  },
];

const RANGER_KITS: StartingEquipmentKit[] = [
  {
    id: "ranger-scale-two-shortswords-explorer-bow",
    label: "Scale mail · 2 shortswords · explorer's pack · longbow & arrows",
    lines: [
      gear("scale-mail", ["scale-mail-armor"]),
      gear("shortsword"),
      gear("shortsword"),
      gear("explorers-pack"),
      gear("longbow"),
      gear("arrow", ["arrows"], 20),
    ],
  },
  {
    id: "ranger-leather-rapier-explorer-bow",
    label: "Leather · rapier · explorer's pack · longbow & arrows",
    lines: [gear("leather-armor"), gear("rapier"), gear("explorers-pack"), gear("longbow"), gear("arrow", ["arrows"], 20)],
  },
];

const PALADIN_KITS: StartingEquipmentKit[] = [
  {
    id: "paladin-maul-shield-javelins-priest",
    label: "Maul · shield · 5 javelins · priest's pack · holy symbol",
    lines: [gear("maul"), gear("shield"), gear("javelin", undefined, 5), gear("priests-pack", ["priest-s-pack"]), gear("holy-symbol-amulet")],
  },
  {
    id: "paladin-longsword-shield-explorer",
    label: "Longsword · shield · explorer's pack · holy symbol",
    lines: [gear("longsword"), gear("shield"), gear("explorers-pack"), gear("holy-symbol-amulet")],
  },
];

const MONK_KITS: StartingEquipmentKit[] = [
  {
    id: "monk-shortsword-darts-dungeon",
    label: "Shortsword · 10 darts · dungeoneer's pack · 10 gp",
    lines: [gear("shortsword"), gear("dart", undefined, 10), gear("dungeoneers-pack"), named("Gold pieces", 10)],
  },
  {
    id: "monk-spear-darts-explorer",
    label: "Spear · 10 darts · explorer's pack · 10 gp",
    lines: [gear("spear"), gear("dart", undefined, 10), gear("explorers-pack"), named("Gold pieces", 10)],
  },
];

const SORCERER_KITS: StartingEquipmentKit[] = [
  {
    id: "sorc-crossbow-daggers-pouch-dungeon",
    label: "Light crossbow & bolts · 2 daggers · component pouch · dungeoneer's pack",
    lines: [
      gear("light-crossbow", ["crossbow-light"]),
      gear("crossbow-bolt", ["bolt"], 20),
      gear("dagger"),
      gear("dagger"),
      gear("component-pouch"),
      gear("dungeoneers-pack"),
    ],
  },
  {
    id: "sorc-staff-daggers-focus-explorer",
    label: "Quarterstaff · 2 daggers · arcane focus · explorer's pack",
    lines: [gear("quarterstaff"), gear("dagger"), gear("dagger"), gear("crystal", ["arcane-focus-crystal"]), gear("explorers-pack")],
  },
];

const WARLOCK_KITS: StartingEquipmentKit[] = [
  {
    id: "lock-crossbow-pouch-scholar",
    label: "Light crossbow & bolts · component pouch · scholar's pack · leather · dagger",
    lines: [
      gear("light-crossbow", ["crossbow-light"]),
      gear("crossbow-bolt", ["bolt"], 20),
      gear("component-pouch"),
      gear("scholars-pack", ["scholar-s-pack"]),
      gear("leather-armor"),
      gear("dagger"),
    ],
  },
  {
    id: "lock-staff-focus-dungeon",
    label: "Quarterstaff · arcane focus · dungeoneer's pack · leather · dagger",
    lines: [gear("quarterstaff"), gear("crystal", ["arcane-focus-crystal"]), gear("dungeoneers-pack"), gear("leather-armor"), gear("dagger")],
  },
];

const CLASS_KITS: Record<string, StartingEquipmentKit[]> = {
  wizard: buildWizardKits(),
  fighter: FIGHTER_KITS,
  rogue: ROGUE_KITS,
  cleric: CLERIC_KITS,
  barbarian: BARBARIAN_KITS,
  bard: BARD_KITS,
  druid: DRUID_KITS,
  ranger: RANGER_KITS,
  paladin: PALADIN_KITS,
  monk: MONK_KITS,
  sorcerer: SORCERER_KITS,
  warlock: WARLOCK_KITS,
};

/** Narrative background gear — mostly custom names so missing SRD slugs do not block you */
export const BACKGROUND_STARTING_LINES: Record<string, KitLine[]> = {
  acolyte: [
    named("Holy symbol"),
    named("Prayer book"),
    named("Incense (5 sticks)", 5),
    named("Vestments"),
    named("Common clothes"),
    named("Belt pouch"),
  ],
  criminal: [named("Crowbar"), named("Dark common clothes")],
  charlatan: [named("Fine clothes"), named("Disguise kit")],
  entertainer: [named("Musical instrument (favor of your choice)"), named("Costume clothes")],
  "folk-hero": [named("Artisan's tools"), named("Shovel"), named("Iron pot"), named("Common clothes")],
  "guild-artisan": [named("Artisan's tools"), named("Letter of introduction from guild")],
  hermit: [named("Scroll case of notes"), named("Winter blanket"), named("Common clothes"), named("Herbalism kit")],
  noble: [named("Fine clothes"), named("Signet ring"), named("Scroll of pedigree")],
  outlander: [named("Staff"), named("Hunting trap"), named("Trophy from an animal"), named("Traveler's clothes")],
  sage: [named("Bottle of ink"), named("Ink pen"), named("Small knife"), named("Letter from dead colleague")],
  sailor: [named("Belaying pin (club)"), named("50 ft silk rope"), named("Lucky charm"), named("Common clothes")],
  soldier: [named("Insignia of rank"), named("Trophy from fallen enemy"), named("Bone dice"), named("Common clothes")],
  urchin: [named("Small knife"), named("Map of home city"), named("Pet mouse"), named("Token of parents"), named("Common clothes")],
};

/** Match kits when API slugs vary (e.g. druid-srd). */
export function normalizeKitSlug(slug: string): string {
  if (!slug || typeof slug !== "string") return "";
  const t = slug.trim().toLowerCase();
  return t.replace(/-srd$/i, "").replace(/^srd-/i, "").replace(/\/.*$/, "");
}

const DOC_PREFIX = /^srd-\d{4}-/i;
const SRD_PREFIX = /^srd-/i;

/** Strip Open5e document key prefixes for fuzzy slug / name comparison. */
export function stripOpen5eItemKeyPrefix(slug: string): string {
  let s = slug.trim().toLowerCase();
  s = s.replace(DOC_PREFIX, "");
  s = s.replace(SRD_PREFIX, "");
  return s;
}

/**
 * Slug candidates to try against GET /items/:slug (Open5e seed uses v1 weapons/armor slugs,
 * v2 gear as srd-2024-* and srd-* hyphenated keys).
 */
export function expandKitSlugAttempts(slug: string): string[] {
  const t = slug.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const x = s.trim().toLowerCase();
    if (x && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  };
  push(t);
  if (!DOC_PREFIX.test(t)) push(`srd-2024-${t}`);
  if (!/^srd-/i.test(t)) push(`srd-${t}`);
  // v1 armor name "Leather" → slug `leather`, not leather-armor
  if (t === "leather-armor") {
    push("leather");
    push("srd-leather");
    push("srd-2024-leather");
  }
  return out;
}

/** Single place for inventory row titles in creation UI + review. */
export function startingInventoryRowLabel(row: StartingInventoryDraftRow): string {
  if (row.customName?.trim()) return row.customName.trim();
  if (row.displayName?.trim()) return row.displayName.trim();
  if (row.itemSlug) {
    return row.itemSlug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return "New item";
}

function searchQueriesForKitSlug(slug: string): string[] {
  const t = slug.trim().toLowerCase();
  const spaced = t.replace(/-/g, " ").trim();
  const tail = stripOpen5eItemKeyPrefix(t);
  const tailSpaced = tail.replace(/-/g, " ").trim();
  const qs = new Set<string>();
  if (spaced.length >= 2) qs.add(spaced);
  if (tailSpaced.length >= 2 && tailSpaced !== spaced) qs.add(tailSpaced);
  if (t.includes("diplomat")) qs.add("diplomat");
  if (t.includes("explorer")) qs.add("explorer");
  if (t.includes("entertainer")) qs.add("entertainer");
  if (t.includes("dungeoneer")) qs.add("dungeoneer");
  if (t.includes("scholar")) qs.add("scholar");
  if (t.includes("burglar")) qs.add("burglar");
  if (t.includes("priest") && t.includes("pack")) qs.add("priest");
  if (t === "leather-armor" || t.endsWith("leather-armor")) qs.add("leather");
  return [...qs];
}

const BACKGROUND_KIT_ALIASES: Record<string, keyof typeof BACKGROUND_STARTING_LINES> = {
  artisan: "guild-artisan",
};

export function getClassStartingKits(classSlug: string): StartingEquipmentKit[] {
  const n = normalizeKitSlug(classSlug);
  return CLASS_KITS[classSlug] ?? CLASS_KITS[n] ?? [];
}

export function getBackgroundKitLines(backgroundSlug: string): KitLine[] | null {
  const n = normalizeKitSlug(backgroundSlug);
  const aliasKey = BACKGROUND_KIT_ALIASES[n];
  const lines =
    BACKGROUND_STARTING_LINES[backgroundSlug] ??
    BACKGROUND_STARTING_LINES[n] ??
    (aliasKey ? BACKGROUND_STARTING_LINES[aliasKey] : undefined);
  return lines?.length ? lines : null;
}

type ItemFetch = (slug: string) => Promise<{ slug: string; name: string } | null>;
/** Search items by text (e.g. name); used when GET /items/:slug misses. */
export type ItemSearch = (query: string) => Promise<{ slug: string; name: string }[]>;

export type ResolvedKitLine = {
  row: StartingInventoryDraftRow;
  /** Set when no SRD item matched for an itemSlug line */
  missedSlug?: string;
};

function normAlnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Pick the best item from search results for a kit slug like "rapier" or "crossbow-bolt".
 */
export function pickBestItemMatch(
  wantedSlug: string,
  items: { slug: string; name: string }[],
): { slug: string } | null {
  if (!items.length) return null;
  const want = normAlnum(wantedSlug);
  const wantTail = normAlnum(stripOpen5eItemKeyPrefix(wantedSlug));
  const wantSpaced = wantedSlug.replace(/-/g, " ").toLowerCase().trim();
  let best: { slug: string; name: string } | null = null;
  let bestScore = 0;
  for (const it of items) {
    const slugLc = it.slug.toLowerCase();
    const sNorm = normAlnum(it.slug);
    const sTail = normAlnum(stripOpen5eItemKeyPrefix(it.slug));
    const nNorm = normAlnum(it.name);
    const nameLc = it.name.toLowerCase();
    let score = 0;
    if (slugLc === wantedSlug.toLowerCase()) score = 1000;
    else if (sNorm === want) score = 950;
    else if (sTail === want || sNorm === wantTail || sTail === wantTail) score = 920;
    else if (nNorm === want) score = 900;
    else if (nNorm === wantTail) score = 880;
    else if (nameLc === wantSpaced) score = 870;
    else if (nameLc.startsWith(wantSpaced) || wantSpaced.startsWith(nameLc)) score = 750;
    else if (nNorm.includes(want) || want.includes(nNorm)) score = 600;
    else if (nNorm.includes(wantTail) || wantTail.includes(nNorm)) score = 580;
    else if (nameLc.includes(wantSpaced)) score = 400;
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  if (bestScore >= 400 && best) return { slug: best.slug };
  if (bestScore >= 300 && best && items.length <= 8) return { slug: best.slug };
  return null;
}

/**
 * Resolve one kit line to a draft row (slug API, alternates, then optional name search).
 */
export async function resolveKitLine(
  line: KitLine,
  fetchItem: ItemFetch,
  searchItems?: ItemSearch,
): Promise<ResolvedKitLine> {
  if ("customName" in line) {
    return { row: { customName: line.customName, quantity: line.quantity ?? 1 } };
  }
  const qty = line.quantity ?? 1;
  const baseSlugs = [line.itemSlug, ...(line.alternates ?? [])];
  const trySlugs: string[] = [];
  const seenTry = new Set<string>();
  for (const s of baseSlugs) {
    for (const c of expandKitSlugAttempts(s)) {
      if (!seenTry.has(c)) {
        seenTry.add(c);
        trySlugs.push(c);
      }
    }
  }
  for (const s of trySlugs) {
    const item = await fetchItem(s);
    if (item) return { row: { itemSlug: item.slug, displayName: item.name, quantity: qty } };
  }
  if (searchItems) {
    const tried = new Set<string>();
    for (const s of trySlugs) {
      for (const q of searchQueriesForKitSlug(s)) {
        if (q.length < 2 || tried.has(q)) continue;
        tried.add(q);
        const hits = await searchItems(q);
        const match = pickBestItemMatch(line.itemSlug, hits);
        if (match) {
          const picked = hits.find((h) => h.slug === match.slug);
          return {
            row: {
              itemSlug: match.slug,
              displayName: picked?.name,
              quantity: qty,
            },
          };
        }
      }
    }
  }
  return {
    row: {
      customName: line.itemSlug
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
      quantity: qty,
    },
    missedSlug: line.itemSlug,
  };
}

export async function resolveKitToDraft(
  lines: KitLine[],
  fetchItem: ItemFetch,
  searchItems?: ItemSearch,
): Promise<{ rows: StartingInventoryDraftRow[]; missedSlugs: string[] }> {
  const rows: StartingInventoryDraftRow[] = [];
  const missedSlugs: string[] = [];
  for (const line of lines) {
    const { row, missedSlug } = await resolveKitLine(line, fetchItem, searchItems);
    rows.push(row);
    if (missedSlug) missedSlugs.push(missedSlug);
  }
  return { rows, missedSlugs };
}
