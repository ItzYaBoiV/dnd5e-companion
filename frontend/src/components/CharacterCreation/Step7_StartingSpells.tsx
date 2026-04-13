import { useCallback, useEffect, useMemo, useState } from "react";
import type { CharacterDraft } from "@/types/dnd";
import type { Race, Spell } from "@/types/dnd";
import {
  getCreationSpellProfile,
  getMulticlassCreationSpellProfiles,
  getMulticlassInitialSpellSegments,
  validateStartingSpellPicks,
  type CreationSpellProfile,
  type StartingSpellPick,
} from "@/lib/creationSpellGuide";
import { useReferenceStore } from "@/store/referenceStore";
import { referenceApi } from "@/services/api";
import { mergeSpellListsPreferringRichestClasses } from "@/lib/spellDedupe";
import { LoadingSpinner, SpellLevelBadge } from "@/components/common";
import { clsx } from "clsx";

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

function emptySegment() {
  return { cantripSlugs: [] as string[], leveledSlugs: [] as string[], wizardPreparedSlugs: [] as string[] };
}

function readSpellPicks(draft: CharacterDraft, segmentKey: string | undefined) {
  if (!segmentKey) {
    return {
      cantrips: draft.startingCantripSlugs ?? [],
      leveled: draft.startingLeveledSlugs ?? [],
      wizPrep: draft.startingWizardPreparedSlugs ?? [],
    };
  }
  const s = draft.multiclassSpellSegments?.[segmentKey] ?? emptySegment();
  return { cantrips: s.cantripSlugs, leveled: s.leveledSlugs, wizPrep: s.wizardPreparedSlugs };
}

export default function Step7_StartingSpells({ draft, updateDraft, onNext }: Props) {
  const { races, loadRaces } = useReferenceStore();

  useEffect(() => {
    void loadRaces();
  }, [loadRaces]);

  const race = races.find((r) => r.slug === draft.raceSlug);
  const spellDraftForProfile = useMemo(
    () => (!draft.useMulticlass && draft.level > 1 ? { ...draft, level: 1 } : draft),
    [draft],
  );
  const profile = useMemo(() => getCreationSpellProfile(spellDraftForProfile, race), [spellDraftForProfile, race]);
  const mcSegments = useMemo(() => {
    if (!draft.useMulticlass) return [];
    return draft.level > 1
      ? getMulticlassInitialSpellSegments(draft, race)
      : getMulticlassCreationSpellProfiles(draft, race);
  }, [draft, race]);

  const [mcGate, setMcGate] = useState<Record<string, boolean>>({});

  const setMcSegmentOk = useCallback((segmentKey: string, ok: boolean) => {
    setMcGate((g) => (g[segmentKey] === ok ? g : { ...g, [segmentKey]: ok }));
  }, []);

  if (draft.useMulticlass && mcSegments.length > 0) {
    const canProceedMc = mcSegments.every(({ segmentKey }) => mcGate[segmentKey] === true);
    return (
      <div className="space-y-8">
        <div className="dnd-card border border-blue-900/50 bg-blue-950/20 p-4 space-y-2">
          <h2 className="font-display font-bold text-dnd-gold text-lg">Starting spells (multiclass)</h2>
          <p className="text-sm text-gray-200 leading-relaxed">
            {draft.level > 1
              ? "You are created at 1st level first, then advanced step by step. Pick starting spells only for the class you took at 1st character level (as a 1st-level spellcaster in that class). Further spells are chosen on the level-up steps."
              : "Pick spells separately for each class that casts at your chosen levels. Counts follow the PHB/SRD tables as if each class were single-classed at the level shown in that row."}
          </p>
        </div>

        {mcSegments.map(({ segmentKey, displayLabel, profile: p }) => (
          <div key={segmentKey} className="space-y-4 border-b border-gray-800 pb-8 last:border-0">
            <h3 className="font-display font-semibold text-dnd-gold text-base capitalize">{displayLabel}</h3>
            <SpellPickerPanel
              draft={draft}
              updateDraft={updateDraft}
              profile={p}
              race={race}
              segmentKey={segmentKey}
              onCanProceedChange={(ok) => setMcSegmentOk(segmentKey, ok)}
            />
          </div>
        ))}

        <button
          type="button"
          className="btn-primary w-full py-3 disabled:opacity-40"
          disabled={!canProceedMc}
          onClick={onNext}
        >
          {canProceedMc ? "Continue to review" : "Finish the spell picks above for each class"}
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <div className="dnd-card border border-amber-900/60 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-100/90 font-display font-semibold mb-1">No spell picks this step</p>
          <p className="text-sm text-gray-400">
            {draft.useMulticlass
              ? "None of your multiclass levels start with spellcasting under this setup (for example, all martial levels before spellcasting kicks in). You can add spells later on the Spells tab."
              : "Your class and level don’t start with spellcasting in the SRD setup this app uses (for example, a 1st-level fighter or ranger, or a paladin before 2nd level). You can still add spells later on the Spells tab if your DM grants them."}
          </p>
        </div>
        <button type="button" className="btn-primary w-full py-3" onClick={onNext}>
          {!draft.useMulticlass && draft.level > 1 ? "Continue — level 2 choices" : "Continue to review"}
        </button>
      </div>
    );
  }

  return (
    <SpellPickerPanel
      draft={draft}
      updateDraft={updateDraft}
      profile={profile}
      race={race}
      segmentKey={undefined}
      onCanProceedChange={() => {}}
      showIntro
      onNext={onNext}
    />
  );
}

function SpellPickerPanel({
  draft,
  updateDraft,
  profile,
  race,
  segmentKey,
  onCanProceedChange,
  showIntro,
  onNext,
}: {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  profile: CreationSpellProfile;
  race: Race | undefined;
  segmentKey: string | undefined;
  onCanProceedChange: (ok: boolean) => void;
  showIntro?: boolean;
  /** Single-class only: show Continue button wired to `canProceed`. */
  onNext?: () => void;
}) {
  const [classSpells, setClassSpells] = useState<Spell[]>([]);
  const [loadingSpells, setLoadingSpells] = useState(true);
  const [levelCheckError, setLevelCheckError] = useState<string | null>(null);
  const [detailSpell, setDetailSpell] = useState<Spell | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const { cantrips, leveled, wizPrep } = readSpellPicks(draft, segmentKey);

  useEffect(() => {
    let cancelled = false;
    setLoadingSpells(true);
    referenceApi
      .spells({ class: profile.spellListSlug })
      .then((list) => {
        if (!cancelled) setClassSpells(list);
      })
      .catch(() => {
        if (!cancelled) setClassSpells([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSpells(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.spellListSlug]);

  const cantripSet = useMemo(() => new Set(cantrips), [cantrips]);
  const leveledSet = useMemo(() => new Set(leveled), [leveled]);

  const leveledPicks: StartingSpellPick[] = useMemo(() => {
    return leveled.map((slug) => ({
      spellSlug: slug,
      prepared:
        profile.mode === "prepared"
          ? true
          : profile.mode === "wizard"
            ? wizPrep.includes(slug)
            : false,
    }));
  }, [leveled, profile.mode, wizPrep]);

  const structural = validateStartingSpellPicks(profile, cantrips, leveledPicks);

  useEffect(() => {
    if (structural.ok !== true) {
      setLevelCheckError(null);
      return;
    }
    const slugs = [...cantrips, ...leveled];
    if (slugs.length === 0) {
      setLevelCheckError(null);
      return;
    }
    let cancelled = false;
    Promise.all(slugs.map((s) => referenceApi.spell(s)))
      .then((details) => {
        if (cancelled) return;
        for (const s of cantrips) {
          const d = details.find((x) => x?.slug === s);
          if (!d || d.level !== 0) {
            setLevelCheckError(`"${s}" must be a cantrip (level 0).`);
            return;
          }
        }
        for (const s of leveled) {
          const d = details.find((x) => x?.slug === s);
          if (!d || d.level < 1) {
            setLevelCheckError(`"${s}" must be a leveled spell (not a cantrip).`);
            return;
          }
          if (d.level > profile.maxLeveledSpellLevel) {
            setLevelCheckError(
              `${d.name} is level ${d.level} — pick spells up to level ${profile.maxLeveledSpellLevel}.`,
            );
            return;
          }
        }
        setLevelCheckError(null);
      })
      .catch(() => {
        if (!cancelled) setLevelCheckError("Could not verify spell levels — check your connection.");
      });
    return () => {
      cancelled = true;
    };
  }, [profile.maxLeveledSpellLevel, structural.ok, cantrips, leveled]);

  const canProceed =
    structural.ok === true && !levelCheckError && !loadingSpells;

  useEffect(() => {
    onCanProceedChange(canProceed);
  }, [canProceed, onCanProceedChange]);

  const patch = (next: { cantrips?: string[]; leveled?: string[]; wizPrep?: string[] }) => {
    if (!segmentKey) {
      updateDraft({
        startingCantripSlugs: next.cantrips ?? draft.startingCantripSlugs,
        startingLeveledSlugs: next.leveled ?? draft.startingLeveledSlugs,
        startingWizardPreparedSlugs: next.wizPrep ?? draft.startingWizardPreparedSlugs,
      });
      return;
    }
    const cur = draft.multiclassSpellSegments?.[segmentKey] ?? emptySegment();
    updateDraft({
      multiclassSpellSegments: {
        ...(draft.multiclassSpellSegments ?? {}),
        [segmentKey]: {
          cantripSlugs: next.cantrips ?? cur.cantripSlugs,
          leveledSlugs: next.leveled ?? cur.leveledSlugs,
          wizardPreparedSlugs: next.wizPrep ?? cur.wizardPreparedSlugs,
        },
      },
    });
  };

  const toggleCantrip = (slug: string) => {
    const next = new Set(cantrips);
    if (next.has(slug)) next.delete(slug);
    else if (next.size < profile.cantrips) next.add(slug);
    patch({ cantrips: [...next] });
  };

  const toggleLeveled = (slug: string) => {
    const next = new Set(leveled);
    if (next.has(slug)) {
      next.delete(slug);
      patch({
        leveled: [...next],
        wizPrep: wizPrep.filter((s) => s !== slug),
      });
    } else if (next.size < profile.leveledSpells) {
      next.add(slug);
      let newPrep = [...wizPrep];
      if (profile.mode === "wizard" && newPrep.length < profile.preparedFromLeveled) {
        newPrep = [...newPrep, slug];
      }
      patch({ leveled: [...next], wizPrep: newPrep });
    }
  };

  const toggleWizardPrep = (slug: string) => {
    if (profile.mode !== "wizard") return;
    const need = profile.preparedFromLeveled;
    const set = new Set(wizPrep);
    if (set.has(slug)) set.delete(slug);
    else if (set.size < need) set.add(slug);
    patch({ wizPrep: [...set] });
  };

  const uniqueClassSpells = useMemo(
    () => mergeSpellListsPreferringRichestClasses([classSpells]),
    [classSpells],
  );

  const openSpellReference = (slug: string) => {
    setDetailSpell(null);
    setDetailError(null);
    setDetailLoading(true);
    referenceApi
      .spell(slug)
      .then((s) => {
        setDetailSpell(s);
      })
      .catch(() => {
        setDetailError("Could not load this spell. Check your connection.");
      })
      .finally(() => {
        setDetailLoading(false);
      });
  };

  const cantripPool = uniqueClassSpells.filter((s) => s.level === 0).sort((a, b) => a.name.localeCompare(b.name));
  const leveledPool = uniqueClassSpells
    .filter((s) => s.level >= 1 && s.level <= profile.maxLeveledSpellLevel)
    .sort((a, b) => (a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name)));

  return (
    <div className="space-y-5">
      {showIntro && (
        <div className="dnd-card border border-dnd-border/70 bg-dnd-panel/40 p-4 space-y-2">
          <h2 className="font-display font-bold text-dnd-gold text-lg">Starting spells</h2>
          <p className="text-sm text-stone-200 leading-relaxed">{profile.kidSummary}</p>
          <p className="text-xs text-stone-500">{profile.ruleBlurb}</p>
        </div>
      )}

      {!draft.useMulticlass && draft.level > 1 && (
        <div className="dnd-card border border-dnd-gold/35 bg-dnd-dark/50 p-3 space-y-1">
          <p className="text-sm text-stone-200">
            You are starting at <span className="text-dnd-gold font-semibold">level {draft.level}</span>. This step only
            covers <strong className="text-parchment">1st-level</strong> spell choices (cantrips and initial
            spellbook / known spells). The next steps walk through each higher level—HP, class features, ability
            improvements, and additional spells—just like using Level Up on the sheet.
          </p>
        </div>
      )}

      <p className="text-xs text-stone-500">
        Tap <span className="text-dnd-gold font-display">Info</span> beside a spell to see casting time, range,
        components, duration, and the full description from the SRD reference.
      </p>

      <div className="flex flex-wrap gap-3 text-xs font-display text-gray-400">
        <span>
          Cantrips:{" "}
          <strong className="text-dnd-gold">
            {cantrips.length}/{profile.cantrips}
          </strong>
        </span>
        <span>
          Leveled:{" "}
          <strong className="text-dnd-gold">
            {leveled.length}/{profile.leveledSpells}
          </strong>
        </span>
        {profile.mode === "wizard" && (
          <span>
            Prepared today:{" "}
            <strong className="text-dnd-gold">
              {wizPrep.length}/{profile.preparedFromLeveled}
            </strong>{" "}
            (from your spellbook picks)
          </span>
        )}
      </div>

      {structural.ok === false && (
        <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded p-3">{structural.message}</div>
      )}
      {levelCheckError && (
        <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded p-3">{levelCheckError}</div>
      )}

      {loadingSpells ? (
        <LoadingSpinner />
      ) : (
        <>
          {profile.cantrips > 0 && (
            <section className="space-y-2">
              <h3 className="font-display font-semibold text-white text-sm">Cantrips</h3>
              <p className="text-xs text-gray-500">Tap to add or remove. You need exactly {profile.cantrips}.</p>
              <div className="max-h-52 sm:max-h-48 overflow-auto border border-dnd-border rounded-lg divide-y divide-dnd-border/60">
                {cantripPool.map((sp) => {
                  const on = cantripSet.has(sp.slug);
                  const disabled = !on && cantrips.length >= profile.cantrips;
                  return (
                    <div key={sp.slug} className="flex items-stretch gap-1 px-1 sm:px-2 py-0.5">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleCantrip(sp.slug)}
                        className={clsx(
                          "flex-1 min-w-0 min-h-[2.75rem] text-left px-2 py-2 flex items-center gap-2 text-sm transition-colors rounded touch-manipulation active:opacity-90",
                          on ? "bg-dnd-red/25 text-parchment" : "hover:bg-dnd-panel text-stone-300",
                          disabled && "opacity-40 cursor-not-allowed",
                        )}
                      >
                        <SpellLevelBadge level={0} />
                        <span className="font-display font-medium truncate">{sp.name}</span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 self-stretch sm:self-center min-h-[2.75rem] min-w-[3.25rem] px-2 text-xs font-display text-dnd-gold border border-dnd-border rounded hover:bg-dnd-panel touch-manipulation active:opacity-90"
                        onClick={() => openSpellReference(sp.slug)}
                      >
                        Info
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-display font-semibold text-white text-sm">
              {profile.mode === "wizard" ? "Spellbook (leveled spells)" : "Leveled spells"}
            </h3>
            <p className="text-xs text-gray-500">
              Only spells up to level {profile.maxLeveledSpellLevel} for your slots. Pick exactly {profile.leveledSpells}.
            </p>
            <div className="max-h-[min(50vh,18rem)] sm:max-h-56 overflow-auto border border-dnd-border rounded-lg divide-y divide-dnd-border/60">
              {leveledPool.map((sp) => {
                const on = leveledSet.has(sp.slug);
                const disabled = !on && leveled.length >= profile.leveledSpells;
                return (
                  <div key={sp.slug} className="flex items-stretch gap-1 px-1 sm:px-2 py-0.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleLeveled(sp.slug)}
                      className={clsx(
                        "flex-1 min-w-0 min-h-[2.75rem] text-left flex items-center gap-2 text-sm transition-colors rounded px-2 py-2 touch-manipulation active:opacity-90",
                        on ? "bg-dnd-red/25 text-parchment" : "hover:bg-dnd-panel text-stone-300",
                        disabled && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      <SpellLevelBadge level={sp.level} />
                      <span className="font-display font-medium truncate">{sp.name}</span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 min-h-[2.75rem] min-w-[3.25rem] px-2 text-xs font-display text-dnd-gold border border-dnd-border rounded hover:bg-dnd-panel touch-manipulation active:opacity-90"
                      onClick={() => openSpellReference(sp.slug)}
                    >
                      Info
                    </button>
                    {profile.mode === "wizard" && on && (
                      <label className="flex items-center gap-2 text-xs text-stone-400 shrink-0 cursor-pointer pr-1 min-h-[2.75rem] px-1 touch-manipulation">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-stone-600"
                          checked={wizPrep.includes(sp.slug)}
                          onChange={() => toggleWizardPrep(sp.slug)}
                        />
                        Prep
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {profile.mode === "wizard" && (
            <p className="text-xs text-gray-500">
              Check “Prep” on exactly {profile.preparedFromLeveled} spell(s) you want prepared after your long rest
              (Intelligence {race ? "(after race)" : ""} + wizard level, minimum 1).
            </p>
          )}
        </>
      )}

      {segmentKey === undefined && onNext != null && (
        <button
          type="button"
          className="btn-primary w-full py-3 disabled:opacity-40"
          disabled={!canProceed}
          onClick={onNext}
        >
          {canProceed
            ? !draft.useMulticlass && draft.level > 1
              ? "Continue — level 2 choices"
              : "Continue to review"
            : "Finish the spell picks above"}
        </button>
      )}

      {(detailSpell != null || detailLoading || detailError) && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4 bg-black/75 touch-manipulation"
          onClick={() => {
            setDetailSpell(null);
            setDetailError(null);
            setDetailLoading(false);
          }}
          role="presentation"
        >
          <div
            className="bg-dnd-panel border border-dnd-border border-b-0 sm:border-b rounded-t-2xl sm:rounded-lg shadow-2xl max-w-lg w-full max-h-[min(92dvh,100%)] sm:max-h-[85vh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="spell-detail-title"
          >
            <div className="sm:hidden flex justify-center -mt-1 mb-2" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-stone-600" />
            </div>
            {detailLoading && <p className="text-sm text-stone-400">Loading spell…</p>}
            {detailError && <p className="text-sm text-red-300">{detailError}</p>}
            {detailSpell && (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h3 id="spell-detail-title" className="font-display font-bold text-dnd-gold text-lg pr-2">
                    {detailSpell.name}
                  </h3>
                  <SpellLevelBadge level={detailSpell.level} />
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-300">
                  <div>
                    <dt className="text-stone-500 font-display uppercase tracking-wide">Casting time</dt>
                    <dd>{detailSpell.castingTime}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500 font-display uppercase tracking-wide">Range</dt>
                    <dd>{detailSpell.range}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500 font-display uppercase tracking-wide">Components</dt>
                    <dd>
                      {[
                        detailSpell.components.verbal && "V",
                        detailSpell.components.somatic && "S",
                        detailSpell.components.material && "M",
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                      {detailSpell.components.materials ? ` (${detailSpell.components.materials})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500 font-display uppercase tracking-wide">Duration</dt>
                    <dd>
                      {detailSpell.duration}
                      {detailSpell.concentration ? " (concentration)" : ""}
                      {detailSpell.ritual ? " · ritual" : ""}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-stone-500 font-display uppercase tracking-wide">School</dt>
                    <dd className="capitalize">{detailSpell.school}</dd>
                  </div>
                </dl>
                <div className="text-sm text-stone-200 leading-relaxed whitespace-pre-wrap border-t border-dnd-border pt-3">
                  {detailSpell.description}
                </div>
                {detailSpell.higherLevels ? (
                  <div className="text-sm text-stone-300 leading-relaxed whitespace-pre-wrap border-t border-dnd-border pt-3">
                    <p className="text-dnd-gold font-display text-xs uppercase tracking-wide mb-1">At higher levels</p>
                    {detailSpell.higherLevels}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn-primary w-full text-sm"
                  onClick={() => {
                    setDetailSpell(null);
                    setDetailError(null);
                  }}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
