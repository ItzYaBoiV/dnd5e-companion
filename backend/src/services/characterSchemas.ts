import { z } from "zod";

const AbilityScoreSchema = z.number().int().min(1).max(30);

const ClassLevelRowSchema = z.object({
  classSlug:     z.string().min(1),
  subclassSlug:  z.string().optional(),
  // Stepped multiclass creation can seed non-first classes at 0 and then level them via /level-up.
  levels:        z.number().int().min(0).max(20),
  sortOrder:     z.number().int().min(0).optional(),
});

/**
 * Base shape for create/update. Kept as a plain ZodObject so UpdateCharacterSchema can use .partial().
 * CreateCharacterSchema wraps this with .superRefine() (ZodEffects has no .partial()).
 */
export const CreateCharacterObjectSchema = z.object({
  name:           z.string().min(1).max(100),
  raceSlug:       z.string().min(1),
  subraceSlug:    z.string().optional(),
  classSlug:      z.string().min(1),
  subclassSlug:   z.string().optional(),
  /** Multiclass: ordered segments; levels must sum to `level`. */
  classLevels:    z.array(ClassLevelRowSchema).min(1).max(12).optional(),
  backgroundSlug: z.string().min(1),
  alignment: z.enum([
    "LAWFUL_GOOD","NEUTRAL_GOOD","CHAOTIC_GOOD",
    "LAWFUL_NEUTRAL","TRUE_NEUTRAL","CHAOTIC_NEUTRAL",
    "LAWFUL_EVIL","NEUTRAL_EVIL","CHAOTIC_EVIL",
  ]).default("TRUE_NEUTRAL"),
  level:          z.number().int().min(1).max(20).default(1),
  experiencePoints: z.number().int().min(0).default(0),

  strength:     AbilityScoreSchema,
  dexterity:    AbilityScoreSchema,
  constitution: AbilityScoreSchema,
  intelligence: AbilityScoreSchema,
  wisdom:       AbilityScoreSchema,
  charisma:     AbilityScoreSchema,

  /** Send 0 (or omit via default) to let the server compute from class hit die, Con mod, and level. */
  maxHp:    z.number().int().min(0),
  currentHp: z.number().int().min(0).optional(), // defaults to maxHp

  speed: z.number().int().min(0),

  savingThrowProficiencies: z.array(z.string()).default([]),
  skillProficiencies:       z.array(z.string()).default([]),
  skillExpertise:           z.array(z.string()).default([]),
  weaponProficiencies:      z.array(z.string()).default([]),
  armorProficiencies:       z.array(z.string()).default([]),
  toolProficiencies:        z.array(z.string()).default([]),
  languages:                z.array(z.string()).default([]),

  personalityTraits: z.string().max(50000).default(""),
  ideals:            z.string().max(50000).default(""),
  bonds:             z.string().max(50000).default(""),
  flaws:             z.string().max(50000).default(""),
  backstory:         z.string().max(50000).default(""),

  /** Sheet “details” fields (Notes / appearance); must match Prisma `Character` model. */
  allies:     z.string().max(50000).default(""),
  appearance: z.string().max(50000).default(""),
  age:        z.string().max(200).default(""),
  height:     z.string().max(200).default(""),
  weight:     z.string().max(200).default(""),
  eyes:       z.string().max(200).default(""),
  skin:       z.string().max(200).default(""),
  hair:       z.string().max(200).default(""),

  /** Optional rows added to inventory right after the character is created (SRD gear you pick with your DM). */
  startingInventory: z
    .array(
      z
        .object({
          itemSlug: z.string().optional(),
          customName: z.string().optional(),
          quantity: z.number().int().min(1).default(1),
          notes: z.string().default(""),
        })
        .refine(
          (d) =>
            (d.itemSlug != null && d.itemSlug.trim() !== "") ||
            (d.customName != null && d.customName.trim() !== ""),
          { message: "Each starting item needs itemSlug or customName" },
        ),
    )
    .max(100)
    .optional()
    .default([]),

  spellcastingAbility: z.enum(["intelligence","wisdom","charisma"]).optional(),

  /** PHB-style starting spells from the character creator (validated server-side). */
  startingSpells: z
    .array(
      z.object({
        spellSlug: z.string().min(1),
        prepared: z.boolean().default(false),
        alwaysPrepared: z.boolean().default(false),
      }),
    )
    .max(80)
    .optional()
    .default([]),

  // Starting currency
  copper:   z.number().int().min(0).default(0),
  silver:   z.number().int().min(0).default(0),
  electrum: z.number().int().min(0).default(0),
  gold:     z.number().int().min(0).default(0),
  platinum: z.number().int().min(0).default(0),
});

export const CreateCharacterSchema = CreateCharacterObjectSchema.superRefine((data, ctx) => {
  if (!data.classLevels?.length) return;
  const sum = data.classLevels.reduce((s, r) => s + r.levels, 0);
  if (sum !== data.level) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Multiclass class levels must sum to total level (${data.level}); they sum to ${sum}.`,
      path: ["classLevels"],
    });
  }
});

export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;

export const UpdateCharacterSchema = CreateCharacterObjectSchema.partial().omit({
  // These fields are managed via dedicated endpoints
  maxHp: true,
  currentHp: true,
  startingInventory: true,
  startingSpells: true,
  /** Relation rows use Prisma nested shape; level-up / future routes own this — not raw PATCH. */
  classLevels: true,
});

export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;

const AbilityNameLevelUp = z.enum([
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
]);

/** Optional override for HP gained this level (otherwise server uses average + Con mod, min 1). */
export const LevelUpSchema = z
  .object({
    hpIncrease: z.number().int().min(1).max(999).optional(),
    /** Required when the character has more than one class row — the class gaining a level. */
    classSlug: z.string().min(1).optional(),
    /** When this class hits its subclass milestone (see SUBCLASS_CHOICE_CLASS_LEVEL). */
    subclassSlug: z.string().min(1).optional(),
    /** Add class / subclass features from the guided level-up flow (deduped by name). */
    grantFeatures: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().max(20000).default(""),
          source: z.string().max(50).default("class"),
        }),
      )
      .max(40)
      .optional(),
    learnSpells: z
      .array(
        z.object({
          spellSlug: z.string().min(1),
          prepared: z.boolean().optional(),
          alwaysPrepared: z.boolean().optional(),
        }),
      )
      .max(30)
      .optional(),
    /** PHB-style ASI: total +2 split across one or two abilities (only when this class tier grants ASI). */
    abilityScoreImprovement: z
      .array(
        z.object({
          ability: AbilityNameLevelUp,
          increase: z.union([z.literal(1), z.literal(2)]),
        }),
      )
      .max(2)
      .optional(),
  })
  .default({});

export type LevelUpInput = z.infer<typeof LevelUpSchema>;

export const HpChangeSchema = z.object({
  type: z.enum(["damage", "heal", "temporary", "set"]),
  amount: z.number().int().min(0),
});

export type HpChangeInput = z.infer<typeof HpChangeSchema>;

export const DeathSaveSchema = z.object({
  result: z.enum(["success", "failure"]),
  natural20: z.boolean().default(false),
});

export type DeathSaveInput = z.infer<typeof DeathSaveSchema>;

export const RestSchema = z.object({
  type: z.enum(["short", "long"]),
  hitDiceToSpend: z.number().int().min(0).default(0),
  /** Multiclass short rest: which class hit dice to spend (amounts must sum to hitDiceToSpend). */
  hitDiceFrom: z
    .array(
      z.object({
        characterClassLevelId: z.string().min(1),
        amount: z.number().int().min(1),
      }),
    )
    .optional(),
});

export type RestInput = z.infer<typeof RestSchema>;

export const AddFeatureSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(20000).default(""),
  source:      z.string().max(50).default("custom"),
  uses:        z.number().int().min(0).nullable().optional(),
  usesMax:     z.number().int().min(0).nullable().optional(),
  recharge:    z.string().max(50).nullable().optional(),
});

export type AddFeatureInput = z.infer<typeof AddFeatureSchema>;

export const SpellSlotSchema = z.object({
  action: z.enum(["use", "recover", "set"]),
  amount: z.number().int().min(0).default(1),
});

export type SpellSlotInput = z.infer<typeof SpellSlotSchema>;

export const AddConditionSchema = z.object({
  conditionSlug: z.string().min(1),
  notes:         z.string().default(""),
});

export type AddConditionInput = z.infer<typeof AddConditionSchema>;

export const AddInventorySchema = z.object({
  itemSlug:    z.string().optional(),
  customName:  z.string().optional(),
  quantity:    z.number().int().min(1).default(1),
  notes:       z.string().default(""),
}).refine(
  (d) => d.itemSlug !== undefined || d.customName !== undefined,
  { message: "Must provide either itemSlug or customName" }
);

export type AddInventoryInput = z.infer<typeof AddInventorySchema>;

export const UpdateInventorySchema = z.object({
  quantity: z.number().int().min(0).optional(),
  equipped: z.boolean().optional(),
  attuned:  z.boolean().optional(),
  notes:    z.string().optional(),
});

export type UpdateInventoryInput = z.infer<typeof UpdateInventorySchema>;

export const AddSpellSchema = z.object({
  spellSlug:      z.string().min(1),
  prepared:       z.boolean().default(false),
  alwaysPrepared: z.boolean().default(false),
});

export type AddSpellInput = z.infer<typeof AddSpellSchema>;

export const UpdateSpellSchema = z.object({
  prepared:       z.boolean().optional(),
  alwaysPrepared: z.boolean().optional(),
});

export type UpdateSpellInput = z.infer<typeof UpdateSpellSchema>;
