import DungeonForge from "@/components/dungeon-forge/DungeonForge";

/**
 * Forge-only maps UI. The previous tabbed page (Classic generator, AI health, dungeon/story
 * libraries) is preserved in `DungeonsPage.withAiGenerator.archive.tsx` for reference.
 */
export default function DungeonsPage() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-0.5 border-b border-gray-800 bg-dnd-dark px-3 py-2 sm:gap-1 sm:px-6 sm:py-4">
        <h1 className="font-display text-lg font-bold text-dnd-gold sm:text-2xl">Dungeon Forge</h1>
        <p className="text-[11px] text-gray-500 sm:text-xs">Build procedural maps for your table.</p>
      </div>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <DungeonForge />
      </div>
    </div>
  );
}
