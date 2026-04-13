import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import type { Spell, Item, Condition, Feat } from "@/types/dnd";
import { referenceApi } from "@/services/api";
import { SpellLevelBadge, LoadingSpinner } from "@/components/common";
import { clsx } from "clsx";

type Section = "spells" | "items" | "conditions" | "feats";

export default function ReferencePage() {
  const { section } = useParams<{ section?: Section }>();
  const navigate    = useNavigate();
  const location    = useLocation();
  const activeSection: Section = (section as Section) ?? "spells";

  const itemHighlightSlug =
    activeSection === "items"
      ? (location.state as { highlightItemSlug?: string } | null)?.highlightItemSlug?.trim() || undefined
      : undefined;

  const clearItemHighlight = useCallback(() => {
    navigate(".", { replace: true, state: {} });
  }, [navigate]);

  const SECTIONS: { key: Section; label: string }[] = [
    { key: "spells",     label: "Spells" },
    { key: "items",      label: "Items" },
    { key: "conditions", label: "Conditions" },
    { key: "feats",      label: "Feats" },
  ];

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="font-display font-bold text-3xl text-dnd-gold mb-4">SRD Reference</h1>

      {/* Section tabs */}
      <div className="flex gap-1 p-1 bg-gray-900 rounded-lg w-fit mb-6">
        {SECTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => navigate(`/reference/${key}`)}
            className={clsx(
              "px-4 py-2 rounded font-display font-semibold text-sm transition-colors",
              activeSection === key ? "bg-dnd-red text-white" : "text-gray-400 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSection === "spells"     && <SpellsReference />}
      {activeSection === "items"      && (
        <ItemsReference highlightItemSlug={itemHighlightSlug} onHighlightConsumed={clearItemHighlight} />
      )}
      {activeSection === "conditions" && <ConditionsReference />}
      {activeSection === "feats"      && <FeatsReference />}
    </div>
  );
}

// ── Spells Reference ──────────────────────────────────────────────
function SpellsReference() {
  const [spells, setSpells]    = useState<Spell[]>([]);
  const [loading, setLoading]  = useState(false);
  const [search, setSearch]    = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const doSearch = async () => {
    setLoading(true);
    try {
      const results = await referenceApi.spells({
        search:  search || undefined,
        class:   filterClass || undefined,
        level:   filterLevel ? parseInt(filterLevel) : undefined,
        school:  filterSchool || undefined,
      });
      setSpells(results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { doSearch(); }, []);

  const SCHOOLS = ["Abjuration","Conjuration","Divination","Enchantment","Evocation","Illusion","Necromancy","Transmutation"];
  const CLASSES = ["bard","cleric","druid","paladin","ranger","sorcerer","warlock","wizard"];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input
          type="text"
          placeholder="Search spells..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          className="input-field col-span-2 sm:col-span-1"
          spellCheck={false}
        />
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className="input-field capitalize">
          <option value="">All Classes</option>
          {CLASSES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
        </select>
        <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="input-field">
          <option value="">All Levels</option>
          <option value="0">Cantrips</option>
          {[1,2,3,4,5,6,7,8,9].map((l) => <option key={l} value={l}>Level {l}</option>)}
        </select>
        <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)} className="input-field">
          <option value="">All Schools</option>
          {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button onClick={doSearch} className="btn-primary">Search</button>

      {loading && <LoadingSpinner />}

      <p className="text-sm text-gray-500">{spells.length} spells</p>

      <div className="space-y-1">
        {spells.map((spell) => (
          <div key={spell.slug} className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === spell.slug ? null : spell.slug)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
            >
              <SpellLevelBadge level={spell.level} />
              <span className="font-display font-semibold text-white flex-1">{spell.name}</span>
              <span className="text-xs text-gray-500 hidden sm:block">{spell.school}</span>
              {spell.concentration && <span className="text-xs text-yellow-600 font-display">C</span>}
              {spell.ritual        && <span className="text-xs text-blue-500 font-display">R</span>}
              <span className="text-xs text-gray-500 hidden sm:block">{spell.castingTime}</span>
              <span className="text-xs text-gray-500 hidden sm:block">{spell.range}</span>
            </button>
            {expanded === spell.slug && (
              <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="dnd-label">Casting Time</span><p className="text-gray-300">{spell.castingTime}</p></div>
                  <div><span className="dnd-label">Range</span><p className="text-gray-300">{spell.range}</p></div>
                  <div>
                    <span className="dnd-label">Components</span>
                    <p className="text-gray-300">
                      {[spell.components.verbal && "V", spell.components.somatic && "S", spell.components.material && "M"].filter(Boolean).join(", ")}
                      {spell.components.material && spell.components.materials && ` (${spell.components.materials})`}
                    </p>
                  </div>
                  <div><span className="dnd-label">Duration</span><p className="text-gray-300">{spell.duration}</p></div>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{spell.description}</p>
                {spell.higherLevels && (
                  <p className="text-xs text-gray-400">
                    <span className="font-semibold text-dnd-gold">At Higher Levels:</span> {spell.higherLevels}
                  </p>
                )}
                <p className="text-xs text-gray-600">
                  Classes: {spell.classes.join(", ")}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Items Reference ───────────────────────────────────────────────
function ItemsReference({
  highlightItemSlug,
  onHighlightConsumed,
}: {
  highlightItemSlug?: string;
  onHighlightConsumed?: () => void;
}) {
  const [items, setItems]       = useState<Item[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightItemSlug || !onHighlightConsumed) return;
    let cancelled = false;
    void (async () => {
      try {
        const one = await referenceApi.item(highlightItemSlug);
        if (cancelled || !one) return;
        setItems((prev) => (prev.some((x) => x.slug === one.slug) ? prev : [one, ...prev]));
        setExpanded(one.slug);
      } catch {
        /* item missing from SRD */
      } finally {
        if (!cancelled) onHighlightConsumed();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [highlightItemSlug, onHighlightConsumed]);

  const doSearch = async () => {
    setLoading(true);
    try {
      const results = await referenceApi.items({ search: search || undefined, category: category || undefined });
      setItems(results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { doSearch(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input type="text" placeholder="Search items..." value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()}
          className="input-field flex-1" spellCheck={false} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
          <option value="">All Categories</option>
          <option value="weapon">Weapons</option>
          <option value="armor">Armor</option>
          <option value="gear">Gear</option>
          <option value="magic">Magic Items</option>
        </select>
        <button onClick={doSearch} className="btn-primary">Search</button>
      </div>

      {loading && <LoadingSpinner />}
      <p className="text-sm text-gray-500">{items.length} items</p>

      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.slug} className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === item.slug ? null : item.slug)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="font-display font-semibold text-white flex-1">{item.name}</span>
              <span className="text-xs text-gray-500 capitalize">{item.category}</span>
              {item.damageDice && <span className="text-xs font-mono text-dnd-gold">{item.damageDice}</span>}
              {item.armorClass && <span className="text-xs text-blue-400">AC {item.armorClass}</span>}
              {item.magical    && <span className="text-xs text-purple-400">✦</span>}
              {item.cost       && <span className="text-xs text-gray-500">{item.cost.quantity}{item.cost.unit}</span>}
            </button>
            {expanded === item.slug && (
              <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700 space-y-2">
                {item.description && <p className="text-sm text-gray-300">{item.description}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {item.damageDice  && <div><span className="dnd-label">Damage</span><p className="text-gray-300">{item.damageDice} {item.damageType}</p></div>}
                  {item.armorClass  && <div><span className="dnd-label">AC</span><p className="text-gray-300">{item.armorClass}</p></div>}
                  {item.weight      && <div><span className="dnd-label">Weight</span><p className="text-gray-300">{item.weight} lb</p></div>}
                  {item.properties?.length > 0 && <div><span className="dnd-label">Properties</span><p className="text-gray-300 capitalize">{item.properties.join(", ")}</p></div>}
                  {item.requiresAttunement && <div><span className="dnd-label">Attunement</span><p className="text-purple-400">{item.attunementRequirement ?? "Required"}</p></div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Conditions Reference ──────────────────────────────────────────
function ConditionsReference() {
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<string | null>(null);

  useEffect(() => {
    referenceApi.conditions().then(setConditions).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-2 max-w-2xl">
      {conditions.map((c) => (
        <div key={c.slug} className="border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === c.slug ? null : c.slug)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 text-left"
          >
            <span className="font-display font-bold text-white flex-1">{c.name}</span>
          </button>
          {expanded === c.slug && (
            <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700">
              <p className="text-sm text-gray-300 leading-relaxed">{c.description}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Feats Reference ───────────────────────────────────────────────
function FeatsReference() {
  const [feats, setFeats]       = useState<Feat[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    referenceApi.feats().then(setFeats).finally(() => setLoading(false));
  }, []);

  const filtered = feats.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Filter feats..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-field w-full max-w-sm"
        spellCheck={false}
      />
      <p className="text-sm text-gray-500">{filtered.length} feats</p>
      <div className="space-y-1 max-w-2xl">
        {filtered.map((feat) => (
          <div key={feat.slug} className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === feat.slug ? null : feat.slug)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 text-left"
            >
              <span className="font-display font-bold text-white flex-1">{feat.name}</span>
              {feat.prerequisite && (
                <span className="text-xs text-gray-500">Req: {feat.prerequisite}</span>
              )}
            </button>
            {expanded === feat.slug && (
              <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700">
                <p className="text-sm text-gray-300 leading-relaxed">{feat.description}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
