/**
 * SRD-style class / subclass feature choices during level-up (including multi-pick rules).
 * Open5e prose often omits structured lists; this fills gaps so the UI can collect picks.
 */

import { SKILL_LABELS, SKILL_NAMES, type SkillName, type Spell } from "@/types/dnd";
import { extractFeatureOptions, slugifyOptionKey, type FeatureOption } from "@/lib/levelUpFormHelpers";
import {
  HUMANOID_FAVORED_ENEMY_OPTION_KEY,
  type GrantPickSpec,
} from "@/lib/levelUpGrantPickTypes";

export type { GrantPickSpec } from "@/lib/levelUpGrantPickTypes";
export { HUMANOID_FAVORED_ENEMY_OPTION_KEY } from "@/lib/levelUpGrantPickTypes";

const meta = (key: string, title: string, detail: string): FeatureOption => ({
  key: slugifyOptionKey(key),
  title,
  detail,
});

/** Max spell level a full caster can cast at this *class* level (0 = cantrips only at “tier 0”). */
export function maxSpellLevelForFullCaster(classLevel: number): number {
  return Math.min(9, Math.max(0, Math.ceil(classLevel / 2)));
}

/** PHB / SRD Metamagic options (sorcerer). */
const SRD_METAMAGIC: FeatureOption[] = [
  meta("careful-spell", "Careful Spell", "Protect allies from your area spells."),
  meta("distant-spell", "Distant Spell", "Double range; touch becomes 30 ft."),
  meta("empowered-spell", "Empowered Spell", "Reroll a number of damage dice."),
  meta("extended-spell", "Extended Spell", "Double duration (up to 24 hours)."),
  meta("heightened-spell", "Heightened Spell", "Impose disadvantage on one target’s save."),
  meta("quickened-spell", "Quickened Spell", "Cast a spell as a bonus action."),
  meta("subtle-spell", "Subtle Spell", "Cast without verbal/somatic components."),
  meta("twinned-spell", "Twinned Spell", "Target a second creature with a single-target spell."),
];

const SRD_MANEUVERS: FeatureOption[] = [
  meta("commanders-strike", "Commander's Strike", "Forego an attack to let an ally strike."),
  meta("disarming-attack", "Disarming Attack", "Add superiority die; try to disarm."),
  meta("distracting-strike", "Distracting Strike", "Grant advantage to the next ally vs that target."),
  meta("evasive-footwork", "Evasive Footwork", "Add die to AC when you move."),
  meta("feinting-attack", "Feinting Attack", "Advantage on your next attack vs one creature."),
  meta("goading-attack", "Goading Attack", "Target has disadvantage vs others."),
  meta("lunging-attack", "Lunging Attack", "Increase reach by 5 ft for one attack."),
  meta("maneuvering-attack", "Maneuvering Attack", "Ally can move without provoking from you."),
  meta("menacing-attack", "Menacing Attack", "Frighten on hit."),
  meta("parry", "Parry", "Reduce damage when wielding a melee weapon."),
  meta("precision-attack", "Precision Attack", "Add die to attack roll after rolling."),
  meta("pushing-attack", "Pushing Attack", "Push target up to 15 ft."),
  meta("rally", "Rally", "Grant temporary HP to an ally."),
  meta("riposte", "Riposte", "Attack when a foe misses you in melee."),
  meta("sweeping-attack", "Sweeping Attack", "Damage a second adjacent creature."),
  meta("trip-attack", "Trip Attack", "Try to knock prone on hit."),
];

const SRD_FIGHTING_STYLES_FULL: FeatureOption[] = [
  meta("archery", "Archery", "+2 bonus to ranged weapon attack rolls."),
  meta("defense", "Defense", "+1 AC while wearing armor."),
  meta("dueling", "Dueling", "+2 damage with one-handed melee when no other weapon."),
  meta("great-weapon-fighting", "Great Weapon Fighting", "Reroll 1s and 2s on damage with two-handed weapons."),
  meta("protection", "Protection", "Impose disadvantage on an attack vs an adjacent ally."),
  meta("two-weapon-fighting", "Two-Weapon Fighting", "Add ability mod to off-hand damage."),
];

const SRD_FIGHTING_STYLES_RANGER: FeatureOption[] = SRD_FIGHTING_STYLES_FULL.filter(
  (o) => o.key !== "protection" && o.key !== "great-weapon-fighting",
);

const SRD_FAVORED_ENEMIES: FeatureOption[] = [
  meta("aberrations", "Aberrations", "Favored enemy type."),
  meta("beasts", "Beasts", "Favored enemy type."),
  meta("celestials", "Celestials", "Favored enemy type."),
  meta("constructs", "Constructs", "Favored enemy type."),
  meta("dragons", "Dragons", "Favored enemy type."),
  meta("elementals", "Elementals", "Favored enemy type."),
  meta("fey", "Fey", "Favored enemy type."),
  meta("fiends", "Fiends", "Favored enemy type."),
  meta("giants", "Giants", "Favored enemy type."),
  meta(HUMANOID_FAVORED_ENEMY_OPTION_KEY, "Humanoids (two races)", "PHB: choose two distinct humanoid races (enter below)."),
  meta("monstrosities", "Monstrosities", "Favored enemy type."),
  meta("oozes", "Oozes", "Favored enemy type."),
  meta("plants", "Plants", "Favored enemy type."),
  meta("undead", "Undead", "Favored enemy type."),
];

const SRD_FAVORED_TERRAINS: FeatureOption[] = [
  meta("arctic", "Arctic", "Favored terrain."),
  meta("coast", "Coast", "Favored terrain."),
  meta("desert", "Desert", "Favored terrain."),
  meta("forest", "Forest", "Favored terrain."),
  meta("grassland", "Grassland", "Favored terrain."),
  meta("mountain", "Mountain", "Favored terrain."),
  meta("swamp", "Swamp", "Favored terrain."),
  meta("underdark", "Underdark", "Favored terrain."),
];

/** PHB Totem Spirit (level 3) — Bear, Eagle, or Wolf only. */
const SRD_TOTEM_SPIRIT: FeatureOption[] = [
  meta("bear", "Bear", "Totem option — resistance while raging (levels vary by feature)."),
  meta("eagle", "Eagle", "Totem option — mobility and vision benefits."),
  meta("wolf", "Wolf", "Totem option — pack tactics while raging."),
];

/** PHB Aspect of the Beast (level 6+) — includes Elk and Tiger. */
const SRD_ASPECT_BEASTS: FeatureOption[] = [
  ...SRD_TOTEM_SPIRIT,
  meta("elk", "Elk", "Totem option — travel speed for the party."),
  meta("tiger", "Tiger", "Totem option — leap and stalking benefits."),
];

type EldritchInvocationDef = { key: string; title: string; detail: string; minLevel?: number };

/** PHB minimum warlock level; default 1 when omitted. */
const RAW_SRD_ELDRITCH_INVOCATIONS: EldritchInvocationDef[] = [
  { key: "agonizing-blast", title: "Agonizing Blast", detail: "Eldritch Blast adds Charisma mod to damage (any)." },
  { key: "armor-of-shadows", title: "Armor of Shadows", detail: "Cast mage armor on yourself at will (any)." },
  { key: "ascendant-step", title: "Ascendant Step", detail: "Levitate on self at will (9th+ warlock).", minLevel: 9 },
  { key: "beast-speech", title: "Beast Speech", detail: "Speak with animals at will (any)." },
  { key: "beguiling-influence", title: "Beguiling Influence", detail: "Proficiency in Deception and Persuasion (any)." },
  { key: "devils-sight", title: "Devil's Sight", detail: "See in darkness (any)." },
  { key: "eldritch-spear", title: "Eldritch Spear", detail: "Eldritch Blast range 300 ft (any)." },
  { key: "eyes-of-the-rune-keeper", title: "Eyes of the Rune Keeper", detail: "Read all writing (any)." },
  { key: "fiendish-vigor", title: "Fiendish Vigor", detail: "False life at will on yourself (any)." },
  { key: "gaze-of-two-minds", title: "Gaze of Two Minds", detail: "Perceive through a willing humanoid (any)." },
  { key: "lifedrinker", title: "Lifedrinker", detail: "Weapon pact attacks add Cha to damage (12th+).", minLevel: 12 },
  { key: "mask-of-many-faces", title: "Mask of Many Faces", detail: "Disguise self at will (any)." },
  {
    key: "master-of-myriad-forms",
    title: "Master of Myriad Forms",
    detail: "Alter self at will (15th+).",
    minLevel: 15,
  },
  { key: "minions-of-chaos", title: "Minions of Chaos", detail: "Conjure elemental once per long rest (9th+).", minLevel: 9 },
  { key: "mire-the-mind", title: "Mire the Mind", detail: "Slow once per long rest (5th+).", minLevel: 5 },
  { key: "misty-visions", title: "Misty Visions", detail: "Silent image at will (any)." },
  { key: "one-with-shadows", title: "One with Shadows", detail: "Invisibility in dim light (5th+).", minLevel: 5 },
  { key: "otherworldly-leap", title: "Otherworldly Leap", detail: "Jump at will (9th+).", minLevel: 9 },
  { key: "repelling-blast", title: "Repelling Blast", detail: "Eldritch Blast can push 10 ft (any)." },
  { key: "sculptor-of-flesh", title: "Sculptor of Flesh", detail: "Polymorph once per long rest (7th+).", minLevel: 7 },
  { key: "sign-of-ill-omen", title: "Sign of Ill Omen", detail: "Bestow curse once per long rest (5th+).", minLevel: 5 },
  { key: "thief-of-five-fates", title: "Thief of Five Fates", detail: "Bane once per long rest (any)." },
  { key: "voice-of-the-chain-master", title: "Voice of the Chain Master", detail: "Speak through familiar telepathically (any)." },
  {
    key: "whispers-of-the-grave",
    title: "Whispers of the Grave",
    detail: "Speak with dead once per long rest (9th+).",
    minLevel: 9,
  },
  { key: "witch-sight", title: "Witch Sight", detail: "See creatures’ true forms (15th+).", minLevel: 15 },
];

function eldritchInvocationOptionsForWarlockLevel(warlockClassLevel: number): FeatureOption[] {
  return RAW_SRD_ELDRITCH_INVOCATIONS.filter((inv) => (inv.minLevel ?? 1) <= warlockClassLevel).map((inv) =>
    meta(inv.key, inv.title, inv.detail),
  );
}

/** Cumulative invocations known by warlock class tier (PHB). */
function warlockInvocationsKnownAtClassLevel(L: number): number {
  if (L < 2) return 0;
  let n = 2;
  for (const b of [5, 7, 9, 12, 15, 18]) {
    if (L >= b) n++;
  }
  return n;
}

const HUNTERS_PREY: FeatureOption[] = [
  meta("colossus-slayer", "Colossus Slayer", "Extra damage once per turn vs wounded foe."),
  meta("giant-killer", "Giant Killer", "Reaction attack when Large+ misses you."),
  meta("horde-breaker", "Horde Breaker", "Extra attack vs adjacent second target."),
];

const HUNTER_DEFENSIVE_TACTICS: FeatureOption[] = [
  meta("escape-the-horde", "Escape the Horde", "Opportunity attacks vs you have disadvantage."),
  meta("multiattack-defense", "Multiattack Defense", "+4 AC vs second+ hit in a turn."),
  meta("steel-will", "Steel Will", "Advantage on saves vs frightened."),
];

const HUNTER_MULTIATTACK: FeatureOption[] = [
  meta("volley", "Volley", "Ranged attack vs every creature in a 10 ft radius."),
  meta("whirlwind-attack", "Whirlwind Attack", "Melee attack vs each creature within reach."),
];

const HUNTER_SUPERIOR_DEFENSE: FeatureOption[] = [
  meta("evasion-hunter", "Evasion", "Dex-save effects: no damage on success, half on fail."),
  meta("stand-against-the-tide", "Stand Against the Tide", "Redirect a missed melee attack."),
  meta("uncanny-dodge-hunter", "Uncanny Dodge", "Halve damage from one attack you can see."),
];

const SRD_DRAGON_ANCESTORS: FeatureOption[] = [
  meta("black", "Black", "Acid (chromatic)."),
  meta("blue", "Blue", "Lightning (chromatic)."),
  meta("brass", "Brass", "Fire (metallic)."),
  meta("bronze", "Bronze", "Lightning (metallic)."),
  meta("copper", "Copper", "Acid (metallic)."),
  meta("gold", "Gold", "Fire (metallic)."),
  meta("green", "Green", "Poison (chromatic)."),
  meta("red", "Red", "Fire (chromatic)."),
  meta("silver", "Silver", "Cold (metallic)."),
  meta("white", "White", "Cold (chromatic)."),
];

const CIRCLE_LAND_TERRAIN: FeatureOption[] = [
  meta("arctic", "Arctic", "Circle of the Land — arctic spell list."),
  meta("coast", "Coast", "Circle of the Land — coast spell list."),
  meta("desert", "Desert", "Circle of the Land — desert spell list."),
  meta("forest", "Forest", "Circle of the Land — forest spell list."),
  meta("grassland", "Grassland", "Circle of the Land — grassland spell list."),
  meta("mountain", "Mountain", "Circle of the Land — mountain spell list."),
  meta("swamp", "Swamp", "Circle of the Land — swamp spell list."),
  meta("underdark", "Underdark", "Circle of the Land — underdark spell list."),
];

const PACT_BOONS: FeatureOption[] = [
  meta("pact-of-the-chain", "Pact of the Chain", "Improved familiar options."),
  meta("pact-of-the-blade", "Pact of the Blade", "Summon a pact weapon."),
  meta("pact-of-the-tome", "Pact of the Tome", "Book of Shadows with extra cantrips."),
];

/** Way of the Four Elements — PHB disciplines (pick one when the feature grants a new discipline). */
const FOUR_ELEMENTS_DISCIPLINES: FeatureOption[] = [
  meta("breath-of-winter", "Breath of Winter", "Spend ki to cast cone of cold (high level)."),
  meta("clench-of-the-north-wind", "Clench of the North Wind", "Spend ki to cast hold person."),
  meta("elemental-attunement", "Elemental Attunement", "Minor elemental tricks (cantrip-like)."),
  meta("eternal-mountain-defense", "Eternal Mountain Defense", "Spend ki to cast stoneskin."),
  meta("fangs-of-the-fire-snake", "Fangs of the Fire Snake", "Extend unarmed reach with fire damage."),
  meta("fist-of-four-thunders", "Fist of Four Thunders", "Spend ki to cast thunderwave."),
  meta("fist-of-unbroken-air", "Fist of Unbroken Air", "Line push and damage."),
  meta("flames-of-the-phoenix", "Flames of the Phoenix", "Spend ki to cast fireball."),
  meta("gong-of-the-summit", "Gong of the Summit", "Spend ki to cast shatter."),
  meta("mist-stance", "Mist Stance", "Spend ki to cast gaseous form."),
  meta("ride-the-wind", "Ride the Wind", "Spend ki to cast fly."),
  meta("river-of-hungry-flame", "River of Hungry Flame", "Wall of fire discipline."),
  meta("rush-of-the-gale-spirits", "Rush of the Gale Spirits", "Spend ki to cast gust of wind."),
  meta("shape-the-flowing-river", "Shape the Flowing River", "Freeze or melt water."),
  meta("sweeping-cinder-strike", "Sweeping Cinder Strike", "Spend ki to cast burning hands."),
  meta("unbroken-air", "Unbroken Air", "Spend ki to cast gust-like attack."),
  meta("wave-of-rolling-earth", "Wave of Rolling Earth", "Spend ki to cast wall of stone."),
  meta("water-whip", "Water Whip", "Pull and damage with water."),
];

const CD_TURN_UNDEAD: FeatureOption = meta(
  "turn-undead",
  "Turn Undead",
  "As an action, each undead that can see or hear you within 30 ft makes a Wisdom save.",
);

function clericDomainChannelOptions(subLower: string, classLevel: number): FeatureOption[] {
  const s = subLower;
  const L = classLevel;
  const domain = (name: string, detail: string) => meta(slugifyOptionKey(name), name, detail);
  if (s.includes("life"))
    return [CD_TURN_UNDEAD, domain("Preserve Life", "Restore hit points divided among creatures in 30 ft.")];
  if (s.includes("light"))
    return [
      CD_TURN_UNDEAD,
      domain("Radiance of the Dawn", "Dispel magical darkness and deal radiant damage in an area."),
    ];
  if (s.includes("nature"))
    return [
      CD_TURN_UNDEAD,
      domain("Charm Animals and Plants", "Charm beasts and plants in 30 ft on failed Wisdom save."),
    ];
  if (s.includes("tempest"))
    return [
      CD_TURN_UNDEAD,
      domain("Destructive Wrath", "Deal maximum damage with lightning or thunder for this turn."),
    ];
  if (s.includes("trickery"))
    return [
      CD_TURN_UNDEAD,
      domain("Invoke Duplicity", "Create an illusory duplicate; spells can originate from it."),
    ];
  if (s.includes("war")) {
    const out: FeatureOption[] = [CD_TURN_UNDEAD];
    if (L >= 2) {
      out.push(
        domain(
          "Guided Strike",
          "When you make an attack roll, you can use Channel Divinity to add +10 to the roll (PHB).",
        ),
      );
    }
    if (L >= 6) {
      out.push(
        domain(
          "War God's Blessing",
          "When a creature within 60 feet of you that you can see hits with a weapon attack, you can use Channel Divinity to add +10 to that attack roll (PHB).",
        ),
      );
    }
    return out;
  }
  if (s.includes("knowledge"))
    return [
      CD_TURN_UNDEAD,
      domain(
        "Knowledge of the Ages",
        "Gain proficiency with one skill or tool for 10 minutes (Channel Divinity).",
      ),
    ];
  if (s.includes("death"))
    return [
      CD_TURN_UNDEAD,
      domain("Touch of Death", "When you destroy a creature, gain HP equal to 2 + spell level or CR."),
    ];
  return [CD_TURN_UNDEAD];
}

function skillsFromProficiencyList(slugs: string[]): FeatureOption[] {
  const out: FeatureOption[] = [];
  for (const s of slugs) {
    const slug = s.trim();
    if (!slug) continue;
    const label = SKILL_LABELS[slug as SkillName] ?? slug.replace(/-/g, " ");
    out.push({
      key: slugifyOptionKey(slug),
      title: label,
      detail: "You must be proficient (class, background, race, feat, etc.).",
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function allSkillsFallback(): FeatureOption[] {
  return SKILL_NAMES.map((s) => ({
    key: s,
    title: SKILL_LABELS[s],
    detail: "Pick only skills you are already proficient in.",
  }));
}

function isBattleMasterSubclass(sub: string): boolean {
  return sub.includes("battle") && sub.includes("master");
}

function isTotemSubclass(sub: string): boolean {
  return sub.includes("totem");
}

function isHunterSubclass(sub: string): boolean {
  return sub.includes("hunter") && !sub.includes("monster");
}

function isBeastMasterSubclass(sub: string): boolean {
  return sub.includes("beast") || sub.includes("beastmaster");
}

function isFourElementsSubclass(sub: string): boolean {
  return sub.includes("four-elements") || (sub.includes("four") && sub.includes("element"));
}

/** PHB Battle Master: 3 at 3; 2 more at 7, 10, 15. */
function battleMasterManeuverPicksHardcoded(subLower: string, classLevel: number): number {
  if (!isBattleMasterSubclass(subLower)) return 0;
  if (classLevel === 3) return 3;
  if ([7, 10, 15].includes(classLevel)) return 2;
  return 0;
}

function battleMasterManeuverPicksFromDescription(
  nameLower: string,
  description: string,
  classLevel: number,
): number {
  const blob = `${nameLower} ${description.toLowerCase()}`;
  if (classLevel === 3) {
    if (nameLower.includes("combat superiority")) return 3;
    if (/three|3 maneuvers|3\s+maneuver|choose three maneuvers/i.test(blob)) return 3;
    if (nameLower.includes("maneuver") && !nameLower.includes("additional")) return 3;
    return 0;
  }
  if ([7, 10, 15].includes(classLevel)) {
    if (/two additional maneuvers|2 additional maneuvers|learn two maneuvers|learn 2 maneuvers/i.test(blob))
      return 2;
    if (/additional maneuvers/i.test(blob) && /two|\b2\b/.test(blob)) return 2;
  }
  return 0;
}

function fourElementsDisciplinePicks(classLevel: number): number {
  if (classLevel === 3) return 2;
  if ([6, 11, 17].includes(classLevel)) return 1;
  return 0;
}

export type ResolveGrantPickInput = {
  name: string;
  description: string;
  classSlug: string;
  newClassLevel: number;
  subclassSlugLower: string;
  proficientSkillSlugs: string[];
};

export function resolveGrantPickSpec(input: ResolveGrantPickInput): GrantPickSpec | null {
  const n = input.name.trim().toLowerCase();
  const desc = input.description;
  const slug = input.classSlug;
  const L = input.newClassLevel;
  const sub = input.subclassSlugLower;

  if (slug === "wizard" && n.includes("spell mastery") && L >= 18) {
    if (n.includes("1st-level") || n.includes("1st level")) {
      return {
        kind: "spells",
        pickCount: 1,
        minSpellLevel: 1,
        maxSpellLevel: 1,
        spellList: "wizard",
        allowCantrips: false,
        fromKnownSpellbookOnly: true,
        addToSpellbook: false,
      };
    }
    if (n.includes("2nd-level") || n.includes("2nd level")) {
      return {
        kind: "spells",
        pickCount: 1,
        minSpellLevel: 2,
        maxSpellLevel: 2,
        spellList: "wizard",
        allowCantrips: false,
        fromKnownSpellbookOnly: true,
        addToSpellbook: false,
      };
    }
    return null;
  }

  if (slug === "wizard" && (n.includes("signature spell") || n.includes("signature spells")) && L >= 20) {
    return {
      kind: "spells",
      pickCount: 2,
      maxSpellLevel: 3,
      spellList: "wizard",
      allowCantrips: false,
      fromKnownSpellbookOnly: true,
      addToSpellbook: false,
      alwaysPrepared: true,
    };
  }

  if (slug === "bard" && n.includes("magical secret")) {
    const maxLv = maxSpellLevelForFullCaster(L);
    const isLoreSix = L === 6 && sub.includes("lore");
    if (L === 10 || L === 14 || L === 18 || isLoreSix) {
      return {
        kind: "spells",
        pickCount: 2,
        maxSpellLevel: maxLv,
        spellList: "any",
        allowCantrips: true,
        fromKnownSpellbookOnly: false,
        addToSpellbook: true,
      };
    }
  }

  if (slug === "cleric" && n.includes("channel divinity") && L >= 2) {
    const opts = clericDomainChannelOptions(sub, L);
    return { kind: "channel-divinity", options: opts, pickCount: opts.length };
  }

  if (slug === "monk" && isFourElementsSubclass(sub) && (n.includes("discipline") || n.includes("elemental"))) {
    const picks = fourElementsDisciplinePicks(L);
    if (picks > 0) return { kind: "options", options: FOUR_ELEMENTS_DISCIPLINES, pickCount: picks };
  }

  if (slug === "ranger" && isBeastMasterSubclass(sub) && (n.includes("companion") || n.includes("beast"))) {
    if (L === 3) return { kind: "beast-companion", pickCount: 1 };
  }

  if (slug === "sorcerer" && n.includes("metamagic")) {
    const pick = L === 3 ? 2 : L === 10 || L === 17 ? 1 : 0;
    if (pick < 1) return null;
    return { kind: "options", options: SRD_METAMAGIC, pickCount: pick };
  }

  if (slug === "sorcerer" && sub.includes("draconic") && (n.includes("dragon") || n.includes("ancestry"))) {
    return { kind: "options", options: SRD_DRAGON_ANCESTORS, pickCount: 1 };
  }

  if (slug === "fighter" && isBattleMasterSubclass(sub)) {
    const hard = battleMasterManeuverPicksHardcoded(sub, L);
    const picks = hard > 0 ? hard : battleMasterManeuverPicksFromDescription(n, desc, L);
    if (picks > 0) return { kind: "options", options: SRD_MANEUVERS, pickCount: picks };
  }

  if (slug === "ranger" && isHunterSubclass(sub)) {
    if (
      L === 11 &&
      (n.includes("multiattack") || n.includes("volley") || n.includes("whirlwind") || /volley|whirlwind/i.test(desc))
    )
      return { kind: "options", options: HUNTER_MULTIATTACK, pickCount: 1 };
    if (n.includes("hunter") && n.includes("prey"))
      return { kind: "options", options: HUNTERS_PREY, pickCount: 1 };
    if (n.includes("defensive tactic"))
      return { kind: "options", options: HUNTER_DEFENSIVE_TACTICS, pickCount: 1 };
    if (n.includes("multiattack") && (n.includes("volley") || n.includes("whirlwind") || /volley|whirlwind/i.test(desc)))
      return { kind: "options", options: HUNTER_MULTIATTACK, pickCount: 1 };
    if (n.includes("superior hunter") || (n.includes("superior") && n.includes("defense")))
      return { kind: "options", options: HUNTER_SUPERIOR_DEFENSE, pickCount: 1 };
  }

  if (n.includes("fighting") && n.includes("style")) {
    const opts = slug === "ranger" ? SRD_FIGHTING_STYLES_RANGER : SRD_FIGHTING_STYLES_FULL;
    return { kind: "options", options: opts, pickCount: 1 };
  }

  if (n.includes("expertise")) {
    let pick = 0;
    if (slug === "bard" && (L === 3 || L === 10)) pick = 2;
    if (slug === "rogue" && (L === 1 || L === 6)) pick = 2;
    if (pick === 0) return null;
    const fromProf = skillsFromProficiencyList(input.proficientSkillSlugs);
    const options = fromProf.length >= pick ? fromProf : allSkillsFallback();
    return { kind: "options", options, pickCount: pick };
  }

  if (slug === "ranger" && n.includes("favored enemy")) {
    return {
      kind: "options",
      options: SRD_FAVORED_ENEMIES,
      pickCount: 1,
      humanoidRaceFollowUpKey: HUMANOID_FAVORED_ENEMY_OPTION_KEY,
    };
  }

  if (slug === "ranger" && (n.includes("natural explorer") || n.includes("favored terrain"))) {
    return { kind: "options", options: SRD_FAVORED_TERRAINS, pickCount: 1 };
  }

  if (slug === "barbarian" && isTotemSubclass(sub)) {
    if (L === 3 && n.includes("totem spirit") && !n.includes("spirit seeker"))
      return { kind: "options", options: SRD_TOTEM_SPIRIT, pickCount: 1 };
    if (L === 6 && n.includes("aspect") && n.includes("beast"))
      return { kind: "options", options: SRD_ASPECT_BEASTS, pickCount: 1 };
    if (L === 14 && (n.includes("totemic") || n.includes("attunement")))
      return { kind: "options", options: SRD_ASPECT_BEASTS, pickCount: 1 };
  }

  if (slug === "warlock" && (n.includes("invocation") || n.includes("eldritch invocation"))) {
    const prev = warlockInvocationsKnownAtClassLevel(L - 1);
    const curr = warlockInvocationsKnownAtClassLevel(L);
    const pickCount = curr - prev;
    if (pickCount < 1) return null;
    return {
      kind: "options",
      options: eldritchInvocationOptionsForWarlockLevel(L),
      pickCount,
    };
  }

  if (n === "pact boon" || (n.includes("pact") && n.includes("boon"))) {
    return { kind: "options", options: PACT_BOONS, pickCount: 1 };
  }

  if (
    (n.includes("circle of the land") && n.includes("spell")) ||
    (n.includes("circle") && n.includes("land") && n.includes("spell"))
  ) {
    return { kind: "options", options: CIRCLE_LAND_TERRAIN, pickCount: 1 };
  }

  return null;
}

export function resolveGrantPickSpecWithFallback(input: ResolveGrantPickInput): GrantPickSpec | null {
  const fromCatalog = resolveGrantPickSpec(input);
  if (fromCatalog) return fromCatalog;

  const parsed = extractFeatureOptions(input.description, input.name);
  if (parsed.length >= 2) return { kind: "options", options: parsed, pickCount: 1 };

  return null;
}

export function filterSpellsForGrantSpec(
  spec: Extract<GrantPickSpec, { kind: "spells" }>,
  allSpells: Spell[],
  wizardSpellSlugs: Set<string>,
  knownSpellSlugs: Set<string>,
): Spell[] {
  const minLv = spec.minSpellLevel ?? 0;
  return allSpells.filter((s) => {
    if (s.level < minLv) return false;
    if (s.level > spec.maxSpellLevel) return false;
    if (!spec.allowCantrips && s.level === 0) return false;
    if (spec.fromKnownSpellbookOnly && !knownSpellSlugs.has(s.slug)) return false;
    if (spec.spellList === "wizard" && !wizardSpellSlugs.has(s.slug)) return false;
    return true;
  });
}
