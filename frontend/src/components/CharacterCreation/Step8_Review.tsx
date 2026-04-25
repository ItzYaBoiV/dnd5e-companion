import { useEffect, useMemo, useState } from "react";
import type { AbilityName, CharacterDraft } from "@/types/dnd";
import { ABILITY_NAMES, ABILITY_LABELS, ALIGNMENT_LABELS } from "@/types/dnd";
import { scoresAfterRace, walkingSpeedAfterSubrace } from "@/lib/suggestedAbilityScores";
import { useReferenceStore } from "@/store/referenceStore";
import {
  getCreationSpellProfile,
  getMulticlassCreationSpellProfiles,
  getMulticlassInitialSpellSegments,
} from "@/lib/creationSpellGuide";
import {
  validateCreationLevelUpsChain,
  validateMulticlassSteppedDraft,
} from "@/lib/multiclassLevelPlan";
import { startingInventoryRowLabel } from "@/lib/startingEquipmentKits";
import { clsx } from "clsx";
import { CREATION_MOBILE_CTA_BOTTOM } from "./CharacterCreationStepNext";

interface Props {
  draft: CharacterDraft;
  onBack: () => void;
  onSubmit: () => Promise<void>;
}

function fmtMod(score: number) {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export default function Step8_Review({ draft, onBack, onSubmit }: Props) {
  const { backgrounds, races, loadClasses, loadBackgrounds, loadRaces } = useReferenceStore();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadClasses();
    void loadBackgrounds();
    void loadRaces();
  }, [loadClasses, loadBackgrounds, loadRaces]);

  const bg = backgrounds.find((b) => b.slug === draft.backgroundSlug);
  const race = races.find((r) => r.slug === draft.raceSlug);
  const finalScores = scoresAfterRace(draft.scores, race, draft.subraceSlug);
  const spellDraftForProfile = useMemo(
    () => (!draft.useMulticlass && draft.level > 1 ? { ...draft, level: 1 } : draft),
    [draft],
  );
  const spellProfile = useMemo(() => getCreationSpellProfile(spellDraftForProfile, race), [spellDraftForProfile, race]);
  const mcSpellSegments = useMemo(() => {
    if (!draft.useMulticlass) return [];
    return draft.level > 1
      ? getMulticlassInitialSpellSegments(draft, race)
      : getMulticlassCreationSpellProfiles(draft, race);
  }, [draft, race]);

  const reviewScores = useMemo(() => {
    const s = { ...finalScores };
    if (draft.level > 1) {
      for (const lu of draft.creationLevelUps ?? []) {
        for (const b of lu.abilityScoreImprovement ?? []) {
          const a = b.ability as AbilityName;
          if (ABILITY_NAMES.includes(a)) s[a] = Math.min(30, s[a] + b.increase);
        }
      }
    }
    return s;
  }, [finalScores, draft.level, draft.creationLevelUps]);

  const skillList = Array.from(
    new Set([...draft.chosenSkills, ...(bg?.skillProficiencies ?? [])]),
  );
  const invDraft = draft.startingInventoryDraft ?? [];
  const validInv = invDraft.filter(
    (row) =>
      (row.itemSlug != null && row.itemSlug.trim() !== "") ||
      (row.customName != null && row.customName.trim() !== ""),
  );

  const cantrips = draft.startingCantripSlugs ?? [];
  const leveled = draft.startingLeveledSlugs ?? [];
  const wizPrep = draft.startingWizardPreparedSlugs ?? [];

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (draft.level > 1) {
        const chainErr = validateCreationLevelUpsChain(draft);
        if (chainErr) {
          setError(chainErr);
          setSubmitting(false);
          return;
        }
        if (draft.useMulticlass) {
          const mcErr = validateMulticlassSteppedDraft(draft);
          if (mcErr) {
            setError(mcErr);
            setSubmitting(false);
            return;
          }
        }
      }
      await onSubmit();
      setSubmitting(false);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-gray-400 text-sm">
        Review your character before creating them. You can go back to make changes.
      </p>

      {draft.level > 1 && (
        <div className="dnd-card border border-dnd-border/70 bg-dnd-panel/40 p-4 space-y-2">
          <p className="text-sm font-display font-semibold text-dnd-gold">Level-up path included</p>
          <p className="text-sm text-stone-300 leading-relaxed">
            You completed <span className="text-parchment">{draft.level - 1}</span> guided level(s) after 1st. The
            character will be created at 1st, then advanced automatically with your HP, features, ability bumps, and
            spells for each level
            {draft.useMulticlass ? (
              <>
                . Multiclass: each step used the class you chose for that character level; starting spells on the spell
                step are only for your 1st-level class.
              </>
            ) : (
              "."
            )}
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Identity */}
      <div className="dnd-card space-y-3">
        <h3 className="font-display font-bold text-dnd-gold uppercase tracking-widest text-sm">Identity</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <ReviewRow label="Name" value={draft.name || "—"} />
          <ReviewRow label="Alignment" value={ALIGNMENT_LABELS[draft.alignment]} />
          <ReviewRow label="Race" value={draft.raceSlug.replace(/-/g, " ")} />
          <ReviewRow label="Subrace" value={draft.subraceSlug?.replace(/-/g, " ") || "—"} />
          <ReviewRow
            label="Class"
            value={
              draft.useMulticlass && draft.classLevels.length
                ? draft.classLevels
                    .map((r) => `${r.classSlug.replace(/-/g, " ")} ${r.levels}`.trim())
                    .join(" · ")
                : draft.classSlug.replace(/-/g, " ")
            }
          />
          <ReviewRow
            label="Subclass"
            value={
              draft.useMulticlass && draft.classLevels.length
                ? draft.classLevels.map((r) => r.subclassSlug?.replace(/-/g, " ") || "—").join(" · ")
                : draft.subclassSlug?.replace(/-/g, " ") || "—"
            }
          />
          <ReviewRow label="Background" value={draft.backgroundSlug.replace(/-/g, " ")} />
          <ReviewRow label="Level" value={String(draft.level)} />
          {race != null && (
            <ReviewRow label="Speed" value={`${walkingSpeedAfterSubrace(race, draft.subraceSlug)} ft`} />
          )}
        </div>
      </div>

      {/* Ability Scores */}
      <div className="dnd-card space-y-3">
        <h3 className="font-display font-bold text-dnd-gold uppercase tracking-widest text-sm">Ability Scores</h3>
        <p className="text-xs text-gray-500">
          Base (before race) / <span className="text-gray-300">Final</span> (what the sheet will use — race bonuses
          applied on save).
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {ABILITY_NAMES.map((ability) => {
            const base = draft.scores[ability];
            const fin = draft.level > 1 ? reviewScores[ability] : finalScores[ability];
            const mod = Math.floor((fin - 10) / 2);
            return (
              <div key={ability} className="flex flex-col items-center bg-gray-900 rounded p-2">
                <span className="text-xs text-gray-500 font-display">{ABILITY_LABELS[ability].abbr}</span>
                <span
                  className={clsx(
                    "text-xl font-display font-bold",
                    mod > 0 ? "text-green-400" : mod < 0 ? "text-red-400" : "text-white",
                  )}
                >
                  {fmtMod(fin)}
                </span>
                <span className="text-xs text-gray-500">
                  {base}
                  {base !== fin ? <span className="text-dnd-gold"> → {fin}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Starting spells — multiclass */}
      {draft.useMulticlass &&
        mcSpellSegments.map(({ segmentKey, displayLabel, profile: mp }) => {
          const seg = draft.multiclassSpellSegments?.[segmentKey];
          const c = seg?.cantripSlugs ?? [];
          const l = seg?.leveledSlugs ?? [];
          const w = seg?.wizardPreparedSlugs ?? [];
          if (c.length === 0 && l.length === 0) return null;
          return (
            <div key={segmentKey} className="dnd-card space-y-2">
              <h3 className="font-display font-bold text-dnd-gold uppercase tracking-widest text-sm">
                Spells — {displayLabel}
              </h3>
              <p className="text-xs text-gray-500">{mp.kidSummary}</p>
              {c.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 mb-1">Cantrips</p>
                  <ul className="text-sm text-gray-300 space-y-0.5">
                    {c.map((s) => (
                      <li key={s} className="capitalize">
                        {s.replace(/-/g, " ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {l.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 mb-1">
                    {mp.mode === "wizard" ? "Spellbook" : "Leveled spells"}
                  </p>
                  <ul className="text-sm text-gray-300 space-y-0.5">
                    {l.map((s) => (
                      <li key={s} className="capitalize">
                        {s.replace(/-/g, " ")}
                        {mp.mode === "wizard" && w.includes(s) ? (
                          <span className="text-dnd-gold text-xs ml-2">(prepared)</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

      {/* Starting spells — single class */}
      {!draft.useMulticlass && spellProfile && (cantrips.length > 0 || leveled.length > 0) && (
        <div className="dnd-card space-y-2">
          <h3 className="font-display font-bold text-dnd-gold uppercase tracking-widest text-sm">Starting Spells</h3>
          <p className="text-xs text-gray-500">{spellProfile.kidSummary}</p>
          {cantrips.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-1">Cantrips</p>
              <ul className="text-sm text-gray-300 space-y-0.5">
                {cantrips.map((s) => (
                  <li key={s} className="capitalize">
                    {s.replace(/-/g, " ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {leveled.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-1">
                {spellProfile.mode === "wizard" ? "Spellbook" : "Leveled spells"}
              </p>
              <ul className="text-sm text-gray-300 space-y-0.5">
                {leveled.map((s) => (
                  <li key={s} className="capitalize">
                    {s.replace(/-/g, " ")}
                    {spellProfile.mode === "wizard" && wizPrep.includes(s) ? (
                      <span className="text-dnd-gold text-xs ml-2">(prepared)</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Starting inventory summary */}
      <div className="dnd-card space-y-2">
        <h3 className="font-display font-bold text-dnd-gold uppercase tracking-widest text-sm">Starting Inventory</h3>
        <p className="text-xs text-gray-500">
          Full (a)/(b) equipment rules are on the previous step. Here is what will be added to the sheet when you
          create this character.
        </p>
        {validInv.length === 0 ? (
          <p className="text-sm text-gray-400">No items yet — you can go back to add some, or add gear on the sheet.</p>
        ) : (
          <ul className="text-sm text-gray-300 space-y-1">
            {validInv.map((row, i) => (
              <li key={`${row.itemSlug ?? row.customName}-${i}`}>
                ×{row.quantity} {startingInventoryRowLabel(row)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Skills */}
      {skillList.length > 0 && (
        <div className="dnd-card">
          <h3 className="font-display font-bold text-dnd-gold uppercase tracking-widest text-sm mb-2">
            Skill Proficiencies
          </h3>
          <p className="text-xs text-gray-600 mb-2">Class choices plus background skills (merged on save).</p>
          <div className="flex flex-wrap gap-1.5">
            {skillList.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 bg-blue-950 border border-blue-800 text-blue-300 rounded text-xs font-display capitalize"
              >
                {s.replace(/-/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Personality */}
      {(draft.personalityTraits || draft.ideals || draft.bonds || draft.flaws) && (
        <div className="dnd-card space-y-2">
          <h3 className="font-display font-bold text-dnd-gold uppercase tracking-widest text-sm">Personality</h3>
          {draft.personalityTraits && <ReviewRow label="Trait" value={draft.personalityTraits} />}
          {draft.ideals && <ReviewRow label="Ideal" value={draft.ideals} />}
          {draft.bonds && <ReviewRow label="Bond" value={draft.bonds} />}
          {draft.flaws && <ReviewRow label="Flaw" value={draft.flaws} />}
        </div>
      )}

      <div className="hidden flex-col-reverse gap-3 pt-2 md:flex md:flex-row">
        <button type="button" onClick={onBack} className="btn-secondary w-full px-6 sm:w-auto">
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary w-full py-3 text-base sm:flex-1 sm:text-lg"
        >
          {submitting ? "Creating…" : "Create Character"}
        </button>
      </div>

      <div
        className="fixed left-0 right-0 z-30 flex flex-col gap-2 p-2 md:hidden"
        style={{ bottom: CREATION_MOBILE_CTA_BOTTOM }}
      >
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-primary w-full min-h-[52px] touch-manipulation py-3.5 text-base font-display font-semibold"
        >
          {submitting ? "Creating…" : "Create Character"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary w-full min-h-[48px] touch-manipulation"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 text-xs">{label}: </span>
      <span className="text-white capitalize">{value}</span>
    </div>
  );
}
