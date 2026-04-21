import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { DM_PLAY_SET_TV_ID, DM_PLAY_SYNC_FULL, DM_PLAY_SYNC_VIEW } from "@/lib/dmPlayTvEvents";

const TV_ID_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

/**
 * Compact TV controls for the left nav (desktop) — keeps the main Play map area clear.
 */
export default function DmPlayTvNavCompact() {
  const [tvId, setTvId] = useState(() => {
    try {
      return localStorage.getItem("dnd5e_last_tv")?.trim() || "1";
    } catch {
      return "1";
    }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onStart = () => setBusy(true);
    const onEnd = () => setBusy(false);
    window.addEventListener("dm-play:tv-sync-busy", onStart);
    window.addEventListener("dm-play:tv-sync-idle", onEnd);
    return () => {
      window.removeEventListener("dm-play:tv-sync-busy", onStart);
      window.removeEventListener("dm-play:tv-sync-idle", onEnd);
    };
  }, []);

  const saveTv = useCallback(() => {
    const t = tvId.trim();
    if (!TV_ID_PATTERN.test(t)) return;
    try {
      localStorage.setItem("dnd5e_last_tv", t);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(DM_PLAY_SET_TV_ID, { detail: { tvId: t } }));
  }, [tvId]);

  const copyTvUrl = useCallback(async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/dungeons/player?tv=${encodeURIComponent(tvId.trim() || "1")}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy TV URL:", url);
    }
  }, [tvId]);

  const tvOk = TV_ID_PATTERN.test(tvId.trim());

  return (
    <div className="space-y-2">
      <p className="font-display text-[11px] font-semibold text-dnd-gold/90">TV / projector</p>
      <p className="text-[10px] leading-snug text-gray-500">
        Match <code className="text-gray-400">?tv=</code> on the big screen, then sync from here.
      </p>
      <label className="block">
        <span className="text-[10px] text-gray-500">Receiver #</span>
        <input
          className="input-field mt-0.5 w-full py-1 text-xs"
          value={tvId}
          onChange={(e) => setTvId(e.target.value)}
          placeholder="1"
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn-ghost flex-1 px-2 py-1 text-[10px]" disabled={!tvOk} onClick={saveTv}>
          Save
        </button>
        <button
          type="button"
          className="rounded border border-gray-700 p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          title="Copy projector URL"
          onClick={() => void copyTvUrl()}
        >
          <Copy size={14} aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="rounded border border-dnd-gold/50 bg-dnd-gold/10 px-2 py-1 text-[10px] font-semibold text-dnd-gold hover:bg-dnd-gold/20 disabled:opacity-50"
          disabled={busy}
          onClick={() => window.dispatchEvent(new CustomEvent(DM_PLAY_SYNC_VIEW))}
        >
          Sync this view
        </button>
        <button
          type="button"
          className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => window.dispatchEvent(new CustomEvent(DM_PLAY_SYNC_FULL))}
        >
          Sync full map (fog)
        </button>
      </div>
      {busy && <p className="text-[10px] text-gray-500">Syncing…</p>}
    </div>
  );
}
