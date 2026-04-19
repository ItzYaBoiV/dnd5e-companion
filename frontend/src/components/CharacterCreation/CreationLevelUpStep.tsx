import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AbilityName,
  CharacterDraft,
  CreationLevelUpPayload,
  DndClass,
  MonsterSummary,
  Spell,
} from "@/types/dnd";
import { ABILITY_LABELS, ABILITY_NAMES } from "@/types/dnd";
import { monsterApi, referenceApi } from "@/services/api";
import { isAsiFeatureName } from "@/lib/levelUpGuide";
import {
  getSpellLearnBudget,
  needsSubclassChoiceForClassLevel,
} from "@/lib/levelUpSpellBudget";
import { scoresAfterRace } from "@/lib/suggestedAbilityScores";
import {
  appendBeastCompanionNote,
  appendSpellChoicesToDescription,
  withSelectedFeatureOptions,
} from "@/lib/levelUpFormHelpers";
import { resolveGrantPickSpecWithFallback } from "@/lib/levelUpFeatureChoiceCatalog";
import {
  buildGrantCandidatesForClassLevel,
  resolveSubclassOnClass,
} from "@/lib/levelUpGrantCandidates";
import {
  grantPickError,
  HUMANOID_FAVORED_ENEMY_OPTION_KEY,
  isGrantSpecRenderable,
  type GrantPickSpec,
} from "@/lib/levelUpGrantPickTypes";
import { GrantPickControls } from "@/components/levelUp/GrantPickControls";
import { clsx } from "clsx";
import { useReferenceStore } from "@/store/referenceStore";
import { formatModifier } from "@/components/common";
import { classLevelsAfterCharLevel } from "@/lib/multiclassLevelPlan";

type GrantEntry = {
  key: string;
  name: string;
  description: string;
  source: string;
  kind: "class" | "sub";
};

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
  /** 0-based: reaching character level `slotIndex + 2`. */
  slotIndex: number;
}

export default function CreationLevelUpStep({ draft, updateDraft, onNext, slotIndex }: Props) {
  const isMc =
    draft.useMulticlass && draft.classLevels.filter((r) => r.classSlug.trim()).length >= 2;
  const levelClassSlug = (isMc ? draft.multiclassLevelOrder[slotIndex] ?? "" : draft.classSlug).trim();
  const countsBefore = classLevelsAfterCharLevel(draft, slotIndex + 1);
  const nextCharLevel = slotIndex + 2;
  const oldClassLevel = isMc ? countsBefore[levelClassSlug] ?? 0 : slotIndex + 1;
  const newClassLevel = oldClassLevel + 1;
  const rowForClass = draft.classLevels.find((r) => r.classSlug.trim() === levelClassSlug);

  const [classRef, setClassRef] = useState<DndClass | null>(null);
  const [classLoadError, setClassLoadError] = useState<string | null>(null);
  const [classSpells, setClassSpells] = useState<Spell[]>([]);
  const [hpCustom, setHpCustom] = useState("");
  const [pendingSubclassSlug, setPendingSubclassSlug] = useState("");
  const [grantOn, setGrantOn] = useState<Record<string, boolean>>({});
  const [asiMode, setAsiMode] = useState<"plus2" | "split">("plus2");
  const [skipAsi, setSkipAsi] = useState(false);
  const [asiAbility2, setAsiAbility2] = useState<AbilityName>("strength");
  const [asiA, setAsiA] = useState<AbilityName>("strength");
  const [asiB, setAsiB] = useState<AbilityName>("dexterity");
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
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  const { races, loadRaces, backgrounds, loadBackgrounds } = useReferenceStore();
  useEffect(() => {
    void loadRaces();
    void loadBackgrounds();
  }, [loadRaces, loadBackgrounds]);
  const race = races.find((r) => r.slug === draft.raceSlug);
  const bg = backgrounds.find((b) => b.slug === draft.backgroundSlug);
  const proficientSkillSlugs = useMemo(
    () => [...new Set([...(draft.chosenSkills ?? []), ...(bg?.skillProficiencies ?? [])])],
    [draft.chosenSkills, bg?.skillProficiencies],
  );
  const scoresBase = useMemo(
    () => scoresAfterRace(draft.scores, race, draft.subraceSlug),
    [draft.scores, draft.subraceSlug, race],
  );

  useEffect(() => {
    setRestored(false);
    setPendingSubclassSlug("");
    setPickedFeatureOptions({});
    setPickedGrantSpells({});
    setHumanoidFavoredRaces({});
    setBeastSearchByGrant({});
  }, [slotIndex, levelClassSlug]);

  const ups = draft.creationLevelUps ?? [];
  const stored = ups[slotIndex] ?? {};
  const storedSubclassSlug = (ups[slotIndex]?.subclassSlug ?? "").trim();
  const committedSubclassSlug = useMemo(() => {
    if (isMc) return (rowForClass?.subclassSlug ?? "").trim() || storedSubclassSlug;
    return (draft.subclassSlug ?? "").trim() || storedSubclassSlug;
  }, [isMc, rowForClass?.subclassSlug, draft.subclassSlug, storedSubclassSlug]);

  const abilities = useMemo(() => {
    let s = { ...scoresBase };
    for (let i = 0; i < slotIndex; i++) {
      for (const b of ups[i]?.abilityScoreImprovement ?? []) {
        const a = b.ability as AbilityName;
        if (ABILITY_NAMES.includes(a)) s[a] += b.increase;
      }
    }
    return s;
  }, [scoresBase, slotIndex, ups]);

  const con = Math.floor((abilities.constitution - 10) / 2);

  useEffect(() => {
    let cancelled = false;
    setClassLoadError(null);
    if (!levelClassSlug) return;
    referenceApi
      .class(levelClassSlug)
      .then((c) => {
        if (!cancelled) setClassRef(c);
      })
      .catch(() => {
        if (!cancelled) {
          setClassRef(null);
          setClassLoadError("Could not load class details.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [levelClassSlug]);

  useEffect(() => {
    let cancelled = false;
    if (!levelClassSlug) {
      setClassSpells([]);
      return;
    }
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
  }, [levelClassSlug]);

  const hitDie = classRef?.hitDie ?? 8;
  const defaultHp = Math.max(1, Math.floor(hitDie / 2) + 1 + con);

  const effectiveSubclassLower = (
    pendingSubclassSlug ||
    (isMc ? rowForClass?.subclassSlug : draft.subclassSlug) ||
    storedSubclassSlug ||
    ""
  ).toLowerCase();

  /** Subclass already on the sheet / draft — not in-flight picks from other level-up steps. */
  const needsSubclass = needsSubclassChoiceForClassLevel(
    levelClassSlug,
    newClassLevel,
    committedSubclassSlug,
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

  const effectiveSubclassPickSlug = useMemo(
    () => pendingSubclassSlug.trim() || committedSubclassSlug,
    [pendingSubclassSlug, committedSubclassSlug],
  );

  const subclassPickSatisfied = useMemo(() => {
    if (!needsSubclass) return true;
    if (subclassOptions.length === 0) return false;
    const pick = effectiveSubclassPickSlug.trim();
    if (!pick) return false;
    if (subclassOptions.some((s) => s.slug === pick)) return true;
    if (!classRef) return false;
    const resolved = resolveSubclassOnClass(classRef, pick);
    return resolved != null && subclassOptions.some((s) => s.slug === resolved.slug);
  }, [needsSubclass, subclassOptions, effectiveSubclassPickSlug, classRef]);

  /** Canonical API slug so radios stay selected when the draft stores a shorter/variant slug. */
  const subclassSlugForRadios = useMemo(() => {
    if (!effectiveSubclassPickSlug.trim()) return "";
    if (!classRef) return effectiveSubclassPickSlug;
    const r = resolveSubclassOnClass(classRef, effectiveSubclassPickSlug);
    return r?.slug ?? effectiveSubclassPickSlug;
  }, [classRef, effectiveSubclassPickSlug]);

  const spellBudget = useMemo(
    () =>
      getSpellLearnBudget(levelClassSlug, effectiveSubclassLower, oldClassLevel, newClassLevel),
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

  const knownSpellSlugs = useMemo(() => {
    const known = new Set<string>();
    for (const slug of draft.startingCantripSlugs ?? []) known.add(slug);
    for (const slug of draft.startingLeveledSlugs ?? []) known.add(slug);
    for (const seg of Object.values(draft.multiclassSpellSegments ?? {})) {
      for (const slug of seg.cantripSlugs ?? []) known.add(slug);
      for (const slug of seg.leveledSlugs ?? []) known.add(slug);
    }
    for (let i = 0; i < slotIndex; i++) {
      for (const ls of ups[i]?.learnSpells ?? []) known.add(ls.spellSlug);
    }
    return known;
  }, [draft.startingCantripSlugs, draft.startingLeveledSlugs, draft.multiclassSpellSegments, slotIndex, ups]);

  const existingFeatureNames = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < slotIndex; i++) {
      for (const f of ups[i]?.grantFeatures ?? []) {
        s.add(f.name.trim().toLowerCase());
      }
    }
    return s;
  }, [slotIndex, ups]);

  const grantCandidates: GrantEntry[] = useMemo(() => {
    if (!classRef) return [];
    return buildGrantCandidatesForClassLevel(classRef, newClassLevel, effectiveSubclassPickSlug);
  }, [classRef, newClassLevel, effectiveSubclassPickSlug]);

  const hasAsiOption = useMemo(() => {
    for (const g of grantCandidates) {
      if (isAsiFeatureName(g.name)) return true;
    }
    return false;
  }, [grantCandidates]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const g of grantCandidates) {
      const n = g.name.trim().toLowerCase();
      const exists = existingFeatureNames.has(n);
      // "Expertise" is repeatable across classes/subclasses; do not auto-disable it by name dedupe.
      const repeatableByName = n.includes("expertise");
      next[g.key] = repeatableByName ? true : !exists;
    }
    setGrantOn(next);
  }, [grantCandidates, existingFeatureNames]);

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
  }, [grantCandidates, levelClassSlug, newClassLevel, effectiveSubclassLower, proficientSkillSlugs]);

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
    if (!needsReferenceSpells) return;
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
  }, [needsReferenceSpells]);

  useEffect(() => {
    if (!needsBeasts) return;
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
  }, [needsBeasts]);

  useEffect(() => {
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
  }, [grantCandidates, grantPickSpecs, grantOn]);

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
      issues.push("Subclass selection is due, but no subclass options loaded.");
    }
    if (needsSubclass && subclassOptions.length > 0 && !subclassPickSatisfied) {
      issues.push("Choose a subclass before continuing.");
    }
    if (
      levelClassSlug === "cleric" &&
      grantCandidates.some((g) => /divine domain feature/i.test(g.name) && !g.description?.trim())
    ) {
      issues.push(
        "Cleric: Divine Domain row has no description — confirm your domain is set and matches the compendium (try re-picking the domain on the class step if needed).",
      );
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
    if (leveledPickCap > 0 && leveledSpellOptions.length === 0) {
      issues.push("No leveled spell options match filters — check connection or class data.");
    }
    return [...new Set(issues)];
  }, [
    levelClassSlug,
    needsSubclass,
    subclassOptions.length,
    subclassPickSatisfied,
    grantCandidates,
    grantOn,
    grantPickSpecs,
    pickedFeatureOptions,
    pickedGrantSpells,
    humanoidFavoredRaces,
    leveledPickCap,
    leveledSpellOptions.length,
  ]);

  const missingRequirements = useMemo(() => {
    const missing: string[] = [];
    if (needsSubclass && subclassOptions.length > 0 && !subclassPickSatisfied) {
      missing.push("Choose a subclass for this class level.");
    }
    if (hasAsiOption && !skipAsi && asiMode === "split" && asiA === asiB) {
      missing.push("ASI split must use two different abilities.");
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
      if (err) missing.push(`${g.name}: ${err}`);
    }
    if (spellBudget.cantrips > 0 && pickedCantrips.length !== spellBudget.cantrips) {
      missing.push(`Cantrips: ${pickedCantrips.length}/${spellBudget.cantrips} selected.`);
    }
    if (leveledPickCap > 0 && pickedLeveled.length !== leveledPickCap) {
      missing.push(`Leveled spells: ${pickedLeveled.length}/${leveledPickCap} selected.`);
    }
    const asiInvalid =
      hasAsiOption && !skipAsi && ((asiMode === "split" && asiA === asiB) || (asiMode !== "split" && !asiAbility2));
    if (asiInvalid) {
      missing.push("Choose a valid Ability Score Improvement.");
    }
    const trimmed = hpCustom.trim();
    if (trimmed) {
      const n = parseInt(trimmed, 10);
      if (Number.isNaN(n) || n < 1) {
        missing.push("HP gained must be a positive number (or leave blank for average).");
      }
    }
    for (const issue of sanityIssues) missing.push(issue);
    return [...new Set(missing)];
  }, [
    needsSubclass,
    subclassOptions.length,
    subclassPickSatisfied,
    hasAsiOption,
    skipAsi,
    asiMode,
    asiA,
    asiB,
    grantCandidates,
    grantOn,
    grantPickSpecs,
    pickedFeatureOptions,
    pickedGrantSpells,
    humanoidFavoredRaces,
    spellBudget.cantrips,
    pickedCantrips.length,
    leveledPickCap,
    pickedLeveled.length,
    hpCustom,
    sanityIssues,
  ]);

  useEffect(() => {
    if (restored || !classSpells.length) return;
    const p = stored;
    if (!p || Object.keys(p).length === 0) return;
    if (p.hpIncrease != null) setHpCustom(String(p.hpIncrease));
    if (p.subclassSlug) setPendingSubclassSlug(p.subclassSlug);
    if (p.learnSpells?.length) {
      const c: string[] = [];
      const l: string[] = [];
      for (const row of p.learnSpells) {
        const sp = classSpells.find((x) => x.slug === row.spellSlug);
        if (!sp) continue;
        if (sp.level === 0) c.push(row.spellSlug);
        else l.push(row.spellSlug);
      }
      setPickedCantrips(c);
      setPickedLeveled(l);
    }
    setRestored(true);
  }, [classSpells, restored, stored]);

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

  const persistAndContinue = () => {
    if (missingRequirements.length > 0) {
      alert(`Finish this level's required choices:\n- ${missingRequirements.join("\n- ")}`);
      return;
    }
    if (needsSubclass && subclassOptions.length > 0 && !subclassPickSatisfied) {
      alert("Choose a subclass before continuing.");
      return;
    }
    if (hasAsiOption && !skipAsi && asiMode === "split" && asiA === asiB) {
      alert("For +1/+1, pick two different abilities.");
      return;
    }
    if (hasAsiOption && !skipAsi) {
      const asiTry = buildAsiPayload();
      if (asiTry?.length) {
        for (const b of asiTry) {
          const cur = abilities[b.ability];
          const nextScore = cur + b.increase;
          if (nextScore > 20) {
            alert(
              `Ability scores cannot exceed 20 without a special class feature. ${ABILITY_LABELS[b.ability].abbr}: current ${cur}, attempted ${nextScore}.`,
            );
            return;
          }
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
    if (pickedCantrips.length !== spellBudget.cantrips && spellBudget.cantrips > 0) {
      alert(`Pick exactly ${spellBudget.cantrips} cantrip(s) for this level.`);
      return;
    }
    if (pickedLeveled.length !== leveledPickCap && leveledPickCap > 0) {
      alert(`Pick exactly ${leveledPickCap} leveled spell(s) for this level.`);
      return;
    }

    setBusy(true);
    try {
      const trimmed = hpCustom.trim();
      let hpIncrease: number | undefined;
      if (trimmed) {
        const n = parseInt(trimmed, 10);
        if (Number.isNaN(n) || n < 1) {
          alert("HP must be a positive number, or leave blank for average.");
          return;
        }
        hpIncrease = n;
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

      const asiPayload = !skipAsi ? buildAsiPayload() : undefined;
      if (hasAsiOption && !skipAsi && asiPayload == null) {
        alert("Choose valid ability score increases.");
        return;
      }

      const resolvedSubclassSlug =
        needsSubclass && subclassPickSatisfied && effectiveSubclassPickSlug.trim()
          ? (classRef
              ? resolveSubclassOnClass(classRef, effectiveSubclassPickSlug.trim())?.slug
              : undefined) ?? effectiveSubclassPickSlug.trim()
          : "";

      const payload: CreationLevelUpPayload = {
        ...(isMc && levelClassSlug ? { classSlug: levelClassSlug } : {}),
        ...(hpIncrease != null ? { hpIncrease } : {}),
        ...(resolvedSubclassSlug ? { subclassSlug: resolvedSubclassSlug } : {}),
        ...(grantFeatures.length ? { grantFeatures } : {}),
        ...(learnSpells.length ? { learnSpells } : {}),
        ...(hasAsiOption && !skipAsi && asiPayload?.length ? { abilityScoreImprovement: asiPayload } : {}),
      };

      const nextUps = [...(draft.creationLevelUps ?? [])];
      while (nextUps.length <= slotIndex) nextUps.push({});
      nextUps[slotIndex] = payload;
      const draftPatch: Partial<CharacterDraft> = { creationLevelUps: nextUps };
      if (resolvedSubclassSlug) {
        if (isMc && rowForClass) {
          draftPatch.classLevels = draft.classLevels.map((r) =>
            r.classSlug.trim() === levelClassSlug ? { ...r, subclassSlug: resolvedSubclassSlug } : r,
          );
        } else if (!isMc) {
          draftPatch.subclassSlug = resolvedSubclassSlug;
        }
      }
      updateDraft(draftPatch);
      onNext();
    } finally {
      setBusy(false);
    }
  };

  if (isMc && !levelClassSlug) {
    return (
      <div className="dnd-card border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-200">
        This step is missing which class should level up. Go back to <strong>Class</strong> and set your multiclass
        level path (1st-level class plus order for levels 2–{draft.level}).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="dnd-card border border-dnd-border/70 bg-dnd-panel/40 p-4 space-y-2">
        <h2 className="font-display font-bold text-dnd-gold text-lg">Reach level {nextCharLevel}</h2>
        <p className="text-sm text-stone-300 leading-relaxed">
          You are adding one level in{" "}
          <span className="text-parchment">{levelClassSlug.replace(/-/g, " ")}</span> (class level {oldClassLevel} →{" "}
          {newClassLevel}
          {isMc ? "; multiclass — only this class’s features and hit die apply this step" : ""}). Set HP, features,
          spells, and ability improvements the same way you would when leveling on the sheet.
        </p>
      </div>

      <section
        className={clsx(
          "rounded-lg border p-3 space-y-2",
          missingRequirements.length
            ? "border-amber-800/70 bg-amber-950/20"
            : "border-emerald-900/60 bg-emerald-950/15",
        )}
      >
        <h3
          className={clsx(
            "font-display text-sm font-semibold",
            missingRequirements.length ? "text-amber-200" : "text-emerald-200",
          )}
        >
          Required this level
        </h3>
        <ul className="text-xs space-y-1.5">
          <li className="text-stone-300">
            {!needsSubclass
              ? "Not required — subclass choice is not due this level."
              : subclassOptions.length === 0
                ? "Required — subclass is due, but no options loaded (check connection or reload)."
                : subclassPickSatisfied
                  ? "OK — subclass chosen."
                  : "Missing — choose subclass."}
          </li>
          <li className="text-stone-300">
            {spellBudget.cantrips > 0
              ? pickedCantrips.length === spellBudget.cantrips
                ? `OK — cantrips ${pickedCantrips.length}/${spellBudget.cantrips}.`
                : `Missing — cantrips ${pickedCantrips.length}/${spellBudget.cantrips}.`
              : "Not required — no cantrips gained this level."}
          </li>
          <li className="text-stone-300">
            {leveledPickCap > 0
              ? pickedLeveled.length === leveledPickCap
                ? `OK — leveled spells ${pickedLeveled.length}/${leveledPickCap}.`
                : `Missing — leveled spells ${pickedLeveled.length}/${leveledPickCap}.`
              : spellBudget.isPreparedCaster && classRef?.spellcastingAbility
                ? "Prepared caster — no spells to pick in this wizard; update prepared spells and slots on your sheet (new spell tiers unlock as this class level rises)."
                : "Not required — no leveled spells gained this level."}
          </li>
          <li className="text-stone-300">
            {hasAsiOption
              ? skipAsi
                ? "Skipped — ASI/feat handled outside this flow."
                : "Required — pick a valid ASI (+2 one stat or +1/+1 two stats)."
              : "Not required — no ASI this class level."}
          </li>
        </ul>
        {missingRequirements.length > 0 ? (
          <div className="rounded border border-amber-900/60 bg-amber-950/30 p-2.5">
            <p className="text-xs font-display text-amber-200 mb-1">Still missing</p>
            <ul className="text-xs text-amber-100/90 list-disc list-inside space-y-1">
              {missingRequirements.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-emerald-200/90">All required choices for this level are complete.</p>
        )}
      </section>

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
        ) : spellBudget.isPreparedCaster && classRef?.spellcastingAbility && spellBudget.cantrips === 0 && leveledPickCap === 0 ? (
          <p>
            Prepared caster — no spell picks are required in this step. Your class table still controls max spell level
            and how many spells you prepare.
          </p>
        ) : (
          <p>Ready to continue when spell picks match the counts below.</p>
        )}
      </section>

      {needsSubclassChoice ? (
        <section className="rounded-lg border border-dnd-gold/40 bg-dnd-dark/50 p-3 space-y-2">
          <h3 className="font-display text-sm font-semibold text-dnd-gold">Choose your subclass</h3>
          <ul className="space-y-2">
            {subclassOptions.map((sub) => (
              <li key={sub.slug}>
                <label
                  className={clsx(
                    "flex gap-3 cursor-pointer rounded-md border p-3 min-h-[2.75rem] items-start text-sm transition-colors touch-manipulation active:opacity-90",
                    subclassSlugForRadios === sub.slug
                      ? "border-dnd-gold bg-dnd-gold/10"
                      : "border-dnd-border hover:border-stone-600",
                  )}
                >
                  <input
                    type="radio"
                    name="creation-subclass-pick"
                    checked={subclassSlugForRadios === sub.slug}
                    onChange={() => setPendingSubclassSlug(sub.slug)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-stone-600"
                  />
                  <div>
                    <p className="font-medium text-stone-200">{sub.name}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {grantCandidates.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-display text-sm font-semibold text-dnd-gold">Features you gain</h3>
          <ul className="space-y-2">
            {grantCandidates.map((g) => (
              <li
                key={g.key}
                className="rounded-md border border-dnd-border bg-dnd-panel/40 p-2 text-sm space-y-1"
              >
                <label className="flex items-start gap-3 cursor-pointer touch-manipulation min-h-[2.75rem]">
                  <input
                    type="checkbox"
                    checked={!!grantOn[g.key]}
                    onChange={() => toggleGrant(g.key)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-stone-600"
                  />
                  <span>
                    <span className="font-medium text-stone-200">
                      {g.kind === "sub" ? "Subclass — " : ""}
                      {g.name}
                    </span>
                    {g.description ? (
                      <p className="text-xs text-stone-400 mt-1 leading-relaxed whitespace-pre-wrap">
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
                        variant="creation"
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
        <section className="rounded-md border border-dnd-border/60 bg-dnd-panel/20 p-3 text-xs text-stone-400 space-y-1.5">
          <p className="font-display font-semibold text-dnd-gold/90">Spellcasting reminder</p>
          <p>
            Some levels only raise your spell slots or maximum spell level (for example Cleric 3 unlocking 2nd-level
            slots) without a new named feature in SRD data. Adjust prepared spells and slot tracking on your character
            sheet for <span className="text-stone-300">{classRef.name}</span> level {newClassLevel}.
          </p>
        </section>
      )}

      {hasAsiOption && (
        <section className="rounded-lg border border-dnd-border/80 bg-dnd-panel/30 p-3 space-y-3">
          <h3 className="font-display text-sm font-semibold text-dnd-gold">Ability Score Improvement</h3>
          <label className="flex items-center gap-2 text-xs text-stone-400 cursor-pointer">
            <input
              type="checkbox"
              checked={skipAsi}
              onChange={(e) => setSkipAsi(e.target.checked)}
              className="rounded border-stone-600"
            />
            Skip for now (e.g. feat with DM)
          </label>
          {!skipAsi && (
            <>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" checked={asiMode === "plus2"} onChange={() => setAsiMode("plus2")} />
                  +2 to one ability
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" checked={asiMode === "split"} onChange={() => setAsiMode("split")} />
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
                      {ABILITY_LABELS[a].full} ({abilities[a]})
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
                        {ABILITY_LABELS[a].abbr} ({abilities[a]})
                      </option>
                    ))}
                  </select>
                  <span className="text-stone-500">and</span>
                  <select
                    value={asiB}
                    onChange={(e) => setAsiB(e.target.value as AbilityName)}
                    className="input-field text-sm"
                  >
                    {ABILITY_NAMES.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_LABELS[a].abbr} ({abilities[a]})
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
          {spellBudget.cantrips > 0 && (
            <div>
              <p className="text-xs text-dnd-gold mb-1">
                Cantrips — pick {spellBudget.cantrips} ({pickedCantrips.length}/{spellBudget.cantrips})
              </p>
              <ul className="max-h-40 overflow-y-auto space-y-1 border border-dnd-border rounded-md p-2">
                {cantripOptions.map((s) => (
                  <li key={s.slug}>
                    <label className="flex gap-2 text-xs cursor-pointer text-stone-300 hover:text-parchment">
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
                Leveled spells — pick {leveledPickCap} ({pickedLeveled.length}/{leveledPickCap})
              </p>
              <ul className="max-h-48 overflow-y-auto space-y-1 border border-dnd-border rounded-md p-2">
                {leveledSpellOptions.map((s) => (
                  <li key={s.slug}>
                    <label className="flex gap-2 text-xs cursor-pointer text-stone-300 hover:text-parchment">
                      <input
                        type="checkbox"
                        checked={pickedLeveled.includes(s.slug)}
                        onChange={() => toggleLeveled(s.slug)}
                      />
                      <span>
                        {s.name}{" "}
                        <span className="text-stone-500">
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

      <div className="rounded-lg bg-dnd-panel/50 border border-dnd-border p-3 space-y-2">
        <label className="dnd-label block">HP gained this level</label>
        <p className="text-xs text-stone-500">
          Roll 1d{hitDie} {formatModifier(con)} (Con), or leave blank for average ({defaultHp}).
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder={`Average ${defaultHp}`}
          value={hpCustom}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^\d{1,2}$/.test(v)) setHpCustom(v);
          }}
          className="input-field w-full max-w-xs text-sm"
          aria-label="Hit points rolled or entered for this level"
        />
      </div>

      <div className="flex justify-stretch sm:justify-end gap-2 pt-2">
        <button
          type="button"
          disabled={busy || missingRequirements.length > 0}
          onClick={() => persistAndContinue()}
          className="btn-primary w-full sm:w-auto px-6 disabled:opacity-40"
        >
          {busy ? "…" : `Continue (level ${nextCharLevel})`}
        </button>
      </div>
    </div>
  );
}
