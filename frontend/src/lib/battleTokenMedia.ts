import type { BattleToken } from "@/lib/playerMapBroadcast";
import type { Character } from "@/types/dnd";
import type { Combatant } from "@/store/sessionStore";
import { classTokenSprite, monsterTokenSprite } from "@/lib/tokenSprites";

/**
 * Portrait (if any) or pixel sprite for a combatant — merged into map tokens at render time.
 */
export function battleTokenExtras(
  c: Combatant,
  party: Character[],
): Pick<BattleToken, "portraitUrl" | "spriteUrl"> {
  if (c.type === "player" && c.characterId) {
    const ch = party.find((p) => p.id === c.characterId);
    if (!ch) return {};
    if (ch.tokenPortraitUrl) return { portraitUrl: ch.tokenPortraitUrl };
    return { spriteUrl: classTokenSprite(ch.classSlug) };
  }
  if (c.type === "monster") {
    return { spriteUrl: monsterTokenSprite(c.monsterSlug) };
  }
  return {};
}
