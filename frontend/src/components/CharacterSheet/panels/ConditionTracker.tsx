import { useState } from "react";
import type { Character, Condition } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { useReferenceStore } from "@/store/referenceStore";
import { ConditionBadge, SectionHeader } from "@/components/common";
import { Plus } from "lucide-react";

interface Props {
  character: Character;
}

export default function ConditionTracker({ character }: Props) {
  const { addCondition, removeCondition } = useCharacterStore();
  const { conditions, loadConditions }   = useReferenceStore();
  const [adding, setAdding]              = useState(false);
  const [selected, setSelected]          = useState("");

  const handleOpen = () => {
    loadConditions();
    setAdding(true);
  };

  const handleAdd = () => {
    if (selected) {
      addCondition(selected);
      setSelected("");
      setAdding(false);
    }
  };

  const activeConditionSlugs = character.conditions.map((c) => c.conditionSlug);

  return (
    <div className="dnd-card">
      <SectionHeader
        title="Conditions"
        action={
          <button onClick={handleOpen} className="btn-ghost flex items-center gap-1 text-xs">
            <Plus size={12} /> Add
          </button>
        }
      />

      {character.conditions.length === 0 ? (
        <p className="text-xs text-gray-600 italic">No active conditions</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {character.conditions.map((cond) => {
            const info = conditions.find((c: Condition) => c.slug === cond.conditionSlug);
            return (
              <ConditionBadge
                key={cond.id}
                name={info?.name ?? cond.conditionSlug}
                onRemove={() => removeCondition(cond.id)}
              />
            );
          })}
        </div>
      )}

      {adding && (
        <div className="mt-3 flex gap-2">
          <select
            className="input-field flex-1 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select condition...</option>
            {conditions
              .filter((c: Condition) => !activeConditionSlugs.includes(c.slug))
              .map((c: Condition) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
          </select>
          <button onClick={handleAdd} className="btn-primary text-sm px-3">Add</button>
          <button onClick={() => setAdding(false)} className="btn-secondary text-sm px-3">Cancel</button>
        </div>
      )}
    </div>
  );
}
