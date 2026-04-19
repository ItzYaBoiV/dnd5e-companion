/**
 * Small pixel-style token art (SVG) for classes and common foes when no photo is set.
 */

/** Resolves `/public/...` paths when the app is hosted under a non-root Vite `base`. */
export function publicAssetUrl(href: string): string {
  if (href.startsWith("http") || href.startsWith("data:") || href.startsWith("blob:")) return href;
  const base = import.meta.env.BASE_URL || "/";
  const path = href.startsWith("/") ? href : `/${href}`;
  if (!base || base === "/") return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  if (path === b || path.startsWith(`${b}/`)) return path;
  return `${b}${path}`;
}

export const DEFAULT_PC_SPRITE = "/tokens/pixel/adventurer.svg";
export const DEFAULT_MONSTER_SPRITE = "/tokens/pixel/monster.svg";

/** Primary class slug → static token art. */
export const CLASS_TOKEN_SPRITES: Record<string, string> = {
  barbarian: "/tokens/pixel/barbarian.svg",
  bard: "/tokens/pixel/bard.svg",
  cleric: "/tokens/pixel/cleric.svg",
  druid: "/tokens/pixel/druid.svg",
  fighter: "/tokens/pixel/fighter.svg",
  monk: "/tokens/pixel/monk.svg",
  paladin: "/tokens/pixel/paladin.svg",
  ranger: "/tokens/pixel/ranger.svg",
  rogue: "/tokens/pixel/rogue.svg",
  sorcerer: "/tokens/pixel/sorcerer.svg",
  warlock: "/tokens/pixel/warlock.svg",
  wizard: "/tokens/pixel/wizard.svg",
};

/** Monster slug (lowercase) → token art; unknown slugs use DEFAULT_MONSTER_SPRITE. */
export const MONSTER_TOKEN_SPRITES: Record<string, string> = {
  goblin: "/tokens/pixel/monster-goblin.svg",
  hobgoblin: "/tokens/pixel/monster-brute.svg",
  bugbear: "/tokens/pixel/monster-brute.svg",
  orc: "/tokens/pixel/monster-brute.svg",
  skeleton: "/tokens/pixel/monster-undead.svg",
  zombie: "/tokens/pixel/monster-undead.svg",
  dragon: "/tokens/pixel/monster-dragon.svg",
};

export function classTokenSprite(classSlug: string): string {
  const k = classSlug.trim().toLowerCase();
  return publicAssetUrl(CLASS_TOKEN_SPRITES[k] ?? DEFAULT_PC_SPRITE);
}

export function monsterTokenSprite(monsterSlug: string | null | undefined): string {
  const k = (monsterSlug ?? "").trim().toLowerCase();
  if (!k) return publicAssetUrl(DEFAULT_MONSTER_SPRITE);
  return publicAssetUrl(MONSTER_TOKEN_SPRITES[k] ?? DEFAULT_MONSTER_SPRITE);
}
