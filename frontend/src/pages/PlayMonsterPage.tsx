import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

type M = { name: string; type: string; armorClass: number; hitPoints: number; challengeRating: string };

export default function PlayMonsterPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const view = (params.get("view") === "dm" ? "dm" : "player") as "dm" | "player";
  const [m, setM] = useState<M | null>(null);

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    const load = async (s: string) => {
      if (!s) return;
      try {
        const res = await fetch(`/api/monsters/${encodeURIComponent(s)}`);
        if (res.ok) setM(await res.json());
      } catch {
        setM(null);
      }
    };
    void load(slug);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "dnd5e-monster-display-fallback" || !e.newValue) return;
      try {
        const j = JSON.parse(e.newValue) as { slug?: string };
        if (j.slug) void load(j.slug);
      } catch {
        /* ignore */
      }
    };

    try {
      bc = new BroadcastChannel("dnd5e-monster-display");
      bc.onmessage = (ev: MessageEvent<{ slug?: string }>) => {
        const s = ev.data?.slug;
        if (s) void load(s);
      };
    } catch {
      /* BroadcastChannel unsupported — storage fallback only */
    }
    window.addEventListener("storage", onStorage);
    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [slug]);

  return (
    <div className="min-h-screen bg-black text-parchment flex flex-col items-center justify-center p-8">
      {m ? (
        <div className="text-center max-w-3xl">
          <h1 className="font-display text-4xl md:text-6xl font-bold text-dnd-gold mb-4">{m.name}</h1>
          <p className="text-xl md:text-2xl text-stone-400 mb-8 capitalize">{m.type}</p>
          {view === "dm" ? (
            <p className="text-3xl md:text-5xl font-mono">
              AC {m.armorClass} · HP {m.hitPoints} · CR {m.challengeRating}
            </p>
          ) : (
            <p className="text-3xl md:text-5xl font-mono">AC ? · HP ? · CR ?</p>
          )}
        </div>
      ) : (
        <p className="text-stone-500 text-xl">Waiting for display…</p>
      )}
    </div>
  );
}
