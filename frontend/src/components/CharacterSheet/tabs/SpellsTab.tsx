import { useState, useEffect, useMemo } from "react";
import type { Character, Spell, CharacterSpell } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { referenceApi } from "@/services/api";
import { SectionHeader, SpellLevelBadge, LoadingSpinner, Modal } from "@/components/common";
import { Plus, Zap, BookOpen } from "lucide-react";
import { clsx } from "clsx";
import { maxSpellSlotLevelFromSlots } from "@/lib/maxSpellSlotLevel";
import { canAddSpellPreview, explainSpellCapacity } from "@/lib/characterSpellCapacity";
import { mergeSpellListsPreferringRichestClasses } from "@/lib/spellDedupe";

interface Props {
  character: Character;
}

export default function SpellsTab({ character }: Props) {
  const { useSpellSlot, recoverSpellSlot, addSpell, removeSpell, updateSpell } = useCharacterStore();
  const [spellDetails, setSpellDetails] = useState<Record<string, Spell>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  // Load spell details for all known spells
  useEffect(() => {
    const slugs = character.spells.map((s) => s.spellSlug);
    const missing = slugs.filter((s) => !spellDetails[s]);
    if (missing.length === 0) return;

    Promise.all(missing.map((slug) => referenceApi.spell(slug)))
      .then((details) => {
        setSpellDetails((prev) => {
          const updated = { ...prev };
          details.forEach((d) => { if (d) updated[d.slug] = d; });
          return updated;
        });
      })
      .catch(console.error);
  }, [character.spells, spellDetails]);

  // Group spells by level
  const spellsByLevel: Record<number, CharacterSpell[]> = {};
  for (const cs of character.spells) {
    const detail = spellDetails[cs.spellSlug];
    const level  = detail?.level ?? 0;
    if (!spellsByLevel[level]) spellsByLevel[level] = [];
    spellsByLevel[level].push(cs);
  }

  const hasSpellcasting = character.spellcastingAbility !== null;

  const capacityLine = useMemo(
    () => explainSpellCapacity(character, spellDetails),
    [character, spellDetails],
  );

  if (!hasSpellcasting) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <BookOpen size={48} className="text-gray-700" />
        <h2 className="font-display font-bold text-gray-400">No Spellcasting</h2>
        <p className="text-gray-600 text-sm max-w-xs">
          This character's class doesn't have a spellcasting ability. If you've multiclassed or
          gained spellcasting through a feat, update the character.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Spell Slots */}
      {character.spellSlots.length > 0 && (
        <div className="dnd-card">
          <SectionHeader title="Spell Slots" />
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {character.spellSlots
              .sort((a, b) => a.level - b.level)
              .map((slot) => (
                <SpellSlotWidget
                  key={slot.level}
                  level={slot.level}
                  total={slot.total}
                  used={slot.used}
                  onUse={() => useSpellSlot(slot.level)}
                  onRecover={() => recoverSpellSlot(slot.level)}
                />
              ))}
          </div>
        </div>
      )}

      {/* Spells header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display font-bold text-dnd-gold text-lg">
            Spells Known ({character.spells.length})
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={15} />
            Add Spell
          </button>
        </div>
        {capacityLine && (
          <p className="text-xs text-gray-500 font-display border border-gray-800 rounded-lg px-3 py-2 bg-gray-900/50">
            {capacityLine}
          </p>
        )}
      </div>

      {/* Spells grouped by level */}
      {Object.keys(spellsByLevel)
        .map(Number)
        .sort((a, b) => a - b)
        .map((level) => (
          <div key={level} className="dnd-card space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <SpellLevelBadge level={level} />
              <span className="font-display font-bold text-sm text-gray-300">
                {level === 0 ? "Cantrips" : `Level ${level} Spells`}
              </span>
            </div>

            {spellsByLevel[level].map((cs) => {
              const detail = spellDetails[cs.spellSlug];
              return (
                <SpellRow
                  key={cs.id}
                  charSpell={cs}
                  detail={detail}
                  onTogglePrepared={() => updateSpell(cs.id, { prepared: !cs.prepared })}
                  onRemove={() => removeSpell(cs.id)}
                />
              );
            })}
          </div>
        ))}

      {character.spells.length === 0 && (
        <div className="dnd-card text-center py-8">
          <Zap size={32} className="text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500 font-display">No spells added yet</p>
          <p className="text-gray-600 text-xs mt-1">
            Click &quot;Add Spell&quot; to browse cantrips and spells for your class (or search by name).
          </p>
        </div>
      )}

      {showAddModal && (
        <AddSpellModal
          character={character}
          spellDetails={spellDetails}
          onClose={() => setShowAddModal(false)}
          onAdd={(slug) => {
            addSpell(slug, false);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── Spell Slot Widget ─────────────────────────────────────────────
function SpellSlotWidget({
  level, total, used, onUse, onRecover,
}: {
  level: number; total: number; used: number;
  onUse: () => void; onRecover: () => void;
}) {
  const remaining = total - used;
  return (
    <div className="flex flex-col items-center gap-1">
      <SpellLevelBadge level={level} />
      <div className="flex flex-wrap gap-0.5 justify-center">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={i < remaining ? onUse : onRecover}
            title={i < remaining ? "Click to use slot" : "Click to recover slot"}
            className={clsx(
              "w-4 h-4 rounded-full border transition-all",
              i < remaining
                ? "bg-dnd-gold border-yellow-500 hover:bg-yellow-600"
                : "bg-gray-800 border-gray-600 hover:border-gray-400"
            )}
          />
        ))}
      </div>
      <span className="text-xs font-mono text-gray-500">{remaining}/{total}</span>
    </div>
  );
}

// ── Spell Row ─────────────────────────────────────────────────────
function SpellRow({
  charSpell, detail, onTogglePrepared, onRemove,
}: {
  charSpell: CharacterSpell; detail?: Spell;
  onTogglePrepared: () => void; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Prepared dot */}
        {detail?.level !== 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePrepared(); }}
            className={clsx(
              "w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all",
              charSpell.prepared || charSpell.alwaysPrepared
                ? "bg-dnd-gold border-yellow-500"
                : "border-gray-600 hover:border-gray-400"
            )}
            title={charSpell.prepared ? "Unprepare" : "Prepare spell"}
          />
        )}

        <span className="font-display font-semibold text-white flex-1">
          {detail?.name ?? charSpell.spellSlug}
        </span>

        {detail && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {detail.concentration && (
              <span className="text-yellow-600 font-display" title="Concentration">C</span>
            )}
            {detail.ritual && (
              <span className="text-blue-600 font-display" title="Ritual">R</span>
            )}
            <span>{detail.castingTime}</span>
            <span>{detail.range}</span>
            <span>{detail.school}</span>
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none ml-2"
          title="Remove spell"
        >
          ×
        </button>
      </div>

      {expanded && detail && (
        <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><span className="dnd-label">Casting Time</span><p className="text-gray-300">{detail.castingTime}</p></div>
            <div><span className="dnd-label">Range</span><p className="text-gray-300">{detail.range}</p></div>
            <div>
              <span className="dnd-label">Components</span>
              <p className="text-gray-300">
                {[
                  detail.components.verbal   && "V",
                  detail.components.somatic  && "S",
                  detail.components.material && "M",
                ].filter(Boolean).join(", ")}
                {detail.components.material && detail.components.materials && (
                  <span className="text-gray-500"> ({detail.components.materials})</span>
                )}
              </p>
            </div>
            <div><span className="dnd-label">Duration</span><p className="text-gray-300">{detail.duration}</p></div>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{detail.description}</p>
          {detail.higherLevels && (
            <p className="text-xs text-gray-400">
              <span className="font-semibold text-dnd-gold">At Higher Levels:</span> {detail.higherLevels}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Spell Modal ───────────────────────────────────────────────
function AddSpellModal({
  character,
  spellDetails,
  onClose,
  onAdd,
}: {
  character: Character;
  spellDetails: Record<string, Spell>;
  onClose: () => void;
  onAdd: (slug: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [classSpells, setClassSpells] = useState<Spell[]>([]);
  const [levelTab, setLevelTab] = useState<number | "all">("all");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchHits, setSearchHits] = useState<Spell[] | null>(null);

  const maxSlot = maxSpellSlotLevelFromSlots(character.spellSlots);

  const classSlugs = useMemo(() => {
    if (character.computed.isMulticlass && character.classLevels?.length) {
      return [...new Set(character.classLevels.map((r) => r.classSlug))];
    }
    return [character.classSlug];
  }, [character]);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    Promise.all(classSlugs.map((slug) => referenceApi.spells({ class: slug })))
      .then((spellArrays) => {
        if (cancelled) return;
        setClassSpells(mergeSpellListsPreferringRichestClasses(spellArrays));
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classSlugs]);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) {
      setSearchHits(null);
      return;
    }
    setLoadingSearch(true);
    try {
      const spells =
        classSlugs.length > 1
          ? await referenceApi.spells({ search: q })
          : await referenceApi.spells({
              class: character.classSlug,
              search: q,
            });
      setSearchHits(spells);
    } catch (e) {
      console.error(e);
      setSearchHits([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const alreadyAdded = new Set(character.spells.map((s) => s.spellSlug));

  const detailsLevelMap = useMemo(() => {
    const m: Record<string, { level: number }> = {};
    for (const [slug, d] of Object.entries(spellDetails)) {
      if (d) m[slug] = { level: d.level };
    }
    return m;
  }, [spellDetails]);

  const filtered =
    searchHits !== null
      ? searchHits
      : classSpells.filter((s) => levelTab === "all" || s.level === levelTab);

  const levelsPresent = Array.from(new Set(classSpells.map((s) => s.level))).sort((a, b) => a - b);

  return (
    <Modal
      title="Add Spell"
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className="btn-secondary">Close</button>}
    >
      <div className="space-y-3">
        <p className="text-xs text-amber-200/90 bg-amber-950/30 border border-amber-900/50 rounded px-2 py-1.5">
          The app enforces PHB-style cantrip and spells-known (or spellbook) limits for a single-class character. If you
          are over the limit, remove a spell first or ask your DM to house-rule extra spells.
        </p>
        <p className="text-xs text-gray-500">
          Spells listed here are on the SRD list for{" "}
          <span className="text-gray-300 capitalize">
            {classSlugs.length > 1
              ? classSlugs.map((s) => s.replace(/-/g, " ")).join(" · ")
              : character.classSlug.replace(/-/g, " ")}
          </span>
          . At level {character.level}, you typically cast up to{" "}
          <span className="text-dnd-gold font-semibold">
            {maxSlot === 0 ? "cantrips only" : `level ${maxSlot}`}
          </span>{" "}
          (your DM has the final say). Gray rows are higher-level spells you can peek at for later levels.
        </p>

        <div className="flex gap-2 flex-wrap">
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value.trim()) setSearchHits(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="input-field flex-1 min-w-[8rem]"
            spellCheck={false}
            autoFocus
          />
          <button type="button" onClick={handleSearch} className="btn-primary">
            Search
          </button>
          {searchHits !== null && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSearchHits(null);
              }}
              className="btn-secondary text-sm"
            >
              Show browse list
            </button>
          )}
        </div>

        {searchHits === null && !loadingList && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setLevelTab("all")}
              className={clsx(
                "px-2 py-1 rounded text-xs font-display font-semibold",
                levelTab === "all" ? "bg-dnd-red text-white" : "bg-gray-800 text-gray-400 hover:text-white",
              )}
            >
              All
            </button>
            {levelsPresent.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevelTab(lv)}
                className={clsx(
                  "px-2 py-1 rounded text-xs font-display font-semibold",
                  levelTab === lv ? "bg-dnd-red text-white" : "bg-gray-800 text-gray-400 hover:text-white",
                )}
              >
                {lv === 0 ? "Cantrips" : `Level ${lv}`}
              </button>
            ))}
          </div>
        )}

        {(loadingList || loadingSearch) && <LoadingSpinner />}

        <div className="max-h-80 overflow-auto space-y-1 border border-gray-800 rounded-lg">
          {!loadingList && classSpells.length === 0 && searchHits === null && (
            <p className="text-sm text-amber-200/90 p-4 text-center">
              No spells are linked to this class in the database (check seed / Open5e class lists). You can still use
              Search if spells exist under another tag, or ask your DM to add custom spells later.
            </p>
          )}
          {!loadingList && !(classSpells.length === 0 && searchHits === null) && filtered.length === 0 && (
            <p className="text-sm text-gray-500 p-4 text-center">No spells match this filter.</p>
          )}
          {filtered.map((spell) => {
            const overLeveled = spell.level > maxSlot && spell.level > 0;
            const capBlock = canAddSpellPreview(character, detailsLevelMap, spell);
            const disabledAdd = alreadyAdded.has(spell.slug) || !!capBlock;
            return (
              <div
                key={spell.slug}
                className={clsx(
                  "flex items-center justify-between px-3 py-2 border-b border-gray-800/80 last:border-0",
                  overLeveled ? "opacity-55" : "hover:bg-gray-800/60",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <SpellLevelBadge level={spell.level} />
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-sm text-white truncate">{spell.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {spell.school} · {spell.castingTime}
                      {overLeveled ? " · higher level" : ""}
                      {capBlock ? ` · ${capBlock}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(spell.slug)}
                  disabled={disabledAdd}
                  title={capBlock ?? undefined}
                  className={clsx(
                    "text-sm px-3 py-1 rounded font-display font-semibold transition-colors shrink-0",
                    disabledAdd ? "text-gray-600 cursor-not-allowed" : "btn-primary",
                  )}
                >
                  {alreadyAdded.has(spell.slug) ? "Added" : capBlock ? "Limit" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
