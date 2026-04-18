import { prisma } from "../config/database";
import { NotFoundError } from "../middleware/errorHandler";

// ── CR conversion (stored as String: "1/4", "1/2", "1", "10" etc.) ──
export function parseCr(cr: string): number {
  if (cr === "1/8") return 0.125;
  if (cr === "1/4") return 0.25;
  if (cr === "1/2") return 0.5;
  return parseFloat(cr) || 0;
}

// ── List with filters ──────────────────────────────────────────────
export async function listMonsters(filters: {
  search?: string;
  type?:   string;
  cr?:     string;
  size?:   string;
}) {
  const where: Record<string, unknown> = {};
  if (filters.search) where["name"] = { contains: filters.search, mode: "insensitive" };
  if (filters.type)   where["type"] = { contains: filters.type,   mode: "insensitive" };
  if (filters.cr)     where["challengeRating"] = filters.cr;
  if (filters.size)   where["size"] = { equals: filters.size, mode: "insensitive" };

  return prisma.monster.findMany({
    where,
    select: {
      slug: true, name: true, type: true, subtype: true,
      size: true, challengeRating: true, xp: true,
      hitPoints: true, armorClass: true, alignment: true,
    },
    orderBy: [{ name: "asc" }],
  });
}

// ── Single monster ────────────────────────────────────────────────
export async function getMonster(slug: string) {
  const m = await prisma.monster.findUnique({ where: { slug } });
  if (!m) throw new NotFoundError("Monster");
  return m;
}

function slugifyDisplayName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "unknown";
}

/** Best-effort name → SRD slug for Forge / importers (one round-trip per unique name). */
export async function resolveMonstersByNames(names: string[]) {
  const unique = [...new Set(names.map((n) => String(n ?? "").trim()).filter(Boolean))];
  const out: {
    name: string;
    slug: string;
    challengeRating: string;
    xp: number;
    unresolved?: boolean;
  }[] = [];

  for (const name of unique) {
    const found = await prisma.monster.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { slug: true, name: true, challengeRating: true, xp: true },
    });
    if (found) {
      out.push({
        name: found.name,
        slug: found.slug,
        challengeRating: found.challengeRating,
        xp: found.xp,
      });
    } else {
      out.push({
        name,
        slug: slugifyDisplayName(name),
        challengeRating: "0",
        xp: 0,
        unresolved: true,
      });
    }
  }
  return out;
}

// ── Monsters by CR range (used by AI generation for pool selection) ──
// challengeRating is stored as String so we fetch and filter in JS
export async function getMonstersByCr(crMin: number, crMax: number) {
  const all = await prisma.monster.findMany({
    select: {
      slug: true, name: true, challengeRating: true,
      xp: true, hitPoints: true, armorClass: true, type: true,
    },
  });

  return all.filter((m) => {
    const cr = parseCr(m.challengeRating);
    return cr >= crMin && cr <= crMax;
  });
}

// ── XP thresholds per character level (PHB p.82) ──────────────────
const XP_THRESHOLDS: Record<number, { easy: number; medium: number; hard: number; deadly: number }> = {
  1:  { easy: 25,   medium: 50,   hard: 75,    deadly: 100   },
  2:  { easy: 50,   medium: 100,  hard: 150,   deadly: 200   },
  3:  { easy: 75,   medium: 150,  hard: 225,   deadly: 400   },
  4:  { easy: 125,  medium: 250,  hard: 375,   deadly: 500   },
  5:  { easy: 250,  medium: 500,  hard: 750,   deadly: 1100  },
  6:  { easy: 300,  medium: 600,  hard: 900,   deadly: 1400  },
  7:  { easy: 350,  medium: 750,  hard: 1100,  deadly: 1700  },
  8:  { easy: 450,  medium: 900,  hard: 1400,  deadly: 2100  },
  9:  { easy: 550,  medium: 1100, hard: 1600,  deadly: 2400  },
  10: { easy: 600,  medium: 1200, hard: 1900,  deadly: 2800  },
  11: { easy: 800,  medium: 1600, hard: 2400,  deadly: 3600  },
  12: { easy: 1000, medium: 2000, hard: 3000,  deadly: 4500  },
  13: { easy: 1100, medium: 2200, hard: 3400,  deadly: 5100  },
  14: { easy: 1250, medium: 2500, hard: 3800,  deadly: 5700  },
  15: { easy: 1400, medium: 2800, hard: 4300,  deadly: 6400  },
  16: { easy: 1600, medium: 3200, hard: 4800,  deadly: 7200  },
  17: { easy: 2000, medium: 3900, hard: 5900,  deadly: 8800  },
  18: { easy: 2100, medium: 4200, hard: 6300,  deadly: 9500  },
  19: { easy: 2400, medium: 4900, hard: 7300,  deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500,  deadly: 12700 },
};

export function encounterDifficulty(
  partyLevels: number[],
  monsterXpValues: number[]
): { difficulty: string; partyThresholds: Record<string, number>; adjustedXp: number } {
  const thresholds = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  for (const lvl of partyLevels) {
    const t = XP_THRESHOLDS[Math.min(20, Math.max(1, lvl))];
    thresholds.easy   += t.easy;
    thresholds.medium += t.medium;
    thresholds.hard   += t.hard;
    thresholds.deadly += t.deadly;
  }

  const count = monsterXpValues.length;
  const mult =
    count === 1 ? 1    :
    count === 2 ? 1.5  :
    count <= 6  ? 2    :
    count <= 10 ? 2.5  :
    count <= 14 ? 3    : 4;

  const rawXp      = monsterXpValues.reduce((a, b) => a + b, 0);
  const adjustedXp = Math.round(rawXp * mult);

  const difficulty =
    adjustedXp >= thresholds.deadly ? "deadly" :
    adjustedXp >= thresholds.hard   ? "hard"   :
    adjustedXp >= thresholds.medium ? "medium" :
    adjustedXp >= thresholds.easy   ? "easy"   : "trivial";

  return { difficulty, partyThresholds: thresholds, adjustedXp };
}
