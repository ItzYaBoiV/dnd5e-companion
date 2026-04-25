import { useEffect, useMemo, useState } from "react";

function clampLevel(n: number): number {
  if (Number.isNaN(n) || n < 1) return 1;
  if (n > 20) return 20;
  return n;
}
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/common";
import { SUBCLASS_CHOICE_LEVEL } from "@/lib/levelUpGuide";
import { getCreationSpellProfile } from "@/lib/creationSpellGuide";
import { referenceApi } from "@/services/api";
import { useReferenceStore } from "@/store/referenceStore";
import { useCharacterStore } from "@/store/characterStore";
import { CharacterCreationStepNext } from "./CharacterCreationStepNext";
import {
  applyAutoEquipToStartingRows,
  gear,
  getBackgroundKitLines,
  getClassStartingKits,
  resolveKitToDraft,
  type ItemSearch,
} from "@/lib/startingEquipmentKits";
import type { AbilityName, Alignment, CharacterDraft, DndClass, Item, Race, StartingInventoryDraftRow } from "@/types/dnd";

type QuickPlaystyle = "balanced" | "frontline" | "striker" | "defender" | "caster" | "support" | "trickster";
type NameMode = "auto" | "custom";

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
const ABILITIES: AbilityName[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

const PLAYSTYLE_PRIORITIES: Record<QuickPlaystyle, AbilityName[]> = {
  balanced: ["constitution", "dexterity", "wisdom", "strength", "charisma", "intelligence"],
  frontline: ["strength", "constitution", "dexterity", "wisdom", "charisma", "intelligence"],
  striker: ["dexterity", "strength", "constitution", "wisdom", "charisma", "intelligence"],
  defender: ["constitution", "strength", "wisdom", "dexterity", "charisma", "intelligence"],
  caster: ["intelligence", "wisdom", "charisma", "constitution", "dexterity", "strength"],
  support: ["wisdom", "charisma", "constitution", "dexterity", "intelligence", "strength"],
  trickster: ["dexterity", "charisma", "intelligence", "wisdom", "constitution", "strength"],
};

const PLAYSTYLE_LABELS: Record<QuickPlaystyle, string> = {
  balanced: "Balanced adventurer",
  frontline: "Frontline bruiser",
  striker: "Fast striker",
  defender: "Tank / protector",
  caster: "Spell-focused caster",
  support: "Healer / support",
  trickster: "Sneaky trickster",
};

const PLAYSTYLE_ALIGNMENT: Record<QuickPlaystyle, Alignment[]> = {
  balanced: ["TRUE_NEUTRAL", "NEUTRAL_GOOD", "LAWFUL_NEUTRAL"],
  frontline: ["CHAOTIC_GOOD", "LAWFUL_GOOD", "TRUE_NEUTRAL"],
  striker: ["CHAOTIC_NEUTRAL", "CHAOTIC_GOOD", "TRUE_NEUTRAL"],
  defender: ["LAWFUL_GOOD", "LAWFUL_NEUTRAL", "NEUTRAL_GOOD"],
  caster: ["TRUE_NEUTRAL", "NEUTRAL_GOOD", "CHAOTIC_NEUTRAL"],
  support: ["NEUTRAL_GOOD", "LAWFUL_GOOD", "TRUE_NEUTRAL"],
  trickster: ["CHAOTIC_NEUTRAL", "CHAOTIC_GOOD", "TRUE_NEUTRAL"],
};

const NAME_PARTS: Record<string, { first: string[]; last: string[] }> = {
  human: {
    first: ["Arin", "Mira", "Darian", "Lysa", "Tomas", "Elena", "Rook", "Seren"],
    last: ["Ashford", "Rivers", "Stone", "Mercer", "Vale", "Hawke", "Rowan", "Briar"],
  },
  elf: {
    first: ["Aelar", "Lia", "Theren", "Sylra", "Faelar", "Nym", "Ilyana", "Vaelis"],
    last: ["Moonwhisper", "Duskryn", "Amakiir", "Siannodel", "Galanodel", "Ilphelkiir"],
  },
  dwarf: {
    first: ["Bruen", "Helja", "Dain", "Kara", "Torin", "Sannl", "Rurik", "Vistra"],
    last: ["Ironfist", "Stonehelm", "Bronzebeard", "Battlehammer", "Graniteborn"],
  },
  halfling: {
    first: ["Perrin", "Rosie", "Milo", "Esme", "Tob", "Lavinia", "Nedda", "Alton"],
    last: ["Underbough", "Greenbottle", "Tealeaf", "Brushgather", "Goodbarrel"],
  },
  gnome: {
    first: ["Boddynock", "Nissa", "Dimble", "Ellywick", "Fonkin", "Tana", "Zook", "Poppy"],
    last: ["Nackle", "Murnig", "Daergel", "Scheppen", "Timbers"],
  },
  "half-elf": {
    first: ["Kael", "Ari", "Lyra", "Ren", "Sorin", "Mirael", "Tavian", "Nyx"],
    last: ["Duskwalker", "Stormborn", "Vale", "Silverbranch", "Emberfall"],
  },
  "half-orc": {
    first: ["Grom", "Shura", "Karg", "Mogha", "Ront", "Thokk", "Hurka", "Vola"],
    last: ["Skullcleaver", "Ironjaw", "Bonecrusher", "Doomfang", "Bloodtusk"],
  },
  dragonborn: {
    first: ["Arjhan", "Balasar", "Farideh", "Nala", "Rhogar", "Sora", "Kriv", "Akra"],
    last: ["Clethtinthiallor", "Kepeshkmolik", "Turnuroth", "Norixius", "Verthisathurgiesh"],
  },
  tiefling: {
    first: ["Akmenos", "Bryseis", "Kairon", "Leucis", "Mordai", "Orianna", "Nemeia", "Skamos"],
    last: ["Nightbloom", "Ashen", "Vex", "Dusksong", "Hellrune"],
  },
  default: {
    first: ["Ash", "Rin", "Kestrel", "Vale", "Rowan", "Ember", "Nyra", "Orin"],
    last: ["Storm", "Dawn", "Vale", "Stone", "Bright", "Hollow", "Thorne", "Reed"],
  },
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function parsePrimaryAbilities(primary: string): AbilityName[] {
  const p = primary.toLowerCase();
  const out: AbilityName[] = [];
  for (const a of ABILITIES) {
    if (p.includes(a)) out.push(a);
  }
  return out;
}

function uniqueAbilityOrder(primary: AbilityName[], style: QuickPlaystyle): AbilityName[] {
  const order = [...primary, ...PLAYSTYLE_PRIORITIES[style], ...ABILITIES];
  return order.filter((a, i) => order.indexOf(a) === i);
}

function slugToLabel(slug: string): string {
  return slug
    .split("-")
    .map((s) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : s))
    .join(" ");
}

function buildScores(cls: DndClass, style: QuickPlaystyle): Record<AbilityName, number> {
  const ordered = uniqueAbilityOrder(parsePrimaryAbilities(cls.primaryAbility ?? ""), style);
  const out = {} as Record<AbilityName, number>;
  ordered.forEach((ability, i) => {
    out[ability] = STANDARD_ARRAY[i] ?? 8;
  });
  return out;
}

function chooseSkills(cls: DndClass, style: QuickPlaystyle): string[] {
  const hints: Record<QuickPlaystyle, string[]> = {
    balanced: ["perception", "insight", "athletics", "persuasion"],
    frontline: ["athletics", "intimidation", "survival", "perception"],
    striker: ["stealth", "acrobatics", "perception", "sleight-of-hand"],
    defender: ["athletics", "perception", "insight", "survival"],
    caster: ["arcana", "history", "investigation", "religion"],
    support: ["medicine", "insight", "persuasion", "religion"],
    trickster: ["stealth", "deception", "sleight-of-hand", "acrobatics"],
  };
  const want = hints[style];
  const pool = cls.skillChoices;
  const chosen: string[] = [];

  for (const s of want) {
    if (chosen.length >= cls.skillChoiceCount) break;
    if (pool.includes(s) && !chosen.includes(s)) chosen.push(s);
  }
  while (chosen.length < cls.skillChoiceCount && chosen.length < pool.length) {
    const left = pool.filter((s) => !chosen.includes(s));
    if (!left.length) break;
    chosen.push(pickRandom(left));
  }
  return chosen;
}

function generateName(raceSlug: string): string {
  const set = NAME_PARTS[raceSlug] ?? NAME_PARTS.default;
  return `${pickRandom(set.first)} ${pickRandom(set.last)}`;
}

function randomBackgroundTraits(draft: CharacterDraft, backgrounds: ReturnType<typeof useReferenceStore.getState>["backgrounds"]) {
  const bg = backgrounds.find((b) => b.slug === draft.backgroundSlug);
  if (!bg) return {};
  return {
    personalityTraits: bg.suggestedTraits.length ? pickRandom(bg.suggestedTraits) : "",
    ideals: bg.suggestedIdeals.length ? pickRandom(bg.suggestedIdeals) : "",
    bonds: bg.suggestedBonds.length ? pickRandom(bg.suggestedBonds) : "",
    flaws: bg.suggestedFlaws.length ? pickRandom(bg.suggestedFlaws) : "",
  };
}

export default function QuickCharacterCreation() {
  const navigate = useNavigate();
  const { races, classes, backgrounds, loadRaces, loadClasses, loadBackgrounds, loading } = useReferenceStore();
  const { draft, updateDraft, submitDraft } = useCharacterStore();

  const [raceSlug, setRaceSlug] = useState("");
  const [classSlug, setClassSlug] = useState("");
  /** Text field so mobile users can clear/backspace before typing (same pattern as Step1). */
  const [levelStr, setLevelStr] = useState("1");
  const [playstyle, setPlaystyle] = useState<QuickPlaystyle>("balanced");
  const [nameMode, setNameMode] = useState<NameMode>("auto");
  const [nameInput, setNameInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadRaces();
    void loadClasses();
    void loadBackgrounds();
  }, [loadRaces, loadClasses, loadBackgrounds]);

  const selectedRace = useMemo(() => races.find((r) => r.slug === raceSlug), [races, raceSlug]);
  const selectedClass = useMemo(() => classes.find((c) => c.slug === classSlug), [classes, classSlug]);

  const level = useMemo(() => {
    const n = parseInt(levelStr, 10);
    if (levelStr.trim() === "" || Number.isNaN(n)) return 1;
    return clampLevel(n);
  }, [levelStr]);

  const canSubmit = Boolean(selectedRace && selectedClass && (nameMode === "auto" || nameInput.trim().length > 0));

  if (loading.races || loading.classes || loading.backgrounds) return <LoadingSpinner />;

  const handleCreate = async () => {
    if (!selectedRace || !selectedClass) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const subclassLevel = SUBCLASS_CHOICE_LEVEL[selectedClass.slug] ?? 3;
      const subclassSlug =
        level >= subclassLevel && selectedClass.subclasses.length
          ? pickRandom(selectedClass.subclasses).slug
          : "";
      const subraceSlug =
        selectedRace.subraces.length > 0
          ? pickRandom(selectedRace.subraces).slug
          : "";
      const background = backgrounds.length ? pickRandom(backgrounds) : null;
      const autoName = generateName(selectedRace.slug);

      // Starting spells in this app are always recorded as the "level 1 segment"
      // (even if you create above 1st level). Higher levels are handled by the
      // guided level-up steps right after creation.
      const spellLevel = level > 1 ? 1 : level;
      const scores = buildScores(selectedClass, playstyle);
      const spellDraftForProfile: CharacterDraft = {
        ...draft,
        step: 1,
        useMulticlass: false,
        raceSlug: selectedRace.slug,
        subraceSlug,
        classSlug: selectedClass.slug,
        subclassSlug,
        level: spellLevel,
        scores,
      };

      let startingCantripSlugs: string[] = [];
      let startingLeveledSlugs: string[] = [];
      let startingWizardPreparedSlugs: string[] = [];

      const spellProfile = getCreationSpellProfile(spellDraftForProfile, selectedRace);
      if (spellProfile) {
        const allSpells = await referenceApi.spells({ class: spellProfile.spellListSlug });

        const cantripPool = allSpells
          .filter((s) => s.level === 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        startingCantripSlugs = cantripPool.slice(0, spellProfile.cantrips).map((s) => s.slug);

        const leveledPool = allSpells
          .filter((s) => s.level >= 1 && s.level <= spellProfile.maxLeveledSpellLevel)
          .sort((a, b) => (a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name)));
        startingLeveledSlugs = leveledPool.slice(0, spellProfile.leveledSpells).map((s) => s.slug);

        if (spellProfile.mode === "wizard") {
          startingWizardPreparedSlugs = leveledPool
            .slice(0, spellProfile.preparedFromLeveled)
            .map((s) => s.slug);
        }
      }

      const fetchItemBySlug = async (slug: string): Promise<{ slug: string; name: string } | null> => {
        try {
          const item = await referenceApi.item(slug);
          return item ? { slug: item.slug, name: item.name } : null;
        } catch {
          return null;
        }
      };

      const kitItemSearch: ItemSearch = async (query: string) => {
        const q = query.trim();
        if (q.length < 2) return [];
        const list = await referenceApi.items({ search: q, magical: false }).catch(() => [] as Item[]);
        return list.slice(0, 40).map((i) => ({ slug: i.slug, name: i.name }));
      };

      const classKits = getClassStartingKits(selectedClass.slug);
      const pickedKit = classKits.length ? pickRandom(classKits) : null;
      const fallbackLines = [gear("leather-armor", ["leather"]), gear("longsword")];
      const kitLines = pickedKit?.lines ?? fallbackLines;

      let startingInventoryDraft: StartingInventoryDraftRow[] = (await resolveKitToDraft(kitLines, fetchItemBySlug, kitItemSearch)).rows;

      if (background) {
        const bgKit = getBackgroundKitLines(background.slug);
        if (bgKit?.length) {
          const bgRes = await resolveKitToDraft(bgKit, fetchItemBySlug, kitItemSearch);
          startingInventoryDraft = [...startingInventoryDraft, ...bgRes.rows];
        }
      }

      startingInventoryDraft = await applyAutoEquipToStartingRows(startingInventoryDraft, async (slug) => {
        try {
          return await referenceApi.item(slug);
        } catch {
          return null;
        }
      });

      updateDraft({
        step: 1,
        name: nameMode === "custom" ? nameInput.trim() : autoName,
        raceSlug: selectedRace.slug,
        subraceSlug,
        classSlug: selectedClass.slug,
        subclassSlug,
        useMulticlass: false,
        classLevels: [],
        backgroundSlug: background?.slug ?? "",
        alignment: pickRandom(PLAYSTYLE_ALIGNMENT[playstyle]),
        level,
        abilityMethod: "standard_array",
        scores,
        chosenSkills: chooseSkills(selectedClass, playstyle),
        savingThrows: selectedClass.savingThrows,
        spellcastingAbility: selectedClass.spellcastingAbility ?? undefined,
        creationLevelUps: Array.from({ length: Math.max(0, level - 1) }, () => ({})),
        startingCantripSlugs,
        startingLeveledSlugs,
        startingWizardPreparedSlugs,
        multiclassSpellSegments: {},
        multiclassFirstClassSlug: "",
        multiclassLevelOrder: [],
        startingInventoryDraft,
        ...(background ? randomBackgroundTraits(draft, backgrounds) : {}),
      });

      const char = await submitDraft();
      navigate(`/characters/${char.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Pick race, class, playstyle, level, and name mode. The app auto-fills everything else using SRD defaults so you can start quickly.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="dnd-label block mb-1">Race</label>
          <select value={raceSlug} onChange={(e) => setRaceSlug(e.target.value)} className="input-field w-full">
            <option value="">Choose race...</option>
            {races.map((r: Race) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="dnd-label block mb-1">Class</label>
          <select value={classSlug} onChange={(e) => setClassSlug(e.target.value)} className="input-field w-full">
            <option value="">Choose class...</option>
            {classes.map((c: DndClass) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="dnd-label block mb-1">Playstyle</label>
          <select value={playstyle} onChange={(e) => setPlaystyle(e.target.value as QuickPlaystyle)} className="input-field w-full">
            {(Object.keys(PLAYSTYLE_LABELS) as QuickPlaystyle[]).map((key) => (
              <option key={key} value={key}>{PLAYSTYLE_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="dnd-label block mb-1">Starting level</label>
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
            onBlur={() => {
              const n = parseInt(levelStr, 10);
              const clamped = levelStr.trim() === "" || Number.isNaN(n) ? 1 : clampLevel(n);
              setLevelStr(String(clamped));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="input-field w-full"
            aria-label="Starting level"
          />
        </div>
      </div>

      <div className="dnd-card space-y-3">
        <p className="dnd-label">Name</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`btn-secondary ${nameMode === "auto" ? "ring-1 ring-dnd-gold" : ""}`} onClick={() => setNameMode("auto")}>
            Auto name
          </button>
          <button type="button" className={`btn-secondary ${nameMode === "custom" ? "ring-1 ring-dnd-gold" : ""}`} onClick={() => setNameMode("custom")}>
            Enter my own
          </button>
        </div>
        {nameMode === "custom" ? (
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="input-field w-full"
            placeholder="Character name"
            spellCheck
          />
        ) : (
          <p className="text-xs text-gray-500">
            Generated from race flavor at create time.
          </p>
        )}
      </div>

      <div className="text-xs text-gray-500">
        {selectedClass ? (
          <span>Auto build preview: {selectedClass.name}, {slugToLabel(playstyle)}, level {level}.</span>
        ) : (
          <span>Choose class to preview quick-build details.</span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <CharacterCreationStepNext
        label={isSubmitting ? "Creating…" : "Auto Generate Character"}
        onClick={() => void handleCreate()}
        disabled={!canSubmit || isSubmitting}
      />
    </div>
  );
}
