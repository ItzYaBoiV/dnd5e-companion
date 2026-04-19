import type { FeatureOption } from "@/lib/levelUpFormHelpers";

/** Option key for “Humanoids (two races)” favored enemy — triggers race follow-up fields. */
export const HUMANOID_FAVORED_ENEMY_OPTION_KEY = "humanoids-two-races";

export type GrantPickSpec =
  | {
      kind: "options";
      options: FeatureOption[];
      pickCount: number;
      /** When this option is chosen (single-pick grants), require two race names. */
      humanoidRaceFollowUpKey?: typeof HUMANOID_FAVORED_ENEMY_OPTION_KEY;
    }
  | {
      kind: "channel-divinity";
      options: FeatureOption[];
      /** Must select every listed use (Turn Undead + domain options). */
      pickCount: number;
    }
  | {
      kind: "spells";
      pickCount: number;
      /** Inclusive lower bound (0 = cantrips). Defaults to 0 when omitted. */
      minSpellLevel?: number;
      maxSpellLevel: number;
      spellList: "any" | "wizard";
      allowCantrips: boolean;
      /** Spell Mastery / Signature: only spells already on the character (or draft). */
      fromKnownSpellbookOnly: boolean;
      /** Add chosen spells to character spell list (Magical Secrets, Signature Spells). */
      addToSpellbook: boolean;
      alwaysPrepared?: boolean;
    }
  | { kind: "beast-companion"; pickCount: 1 };

export function isOptionsLikeSpec(
  spec: GrantPickSpec,
): spec is Extract<GrantPickSpec, { kind: "options" }> {
  return spec.kind === "options";
}

export function isSpellGrantSpec(spec: GrantPickSpec): spec is Extract<GrantPickSpec, { kind: "spells" }> {
  return spec.kind === "spells";
}

export function isBeastCompanionSpec(
  spec: GrantPickSpec,
): spec is Extract<GrantPickSpec, { kind: "beast-companion" }> {
  return spec.kind === "beast-companion";
}

/** True if this spec should appear in the level-up UI. */
export function isGrantSpecRenderable(spec: GrantPickSpec): boolean {
  switch (spec.kind) {
    case "options":
      return spec.options.length >= spec.pickCount && spec.pickCount > 0;
    case "channel-divinity":
      return spec.options.length > 0 && spec.pickCount === spec.options.length;
    case "spells":
      return spec.pickCount > 0;
    case "beast-companion":
      return true;
    default:
      return false;
  }
}

export function grantPickError(
  spec: GrantPickSpec,
  pickedOptions: string[],
  pickedSpells: string[],
  humanoidRaces: { raceA: string; raceB: string },
): string | null {
  switch (spec.kind) {
    case "channel-divinity":
      return null;
    case "spells": {
      if (pickedSpells.length !== spec.pickCount) return `Pick ${spec.pickCount} spell(s).`;
      if (new Set(pickedSpells).size !== pickedSpells.length) return "Spells must be distinct.";
      return null;
    }
    case "beast-companion":
      if (pickedOptions.length !== 1 || !pickedOptions[0]?.trim()) return "Choose a beast companion.";
      return null;
    case "options": {
      if (pickedOptions.length !== spec.pickCount)
        return spec.pickCount === 1 ? "Pick one option." : `Pick ${spec.pickCount} different options.`;
      if (new Set(pickedOptions).size !== pickedOptions.length) return "Each pick must be distinct.";
      if (
        spec.humanoidRaceFollowUpKey &&
        pickedOptions[0] === HUMANOID_FAVORED_ENEMY_OPTION_KEY
      ) {
        const a = humanoidRaces.raceA.trim();
        const b = humanoidRaces.raceB.trim();
        if (!a || !b) return "Enter two humanoid races.";
        if (a.toLowerCase() === b.toLowerCase()) return "Choose two different humanoid races.";
      }
      return null;
    }
    default:
      return null;
  }
}
