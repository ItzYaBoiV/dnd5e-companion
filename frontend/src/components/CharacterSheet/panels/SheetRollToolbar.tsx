import { useSheetRoll } from "@/context/SheetRollContext";
import type { AdvantageType } from "@/types/dnd";
import { Dices } from "lucide-react";

const ADV_OPTIONS: { id: AdvantageType; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "advantage", label: "Adv." },
  { id: "disadvantage", label: "Dis." },
];

export default function SheetRollToolbar() {
  const { advantage, setAdvantage } = useSheetRoll();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 border-b border-dnd-border/60 bg-dnd-panel/80">
      <div className="flex items-center gap-2 text-[0.65rem] text-stone-500">
        <Dices size={14} className="text-dnd-gold/90 shrink-0" aria-hidden />
        <span>
          Tap the die beside a skill, save, or initiative to roll. Use <span className="text-stone-400">?</span> for
          the formula.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[0.65rem] font-display uppercase tracking-widest text-stone-500 shrink-0">d20</span>
        <div className="inline-flex rounded border border-dnd-border overflow-hidden">
          {ADV_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setAdvantage(o.id)}
              className={`px-2 py-0.5 text-[0.65rem] font-display font-semibold border-l border-dnd-border first:border-l-0 ${
                advantage === o.id
                  ? "bg-dnd-red/85 text-parchment"
                  : "text-stone-500 hover:bg-dnd-dark hover:text-stone-300"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
