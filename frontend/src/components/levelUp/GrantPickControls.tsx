import type { MonsterSummary, Spell } from "@/types/dnd";
import type { GrantPickSpec } from "@/lib/levelUpGrantPickTypes";
import {
  HUMANOID_FAVORED_ENEMY_OPTION_KEY,
  isBeastCompanionSpec,
  isOptionsLikeSpec,
  isSpellGrantSpec,
} from "@/lib/levelUpGrantPickTypes";
import { filterSpellsForGrantSpec } from "@/lib/levelUpFeatureChoiceCatalog";
import { clsx } from "clsx";

export type GrantPickControlsProps = {
  grantKey: string;
  spec: GrantPickSpec;
  pickedOptions: string[];
  onPickOptionsChange: (keys: string[]) => void;
  pickedSpells: string[];
  onPickSpellsChange: (slugs: string[]) => void;
  humanoidRaces: { raceA: string; raceB: string };
  onHumanoidRacesChange: (v: { raceA: string; raceB: string }) => void;
  allSpells: Spell[];
  wizardSpellSlugs: Set<string>;
  knownSpellSlugs: Set<string>;
  beasts: MonsterSummary[];
  beastSearch: string;
  onBeastSearchChange: (s: string) => void;
  variant: "creation" | "sheet";
};

function parseMonsterCr(cr: unknown): number {
  if (typeof cr === "number" && Number.isFinite(cr)) return cr;
  const s = String(cr ?? "");
  if (s === "1/8") return 0.125;
  if (s === "1/4") return 0.25;
  if (s === "1/2") return 0.5;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatCr(cr: unknown): string {
  const n = parseMonsterCr(cr);
  if (n === 0.125) return "1/8";
  if (n === 0.25) return "1/4";
  if (n === 0.5) return "1/2";
  if (Number.isInteger(n)) return String(n);
  return String(cr ?? n);
}

function selectSingle(_keys: string[], key: string): string[] {
  return [key];
}

function toggleMulti(keys: string[], key: string, max: number): string[] {
  if (keys.includes(key)) return keys.filter((k) => k !== key);
  if (keys.length >= max) return keys;
  return [...keys, key];
}

export function GrantPickControls({
  grantKey,
  spec,
  pickedOptions,
  onPickOptionsChange,
  pickedSpells,
  onPickSpellsChange,
  humanoidRaces,
  onHumanoidRacesChange,
  allSpells,
  wizardSpellSlugs,
  knownSpellSlugs,
  beasts,
  beastSearch,
  onBeastSearchChange,
  variant,
}: GrantPickControlsProps) {
  const b = variant === "creation" ? "border-dnd-border" : "border-gray-700";
  const tMuted = variant === "creation" ? "text-stone-300" : "text-gray-300";
  const tStrong = variant === "creation" ? "text-stone-200" : "text-gray-200";
  const gold = "text-dnd-gold/90";

  if (isSpellGrantSpec(spec)) {
    const pool = filterSpellsForGrantSpec(spec, allSpells, wizardSpellSlugs, knownSpellSlugs).sort(
      (a, b) => (a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name)),
    );
    const heading =
      spec.addToSpellbook && spec.spellList === "any"
        ? "Magical Secrets — add these spells to your known list"
        : spec.alwaysPrepared
          ? "Signature Spells — always prepared (record choices)"
          : "Spell Mastery — 3rd-level wizard spells you can cast at will";

    return (
      <div className={clsx("mt-2 space-y-2 rounded border bg-black/20 p-2", b)}>
        <p className={clsx("text-[11px] uppercase tracking-wide", gold)}>
          {heading} ({pickedSpells.length}/{spec.pickCount})
        </p>
        <p className={clsx("text-[10px] opacity-80", tMuted)}>
          {spec.fromKnownSpellbookOnly
            ? "Only spells already in your spellbook / known list qualify."
            : "Any SRD spell up to the max level shown."}
        </p>
        <ul className="max-h-48 overflow-y-auto space-y-1 rounded border border-black/30 p-2">
          {pool.map((s) => (
            <li key={s.slug}>
              <label className={clsx("flex gap-2 text-xs cursor-pointer", tMuted)}>
                <input
                  type="checkbox"
                  checked={pickedSpells.includes(s.slug)}
                  onChange={() =>
                    onPickSpellsChange(toggleMulti(pickedSpells, s.slug, spec.pickCount))
                  }
                />
                <span>
                  {s.name}{" "}
                  <span className="opacity-70">
                    ({s.level === 0 ? "cantrip" : `lvl ${s.level}`} {s.school})
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {pool.length === 0 ? (
          <p className="text-[11px] text-amber-300/90">No spells match filters — check known spells or data.</p>
        ) : null}
      </div>
    );
  }

  if (isBeastCompanionSpec(spec)) {
    const rows = beasts.filter((m) => {
      const cr = parseMonsterCr(m.challengeRating);
      const isBeast = (m.type ?? "").toLowerCase().includes("beast");
      if (!isBeast || cr > 0.25) return false;
      if (!beastSearch.trim()) return true;
      return m.name.toLowerCase().includes(beastSearch.trim().toLowerCase());
    });

    return (
      <div className={clsx("mt-2 space-y-2 rounded border bg-black/20 p-2", b)}>
        <p className={clsx("text-[11px] uppercase tracking-wide", gold)}>
          Beast Companion — CR ¼ or lower, beast type (PHB)
        </p>
        <input
          type="search"
          placeholder="Search beasts…"
          value={beastSearch}
          onChange={(e) => onBeastSearchChange(e.target.value)}
          className={clsx(
            "w-full max-w-xs rounded border px-2 py-1 text-xs",
            variant === "creation" ? "border-dnd-border bg-dnd-dark" : "border-gray-600 bg-gray-900",
          )}
        />
        <ul className="max-h-48 overflow-y-auto space-y-1 rounded border border-black/30 p-2">
          {rows.map((m) => (
            <li key={m.slug}>
              <label className={clsx("flex gap-2 text-xs cursor-pointer", tMuted)}>
                <input
                  type="radio"
                  name={`beast-companion-${grantKey}`}
                  checked={pickedOptions[0] === m.slug}
                  onChange={() => onPickOptionsChange(selectSingle(pickedOptions, m.slug))}
                />
                <span>
                  <span className={clsx("font-medium", tStrong)}>{m.name}</span>{" "}
                  <span className="opacity-70">
                    CR {formatCr(m.challengeRating)} · {m.type}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {rows.length === 0 ? (
          <p className="text-[11px] text-amber-300/90">No matching beasts in reference data.</p>
        ) : null}
      </div>
    );
  }

  if (spec.kind === "channel-divinity") {
    return (
      <div className={clsx("mt-2 space-y-2 rounded border bg-black/20 p-2", b)}>
        <p className={clsx("text-[11px] uppercase tracking-wide", gold)}>Channel Divinity options</p>
        <p className={clsx("text-[10px] opacity-80", tMuted)}>
          Your cleric level grants these uses (core + domain). They are recorded on your sheet with this feature.
        </p>
        <ul className={clsx("list-disc list-inside space-y-1 text-xs", tMuted)}>
          {spec.options.map((o) => (
            <li key={o.key}>
              <span className={clsx("font-semibold", tStrong)}>{o.title}.</span> {o.detail}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (isOptionsLikeSpec(spec)) {
    const showHumanoid =
      spec.kind === "options" &&
      spec.humanoidRaceFollowUpKey &&
      pickedOptions[0] === HUMANOID_FAVORED_ENEMY_OPTION_KEY;

    return (
      <div className="mt-2 space-y-2">
        <div className={clsx("space-y-1.5 rounded border bg-black/20 p-2", b)}>
          <p className={clsx("text-[11px] uppercase tracking-wide", gold)}>
            {spec.pickCount === 1
              ? "Choose one option"
              : `Choose ${spec.pickCount} options (${pickedOptions.length}/${spec.pickCount})`}
          </p>
          {spec.pickCount === 1
            ? spec.options.map((opt) => (
                <label
                  key={opt.key}
                  className={clsx("flex gap-2 cursor-pointer rounded border p-1.5", b, "hover:opacity-90")}
                >
                  <input
                    type="radio"
                    name={`grant-opt-${grantKey}`}
                    checked={pickedOptions[0] === opt.key}
                    onChange={() => onPickOptionsChange(selectSingle(pickedOptions, opt.key))}
                    className="mt-0.5"
                  />
                  <span className={clsx("text-xs leading-relaxed", tMuted)}>
                    <span className={clsx("font-semibold", tStrong)}>{opt.title}.</span> {opt.detail}
                  </span>
                </label>
              ))
            : spec.options.map((opt) => (
                <label
                  key={opt.key}
                  className={clsx("flex gap-2 cursor-pointer rounded border p-1.5", b, "hover:opacity-90")}
                >
                  <input
                    type="checkbox"
                    checked={pickedOptions.includes(opt.key)}
                    onChange={() =>
                      onPickOptionsChange(toggleMulti(pickedOptions, opt.key, spec.pickCount))
                    }
                    className="mt-0.5 rounded border-stone-600"
                  />
                  <span className={clsx("text-xs leading-relaxed", tMuted)}>
                    <span className={clsx("font-semibold", tStrong)}>{opt.title}.</span> {opt.detail}
                  </span>
                </label>
              ))}
        </div>
        {showHumanoid ? (
          <div className={clsx("grid gap-2 sm:grid-cols-2 rounded border p-2", b)}>
            <p className={clsx("sm:col-span-2 text-[11px]", gold)}>Humanoid favored enemy — two races (PHB)</p>
            <input
              placeholder="e.g. Elf"
              value={humanoidRaces.raceA}
              onChange={(e) => onHumanoidRacesChange({ ...humanoidRaces, raceA: e.target.value })}
              className={clsx(
                "rounded border px-2 py-1 text-xs",
                variant === "creation" ? "border-dnd-border bg-dnd-dark" : "border-gray-600 bg-gray-900",
              )}
            />
            <input
              placeholder="e.g. Orc"
              value={humanoidRaces.raceB}
              onChange={(e) => onHumanoidRacesChange({ ...humanoidRaces, raceB: e.target.value })}
              className={clsx(
                "rounded border px-2 py-1 text-xs",
                variant === "creation" ? "border-dnd-border bg-dnd-dark" : "border-gray-600 bg-gray-900",
              )}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
