import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileDown, Trash2 } from "lucide-react";
import { useCharacterStore } from "@/store/characterStore";
import { characterApi } from "@/services/api";
import { useUIStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { LoadingSpinner } from "@/components/common";
import CharacterSheet from "@/components/CharacterSheet";
import { downloadWizardsCharacterSheetPdf } from "@/lib/wizardsCharacterSheetPdfExport";

export default function CharacterSheetPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeCharacter, isLoading, error, loadCharacter, clearCharacter } = useCharacterStore();
  const { activeTab, setTab } = useUIStore();
  const { sessions, activeSession, loadSessions } = useSessionStore();
  const [pdfExporting, setPdfExporting] = useState(false);

  useEffect(() => {
    if (id) loadCharacter(id);
  }, [id, loadCharacter]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const playerNameForExport = useMemo(() => {
    const cid = activeCharacter?.id;
    if (!cid) return "";
    const fromActive = activeSession?.characters?.find((x) => x.characterId === cid)?.playerName?.trim();
    if (fromActive) return fromActive;
    for (const s of sessions) {
      const m = s.characters?.find((x) => x.characterId === cid);
      if (m?.playerName?.trim()) return m.playerName.trim();
    }
    return "";
  }, [activeCharacter?.id, activeSession, sessions]);

  if (isLoading) return <LoadingSpinner />;

  if (error || !activeCharacter) {
    return (
      <div className="p-6">
        <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300">
          {error ?? "Character not found"}
        </div>
        <button onClick={() => navigate("/characters")} className="btn-ghost mt-4 flex items-center gap-2">
          <ArrowLeft size={16} /> Back to characters
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-gray-800/90 bg-[#0d0c0b]">
        <button
          onClick={() => navigate("/characters")}
          className="btn-ghost flex items-center gap-1 text-sm shrink-0"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="h-4 w-px bg-gray-700 hidden sm:block" />
        <div className="flex-1 min-w-[8rem]">
          <h1 className="font-display font-bold text-base sm:text-lg text-dnd-gold leading-tight truncate">
            {activeCharacter.name}
          </h1>
          <p className="text-[0.65rem] sm:text-xs text-gray-500 truncate">
            <span className="capitalize">Level {activeCharacter.level}</span>
            <span className="text-gray-600"> · </span>
            <span className="capitalize">{activeCharacter.raceSlug.replace(/-/g, " ")}</span>
            <span className="text-gray-600"> · </span>
            <span className="text-gray-400">
              {activeCharacter.computed?.classSummary ||
                `${activeCharacter.classSlug.replace(/-/g, " ")}`}
            </span>
          </p>
        </div>

        <nav className="flex gap-0.5 items-center flex-wrap justify-end p-0.5 rounded-lg bg-black/35 border border-gray-800">
          <button
            type="button"
            disabled={pdfExporting}
            onClick={() => {
              void (async () => {
                if (!activeCharacter) return;
                setPdfExporting(true);
                try {
                  await downloadWizardsCharacterSheetPdf(activeCharacter, {
                    playerName: playerNameForExport,
                  });
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e));
                } finally {
                  setPdfExporting(false);
                }
              })();
            }}
            className="px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-display font-semibold text-amber-200/95 hover:bg-amber-950/50 hover:text-amber-100 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 border border-transparent hover:border-amber-800/60"
            title="Download Wizards of the Coast fillable character sheet PDF"
            aria-label={pdfExporting ? "Exporting PDF" : "Download official Wizards 5e fillable character sheet PDF"}
          >
            <FileDown size={16} className="shrink-0 opacity-90" />
            <span className="hidden sm:inline">{pdfExporting ? "PDF…" : "Official PDF"}</span>
          </button>
          <div className="h-5 w-px bg-gray-700 mx-0.5 hidden sm:block" aria-hidden />
          {(["main", "spells", "inventory", "features", "notes"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-display font-semibold capitalize transition-colors ${
                activeTab === tab
                  ? "bg-dnd-red text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/80"
              }`}
            >
              {tab}
            </button>
          ))}
          <button
            type="button"
            onClick={async () => {
              if (!activeCharacter) return;
              if (
                !window.confirm(
                  `Delete "${activeCharacter.name}" permanently? This cannot be undone. They will also be removed from any play sessions.`,
                )
              ) {
                return;
              }
              try {
                await characterApi.delete(activeCharacter.id);
                clearCharacter();
                navigate("/characters");
              } catch (e) {
                alert(String(e));
              }
            }}
            className="ml-1 p-2 rounded text-gray-500 hover:text-red-400 hover:bg-red-950/40"
            title="Delete character"
            aria-label="Delete character"
          >
            <Trash2 size={18} />
          </button>
        </nav>
      </div>

      {/* Sheet content */}
      <div className="flex-1 overflow-auto pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <CharacterSheet character={activeCharacter} activeTab={activeTab} />
      </div>
    </div>
  );
}
