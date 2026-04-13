import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { LoadingSpinner, Modal } from "@/components/common";
import { Map as MapIcon, BookOpen, Trash2, ChevronDown, ChevronRight, Wand2, Download, Copy } from "lucide-react";
import { clsx } from "clsx";
import { postAiGenerate } from "@/lib/aiGenerateFetch";
import {
  downloadDungeonMapPng,
  syncDungeonMapCanvas,
  type DungeonMapRoom,
  type MapPaintMode,
} from "@/lib/dungeonMapCanvas";
import { buildAsciiDungeonMap, downloadAsciiMap, type AsciiMapMode } from "@/lib/dungeonAsciiMap";
import DungeonForge from "@/components/dungeon-forge/DungeonForge";
import { ForgeMonsterLink, ForgeTreasureItemLine } from "@/components/dungeon/ForgeReferenceLinks";

const API = "/api/generate";

type GenTab = "forge" | "generator" | "dungeons" | "stories";

const TAB_LABELS: Record<GenTab, string> = {
  forge: "Map forge",
  generator: "Classic",
  dungeons: "Dungeons",
  stories: "Stories",
};

export default function DungeonsPage() {
  const [tab, setTab] = useState<GenTab>("forge");

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-6 py-4 border-b border-gray-800 bg-dnd-dark flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-display font-bold text-2xl text-dnd-gold">AI Adventure Generator</h1>
          <p className="text-xs text-gray-500">Dungeon Forge, procedural maps, and GPU-backed AI</p>
        </div>
        <div className="flex gap-1 p-1 bg-gray-900 rounded-lg flex-wrap justify-end">
          {(["forge", "generator", "dungeons", "stories"] as GenTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx(
                "px-3 py-1.5 rounded font-display font-semibold text-sm transition-colors",
                tab === t ? "bg-dnd-red text-white" : "text-gray-400 hover:text-white"
              )}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div
        className={clsx(
          "flex flex-col min-h-0",
          tab === "forge" ? "overflow-hidden flex-1" : "p-4 pb-10",
        )}
        style={
          tab === "forge"
            ? { height: "calc(100dvh - 6.25rem)", maxHeight: "calc(100dvh - 6.25rem)" }
            : undefined
        }
      >
        {tab === "forge" && <DungeonForge />}
        {tab === "generator" && <GeneratorPanel />}
        {tab === "dungeons" && <DungeonLibrary />}
        {tab === "stories" && <StoryLibrary />}
      </div>
    </div>
  );
}

// ── Generator Panel ───────────────────────────────────────────────
type AiHealthWorker = {
  ip: string;
  hostname: string | null;
  model: string;
  healthy: boolean;
  busy?: boolean;
  responseMs: number | null;
};

type GenMode = "dungeon" | "story" | "encounter" | "npc";
type DungeonGenSource = "ai" | "procedural";

function GeneratorPanel() {
  const [mode, setMode]         = useState<GenMode>("dungeon");
  const [dungeonGenSource, setDungeonGenSource] = useState<DungeonGenSource>("procedural");
  const [generating, setGenerating] = useState(false);
  /** Per-mode so switching tabs does not show the wrong layout; each request is keyed to the mode when it started. */
  const [resultsByMode, setResultsByMode] = useState<Partial<Record<GenMode, unknown>>>({});
  const [error, setError]       = useState<string | null>(null);
  const [aiOk, setAiOk]         = useState<boolean | null>(null);
  const [aiWorkers, setAiWorkers] = useState<AiHealthWorker[]>([]);
  const [litellmRouteDetail, setLitellmRouteDetail] = useState<string | null>(null);
  const [jobPollLine, setJobPollLine] = useState<string | null>(null);

  // Dungeon form
  const [dForm, setDForm] = useState({
    theme: "goblin cave",
    customTheme: "",
    difficulty: "easy",
    levelMin: 1,
    levelMax: 3,
    roomCount: 8,
    ageRating: "all",
    /** Empty = server picks a seed (still stored on the dungeon for replay). */
    mapSeed: "",
  });
  // Story form
  const [sForm, setSForm] = useState({ theme: "rescue mission", levelMin: 1, levelMax: 3, ageRating: "all", partySize: 3 });
  // Encounter form
  const [eForm, setEForm] = useState({ setting: "forest clearing", difficulty: "medium", levelMin: 1, levelMax: 3, partySize: 3 });
  // NPC form
  const [nForm, setNForm] = useState({ role: "innkeeper", setting: "small village", ageRating: "all" });

  useEffect(() => {
    fetch(`${API}/ai/health`)
      .then((r) => r.json())
      .then((d: { ok?: boolean; workers?: AiHealthWorker[]; litellmRouteDetail?: string }) => {
        setAiOk(d.ok === true);
        setAiWorkers(Array.isArray(d.workers) ? d.workers : []);
        setLitellmRouteDetail(typeof d.litellmRouteDetail === "string" ? d.litellmRouteDetail : null);
      })
      .catch(() => {
        setAiOk(false);
        setAiWorkers([]);
        setLitellmRouteDetail(null);
      });
  }, []);

  const generate = async () => {
    const modeWhenStarted = mode;
    setGenerating(true);
    setError(null);
    setJobPollLine(null);
    try {
      const resolvedDungeonTheme =
        dForm.theme === "custom" ? (dForm.customTheme.trim() || "custom location") : dForm.theme;

      if (modeWhenStarted === "dungeon" && dungeonGenSource === "procedural") {
        const res = await fetch(`${API}/dungeons/generate-procedural`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            theme: resolvedDungeonTheme,
            difficulty: dForm.difficulty,
            levelMin: dForm.levelMin,
            levelMax: dForm.levelMax,
            roomCount: dForm.roomCount,
            ...(dForm.mapSeed.trim() !== "" ? { mapSeed: dForm.mapSeed.trim() } : {}),
          }),
        });
        let data: unknown = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (!res.ok) {
          const msg =
            data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : `HTTP ${res.status}`;
          throw new Error(msg);
        }
        setResultsByMode((prev) => ({ ...prev, dungeon: data }));
        return;
      }

      let endpoint = "";
      let body: Record<string, unknown> = {};
      if (modeWhenStarted === "dungeon") {
        endpoint = "/dungeons/generate";
        body = {
          theme: resolvedDungeonTheme,
          difficulty: dForm.difficulty,
          levelMin: dForm.levelMin,
          levelMax: dForm.levelMax,
          roomCount: dForm.roomCount,
          ageRating: dForm.ageRating,
        };
      }
      if (modeWhenStarted === "story")     { endpoint = "/stories/generate";  body = sForm; }
      if (modeWhenStarted === "encounter") { endpoint = "/encounter/generate"; body = eForm; }
      if (modeWhenStarted === "npc")       { endpoint = "/npc/generate";       body = nForm; }

      const usePoll =
        modeWhenStarted === "dungeon" || modeWhenStarted === "story"
          ? {
              onJobPoll: (info: { status: string; elapsedSec: number }) => {
                setJobPollLine(
                  `Background job: ${info.status} · ${info.elapsedSec}s — workers are generating. ` +
                    `Server logs: logs/backend/ai-jobs.log and ai-generation.log (Docker: mount ./logs/backend).`,
                );
              },
            }
          : undefined;

      const data = await postAiGenerate(`${API}${endpoint}`, body, usePoll);
      setResultsByMode((prev) => ({ ...prev, [modeWhenStarted]: data }));
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
      setJobPollLine(null);
    }
  };

  const THEMES_DUNGEON = ["goblin cave","haunted crypt","dragon lair","bandit hideout","enchanted forest","sunken ruins","ice cavern","volcano lair"];
  const THEMES_STORY   = ["rescue mission","stolen treasure","mysterious disappearance","protect the village","cursed artifact","journey to find a wizard","defeat the dragon","save the animals"];

  return (
    <div className="max-w-4xl space-y-4">
      {/* AI Health */}
      <div className={clsx(
        "flex items-center gap-2 px-3 py-2 rounded text-sm font-display",
        aiOk === null ? "bg-gray-800 text-gray-400" :
        aiOk ? "bg-green-950 border border-green-800 text-green-300" :
               "bg-red-950 border border-red-800 text-red-300"
      )}>
        <div className={clsx("w-2 h-2 rounded-full", aiOk === null ? "bg-gray-500" : aiOk ? "bg-green-400 animate-pulse" : "bg-red-500")} />
        {aiOk === null
          ? "Checking AI workers..."
          : aiOk
            ? "AI workers online — ready to generate"
            : aiWorkers.some((w) => w.healthy) && litellmRouteDetail
              ? "Workers reachable — LiteLLM proxy needs a restart (see below)"
              : "AI workers offline — check ai-workers/README.md to set up"}
      </div>

      {litellmRouteDetail ? (
        <p className="text-xs text-amber-200/90 bg-amber-950/40 border border-amber-800/60 rounded px-3 py-2 font-mono leading-relaxed">
          {litellmRouteDetail}
        </p>
      ) : null}

      {aiWorkers.length > 0 && (
        <div className="dnd-card space-y-2">
          <h4 className="font-display font-semibold text-sm text-dnd-gold">Connected workers</h4>
          <ul className="space-y-1.5 text-sm">
            {aiWorkers.map((w) => (
              <li key={w.ip} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-gray-300">
                <span className={w.healthy ? "text-green-400" : "text-red-400"} aria-hidden>●</span>
                <span className="font-mono text-xs text-gray-400">{w.ip}</span>
                {w.hostname ? (
                  <span className="text-gray-200 font-medium">{w.hostname}</span>
                ) : (
                  <span className="text-gray-600 text-xs italic">no hostname</span>
                )}
                <span className="text-gray-500 text-xs">{w.model}</span>
                {w.responseMs != null ? (
                  <span className="text-gray-600 text-xs tabular-nums">{w.responseMs} ms</span>
                ) : null}
                {w.busy ? <span className="text-amber-600 text-xs">busy</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex gap-1 p-1 bg-gray-900 rounded-lg w-fit">
        {(["dungeon","story","encounter","npc"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={clsx("px-3 py-1.5 rounded font-display font-semibold text-sm capitalize transition-colors",
              mode === m ? "bg-dnd-red text-white" : "text-gray-400 hover:text-white")}>
            {m}
          </button>
        ))}
      </div>

      {/* Forms */}
      <div className="dnd-card space-y-4">
        {mode === "dungeon" && (
          <>
            <h3 className="font-display font-bold text-dnd-gold">Generate Dungeon</h3>
            <p className="text-xs text-gray-500 -mt-2">
              Procedural builds a coherent grid map instantly (no GPU workers). AI uses your workers for prose + layout (rooms capped at 10 for speed).
            </p>
            <div className="flex flex-wrap gap-1 p-1 bg-gray-900 rounded-lg w-fit">
              {(["procedural", "ai"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => {
                    setDungeonGenSource(src);
                    if (src === "ai") setDForm((p) => ({ ...p, roomCount: Math.min(p.roomCount, 10) }));
                  }}
                  className={clsx(
                    "px-3 py-1.5 rounded font-display font-semibold text-xs capitalize transition-colors",
                    dungeonGenSource === src ? "bg-dnd-red text-white" : "text-gray-400 hover:text-white",
                  )}
                >
                  {src === "procedural" ? "Procedural map" : "AI dungeon"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FormField label="Theme">
                <select className="input-field w-full text-sm" value={dForm.theme} onChange={(e) => setDForm((p) => ({ ...p, theme: e.target.value }))}>
                  {THEMES_DUNGEON.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="custom">Custom...</option>
                </select>
              </FormField>
              <FormField label="Difficulty">
                <select className="input-field w-full text-sm" value={dForm.difficulty} onChange={(e) => setDForm((p) => ({ ...p, difficulty: e.target.value }))}>
                  {["easy","medium","hard","deadly"].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </FormField>
              <FormField label="Age Rating">
                <select className="input-field w-full text-sm" value={dForm.ageRating} onChange={(e) => setDForm((p) => ({ ...p, ageRating: e.target.value }))}>
                  <option value="all">All ages</option>
                  <option value="7+">7+ (mild adventure)</option>
                  <option value="10+">10+ (more challenge)</option>
                </select>
              </FormField>
              <FormField label="Min Level">
                <input type="number" min="1" max="20" className="input-field w-full text-sm" value={dForm.levelMin}
                  onChange={(e) => setDForm((p) => ({ ...p, levelMin: parseInt(e.target.value) || 1 }))} />
              </FormField>
              <FormField label="Max Level">
                <input type="number" min="1" max="20" className="input-field w-full text-sm" value={dForm.levelMax}
                  onChange={(e) => setDForm((p) => ({ ...p, levelMax: parseInt(e.target.value) || 3 }))} />
              </FormField>
              <FormField label={dungeonGenSource === "procedural" ? "Area count (rooms + passages)" : "Room count (max 10 for AI)"}>
                <input
                  type="number"
                  min={4}
                  max={dungeonGenSource === "procedural" ? 22 : 10}
                  className="input-field w-full text-sm"
                  value={dForm.roomCount}
                  onChange={(e) => setDForm((p) => ({ ...p, roomCount: parseInt(e.target.value, 10) || 6 }))}
                />
              </FormField>
            </div>
            {dForm.theme === "custom" ? (
              <FormField label="Custom theme / tags" className="mt-1">
                <input
                  type="text"
                  className="input-field w-full text-sm"
                  placeholder="e.g. swamp ruins, underground temple"
                  value={dForm.customTheme}
                  onChange={(e) => setDForm((p) => ({ ...p, customTheme: e.target.value }))}
                  spellCheck
                />
              </FormField>
            ) : null}
            {dungeonGenSource === "procedural" ? (
              <FormField label="Map seed (optional)" className="mt-1">
                <input
                  type="text"
                  inputMode="numeric"
                  className="input-field w-full text-sm font-mono"
                  placeholder="Leave blank for auto — or enter a number to fix the layout RNG"
                  value={dForm.mapSeed}
                  onChange={(e) => setDForm((p) => ({ ...p, mapSeed: e.target.value }))}
                  spellCheck={false}
                />
              </FormField>
            ) : null}
          </>
        )}

        {mode === "story" && (
          <>
            <h3 className="font-display font-bold text-dnd-gold">Generate Story</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FormField label="Theme" className="col-span-2">
                <select className="input-field w-full text-sm" value={sForm.theme} onChange={(e) => setSForm((p) => ({ ...p, theme: e.target.value }))}>
                  {THEMES_STORY.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Age Rating">
                <select className="input-field w-full text-sm" value={sForm.ageRating} onChange={(e) => setSForm((p) => ({ ...p, ageRating: e.target.value }))}>
                  <option value="all">All ages</option>
                  <option value="7+">7+</option>
                  <option value="10+">10+</option>
                </select>
              </FormField>
              <FormField label="Min Level"><input type="number" min="1" max="20" className="input-field w-full text-sm" value={sForm.levelMin} onChange={(e) => setSForm((p) => ({ ...p, levelMin: parseInt(e.target.value) || 1 }))} /></FormField>
              <FormField label="Max Level"><input type="number" min="1" max="20" className="input-field w-full text-sm" value={sForm.levelMax} onChange={(e) => setSForm((p) => ({ ...p, levelMax: parseInt(e.target.value) || 3 }))} /></FormField>
              <FormField label="Party Size"><input type="number" min="1" max="8" className="input-field w-full text-sm" value={sForm.partySize} onChange={(e) => setSForm((p) => ({ ...p, partySize: parseInt(e.target.value) || 3 }))} /></FormField>
            </div>
          </>
        )}

        {mode === "encounter" && (
          <>
            <h3 className="font-display font-bold text-dnd-gold">Generate Encounter</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FormField label="Setting" className="col-span-2"><input type="text" className="input-field w-full text-sm" value={eForm.setting} onChange={(e) => setEForm((p) => ({ ...p, setting: e.target.value }))} spellCheck /></FormField>
              <FormField label="Difficulty"><select className="input-field w-full text-sm" value={eForm.difficulty} onChange={(e) => setEForm((p) => ({ ...p, difficulty: e.target.value }))}>{["easy","medium","hard","deadly"].map((d) => <option key={d} value={d}>{d}</option>)}</select></FormField>
              <FormField label="Min Level"><input type="number" min="1" max="20" className="input-field w-full text-sm" value={eForm.levelMin} onChange={(e) => setEForm((p) => ({ ...p, levelMin: parseInt(e.target.value) || 1 }))} /></FormField>
              <FormField label="Max Level"><input type="number" min="1" max="20" className="input-field w-full text-sm" value={eForm.levelMax} onChange={(e) => setEForm((p) => ({ ...p, levelMax: parseInt(e.target.value) || 3 }))} /></FormField>
              <FormField label="Party Size"><input type="number" min="1" max="8" className="input-field w-full text-sm" value={eForm.partySize} onChange={(e) => setEForm((p) => ({ ...p, partySize: parseInt(e.target.value) || 3 }))} /></FormField>
            </div>
          </>
        )}

        {mode === "npc" && (
          <>
            <h3 className="font-display font-bold text-dnd-gold">Generate NPC</h3>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Role"><input type="text" className="input-field w-full text-sm" value={nForm.role} onChange={(e) => setNForm((p) => ({ ...p, role: e.target.value }))} spellCheck /></FormField>
              <FormField label="Setting"><input type="text" className="input-field w-full text-sm" value={nForm.setting} onChange={(e) => setNForm((p) => ({ ...p, setting: e.target.value }))} spellCheck /></FormField>
              <FormField label="Age Rating"><select className="input-field w-full text-sm" value={nForm.ageRating} onChange={(e) => setNForm((p) => ({ ...p, ageRating: e.target.value }))}><option value="all">All ages</option><option value="7+">7+</option><option value="10+">10+</option></select></FormField>
            </div>
          </>
        )}

        <button
          onClick={generate}
          disabled={
            generating ||
            (!aiOk && (mode !== "dungeon" || dungeonGenSource === "ai"))
          }
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {generating ? (
            <>
              <LoadingSpinner className="p-0 w-5 h-5" />
              {mode === "dungeon" && dungeonGenSource === "procedural"
                ? "Building procedural map…"
                : "Generating in the background (polling every few seconds — safe to switch tabs; result also appears in Dungeons/Stories lists)…"}
            </>
          ) : mode === "dungeon" && dungeonGenSource === "procedural" ? (
            <>
              <MapIcon size={16} /> Generate procedural map
            </>
          ) : (
            <>
              <Wand2 size={16} /> Generate with AI
            </>
          )}
        </button>
      </div>

      {jobPollLine && (
        <div className="bg-amber-950/50 border border-amber-800/70 rounded p-3 text-amber-100/95 text-xs font-mono leading-relaxed">
          {jobPollLine}
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded p-3 text-red-300 text-sm">{error}</div>
      )}

      {resultsByMode[mode] != null && (
        <GenerationResult mode={mode} result={resultsByMode[mode]} />
      )}
    </div>
  );
}

function FormField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="dnd-label block mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── Generation Results ────────────────────────────────────────────
function GenerationResult({ mode, result }: { mode: GenMode; result: any }) {
  if (mode === "dungeon") return <DungeonResult dungeon={result} />;
  if (mode === "story") return <StoryResult story={result} />;
  if (mode === "encounter") return <EncounterResult enc={result} />;
  if (mode === "npc") return <NpcResult npc={result} />;

  return (
    <div className="dnd-card">
      <h3 className="font-display font-bold text-dnd-gold mb-3">{result?.name ?? result?.title ?? "Result"}</h3>
      <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-gray-900 p-3 rounded overflow-auto max-h-96">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function dungeonSlug(name: string) {
  return name
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56) || "dungeon";
}

function DungeonResult({ dungeon }: { dungeon: any }) {
  const [dmView, setDmView] = useState(true);
  const rooms = (dungeon.rooms ?? []) as DungeonMapRoom[];
  const base = dungeonSlug(String(dungeon.name ?? "dungeon"));
  const seedLine =
    typeof dungeon.mapSeed === "number" && Number.isFinite(dungeon.mapSeed)
      ? `Map seed: ${dungeon.mapSeed} — use this seed with the same theme and area count to recreate the layout.`
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 font-display uppercase tracking-wider">View</span>
        <button
          type="button"
          onClick={() => setDmView(true)}
          className={clsx(
            "px-3 py-1 rounded text-xs font-display font-bold",
            dmView ? "bg-dnd-red text-white" : "bg-gray-800 text-gray-400 hover:text-white",
          )}
        >
          DM (secrets)
        </button>
        <button
          type="button"
          onClick={() => setDmView(false)}
          className={clsx(
            "px-3 py-1 rounded text-xs font-display font-bold",
            !dmView ? "bg-emerald-800 text-white" : "bg-gray-800 text-gray-400 hover:text-white",
          )}
        >
          Player (no spoilers)
        </button>
      </div>
      <div className="dnd-card">
        <h3 className="font-display font-bold text-2xl text-dnd-gold mb-1">{dungeon.name}</h3>
        {dmView ? (
          <p className="text-gray-300 text-sm mb-3">{dungeon.description}</p>
        ) : (
          <p className="text-gray-400 text-sm mb-3 italic">
            Overview hidden in player mode — read the hook below or describe the mission yourself.
          </p>
        )}
        {seedLine ? (
          <p className="text-xs text-gray-500 font-mono mb-3 bg-gray-900/80 rounded px-2 py-1.5 border border-gray-700">
            {seedLine}
          </p>
        ) : null}
        <div className="bg-gray-900 rounded p-3 border-l-2 border-dnd-gold">
          <p className="dnd-label mb-1">Story Hook</p>
          <p className="text-gray-300 text-sm">{dungeon.story}</p>
        </div>
      </div>
      {rooms.length > 0 && (
        <DungeonMapView
          rooms={rooms}
          showSecrets={dmView}
          labelMode={dmView ? "dm" : "player"}
          exportBaseName={base}
        />
      )}
      {rooms.length > 0 && (
        <DungeonAsciiMapPanel rooms={rooms} mode={dmView ? "dm" : "player"} exportBaseName={base} />
      )}
      {dungeon.rooms?.map((room: any) => (
        <RoomCard key={room.id} room={room} dmView={dmView} />
      ))}
      {dungeon.npcs?.length > 0 && (
        <div className="dnd-card">
          <h4 className="font-display font-bold text-dnd-gold mb-2">Notable NPCs</h4>
          {dungeon.npcs.map((npc: any, i: number) => (
            <div key={i} className="mb-2">
              <p className="font-display font-bold text-white text-sm">{npc.name} <span className="text-gray-500 font-normal capitalize">({npc.role})</span></p>
              <p className="text-xs text-gray-400">{npc.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DungeonAsciiMapPanel({
  rooms,
  mode,
  exportBaseName,
}: {
  rooms: DungeonMapRoom[];
  mode: AsciiMapMode;
  exportBaseName: string;
}) {
  const ascii = useMemo(() => buildAsciiDungeonMap(rooms, { mode }), [rooms, mode]);
  const [copied, setCopied] = useState(false);

  if (!ascii.mapOnly) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ascii.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const tag = mode === "dm" ? "dm" : "players";

  return (
    <div className="dnd-card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <h4 className="font-display font-bold text-dnd-gold flex items-center gap-2">
          Logical ASCII map
        </h4>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 flex items-center gap-1 font-display"
            onClick={copy}
          >
            <Copy size={12} /> {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 flex items-center gap-1 font-display"
            onClick={() => downloadAsciiMap(`${exportBaseName}-ascii-${tag}.txt`, ascii.text)}
          >
            <Download size={12} /> .txt
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        One character per layout cell (same grid as the canvas). Unicode box-drawing for walls; numbered legend
        lists each room. {mode === "player" ? "No secret-door hints or hazard icons on the map." : "DM: doors (+), secret hints (S), traps, loot, encounters."}
      </p>
      <pre
        className="text-[11px] leading-[1.15] text-amber-100/95 bg-black/90 border border-gray-700 rounded p-3 overflow-auto max-h-[min(55vh,520px)] font-mono whitespace-pre select-all"
        aria-label="ASCII dungeon map"
      >
        {ascii.text}
      </pre>
    </div>
  );
}

function DungeonMapView({
  rooms,
  showSecrets,
  labelMode,
  exportBaseName,
}: {
  rooms: DungeonMapRoom[];
  showSecrets: boolean;
  labelMode: MapPaintMode;
  exportBaseName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setMapSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setMapSize({ w: Math.max(200, Math.floor(r.width)), h: Math.max(200, Math.floor(r.height)) });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rooms.length === 0 || mapSize.w < 50) return;
    syncDungeonMapCanvas(canvas, rooms, mapSize.w, mapSize.h, { showSecrets, labelMode });
  }, [rooms, showSecrets, labelMode, mapSize.w, mapSize.h]);

  const exportPng = (mode: MapPaintMode, secrets: boolean) => {
    const tag = mode === "dm" ? "dm" : "players";
    const sec = secrets ? "annotated" : "clean";
    downloadDungeonMapPng(rooms, {
      showSecrets: secrets,
      labelMode: mode,
      filename: `${exportBaseName}-map-${tag}-${sec}`,
      pixelRatio: 2,
      cellSize: 30,
    });
  };

  return (
    <div className="dnd-card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <h4 className="font-display font-bold text-dnd-gold flex items-center gap-2">
          <MapIcon size={16} /> Dungeon Map
        </h4>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 flex items-center gap-1 font-display"
            onClick={() => exportPng("dm", true)}
          >
            <Download size={12} /> PNG (DM)
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded bg-emerald-950 text-emerald-100 hover:bg-emerald-900 flex items-center gap-1 font-display border border-emerald-800/60"
            onClick={() => exportPng("player", false)}
          >
            <Download size={12} /> PNG (players)
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Passages use right-angle paths between shared edges.
        {labelMode === "player"
          ? " Player map: neutral chamber colors, safe labels, no hazard or loot icons."
          : showSecrets
            ? " DM map: room roles plus encounter, loot, hazards, secret doors, and hidden stashes."
            : ""}
      </p>
      {showSecrets && labelMode === "dm" ? (
        <div className="text-xs text-gray-600 mb-2 flex flex-wrap gap-x-3 gap-y-1">
          <span className="text-green-800">■ Entrance</span>
          <span className="text-purple-900">■ Chamber</span>
          <span className="text-amber-900">■ Corridor</span>
          <span className="text-red-900">■ Boss</span>
          <span className="text-yellow-900">■ Treasure</span>
          <span className="text-purple-950">■ Trap</span>
          <span className="text-amber-950">╌╌ Passage</span>
          <span className="text-red-800">⚔ encounter</span>
          <span className="text-yellow-900">◆ loot</span>
          <span className="text-sky-800">⌂ secret door</span>
          <span className="text-violet-800">✦ hidden stash</span>
          <span className="text-purple-900">! hazard</span>
        </div>
      ) : null}
      <div
        ref={wrapRef}
        className="w-full min-h-[280px] max-h-[min(62vh,580px)] min-w-0 rounded border border-amber-900/35 bg-[#1a1510] p-2 flex items-center justify-center overflow-auto"
      >
        <canvas
          ref={canvasRef}
          className="rounded border border-amber-900/40 shadow-md bg-[#e8dcc4] shrink-0"
        />
      </div>
    </div>
  );
}

function playerFacingAreaKind(type: string): string {
  if (type === "entrance") return "Entrance";
  if (type === "corridor") return "Passage";
  return "Chamber";
}

function parseRoomFeatures(room: any): {
  secretDoors?: { wall?: string; trigger?: string; perceptionDc?: number; investigationDc?: number; destination?: string }[];
  hiddenStashes?: { label?: string; investigationDc?: number; contents?: string }[];
  pointsOfInterest?: { label?: string; playerClue?: string; dmDetail?: string }[];
} | null {
  const f = room?.features;
  if (!f || typeof f !== "object") return null;
  return f as {
    secretDoors?: { wall?: string; trigger?: string; perceptionDc?: number; investigationDc?: number; destination?: string }[];
    hiddenStashes?: { label?: string; investigationDc?: number; contents?: string }[];
    pointsOfInterest?: { label?: string; playerClue?: string; dmDetail?: string }[];
  };
}

function RoomCard({ room, dmView }: { room: any; dmView: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const TYPE_COLORS_DM: Record<string, string> = {
    entrance: "text-green-400",
    corridor: "text-gray-400",
    chamber: "text-purple-400",
    boss: "text-red-400",
    treasure: "text-yellow-400",
    trap: "text-pink-400",
  };
  const TYPE_COLORS_PLAYER: Record<string, string> = {
    entrance: "text-green-400",
    corridor: "text-gray-400",
    chamber: "text-purple-300",
  };

  const features = parseRoomFeatures(room);
  const displayName =
    dmView || !String(room.playerLabel ?? "").trim()
      ? room.name
      : String(room.playerLabel).trim();
  const kindLabel = dmView ? room.type : playerFacingAreaKind(String(room.type ?? "chamber"));
  const typeColors = dmView ? TYPE_COLORS_DM : TYPE_COLORS_PLAYER;
  const colorKey = dmView ? room.type : room.type === "entrance" || room.type === "corridor" ? room.type : "chamber";

  const playerText =
    typeof room.playerDescription === "string" && room.playerDescription.trim()
      ? room.playerDescription.trim()
      : room.description;

  const poiPlayer = features?.pointsOfInterest?.filter((p) => String(p.playerClue ?? "").trim()) ?? [];

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        <span
          className={clsx(
            "font-display font-bold text-sm capitalize flex-shrink-0",
            typeColors[colorKey] ?? "text-gray-400",
          )}
        >
          [{kindLabel}]
        </span>
        <span className="font-display font-semibold text-white flex-1">{displayName}</span>
        {dmView && room.monsters?.length > 0 && (
          <span className="text-xs text-red-400">
            ⚔ {room.monsters.length} encounter{room.monsters.length > 1 ? "s" : ""}
          </span>
        )}
        {dmView &&
          room.treasures &&
          ((room.treasures.gold ?? 0) > 0 || (room.treasures.items?.length ?? 0) > 0) && (
            <span className="text-xs text-yellow-400">
              ★
              {(room.treasures.gold ?? 0) > 0 ? `${room.treasures.gold} gp` : "loot"}
            </span>
          )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-gray-900 border-t border-gray-700 space-y-2 text-sm">
          <p className="text-gray-300 whitespace-pre-wrap">{dmView ? room.description : playerText}</p>

          {!dmView && poiPlayer.length > 0 && (
            <div className="rounded border border-emerald-900/40 bg-emerald-950/20 px-3 py-2">
              <p className="dnd-label mb-1 text-emerald-200/90">What stands out</p>
              <ul className="text-emerald-100/90 text-xs space-y-1 list-disc list-inside">
                {poiPlayer.map((p, i) => (
                  <li key={i}>
                    {p.label ? <span className="font-semibold text-emerald-200">{p.label}: </span> : null}
                    {p.playerClue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dmView && String(room.dmSecrets ?? "").trim() !== "" && (
            <div className="rounded border border-amber-900/50 bg-amber-950/25 px-3 py-2">
              <p className="dnd-label mb-1 text-amber-200">DM secrets</p>
              <p className="text-amber-100/95 text-xs whitespace-pre-wrap leading-relaxed">{room.dmSecrets}</p>
            </div>
          )}

          {dmView && features?.secretDoors && features.secretDoors.length > 0 && (
            <div className="rounded border border-sky-900/50 bg-sky-950/20 px-3 py-2">
              <p className="dnd-label mb-1 text-sky-200">Secret doors</p>
              <ul className="text-sky-100/95 text-xs space-y-2">
                {features.secretDoors.map((d, i) => (
                  <li key={i}>
                    <span className="text-sky-300 font-semibold">{d.wall ?? "Wall"}</span>
                    {d.trigger ? <span> — trigger: {d.trigger}</span> : null}
                    <br />
                    <span className="text-gray-400">
                      DCs: Perception {d.perceptionDc ?? "—"}, Investigation {d.investigationDc ?? "—"}
                    </span>
                    {d.destination ? (
                      <>
                        <br />
                        <span className="text-gray-500">{d.destination}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dmView && features?.hiddenStashes && features.hiddenStashes.length > 0 && (
            <div className="rounded border border-violet-900/50 bg-violet-950/20 px-3 py-2">
              <p className="dnd-label mb-1 text-violet-200">Hidden stashes</p>
              <ul className="text-violet-100/95 text-xs space-y-2">
                {features.hiddenStashes.map((h, i) => (
                  <li key={i}>
                    <span className="font-semibold text-violet-300">{h.label ?? "Stash"}</span>
                    {h.investigationDc != null ? <span className="text-gray-400"> (Investigation DC {h.investigationDc})</span> : null}
                    {h.contents ? (
                      <>
                        <br />
                        <span className="text-gray-400">{h.contents}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dmView && features?.pointsOfInterest && features.pointsOfInterest.length > 0 && (
            <div className="rounded border border-teal-900/50 bg-teal-950/20 px-3 py-2">
              <p className="dnd-label mb-1 text-teal-200">Points of interest</p>
              <ul className="text-teal-100/95 text-xs space-y-2">
                {features.pointsOfInterest.map((p, i) => (
                  <li key={i}>
                    <span className="font-semibold text-teal-300">{p.label ?? "Detail"}</span>
                    {p.playerClue ? (
                      <>
                        <br />
                        <span className="text-teal-200/90">Player: {p.playerClue}</span>
                      </>
                    ) : null}
                    {p.dmDetail ? (
                      <>
                        <br />
                        <span className="text-gray-500">DM: {p.dmDetail}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dmView && room.monsters?.length > 0 && (
            <div>
              <p className="dnd-label mb-1">Monsters</p>
              <ul className="space-y-1.5">
                {room.monsters.map((m: any, i: number) => (
                  <li key={i} className="text-xs">
                    <ForgeMonsterLink slug={String(m.monsterSlug ?? "")} count={m.count} />
                    {m.notes ? <span className="text-gray-400"> — {m.notes}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dmView && room.traps && (
            <div>
              <p className="dnd-label mb-1">Trap / hazard</p>
              <p className="text-pink-300 text-xs">
                {room.traps.name}: {room.traps.description} (DC {room.traps.dc}, {room.traps.damage} damage)
              </p>
            </div>
          )}
          {dmView && room.treasures && ((room.treasures.gold ?? 0) > 0 || (room.treasures.items?.length ?? 0) > 0) && (
            <div>
              <p className="dnd-label mb-1">Treasure & items</p>
              <p className="text-yellow-300 text-xs">
                {room.treasures.gold ?? 0} gp
                {room.treasures.items?.length > 0 && (
                  <>
                    {" · "}
                    <ForgeTreasureItemLine items={room.treasures.items} />
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EncounterResult({ enc }: { enc: any }) {
  return (
    <div className="dnd-card space-y-4">
      <h3 className="font-display font-bold text-2xl text-dnd-gold">{enc.name ?? "Encounter"}</h3>
      <p className="text-gray-300 text-sm leading-relaxed">{enc.description}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-gray-900 rounded p-3 border-l-2 border-amber-700">
          <p className="dnd-label mb-1">Objective</p>
          <p className="text-gray-300 text-sm">{enc.objective}</p>
        </div>
        <div className="bg-gray-900 rounded p-3 border-l-2 border-emerald-700">
          <p className="dnd-label mb-1">Reward</p>
          <p className="text-gray-300 text-sm">{enc.reward}</p>
        </div>
      </div>
      <div className="bg-gray-900 rounded p-3 border-l-2 border-gray-600">
        <p className="dnd-label mb-1">Terrain & hazards</p>
        <p className="text-gray-300 text-sm">{enc.terrain}</p>
      </div>
      {enc.monsters?.length > 0 && (
        <div>
          <p className="font-display font-bold text-dnd-gold mb-2">Creatures</p>
          <ul className="space-y-2">
            {enc.monsters.map((m: any, i: number) => (
              <li key={i} className="bg-gray-900/80 rounded p-2 text-sm">
                <ForgeMonsterLink slug={String(m.monsterSlug ?? "")} count={m.count} />
                {m.tactic ? <p className="text-gray-400 text-xs mt-1">{m.tactic}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NpcResult({ npc }: { npc: any }) {
  return (
    <div className="dnd-card space-y-4">
      <div>
        <h3 className="font-display font-bold text-2xl text-dnd-gold">{npc.name}</h3>
        <p className="text-gray-400 text-sm">
          {[npc.race, npc.occupation].filter(Boolean).join(" · ")}
        </p>
      </div>
      {[
        { label: "Personality", value: npc.personality, color: "border-purple-700" },
        { label: "Appearance", value: npc.appearance, color: "border-blue-700" },
        { label: "Secret or drive", value: npc.secret, color: "border-red-900" },
        { label: "Hook for the party", value: npc.hook, color: "border-dnd-gold" },
        { label: "Voice & manner", value: npc.voiceHint, color: "border-gray-600" },
      ]
        .filter((x) => x.value)
        .map(({ label, value, color }) => (
          <div key={label} className={`bg-gray-900 rounded p-3 border-l-2 ${color}`}>
            <p className="dnd-label mb-1">{label}</p>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
          </div>
        ))}
    </div>
  );
}

function StoryResult({ story }: { story: any }) {
  return (
    <div className="dnd-card space-y-4">
      <h3 className="font-display font-bold text-2xl text-dnd-gold">{story.title}</h3>
      {[
        { label: "The Hook", value: story.hook, color: "border-blue-700" },
        { label: "The Plot", value: story.plot, color: "border-purple-700" },
        { label: "The Climax", value: story.climax, color: "border-red-700" },
      ].map(({ label, value, color }) => (
        <div key={label} className={`bg-gray-900 rounded p-3 border-l-2 ${color}`}>
          <p className="dnd-label mb-1">{label}</p>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
        </div>
      ))}
      {story.npcs?.length > 0 && (
        <div>
          <p className="font-display font-bold text-dnd-gold mb-2">Key NPCs</p>
          {story.npcs.map((npc: any, i: number) => (
            <div key={i} className="mb-2 bg-gray-900 rounded p-2">
              <p className="font-display font-bold text-sm text-white">{npc.name} <span className="text-gray-500 capitalize">({npc.role})</span></p>
              <p className="text-xs text-gray-400">{npc.personality}</p>
              <p className="text-xs text-gray-500">{npc.description}</p>
            </div>
          ))}
        </div>
      )}
      {story.locations?.length > 0 && (
        <div>
          <p className="font-display font-bold text-dnd-gold mb-2">Key Locations</p>
          {story.locations.map((loc: any, i: number) => (
            <div key={i} className="mb-2">
              <p className="font-display font-bold text-sm text-white">{loc.name}</p>
              <p className="text-xs text-gray-400">{loc.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dungeon Library ───────────────────────────────────────────────
function DungeonLibrary() {
  const [dungeons, setDungeons] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/dungeons`).then((r) => r.json()).then(setDungeons).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    await fetch(`${API}/dungeons/${id}`, { method: "DELETE" });
    setDungeons((p) => p.filter((d) => d.id !== id));
  };

  const handleOpen = async (id: string) => {
    const res = await fetch(`${API}/dungeons/${id}`);
    setSelected(await res.json());
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl space-y-3">
      {dungeons.length === 0 ? (
        <p className="text-gray-500 text-sm">No dungeons saved yet — generate one on the Generator tab.</p>
      ) : (
        dungeons.map((d) => (
          <div key={d.id} className="dnd-card flex items-center gap-3 cursor-pointer hover:border-gray-500" onClick={() => handleOpen(d.id)}>
            <MapIcon size={20} className="text-gray-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-display font-bold text-white">{d.name}</p>
              <p className="text-xs text-gray-500 capitalize">{d.theme} · {d.difficulty} · Levels {d.levelMin}–{d.levelMax}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }} className="text-gray-600 hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
      {selected && (
        <Modal title={selected.name} wide onClose={() => setSelected(null)}>
          <DungeonResult dungeon={selected} />
        </Modal>
      )}
    </div>
  );
}

// ── Story Library ─────────────────────────────────────────────────
function StoryLibrary() {
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/stories`).then((r) => r.json()).then(setStories).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    await fetch(`${API}/stories/${id}`, { method: "DELETE" });
    setStories((p) => p.filter((s) => s.id !== id));
  };

  const handleOpen = async (id: string) => {
    const res = await fetch(`${API}/stories/${id}`);
    setSelected(await res.json());
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl space-y-3">
      {stories.length === 0 ? (
        <p className="text-gray-500 text-sm">No stories saved yet — generate one on the Generator tab.</p>
      ) : (
        stories.map((s) => (
          <div key={s.id} className="dnd-card flex items-center gap-3 cursor-pointer hover:border-gray-500" onClick={() => handleOpen(s.id)}>
            <BookOpen size={20} className="text-gray-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-display font-bold text-white">{s.title}</p>
              <p className="text-xs text-gray-500 capitalize">{s.theme} · Levels {s.levelMin}–{s.levelMax} · {s.ageRating}</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="text-gray-600 hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
      {selected && (
        <Modal title={selected.title} wide onClose={() => setSelected(null)}>
          <StoryResult story={selected} />
        </Modal>
      )}
    </div>
  );
}
