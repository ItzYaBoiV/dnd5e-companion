import { useEffect, useState } from "react";
import type { CharacterDraft, CreationLevelUpPayload } from "@/types/dnd";
import { ALIGNMENT_LABELS } from "@/types/dnd";
import { defaultMulticlassLevelOrder } from "@/lib/multiclassLevelPlan";

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

function clampLevel(n: number): number {
  if (Number.isNaN(n) || n < 1) return 1;
  if (n > 20) return 20;
  return n;
}

export default function Step1_BasicInfo({ draft, updateDraft, onNext }: Props) {
  const valid = draft.name.trim().length > 0;
  const [levelStr, setLevelStr] = useState(String(draft.level));

  useEffect(() => {
    setLevelStr(String(draft.level));
  }, [draft.level]);

  /** Normalize the level field into `draft` (call on blur and before leaving this step). */
  const syncLevelFromField = () => {
    let n = parseInt(levelStr, 10);
    if (levelStr.trim() === "" || Number.isNaN(n)) n = 1;
    n = clampLevel(n);
    setLevelStr(String(n));
    const changed = n !== draft.level;
    const levelUpLen = Math.max(0, n - 1);
    const prevUps = draft.creationLevelUps ?? [];
    const nextUps: CreationLevelUpPayload[] = prevUps.slice(0, levelUpLen);
    while (nextUps.length < levelUpLen) nextUps.push({});

    const needMcOrder = draft.useMulticlass && n > 1 ? levelUpLen : 0;
    let multiclassLevelOrder = [...(draft.multiclassLevelOrder ?? [])];
    if (needMcOrder === 0) {
      multiclassLevelOrder = [];
    } else {
      multiclassLevelOrder = multiclassLevelOrder.slice(0, needMcOrder);
      const first =
        draft.multiclassFirstClassSlug.trim() ||
        draft.classLevels.find((r) => r.classSlug.trim() && r.levels >= 1)?.classSlug.trim() ||
        "";
      if (first) {
        const suggested = defaultMulticlassLevelOrder(draft.classLevels, first, n);
        while (multiclassLevelOrder.length < needMcOrder) {
          multiclassLevelOrder.push(suggested[multiclassLevelOrder.length] ?? "");
        }
      }
    }

    updateDraft({
      level: n,
      multiclassLevelOrder,
      ...(changed
        ? {
            startingCantripSlugs: [],
            startingLeveledSlugs: [],
            startingWizardPreparedSlugs: [],
            multiclassSpellSegments: {},
            creationLevelUps: nextUps,
          }
        : { creationLevelUps: nextUps }),
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="dnd-label block mb-2">Character Name *</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          className="input-field w-full text-lg"
          placeholder="Enter your character's name"
          spellCheck
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="dnd-label block mb-2">Alignment</label>
          <select
            value={draft.alignment}
            onChange={(e) => updateDraft({ alignment: e.target.value as any })}
            className="input-field w-full"
          >
            {Object.entries(ALIGNMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="dnd-label block mb-2">Starting Level (1–20)</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={levelStr}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d{1,2}$/.test(v)) setLevelStr(v);
            }}
            onBlur={syncLevelFromField}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="input-field w-full"
            aria-label="Starting level"
          />
          <p className="text-xs text-gray-600 mt-1">You can clear the field and type a new level; empty becomes 1.</p>
        </div>
      </div>

      <div className="flex justify-stretch sm:justify-end pt-4">
        <button
          type="button"
          onClick={() => {
            syncLevelFromField();
            onNext();
          }}
          disabled={!valid}
          className="btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed px-8"
        >
          Next: Choose Race
        </button>
      </div>
    </div>
  );
}
