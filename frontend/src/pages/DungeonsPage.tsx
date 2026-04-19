import DungeonForge from "@/components/dungeon-forge/DungeonForge";

/**
 * Forge-only maps UI. The previous tabbed page (Classic generator, AI health, dungeon/story
 * libraries) is preserved in `DungeonsPage.withAiGenerator.archive.tsx` for reference.
 */
export default function DungeonsPage() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 border-b border-gray-800 bg-dnd-dark px-4 py-3 sm:px-6 sm:py-4">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-dnd-gold">Dungeon Forge</h1>
        <p className="text-xs text-gray-500">Build procedural maps for your table.</p>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <DungeonForge />
      </div>
    </div>
  );
}
