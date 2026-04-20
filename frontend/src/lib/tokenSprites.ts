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
  kobold: "/tokens/pixel/monster-kobold.svg",
  gnoll: "/tokens/pixel/monster-gnoll.svg",
  lizardfolk: "/tokens/pixel/monster-lizardfolk.svg",
  cultist: "/tokens/pixel/monster-cultist.svg",
  bandit: "/tokens/pixel/monster-bandit.svg",
  "bandit-captain": "/tokens/pixel/monster-bandit-captain.svg",
  berserker: "/tokens/pixel/monster-berserker.svg",
  guard: "/tokens/pixel/monster-guard.svg",
  knight: "/tokens/pixel/monster-knight.svg",
  spy: "/tokens/pixel/monster-spy.svg",
  thug: "/tokens/pixel/monster-thug.svg",
  "tribal-warrior": "/tokens/pixel/monster-tribal-warrior.svg",
  wight: "/tokens/pixel/monster-wight.svg",
  wraith: "/tokens/pixel/monster-wraith.svg",
  specter: "/tokens/pixel/monster-specter.svg",
  ghoul: "/tokens/pixel/monster-ghoul.svg",
  ghast: "/tokens/pixel/monster-ghast.svg",
  revenant: "/tokens/pixel/monster-revenant.svg",
  lich: "/tokens/pixel/monster-lich.svg",
  vampire: "/tokens/pixel/monster-vampire.svg",
  "vampire-spawn": "/tokens/pixel/monster-vampire-spawn.svg",
  mummy: "/tokens/pixel/monster-mummy.svg",
  "mummy-lord": "/tokens/pixel/monster-mummy-lord.svg",
  "death-knight": "/tokens/pixel/monster-death-knight.svg",
  demilich: "/tokens/pixel/monster-demilich.svg",
  shadow: "/tokens/pixel/monster-shadow.svg",
  banshee: "/tokens/pixel/monster-banshee.svg",
  flameskull: "/tokens/pixel/monster-flameskull.svg",
  "crawling-claw": "/tokens/pixel/monster-crawling-claw.svg",
  "skeleton-warrior": "/tokens/pixel/monster-skeleton-warrior.svg",
  wolf: "/tokens/pixel/monster-wolf.svg",
  "dire-wolf": "/tokens/pixel/monster-dire-wolf.svg",
  "giant-spider": "/tokens/pixel/monster-giant-spider.svg",
  "giant-rat": "/tokens/pixel/monster-giant-rat.svg",
  "swarm-rats": "/tokens/pixel/monster-swarm-rats.svg",
  "giant-bat": "/tokens/pixel/monster-giant-bat.svg",
  "giant-centipede": "/tokens/pixel/monster-giant-centipede.svg",
  "giant-toad": "/tokens/pixel/monster-giant-toad.svg",
  "giant-eagle": "/tokens/pixel/monster-giant-eagle.svg",
  owlbear: "/tokens/pixel/monster-owlbear.svg",
  "displacer-beast": "/tokens/pixel/monster-displacer-beast.svg",
  basilisk: "/tokens/pixel/monster-basilisk.svg",
  cockatrice: "/tokens/pixel/monster-cockatrice.svg",
  manticore: "/tokens/pixel/monster-manticore.svg",
  griffon: "/tokens/pixel/monster-griffon.svg",
  hippogriff: "/tokens/pixel/monster-hippogriff.svg",
  worg: "/tokens/pixel/monster-worg.svg",
  "phase-spider": "/tokens/pixel/monster-phase-spider.svg",
  stirge: "/tokens/pixel/monster-stirge.svg",
  beholder: "/tokens/pixel/monster-beholder.svg",
  "mind-flayer": "/tokens/pixel/monster-mind-flayer.svg",
  aboleth: "/tokens/pixel/monster-aboleth.svg",
  "gibbering-mouther": "/tokens/pixel/monster-gibbering-mouther.svg",
  "intellect-devourer": "/tokens/pixel/monster-intellect-devourer.svg",
  nothic: "/tokens/pixel/monster-nothic.svg",
  otyugh: "/tokens/pixel/monster-otyugh.svg",
  "rust-monster": "/tokens/pixel/monster-rust-monster.svg",
  "will-o-wisp": "/tokens/pixel/monster-will-o-wisp.svg",
  pixie: "/tokens/pixel/monster-pixie.svg",
  dryad: "/tokens/pixel/monster-dryad.svg",
  ogre: "/tokens/pixel/monster-ogre.svg",
  troll: "/tokens/pixel/monster-troll.svg",
  "hill-giant": "/tokens/pixel/monster-hill-giant.svg",
  "stone-giant": "/tokens/pixel/monster-stone-giant.svg",
  "frost-giant": "/tokens/pixel/monster-frost-giant.svg",
  "fire-giant": "/tokens/pixel/monster-fire-giant.svg",
  "cloud-giant": "/tokens/pixel/monster-cloud-giant.svg",
  "storm-giant": "/tokens/pixel/monster-storm-giant.svg",
  cyclops: "/tokens/pixel/monster-cyclops.svg",
  ettin: "/tokens/pixel/monster-ettin.svg",
  "dragon-white": "/tokens/pixel/monster-dragon-white.svg",
  "dragon-black": "/tokens/pixel/monster-dragon-black.svg",
  "dragon-green": "/tokens/pixel/monster-dragon-green.svg",
  "dragon-blue": "/tokens/pixel/monster-dragon-blue.svg",
  "dragon-red": "/tokens/pixel/monster-dragon-red.svg",
  "dragon-silver": "/tokens/pixel/monster-dragon-silver.svg",
  "dragon-gold": "/tokens/pixel/monster-dragon-gold.svg",
  "dragon-copper": "/tokens/pixel/monster-dragon-copper.svg",
  "dragon-bronze": "/tokens/pixel/monster-dragon-bronze.svg",
  "dragon-brass": "/tokens/pixel/monster-dragon-brass.svg",
  wyvern: "/tokens/pixel/monster-wyvern.svg",
  pseudodragon: "/tokens/pixel/monster-pseudodragon.svg",
  imp: "/tokens/pixel/monster-imp.svg",
  quasit: "/tokens/pixel/monster-quasit.svg",
  incubus: "/tokens/pixel/monster-incubus.svg",
  succubus: "/tokens/pixel/monster-succubus.svg",
  "barbed-devil": "/tokens/pixel/monster-barbed-devil.svg",
  "horned-devil": "/tokens/pixel/monster-horned-devil.svg",
  balor: "/tokens/pixel/monster-balor.svg",
  "pit-fiend": "/tokens/pixel/monster-pit-fiend.svg",
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

/** Hyphenated slug → sprite with partial / chromatic-dragon style fallbacks. */
export function monsterTokenSpriteWithFallback(monsterSlug: string | null | undefined): string {
  const raw = (monsterSlug ?? "").trim().toLowerCase();
  if (!raw) return publicAssetUrl(DEFAULT_MONSTER_SPRITE);
  if (MONSTER_TOKEN_SPRITES[raw]) return publicAssetUrl(MONSTER_TOKEN_SPRITES[raw]);

  const hyphen = raw.replace(/\s+/g, "-").replace(/_/g, "-");
  if (MONSTER_TOKEN_SPRITES[hyphen]) return publicAssetUrl(MONSTER_TOKEN_SPRITES[hyphen]);

  const parts = hyphen.split("-").filter(Boolean);
  for (let n = parts.length; n >= 2; n--) {
    const tail = parts.slice(-n).join("-");
    if (MONSTER_TOKEN_SPRITES[tail]) return publicAssetUrl(MONSTER_TOKEN_SPRITES[tail]);
  }

  const chromatic = parts.find((p) => ["white", "black", "green", "blue", "red", "gold", "silver", "brass", "bronze", "copper"].includes(p));
  if (chromatic) {
    const k = `dragon-${chromatic}`;
    if (MONSTER_TOKEN_SPRITES[k]) return publicAssetUrl(MONSTER_TOKEN_SPRITES[k]);
  }
  if (parts.includes("dragon") && MONSTER_TOKEN_SPRITES.dragon) {
    return publicAssetUrl(MONSTER_TOKEN_SPRITES.dragon);
  }

  return publicAssetUrl(DEFAULT_MONSTER_SPRITE);
}
