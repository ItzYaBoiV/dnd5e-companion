import { useEffect, useState } from "react";
import type { CharacterDraft, AbilityName, AbilityScores } from "@/types/dnd";
import { ABILITY_NAMES, ABILITY_LABELS } from "@/types/dnd";
import {
  ABILITY_SCORE_KID_HELP,
  scoresAfterRace,
  suggestedStandardArrayScores,
} from "@/lib/suggestedAbilityScores";
import { useReferenceStore } from "@/store/referenceStore";
import { clsx } from "clsx";
import { CharacterCreationStepNext } from "./CharacterCreationStepNext";

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
const POINT_BUY_BUDGET = 27;

function multisetMatchesStandardArray(values: number[], expected: number[]): boolean {
  if (values.length !== expected.length) return false;
  const a = [...values].sort((x, y) => x - y);
  const b = [...expected].sort((x, y) => x - y);
  return a.every((v, i) => v === b[i]);
}

function abilityMod(score: number) {
  return Math.floor((score - 10) / 2);
}
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

function initManualText(s: AbilityScores): Record<AbilityName, string> {
  return Object.fromEntries(ABILITY_NAMES.map((a) => [a, String(s[a])])) as Record<AbilityName, string>;
}

export default function Step4_AbilityScores({ draft, updateDraft, onNext }: Props) {
  const { classes, races, loadClasses, loadRaces } = useReferenceStore();
  const [method, setMethod] = useState<"standard_array" | "point_buy" | "manual">(draft.abilityMethod);
  const [manualText, setManualText] = useState<Record<AbilityName, string>>(() => initManualText(draft.scores));
  const [kidTips, setKidTips] = useState(true);
  // For standard array: track which value is assigned to which ability
  const [assignments, setAssignments] = useState<Partial<Record<AbilityName, number>>>({});
  // Which standard array value is currently selected for assignment
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    void loadClasses();
    void loadRaces();
  }, [loadClasses, loadRaces]);

  useEffect(() => {
    if (method !== "standard_array") return;
    setAssignments((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const reconstructed: Partial<Record<AbilityName, number>> = {};
      for (const a of ABILITY_NAMES) {
        const s = draft.scores[a];
        if (STANDARD_ARRAY.includes(s)) reconstructed[a] = s;
      }
      return reconstructed;
    });
  }, [method, draft.scores]);

  const scores = draft.scores;
  const selectedClass = classes.find((c) => c.slug === draft.classSlug);
  const selectedRace = races.find((r) => r.slug === draft.raceSlug);

  const usedPoints = Object.values(scores).reduce((sum, s) => sum + (POINT_BUY_COST[s] ?? 0), 0);
  const remainingPoints = POINT_BUY_BUDGET - usedPoints;

  const updateScore = (ability: AbilityName, value: number) => {
    if (method === "point_buy") {
      const next = { ...scores, [ability]: value };
      const used = ABILITY_NAMES.reduce((sum, a) => sum + (POINT_BUY_COST[next[a]] ?? 0), 0);
      if (used > POINT_BUY_BUDGET) return;
    }
    updateDraft({ scores: { ...scores, [ability]: value } });
  };

  const handleStdAssign = (ability: AbilityName) => {
    if (selected === null) return;
    setAssignments({ ...assignments, [ability]: selected });
    setSelected(null);
    updateDraft({ scores: { ...scores, [ability]: selected } });
  };

  const usedStdValues = Object.values(assignments);

  const applyClassSuggestion = (asPointBuy: boolean) => {
    if (!draft.classSlug || !selectedClass) return;
    const suggested = suggestedStandardArrayScores(
      draft.classSlug,
      selectedClass.primaryAbility ?? "",
    );
    updateDraft({
      scores: suggested,
      abilityMethod: asPointBuy ? "point_buy" : "standard_array",
    });
    setMethod(asPointBuy ? "point_buy" : "standard_array");
    setAssignments(
      Object.fromEntries(ABILITY_NAMES.map((a) => [a, suggested[a]])) as Partial<
        Record<AbilityName, number>
      >,
    );
    setSelected(null);
  };

  const manualScoresEffective: AbilityScores =
    method === "manual"
      ? (() => {
          const out = { ...scores };
          for (const a of ABILITY_NAMES) {
            const raw = manualText[a] ?? "";
            let n = parseInt(raw, 10);
            if (raw.trim() === "" || Number.isNaN(n)) n = 8;
            out[a] = Math.max(1, Math.min(30, n));
          }
          return out;
        })()
      : scores;

  const selectMethod = (m: "standard_array" | "point_buy" | "manual") => {
    if (m === "manual") setManualText(initManualText(scores));
    setMethod(m);
    updateDraft({ abilityMethod: m });
  };

  const isComplete =
    method === "standard_array"
      ? multisetMatchesStandardArray(
          ABILITY_NAMES.map((a) => scores[a]),
          STANDARD_ARRAY,
        )
      : method === "point_buy"
        ? remainingPoints >= 0 &&
          remainingPoints === 0 &&
          ABILITY_NAMES.every((a) => scores[a] >= 8 && scores[a] <= 15)
        : ABILITY_NAMES.every((a) => manualScoresEffective[a] >= 1 && manualScoresEffective[a] <= 30);

  const handleNextStep = () => {
    if (method === "manual") {
      updateDraft({ scores: manualScoresEffective });
    }
    onNext();
  };

  const previewScores = scoresAfterRace(
    method === "manual" ? manualScoresEffective : scores,
    selectedRace,
    draft.subraceSlug,
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Enter <span className="text-gray-300">base</span> scores here (before race bonuses). When you
        finish, the app adds your race and subrace increases automatically and uses the final scores
        for modifiers and hit points.
      </p>

      <div className="rounded-lg border border-blue-900/60 bg-blue-950/25 px-3 py-2.5 text-sm text-blue-100/95">
        <span className="font-display font-semibold text-dnd-gold">New to ability scores?</span> Use{" "}
        <span className="text-white">Suggested scores</span> for a fair layout for your class, or open{" "}
        <span className="text-white">simple explanations</span> below — each stat is described in plain language for
        younger players.
      </div>

      {draft.classSlug && selectedClass && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyClassSuggestion(false)}
            className="min-h-11 px-3 py-2 rounded border border-dnd-gold/60 text-dnd-gold text-xs font-display font-semibold hover:bg-dnd-gold/10 touch-manipulation active:opacity-90 text-left sm:text-center"
          >
            Suggested scores (standard array) for {selectedClass.name}
          </button>
          <button
            type="button"
            onClick={() => applyClassSuggestion(true)}
            className="min-h-11 px-3 py-2 rounded border border-gray-600 text-gray-300 text-xs font-display font-semibold hover:border-gray-400 touch-manipulation active:opacity-90 text-left sm:text-center"
          >
            Same layout as point buy (27 pts)
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setKidTips((v) => !v)}
        className="min-h-11 w-full sm:w-auto text-sm font-display font-semibold text-blue-400 hover:text-blue-300 border border-blue-800/80 rounded px-3 py-2 bg-gray-900/50 touch-manipulation active:opacity-90"
      >
        {kidTips ? "Hide" : "Show"} simple explanations (kid-friendly)
      </button>
      {kidTips && (
        <ul className="text-xs text-gray-400 space-y-1.5 bg-gray-900/80 border border-gray-800 rounded p-3">
          {ABILITY_NAMES.map((a) => (
            <li key={a}>
              <span className="font-display font-semibold text-gray-300">
                {ABILITY_LABELS[a].full}:
              </span>{" "}
              {ABILITY_SCORE_KID_HELP[a]}
            </li>
          ))}
        </ul>
      )}

      {selectedRace && (
        <div className="text-xs text-gray-500">
          Preview after race{draft.subraceSlug ? " & subrace" : ""}:{" "}
          {ABILITY_NAMES.map((a) => (
            <span key={a} className="mr-2 font-mono">
              {ABILITY_LABELS[a].abbr} {previewScores[a]}
            </span>
          ))}
        </div>
      )}

      {/* Method selector */}
      <div>
        <p className="dnd-label mb-2">Generation Method</p>
        <div className="flex gap-1 p-1 bg-gray-900 rounded">
          {(["standard_array", "point_buy", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMethod(m)}
              className={clsx(
                "flex-1 min-h-11 py-2 text-[11px] sm:text-xs font-display font-semibold rounded transition-colors touch-manipulation active:opacity-90",
                method === m ? "bg-dnd-red text-white" : "text-gray-400 hover:text-white"
              )}
            >
              {m === "standard_array" ? "Standard Array" : m === "point_buy" ? "Point Buy" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      {/* Standard Array */}
      {method === "standard_array" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Click a value below to select it, then click an ability score box to assign it.
          </p>
          <div className="flex gap-2 flex-wrap">
            {STANDARD_ARRAY.map((val, idx) => {
              const timesUsed = usedStdValues.filter((v) => v === val).length;
              const timesAvailable = STANDARD_ARRAY.filter((v) => v === val).length;
              const isUsed = timesUsed >= timesAvailable && !(selected === val);
              return (
                <button
                  key={`${val}-${idx}`}
                  type="button"
                  disabled={isUsed}
                  onClick={() => setSelected(selected === val ? null : val)}
                  className={clsx(
                    "min-h-11 min-w-11 w-12 h-12 rounded font-display font-bold text-lg border-2 transition-all touch-manipulation active:opacity-90",
                    isUsed
                      ? "opacity-40 border-stone-600 bg-stone-900/80 text-stone-500 cursor-not-allowed"
                      : selected === val
                        ? "bg-dnd-red border-red-400 text-parchment scale-110 shadow-md"
                        : "border-stone-500 bg-stone-900 text-parchment hover:border-dnd-gold hover:bg-stone-800"
                  )}
                >
                  <span className="tabular-nums">{val}</span>
                </button>
              );
            })}
          </div>
          {/* Ability score boxes — click to assign selected value */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ABILITY_NAMES.map((ability) => {
              const score = scores[ability];
              const mod   = abilityMod(score);
              return (
                <button
                  key={ability}
                  type="button"
                  onClick={() => handleStdAssign(ability)}
                  className={clsx(
                    "dnd-card flex flex-col items-center py-3 min-h-[4.5rem] transition-all touch-manipulation active:opacity-90",
                    selected !== null && "hover:border-dnd-gold cursor-pointer ring-1 ring-dnd-gold/30"
                  )}
                >
                  <span className="dnd-label">{ABILITY_LABELS[ability].abbr}</span>
                  <span className={clsx(
                    "text-3xl font-display font-bold",
                    mod > 0 ? "text-green-400" : mod < 0 ? "text-red-400" : "text-parchment"
                  )}>
                    {fmtMod(mod)}
                  </span>
                  <span className="text-sm text-gray-400">{score}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Point Buy */}
      {method === "point_buy" && (
        <div className="space-y-3">
          {kidTips && (
            <p className="text-xs text-blue-200/90 bg-blue-950/20 border border-blue-900/40 rounded px-3 py-2">
              Point buy: you have a <span className="font-semibold text-white">{POINT_BUY_BUDGET}-point budget</span>.
              Raising a score costs more the higher it goes — use the +/− buttons until{' '}
              <span className="font-mono text-gray-300">pts left</span> shows 0.
              If it feels tricky, try <span className="text-dnd-gold">Suggested scores</span> at the top instead.
            </p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Distribute {POINT_BUY_BUDGET} points. Scores range from 8–15.
            </p>
            <span className={clsx(
              "font-display font-bold",
              remainingPoints < 0 ? "text-red-400" : remainingPoints === 0 ? "text-green-400" : "text-dnd-gold"
            )}>
              {remainingPoints} pts left
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ABILITY_NAMES.map((ability) => (
              <PointBuyControl
                key={ability}
                ability={ability}
                score={scores[ability]}
                onChange={(v) => updateScore(ability, v)}
                canIncrease={
                  remainingPoints >=
                  ((POINT_BUY_COST[scores[ability] + 1] ?? 99) - (POINT_BUY_COST[scores[ability]] ?? 0))
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Manual */}
      {method === "manual" && (
        <div>
          <p className="text-sm text-gray-400 mb-3">
            Enter ability scores directly (1–30). You can clear a box and type a new value; empty becomes 8 when you
            leave the field or continue.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ABILITY_NAMES.map((ability) => {
              const raw = manualText[ability] ?? "";
              const parsed = parseInt(raw, 10);
              const modScore =
                raw.trim() === "" || Number.isNaN(parsed) ? 8 : Math.max(1, Math.min(30, parsed));
              return (
                <div key={ability}>
                  <label className="dnd-label block mb-1">{ABILITY_LABELS[ability].full}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={manualText[ability] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d{1,2}$/.test(v)) {
                        setManualText((t) => ({ ...t, [ability]: v }));
                      }
                    }}
                    onBlur={() => {
                      let n = parseInt(manualText[ability] ?? "", 10);
                      if ((manualText[ability] ?? "").trim() === "" || Number.isNaN(n)) n = 8;
                      n = Math.max(1, Math.min(30, n));
                      setManualText((t) => ({ ...t, [ability]: String(n) }));
                      updateDraft({ scores: { ...scores, [ability]: n } });
                    }}
                    className="input-field w-full text-center text-lg font-display font-bold"
                    aria-label={ABILITY_LABELS[ability].full}
                  />
                  <p className="text-xs text-center mt-1 text-gray-500">
                    Mod: {fmtMod(abilityMod(modScore))}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CharacterCreationStepNext
        label="Next: Background"
        onClick={handleNextStep}
        disabled={!isComplete}
      />
    </div>
  );
}

// ── Point Buy stepper ─────────────────────────────────────────────
function PointBuyControl({
  ability, score, onChange, canIncrease,
}: {
  ability: AbilityName;
  score: number;
  onChange: (v: number) => void;
  canIncrease: boolean;
}) {
  const cost = POINT_BUY_COST[score] ?? 0;
  const mod  = abilityMod(score);
  return (
    <div className="dnd-card flex flex-col items-center gap-1 py-3">
      <span className="dnd-label">{ABILITY_LABELS[ability].abbr}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => score > 8 && onChange(score - 1)}
          disabled={score <= 8}
          className="min-h-11 min-w-11 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 font-bold text-lg leading-none touch-manipulation active:opacity-80"
        >−</button>
        <span className="w-10 text-center text-xl font-display font-bold text-parchment tabular-nums">{score}</span>
        <button
          type="button"
          onClick={() => score < 15 && canIncrease && onChange(score + 1)}
          disabled={score >= 15 || !canIncrease}
          className="min-h-11 min-w-11 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 font-bold text-lg leading-none touch-manipulation active:opacity-80"
        >+</button>
      </div>
      <span className={clsx("text-sm font-display font-bold", mod >= 0 ? "text-green-400" : "text-red-400")}>
        {fmtMod(mod)}
      </span>
      <span className="text-xs text-gray-600">Cost: {cost}</span>
    </div>
  );
}
