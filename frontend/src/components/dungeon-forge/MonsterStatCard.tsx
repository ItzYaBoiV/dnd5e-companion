import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/common";

type MonsterJson = {
  slug: string;
  name: string;
  type: string;
  subtype?: string | null;
  armorClass: number;
  hitPoints: number;
  challengeRating: string;
  xp: number;
  speed: unknown;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  senses?: string;
  languages?: string;
  specialAbilities?: unknown;
  actions?: unknown;
  reactions?: unknown;
  legendaryActions?: unknown;
  damageImmunities?: string | null;
};

const cache = new Map<string, MonsterJson>();

function mod(n: number): string {
  const m = Math.floor((n - 10) / 2);
  return `${m >= 0 ? "+" : ""}${m}`;
}

export type StatCardView = "dm" | "player";

export function MonsterStatCard({
  slug,
  initialView,
  onClose,
}: {
  slug: string;
  initialView: StatCardView;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<StatCardView>(initialView);
  const [data, setData] = useState<MonsterJson | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setView(initialView);
  }, [initialView, slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      const clean = slug.trim();
      if (!clean) {
        setErr("Missing slug");
        return;
      }
      if (cache.has(clean)) {
        setData(cache.get(clean)!);
        return;
      }
      try {
        const res = await fetch(`/api/monsters/${encodeURIComponent(clean)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as MonsterJson;
        if (cancelled) return;
        cache.set(clean, j);
        setData(j);
      } catch {
        if (!cancelled) setErr("Could not load stat block.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyMd = useCallback(() => {
    if (!data) return;
    const lines = [
      `## ${data.name}`,
      `*${data.type}${data.subtype ? ` (${data.subtype})` : ""}*`,
      `**AC** ${view === "player" ? "?" : data.armorClass}  **HP** ${view === "player" ? "?" : data.hitPoints}  **CR** ${data.challengeRating}`,
      "",
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
  }, [data, view]);

  const showToPlayers = useCallback(() => {
    const clean = slug.trim();
    try {
      const bc = new BroadcastChannel("dnd5e-monster-display");
      bc.postMessage({ slug: clean, view: "player" });
      bc.close();
    } catch {
      try {
        localStorage.setItem(
          "dnd5e-monster-display-fallback",
          JSON.stringify({ slug: clean, view: "player", t: Date.now() }),
        );
      } catch {
        /* ignore */
      }
    }
    window.open(`/play/monster/${encodeURIComponent(clean)}?view=player`, "_blank", "noopener,noreferrer");
  }, [slug]);

  const title = data?.name ?? slug.replace(/-/g, " ");

  return (
    <Modal
      title={title}
      wide
      onClose={onClose}
      footer={
        <div className="flex flex-wrap gap-2 justify-between w-full items-center">
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-sm py-1.5 px-3" onClick={() => setView("dm")}>
              DM view
            </button>
            <button type="button" className="btn-secondary text-sm py-1.5 px-3" onClick={() => setView("player")}>
              Player view
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button ref={closeBtnRef} type="button" className="btn-secondary text-sm py-1.5 px-3" onClick={copyMd}>
              Copy markdown
            </button>
            <button type="button" className="btn-secondary text-sm py-1.5 px-3" onClick={() => window.print()}>
              Print card
            </button>
            <button type="button" className="btn-primary text-sm py-1.5 px-3" onClick={showToPlayers}>
              Show to players
            </button>
            <button
              type="button"
              className="text-sm text-dnd-gold hover:underline px-2"
              title="Full Monster Manual entry"
              onClick={() => navigate("/monsters", { state: { openMonsterSlug: slug.trim() } })}
            >
              Open full profile ↗
            </button>
          </div>
        </div>
      }
    >
      <div className="text-sm text-stone-200 space-y-3">
        <h3 id="monster-stat-title" className="sr-only">
          {title}
        </h3>
        {err && <p className="text-amber-600">{err}</p>}
        {data && (
          <>
            <p className="text-stone-400 italic capitalize">{data.type}</p>
            <p>
              <span className="text-dnd-gold font-display">AC</span>{" "}
              {view === "player" ? "?" : data.armorClass}
              {" · "}
              <span className="text-dnd-gold font-display">HP</span> {view === "player" ? "?" : data.hitPoints}
              {" · "}
              <span className="text-dnd-gold font-display">CR</span> {data.challengeRating}{" "}
              <span className="text-stone-500">({data.xp} XP)</span>
            </p>
            {view === "dm" && data.damageImmunities && (
              <p className="text-xs text-stone-500">Immunities: {data.damageImmunities}</p>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs font-mono">
              {(
                [
                  ["STR", data.strength],
                  ["DEX", data.dexterity],
                  ["CON", data.constitution],
                  ["INT", data.intelligence],
                  ["WIS", data.wisdom],
                  ["CHA", data.charisma],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="bg-black/40 rounded px-2 py-1 border border-stone-700">
                  <div className="text-stone-500">{k}</div>
                  <div>
                    {v} <span className="text-dnd-gold">({mod(v)})</span>
                  </div>
                </div>
              ))}
            </div>
            {view === "dm" && (
              <div className="text-xs space-y-2 max-h-64 overflow-y-auto border border-stone-700 rounded p-2 bg-black/30">
                <StatBlockJson title="Traits" value={data.specialAbilities} />
                <StatBlockJson title="Actions" value={data.actions} />
                <StatBlockJson title="Reactions" value={data.reactions} />
                <StatBlockJson title="Legendary" value={data.legendaryActions} />
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function StatBlockJson({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text || text === "[]" || text === "{}") return null;
  return (
    <div>
      <div className="text-dnd-gold font-display font-semibold mb-1">{title}</div>
      <pre className="whitespace-pre-wrap text-stone-300">{text}</pre>
    </div>
  );
}
