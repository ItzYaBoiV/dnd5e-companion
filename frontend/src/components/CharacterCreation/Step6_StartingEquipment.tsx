import { useCallback, useEffect, useMemo, useState } from "react";
import type { CharacterDraft, StartingInventoryDraftRow, Item } from "@/types/dnd";
import { useReferenceStore } from "@/store/referenceStore";
import { referenceApi } from "@/services/api";
import { formatStartingEquipmentText } from "@/lib/formatStartingEquipment";
import {
  getClassStartingKits,
  getBackgroundKitLines,
  resolveKitToDraft,
  startingInventoryRowLabel,
  type ItemSearch,
} from "@/lib/startingEquipmentKits";
import { Plus, Trash2, Search, Package, Sparkles } from "lucide-react";
import { CharacterCreationStepNext } from "./CharacterCreationStepNext";

interface Props {
  draft: CharacterDraft;
  updateDraft: (p: Partial<CharacterDraft>) => void;
  onNext: () => void;
}

const ITEM_CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: "weapon", label: "Weapons", hint: "Swords, bows, etc." },
  { key: "armor", label: "Armor", hint: "Light, medium, heavy, shields" },
  { key: "gear", label: "Adventuring gear", hint: "Packs, kits, rope…" },
  { key: "tool", label: "Tools", hint: "Thieves' tools, instruments…" },
];

function formatCost(cost: Item["cost"]): string {
  if (!cost || typeof cost !== "object") return "";
  const q = (cost as { quantity?: number; unit?: string }).quantity;
  const u = (cost as { quantity?: number; unit?: string }).unit;
  if (q == null || !u) return "";
  return `${q} ${u}`;
}

export default function Step6_StartingEquipment({ draft, updateDraft, onNext }: Props) {
  const { classes, backgrounds, loadClasses, loadBackgrounds } = useReferenceStore();
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [browseCategory, setBrowseCategory] = useState<string | null>("weapon");
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedClassKitId, setSelectedClassKitId] = useState("");
  const [kitBusy, setKitBusy] = useState(false);
  const [kitNotice, setKitNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadClasses();
    void loadBackgrounds();
  }, [loadClasses, loadBackgrounds]);

  const cls = classes.find((c) => c.slug === draft.classSlug);
  const bg = backgrounds.find((b) => b.slug === draft.backgroundSlug);

  const classKits = useMemo(() => getClassStartingKits(draft.classSlug), [draft.classSlug]);
  const backgroundKitLines = useMemo(
    () => (draft.backgroundSlug ? getBackgroundKitLines(draft.backgroundSlug) : null),
    [draft.backgroundSlug],
  );

  useEffect(() => {
    setSelectedClassKitId("");
    setKitNotice(null);
  }, [draft.classSlug]);

  const rows = draft.startingInventoryDraft ?? [];

  const setRows = (next: StartingInventoryDraftRow[]) => {
    updateDraft({ startingInventoryDraft: next });
  };

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      referenceApi
        .items({ search: q, magical: false })
        .then((list) => setHits(list.slice(0, 20)))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 320);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!browseCategory) {
      setCatalogItems([]);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    referenceApi
      .items({ category: browseCategory, magical: false })
      .then((list) => {
        if (!cancelled) setCatalogItems(list);
      })
      .catch(() => {
        if (!cancelled) setCatalogItems([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [browseCategory]);

  const loadDetail = (slug: string) => {
    setDetailLoading(true);
    referenceApi
      .item(slug)
      .then((item) => setDetailItem(item))
      .catch(() => setDetailItem(null))
      .finally(() => setDetailLoading(false));
  };

  const addFromItem = (item: Item) => {
    setRows([
      ...rows,
      { itemSlug: item.slug, displayName: item.name, customName: undefined, quantity: 1 },
    ]);
    setSearch("");
    setHits([]);
  };

  const addCustomRow = () => {
    setRows([...rows, { customName: "", quantity: 1 }]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<StartingInventoryDraftRow>) => {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const fetchItemBySlug = async (slug: string): Promise<{ slug: string; name: string } | null> => {
    try {
      const item = await referenceApi.item(slug);
      return item ? { slug: item.slug, name: item.name } : null;
    } catch {
      return null;
    }
  };

  /** Same search as manual browse — matches kits to DB when slugs differ (e.g. Rapier vs rapier). */
  const kitItemSearch: ItemSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) return [];
    const list = await referenceApi.items({ search: q, magical: false }).catch(() => [] as Item[]);
    return list.slice(0, 40).map((i) => ({ slug: i.slug, name: i.name }));
  }, []);

  const applyClassKit = async (replace: boolean) => {
    const kit = classKits.find((k) => k.id === selectedClassKitId);
    if (!kit) return;
    setKitBusy(true);
    setKitNotice(null);
    try {
      const { rows: resolved, missedSlugs } = await resolveKitToDraft(
        kit.lines,
        fetchItemBySlug,
        kitItemSearch,
      );
      setRows(replace ? resolved : [...rows, ...resolved]);
      if (missedSlugs.length > 0) {
        setKitNotice(
          `${missedSlugs.length} item(s) were not found in the SRD list (${missedSlugs.slice(0, 5).join(", ")}${missedSlugs.length > 5 ? "…" : ""}) — added as plain names; fix in your inventory if needed.`,
        );
      }
    } catch {
      setKitNotice("Could not apply this kit. Try again or add items manually.");
    } finally {
      setKitBusy(false);
    }
  };

  const applyBackgroundKit = async (replace: boolean) => {
    if (!backgroundKitLines?.length) return;
    setKitBusy(true);
    setKitNotice(null);
    try {
      const { rows: resolved } = await resolveKitToDraft(
        backgroundKitLines,
        fetchItemBySlug,
        kitItemSearch,
      );
      setRows(replace ? resolved : [...rows, ...resolved]);
    } catch {
      setKitNotice("Could not apply the background pack.");
    } finally {
      setKitBusy(false);
    }
  };

  const classFmt = useMemo(
    () => (cls?.startingEquipment ? formatStartingEquipmentText(cls.startingEquipment) : ""),
    [cls?.startingEquipment],
  );
  const bgFmt = useMemo(
    () => (bg?.equipment ? formatStartingEquipmentText(bg.equipment) : ""),
    [bg?.equipment],
  );

  const sortedCatalog = useMemo(() => {
    return [...catalogItems].sort((a, b) => {
      const sa = (a.subcategory ?? "").localeCompare(b.subcategory ?? "");
      if (sa !== 0) return sa;
      return a.name.localeCompare(b.name);
    });
  }, [catalogItems]);

  return (
    <div className="space-y-5">
      {(classKits.length > 0 || backgroundKitLines) && (
        <div className="dnd-card space-y-3 border-dnd-gold/40 ring-1 ring-dnd-gold/20">
          <p className="dnd-label flex items-center gap-2 text-dnd-gold">
            <Sparkles size={16} className="text-dnd-gold" />
            Quick kits — pick a full loadout (no browsing required)
          </p>
          <p className="text-xs text-gray-500">
            Presets resolve real SRD item entries when possible. Use <span className="text-gray-400">Add kit</span> to keep
            what you already entered, or <span className="text-gray-400">Replace with kit</span> to clear and use only that
            preset.
          </p>
          {classKits.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs text-gray-500">Class starting equipment ({cls?.name ?? draft.classSlug})</label>
              <select
                value={selectedClassKitId}
                onChange={(e) => {
                  setSelectedClassKitId(e.target.value);
                  setKitNotice(null);
                }}
                className="input-field w-full text-sm"
              >
                <option value="">Choose a preset…</option>
                {classKits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.branches ? `${k.branches} ` : ""}
                    {k.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!selectedClassKitId || kitBusy}
                  onClick={() => void applyClassKit(false)}
                  className="btn-secondary text-sm"
                >
                  Add kit to inventory
                </button>
                <button
                  type="button"
                  disabled={!selectedClassKitId || kitBusy}
                  onClick={() => void applyClassKit(true)}
                  className="btn-primary text-sm"
                >
                  Replace with kit
                </button>
              </div>
            </div>
          )}
          {backgroundKitLines && backgroundKitLines.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-gray-800">
              <label className="block text-xs text-gray-500">
                Background pack{bg?.name ? ` (${bg.name})` : ""}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={kitBusy}
                  onClick={() => void applyBackgroundKit(false)}
                  className="btn-secondary text-sm"
                >
                  Add background items
                </button>
                <button
                  type="button"
                  disabled={kitBusy}
                  onClick={() => void applyBackgroundKit(true)}
                  className="btn-primary text-sm"
                >
                  Replace with background only
                </button>
              </div>
            </div>
          )}
          {kitBusy && <p className="text-xs text-gray-500">Resolving items…</p>}
          {kitNotice && <p className="text-xs text-amber-200/90">{kitNotice}</p>}
        </div>
      )}

      {!!draft.classSlug && cls && classKits.length === 0 && (
        <div className="rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
          No quick kit matched this class slug <code className="font-mono text-amber-200">{draft.classSlug}</code>. Presets
          use names like <code className="font-mono">druid</code>, <code className="font-mono">wizard</code>. Ask your DM or
          add items manually below.
        </div>
      )}

      <p className="text-sm text-gray-400">
        The SRD lists gear with <span className="text-gray-300">(a)</span>, <span className="text-gray-300">(b)</span>,
        etc. — those are <span className="text-dnd-gold">alternatives</span> (pick one branch per choice with your DM).
        Browse categories below, read the full description so similar names do not trip you up, then add to your pack.
      </p>

      {classFmt && (
        <div className="dnd-card space-y-2">
          <p className="dnd-label">Class starting equipment ({cls?.name})</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
            {classFmt}
          </pre>
        </div>
      )}

      {bgFmt && (
        <div className="dnd-card space-y-2">
          <p className="dnd-label">Background equipment ({bg?.name})</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
            {bgFmt}
          </pre>
        </div>
      )}

      {!classFmt && !bgFmt && (
        <p className="text-sm text-gray-500">No equipment text for this class/background in the database.</p>
      )}

      <div className="dnd-card space-y-3">
        <p className="dnd-label flex items-center gap-2">
          <Package size={16} className="text-dnd-gold" />
          Browse SRD items (non-magical)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ITEM_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setBrowseCategory((prev) => (prev === c.key ? null : c.key));
                setDetailItem(null);
              }}
              className={`min-h-11 px-3 py-2 rounded-md text-xs font-medium border transition-colors touch-manipulation active:opacity-90 ${
                browseCategory === c.key
                  ? "border-dnd-gold bg-dnd-gold/15 text-dnd-gold"
                  : "border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {browseCategory && (
          <p className="text-xs text-gray-500">
            {ITEM_CATEGORIES.find((c) => c.key === browseCategory)?.hint}
          </p>
        )}

        {browseCategory && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[16rem]">
            <div className="border border-gray-800 rounded-md overflow-hidden flex min-h-0 flex-col h-72 max-h-[55vh] lg:h-96 lg:max-h-[60vh]">
              <div className="px-2 py-1.5 bg-gray-900/80 text-xs text-stone-400 border-b border-gray-800 shrink-0">
                {catalogLoading ? "Loading…" : `${sortedCatalog.length} items`}
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden text-sm bg-dnd-panel/50">
                {sortedCatalog.length === 0 && !catalogLoading ? (
                  <li className="px-3 py-4 text-xs text-stone-500">No items returned for this category.</li>
                ) : null}
                {sortedCatalog.map((item) => (
                  <li key={item.slug}>
                    <button
                      type="button"
                      onClick={() => void loadDetail(item.slug)}
                      className={`w-full text-left px-2 py-2.5 min-h-[2.75rem] border-b border-gray-800/80 hover:bg-gray-800/60 touch-manipulation active:opacity-90 ${
                        detailItem?.slug === item.slug ? "bg-dnd-gold/10 text-dnd-gold" : "text-stone-200"
                      }`}
                    >
                      <span className="font-medium text-pretty">{item.name}</span>
                      {item.subcategory ? (
                        <span className="block text-[0.65rem] text-gray-500">{item.subcategory}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border border-gray-800 rounded-md p-3 bg-gray-900/40 text-sm flex min-h-0 flex-col h-72 max-h-[55vh] lg:h-96 lg:max-h-[60vh]">
              {detailLoading && <p className="text-stone-500 text-xs">Loading details…</p>}
              {!detailLoading && !detailItem && (
                <p className="text-stone-500 text-xs">
                  Select a category above, then an item in the list on the left to see damage, AC, weight, cost, and
                  rules text.
                </p>
              )}
              {detailItem && !detailLoading && (
                <div className="space-y-2 flex-1 overflow-y-auto">
                  <div>
                    <p className="font-display font-semibold text-dnd-gold text-base">{detailItem.name}</p>
                    <p className="text-[0.65rem] text-gray-500 uppercase tracking-wide">
                      {detailItem.category}
                      {detailItem.subcategory ? ` · ${detailItem.subcategory}` : ""}
                    </p>
                  </div>
                  {detailItem.damageDice && (
                    <p className="text-xs text-gray-300">
                      <span className="text-gray-500">Damage:</span> {detailItem.damageDice}{" "}
                      {detailItem.damageType ?? ""}
                      {detailItem.properties?.length ? ` · ${detailItem.properties.join(", ")}` : ""}
                    </p>
                  )}
                  {detailItem.weaponRange && (
                    <p className="text-xs text-gray-300">
                      <span className="text-gray-500">Range:</span> {detailItem.weaponRange.normal}
                      {detailItem.weaponRange.long ? ` / ${detailItem.weaponRange.long} ft` : " ft"}
                    </p>
                  )}
                  {detailItem.armorClass != null && (
                    <p className="text-xs text-gray-300">
                      <span className="text-gray-500">AC:</span> {detailItem.armorClass}
                      {detailItem.stealthDis ? " · stealth disadvantage" : ""}
                      {detailItem.strengthReq != null ? ` · Str ${detailItem.strengthReq}+` : ""}
                    </p>
                  )}
                  {(detailItem.weight != null || formatCost(detailItem.cost)) && (
                    <p className="text-xs text-gray-400">
                      {detailItem.weight != null ? `${detailItem.weight} lb` : ""}
                      {detailItem.weight != null && formatCost(detailItem.cost) ? " · " : ""}
                      {formatCost(detailItem.cost)}
                    </p>
                  )}
                  {detailItem.description ? (
                    <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap border-t border-gray-800 pt-2 mt-1">
                      {detailItem.description}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No extra description in the database.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => addFromItem(detailItem)}
                    className="btn-primary text-xs mt-2 w-full sm:w-auto"
                  >
                    Add to starting inventory
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="dnd-card space-y-3">
        <p className="dnd-label">Search (optional)</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type 2+ characters — results show name; open details from browse for full stats"
            className="input-field w-full pl-10 text-sm"
            spellCheck={false}
          />
        </div>
        {searching && <p className="text-xs text-gray-500">Searching…</p>}
        {hits.length > 0 && (
          <ul className="space-y-1">
            {hits.map((item) => (
              <li
                key={item.slug}
                className="flex flex-wrap items-center gap-2 justify-between rounded border border-gray-800 bg-gray-900/50 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 font-medium">{item.name}</p>
                  <p className="text-[0.65rem] text-gray-500 truncate">
                    {item.category}
                    {item.subcategory ? ` · ${item.subcategory}` : ""}
                    {item.damageDice ? ` · ${item.damageDice}` : ""}
                    {item.armorClass != null ? ` · AC ${item.armorClass}` : ""}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void loadDetail(item.slug)}
                    className="btn-secondary text-xs py-1 px-2"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => addFromItem(item)}
                    className="btn-primary text-xs py-1 px-2"
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {detailItem && !browseCategory && (
          <div className="rounded-md border border-dnd-gold/30 bg-gray-900/50 p-3 text-sm space-y-2">
            <p className="font-display font-semibold text-dnd-gold">{detailItem.name}</p>
            <p className="text-xs text-gray-400 whitespace-pre-wrap">{detailItem.description || "No description."}</p>
            <button
              type="button"
              onClick={() => addFromItem(detailItem)}
              className="btn-primary text-xs"
            >
              Add to starting inventory
            </button>
          </div>
        )}
      </div>

      <div className="dnd-card space-y-3">
        <p className="dnd-label">Your starting inventory</p>
        <button type="button" onClick={addCustomRow} className="btn-secondary text-sm flex items-center gap-2">
          <Plus size={16} /> Add custom item name
        </button>

        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((row, i) => (
              <li
                key={`${row.itemSlug ?? "c"}-${i}`}
                className="flex flex-wrap items-center gap-2 bg-gray-900/80 border border-gray-800 rounded p-2"
              >
                <span className="text-sm text-gray-300 flex-1 min-w-[8rem]">{startingInventoryRowLabel(row)}</span>
                {row.itemSlug == null && (
                  <input
                    type="text"
                    value={row.customName ?? ""}
                    onChange={(e) => updateRow(i, { customName: e.target.value })}
                    placeholder="Item name"
                    className="input-field text-sm flex-1 min-w-[10rem]"
                    spellCheck
                  />
                )}
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  Qty
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(i, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                    }
                    className="input-field w-14 text-center text-sm py-1"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-950/40 touch-manipulation"
                  aria-label="Remove row"
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CharacterCreationStepNext label="Next: Starting Spells" onClick={onNext} />
    </div>
  );
}
