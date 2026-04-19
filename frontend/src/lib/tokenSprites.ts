/**
 * Small pixel-style token art (SVG) for classes and common foes when no photo is set.
 */

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
  return CLASS_TOKEN_SPRITES[k] ?? DEFAULT_PC_SPRITE;
}

export function monsterTokenSprite(monsterSlug: string | null | undefined): string {
  const k = (monsterSlug ?? "").trim().toLowerCase();
  if (!k) return DEFAULT_MONSTER_SPRITE;
  return MONSTER_TOKEN_SPRITES[k] ?? DEFAULT_MONSTER_SPRITE;
}
