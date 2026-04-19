-- Warlock pact vs spellcasting pools: allow two rows per spell level.
ALTER TABLE "SpellSlot" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'spellcasting';

-- Replace unique (characterId, level) with (characterId, level, source)
ALTER TABLE "SpellSlot" DROP CONSTRAINT IF EXISTS "SpellSlot_characterId_level_key";
DROP INDEX IF EXISTS "SpellSlot_characterId_level_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SpellSlot_characterId_level_source_key" ON "SpellSlot"("characterId", "level", "source");
