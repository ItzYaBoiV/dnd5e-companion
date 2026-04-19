import { useCallback, useEffect, useMemo, useState } from "react";
import type { AbilityName, Character, DndClass, MonsterSummary, Spell } from "@/types/dnd";
import { ABILITY_LABELS, ABILITY_NAMES } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { monsterApi, referenceApi } from "@/services/api";
import { buildLevelUpChecklist, isAsiFeatureName } from "@/lib/levelUpGuide";
import {
  getSpellLearnBudget,
  needsSubclassChoiceForClassLevel,
} from "@/lib/levelUpSpellBudget";
import { clsx } from "clsx";
import {
  appendBeastCompanionNote,
  appendSpellChoicesToDescription,
  withSelectedFeatureOptions,
} from "@/lib/levelUpFormHelpers";
import { resolveGrantPickSpecWithFallback } from "@/lib/levelUpFeatureChoiceCatalog";
import {
  grantPickError,
  HUMANOID_FAVORED_ENEMY_OPTION_KEY,
  isGrantSpecRenderable,
  type GrantPickSpec,
} from "@/lib/levelUpGrantPickTypes";
import { GrantPickControls } from "@/components/levelUp/GrantPickControls";
import { buildGrantCandidatesForClassLevel } from "@/lib/levelUpGrantCandidates";

interface Props {
  character: Character;
}

type GrantEntry = {
  key: string;
  name: string;
  description: string;
  source: string;
  kind: "class" | "sub";
};

export function LevelUpPanel({ character }: Props) {
  const { levelUp } = useCharacterStore();
  const [open, setOpen] = useState(false);
  const [hpCustom, setHpCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [classRef, setClassRef] = useState<DndClass | null>(null);
  const [classLoadError, setClassLoadError] = useState<string | null>(null);
  const [reviewedSteps, setReviewedSteps] = useState<Record<string, boolean>>({});
  const [activeGuide, setActiveGuide] = useState<{ key: string; title: string; items: string[] } | null>(null);
  const mc = character.computed.isMulticlass;
  const mcRows = character.computed.classLevelsDetailed ?? [];
  const [levelClassSlug, setLevelClassSlug] = useState(character.classSlug);
  const [pendingSubclassSlug, setPendingSubclassSlug] = useState("");
  const [grantOn, setGrantOn] = useState<Record<string, boolean>>({});
  const [asiMode, setAsiMode] = useState<"plus2" | "split">("plus2");
  const [skipAsi, setSkipAsi] = useState(false);
  const [asiAbility2, setAsiAbility2] = useState<AbilityName>("strength");
  const [asiA, setAsiA] = useState<AbilityName>("strength");
  const [asiB, setAsiB] = useState<AbilityName>("dexterity");
  const [classSpells, setClassSpells] = useState<Spell[]>([]);
  const [pickedCantrips, setPickedCantrips] = useState<string[]>([]);
  const [pickedLeveled, setPickedLeveled] = useState<string[]>([]);
  const [pickedFeatureOptions, setPickedFeatureOptions] = useState<Record<string, string[]>>({});
  const [pickedGrantSpells, setPickedGrantSpells] = useState<Record<string, string[]>>({});
  const [humanoidFavoredRaces, setHumanoidFavoredRaces] = useState<
    Record<string, { raceA: string; raceB: string }>
  >({});
  const [beastSearchByGrant, setBeastSearchByGrant] = useState<Record<string, string>>({});
  const [allRefSpells, setAllRefSpells] = useState<Spell[]>([]);
  const [wizardRefSpells, setWizardRefSpells] = useState<Spell[]>([]);
  const [beastCandidates, setBeastCandidates] = useState<MonsterSummary[]>([]);

  const con = character.computed.modifiers.constitution;
  const selectedMcRow = mcRows.find((r) => r.classSlug === levelClassSlug) ?? mcRows[0];
  const hdThisLevel = selectedMcRow?.hitDie ?? character.hitDieType;
  const defaultHp = Math.max(1, Math.floor(hdThisLevel / 2) + 1 + con);
  const atMax = character.level >= 20;
  const nextCharLevel = character.level + 1;
  const oldClassLevel = selectedMcRow?.levels ?? 1;
  const newClassLevel = oldClassLevel + 1;

  const effectiveSubclassLower = (
    pendingSubclassSlug ||
    selectedMcRow?.subclassSlug ||
    ""
  ).toLowerCase();

  const needsSubclass = needsSubclassChoiceForClassLevel(
    levelClassSlug,
    newClassLevel,
    selectedMcRow?.subclassSlug,
  );
  const subclassOptions = useMemo(() => {
    const rows = classRef?.subclasses ?? [];
    const seen = new Set<string>();
    const out: typeof rows = [];
    for (const s of rows) {
      const key = s.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }, [classRef?.subclasses]);
  const needsSubclassChoice = needsSubclass && subclassOptions.length > 0;

  const spellBudget = useMemo(
    () => getSpellLearnBudget(levelClassSlug, effectiveSubclassLower, oldClassLevel, newClassLevel),
    [levelClassSlug, effectiveSubclassLower, oldClassLevel, newClassLevel],
  );

  const leveledPickCap = spellBudget.knownSpells + spellBudget.wizardSpellbook;

  const maxSpellLevelGuess = useMemo(() => {
    const subL = effectiveSubclassLower;
    const classLevel = newClassLevel;
    const isThirdCaster =
      (levelClassSlug === "fighter" && subL.includes("eldritch")) ||
      (levelClassSlug === "rogue" && subL.includes("arcane")) ||
      levelClassSlug === "eldritch-knight" ||
      levelClassSlug === "arcane-trickster";
    const isHalfCaster =
      (levelClassSlug === "ranger" && classLevel >= 2) || (levelClassSlug === "paladin" && classLevel >= 2);
    if (isThirdCaster) return Math.min(4, Math.max(1, Math.floor(classLevel / 3)));
    if (isHalfCaster) return Math.min(5, Math.max(1, Math.floor(classLevel / 2)));
    return Math.min(9, Math.max(1, Math.ceil(classLevel / 2)));
  }, [effectiveSubclassLower, newClassLevel, levelClassSlug]);

  useEffect(() => {
    if (open && mc && mcRows[0] && !mcRows.some((r) => r.classSlug === levelClassSlug)) {
      setLevelClassSlug(mcRows[0].classSlug);
    }
  }, [open, mc, mcRows, levelClassSlug]);

  useEffect(() => {
    if (!open || atMax) return;
    const slug = levelClassSlug || character.classSlug;
    let cancelled = false;
    setClassLoadError(null);
    referenceApi
      .class(slug)
      .then((c) => {
        if (!cancelled) setClassRef(c);
      })
      .catch(() => {
        if (!cancelled) {
          setClassRef(null);
          setClassLoadError("Could not load class details. Check your connection and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, atMax, levelClassSlug, character.classSlug]);

  useEffect(() => {
    if (!open || atMax) return;
    let cancelled = false;
    referenceApi
      .spells({ class: levelClassSlug })
      .then((list) => {
        if (!cancelled) setClassSpells(list);
      })
      .catch(() => {
        if (!cancelled) setClassSpells([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, atMax, levelClassSlug]);

  const existingFeatureNames = useMemo(
    () => new Set(character.features.map((f) => f.name.trim().toLowerCase())),
    [character.features],
  );

  const knownSpellSlugs = useMemo(
    () => new Set(character.spells.map((s) => s.spellSlug)),
    [character.spells],
  );

  const grantCandidates: GrantEntry[] = useMemo(() => {
    if (!classRef) return [];
    const subSlug = (pendingSubclassSlug || selectedMcRow?.subclassSlug || "").trim();
    return buildGrantCandidatesForClassLevel(classRef, newClassLevel, subSlug);
  }, [classRef, newClassLevel, pendingSubclassSlug, selectedMcRow?.subclassSlug]);

  const hasAsiOption = useMemo(() => {
    for (const g of grantCandidates) {
      if (isAsiFeatureName(g.name)) return true;
    }
    return false;
  }, [grantCandidates]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const g of grantCandidates) {
      const exists = existingFeatureNames.has(g.name.trim().toLowerCase());
      next[g.key] = !exists;
    }
    setGrantOn(next);
  }, [open, grantCandidates, existingFeatureNames]);

  useEffect(() => {
    if (!open) {
      setPendingSubclassSlug("");
      setPickedCantrips([]);
      setPickedLeveled([]);
      setReviewedSteps({});
      setActiveGuide(null);
      setPickedFeatureOptions({});
      setPickedGrantSpells({});
      setHumanoidFavoredRaces({});
      setBeastSearchByGrant({});
    }
  }, [open]);

  const proficientSkillSlugs = useMemo(
    () => character.skillProficiencies ?? [],
    [character.skillProficiencies],
  );

  const grantPickSpecs = useMemo(() => {
    const out: Record<string, GrantPickSpec> = {};
    for (const g of grantCandidates) {
      const spec = resolveGrantPickSpecWithFallback({
        name: g.name,
        description: g.description,
        classSlug: levelClassSlug,
        newClassLevel,
        subclassSlugLower: effectiveSubclassLower,
        proficientSkillSlugs,
      });
      if (spec && isGrantSpecRenderable(spec)) out[g.key] = spec;
    }
    return out;
  }, [
    grantCandidates,
    levelClassSlug,
    newClassLevel,
    effectiveSubclassLower,
    proficientSkillSlugs,
  ]);

  const needsReferenceSpells = useMemo(
    () => Object.values(grantPickSpecs).some((s) => s.kind === "spells"),
    [grantPickSpecs],
  );
  const needsBeasts = useMemo(
    () => Object.values(grantPickSpecs).some((s) => s.kind === "beast-companion"),
    [grantPickSpecs],
  );

  const wizardSpellSlugSet = useMemo(
    () => new Set(wizardRefSpells.map((s) => s.slug)),
    [wizardRefSpells],
  );

  useEffect(() => {
    if (!open || !needsReferenceSpells) return;
    let cancelled = false;
    Promise.all([referenceApi.spells(), referenceApi.spells({ class: "wizard" })])
      .then(([all, wiz]) => {
        if (!cancelled) {
          setAllRefSpells(all);
          setWizardRefSpells(wiz);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllRefSpells([]);
          setWizardRefSpells([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, needsReferenceSpells]);

  useEffect(() => {
    if (!open || !needsBeasts) return;
    let cancelled = false;
    monsterApi
      .byCr(0, 0.25)
      .then((rows) => {
        if (!cancelled) setBeastCandidates(rows);
      })
      .catch(() => {
        if (!cancelled) setBeastCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, needsBeasts]);

  useEffect(() => {
    if (!open) return;
    for (const g of grantCandidates) {
      const spec = grantPickSpecs[g.key];
      if (spec?.kind !== "channel-divinity" || !grantOn[g.key]) continue;
      const allKeys = spec.options.map((o) => o.key);
      setPickedFeatureOptions((prev) => {
        const cur = prev[g.key] ?? [];
        if (cur.length === allKeys.length && allKeys.every((k) => cur.includes(k))) return prev;
        return { ...prev, [g.key]: allKeys };
      });
    }
  }, [open, grantCandidates, grantPickSpecs, grantOn]);

  const checklist = useMemo(() => {
    const base = buildLevelUpChecklist(character, classRef, nextCharLevel, {
      classSlugGaining: levelClassSlug,
      classTierAfter: newClassLevel,
      subclassSlugForClass: selectedMcRow?.subclassSlug,
    });
    // Avoid showing the same feature text twice (once in "Features you gain", once in checklist).
    return grantCandidates.length > 0
      ? base.filter((b) => b.title.toLowerCase() !== "class features at this level")
      : base;
  }, [character, classRef, nextCharLevel, grantCandidates.length, levelClassSlug, newClassLevel, selectedMcRow?.subclassSlug]);

  const cantripOptions = useMemo(() => {
    return classSpells
      .filter((s) => s.level === 0 && !knownSpellSlugs.has(s.slug))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classSpells, knownSpellSlugs]);

  const leveledSpellOptions = useMemo(() => {
    return classSpells
      .filter(
        (s) =>
          s.level >= 1 &&
          s.level <= maxSpellLevelGuess &&
          !knownSpellSlugs.has(s.slug),
      )
      .sort((a, b) => (a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name)));
  }, [classSpells, knownSpellSlugs, maxSpellLevelGuess]);

  const sanityIssues = useMemo(() => {
    const issues: string[] = [];
    if (needsSubclass && subclassOptions.length === 0) {
      issues.push("Subclass selection is due, but no subclass options are loaded for this class.");
    }
    if (needsSubclassChoice && !pendingSubclassSlug.trim()) {
      issues.push("Subclass must be selected before applying this level.");
    }
    const byName = new Set<string>();
    for (const g of grantCandidates) {
      const n = g.name.trim().toLowerCase();
      if (byName.has(n)) issues.push(`Duplicate feature entry detected: ${g.name}`);
      byName.add(n);
    }
    if (leveledPickCap > 0 && leveledSpellOptions.length === 0) {
      issues.push("No leveled spell options are available for the current filters/data.");
    }
    for (const g of grantCandidates) {
      if (!grantOn[g.key]) continue;
      const spec = grantPickSpecs[g.key];
      if (!spec) continue;
      const err = grantPickError(
        spec,
        pickedFeatureOptions[g.key] ?? [],
        pickedGrantSpells[g.key] ?? [],
        humanoidFavoredRaces[g.key] ?? { raceA: "", raceB: "" },
      );
      if (err) issues.push(`${g.name}: ${err}`);
    }
    return [...new Set(issues)];
  }, [
    needsSubclass,
    subclassOptions.length,
    needsSubclassChoice,
    pendingSubclassSlug,
    grantCandidates,
    grantOn,
    grantPickSpecs,
    pickedFeatureOptions,
    pickedGrantSpells,
    humanoidFavoredRaces,
    leveledPickCap,
    leveledSpellOptions.length,
  ]);

  const toggleGrant = (key: string) => {
    setGrantOn((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCantrip = (slug: string) => {
    setPickedCantrips((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= spellBudget.cantrips) return prev;
      return [...prev, slug];
    });
  };

  const toggleLeveled = (slug: string) => {
    setPickedLeveled((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= leveledPickCap) return prev;
      return [...prev, slug];
    });
  };

  const buildAsiPayload = useCallback((): { ability: AbilityName; increase: 1 | 2 }[] | undefined => {
    if (!hasAsiOption) return undefined;
    if (asiMode === "plus2") {
      return [{ ability: asiAbility2, increase: 2 }];
    }
    if (asiA === asiB) return undefined;
    return [
      { ability: asiA, increase: 1 },
      { ability: asiB, increase: 1 },
    ];
  }, [hasAsiOption, asiMode, asiAbility2, asiA, asiB]);

  const submit = async () => {
    if (needsSubclassChoice && !pendingSubclassSlug.trim()) {
      alert("Choose a subclass for this level — the rules require it before you finish leveling.");
      return;
    }
    const asiPayload = !skipAsi ? buildAsiPayload() : undefined;
    if (hasAsiOption && !skipAsi && asiMode === "split" && asiA === asiB) {
      alert("For +1/+1, pick two different abilities.");
      return;
    }
    if (hasAsiOption && !skipAsi && asiPayload?.length) {
      for (const b of asiPayload) {
        const cur = character[b.ability];
        const nextScore = cur + b.increase;
        if (nextScore > 20) {
          alert(
            `Ability scores cannot exceed 20 without a special class feature. ${ABILITY_LABELS[b.ability].abbr}: current ${cur}, attempted ${nextScore}.`,
          );
          return;
        }
      }
    }

    for (const g of grantCandidates) {
      if (!grantOn[g.key]) continue;
      const spec = grantPickSpecs[g.key];
      if (!spec) continue;
      const err = grantPickError(
        spec,
        pickedFeatureOptions[g.key] ?? [],
        pickedGrantSpells[g.key] ?? [],
        humanoidFavoredRaces[g.key] ?? { raceA: "", raceB: "" },
      );
      if (err) {
        alert(`${g.name}: ${err}`);
        return;
      }
    }

    setBusy(true);
    try {
      const trimmed = hpCustom.trim();
      const hpIncrease = trimmed ? parseInt(trimmed, 10) : undefined;
      if (trimmed && (Number.isNaN(hpIncrease) || hpIncrease! < 1)) {
        alert("HP increase must be a positive number, or leave blank for the average.");
        return;
      }

      const grantFeatures = grantCandidates.filter((g) => grantOn[g.key]).map((g) => {
        const spec = grantPickSpecs[g.key];
        let desc = g.description;
        if (spec?.kind === "spells") {
          const slugs = pickedGrantSpells[g.key] ?? [];
          const resolved = slugs
            .map((s) => allRefSpells.find((x) => x.slug === s))
            .filter((x): x is Spell => x != null);
          if (resolved.length) {
            if (spec.addToSpellbook && spec.spellList === "any")
              desc = appendSpellChoicesToDescription(desc, resolved, "Magical Secrets — known spells");
            else if (spec.alwaysPrepared)
              desc = appendSpellChoicesToDescription(desc, resolved, "Signature Spells");
            else if (spec.minSpellLevel === 1 && spec.maxSpellLevel === 1)
              desc = appendSpellChoicesToDescription(desc, resolved, "Spell Mastery (1st-level, at will)");
            else if (spec.minSpellLevel === 2 && spec.maxSpellLevel === 2)
              desc = appendSpellChoicesToDescription(desc, resolved, "Spell Mastery (2nd-level, at will)");
            else desc = appendSpellChoicesToDescription(desc, resolved, "Spell Mastery (at will)");
          }
        } else if (spec?.kind === "beast-companion") {
          const slug = pickedFeatureOptions[g.key]?.[0];
          const m = beastCandidates.find((x) => x.slug === slug);
          if (m) {
            const cr =
              typeof m.challengeRating === "number"
                ? m.challengeRating === 0.25
                  ? "1/4"
                  : String(m.challengeRating)
                : String(m.challengeRating);
            desc = appendBeastCompanionNote(desc, m.name, m.slug, cr);
          }
        } else if (spec?.kind === "channel-divinity") {
          const keys = pickedFeatureOptions[g.key] ?? [];
          if (keys.length) desc = withSelectedFeatureOptions(desc, spec.options, keys);
        } else if (spec?.kind === "options") {
          const keys = pickedFeatureOptions[g.key] ?? [];
          if (keys.length) desc = withSelectedFeatureOptions(desc, spec.options, keys);
          if (
            spec.humanoidRaceFollowUpKey &&
            keys[0] === HUMANOID_FAVORED_ENEMY_OPTION_KEY
          ) {
            const hr = humanoidFavoredRaces[g.key];
            if (hr?.raceA?.trim() && hr?.raceB?.trim()) {
              desc = `${desc}\n\nHumanoid favored enemy races: ${hr.raceA.trim()}, ${hr.raceB.trim()}.`;
            }
          }
        }
        return { description: desc, name: g.name, source: g.source };
      });

      const learnSpells = [
        ...pickedCantrips.map((spellSlug) => ({
          spellSlug,
          prepared: false,
          alwaysPrepared: false,
        })),
        ...pickedLeveled.map((spellSlug) => {
          const sp = classSpells.find((x) => x.slug === spellSlug);
          const prepared = spellBudget.isPreparedCaster && sp != null && sp.level > 0;
          return { spellSlug, prepared, alwaysPrepared: false };
        }),
      ];
      for (const g of grantCandidates) {
        if (!grantOn[g.key]) continue;
        const spec = grantPickSpecs[g.key];
        if (spec?.kind !== "spells") continue;
        if (spec.addToSpellbook) {
          for (const spellSlug of pickedGrantSpells[g.key] ?? []) {
            learnSpells.push({
              spellSlug,
              prepared: true,
              alwaysPrepared: !!spec.alwaysPrepared,
            });
          }
        } else if (spec.alwaysPrepared) {
          for (const spellSlug of pickedGrantSpells[g.key] ?? []) {
            learnSpells.push({
              spellSlug,
              prepared: true,
              alwaysPrepared: true,
            });
          }
        }
      }

      await levelUp({
        hpIncrease,
        classSlug: mc ? levelClassSlug : undefined,
        subclassSlug:
          needsSubclass && pendingSubclassSlug.trim()
            ? pendingSubclassSlug.trim()
            : undefined,
        grantFeatures: grantFeatures.length ? grantFeatures : undefined,
        learnSpells: learnSpells.length ? learnSpells : undefined,
        abilityScoreImprovement: hasAsiOption && !skipAsi ? asiPayload : undefined,
      });
      setOpen(false);
      setHpCustom("");
      setReviewedSteps({});
      setPendingSubclassSlug("");
      setPickedCantrips([]);
      setPickedLeveled([]);
      setPickedFeatureOptions({});
      setPickedGrantSpells({});
      setHumanoidFavoredRaces({});
      setBeastSearchByGrant({});
      setSkipAsi(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const markReviewed = (key: string) => {
    setReviewedSteps((prev) => ({ ...prev, [key]: true }));
  };

  return (
    <div className="dnd-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display font-bold text-sm text-dnd-gold">Level up</p>
          <p className="text-xs text-gray-500">
            Guided choices for level {nextCharLevel} in{" "}
            <span className="text-gray-400">{(levelClassSlug || character.classSlug).replace(/-/g, " ")}</span> (class
            level {newClassLevel}). HP defaults to {defaultHp} unless you enter a roll.
          </p>
        </div>
        <button
          type="button"
          disabled={atMax || busy}
          onClick={() => {
            if (open) {
              setOpen(false);
              setReviewedSteps({});
            } else {
              setOpen(true);
            }
          }}
          className="btn-primary text-sm shrink-0 disabled:opacity-40"
        >
          {atMax ? "Max level" : open ? "Close" : "Level up"}
        </button>
      </div>
      {open && !atMax && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-4">
          {classLoadError && (
            <p className="text-xs text-amber-600 bg-amber-950/40 border border-amber-900/60 rounded-md px-2 py-1.5">
              {classLoadError}
            </p>
          )}
          <section
            className={clsx(
              "rounded-md border px-2 py-1.5 text-xs",
              sanityIssues.length
                ? "border-amber-700/50 bg-amber-950/30 text-amber-100"
                : "border-emerald-800/60 bg-emerald-950/20 text-emerald-200",
            )}
          >
            {sanityIssues.length ? (
              <ul className="list-disc list-inside space-y-1">
                {sanityIssues.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : (
              <p>Sanity check passed for this level flow.</p>
            )}
          </section>
          {mc && mcRows.length > 1 && (
            <div className="rounded-lg bg-gray-900/60 border border-amber-900/50 p-3 space-y-2">
              <label className="dnd-label block">Which class gains a level?</label>
              <select
                value={levelClassSlug}
                onChange={(e) => setLevelClassSlug(e.target.value)}
                className="input-field w-full max-w-md text-sm"
              >
                {mcRows.map((r) => (
                  <option key={r.id} value={r.classSlug}>
                    {r.classSlug.replace(/-/g, " ")} (level {r.levels} in this class) — d{r.hitDie}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsSubclassChoice ? (
            <section className="rounded-lg border border-dnd-gold/40 bg-gray-900/50 p-3 space-y-2">
              <h3 className="font-display text-sm font-semibold text-dnd-gold">Choose your subclass</h3>
              <p className="text-xs text-gray-500">
                At level {newClassLevel} in this class you pick a subclass. Read each option, then select one.
              </p>
              <ul className="space-y-2">
                {subclassOptions.map((sub) => (
                  <li key={sub.slug}>
                    <label
                      className={clsx(
                        "flex gap-2 cursor-pointer rounded-md border p-2 text-sm transition-colors",
                        pendingSubclassSlug === sub.slug
                          ? "border-dnd-gold bg-dnd-gold/10"
                          : "border-gray-700 hover:border-gray-600",
                      )}
                    >
                      <input
                        type="radio"
                        name="subclass-pick"
                        checked={pendingSubclassSlug === sub.slug}
                        onChange={() => setPendingSubclassSlug(sub.slug)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-gray-200">{sub.name}</p>
                        <SubclassBlurb features={sub.features} />
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {needsSubclass && !needsSubclassChoice && (
            <p className="text-xs text-amber-200/90 bg-amber-950/30 border border-amber-700/40 rounded-md px-2 py-1.5">
              This class normally picks a subclass at this level, but no subclass options are available in your
              current reference data yet. You can still level now; set the subclass later once reference data is
              refreshed.
            </p>
          )}

          {grantCandidates.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-display text-sm font-semibold text-dnd-gold">Features you gain</h3>
              <p className="text-xs text-gray-500">
                Checked entries are copied onto your Features tab when you apply (you can uncheck flavor you track
                elsewhere).
              </p>
              <ul className="space-y-2">
                {grantCandidates.map((g) => (
                  <li
                    key={g.key}
                    className="rounded-md border border-gray-700 bg-gray-900/40 p-2 text-sm space-y-1"
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!grantOn[g.key]}
                        onChange={() => toggleGrant(g.key)}
                        className="mt-1 rounded border-gray-600"
                      />
                      <span>
                        <span className="font-medium text-gray-200">
                          {g.kind === "sub" ? "Subclass — " : ""}
                          {g.name}
                        </span>
                        {g.description ? (
                          <p className="text-xs text-gray-400 mt-1 leading-relaxed whitespace-pre-wrap">
                            {g.description}
                          </p>
                        ) : null}
                        {grantPickSpecs[g.key] ? (
                          <GrantPickControls
                            grantKey={g.key}
                            spec={grantPickSpecs[g.key]!}
                            pickedOptions={pickedFeatureOptions[g.key] ?? []}
                            onPickOptionsChange={(keys) =>
                              setPickedFeatureOptions((prev) => ({ ...prev, [g.key]: keys }))
                            }
                            pickedSpells={pickedGrantSpells[g.key] ?? []}
                            onPickSpellsChange={(slugs) =>
                              setPickedGrantSpells((prev) => ({ ...prev, [g.key]: slugs }))
                            }
                            humanoidRaces={humanoidFavoredRaces[g.key] ?? { raceA: "", raceB: "" }}
                            onHumanoidRacesChange={(v) =>
                              setHumanoidFavoredRaces((prev) => ({ ...prev, [g.key]: v }))
                            }
                            allSpells={allRefSpells}
                            wizardSpellSlugs={wizardSpellSlugSet}
                            knownSpellSlugs={knownSpellSlugs}
                            beasts={beastCandidates}
                            beastSearch={beastSearchByGrant[g.key] ?? ""}
                            onBeastSearchChange={(s) =>
                              setBeastSearchByGrant((prev) => ({ ...prev, [g.key]: s }))
                            }
                            variant="sheet"
                          />
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {grantCandidates.length === 0 && classRef?.spellcastingAbility && spellBudget.isPreparedCaster && (
            <section className="rounded-md border border-gray-700/80 bg-gray-900/30 p-3 text-xs text-gray-400 space-y-1.5">
              <p className="font-display font-semibold text-dnd-gold/90">Spellcasting reminder</p>
              <p>
                This class level may increase your spell slots or maximum spell level without a new named SRD feature.
                Update prepared spells and slots on the Spells tab for{" "}
                <span className="text-gray-300">{classRef.name}</span> level {newClassLevel}.
              </p>
            </section>
          )}

          {hasAsiOption && (
            <section className="rounded-lg border border-violet-900/50 bg-violet-950/20 p-3 space-y-3">
              <h3 className="font-display text-sm font-semibold text-dnd-gold">Ability Score Improvement</h3>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipAsi}
                  onChange={(e) => setSkipAsi(e.target.checked)}
                  className="rounded border-gray-600"
                />
                Skip for now (e.g. taking a feat with your DM instead)
              </label>
              {!skipAsi && (
                <>
              <p className="text-xs text-gray-500">
                +2 on one ability, or +1 on two different abilities. Ability scores cannot go above 20 unless another
                rule explicitly allows it (this level-up flow enforces 20).
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={asiMode === "plus2"}
                    onChange={() => setAsiMode("plus2")}
                  />
                  +2 to one ability
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={asiMode === "split"}
                    onChange={() => setAsiMode("split")}
                  />
                  +1 to two abilities
                </label>
              </div>
              {asiMode === "plus2" ? (
                <select
                  value={asiAbility2}
                  onChange={(e) => setAsiAbility2(e.target.value as AbilityName)}
                  className="input-field text-sm max-w-xs"
                >
                  {ABILITY_NAMES.map((a) => (
                    <option key={a} value={a}>
                      {ABILITY_LABELS[a].full} (currently {character[a]})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={asiA}
                    onChange={(e) => setAsiA(e.target.value as AbilityName)}
                    className="input-field text-sm"
                  >
                    {ABILITY_NAMES.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_LABELS[a].abbr} ({character[a]})
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-500">and</span>
                  <select
                    value={asiB}
                    onChange={(e) => setAsiB(e.target.value as AbilityName)}
                    className="input-field text-sm"
                  >
                    {ABILITY_NAMES.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_LABELS[a].abbr} ({character[a]})
                      </option>
                    ))}
                  </select>
                </div>
              )}
                </>
              )}
            </section>
          )}

          {(spellBudget.cantrips > 0 || leveledPickCap > 0) && (
            <section className="space-y-3">
              <h3 className="font-display text-sm font-semibold text-dnd-gold">Spells to add</h3>
              {spellBudget.isPreparedCaster && (
                <p className="text-xs text-gray-500">
                  Prepared casters: new leveled spells are marked prepared here. After a long rest you can change your
                  prepared list on the Spells tab.
                </p>
              )}
              {spellBudget.cantrips > 0 && (
                <div>
                  <p className="text-xs text-dnd-gold mb-1">
                    Cantrips — pick {spellBudget.cantrips} ({pickedCantrips.length}/{spellBudget.cantrips})
                  </p>
                  <ul className="max-h-40 overflow-y-auto space-y-1 border border-gray-800 rounded-md p-2">
                    {cantripOptions.map((s) => (
                      <li key={s.slug}>
                        <label className="flex gap-2 text-xs cursor-pointer text-gray-300 hover:text-white">
                          <input
                            type="checkbox"
                            checked={pickedCantrips.includes(s.slug)}
                            onChange={() => toggleCantrip(s.slug)}
                          />
                          <span>{s.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {leveledPickCap > 0 && (
                <div>
                  <p className="text-xs text-dnd-gold mb-1">
                    Leveled spells — pick {leveledPickCap} ({pickedLeveled.length}/{leveledPickCap}) · showing up to{" "}
                    {maxSpellLevelGuess} (ask your DM if unsure)
                  </p>
                  <ul className="max-h-48 overflow-y-auto space-y-1 border border-gray-800 rounded-md p-2">
                    {leveledSpellOptions.map((s) => (
                      <li key={s.slug}>
                        <label className="flex gap-2 text-xs cursor-pointer text-gray-300 hover:text-white">
                          <input
                            type="checkbox"
                            checked={pickedLeveled.includes(s.slug)}
                            onChange={() => toggleLeveled(s.slug)}
                          />
                          <span>
                            {s.name}{" "}
                            <span className="text-gray-500">
                              (level {s.level} {s.school})
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {spellBudget.isPreparedCaster &&
            spellBudget.cantrips === 0 &&
            leveledPickCap === 0 &&
            character.spellcastingAbility && (
              <p className="text-xs text-gray-500">
                This level may change how many spells you can prepare. Use the Spells tab after leveling to adjust
                prepared spells.
              </p>
            )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-dnd-gold">Level-up guides</h3>
              <p className="text-[0.7rem] text-gray-500">
                Reviewed {Object.values(reviewedSteps).filter(Boolean).length}/{checklist.length}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checklist.map((block, bi) => {
                const blockKey = `b${bi}`;
                const reviewed = !!reviewedSteps[blockKey];
                return (
                  <button
                    key={blockKey}
                    type="button"
                    onClick={() => setActiveGuide({ key: blockKey, title: block.title, items: block.items })}
                    className={clsx(
                      "text-left rounded-md border p-2.5 transition-colors",
                      reviewed
                        ? "border-emerald-800/60 bg-emerald-950/20"
                        : "border-gray-700 bg-gray-900/40 hover:border-gray-600",
                    )}
                  >
                    <p className="text-sm font-semibold text-dnd-gold">{block.title}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Tap to open guide
                      {reviewed ? " · reviewed" : ""}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="rounded-lg bg-gray-900/60 border border-gray-700 p-3 space-y-2">
            <label className="dnd-label block">HP gained this level</label>
            <p className="text-xs text-gray-500">
              Roll 1d{hdThisLevel} + {con >= 0 ? "+" : ""}
              {con} (Constitution) for your{" "}
              <span className="text-gray-300">{(levelClassSlug || character.classSlug).replace(/-/g, " ")}</span> hit
              die, or leave blank to use the average ({defaultHp}).
            </p>
            <input
              type="number"
              min={1}
              placeholder={`Average ${defaultHp}`}
              value={hpCustom}
              onChange={(e) => setHpCustom(e.target.value)}
              className="input-field w-full max-w-xs text-sm"
            />
          </div>
          <div className="sticky bottom-0 bg-black/70 backdrop-blur border border-gray-800 rounded-md p-2 flex gap-2 flex-wrap">
            <button type="button" disabled={busy} onClick={() => void submit()} className="btn-primary text-sm">
              {busy ? "…" : `Apply level ${nextCharLevel}`}
            </button>
          </div>
        </div>
      )}
      {activeGuide && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-2xl rounded-lg border border-gray-700 bg-gray-950 p-3 sm:p-4 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-display text-base text-dnd-gold">{activeGuide.title}</h4>
              <button
                type="button"
                onClick={() => {
                  markReviewed(activeGuide.key);
                  setActiveGuide(null);
                }}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
            <ul className="list-disc ml-5 space-y-2 text-sm text-gray-200 leading-relaxed">
              {activeGuide.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  markReviewed(activeGuide.key);
                  setActiveGuide(null);
                }}
                className="btn-primary text-sm"
              >
                Mark reviewed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubclassBlurb({ features }: { features: { name: string; description: string; level: number }[] }) {
  const first = features?.[0];
  if (!first?.description) {
    return <p className="text-xs text-gray-500 mt-0.5">See SRD / your DM for full subclass details.</p>;
  }
  const short =
    first.description.length > 280 ? `${first.description.slice(0, 277)}…` : first.description;
  return <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{short}</p>;
}

