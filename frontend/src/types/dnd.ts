// ============================================================
// dnd.ts — All D&D 5e TypeScript types
// These mirror the Prisma schema and API response shapes.
// ============================================================

export type AbilityName = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
export type AbilityScores = Record<AbilityName, number>;
export type AbilityModifiers = Record<AbilityName, number>;

export type Alignment =
  | "LAWFUL_GOOD" | "NEUTRAL_GOOD" | "CHAOTIC_GOOD"
  | "LAWFUL_NEUTRAL" | "TRUE_NEUTRAL" | "CHAOTIC_NEUTRAL"
  | "LAWFUL_EVIL" | "NEUTRAL_EVIL" | "CHAOTIC_EVIL";

export const ALIGNMENT_LABELS: Record<Alignment, string> = {
  LAWFUL_GOOD:    "Lawful Good",
  NEUTRAL_GOOD:   "Neutral Good",
  CHAOTIC_GOOD:   "Chaotic Good",
  LAWFUL_NEUTRAL: "Lawful Neutral",
  TRUE_NEUTRAL:   "True Neutral",
  CHAOTIC_NEUTRAL:"Chaotic Neutral",
  LAWFUL_EVIL:    "Lawful Evil",
  NEUTRAL_EVIL:   "Neutral Evil",
  CHAOTIC_EVIL:   "Chaotic Evil",
};

export const ABILITY_NAMES: AbilityName[] = [
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
];

export const ABILITY_LABELS: Record<AbilityName, { full: string; abbr: string }> = {
  strength:     { full: "Strength",     abbr: "STR" },
  dexterity:    { full: "Dexterity",    abbr: "DEX" },
  constitution: { full: "Constitution", abbr: "CON" },
  intelligence: { full: "Intelligence", abbr: "INT" },
  wisdom:       { full: "Wisdom",       abbr: "WIS" },
  charisma:     { full: "Charisma",     abbr: "CHA" },
};

export const SKILL_NAMES = [
  "acrobatics", "animal-handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

export const SKILL_LABELS: Record<SkillName, string> = {
  "acrobatics":      "Acrobatics",
  "animal-handling": "Animal Handling",
  "arcana":          "Arcana",
  "athletics":       "Athletics",
  "deception":       "Deception",
  "history":         "History",
  "insight":         "Insight",
  "intimidation":    "Intimidation",
  "investigation":   "Investigation",
  "medicine":        "Medicine",
  "nature":          "Nature",
  "perception":      "Perception",
  "performance":     "Performance",
  "persuasion":      "Persuasion",
  "religion":        "Religion",
  "sleight-of-hand": "Sleight of Hand",
  "stealth":         "Stealth",
  "survival":        "Survival",
};

// ── Computed Stats (returned from API) ────────────────────────────
export interface SkillResult {
  ability:    AbilityName;
  modifier:   number;
  proficient: boolean;
  expertise:  boolean;
  bonus:      number;
}

export interface SavingThrowResult {
  modifier:   number;
  proficient: boolean;
  bonus:      number;
}

export interface WeaponAttackSummary {
  inventoryItemId: string;
  name: string;
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  damageFormula: string;
  damageType: string;
  abilityUsed: AbilityName;
  isProficient: boolean;
  rangeLabel: string;
  notes: string;
}

export interface ClassLevelDetail {
  id: string;
  classSlug: string;
  subclassSlug: string | null;
  levels: number;
  hitDiceUsed: number;
  sortOrder: number;
  hitDie: number;
  hitDiceAvailable: number;
}

export interface ComputedStats {
  modifiers:            AbilityModifiers;
  proficiencyBonus:     number;
  skills:               Record<SkillName, SkillResult>;
  savingThrows:         Record<AbilityName, SavingThrowResult>;
  armorClass:           number;
  /** Body armor name when equipped (SRD item); null if unarmored. */
  armorSource:          string | null;
  shieldEquipped:       boolean;
  stealthDisadvantageFromArmor: boolean;
  /** Equipped SRD weapons with attack/damage formulas. */
  weaponAttacks:        WeaponAttackSummary[];
  initiative:           number;
  passivePerception:    number;
  passiveInsight:       number;
  passiveInvestigation: number;
  carryingCapacity:     number;
  pushDragLift:         number;
  spellSaveDc:          number | null;
  spellAttackBonus:     number | null;
  /** e.g. "fighter 3 / wizard 2" */
  classSummary:         string;
  isMulticlass:           boolean;
  /** PHB multiclass spellcasting level (excludes warlock pact pool). */
  multiclassSpellcasterLevel: number;
  classLevelsDetailed:  ClassLevelDetail[];
}

// ── Character ─────────────────────────────────────────────────────
export interface SpellSlot {
  id:          string;
  characterId: string;
  level:       number;
  total:       number;
  used:        number;
}

export interface CharacterSpell {
  id:             string;
  characterId:    string;
  spellSlug:      string;
  prepared:       boolean;
  alwaysPrepared: boolean;
}

export interface InventoryItem {
  id:          string;
  characterId: string;
  itemSlug:    string | null;
  customName:  string | null;
  quantity:    number;
  equipped:    boolean;
  attuned:     boolean;
  notes:       string;
}

export interface CharacterFeature {
  id:          string;
  characterId: string;
  name:        string;
  description: string;
  source:      string;
  uses:        number | null;
  usesMax:     number | null;
  recharge:    string | null;
}

export interface CharacterCondition {
  id:            string;
  characterId:   string;
  conditionSlug: string;
  notes:         string;
}

export interface CharacterNote {
  id:          string;
  characterId: string;
  title:       string;
  content:     string;
  category:    string;
  createdAt:   string;
  updatedAt:   string;
}

export interface Character {
  id:              string;
  name:            string;
  raceSlug:        string;
  subraceSlug:     string | null;
  classSlug:       string;
  subclassSlug:    string | null;
  backgroundSlug:  string;
  alignment:       Alignment;
  level:           number;
  experiencePoints: number;

  strength:        number;
  dexterity:       number;
  constitution:    number;
  intelligence:    number;
  wisdom:          number;
  charisma:        number;

  maxHp:           number;
  currentHp:       number;
  temporaryHp:     number;
  hitDieType:      number;
  hitDiceMax:      number;
  hitDiceUsed:     number;

  deathSaveSuccesses: number;
  deathSaveFailures:  number;
  isStabilized:       boolean;

  speed:            number;
  inspiration:      boolean;
  initiativeBonus:  number;
  acBonus:          number;

  savingThrowProficiencies: string[];
  skillProficiencies:       string[];
  skillExpertise:           string[];
  weaponProficiencies:      string[];
  armorProficiencies:       string[];
  toolProficiencies:        string[];
  languages:                string[];

  personalityTraits: string;
  ideals:            string;
  bonds:             string;
  flaws:             string;
  backstory:         string;
  allies:            string;
  appearance:        string;
  age:               string;
  height:            string;
  weight:            string;
  eyes:              string;
  skin:              string;
  hair:              string;

  /** Optional photo or image for map tokens and character list. */
  tokenPortraitUrl?: string | null;

  copper:   number;
  silver:   number;
  electrum: number;
  gold:     number;
  platinum: number;

  spellcastingAbility: AbilityName | null;
  spellcastingFocus:   string | null;

  inventory:  InventoryItem[];
  spells:     CharacterSpell[];
  spellSlots: SpellSlot[];
  features:   CharacterFeature[];
  conditions: CharacterCondition[];
  notes:      CharacterNote[];

  computed: ComputedStats;

  /** Raw per-class rows (same order as creation). Also see computed.classLevelsDetailed. */
  classLevels?: {
    id: string;
    classSlug: string;
    subclassSlug: string | null;
    levels: number;
    hitDiceUsed: number;
    sortOrder: number;
  }[];

  createdAt: string;
  updatedAt: string;
}

export interface CharacterSummary {
  id:        string;
  name:      string;
  raceSlug:  string;
  classSlug: string;
  level:     number;
  currentHp: number;
  maxHp:     number;
  updatedAt: string;
  tokenPortraitUrl?: string | null;
}

// ── SRD Reference Types ───────────────────────────────────────────
export interface RaceTrait {
  id:          string;
  raceSlug:    string;
  name:        string;
  description: string;
}

export interface Subrace {
  slug:           string;
  raceSlug:       string;
  name:           string;
  abilityBonuses: AbilityBonus[];
  traits:         RaceTrait[];
}

export interface AbilityBonus {
  ability: AbilityName;
  bonus:   number;
}

export interface Race {
  slug:           string;
  name:           string;
  speed:          number;
  size:           string;
  abilityBonuses: AbilityBonus[];
  traits:         RaceTrait[];
  subraces:       Subrace[];
  languages:      string[];
  source:         string;
}

export interface ClassFeature {
  id:          string;
  classSlug:   string;
  name:        string;
  level:       number;
  description: string;
  choices:     unknown | null;
  usesFormula: string | null;
}

export interface Subclass {
  slug:      string;
  classSlug: string;
  name:      string;
  features:  { id: string; name: string; level: number; description: string }[];
}

export interface DndClass {
  slug:                  string;
  name:                  string;
  hitDie:                number;
  primaryAbility:        string;
  savingThrows:          string[];
  armorProficiencies:    string[];
  weaponProficiencies:   string[];
  toolProficiencies:     string[];
  /** Open5e text for 1st-level class equipment (includes typical a/b/c choices). */
  startingEquipment?:    string;
  skillChoices:          string[];
  skillChoiceCount:      number;
  spellcastingAbility:   AbilityName | null;
  spellcastingType:      string | null;
  spellSlotsPerLevel:    Record<string, number[]>;
  cantripsKnown:         Record<string, number> | null;
  spellsKnown:           Record<string, number | null> | null;
  features:              ClassFeature[];
  subclasses:            Subclass[];
  source:                string;
}

export interface Background {
  slug:               string;
  name:               string;
  skillProficiencies: string[];
  toolProficiencies:  string[];
  languages:          number;
  equipment:          string;
  feature:            { name: string; description: string };
  suggestedTraits:    string[];
  suggestedIdeals:    string[];
  suggestedBonds:     string[];
  suggestedFlaws:     string[];
  source:             string;
}

export interface SpellComponents {
  verbal:    boolean;
  somatic:   boolean;
  material:  boolean;
  materials: string;
}

export interface Spell {
  slug:          string;
  name:          string;
  level:         number;
  school:        string;
  castingTime:   string;
  range:         string;
  components:    SpellComponents;
  duration:      string;
  concentration: boolean;
  ritual:        boolean;
  description:   string;
  higherLevels:  string | null;
  classes:       string[];
  source:        string;
}

export interface Item {
  slug:        string;
  name:        string;
  category:    string;
  subcategory: string | null;
  description: string;
  damageDice:  string | null;
  damageType:  string | null;
  weaponRange: { normal: number; long: number } | null;
  properties:  string[];
  armorClass:  number | null;
  stealthDis:  boolean;
  strengthReq: number | null;
  weight:      number | null;
  cost:        { quantity: number; unit: string } | null;
  magical:     boolean;
  requiresAttunement:     boolean;
  attunementRequirement:  string | null;
  source:      string;
}

export interface Feat {
  slug:         string;
  name:         string;
  prerequisite: string | null;
  description:  string;
  source:       string;
}

export interface Condition {
  slug:        string;
  name:        string;
  description: string;
}

// ── API response shapes ───────────────────────────────────────────
export interface ApiError {
  error:   string;
  code?:   string;
  details?: unknown;
}

export type HpChangeType = "damage" | "heal" | "temporary" | "set";
export type RestType = "short" | "long";
export type AdvantageType = "normal" | "advantage" | "disadvantage";

export interface RollResult {
  roll:       number;
  bonus:      number;
  total:      number;
  d1:         number;
  d2:         number;
  advantage:  AdvantageType;
}

export interface AttackRollResult extends RollResult {
  attackBonus: number;
  isCrit:      boolean;
  isFumble:    boolean;
  damageDice:  string;
  damageBonus: number;
  damageType:  string;
  abilityUsed: AbilityName;
  isProficient: boolean;
}

// ── Character creation wizard state ──────────────────────────────
export interface StartingInventoryDraftRow {
  itemSlug?: string;
  /** Resolved catalog name for display (kit / browse). Not sent to create-character API. */
  displayName?: string;
  customName?: string;
  quantity: number;
  /** When true, item is created as equipped (armor, shield, weapons). */
  equipped?: boolean;
}

/** One segment of a multiclass build (order = level-up order for HP). */
export interface ClassLevelDraftRow {
  classSlug: string;
  subclassSlug: string;
  levels: number;
}

/** Saved choices for one character level increase during creation (mirrors level-up API body). */
export type CreationLevelUpPayload = {
  hpIncrease?: number;
  classSlug?: string;
  subclassSlug?: string;
  grantFeatures?: { name: string; description?: string; source?: string }[];
  learnSpells?: { spellSlug: string; prepared?: boolean; alwaysPrepared?: boolean }[];
  abilityScoreImprovement?: { ability: AbilityName; increase: 1 | 2 }[];
};

export interface CharacterDraft {
  step:           number;
  name:           string;
  raceSlug:       string;
  subraceSlug:    string;
  classSlug:      string;
  subclassSlug:   string;
  /** When true, use classLevels (levels must sum to `level`). */
  useMulticlass:  boolean;
  classLevels:    ClassLevelDraftRow[];
  backgroundSlug: string;
  alignment:      Alignment;
  level:          number;
  abilityMethod:  "standard_array" | "point_buy" | "manual";
  scores:         AbilityScores;
  // Skills chosen during creation
  chosenSkills:   string[];
  /** Set from class when applicable (SRD casters). */
  spellcastingAbility?: AbilityName;
  // Proficiencies from race/class/background (auto-added)
  savingThrows:   string[];
  // Personality
  personalityTraits: string;
  ideals:            string;
  bonds:             string;
  flaws:             string;
  backstory:         string;
  // Starting gear
  startingGoldRoll: number;
  useStartingEquipment: boolean;
  /** Lines to create as inventory rows when the character is saved (optional). */
  startingInventoryDraft: StartingInventoryDraftRow[];

  /** Starting spells step (PHB counts); wizard uses `startingWizardPreparedSlugs` as a subset of leveled slugs. */
  startingCantripSlugs: string[];
  startingLeveledSlugs: string[];
  startingWizardPreparedSlugs: string[];

  /** Multiclass: spell picks per class segment (`${index}-${classSlug}`), keyed same as creationSpellGuide. */
  multiclassSpellSegments: Record<
    string,
    { cantripSlugs: string[]; leveledSlugs: string[]; wizardPreparedSlugs: string[] }
  >;

  /**
   * Level &gt; 1: one entry per level gained after 1st (index 0 → reach level 2, …).
   * Multiclass: each payload should include `classSlug` for the class that gains that level.
   */
  creationLevelUps: CreationLevelUpPayload[];

  /** Multiclass + level &gt; 1: class slug that received 1st character level (others start at 0 in DB). */
  multiclassFirstClassSlug: string;
  /** Multiclass + level &gt; 1: length = level − 1; class slug leveled at character levels 2…L in order. */
  multiclassLevelOrder: string[];
}

export const DEFAULT_DRAFT: CharacterDraft = {
  step:           1,
  name:           "",
  raceSlug:       "",
  subraceSlug:    "",
  classSlug:      "",
  subclassSlug:   "",
  useMulticlass:  false,
  classLevels:    [],
  backgroundSlug: "",
  alignment:      "TRUE_NEUTRAL",
  level:          1,
  abilityMethod:  "standard_array",
  scores: { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 },
  chosenSkills:   [],
  savingThrows:   [],
  personalityTraits: "",
  ideals:            "",
  bonds:             "",
  flaws:             "",
  backstory:         "",
  startingGoldRoll:  0,
  useStartingEquipment: true,
  startingInventoryDraft: [],
  startingCantripSlugs: [],
  startingLeveledSlugs: [],
  startingWizardPreparedSlugs: [],
  multiclassSpellSegments: {},
  creationLevelUps: [],
  multiclassFirstClassSlug: "",
  multiclassLevelOrder: [],
};

// ============================================================
// MONSTERS
// ============================================================

export interface MonsterSpeed {
  walk: number; fly: number; swim: number; climb: number; burrow: number;
}

export interface MonsterAction {
  name:        string;
  desc:        string;
  attackBonus?: number;
  damageDice?:  string;
  damageType?:  string;
}

export interface MonsterSummary {
  slug:            string;
  name:            string;
  size:            string;
  type:            string;
  subtype:         string | null;
  challengeRating: number;
  xp:              number;
  armorClass:      number;
  hitPoints:       number;
  hitDice:         string;
  alignment:       string | null;
}

export interface Monster extends MonsterSummary {
  armorType:            string | null;
  speed:                MonsterSpeed;
  strength:             number;
  dexterity:            number;
  constitution:         number;
  intelligence:         number;
  wisdom:               number;
  charisma:             number;
  proficiencyBonus:     number;
  savingThrows:         Record<string, number> | null;
  skills:               Record<string, number> | null;
  damageResistances:    string[];
  damageImmunities:     string[];
  damageVulnerabilities:string[];
  conditionImmunities:  string[];
  senses:               Record<string, unknown> | null;
  languages:            string[];
  specialAbilities:     { name: string; desc: string }[] | null;
  actions:              MonsterAction[];
  legendaryActions:     { name: string; desc: string; cost?: number }[] | null;
  legendaryActionsCount:number | null;
  reactions:            { name: string; desc: string }[] | null;
  bonusActions:         { name: string; desc: string }[] | null;
  environments:         string[];
}

// ============================================================
// ADVENTURES (Dungeons / Cities / Stories)
// ============================================================

export type AdventureType = "DUNGEON" | "CITY" | "WILDERNESS" | "CASTLE" | "TAVERN" | "SHIP";

export interface MapRoom {
  id:          number;
  name:        string;
  width:       number;
  height:      number;
  x:           number;
  y:           number;
  type:        "entrance" | "corridor" | "chamber" | "boss" | "treasure" | "trap" | "rest" | "puzzle" | "shop" | "tavern" | "temple" | "plaza";
  description: string;
  readAloud:   string;
  lighting:    "bright" | "dim" | "dark";
  encounters:  { monsterSlug: string; count: number; notes: string }[];
  treasure:    { gold: number; items: string[]; notes: string };
  trap:        { name: string; dc: number; damage: string } | null;
  secrets:     string | null;
  exits:       number[];
}

export interface MapCorridor {
  from:      number;
  to:        number;
  direction: "north" | "south" | "east" | "west";
  locked:    boolean;
  trapped:   boolean;
}

export interface AdventureSummary {
  id:          string;
  name:        string;
  type:        AdventureType;
  theme:       string;
  difficulty:  string;
  minLevel:    number;
  maxLevel:    number;
  description: string;
  tags:        string[];
  aiGenerated: boolean;
  createdAt:   string;
}

export interface Adventure extends AdventureSummary {
  story:        string;
  introduction: string;
  resolution:   string;
  mapData:      { rooms: MapRoom[]; corridors: MapCorridor[] };
  dmNotes:      string;
  updatedAt:    string;
}

// ============================================================
// SESSIONS (DM Play Mode)
// ============================================================

export interface SessionPartyMember {
  characterId: string; name: string; classSlug: string; level: number;
  currentHp: number; maxHp: number; tempHp: number; armorClass: number; conditions: string[];
}

export interface InitiativeCombatant {
  id: string; name: string; initiative: number; type: "player" | "monster";
  isActive: boolean; isDead: boolean; hp: number; maxHp: number;
  monsterSlug?: string; notes: string;
}

export interface SessionLogEntry {
  timestamp: string; type: "combat" | "info" | "roll" | "narrative"; message: string;
}

export interface SessionSummary {
  id: string; name: string; active: boolean; adventureId: string | null;
  createdAt: string; updatedAt: string;
}

export interface Session extends SessionSummary {
  party:      SessionPartyMember[];
  initiative: InitiativeCombatant[] | null;
  log:        SessionLogEntry[];
  currentRoom:number | null;
}

export interface RollGuide {
  label:  string;
  dice:   string;
  bonus:  number;
  note:   string;
  target: string;
}
