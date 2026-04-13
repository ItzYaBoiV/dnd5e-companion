import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Item } from "@/types/dnd";
import { referenceApi } from "@/services/api";
import { Modal } from "@/components/common";

/** Opens Monster Manual with this creature selected (see MonstersPage + `openMonsterSlug` state). */
export function ForgeMonsterLink({ slug, count }: { slug: string; count?: number }) {
  const navigate = useNavigate();
  const clean = (slug ?? "").trim();
  if (!clean) return <span className="text-gray-500">—</span>;
  const label = clean.replace(/-/g, " ");
  return (
    <button
      type="button"
      onClick={() => navigate("/monsters", { state: { openMonsterSlug: clean } })}
      className="font-semibold text-red-300 hover:text-red-200 underline decoration-red-900/50 underline-offset-2 text-left"
      title="Open stat block in Monster Manual"
    >
      {count != null ? `${count}× ` : ""}
      <span className="capitalize">{label}</span>
    </button>
  );
}

function tokenLooksLikeItemSlug(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 96) return false;
  if (/\s/.test(t)) return false;
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/i.test(t);
}

/** Renders treasure item tokens; slug-like strings open SRD item details. */
export function ForgeTreasureItemLine({ items }: { items: string[] }) {
  const [peek, setPeek] = useState<Item | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  if (!items?.length) return null;

  const openItem = async (slug: string) => {
    setErr(null);
    try {
      const it = await referenceApi.item(slug);
      setPeek(it);
    } catch {
      setErr(`No SRD entry for “${slug.replace(/-/g, " ")}”.`);
    }
  };

  return (
    <>
      {items.map((raw, i) => {
        const s = raw.trim();
        const slugish = tokenLooksLikeItemSlug(s);
        return (
          <span key={`${i}-${s}`}>
            {i > 0 ? ", " : null}
            {slugish ? (
              <button
                type="button"
                className="text-yellow-200 hover:text-yellow-100 underline decoration-yellow-800/50 underline-offset-2"
                title="View SRD item"
                onClick={() => void openItem(s)}
              >
                {s.replace(/-/g, " ")}
              </button>
            ) : (
              <span>{s}</span>
            )}
          </span>
        );
      })}
      {err && <span className="block text-xs text-amber-600 mt-1">{err}</span>}
      {peek && (
        <Modal
          title={peek.name}
          wide
          onClose={() => setPeek(null)}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setPeek(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const slug = peek.slug;
                  setPeek(null);
                  navigate("/reference/items", { state: { highlightItemSlug: slug } });
                }}
              >
                Open in Reference
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-gray-300">
            <p className="text-xs text-gray-500 capitalize">{peek.category}</p>
            {peek.description ? <p className="leading-relaxed">{peek.description}</p> : null}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {peek.damageDice ? (
                <div>
                  <span className="dnd-label">Damage</span>
                  <p>
                    {peek.damageDice} {peek.damageType ?? ""}
                  </p>
                </div>
              ) : null}
              {peek.armorClass != null ? (
                <div>
                  <span className="dnd-label">AC</span>
                  <p>{peek.armorClass}</p>
                </div>
              ) : null}
              {peek.weight != null ? (
                <div>
                  <span className="dnd-label">Weight</span>
                  <p>{peek.weight} lb</p>
                </div>
              ) : null}
              {peek.cost ? (
                <div>
                  <span className="dnd-label">Cost</span>
                  <p>
                    {peek.cost.quantity} {peek.cost.unit}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
