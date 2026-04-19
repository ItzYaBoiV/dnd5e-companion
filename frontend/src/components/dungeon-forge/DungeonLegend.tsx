/** Legend rows match `LOCATION_GLYPHS` in DungeonForgeImpl (floor/wall/corr/water/road). */

const legendByType: Record<string, Array<{ symbol: string; label: string; color?: string }>> = {
  dungeon: [
    { symbol: "#", color: "#4a4845", label: "Wall" },
    { symbol: "·", color: "#252220", label: "Floor / hall" },
    { symbol: "~", color: "#1a4a7a", label: "Water" },
    { symbol: ":", color: "#444", label: "Road (outdoor)" },
    { symbol: "▣", color: "#c8a020", label: "Door" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  town: [
    { symbol: "#", color: "#4a4845", label: "Building shell" },
    { symbol: "·", color: "#252220", label: "Floor / yard" },
    { symbol: ":", color: "#444", label: "Road" },
    { symbol: "~", color: "#1a4a7a", label: "Water" },
    { symbol: "▣", color: "#c8a020", label: "Door" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  castle: [
    { symbol: "█", color: "#4a4845", label: "Wall" },
    { symbol: "·", color: "#252220", label: "Floor / yard" },
    { symbol: "~", color: "#1a4a7a", label: "Water" },
    { symbol: ":", color: "#444", label: "Road" },
    { symbol: "▣", color: "#c8a020", label: "Door / gate" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  graveyard: [
    { symbol: "†", color: "#5a5d6a", label: "Wall / fence" },
    { symbol: ",", color: "#3a3c42", label: "Ground" },
    { symbol: "~", color: "#1a4a7a", label: "Water" },
    { symbol: "▣", color: "#c8a020", label: "Gate / door" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  swamp: [
    { symbol: "≈", color: "#223218", label: "Wall / thicket" },
    { symbol: "·", color: "#2a3a1a", label: "Dry ground" },
    { symbol: "~", color: "#2a5a48", label: "Bridge span" },
    { symbol: "░", color: "#1a3a28", label: "Water" },
    { symbol: "▣", color: "#3a5a2a", label: "Door" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  cave: [
    { symbol: "#", color: "#4a4845", label: "Rock wall" },
    { symbol: ".", color: "#243540", label: "Cavern floor" },
    { symbol: "·", color: "#333", label: "Corridor" },
    { symbol: "~", color: "#2a8aaa", label: "Water" },
    { symbol: "▣", color: "#6ab090", label: "Door" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  temple: [
    { symbol: "║", color: "#6a6050", label: "Wall / column" },
    { symbol: ":", color: "#5a5048", label: "Floor tile" },
    { symbol: "·", color: "#4a4038", label: "Corridor" },
    { symbol: "~", color: "#3a5a8a", label: "Water / font" },
    { symbol: "▣", color: "#d4a820", label: "Door" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  sewer: [
    { symbol: "=", color: "#3a4a3a", label: "Wall / grate" },
    { symbol: "·", color: "#2e4235", label: "Walkway" },
    { symbol: "≈", color: "#0a5545", label: "Channel water" },
    { symbol: "▣", color: "#5a8060", label: "Door" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  road: [
    { symbol: "†", color: "#2a3828", label: "Wall / brush" },
    { symbol: ",", color: "#3a4a30", label: "Clearing" },
    { symbol: ":", color: "#4a5838", label: "Road" },
    { symbol: "~", color: "#1a4060", label: "Water" },
    { symbol: "▣", color: "#a87830", label: "Door" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  volcanic_lair: [
    { symbol: "*", color: "#4a1808", label: "Obsidian wall" },
    { symbol: ".", color: "#6a2010", label: "Ash floor" },
    { symbol: "·", color: "#5a1810", label: "Corridor" },
    { symbol: "≈", color: "#cc3300", label: "Lava / magma" },
    { symbol: "▣", color: "#aa4400", label: "Door" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
  fey_forest: [
    { symbol: "#", color: "#0a2a10", label: "Thorn / wall" },
    { symbol: ",", color: "#1a4a20", label: "Moss floor" },
    { symbol: "'", color: "#2a5a28", label: "Corridor" },
    { symbol: "~", color: "#1a6a4a", label: "Pool" },
    { symbol: "▣", color: "#8844cc", label: "Arch / door" },
    { symbol: "<>", color: "#5a8a2a", label: "Stairs" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ],
};

const defaultLegend = legendByType.dungeon!;

/** Compact legend for pixel-tile dungeon map — symbols follow the active location palette. */
export function DungeonLegend({ locationType }: { locationType?: string } = {}) {
  const items = (locationType && legendByType[locationType]) || defaultLegend;

  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1 px-2 py-1 text-xs text-stone-400 border-t border-stone-700"
      role="note"
    >
      {locationType ? (
        <span className="sr-only">Canvas map theme: {locationType}</span>
      ) : null}
      {items.map(({ symbol, color, label }, i) => (
        <span key={`${locationType ?? "default"}-${i}`} className="flex items-center gap-1">
          <span style={{ color, fontFamily: "monospace", fontWeight: "bold" }}>{symbol}</span>
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}
