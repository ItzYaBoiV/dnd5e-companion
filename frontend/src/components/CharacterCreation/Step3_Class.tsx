import { useEffect, useMemo, useState } from "react";
import type { CharacterDraft, ClassLevelDraftRow, DndClass } from "@/types/dnd";
import { useReferenceStore } from "@/store/referenceStore";
import { meetsMulticlassPrerequisite, multiclassPrereqHint } from "@/lib/multiclassPrereqs";
import { draftSavingThrows, draftSkillConfig } from "@/lib/multiclassDraftSkills";
import { scoresAfterRace } from "@/lib/suggestedAbilityScores";
import { SUBCLASS_CHOICE_LEVEL } from "@/lib/levelUpGuide";
import {
  defaultMulticlassLevelOrder,
  validateMulticlassSteppedDraft,
} from "@/lib/multiclassLevelPlan";
import { LoadingSpinner } from "@/components/common";
import { clsx } from "clsx";

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

const HIT_DIE_COLOR: Record<number, string> = {
  6: "text-red-400",
  8: "text-orange-400",
  10: "text-yellow-400",
  12: "text-green-400",
};

function uniqueSubclassesByName<T extends { name: string }>(subs: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const s of subs) {
    const k = s.name.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** If the chosen 1st-level class no longer appears with ≥1 level, clear plan fields (avoid stale radios / path). */
function staleMulticlassFirstPlanPatch(
  rows: ClassLevelDraftRow[],
  currentFirstSlug: string | undefined,
): { multiclassFirstClassSlug: string; multiclassLevelOrder: string[] } | null {
  const first = (currentFirstSlug ?? "").trim();
  if (!first) return null;
  const stillValid = rows.some((r) => r.classSlug.trim() === first && r.levels >= 1);
  if (stillValid) return null;
  return { multiclassFirstClassSlug: "", multiclassLevelOrder: [] };
}

/** Levels per class: text field + − / + so mobile users can clear and re-type (not stuck on 1 like type=number + min). */
function MulticlassLevelsInput({
  value,
  cap,
  onCommit,
}: {
  value: number;
  cap: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parseText = (t: string) => {
    const tr = t.trim();
    if (tr === "") return null;
    const n = parseInt(tr, 10);
    return Number.isNaN(n) ? null : n;
  };

  const commitParsed = (n: number) => {
    const c = Math.min(cap, Math.max(1, n));
    onCommit(c);
    setText(String(c));
  };

  const baseForStep = () => {
    if (!focused) return value;
    const p = parseText(text);
    return p === null ? value : p;
  };

  const btnClass =
    "shrink-0 flex items-center justify-center min-h-[2.75rem] min-w-[2.75rem] rounded border border-gray-600 bg-gray-800 text-lg font-display font-semibold text-dnd-gold hover:bg-gray-700 active:bg-gray-900 touch-manipulation sm:min-h-9 sm:min-w-9";

  return (
    <div className="space-y-1">
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          className={btnClass}
          aria-label="Decrease levels in this class"
          onClick={() => commitParsed(baseForStep() - 1)}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          aria-label="Levels in this class"
          className="input-field min-w-0 flex-1 text-center text-sm tabular-nums"
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^\d{1,2}$/.test(v)) setText(v);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const p = parseText(text);
            if (p === null) commitParsed(1);
            else commitParsed(p);
          }}
        />
        <button
          type="button"
          className={btnClass}
          aria-label="Increase levels in this class"
          onClick={() => commitParsed(baseForStep() + 1)}
        >
          +
        </button>
      </div>
      <p className="text-[11px] text-gray-500 leading-snug">
        Use − / + or type. Clear the field to enter a new number; if you leave it empty, it becomes 1 when you leave the
        field.
      </p>
    </div>
  );
}

export default function Step3_Class({ draft, updateDraft, onNext }: Props) {
  const { classes, races, loadClasses, loadRaces, loading } = useReferenceStore();
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  useEffect(() => {
    loadClasses();
    void loadRaces();
  }, [loadClasses, loadRaces]);

  const { pool: skillPool, count: skillCount } = useMemo(
    () => draftSkillConfig(draft, classes),
    [draft, classes],
  );

  const selectedRace = races.find((r) => r.slug === draft.raceSlug);
  const abilityPreview = useMemo(
    () => scoresAfterRace(draft.scores, selectedRace, draft.subraceSlug),
    [draft.scores, draft.subraceSlug, selectedRace],
  );

  const mcSaves = (levels: ClassLevelDraftRow[]) =>
    draftSavingThrows({ ...draft, classLevels: levels, useMulticlass: true }, classes);

  if (loading["classes"] || loading["races"]) return <LoadingSpinner />;

  const selectedClass = classes.find((c: DndClass) => c.slug === draft.classSlug);

  const levelSumMc = draft.classLevels.reduce((s, r) => s + r.levels, 0);
  const sumOk = !draft.useMulticlass || levelSumMc === draft.level;
  const filledSlugs = draft.classLevels.map((r) => r.classSlug).filter(Boolean);
  const uniqueClassOk = new Set(filledSlugs).size === filledSlugs.length;

  const multiclassRowsValid =
    !draft.useMulticlass ||
    (draft.classLevels.length >= 2 &&
      draft.classLevels.every((r) => r.classSlug.trim() !== "") &&
      sumOk &&
      uniqueClassOk);

  const subclassChoiceLevelSingle =
    selectedClass != null ? (SUBCLASS_CHOICE_LEVEL[selectedClass.slug] ?? 3) : 3;
  const needSubclassSingle =
    !!selectedClass &&
    draft.level >= subclassChoiceLevelSingle &&
    selectedClass.subclasses.length > 0 &&
    !draft.useMulticlass;

  const steppedMc = draft.useMulticlass && draft.level > 1;

  const rowNeedsSubclass = (row: ClassLevelDraftRow) => {
    // For stepped multiclass (start above 1st), subclass is chosen at the exact class-tier step.
    if (steppedMc) return false;
    if (!row.classSlug) return false;
    const cls = classes.find((c) => c.slug === row.classSlug);
    if (!cls || !cls.subclasses.length) return false;
    const t = SUBCLASS_CHOICE_LEVEL[row.classSlug] ?? 3;
    return row.levels >= t;
  };

  const subclassOkMc =
    !draft.useMulticlass ||
    steppedMc ||
    draft.classLevels.every((r) => !rowNeedsSubclass(r) || !!r.subclassSlug?.trim());

  const needSkills = skillCount > 0 && skillPool.length > 0;
  const skillsOk = !needSkills || draft.chosenSkills.length >= skillCount;

  const canProceedSingle =
    !draft.useMulticlass &&
    !!draft.classSlug &&
    skillsOk &&
    (!needSubclassSingle || !!draft.subclassSlug);

  const mcSteppedOk =
    !draft.useMulticlass ||
    draft.level <= 1 ||
    validateMulticlassSteppedDraft(draft) === null;

  const canProceedMc =
    draft.useMulticlass && multiclassRowsValid && skillsOk && subclassOkMc && mcSteppedOk;

  const canProceed = canProceedSingle || canProceedMc;

  const handleSelectClass = (cls: DndClass) => {
    updateDraft({
      classSlug: cls.slug,
      subclassSlug: "",
      chosenSkills: [],
      savingThrows: cls.savingThrows,
      spellcastingAbility: cls.spellcastingAbility ?? undefined,
      startingCantripSlugs: [],
      startingLeveledSlugs: [],
      startingWizardPreparedSlugs: [],
      multiclassSpellSegments: {},
    });
  };

  const enableMulticlass = () => {
    const half = Math.max(1, Math.floor(draft.level / 2));
    const rows: ClassLevelDraftRow[] = [
      {
        classSlug: draft.classSlug || "",
        subclassSlug: draft.subclassSlug || "",
        levels: half,
      },
      { classSlug: "", subclassSlug: "", levels: draft.level - half },
    ];
    const firstSlug = (rows[0]?.classSlug ?? "").trim();
    const needOrder = Math.max(0, draft.level - 1);
    const multiclassLevelOrder =
      draft.level > 1 && firstSlug
        ? defaultMulticlassLevelOrder(rows, firstSlug, draft.level).slice(0, needOrder)
        : [];
    updateDraft({
      useMulticlass: true,
      chosenSkills: [],
      classLevels: rows,
      savingThrows: mcSaves(rows),
      startingCantripSlugs: [],
      startingLeveledSlugs: [],
      startingWizardPreparedSlugs: [],
      multiclassSpellSegments: {},
      multiclassFirstClassSlug: firstSlug,
      multiclassLevelOrder,
    });
  };

  const disableMulticlass = () => {
    const cls = classes.find((c) => c.slug === draft.classSlug);
    updateDraft({
      useMulticlass: false,
      classLevels: [],
      savingThrows: cls?.savingThrows ?? draft.savingThrows,
      startingCantripSlugs: [],
      startingLeveledSlugs: [],
      startingWizardPreparedSlugs: [],
      multiclassSpellSegments: {},
      multiclassFirstClassSlug: "",
      multiclassLevelOrder: [],
    });
  };

  const updateRow = (index: number, patch: Partial<ClassLevelDraftRow>) => {
    const prev = draft.classLevels[index];
    const next = draft.classLevels.map((r, i) => (i === index ? { ...r, ...patch } : r));
    const classChanged = patch.classSlug !== undefined && patch.classSlug !== prev?.classSlug;
    const subChanged =
      patch.subclassSlug !== undefined && patch.subclassSlug !== prev?.subclassSlug;
    const mcSpellClass =
      prev?.classSlug === "fighter" || prev?.classSlug === "rogue" || patch.classSlug === "fighter" || patch.classSlug === "rogue";
    const clearSpells = classChanged || (mcSpellClass && subChanged);
    const levelsChanged = patch.levels !== undefined && patch.levels !== prev?.levels;
    const mcSpellReset =
      draft.useMulticlass && (clearSpells || classChanged || subChanged || levelsChanged);
    const mcPlanStale =
      draft.useMulticlass && staleMulticlassFirstPlanPatch(next, draft.multiclassFirstClassSlug);
    updateDraft({
      classLevels: next,
      savingThrows: mcSaves(next),
      ...(clearSpells
        ? { startingCantripSlugs: [], startingLeveledSlugs: [], startingWizardPreparedSlugs: [] }
        : {}),
      ...(mcSpellReset ? { multiclassSpellSegments: {} } : {}),
      ...(mcPlanStale ?? {}),
    });
  };

  const addRow = () => {
    const next = [...draft.classLevels, { classSlug: "", subclassSlug: "", levels: 1 }];
    const mcPlanStale =
      draft.useMulticlass && staleMulticlassFirstPlanPatch(next, draft.multiclassFirstClassSlug);
    updateDraft({
      classLevels: next,
      savingThrows: mcSaves(next),
      ...(draft.useMulticlass ? { multiclassSpellSegments: {} } : {}),
      ...(mcPlanStale ?? {}),
    });
  };

  const removeRow = (index: number) => {
    const next = draft.classLevels.filter((_, i) => i !== index);
    const mcPlanStale =
      draft.useMulticlass && staleMulticlassFirstPlanPatch(next, draft.multiclassFirstClassSlug);
    updateDraft({
      classLevels: next,
      savingThrows: mcSaves(next),
      ...(draft.useMulticlass ? { multiclassSpellSegments: {} } : {}),
      ...(mcPlanStale ?? {}),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Your class defines hit points, proficiencies, and special abilities. With multiclass, each row is a class and
        how many levels you have in it. For characters starting above 1st level, you also choose which class you took at
        1st character level (max Hit Die at level 1) and which class you took at each later level — the creator runs
        every level-up step in that order before your character is saved.
      </p>

      <label className="flex items-center gap-2 cursor-pointer dnd-card py-2 px-3 border border-gray-700">
        <input
          type="checkbox"
          checked={draft.useMulticlass}
          onChange={(e) => (e.target.checked ? enableMulticlass() : disableMulticlass())}
          className="rounded border-gray-600"
        />
        <span className="text-sm text-gray-200">
          <span className="font-display font-semibold text-dnd-gold">Multiclass</span>
          <span className="text-gray-500"> — two or more classes; levels in each row must add up to your total level.</span>
        </span>
      </label>

      {!draft.useMulticlass && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:max-h-72 sm:overflow-auto sm:pr-1">
            {classes.map((cls: DndClass) => (
              <div key={cls.slug}>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectClass(cls);
                    setExpandedClass(expandedClass === cls.slug ? null : cls.slug);
                  }}
                  className={clsx(
                    "w-full dnd-card text-left transition-all touch-manipulation min-h-[3.25rem] py-3 active:opacity-90",
                    draft.classSlug === cls.slug
                      ? "border-dnd-red bg-red-950/20"
                      : "hover:border-gray-500",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-display font-bold text-white">{cls.name}</p>
                    <span
                      className={clsx(
                        "font-display font-bold text-sm",
                        HIT_DIE_COLOR[cls.hitDie] ?? "text-gray-400",
                      )}
                    >
                      d{cls.hitDie}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>Saves: {cls.savingThrows.map((s) => s.slice(0, 3).toUpperCase()).join(", ")}</span>
                    {cls.spellcastingAbility && (
                      <span className="text-blue-400">
                        Casts ({cls.spellcastingAbility.slice(0, 3).toUpperCase()})
                      </span>
                    )}
                  </div>
                  {cls.armorProficiencies.length > 0 && (
                    <p className="text-xs text-gray-600 mt-0.5 capitalize">
                      Armor: {cls.armorProficiencies.join(", ")}
                    </p>
                  )}
                </button>
              </div>
            ))}
          </div>

          {selectedClass && selectedClass.skillChoices.length > 0 && (
            <SkillChoices
              cls={selectedClass}
              count={skillCount}
              pool={skillPool}
              chosen={draft.chosenSkills}
              onChange={(skills) => updateDraft({ chosenSkills: skills })}
            />
          )}

          {needSubclassSingle && selectedClass && (
            <div>
              <p className="dnd-label mb-2">Subclass (Level 3+)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {uniqueSubclassesByName(selectedClass.subclasses).map((sub) => (
                  <button
                    key={sub.slug}
                    type="button"
                    onClick={() =>
                      updateDraft({
                        subclassSlug: sub.slug,
                        ...(["fighter", "rogue"].includes(selectedClass.slug)
                          ? {
                              startingCantripSlugs: [],
                              startingLeveledSlugs: [],
                              startingWizardPreparedSlugs: [],
                            }
                          : {}),
                      })
                    }
                    className={clsx(
                      "dnd-card text-left touch-manipulation min-h-[3rem] py-2.5 active:opacity-90",
                      draft.subclassSlug === sub.slug ? "border-dnd-red bg-red-950/20" : "hover:border-gray-500",
                    )}
                  >
                    <p className="font-display font-bold text-sm text-white">{sub.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedClass && (
            <FeaturePreview cls={selectedClass} level={draft.level} />
          )}
        </>
      )}

      {draft.useMulticlass && (
        <div className="space-y-3">
          {!sumOk && (
            <p className="text-sm text-amber-600 bg-amber-950/30 border border-amber-900/50 rounded px-2 py-1.5">
              Levels in all rows must add up to <strong>{draft.level}</strong> (right now: {levelSumMc}).
            </p>
          )}
          {draft.useMulticlass && filledSlugs.length >= 2 && !uniqueClassOk && (
            <p className="text-sm text-amber-600 bg-amber-950/30 border border-amber-900/50 rounded px-2 py-1.5">
              D&D 5e does not let you take the same class twice as separate rows — combine levels into one row.
            </p>
          )}
          <p className="text-xs text-gray-500">
            Set levels in each row so they add up to your character level. Row order only affects display; for level 2+
            starters, use the section below for 1st-level class and level order.
          </p>
          {draft.classLevels.map((row, index) => {
            const cls = classes.find((c) => c.slug === row.classSlug);
            return (
              <div key={index} className="dnd-card space-y-2 border border-gray-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-display text-dnd-gold">Class {index + 1}</span>
                  {draft.classLevels.length > 2 && (
                    <button type="button" onClick={() => removeRow(index)} className="text-xs text-red-400 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="dnd-label block mb-1">Class</label>
                    <select
                      value={row.classSlug}
                      onChange={(e) =>
                        updateRow(index, { classSlug: e.target.value, subclassSlug: "" })
                      }
                      className="input-field w-full text-sm"
                    >
                      <option value="">Choose…</option>
                      {classes.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name} (d{c.hitDie})
                        </option>
                      ))}
                    </select>
                    {row.classSlug.trim() &&
                      !meetsMulticlassPrerequisite(row.classSlug, abilityPreview) && (
                        <p className="text-amber-600/95 text-[11px] mt-1 leading-snug">
                          ⚠ Multiclass entry requires {multiclassPrereqHint(row.classSlug)} with your current race
                          bonuses (PHB p.164). You can still adjust abilities on the next step.
                        </p>
                      )}
                  </div>
                  <div>
                    <label className="dnd-label block mb-1">Levels in this class</label>
                    <MulticlassLevelsInput
                      value={row.levels}
                      cap={Math.min(20, draft.level)}
                      onCommit={(n) => updateRow(index, { levels: n })}
                    />
                  </div>
                </div>
                {cls && rowNeedsSubclass(row) && (
                  <div>
                    <label className="dnd-label block mb-1">Subclass ({cls.name} 3+)</label>
                    <select
                      value={row.subclassSlug}
                      onChange={(e) => updateRow(index, { subclassSlug: e.target.value })}
                      className="input-field w-full text-sm"
                    >
                      <option value="">Choose subclass…</option>
                      {uniqueSubclassesByName(cls.subclasses).map((sub) => (
                        <option key={sub.slug} value={sub.slug}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" onClick={addRow} className="btn-secondary text-sm w-full sm:w-auto">
            + Add another class row
          </button>

          {skillPool.length > 0 && (
            <MulticlassSkillChoices
              pool={skillPool}
              count={skillCount}
              chosen={draft.chosenSkills}
              onChange={(skills) => updateDraft({ chosenSkills: skills })}
            />
          )}

          {draft.level > 1 && multiclassRowsValid && (
            <div className="dnd-card space-y-4 border border-blue-900/50 bg-blue-950/15 p-4">
              <div>
                <p className="font-display font-semibold text-dnd-gold text-sm mb-1">
                  1st character level (max Hit Die)
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Choose which class you were when you reached 1st level. The sheet uses that class&apos;s Hit Die for
                  your first level&apos;s HP roll maximum.
                </p>
                <div className="flex flex-col gap-2">
                  {draft.classLevels
                    .filter((r) => r.classSlug.trim() && r.levels >= 1)
                    .map((row) => {
                      const c = classes.find((x) => x.slug === row.classSlug);
                      const label = c?.name ?? row.classSlug.replace(/-/g, " ");
                      return (
                        <label
                          key={row.classSlug}
                          className="flex items-center gap-2 cursor-pointer text-sm text-gray-200"
                        >
                          <input
                            type="radio"
                            name="mc-first-class"
                            checked={draft.multiclassFirstClassSlug.trim() === row.classSlug.trim()}
                            onChange={() =>
                              updateDraft({
                                multiclassFirstClassSlug: row.classSlug.trim(),
                                multiclassLevelOrder: defaultMulticlassLevelOrder(
                                  draft.classLevels,
                                  row.classSlug.trim(),
                                  draft.level,
                                ),
                              })
                            }
                            className="rounded border-gray-600"
                          />
                          <span>
                            {label}{" "}
                            <span className="text-gray-500">
                              (d{c?.hitDie ?? "?"}, {row.levels} lvl{row.levels === 1 ? "" : "s"} in class)
                            </span>
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="font-display font-semibold text-dnd-gold text-sm">
                      Levels 2–{draft.level}: class at each level
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      One choice per character level after 1st. Together with your 1st-level class, this must match the
                      level totals in each row.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary text-xs px-3 py-1.5 shrink-0"
                    onClick={() => {
                      const first = draft.multiclassFirstClassSlug.trim();
                      if (!first) return;
                      updateDraft({
                        multiclassLevelOrder: defaultMulticlassLevelOrder(
                          draft.classLevels,
                          first,
                          draft.level,
                        ),
                      });
                    }}
                  >
                    Use suggested order
                  </button>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {Array.from({ length: Math.max(0, draft.level - 1) }, (_, i) => {
                    const charLv = i + 2;
                    const pathSlugs = [
                      ...new Set(
                        draft.classLevels
                          .filter((r) => r.classSlug.trim() && r.levels >= 1)
                          .map((r) => r.classSlug.trim()),
                      ),
                    ];
                    const v = (draft.multiclassLevelOrder ?? [])[i] ?? "";
                    return (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-xs text-gray-500 w-36 shrink-0">Character level {charLv}</span>
                        <select
                          value={v}
                          onChange={(e) => {
                            const need = draft.level - 1;
                            const next = [...(draft.multiclassLevelOrder ?? [])];
                            while (next.length < need) next.push("");
                            next[i] = e.target.value;
                            updateDraft({ multiclassLevelOrder: next });
                          }}
                          className="input-field w-full sm:max-w-xs text-sm"
                        >
                          <option value="">Choose class…</option>
                          {pathSlugs.map((slug) => {
                            const c = classes.find((x) => x.slug === slug);
                            return (
                              <option key={slug} value={slug}>
                                {c?.name ?? slug.replace(/-/g, " ")}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {validateMulticlassSteppedDraft(draft) && (
                <p className="text-sm text-amber-600 bg-amber-950/30 border border-amber-900/50 rounded px-2 py-1.5">
                  {validateMulticlassSteppedDraft(draft)}
                </p>
              )}
            </div>
          )}

          {draft.classLevels[0]?.classSlug && (
            <FeaturePreview
              cls={classes.find((c) => c.slug === draft.classLevels[0]!.classSlug)!}
              level={draft.classLevels[0]!.levels}
              label="Preview: first class features (by levels in that class)"
            />
          )}
        </div>
      )}

      <div className="flex justify-stretch sm:justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed px-8"
        >
          Next: Ability Scores
        </button>
      </div>
    </div>
  );
}

function SkillChoices({
  cls,
  count,
  pool,
  chosen,
  onChange,
}: {
  cls: DndClass;
  count: number;
  pool: string[];
  chosen: string[];
  onChange: (s: string[]) => void;
}) {
  const effectivePool = pool.length ? pool : cls.skillChoices;
  const effectiveCount = count > 0 ? count : cls.skillChoiceCount;

  const toggle = (skill: string) => {
    if (chosen.includes(skill)) {
      onChange(chosen.filter((s) => s !== skill));
    } else if (chosen.length < effectiveCount) {
      onChange([...chosen, skill]);
    }
  };

  return (
    <div>
      <p className="dnd-label mb-2">
        Choose {effectiveCount} skill{effectiveCount === 1 ? "" : "s"} ({chosen.length}/{effectiveCount})
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {effectivePool.map((skill) => {
          const isChosen = chosen.includes(skill);
          const isDisabled = !isChosen && chosen.length >= effectiveCount;
          return (
            <button
              key={skill}
              type="button"
              onClick={() => toggle(skill)}
              disabled={isDisabled}
              className={clsx(
                "min-h-10 px-2 py-2 rounded border text-xs font-display font-semibold capitalize transition-colors touch-manipulation active:opacity-90",
                isChosen
                  ? "bg-dnd-gold/20 border-dnd-gold text-dnd-gold"
                  : isDisabled
                    ? "border-gray-800 text-gray-700 cursor-not-allowed"
                    : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white",
              )}
            >
              {skill.replace(/-/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MulticlassSkillChoices({
  pool,
  count,
  chosen,
  onChange,
}: {
  pool: string[];
  count: number;
  chosen: string[];
  onChange: (s: string[]) => void;
}) {
  const toggle = (skill: string) => {
    if (chosen.includes(skill)) {
      onChange(chosen.filter((s) => s !== skill));
    } else if (chosen.length < count) {
      onChange([...chosen, skill]);
    }
  };

  return (
    <div>
      <p className="dnd-label mb-2">
        Skills (multiclass) — choose {count} from the combined lists ({chosen.length}/{count})
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 sm:max-h-48 overflow-y-auto pr-1">
        {pool.map((skill) => {
          const isChosen = chosen.includes(skill);
          const isDisabled = !isChosen && chosen.length >= count;
          return (
            <button
              key={skill}
              type="button"
              onClick={() => toggle(skill)}
              disabled={isDisabled}
              className={clsx(
                "min-h-10 px-2 py-2 rounded border text-xs font-display font-semibold capitalize transition-colors touch-manipulation active:opacity-90",
                isChosen
                  ? "bg-dnd-gold/20 border-dnd-gold text-dnd-gold"
                  : isDisabled
                    ? "border-gray-800 text-gray-700 cursor-not-allowed"
                    : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white",
              )}
            >
              {skill.replace(/-/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeaturePreview({ cls, level, label }: { cls: DndClass; level: number; label?: string }) {
  return (
    <div className="dnd-card">
      <p className="dnd-label mb-2">{label ?? `Level ${level} features`}</p>
      <div className="space-y-1.5 max-h-36 overflow-auto">
        {cls.features.filter((f) => f.level <= level).length === 0 ? (
          <p className="text-xs text-amber-600/90">
            No class features found in SRD data for this preview.
          </p>
        ) : (
          cls.features
            .filter((f) => f.level <= level)
            .map((f) => (
              <div key={f.id} className="text-xs">
                <span className="font-display font-semibold text-white">{f.name}</span>
                <span className="text-gray-600 ml-2">(Lvl {f.level})</span>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
