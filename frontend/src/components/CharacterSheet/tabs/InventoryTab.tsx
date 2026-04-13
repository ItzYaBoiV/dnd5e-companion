import { useState, useEffect, useRef } from "react";
import type { Character, Item } from "@/types/dnd";
import { useCharacterStore } from "@/store/characterStore";
import { referenceApi } from "@/services/api";
import { SectionHeader, Modal, LoadingSpinner } from "@/components/common";
import { Plus, Package, Shield, Sword } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  character: Character;
}

export default function InventoryTab({ character }: Props) {
  const { addItem, updateItem, removeItem, updateCharacterField } = useCharacterStore();
  const [itemDetails, setItemDetails] = useState<Record<string, Item>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const slugs = character.inventory
      .filter((i) => i.itemSlug)
      .map((i) => i.itemSlug!);
    const missing = slugs.filter((s) => !itemDetails[s]);
    if (missing.length === 0) return;

    Promise.all(missing.map((slug) => referenceApi.item(slug)))
      .then((details) => {
        setItemDetails((prev) => {
          const updated = { ...prev };
          details.forEach((d) => { if (d) updated[d.slug] = d; });
          return updated;
        });
      })
      .catch(console.error);
  }, [character.inventory, itemDetails]);

  const totalWeight = character.inventory.reduce((sum, inv) => {
    const detail = inv.itemSlug ? itemDetails[inv.itemSlug] : null;
    return sum + (detail?.weight ?? 0) * inv.quantity;
  }, 0);

  const equippedItems = character.inventory.filter((i) => i.equipped);
  const unequippedItems = character.inventory.filter((i) => !i.equipped);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Currency */}
      <div className="dnd-card">
        <SectionHeader title="Currency" />
        <div className="grid grid-cols-5 gap-2">
          {(["copper", "silver", "electrum", "gold", "platinum"] as const).map((coin) => (
            <CurrencyField
              key={coin}
              coin={coin}
              value={character[coin]}
              onChange={(v) => updateCharacterField({ [coin]: v })}
            />
          ))}
        </div>
      </div>

      {/* Carrying capacity */}
      <div className="dnd-card flex items-center justify-between text-sm">
        <div>
          <span className="dnd-label">Carrying Weight</span>
          <p className="font-display font-bold text-white">{totalWeight.toFixed(1)} lbs</p>
        </div>
        <div className="text-right">
          <span className="dnd-label">Capacity</span>
          <p className="font-display font-bold text-white">
            {character.computed.carryingCapacity} lbs
          </p>
        </div>
        <div className="text-right">
          <span className="dnd-label">Push / Drag / Lift</span>
          <p className="font-display font-bold text-white">
            {character.computed.pushDragLift} lbs
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={15} />
          Add Item
        </button>
      </div>

      {/* Equipped */}
      {equippedItems.length > 0 && (
        <div className="dnd-card">
          <SectionHeader title="Equipped" />
          <div className="space-y-2">
            {equippedItems.map((inv) => (
              <InventoryRow
                key={inv.id}
                inv={inv}
                detail={inv.itemSlug ? itemDetails[inv.itemSlug] : undefined}
                onUpdate={(body) => updateItem(inv.id, body)}
                onRemove={() => removeItem(inv.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Backpack */}
      <div className="dnd-card">
        <SectionHeader
          title={`Backpack (${unequippedItems.length})`}
        />
        {unequippedItems.length === 0 ? (
          <div className="text-center py-6">
            <Package size={32} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-600 text-sm">Backpack is empty</p>
          </div>
        ) : (
          <div className="space-y-2">
            {unequippedItems.map((inv) => (
              <InventoryRow
                key={inv.id}
                inv={inv}
                detail={inv.itemSlug ? itemDetails[inv.itemSlug] : undefined}
                onUpdate={(body) => updateItem(inv.id, body)}
                onRemove={() => removeItem(inv.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdd={(body) => {
            addItem(body);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

// ── Currency Field ────────────────────────────────────────────────
const COIN_COLORS: Record<string, string> = {
  copper:   "text-orange-400",
  silver:   "text-gray-300",
  electrum: "text-teal-400",
  gold:     "text-dnd-gold",
  platinum: "text-blue-300",
};

const COIN_ABBR: Record<string, string> = {
  copper: "CP", silver: "SP", electrum: "EP", gold: "GP", platinum: "PP",
};

function CurrencyField({
  coin, value, onChange,
}: {
  coin: string; value: number; onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(String(value));
  const localRef = useRef(local);
  const editingRef = useRef(editing);
  const onChangeRef = useRef(onChange);
  localRef.current = local;
  editingRef.current = editing;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editing) setLocal(String(value));
  }, [value, editing]);

  useEffect(() => {
    return () => {
      if (editingRef.current) {
        onChangeRef.current(parseInt(localRef.current, 10) || 0);
      }
    };
  }, []);

  const commit = () => {
    onChange(parseInt(local, 10) || 0);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col items-center gap-1">
        <input
          type="number"
          min="0"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="input-field w-full text-center font-mono text-sm"
          autoFocus
        />
        <span className={clsx("text-xs font-display font-bold", COIN_COLORS[coin])}>{COIN_ABBR[coin]}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      className="flex flex-col items-center gap-1 py-2 px-1 rounded hover:bg-gray-800 transition-colors"
    >
      <span className={clsx("text-xl font-display font-bold", COIN_COLORS[coin])}>{value}</span>
      <span className={clsx("text-xs font-display font-bold", COIN_COLORS[coin])}>{COIN_ABBR[coin]}</span>
    </button>
  );
}

// ── Inventory Row ─────────────────────────────────────────────────
function InventoryRow({
  inv, detail, onUpdate, onRemove,
}: {
  inv: any; detail?: Item;
  onUpdate: (body: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isWeapon = detail?.category === "weapon";
  const isArmor  = detail?.category === "armor";

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 transition-colors">
        {/* Category icon */}
        <span className="text-gray-600 flex-shrink-0">
          {isWeapon ? <Sword size={14} /> : isArmor ? <Shield size={14} /> : <Package size={14} />}
        </span>

        {/* Name */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 text-left"
        >
          <span className="font-display font-semibold text-sm text-white">
            {detail?.name ?? inv.customName ?? inv.itemSlug}
          </span>
          {inv.quantity > 1 && (
            <span className="text-gray-500 text-xs ml-1">×{inv.quantity}</span>
          )}
          {detail?.magical && (
            <span className="ml-2 text-xs text-purple-400 font-display">✦ magic</span>
          )}
        </button>

        {/* Quick stats */}
        {isWeapon && detail?.damageDice && (
          <span className="text-xs font-mono text-dnd-gold">{detail.damageDice}</span>
        )}
        {isArmor && detail?.armorClass != null && (
          <span className="text-xs font-mono text-blue-400">AC {detail.armorClass}</span>
        )}

        {/* Equip toggle */}
        <button
          onClick={() => onUpdate({ equipped: !inv.equipped })}
          className={clsx(
            "text-xs font-display px-2 py-0.5 rounded border transition-colors",
            inv.equipped
              ? "bg-dnd-red border-red-700 text-red-200"
              : "border-gray-600 text-gray-500 hover:border-gray-400"
          )}
        >
          {inv.equipped ? "Equipped" : "Equip"}
        </button>

        {/* Attunement */}
        {detail?.requiresAttunement && (
          <button
            onClick={() => onUpdate({ attuned: !inv.attuned })}
            className={clsx(
              "text-xs font-display px-2 py-0.5 rounded border transition-colors",
              inv.attuned
                ? "bg-purple-950 border-purple-700 text-purple-300"
                : "border-gray-600 text-gray-500 hover:border-purple-700"
            )}
          >
            {inv.attuned ? "Attuned" : "Attune"}
          </button>
        )}

        <button
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {expanded && detail && (
        <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700 space-y-2">
          {isWeapon && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="dnd-label">Damage</span><p className="text-gray-300">{detail.damageDice} {detail.damageType}</p></div>
              <div><span className="dnd-label">Range</span><p className="text-gray-300">{detail.weaponRange ? `${detail.weaponRange.normal}/${detail.weaponRange.long} ft` : "Melee"}</p></div>
              <div><span className="dnd-label">Properties</span><p className="text-gray-300 capitalize">{detail.properties.join(", ") || "—"}</p></div>
            </div>
          )}
          {isArmor && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="dnd-label">AC</span>
                <p className="text-gray-300">{detail.armorClass != null ? detail.armorClass : "—"}</p>
              </div>
              {detail.strengthReq && <div><span className="dnd-label">Str Req</span><p className="text-gray-300">{detail.strengthReq}</p></div>}
              {detail.stealthDis && <div><span className="dnd-label">Stealth</span><p className="text-yellow-500">Disadvantage</p></div>}
            </div>
          )}
          {detail.description && (
            <p className="text-xs text-gray-400 leading-relaxed">{detail.description}</p>
          )}
          {(detail.cost || detail.weight != null) && (
            <p className="text-xs text-gray-600">
              {detail.cost ? (
                <>
                  Cost: {detail.cost.quantity} {detail.cost.unit}
                  {detail.weight != null && ` · Weight: ${detail.weight} lb`}
                </>
              ) : (
                detail.weight != null && <>Weight: {detail.weight} lb</>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Item Modal ────────────────────────────────────────────────
function AddItemModal({
  onClose, onAdd,
}: {
  onClose: () => void;
  onAdd: (body: Record<string, unknown>) => void;
}) {
  const [mode, setMode]     = useState<"search" | "custom">("search");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults]   = useState<Item[]>([]);
  const [loading, setLoading]   = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty]   = useState("1");

  const handleSearch = async () => {
    setLoading(true);
    try {
      const items = await referenceApi.items({ search: search || undefined, category: category || undefined });
      setResults(items);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Add Item"
      onClose={onClose}
      footer={
        mode === "custom" ? (
          <>
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={() => onAdd({ customName, quantity: parseInt(customQty, 10) || 1 })}
              className="btn-primary"
              disabled={!customName.trim()}
            >
              Add Custom
            </button>
          </>
        ) : (
          <button onClick={onClose} className="btn-secondary">Close</button>
        )
      }
    >
      {/* Tab switcher */}
      <div className="flex gap-1 mb-3 p-1 bg-gray-900 rounded">
        {(["search", "custom"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx(
              "flex-1 py-1.5 rounded text-sm font-display font-semibold capitalize transition-colors",
              mode === m ? "bg-dnd-red text-white" : "text-gray-400 hover:text-white"
            )}
          >
            {m === "search" ? "SRD Items" : "Custom Item"}
          </button>
        ))}
      </div>

      {mode === "search" ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="input-field flex-1 text-sm"
              spellCheck={false}
              autoFocus
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">All</option>
              <option value="weapon">Weapons</option>
              <option value="armor">Armor</option>
              <option value="gear">Gear</option>
              <option value="magic">Magic</option>
            </select>
            <button onClick={handleSearch} className="btn-primary text-sm">Go</button>
          </div>

          {loading && <LoadingSpinner />}

          <div className="max-h-64 overflow-auto space-y-1">
            {results.map((item) => (
              <div
                key={item.slug}
                className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-800"
              >
                <div>
                  <p className="font-display font-semibold text-sm text-white">{item.name}</p>
                  <p className="text-xs text-gray-500 capitalize">
                    {item.category}
                    {item.damageDice && ` · ${item.damageDice} ${item.damageType}`}
                    {item.armorClass && ` · AC ${item.armorClass}`}
                    {item.cost && ` · ${item.cost.quantity} ${item.cost.unit}`}
                  </p>
                </div>
                <button
                  onClick={() => onAdd({ itemSlug: item.slug, quantity: 1 })}
                  className="btn-primary text-xs px-3"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="dnd-label block mb-1">Item Name</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="input-field w-full"
              placeholder="e.g. Mysterious Amulet"
              spellCheck
              autoFocus
            />
          </div>
          <div>
            <label className="dnd-label block mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              value={customQty}
              onChange={(e) => setCustomQty(e.target.value)}
              className="input-field w-24"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
