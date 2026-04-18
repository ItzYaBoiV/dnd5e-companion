/** Compact legend for pixel-tile dungeon map (symbols are illustrative). */
export function DungeonLegend({ locationType }: { locationType?: string } = {}) {
  const items = [
    { symbol: "▓", color: "#4a4845", label: "Wall" },
    { symbol: "·", color: "#252220", label: "Floor" },
    { symbol: "▣", color: "#c8a020", label: "Door" },
    { symbol: "▲", color: "#5a8a2a", label: "Stairs" },
    { symbol: "~", color: "#1a4a7a", label: "Water" },
    { symbol: "①", color: "#2a6a3a", label: "Room" },
    { symbol: "M", color: "#e53", label: "Monster" },
    { symbol: "^", color: "#f80", label: "Trap" },
    { symbol: "!", color: "#8cf", label: "Item" },
  ];

  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1 px-2 py-1 text-xs text-stone-400 border-t border-stone-700"
      role="note"
    >
      {locationType ? (
        <span className="sr-only">Canvas map theme: {locationType}</span>
      ) : null}
      {items.map(({ symbol, color, label }) => (
        <span key={label} className="flex items-center gap-1">
          <span style={{ color, fontFamily: "monospace", fontWeight: "bold" }}>{symbol}</span>
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}
